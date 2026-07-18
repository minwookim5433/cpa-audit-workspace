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
import {
  searchPdfDocument,
  renderSearchResults,
  getPageTextCache,
  clearPageTextCache,
  clearAllPageTextCaches,
} from "./workspace-search.js";
import { createBookmark, renderBookmarkPanel } from "./workspace-bookmarks.js";
import { TOOLS, createDrawController, isDrawingTool, isInteractTool, normalizeDrawTool, getAnnotationSurface } from "./workspace-draw-tools.js";
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
import { createFloatingTimer, loadTimerPosition } from "./workspace-floating-timer.js";
import { createPreviewController } from "./workspace-answer-preview.js";
import { renderAnswerSymbolToolbar } from "./workspace-answer-symbols.js";
import { stripFormatSpansFromSheet, hasMeaningfulAnswerContent, normalizeAnswerText, plainTextFromHtml } from "./workspace-answer-format.js";
import { saveExamAttempt, getExamAttempt } from "./workspace-exam-attempts.js";
import { createExamResultController } from "./workspace-exam-result.js";
import {
  openWorkspaceDb,
  PDF_STORE,
  TEMPLATE_STORE,
} from "./workspace-attempt-db.js";
import { initAttemptBridge } from "./workspace-attempt-bridge.js";
import { getAuthUserId } from "./workspace-auth.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.mjs";

const LEGACY_STORAGE_KEY = "cpa-workspace-session";
let currentUserId = null;
const DEFAULT_PANEL_RATIO = 0.5;
const VIEW_PRESETS = {
  equal: 0.5,
  exam: 0.62,
  answer: 0.38,
};
const MIN_EXAM_RATIO = 0.35;
const MIN_ANSWER_RATIO = 0.35;
const DEFAULT_TIMER_DURATION = 120 * 60;
const PDF_UPLOAD_WARN_BYTES = 30 * 1024 * 1024;
const PDF_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const PDF_UPLOAD_MOBILE_WARN_BYTES = 20 * 1024 * 1024;
const PDF_PAGE_COUNT_NOTICE = 300;

const pdfDocs = {};
const pdfLoadPromises = {};

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
  searchHighlightDismissed: false,
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
let searchRunToken = 0;
let searchDebounceTimer = null;
const SEARCH_DEBOUNCE_MS = 350;
const EXAM_SEARCH_UNSUPPORTED_MSG = "이 시험지는 텍스트 검색을 지원하지 않습니다.";
let timerInterval = null;
let saveDebounce = null;
let previewController = null;
let drawControllerExam = null;
let drawControllerAnswer = null;
let activeDrawSurface = "exam";
let answerDocController = null;
let examResultController = null;
let currentExamAttempt = null;
let attemptBridge = null;
let floatingTimer = null;
let workspaceDomBound = false;
let logoutCleanupInProgress = false;

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
    pageCurrent: "ws-page-current",
    pageLabel: "ws-page-label",
    ansPrev: "ws-ans-prev",
    ansNext: "ws-ans-next",
    ansPageInput: "ws-ans-page-input",
    ansPageLabel: "ws-ans-page-label",
    wrongNotesList: "ws-wrong-notes-list",
    statsDashboard: "ws-stats-dashboard",
    timerDisplay: "ws-float-timer-display",
    headerExamTools: "ws-header-exam-tools",
    toast: "ws-toast",
    searchInput: "ws-search-input",
    searchResults: "ws-search-results",
    searchNotice: "ws-search-notice",
    examSearchInput: "ws-exam-search-input",
    examSearchBar: "ws-exam-search-bar",
    examSearchPrev: "ws-exam-search-prev",
    examSearchNext: "ws-exam-search-next",
    examSearchStatus: "ws-exam-search-status",
    examSearchNotice: "ws-exam-search-notice",
    bookmarkPanel: "ws-bookmark-panel",
    rowStats: "ws-row-stats",
    saveStatus: "ws-save-status",
    splitPane: "ws-split-pane",
    paneExam: "ws-pane-exam",
    paneAnswer: "ws-pane-answer",
    vResizer: "ws-v-resizer",
    answerPreviewBtn: "ws-answer-preview-btn",
    previewModal: "ws-preview-modal",
    mobileTabs: "ws-mobile-tabs",
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
    els.saveStatus.textContent = "임시저장 중…";
    els.saveStatus.className = "ws-save-status is-pending";
  } else if (kind === "error") {
    els.saveStatus.textContent = "임시저장 실패";
    els.saveStatus.className = "ws-save-status is-error";
  } else if (kind === "savedDb") {
    els.saveStatus.textContent = "임시저장 완료";
    els.saveStatus.className = "ws-save-status";
  } else {
    els.saveStatus.textContent = "저장됨";
    els.saveStatus.className = "ws-save-status";
  }
}

function showResumeBanner(source = "session") {
  const banner = document.getElementById("ws-resume-banner");
  const text = document.getElementById("ws-resume-banner-text");
  if (!banner || !text) return;
  if (source === "cloud") {
    text.textContent =
      "계정에 저장된 풀이를 불러왔습니다. 답안·주석·시험지 페이지·타이머 상태를 이어서 풀 수 있습니다.";
  } else if (source === "draft") {
    text.textContent =
      "저장된 초안을 복원했습니다. 답안·주석·시험지 페이지 위치를 이어서 풀 수 있습니다.";
  } else {
    text.textContent =
      "마지막 풀이 상태를 불러왔습니다. 답안·주석·시험지 페이지 위치를 이어서 풀 수 있습니다.";
  }
  banner.hidden = false;
  clearTimeout(showResumeBanner._timer);
  showResumeBanner._timer = setTimeout(() => {
    banner.hidden = true;
  }, 12000);
}

async function restoreExamViewportFromWorkspace() {
  if (!state.pdfDoc) return;
  await applyExamViewportForCurrentPage();
  scheduleExamFitWidthRefit();
  if (els.searchInput) els.searchInput.value = state.searchQuery || "";
  renderSearchResults(els.searchResults, state.searchResults, state.searchIdx, jumpToSearchResult);
}

async function waitForExamLayout() {
  updateExamHint();
  let lastWidth = 0;
  let stableCount = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const width = getExamScrollClientWidth();
    if (width <= 120) continue;
    if (width === lastWidth) {
      stableCount += 1;
      if (stableCount >= 2) return;
    } else {
      stableCount = 0;
    }
    lastWidth = width;
  }
}

let examViewportObserver = null;
let examFitRefitTimer = null;

function getExamScrollClientWidth() {
  const scrollEl = els.exam;
  if (scrollEl) {
    const rect = scrollEl.getBoundingClientRect();
    if (rect.width > 0) {
      const style = window.getComputedStyle(scrollEl);
      const paddingX =
        (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      return Math.max(200, rect.width - paddingX);
    }
    if (scrollEl.clientWidth > 0) return scrollEl.clientWidth;
  }
  const pane = els.paneExam;
  if (pane) {
    const rect = pane.getBoundingClientRect();
    if (rect.width > 0) return Math.max(200, rect.width - 40);
  }
  return 500;
}

async function applyFitWidthViewport({ restoreScroll = false, pageNum = state.currentPage } = {}) {
  if (!state.pdfDoc) return;

  const ws = getActiveWorkspace();
  state.fitWidth = true;
  state.manualZoom = false;
  if (ws) {
    ws.fitWidth = true;
    ws.manualZoom = false;
  }

  await waitForExamLayout();
  await ensureFitWidthScale({ force: true });
  await renderExam();

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const scaleBeforeConfirm = state.scale;
  await ensureFitWidthScale({ force: true });
  if (Math.abs(state.scale - scaleBeforeConfirm) > 0.005) {
    await renderExam();
  }

  if (els.exam) {
    if (restoreScroll) {
      const saved = getSavedPageView(pageNum || 1);
      els.exam.scrollLeft = saved?.scrollLeft || 0;
      els.exam.scrollTop = saved?.scrollTop || 0;
      clampExamScroll(els.exam);
    } else {
      els.exam.scrollLeft = 0;
      els.exam.scrollTop = 0;
    }
  }

  updatePageNav();
  saveCurrentPageView();
}

function scheduleExamFitWidthRefit() {
  clearTimeout(examFitRefitTimer);
  examFitRefitTimer = setTimeout(async () => {
    if (!state.pdfDoc || state.manualZoom || !state.fitWidth) return;
    const before = state.scale;
    await waitForExamLayout();
    await ensureFitWidthScale({ force: true });
    if (Math.abs(state.scale - before) > 0.005) {
      await renderExam();
      updatePageNav();
      saveCurrentPageView();
    }
  }, 120);

  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      if (!state.pdfDoc || state.manualZoom || !state.fitWidth) return;
      const before = state.scale;
      await ensureFitWidthScale({ force: true });
      if (Math.abs(state.scale - before) > 0.005) {
        await renderExam();
        updatePageNav();
        saveCurrentPageView();
      }
    });
  });
}

function bindExamViewportObserver() {
  if (!els.exam || examViewportObserver) return;

  let lastWidth = 0;
  examViewportObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    const width = entry?.contentRect?.width || 0;
    if (width <= 120) return;
    if (!state.pdfDoc || state.manualZoom || !state.fitWidth) return;
    if (Math.abs(width - lastWidth) < 6) return;
    lastWidth = width;
    scheduleExamFitWidthRefit();
  });
  examViewportObserver.observe(els.exam);
}

async function applyExamViewportForCurrentPage() {
  if (!state.pdfDoc) return;
  await applyFitWidthViewport();
  scheduleExamFitWidthRefit();
}

function resetExamViewportForFreshLoad() {
  state.fitWidth = true;
  state.manualZoom = false;
  state.scale = 1;
  const ws = getActiveWorkspace();
  if (ws) {
    ws.fitWidth = true;
    ws.manualZoom = false;
    ws.scale = 1;
    ws.pageViews = {};
  }
}

function getSessionStorageKey(userId = currentUserId) {
  return userId ? `workspace:${userId}:session` : LEGACY_STORAGE_KEY;
}

async function resolveCurrentUserId() {
  try {
    currentUserId = await getAuthUserId();
  } catch {
    currentUserId = null;
  }
  return currentUserId;
}

function buildSessionPayload() {
  return {
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
  };
}

function pdfFingerprint(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function isPdfFile(file) {
  if (!file) return false;
  return file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
}

function formatFileSizeMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

async function confirmPdfUploadSize(file) {
  const size = Number(file?.size) || 0;
  const sizeMb = formatFileSizeMb(size);

  if (size > PDF_UPLOAD_MAX_BYTES) {
    showStatus(
      `현재 버전에서는 50MB 이하의 PDF만 지원합니다. (선택한 파일: ${sizeMb}MB)`,
      "error"
    );
    return false;
  }

  const isMobile = !isDesktopSplit();

  if (size > PDF_UPLOAD_WARN_BYTES) {
    let msg =
      `선택한 파일: ${sizeMb}MB\n\n` +
      "대용량 PDF는 로딩과 검색에 시간이 오래 걸릴 수 있습니다.\n" +
      "계속 진행하시겠습니까?";
    if (isMobile && size > PDF_UPLOAD_MOBILE_WARN_BYTES) {
      msg +=
        `\n\n모바일 환경에서는 ${formatFileSizeMb(PDF_UPLOAD_MOBILE_WARN_BYTES)}MB를 초과하는 PDF가 더 느릴 수 있습니다.`;
    }
    if (!window.confirm(msg)) return false;
  } else if (isMobile && size > PDF_UPLOAD_MOBILE_WARN_BYTES) {
    const msg =
      `선택한 파일: ${sizeMb}MB\n\n` +
      "모바일 환경에서는 대용량 PDF가 느릴 수 있습니다.\n" +
      "계속 진행하시겠습니까?";
    if (!window.confirm(msg)) return false;
  }

  return true;
}

function maybeShowLargePageCountNotice(pageCount) {
  if (Number(pageCount) > PDF_PAGE_COUNT_NOTICE) {
    showToast("페이지가 많은 PDF는 검색과 페이지 이동이 느릴 수 있습니다.");
  }
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
  normalizeTimerState({ pause: true });
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
  if (els.headerExamTools) els.headerExamTools.hidden = !hasPdf;
}

async function loadPdfDocument(renderBuffer) {
  try {
    return await pdfjsLib.getDocument({ data: renderBuffer }).promise;
  } catch (err) {
    throw Object.assign(new Error(`PDF 파싱 실패: ${err.message || err}`), { phase: "parse" });
  }
}

async function ensurePdfDocLoaded(fingerprint, { registerIfMissing = false } = {}) {
  if (!fingerprint) return null;
  if (pdfDocs[fingerprint]) return pdfDocs[fingerprint];
  if (pdfLoadPromises[fingerprint]) return pdfLoadPromises[fingerprint];

  pdfLoadPromises[fingerprint] = (async () => {
    try {
      const stored = await loadPdfFromDb(fingerprint);
      if (!stored?.buffer) {
        console.warn(`PDF not found in IndexedDB: ${fingerprint}`);
        return null;
      }
      // slice(0): PDF.js worker may detach the buffer passed to getDocument.
      const pdfDoc = await loadPdfDocument(stored.buffer.slice(0));
      pdfDocs[fingerprint] = pdfDoc;

      const slot = state.pdfSlots.find((s) => s.fingerprint === fingerprint);
      if (slot && registerIfMissing && attemptBridge && !slot.documentId) {
        const doc = await attemptBridge.registerUploadedDocument(
          stored.buffer,
          { name: slot.name, size: stored.buffer.byteLength },
          pdfDoc.numPages,
          fingerprint
        );
        slot.documentId = doc.id;
        slot.sourceType = doc.sourceType;
        slot.year = doc.year ?? slot.year ?? null;
        renderDocSelect();
        scheduleSave();
      }

      return pdfDoc;
    } catch (err) {
      console.warn(`PDF load failed for ${fingerprint}:`, err);
      return null;
    } finally {
      delete pdfLoadPromises[fingerprint];
    }
  })();

  return pdfLoadPromises[fingerprint];
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

async function resolveDocumentKeyForSave() {
  const slot = getActiveSlot();
  if (!slot) return null;

  if (slot.documentId) {
    return {
      documentKey: slot.documentId,
      documentName: slot.title || slot.name,
      legacyFingerprint: slot.fingerprint,
    };
  }

  if (!slot.fingerprint) return null;

  const stored = await loadPdfFromDb(slot.fingerprint);
  if (!stored?.buffer || !attemptBridge?.registerUploadedDocument) return null;

  const doc = await attemptBridge.registerUploadedDocument(
    stored.buffer,
    { name: slot.name, size: stored.buffer.byteLength },
    pdfDocs[slot.fingerprint]?.numPages || state.pageCount || 0,
    slot.fingerprint
  );

  slot.documentId = doc.id;
  slot.sourceType = doc.sourceType;
  slot.year = doc.year ?? slot.year ?? null;
  renderDocSelect();
  scheduleSave();

  return {
    documentKey: doc.id,
    documentName: slot.title || slot.name,
    legacyFingerprint: slot.fingerprint,
  };
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

function flushSaveNow({ silentStatus = false } = {}) {
  clearTimeout(saveDebounce);
  try {
    saveSession();
    attemptBridge?.flushAttemptDraft?.();
    if (!silentStatus) setSaveStatus("saved");
  } catch (err) {
    console.warn("Save failed:", err);
    if (!silentStatus) setSaveStatus("error");
  }
}

function normalizeTimerState({ pause = true } = {}) {
  const duration = Math.max(
    60,
    Math.min(300 * 60, Number(state.timerDurationSeconds) || DEFAULT_TIMER_DURATION)
  );
  state.timerDurationSeconds = duration;

  let remaining = Number(state.timerRemainingSeconds);
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > duration) {
    remaining = duration;
  }
  state.timerRemainingSeconds = Math.floor(remaining);
  state.timerSeconds = getTimerElapsedSeconds();

  if (pause) {
    state.timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerInterval() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (state.timerRemainingSeconds <= 0) {
      pauseTimer();
      floatingTimer?.refreshDisplay();
      updateTimerDisplay();
      return;
    }
    state.timerRemainingSeconds -= 1;
    state.timerSeconds = getTimerElapsedSeconds();
    syncTimerToWorkspace(getActiveWorkspace());
    updateTimerDisplay();
    if (state.timerRemainingSeconds % 30 === 0) scheduleSave();
  }, 1000);
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
  const payload = buildSessionPayload();
  const key = getSessionStorageKey();
  localStorage.setItem(key, JSON.stringify(payload));
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
  refreshAllDrawLayers();
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
  const ws = ensureWorkspace(fingerprint);
  resetExamViewportForFreshLoad();
  ws.currentPage = 1;
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
  await waitForExamLayout();
  await applyExamViewportForCurrentPage();
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
  if (idx === state.activeSlotIndex && pdfDocs[fingerprint]) return;

  if (attemptBridge) {
    const ok = await attemptBridge.promptSaveIfDirty();
    if (!ok) return;
  }

  syncToSlot();
  state.activeSlotIndex = idx;
  syncFromSlot();
  renderDocSelect();

  searchRunToken += 1;
  resetExamSearchInput();

  const slot = getActiveSlot();
  if (slot && !pdfDocs[fingerprint]) {
    showStatus("PDF 로딩 중…", "loading");
    const pdfDoc = await ensurePdfDocLoaded(fingerprint, { registerIfMissing: true });
    if (!pdfDoc) {
      showStatus(`「${slot.title || slot.name}」 PDF를 불러오지 못했습니다.`, "error");
      updateExamHint();
      if (els.examPages) els.examPages.innerHTML = "";
    } else {
      syncFromSlot();
      state.pageCount = pdfDoc.numPages;
      if (state.isTextPdf !== true) {
        state.isTextPdf = await detectPdfTextRich(pdfDoc, { includePages: [state.currentPage] });
        const ws = getActiveWorkspace();
        if (ws) ws.isTextPdf = state.isTextPdf;
      }
      updateExamSearchAvailability();
    }
  }

  if (state.pdfDoc) {
    await applyExamViewportForCurrentPage();
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
  delete pdfLoadPromises[fingerprint];
  clearPageTextCache(fingerprint);

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
    await applyExamViewportForCurrentPage();
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
  paneExam.style.flex = `${r} 1 0`;
  paneAnswer.style.flex = `${1 - r} 1 0`;
  paneExam.style.minWidth = "0";
  paneAnswer.style.minWidth = "0";
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
  scheduleExamFitWidthRefit();
  scheduleSave();
}

async function ensureFitWidthScale({ force = false } = {}) {
  if (!state.pdfDoc) return;
  if (state.manualZoom && !force) return;
  state.scale = clampExamScale(
    await calcFitWidthScale(state.pdfDoc, state.currentPage, getExamScrollClientWidth())
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
  if (state.manualZoom) return;
  if (!state.fitWidth) return;
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
  if (els.pageCurrent) els.pageCurrent.textContent = String(state.currentPage || 1);
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

function getAnswerDrawContainer() {
  return els.answerEditor?.querySelector(".answer-doc-body") || null;
}

function getAnswerDrawInteractLayer() {
  return getAnswerDrawContainer()?.querySelector(".draw-interact-layer") || null;
}

function refreshAllDrawLayers() {
  drawControllerExam?.refresh();
  drawControllerAnswer?.refresh();
}

function syncAllDrawInteractLayers() {
  drawControllerExam?.syncInteractLayer?.();
  drawControllerAnswer?.syncInteractLayer?.();
}

function cancelAllDrawActive() {
  drawControllerExam?.cancelActive?.();
  drawControllerAnswer?.cancelActive?.();
}

function createSharedDrawController(surface, getPageNumber) {
  return createDrawController({
    getContainer: surface === "exam" ? getPageContainer : getAnswerDrawContainer,
    getInteractLayer: surface === "exam" ? getDrawInteractLayer : getAnswerDrawInteractLayer,
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
      pageNumber: getPageNumber(),
      pdfFingerprint: state.pdfFingerprint,
      surface,
    }),
    onChange: (action) => {
      if (action?.type === "add") pushDrawUndoAction(action);
      scheduleSave();
    },
    onDelete: (action) => {
      if (action?.type === "delete-annotation") pushDrawUndoAction(action);
      scheduleSave();
    },
    onInteractStart: () => {
      activeDrawSurface = surface;
    },
  });
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
  const examLayer = getDrawInteractLayer();
  if (examLayer) {
    if (!drawControllerExam) drawControllerExam = createSharedDrawController("exam", () => state.currentPage);
    drawControllerExam.bind(examLayer);
    drawControllerExam.refresh();
  }

  const answerLayer = getAnswerDrawInteractLayer();
  if (answerLayer) {
    if (!drawControllerAnswer) {
      drawControllerAnswer = createSharedDrawController("answer", () => state.answerSheetPage + 1);
    }
    drawControllerAnswer.bind(answerLayer);
    drawControllerAnswer.refresh();
  }

  updateDrawToolUi();
}

function getActivePageMatchIndex() {
  if (!state.searchResults.length || !state.searchQuery) return -1;
  const current = state.searchResults[state.searchIdx];
  if (!current || current.pageNumber !== state.currentPage) return -1;
  return state.searchResults
    .slice(0, state.searchIdx + 1)
    .filter((result) => result.pageNumber === state.currentPage).length - 1;
}

function scrollActiveSearchMarkIntoView() {
  const activeMark = els.examPages?.querySelector("mark.exam-search-mark.is-active");
  activeMark?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

async function renderExam() {
  if (!state.pdfDoc || !els.examPages) return;
  const token = ++renderToken;
  els.examPages.innerHTML = `<p style="text-align:center;color:#888;padding:40px">렌더링 중…</p>`;

  const highlightQuery =
    state.searchResults.length > 0 && !state.searchHighlightDismissed ? state.searchQuery : "";
  const activePageMatchIndex = highlightQuery ? getActivePageMatchIndex() : -1;

  const { isTextRich } = await renderSinglePage(
    state.pdfDoc,
    state.currentPage,
    state.scale,
    els.examPages,
    highlightQuery,
    activePageMatchIndex
  );
  if (token !== renderToken) return;

  if (isTextRich) {
    state.isTextPdf = true;
    const ws = getActiveWorkspace();
    if (ws) ws.isTextPdf = true;
  }

  bindDrawController();
  if (els.examPages) {
    els.examPages.classList.toggle("is-fit-width", state.fitWidth && !state.manualZoom);
  }
  if (highlightQuery && activePageMatchIndex >= 0) {
    scrollActiveSearchMarkIntoView();
  }
  updateExamSearchAvailability();
}

function updateExamSearchAvailability() {
  const unsupported = state.isTextPdf === false;
  const supported = state.isTextPdf === true;
  const sidebarSearch = document.querySelector(".ws-sidebar-search");

  if (els.examSearchBar) els.examSearchBar.hidden = unsupported;
  if (sidebarSearch) sidebarSearch.hidden = unsupported;

  [els.examSearchInput, els.searchInput].forEach((input) => {
    if (!input) return;
    input.disabled = unsupported;
  });
  [els.examSearchPrev, els.examSearchNext].forEach((btn) => {
    if (!btn) return;
    btn.disabled = unsupported;
  });
  document.getElementById("ws-search-prev")?.toggleAttribute("disabled", unsupported);
  document.getElementById("ws-search-next")?.toggleAttribute("disabled", unsupported);

  if (unsupported) {
    showExamSearchNotice(EXAM_SEARCH_UNSUPPORTED_MSG);
  } else if (supported) {
    showExamSearchNotice("");
  }

  if (els.searchNotice) {
    if (unsupported) {
      els.searchNotice.textContent = EXAM_SEARCH_UNSUPPORTED_MSG;
    } else if (supported) {
      els.searchNotice.textContent =
        "텍스트 검색이 가능합니다. 밑줄·형광펜 도구로 시험지에 표시할 수 있습니다.";
    } else {
      els.searchNotice.textContent = "시험지를 추가하면 검색·주석 가능 여부가 표시됩니다.";
    }
  }
}

/** @deprecated use updateExamSearchAvailability */
function updateSearchNotice() {
  updateExamSearchAvailability();
}

function updateDrawToolUi() {
  const tool = normalizeDrawTool(state.drawTool);
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
  const answerLayer = getAnswerDrawInteractLayer();
  const answerBody = getAnswerDrawContainer();
  const scroll = els.exam;
  const answerScroll = els.answerEditor;
  const pageContainer = getPageContainer();
  const annotating = isInteractTool(tool);
  if (scroll) {
    scroll.classList.toggle("is-annotation-mode", annotating);
    applyDrawToolCursor(scroll, annotating ? tool : TOOLS.view);
  }
  if (answerScroll) {
    answerScroll.classList.toggle("is-annotation-mode", annotating);
    applyDrawToolCursor(answerScroll, annotating ? tool : TOOLS.view);
  }
  if (pageContainer) {
    pageContainer.classList.toggle("is-annotation-mode", annotating);
  }
  if (answerBody) {
    answerBody.classList.toggle("is-annotation-mode", annotating);
  }
  if (layer) {
    applyDrawToolCursor(layer, annotating ? tool : TOOLS.view);
  }
  if (answerLayer) {
    applyDrawToolCursor(answerLayer, annotating ? tool : TOOLS.view);
  }
  syncAllDrawInteractLayers();
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
      refreshAllDrawLayers();
    },
      showToast,
    });
    const ws = getActiveWorkspace();
    if (ws) answerDocController.setUndoStacks(ws.answerUndoStack, ws.answerRedoStack);
  }
  answerDocController.render();
  applyAnswerTypography(getAnswerTypography(), { save: false });
  bindDrawController();
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
  flushSaveNow({ silentStatus: true });

  try {
    const attempt = await attemptBridge.saveCompletedAttempt({
      pdfSaved: false,
      pdfFilename: "",
    });
    if (!attempt) {
      showStatus("저장에 실패했습니다.", "error");
      return;
    }
    currentExamAttempt = attempt;
    setSaveStatus("savedDb");
    showStatus("시험이 종료되었습니다. PDF 저장 버튼으로 답안지를 저장하세요.", "success");
    showToast("저장되었습니다.");
    examResultController?.open(attempt);
  } catch (err) {
    console.error("[finalizeExamEnd] save failed:", err);
    setSaveStatus("error");
    showStatus("저장에 실패했습니다.", "error");
    showToast("저장에 실패했습니다.");
  }
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

function initFloatingTimerWidget() {
  if (floatingTimer) return;
  const root = document.getElementById("ws-floating-timer");
  if (!root) return;

  floatingTimer = createFloatingTimer({
    rootEl: root,
    displayEl: document.getElementById("ws-float-timer-display"),
    startBtn: document.getElementById("ws-float-timer-start"),
    presetButtons: [...root.querySelectorAll("[data-timer-minutes]")],
    customInputEl: document.getElementById("ws-float-timer-custom-min"),
    getState: () => ({
      timerRunning: state.timerRunning,
      timerDurationSeconds: state.timerDurationSeconds,
      timerRemainingSeconds: state.timerRemainingSeconds,
    }),
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
  floatingTimer?.refreshDisplay();
  scheduleSave();
}

function toggleTimerRunning() {
  if (state.timerRunning) {
    pauseTimer();
    floatingTimer?.refreshDisplay();
    updateTimerDisplay();
    return;
  }
  normalizeTimerState({ pause: false });
  if ((state.timerRemainingSeconds ?? 0) <= 0) {
    state.timerRemainingSeconds = state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  }
  state.timerRunning = true;
  startTimerInterval();
  floatingTimer?.refreshDisplay();
  updateTimerDisplay();
}

function resetTimerCountdown() {
  clearInterval(timerInterval);
  timerInterval = null;
  state.timerRunning = false;
  state.timerRemainingSeconds = state.timerDurationSeconds ?? DEFAULT_TIMER_DURATION;
  state.timerSeconds = 0;
  syncTimerToWorkspace(getActiveWorkspace());
  updateTimerDisplay();
  floatingTimer?.refreshDisplay();
  scheduleSave();
}

function bindSymbolToolbar() {
  const toolbar = document.getElementById("ws-symbol-toolbar");
  renderAnswerSymbolToolbar(toolbar);
  toolbar?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-symbol]");
    if (!btn) return;
    answerDocController?.flushPersist?.();
    answerDocController?.saveAnswerSelection();
    const ok = answerDocController?.insertAtSavedRange(btn.dataset.symbol);
    if (ok) {
      updateRowStats();
      scheduleSave();
    }
  });
  toolbar?.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-symbol]")) {
      answerDocController?.flushPersist?.();
      answerDocController?.saveAnswerSelection();
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
  refreshAllDrawLayers();
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
  refreshAllDrawLayers();
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
  bindDrawController();
  scheduleSave();
}

async function handlePdfUpload(file) {
  if (!isPdfFile(file)) {
    showStatus("PDF 형식이 아닙니다. .pdf 파일만 업로드할 수 있습니다.", "error");
    return;
  }

  try {
    await window.__ensureWorkspace?.();
  } catch (err) {
    console.error("[handlePdfUpload] ensureWorkspace failed:", err);
    showStatus("워크스페이스 준비 실패. 새로고침 후 다시 시도해주세요.", "error");
    return;
  }

  if (!attemptBridge?.registerUploadedDocument) {
    console.error("[handlePdfUpload] attemptBridge missing");
    showStatus("업로드 모듈이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.", "error");
    return;
  }

  try {
    await handlePdfUploadCore(file);
  } catch (err) {
    console.error("[handlePdfUpload] failed:", err);
    showStatus(err?.message || "PDF 업로드 실패", "error");
  }
}

async function handlePdfUploadCore(file) {
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

  const sizeOk = await confirmPdfUploadSize(file);
  if (!sizeOk) return;

  const sizeMb = formatFileSizeMb(file.size);
  showStatus(`PDF 로딩 중… (${sizeMb}MB)`, "loading");

  let pdfBuffer;
  try {
    pdfBuffer = await file.arrayBuffer();
  } catch (err) {
    showStatus(`PDF 형식이 아닙니다: ${err.message || "파일을 읽을 수 없습니다."}`, "error");
    return;
  }

  let pdfDoc;
  try {
    // PDF.js worker may transfer/detach the buffer; keep pdfBuffer for IndexedDB + SHA-256.
    pdfDoc = await loadPdfDocument(pdfBuffer.slice(0));
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
  clearPageTextCache(fp);
  const ws = ensureWorkspace(fp);
  resetExamViewportForFreshLoad();
  const doc = await attemptBridge.registerUploadedDocument(pdfBuffer, file, pdfDoc.numPages, fp);
  slot.documentId = doc.id;
  slot.sourceType = doc.sourceType;
  slot.year = doc.year ?? null;
  ws.currentPage = 1;
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
    state.isTextPdf = await detectPdfTextRich(state.pdfDoc, { includePages: [state.currentPage] });
    ws.isTextPdf = state.isTextPdf;
    updateExamSearchAvailability();
    await waitForExamLayout();
    await applyExamViewportForCurrentPage();
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
  maybeShowLargePageCountNotice(state.pageCount);
  showStatus(`전체 ${state.pageCount}쪽 로드 완료 (${sizeMb}MB)`, "success");
  persistPdfToDbSafe(fp, pdfBuffer, file.name);
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

  await applyFitWidthViewport({ pageNum: p });
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

function updateExamSearchStatus() {
  if (!els.examSearchStatus) return;
  const total = state.searchResults.length;
  if (!state.searchQuery || total === 0) {
    els.examSearchStatus.textContent = "0 / 0";
    return;
  }
  els.examSearchStatus.textContent = `${state.searchIdx + 1} / ${total}`;
}

function showExamSearchNotice(message = "") {
  if (!els.examSearchNotice) return;
  if (!message) {
    els.examSearchNotice.hidden = true;
    els.examSearchNotice.textContent = "";
    return;
  }
  els.examSearchNotice.hidden = false;
  els.examSearchNotice.textContent = message;
}

function removeSearchMarksFromExam() {
  els.examPages?.querySelectorAll("mark.exam-search-mark").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ""));
  });
}

function dismissSearchHighlight() {
  if (!state.searchResults.length || state.searchHighlightDismissed) return;
  state.searchHighlightDismissed = true;
  removeSearchMarksFromExam();
}

function restoreSearchHighlight() {
  state.searchHighlightDismissed = false;
}

function clearExamSearchResults({ rerender = true, clearQuery = false } = {}) {
  if (clearQuery) {
    state.searchQuery = "";
    const ws = getActiveWorkspace();
    if (ws) ws.searchQuery = "";
  }
  state.searchResults = [];
  state.searchIdx = 0;
  restoreSearchHighlight();
  const ws = getActiveWorkspace();
  if (ws) {
    ws.searchResults = [];
    ws.searchIdx = 0;
  }
  updateExamSearchStatus();
  showExamSearchNotice("");
  renderSearchResults(els.searchResults, [], 0, () => {});
  if (rerender && state.pdfDoc) renderExam();
}

function resetExamSearchInput() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  if (els.examSearchInput) els.examSearchInput.value = "";
  if (els.searchInput) els.searchInput.value = "";
  state.searchQuery = "";
  const ws = getActiveWorkspace();
  if (ws) ws.searchQuery = "";
  clearExamSearchResults();
}

function markExamSearchUnsupported() {
  state.isTextPdf = false;
  const ws = getActiveWorkspace();
  if (ws) ws.isTextPdf = false;
  searchRunToken += 1;
  resetExamSearchInput();
  updateExamSearchAvailability();
}

function scheduleSearch(query, { source = "toolbar", immediate = false } = {}) {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }

  if (state.isTextPdf === false) return;

  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    searchRunToken += 1;
    resetExamSearchInput();
    return;
  }

  if (source === "toolbar" && els.searchInput && els.searchInput.value !== query) {
    els.searchInput.value = query;
  }
  if (source === "sidebar" && els.examSearchInput && els.examSearchInput.value !== query) {
    els.examSearchInput.value = query;
  }

  searchRunToken += 1;

  if (immediate) {
    runSearch(query, { source });
    return;
  }

  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    runSearch(query, { source });
  }, SEARCH_DEBOUNCE_MS);
}

async function runSearch(query, { source = "toolbar" } = {}) {
  const token = ++searchRunToken;
  state.searchQuery = String(query ?? "").trim();
  const ws = getActiveWorkspace();
  if (ws) ws.searchQuery = state.searchQuery;

  if (source === "toolbar" && els.examSearchInput && els.examSearchInput.value !== state.searchQuery) {
    els.examSearchInput.value = state.searchQuery;
  }
  if (source === "sidebar" && els.searchInput && els.searchInput.value !== state.searchQuery) {
    els.searchInput.value = state.searchQuery;
  }

  if (!state.searchQuery) {
    clearExamSearchResults();
    return;
  }

  if (!state.pdfDoc) return;

  if (state.isTextPdf === false) {
    updateExamSearchAvailability();
    return;
  }

  showExamSearchNotice("검색 준비 중…");

  try {
    if (state.isTextPdf !== true) {
      state.isTextPdf = await detectPdfTextRich(state.pdfDoc, { includePages: [state.currentPage] });
      if (ws) ws.isTextPdf = state.isTextPdf;
      if (token !== searchRunToken) return;
    }

    const cache = getPageTextCache(state.pdfFingerprint);
    const { results, cancelled, hadExtractableText } = await searchPdfDocument(state.pdfDoc, state.searchQuery, {
      cache,
      onProgress: (current, total) => {
        if (token !== searchRunToken) return;
        showExamSearchNotice(`검색 준비 중 ${current} / ${total}페이지`);
      },
      isCancelled: () => token !== searchRunToken,
    });

    if (token !== searchRunToken || cancelled) return;

    if (!hadExtractableText) {
      markExamSearchUnsupported();
      return;
    }

    state.isTextPdf = true;
    if (ws) ws.isTextPdf = true;
    updateExamSearchAvailability();

    state.searchResults = results;
    state.searchIdx = 0;
    restoreSearchHighlight();
    if (ws) {
      ws.searchResults = results;
      ws.searchIdx = 0;
    }

    renderSearchResults(els.searchResults, state.searchResults, state.searchIdx, jumpToSearchResult);
    updateExamSearchStatus();

    if (!results.length) {
      showExamSearchNotice("검색 결과가 없습니다.");
      showStatus("검색 결과가 없습니다.", "info");
      await renderExam();
      return;
    }

    showExamSearchNotice("");
    jumpToSearchResult(0);
  } catch (err) {
    console.error("[runSearch] failed:", err);
    showExamSearchNotice("검색 중 오류가 발생했습니다.");
    showStatus("검색 중 오류가 발생했습니다.", "error");
  }
}

function jumpToSearchResult(idx) {
  if (!state.searchResults.length) return;
  restoreSearchHighlight();
  state.searchIdx = ((idx % state.searchResults.length) + state.searchResults.length) % state.searchResults.length;
  const ws = getActiveWorkspace();
  if (ws) ws.searchIdx = state.searchIdx;
  updateExamSearchStatus();
  renderSearchResults(els.searchResults, state.searchResults, state.searchIdx, jumpToSearchResult);
  const targetPage = state.searchResults[state.searchIdx].pageNumber;
  if (targetPage === state.currentPage) {
    renderExam();
    return;
  }
  goToPage(targetPage);
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
  const startBtn = document.getElementById("ws-float-timer-start");
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
    await resolveCurrentUserId();
    const userKey = getSessionStorageKey();
    let raw = localStorage.getItem(userKey);
    if (!raw && !currentUserId) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    }
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
    normalizeTimerState({ pause: true });
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
    initFloatingTimerWidget();
    updateDrawToolUi();
    updateTimerDisplay();
    floatingTimer?.refreshDisplay();
    renderDocSelect();
    renderPdfManageList();

    const activeSlot = state.pdfSlots[state.activeSlotIndex];
    if (activeSlot?.fingerprint) {
      await ensurePdfDocLoaded(activeSlot.fingerprint, { registerIfMissing: true });
    }

    const docMap = {};
    state.pdfSlots.forEach((s) => {
      if (s.documentId) docMap[s.fingerprint] = s.documentId;
    });
    await attemptBridge?.migrateLegacy?.(docMap);

    syncFromSlot();

    if (state.pdfDoc) {
      state.pageCount = state.pdfDoc.numPages;
      if (state.isTextPdf !== true) {
        state.isTextPdf = await detectPdfTextRich(state.pdfDoc, { includePages: [state.currentPage] });
        const ws = getActiveWorkspace();
        if (ws) ws.isTextPdf = state.isTextPdf;
      }
      await applyExamViewportForCurrentPage();
      if (els.searchInput) els.searchInput.value = state.searchQuery || "";
      if (els.examSearchInput) els.examSearchInput.value = state.searchQuery || "";
      updateExamSearchStatus();
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

function bindTimerControls() {
  const root = document.getElementById("ws-floating-timer");
  const startBtn = document.getElementById("ws-float-timer-start");
  const resetBtn = document.getElementById("ws-float-timer-reset");
  const settingsBtn = document.getElementById("ws-float-timer-settings");
  const settingsPanel = document.getElementById("ws-timer-settings-panel");
  const customInput = document.getElementById("ws-float-timer-custom-min");
  const customApplyBtn = document.getElementById("ws-float-timer-custom-apply");
  const examEndBtn = document.getElementById("ws-float-exam-end-btn");
  const presetButtons = root ? [...root.querySelectorAll("[data-timer-minutes]")] : [];

  const syncTimerUi = () => {
    updateTimerDisplay();
    floatingTimer?.refreshDisplay();
  };

  startBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTimerRunning();
    syncTimerUi();
  });

  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetTimerCountdown();
    syncTimerUi();
  });

  settingsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!settingsPanel) return;
    settingsPanel.hidden = !settingsPanel.hidden;
    floatingTimer?.refreshDisplay();
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setTimerDurationMinutes(Number(btn.dataset.timerMinutes));
      if (settingsPanel) settingsPanel.hidden = true;
      syncTimerUi();
    });
  });

  customApplyBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setTimerDurationMinutes(Number(customInput?.value));
    if (settingsPanel) settingsPanel.hidden = true;
    syncTimerUi();
  });

  examEndBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.pdfFingerprint) {
      showToast("시험지를 먼저 추가해주세요.");
      return;
    }
    showExamEndModal();
  });

  document.addEventListener("mousedown", (e) => {
    if (!settingsPanel || settingsPanel.hidden) return;
    if (e.target.closest("#ws-floating-timer")) return;
    settingsPanel.hidden = true;
  });
}

function bindEvents() {
  els.pdfBtn?.addEventListener("click", () => els.pdfInput?.click());
  els.pdfInput?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      await handlePdfUpload(f);
    } catch (err) {
      console.error("[pdf-input] upload failed:", err);
      showStatus(err?.message || "PDF 업로드 실패", "error");
    }
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

  document.getElementById("ws-resume-banner-close")?.addEventListener("click", () => {
    const banner = document.getElementById("ws-resume-banner");
    if (banner) banner.hidden = true;
  });

  els.prevPage?.addEventListener("click", navPrev);
  els.nextPage?.addEventListener("click", navNext);

  document.getElementById("ws-zoom-in")?.addEventListener("click", async () => {
    await applyExamScale(state.scale + BUTTON_ZOOM_STEP, { manualZoom: true, fitWidth: false });
  });
  document.getElementById("ws-zoom-out")?.addEventListener("click", async () => {
    await applyExamScale(state.scale - BUTTON_ZOOM_STEP, { manualZoom: true, fitWidth: false });
  });
  document.getElementById("ws-fit-width")?.addEventListener("click", async () => {
    await applyFitWidthViewport();
    scheduleSave();
  });

  document.querySelectorAll(".ws-exam-tool-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cancelAllDrawActive();
      state.drawTool = btn.dataset.tool;
      updateDrawToolUi();
      refreshAllDrawLayers();
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

  els.examSearchInput?.addEventListener("input", (e) => {
    scheduleSearch(e.target.value, { source: "toolbar" });
  });
  els.examSearchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      scheduleSearch(e.target.value, { source: "toolbar", immediate: true });
    }
  });
  els.examSearchPrev?.addEventListener("click", () => {
    if (state.searchResults.length) jumpToSearchResult(state.searchIdx - 1);
  });
  els.examSearchNext?.addEventListener("click", () => {
    if (state.searchResults.length) jumpToSearchResult(state.searchIdx + 1);
  });

  els.exam?.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (!e.target.closest("#ws-exam-pages")) return;
    dismissSearchHighlight();
  });

  els.searchInput?.addEventListener("input", (e) => {
    scheduleSearch(e.target.value, { source: "sidebar" });
  });
  els.searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      scheduleSearch(e.target.value, { source: "sidebar", immediate: true });
    }
  });
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

  bindSymbolToolbar();

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

function resetTimerMemoryState() {
  state.timerRunning = false;
  state.timerSeconds = 0;
  state.timerDurationSeconds = DEFAULT_TIMER_DURATION;
  state.timerRemainingSeconds = DEFAULT_TIMER_DURATION;
}

function hideOrRemoveFloatingTimer() {
  if (floatingTimer?.hideTimer) {
    floatingTimer.hideTimer();
  } else {
    const root = document.getElementById("ws-floating-timer");
    if (root) {
      root.hidden = true;
      root.setAttribute("hidden", "");
      root.style.display = "none";
      root.classList.add("is-hidden");
    }
  }
  const settingsPanel = document.getElementById("ws-timer-settings-panel");
  if (settingsPanel) settingsPanel.hidden = true;
}

function showFloatingTimer() {
  initFloatingTimerWidget();
  const root = document.getElementById("ws-floating-timer");
  if (root) {
    root.style.display = "";
    root.classList.remove("is-hidden");
  }
  if (floatingTimer?.showTimer) {
    floatingTimer.showTimer();
    return;
  }
  if (root) {
    root.hidden = false;
    root.removeAttribute("hidden");
  }
}

function cleanupTimer() {
  clearTimeout(showResumeBanner._timer);
  clearTimeout(showToast._t);

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  resetTimerMemoryState();
  hideOrRemoveFloatingTimer();
  updateTimerDisplay();
}

function closeAllWorkspaceModals() {
  document.querySelectorAll(".ws-modal").forEach((modal) => {
    modal.hidden = true;
  });
  document.body.classList.remove("ws-modal-open");
}

function clearWorkspaceDomSurfaces() {
  if (els.examPages) {
    els.examPages.innerHTML = "";
    els.examPages.hidden = true;
  }
  if (els.answerEditor) {
    els.answerEditor.innerHTML = "";
  }
  if (els.searchResults) els.searchResults.innerHTML = "";
  if (els.bookmarkPanel) els.bookmarkPanel.innerHTML = "";
  if (els.toast) {
    els.toast.hidden = true;
    els.toast.textContent = "";
  }
}

function resetWorkspaceMemoryState() {
  renderToken += 1;

  attemptBridge?.attemptSession?.clearSession?.({ removeDraft: false });
  attemptBridge?.clearActiveProblem?.();

  state.pdfSlots = [];
  state.activeSlotIndex = 0;
  state.workspaces = {};
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
  state.searchQuery = "";
  state.searchResults = [];
  state.searchIdx = 0;
  state.caretOffset = 0;
  state.circledNumberSession = null;
  state.answerFontSize = DEFAULT_ANSWER_FONT_SIZE;
  state.answerLetterSpacing = DEFAULT_ANSWER_LETTER_SPACING;
  state.listMode = null;
  state.sheetTemplate = null;

  Object.keys(pdfDocs).forEach((key) => {
    delete pdfDocs[key];
  });
  Object.keys(pdfLoadPromises).forEach((key) => {
    delete pdfLoadPromises[key];
  });

  clearAllPageTextCaches();
  searchRunToken += 1;

  currentUserId = null;
  currentExamAttempt = null;

  drawControllerExam = null;
  drawControllerAnswer = null;
  activeDrawSurface = "exam";
}

export async function cleanupWorkspaceForLogout() {
  hideOrRemoveFloatingTimer();
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  state.timerRunning = false;

  if (logoutCleanupInProgress) return;
  logoutCleanupInProgress = true;

  try {
    clearTimeout(saveDebounce);
    saveDebounce = null;

    cleanupTimer();
    resetWorkspaceMemoryState();
    closeAllWorkspaceModals();
    clearWorkspaceDomSurfaces();

    const banner = document.getElementById("ws-resume-banner");
    if (banner) banner.hidden = true;

    renderDocSelect();
    renderPdfManageList();
    updateExamHint();
    setupAnswerEditor();
    updateAnswerPageNav();
    updateRowStats();
    setSaveStatus("saved");
    showStatus("", "info");
  } finally {
    logoutCleanupInProgress = false;
  }
}

/** @deprecated Use cleanupWorkspaceForLogout */
export const resetWorkspaceOnLogout = cleanupWorkspaceForLogout;

export async function prepareWorkspaceForAuthenticatedUser() {
  await resolveCurrentUserId();
  await restoreSession();

  if (VIEW_PRESETS[state.viewMode]) applyPanelRatio(VIEW_PRESETS[state.viewMode]);
  else applyPanelRatio(state.panelRatio);

  showFloatingTimer();
  floatingTimer?.restore();
  normalizeTimerState({ pause: true });
  updateTimerDisplay();
  floatingTimer?.refreshDisplay();
  applyAnswerTypography(getAnswerTypography(), { save: false });
  scheduleExamFitWidthRefit();
}

export async function initWorkspace() {
  cacheElements();

  if (!workspaceDomBound) {
    bindVerticalResizer();
    bindExamViewportObserver();
    initPreviewModal();
    bindEvents();
    bindTimerControls();
    applyViewMode("equal");
    updateDrawToolUi();
    workspaceDomBound = true;
  }

  initFloatingTimerWidget();

  if (!attemptBridge) {
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
      flushSaveNow,
      showStatus,
      onResumeRestored: showResumeBanner,
      flushAnswerPersist: () => answerDocController?.flushPersist?.(),
      restoreExamViewport: restoreExamViewportFromWorkspace,
      resolveDocumentKeyForSave,
    });
    window.__workspaceOpenForProblem = openForProblem;
    window.__workspaceSwitchPdf = switchPdfSlot;
  }

  window.__workspaceAttemptBridge = attemptBridge;

  await prepareWorkspaceForAuthenticatedUser();
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
