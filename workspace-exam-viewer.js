/**
 * 시험지 단일 페이지 PDF 뷰어 (고해상도 렌더링)
 */
import * as pdfjsLib from "/node_modules/pdfjs-dist/build/pdf.mjs";
import { assessTextContent } from "./study-problem-range.js";

export const MOBILE_BREAKPOINT = 900;

export function isDesktopSplit() {
  return window.innerWidth >= MOBILE_BREAKPOINT;
}

function getPixelRatio() {
  return Math.max(1, window.devicePixelRatio || 1);
}

async function renderOnePage(pdfDoc, pageNum, scale, highlightQuery) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const pixelRatio = getPixelRatio();

  const wrap = document.createElement("div");
  wrap.className = "exam-page-wrap is-single-page";
  wrap.dataset.page = String(pageNum);

  const container = document.createElement("div");
  container.className = "pdf-page-container";
  container.dataset.page = String(pageNum);
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;

  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";
  canvas.draggable = false;
  const ctx = canvas.getContext("2d", { alpha: false });

  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = false;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const textContent = await page.getTextContent();
  const textAssess = assessTextContent(textContent);

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer";

  if (textAssess.isTextRich) {
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    });
    await textLayer.render();
    if (highlightQuery) highlightTextLayer(textLayerDiv, highlightQuery);
  }

  const drawLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  drawLayer.classList.add("draw-layer");
  drawLayer.setAttribute("viewBox", "0 0 100 100");
  drawLayer.setAttribute("preserveAspectRatio", "none");

  const drawInteract = document.createElement("div");
  drawInteract.className = "draw-interact-layer";

  container.append(canvas, textLayerDiv, drawLayer, drawInteract);
  wrap.append(container);

  return {
    wrap,
    isTextRich: textAssess.isTextRich,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      pageWidth: viewport.width / scale,
      pageHeight: viewport.height / scale,
      scale,
    },
  };
}

function highlightTextLayer(layer, query) {
  if (!query || query.length < 1) return;
  const q = query.toLowerCase();
  layer.querySelectorAll("span").forEach((span) => {
    const t = span.textContent || "";
    if (t.toLowerCase().includes(q)) span.classList.add("exam-search-hit");
  });
}

export async function renderSinglePage(pdfDoc, pageNum, scale, containerEl, highlightQuery = "") {
  if (!pdfDoc || !containerEl) return { isTextRich: false, viewport: null };

  const { wrap, isTextRich, viewport } = await renderOnePage(pdfDoc, pageNum, scale, highlightQuery);

  containerEl.innerHTML = "";
  containerEl.append(wrap);
  return { isTextRich, viewport };
}

export async function detectPdfTextRich(pdfDoc, samplePages = 3) {
  const n = Math.min(samplePages, pdfDoc.numPages);
  for (let i = 1; i <= n; i++) {
    const page = await pdfDoc.getPage(i);
    const tc = await page.getTextContent();
    if (assessTextContent(tc).isTextRich) return true;
  }
  return false;
}

export async function isPageTextRich(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const tc = await page.getTextContent();
  return assessTextContent(tc).isTextRich;
}

export function calcFitWidthScale(pdfDoc, pageNum, containerWidth, padding = 16) {
  return pdfDoc.getPage(pageNum).then((page) => {
    const base = page.getViewport({ scale: 1 });
    const available = Math.max(200, containerWidth - padding);
    return Math.max(0.5, Math.min(3, available / base.width));
  });
}
