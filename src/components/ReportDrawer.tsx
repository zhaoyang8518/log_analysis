import { useEffect, useRef } from "react";
import { FileText, X, RefreshCw, Download } from "lucide-react";
import { t, useLocale } from "../i18n";

interface ReportDrawerProps {
  open: boolean;
  content: string;
  exporting: boolean;
  regenerating: boolean;
  regenerateStep: number;
  onClose: () => void;
  onRegenerate: () => void;
  onExportPdf: () => void;
}

const reportSteps = ["reportStepPreparing", "reportStepCalling", "reportStepSaving"] as const;

function ReportDrawer({
  open,
  content,
  exporting,
  regenerating,
  regenerateStep,
  onClose,
  onRegenerate,
  onExportPdf,
}: ReportDrawerProps) {
  const { locale } = useLocale();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="report-drawer-overlay" onClick={onClose} />
      <div className="report-drawer">
        <div className="report-drawer-header">
          <h2>
            <FileText size={20} />
            {t("generateReport", locale)}
          </h2>
          <div className="report-drawer-actions">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="report-sub-btn"
              title={t("regenerateReport", locale)}
            >
              <RefreshCw size={12} className={regenerating ? "animate-spin" : ""} />
              {t("regenerateReport", locale)}
            </button>
            <button
              type="button"
              onClick={onExportPdf}
              disabled={exporting}
              className="report-sub-btn"
              title={t("exportPdf", locale)}
            >
              {exporting ? (
                <span className="spinner-small" />
              ) : (
                <Download size={12} />
              )}
              {exporting ? t("generatingReport", locale) : t("exportPdf", locale)}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="drawer-close-btn"
              title={t("close", locale)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {regenerating && (
          <div className="report-progress-bar">
            <div className="ai-progress-steps">
              {reportSteps.map((stepKey, index) => (
                <span
                  key={stepKey}
                  className={`ai-progress-step ${index + 1 <= regenerateStep ? "active" : ""} ${index + 1 < regenerateStep ? "done" : ""}`}
                >
                  <span className="step-number">{index + 1}</span>
                  <span className="step-label">{t(stepKey, locale)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <div
          className="report-drawer-body"
          ref={bodyRef}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      </div>
    </>
  );
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let out = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\s*(?:"([^"]*)")?\)/g,
    (_, alt, src, title) =>
      `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ""}>`);

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');

  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/~~(.+?)~~/g, "<del>$1</del>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");

  return out;
}

interface BlockToken {
  type: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "blockquote" | "hr" | "blank" | "code_start" | "code_end" | "table_header" | "table_row" | "table_end" | "ul_open" | "ul_close" | "ol_item" | "li" | "raw";
  text?: string;
  cells?: string[];
  codeLines?: string[];
  startCodeLines?: boolean;
}

function tokenize(md: string): BlockToken[] {
  const lines = md.split("\n");
  const tokens: BlockToken[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        tokens.push({ type: "code_start", codeLines: [...codeLines], startCodeLines: true });
        tokens.push({ type: "code_end" });
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      i++;
      continue;
    }

    if (inCode) {
      codeLines.push(raw);
      i++;
      continue;
    }

    if (trimmed === "") {
      tokens.push({ type: "blank" });
      i++;
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      const cleanCells = trimmed
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

      const isDivider = cleanCells.every((c) => /^[-: ]+$/.test(c));
      if (isDivider) {
        if (tokens.length > 0 && tokens[tokens.length - 1].type === "table_header") {
          i++;
          continue;
        }
      } else {
        const prev = tokens.length > 0 ? tokens[tokens.length - 1] : null;
        if (prev && prev.type === "table_row") {
          tokens.push({ type: "table_row", cells: cleanCells });
        } else if (prev && prev.type === "table_header") {
          tokens.push({ type: "table_row", cells: cleanCells });
        } else {
          tokens.push({ type: "table_header", cells: cleanCells });
        }
      }
      i++;
      continue;
    }

    if (trimmed.startsWith("###### ")) {
      tokens.push({ type: "h6", text: trimmed.slice(7) });
    } else if (trimmed.startsWith("##### ")) {
      tokens.push({ type: "h5", text: trimmed.slice(6) });
    } else if (trimmed.startsWith("#### ")) {
      tokens.push({ type: "h4", text: trimmed.slice(5) });
    } else if (trimmed.startsWith("### ")) {
      tokens.push({ type: "h3", text: trimmed.slice(4) });
    } else if (trimmed.startsWith("## ")) {
      tokens.push({ type: "h2", text: trimmed.slice(3) });
    } else if (trimmed.startsWith("# ")) {
      tokens.push({ type: "h1", text: trimmed.slice(2) });
    } else if (trimmed.startsWith("> ")) {
      tokens.push({ type: "blockquote", text: trimmed.slice(2) });
    } else if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      tokens.push({ type: "hr" });
    } else if (/^\d+\.\s/.test(trimmed)) {
      tokens.push({ type: "ol_item", text: trimmed.replace(/^\d+\.\s/, "") });
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) {
      tokens.push({ type: "li", text: trimmed.slice(2) });
    } else {
      tokens.push({ type: "p", text: trimmed });
    }

    i++;
  }

  if (inCode) {
    tokens.push({ type: "code_start", codeLines: [...codeLines], startCodeLines: true });
    tokens.push({ type: "code_end" });
  }

  return tokens;
}

function tokensToHtml(tokens: BlockToken[]): string {
  const result: string[] = [];
  let inTable = false;
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === "blank") continue;

    if (t.type === "code_start" && t.startCodeLines) {
      flushAll();
      const escaped = (t.codeLines ?? []).join("\n")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      result.push(`<pre><code>${escaped}</code></pre>`);
      continue;
    }

    if (t.type === "code_end") continue;

    if (t.type === "table_header") {
      flushUl();
      flushOl();
      result.push("<table><thead><tr>");
      for (const cell of (t.cells ?? [])) {
        result.push(`<th>${renderInline(cell)}</th>`);
      }
      result.push("</tr></thead><tbody>");
      inTable = true;
      continue;
    }

    if (t.type === "table_row") {
      if (!inTable) {
        result.push("<table><tbody>");
        inTable = true;
      }
      result.push("<tr>");
      for (const cell of (t.cells ?? [])) {
        result.push(`<td>${renderInline(cell)}</td>`);
      }
      result.push("</tr>");
      continue;
    }

    flushTable();

    if (t.type === "li") {
      flushOl();
      if (!inUl) {
        result.push("<ul>");
        inUl = true;
      }
      result.push(`<li>${renderInline(t.text ?? "")}</li>`);
      continue;
    }

    if (t.type === "ol_item") {
      flushUl();
      if (!inOl) {
        result.push("<ol>");
        inOl = true;
      }
      result.push(`<li>${renderInline(t.text ?? "")}</li>`);
      continue;
    }

    flushUl();
    flushOl();

    switch (t.type) {
      case "h1": result.push(`<h1>${renderInline(t.text ?? "")}</h1>`); break;
      case "h2": result.push(`<h2>${renderInline(t.text ?? "")}</h2>`); break;
      case "h3": result.push(`<h3>${renderInline(t.text ?? "")}</h3>`); break;
      case "h4": result.push(`<h4>${renderInline(t.text ?? "")}</h4>`); break;
      case "h5": result.push(`<h5>${renderInline(t.text ?? "")}</h5>`); break;
      case "h6": result.push(`<h6>${renderInline(t.text ?? "")}</h6>`); break;
      case "p": result.push(`<p>${renderInline(t.text ?? "")}</p>`); break;
      case "blockquote": result.push(`<blockquote>${renderInline(t.text ?? "")}</blockquote>`); break;
      case "hr": result.push("<hr>"); break;
    }
  }

  flushTable();
  flushUl();
  flushOl();

  return result.join("\n");

  function flushTable() {
    if (inTable) {
      result.push("</tbody></table>");
      inTable = false;
    }
  }

  function flushUl() {
    if (inUl) {
      result.push("</ul>");
      inUl = false;
    }
  }

  function flushOl() {
    if (inOl) {
      result.push("</ol>");
      inOl = false;
    }
  }

  function flushAll() {
    flushTable();
    flushUl();
    flushOl();
  }
}

export function cleanMarkdown(md: string): string {
  let cleaned = md.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    } else {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
  }
  return cleaned.trim();
}

export function renderMarkdown(md: string): string {
  const cleaned = cleanMarkdown(md);
  const tokens = tokenize(cleaned);
  return tokensToHtml(tokens);
}

export default ReportDrawer;
