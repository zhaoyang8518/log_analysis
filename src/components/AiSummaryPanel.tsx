import { useState } from "react";
import { FileText, Brain } from "lucide-react";
import type { AggregatedDevice } from "../types";
import { t, useLocale } from "../i18n";
import { generateSummary, loadModelSettings } from "../model";

const summarySteps = ["aiSummaryStep1", "aiSummaryStep2", "aiSummaryStep3"] as const;

function AiSummaryPanel({ device }: { device: AggregatedDevice }) {
  const { locale } = useLocale();
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setCurrentStep(0);
    setError(null);
    try {
      setCurrentStep(1);
      const settings = await loadModelSettings();
      const deviceInfo = [
        device.deviceInfo.sn && `SN: ${device.deviceInfo.sn}`,
        device.deviceInfo.mac && `MAC: ${device.deviceInfo.mac}`,
        device.deviceInfo.model && `Model: ${device.deviceInfo.model}`,
      ].filter(Boolean).join(", ") || "Unknown device";

      const processes = device.processes.map(
        (p) => `${p.name}: ${p.status}${p.duration_ms ? ` (${Math.floor(p.duration_ms / 1000)}s)` : ""}`
      );

      const anomalies = device.anomalies.map(
        (a) => `[${a.sourceFile}] Line ${a.line_number}: ${a.message}`
      );

      setCurrentStep(2);
      const result = await generateSummary(deviceInfo, processes, anomalies, settings);

      setCurrentStep(3);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
      setCurrentStep(0);
    }
  };

  return (
    <section className="panel ai-summary-panel">
      <h2 className="panel-title">
        <FileText />
        {t("aiSummary", locale)}
      </h2>
      <div className="ai-summary-container">
        {!summary && !generating && (
          <button onClick={handleGenerate} className="ai-generate-btn">
            <Brain size={14} />
            {t("aiGenerateSummary", locale)}
          </button>
        )}
        {generating && (
          <div className="ai-progress-steps">
            {summarySteps.map((stepKey, index) => (
              <span
                key={stepKey}
                className={`ai-progress-step ${index + 1 <= currentStep ? "active" : ""} ${index + 1 < currentStep ? "done" : ""}`}
              >
                <span className="step-number">{index + 1}</span>
                <span className="step-label">
                  {t(stepKey, locale)}
                </span>
              </span>
            ))}
          </div>
        )}
        {error && (
          <div className="ai-error">
            {t("aiSummaryFailed", locale)}: {error}
          </div>
        )}
        {summary && (
          <div className="ai-summary-content">
            <div className="ai-summary-header">
              <span className="ai-status">{t("aiSummaryComplete", locale)}</span>
              <button onClick={handleGenerate} className="ai-regenerate-btn">
                <Brain size={12} />
                {t("aiGenerateSummary", locale)}
              </button>
            </div>
            <p>{summary}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default AiSummaryPanel;
