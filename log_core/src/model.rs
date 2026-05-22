use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogKind {
    FunctionTest,
    RadioTest,
    TxpowerTest,
    InstallApboot,
    VerifyTpmAos,
    ObaTest,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TestStatus {
    Pass,
    Fail,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnomalySeverity {
    Warning,
    Error,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct DeviceInfo {
    pub mac: Option<String>,
    pub sn: Option<String>,
    pub smt_number: Option<String>,
    pub model: Option<String>,
    pub production_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessResult {
    pub name: String,
    pub status: TestStatus,
    pub duration_ms: Option<u64>,
    pub key_parameters: Vec<KeyParameter>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyParameter {
    pub name: String,
    pub value: String,
    pub unit: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Anomaly {
    pub severity: AnomalySeverity,
    pub message: String,
    pub line_number: usize,
    pub context: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShmooPlot {
    pub name: String,
    pub rows: Vec<String>,
    pub cells: Vec<ShmooCell>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShmooCell {
    pub row: usize,
    pub column: usize,
    pub symbol: char,
    pub selected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParseSource {
    pub file_name: String,
    pub parser: LogKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParsedLog {
    pub source: ParseSource,
    pub device: DeviceInfo,
    pub processes: Vec<ProcessResult>,
    pub anomalies: Vec<Anomaly>,
    pub shmoo_plots: Vec<ShmooPlot>,
}
