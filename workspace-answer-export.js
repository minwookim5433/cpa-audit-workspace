/**
 * 답안지 PDF/HTML/인쇄 — 작성 화면 DOM 클론 기반
 */
import { ANSWER_PAGE_COUNT } from "./workspace-answer-editor.js";
import {
  answerSheetVarsStyleAttr,
  applyAnswerSheetVars,
  normalizeAnswerTypography,
  assertAnswerTypographyMatch,
  waitForExportLayout,
  waitForExportStylesheets,
  applyAnswerEditorExportStyles,
  applyAnswerSheetExportLayout,
  applyAnswerBodyExportLayout,
  applyAnswerGridLinesForExport,
  applyPdfA4ExportFillLayout,
  finalizePdfA4ExportRowHeights,
  measurePdfA4ExportDimensions,
  assertAnswerExportTypographyCore,
  measureAnswerPageLayout,
  ANSWER_PAGE_WIDTH_PX,
  ANSWER_LINE_HEIGHT_PX,
  ANSWER_FONT_FAMILY,
} from "./workspace-answer-typography.js";
import { selectPagesForPdfExport } from "./workspace-answer-export-pages.js";
import {
  ensurePdfCaptureLibs,
  buildPdfFromPageNodes,
  EXPORT_PAGE_WIDTH_PX,
  EXPORT_PAGE_HEIGHT_PX,
} from "./workspace-answer-pdf-capture.js";

export { ANSWER_PAGE_COUNT };
export { selectPagesForPdfExport, buildExportPageAudit } from "./workspace-answer-export-pages.js";

export class NoAnswerContentError extends Error {
  constructor(message = "저장할 답안이 없습니다.") {
    super(message);
    this.name = "NoAnswerContentError";
  }
}

let lastPdfExportAudit = null;

export function getLastPdfExportAudit() {
  return lastPdfExportAudit;
}

export function resolveExamYear(source) {
  if (source == null) return null;
  if (typeof source === "number") {
    if (source >= 2000 && source <= 2099) return String(source);
    return null;
  }
  if (typeof source === "string") {
    const match = String(source).match(/(20\d{2})/);
    return match ? match[1] : null;
  }
  if (typeof source === "object") {
    const { year, docTitle, documentTitle, pdfName, fileName, title, name } = source;
    if (year != null && year !== "") {
      const y = Number(year);
      if (!Number.isNaN(y) && y >= 2000 && y <= 2099) return String(y);
    }
    for (const value of [docTitle, documentTitle, title, pdfName, fileName, name]) {
      const found = resolveExamYear(value);
      if (found) return found;
    }
  }
  return null;
}

/** @deprecated use resolveExamYear */
export function extractExamYear(docTitle) {
  return resolveExamYear(docTitle) || "";
}

export function buildAnswerPdfFilename(source) {
  const year = resolveExamYear(source);
  return year ? `${year} 회계감사 답안지.pdf` : "회계감사 답안지.pdf";
}

export function buildAnswerHtmlFilename(source) {
  const year = resolveExamYear(source);
  return year ? `${year} 회계감사 답안지.html` : "회계감사 답안지.html";
}

function buildCloneExportStyles() {
  return `
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .export-answer-page {
      width: ${EXPORT_PAGE_WIDTH_PX}px;
      height: ${EXPORT_PAGE_HEIGHT_PX}px;
      box-sizing: border-box;
      overflow: hidden;
      margin: 0;
      padding: 0;
      background: #fff;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    .export-answer-page .export-answer-page-inner {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      overflow: hidden;
      padding-top: 24px;
      display: flex;
      justify-content: center;
    }
    .export-answer-page .answer-doc-sheet,
    .export-answer-page .answer-sheet-page,
    .export-answer-page .answer-doc-sheet-clone {
      width: ${ANSWER_PAGE_WIDTH_PX}px;
      max-width: ${ANSWER_PAGE_WIDTH_PX}px;
      margin: 0 auto;
      background: #fff;
      box-sizing: border-box;
    }
    .export-answer-page .answer-doc-body,
    .export-answer-page .answer-sheet-content {
      position: relative;
      min-height: calc(${ANSWER_LINE_HEIGHT_PX}px * 25);
      box-sizing: border-box;
      background: #fff;
    }
    .export-answer-page .answer-doc-bg,
    .export-answer-page .answer-line-background {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      padding: 0 var(--answer-padding-right, 10px) 0 var(--answer-padding-left, 10px);
      box-sizing: border-box;
    }
    .export-answer-page .answer-doc-bg-line {
      flex: 1 1 0;
      min-height: 0;
      border-bottom: 1px solid #c8ccd4;
      box-shadow: inset 0 -1px 0 #c8ccd4;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .export-answer-page .answer-doc-editor {
      position: absolute;
      inset: 0;
      z-index: 1;
      min-height: calc(${ANSWER_LINE_HEIGHT_PX}px * 25);
      font-family: ${ANSWER_FONT_FAMILY};
      white-space: pre-wrap;
      word-break: break-all;
      overflow-wrap: anywhere;
      box-sizing: border-box;
      outline: none;
      background: transparent;
    }
    @media print {
      body { background: #fff; }
      .export-answer-page .export-answer-page-inner { padding-top: 16px; }
    }
  `;
}

export function buildExportHtmlFromClones(clones, docTitle, typography = {}) {
  const year = resolveExamYear(docTitle);
  const t = normalizeAnswerTypography(typography);
  const bodyVars = answerSheetVarsStyleAttr(t);
  const pagesHtml = (clones || [])
    .map(
      (clone, idx) => `
    <section class="export-answer-page" data-page="${idx + 1}" ${answerSheetVarsStyleAttr(t)}>
      <div class="export-answer-page-inner">${clone?.outerHTML || ""}</div>
    </section>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${year ? `${year} 회계감사 답안지` : "회계감사 답안지"}</title>
  <link rel="stylesheet" href="/workspace.css" />
  <style>${buildCloneExportStyles()}</style>
</head>
<body ${bodyVars}>${pagesHtml}</body>
</html>`;
}

function applyTypographyToExportDocument(idoc, typography) {
  const t = normalizeAnswerTypography(typography);
  applyAnswerSheetVars(idoc.body, t);
  idoc
    .querySelectorAll(
      ".export-answer-page, .export-answer-page-inner, .answer-doc-sheet, .answer-sheet-page, .answer-doc-editor"
    )
    .forEach((el) => {
      applyAnswerSheetVars(el, t);
    });
}

function finalizeExportDocumentStyles(idoc, typography, referenceEditor = null) {
  applyTypographyToExportDocument(idoc, typography);
  idoc
    .querySelectorAll(".answer-doc-sheet, .answer-sheet-page, .answer-doc-sheet-clone")
    .forEach((el) => {
      applyAnswerSheetExportLayout(el, typography);
    });
  idoc.querySelectorAll(".answer-doc-body, .answer-sheet-content").forEach((el) => {
    applyAnswerBodyExportLayout(el);
  });
  idoc.querySelectorAll(".answer-doc-editor").forEach((el) => {
    applyAnswerEditorExportStyles(el, typography, referenceEditor);
  });
  idoc.querySelectorAll(".answer-doc-sheet, .answer-sheet-page, .answer-doc-sheet-clone").forEach((el) => {
    applyAnswerGridLinesForExport(el);
  });
}

async function prepareOffscreenCapturePages(
  clones,
  typography,
  referenceEditor,
  { log = false } = {}
) {
  const mount = document.createElement("div");
  mount.className = "answer-doc-capture-mount";
  mount.style.cssText =
    "position:fixed;left:-12000px;top:0;z-index:-1;pointer-events:none;background:#fff;transform:none;zoom:1;opacity:1;visibility:visible;";
  document.body.appendChild(mount);

  const t = normalizeAnswerTypography(typography);
  const referenceSheet =
    referenceEditor?.closest?.(".answer-doc-sheet") ||
    document.querySelector(".answer-doc-sheet");
  const pages = [];
  const layoutLog = [];

  clones.forEach((clone, index) => {
    const page = document.createElement("section");
    page.className = "export-answer-page";
    page.dataset.page = String(index + 1);

    const sheet = clone.cloneNode(true);
    page.appendChild(sheet);
    mount.appendChild(page);

    const beforeSheet = measureAnswerPageLayout(sheet, `before-fill-${index + 1}`);
    const fillMetrics = applyPdfA4ExportFillLayout(
      page,
      sheet,
      t,
      referenceEditor,
      referenceSheet
    );

    if (log) {
      page.style.outline = "2px solid red";
    }

    layoutLog.push({ page: index + 1, beforeSheet, fillMetrics });
    pages.push(page);
  });

  await waitForExportLayout(document);

  layoutLog.forEach((entry, index) => {
    const page = pages[index];
    const sheet = page?.querySelector(".answer-doc-sheet");
    entry.rowMetrics = finalizePdfA4ExportRowHeights(sheet);
    applyAnswerGridLinesForExport(sheet, page);
    entry.after = measurePdfA4ExportDimensions(page, sheet);
  });

  await waitForExportLayout(document);

  if (log) {
    console.group("[answer-export] A4 fill layout");
    console.table(
      layoutLog.map((entry) => ({
        page: entry.page,
        beforeWidth: entry.beforeSheet.offsetWidth,
        beforeHeight: entry.beforeSheet.offsetHeight,
        afterWidth: entry.after?.sheet?.offsetWidth,
        afterHeight: entry.after?.sheet?.offsetHeight,
        rows25Height: entry.after?.rows25Height,
        lastRowBottom: entry.after?.lastRowBottom,
        wrapperBottom: entry.after?.wrapperBottom,
        gapBelowLastRow: entry.after?.gapBelowLastRow,
        rowHeight: entry.rowMetrics?.rowHeight,
        scale: entry.fillMetrics?.scale,
        scaledFontSize: entry.fillMetrics?.scaledFontSize,
        scaledLetterSpacing: entry.fillMetrics?.scaledLetterSpacing,
      }))
    );
    console.log(
      "wrapper padding:",
      layoutLog[0]?.after?.wrapper
        ? `${layoutLog[0].after.wrapper.paddingTop} ${layoutLog[0].after.wrapper.paddingRight} ${layoutLog[0].after.wrapper.paddingBottom} ${layoutLog[0].after.wrapper.paddingLeft}`
        : "(none)"
    );
    console.groupEnd();
  }

  if (referenceEditor) {
    const outputEditor = pages[0]?.querySelector(".answer-doc-editor");
    const scale = layoutLog[0]?.fillMetrics?.scale ?? 1;
    if (outputEditor) {
      assertAnswerExportTypographyCore(referenceEditor, outputEditor, { scale });
    }
  }

  return { mount, pages, layoutLog };
}

async function prepareExportDocument(html, typography, referenceEditor) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:794px;height:1123px;border:none;opacity:0.01;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!idoc) {
    document.body.removeChild(iframe);
    throw new Error("PDF 렌더링 프레임을 열 수 없습니다.");
  }

  idoc.open();
  idoc.write(html);
  idoc.close();

  await waitForExportStylesheets(idoc);
  finalizeExportDocumentStyles(idoc, typography, referenceEditor);
  await waitForExportLayout(idoc);

  const outputEditor = idoc.querySelector(".answer-doc-editor");
  if (referenceEditor && outputEditor) {
    assertAnswerTypographyMatch(referenceEditor, outputEditor);
  }

  return { iframe, idoc };
}

export function downloadHtmlFile(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "cpa-answers.html";
  a.click();
  URL.revokeObjectURL(url);
}

export async function printHtmlDocument(html, typography = {}, referenceEditor = null) {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.");
  }
  win.document.write(html);
  win.document.close();
  win.focus();

  const t = normalizeAnswerTypography(typography);
  applyAnswerSheetVars(win.document.body, t);
  win.document.querySelectorAll(".export-answer-page, .answer-doc-sheet").forEach((el) => {
    applyAnswerSheetVars(el, t);
  });
  await waitForExportLayout(win.document);

  const outputEditor = win.document.querySelector(".answer-doc-editor");
  if (referenceEditor && outputEditor) {
    assertAnswerTypographyMatch(referenceEditor, outputEditor);
  }

  win.print();
}

export async function downloadPdfFromClones(
  clones,
  filename,
  typography = {},
  referenceEditor = null,
  { logPages = false } = {}
) {
  await ensurePdfCaptureLibs();

  const audit = selectPagesForPdfExport(clones, { log: logPages });
  lastPdfExportAudit = audit;

  if (audit.lastUsedPageIndex === -1 || !audit.pagesToExport.length) {
    throw new NoAnswerContentError();
  }

  const t = normalizeAnswerTypography(typography);

  const { mount, pages } = await prepareOffscreenCapturePages(
    audit.pagesToExport,
    t,
    referenceEditor,
    { log: logPages }
  );

  if (!pages.length) {
    mount.remove();
    throw new Error("보낼 답안지 페이지가 없습니다.");
  }

  try {
    const pdf = await buildPdfFromPageNodes(pages, { log: logPages });
    pdf.save(filename || "cpa-answers.pdf");
  } finally {
    mount.remove();
  }
}
