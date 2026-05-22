import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  FolderOpen,
  HardDriveUpload,
  ScanSearch,
  SquareActivity,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DeviceInfo, ParsedLog, ProcessResult, ShmooPlot, TestStatus } from "./types";

const EMPTY_DEVICE: DeviceInfo = {
  mac: null,
  sn: null,
  smt_number: null,
  model: null,
  production_date: null,
};

const parameterLabels: Record<string, string> = {
  nand_flash: "NAND",
  sdram: "SDRAM",
  u_boot_version: "U-Boot",
  watchdog: "Watchdog",
};

function App() {
  const [reports, setReports] = useState<ParsedLog[]>([]);
  const [selectedReport, setSelectedReport] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const report = reports[selectedReport] ?? null;
  const device = report?.device ?? EMPTY_DEVICE;
  const processes = report?.processes ?? [];

  const importFile = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: "Production logs", extensions: ["txt", "log"] }],
    });
    if (typeof selectedPath === "string") {
      await loadReports("parse_log_file", selectedPath);
    }
  };

  const importFolder = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
    });
    if (typeof selectedPath === "string") {
      await loadReports("parse_log_folder", selectedPath);
    }
  };

  const loadReports = async (command: "parse_log_file" | "parse_log_folder", path: string) => {
    setLoading(true);
    setError("");
    try {
      const parsed =
        command === "parse_log_file"
          ? [await invoke<ParsedLog>(command, { path })]
          : await invoke<ParsedLog[]>(command, { path });
      setReports(parsed);
      setSelectedReport(0);
      if (parsed.length === 0) {
        setError("目录内没有匹配到可解析日志。");
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  const reportStatus = useMemo(() => overallStatus(processes), [processes]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <ScanSearch aria-hidden="true" />
          <div>
            <strong>产线日志诊断</strong>
            <span>Function Test MVP</span>
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={importFile} disabled={loading} title="导入单个日志文件">
            <HardDriveUpload aria-hidden="true" />
            导入日志
          </button>
          <button type="button" onClick={importFolder} disabled={loading} title="导入日志文件夹">
            <FolderOpen aria-hidden="true" />
            导入文件夹
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="report-list" aria-label="解析报告">
          <h2>报告</h2>
          {reports.length === 0 ? (
            <p className="muted">等待导入 Function Test 日志。</p>
          ) : (
            reports.map((item, index) => (
              <button
                className={index === selectedReport ? "report-tab active" : "report-tab"}
                key={`${item.source.file_name}-${index}`}
                onClick={() => setSelectedReport(index)}
                type="button"
              >
                <span>{item.device.sn ?? item.device.mac ?? "未识别设备"}</span>
                <small>{item.source.file_name}</small>
              </button>
            ))
          )}
        </aside>

        <section className="report-surface">
          {error ? <div className="error-banner">{error}</div> : null}
          {report ? (
            <>
              <section className="overview">
                <div>
                  <p className="eyebrow">设备概览</p>
                  <h1>{device.model ?? "型号未识别"}</h1>
                </div>
                <StatusPill status={reportStatus} />
                <DeviceFacts device={device} />
              </section>

              <section className="panel">
                <PanelTitle icon={<SquareActivity />} title="工序结果" />
                <ProcessTable processes={processes} />
              </section>

              <section className="lower-grid">
                <section className="panel">
                  <PanelTitle icon={<AlertTriangle />} title="异常列表" />
                  <AnomalyList report={report} />
                </section>
                <section className="panel">
                  <PanelTitle icon={<ScanSearch />} title="Shmoo 图" />
                  <ShmooPanel plots={report.shmoo_plots} />
                </section>
              </section>
            </>
          ) : (
            <section className="empty-state">
              <ScanSearch aria-hidden="true" />
              <h1>导入产线日志开始解析</h1>
              <p>当前基线先验证 Function Test 设备信息、异常上下文和 Shmoo 数据结构。</p>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

function DeviceFacts({ device }: { device: DeviceInfo }) {
  const facts = [
    ["SN", device.sn],
    ["MAC", device.mac],
    ["SMT", device.smt_number],
    ["生产日期", device.production_date],
  ];

  return (
    <dl className="device-facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProcessTable({ processes }: { processes: ProcessResult[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>工序</th>
            <th>结果</th>
            <th>耗时</th>
            <th>关键参数</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <tr key={process.name}>
              <td>{process.name}</td>
              <td>
                <StatusPill status={process.status} compact />
              </td>
              <td>{formatDuration(process.duration_ms)}</td>
              <td>
                <div className="parameter-list">
                  {process.key_parameters.map((parameter) => (
                    <span key={parameter.name}>
                      {parameterLabels[parameter.name] ?? parameter.name}: {parameter.value}
                      {parameter.unit ?? ""}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomalyList({ report }: { report: ParsedLog }) {
  if (report.anomalies.length === 0) {
    return <p className="muted">未提取到 WARNING、ERROR 或 Failed 上下文。</p>;
  }

  return (
    <ol className="anomaly-list">
      {report.anomalies.map((anomaly) => (
        <li key={`${anomaly.line_number}-${anomaly.message}`}>
          <div>
            <span className={`severity ${anomaly.severity}`}>{anomaly.severity}</span>
            <strong>{anomaly.message}</strong>
            <small>line {anomaly.line_number}</small>
          </div>
          <pre>{anomaly.context.join("\n")}</pre>
        </li>
      ))}
    </ol>
  );
}

function ShmooPanel({ plots }: { plots: ShmooPlot[] }) {
  if (plots.length === 0) {
    return <p className="muted">当前日志未提取到 Shmoo 区块。</p>;
  }

  return (
    <div className="shmoo-list">
      {plots.map((plot) => (
        <figure key={plot.name}>
          <figcaption>{plot.name}</figcaption>
          <div
            className="shmoo-grid"
            style={{
              gridTemplateColumns: `repeat(${Math.max(...plot.rows.map((row) => row.length))}, 1fr)`,
            }}
          >
            {plot.cells.map((cell) => (
              <span
                className={cell.selected ? "shmoo-cell selected" : `shmoo-cell symbol-${cell.symbol}`}
                key={`${cell.row}-${cell.column}`}
              >
                {cell.symbol}
              </span>
            ))}
          </div>
        </figure>
      ))}
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="panel-title">
      {icon}
      {title}
    </h2>
  );
}

function StatusPill({ status, compact = false }: { status: TestStatus; compact?: boolean }) {
  return <span className={`status ${status.toLowerCase()} ${compact ? "compact" : ""}`}>{status}</span>;
}

function overallStatus(processes: ProcessResult[]): TestStatus {
  if (processes.some((process) => process.status === "FAIL")) {
    return "FAIL";
  }
  if (processes.length > 0 && processes.every((process) => process.status === "PASS")) {
    return "PASS";
  }
  return "UNKNOWN";
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "-";
  }

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export default App;
