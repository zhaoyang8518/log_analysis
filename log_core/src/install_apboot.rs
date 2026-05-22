use crate::{
    Anomaly, AnomalySeverity, DeviceInfo, KeyParameter, LogKind, LogParser, ParseError,
    ParseSource, ParsedLog, ProcessResult, TestStatus,
};
use regex::Regex;

pub struct InstallApbootParser;

impl LogParser for InstallApbootParser {
    fn kind(&self) -> LogKind {
        LogKind::InstallApboot
    }

    fn matches(&self, file_name: &str, content: &str) -> bool {
        let normalized_name = file_name.to_ascii_lowercase();
        let normalized_content = content.to_ascii_lowercase();

        normalized_name.contains("install") && normalized_name.contains("apboot")
            || (normalized_content.contains("apboot") && normalized_content.contains("firmware"))
    }

    fn parse(&self, file_name: &str, content: &str) -> Result<ParsedLog, ParseError> {
        if content.trim().is_empty() {
            return Err(ParseError::new("Install APboot log is empty"));
        }

        let lines: Vec<&str> = content.lines().collect();

        Ok(ParsedLog {
            source: ParseSource {
                file_name: file_name.to_string(),
                parser: self.kind(),
            },
            device: parse_device_info(&lines),
            processes: vec![ProcessResult {
                name: "Install APboot".to_string(),
                status: parse_status(&lines),
                duration_ms: None,
                key_parameters: parse_key_parameters(&lines),
            }],
            anomalies: parse_anomalies(&lines),
            shmoo_plots: Vec::new(),
        })
    }
}

fn parse_device_info(lines: &[&str]) -> DeviceInfo {
    DeviceInfo {
        mac: extract_mac(lines),
        sn: extract_sn(lines),
        smt_number: extract_smt(lines),
        model: extract_model(lines),
        production_date: None,
    }
}

fn extract_mac(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Input MAC\s*:\s*([A-Fa-f0-9]+)",
        r"Get MAC\s*:\s*([A-Fa-f0-9]+)",
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
        r"Input SN\s*:\s*([A-Za-z0-9]+)",
        r"Get SN\s*:\s*([A-Za-z0-9]+)",
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
        r"Get SMT\s*:\s*([A-Za-z0-9]+)",
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
        if normalized.contains("INSTALL") && normalized.contains("PASS") {
            return TestStatus::Pass;
        }
        if normalized.contains("INSTALL") && normalized.contains("FAIL") {
            return TestStatus::Fail;
        }
    }

    let pass_patterns = [
        r"PASS",
        r"INSTALL.*?SUCCESS",
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

    if let Some(value) = extract_firmware_version(lines) {
        params.push(KeyParameter {
            name: "firmware_version".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_date_code(lines) {
        params.push(KeyParameter {
            name: "date_code".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_serial(lines) {
        params.push(KeyParameter {
            name: "serial".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_2g_calibration(lines) {
        params.push(KeyParameter {
            name: "2g_calibration_crc".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_5g_calibration(lines) {
        params.push(KeyParameter {
            name: "5g_calibration_crc".to_string(),
            value,
            unit: None,
        });
    }

    params
}

fn extract_firmware_version(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"APBoot\s+([\d.]+)",
        r"Firmware.*?Version.*?:\s*([v\d.]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_date_code(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"DATECODE.*?:\s*(\d+)",
        r"Date Code.*?:\s*(\d+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_serial(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"CPUSN\s*:\s*([A-Za-z0-9]+)",
        r"Serial.*?:\s*([A-Za-z0-9]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_2g_calibration(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get 2GCRC.*?:\s*(0x[0-9a-fA-F]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_5g_calibration(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get 5GCRC.*?:\s*(0x[0-9a-fA-F]+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
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
    if normalized.contains("ERROR") || normalized.contains(" FAILED") {
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
