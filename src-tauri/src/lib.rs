use log_core::{identify_log_kind, parse_log, ParsedLog};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[tauri::command]
fn parse_log_file(path: String) -> Result<ParsedLog, String> {
    parse_path(Path::new(&path))
}

#[tauri::command]
fn parse_log_folder(path: String) -> Result<Vec<ParsedLog>, String> {
    let directory = Path::new(&path);
    let entries = fs::read_dir(directory).map_err(|error| {
        format!(
            "failed to read log folder '{}': {error}",
            directory.display()
        )
    })?;
    let mut parsed = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read folder entry: {error}"))?;
        let entry_path = entry.path();
        if is_log_candidate(&entry_path) {
            if let Some(report) = parse_candidate(&entry_path)? {
                parsed.push(report);
            }
        }
    }

    parsed.sort_by(|left, right| left.source.file_name.cmp(&right.source.file_name));
    Ok(parsed)
}

fn parse_path(path: &Path) -> Result<ParsedLog, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("failed to read log file '{}': {error}", path.display()))?;
    let file_name = file_name(path)?;

    parse_log(&file_name, &content).map_err(|error| error.to_string())
}

fn parse_candidate(path: &Path) -> Result<Option<ParsedLog>, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("failed to read log file '{}': {error}", path.display()))?;
    let file_name = file_name(path)?;

    if identify_log_kind(&file_name, &content).is_none() {
        return Ok(None);
    }

    parse_log(&file_name, &content)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("log path '{}' has no UTF-8 file name", path.display()))
}

fn is_log_candidate(path: &PathBuf) -> bool {
    if !path.is_file() {
        return false;
    }

    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("txt") || extension.eq_ignore_ascii_case("log")
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![parse_log_file, parse_log_folder])
        .run(tauri::generate_context!())
        .expect("error while running log analysis desktop app");
}
