use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use log_core::{identify_log_kind, parse_log, ParsedLog};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

const API_KEY_FILE: &str = ".log_analysis_api_key.enc";

fn get_api_key_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("log_analysis")
        .join(API_KEY_FILE)
}

#[tauri::command]
fn save_secure_api_key(api_key: String) -> Result<(), String> {
    let path = get_api_key_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    
    if api_key.is_empty() {
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Failed to remove API key: {}", e))?;
        }
        return Ok(());
    }
    
    let encoded = BASE64.encode(api_key.as_bytes());
    fs::write(&path, encoded).map_err(|e| format!("Failed to save API key: {}", e))
}

#[tauri::command]
fn get_secure_api_key() -> Result<String, String> {
    let path = get_api_key_path();
    if !path.exists() {
        return Ok(String::new());
    }
    
    let encoded = fs::read_to_string(&path).map_err(|e| format!("Failed to read API key: {}", e))?;
    let decoded = BASE64.decode(&encoded).map_err(|e| format!("Failed to decode API key: {}", e))?;
    String::from_utf8(decoded).map_err(|e| format!("Invalid API key encoding: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelSettings {
    enabled: bool,
    provider: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
    model: String,
    #[serde(rename = "apiKey")]
    api_key: String,
    #[serde(rename = "isManual", default)]
    is_manual: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
struct ModelConnectionResult {
    ok: bool,
    source: String,
    models: Vec<String>,
    message: String,
}

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

#[tauri::command]
async fn test_model_connection(settings: ModelSettings) -> Result<ModelConnectionResult, String> {
    match settings.provider.as_str() {
        "ollama" => test_ollama_connection(&settings).await,
        "openai" | "custom" => test_openai_compatible_connection(&settings).await,
        _ => Ok(ModelConnectionResult {
            ok: false,
            source: "unknown".to_string(),
            models: vec![],
            message: format!("Unknown provider: {}", settings.provider),
        }),
    }
}

async fn test_ollama_connection(settings: &ModelSettings) -> Result<ModelConnectionResult, String> {
    let base_url = if settings.base_url.is_empty() {
        "http://127.0.0.1:11434".to_string()
    } else {
        settings.base_url.trim_end_matches('/').to_string()
    };

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/api/tags", base_url))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Ok(ModelConnectionResult {
            ok: false,
            source: "provider".to_string(),
            models: vec![],
            message: format!("Ollama returned {}", response.status()),
        });
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let models = body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let message = if models.is_empty() {
        format!(
            "Connected to Ollama at {}, but no models installed. Run: ollama pull qwen2.5:3b",
            base_url
        )
    } else {
        format!(
            "Connected to Ollama at {}. Found {} model(s): {}",
            base_url,
            models.len(),
            models.join(", ")
        )
    };

    Ok(ModelConnectionResult {
        ok: true,
        source: "provider".to_string(),
        models,
        message,
    })
}

async fn test_openai_compatible_connection(settings: &ModelSettings) -> Result<ModelConnectionResult, String> {
    let base_url = if settings.base_url.is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        settings.base_url.trim_end_matches('/').to_string()
    };

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/models", base_url))
        .header("Authorization", format!("Bearer {}", settings.api_key))
        .send()
        .await;

    if let Err(e) = response {
        return Ok(ModelConnectionResult {
            ok: false,
            source: "provider".to_string(),
            models: vec![],
            message: format!("Failed to connect: {}", e),
        });
    }

    let response = response.unwrap();

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Ok(ModelConnectionResult {
            ok: false,
            source: "provider".to_string(),
            models: vec![],
            message: format!("API returned {}: {}", status, body),
        });
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let models = body["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let model_count = models.len();

    Ok(ModelConnectionResult {
        ok: true,
        source: "provider".to_string(),
        models,
        message: format!("Connected successfully. Found {} model(s).", model_count),
    })
}

#[tauri::command]
async fn call_ai_model(
    prompt: String,
    settings: ModelSettings,
) -> Result<serde_json::Value, String> {
    match settings.provider.as_str() {
        "ollama" => call_ollama(&prompt, &settings).await,
        "openai" | "custom" => call_openai_compatible(&prompt, &settings).await,
        _ => Err(format!("Unknown provider: {}", settings.provider)),
    }
}

async fn call_ollama(prompt: &str, settings: &ModelSettings) -> Result<serde_json::Value, String> {
    let base_url = if settings.base_url.is_empty() {
        "http://127.0.0.1:11434".to_string()
    } else {
        settings.base_url.trim_end_matches('/').to_string()
    };

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/api/chat", base_url))
        .json(&serde_json::json!({
            "model": settings.model,
            "stream": false,
            "messages": [{ "role": "user", "content": prompt }]
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to call Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama returned {}", response.status()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let content = body["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(parse_ai_content(content))
}

async fn call_openai_compatible(
    prompt: &str,
    settings: &ModelSettings,
) -> Result<serde_json::Value, String> {
    let base_url = if settings.base_url.is_empty() {
        match settings.provider.as_str() {
            "openai" => "https://api.openai.com/v1".to_string(),
            _ => settings.base_url.clone(),
        }
    } else {
        settings.base_url.trim_end_matches('/').to_string()
    };

    let client = reqwest::Client::new();
    let mut request = client
        .post(format!("{}/chat/completions", base_url))
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": settings.model,
            "temperature": 0.1,
            "messages": [{ "role": "user", "content": prompt }]
        }));

    if !settings.api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", settings.api_key));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to call AI model: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("AI model returned {}: {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse AI model response: {}", e))?;

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(parse_ai_content(content))
}

fn parse_ai_content(content: String) -> serde_json::Value {
    parse_ai_json(&content).unwrap_or_else(|| serde_json::json!({ "summary": content }))
}

fn parse_ai_json(content: &str) -> Option<serde_json::Value> {
    serde_json::from_str(content.trim()).ok().or_else(|| {
        extract_json_code_block(content).and_then(|json| serde_json::from_str(json.trim()).ok())
    })
}

fn extract_json_code_block(content: &str) -> Option<&str> {
    let block_start = content.find("```")?;
    let after_fence = &content[block_start + 3..];
    let header_end = after_fence.find('\n')?;
    let header = &after_fence[..header_end];

    if !header.is_empty() && !header.eq_ignore_ascii_case("json") {
        return None;
    }

    let body = &after_fence[header_end + 1..];
    let block_end = body.find("```")?;
    Some(&body[..block_end])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            parse_log_file,
            parse_log_folder,
            test_model_connection,
            call_ai_model,
            save_secure_api_key,
            get_secure_api_key,
            check_report_exists,
            save_report,
            read_report,
            save_ai_classify_cache,
            load_ai_classify_cache,
            save_ai_summary_cache,
            load_ai_summary_cache,
            write_file,
            write_binary_file,
            open_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running log analysis desktop app");
}

fn get_analysis_dir(folder_path: &str) -> PathBuf {
    let path = Path::new(folder_path);
    if path.is_dir() {
        path.join(".log_analysis")
    } else {
        path.parent()
            .unwrap_or(path)
            .join(".log_analysis")
    }
}

#[tauri::command]
fn check_report_exists(folder_path: String) -> bool {
    get_analysis_dir(&folder_path).join("report.md").exists()
}

#[tauri::command]
fn save_report(folder_path: String, content: String) -> Result<(), String> {
    let dir = get_analysis_dir(&folder_path);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create .log_analysis directory: {}", e))?;
    let report_path = dir.join("report.md");
    fs::write(&report_path, content)
        .map_err(|e| format!("Failed to save report: {}", e))
}

#[tauri::command]
fn read_report(folder_path: String) -> Result<String, String> {
    let report_path = get_analysis_dir(&folder_path).join("report.md");
    fs::read_to_string(&report_path)
        .map_err(|e| format!("Failed to read report: {}", e))
}

#[tauri::command]
fn save_ai_classify_cache(folder_path: String, classify_json: String) -> Result<(), String> {
    let dir = get_analysis_dir(&folder_path);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create .log_analysis directory: {}", e))?;
    let path = dir.join("classify.json");
    fs::write(&path, classify_json).map_err(|e| format!("Failed to save AI classify cache: {}", e))
}

#[tauri::command]
fn load_ai_classify_cache(folder_path: String) -> Result<String, String> {
    let path = get_analysis_dir(&folder_path).join("classify.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read AI classify cache: {}", e))
}

#[tauri::command]
fn save_ai_summary_cache(folder_path: String, summary_json: String) -> Result<(), String> {
    let dir = get_analysis_dir(&folder_path);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create .log_analysis directory: {}", e))?;
    let path = dir.join("summary.json");
    fs::write(&path, summary_json).map_err(|e| format!("Failed to save AI summary cache: {}", e))
}

#[tauri::command]
fn load_ai_summary_cache(folder_path: String) -> Result<String, String> {
    let path = get_analysis_dir(&folder_path).join("summary.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read AI summary cache: {}", e))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(Path::new(&path), content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn write_binary_file(path: String, content_base64: String) -> Result<(), String> {
    let decoded = BASE64.decode(content_base64.as_bytes())
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    fs::write(Path::new(&path), decoded)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_ai_content;

    #[test]
    fn parses_classification_json_code_blocks() {
        let parsed = parse_ai_content(
            "```json\n{\"classifications\":[{\"message\":\"crc\",\"severity\":\"WARNING\",\"reason\":\"recoverable\"}]}\n```"
                .to_string(),
        );

        assert!(parsed["classifications"].is_array());
        assert_eq!(parsed["classifications"][0]["message"], "crc");
    }

    #[test]
    fn keeps_non_json_content_as_summary() {
        let parsed = parse_ai_content("test completed with warnings".to_string());

        assert_eq!(parsed["summary"], "test completed with warnings");
    }
}
