/**
 * PDF 캡처 — html2canvas + jsPDF (답안지 DOM 1개 = PDF 1페이지)
 */

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

export function normalizeSheetCaptureNode(sheetNode, { log = false } = {}) {
  if (!sheetNode) return { node: sheetNode, metrics: null };

  Object.assign(sheetNode.style, {
    transform: "none",
    zoom: "1",
    transformOrigin: "initial",
    margin: "0",
    boxSizing: "border-box",
    position: "relative",
    background: "#ffffff",
  });

  const metrics = {
    offsetWidth: sheetNode.offsetWidth,
    offsetHeight: sheetNode.offsetHeight,
    clientWidth: sheetNode.clientWidth,
    clientHeight: sheetNode.clientHeight,
    rectWidth: sheetNode.getBoundingClientRect().width,
    rectHeight: sheetNode.getBoundingClientRect().height,
  };

  if (log) {
    console.log("[answer-export] sheet capture metrics:", metrics);
  }

  return { node: sheetNode, metrics };
}

/** @deprecated HTML export용 A4 wrapper */
export function normalizeExportPageNode(pageNode, options) {
  return normalizeSheetCaptureNode(pageNode, options);
}

export function fitSheetCanvasToA4Mm(canvas, sheetWidthPx, sheetHeightPx) {
  let renderWidthMm = PDF_PAGE_WIDTH_MM;
  let renderHeightMm = (sheetHeightPx / sheetWidthPx) * renderWidthMm;

  if (renderHeightMm > PDF_PAGE_HEIGHT_MM) {
    renderHeightMm = PDF_PAGE_HEIGHT_MM;
    renderWidthMm = (sheetWidthPx / sheetHeightPx) * renderHeightMm;
  }

  const x = (PDF_PAGE_WIDTH_MM - renderWidthMm) / 2;
  const y = (PDF_PAGE_HEIGHT_MM - renderHeightMm) / 2;

  return { renderWidthMm, renderHeightMm, x, y };
}

/** @deprecated */
export function fitCanvasToA4Mm(canvas, sheetWidthPx, sheetHeightPx) {
  if (sheetWidthPx && sheetHeightPx) {
    return fitSheetCanvasToA4Mm(canvas, sheetWidthPx, sheetHeightPx);
  }
  return {
    renderWidthMm: PDF_PAGE_WIDTH_MM,
    renderHeightMm: PDF_PAGE_HEIGHT_MM,
    x: 0,
    y: 0,
  };
}

export async function captureSheetNodeToCanvas(sheetNode, doc = document) {
  const html2canvas = window.html2canvas;
  if (!html2canvas) throw new Error("html2canvas를 불러오지 못했습니다.");

  const width = Math.max(1, sheetNode.offsetWidth);
  const height = Math.max(1, sheetNode.offsetHeight);

  if (doc.fonts?.ready) {
    await doc.fonts.ready;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  return html2canvas(sheetNode, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    backgroundColor: "#ffffff",
    letterRendering: true,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
  });
}

/** @deprecated */
export async function capturePageNodeToCanvas(pageNode, doc = document) {
  return captureSheetNodeToCanvas(pageNode, doc);
}

export async function buildPdfFromSheetNodes(sheetNodes, { log = false } = {}) {
  const jsPDF = getJsPdfConstructor();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  for (let i = 0; i < sheetNodes.length; i++) {
    const { node, metrics } = normalizeSheetCaptureNode(sheetNodes[i], { log });
    const sheetWidthPx = metrics.offsetWidth;
    const sheetHeightPx = metrics.offsetHeight;
    const canvas = await captureSheetNodeToCanvas(node, node.ownerDocument);

    if (log) {
      console.log("[answer-export] canvas size:", {
        index: i,
        sheetWidthPx,
        sheetHeightPx,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        html2canvasScale: CAPTURE_SCALE,
      });
    }

    const imgData = canvas.toDataURL("image/jpeg", 0.98);
    const { renderWidthMm, renderHeightMm, x, y } = fitSheetCanvasToA4Mm(
      canvas,
      sheetWidthPx,
      sheetHeightPx
    );

    if (log) {
      console.log("[answer-export] jsPDF addImage:", {
        x,
        y,
        width: renderWidthMm,
        height: renderHeightMm,
      });
    }

    if (i > 0) {
      pdf.addPage("a4", "portrait");
    }

    pdf.addImage(imgData, "JPEG", x, y, renderWidthMm, renderHeightMm);
  }

  const sheetCount = sheetNodes.length;
  const pdfPageCount = pdf.internal.getNumberOfPages();

  if (log) {
    console.log({ sheetCount, pdfPageCount });
  }

  if (sheetCount !== pdfPageCount) {
    throw new Error(
      `PDF 페이지 수 불일치: DOM ${sheetCount}장, PDF ${pdfPageCount}장`
    );
  }

  return pdf;
}

/** @deprecated use buildPdfFromSheetNodes */
export async function buildPdfFromPageNodes(pageNodes, options) {
  return buildPdfFromSheetNodes(pageNodes, options);
}

export { CAPTURE_SCALE as PDF_CAPTURE_SCALE };
