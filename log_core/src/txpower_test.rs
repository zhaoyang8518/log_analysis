use crate::{
    Anomaly, AnomalySeverity, DeviceInfo, KeyParameter, LogKind, LogParser, ParseError,
    ParseSource, ParsedLog, ProcessResult, TestStatus,
};
use regex::Regex;

pub struct TxpowerTestParser;

impl LogParser for TxpowerTestParser {
    fn kind(&self) -> LogKind {
        LogKind::TxpowerTest
    }

    fn matches(&self, file_name: &str, content: &str) -> bool {
        let normalized_name = file_name.to_ascii_lowercase();
        let normalized_content = content.to_ascii_lowercase();

        normalized_name.contains("txpower")
            || (normalized_content.contains("tx power") && normalized_content.contains("crc"))
    }

    fn parse(&self, file_name: &str, content: &str) -> Result<ParsedLog, ParseError> {
        if content.trim().is_empty() {
            return Err(ParseError::new("Txpower Test log is empty"));
        }

        let lines: Vec<&str> = content.lines().collect();

        Ok(ParsedLog {
            source: ParseSource {
                file_name: file_name.to_string(),
                parser: self.kind(),
            },
            device: parse_device_info(&lines),
            processes: vec![ProcessResult {
                name: "Txpower Test".to_string(),
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
        sn: None,
        smt_number: None,
        model: None,
        production_date: None,
    }
}

fn extract_mac(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get MAC\s*:\s*([A-Fa-f0-9]+)",
        r"br0.*?HWaddr\s*([A-Fa-f0-9:]+)",
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
        if normalized.contains("TXPOWER") && normalized.contains("PASS") {
            return TestStatus::Pass;
        }
        if normalized.contains("TXPOWER") && normalized.contains("FAIL") {
            return TestStatus::Fail;
        }
    }

    if extract_by_regex(lines, r"CRC.*?OK").is_some() {
        return TestStatus::Pass;
    }

    TestStatus::Unknown
}

fn parse_key_parameters(lines: &[&str]) -> Vec<KeyParameter> {
    let mut params = Vec::new();

    if let Some(value) = extract_2g_crc(lines) {
        params.push(KeyParameter {
            name: "2g_crc".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_5g_crc(lines) {
        params.push(KeyParameter {
            name: "5g_crc".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_aruba_crc(lines) {
        params.push(KeyParameter {
            name: "aruba_crc".to_string(),
            value,
            unit: None,
        });
    }

    if let Some(value) = extract_nvram_md5(lines) {
        params.push(KeyParameter {
            name: "nvram_md5".to_string(),
            value,
            unit: None,
        });
    }

    params
}

fn extract_2g_crc(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get 2GCRC.*?:\s*(0x[0-9a-fA-F]+)",
        r"2\.4G.*?CRC.*?:\s*(\w+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_5g_crc(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Get 5GCRC.*?:\s*(0x[0-9a-fA-F]+)",
        r"5G.*?CRC.*?:\s*(\w+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_aruba_crc(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"Aruba crc16.*?:\s*(\w+)",
        r"crc16.*?:\s*(\w+)",
    ];

    for pattern in &patterns {
        if let Some(value) = extract_by_regex(lines, pattern) {
            return Some(value);
        }
    }
    None
}

fn extract_nvram_md5(lines: &[&str]) -> Option<String> {
    let patterns = [
        r"NVRAMMD5.*?:\s*([a-f0-9]+)",
        r"Get NVRAM MD5.*?:\s*([a-f0-9]+)",
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
