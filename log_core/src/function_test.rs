use crate::{
    Anomaly, AnomalySeverity, DeviceInfo, KeyParameter, LogKind, LogParser, ParseError,
    ParseSource, ParsedLog, ProcessResult, ShmooCell, ShmooPlot, TestStatus,
};

pub struct FunctionTestParser;

impl LogParser for FunctionTestParser {
    fn kind(&self) -> LogKind {
        LogKind::FunctionTest
    }

    fn matches(&self, file_name: &str, content: &str) -> bool {
        let normalized_name = file_name.to_ascii_lowercase();
        let normalized_content = content.to_ascii_lowercase();

        normalized_name.contains("function")
            || normalized_content.contains("function test")
            || (normalized_content.contains("shmoo") && normalized_content.contains("sdram"))
    }

    fn parse(&self, file_name: &str, content: &str) -> Result<ParsedLog, ParseError> {
        if content.trim().is_empty() {
            return Err(ParseError::new("Function Test log is empty"));
        }

        let lines: Vec<&str> = content.lines().collect();
        let key_parameters = parse_key_parameters(&lines);

        Ok(ParsedLog {
            source: ParseSource {
                file_name: file_name.to_string(),
                parser: self.kind(),
            },
            device: parse_device_info(&lines),
            processes: vec![ProcessResult {
                name: "Function Test".to_string(),
                status: parse_status(&lines),
                duration_ms: parse_duration_ms(&lines),
                key_parameters,
            }],
            anomalies: parse_anomalies(&lines),
            shmoo_plots: parse_shmoo_plots(&lines),
        })
    }
}

fn parse_device_info(lines: &[&str]) -> DeviceInfo {
    DeviceInfo {
        mac: first_field(lines, &["MAC", "MAC Address"]),
        sn: first_field(lines, &["SN", "Serial Number"]),
        smt_number: first_field(lines, &["SMT", "SMT Number"]),
        model: first_field(lines, &["Model"]),
        production_date: first_field(lines, &["Production Date", "Date Code"]),
    }
}

fn first_field(lines: &[&str], labels: &[&str]) -> Option<String> {
    labels
        .iter()
        .find_map(|label| lines.iter().find_map(|line| field_value(line, label)))
}

fn field_value(line: &str, label: &str) -> Option<String> {
    let trimmed = line.trim();
    let separator_index = trimmed.find([':', '='])?;
    let key = trimmed[..separator_index].trim();
    if !key.eq_ignore_ascii_case(label) {
        return None;
    }

    let value = trimmed[separator_index + 1..].trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn parse_status(lines: &[&str]) -> TestStatus {
    for line in lines.iter().rev() {
        let normalized = line.to_ascii_uppercase();
        if normalized.contains("FUNCTION TEST") && normalized.contains("FAIL") {
            return TestStatus::Fail;
        }
        if normalized.contains("FUNCTION TEST") && normalized.contains("PASS") {
            return TestStatus::Pass;
        }
    }

    TestStatus::Unknown
}

fn parse_duration_ms(lines: &[&str]) -> Option<u64> {
    lines.iter().find_map(|line| {
        let raw = field_value(line, "Duration")?;
        parse_duration_value(&raw)
    })
}

fn parse_duration_value(raw: &str) -> Option<u64> {
    let raw = raw.trim();
    if let Some(seconds) = raw.strip_suffix('s') {
        return seconds
            .trim()
            .parse::<u64>()
            .ok()
            .map(|value| value * 1_000);
    }

    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() == 2 {
        let minutes = parts[0].trim().parse::<u64>().ok()?;
        let seconds = parts[1].trim().parse::<u64>().ok()?;
        return Some((minutes * 60 + seconds) * 1_000);
    }

    None
}

fn parse_key_parameters(lines: &[&str]) -> Vec<KeyParameter> {
    [
        ("U-Boot Version", "u_boot_version"),
        ("NAND Flash", "nand_flash"),
        ("SDRAM", "sdram"),
        ("Watchdog", "watchdog"),
    ]
    .into_iter()
    .filter_map(|(label, name)| {
        first_field(lines, &[label]).map(|value| KeyParameter {
            name: name.to_string(),
            value,
            unit: None,
        })
    })
    .collect()
}

fn parse_anomalies(lines: &[&str]) -> Vec<Anomaly> {
    lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let severity = anomaly_severity(line)?;
            Some(Anomaly {
                severity,
                message: line.trim().to_string(),
                line_number: index + 1,
                context: anomaly_context(lines, index),
            })
        })
        .collect()
}

fn anomaly_severity(line: &str) -> Option<AnomalySeverity> {
    let normalized = line.to_ascii_uppercase();
    if normalized.contains("WARNING") || normalized.contains("WARN") {
        Some(AnomalySeverity::Warning)
    } else if normalized.contains("ERROR") || normalized.contains(" FAILED") {
        Some(AnomalySeverity::Error)
    } else {
        None
    }
}

fn anomaly_context(lines: &[&str], index: usize) -> Vec<String> {
    let start = index.saturating_sub(1);
    let end = (index + 2).min(lines.len());

    lines[start..end]
        .iter()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

fn parse_shmoo_plots(lines: &[&str]) -> Vec<ShmooPlot> {
    let mut plots = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let Some(name) = lines[index].trim().strip_prefix("SHMOO:") else {
            index += 1;
            continue;
        };

        let mut rows = Vec::new();
        index += 1;
        while index < lines.len() {
            let row = lines[index].trim();
            if row.eq_ignore_ascii_case("END SHMOO") {
                break;
            }
            if is_shmoo_row(row) {
                rows.push(row.to_string());
            }
            index += 1;
        }

        if !rows.is_empty() {
            plots.push(ShmooPlot {
                name: name.trim().to_string(),
                cells: shmoo_cells(&rows),
                rows,
            });
        }
        index += 1;
    }

    plots
}

fn is_shmoo_row(row: &str) -> bool {
    !row.is_empty()
        && row
            .chars()
            .all(|character| matches!(character, '+' | '-' | 'X' | 'S' | '.'))
}

fn shmoo_cells(rows: &[String]) -> Vec<ShmooCell> {
    rows.iter()
        .enumerate()
        .flat_map(|(row, symbols)| {
            symbols
                .chars()
                .enumerate()
                .map(move |(column, symbol)| ShmooCell {
                    row,
                    column,
                    symbol,
                    selected: symbol == 'X',
                })
        })
        .collect()
}
