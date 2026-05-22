export type LogKind =
  | "function_test"
  | "radio_test"
  | "txpower_test"
  | "install_apboot"
  | "verify_tpm_aos"
  | "oba_test"
  | "unknown";

export type TestStatus = "PASS" | "FAIL" | "UNKNOWN";
export type AnomalySeverity = "warning" | "error" | "unknown";

export interface DeviceInfo {
  mac: string | null;
  sn: string | null;
  smt_number: string | null;
  model: string | null;
  production_date: string | null;
}

export interface KeyParameter {
  name: string;
  value: string;
  unit: string | null;
}

export interface ProcessResult {
  name: string;
  status: TestStatus;
  duration_ms: number | null;
  key_parameters: KeyParameter[];
  logKind?: LogKind;
  sourceFile?: string;
}

export interface Anomaly {
  severity: AnomalySeverity;
  message: string;
  line_number: number;
  context: string[];
}

export interface ShmooCell {
  row: number;
  column: number;
  symbol: string;
  selected: boolean;
}

export interface ShmooPlot {
  name: string;
  rows: string[];
  cells: ShmooCell[];
}

export interface ParsedLog {
  source: {
    file_name: string;
    parser: LogKind;
  };
  device: DeviceInfo;
  processes: ProcessResult[];
  anomalies: Anomaly[];
  shmoo_plots: ShmooPlot[];
}

export interface AggregatedDevice {
  id: string; // serial number, MAC, or filename fallback
  deviceInfo: DeviceInfo; // merged device metadata
  logs: ParsedLog[]; // list of original logs
  processes: ProcessResult[]; // merged processes from all logs
  anomalies: (Anomaly & { sourceFile: string })[]; // merged anomalies with source filename tracking
  shmoo_plots: ShmooPlot[]; // merged Shmoo plots
  overallStatus: TestStatus; // PASS, FAIL, or UNKNOWN
}
