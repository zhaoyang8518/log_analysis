import { useState } from "react";
import { Brain, FileText } from "lucide-react";
import type { AggregatedDevice, Anomaly } from "../types";
import { t, useLocale } from "../i18n";
import { classifyAnomalies, loadModelSettings } from "../model";
import { showToast } from "./Toast";

const classifySteps = ["aiClassifyStep1", "aiClassifyStep2", "aiClassifyStep3"] as const;

function AnomalyList({ device }: { device: AggregatedDevice }) {
  const { locale } = useLocale();
  const [classifying, setClassifying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [aiClassifications, setAiClassifications] = useState<Record<string, { severity: string; reason: string }>>({});

  if (device.anomalies.length === 0) {
    return <p className="muted">{t("noAnomalies", locale)}</p>;
  }

  const handleAiClassify = async () => {
    setClassifying(true);
    setCurrentStep(0);
    setCurrentBatch(0);
    setTotalBatches(0);
    try {
      setCurrentStep(1);
      const settings = await loadModelSettings();
      const messages = device.anomalies.map((a) => a.message);

      setCurrentStep(2);
      const result = await classifyAnomalies(messages, settings, (current, total, batchClassifications) => {
        setCurrentBatch(current);
        setTotalBatches(total);
        if (batchClassifications && batchClassifications.length > 0) {
          setAiClassifications((prev) => {
            const next = { ...prev };
            const startIndex = (current - 1) * 3;
            batchClassifications.forEach((c, idx) => {
              const anomalyIndex = startIndex + idx;
              if (anomalyIndex < device.anomalies.length) {
                const anomaly = device.anomalies[anomalyIndex];
                const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
                next[key] = { severity: c.severity, reason: c.reason };
              }
            });
            return next;
          });
        }
      });

      if (!result.classifications || !Array.isArray(result.classifications)) {
        console.error("Invalid classification result:", result);
        return;
      }

      setCurrentStep(3);
      // Final synchronization just to be absolutely certain everything matches.
      const classifications: Record<string, { severity: string; reason: string }> = {};
      result.classifications.forEach((c, i) => {
        const anomaly = device.anomalies[i];
        const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
        classifications[key] = { severity: c.severity, reason: c.reason };
      });

      setAiClassifications(classifications);
      showToast(t("aiClassificationComplete", locale), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("AI classification failed:", err);
      showToast(msg, "error");
    } finally {
      setClassifying(false);
      setCurrentStep(0);
    }
  };

  const getSeverity = (anomaly: Anomaly & { sourceFile: string }): string => {
    const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
    const aiResult = aiClassifications[key];
    return aiResult?.severity || anomaly.severity;
  };

  const getReason = (anomaly: Anomaly & { sourceFile: string }): string | null => {
    const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
    return aiClassifications[key]?.reason || null;
  };

  return (
    <div>
      <div className="anomaly-header">
        <button
          onClick={handleAiClassify}
          disabled={classifying}
          className="ai-classify-btn"
        >
          <Brain size={14} />
          {classifying ? t("aiClassifying", locale) : t("aiClassify", locale)}
        </button>
        {classifying && (
          <div className="ai-progress-steps">
            {classifySteps.map((stepKey, index) => {
              let label = t(stepKey, locale);
              if (stepKey === "aiClassifyStep2" && totalBatches > 0) {
                label = label
                  .replace("{{current}}", String(currentBatch))
                  .replace("{{total}}", String(totalBatches));
              }
              return (
                <span
                  key={stepKey}
                  className={`ai-progress-step ${index + 1 <= currentStep ? "active" : ""} ${index + 1 < currentStep ? "done" : ""}`}
                >
                  <span className="step-number">{index + 1}</span>
                  <span className="step-label">{label}</span>
                </span>
              );
            })}
          </div>
        )}
        {Object.keys(aiClassifications).length > 0 && !classifying && (
          <span className="ai-status">{t("aiClassificationComplete", locale)}</span>
        )}
      </div>
      <ol className="anomaly-list">
        {device.anomalies.map((anomaly, idx) => {
          const severity = getSeverity(anomaly);
          const reason = getReason(anomaly);
          return (
            <li key={`${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}-${idx}`}>
              <div className="anomaly-card-header">
                <span className={`severity ${severity.toLowerCase()}`}>{severity}</span>
                <div className="anomaly-meta">
                  <span className="anomaly-file-badge">
                    <FileText size={10} />
                    {anomaly.sourceFile}
                  </span>
                  <span className="anomaly-line">Line {anomaly.line_number}</span>
                </div>
              </div>
              <strong className="anomaly-msg">{anomaly.message}</strong>
              {reason && <div className="ai-reason">{reason}</div>}
              <pre className="anomaly-context">{anomaly.context.join("\n")}</pre>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default AnomalyList;
