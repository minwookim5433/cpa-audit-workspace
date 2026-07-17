/**
 * PDF 출력 페이지 선별 · 감사 로그
 */
import {
  hasMeaningfulAnswerContent,
  normalizeAnswerText,
  plainTextFromHtml,
  cleanEmptyAnswerMarkupInNode,
  stripFormatSpansFromNode,
} from "./workspace-answer-format.js";

export function getAnswerEditorHtmlFromClone(clone) {
  return clone?.querySelector?.(".answer-doc-editor")?.innerHTML ?? "";
}

export function sanitizeCloneForExport(clone) {
  if (!clone) return clone;
  const editor = clone.querySelector?.(".answer-doc-editor");
  if (editor) {
    stripFormatSpansFromNode(editor);
  }
  return clone;
}

export function buildExportPageAudit(clones) {
  const meaningfulFlags = clones.map((clone) => {
    const html = getAnswerEditorHtmlFromClone(clone);
    return hasMeaningfulAnswerContent(html);
  });

  const lastUsedPageIndex = meaningfulFlags.lastIndexOf(true);

  const rows = clones.map((clone, index) => {
    const html = getAnswerEditorHtmlFromClone(clone);
    const textContent = plainTextFromHtml(html);
    const normalizedTextLength = normalizeAnswerText(textContent).length;
    const hasMeaningfulContent = meaningfulFlags[index];
    const includedInPdf = lastUsedPageIndex >= 0 && index <= lastUsedPageIndex;

    return {
      pageNumber: index + 1,
      rawHtml: html.length > 160 ? `${html.slice(0, 160)}…` : html,
      textContent: textContent.length > 80 ? `${textContent.slice(0, 80)}…` : textContent,
      normalizedTextLength,
      hasMeaningfulContent,
      includedInPdf,
      exportIndex: includedInPdf ? index : null,
    };
  });

  const pagesToExport =
    lastUsedPageIndex === -1
      ? []
      : clones.slice(0, lastUsedPageIndex + 1).map((clone) => sanitizeCloneForExport(clone));

  const pdfMapping = pagesToExport.map((_, exportIndex) => ({
    answerPage: exportIndex + 1,
    pdfPage: exportIndex + 1,
  }));

  return {
    rows,
    lastUsedPageIndex,
    pagesToExport,
    pdfMapping,
    pdfPageCount: pagesToExport.length,
  };
}

export function logExportPageAudit(audit, label = "PDF export") {
  if (!audit) return;
  console.group(`[answer-export] ${label}`);
  console.table(audit.rows);
  console.log("lastUsedPageIndex:", audit.lastUsedPageIndex);
  console.log(
    "PDF mapping:",
    audit.pdfMapping.map((m) => `답안지 ${m.answerPage}페이지 → PDF ${m.pdfPage}페이지`).join(", ") ||
      "(none)"
  );
  console.log("pdfPageCount:", audit.pdfPageCount);
  console.groupEnd();
}

export function selectPagesForPdfExport(clones, { log = false } = {}) {
  const audit = buildExportPageAudit(clones);
  if (log) logExportPageAudit(audit);
  return audit;
}
