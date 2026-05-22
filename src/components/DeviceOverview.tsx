import { useMemo } from "react";
import type { DeviceInfo, ProcessResult, TestStatus, ParsedLog, AggregatedDevice } from "../types";
import { t, useLocale } from "../i18n";
import type { Locale } from "../i18n";
import { Hash, Network, Layers, Calendar, Clock, CheckCircle, AlertTriangle } from "lucide-react";

const EMPTY_DEVICE: DeviceInfo = {
  mac: null,
  sn: null,
  smt_number: null,
  model: null,
  production_date: null,
};

const STANDARD_LOG_KINDS = [
  "function_test",
  "install_apboot",
  "verify_tpm_aos",
  "radio_test",
  "txpower_test",
  "oba_test",
] as const;

const LOG_KIND_SHORT_LABELS: Record<string, string> = {
  function_test: "FT",
  install_apboot: "AP",
  verify_tpm_aos: "TPM",
  radio_test: "RT",
  txpower_test: "TX",
  oba_test: "OBA",
};

const getParameterLabel = (name: string, locale: string): string => {
  const labels: Record<string, Record<string, string>> = {
    u_boot_version: { en: "U-Boot Version", zh: "U-Boot 版本" },
    nand_flash: { en: "NAND Flash", zh: "NAND 闪存" },
    sdram: { en: "SDRAM Size", zh: "SDRAM 大小" },
    watchdog: { en: "Watchdog Status", zh: "看门狗状态" },
    wl0_status: { en: "Wireless 0 Status", zh: "无线 0 状态" },
    wl1_status: { en: "Wireless 1 Status", zh: "无线 1 状态" },
    "2g_channels": { en: "2.4GHz Channels", zh: "2.4GHz 信道数" },
    "5g_channels": { en: "5GHz Channels", zh: "5GHz 信道数" },
    "2g_crc": { en: "2.4G Cal CRC", zh: "2.4G 校准 CRC" },
    "5g_crc": { en: "5G Cal CRC", zh: "5G 校准 CRC" },
    aruba_crc: { en: "Aruba CRC", zh: "Aruba 校准 CRC" },
    nvram_md5: { en: "NVRAM MD5 Checksum", zh: "NVRAM MD5 校验和" },
    firmware_version: { en: "Firmware Version", zh: "固件版本" },
    date_code: { en: "Date Code", zh: "日期代码" },
    serial: { en: "Serial", zh: "序列号" },
    "2g_calibration_crc": { en: "2.4G Calibration CRC", zh: "2.4G 校准 CRC" },
    "5g_calibration_crc": { en: "5G Calibration CRC", zh: "5G 校准 CRC" },
    aos_version: { en: "AOS Version", zh: "AOS 版本" },
    tpm_status: { en: "TPM Status", zh: "TPM 状态" },
    mac_match: { en: "MAC Match Status", zh: "MAC 匹配状态" },
    sn_match: { en: "SN Match Status", zh: "SN 匹配状态" },
    product_model: { en: "Product Model", zh: "产品型号" },
    upc: { en: "UPC Code", zh: "UPC 条码" },
    software_version: { en: "Software Version", zh: "软件版本" },
    origin: { en: "Origin Country", zh: "原产地" },
  };

  return labels[name]?.[locale] || labels[name]?.en || name;
};

interface DeviceOverviewProps {
  device: AggregatedDevice;
  onPhaseClick?: (phase: string) => void;
}

function DeviceOverview({ device, onPhaseClick }: DeviceOverviewProps) {
  const { locale } = useLocale();
  const info = device.deviceInfo;

  const facts = [
    { label: t("sn", locale), value: info.sn, icon: <Hash size={16} /> },
    { label: t("mac", locale), value: info.mac, icon: <Network size={16} /> },
    { label: t("smt", locale), value: info.smt_number, icon: <Layers size={16} /> },
    { label: t("productionDate", locale), value: info.production_date, icon: <Calendar size={16} /> },
  ];

  // Calculate stats
  const totalDurationMs = useMemo(() => {
    return device.processes.reduce((acc, p) => acc + (p.duration_ms || 0), 0);
  }, [device.processes]);

  const passRate = useMemo(() => {
    if (device.processes.length === 0) return 0;
    const passed = device.processes.filter((p) => p.status === "PASS").length;
    return Math.round((passed / device.processes.length) * 100);
  }, [device.processes]);

  const anomalyCount = device.anomalies.length;

  return (
    <section className="overview">
      {/* Quick Stats Dashboard Bar */}
      <div className="device-stats-bar">
        <div className="stat-card duration">
          <div className="stat-icon-wrapper">
            <Clock size={20} />
          </div>
          <div className="stat-details">
            <span className="stat-label">{t("durationTotal", locale)}</span>
            <span className="stat-value">{formatDuration(totalDurationMs)}</span>
          </div>
        </div>
        <div className="stat-card passrate">
          <div className="stat-icon-wrapper">
            <CheckCircle size={20} />
          </div>
          <div className="stat-details">
            <span className="stat-label">{t("stepPassRate", locale)}</span>
            <span className="stat-value">{passRate}%</span>
          </div>
          <div className="stat-progress-bar-container">
            <div className="stat-progress-fill" style={{ width: `${passRate}%`, backgroundColor: passRate === 100 ? "var(--color-pass)" : "var(--color-warning)" }} />
          </div>
        </div>
        <div className="stat-card warnings">
          <div className="stat-icon-wrapper">
            <AlertTriangle size={20} />
          </div>
          <div className="stat-details">
            <span className="stat-label">{t("totalWarnings", locale)}</span>
            <span className={`stat-value ${anomalyCount > 0 ? "warning-glow" : ""}`}>{anomalyCount}</span>
          </div>
        </div>
      </div>

      {/* Facts Card Grid */}
      <div className="device-facts-grid">
        {facts.map(({ label, value, icon }) => (
          <div key={label} className="fact-card">
            <div className="fact-card-header">
              {icon}
              <span className="fact-label">{label}</span>
            </div>
            <span className="fact-value" title={value ?? "-"}>{value ?? "-"}</span>
          </div>
        ))}
      </div>

      {/* Log Ingestion & Test Coverage Matrix Grid */}
      <LogCoverageMatrix logs={device.logs} locale={locale} onPhaseClick={onPhaseClick} />
    </section>
  );
}

interface LogCoverageMatrixProps {
  logs: ParsedLog[];
  locale: Locale;
  onPhaseClick?: (phase: string) => void;
}

function LogCoverageMatrix({ logs, locale, onPhaseClick }: LogCoverageMatrixProps) {
  return (
    <div className="coverage-matrix-container">
      <h3 className="matrix-title">{t("logCoverage", locale)}</h3>
      <div className="coverage-grid">
        {STANDARD_LOG_KINDS.map((kind) => {
          const matchingLogs = logs.filter((l) => l.source.parser === kind);
          const isPresent = matchingLogs.length > 0;
          const hasFail = matchingLogs.some((l) => l.processes.some((p) => p.status === "FAIL"));

          let status: "PASS" | "FAIL" | "ABSENT" = "ABSENT";
          if (isPresent) {
            status = hasFail ? "FAIL" : "PASS";
          }

          const labelKey = `logKind_${kind}` as const;
          const phaseName = t(labelKey, locale as any);

          // Stats
          const logFile = isPresent ? matchingLogs[0].source.file_name : null;
          const stepsCount = isPresent ? matchingLogs.reduce((acc, l) => acc + l.processes.length, 0) : 0;
          const durationMs = isPresent ? matchingLogs.reduce((acc, l) => acc + l.processes.reduce((sum, p) => sum + (p.duration_ms || 0), 0), 0) : 0;

          return (
            <div
              key={kind}
              className={`coverage-matrix-card ${status.toLowerCase()} ${isPresent ? "clickable" : ""}`}
              onClick={() => isPresent && onPhaseClick?.(kind)}
              title={isPresent && locale === "zh" ? "点击查看此阶段的详细工序" : isPresent ? "Click to view detailed steps for this phase" : undefined}
            >
              <div className="matrix-card-header">
                <span className="phase-name">{phaseName}</span>
                <span className={`status-badge ${status.toLowerCase()}`}>
                  {status === "ABSENT" ? t("statusAbsent", locale as any) : status}
                </span>
              </div>
              <div className="matrix-card-body">
                {isPresent ? (
                  <>
                    <div className="meta-row">
                      <span className="meta-label">{t("fileNameLabel", locale as any)}:</span>
                      <span className="meta-value filename" title={logFile ?? ""}>{logFile}</span>
                    </div>
                    <div className="meta-row stats">
                      <span>{t("stepsCount", locale as any).replace("{{count}}", String(stepsCount))}</span>
                      <span className="divider">•</span>
                      <span>{formatDuration(durationMs)}</span>
                    </div>
                  </>
                ) : (
                  <span className="meta-value missing-hint">
                    {locale === "zh" ? "等待测试数据导入..." : "Awaiting test data ingestion..."}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status, compact = false }: { status: TestStatus; compact?: boolean }) {
  return (
    <span className={`status ${status.toLowerCase()} ${compact ? "compact" : ""}`}>
      {status}
    </span>
  );
}

interface ProcessTableProps {
  processes: ProcessResult[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

function ProcessTable({ processes, activeFilter, onFilterChange }: ProcessTableProps) {
  const { locale } = useLocale();

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: processes.length };
    STANDARD_LOG_KINDS.forEach((kind) => {
      map[kind] = processes.filter((p) => p.logKind === kind).length;
    });
    return map;
  }, [processes]);

  const filteredProcesses = useMemo(() => {
    if (activeFilter === "all") return processes;
    return processes.filter((p) => p.logKind === activeFilter);
  }, [processes, activeFilter]);

  return (
    <div className="process-table-container">
      {/* Test Phase Filter Button Bar */}
      <div className="phase-filter-bar">
        <span className="filter-label">{t("filterByPhase", locale)}:</span>
        <div className="filter-buttons">
          <button
            type="button"
            className={`filter-btn ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => onFilterChange("all")}
          >
            <span className="filter-name">{t("allSteps", locale)}</span>
            <span className="filter-count">({counts.all})</span>
          </button>
          {STANDARD_LOG_KINDS.map((kind) => {
            const count = counts[kind];
            if (count === 0) return null;

            const labelKey = `logKind_${kind}` as const;
            const phaseName = t(labelKey, locale as any);

            return (
              <button
                key={kind}
                type="button"
                className={`filter-btn ${activeFilter === kind ? "active" : ""}`}
                onClick={() => onFilterChange(kind)}
              >
                <span className="filter-name">{phaseName}</span>
                <span className="filter-count">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("process", locale)}</th>
              <th>{t("result", locale)}</th>
              <th>{t("duration", locale)}</th>
              <th>{t("keyParameters", locale)}</th>
            </tr>
          </thead>
          <tbody>
            {filteredProcesses.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-table-cell">
                  {locale === "zh" ? "暂无过程数据" : "No process data available"}
                </td>
              </tr>
            ) : (
              filteredProcesses.map((process, idx) => (
                <tr key={`${process.name}-${idx}`}>
                  <td className="process-name-cell">
                    <span className="process-name-text">{process.name}</span>
                    {process.logKind && (
                      <span className={`process-phase-tag ${process.logKind.toLowerCase()}`}>
                        {LOG_KIND_SHORT_LABELS[process.logKind] || process.logKind}
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusPill status={process.status} compact />
                  </td>
                  <td className="duration-cell">{formatDuration(process.duration_ms)}</td>
                  <td>
                    <div className="parameter-list">
                      {process.key_parameters.length === 0 ? (
                        <span className="no-param-badge">-</span>
                      ) : (
                        process.key_parameters.map((parameter) => (
                          <span key={parameter.name} className="param-badge">
                            <span className="param-name">{getParameterLabel(parameter.name, locale)}</span>
                            <span className="param-divider">:</span>
                            <span className="param-value">
                              {parameter.value}
                              {parameter.unit ?? ""}
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "-";
  }

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function ProcessTimeline({ processes }: { processes: ProcessResult[] }) {
  const { locale } = useLocale();

  return (
    <div className="process-timeline-panel">
      <h3 className="timeline-title">{t("processFlow", locale)}</h3>
      <div className="timeline-track-container">
        <div className="timeline-nodes">
          {processes.map((process, index) => {
            const isPass = process.status === "PASS";
            const isFail = process.status === "FAIL";
            const statusClass = isPass ? "pass" : isFail ? "fail" : "unknown";

            return (
              <div key={`${process.name}-${index}`} className={`timeline-node-card ${statusClass}`}>
                {index > 0 && <div className="timeline-connector-line" />}
                <div className="node-marker">
                  <span className="node-number">{index + 1}</span>
                  <div className="node-status-indicator" />
                </div>
                <div className="node-content">
                  <span className="node-name" title={process.name}>{process.name}</span>
                  <span className="node-duration">{formatDuration(process.duration_ms)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { DeviceOverview, ProcessTable, EMPTY_DEVICE };
