/**
 * CPA Study Annotator — PDF 시험지 주석 (문제 범위 · 텍스트/영역 선택)
 */
import * as pdfjsLib from "/node_modules/pdfjs-dist/build/pdf.mjs";
import {
  extractAllPageTexts,
  findProblemPageRange,
  assessTextContent,
} from "./study-problem-range.js";
import {
  normalizeFinancialParse,
  detectAvailableProcedures,
  runAnalyticalProcedures,
  renderAnalyticalResultsHtml,
} from "./study-financial-analytics.js";
import { createRegionBox } from "./study-region-box.js";
import { getPurposeLabel, renderPurposeResultHtml } from "./study-purpose-analysis.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.mjs";

const { TextLayer, setLayerDimensions, OutputScale } = pdfjsLib;

const STORAGE_KEY = "cpa-study-session";
const DB_NAME = "cpa-study-db";
const PDF_STORE = "pdfs";
const MAX_PDFS = 3;

const state = {
  pdfSlots: [],
  activeSlotIndex: 0,
  pdfDoc: null,
  pdfFingerprint: null,
  pdfName: "",
  scale: 1.2,
  rotation: 0,
  currentPage: 1,
  pageCount: 0,
  annotations: [],
  selectedColor: "yellow",
  selectionBundle: null,
  activeAnnotationId: null,
  problemRange: null,
  pageTexts: null,
  currentPageTextRich: false,
  interactionMode: "text",
  lastOutputScale: null,
  regionBox: null,
  financialParse: null,
  availableProcedures: [],
};

let renderToken = 0;
let pdfLoading = false;

const els = {
  pdfInput: document.getElementById("study-pdf-input"),
  pdfBtn: document.getElementById("study-pdf-btn"),
  pdfName: document.getElementById("study-pdf-name"),
  empty: document.getElementById("study-empty"),
  pages: document.getElementById("study-pages"),
  pdfScroll: document.getElementById("study-pdf-scroll"),
  panelList: document.getElementById("study-panel-list"),
  panelEmpty: document.getElementById("study-panel-empty"),
  prevBtn: document.getElementById("study-prev-page"),
  nextBtn: document.getElementById("study-next-page"),
  pageInput: document.getElementById("study-page-input"),
  pageTotal: document.getElementById("study-page-total"),
  pageRangeLabel: document.getElementById("study-page-range-label"),
  zoomIn: document.getElementById("study-zoom-in"),
  zoomOut: document.getElementById("study-zoom-out"),
  zoomLabel: document.getElementById("study-zoom-label"),
  zoomFit: document.getElementById("study-zoom-fit"),
  zoom100: document.getElementById("study-zoom-100"),
  questionDefault: document.getElementById("study-default-question"),
  floatMenu: document.getElementById("study-float-menu"),
  floatPreview: document.getElementById("study-float-preview"),
  floatBundle: document.getElementById("study-float-bundle"),
  status: document.getElementById("study-status"),
  yearInput: document.getElementById("study-year-input"),
  problemInput: document.getElementById("study-problem-input"),
  manualStart: document.getElementById("study-manual-start"),
  manualEnd: document.getElementById("study-manual-end"),
  loadProblemBtn: document.getElementById("study-load-problem-btn"),
  rotateLeft: document.getElementById("study-rotate-left"),
  rotateRight: document.getElementById("study-rotate-right"),
  modeText: document.getElementById("study-mode-text"),
  modeRegion: document.getElementById("study-mode-region"),
  scanNotice: document.getElementById("study-scan-notice"),
  problemError: document.getElementById("study-problem-error"),
  pdfTabs: document.getElementById("study-pdf-tabs"),
  floatProcedures: document.getElementById("study-float-procedures"),
  runProceduresBtn: document.querySelector('[data-action="run-procedures"]'),
  floatAsk: document.getElementById("study-float-ask"),
  askInput: document.getElementById("study-ask-input"),
  clearMemosBtn: document.getElementById("study-clear-memos-btn"),
};

function createPdfSlot(name, fingerprint) {
  return {
    id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    fingerprint,
    pdfDoc: null,
    pageCount: 0,
    currentPage: 1,
    scale: 1.2,
    rotation: 0,
    annotations: [],
    problemRange: null,
    pageTexts: null,
  };
}

function syncStateFromSlot() {
  const slot = state.pdfSlots[state.activeSlotIndex];
  if (!slot) {
    state.pdfDoc = null;
    state.pdfFingerprint = null;
    state.pdfName = "";
    state.pageCount = 0;
    state.annotations = [];
    state.problemRange = null;
    state.pageTexts = null;
    return;
  }
  state.pdfDoc = slot.pdfDoc;
  state.pdfFingerprint = slot.fingerprint;
  state.pdfName = slot.name;
  state.pageCount = slot.pageCount;
  state.currentPage = slot.currentPage;
  state.scale = slot.scale;
  state.rotation = slot.rotation;
  state.annotations = slot.annotations;
  state.problemRange = slot.problemRange;
  state.pageTexts = slot.pageTexts;
}

function syncStateToSlot() {
  const slot = state.pdfSlots[state.activeSlotIndex];
  if (!slot) return;
  slot.pdfDoc = state.pdfDoc;
  slot.pageCount = state.pageCount;
  slot.currentPage = state.currentPage;
  slot.scale = state.scale;
  slot.rotation = state.rotation;
  slot.annotations = state.annotations;
  slot.problemRange = state.problemRange;
  slot.pageTexts = state.pageTexts;
}

function clearStudyMemos() {
  const count = state.pdfSlots.reduce((sum, s) => sum + (s.annotations?.length || 0), 0) || state.annotations.length;
  if (!count) {
    showStatus("초기화할 학습 메모가 없습니다.", "info");
    return;
  }
  const ok = window.confirm(
    `저장된 학습 메모 ${count}건을 모두 삭제합니다.\nPDF 파일은 유지되며, 분석 메모만 초기화됩니다.\n계속하시겠습니까?`
  );
  if (!ok) return;

  state.annotations = [];
  state.activeAnnotationId = null;
  state.pdfSlots.forEach((slot) => {
    slot.annotations = [];
  });
  hideFloatMenu({ clearBundle: true });
  renderHighlightsOnCurrentPage();
  renderPanel();
  saveSession();
  showStatus("이전 학습 메모를 초기화했습니다.", "success");
}

function renderPdfTabs() {
  if (!els.pdfTabs) return;
  if (!state.pdfSlots.length) {
    els.pdfTabs.hidden = true;
    els.pdfTabs.innerHTML = "";
    return;
  }
  els.pdfTabs.hidden = false;
  els.pdfTabs.innerHTML = state.pdfSlots
    .map(
      (slot, i) =>
        `<button type="button" class="study-pdf-tab${i === state.activeSlotIndex ? " is-active" : ""}" data-pdf-tab="${i}" title="${escapeHtml(slot.name)}">${escapeHtml(slot.name.length > 18 ? slot.name.slice(0, 16) + "…" : slot.name)}</button>`
    )
    .join("");
  els.pdfTabs.querySelectorAll("[data-pdf-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchPdfTab(Number(btn.dataset.pdfTab)));
  });
  if (els.pdfName) {
    els.pdfName.textContent =
      state.pdfSlots.length > 1
        ? `${state.pdfName} (${state.activeSlotIndex + 1}/${state.pdfSlots.length})`
        : state.pdfName || "PDF 없음";
  }
}

async function switchPdfTab(index) {
  if (index === state.activeSlotIndex || index < 0 || index >= state.pdfSlots.length) return;
  syncStateToSlot();
  state.activeSlotIndex = index;
  syncStateFromSlot();
  hideFloatMenu({ clearBundle: true });
  renderPdfTabs();
  if (state.pdfDoc) await renderCurrentPage();
  else {
    if (els.pages) els.pages.hidden = true;
    if (els.empty) els.empty.hidden = false;
  }
  renderPanel();
  updatePageInfo();
  saveSession();
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showStatus(msg, type = "info") {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.className = `case-status case-status-${type}`;
}

function pdfFingerprint(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(PDF_STORE)) db.deleteObjectStore(PDF_STORE);
      db.createObjectStore(PDF_STORE, { keyPath: "fingerprint" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePdfToDb(fingerprint, arrayBuffer, meta) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).put({ fingerprint, buffer: arrayBuffer, name: meta.name, savedAt: meta.savedAt });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadPdfFromDb(fingerprint) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const req = tx.objectStore(PDF_STORE).get(fingerprint);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function getRangeBounds() {
  if (!state.problemRange) return { min: 1, max: state.pageCount || 1 };
  return { min: state.problemRange.startPage, max: state.problemRange.endPage };
}

function clampToRange(pageNum) {
  const { min, max } = getRangeBounds();
  return Math.max(min, Math.min(max, Number(pageNum) || min));
}

function relativePageIndex() {
  if (!state.problemRange) return state.currentPage;
  return state.currentPage - state.problemRange.startPage + 1;
}

function relativePageTotal() {
  if (!state.problemRange) return state.pageCount;
  return state.problemRange.endPage - state.problemRange.startPage + 1;
}

function saveSession() {
  syncStateToSlot();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      pdfSlots: state.pdfSlots.map((s) => ({
        id: s.id,
        name: s.name,
        fingerprint: s.fingerprint,
        currentPage: s.currentPage,
        scale: s.scale,
        rotation: s.rotation,
        annotations: s.annotations,
        problemRange: s.problemRange,
      })),
      activeSlotIndex: state.activeSlotIndex,
      defaultQuestion: els.questionDefault?.value || "",
      interactionMode: state.interactionMode,
      year: els.yearInput?.value || "",
      problemNumber: els.problemInput?.value || "",
    })
  );
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function createId() {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getPageContainer() {
  return document.querySelector(".pdf-page-container");
}

function getPageText() {
  const layer = getPageContainer()?.querySelector(".textLayer");
  return layer?.textContent || "";
}

function applyPageContainerScale(container, viewport) {
  container.style.setProperty("--total-scale-factor", String(viewport.scale));
  container.style.setProperty("--scale-round-x", "1px");
  container.style.setProperty("--scale-round-y", "1px");
  setLayerDimensions(container, viewport);
}

function rectsFromRange(range, pageContainer) {
  const box = pageContainer.getBoundingClientRect();
  const rects = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    rects.push({
      left: (r.left - box.left) / box.width,
      top: (r.top - box.top) / box.height,
      width: r.width / box.width,
      height: r.height / box.height,
    });
  }
  return rects;
}

function getContextAround(selectedText) {
  const full = getPageText();
  const idx = full.indexOf(selectedText);
  if (idx === -1) return { before: "", after: "" };
  return {
    before: full.slice(Math.max(0, idx - 180), idx).trim(),
    after: full.slice(idx + selectedText.length, idx + selectedText.length + 180).trim(),
  };
}

function ensureSelectionBundle() {
  if (!state.selectionBundle) {
    state.selectionBundle = { selectionGroupId: createId(), items: [] };
  }
  return state.selectionBundle;
}

function clearSelectionBundle() {
  state.selectionBundle = null;
  state.financialParse = null;
  state.availableProcedures = [];
  state.regionBox?.clear();
}

function getBundleItems() {
  return state.selectionBundle?.items || [];
}

function hasActiveSelection() {
  return getBundleItems().length > 0;
}

function upsertSelectionItem(itemData, isNewSelection) {
  const bundle = ensureSelectionBundle();
  const item = {
    id: createId(),
    sourceType: itemData.sourceType || "text",
    pageNumber: itemData.pageNumber,
    selectedText: itemData.selectedText || "",
    contextBefore: itemData.contextBefore || "",
    contextAfter: itemData.contextAfter || "",
    previewDataUrl: itemData.previewDataUrl || null,
    imageDataUrl: itemData.imageDataUrl || itemData.previewDataUrl || "",
    rects: itemData.rects || [],
  };

  const last = bundle.items[bundle.items.length - 1];
  if (
    !isNewSelection &&
    item.sourceType === "region" &&
    last?.sourceType === "region" &&
    last.pageNumber === item.pageNumber
  ) {
    bundle.items[bundle.items.length - 1] = { ...item, id: last.id };
    return bundle.items[bundle.items.length - 1];
  }

  bundle.items.push(item);
  return item;
}

function removeBundleItem(itemId) {
  if (!state.selectionBundle) return;
  state.selectionBundle.items = state.selectionBundle.items.filter((i) => i.id !== itemId);
  if (!state.selectionBundle.items.length) clearSelectionBundle();
}

function renderBundleInfo() {
  if (!els.floatBundle) return;
  const items = getBundleItems();
  if (!items.length) {
    els.floatBundle.hidden = true;
    els.floatBundle.innerHTML = "";
    return;
  }

  els.floatBundle.hidden = false;
  const pages = [...new Set(items.map((i) => i.pageNumber))].sort((a, b) => a - b);
  els.floatBundle.innerHTML = `
    <p><strong>선택 ${items.length}개</strong> · p.${pages.join(", p.")}</p>
    <ul class="study-float-bundle-list">
      ${items
        .map((item, idx) => {
          const label =
            item.sourceType === "text"
              ? `텍스트: ${escapeHtml(item.selectedText.slice(0, 28))}${item.selectedText.length > 28 ? "…" : ""}`
              : `영역 (p.${item.pageNumber})`;
          return `<li>${idx + 1}. ${label}</li>`;
        })
        .join("")}
    </ul>`;
}

function renderBundlePreview(lastItem) {
  if (!els.floatPreview) return;
  if (lastItem?.previewDataUrl) {
    els.floatPreview.hidden = false;
    els.floatPreview.innerHTML = `<img src="${lastItem.previewDataUrl}" alt="선택 영역 미리보기" />`;
  } else if (lastItem?.sourceType === "text" && lastItem.selectedText) {
    els.floatPreview.hidden = false;
    els.floatPreview.innerHTML = `<p class="study-float-text-preview">${escapeHtml(lastItem.selectedText.slice(0, 120))}${lastItem.selectedText.length > 120 ? "…" : ""}</p>`;
  } else {
    els.floatPreview.hidden = true;
    els.floatPreview.innerHTML = "";
  }
}

function refreshFloatMenuUI(clientX = 120, clientY = 120) {
  if (!els.floatMenu || !hasActiveSelection()) {
    hideFloatMenu();
    return;
  }

  const items = getBundleItems();
  const lastItem = items[items.length - 1];

  els.floatMenu.hidden = false;
  els.floatMenu.style.left = `${Math.min(Math.max(8, clientX), window.innerWidth - 320)}px`;
  els.floatMenu.style.top = `${Math.min(Math.max(8, clientY + 8), window.innerHeight - 360)}px`;
  els.floatMenu.querySelectorAll(".study-color-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.color === state.selectedColor);
  });

  if (els.floatAsk) els.floatAsk.hidden = true;
  renderBundleInfo();
  renderBundlePreview(lastItem);
  renderHighlightsOnCurrentPage();

  if (lastItem?.sourceType === "region") {
    detectFinancialFromRegion(lastItem);
  } else {
    if (els.floatProcedures) {
      els.floatProcedures.hidden = true;
      els.floatProcedures.innerHTML = "";
    }
    if (els.runProceduresBtn) els.runProceduresBtn.hidden = true;
    state.financialParse = null;
    state.availableProcedures = [];
  }
}

function hideFloatMenu({ clearBundle = false } = {}) {
  if (els.floatMenu) els.floatMenu.hidden = true;
  if (els.floatPreview) {
    els.floatPreview.hidden = true;
    els.floatPreview.innerHTML = "";
  }
  if (els.floatBundle) {
    els.floatBundle.hidden = true;
    els.floatBundle.innerHTML = "";
  }
  if (els.floatProcedures) {
    els.floatProcedures.hidden = true;
    els.floatProcedures.innerHTML = "";
  }
  if (els.floatAsk) els.floatAsk.hidden = true;
  if (els.askInput) els.askInput.value = "";
  if (els.runProceduresBtn) els.runProceduresBtn.hidden = true;
  if (clearBundle) {
    clearSelectionBundle();
    renderHighlightsOnCurrentPage();
  }
}

function renderProcedureList(procedures, selectedIds) {
  if (!els.floatProcedures || !procedures.length) return;
  els.floatProcedures.hidden = false;
  els.floatProcedures.innerHTML = `
    <p class="study-float-proc-title">수행 가능한 분석적절차</p>
    <ul class="study-float-proc-list">${procedures
      .map(
        (p) =>
          `<li><label><input type="checkbox" class="study-proc-check" data-proc-id="${p.id}" ${selectedIds.includes(p.id) ? "checked" : ""} /> ${escapeHtml(p.label)}</label></li>`
      )
      .join("")}</ul>`;
  if (els.runProceduresBtn) els.runProceduresBtn.hidden = false;
}

async function detectFinancialFromRegion(selectionData) {
  try {
    const res = await fetch("/api/parse-financial-region", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: selectionData.imageDataUrl }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    const parsed = normalizeFinancialParse(data);
    if (!parsed.isFinancialStatement) return null;
    state.financialParse = parsed;
    const { procedures } = detectAvailableProcedures(parsed);
    state.availableProcedures = procedures;
    renderProcedureList(procedures, procedures.map((p) => p.id));
    return parsed;
  } catch {
    return null;
  }
}

function showFloatMenu(selectionData, clientX, clientY, isNewSelection = true) {
  upsertSelectionItem(selectionData, isNewSelection);
  refreshFloatMenuUI(clientX, clientY);
}

function captureSelection() {
  if (state.interactionMode !== "text" || !state.currentPageTextRich) return null;

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

  const text = sel.toString().trim();
  if (!text) return null;

  const range = sel.getRangeAt(0);
  let node = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

  const pageContainer = node?.closest?.(".pdf-page-container");
  if (!pageContainer) return null;

  const rects = rectsFromRange(range, pageContainer);
  if (!rects.length) return null;

  const ctx = getContextAround(text);
  const rect = range.getBoundingClientRect();

  return {
    sourceType: "text",
    pageNumber: state.currentPage,
    selectedText: text,
    contextBefore: ctx.before,
    contextAfter: ctx.after,
    rects,
    clientX: rect.right,
    clientY: rect.bottom,
  };
}

function handleTextSelectionEnd() {
  if (state.interactionMode !== "text") return;
  setTimeout(() => {
    const captured = captureSelection();
    if (captured?.selectedText) {
      showFloatMenu(captured, captured.clientX, captured.clientY, true);
    }
  }, 10);
}

function cropCanvasRegion(canvas, rect, outputScale) {
  const sx = outputScale?.sx || 1;
  const sy = outputScale?.sy || 1;
  const srcX = Math.max(0, Math.floor(rect.left * sx));
  const srcY = Math.max(0, Math.floor(rect.top * sy));
  const srcW = Math.max(1, Math.floor(rect.width * sx));
  const srcH = Math.max(1, Math.floor(rect.height * sy));

  const crop = document.createElement("canvas");
  crop.width = srcW;
  crop.height = srcH;
  const cctx = crop.getContext("2d");
  cctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  return crop.toDataURL("image/png");
}

function updateModeUi() {
  const textMode = state.interactionMode === "text";
  els.modeText?.classList.toggle("is-active", textMode);
  els.modeRegion?.classList.toggle("is-active", !textMode);

  const container = getPageContainer();
  if (container) {
    container.classList.toggle("is-text-mode", textMode && state.currentPageTextRich);
    container.classList.toggle("is-region-mode", !textMode || !state.currentPageTextRich);
  }

  if (els.scanNotice) {
    els.scanNotice.hidden = state.currentPageTextRich;
  }

  if (!state.currentPageTextRich && state.interactionMode === "text") {
    setInteractionMode("region");
  }
}

function setInteractionMode(mode) {
  if (mode === "text" && !state.currentPageTextRich) {
    showStatus("이 페이지는 텍스트 데이터가 없어 영역 선택 모드를 사용하세요.", "warning");
    mode = "region";
  }
  state.interactionMode = mode;
  window.getSelection()?.removeAllRanges();
  updateModeUi();
  saveSession();
}

function bindRegionOverlay(overlay, container, canvas) {
  state.regionBox = createRegionBox(overlay, container, canvas, state.lastOutputScale, (data) => {
    if (!data) return;
    showFloatMenu(
      {
        sourceType: "region",
        pageNumber: state.currentPage,
        selectedText: "",
        previewDataUrl: data.previewDataUrl,
        imageDataUrl: data.previewDataUrl,
        rects: data.relRects,
      },
      data.clientX || 100,
      data.clientY || 100,
      data.isNewSelection !== false
    );
  });
}

async function renderCurrentPage() {
  if (!state.pdfDoc || !els.pages) return;

  const token = ++renderToken;
  const pageNum = state.currentPage;

  els.pages.hidden = false;
  if (els.empty) els.empty.hidden = true;
  els.pages.innerHTML = `<p class="study-page-loading">페이지 렌더링 중…</p>`;

  const page = await state.pdfDoc.getPage(pageNum);
  if (token !== renderToken) return;

  const viewport = page.getViewport({ scale: state.scale, rotation: state.rotation });
  const outputScale = new OutputScale();
  state.lastOutputScale = outputScale;

  const container = document.createElement("div");
  container.className = "pdf-page-container";
  container.dataset.page = String(pageNum);
  applyPageContainerScale(container, viewport);

  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";
  const ctx = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width * outputScale.sx);
  canvas.height = Math.floor(viewport.height * outputScale.sy);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  await page.render({
    canvasContext: ctx,
    viewport,
    transform: outputScale.scaled ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0] : null,
  }).promise;

  if (token !== renderToken) return;

  const textContent = await page.getTextContent();
  const textAssess = assessTextContent(textContent);
  state.currentPageTextRich = textAssess.isTextRich;

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer";

  if (textAssess.isTextRich) {
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    });
    await textLayer.render();
  }

  if (token !== renderToken) return;

  const annotationLayer = document.createElement("div");
  annotationLayer.className = "annotation-layer";

  const regionOverlay = document.createElement("div");
  regionOverlay.className = "region-overlay";
  bindRegionOverlay(regionOverlay, container, canvas);

  container.append(canvas, textLayerDiv, annotationLayer, regionOverlay);
  els.pages.innerHTML = "";
  els.pages.append(container);

  updateModeUi();
  renderHighlightsOnCurrentPage();
  updatePageInfo();
  saveSession();
}

function renderHighlightsOnCurrentPage() {
  const container = getPageContainer();
  if (!container) return;
  const layer = container.querySelector(".annotation-layer");
  if (!layer) return;

  layer.innerHTML = "";
  const anns = state.annotations.filter((a) => a.pageNumber === state.currentPage);
  const pendingItems = getBundleItems().filter((item) => item.pageNumber === state.currentPage);

  pendingItems.forEach((item) => {
    item.rects.forEach((r) => {
      const el = document.createElement("div");
      el.className = "study-pending-highlight";
      el.style.left = `${r.left * 100}%`;
      el.style.top = `${r.top * 100}%`;
      el.style.width = `${r.width * 100}%`;
      el.style.height = `${r.height * 100}%`;
      layer.append(el);
    });
  });

  anns.forEach((ann) => {
    let minTop = 1;
    let maxRight = 0;
    const rectsToRender = ann.selectionItems?.length
      ? ann.selectionItems
          .filter((item) => item.pageNumber === state.currentPage)
          .flatMap((item) => item.rects || [])
      : ann.rects || [];

    rectsToRender.forEach((r) => {
      const el = document.createElement("div");
      el.className = `study-highlight ${ann.highlightColor || "yellow"}`;
      el.style.left = `${r.left * 100}%`;
      el.style.top = `${r.top * 100}%`;
      el.style.width = `${r.width * 100}%`;
      el.style.height = `${r.height * 100}%`;
      el.dataset.annId = ann.id;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        focusAnnotation(ann.id);
      });
      layer.append(el);
      minTop = Math.min(minTop, r.top);
      maxRight = Math.max(maxRight, r.left + r.width);
    });

    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = `study-memo-pin${ann.important ? " is-important" : ""}`;
    pin.textContent = "📝";
    pin.title = "메모 보기";
    pin.style.left = `${Math.min(maxRight * 100, 96)}%`;
    pin.style.top = `${Math.max(minTop * 100 - 2, 0)}%`;
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      focusAnnotation(ann.id);
    });
    layer.append(pin);
  });
}

function renderPanel() {
  if (!els.panelList) return;

  if (!state.annotations.length) {
    els.panelList.innerHTML = "";
    if (els.panelEmpty) els.panelEmpty.hidden = false;
    return;
  }

  if (els.panelEmpty) els.panelEmpty.hidden = true;

  const sorted = [...state.annotations].sort(
    (a, b) => a.pageNumber - b.pageNumber || new Date(a.createdAt) - new Date(b.createdAt)
  );

  els.panelList.innerHTML = sorted
    .map((ann) => {
      const collapsed = ann.collapsed;

      const title =
        ann.analysisType === "financial"
          ? ann.analysis?.statementTitle || "재무제표 분석"
          : ann.analysisType === "purpose"
            ? ann.purposeLabel || getPurposeLabel(ann.purpose)
            : ann.sourceType === "multi"
              ? `다중 선택 (${ann.selectionItems?.length || 2}개)`
              : ann.sourceType === "text"
                ? ann.selectedText.slice(0, 50)
                : "영역 선택";

      const analyticalHtml =
        ann.analysisType === "financial" && ann.analysis?.analytical
          ? renderAnalyticalResultsHtml(ann.analysis.analytical)
          : "";

      const purposeHtml =
        ann.analysisType === "purpose" && ann.result
          ? renderPurposeResultHtml(ann.purpose, ann.result)
          : "";

      const groupCount = ann.selectionGroupId
        ? state.annotations.filter((a) => a.selectionGroupId === ann.selectionGroupId).length
        : 0;

      return `<article class="study-memo-card${ann.important ? " is-important" : ""}${
        state.activeAnnotationId === ann.id ? " is-active" : ""
      }" data-ann-id="${ann.id}">
        <div class="study-memo-card-head" data-toggle-ann="${ann.id}">
          <h3>${escapeHtml(title)}${title.length > 50 ? "…" : ""}</h3>
          <span class="study-memo-card-meta">p.${ann.pageNumber}${ann.sourceType === "region" ? " · 영역" : ""}${ann.sourceType === "multi" ? ` · ${ann.selectionItems?.length || 2}개 선택` : ""}${ann.analysisType === "financial" ? " · 분석적절차" : ""}${ann.analysisType === "purpose" ? ` · ${escapeHtml(ann.purposeLabel || "")}` : ""}${groupCount > 1 ? ` · 동일선택 ${groupCount}건` : ""}</span>
        </div>
        <div class="study-memo-card-body" ${collapsed ? "hidden" : ""}>
          ${
            ann.previewDataUrl
              ? `<div class="study-memo-field"><h4>선택 영역</h4><img class="study-region-thumb" src="${ann.previewDataUrl}" alt="선택 영역" /></div>`
              : ""
          }
          ${
            ann.sourceType === "text" && ann.selectedText
              ? `<div class="study-memo-field"><h4>선택 원문</h4><p class="study-memo-quote">${escapeHtml(ann.selectedText)}</p></div>`
              : ""
          }
          ${
            ann.userQuestion
              ? `<div class="study-memo-field"><h4>질문</h4><p class="study-memo-quote">${escapeHtml(ann.userQuestion)}</p></div>`
              : ""
          }
          ${analyticalHtml ? `<div class="study-memo-field study-analytical-results"><h4>분석적절차 결과</h4>${analyticalHtml}</div>` : ""}
          ${
            ann.analysis?.identifiedAccounts?.length
              ? `<div class="study-memo-field"><h4>식별 계정</h4><p>${escapeHtml(ann.analysis.identifiedAccounts.join(", "))}</p></div>`
              : ""
          }
          ${purposeHtml ? `<div class="study-memo-field study-purpose-results">${purposeHtml}</div>` : ""}
          <div class="study-memo-field">
            <h4>연결 물음</h4>
            <input type="text" class="study-question-input" data-question-ann="${ann.id}" value="${escapeHtml(
        ann.questionNumber || ""
      )}" placeholder="번호" inputmode="numeric" />
          </div>
          <div class="study-memo-field">
            <h4>사용자 메모</h4>
            <textarea class="study-memo-user-input" data-user-memo-ann="${ann.id}" rows="2">${escapeHtml(
        ann.userMemo || ""
      )}</textarea>
          </div>
          <div class="study-memo-actions">
            <button type="button" data-action="toggle-important" data-ann-id="${ann.id}">${
        ann.important ? "중요 해제" : "중요 표시"
      }</button>
            <button type="button" data-action="toggle-collapse" data-ann-id="${ann.id}">${
        collapsed ? "펼치기" : "접기"
      }</button>
            <button type="button" data-action="delete-ann" data-ann-id="${ann.id}">삭제</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

async function goToPage(pageNum) {
  const n = clampToRange(pageNum);
  if (!state.pdfDoc) return;
  const menuRect = els.floatMenu?.hidden ? null : els.floatMenu?.getBoundingClientRect();
  state.currentPage = n;
  syncStateToSlot();
  window.getSelection()?.removeAllRanges();
  await renderCurrentPage();
  if (hasActiveSelection()) {
    refreshFloatMenuUI(menuRect?.left ?? 120, (menuRect?.top ?? 100) - 8);
  }
}

async function changeScale(newScale) {
  const menuRect = els.floatMenu?.hidden ? null : els.floatMenu?.getBoundingClientRect();
  state.scale = Math.max(0.5, Math.min(3, Math.round(newScale * 10) / 10));
  await renderCurrentPage();
  if (hasActiveSelection()) {
    refreshFloatMenuUI(menuRect?.left ?? 120, (menuRect?.top ?? 100) - 8);
  }
}

async function fitWidth() {
  if (!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(state.currentPage);
  const base = page.getViewport({ scale: 1, rotation: state.rotation });
  const available = (els.pdfScroll?.clientWidth || 800) - 32;
  state.scale = Math.max(0.5, Math.min(3, available / base.width));
  await renderCurrentPage();
}

async function zoom100() {
  state.scale = 1;
  await renderCurrentPage();
}

async function rotatePage(delta) {
  const menuRect = els.floatMenu?.hidden ? null : els.floatMenu?.getBoundingClientRect();
  state.rotation = (state.rotation + delta + 360) % 360;
  await renderCurrentPage();
  if (hasActiveSelection()) {
    refreshFloatMenuUI(menuRect?.left ?? 120, (menuRect?.top ?? 100) - 8);
  }
}

function focusAnnotation(annId) {
  state.activeAnnotationId = annId;
  const ann = state.annotations.find((a) => a.id === annId);
  if (ann) {
    if (ann.collapsed) ann.collapsed = false;
    if (ann.pageNumber !== state.currentPage) {
      goToPage(ann.pageNumber).then(() => {
        renderPanel();
        els.panelList?.querySelector(`[data-ann-id="${annId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return;
    }
  }
  renderPanel();
  els.panelList?.querySelector(`[data-ann-id="${annId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function analyzePurpose(bundle, purpose, userQuestion = "") {
  const label = getPurposeLabel(purpose);
  showStatus(`${label} 생성 중…`, "loading");
  const items = bundle.items || [];
  const res = await fetch("/api/analyze-purpose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose,
      selections: items.map((item) => ({
        pageNumber: item.pageNumber,
        selectedText: item.selectedText || "",
        imageDataUrl: item.imageDataUrl || item.previewDataUrl || "",
        contextBefore: item.contextBefore || "",
        contextAfter: item.contextAfter || "",
      })),
      questionNumber: els.questionDefault?.value?.trim() || "",
      userQuestion,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "분석 실패");
  return data;
}

async function addPurposeAnnotation(bundle, purpose, result, userQuestion = "") {
  const items = bundle.items || [];
  const primary = items[0];
  const textItems = items.filter((i) => i.sourceType === "text");
  const ann = {
    id: createId(),
    sourceType: items.length > 1 ? "multi" : primary?.sourceType || "text",
    analysisType: "purpose",
    purpose,
    purposeLabel: getPurposeLabel(purpose),
    selectionGroupId: bundle.selectionGroupId,
    pageNumber: primary?.pageNumber || state.currentPage,
    selectionItems: items.map((item) => ({
      sourceType: item.sourceType,
      pageNumber: item.pageNumber,
      selectedText: item.selectedText || "",
      previewDataUrl: item.previewDataUrl || null,
      rects: item.rects || [],
    })),
    selectedText: textItems.map((i) => i.selectedText).join("\n---\n"),
    contextBefore: primary?.contextBefore || "",
    contextAfter: primary?.contextAfter || "",
    highlightColor: state.selectedColor,
    rects: items.filter((i) => i.pageNumber === (primary?.pageNumber || state.currentPage)).flatMap((i) => i.rects),
    previewDataUrl: items.find((i) => i.previewDataUrl)?.previewDataUrl || null,
    userQuestion: purpose === "customAsk" ? userQuestion : "",
    questionNumber: els.questionDefault?.value?.trim() || "",
    important: false,
    collapsed: false,
    userMemo: "",
    result,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.annotations.push(ann);
  state.activeAnnotationId = ann.id;
  renderHighlightsOnCurrentPage();
  renderPanel();
  saveSession();
  return ann;
}

async function handlePurposeClick(purpose) {
  if (!hasActiveSelection()) {
    showStatus("분석할 영역을 먼저 선택해주세요.", "warning");
    return;
  }

  if (purpose === "customAsk") {
    if (els.floatAsk) els.floatAsk.hidden = false;
    els.askInput?.focus();
    return;
  }

  const bundle = state.selectionBundle;
  try {
    const result = await analyzePurpose(bundle, purpose);
    await addPurposeAnnotation(bundle, purpose, result);
    showStatus(`${getPurposeLabel(purpose)} 결과가 저장되었습니다.`, "success");
  } catch (err) {
    showStatus(err.message || "분석 실패", "error");
  }
}

async function handleSubmitAsk() {
  if (!hasActiveSelection()) {
    showStatus("분석할 영역을 먼저 선택해주세요.", "warning");
    return;
  }
  const question = els.askInput?.value?.trim();
  if (!question) {
    showStatus("질문을 입력해주세요.", "warning");
    return;
  }
  const bundle = state.selectionBundle;
  try {
    const result = await analyzePurpose(bundle, "customAsk", question);
    await addPurposeAnnotation(bundle, "customAsk", result, question);
    if (els.askInput) els.askInput.value = "";
    if (els.floatAsk) els.floatAsk.hidden = true;
    showStatus("질문에 대한 답변이 저장되었습니다.", "success");
  } catch (err) {
    showStatus(err.message || "질문 처리 실패", "error");
  }
}

async function addAnnotation(bundleOrItem, analysis, userMemo = "", extra = {}) {
  const items = bundleOrItem?.items || [bundleOrItem];
  const primary = items[0];
  const ann = {
    id: createId(),
    sourceType: items.length > 1 ? "multi" : primary?.sourceType || "text",
    analysisType: extra.analysisType || "memo",
    selectionGroupId: bundleOrItem?.selectionGroupId || ensureSelectionBundle().selectionGroupId,
    pageNumber: primary?.pageNumber || state.currentPage,
    selectionItems: items.map((item) => ({
      sourceType: item.sourceType,
      pageNumber: item.pageNumber,
      selectedText: item.selectedText || "",
      previewDataUrl: item.previewDataUrl || null,
      rects: item.rects || [],
    })),
    selectedText: primary?.sourceType === "text" ? primary.selectedText : "",
    contextBefore: primary?.contextBefore || "",
    contextAfter: primary?.contextAfter || "",
    highlightColor: state.selectedColor,
    rects: primary?.rects || [],
    previewDataUrl: primary?.previewDataUrl || null,
    questionNumber: els.questionDefault?.value?.trim() || "",
    important: false,
    collapsed: false,
    userMemo,
    analysis: analysis || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.annotations.push(ann);
  state.activeAnnotationId = ann.id;
  renderHighlightsOnCurrentPage();
  renderPanel();
  saveSession();
  return ann;
}

function getSelectedProcedureIds() {
  return [...(els.floatProcedures?.querySelectorAll(".study-proc-check:checked") || [])].map(
    (el) => el.dataset.procId
  );
}

async function runFinancialAnalysis(selectionData) {
  showStatus("재무제표 인식 및 분석적절차 실행 중…", "loading");
  let parsed = state.financialParse;
  if (!parsed) {
    const res = await fetch("/api/parse-financial-region", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: selectionData.imageDataUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "재무제표 파싱 실패");
    parsed = normalizeFinancialParse(data);
  }
  if (!parsed.isFinancialStatement) throw new Error("재무제표로 인식되지 않았습니다.");

  const selectedIds = getSelectedProcedureIds();
  const { procedures } = detectAvailableProcedures(parsed);
  const ids = selectedIds.length ? selectedIds : procedures.map((p) => p.id);
  const analytical = runAnalyticalProcedures(parsed, ids);

  return {
    statementTitle: parsed.statementTitle || (parsed.statementType === "income_statement" ? "포괄손익계산서" : "재무상태표"),
    statementType: parsed.statementType,
    identifiedAccounts: analytical.identifiedAccounts,
    availableProcedures: procedures.map((p) => p.label),
    analytical,
  };
}

async function handleRunProceduresClick() {
  if (!hasActiveSelection()) return;
  const regionItem = [...getBundleItems()].reverse().find((i) => i.sourceType === "region");
  if (!regionItem) {
    showStatus("재무제표 영역을 선택해주세요.", "warning");
    return;
  }
  try {
    const finAnalysis = await runFinancialAnalysis(regionItem);
    await addAnnotation(state.selectionBundle, finAnalysis, "", { analysisType: "financial" });
    showStatus("분석적절차 결과가 추가되었습니다.", "success");
  } catch (err) {
    showStatus(err.message || "분석 실패", "error");
  }
}

async function handleMemoOnlyClick() {
  if (!hasActiveSelection()) return;
  const memo = window.prompt("사용자 메모 (비워도 저장됩니다)", "");
  if (memo === null) return;
  await addAnnotation(state.selectionBundle, null, memo, { analysisType: "memo" });
  showStatus("메모가 추가되었습니다.", "success");
}

function handleClearSelection() {
  hideFloatMenu({ clearBundle: true });
  showStatus("선택을 초기화했습니다.", "success");
}

function showProblemError(msg) {
  if (els.problemError) {
    els.problemError.hidden = false;
    els.problemError.textContent = msg;
  }
}

function hideProblemError() {
  if (els.problemError) {
    els.problemError.hidden = true;
    els.problemError.textContent = "";
  }
}

function applyProblemRange(range) {
  state.problemRange = range;
  state.currentPage = range.startPage;
  syncStateToSlot();
  hideProblemError();
  if (els.manualStart) els.manualStart.value = String(range.startPage);
  if (els.manualEnd) els.manualEnd.value = String(range.endPage);
  updatePageInfo();
}

async function loadProblemRange() {
  if (!state.pdfDoc) {
    showStatus("PDF를 먼저 업로드하세요.", "warning");
    return;
  }

  const problemNumber = els.problemInput?.value?.trim();
  const manualStart = parseInt(els.manualStart?.value, 10);
  const manualEnd = parseInt(els.manualEnd?.value, 10);

  showStatus("문제 범위 탐색 중…", "loading");
  hideProblemError();

  try {
    if (!state.pageTexts) {
      state.pageTexts = await extractAllPageTexts(state.pdfDoc);
    }

    let range = null;

    if (problemNumber) {
      const found = findProblemPageRange(state.pageTexts, problemNumber);
      if (found.ok) {
        range = {
          year: els.yearInput?.value?.trim() || "",
          problemNumber: found.problemNumber,
          startPage: found.startPage,
          endPage: found.endPage,
          questionNumbers: found.questionNumbers,
          autoDetected: true,
        };
      }
    }

    if (!range && manualStart >= 1 && manualEnd >= manualStart && manualEnd <= state.pageCount) {
      range = {
        year: els.yearInput?.value?.trim() || "",
        problemNumber: problemNumber || "",
        startPage: manualStart,
        endPage: manualEnd,
        questionNumbers: [],
        autoDetected: false,
      };
    }

    if (!range) {
      showProblemError(
        "문제 범위를 자동으로 찾지 못했습니다. 시작 페이지와 종료 페이지를 직접 지정해주세요."
      );
      showStatus("문제 범위를 찾지 못했습니다.", "error");
      return;
    }

    applyProblemRange(range);
    await goToPage(range.startPage);

    const qInfo = range.questionNumbers?.length
      ? ` · 물음 ${range.questionNumbers.join(", ")}`
      : "";
    showStatus(
      `문제 ${range.problemNumber || "(수동)"} — p.${range.startPage}~${range.endPage}${qInfo}`,
      "success"
    );
  } catch (err) {
    showStatus(err.message || "문제 범위 탐색 실패", "error");
  }
}

async function loadPdfIntoSlot(slot, arrayBuffer) {
  slot.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  slot.pageCount = slot.pdfDoc.numPages;
  slot.pageTexts = null;
}

async function loadPdfFromArrayBuffer(arrayBuffer, name, fingerprint) {
  let slot = state.pdfSlots.find((s) => s.fingerprint === fingerprint);
  if (!slot) {
    slot = createPdfSlot(name, fingerprint);
    state.pdfSlots.push(slot);
    if (state.pdfSlots.length > MAX_PDFS) {
      state.pdfSlots.shift();
      if (state.activeSlotIndex > 0) state.activeSlotIndex -= 1;
    }
  }
  await loadPdfIntoSlot(slot, arrayBuffer);
  slot.name = name;
  state.activeSlotIndex = state.pdfSlots.indexOf(slot);
  syncStateFromSlot();
  state.currentPage = clampToRange(state.currentPage || 1);
  renderPdfTabs();
  await renderCurrentPage();
}

async function handlePdfFiles(fileList) {
  if (!fileList?.length || pdfLoading) return;
  pdfLoading = true;
  try {
    const files = [...fileList].slice(0, MAX_PDFS);
    for (const file of files) {
      const fp = pdfFingerprint(file);
      const buffer = await file.arrayBuffer();
      try {
        await savePdfToDb(fp, buffer, { name: file.name, savedAt: Date.now() });
      } catch (err) {
        console.warn("PDF IndexedDB 저장 실패:", err);
      }
      let slot = state.pdfSlots.find((s) => s.fingerprint === fp);
      if (!slot) {
        if (state.pdfSlots.length >= MAX_PDFS) {
          showStatus(`PDF는 최대 ${MAX_PDFS}개까지 업로드할 수 있습니다.`, "warning");
          break;
        }
        slot = createPdfSlot(file.name, fp);
        state.pdfSlots.push(slot);
      }
      await loadPdfIntoSlot(slot, buffer);
      slot.name = file.name;
      slot.annotations = slot.annotations || [];
      state.activeSlotIndex = state.pdfSlots.indexOf(slot);
    }
    syncStateFromSlot();
    hideProblemError();
    renderPdfTabs();
    await renderCurrentPage();
    showStatus(
      `PDF ${state.pdfSlots.length}개 로드 — 탭으로 전환하세요. 연도·문제번호 입력 후 「문제 불러오기」`,
      "success"
    );
  } finally {
    pdfLoading = false;
  }
}

function updatePageInfo() {
  const rel = relativePageIndex();
  const relTotal = relativePageTotal();
  const { min, max } = getRangeBounds();

  if (els.pageInput) els.pageInput.value = String(rel);
  if (els.pageTotal) els.pageTotal.textContent = relTotal ? String(relTotal) : "—";
  if (els.pageRangeLabel) {
    els.pageRangeLabel.textContent = state.problemRange
      ? `(PDF p.${state.currentPage} · 범위 ${min}~${max})`
      : "";
  }
  if (els.prevBtn) els.prevBtn.disabled = state.currentPage <= min;
  if (els.nextBtn) els.nextBtn.disabled = state.currentPage >= max;
  if (els.zoomLabel) els.zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
}

async function restoreSession() {
  const session = loadSession();
  if (!session?.pdfSlots?.length) {
    if (session?.pdfFingerprint) {
      const stored = await loadPdfFromDb(session.pdfFingerprint);
      if (stored?.buffer) {
        const slot = createPdfSlot(session.pdfName || stored.name, session.pdfFingerprint);
        slot.annotations = session.annotations || [];
        slot.currentPage = session.currentPage || 1;
        slot.scale = session.scale || 1.2;
        slot.rotation = session.rotation || 0;
        slot.problemRange = session.problemRange || null;
        state.pdfSlots = [slot];
        state.activeSlotIndex = 0;
        await loadPdfIntoSlot(slot, stored.buffer);
        syncStateFromSlot();
        renderPdfTabs();
        await renderCurrentPage();
        renderPanel();
        showStatus("이전 학습 메모를 복원했습니다.", "success");
      }
    }
    return;
  }

  state.pdfSlots = [];
  for (const meta of session.pdfSlots.slice(0, MAX_PDFS)) {
    const stored = await loadPdfFromDb(meta.fingerprint);
    if (!stored?.buffer) continue;
    const slot = createPdfSlot(meta.name || stored.name, meta.fingerprint);
    slot.annotations = meta.annotations || [];
    slot.currentPage = meta.currentPage || 1;
    slot.scale = meta.scale || 1.2;
    slot.rotation = meta.rotation || 0;
    slot.problemRange = meta.problemRange || null;
    await loadPdfIntoSlot(slot, stored.buffer);
    state.pdfSlots.push(slot);
  }

  if (!state.pdfSlots.length) {
    renderPanel();
    showStatus("저장된 PDF를 찾지 못했습니다. PDF를 다시 업로드해 주세요.", "warning");
    return;
  }

  state.activeSlotIndex = Math.min(session.activeSlotIndex || 0, state.pdfSlots.length - 1);
  state.interactionMode = session.interactionMode || "text";
  if (els.questionDefault && session.defaultQuestion) els.questionDefault.value = session.defaultQuestion;
  if (els.yearInput && session.year) els.yearInput.value = session.year;
  if (els.problemInput && session.problemNumber) els.problemInput.value = session.problemNumber;
  syncStateFromSlot();
  if (state.problemRange && els.manualStart) els.manualStart.value = String(state.problemRange.startPage);
  if (state.problemRange && els.manualEnd) els.manualEnd.value = String(state.problemRange.endPage);
  renderPdfTabs();
  await renderCurrentPage();
  renderPanel();
  showStatus("이전 학습 메모를 복원했습니다.", "success");
}

function bindEvents() {
  els.pdfBtn?.addEventListener("click", () => els.pdfInput?.click());
  els.pdfInput?.addEventListener("change", async () => {
    const files = els.pdfInput.files;
    if (files?.length) await handlePdfFiles(files);
    els.pdfInput.value = "";
  });

  els.prevBtn?.addEventListener("click", () => goToPage(state.currentPage - 1));
  els.nextBtn?.addEventListener("click", () => goToPage(state.currentPage + 1));

  els.pageInput?.addEventListener("change", () => {
    const rel = parseInt(els.pageInput.value, 10);
    const target = state.problemRange ? state.problemRange.startPage + rel - 1 : rel;
    goToPage(target);
  });
  els.pageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const rel = parseInt(els.pageInput.value, 10);
      const target = state.problemRange ? state.problemRange.startPage + rel - 1 : rel;
      goToPage(target);
    }
  });

  els.zoomIn?.addEventListener("click", () => changeScale(state.scale + 0.1));
  els.zoomOut?.addEventListener("click", () => changeScale(state.scale - 0.1));
  els.zoomFit?.addEventListener("click", () => fitWidth());
  els.zoom100?.addEventListener("click", () => zoom100());

  els.rotateLeft?.addEventListener("click", () => rotatePage(-90));
  els.rotateRight?.addEventListener("click", () => rotatePage(90));

  els.modeText?.addEventListener("click", () => setInteractionMode("text"));
  els.modeRegion?.addEventListener("click", () => setInteractionMode("region"));

  els.loadProblemBtn?.addEventListener("click", () => loadProblemRange());

  document.addEventListener("mouseup", (e) => {
    if (state.interactionMode !== "text") return;
    if (!getPageContainer()?.contains(e.target)) return;
    if (els.floatMenu && !els.floatMenu.hidden && els.floatMenu.contains(e.target)) return;
    handleTextSelectionEnd();
  });

  document.addEventListener("mousedown", (e) => {
    if (els.floatMenu?.hidden) return;
    if (e.target.closest("#study-float-menu")) return;
    if (hasActiveSelection()) return;
    els.floatMenu.hidden = true;
  });

  els.floatMenu?.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  els.floatMenu?.querySelectorAll(".study-color-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedColor = btn.dataset.color || "yellow";
      els.floatMenu.querySelectorAll(".study-color-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.color === state.selectedColor);
      });
    });
  });

  els.floatMenu?.querySelectorAll(".study-purpose-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlePurposeClick(btn.dataset.purpose);
    });
  });

  els.floatMenu?.querySelector('[data-action="submit-ask"]')?.addEventListener("click", handleSubmitAsk);

  els.floatMenu?.querySelector('[data-action="run-procedures"]')?.addEventListener("click", handleRunProceduresClick);
  els.floatMenu?.querySelector('[data-action="memo"]')?.addEventListener("click", handleMemoOnlyClick);
  els.floatMenu?.querySelector('[data-action="clear-selection"]')?.addEventListener("click", handleClearSelection);

  els.panelList?.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle-ann]");
    if (toggle) {
      const ann = state.annotations.find((a) => a.id === toggle.dataset.toggleAnn);
      if (ann) {
        ann.collapsed = !ann.collapsed;
        renderPanel();
        saveSession();
      }
      return;
    }

    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const ann = state.annotations.find((a) => a.id === btn.dataset.annId);
    if (!ann) return;

    if (btn.dataset.action === "delete-ann") {
      state.annotations = state.annotations.filter((a) => a.id !== btn.dataset.annId);
      renderHighlightsOnCurrentPage();
      renderPanel();
      saveSession();
    } else if (btn.dataset.action === "toggle-important") {
      ann.important = !ann.important;
      renderHighlightsOnCurrentPage();
      renderPanel();
      saveSession();
    } else if (btn.dataset.action === "toggle-collapse") {
      ann.collapsed = !ann.collapsed;
      renderPanel();
      saveSession();
    }
  });

  els.panelList?.addEventListener("input", (e) => {
    const q = e.target.closest("[data-question-ann]");
    if (q) {
      const ann = state.annotations.find((a) => a.id === q.dataset.questionAnn);
      if (ann) {
        ann.questionNumber = q.value;
        ann.updatedAt = new Date().toISOString();
        saveSession();
      }
      return;
    }
    const memo = e.target.closest("[data-user-memo-ann]");
    if (memo) {
      const ann = state.annotations.find((a) => a.id === memo.dataset.userMemoAnn);
      if (ann) {
        ann.userMemo = memo.value;
        ann.updatedAt = new Date().toISOString();
        saveSession();
      }
    }
  });

  els.questionDefault?.addEventListener("change", saveSession);

  els.clearMemosBtn?.addEventListener("click", clearStudyMemos);
}

bindEvents();
restoreSession();
updatePageInfo();
