import { useState } from "react";
import type { ShmooPlot } from "../types";
import { t, useLocale } from "../i18n";

function ShmooPlotPanel({ plots }: { plots: ShmooPlot[] }) {
  const { locale } = useLocale();
  const [activePlotIndex, setActivePlotIndex] = useState(0);

  if (plots.length === 0) {
    return <p className="muted">{t("noShmooPlots", locale)}</p>;
  }

  const plot = plots[activePlotIndex] || plots[0];

  // Group coordinates
  const rows = Array.from(new Set(plot.cells.map((c) => c.row)));
  const cols = Array.from(new Set(plot.cells.map((c) => c.column))).sort((a, b) => a - b);

  return (
    <div className="shmoo-container">
      {plots.length > 1 && (
        <div className="shmoo-selector-tabs">
          {plots.map((p, idx) => (
            <button
              key={`${p.name}-${idx}`}
              type="button"
              className={`shmoo-tab-btn ${activePlotIndex === idx ? "active" : ""}`}
              onClick={() => setActivePlotIndex(idx)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <figure className="shmoo-figure">
        <figcaption className="shmoo-title">{plot.name}</figcaption>

        <div className="shmoo-plot-layout">
          {/* Y Axis Title (vertical) */}
          <div className="shmoo-axis-title-vertical">
            <span>{t("shmooAxisY", locale)}</span>
          </div>

          <div className="shmoo-plot-core">
            {/* X Axis Labels Row */}
            <div className="shmoo-x-labels-row">
              <div className="shmoo-corner-cell" />
              {cols.map((c) => (
                <div key={c} className="shmoo-axis-label-x">
                  {c}
                </div>
              ))}
            </div>

            {/* Grid rows */}
            <div className="shmoo-rows-container">
              {rows.map((r) => {
                const rowCells = plot.cells.filter((c) => c.row === r).sort((a, b) => a.column - b.column);
                return (
                  <div key={r} className="shmoo-plot-row">
                    <div className="shmoo-axis-label-y">{r}</div>
                    <div className="shmoo-cells-row">
                      {rowCells.map((cell) => {
                        const rowCol = t("shmooRowCol", locale)
                          .replace("{{row}}", String(cell.row))
                          .replace("{{column}}", String(cell.column));
                        const bestPoint = cell.selected ? t("shmooBestPoint", locale) : "";
                        return (
                          <span
                            className={`shmoo-cell symbol-${cell.symbol}${cell.selected ? " selected" : ""}`}
                            key={`${cell.row}-${cell.column}`}
                            title={`${rowCol}${bestPoint}`}
                          >
                            {cell.symbol}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X Axis Title */}
        <div className="shmoo-axis-title-horizontal">
          <span>{t("shmooAxisX", locale)}</span>
        </div>
      </figure>
    </div>
  );
}

export default ShmooPlotPanel;
