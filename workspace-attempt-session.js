/**
 * Draft 세션 — 자동저장·dirty 추적
 */
import { saveDraft, deleteDraft, getDraft } from "./workspace-attempt-service.js";
import { hasMeaningfulAnswerContent } from "./workspace-answer-format.js";
import { normalizeAnswerPages } from "./workspace-answer-editor.js";

const DEFAULT_TIMER_DURATION = 120 * 60;

export function hasInProgressWorkspace(ws, state) {
  if (!ws) return false;
  const pages = normalizeAnswerPages(ws.answerSheet || state?.answerSheet);
  if (pages.some((page) => hasMeaningfulAnswerContent(String(page ?? "")))) return true;
  if ((ws.drawAnnotations || state?.drawAnnotations || []).length > 0) return true;
  if ((ws.timerSeconds || state?.timerSeconds || 0) > 0) return true;
  const duration = Number(state?.timerDurationSeconds) || DEFAULT_TIMER_DURATION;
  const remaining = Number(state?.timerRemainingSeconds);
  if (Number.isFinite(remaining) && remaining < duration - 5) return true;
  if (String(ws.attemptMemo || "").trim()) return true;
  if ((ws.bookmarks || state?.bookmarks || []).length > 0) return true;
  return false;
}

export function createAttemptSessionController({
  getSnapshot,
  applySnapshot,
  onStatusChange,
  debounceMs = 800,
}) {
  let loadedAttemptId = null;
  let sourceAttemptId = null;
  let problemKey = null;
  let documentId = null;
  let dirty = false;
  let lastSavedJson = "";
  let timer = null;
  let autosaveEnabled = true;

  function setStatus(kind) {
    onStatusChange?.(kind);
  }

  function markDirty() {
    if (!problemKey) return;
    const json = JSON.stringify(getSnapshot?.() || {});
    if (json === lastSavedJson) return;
    dirty = true;
    scheduleDraftSave();
  }

  function markClean(snapshot) {
    lastSavedJson = JSON.stringify(snapshot || getSnapshot?.() || {});
    dirty = false;
  }

  async function persistDraft() {
    if (!problemKey || !autosaveEnabled) return;
    const snapshot = getSnapshot?.();
    if (!snapshot) return;
    setStatus("pending");
    try {
      await saveDraft({
        problemKey,
        documentId,
        loadedAttemptId,
        sourceAttemptId,
        snapshot,
      });
      lastSavedJson = JSON.stringify(snapshot);
      dirty = false;
      setStatus("saved");
    } catch (err) {
      console.warn("Draft save failed:", err);
      setStatus("error");
    }
  }

  function scheduleDraftSave() {
    setStatus("pending");
    clearTimeout(timer);
    timer = setTimeout(() => {
      persistDraft();
    }, debounceMs);
  }

  async function restoreDraftIfAny(key) {
    const draft = await getDraft(key);
    if (!draft?.snapshot) return null;
    loadedAttemptId = draft.loadedAttemptId || null;
    sourceAttemptId = draft.sourceAttemptId || null;
    applySnapshot?.(draft.snapshot);
    markClean(draft.snapshot);
    return draft;
  }

  function bindSession({ key, docId, attemptId = null, sourceId = null }) {
    problemKey = key;
    documentId = docId;
    loadedAttemptId = attemptId;
    sourceAttemptId = sourceId;
    dirty = false;
    lastSavedJson = "";
  }

  function clearSession({ removeDraft = false } = {}) {
    clearTimeout(timer);
    if (removeDraft && problemKey) deleteDraft(problemKey).catch(() => {});
    loadedAttemptId = null;
    sourceAttemptId = null;
    problemKey = null;
    documentId = null;
    dirty = false;
    lastSavedJson = "";
  }

  function isDirty() {
    if (!problemKey) return false;
    const json = JSON.stringify(getSnapshot?.() || {});
    return dirty || json !== lastSavedJson;
  }

  function flushDraftNow() {
    clearTimeout(timer);
    return persistDraft();
  }

  return {
    bindSession,
    clearSession,
    markDirty,
    markClean,
    scheduleDraftSave,
    flushDraftNow,
    restoreDraftIfAny,
    isDirty,
    getLoadedAttemptId: () => loadedAttemptId,
    getProblemKey: () => problemKey,
    getDocumentId: () => documentId,
    setAutosaveEnabled(v) {
      autosaveEnabled = v;
    },
  };
}

export function buildWorkspaceSnapshot(state, ws) {
  if (!ws) return null;
  return {
    answerSheet: [...(ws.answerSheet || state.answerSheet || [])],
    answerSheetPage: ws.answerSheetPage ?? state.answerSheetPage ?? 0,
    timerSeconds: ws.timerSeconds ?? state.timerSeconds ?? 0,
    timerDurationSeconds: state.timerDurationSeconds,
    timerRemainingSeconds: state.timerRemainingSeconds,
    bookmarks: JSON.parse(JSON.stringify(ws.bookmarks || state.bookmarks || [])),
    drawAnnotations: JSON.parse(JSON.stringify(ws.drawAnnotations || state.drawAnnotations || [])),
    answerFontSize: ws.answerFontSize ?? state.answerFontSize,
    answerLetterSpacing: ws.answerLetterSpacing ?? state.answerLetterSpacing,
    currentPage: ws.currentPage ?? state.currentPage ?? 1,
    pageViews: JSON.parse(JSON.stringify(ws.pageViews || {})),
    memo: ws.attemptMemo || "",
    tags: [...(ws.attemptTags || [])],
    status: ws.attemptStatus || "draft",
    caretOffset: state.caretOffset ?? ws.caretOffset ?? 0,
    circledNumberSession: ws.circledNumberSession
      ? JSON.parse(JSON.stringify(ws.circledNumberSession))
      : null,
    searchQuery: state.searchQuery || "",
  };
}

export function applySnapshotToWorkspace(snapshot, state, ws) {
  if (!snapshot || !ws) return;
  ws.answerSheet = [...(snapshot.answerSheet || [])];
  ws.answerSheetPage = snapshot.answerSheetPage ?? 0;
  ws.timerSeconds = snapshot.timerSeconds ?? 0;
  ws.bookmarks = JSON.parse(JSON.stringify(snapshot.bookmarks || []));
  ws.drawAnnotations = JSON.parse(JSON.stringify(snapshot.drawAnnotations || []));
  ws.answerFontSize = snapshot.answerFontSize;
  ws.answerLetterSpacing = snapshot.answerLetterSpacing;
  ws.currentPage = snapshot.currentPage ?? 1;
  ws.pageViews = JSON.parse(JSON.stringify(snapshot.pageViews || {}));
  ws.attemptMemo = snapshot.memo || "";
  ws.attemptTags = [...(snapshot.tags || [])];
  ws.attemptStatus = snapshot.status || "draft";
  ws.circledNumberSession = snapshot.circledNumberSession
    ? JSON.parse(JSON.stringify(snapshot.circledNumberSession))
    : null;
  ws.caretOffset = snapshot.caretOffset ?? 0;

  state.answerSheet = ws.answerSheet;
  state.answerSheetPage = ws.answerSheetPage;
  state.timerSeconds = ws.timerSeconds;
  state.bookmarks = ws.bookmarks;
  state.drawAnnotations = ws.drawAnnotations;
  state.answerFontSize = ws.answerFontSize;
  state.answerLetterSpacing = ws.answerLetterSpacing;
  state.currentPage = ws.currentPage;
  state.caretOffset = ws.caretOffset;
  state.circledNumberSession = ws.circledNumberSession;
  if (snapshot.timerDurationSeconds != null) {
    state.timerDurationSeconds = snapshot.timerDurationSeconds;
  }
  if (snapshot.timerRemainingSeconds != null) {
    state.timerRemainingSeconds = snapshot.timerRemainingSeconds;
  }
  if (snapshot.searchQuery != null) {
    state.searchQuery = snapshot.searchQuery;
    ws.searchQuery = snapshot.searchQuery;
  }
}

export function applyAttemptToWorkspace(attempt, state, ws) {
  if (!attempt || !ws) return;
  ws.answerSheet = [...(attempt.answerPages || [])];
  ws.answerSheetPage = attempt.answerSheetPage ?? 0;
  ws.timerSeconds = attempt.elapsedSeconds ?? 0;
  ws.bookmarks = JSON.parse(JSON.stringify(attempt.bookmarks || []));
  ws.drawAnnotations = JSON.parse(JSON.stringify(attempt.annotations || []));
  ws.answerFontSize = attempt.fontSize;
  ws.answerLetterSpacing = attempt.letterSpacing;
  ws.currentPage = attempt.examPage ?? 1;
  ws.pageViews = JSON.parse(JSON.stringify(attempt.pageViews || {}));
  ws.attemptMemo = attempt.memo || "";
  ws.attemptTags = [...(attempt.tags || [])];
  ws.attemptStatus = attempt.status || "draft";

  state.answerSheet = ws.answerSheet;
  state.answerSheetPage = ws.answerSheetPage;
  state.timerSeconds = ws.timerSeconds;
  state.bookmarks = ws.bookmarks;
  state.drawAnnotations = ws.drawAnnotations;
  state.answerFontSize = ws.answerFontSize;
  state.answerLetterSpacing = ws.answerLetterSpacing;
  state.currentPage = ws.currentPage;
}
