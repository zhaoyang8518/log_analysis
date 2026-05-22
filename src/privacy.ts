export type SensitiveDataType = "mac" | "sn" | "smt" | "production_date" | "model";

export type DesensitizationConfig = {
  enabled: boolean;
  types: SensitiveDataType[];
};

const DEFAULT_DESENSITIZATION_CONFIG: DesensitizationConfig = {
  enabled: true,
  types: ["mac", "sn", "smt", "production_date"],
};

const DESERIALIZATION_KEY = "log-analysis:desensitization";

export function loadDesensitizationConfig(): DesensitizationConfig {
  const raw = localStorage.getItem(DESERIALIZATION_KEY);
  if (!raw) return DEFAULT_DESENSITIZATION_CONFIG;
  try {
    return { ...DEFAULT_DESENSITIZATION_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_DESENSITIZATION_CONFIG;
  }
}

export function saveDesensitizationConfig(config: DesensitizationConfig) {
  localStorage.setItem(DESERIALIZATION_KEY, JSON.stringify(config));
}

export function desensitizeMac(mac: string): string {
  if (!mac || mac.length < 6) return "***";
  return mac.substring(0, 3) + "***" + mac.substring(mac.length - 2);
}

export function desensitizeSn(sn: string): string {
  if (!sn || sn.length < 4) return "***";
  return sn.substring(0, 2) + "***" + sn.substring(sn.length - 2);
}

export function desensitizeSmt(smt: string): string {
  if (!smt || smt.length < 4) return "***";
  return "***" + smt.substring(smt.length - 4);
}

export function desensitizeProductionDate(date: string): string {
  if (!date) return "***";
  const parts = date.split(/[-/]/);
  if (parts.length >= 3) {
    return parts[0] + "-**-**";
  }
  return "***";
}

export function desensitizeModel(model: string): string {
  if (!model) return "***";
  return "***";
}

export function desensitizeText(text: string, config?: DesensitizationConfig): string {
  const cfg = config || loadDesensitizationConfig();
  if (!cfg.enabled) return text;

  let result = text;

  if (cfg.types.includes("mac")) {
    result = result.replace(
      /([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/g,
      (match) => desensitizeMac(match)
    );
    result = result.replace(
      /([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}/g,
      (match) => desensitizeMac(match.replace(/-/g, ":"))
    );
    result = result.replace(
      /\b([0-9A-Fa-f]{12})\b/g,
      (match) => {
        const normalized = match.replace(/(.{2})/g, "$1:").slice(0, -1);
        return desensitizeMac(normalized);
      }
    );
  }

  if (cfg.types.includes("sn")) {
    result = result.replace(
      /(?:SN|Serial|S\/N)[:\s]*([A-Z0-9]{8,})/gi,
      (match, sn) => match.replace(sn, desensitizeSn(sn))
    );
  }

  if (cfg.types.includes("smt")) {
    result = result.replace(
      /(?:SMT)[:\s]*([A-Z0-9-]{6,})/gi,
      (match, smt) => match.replace(smt, desensitizeSmt(smt))
    );
  }

  if (cfg.types.includes("production_date")) {
    result = result.replace(
      /(?:Date|Production)[:\s]*(\d{4}[-/]\d{2}[-/]\d{2})/gi,
      (match, date) => match.replace(date, desensitizeProductionDate(date))
    );
  }

  return result;
}

export function desensitizeAnomalyMessages(
  messages: string[],
  config?: DesensitizationConfig
): string[] {
  return messages.map((msg) => desensitizeText(msg, config));
}

export type ModelCallAuditLog = {
  timestamp: string;
  provider: string;
  model: string;
  task: "classify" | "summary" | "report";
  inputSize: number;
  outputSize: number;
  durationMs: number;
  success: boolean;
  error?: string;
};

const AUDIT_LOG_KEY = "log-analysis:audit-logs";
const MAX_AUDIT_LOGS = 100;

export function addAuditLog(log: ModelCallAuditLog) {
  const logs = loadAuditLogs();
  logs.unshift(log);
  if (logs.length > MAX_AUDIT_LOGS) {
    logs.length = MAX_AUDIT_LOGS;
  }
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(logs));
}

export function loadAuditLogs(): ModelCallAuditLog[] {
  const raw = localStorage.getItem(AUDIT_LOG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function clearAuditLogs() {
  localStorage.removeItem(AUDIT_LOG_KEY);
}
