import type { AggregatedDevice } from "../types";
import { Cpu, FileStack, Search, X } from "lucide-react";
import { useLocale, t } from "../i18n";
import { useState, useMemo } from "react";

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

interface ReportListProps {
  devices: AggregatedDevice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ReportList({ devices, selectedId, onSelect }: ReportListProps) {
  const { locale } = useLocale();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices;
    const query = searchQuery.toLowerCase().trim();
    return devices.filter((device) => {
      const model = (device.deviceInfo.model || "").toLowerCase();
      const sn = (device.deviceInfo.sn || "").toLowerCase();
      const mac = (device.deviceInfo.mac || "").toLowerCase();
      const id = device.id.toLowerCase();
      return model.includes(query) || sn.includes(query) || mac.includes(query) || id.includes(query);
    });
  }, [devices, searchQuery]);

  return (
    <aside className="report-list" aria-label="Devices">
      <div className="report-list-header">
        <h2>{locale === "zh" ? "设备列表" : "Devices"}</h2>
        {devices.length > 0 && (
          <span className="devices-count-summary">
            {t("devicesFound", locale).replace("{{count}}", String(filteredDevices.length))}
          </span>
        )}
      </div>

      {devices.length > 0 && (
        <div className="sidebar-search-container">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="sidebar-search-input"
            placeholder={t("searchPlaceholder", locale)}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              title={locale === "zh" ? "清除搜索" : "Clear search"}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {devices.length === 0 ? (
        <p className="muted">{locale === "zh" ? "等待导入日志..." : "Waiting for logs..."}</p>
      ) : filteredDevices.length === 0 ? (
        <p className="muted">
          {locale === "zh" ? "未找到匹配的设备" : "No matching devices found"}
        </p>
      ) : (
        <div className="device-cards-container">
          {filteredDevices.map((device, index) => {
            const isSelected = device.id === selectedId;
            const modelName = device.deviceInfo.model || (locale === "zh" ? "未识别设备" : "Unrecognized Device");
            const idLabel = device.deviceInfo.sn || device.deviceInfo.mac || (locale === "zh" ? "未知标识符" : "Unknown ID");

            return (
              <button
                className={`device-card-tab ${isSelected ? "active" : ""} ${device.overallStatus.toLowerCase()}`}
                key={`${device.id}-${index}`}
                onClick={() => onSelect(device.id)}
                type="button"
              >
                <div className="device-card-header">
                  <div className="device-icon-wrapper">
                    <Cpu size={16} />
                  </div>
                  <span className="device-model" title={modelName}>{modelName}</span>
                  <span className={`device-status-badge ${device.overallStatus.toLowerCase()}`}>
                    {device.overallStatus}
                  </span>
                </div>

                <div className="device-card-body">
                  <span className="device-id-label" title={idLabel}>{idLabel}</span>
                </div>

                <div className="device-coverage-badges">
                  {STANDARD_LOG_KINDS.map((kind) => {
                    const matchingLogs = device.logs.filter((l) => l.source.parser === kind);
                    const isPresent = matchingLogs.length > 0;
                    const hasFail = matchingLogs.some((l) => l.processes.some((p) => p.status === "FAIL"));
                    const allPass = matchingLogs.every((l) => l.processes.every((p) => p.status === "PASS"));
                    
                    let statusClass = "absent";
                    if (isPresent) {
                      statusClass = hasFail ? "fail" : (allPass ? "pass" : "unknown");
                    }
                    
                    const label = LOG_KIND_SHORT_LABELS[kind];
                    const tooltip = `${locale === "zh" ? "阶段" : "Phase"}: ${
                      locale === "zh"
                        ? {
                            function_test: "功能测试",
                            install_apboot: "引导引导程序",
                            verify_tpm_aos: "安全芯片/系统",
                            radio_test: "射频测试",
                            txpower_test: "发射功率",
                            oba_test: "出厂审计",
                          }[kind]
                        : kind
                    } | ${
                      isPresent 
                        ? (hasFail ? (locale === "zh" ? "失败" : "FAILED") : (locale === "zh" ? "通过" : "PASSED")) 
                      : (locale === "zh" ? "未导入" : "MISSING")
                    }`;

                    return (
                      <span
                        key={kind}
                        className={`coverage-badge ${statusClass}`}
                        title={tooltip}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>

                <div className="device-card-footer">
                  <div className="device-log-count">
                    <FileStack size={12} />
                    <span>
                      {device.logs.length} {device.logs.length === 1 
                        ? (locale === "zh" ? "个日志" : "log") 
                        : (locale === "zh" ? "个日志" : "logs")}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

export default ReportList;
