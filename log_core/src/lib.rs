mod function_test;
mod install_apboot;
mod model;
mod oba_test;
mod radio_test;
mod txpower_test;
mod verify_tpm_aos;

pub use function_test::FunctionTestParser;
pub use install_apboot::InstallApbootParser;
pub use model::{
    Anomaly, AnomalySeverity, DeviceInfo, KeyParameter, LogKind, ParseSource, ParsedLog,
    ProcessResult, ShmooCell, ShmooPlot, TestStatus,
};
pub use oba_test::ObaTestParser;
pub use radio_test::RadioTestParser;
pub use txpower_test::TxpowerTestParser;
pub use verify_tpm_aos::VerifyTpmAosParser;

pub trait LogParser {
    fn kind(&self) -> LogKind;
    fn matches(&self, file_name: &str, content: &str) -> bool;
    fn parse(&self, file_name: &str, content: &str) -> Result<ParsedLog, ParseError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    message: String,
}

impl ParseError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ParseError {}

pub fn identify_log_kind(file_name: &str, content: &str) -> Option<LogKind> {
    let parsers: [&dyn LogParser; 6] = [
        &FunctionTestParser,
        &RadioTestParser,
        &TxpowerTestParser,
        &InstallApbootParser,
        &VerifyTpmAosParser,
        &ObaTestParser,
    ];

    parsers
        .iter()
        .find(|parser| parser.matches(file_name, content))
        .map(|parser| parser.kind())
}

pub fn parse_log(file_name: &str, content: &str) -> Result<ParsedLog, ParseError> {
    let parsers: [&dyn LogParser; 6] = [
        &FunctionTestParser,
        &RadioTestParser,
        &TxpowerTestParser,
        &InstallApbootParser,
        &VerifyTpmAosParser,
        &ObaTestParser,
    ];

    for parser in parsers {
        if parser.matches(file_name, content) {
            return parser.parse(file_name, content);
        }
    }

    Err(ParseError::new(format!(
        "no parser matched log file '{file_name}'"
    )))
}
