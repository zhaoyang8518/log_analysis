use crate::{
    Anomaly, AnomalySeverity, DeviceInfo, KeyParameter, LogKind, LogParser, ParseError,
    ParseSource, ParsedLog, ProcessResult, ShmooCell, ShmooPlot, TestStatus,
};
use regex::Regex;

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
            || (normalized_content.contains("sdram test") && normalized_content.contains("shmoo"))
    }

    fn parse(&self, file_name: &str, content: &str) -> Result<ParsedLog, ParseError> {
        if content.trim().is_empty() {
            return Err(ParseError::new("Function Test log is empty"));
        }

        let lines: Vec<&str> = content.lines().collect();

        Ok(ParsedLog {
            source: ParseSource {
                file_name: file_name.to_string(),
                parser: self.kind(),
            },
            device: parse_device_info(&lines),
            processes: vec![ProcessResult {
                name: "Function Test".to_string(),
                status: parse_status(&lines),
                duration_ms: None,
                key_parameters: parse_key_parameters(&lines),
            }],
            anomalies: parse_anomalies(&lines),
            shmoo_plots: parse_shmoo_plots(&lines),
        })
    }
}

fn parse_device_info(lines: &[&str]) -> DeviceInfo {
    DeviceInfo {
        mac: extract_mac(lines),
        sn: extract_sn(lines),
        smt_number: extract_smt(lines),
        model: extract_model(lines),
        production_date: extract_production_date(lines),
    }
}

fn extract_mac(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get MAC from SFCS:([A-Fa-f0-9]+)",
        r"Get MAC\s*:\s*([A-Fa-f0-9]+)",
        r"Base MAC Address\s*[:=]\s*([A-Fa-f0-9:]+)",
        r"MAC:\s*([A-Fa-f0-9:]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_sn(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get SN from SFCS:([A-Za-z0-9]+)",
        r"Get SN\s*:\s*([A-Za-z0-9]+)",
        r"SN:\s*([A-Za-z0-9]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_smt(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get SMT:([A-Za-z0-9]+)",
        r"Get SMT\s*:\s*([A-Za-z0-9]+)",
        r"SMT Number:\s*([A-Za-z0-9]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_model(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Model:\s*([A-Za-z0-9-]+)",
        r"Input PNLabel\s*:\s*([A-Za-z0-9-]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_production_date(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"The System D/L Date\s+(\d{4}-\d{2}-\d{2})",
        r"Production Date:\s*(\d{4}-\d{2}-\d{2})",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_by_regex(lines: &[&str], pattern: &str) -> Option<String> {
    let re = Regex::new(pattern).ok()?;
    for line in lines {
        if let Some(captures) = re.captures(line) {
            if captures.len() > 1 {
                return Some(captures[1].to_string());
            }
        }
    }
    None
}

fn parse_status(lines: &[&str]) -> TestStatus {
    for line in lines.iter().rev() {
        let normalized = line.to_ascii_uppercase();
        if normalized.contains("[PASS] FUNCTION") || normalized.contains("FUNCTION TEST RESULT: PASS") {
            return TestStatus::Pass;
        }
        if normalized.contains("[FAIL] FUNCTION") || normalized.contains("FUNCTION TEST RESULT: FAIL") {
            return TestStatus::Fail;
        }
        if normalized.contains("PASS") && (normalized.contains("FUNCTION") || normalized.contains("TEST")) {
            if normalized.contains("CHECK") || normalized.contains("PASS]") {
                continue;
            }
        }
    }

    let pass_patterns = [
        r"\[PASS\]\s*FUNCTION",
        r"FUNCTION\s+TEST\s+RESULT:\s*PASS",
    ];

    for pattern in &pass_patterns {
        let re = Regex::new(pattern).ok().unwrap();
        for line in lines {
            if re.is_match(&line.to_ascii_uppercase()) {
                return TestStatus::Pass;
            }
        }
    }

    TestStatus::Unknown
}

fn parse_key_parameters(lines: &[&str]) -> Vec<KeyParameter> {
    let mut params = Vec::new();

    if let Some(value) = extract_uboot_version(lines) {
        params.push(KeyParameter {
            name: "u_boot_version".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_nand_flash(lines) {
        params.push(KeyParameter {
            name: "nand_flash".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_sdram(lines) {
        params.push(KeyParameter {
            name: "sdram".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_watchdog(lines) {
        params.push(KeyParameter {
            name: "watchdog".to_string(),
            value,
            unit: None,
        });
    }

    params
}

fn extract_uboot_version(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"U-Boot\s+([\d.]+)",
        r"APBoot\s+([\d.]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_nand_flash(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"NAND:\s*.*?(\d+)\s*(MiB|MB|GiB|GB)",
        r"NAND Flash:\s*(.+)",
    ];

    for pattern in &patterns {
        let re = Regex::new(pattern).ok()?;
        for line in lines {
            if let Some(captures) = re.captures(line) {
                if captures.len() > 2 {
                    return Some(format!("{}{}", &captures[1], &captures[2]));
                } else if captures.len() > 1 {
                    return Some(captures[1].to_string());
                }
            }
        }
    }
    None
}

fn extract_sdram(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"DRAM:\s*(.+)",
        r"SDRAM:\s*(.+)",
        r"DDR(\d+).*?(\d+)\s*(MB|GB)",
    ];

    for pattern in &patterns {
        let re = Regex::new(pattern).ok()?;
        for line in lines {
            if let Some(captures) = re.captures(line) {
                if captures.len() > 1 {
                    return Some(captures[1].to_string());
                }
            }
        }
    }
    None
}

fn extract_watchdog(lines: &[&str]) -> Option<String> {
    for line in lines {
        let normalized = line.to_ascii_uppercase();
        if normalized.contains("ENABLING WATCHDOG") {
            return Some("enabled".to_string());
        }
        if normalized.contains("WATCHDOG STATUS") && normalized.contains("CLEAR") {
            return Some("cleared".to_string());
        }
    }
    None
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
        return Some(AnomalySeverity::Warning);
    }
    if normalized.contains("ERROR") || normalized.contains(" FAILED") || normalized.contains("FAIL") {
        if normalized.contains("PASS") || normalized.contains("CHECK") {
            return None;
        }
        return Some(AnomalySeverity::Error);
    }
    None
}

fn anomaly_context(lines: &[&str], index: usize) -> Vec<String> {
    let start = index.saturating_sub(2);
    let end = (index + 3).min(lines.len());

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
        let line = lines[index].trim();
        let line_upper = line.to_ascii_uppercase();

        if line_upper.starts_with("SHMOO:") || (line_upper.contains("SHMOO") && line_upper.contains("WR DQ")) {
            let name = if line_upper.starts_with("SHMOO:") {
                line.strip_prefix("SHMOO:").unwrap_or(line.strip_prefix("Shmoo:").unwrap_or("")).trim().to_string()
            } else if line.starts_with("Shmoo ") {
                line.strip_prefix("Shmoo ").unwrap_or("").trim().to_string()
            } else {
                format!("Shmoo {}", line)
            };

            let mut rows = Vec::new();
            index += 1;

            while index < lines.len() {
                let row = lines[index].trim();

                if row.to_ascii_uppercase().eq_ignore_ascii_case("END SHMOO") || row.starts_with("Receive:") {
                    break;
                }

                if is_shmoo_row(row) {
                    let cleaned = clean_shmoo_row(row);
                    if !cleaned.is_empty() {
                        rows.push(cleaned);
                    }
                }
                index += 1;
            }

            if !rows.is_empty() {
                plots.push(ShmooPlot {
                    name,
                    rows: rows.clone(),
                    cells: shmoo_cells(&rows),
                });
            }
        }

        index += 1;
    }

    plots
}

fn is_shmoo_row(row: &str) -> bool {
    if row.is_empty() {
        return false;
    }

    let cleaned = clean_shmoo_row(row);
    if cleaned.is_empty() {
        return false;
    }

    cleaned.chars().all(|c| matches!(c, '+' | '-' | 'X' | 'S' | '.' | '@'))
}

fn clean_shmoo_row(row: &str) -> String {
    let mut result = String::new();
    let mut in_shmoo = false;

    for c in row.chars() {
        if matches!(c, '+' | '-' | 'X' | 'S' | '.' | '@') {
            in_shmoo = true;
            result.push(c);
        } else if in_shmoo {
            break;
        }
    }

    result
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
