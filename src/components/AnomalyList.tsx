import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Brain, FileText } from "lucide-react";
import type { AggregatedDevice, Anomaly } from "../types";
import { t, useLocale } from "../i18n";
import { classifyAnomalies, loadModelSettings } from "../model";
import { showToast } from "./Toast";

const classifySteps = ["aiClassifyStep1", "aiClassifyStep2", "aiClassifyStep3"] as const;

interface AnomalyListProps {
  device: AggregatedDevice;
  aiClassifications: Record<string, { severity: string; reason: string }>;
  setAiClassifications: React.Dispatch<React.SetStateAction<Record<string, { severity: string; reason: string }>>>;
  currentPath: string | null;
}

function AnomalyList({ device, aiClassifications, setAiClassifications, currentPath }: AnomalyListProps) {
  const { locale } = useLocale();
  const [classifying, setClassifying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const abortRef = useRef(false);

  if (device.anomalies.length === 0) {
    return <p className="muted">{t("noAnomalies", locale)}</p>;
  }

  const handleAiClassify = async (mode: "rebuild" | "continue") => {
    setClassifying(true);
    setCurrentStep(0);
    setCurrentBatch(0);
    setTotalBatches(0);
    abortRef.current = false;
    try {
      setCurrentStep(1);
      const settings = await loadModelSettings();

      // Find which anomalies we need to classify
      const targetAnomalies = device.anomalies.filter((anomaly) => {
        if (mode === "rebuild") return true;
        const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
        return !aiClassifications[key];
      });

      if (targetAnomalies.length === 0) {
        showToast(t("aiClassificationComplete", locale), "success");
        setClassifying(false);
        return;
      }

      const messages = targetAnomalies.map((a) => a.message);

      // Keep a local copy of classifications to save synchronously
      let runningClassifications = { ...aiClassifications };

      // If we are rebuilding, we clear existing classifications for THIS device
      if (mode === "rebuild") {
        device.anomalies.forEach((anomaly) => {
          const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
          delete runningClassifications[key];
        });
        setAiClassifications({ ...runningClassifications });
        if (currentPath) {
          await invoke("save_ai_classify_cache", {
            folderPath: currentPath,
            classifyJson: JSON.stringify(runningClassifications),
          });
        }
      }

      setCurrentStep(2);
      const result = await classifyAnomalies(messages, settings, async (current, total, batchClassifications) => {
        if (batchClassifications && batchClassifications.length > 0) {
          const startIndex = (current - 1) * 3;
          batchClassifications.forEach((c, idx) => {
            const anomalyIndex = startIndex + idx;
            if (anomalyIndex < targetAnomalies.length) {
              const anomaly = targetAnomalies[anomalyIndex];
              const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
              runningClassifications[key] = { severity: c.severity, reason: c.reason };
            }
          });

          // Update React state
          setAiClassifications({ ...runningClassifications });

          // Save to .log_analysis immediately!
          if (currentPath) {
            try {
              await invoke("save_ai_classify_cache", {
                folderPath: currentPath,
                classifyJson: JSON.stringify(runningClassifications),
              });
            } catch (err) {
              console.error("Failed to write intermediate batch classifications:", err);
            }
          }
        }

        if (abortRef.current) {
          throw new Error("USER_ABORTED");
        }

        setCurrentBatch(current);
        setTotalBatches(total);
      });

      if (!result.classifications || !Array.isArray(result.classifications)) {
        console.error("Invalid classification result:", result);
        return;
      }

      setCurrentStep(3);
      // Final synchronization just to be absolutely certain everything matches.
      result.classifications.forEach((c, i) => {
        const anomaly = targetAnomalies[i];
        const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
        runningClassifications[key] = { severity: c.severity, reason: c.reason };
      });

      setAiClassifications({ ...runningClassifications });
      if (currentPath) {
        await invoke("save_ai_classify_cache", {
          folderPath: currentPath,
          classifyJson: JSON.stringify(runningClassifications),
        });
      }
      showToast(t("aiClassificationComplete", locale), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "USER_ABORTED") {
        showToast(t("aiClassificationStopped", locale), "info");
      } else {
        console.error("AI classification failed:", err);
        showToast(msg, "error");
      }
    } finally {
      setClassifying(false);
      setCurrentStep(0);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setClassifying(false);
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

  const classifiedCount = device.anomalies.filter((anomaly) => {
    const key = `${anomaly.line_number}-${anomaly.message}-${anomaly.sourceFile}`;
    return !!aiClassifications[key];
  }).length;

  const totalCount = device.anomalies.length;

  return (
    <div>
      <div className="anomaly-header">
        {classifying ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              disabled
              className="ai-classify-btn"
            >
              <Brain size={14} />
              {t("aiClassifying", locale)}
            </button>
            <button
              onClick={handleStop}
              className="ai-classify-btn stop-btn"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.4)",
              }}
            >
              {t("aiClassifyStop", locale)}
            </button>
          </div>
        ) : (
          <div>
            {classifiedCount === 0 ? (
              <button
                onClick={() => handleAiClassify("rebuild")}
                className="ai-classify-btn"
              >
                <Brain size={14} />
                {t("aiClassify", locale)}
              </button>
            ) : classifiedCount < totalCount ? (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => handleAiClassify("continue")}
                  className="ai-classify-btn continue-btn"
                >
                  <Brain size={14} />
                  {t("aiClassifyContinue", locale)} ({totalCount - classifiedCount} {locale === "zh" ? "项待处理" : "left"})
                </button>
                <button
                  onClick={() => handleAiClassify("rebuild")}
                  className="ai-classify-btn rebuild-btn"
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {t("aiClassifyRebuild", locale)}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleAiClassify("rebuild")}
                className="ai-classify-btn rebuild-btn"
                style={{
                  backgroundColor: "transparent",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <Brain size={14} />
                {t("aiClassifyRebuild", locale)}
              </button>
            )}
          </div>
        )}
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
        {classifiedCount > 0 && !classifying && (
          <span className="ai-status">
            {classifiedCount === totalCount
              ? t("aiClassificationComplete", locale)
              : `${locale === "zh" ? "已分类" : "Classified"} ${classifiedCount}/${totalCount}`}
          </span>
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
