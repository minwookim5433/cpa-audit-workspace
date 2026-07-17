/**
 * CPA Answer Coach Workspace — 좌우 2분할
 */
import * as pdfjsLib from "/node_modules/pdfjs-dist/build/pdf.mjs";
import {
  isDesktopSplit,
  renderSinglePage,
  detectPdfTextRich,
  calcFitWidthScale,
} from "./workspace-exam-viewer.js";
import { buildPageTexts, searchInPages, renderSearchResults } from "./workspace-search.js";
import { createBookmark, renderBookmarkPanel } from "./workspace-bookmarks.js";
import { TOOLS, createDrawController, isDrawingTool } from "./workspace-draw-tools.js";
import {
  ANSWER_PAGE_COUNT,
  ROWS_PER_PAGE,
  TOTAL_ROWS,
  createEmptyAnswerSheet,
  countUsedRows,
  normalizeAnswerPages,
} from "./workspace-answer-editor.js";
import {
  createAnswerDocumentController,
  countPageUsedRowsFromText,
  getPageText,
} from "./workspace-answer-document.js";
import {
  clampAnswerFontSize,
  clampAnswerLetterSpacing,
  applyAnswerSheetVars,
  normalizeAnswerTypography,
  DEFAULT_ANSWER_FONT_SIZE,
  DEFAULT_ANSWER_LETTER_SPACING,
} from "./workspace-answer-typography.js";
import {
  clampExamScale,
  clampExamScroll,
  createExamPanZoomController,
  MIN_EXAM_SCALE,
  MAX_EXAM_SCALE,
  ZOOM_STEP,
} from "./workspace-exam-pan-zoom.js";
import { createFloatingToolbar, updateFloatingToolUi } from "./workspace-floating-toolbar.js";
import {
  formatCircledNumber,
  renderNumberPopup,
  showNumberPopup,
  hideNumberPopup,
} from "./workspace-numbering.js";
import { createPreviewController } from "./workspace-answer-preview.js";
import { stripFormatSpansFromSheet, hasMeaningfulAnswerContent, normalizeAnswerText, plainTextFromHtml } from "./workspace-answer-format.js";
import {
  buildFullAnswerPlainText,
  requestFullAnswerFeedback,
  normalizeFeedbackPayload,
  countWrittenAnswerPages,
  parseFeedbackFetchError,
} from "./workspace-answer-feedback.js";
import { saveExamAttempt, updateExamAttempt, getExamAttempt } from "./workspace-exam-attempts.js";
import { createExamResultController } from "./workspace-exam-result.js";
import {
  downloadPdfFromClones,
  buildAnswerPdfFilename,
  NoAnswerContentError,
} from "./workspace-answer-export.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.mjs";

const STORAGE_KEY = "cpa-workspace-session";
const DB_NAME = "cpa-workspace-db";
const DB_VERSION = 2;
const PDF_STORE = "pdfs";
const TEMPLATE_STORE = "templates";
const DEFAULT_PANEL_RATIO = 0.5;
const VIEW_PRESETS = {
  equal: 0.5,
  exam: 0.65,
  answer: 0.35,
};
const MIN_EXAM_RATIO = 0.35;
const MIN_ANSWER_RATIO = 0.3;

const pdfDocs = {};

const state = {
  pdfSlots: [],
  activeSlotIndex: 0,
  workspaces: {},
  pdfDoc: null,
  pdfFingerprint: null,
  pdfName: "",
  docTitle: "",
  pageCount: 0,
  currentPage: 1,
  scale: 1,
  isTextPdf: null,
  pageTexts: null,
  bookmarks: [],
  drawAnnotations: [],
  answerSheet: createEmptyAnswerSheet(),
  answerSheetPage: 0,
  timerSeconds: 0,
  searchQuery: "",
  searchResults: [],
  searchIdx: 0,
  drawTool: TOOLS.cursor,
  lineColor: "red",
  highlightColor: "yellow",
  fitWidth: true,
  manualZoom: false,
  panelRatio: DEFAULT_PANEL_RATIO,
  viewMode: "equal",
  mobileTab: "exam",
  floatToolbarPos: { x: 12, y: 12 },
  floatToolbarMinimized: false,
  floatToolbarVertical: false,
  listMode: null,
  caretOffset: 0,
  circledAutoIncrement: null,
  answerFontSize: DEFAULT_ANSWER_FONT_SIZE,
  answerLetterSpacing: DEFAULT_ANSWER_LETTER_SPACING,
  sheetTemplate: null,
  timerRunning: false,
};

let renderToken = 0;
let timerInterval = null;
let saveDebounce = null;
let previewController = null;
let drawController = null;
let drawSnapshot = null;
let answerDocController = null;
let examResultController = null;
let examPanZoomController = null;
let currentExamAttempt = null;
let floatToolbar = null;
let floatToolbarReady = false;
let numberPopupReady = false;

const els = {};

function cacheElements() {
  const map = {
    pdfInput: "ws-pdf-input",
    pdfBtn: "ws-pdf-btn",
    docSelect: "ws-doc-select",
    docManage: "ws-doc-manage",
    docManageModal: "ws-doc-manage-modal",
    pdfList: "ws-pdf-list",
    status: "ws-status",
    examHint: "ws-exam-hint",
    examPages: "ws-exam-pages",
    exam: "ws-exam",
    answerEditor: "ws-answer-editor",
    prevPage: "ws-prev-page",
    nextPage: "ws-next-page",
    pageInput: "ws-page-input",
    pageLabel: "ws-page-label",
    ansPrev: "ws-ans-prev",
    ansNext: "ws-ans-next",
    ansPageInput: "ws-ans-page-input",
    ansPageLabel: "ws-ans-page-label",
    wrongNotesList: "ws-wrong-notes-list",
    statsDashboard: "ws-stats-dashboard",
    timerDisplay: "ws-timer-display",
    toast: "ws-toast",
    searchInput: "ws-search-input",
    searchResults: "ws-search-results",
    searchNotice: "ws-search-notice",
    bookmarkPanel: "ws-bookmark-panel",
    rowStats: "ws-row-stats",
    saveStatus: "ws-save-status",
    splitPane: "ws-split-pane",
    paneExam: "ws-pane-exam",
    paneAnswer: "ws-pane-answer",
    vResizer: "ws-v-resizer",
    previewBtn: "ws-preview-btn",
    answerPreviewBtn: "ws-answer-preview-btn",
    previewModal: "ws-preview-modal",
    mobileTabs: "ws-mobile-tabs",
    floatToolbar: "ws-float-toolbar",
    numberPopup: "ws-number-popup",
    viewModes: "ws-view-modes",
  };
  Object.entries(map).forEach(([key, id]) => {
    els[key] = document.getElementById(id);
  });
}

function showStatus(msg, type = "info") {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.className = `ws-status${type !== "info" ? ` is-${type}` : ""}`;
}

function showToast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, 2800);
}

function setSaveStatus(kind = "saved") {
  if (!els.saveStatus) return;
  if (kind === "pending") {
    els.saveStatus.textContent = "저장 중…";
    els.saveStatus.className = "ws-save-status is-pending";
  } else if (kind === "error") {
    els.saveStatus.textContent = "저장 실패";
    els.saveStatus.className = "ws-save-status is-error";
  } else {
    els.saveStatus.textContent = "저장됨";
    els.saveStatus.className = "ws-save-status";
  }
}

function pdfFingerprint(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function isPdfFile(file) {
  if (!file) return false;
  return file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
}

function getActiveSlot() {
  return state.pdfSlots[state.activeSlotIndex] || null;
}

function getActiveWorkspace() {
  const slot = getActiveSlot();
  if (!slot) return null;
  return state.workspaces[slot.fingerprint] || null;
}

function createWorkspace() {
  return {
    currentPage: 1,
    scale: 1,
    fitWidth: true,
    manualZoom: false,
    pageViews: {},
    bookmarks: [],
    drawAnnotations: [],
    drawUndoStack: [],
    drawRedoStack: [],
    answerSheet: createEmptyAnswerSheet(),
    answerSheetPage: 0,
    timerSeconds: 0,
    pageTexts: null,
    isTextPdf: null,
    searchQuery: "",
    searchResults: [],
    searchIdx: 0,
    answerUndoStack: [],
    answerRedoStack: [],
    listMode: null,
    caretOffset: 0,
    circledAutoIncrement: null,
    answerFontSize: DEFAULT_ANSWER_FONT_SIZE,
    answerLetterSpacing: DEFAULT_ANSWER_LETTER_SPACING,
  };
}

function ensureWorkspace(fingerprint) {
  if (!state.workspaces[fingerprint]) {
    state.workspaces[fingerprint] = createWorkspace();
  }
  return state.workspaces[fingerprint];
}

function syncFromSlot() {
  const slot = getActiveSlot();
  if (!slot) {
    state.pdfDoc = null;
    state.pdfFingerprint = null;
    state.pdfName = "";
    state.docTitle = "";
    state.pageCount = 0;
    state.currentPage = 1;
    state.scale = 1;
    state.isTextPdf = null;
    state.pageTexts = null;
    state.bookmarks = [];
    state.drawAnnotations = [];
    state.answerSheet = createEmptyAnswerSheet();
    state.answerSheetPage = 0;
    state.timerSeconds = 0;
    state.searchQuery = "";
    state.searchResults = [];
    state.searchIdx = 0;
    updateExamHint();
    return;
  }

  const ws = ensureWorkspace(slot.fingerprint);
  state.pdfDoc = pdfDocs[slot.fingerprint] || null;
  state.pdfFingerprint = slot.fingerprint;
  state.pdfName = slot.name;
  state.docTitle = slot.title || slot.name;
  state.pageCount = state.pdfDoc?.numPages || 0;
  state.currentPage = ws.currentPage;
  state.scale = ws.scale;
  state.fitWidth = ws.fitWidth ?? true;
  state.manualZoom = ws.manualZoom ?? false;
  state.isTextPdf = ws.isTextPdf;
  state.pageTexts = ws.pageTexts;
  state.bookmarks = ws.bookmarks;
  state.drawAnnotations = [...(ws.drawAnnotations || [])];
  state.answerSheet = stripFormatSpansFromSheet(normalizeAnswerPages(ws.answerSheet));
  state.answerSheetPage = ws.answerSheetPage;
  state.timerSeconds = ws.timerSeconds;
  state.listMode = null;
  state.caretOffset = ws.caretOffset ?? 0;
  state.circledAutoIncrement = ws.circledAutoIncrement || null;
  state.answerFontSize = clampAnswerFontSize(ws.answerFontSize ?? DEFAULT_ANSWER_FONT_SIZE);
  state.answerLetterSpacing = clampAnswerLetterSpacing(
    ws.answerLetterSpacing ?? DEFAULT_ANSWER_LETTER_SPACING
  );
  state.searchQuery = ws.searchQuery;
  state.searchResults = ws.searchResults;
  state.searchIdx = ws.searchIdx;
  if (!ws.pageViews) ws.pageViews = {};
  updateExamHint();
}

function syncToSlot() {
  const slot = getActiveSlot();
  if (!slot) return;
  const ws = ensureWorkspace(slot.fingerprint);
  ws.currentPage = state.currentPage;
  ws.scale = state.scale;
  ws.fitWidth = state.fitWidth;
  ws.manualZoom = state.manualZoom;
  ws.isTextPdf = state.isTextPdf;
  ws.pageTexts = state.pageTexts;
  ws.bookmarks = state.bookmarks;
  ws.drawAnnotations = [...state.drawAnnotations];
  ws.answerSheet = stripFormatSpansFromSheet(normalizeAnswerPages(state.answerSheet));
  ws.answerSheetPage = state.answerSheetPage;
  ws.timerSeconds = state.timerSeconds;
  ws.listMode = null;
  ws.caretOffset = state.caretOffset;
  ws.circledAutoIncrement = state.circledAutoIncrement || null;
  ws.answerFontSize = clampAnswerFontSize(state.answerFontSize);
  ws.answerLetterSpacing = clampAnswerLetterSpacing(state.answerLetterSpacing);
  ws.searchQuery = state.searchQuery;
  ws.searchResults = state.searchResults;
  ws.searchIdx = state.searchIdx;
}

function updateExamHint() {
  if (els.examHint) els.examHint.hidden = Boolean(state.pdfDoc);
  if (els.examPages) els.examPages.hidden = !state.pdfDoc;
}

async function loadPdfDocument(renderBuffer) {
  try {
    return await pdfjsLib.getDocument({ data: renderBuffer }).promise;
  } catch (err) {
    throw Object.assign(new Error(`PDF 파싱 실패: ${err.message || err}`), { phase: "parse" });
  }
}

async function renderExamOrThrow() {
  await renderExam();
  const canvas = els.examPages?.querySelector(".pdf-canvas");
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error("canvas가 생성되지 않았습니다.");
  }
}

async function persistPdfToDbSafe(fingerprint, storageBuffer, name) {
  try {
    await savePdfToDb(fingerprint, storageBuffer, name);
    return true;
  } catch (err) {
    console.warn("IndexedDB PDF save failed:", err);
    showStatus("PDF는 정상적으로 열렸지만 자동 저장에 실패했습니다.", "warning");
    return false;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE, { keyPath: "fingerprint" });
      if (!db.objectStoreNames.contains(TEMPLATE_STORE)) db.createObjectStore(TEMPLATE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePdfToDb(fingerprint, buffer, name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).put({ fingerprint, buffer, name, savedAt: new Date().toISOString() });
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

async function deletePdfFromDb(fingerprint) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).delete(fingerprint);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveTemplateToDb(dataUrl, name, type) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, "readwrite");
    tx.objectStore(TEMPLATE_STORE).put({ id: "default", dataUrl, name, type, savedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadTemplateFromDb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, "readonly");
    const req = tx.objectStore(TEMPLATE_STORE).get("default");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function flushSaveNow() {
  clearTimeout(saveDebounce);
  try {
    saveSession();
    setSaveStatus("saved");
  } catch (err) {
    console.warn("Save failed:", err);
    setSaveStatus("error");
  }
}

function pauseTimer() {
  state.timerRunning = false;
  clearInterval(timerInterval);
  scheduleSave();
}

function scheduleSave() {
  setSaveStatus("pending");
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => {
    try {
      saveSession();
      setSaveStatus("saved");
    } catch (err) {
      console.warn("Save failed:", err);
      setSaveStatus("error");
    }
  }, 400);
}

function saveSession() {
  syncToSlot();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      pdfSlots: state.pdfSlots.map((s) => ({
        fingerprint: s.fingerprint,
        name: s.name,
        title: s.title || s.name,
      })),
      activeSlotIndex: state.activeSlotIndex,
      workspaces: state.workspaces,
      panelRatio: state.panelRatio,
      viewMode: state.viewMode,
      mobileTab: state.mobileTab,
      hasTemplate: Boolean(state.sheetTemplate?.dataUrl),
      timerRunning: state.timerRunning,
      drawTool: state.drawTool,
      lineColor: state.lineColor,
      highlightColor: state.highlightColor,
      floatToolbarPos: state.floatToolbarPos,
      floatToolbarMinimized: state.floatToolbarMinimized,
      floatToolbarVertical: state.floatToolbarVertical,
    })
  );
}

function renderDocSelect() {
  if (!els.docSelect) return;
  const prev = els.docSelect.value;
  els.docSelect.innerHTML =
    `<option value="">시험지 없음</option>` +
    state.pdfSlots
      .map(
        (s) =>
          `<option value="${escapeAttr(s.fingerprint)}"${s.fingerprint === getActiveSlot()?.fingerprint ? " selected" : ""}>${escapeHtml(s.title || s.name)}</option>`
      )
      .join("");
  if (prev && state.pdfSlots.some((s) => s.fingerprint === prev)) {
    els.docSelect.value = prev;
  }
}

function renderPdfManageList() {
  if (!els.pdfList) return;
  if (!state.pdfSlots.length) {
    els.pdfList.innerHTML = `<li class="ws-empty-msg">등록된 시험지가 없습니다.</li>`;
    return;
  }
  els.pdfList.innerHTML = state.pdfSlots
    .map(
      (s) => `
    <li class="ws-pdf-list-item">
      <input type="text" class="ws-pdf-title-input" data-title-fp="${escapeAttr(s.fingerprint)}" value="${escapeAttr(s.title || s.name)}" aria-label="시험지 제목" />
      <span class="ws-pdf-list-meta">${escapeHtml(s.name)}</span>
      <button type="button" class="ws-btn ws-pdf-list-del" data-del-fp="${escapeAttr(s.fingerprint)}" title="삭제">삭제</button>
    </li>`
    )
    .join("");

  els.pdfList.querySelectorAll("[data-del-fp]").forEach((btn) => {
    btn.addEventListener("click", () => deletePdfSlot(btn.dataset.delFp));
  });

  els.pdfList.querySelectorAll("[data-title-fp]").forEach((input) => {
    input.addEventListener("change", () => {
      const slot = state.pdfSlots.find((s) => s.fingerprint === input.dataset.titleFp);
      if (!slot) return;
      slot.title = input.value.trim() || slot.name;
      renderDocSelect();
      scheduleSave();
    });
  });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/'/g, "&#39;");
}

async function switchPdfSlot(fingerprint) {
  const idx = state.pdfSlots.findIndex((s) => s.fingerprint === fingerprint);
  if (idx < 0) return;
  if (idx === state.activeSlotIndex && state.pdfDoc) return;

  syncToSlot();
  state.activeSlotIndex = idx;
  syncFromSlot();
  renderDocSelect();

  if (state.pdfDoc) {
    await ensureFitWidthScale();
    await renderExamOrThrow();
    updatePageNav();
    refreshBookmarkPanel();
    if (els.searchInput) els.searchInput.value = state.searchQuery;
    renderSearchResults(els.searchResults, state.searchResults, state.searchIdx, jumpToSearchResult);
  }

  setupAnswerEditor();
  updateAnswerPageNav();
  updateRowStats();
  updateTimerDisplay();
  updateSearchNotice();
  scheduleSave();
}

async function deletePdfSlot(fingerprint) {
  const idx = state.pdfSlots.findIndex((s) => s.fingerprint === fingerprint);
  if (idx < 0) return;

  const ok = window.confirm("이 시험지와 관련 주석·답안을 삭제하시겠습니까?");
  if (!ok) return;

  syncToSlot();
  state.pdfSlots.splice(idx, 1);
  delete state.workspaces[fingerprint];
  delete pdfDocs[fingerprint];

  try {
    await deletePdfFromDb(fingerprint);
  } catch (err) {
    console.warn("IndexedDB delete failed:", err);
  }

  if (state.activeSlotIndex >= state.pdfSlots.length) {
    state.activeSlotIndex = Math.max(0, state.pdfSlots.length - 1);
  }

  syncFromSlot();
  renderDocSelect();
  renderPdfManageList();

  if (state.pdfDoc) {
    await ensureFitWidthScale();
    await renderExamOrThrow();
    updatePageNav();
  }

  setupAnswerEditor();
  updateAnswerPageNav();
  updateRowStats();
  refreshBookmarkPanel();
  scheduleSave();
  showToast("시험지를 삭제했습니다.");
}

function applyPanelRatio(ratio) {
  if (!isDesktopSplit()) return;
  const paneExam = els.paneExam;
  const paneAnswer = els.paneAnswer;
  if (!paneExam || !paneAnswer) return;
  const r = Math.max(MIN_EXAM_RATIO, Math.min(1 - MIN_ANSWER_RATIO, Number(ratio) || DEFAULT_PANEL_RATIO));
  state.panelRatio = r;
  paneExam.style.flex = `0 0 ${Math.round(r * 1000) / 10}%`;
  paneAnswer.style.flex = "1 1 auto";
  document.documentElement.style.setProperty("--ws-panel-ratio", String(r));
}

function applyViewMode(mode) {
  const preset = VIEW_PRESETS[mode];
  if (preset == null) return;
  state.viewMode = mode;
  applyPanelRatio(preset);
  document.querySelectorAll(".ws-view-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === mode);
  });
  scheduleSave();
}

async function ensureFitWidthScale() {
  if (!state.pdfDoc) return;
  state.scale = clampExamScale(
    await calcFitWidthScale(state.pdfDoc, state.currentPage, els.exam?.clientWidth || 500)
  );
  state.fitWidth = true;
  state.manualZoom = false;
  const ws = getActiveWorkspace();
  if (ws) {
    ws.scale = state.scale;
    ws.fitWidth = true;
    ws.manualZoom = false;
  }
}

async function refitExamIfNeeded() {
  if (!state.pdfDoc) return;
  if (state.fitWidth || !state.manualZoom) {
    await ensureFitWidthScale();
    await renderExam();
    updatePageNav();
  }
}

function bindVerticalResizer() {
  const resizer = els.vResizer;
  const split = els.splitPane;
  if (!resizer || !split) return;

  let dragging = false;

  const onMove = (clientX) => {
    const rect = split.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    applyPanelRatio(ratio);
    state.viewMode = "custom";
    scheduleSave();
    refitExamIfNeeded();
  };

  resizer.addEventListener("mousedown", (e) => {
    dragging = true;
    resizer.classList.add("is-dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    onMove(e.clientX);
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("is-dragging");
  });

  resizer.addEventListener("keydown", (e) => {
    const step = 0.02;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyPanelRatio(state.panelRatio - step);
      scheduleSave();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applyPanelRatio(state.panelRatio + step);
      scheduleSave();
    }
  });
}

function setMobileTab(tab) {
  state.mobileTab = tab;
  els.paneExam?.classList.toggle("is-active", tab === "exam");
  els.paneAnswer?.classList.toggle("is-active", tab === "answer");
  document.querySelectorAll(".ws-tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  scheduleSave();
}

function updatePageNav() {
  if (els.pageLabel) els.pageLabel.textContent = `/ ${state.pageCount || "—"}`;
  if (els.pageInput) els.pageInput.value = String(state.currentPage);
  if (els.prevPage) els.prevPage.disabled = state.currentPage <= 1;
  if (els.nextPage) els.nextPage.disabled = !state.pageCount || state.currentPage >= state.pageCount;
  updateZoomLabel();
}

function updateZoomLabel() {
  const zoomEl = document.getElementById("ws-zoom-label");
  if (zoomEl) {
    zoomEl.textContent = `${Math.round(state.scale * 100)}%`;
  }
}

function saveCurrentPageView() {
  const ws = getActiveWorkspace();
  if (!ws || !state.pdfFingerprint) return;
  if (!ws.pageViews) ws.pageViews = {};
  ws.pageViews[state.currentPage] = {
    scale: state.scale,
    scrollLeft: els.exam?.scrollLeft || 0,
    scrollTop: els.exam?.scrollTop || 0,
    fitWidth: state.fitWidth,
    manualZoom: state.manualZoom,
  };
}

function getSavedPageView(pageNum) {
  const ws = getActiveWorkspace();
  return ws?.pageViews?.[pageNum] || null;
}

async function applyExamScale(newScale, { manualZoom = true, fitWidth = false, scroll = null } = {}) {
  state.scale = clampExamScale(newScale);
  state.fitWidth = fitWidth;
  state.manualZoom = manualZoom;
  const ws = getActiveWorkspace();
  if (ws) {
    ws.scale = state.scale;
    ws.fitWidth = state.fitWidth;
    ws.manualZoom = state.manualZoom;
  }
  updateZoomLabel();
  await renderExam();
  if (els.exam && scroll) {
    els.exam.scrollLeft = scroll.scrollLeft;
    els.exam.scrollTop = scroll.scrollTop;
    clampExamScroll(els.exam);
  }
  saveCurrentPageView();
  scheduleSave();
}

function initExamPanZoom() {
  if (examPanZoomController || !els.exam) return;
  examPanZoomController = createExamPanZoomController({
    scrollEl: els.exam,
    paneEl: els.paneExam,
    getScale: () => state.scale,
    isDrawingTool: () => isDrawingTool(state.drawTool),
    onZoom: (newScale, opts) => applyExamScale(newScale, opts),
    onPanEnd: () => saveCurrentPageView(),
  });
}

function updateAnswerPageNav() {
  const page = state.answerSheetPage + 1;
  if (els.ansPageLabel) els.ansPageLabel.textContent = String(ANSWER_PAGE_COUNT);
  if (els.ansPageInput) els.ansPageInput.value = String(page);
  if (els.ansPrev) els.ansPrev.disabled = state.answerSheetPage <= 0;
  if (els.ansNext) els.ansNext.disabled = state.answerSheetPage >= ANSWER_PAGE_COUNT - 1;
}

function updateRowStats() {
  if (!els.rowStats) return;
  const pageUsed = answerDocController?.countCurrentUsedLines?.() ?? countPageUsedRowsFromText(
    getPageText(state.answerSheet, state.answerSheetPage),
    answerDocController?.getEditorEl?.()
  );
  const editor = answerDocController?.getEditorEl?.();
  const countLines = (text) => countPageUsedRowsFromText(text, editor);
  const totalUsed = countUsedRows(state.answerSheet, countLines);
  els.rowStats.textContent = `${pageUsed} / ${ROWS_PER_PAGE}행 · ${totalUsed} / ${TOTAL_ROWS}행`;
}

function getPageContainer() {
  return els.examPages?.querySelector(".pdf-page-container") || null;
}

function getDrawInteractLayer() {
  return getPageContainer()?.querySelector(".draw-interact-layer") || null;
}

function pushDrawUndo() {
  const ws = getActiveWorkspace();
  if (!ws) return;
  ws.drawUndoStack.push(JSON.parse(JSON.stringify(ws.drawAnnotations)));
  if (ws.drawUndoStack.length > 40) ws.drawUndoStack.shift();
  ws.drawRedoStack = [];
}


function bindDrawController() {
  const layer = getDrawInteractLayer();
  if (!layer) return;

  if (!drawController) {
    drawController = createDrawController({
      getContainer: getPageContainer,
      getAnnotations: () => state.drawAnnotations,
      setAnnotations: (anns) => {
        state.drawAnnotations = [...anns];
        const ws = getActiveWorkspace();
        if (ws) ws.drawAnnotations = [...anns];
      },
      getToolState: () => ({
        tool: state.drawTool,
        lineColor: state.lineColor,
        highlightColor: state.highlightColor,
        pageNumber: state.currentPage,
        pdfFingerprint: state.pdfFingerprint,
      }),
      onChange: () => {
        if (drawSnapshot) {
          const ws = getActiveWorkspace();
          if (ws) {
            ws.drawUndoStack.push(drawSnapshot);
            if (ws.drawUndoStack.length > 40) ws.drawUndoStack.shift();
            ws.drawRedoStack = [];
          }
        }
        drawSnapshot = JSON.parse(JSON.stringify(state.drawAnnotations));
        scheduleSave();
      },
      onSelect: () => {},
    });
    drawController.bind(layer);
  } else {
    drawController.bind(layer);
    drawController.refresh();
  }

  drawSnapshot = JSON.parse(JSON.stringify(state.drawAnnotations));
  updateDrawToolUi();
}

async function renderExam() {
  if (!state.pdfDoc || !els.examPages) return;
  const token = ++renderToken;
  els.examPages.innerHTML = `<p style="text-align:center;color:#888;padding:40px">렌더링 중…</p>`;

  const { isTextRich } = await renderSinglePage(
    state.pdfDoc,
    state.currentPage,
    state.scale,
    els.examPages,
    state.searchQuery
  );
  if (token !== renderToken) return;

  if (state.isTextPdf === null) state.isTextPdf = isTextRich;
  const ws = getActiveWorkspace();
  if (ws && ws.isTextPdf === null) ws.isTextPdf = state.isTextPdf;

  bindDrawController();
  if (els.examPages) {
    els.examPages.classList.toggle("is-fit-width", state.fitWidth && !state.manualZoom);
  }
  if (els.floatToolbar) els.floatToolbar.hidden = false;
  floatToolbar?.restore();
  updateSearchNotice();
}

function clearPageDrawAnnotations() {
  const fp = state.pdfFingerprint;
  const page = state.currentPage;
  const before = state.drawAnnotations.filter((a) => a.pdfFingerprint === fp && a.pageNumber === page).length;
  state.drawAnnotations = state.drawAnnotations.filter(
    (a) => !(a.pdfFingerprint === fp && a.pageNumber === page)
  );
  const ws = getActiveWorkspace();
  if (ws) ws.drawAnnotations = state.drawAnnotations;
  if (!before) {
    showToast("삭제할 주석이 없습니다.");
    return;
  }
  drawController?.refresh();
  scheduleSave();
  showToast("현재 페이지 주석을 삭제했습니다.");
}

function updateSearchNotice() {
  if (!els.searchNotice) return;
  if (state.isTextPdf === false) {
    els.searchNotice.textContent =
      "이 PDF는 이미지 기반이므로 텍스트 검색을 지원하지 않습니다. 밑줄·형광펜 도구로 자유롭게 표시하세요.";
  } else if (state.isTextPdf) {
    els.searchNotice.textContent = "텍스트 검색이 가능합니다. 밑줄·형광펜 도구로 시험지에 표시할 수 있습니다.";
  } else {
    els.searchNotice.textContent = "시험지를 추가하면 검색·주석 가능 여부가 표시됩니다.";
  }
}

function updateDrawToolUi() {
  updateFloatingToolUi(state.drawTool, {
    lineColor: state.lineColor,
    highlightColor: state.highlightColor,
  });
  document.querySelectorAll(".ws-exam-tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tool === state.drawTool);
  });
  const colorWrap = document.getElementById("ws-exam-color-wrap");
  const lineSel = document.getElementById("ws-exam-line-color");
  const hiSel = document.getElementById("ws-exam-highlight-color");
  if (colorWrap) {
    colorWrap.hidden = !isDrawingTool(state.drawTool);
    if (lineSel) {
      lineSel.hidden = state.drawTool !== TOOLS.underline;
      lineSel.style.display = state.drawTool === TOOLS.underline ? "" : "none";
    }
    if (hiSel) {
      hiSel.hidden = state.drawTool !== TOOLS.highlighter;
      hiSel.style.display = state.drawTool === TOOLS.highlighter ? "" : "none";
    }
  }
  if (lineSel && state.lineColor) lineSel.value = state.lineColor;
  if (hiSel && state.highlightColor) hiSel.value = state.highlightColor;
  const layer = getDrawInteractLayer();
  if (layer) {
    layer.classList.toggle("is-drawing", isDrawingTool(state.drawTool));
  }
  examPanZoomController?.refreshCursor?.();
}

function initAnswerDocument() {
  if (!els.answerEditor) return;
  if (!answerDocController) {
    answerDocController = createAnswerDocumentController({
      container: els.answerEditor,
      getState: () => ({
        sheet: state.answerSheet,
        pageIndex: state.answerSheetPage,
        caretOffset: state.caretOffset,
        circledAutoIncrement: state.circledAutoIncrement,
        answerFontSize: state.answerFontSize,
        answerLetterSpacing: state.answerLetterSpacing,
        editStarted: false,
        workspaceUndo: getActiveWorkspace(),
      }),
      setState: (patch) => {
        if (patch.sheet) state.answerSheet = patch.sheet;
        if (patch.pageIndex != null) state.answerSheetPage = patch.pageIndex;
        if (patch.caretOffset != null) state.caretOffset = patch.caretOffset;
        if (patch.circledAutoIncrement !== undefined) state.circledAutoIncrement = patch.circledAutoIncrement;
        syncAnswerPageToState();
      },
      onChange: () => {
        updateRowStats();
        scheduleSave();
      },
    onPageChange: (pageIndex) => {
      state.answerSheetPage = pageIndex;
      syncAnswerPageToState();
      updateAnswerPageNav();
      answerDocController?.render(true);
    },
      showToast,
    });
    const ws = getActiveWorkspace();
    if (ws) answerDocController.setUndoStacks(ws.answerUndoStack, ws.answerRedoStack);
  }
  answerDocController.render();
  applyAnswerTypography(getAnswerTypography(), { save: false });
}

function getAnswerTypography() {
  return normalizeAnswerTypography({
    fontSize: state.answerFontSize,
    letterSpacing: state.answerLetterSpacing,
  });
}

function applyGlobalTypographyValue(field, rawValue) {
  const clampFn = field === "fontSize" ? clampAnswerFontSize : clampAnswerLetterSpacing;
  const value = clampFn(rawValue);
  const next = { ...getAnswerTypography(), [field]: value };
  applyAnswerTypography(next);
}

function applyAnswerTypography(typography, { save = true } = {}) {
  const t = normalizeAnswerTypography(typography);
  state.answerFontSize = t.fontSize;
  state.answerLetterSpacing = t.letterSpacing;
  const ws = getActiveWorkspace();
  if (ws) {
    ws.answerFontSize = t.fontSize;
    ws.answerLetterSpacing = t.letterSpacing;
  }

  if (els.answerEditor) applyAnswerSheetVars(els.answerEditor, t);
  const modalContainer = document.getElementById("ws-modal-sheet-container");
  if (modalContainer) applyAnswerSheetVars(modalContainer, t);

  answerDocController?.applyTypographyVars?.();
  updateTypographyUi();
  if (save) scheduleSave();
}

function updateTypographyUi() {
  const t = getAnswerTypography();
  const label = document.getElementById("ws-format-target-label");
  if (label) label.textContent = "전체 기본 서식";

  const fontRange = document.getElementById("ws-font-size-range");
  const fontInput = document.getElementById("ws-font-size-input");
  const spacingRange = document.getElementById("ws-letter-spacing-range");
  const spacingInput = document.getElementById("ws-letter-spacing-input");

  if (fontRange) {
    fontRange.disabled = false;
    fontRange.value = String(t.fontSize);
  }
  if (fontInput) {
    fontInput.disabled = false;
    fontInput.value = String(t.fontSize);
  }
  if (spacingRange) {
    spacingRange.disabled = false;
    spacingRange.value = String(t.letterSpacing);
  }
  if (spacingInput) {
    spacingInput.disabled = false;
    spacingInput.value = String(t.letterSpacing);
  }
}

function collectSubmissionStats() {
  answerDocController?.flushPersist?.();
  syncAnswerPageToState();
  const sheet = stripFormatSpansFromSheet(normalizeAnswerPages(state.answerSheet));
  const editor = answerDocController?.getEditorEl?.();
  const countLines = (text) => countPageUsedRowsFromText(text, editor);
  const usedRowCount = countUsedRows(sheet, countLines);
  const writtenPageCount = countWrittenAnswerPages(sheet);
  const totalCharCount = sheet.reduce(
    (sum, page) => sum + normalizeAnswerText(plainTextFromHtml(page)).length,
    0
  );

  return {
    examId: state.pdfFingerprint || "",
    docTitle: state.docTitle || state.pdfName || "시험지",
    timerSeconds: state.timerSeconds,
    answerSheet: [...sheet],
    fontSize: state.answerFontSize,
    letterSpacing: state.answerLetterSpacing,
    writtenPageCount,
    usedRowCount,
    totalCharCount,
  };
}

function renderExamEndStats(stats) {
  const el = document.getElementById("ws-exam-end-stats");
  if (!el || !stats) return;
  const m = Math.floor(stats.timerSeconds / 60);
  const s = stats.timerSeconds % 60;
  el.innerHTML = `
    <li><span>사용 시간</span><strong>${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}</strong></li>
    <li><span>작성한 페이지 수</span><strong>${stats.writtenPageCount}페이지</strong></li>
    <li><span>사용한 행 수</span><strong>${stats.usedRowCount}행</strong></li>
    <li><span>전체 글자 수</span><strong>${stats.totalCharCount}자</strong></li>
  `;
}

function showExamEndModal() {
  pauseTimer();
  answerDocController?.flushPersist?.();
  syncAnswerPageToState();
  flushSaveNow();
  const stats = collectSubmissionStats();
  renderExamEndStats(stats);
  const modal = document.getElementById("ws-exam-end-modal");
  if (modal) modal.hidden = false;
  document.body.classList.add("ws-modal-open");
}

function hideExamEndModal() {
  const modal = document.getElementById("ws-exam-end-modal");
  if (modal) modal.hidden = true;
  const resultModal = document.getElementById("ws-exam-result-modal");
  if (!resultModal || resultModal.hidden) {
    document.body.classList.remove("ws-modal-open");
  }
}

async function saveExamPdfFromCurrent() {
  answerDocController?.flushPersist?.();
  syncAnswerPageToState();
  const clones = answerDocController?.cloneAllSheets?.() || [];
  const filename = buildAnswerPdfFilename(state.docTitle);
  await downloadPdfFromClones(
    clones,
    filename,
    getAnswerTypography(),
    answerDocController?.getEditorEl?.() || null,
    { logPages: false }
  );
  return { saved: true, filename };
}

async function runFeedbackForAttempt(attempt) {
  showStatus("작성 피드백 생성 중…", "loading");
  const answerText = buildFullAnswerPlainText(attempt.answerSheet);
  try {
    const feedback = await requestFullAnswerFeedback({
      answerText,
      docTitle: attempt.docTitle,
    });
    const updated = updateExamAttempt(attempt.id, {
      feedback: normalizeFeedbackPayload(feedback),
      feedbackError: "",
    });
    currentExamAttempt = updated;
    examResultController?.updateAttempt(updated);
    document.querySelector('.ws-result-tab[data-result-tab="feedback"]')?.click();
    showStatus("피드백이 생성되었습니다.", "success");
    return updated;
  } catch (err) {
    const updated = updateExamAttempt(attempt.id, {
      feedback: null,
      feedbackError: parseFeedbackFetchError(err),
    });
    currentExamAttempt = updated;
    examResultController?.updateAttempt(updated);
    document.querySelector('.ws-result-tab[data-result-tab="feedback"]')?.click();
    showStatus("답안은 저장되었으나 피드백 생성에 실패했습니다.", "error");
    return updated;
  }
}

async function finalizeExamEnd({ requestFeedback }) {
  const modal = document.getElementById("ws-exam-end-modal");
  if (modal) modal.hidden = true;

  const stats = collectSubmissionStats();
  if (stats.writtenPageCount === 0) {
    document.body.classList.remove("ws-modal-open");
    showToast("저장할 답안이 없습니다.");
    return;
  }

  showStatus("답안 저장 중…", "loading");
  flushSaveNow();

  let pdfResult = { saved: false, filename: "" };
  try {
    pdfResult = await saveExamPdfFromCurrent();
  } catch (err) {
    if (!(err instanceof NoAnswerContentError)) {
      console.warn("PDF save during exam end:", err);
    }
  }

  const attempt = saveExamAttempt({
    ...stats,
    endedAt: new Date().toISOString(),
    pdfFilename: pdfResult.filename || "",
    pdfSaved: pdfResult.saved,
    feedbackRequested: requestFeedback,
    feedback: null,
    feedbackError: "",
  });
  currentExamAttempt = attempt;
  showStatus("답안이 저장되었습니다.", "success");
  examResultController?.open(attempt);

  if (requestFeedback) {
    await runFeedbackForAttempt(attempt);
  }
}

function retryExamFromResult() {
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.timerSeconds = 0;
  state.answerSheet = createEmptyAnswerSheet();
  state.answerSheetPage = 0;
  state.caretOffset = 0;
  const ws = getActiveWorkspace();
  if (ws) {
    ws.timerSeconds = 0;
    ws.answerSheet = createEmptyAnswerSheet();
    ws.answerSheetPage = 0;
    ws.caretOffset = 0;
    ws.circledAutoIncrement = null;
  }
  setupAnswerEditor();
  updateTimerDisplay();
  updateRowStats();
  scheduleSave();
  showToast("답안이 초기화되었습니다. 다시 풀어보세요.");
}

function initExamEndFlow() {
  document.getElementById("ws-exam-end-btn")?.addEventListener("click", () => {
    if (!state.pdfFingerprint) {
      showToast("시험지를 먼저 추가해주세요.");
      return;
    }
    showExamEndModal();
  });

  document.getElementById("ws-exam-end-continue")?.addEventListener("click", () => {
    const modal = document.getElementById("ws-exam-end-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("ws-modal-open");
  });

  document.getElementById("ws-exam-end-save-only")?.addEventListener("click", () => {
    finalizeExamEnd({ requestFeedback: false });
  });

  document.getElementById("ws-exam-end-save-feedback")?.addEventListener("click", () => {
    finalizeExamEnd({ requestFeedback: true });
  });
}

function initExamResultModal() {
  if (examResultController) return;
  const modal = document.getElementById("ws-exam-result-modal");
  if (!modal) return;

  examResultController = createExamResultController({
    modalEl: modal,
    summaryEl: document.getElementById("ws-exam-result-summary"),
    previewEl: document.getElementById("ws-exam-result-preview"),
    feedbackEl: document.getElementById("ws-exam-result-feedback"),
    pdfStatusEl: document.getElementById("ws-exam-result-pdf-status"),
    tabButtons: [...modal.querySelectorAll(".ws-result-tab")],
    panels: [...modal.querySelectorAll(".ws-result-panel")],
    retryBtn: document.getElementById("ws-exam-result-retry"),
    retryFeedbackBtn: null,
    skipFeedbackBtn: null,
    exportPdfBtn: document.getElementById("ws-exam-result-export-pdf"),
    closeBtn: document.getElementById("ws-exam-result-close"),
    onRetryExam: retryExamFromResult,
    onRequestFeedback: (attempt) => runFeedbackForAttempt(attempt),
  });
}

function setupAnswerEditor() {
  const ws = getActiveWorkspace();
  if (answerDocController && ws) {
    answerDocController.setUndoStacks(ws.answerUndoStack || [], ws.answerRedoStack || []);
  }
  initAnswerDocument();
  updateTypographyUi();
  updateRowStats();
}

function initFloatingToolbar() {
  if (!els.floatToolbar || floatToolbarReady) return;
  floatToolbarReady = true;
  floatToolbar = createFloatingToolbar({
    toolbarEl: els.floatToolbar,
    handleEl: document.getElementById("ws-float-handle"),
    minimizeBtn: document.getElementById("ws-float-minimize"),
    expandBtn: document.getElementById("ws-float-expand"),
    orientBtn: document.getElementById("ws-float-orient"),
    paneEl: els.exam,
    getState: () => ({
      floatToolbarPos: state.floatToolbarPos,
      floatToolbarMinimized: state.floatToolbarMinimized,
      floatToolbarVertical: state.floatToolbarVertical,
    }),
    setState: (patch) => Object.assign(state, patch),
    onToolChange: (tool) => {
      state.drawTool = tool;
      updateDrawToolUi();
      drawController?.refresh();
      scheduleSave();
    },
    onAction: (action, value) => {
      if (action === "lineColor") state.lineColor = value;
      else if (action === "highlightColor") state.highlightColor = value;
      else if (action === "undo") handleDrawUndo();
      else if (action === "redo") handleDrawRedo();
      else if (action === "deleteSelected") {
        if (drawController?.deleteSelected()) scheduleSave();
        else showToast("선택된 주석이 없습니다.");
      }
      else if (action === "clearPage") clearPageDrawAnnotations();
      else if (action === "savePosition") scheduleSave();
    },
  });
}

function initNumberPopup() {
  if (!els.numberPopup || numberPopupReady) return;
  renderNumberPopup(els.numberPopup, {
    onInsert: (startNum) => {
      const token = `${formatCircledNumber(startNum)} `;
      answerDocController?.insertAtSavedRange(token);
      answerDocController?.setNumberMenuOpen(false);
      hideNumberPopup(els.numberPopup);
    },
    onAutoIncrementChange: (enabled) => {
      state.circledAutoIncrement = enabled
        ? { active: true, nextNum: 1, prevEnterEmpty: false }
        : null;
      syncAnswerPageToState();
      scheduleSave();
    },
    getAutoIncrement: () => Boolean(state.circledAutoIncrement?.active),
    onClose: () => {
      answerDocController?.setNumberMenuOpen(false);
      hideNumberPopup(els.numberPopup);
    },
  });
  numberPopupReady = true;
}

function openNumberMenu(anchorRect) {
  initNumberPopup();
  answerDocController?.setNumberMenuOpen(true);
  showNumberPopup(els.numberPopup, anchorRect);
}

function handleDrawUndo() {
  const ws = getActiveWorkspace();
  if (!ws?.drawUndoStack.length) return;
  ws.drawRedoStack.push(JSON.parse(JSON.stringify(state.drawAnnotations)));
  const prev = ws.drawUndoStack.pop();
  state.drawAnnotations = prev;
  ws.drawAnnotations = prev;
  drawController?.refresh();
  scheduleSave();
}

function handleDrawRedo() {
  const ws = getActiveWorkspace();
  if (!ws?.drawRedoStack.length) return;
  ws.drawUndoStack.push(JSON.parse(JSON.stringify(state.drawAnnotations)));
  const next = ws.drawRedoStack.pop();
  state.drawAnnotations = next;
  ws.drawAnnotations = next;
  drawController?.refresh();
  scheduleSave();
}

function syncAnswerPageToState() {
  const ws = getActiveWorkspace();
  if (ws) {
    ws.answerSheet = stripFormatSpansFromSheet(normalizeAnswerPages(state.answerSheet));
    ws.answerSheetPage = state.answerSheetPage;
    ws.caretOffset = state.caretOffset;
    ws.circledAutoIncrement = state.circledAutoIncrement || null;
    ws.answerFontSize = clampAnswerFontSize(state.answerFontSize);
    ws.answerLetterSpacing = clampAnswerLetterSpacing(state.answerLetterSpacing);
  }
}

function goToAnswerPage(pageIndex) {
  answerDocController?.flushPersist?.();
  syncAnswerPageToState();
  state.answerSheetPage = Math.max(0, Math.min(ANSWER_PAGE_COUNT - 1, pageIndex));
  state.caretOffset = 0;
  const ws = getActiveWorkspace();
  if (ws) {
    ws.answerSheetPage = state.answerSheetPage;
    ws.caretOffset = 0;
  }
  setupAnswerEditor();
  updateAnswerPageNav();
  scheduleSave();
}

async function handlePdfUpload(file) {
  if (!isPdfFile(file)) {
    showStatus("PDF 형식이 아닙니다. .pdf 파일만 업로드할 수 있습니다.", "error");
    return;
  }

  const fp = pdfFingerprint(file);
  const existing = state.pdfSlots.find((s) => s.fingerprint === fp);
  if (existing) {
    await switchPdfSlot(fp);
    showToast("이미 추가된 시험지입니다.");
    showStatus(`「${existing.title || existing.name}」로 전환`, "info");
    return;
  }

  showStatus("PDF 로딩 중…", "loading");

  let originalBuffer;
  try {
    originalBuffer = await file.arrayBuffer();
  } catch (err) {
    showStatus(`PDF 형식이 아닙니다: ${err.message || "파일을 읽을 수 없습니다."}`, "error");
    return;
  }

  const renderBuffer = originalBuffer.slice(0);
  const storageBuffer = originalBuffer.slice(0);

  let pdfDoc;
  try {
    pdfDoc = await loadPdfDocument(renderBuffer);
  } catch (err) {
    showStatus(err.message || "PDF 파싱 실패", "error");
    return;
  }

  syncToSlot();

  const slot = { fingerprint: fp, name: file.name, title: file.name.replace(/\.pdf$/i, "") };
  state.pdfSlots.push(slot);
  state.activeSlotIndex = state.pdfSlots.length - 1;

  pdfDocs[fp] = pdfDoc;
  const ws = ensureWorkspace(fp);
  ws.currentPage = 1;
  ws.scale = 1;
  ws.pageViews = {};
  ws.isTextPdf = null;
  ws.pageTexts = null;
  ws.searchQuery = "";
  ws.searchResults = [];
  ws.searchIdx = 0;

  syncFromSlot();
  state.pageCount = pdfDoc.numPages;
  state.currentPage = 1;
  state.searchResults = [];
  state.searchIdx = 0;

  try {
    state.isTextPdf = await detectPdfTextRich(state.pdfDoc);
    ws.isTextPdf = state.isTextPdf;
    if (state.isTextPdf) {
      state.pageTexts = await buildPageTexts(state.pdfDoc);
      ws.pageTexts = state.pageTexts;
    }
    await ensureFitWidthScale();
    await renderExamOrThrow();
  } catch (err) {
    showStatus(err.message || "PDF 렌더링 실패", "error");
    return;
  }

  updateExamHint();
  updatePageNav();
  renderDocSelect();
  renderPdfManageList();
  refreshBookmarkPanel();
  setupAnswerEditor();
  updateAnswerPageNav();
  updateRowStats();
  scheduleSave();
  showStatus(`전체 ${state.pageCount}쪽 로드 완료`, "success");
  persistPdfToDbSafe(fp, storageBuffer, file.name);
}

async function goToPage(pageNum) {
  if (!state.pdfDoc) return;
  const p = Math.max(1, Math.min(state.pageCount, Number(pageNum) || 1));
  if (p === state.currentPage) return;

  saveCurrentPageView();
  state.currentPage = p;
  const ws = getActiveWorkspace();
  if (ws) ws.currentPage = p;

  const saved = getSavedPageView(p);
  if (saved) {
    state.scale = clampExamScale(saved.scale);
    state.fitWidth = saved.fitWidth ?? false;
    state.manualZoom = saved.manualZoom ?? true;
    if (ws) {
      ws.scale = state.scale;
      ws.fitWidth = state.fitWidth;
      ws.manualZoom = state.manualZoom;
    }
    await renderExam();
    if (els.exam) {
      els.exam.scrollLeft = saved.scrollLeft || 0;
      els.exam.scrollTop = saved.scrollTop || 0;
      clampExamScroll(els.exam);
    }
  } else {
    state.fitWidth = true;
    state.manualZoom = false;
    if (ws) {
      ws.fitWidth = true;
      ws.manualZoom = false;
    }
    await ensureFitWidthScale();
    await renderExam();
    if (els.exam) {
      els.exam.scrollLeft = 0;
      els.exam.scrollTop = 0;
    }
  }
  updatePageNav();
  refreshBookmarkPanel();
  scheduleSave();
}

async function navPrev() {
  if (state.currentPage > 1) await goToPage(state.currentPage - 1);
}

async function navNext() {
  if (state.currentPage < state.pageCount) await goToPage(state.currentPage + 1);
}

function runSearch(query) {
  state.searchQuery = String(query || "").trim();
  const ws = getActiveWorkspace();
  if (ws) ws.searchQuery = state.searchQuery;

  if (!state.searchQuery) {
    state.searchResults = [];
    state.searchIdx = 0;
    if (ws) {
      ws.searchResults = [];
      ws.searchIdx = 0;
    }
    renderSearchResults(els.searchResults, [], 0, () => {});
    renderExam();
    return;
  }
  if (!state.isTextPdf || !state.pageTexts) {
    showStatus("이 PDF는 텍스트 검색을 지원하지 않습니다.", "error");
    return;
  }
  state.searchResults = searchInPages(state.pageTexts, state.searchQuery);
  state.searchIdx = 0;
  if (ws) {
    ws.searchResults = state.searchResults;
    ws.searchIdx = 0;
  }
  renderSearchResults(els.searchResults, state.searchResults, state.searchIdx, jumpToSearchResult);
  if (state.searchResults.length) jumpToSearchResult(0);
  else showStatus("검색 결과 없음", "info");
}

function jumpToSearchResult(idx) {
  if (!state.searchResults.length) return;
  state.searchIdx = ((idx % state.searchResults.length) + state.searchResults.length) % state.searchResults.length;
  const ws = getActiveWorkspace();
  if (ws) ws.searchIdx = state.searchIdx;
  goToPage(state.searchResults[state.searchIdx].pageNumber);
  renderSearchResults(els.searchResults, state.searchResults, state.searchIdx, jumpToSearchResult);
}

function refreshBookmarkPanel() {
  renderBookmarkPanel(
    els.bookmarkPanel,
    state.bookmarks,
    state.currentPage,
    (id) => {
      const bm = state.bookmarks.find((b) => b.id === id);
      if (bm) goToPage(bm.pageNumber);
    },
    (name) => {
      state.bookmarks.push(createBookmark(name, state.currentPage));
      const ws = getActiveWorkspace();
      if (ws) ws.bookmarks = state.bookmarks;
      refreshBookmarkPanel();
      scheduleSave();
      showToast(`북마크 "${name}" 추가`);
    },
    (id) => {
      state.bookmarks = state.bookmarks.filter((b) => b.id !== id);
      const ws = getActiveWorkspace();
      if (ws) ws.bookmarks = state.bookmarks;
      refreshBookmarkPanel();
      scheduleSave();
    }
  );
}

function switchSidebarPanel(panelId) {
  document.querySelectorAll(".ws-nav-btn[data-panel]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.panel === panelId);
  });
  document.querySelectorAll(".ws-sidebar-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `ws-panel-${panelId}`);
  });
}

function updateTimerDisplay() {
  if (!els.timerDisplay) return;
  const m = Math.floor(state.timerSeconds / 60);
  const s = state.timerSeconds % 60;
  els.timerDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function initPreviewModal() {
  previewController = createPreviewController({
    modalEl: els.previewModal,
    containerEl: document.getElementById("ws-modal-sheet-container"),
    pageLabelEl: document.getElementById("ws-modal-page-label"),
    prevBtn: document.getElementById("ws-modal-prev"),
    nextBtn: document.getElementById("ws-modal-next"),
    exportPdfBtn: document.getElementById("ws-export-pdf"),
    exportHtmlBtn: document.getElementById("ws-export-html"),
    exportPrintBtn: document.getElementById("ws-export-print"),
    closeBtn: document.querySelector("[data-modal-close]"),
    getClones: () => answerDocController?.cloneAllSheets?.() || [],
    getInitialPageIndex: () => state.answerSheetPage,
    getAnswerTypography: () => getAnswerTypography(),
    getReferenceEditor: () => answerDocController?.getEditorEl?.() || null,
    onBeforeExport: () => {
      answerDocController?.flushPersist?.();
      syncAnswerPageToState();
      applyAnswerTypography(getAnswerTypography(), { save: false });
      return { docTitle: state.docTitle, answerTypography: getAnswerTypography() };
    },
  });
}

function migrateLegacySession(data) {
  if (data.pdfSlots?.length) return data;

  const migrated = { ...data };
  if (data.pdfFingerprint) {
    migrated.pdfSlots = [
      {
        fingerprint: data.pdfFingerprint,
        name: data.pdfName || "시험지.pdf",
        title: data.docTitle || data.pdfName || "시험지",
      },
    ];
    migrated.activeSlotIndex = 0;
    migrated.workspaces = {
      [data.pdfFingerprint]: {
        ...createWorkspace(),
        currentPage: data.currentPage || 1,
        scale: data.scale || 1,
        bookmarks: data.bookmarks || [],
        drawAnnotations: (data.annotations || []).map((a) => ({
          id: a.id,
          type: a.type === "underline" ? "line" : "stroke",
          pdfFingerprint: data.pdfFingerprint,
          pageNumber: a.pageNumber,
          x1: a.x,
          y1: a.y + (a.height || 0),
          x2: a.x + (a.width || 0),
          y2: a.y + (a.height || 0),
          color: a.color || "red",
          thickness: 2,
          points: a.type === "highlight" ? [[a.x, a.y], [a.x + a.width, a.y + a.height]] : undefined,
        })),
        timerSeconds: data.timerSeconds || 0,
      },
    };
  }
  return migrated;
}

async function restoreSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    let data = migrateLegacySession(JSON.parse(raw));

    state.pdfSlots = data.pdfSlots || [];
    state.activeSlotIndex = data.activeSlotIndex || 0;
    state.workspaces = data.workspaces || {};
    state.panelRatio = data.panelRatio ?? DEFAULT_PANEL_RATIO;
    state.viewMode = data.viewMode || "equal";
    state.mobileTab = data.mobileTab || "exam";
    state.timerRunning = Boolean(data.timerRunning);
    state.drawTool = data.drawTool || TOOLS.cursor;
    state.lineColor = data.lineColor || "red";
    state.highlightColor = data.highlightColor || "yellow";
    state.floatToolbarPos = data.floatToolbarPos || { x: 12, y: 12 };
    state.floatToolbarMinimized = Boolean(data.floatToolbarMinimized);
    state.floatToolbarVertical = Boolean(data.floatToolbarVertical);

    if (VIEW_PRESETS[state.viewMode]) {
      applyPanelRatio(VIEW_PRESETS[state.viewMode]);
    } else {
      applyPanelRatio(state.panelRatio);
    }
    document.querySelectorAll(".ws-view-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === state.viewMode);
    });

    if (data.hasTemplate) {
      const tpl = await loadTemplateFromDb();
      if (tpl) state.sheetTemplate = { dataUrl: tpl.dataUrl, name: tpl.name, type: tpl.type };
    }

    for (const slot of state.pdfSlots) {
      ensureWorkspace(slot.fingerprint);
    }

    Object.values(state.workspaces).forEach((ws) => {
      if (ws?.answerSheet) {
        ws.answerSheet = stripFormatSpansFromSheet(normalizeAnswerPages(ws.answerSheet));
      }
      if (ws) {
        ws.answerFontSize = clampAnswerFontSize(ws.answerFontSize ?? DEFAULT_ANSWER_FONT_SIZE);
        ws.answerLetterSpacing = clampAnswerLetterSpacing(
          ws.answerLetterSpacing ?? DEFAULT_ANSWER_LETTER_SPACING
        );
      }
    });

    applyPanelRatio(state.panelRatio);
    setMobileTab(state.mobileTab);
    initFloatingToolbar();
    initNumberPopup();
    updateDrawToolUi();
    renderDocSelect();
    renderPdfManageList();

    for (const slot of state.pdfSlots) {
      const stored = await loadPdfFromDb(slot.fingerprint);
      if (stored?.buffer) {
        try {
          pdfDocs[slot.fingerprint] = await loadPdfDocument(stored.buffer.slice(0));
        } catch (err) {
          console.warn(`PDF restore failed for ${slot.name}:`, err);
        }
      }
    }

    syncFromSlot();

    if (state.pdfDoc) {
      state.pageCount = state.pdfDoc.numPages;
      if (state.isTextPdf === null) {
        state.isTextPdf = await detectPdfTextRich(state.pdfDoc);
        const ws = getActiveWorkspace();
        if (ws) {
          ws.isTextPdf = state.isTextPdf;
          if (state.isTextPdf && !ws.pageTexts) {
            ws.pageTexts = await buildPageTexts(state.pdfDoc);
            state.pageTexts = ws.pageTexts;
          }
        }
      }
      await ensureFitWidthScale();
      await renderExamOrThrow();
      updatePageNav();
      if (els.searchInput) els.searchInput.value = state.searchQuery;
      renderSearchResults(els.searchResults, state.searchResults, state.searchIdx, jumpToSearchResult);
    }

    setupAnswerEditor();
    updateAnswerPageNav();
    updateRowStats();
    updateTimerDisplay();
    refreshBookmarkPanel();
    updateSearchNotice();
  } catch (err) {
    console.warn("Session restore failed:", err);
  }
}

function bindEvents() {
  els.pdfBtn?.addEventListener("click", () => els.pdfInput?.click());
  els.pdfInput?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) handlePdfUpload(f);
    e.target.value = "";
  });

  els.docSelect?.addEventListener("change", () => {
    const fp = els.docSelect.value;
    if (!fp) return;
    switchPdfSlot(fp);
  });

  els.docManage?.addEventListener("click", () => {
    renderPdfManageList();
    if (els.docManageModal) els.docManageModal.hidden = false;
  });

  els.docManageModal?.querySelector("[data-manage-close]")?.addEventListener("click", () => {
    if (els.docManageModal) els.docManageModal.hidden = true;
  });

  els.docManageModal?.addEventListener("click", (e) => {
    if (e.target === els.docManageModal) els.docManageModal.hidden = true;
  });

  els.prevPage?.addEventListener("click", navPrev);
  els.nextPage?.addEventListener("click", navNext);
  els.pageInput?.addEventListener("change", () => goToPage(els.pageInput.value));

  document.getElementById("ws-zoom-in")?.addEventListener("click", async () => {
    await applyExamScale(state.scale + ZOOM_STEP, { manualZoom: true, fitWidth: false });
  });
  document.getElementById("ws-zoom-out")?.addEventListener("click", async () => {
    await applyExamScale(state.scale - ZOOM_STEP, { manualZoom: true, fitWidth: false });
  });
  document.getElementById("ws-fit-width")?.addEventListener("click", async () => {
    await ensureFitWidthScale();
    await renderExam();
    if (els.exam) {
      els.exam.scrollLeft = 0;
      els.exam.scrollTop = 0;
    }
    saveCurrentPageView();
    updatePageNav();
    scheduleSave();
  });

  document.querySelectorAll(".ws-exam-tool-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.drawTool = btn.dataset.tool;
      updateDrawToolUi();
      drawController?.refresh();
      scheduleSave();
    });
  });

  document.getElementById("ws-exam-line-color")?.addEventListener("change", (e) => {
    state.lineColor = e.target.value;
    scheduleSave();
  });
  document.getElementById("ws-exam-highlight-color")?.addEventListener("change", (e) => {
    state.highlightColor = e.target.value;
    scheduleSave();
  });
  document.querySelectorAll(".ws-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyViewMode(btn.dataset.view));
  });

  els.searchInput?.addEventListener("input", (e) => runSearch(e.target.value));
  document.getElementById("ws-search-prev")?.addEventListener("click", () => {
    if (state.searchResults.length) jumpToSearchResult(state.searchIdx - 1);
  });
  document.getElementById("ws-search-next")?.addEventListener("click", () => {
    if (state.searchResults.length) jumpToSearchResult(state.searchIdx + 1);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && !e.shiftKey) {
      e.preventDefault();
      els.searchInput?.focus();
      switchSidebarPanel("search");
    }
    if (e.key === "Delete" && !isEditableTarget(e.target)) {
      if (drawController?.deleteSelected()) scheduleSave();
    }
  });

  els.ansPrev?.addEventListener("click", () => goToAnswerPage(state.answerSheetPage - 1));
  els.ansNext?.addEventListener("click", () => goToAnswerPage(state.answerSheetPage + 1));
  els.ansPageInput?.addEventListener("change", () => {
    goToAnswerPage(Number(els.ansPageInput.value) - 1);
  });

  const bindGlobalTypographyControl = (rangeId, inputId, field) => {
    const range = document.getElementById(rangeId);
    const input = document.getElementById(inputId);
    const applyFrom = (raw) => {
      if (raw === "혼합") return;
      applyGlobalTypographyValue(field, raw);
    };
    range?.addEventListener("input", (e) => applyFrom(e.target.value));
    input?.addEventListener("input", (e) => applyFrom(e.target.value));
    input?.addEventListener("change", (e) => applyFrom(e.target.value));
    input?.addEventListener("blur", (e) => {
      if (e.target.value !== "혼합") applyFrom(e.target.value);
      updateTypographyUi();
    });
  };

  bindGlobalTypographyControl("ws-font-size-range", "ws-font-size-input", "fontSize");
  bindGlobalTypographyControl("ws-letter-spacing-range", "ws-letter-spacing-input", "letterSpacing");

  document.getElementById("ws-number")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    answerDocController?.flushPersist?.();
    answerDocController?.saveAnswerSelection();
    const rect = e.currentTarget.getBoundingClientRect();
    openNumberMenu(rect);
  });

  document.getElementById("ws-del-line")?.addEventListener("click", () => {
    answerDocController?.deleteCurrentLine();
  });

  document.getElementById("ws-undo")?.addEventListener("click", () => {
    answerDocController?.undo();
    updateRowStats();
    scheduleSave();
  });

  document.getElementById("ws-redo")?.addEventListener("click", () => {
    answerDocController?.redo();
    updateRowStats();
    scheduleSave();
  });

  els.answerPreviewBtn?.addEventListener("click", () => {
    syncAnswerPageToState();
    previewController?.open();
  });

  document.addEventListener("mousedown", (e) => {
    if (!els.numberPopup?.hidden && !e.target.closest("#ws-number-popup") && !e.target.closest("#ws-number")) {
      answerDocController?.setNumberMenuOpen(false);
      hideNumberPopup(els.numberPopup);
    }
  });

  initExamEndFlow();
  initExamResultModal();
  initExamPanZoom();

  document.querySelectorAll(".ws-nav-btn[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("is-placeholder")) {
        showToast("추후 구현 예정입니다.");
        return;
      }
      switchSidebarPanel(btn.dataset.panel);
    });
  });

  document.querySelectorAll(".ws-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMobileTab(btn.dataset.tab));
  });

  document.getElementById("ws-timer-start")?.addEventListener("click", () => {
    if (state.timerRunning) return;
    state.timerRunning = true;
    timerInterval = setInterval(() => {
      state.timerSeconds++;
      const ws = getActiveWorkspace();
      if (ws) ws.timerSeconds = state.timerSeconds;
      updateTimerDisplay();
      if (state.timerSeconds % 30 === 0) scheduleSave();
    }, 1000);
  });
  document.getElementById("ws-timer-pause")?.addEventListener("click", () => {
    state.timerRunning = false;
    clearInterval(timerInterval);
    scheduleSave();
  });
  document.getElementById("ws-timer-reset")?.addEventListener("click", () => {
    clearInterval(timerInterval);
    state.timerRunning = false;
    state.timerSeconds = 0;
    const ws = getActiveWorkspace();
    if (ws) ws.timerSeconds = 0;
    updateTimerDisplay();
    scheduleSave();
  });

  els.previewBtn?.addEventListener("click", () => {
    syncAnswerPageToState();
    previewController?.open();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      applyPanelRatio(state.panelRatio);
      if (!isDesktopSplit()) setMobileTab(state.mobileTab);
      await refitExamIfNeeded();
    }, 200);
  });
}

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

async function init() {
  cacheElements();
  bindVerticalResizer();
  initPreviewModal();
  initFloatingToolbar();
  initNumberPopup();
  bindEvents();
  applyViewMode("equal");
  switchSidebarPanel("timer");
  updateDrawToolUi();
  await restoreSession();
  if (VIEW_PRESETS[state.viewMode]) applyPanelRatio(VIEW_PRESETS[state.viewMode]);
  else applyPanelRatio(state.panelRatio);
  floatToolbar?.restore();
  applyAnswerTypography(getAnswerTypography(), { save: false });
}

if (typeof window !== "undefined") {
  window.__workspaceAnswerExportState = () => {
    answerDocController?.flushPersist?.();
    syncAnswerPageToState();
    return {
      answerSheet: stripFormatSpansFromSheet(normalizeAnswerPages(state.answerSheet)),
      docTitle: state.docTitle,
      answerFontSize: state.answerFontSize,
      answerLetterSpacing: state.answerLetterSpacing,
      answerTypography: getAnswerTypography(),
      clones: answerDocController?.cloneAllSheets?.() || [],
    };
  };

  window.__workspaceExamUx = {
    getScale: () => state.scale,
    getDrawTool: () => state.drawTool,
    getPageViews: () => getActiveWorkspace()?.pageViews || {},
    saveCurrentPageView,
    getExamScroll: () => ({
      scrollLeft: els.exam?.scrollLeft || 0,
      scrollTop: els.exam?.scrollTop || 0,
    }),
  };

  window.__workspaceExamEnd = {
    collectSubmissionStats,
    buildFullAnswerPlainText: () => buildFullAnswerPlainText(normalizeAnswerPages(state.answerSheet)),
    finalizeExamEnd,
    runFeedbackForAttempt,
    getLastAttempt: () => currentExamAttempt,
    saveExamAttempt,
    getExamAttempt,
  };
}

init();
