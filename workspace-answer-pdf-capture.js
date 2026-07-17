/**
 * PDF 캡처 — html2canvas + jsPDF (A4 export page 1개 = PDF 1페이지)
 */

export const EXPORT_PAGE_WIDTH_PX = 794;
export const EXPORT_PAGE_HEIGHT_PX = 1123;
export const PDF_PAGE_WIDTH_MM = 210;
export const PDF_PAGE_HEIGHT_MM = 297;

export const CAPTURE_SCALE = 2;

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

function measureCaptureDom(pageNode) {
  const css = getComputedStyle(pageNode);
  const rect = pageNode.getBoundingClientRect();
  return {
    offsetWidth: pageNode.offsetWidth,
    offsetHeight: pageNode.offsetHeight,
    clientWidth: pageNode.clientWidth,
    clientHeight: pageNode.clientHeight,
    rectWidth: rect.width,
    rectHeight: rect.height,
    transform: css.transform,
    zoom: css.zoom || "1",
  };
}

function measureCanvas(canvas) {
  return {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    canvasCssWidth: canvas.style.width || "(none)",
    canvasCssHeight: canvas.style.height || "(none)",
    html2canvasScale: CAPTURE_SCALE,
    devicePixelRatio: window.devicePixelRatio,
    expectedWidth: EXPORT_PAGE_WIDTH_PX * CAPTURE_SCALE,
    expectedHeight: EXPORT_PAGE_HEIGHT_PX * CAPTURE_SCALE,
  };
}

export function logPdfExportMetrics({
  pageIndex,
  dom,
  canvas,
  addImage,
  ratios,
}) {
  console.group(`[answer-export] PDF metrics page ${pageIndex + 1}`);
  console.log("A. capture DOM");
  console.table([dom]);
  console.log("B. canvas");
  console.table([canvas]);
  console.log("C. jsPDF addImage");
  console.table([addImage]);
  console.log("D. aspect ratios");
  console.table([ratios]);
  console.groupEnd();
}

export function normalizeExportPageNode(pageNode, { log = false } = {}) {
  if (!pageNode) return { node: pageNode, metrics: null };

  Object.assign(pageNode.style, {
    width: `${EXPORT_PAGE_WIDTH_PX}px`,
    height: `${EXPORT_PAGE_HEIGHT_PX}px`,
    minWidth: `${EXPORT_PAGE_WIDTH_PX}px`,
    minHeight: `${EXPORT_PAGE_HEIGHT_PX}px`,
    maxWidth: `${EXPORT_PAGE_WIDTH_PX}px`,
    maxHeight: `${EXPORT_PAGE_HEIGHT_PX}px`,
    boxSizing: "border-box",
    overflow: "hidden",
    margin: "0",
    padding: "0",
    position: "relative",
    background: "#ffffff",
    transform: "none",
    zoom: "1",
    transformOrigin: "initial",
  });

  const metrics = measureCaptureDom(pageNode);
  if (log) {
    console.log("[answer-export] normalized export page:", metrics);
  }
  return { node: pageNode, metrics };
}

export async function captureExportPageToCanvas(pageNode, doc = document) {
  const html2canvas = window.html2canvas;
  if (!html2canvas) throw new Error("html2canvas를 불러오지 못했습니다.");

  if (doc.fonts?.ready) {
    await doc.fonts.ready;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  return html2canvas(pageNode, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    backgroundColor: "#ffffff",
    letterRendering: true,
    logging: false,
    width: EXPORT_PAGE_WIDTH_PX,
    height: EXPORT_PAGE_HEIGHT_PX,
    windowWidth: EXPORT_PAGE_WIDTH_PX,
    windowHeight: EXPORT_PAGE_HEIGHT_PX,
    scrollX: 0,
    scrollY: 0,
  });
}

export async function buildPdfFromExportPages(pageNodes, { log = false } = {}) {
  const jsPDF = getJsPdfConstructor();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  for (let i = 0; i < pageNodes.length; i++) {
    const { node, metrics: domMetrics } = normalizeExportPageNode(pageNodes[i], { log });
    const canvas = await captureExportPageToCanvas(node, node.ownerDocument);
    const canvasMetrics = measureCanvas(canvas);

    const addImage = {
      pdfPageWidthMm: PDF_PAGE_WIDTH_MM,
      pdfPageHeightMm: PDF_PAGE_HEIGHT_MM,
      x: 0,
      y: 0,
      width: PDF_PAGE_WIDTH_MM,
      height: PDF_PAGE_HEIGHT_MM,
      scaleRatio: 1,
      margin: 0,
    };

    const ratios = {
      domAspect: domMetrics.rectWidth / domMetrics.rectHeight,
      canvasAspect: canvas.width / canvas.height,
      addImageAspect: addImage.width / addImage.height,
      a4Aspect: PDF_PAGE_WIDTH_MM / PDF_PAGE_HEIGHT_MM,
    };

    if (log) {
      logPdfExportMetrics({
        pageIndex: i,
        dom: domMetrics,
        canvas: canvasMetrics,
        addImage,
        ratios,
      });
    }

    const imgData = canvas.toDataURL("image/png");

    if (i > 0) {
      pdf.addPage("a4", "portrait");
    }

    pdf.addImage(
      imgData,
      "PNG",
      addImage.x,
      addImage.y,
      addImage.width,
      addImage.height
    );
  }

  const pageCount = pageNodes.length;
  const pdfPageCount = pdf.internal.getNumberOfPages();

  if (log) {
    console.log("[answer-export] page count:", { pageCount, pdfPageCount });
  }

  if (pageCount !== pdfPageCount) {
    throw new Error(
      `PDF 페이지 수 불일치: DOM ${pageCount}장, PDF ${pdfPageCount}장`
    );
  }

  return pdf;
}

/** @deprecated use buildPdfFromExportPages */
export async function buildPdfFromSheetNodes(pageNodes, options) {
  return buildPdfFromExportPages(pageNodes, options);
}

/** @deprecated use buildPdfFromExportPages */
export async function buildPdfFromPageNodes(pageNodes, options) {
  return buildPdfFromExportPages(pageNodes, options);
}

/** @deprecated */
export async function captureSheetNodeToCanvas(node, doc) {
  return captureExportPageToCanvas(node, doc);
}

/** @deprecated */
export async function capturePageNodeToCanvas(node, doc) {
  return captureExportPageToCanvas(node, doc);
}

export { CAPTURE_SCALE as PDF_CAPTURE_SCALE };
