use log_core::{identify_log_kind, parse_log, LogKind};

#[test]
fn parses_function_test_fixture_against_golden_contract() {
    let fixture = include_str!("fixtures/function_test/synthetic_pass.log");
    let parsed = parse_log("AP503_Function_Test.txt", fixture).expect("fixture should parse");
    let actual = serde_json::to_value(parsed).expect("parsed report should serialize");
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("golden/function_test/synthetic_pass.json"))
            .expect("golden JSON should parse");

    assert_eq!(actual, expected);
}

#[test]
fn identifies_function_test_from_content() {
    let fixture = include_str!("fixtures/function_test/synthetic_pass.log");

    assert_eq!(
        identify_log_kind("station-output.txt", fixture),
        Some(LogKind::FunctionTest)
    );
}
