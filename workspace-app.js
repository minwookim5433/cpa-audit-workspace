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
import { TOOLS, createDrawController, isDrawingTool, isInteractTool, normalizeDrawTool } from "./workspace-draw-tools.js";
import { applyDrawToolCursor, CURSOR_SPECS } from "./workspace-draw-cursors.js";
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
  MIN_EXAM_SCALE,
  MAX_EXAM_SCALE,
  BUTTON_ZOOM_STEP,
} from "./workspace-exam-pan-zoom.js";
import { createFloatingToolbar, updateFloatingToolUi } from "./workspace-floating-toolbar.js";
import { createFloatingTimer, loadTimerPosition } from "./workspace-floating-timer.js";
import { createPreviewController } from "./workspace-answer-preview.js";
import { stripFormatSpansFromSheet, hasMeaningfulAnswerContent, normalizeAnswerText, plainTextFromHtml } from "./workspace-answer-format.js";
import { saveExamAttempt, getExamAttempt } from "./workspace-exam-attempts.js";
import { createExamResultController } from "./workspace-exam-result.js";
import {
  openWorkspaceDb,
  PDF_STORE,
  TEMPLATE_STORE,
} from "./workspace-attempt-db.js";
import { initAttemptBridge } from "./workspace-attempt-bridge.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.mjs";

const STORAGE_KEY = "cpa-workspace-session";
const DEFAULT_PANEL_RATIO = 0.5;
const VIEW_PRESETS = {
  equal: 0.5,
  exam: 0.65,
  answer: 0.35,
};
const MIN_EXAM_RATIO = 0.35;
const MIN_ANSWER_RATIO = 0.35;
const DEFAULT_TIMER_DURATION = 120 * 60;

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
  timerDurationSeconds: DEFAULT_TIMER_DURATION,
  timerRemainingSeconds: DEFAULT_TIMER_DURATION,
  timerPos: loadTimerPosition(),
  searchQuery: "",
  searchResults: [],
  searchIdx: 0,
  drawTool: TOOLS.view,
  lineColor: "red",
  highlightColor: "yellow",
  penColor: "red",
  penWidth: "thin",
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
  circledNumberSession: null,
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
let answerDocController = null;
let examResultController = null;
let currentExamAttempt = null;
let attemptBridge = null;
let floatToolbar = null;
let floatToolbarReady = false;
let floatingTimer = null;

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
    usageGuide: "ws-usage-guide",
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
    viewModes: "ws-view-modes",
    floatingTimer: "ws-floating-timer",
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
    drawUndoActions: [],
    drawRedoActions: [],
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
    circledNumberSession: null,
    timerDurationSeconds: DEFAULT_TIMER_DURATION,
    timerRemainingSeconds: DEFAULT_TIMER_DURATION,
    answerFontSize: DEFAULT_ANSWER_FONT_SIZE,
    answerLetterSpacing: DEFAULT_ANSWER_LETTER_SPACING,
    attemptMemo: "",
    attemptTags: [],
    attemptStatus: "draft",
  };
}

function ensureWorkspace(fingerprint) {
  if (!state.workspaces[fingerprint]) {
    state.workspaces[fingerprint] = createWorkspace();
  }
  const ws = state.workspaces[fingerprint];
  if (!ws.drawUndoActions) ws.drawUndoActions = [];
  if (!ws.drawRedoActions) ws.drawRedoActions = [];
  if (ws.timerDurationSeconds == null) {
    const elapsed = Number(ws.timerSeconds) || 0;
    ws.timerDurationSeconds = DEFAULT_TIMER_DURATION;
    ws.timerRemainingSeconds = Math.max(0, DEFAULT_TIMER_DURATION - elapsed);
  }
  if (ws.timerRemainingSeconds == null) ws.timerRemainingSeconds = ws.timerDurationSeconds;
  return ws;
}

function getTimerElapsedSeconds() {
  const duration = state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  const remaining = state.timerRemainingSeconds ?? duration;
  return Math.max(0, duration - remaining);
}

function syncTimerToWorkspace(ws) {
  if (!ws) return;
  ws.timerDurationSeconds = state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  ws.timerRemainingSeconds = state.timerRemainingSeconds ?? ws.timerDurationSeconds;
  ws.timerSeconds = getTimerElapsedSeconds();
}

function applyTimerFromWorkspace(ws) {
  state.timerDurationSeconds = ws?.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  state.timerRemainingSeconds = ws?.timerRemainingSeconds ?? state.timerDurationSeconds;
  state.timerSeconds = getTimerElapsedSeconds();
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
    state.timerDurationSeconds = DEFAULT_TIMER_DURATION;
    state.timerRemainingSeconds = DEFAULT_TIMER_DURATION;
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
  applyTimerFromWorkspace(ws);
  state.listMode = null;
  state.caretOffset = ws.caretOffset ?? 0;
  state.circledNumberSession = ws.circledNumberSession || null;
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
  syncTimerToWorkspace(ws);
  ws.listMode = null;
  ws.caretOffset = state.caretOffset;
  ws.circledNumberSession = state.circledNumberSession || null;
  ws.answerFontSize = clampAnswerFontSize(state.answerFontSize);
  ws.answerLetterSpacing = clampAnswerLetterSpacing(state.answerLetterSpacing);
  ws.searchQuery = state.searchQuery;
  ws.searchResults = state.searchResults;
  ws.searchIdx = state.searchIdx;
}

function updateExamHint() {
  const hasPdf = Boolean(state.pdfDoc);
  if (els.usageGuide) els.usageGuide.hidden = hasPdf;
  if (els.examPages) els.examPages.hidden = !hasPdf;
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
  return openWorkspaceDb();
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
    attemptBridge?.flushAttemptDraft?.();
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
  attemptBridge?.markAttemptDirty?.();
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => {
    try {
      saveSession();
      attemptBridge?.flushAttemptDraft?.();
      setSaveStatus("saved");
    } catch (err) {
      console.warn("Save failed:", err);
      setSaveStatus("error");
    }
  }, 800);
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
        year: s.year ?? null,
        documentId: s.documentId || "",
        sourceType: s.sourceType || "custom",
      })),
      activeSlotIndex: state.activeSlotIndex,
      workspaces: state.workspaces,
      panelRatio: state.panelRatio,
      viewMode: state.viewMode,
      mobileTab: state.mobileTab,
      hasTemplate: Boolean(state.sheetTemplate?.dataUrl),
      timerRunning: state.timerRunning,
      timerDurationSeconds: state.timerDurationSeconds,
      timerRemainingSeconds: state.timerRemainingSeconds,
      timerPos: state.timerPos,
      drawTool: state.drawTool,
      lineColor: state.lineColor,
      highlightColor: state.highlightColor,
      penColor: state.penColor,
      penWidth: state.penWidth,
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

async function refreshWorkspaceUi() {
  setupAnswerEditor();
  updateAnswerPageNav();
  updateRowStats();
  updateTimerDisplay();
  updatePageNav();
  refreshBookmarkPanel();
  bindDrawController();
  drawController?.refresh();
  updateDrawToolUi();
  updateTypographyUi();
  attemptBridge?.syncMemoPanelForActive?.();
}

async function loadPdfSlotFromFingerprint(fingerprint, fileName, documentId, sourceType) {
  const existing = state.pdfSlots.find((s) => s.fingerprint === fingerprint);
  if (existing) {
    if (documentId && !existing.documentId) existing.documentId = documentId;
    return existing;
  }

  const stored = await loadPdfFromDb(fingerprint);
  if (!stored?.buffer) return null;

  let pdfDoc;
  try {
    pdfDoc = await loadPdfDocument(stored.buffer.slice(0));
  } catch (err) {
    console.warn("PDF load for problem failed:", err);
    return null;
  }

  syncToSlot();
  const slot = {
    fingerprint,
    name: fileName || stored.name || "problem.pdf",
    title: (fileName || stored.name || "problem.pdf").replace(/\.pdf$/i, ""),
    year: null,
    documentId: documentId || "",
    sourceType: sourceType || "custom",
  };
  state.pdfSlots.push(slot);
  state.activeSlotIndex = state.pdfSlots.length - 1;
  pdfDocs[fingerprint] = pdfDoc;
  ensureWorkspace(fingerprint);
  if (!slot.documentId && stored.buffer) {
    const doc = await attemptBridge.registerUploadedDocument(
      stored.buffer,
      { name: slot.name, size: stored.buffer.byteLength },
      pdfDoc.numPages,
      fingerprint
    );
    slot.documentId = doc.id;
    slot.sourceType = doc.sourceType;
    slot.year = doc.year ?? null;
  }
  syncFromSlot();
  state.pageCount = pdfDoc.numPages;
  state.currentPage = 1;
  await ensureFitWidthScale({ force: true });
  await renderExamOrThrow();
  updateExamHint();
  updatePageNav();
  renderDocSelect();
  renderPdfManageList();
  refreshBookmarkPanel();
  setupAnswerEditor();
  updateAnswerPageNav();
  updateRowStats();
  scheduleSave();
  return slot;
}

async function openForProblem(problem, { promptAttempts = true } = {}) {
  if (!problem) return;
  attemptBridge?.setActiveProblem?.(problem);

  if (problem.legacyFingerprint) {
    const slot = await loadPdfSlotFromFingerprint(
      problem.legacyFingerprint,
      problem.pdfFileName || problem.attachments?.[0]?.fileName,
      problem.documentId,
      problem.source
    );
    if (slot) {
      const idx = state.pdfSlots.findIndex((s) => s.fingerprint === problem.legacyFingerprint);
      if (idx >= 0 && idx !== state.activeSlotIndex) {
        await switchPdfSlot(problem.legacyFingerprint);
      }
    }
    if (problem.examPage && state.pdfDoc) {
      await goToPage(problem.examPage);
    }
  }

  if (promptAttempts) {
    await attemptBridge?.onDocumentReady?.({ forcePrompt: true });
  } else {
    await attemptBridge?.onDocumentReady?.();
  }
  showToast(`「${problem.title}」 풀이를 시작합니다.`);
}

function captureExamThumbnail() {
  const canvas = document.querySelector("#ws-exam-pages canvas");
  if (!canvas || canvas.width === 0) return null;
  try {
    return canvas.toDataURL("image/jpeg", 0.75);
  } catch {
    return null;
  }
}

async function openSaveToLibraryModal() {
  const slot = getActiveSlot();
  if (!slot?.fingerprint) {
    showToast("먼저 PDF 시험지를 열어주세요.");
    return;
  }
  const ws = getActiveWorkspace();
  const modal = document.getElementById("pl-save-current-modal");
  if (!modal) return;
  document.getElementById("pl-save-lib-pdf").textContent = `PDF: ${slot.name} · ${state.currentPage}쪽`;
  document.getElementById("pl-save-source").value = slot.sourceType || "custom";
  document.getElementById("pl-save-notes").value = ws?.attemptMemo || "";
  document.getElementById("pl-save-tags").value = (ws?.attemptTags || []).join(", ");
  modal.hidden = false;
  document.body.classList.add("ws-modal-open");
}

async function submitSaveToLibrary() {
  const slot = getActiveSlot();
  const ws = getActiveWorkspace();
  if (!slot) return;
  const { saveProblemFromWorkspace } = await import("./workspace-problem-service.js");
  const meta = {
    source: document.getElementById("pl-save-source")?.value,
    year: document.getElementById("pl-save-year")?.value || null,
    problemNumber: document.getElementById("pl-save-number")?.value?.trim() || "",
    questionNumber: document.getElementById("pl-save-question")?.value?.trim() || "",
    notes: document.getElementById("pl-save-notes")?.value?.trim() || "",
    tags: (document.getElementById("pl-save-tags")?.value || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const thumbnail = captureExamThumbnail();
  const problem = await saveProblemFromWorkspace({ slot, workspace: ws, state, meta, thumbnail });
  document.getElementById("pl-save-current-modal").hidden = true;
  document.body.classList.remove("ws-modal-open");
  showToast("Library에 저장했습니다.");
  window.__problemLibraryRefresh?.();
  window.__appSwitchMainView?.("library");
  window.__problemLibraryRefresh?.();
  setTimeout(() => window.__problemLibraryOpenDetail?.(problem.id), 300);
}

async function switchPdfSlot(fingerprint) {
  const idx = state.pdfSlots.findIndex((s) => s.fingerprint === fingerprint);
  if (idx < 0) return;
  if (idx === state.activeSlotIndex && state.pdfDoc) return;

  if (attemptBridge) {
    const ok = await attemptBridge.promptSaveIfDirty();
    if (!ok) return;
  }

  syncToSlot();
  state.activeSlotIndex = idx;
  syncFromSlot();
  renderDocSelect();

  if (state.pdfDoc) {
    await ensureFitWidthScale({ force: true });
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
  await attemptBridge?.onDocumentReady?.();
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
    await ensureFitWidthScale({ force: true });
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

async function ensureFitWidthScale({ force = false } = {}) {
  if (!state.pdfDoc) return;
  if (state.manualZoom && !force) return;
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
  if (state.manualZoom && !state.fitWidth) return;
  await ensureFitWidthScale({ force: true });
  await renderExam();
  updatePageNav();
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

function pushDrawUndoAction(action) {
  const ws = getActiveWorkspace();
  if (!ws || !action) return;
  if (!ws.drawUndoActions) ws.drawUndoActions = [];
  ws.drawUndoActions.push(action);
  if (ws.drawUndoActions.length > 40) ws.drawUndoActions.shift();
  ws.drawRedoActions = [];
}

function applyDrawUndoAction(action, reverse = true) {
  if (!action) return;
  if (action.type === "add") {
    if (reverse) {
      state.drawAnnotations = state.drawAnnotations.filter((a) => a.id !== action.annotation.id);
    } else {
      const anns = [...state.drawAnnotations];
      const idx = Math.min(Math.max(action.index, 0), anns.length);
      anns.splice(idx, 0, action.annotation);
      state.drawAnnotations = anns;
    }
  } else if (action.type === "delete-annotation") {
    if (reverse) {
      const anns = [...state.drawAnnotations];
      const idx = Math.min(Math.max(action.index, 0), anns.length);
      anns.splice(idx, 0, action.annotation);
      state.drawAnnotations = anns;
    } else {
      state.drawAnnotations = state.drawAnnotations.filter((a) => a.id !== action.annotation.id);
    }
  }
}

function pushDrawUndo() {
  /* legacy no-op — action stack 사용 */
}


function bindDrawController() {
  const layer = getDrawInteractLayer();
  if (!layer) return;

  if (!drawController) {
    drawController = createDrawController({
      getContainer: getPageContainer,
      getInteractLayer: getDrawInteractLayer,
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
        penColor: state.penColor,
        penWidth: state.penWidth,
        pageNumber: state.currentPage,
        pdfFingerprint: state.pdfFingerprint,
      }),
      onChange: (action) => {
        if (action?.type === "add") pushDrawUndoAction(action);
        scheduleSave();
      },
      onDelete: (action) => {
        if (action?.type === "delete-annotation") pushDrawUndoAction(action);
        scheduleSave();
      },
    });
    drawController.bind(layer);
  } else {
    drawController.bind(layer);
    drawController.refresh();
  }
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
  if (!before) {
    showToast("삭제할 주석이 없습니다.");
    return;
  }
  if (!window.confirm("현재 페이지의 모든 주석을 삭제하시겠습니까?")) return;
  state.drawAnnotations = state.drawAnnotations.filter(
    (a) => !(a.pdfFingerprint === fp && a.pageNumber === page)
  );
  const ws = getActiveWorkspace();
  if (ws) ws.drawAnnotations = state.drawAnnotations;
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
  const tool = normalizeDrawTool(state.drawTool);
  updateFloatingToolUi(tool, {
    lineColor: state.lineColor,
    highlightColor: state.highlightColor,
    penColor: state.penColor,
    penWidth: state.penWidth,
  });
  document.querySelectorAll(".ws-exam-tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tool === tool);
  });
  const colorWrap = document.getElementById("ws-exam-color-wrap");
  const lineSel = document.getElementById("ws-exam-line-color");
  const hiSel = document.getElementById("ws-exam-highlight-color");
  const penColorSel = document.getElementById("ws-exam-pen-color");
  const penWidthSel = document.getElementById("ws-exam-pen-width");
  if (colorWrap) {
    const annotating = isDrawingTool(tool);
    colorWrap.hidden = !annotating;
    if (lineSel) {
      const show = tool === TOOLS.underline;
      lineSel.hidden = !show;
      lineSel.style.display = show ? "" : "none";
    }
    if (hiSel) {
      const show = tool === TOOLS.highlighter;
      hiSel.hidden = !show;
      hiSel.style.display = show ? "" : "none";
    }
    if (penColorSel) {
      const show = tool === TOOLS.pen;
      penColorSel.hidden = !show;
      penColorSel.style.display = show ? "" : "none";
    }
    if (penWidthSel) {
      const show = tool === TOOLS.pen;
      penWidthSel.hidden = !show;
      penWidthSel.style.display = show ? "" : "none";
    }
  }
  if (lineSel && state.lineColor) lineSel.value = state.lineColor;
  if (hiSel && state.highlightColor) hiSel.value = state.highlightColor;
  if (penColorSel && state.penColor) penColorSel.value = state.penColor;
  if (penWidthSel && state.penWidth) penWidthSel.value = state.penWidth;

  const layer = getDrawInteractLayer();
  const scroll = els.exam;
  const pageContainer = getPageContainer();
  const annotating = isInteractTool(tool);
  if (scroll) {
    scroll.classList.toggle("is-annotation-mode", annotating);
    applyDrawToolCursor(scroll, annotating ? tool : TOOLS.view);
  }
  if (pageContainer) {
    pageContainer.classList.toggle("is-annotation-mode", annotating);
  }
  if (layer) {
    applyDrawToolCursor(layer, annotating ? tool : TOOLS.view);
    drawController?.syncInteractLayer?.();
  }
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
        circledNumberSession: state.circledNumberSession,
        answerFontSize: state.answerFontSize,
        answerLetterSpacing: state.answerLetterSpacing,
        editStarted: false,
        workspaceUndo: getActiveWorkspace(),
      }),
      setState: (patch) => {
        if (patch.sheet) state.answerSheet = patch.sheet;
        if (patch.pageIndex != null) state.answerSheetPage = patch.pageIndex;
        if (patch.caretOffset != null) state.caretOffset = patch.caretOffset;
        if (patch.circledNumberSession !== undefined) state.circledNumberSession = patch.circledNumberSession;
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

function countWrittenAnswerPages(answerSheet) {
  const pages = stripFormatSpansFromSheet(normalizeAnswerPages(answerSheet));
  return pages.filter((page) => hasMeaningfulAnswerContent(String(page ?? ""))).length;
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
    timerSeconds: getTimerElapsedSeconds(),
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

function getExamPdfMeta() {
  const slot = getActiveSlot();
  const problem = attemptBridge?.getActiveProblem?.();
  return {
    year: problem?.year ?? slot?.year ?? null,
    docTitle: state.docTitle || slot?.title || "",
    documentTitle: state.docTitle || slot?.title || "",
    pdfName: state.pdfName || slot?.name || "",
    fileName: slot?.name || "",
  };
}

async function finalizeExamEnd() {
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

  const attempt = await attemptBridge.saveCompletedAttempt({
    pdfSaved: false,
    pdfFilename: "",
  });
  currentExamAttempt = attempt;
  showStatus("시험이 종료되었습니다. PDF 저장 버튼으로 답안지를 저장하세요.", "success");
  examResultController?.open(attempt);
}

function retryExamFromResult() {
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.timerRemainingSeconds = state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  state.timerSeconds = 0;
  state.answerSheet = createEmptyAnswerSheet();
  state.answerSheetPage = 0;
  state.caretOffset = 0;
  state.circledNumberSession = null;
  const ws = getActiveWorkspace();
  if (ws) {
    ws.timerRemainingSeconds = state.timerRemainingSeconds;
    ws.timerSeconds = 0;
    ws.answerSheet = createEmptyAnswerSheet();
    ws.answerSheetPage = 0;
    ws.caretOffset = 0;
    ws.circledNumberSession = null;
  }
  setupAnswerEditor();
  updateTimerDisplay();
  updateRowStats();
  scheduleSave();
  showToast("답안이 초기화되었습니다. 다시 풀어보세요.");
}

function initExamEndFlow() {
  document.getElementById("ws-exam-end-continue")?.addEventListener("click", () => {
    const modal = document.getElementById("ws-exam-end-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("ws-modal-open");
  });

  document.getElementById("ws-exam-end-confirm")?.addEventListener("click", () => {
    finalizeExamEnd();
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
    pdfStatusEl: document.getElementById("ws-exam-result-pdf-status"),
    tabButtons: [...modal.querySelectorAll(".ws-result-tab")],
    panels: [...modal.querySelectorAll(".ws-result-panel")],
    retryBtn: document.getElementById("ws-exam-result-retry"),
    exportPdfBtn: document.getElementById("ws-exam-result-export-pdf"),
    closeBtn: document.getElementById("ws-exam-result-close"),
    finishBtn: document.getElementById("ws-exam-result-finish"),
    onRetryExam: retryExamFromResult,
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
      drawController?.cancelActive?.();
      state.drawTool = tool;
      updateDrawToolUi();
      drawController?.refresh();
      scheduleSave();
    },
    onAction: (action, value) => {
      if (action === "lineColor") state.lineColor = value;
      else if (action === "highlightColor") state.highlightColor = value;
      else if (action === "penColor") state.penColor = value;
      else if (action === "penWidth") state.penWidth = value;
      else if (action === "undo") undoLastDrawAnnotation();
      else if (action === "redo") handleDrawRedo();
      else if (action === "deleteSelected") showToast("지우개 도구는 지원하지 않습니다.");
      else if (action === "clearPage") clearPageDrawAnnotations();
      else if (action === "savePosition") scheduleSave();
    },
  });
}

function initFloatingTimerWidget() {
  if (floatingTimer) return;
  const root = document.getElementById("ws-floating-timer");
  if (!root) return;

  floatingTimer = createFloatingTimer({
    rootEl: root,
    dragHandleEl: document.getElementById("ws-floating-timer-drag"),
    displayEl: document.getElementById("ws-timer-display"),
    startBtn: document.getElementById("ws-timer-start"),
    resetBtn: document.getElementById("ws-timer-reset"),
    settingsBtn: document.getElementById("ws-timer-settings"),
    settingsPanelEl: document.getElementById("ws-timer-settings-panel"),
    presetButtons: [...root.querySelectorAll("[data-timer-minutes]")],
    customInputEl: document.getElementById("ws-timer-custom-min"),
    customApplyBtn: document.getElementById("ws-timer-custom-apply"),
    examEndBtn: document.getElementById("ws-exam-end-btn"),
    getState: () => ({
      timerRunning: state.timerRunning,
      timerDurationSeconds: state.timerDurationSeconds,
      timerRemainingSeconds: state.timerRemainingSeconds,
      timerPos: state.timerPos,
    }),
    setState: (patch) => {
      if (patch.timerPos) state.timerPos = patch.timerPos;
    },
    onStartPause: () => toggleTimerRunning(),
    onReset: () => resetTimerCountdown(),
    onDurationChange: (minutes) => setTimerDurationMinutes(minutes),
    onExamEnd: () => {
      if (!state.pdfFingerprint) {
        showToast("시험지를 먼저 추가해주세요.");
        return;
      }
      showExamEndModal();
    },
    onSave: () => scheduleSave(),
  });
}

function setTimerDurationMinutes(minutes) {
  const clamped = Math.max(1, Math.min(300, Number(minutes) || 120));
  const seconds = clamped * 60;
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.timerDurationSeconds = seconds;
  state.timerRemainingSeconds = seconds;
  state.timerSeconds = 0;
  syncTimerToWorkspace(getActiveWorkspace());
  updateTimerDisplay();
  scheduleSave();
}

function toggleTimerRunning() {
  if (state.timerRunning) {
    pauseTimer();
    floatingTimer?.refreshDisplay();
    return;
  }
  if ((state.timerRemainingSeconds ?? 0) <= 0) {
    state.timerRemainingSeconds = state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  }
  state.timerRunning = true;
  timerInterval = setInterval(() => {
    if (state.timerRemainingSeconds <= 0) {
      pauseTimer();
      floatingTimer?.refreshDisplay();
      return;
    }
    state.timerRemainingSeconds -= 1;
    state.timerSeconds = getTimerElapsedSeconds();
    syncTimerToWorkspace(getActiveWorkspace());
    updateTimerDisplay();
    if (state.timerRemainingSeconds % 30 === 0) scheduleSave();
  }, 1000);
}

function resetTimerCountdown() {
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.timerRemainingSeconds = state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  state.timerSeconds = 0;
  syncTimerToWorkspace(getActiveWorkspace());
  updateTimerDisplay();
  scheduleSave();
}

function bindCircledNumberButton(buttonId, resetSession) {
  const btn = document.getElementById(buttonId);
  btn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    answerDocController?.flushPersist?.();
    answerDocController?.saveAnswerSelection();
  });
  btn?.addEventListener("click", () => {
    const result = answerDocController?.insertCircledNumber({ resetSession });
    if (result?.ok) {
      state.circledNumberSession = result.session;
      syncAnswerPageToState();
      updateRowStats();
      scheduleSave();
    }
  });
}

function undoLastDrawAnnotation() {
  const ws = getActiveWorkspace();
  if (!ws?.drawUndoActions?.length) {
    showToast("취소할 주석이 없습니다.");
    return;
  }
  const action = ws.drawUndoActions.pop();
  applyDrawUndoAction(action, true);
  ws.drawAnnotations = [...state.drawAnnotations];
  if (!ws.drawRedoActions) ws.drawRedoActions = [];
  ws.drawRedoActions.push(action);
  drawController?.refresh();
  scheduleSave();
  showToast("주석을 실행 취소했습니다.");
}

function handleDrawUndo() {
  undoLastDrawAnnotation();
}

function handleDrawRedo() {
  const ws = getActiveWorkspace();
  if (!ws?.drawRedoActions?.length) return;
  const action = ws.drawRedoActions.pop();
  applyDrawUndoAction(action, false);
  ws.drawAnnotations = [...state.drawAnnotations];
  if (!ws.drawUndoActions) ws.drawUndoActions = [];
  ws.drawUndoActions.push(action);
  drawController?.refresh();
  scheduleSave();
}

function syncAnswerPageToState() {
  const ws = getActiveWorkspace();
  if (ws) {
    ws.answerSheet = stripFormatSpansFromSheet(normalizeAnswerPages(state.answerSheet));
    ws.answerSheetPage = state.answerSheetPage;
    ws.caretOffset = state.caretOffset;
    ws.circledNumberSession = state.circledNumberSession || null;
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
    const sameActive = state.pdfSlots[state.activeSlotIndex]?.fingerprint === fp && state.pdfDoc;
    if (sameActive) {
      await attemptBridge?.onDocumentReady?.({ forcePrompt: true });
    } else {
      await switchPdfSlot(fp);
    }
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

  const slot = {
    fingerprint: fp,
    name: file.name,
    title: file.name.replace(/\.pdf$/i, ""),
    year: null,
    documentId: "",
    sourceType: "custom",
  };
  state.pdfSlots.push(slot);
  state.activeSlotIndex = state.pdfSlots.length - 1;

  pdfDocs[fp] = pdfDoc;
  const ws = ensureWorkspace(fp);
  const doc = await attemptBridge.registerUploadedDocument(storageBuffer, file, pdfDoc.numPages, fp);
  slot.documentId = doc.id;
  slot.sourceType = doc.sourceType;
  slot.year = doc.year ?? null;
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
    await ensureFitWidthScale({ force: true });
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
  await attemptBridge?.onDocumentReady?.({ forcePrompt: true });
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
    await ensureFitWidthScale({ force: true });
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
  state.timerSeconds = getTimerElapsedSeconds();
  if (!els.timerDisplay) return;
  const remaining = state.timerRemainingSeconds ?? state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  els.timerDisplay.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const startBtn = document.getElementById("ws-timer-start");
  if (startBtn) {
    startBtn.textContent = state.timerRunning ? "⏸" : "▶";
    startBtn.title = state.timerRunning ? "일시정지" : "시작";
  }
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
      return { ...getExamPdfMeta(), answerTypography: getAnswerTypography() };
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
        year: data.examYear ?? null,
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
    state.timerDurationSeconds = data.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
    state.timerRemainingSeconds = data.timerRemainingSeconds ?? state.timerDurationSeconds;
    state.timerPos = data.timerPos || loadTimerPosition();
    const savedTool = data.drawTool || TOOLS.view;
    state.drawTool = savedTool === "cursor" ? TOOLS.view : savedTool;
    if (![TOOLS.view, TOOLS.underline, TOOLS.highlighter, TOOLS.pen, TOOLS.eraser].includes(state.drawTool)) {
      state.drawTool = TOOLS.view;
    }
    state.penColor = data.penColor || "red";
    state.penWidth = data.penWidth || "thin";
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
    initFloatingTimerWidget();
    updateDrawToolUi();
    updateTimerDisplay();
    renderDocSelect();
    renderPdfManageList();

    for (const slot of state.pdfSlots) {
      const stored = await loadPdfFromDb(slot.fingerprint);
      if (stored?.buffer) {
        try {
          pdfDocs[slot.fingerprint] = await loadPdfDocument(stored.buffer.slice(0));
          if (attemptBridge && !slot.documentId) {
            const doc = await attemptBridge.registerUploadedDocument(
              stored.buffer,
              { name: slot.name, size: stored.buffer.byteLength },
              pdfDocs[slot.fingerprint]?.numPages || 0,
              slot.fingerprint
            );
            slot.documentId = doc.id;
            slot.sourceType = doc.sourceType;
            slot.year = doc.year ?? slot.year ?? null;
          }
        } catch (err) {
          console.warn(`PDF restore failed for ${slot.name}:`, err);
        }
      }
    }

    const docMap = {};
    state.pdfSlots.forEach((s) => {
      if (s.documentId) docMap[s.fingerprint] = s.documentId;
    });
    await attemptBridge?.migrateLegacy?.(docMap);

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
      if (state.manualZoom && !state.fitWidth) {
        await renderExamOrThrow();
      } else {
        await ensureFitWidthScale({ force: true });
        await renderExamOrThrow();
      }
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
    await attemptBridge?.onDocumentReady?.();
    await attemptBridge?.refreshHistory?.();
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
    await applyExamScale(state.scale + BUTTON_ZOOM_STEP, { manualZoom: true, fitWidth: false });
  });
  document.getElementById("ws-zoom-out")?.addEventListener("click", async () => {
    await applyExamScale(state.scale - BUTTON_ZOOM_STEP, { manualZoom: true, fitWidth: false });
  });
  document.getElementById("ws-fit-width")?.addEventListener("click", async () => {
    state.fitWidth = true;
    state.manualZoom = false;
    await ensureFitWidthScale({ force: true });
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
      drawController?.cancelActive?.();
      state.drawTool = btn.dataset.tool;
      updateDrawToolUi();
      drawController?.refresh();
      scheduleSave();
    });
  });

  document.getElementById("ws-exam-pen-color")?.addEventListener("change", (e) => {
    state.penColor = e.target.value;
    scheduleSave();
  });
  document.getElementById("ws-exam-pen-width")?.addEventListener("change", (e) => {
    state.penWidth = e.target.value;
    scheduleSave();
  });
  document.getElementById("ws-annot-undo")?.addEventListener("click", () => undoLastDrawAnnotation());
  document.getElementById("ws-annot-clear-page")?.addEventListener("click", () => clearPageDrawAnnotations());

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
    if (e.key === "Delete" && !isEditableTarget(e.target)) {
      /* 주석 개별 삭제(지우개)는 MVP에서 미지원 */
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

  bindCircledNumberButton("ws-number", false);
  bindCircledNumberButton("ws-number-from-one", true);

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

  initExamEndFlow();
  initExamResultModal();

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

  els.previewBtn?.addEventListener("click", () => {
    syncAnswerPageToState();
    previewController?.open();
  });

  document.getElementById("ws-save-library-btn")?.addEventListener("click", () => openSaveToLibraryModal());
  document.getElementById("pl-save-current-modal")?.addEventListener("click", (e) => {
    if (e.target.matches("[data-save-lib-close]")) {
      document.getElementById("pl-save-current-modal").hidden = true;
      if (!document.querySelector(".ws-modal:not([hidden])")) document.body.classList.remove("ws-modal-open");
    }
    if (e.target.matches("[data-save-lib-submit]")) submitSaveToLibrary();
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

export async function initWorkspace() {
  cacheElements();
  bindVerticalResizer();
  initPreviewModal();
  initFloatingToolbar();
  initFloatingTimerWidget();
  bindEvents();
  applyViewMode("equal");
  updateDrawToolUi();

  attemptBridge = initAttemptBridge({
    state,
    getActiveWorkspace,
    getActiveSlot,
    collectSubmissionStats,
    countLinesFn: (pages) => {
      const editor = answerDocController?.getEditorEl?.();
      return countUsedRows(pages, (text) => countPageUsedRowsFromText(text, editor));
    },
    refreshWorkspaceUi,
    showToast,
    setSaveStatus,
    examResultController,
  });
  window.__workspaceOpenForProblem = openForProblem;
  window.__workspaceSwitchPdf = switchPdfSlot;
  window.__workspaceAttemptBridge = attemptBridge;

  await restoreSession();
  if (VIEW_PRESETS[state.viewMode]) applyPanelRatio(VIEW_PRESETS[state.viewMode]);
  else applyPanelRatio(state.panelRatio);
  floatToolbar?.restore();
  floatingTimer?.restore();
  updateTimerDisplay();
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

  window.__workspaceTimer = () => ({
    running: state.timerRunning,
    remaining: state.timerRemainingSeconds,
    duration: state.timerDurationSeconds,
  });

  window.__workspaceExamUx = {
    getScale: () => state.scale,
    getDrawTool: () => state.drawTool,
    getDrawAnnotations: () => state.drawAnnotations,
    getPageViews: () => getActiveWorkspace()?.pageViews || {},
    saveCurrentPageView,
    getExamScroll: () => ({
      scrollLeft: els.exam?.scrollLeft || 0,
      scrollTop: els.exam?.scrollTop || 0,
    }),
    normFromClient: (clientX, clientY) => {
      const container = document.querySelector(".pdf-page-container");
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
        px: clientX - rect.left,
        py: clientY - rect.top,
        w: rect.width,
        h: rect.height,
      };
    },
    getCursorSpecs: () => ({ ...CURSOR_SPECS }),
    flushSave: () => {
      clearTimeout(saveDebounce);
      saveSession();
    },
  };

  window.__workspaceExamEnd = {
    collectSubmissionStats,
    finalizeExamEnd,
    getLastAttempt: () => currentExamAttempt,
    saveExamAttempt,
    getExamAttempt,
  };
}
