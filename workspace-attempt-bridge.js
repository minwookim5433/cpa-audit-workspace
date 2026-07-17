/**
 * Attempt 시스템 — workspace-app 연동
 */
import { buildProblemKey } from "./workspace-attempt-model.js";
import {
  upsertDocument,
  saveAttempt,
  getAttempt,
  listAttemptsByProblemKey,
  getProblemNote,
  saveProblemNote,
  migrateLegacyAttempts,
  duplicateAttemptAsNew,
} from "./workspace-attempt-service.js";
import {
  createAttemptSessionController,
  buildWorkspaceSnapshot,
  applySnapshotToWorkspace,
  applyAttemptToWorkspace,
} from "./workspace-attempt-session.js";
import { createAttemptUiController } from "./workspace-attempt-ui.js";
import {
  createAttemptHistoryPanel,
  initMemoPanel,
  syncMemoPanelUi,
} from "./workspace-attempt-history.js";
import { createEmptyAnswerSheet, normalizeAnswerPages } from "./workspace-answer-editor.js";
import { stripFormatSpansFromSheet } from "./workspace-answer-format.js";
import { applyAnswerSheetVars } from "./workspace-answer-typography.js";
import { buildAnswerPdfFilename, downloadPdfFromClones } from "./workspace-answer-export.js";

export function initAttemptBridge({
  state,
  getActiveWorkspace,
  getActiveSlot,
  collectSubmissionStats,
  countLinesFn,
  refreshWorkspaceUi,
  showToast,
  setSaveStatus,
  examResultController,
}) {
  let attemptUi = null;
  let attemptHistory = null;
  let skipAttemptPrompt = false;
  let activeProblem = null;

  const attemptSession = createAttemptSessionController({
    getSnapshot: () => {
      const ws = getActiveWorkspace();
      return ws ? buildWorkspaceSnapshot(state, ws) : null;
    },
    applySnapshot: (snapshot) => {
      const ws = getActiveWorkspace();
      if (!ws) return;
      applySnapshotToWorkspace(snapshot, state, ws);
      refreshWorkspaceUi?.();
      syncMemoPanelForActive();
    },
    onStatusChange: (kind) => setSaveStatus?.(kind),
  });

  function getDocumentContext() {
    const slot = getActiveSlot();
    if (!slot?.documentId && !activeProblem?.documentId) return null;
    if (activeProblem?.problemKey) {
      return {
        documentId: activeProblem.documentId || slot?.documentId || activeProblem.id,
        documentTitle: activeProblem.title || slot?.title || "",
        year: activeProblem.year ?? slot?.year ?? null,
        sourceType: activeProblem.source || slot?.sourceType || "custom",
        problemLabel: activeProblem.problemLabel || activeProblem.title,
        questionRange: activeProblem.problemNumber || "전체",
        problemKey: activeProblem.problemKey,
        legacyFingerprint: activeProblem.legacyFingerprint || slot?.fingerprint || "",
      };
    }
    if (!slot?.documentId) return null;
    const problemLabel = slot.title || slot.name || "전체";
    return {
      documentId: slot.documentId,
      documentTitle: slot.title || slot.name || "",
      year: slot.year ?? null,
      sourceType: slot.sourceType || "custom",
      problemLabel,
      questionRange: "전체",
      problemKey: buildProblemKey(slot.documentId, problemLabel),
      legacyFingerprint: slot.fingerprint,
    };
  }

  function syncMemoPanelForActive() {
    const ws = getActiveWorkspace();
    const ctx = getDocumentContext();
    if (!ws || !ctx) return;
    getProblemNote(ctx.problemKey).then((note) => {
      syncMemoPanelUi({ attemptMemo: ws.attemptMemo || "", problemMemo: note });
    });
  }

  function buildAttemptPayload(overrides = {}) {
    const stats = collectSubmissionStats();
    const ws = getActiveWorkspace();
    const ctx = getDocumentContext();
    if (!ctx) return null;
    return {
      ...ctx,
      elapsedSeconds: state.timerSeconds,
      answerPages: stats.answerSheet,
      memo: ws?.attemptMemo || "",
      annotations: JSON.parse(JSON.stringify(state.drawAnnotations || [])),
      bookmarks: JSON.parse(JSON.stringify(state.bookmarks || [])),
      tags: [...(ws?.attemptTags || [])],
      status: overrides.status || ws?.attemptStatus || "draft",
      fontSize: state.answerFontSize,
      letterSpacing: state.answerLetterSpacing,
      examPage: state.currentPage,
      pageViews: JSON.parse(JSON.stringify(ws?.pageViews || {})),
      answerSheetPage: state.answerSheetPage,
      answerPageCount: stats.writtenPageCount,
      totalCharacters: stats.totalCharCount,
      totalLines: stats.usedRowCount,
      ...overrides,
    };
  }

  async function refreshWorkspaceAfterLoad() {
    await refreshWorkspaceUi?.();
    syncMemoPanelForActive();
    attemptHistory?.refresh?.();
  }

  async function loadAttemptIntoWorkspace(attempt, context) {
    const ws = getActiveWorkspace();
    if (!ws || !attempt) return;
    applyAttemptToWorkspace(attempt, state, ws);
    attemptSession.bindSession({
      key: context?.problemKey || attempt.problemKey,
      docId: attempt.documentId,
      attemptId: attempt.id,
    });
    attemptSession.markClean(buildWorkspaceSnapshot(state, ws));
    await refreshWorkspaceAfterLoad();
    showToast?.(`${attempt.attemptNumber}회차 풀이를 불러왔습니다.`);
  }

  async function startFreshAttempt(context, { copyMemo = false, copyTags = true, copyAnnotations = false } = {}) {
    const ws = getActiveWorkspace();
    if (!ws) return;
    const attempts = await listAttemptsByProblemKey(context.problemKey);
    const latest = attempts[0];

    ws.answerSheet = createEmptyAnswerSheet();
    ws.answerSheetPage = 0;
    ws.timerSeconds = 0;
    ws.attemptMemo = copyMemo && latest ? latest.memo : "";
    ws.attemptTags = copyTags && latest ? [...(latest.tags || [])] : [];
    ws.attemptStatus = "draft";
    ws.circledNumberSession = null;
    if (copyAnnotations && latest) {
      ws.drawAnnotations = JSON.parse(JSON.stringify(latest.annotations || []));
    } else {
      ws.drawAnnotations = [];
    }

    state.answerSheet = ws.answerSheet;
    state.answerSheetPage = 0;
    state.timerSeconds = 0;
    state.drawAnnotations = ws.drawAnnotations;
    state.caretOffset = 0;

    attemptSession.bindSession({ key: context.problemKey, docId: context.documentId, attemptId: null });
    attemptSession.markClean(buildWorkspaceSnapshot(state, ws));
    await refreshWorkspaceAfterLoad();
    showToast?.("새 풀이를 시작합니다.");
  }

  async function onDocumentReady({ forcePrompt = false } = {}) {
    if (document.body.dataset.mainView && document.body.dataset.mainView !== "solve") {
      return;
    }
    const ctx = getDocumentContext();
    if (!ctx) return;
    attemptSession.bindSession({ key: ctx.problemKey, docId: ctx.documentId });

    if (!forcePrompt) {
      const draft = await attemptSession.restoreDraftIfAny(ctx.problemKey);
      if (draft) {
        await refreshWorkspaceAfterLoad();
        showToast?.("작업 중이던 내용을 복원했습니다.");
        return;
      }
    }

    if (skipAttemptPrompt && !forcePrompt) return;
    await startFreshAttempt(ctx, { copyTags: false, copyMemo: false, copyAnnotations: false });
  }

  async function registerUploadedDocument(buffer, file, pageCount, fingerprint) {
    const doc = await upsertDocument({
      buffer,
      fileName: file.name,
      fileSize: file.size,
      pageCount,
      title: file.name.replace(/\.pdf$/i, ""),
      legacyFingerprint: fingerprint,
    });
    return doc;
  }

  function markAttemptDirty() {
    attemptSession.markDirty();
  }

  async function flushAttemptDraft() {
    await attemptSession.flushDraftNow();
  }

  async function saveCompletedAttempt({ pdfSaved, pdfFilename }) {
    const payload = buildAttemptPayload({
      status: "completed",
      completedAt: new Date().toISOString(),
      pdfSaved,
      pdfFilename,
    });
    if (!payload) return null;
    const attempt = await saveAttempt(payload, { countLinesFn });
    attemptSession.bindSession({
      key: payload.problemKey,
      docId: payload.documentId,
      attemptId: attempt.id,
    });
    attemptSession.markClean(buildWorkspaceSnapshot(state, getActiveWorkspace()));
    await attemptHistory?.refresh?.();
    window.__workspaceOnAttemptCompleted?.(attempt);
    return attempt;
  }

  async function promptSaveIfDirty() {
    if (!attemptSession.isDirty() || !attemptSession.getLoadedAttemptId()) return true;
    const choice = await attemptUi.askUnsavedChoice();
    if (choice === "continue" || !choice) return false;
    if (choice === "discard") {
      attemptSession.markClean(buildWorkspaceSnapshot(state, getActiveWorkspace()));
      return true;
    }
    const saved = await attemptUi.performSave(choice, attemptSession.getLoadedAttemptId());
    if (saved) {
      attemptSession.bindSession({
        key: saved.problemKey,
        docId: saved.documentId,
        attemptId: saved.id,
      });
      attemptSession.markClean(buildWorkspaceSnapshot(state, getActiveWorkspace()));
    }
    return Boolean(saved);
  }

  async function openAttemptById(id, { duplicate = false } = {}) {
    let attempt = await getAttempt(id);
    if (!attempt) return;
    const slot = state.pdfSlots.find(
      (s) => s.documentId === attempt.documentId || s.fingerprint === attempt.legacyFingerprint
    );
    if (slot && slot.fingerprint !== state.pdfFingerprint) {
      skipAttemptPrompt = true;
      await window.__workspaceSwitchPdf?.(slot.fingerprint);
      skipAttemptPrompt = false;
    }
    if (duplicate) {
      attempt = await duplicateAttemptAsNew(attempt, { countLinesFn });
    }
    const ctx = getDocumentContext() || {
      problemKey: attempt.problemKey,
      documentId: attempt.documentId,
    };
    await loadAttemptIntoWorkspace(attempt, ctx);
  }

  function previewAttempt(attempt) {
    const modal = document.getElementById("ws-attempt-preview-modal");
    const body = document.getElementById("ws-attempt-preview-body");
    if (!modal || !body || !attempt) return;
    const page = attempt.answerPages?.[attempt.answerSheetPage || 0] || attempt.answerPages?.[0] || "";
    body.innerHTML = `<div class="answer-doc-sheet"><div class="answer-doc-editor">${page}</div></div>`;
    applyAnswerSheetVars(body, { fontSize: attempt.fontSize, letterSpacing: attempt.letterSpacing });
    modal.hidden = false;
    document.body.classList.add("ws-modal-open");
  }

  attemptUi = createAttemptUiController({
    buildAttemptPayload,
    countLinesFn,
    onLoadAttempt: loadAttemptIntoWorkspace,
    onStartFresh: startFreshAttempt,
    refreshHistory: () => attemptHistory?.refresh?.(),
  });

  attemptHistory = createAttemptHistoryPanel({
    containerEl: document.getElementById("ws-attempt-history-list"),
    filterEl: document.getElementById("ws-attempt-filter"),
    sortEl: document.getElementById("ws-attempt-sort"),
    onContinue: (id) => openAttemptById(id),
    onPreview: async (id) => previewAttempt(await getAttempt(id)),
    onRetry: (id) => openAttemptById(id, { duplicate: true }),
    onExportPdf: async (id) => {
      const attempt = await getAttempt(id);
      if (!attempt) return;
      const sheet = document.createElement("div");
      sheet.className = "answer-doc-sheet";
      const editor = document.createElement("div");
      editor.className = "answer-doc-editor";
      editor.innerHTML = (attempt.answerPages || []).join("");
      sheet.appendChild(editor);
      await downloadPdfFromClones(
        [sheet],
        buildAnswerPdfFilename({
          year: attempt.year,
          documentTitle: attempt.documentTitle,
          docTitle: attempt.documentTitle,
        }),
        { fontSize: attempt.fontSize, letterSpacing: attempt.letterSpacing },
        null,
        { logPages: false }
      );
    },
  });

  initMemoPanel({
    attemptMemoEl: document.getElementById("ws-attempt-memo"),
    problemMemoEl: document.getElementById("ws-problem-memo"),
    onAttemptMemoChange: (value) => {
      const ws = getActiveWorkspace();
      if (ws) ws.attemptMemo = value;
      markAttemptDirty();
    },
    onProblemMemoChange: async (value) => {
      const ctx = getDocumentContext();
      if (ctx) await saveProblemNote(ctx.problemKey, value);
    },
  });

  document.getElementById("ws-attempt-preview-close")?.addEventListener("click", () => {
    const modal = document.getElementById("ws-attempt-preview-modal");
    if (modal) modal.hidden = true;
    if (!document.querySelector('.ws-modal:not([hidden])')) document.body.classList.remove("ws-modal-open");
  });

  window.__workspaceAttemptPreview = previewAttempt;

  window.addEventListener("beforeunload", (e) => {
    if (attemptSession.isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  return {
    attemptSession,
    attemptUi,
    registerUploadedDocument,
    onDocumentReady,
    markAttemptDirty,
    flushAttemptDraft,
    saveCompletedAttempt,
    promptSaveIfDirty,
    openAttemptById,
    migrateLegacy: migrateLegacyAttempts,
    refreshHistory: () => attemptHistory?.refresh?.(),
    syncMemoPanelForActive,
    saveWithChoice: (choice) => attemptUi.performSave(choice, attemptSession.getLoadedAttemptId()),
    startFresh: (opts) => {
      const ctx = getDocumentContext();
      return ctx ? startFreshAttempt(ctx, opts) : Promise.resolve();
    },
    getLoadedAttemptId: () => attemptSession.getLoadedAttemptId(),
    setActiveProblem(problem) {
      activeProblem = problem || null;
    },
    getActiveProblem: () => activeProblem,
    clearActiveProblem: () => {
      activeProblem = null;
    },
  };
}
