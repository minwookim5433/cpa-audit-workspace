/**
 * PDF 캡처 — html2canvas + jsPDF (답안지 DOM 1개 = PDF 1페이지)
 */
import {
  ANSWER_GRID_LINE_COLOR,
  ANSWER_ROWS_PER_PAGE,
  ANSWER_PADDING_LEFT_PX,
  ANSWER_PADDING_RIGHT_PX,
} from "./workspace-answer-typography.js";

export const EXPORT_PAGE_WIDTH_PX = 794;
export const EXPORT_PAGE_HEIGHT_PX = 1123;
export const PDF_PAGE_WIDTH_MM = 210;
export const PDF_PAGE_HEIGHT_MM = 297;

const CAPTURE_SCALE = 2;

function loadScriptOnce(src, globalCheck) {
  if (globalCheck()) return Promise.resolve();
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (globalCheck()) resolve();
      else {
        existing.addEventListener("load", resolve);
        existing.addEventListener("error", reject);
      }
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
    document.head.appendChild(script);
  });
}

export async function ensurePdfCaptureLibs() {
  await loadScriptOnce(
    "/node_modules/html2canvas/dist/html2canvas.min.js",
    () => typeof window.html2canvas === "function"
  );
  await loadScriptOnce(
    "/node_modules/jspdf/dist/jspdf.umd.min.js",
    () => Boolean(window.jspdf?.jsPDF)
  );
}

export function getJsPdfConstructor() {
  const ctor = window.jspdf?.jsPDF;
  if (!ctor) throw new Error("jsPDF를 불러오지 못했습니다.");
  return ctor;
}

export function normalizeExportPageNode(pageNode, { log = false } = {}) {
  if (!pageNode) return pageNode;

  Object.assign(pageNode.style, {
    width: `${EXPORT_PAGE_WIDTH_PX}px`,
    height: `${EXPORT_PAGE_HEIGHT_PX}px`,
    boxSizing: "border-box",
    overflow: "hidden",
    margin: "0",
    position: "relative",
    background: "#ffffff",
    opacity: "1",
  });

  const metrics = {
    rectHeight: pageNode.getBoundingClientRect().height,
    scrollHeight: pageNode.scrollHeight,
    offsetHeight: pageNode.offsetHeight,
  };

  if (log) {
    console.log("[answer-export] page node metrics:", metrics);
  }

  return { node: pageNode, metrics };
}

export function fitCanvasToA4Mm(canvas) {
  void canvas;
  return {
    renderWidthMm: PDF_PAGE_WIDTH_MM,
    renderHeightMm: PDF_PAGE_HEIGHT_MM,
    x: 0,
    y: 0,
  };
}

export function readAnswerGridExportMetrics(pageNode) {
  const sheet = pageNode?.querySelector?.(
    ".answer-doc-sheet, .answer-sheet-page, .answer-doc-sheet-clone"
  );
  if (!sheet?.dataset?.exportGridRowHeight) return null;
  return {
    bodyTop: Number(sheet.dataset.exportGridBodyTop),
    rowHeight: Number(sheet.dataset.exportGridRowHeight),
    padL: Number(sheet.dataset.exportGridPadL),
    padR: Number(sheet.dataset.exportGridPadR),
    rows: Number(sheet.dataset.exportGridRows) || 25,
  };
}

export function resolveAnswerGridMetrics(pageNode) {
  const sheet = pageNode?.querySelector?.(
    ".answer-doc-sheet, .answer-sheet-page, .answer-doc-sheet-clone"
  );
  if (!sheet) return null;

  if (sheet.dataset.exportGridRowHeight) {
    return readAnswerGridExportMetrics(pageNode);
  }

  const page = pageNode.classList?.contains("export-answer-page")
    ? pageNode
    : pageNode.closest(".export-answer-page") || pageNode;
  const body = sheet.querySelector(".answer-doc-body, .answer-sheet-content") || sheet;
  const pageRect = page.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const bodyHeight = body.clientHeight || bodyRect.height;
  if (bodyHeight <= 0) return null;

  const css = getComputedStyle(sheet);
  const padL = parseFloat(css.getPropertyValue("--answer-padding-left")) || ANSWER_PADDING_LEFT_PX;
  const padR = parseFloat(css.getPropertyValue("--answer-padding-right")) || ANSWER_PADDING_RIGHT_PX;

  return {
    bodyTop: bodyRect.top - pageRect.top,
    rowHeight: bodyHeight / ANSWER_ROWS_PER_PAGE,
    padL,
    padR,
    rows: ANSWER_ROWS_PER_PAGE,
  };
}

/** html2canvas가 border/aria-hidden 줄을 누락할 때 캔버스에 직접 회색 줄을 그림 */
export function paintAnswerGridLinesOnCanvas(canvas, pageNode, captureScale = CAPTURE_SCALE) {
  const metrics = resolveAnswerGridMetrics(pageNode);
  if (!metrics || !canvas) return canvas;

  const { bodyTop, rowHeight, padL, padR, rows } = metrics;
  if (!rowHeight || rowHeight <= 0) return canvas;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const x1 = padL * captureScale;
  const x2 = canvas.width - padR * captureScale;
  const top = bodyTop * captureScale;
  const rowH = rowHeight * captureScale;
  const lineWidth = Math.max(1, captureScale * 0.75);

  ctx.save();
  ctx.strokeStyle = ANSWER_GRID_LINE_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.globalCompositeOperation = "source-over";

  for (let i = 1; i <= rows; i++) {
    const y = Math.round(top + i * rowH) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }

  ctx.restore();
  return canvas;
}

export async function capturePageNodeToCanvas(pageNode, doc = document) {
  const html2canvas = window.html2canvas;
  if (!html2canvas) throw new Error("html2canvas를 불러오지 못했습니다.");

  if (doc.fonts?.ready) {
    await doc.fonts.ready;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = await html2canvas(pageNode, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    backgroundColor: "#ffffff",
    letterRendering: true,
    logging: false,
    width: EXPORT_PAGE_WIDTH_PX,
    height: EXPORT_PAGE_HEIGHT_PX,
    windowWidth: EXPORT_PAGE_WIDTH_PX,
    windowHeight: EXPORT_PAGE_HEIGHT_PX,
  });

  return paintAnswerGridLinesOnCanvas(canvas, pageNode, CAPTURE_SCALE);
}

export async function buildPdfFromPageNodes(pageNodes, { log = false } = {}) {
  const jsPDF = getJsPdfConstructor();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  for (let i = 0; i < pageNodes.length; i++) {
    const { node } = normalizeExportPageNode(pageNodes[i], { log });
    const canvas = await capturePageNodeToCanvas(node, node.ownerDocument);

    if (log) {
      console.log("[answer-export] canvas size:", {
        index: i,
        width: canvas.width,
        height: canvas.height,
        a4PixelHeightAtScale: Math.floor(
          EXPORT_PAGE_WIDTH_PX * (PDF_PAGE_HEIGHT_MM / PDF_PAGE_WIDTH_MM) * CAPTURE_SCALE
        ),
      });
    }

    const imgData = canvas.toDataURL("image/jpeg", 0.98);
    const { renderWidthMm, renderHeightMm, x, y } = fitCanvasToA4Mm(canvas);

    if (i > 0) {
      pdf.addPage("a4", "portrait");
    }

    pdf.addImage(imgData, "JPEG", x, y, renderWidthMm, renderHeightMm);
  }

  const pageNodesCount = pageNodes.length;
  const pdfPageCount = pdf.internal.getNumberOfPages();

  if (log) {
    console.log({ pageNodesCount, pdfPageCount });
  }

  if (pageNodesCount !== pdfPageCount) {
    throw new Error(
      `PDF 페이지 수 불일치: DOM ${pageNodesCount}장, PDF ${pdfPageCount}장`
    );
  }

  return pdf;
}
