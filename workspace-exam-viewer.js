/**
 * 시험지 단일 페이지 PDF 뷰어 (고해상도 렌더링)
 */
import * as pdfjsLib from "/node_modules/pdfjs-dist/build/pdf.mjs";
import { assessTextContent } from "./study-problem-range.js";
import { normalizePdfSearchText } from "./workspace-pdf-text.js";

export const MOBILE_BREAKPOINT = 900;

export function isDesktopSplit() {
  return window.innerWidth >= MOBILE_BREAKPOINT;
}

function getPixelRatio() {
  return Math.max(1, window.devicePixelRatio || 1);
}

async function renderOnePage(pdfDoc, pageNum, scale, highlightQuery, activePageMatchIndex = -1) {
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

  const textContent = await page.getTextContent({ disableNormalization: true });
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
    if (highlightQuery) highlightTextLayer(textLayerDiv, highlightQuery, activePageMatchIndex);
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

function highlightTextLayer(layer, query, activePageMatchIndex = -1) {
  if (!query || query.length < 1) return;

  const q = normalizePdfSearchText(query).toLowerCase();
  if (!q) return;

  const spans = [...layer.querySelectorAll("span")].filter((span) => span.textContent);
  if (!spans.length) return;

  const spanTexts = spans.map((span) => span.textContent || "");
  let normalizedFull = "";
  const charMap = [];

  spanTexts.forEach((text, spanIndex) => {
    for (let offsetInSpan = 0; offsetInSpan < text.length; offsetInSpan += 1) {
      const ch = text[offsetInSpan];
      if (/\s/.test(ch)) continue;
      charMap.push({ spanIndex, offsetInSpan });
      normalizedFull += ch.normalize("NFKC").toLowerCase();
    }
  });

  const matchStarts = [];
  let scanIdx = 0;
  while (scanIdx < normalizedFull.length) {
    const found = normalizedFull.indexOf(q, scanIdx);
    if (found === -1) break;
    matchStarts.push(found);
    scanIdx = found + q.length;
  }
  if (!matchStarts.length) return;

  const spanMatchMap = spans.map(() => new Map());
  matchStarts.forEach((start, matchIdx) => {
    for (let charIdx = start; charIdx < start + q.length && charIdx < charMap.length; charIdx += 1) {
      const { spanIndex, offsetInSpan } = charMap[charIdx];
      if (!spanMatchMap[spanIndex].has(offsetInSpan)) {
        spanMatchMap[spanIndex].set(offsetInSpan, matchIdx);
      }
    }
  });

  spans.forEach((span, spanIndex) => {
    const text = spanTexts[spanIndex];
    const matchedOffsets = spanMatchMap[spanIndex];
    if (!matchedOffsets.size) return;

    const fragment = document.createDocumentFragment();
    let i = 0;
    while (i < text.length) {
      if (matchedOffsets.has(i)) {
        const matchIdx = matchedOffsets.get(i);
        let j = i + 1;
        while (j < text.length && matchedOffsets.get(j) === matchIdx) j += 1;
        const mark = document.createElement("mark");
        mark.className = "exam-search-mark";
        if (matchIdx === activePageMatchIndex) mark.classList.add("is-active");
        mark.textContent = text.slice(i, j);
        fragment.appendChild(mark);
        i = j;
      } else {
        let j = i + 1;
        while (j < text.length && !matchedOffsets.has(j)) j += 1;
        fragment.appendChild(document.createTextNode(text.slice(i, j)));
        i = j;
      }
    }

    span.textContent = "";
    span.appendChild(fragment);
  });
}

export async function renderSinglePage(
  pdfDoc,
  pageNum,
  scale,
  containerEl,
  highlightQuery = "",
  activePageMatchIndex = -1
) {
  if (!pdfDoc || !containerEl) return { isTextRich: false, viewport: null };

  const { wrap, isTextRich, viewport } = await renderOnePage(
    pdfDoc,
    pageNum,
    scale,
    highlightQuery,
    activePageMatchIndex
  );

  containerEl.innerHTML = "";
  containerEl.append(wrap);
  return { isTextRich, viewport };
}

export async function detectPdfTextRich(pdfDoc, { samplePages = 3, includePages = [] } = {}) {
  if (!pdfDoc?.numPages) return false;

  const pagesToCheck = new Set();
  for (const raw of includePages || []) {
    const pageNum = Number(raw);
    if (Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= pdfDoc.numPages) {
      pagesToCheck.add(pageNum);
    }
  }
  for (let i = 1; i <= Math.min(samplePages, pdfDoc.numPages); i += 1) {
    pagesToCheck.add(i);
  }
  if (pdfDoc.numPages > 3) {
    pagesToCheck.add(Math.ceil(pdfDoc.numPages / 2));
    pagesToCheck.add(pdfDoc.numPages);
  }

  for (const pageNum of pagesToCheck) {
    const page = await pdfDoc.getPage(pageNum);
    const tc = await page.getTextContent({ disableNormalization: true });
    if (assessTextContent(tc).isTextRich) return true;
  }
  return false;
}

export async function isPageTextRich(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const tc = await page.getTextContent({ disableNormalization: true });
  return assessTextContent(tc).isTextRich;
}

export function calcFitWidthScale(pdfDoc, pageNum, containerWidth, padding = 16) {
  return pdfDoc.getPage(pageNum).then((page) => {
    const base = page.getViewport({ scale: 1 });
    const available = Math.max(200, containerWidth - padding);
    return Math.max(0.5, Math.min(3, available / base.width));
  });
}
