import { useMemo, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ScanSearch, AlertTriangle, LayoutDashboard, ListChecks, Activity } from "lucide-react";
import type { ParsedLog } from "./types";
import { LocaleProvider, Locale, t } from "./i18n";
import Topbar from "./components/Topbar";
import ReportList from "./components/ReportList";
import { DeviceOverview, ProcessTable, ProcessTimeline } from "./components/DeviceOverview";
import AnomalyList from "./components/AnomalyList";
import ShmooPlotPanel from "./components/ShmooPlot";
import AiSummaryPanel from "./components/AiSummaryPanel";
import ReportDrawer, { cleanMarkdown, renderMarkdown } from "./components/ReportDrawer";
import { generateReport, loadModelSettings } from "./model";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { showToast, ToastContainer } from "./components/Toast";
import { aggregateReports } from "./utils/aggregation";

function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [reports, setReports] = useState<ParsedLog[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateStep, setRegenerateStep] = useState(0);

  const [activeTab, setActiveTab] = useState<"overview" | "processes" | "anomalies" | "shmoo">("overview");
  const [selectedPhase, setSelectedPhase] = useState<string>("all");

  const devices = useMemo(() => aggregateReports(reports), [reports]);

  const selectedDevice = useMemo(() => {
    if (devices.length === 0) return null;
    if (!selectedDeviceId) return devices[0];
    return devices.find((d) => d.id === selectedDeviceId) ?? devices[0];
  }, [devices, selectedDeviceId]);

  const processes = selectedDevice?.processes ?? [];
  const shmooPlots = selectedDevice?.shmoo_plots ?? [];

  useEffect(() => {
    setActiveTab("overview");
    setSelectedPhase("all");
  }, [selectedDeviceId]);

  const handleOpenReport = (content: string) => {
    setReportContent(content);
    setReportDrawerOpen(true);
  };

  const handleRegenerate = async () => {
    if (!currentPath || devices.length === 0) return;

    setRegenerating(true);
    setRegenerateStep(1);

    try {
      const settings = await loadModelSettings();

      if (!settings.enabled || settings.provider === "none") {
        const errMsg = "AI features are disabled. Please configure AI model in Settings.";
        setError(errMsg);
        showToast(errMsg, "error");
        setRegenerating(false);
        setRegenerateStep(0);
        return;
      }

      const content = await generateReport(devices, settings, locale, (step) => {
        if (step === "calling") setRegenerateStep(2);
        if (step === "saving") setRegenerateStep(3);
      });
      await invoke("save_report", { folderPath: currentPath, content });
      setReportContent(content);
      setRegenerateStep(0);
      showToast(t("reportGenerated", locale), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      showToast(msg, "error");
    } finally {
      setRegenerating(false);
    }
  };

  const handleExportPdf = async () => {
    if (!currentPath) return;
    setExportingPdf(true);
    try {
      const md = await invoke<string>("read_report", { folderPath: currentPath });
      
      const container = document.createElement("div");
      container.style.width = "750px"; 
      container.style.padding = "40px";
      container.style.background = "#ffffff";
      container.style.color = "#1a1a2e";
      container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      container.style.fontSize = "14px";
      container.style.lineHeight = "1.6";
      container.style.position = "absolute";
      container.style.left = "0";
      container.style.top = "0";
      container.style.zIndex = "-9999";

      container.innerHTML = renderMarkdown(cleanMarkdown(md));

      const style = document.createElement("style");
      style.innerHTML = `
        h1 { font-size: 24px; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-top: 0; margin-bottom: 16px; color: #0f766e; }
        h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; color: #0f766e; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        h3 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; color: #1e293b; }
        p { margin-top: 0; margin-bottom: 12px; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
        th { background: #f8fafc; font-weight: 600; color: #0f766e; }
        code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        pre { background: #f1f5f9; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 12px 0; }
        pre code { background: none; padding: 0; }
        ul, ol { padding-left: 20px; margin-top: 0; margin-bottom: 12px; }
        li { margin-bottom: 4px; }
        blockquote { border-left: 4px solid #0f766e; padding-left: 12px; color: #475569; margin: 12px 0; font-style: italic; }
      `;
      container.appendChild(style);
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
        compress: true
      });

      const imgWidth = 595.28; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 841.89; 
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      let heightLeft = imgHeight;
      let position = 0;

      doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight; 
        doc.addPage();
        doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= pageHeight;
      }

      const arrayBuffer = doc.output("arraybuffer");
      
      const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
        let binary = "";
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
      };

      const base64 = arrayBufferToBase64(arrayBuffer);
      const pdfPath = `${currentPath}/report.pdf`;
      
      await invoke("write_binary_file", { path: pdfPath, contentBase64: base64 });
      document.body.removeChild(container);
      await invoke("open_file", { path: pdfPath });
    } catch (err) {
      setError("Failed to export report to PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <LocaleProvider value={{ locale, setLocale }}>
      <main className="app-shell">
        <Topbar
          loading={loading}
          currentPath={currentPath}
          reports={reports}
          devices={devices}
          onReportsLoaded={(r, path) => {
            setReports(r);
            setCurrentPath(path);
            const devs = aggregateReports(r);
            if (devs.length > 0) {
              setSelectedDeviceId(devs[0].id);
            } else {
              setSelectedDeviceId(null);
            }
            setLoading(false);
          }}
          onError={(e) => {
            setError(e);
            setLoading(false);
          }}
          onOpenReport={handleOpenReport}
        />

        <section className="workspace">
          <ReportList
            devices={devices}
            selectedId={selectedDeviceId}
            onSelect={setSelectedDeviceId}
          />

          <section className="report-surface">
            {error ? <div className="error-banner">{error}</div> : null}
            {selectedDevice ? (
              <>
                {/* Slim Elegant Device Header */}
                <div className="device-slim-header">
                  <div className="header-left">
                    <span className="eyebrow">{t("deviceOverview", locale)}</span>
                    <div className="title-row">
                      <h1>{selectedDevice.deviceInfo.model ?? t("modelUnrecognized", locale)}</h1>
                      <span className={`status-pill ${selectedDevice.overallStatus.toLowerCase()}`}>
                        {selectedDevice.overallStatus}
                      </span>
                    </div>
                  </div>
                  <div className="header-right">
                    <div className="slim-meta-item">
                      <span className="meta-label">SN:</span>
                      <span className="meta-value" title={selectedDevice.deviceInfo.sn || "-"}>
                        {selectedDevice.deviceInfo.sn || "-"}
                      </span>
                    </div>
                    <div className="slim-meta-item">
                      <span className="meta-label">MAC:</span>
                      <span className="meta-value" title={selectedDevice.deviceInfo.mac || "-"}>
                        {selectedDevice.deviceInfo.mac || "-"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tab Navigation Capsule Bar */}
                <div className="tab-navigation-bar">
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className={`nav-tab-btn ${activeTab === "overview" ? "active" : ""}`}
                  >
                    <LayoutDashboard size={16} />
                    <span>{t("tabOverview", locale)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("processes")}
                    className={`nav-tab-btn ${activeTab === "processes" ? "active" : ""}`}
                  >
                    <ListChecks size={16} />
                    <span>{t("tabProcesses", locale)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("anomalies")}
                    className={`nav-tab-btn ${activeTab === "anomalies" ? "active" : ""}`}
                  >
                    <AlertTriangle size={16} />
                    <span>{t("tabAnomalies", locale)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("shmoo")}
                    className={`nav-tab-btn ${activeTab === "shmoo" ? "active" : ""}`}
                  >
                    <Activity size={16} />
                    <span>{t("tabShmoo", locale)}</span>
                  </button>
                </div>

                {/* Tab Content Panel */}
                <div className="tab-content-panel">
                  {activeTab === "overview" && (
                    <div className="tab-pane-fade-in dashboard-tab-pane">
                      <DeviceOverview
                        device={selectedDevice}
                        onPhaseClick={(phase) => {
                          setSelectedPhase(phase);
                          setActiveTab("processes");
                        }}
                      />
                      <ProcessTimeline processes={processes} />
                      <AiSummaryPanel device={selectedDevice} />
                    </div>
                  )}

                  {activeTab === "processes" && (
                    <div className="tab-pane-fade-in panel">
                      <PanelTitle icon={<ListChecks />} title={t("processResults", locale)} />
                      <ProcessTable
                        processes={processes}
                        activeFilter={selectedPhase}
                        onFilterChange={setSelectedPhase}
                      />
                    </div>
                  )}

                  {activeTab === "anomalies" && (
                    <div className="tab-pane-fade-in panel">
                      <PanelTitle icon={<AlertTriangle />} title={t("anomalyList", locale)} />
                      <AnomalyList device={selectedDevice} />
                    </div>
                  )}

                  {activeTab === "shmoo" && (
                    <div className="tab-pane-fade-in panel">
                      <PanelTitle icon={<ScanSearch />} title={t("shmooPlot", locale)} />
                      <ShmooPlotPanel plots={shmooPlots} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <section className="empty-state">
                <ScanSearch aria-hidden="true" />
                <h1>{t("emptyStateTitle", locale)}</h1>
                <p>{t("emptyStateDesc", locale)}</p>
              </section>
            )}
          </section>
        </section>
      </main>
      {reportContent && (
        <ReportDrawer
          open={reportDrawerOpen}
          content={reportContent}
          exporting={exportingPdf}
          regenerating={regenerating}
          regenerateStep={regenerateStep}
          onClose={() => setReportDrawerOpen(false)}
          onRegenerate={handleRegenerate}
          onExportPdf={handleExportPdf}
        />
      )}
      <ToastContainer />
    </LocaleProvider>
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

export default App;
