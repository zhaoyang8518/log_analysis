import { invoke } from "@tauri-apps/api/core";
import { desensitizeText, loadDesensitizationConfig, addAuditLog, ModelCallAuditLog } from "./privacy";
import type { AggregatedDevice } from "./types";

export type ModelProvider = "none" | "ollama" | "openai" | "anthropic" | "custom";

export type ModelSettings = {
  enabled: boolean;
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  isManual?: boolean;
};

export type ModelConnectionResult = {
  ok: boolean;
  source: "provider" | "registry" | string;
  models: string[];
  message: string;
};

const SETTINGS_KEY = "log-analysis:model-settings";
const API_KEY_STORAGE_KEY = "log-analysis:api-key";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  enabled: false,
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5:3b",
  apiKey: "",
  isManual: false,
};

export async function loadModelSettings(): Promise<ModelSettings> {
  let apiKey = "";
  
  if (isTauriRuntime()) {
    try {
      apiKey = await invoke<string>("get_secure_api_key");
    } catch {
      apiKey = "";
    }
  } else {
    apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  }

  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_MODEL_SETTINGS, apiKey };
  try {
    return { ...DEFAULT_MODEL_SETTINGS, ...JSON.parse(raw), apiKey };
  } catch {
    return { ...DEFAULT_MODEL_SETTINGS, apiKey };
  }
}

export async function saveModelSettings(settings: ModelSettings) {
  const { apiKey, ...rest } = settings;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  
  if (isTauriRuntime()) {
    try {
      await invoke("save_secure_api_key", { apiKey });
    } catch (err) {
      console.error("Failed to save API key securely:", err);
    }
  } else {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  }
}

export async function testModelConnection(settings: ModelSettings): Promise<ModelConnectionResult> {
  if (isTauriRuntime()) {
    try {
      return await invoke<ModelConnectionResult>("test_model_connection", { settings });
    } catch (err) {
      return {
        ok: false,
        source: "tauri",
        models: fallbackModels(settings.provider),
        message: `Tauri invocation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  try {
    if (settings.provider === "ollama") {
      const models = await fetchOllamaModels(settings);
      return {
        ok: true,
        source: "provider",
        models,
        message: models.length > 0
          ? `Connected to Ollama at ${settings.baseUrl}. Found ${models.length} model(s): ${models.join(", ")}`
          : `Connected to Ollama at ${settings.baseUrl}, but no models installed. Run: ollama pull qwen2.5:3b`,
      };
    }
    if (settings.provider === "openai") {
      const models = await fetchOpenAIModels(settings);
      return {
        ok: true,
        source: "provider",
        models,
        message: `Connected to OpenAI. Found ${models.length} model(s).`,
      };
    }
    if (settings.provider === "anthropic") {
      const models = await fetchAnthropicModels(settings);
      return {
        ok: true,
        source: "provider",
        models,
        message: `Connected to Anthropic. Found ${models.length} model(s).`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      source: "provider",
      models: fallbackModels(settings.provider),
      message: `Connection failed: ${message}`,
    };
  }

  const models = fallbackModels(settings.provider);
  return {
    ok: false,
    source: "registry",
    models,
    message: "Model connection test is available in the Tauri desktop app. Showing built-in registry models.",
  };
}

export async function fetchAvailableModels(settings: ModelSettings): Promise<string[]> {
  if (isTauriRuntime()) {
    try {
      const result = await invoke<ModelConnectionResult>("test_model_connection", { settings });
      if (result.ok) return result.models;
    } catch {
      // Fall through to web-based fetching
    }
  }

  try {
    if (settings.provider === "ollama") {
      return await fetchOllamaModels(settings);
    }
    if (settings.provider === "openai") {
      return await fetchOpenAIModels(settings);
    }
    if (settings.provider === "anthropic") {
      return await fetchAnthropicModels(settings);
    }
  } catch (err) {
    console.error("Failed to fetch models:", err);
  }

  return fallbackModels(settings.provider);
}

async function fetchOllamaModels(settings: ModelSettings): Promise<string[]> {
  const baseUrl = trimSlash(settings.baseUrl || "http://127.0.0.1:11434");
  
  let response;
  try {
    response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error(
        "Cannot connect to Ollama. This may be due to CORS restrictions in the browser. " +
        "Please use the Tauri desktop app, or ensure Ollama is configured to allow CORS."
      );
    }
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  const models = (data.models || []).map((m: any) => m.name || m);
  
  if (models.length === 0) {
    console.warn("Ollama is running but no models are installed. Install a model with: ollama pull qwen2.5:3b");
  }
  
  return models;
}

async function fetchOpenAIModels(settings: ModelSettings): Promise<string[]> {
  const baseUrl = trimSlash(settings.baseUrl || defaultBaseUrl("openai"));
  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`,
    },
  });

  if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
  const data = await response.json();
  return (data.data || [])
    .filter((m: any) => m.object === "model")
    .map((m: any) => m.id)
    .filter((id: string) => id.includes("gpt"));
}

async function fetchAnthropicModels(_settings: ModelSettings): Promise<string[]> {
  // Anthropic doesn't have a public model listing API
  // Return known models
  return fallbackModels("anthropic");
}

function buildClassifyPrompt(anomalies: string[]): string {
  return `Classify the following log anomalies into severity levels: CRITICAL, WARNING, or INFO.

Rules:
- CRITICAL: Issues that indicate hardware failure, data corruption, or test failure that would prevent shipping.
- WARNING: Issues that are notable but do not prevent the device from functioning correctly.
- INFO: Minor issues, cosmetic problems, or expected behavior that is logged for debugging.

Return JSON only with this exact shape:
{"classifications":[{"message":"original message","severity":"CRITICAL|WARNING|INFO","reason":"brief explanation"}]}

Anomalies:
${JSON.stringify(anomalies, null, 2)}`;
}

async function callClassifyModel(
  prompt: string,
  settings: ModelSettings
): Promise<{ classifications: { message: string; severity: string; reason: string }[] }> {
  let result: { classifications: { message: string; severity: string; reason: string }[] };

  if (isTauriRuntime()) {
    const aiResult = await invoke<Record<string, unknown>>("call_ai_model", { prompt, settings });
    if (aiResult.classifications && Array.isArray(aiResult.classifications)) {
      result = aiResult as any;
    } else {
      throw new Error("Invalid classification response from AI model");
    }
  } else if (settings.provider === "ollama") {
    result = await callOllama(prompt, settings);
  } else {
    result = await callOpenAICompatible(prompt, settings);
  }

  if (!result.classifications || !Array.isArray(result.classifications)) {
    throw new Error("AI model did not return expected classification format");
  }

  return result;
}

const CLASSIFY_BATCH_SIZE = 3;

export async function classifyAnomalies(
  anomalies: string[],
  settings: ModelSettings,
  onProgress?: (
    current: number,
    total: number,
    batchClassifications?: { message: string; severity: string; reason: string }[]
  ) => void | Promise<void>
): Promise<{ classifications: { message: string; severity: string; reason: string }[] }> {
  if (!settings.enabled || settings.provider === "none") {
    return { classifications: anomalies.map((m) => ({ message: m, severity: "WARNING", reason: "AI disabled" })) };
  }

  const config = loadDesensitizationConfig();
  const sanitizedAnomalies = anomalies.map((a) => desensitizeText(a, config));

  const totalBatches = Math.ceil(sanitizedAnomalies.length / CLASSIFY_BATCH_SIZE);
  const allResults: { message: string; severity: string; reason: string }[] = [];

  const startTime = Date.now();
  let success = false;
  let outputSize = 0;
  let error: string | undefined;

  try {
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      await onProgress?.(batchIndex + 1, totalBatches);

      const batchAnomalies = sanitizedAnomalies.slice(
        batchIndex * CLASSIFY_BATCH_SIZE,
        (batchIndex + 1) * CLASSIFY_BATCH_SIZE
      );

      const prompt = buildClassifyPrompt(batchAnomalies);

      try {
        const result = await callClassifyModel(prompt, settings);
        allResults.push(...result.classifications);
        await onProgress?.(batchIndex + 1, totalBatches, result.classifications);
      } catch (batchErr) {
        if (settings.provider !== "ollama") {
          const fallbackResult = await tryFallbackToOllama(prompt, settings);
          if (fallbackResult) {
            allResults.push(...fallbackResult.classifications);
            await onProgress?.(batchIndex + 1, totalBatches, fallbackResult.classifications);
            continue;
          }
        }

        throw batchErr;
      }
    }

    success = true;
    outputSize = JSON.stringify(allResults).length;
    return { classifications: allResults };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const auditLog: ModelCallAuditLog = {
      timestamp: new Date().toISOString(),
      provider: settings.provider,
      model: settings.model,
      task: "classify",
      inputSize: anomalies.map((a) => a.length).reduce((a, b) => a + b, 0),
      outputSize,
      durationMs: Date.now() - startTime,
      success,
      error,
    };
    addAuditLog(auditLog);
  }
}

export async function generateSummary(
  deviceInfo: string,
  processes: string[],
  anomalies: string[],
  settings: ModelSettings
): Promise<string> {
  if (!settings.enabled || settings.provider === "none") {
    return "AI summary is disabled. Enable AI in settings to generate summaries.";
  }

  const config = loadDesensitizationConfig();
  const sanitizedDeviceInfo = desensitizeText(deviceInfo, config);
  const sanitizedProcesses = processes.map((p) => desensitizeText(p, config));
  const sanitizedAnomalies = anomalies.map((a) => desensitizeText(a, config));

  const prompt = `Generate a concise test report summary in the same language as the input.

Device: ${sanitizedDeviceInfo}
Processes: ${JSON.stringify(sanitizedProcesses)}
Anomalies: ${JSON.stringify(sanitizedAnomalies)}

Format: One paragraph summarizing the test results, mentioning pass/fail status, any warnings, and overall assessment.`;

  const startTime = Date.now();
  let success = false;
  let outputSize = 0;
  let error: string | undefined;

  try {
    let result: string;

    if (isTauriRuntime()) {
      const aiResult = await invoke<Record<string, unknown>>("call_ai_model", { prompt, settings });
      result = typeof aiResult.summary === "string" ? aiResult.summary : JSON.stringify(aiResult);
    } else if (settings.provider === "ollama") {
      const ollamaResult = await callOllama(prompt, settings);
      result = ollamaResult.summary || "Failed to generate summary.";
    } else {
      const openaiResult = await callOpenAICompatible(prompt, settings);
      result = openaiResult.summary || "Failed to generate summary.";
    }

    success = true;
    outputSize = result.length;
    return result;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);

    if (settings.provider !== "ollama") {
      const fallbackResult = await tryFallbackToOllamaSummary(prompt, settings);
      if (fallbackResult) {
        success = true;
        outputSize = fallbackResult.length;
        return fallbackResult;
      }
    }

    throw err;
  } finally {
    const auditLog: ModelCallAuditLog = {
      timestamp: new Date().toISOString(),
      provider: settings.provider,
      model: settings.model,
      task: "summary",
      inputSize: prompt.length,
      outputSize,
      durationMs: Date.now() - startTime,
      success,
      error,
    };
    addAuditLog(auditLog);
  }
}

async function callOllama(
  prompt: string,
  settings: ModelSettings
): Promise<any> {
  const response = await fetch(`${trimSlash(settings.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const data = await response.json();
  const content = data.message?.content ?? "";
  
  return parseAiResponse(content);
}

async function callOpenAICompatible(
  prompt: string,
  settings: ModelSettings
): Promise<any> {
  const baseUrl = settings.baseUrl || defaultBaseUrl(settings.provider);
  const response = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`${settings.provider} returned ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseAiResponse(content);
}

function parseAiResponse(content: string): any {
  let jsonStr = content;
  
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch {
    return { summary: content };
  }
}

function defaultBaseUrl(provider: ModelProvider): string {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com/v1";
  return "";
}

export function fallbackModels(provider: ModelProvider): string[] {
  if (provider === "ollama") return ["qwen2.5:3b", "qwen2.5:7b", "llama3.2:3b", "gemma2:2b"];
  if (provider === "openai") return ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"];
  if (provider === "anthropic") return ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"];
  return [];
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function tryFallbackToOllama(
  prompt: string,
  originalSettings: ModelSettings
): Promise<{ classifications: { message: string; severity: string; reason: string }[] } | null> {
  const ollamaSettings: ModelSettings = {
    ...originalSettings,
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen2.5:3b",
    apiKey: "",
  };

  try {
    return await callOllama(prompt, ollamaSettings);
  } catch {
    return null;
  }
}

async function tryFallbackToOllamaSummary(
  prompt: string,
  originalSettings: ModelSettings
): Promise<string | null> {
  const ollamaSettings: ModelSettings = {
    ...originalSettings,
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen2.5:3b",
    apiKey: "",
  };

  try {
    const result = await callOllama(prompt, ollamaSettings);
    return result.summary || null;
  } catch {
    return null;
  }
}

export async function generateReport(
  devices: AggregatedDevice[],
  settings: ModelSettings,
  locale: string,
  onProgress?: (step: string) => void
): Promise<string> {
  if (!settings.enabled || settings.provider === "none") {
    throw new Error("AI features are disabled. Please enable AI in settings.");
  }

  onProgress?.("preparing");
  
  const devicesSummary = devices.map((d) => {
    const deviceStr = Object.entries(d.deviceInfo)
      .filter(([, v]) => v)
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join("\n");
    const processesStr = d.processes.map((p) => {
      const paramsStr = p.key_parameters.length > 0
        ? "\n      Key Parameters:\n" + p.key_parameters.map((kp) => `        - ${kp.name}: ${kp.value}${kp.unit ?? ""}`).join("\n")
        : "";
      return `    - ${p.name}: ${p.status}${p.duration_ms ? ` (${Math.floor(p.duration_ms / 1000)}s)` : ""}${paramsStr}`;
    }).join("\n");
    const anomaliesStr = d.anomalies.length > 0
      ? d.anomalies.map((a) => `    - [${a.severity.toUpperCase()}] ${a.message} (File: ${a.sourceFile}, line ${a.line_number})`).join("\n")
      : "    (none)";
    const filesStr = d.logs.map((l) => l.source.file_name).join(", ");
    
    return `### Device ID: ${d.id} (Logs: ${filesStr})
- Device Info:
${deviceStr}
- Test Processes:
${processesStr}
- Anomalies:
${anomaliesStr}`;
  }).join("\n\n");

  const languageRequirement = locale === "zh"
    ? "Use Chinese for the report content"
    : "Use English for the report content";

  const prompt = `You are a production test engineer analyzing manufacturing test logs. Generate a comprehensive test report in Markdown format based on the following parsed log data.
  
Since logs have been aggregated by device, please structure the report primarily around physical devices rather than individual log files.

## Report Structure Requirements:
1. **📋 Overall Overview**: Summary paragraph about the tested devices, test coverage, and overall summary of PASS/FAIL count.
2. **🏭 Device Basic Info**: Table or section for each device, presenting product model, MAC address, serial number, SMT number, production date.
3. **📊 Detailed Test Process Analysis**: For each device, analyze all its test processes:
   - Process name, result (✅ PASS / ❌ FAIL), key parameters
   - Explanation of what the test does in plain language
   - Key findings and notes
4. **🔍 Key Findings & Anomalies**: Table with anomaly, source log file, severity (use emoji: 🔴 CRITICAL, 🟡 WARNING, 🟢 INFO), and explanation.
5. **📈 Overall Conclusion**: Final verdict, total time, and shipping recommendation.

## Style Guidelines:
- ${languageRequirement}
- Use emoji-rich headers for visual appeal
- Format data in tables where appropriate
- Be professional but accessible - explain technical terms
- The report should be similar to a manufacturing test report that a factory manager would read
- Infer the overall device type and model from the data provided

## Parsed Log Data (Aggregated by Device):
${devicesSummary}

Generate the complete Markdown report now. Return ONLY the Markdown content, no JSON wrapper.`;

  onProgress?.("calling");

  const startTime = Date.now();
  let success = false;
  let outputSize = 0;
  let error: string | undefined;

  try {
    let content: string;

    if (isTauriRuntime()) {
      const aiResult = await invoke<Record<string, unknown>>("call_ai_model", { prompt, settings });
      const rawContent = aiResult.summary as string || JSON.stringify(aiResult);
      content = rawContent;
    } else if (settings.provider === "ollama") {
      const result = await callOllamaRaw(prompt, settings);
      content = result;
    } else {
      const result = await callOpenAICompatibleRaw(prompt, settings);
      content = result;
    }

    onProgress?.("saving");
    
    success = true;
    outputSize = content.length;
    return content;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const auditLog: ModelCallAuditLog = {
      timestamp: new Date().toISOString(),
      provider: settings.provider,
      model: settings.model,
      task: "report",
      inputSize: prompt.length,
      outputSize,
      durationMs: Date.now() - startTime,
      success,
      error,
    };
    addAuditLog(auditLog);
  }
}

async function callOllamaRaw(prompt: string, settings: ModelSettings): Promise<string> {
  const response = await fetch(`${trimSlash(settings.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const data = await response.json();
  return data.message?.content ?? "";
}

async function callOpenAICompatibleRaw(prompt: string, settings: ModelSettings): Promise<string> {
  const baseUrl = settings.baseUrl || defaultBaseUrl(settings.provider);
  const response = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`${settings.provider} returned ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}
