import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { HardDriveUpload, FolderOpen, Settings, ScanSearch, FileText, Loader2 } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { Event, UnlistenFn } from "@tauri-apps/api/event";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import type { ParsedLog, AggregatedDevice } from "../types";
import { t, useLocale } from "../i18n";
import SettingsModal from "./SettingsModal";
import { generateReport, loadModelSettings } from "../model";
import { showToast } from "./Toast";
import { useAutoUpdater } from "../hooks/useAutoUpdater";

interface TopbarProps {
  loading: boolean;
  currentPath: string | null;
  reports: ParsedLog[];
  devices: AggregatedDevice[];
  onReportsLoaded: (reports: ParsedLog[], path: string) => void;
  onError: (error: string) => void;
  onOpenReport: (content: string) => void;
}

const reportSteps = ["reportStepPreparing", "reportStepCalling", "reportStepSaving"] as const;

function Topbar({ loading, currentPath, reports, devices, onReportsLoaded, onError, onOpenReport }: TopbarProps) {
  const { locale } = useLocale();
  const [appVersion, setAppVersion] = useState("0.1.0");
  const updateState = useAutoUpdater(locale);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("0.1.0"));
  }, []);

  const handleVersionClick = () => {
    if (updateState.available) {
      if (updateState.update) {
        updateState.installUpdate(updateState.update);
      }
    } else {
      updateState.checkForUpdate(true);
    }
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const loadReportsRef = useRef<(command: "parse_log_file" | "parse_log_folder", path: string) => Promise<void>>();

  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportExists, setReportExists] = useState(false);
  const [reportStep, setReportStep] = useState(0);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    if (currentPath) {
      invoke<boolean>("check_report_exists", { folderPath: currentPath })
        .then(setReportExists)
        .catch(() => setReportExists(false));
    } else {
      setReportExists(false);
    }
  }, [currentPath]);

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

  const loadReports = useCallback(async (command: "parse_log_file" | "parse_log_folder", path: string) => {
    onError("");
    try {
      const parsed =
        command === "parse_log_file"
          ? [await invoke<ParsedLog>(command, { path })]
          : await invoke<ParsedLog[]>(command, { path });
      onReportsLoaded(parsed, path);
      if (parsed.length === 0) {
        onError("No matching logs found in directory.");
      }
    } catch (cause) {
      onError(String(cause));
    }
  }, [onReportsLoaded, onError]);

  loadReportsRef.current = loadReports;

  const handleOpenExistingReport = async () => {
    if (!currentPath) return;
    try {
      const content = await invoke<string>("read_report", { folderPath: currentPath });
      onOpenReport(content);
    } catch {
      onError("Failed to open report");
    }
  };

  const handleGenerateReport = async () => {
    if (!currentPath || devices.length === 0) return;

    if (reportExists) {
      await handleOpenExistingReport();
      return;
    }

    setGeneratingReport(true);
    setReportError("");
    setReportStep(0);

    try {
      const settings = await loadModelSettings();

      if (!settings.enabled || settings.provider === "none") {
        const errMsg = "AI features are disabled. Please configure AI model in Settings.";
        setReportError(errMsg);
        showToast(errMsg, "error");
        return;
      }

      setReportStep(1);

      const content = await generateReport(devices, settings, locale, (step) => {
        if (step === "calling") setReportStep(2);
        if (step === "saving") setReportStep(3);
      });

      await invoke("save_report", { folderPath: currentPath, content });
      setReportExists(true);
      setReportStep(0);
      onOpenReport(content);
      showToast(t("reportGenerated", locale), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setReportError(msg);
      showToast(msg, "error");
    } finally {
      setGeneratingReport(false);
    }
  };

  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent(async (event: Event<DragDropEvent>) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        setIsDragging(true);
      } else if (payload.type === "leave") {
        setIsDragging(false);
      } else if (payload.type === "drop") {
        setIsDragging(false);
        const paths = payload.paths;
        if (paths.length > 0) {
          const path = paths[0];
          const isFile = path.endsWith(".txt") || path.endsWith(".log");
          if (isFile) {
            await loadReportsRef.current?.("parse_log_file", path);
          } else {
            await loadReportsRef.current?.("parse_log_folder", path);
          }
        }
      }
    });

    return () => {
      unlisten.then((fn: UnlistenFn) => fn());
    };
  }, []);

  return (
    <>
      <header className={`topbar ${isDragging ? "dragging" : ""}`}>
        <div className="brand">
          <ScanSearch aria-hidden="true" />
          <div>
            <div className="title-row" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap", flexDirection: "row" }}>
              <strong style={{ whiteSpace: "nowrap" }}>{t("appTitle", locale)}</strong>
              <button
                type="button"
                onClick={handleVersionClick}
                disabled={updateState.checking || updateState.downloading}
                className="version-badge"
                title={
                  updateState.downloading
                    ? t("updateDownloading", locale).replace("{percent}", String(updateState.downloadProgress))
                    : updateState.available
                    ? t("updateClickToInstall", locale)
                    : t("updateClickToCheck", locale)
                }
              >
                v{appVersion}
                {updateState.available && <span className="update-dot" />}
                {(updateState.checking || updateState.downloading) && (
                  <Loader2 className="update-spinner" size={10} />
                )}
              </button>
            </div>
            {currentPath ? <span title={currentPath}>{currentPath}</span> : null}
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={importFile} disabled={loading || generatingReport} title={t("importLogTitle", locale)}>
            <HardDriveUpload aria-hidden="true" />
            {t("importLog", locale)}
          </button>
          <button type="button" onClick={importFolder} disabled={loading || generatingReport} title={t("importFolderTitle", locale)}>
            <FolderOpen aria-hidden="true" />
            {t("importFolder", locale)}
          </button>
          {currentPath && reports.length > 0 && (
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={generatingReport}
              title={reportExists ? t("openReport", locale) : t("generateReport", locale)}
              className="report-btn"
            >
              {generatingReport ? (
                <Loader2 className="update-spinner" size={18} style={{ color: "#ffffff" }} />
              ) : (
                <FileText aria-hidden="true" size={18} />
              )}
              {generatingReport ? t("generatingReport", locale) : reportExists ? t("openReport", locale) : t("generateReport", locale)}
            </button>
          )}
          <button type="button" onClick={() => setSettingsOpen(true)} title={t("settingsTitle", locale)}>
            <Settings aria-hidden="true" />
            {t("settings", locale)}
          </button>
        </div>
      </header>
      {generatingReport && (
        <div className="report-progress-bar">
          <div className="ai-progress-steps">
            {reportSteps.map((stepKey, index) => (
              <span
                key={stepKey}
                className={`ai-progress-step ${index + 1 <= reportStep ? "active" : ""} ${index + 1 < reportStep ? "done" : ""}`}
              >
                <span className="step-number">{index + 1}</span>
                <span className="step-label">{t(stepKey, locale)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {reportError && (
        <div className="report-error-banner">{reportError}</div>
      )}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default Topbar;
