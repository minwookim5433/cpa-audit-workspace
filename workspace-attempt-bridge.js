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
  deleteDraft,
  getDraft,
} from "./workspace-attempt-service.js";
import {
  createAttemptSessionController,
  buildWorkspaceSnapshot,
  applySnapshotToWorkspace,
  applyAttemptToWorkspace,
  hasInProgressWorkspace,
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
import { buildAnswerSheetFromPageHtml } from "./workspace-answer-clone.js";
import {
  fetchCloudWorkspace,
  upsertCloudWorkspaceWithDebug,
  unpackWorkspaceRow,
  getAuthenticatedUser,
  mapCloudSaveError,
} from "./workspace-cloud-service.js";
import { showCloudSaveDebugPanel } from "./workspace-cloud-debug.js";
import {
  showSaveTraceStatus,
  traceSave,
  traceSaveError,
  traceSaveSuccess,
} from "./workspace-save-trace.js";
import { showCloudResumeModal, showLocalImportModal } from "./workspace-cloud-ui.js";

function localImportPromptKey(userId, documentKey) {
  return `cloud-import-prompted:${userId}:${documentKey}`;
}

function wasLocalImportPromptShown(userId, documentKey) {
  return localStorage.getItem(localImportPromptKey(userId, documentKey)) === "1";
}

function markLocalImportPromptShown(userId, documentKey) {
  localStorage.setItem(localImportPromptKey(userId, documentKey), "1");
}

function findLegacyWorkspaceSnapshot(documentId) {
  const raw = localStorage.getItem("cpa-workspace-session");
  if (!raw || !documentId) return null;
  try {
    const legacy = JSON.parse(raw);
    const slot = (legacy.pdfSlots || []).find((s) => s.documentId === documentId);
    if (!slot?.fingerprint) return null;
    const ws = legacy.workspaces?.[slot.fingerprint];
    if (!ws) return null;
    return {
      answerSheet: ws.answerSheet || [],
      answerSheetPage: ws.answerSheetPage ?? 0,
      timerSeconds: ws.timerSeconds ?? 0,
      timerDurationSeconds: ws.timerDurationSeconds,
      timerRemainingSeconds: ws.timerRemainingSeconds,
      bookmarks: ws.bookmarks || [],
      drawAnnotations: ws.drawAnnotations || [],
      answerFontSize: ws.answerFontSize,
      answerLetterSpacing: ws.answerLetterSpacing,
      currentPage: ws.currentPage ?? 1,
      pageViews: ws.pageViews || {},
      memo: ws.attemptMemo || "",
      tags: ws.attemptTags || [],
      status: ws.attemptStatus || "draft",
      caretOffset: ws.caretOffset ?? 0,
      circledNumberSession: ws.circledNumberSession ?? null,
      searchQuery: ws.searchQuery || "",
    };
  } catch {
    return null;
  }
}

async function hasLocalResumeCandidate(ctx, ws, appState) {
  const draft = await getDraft(ctx.problemKey);
  if (draft?.snapshot) return true;
  if (hasInProgressWorkspace(ws, appState)) return true;
  const legacySnapshot = findLegacyWorkspaceSnapshot(ctx.documentId);
  if (legacySnapshot && hasInProgressWorkspace(legacySnapshot, null)) return true;
  return false;
}

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
  flushSaveNow,
  showStatus,
  onResumeRestored,
  flushAnswerPersist,
  restoreExamViewport,
  resolveDocumentKeyForSave,
}) {
  let attemptUi = null;
  let attemptHistory = null;
  let skipAttemptPrompt = false;
  let activeProblem = null;
  let saveAndPauseInFlight = false;

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
    await restoreExamViewport?.();
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

    await deleteDraft(context.problemKey).catch(() => {});

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

  async function tryCloudResumeFlow(ctx, ws) {
    let user;
    try {
      user = await getAuthenticatedUser();
    } catch (authErr) {
      console.warn("[cloud-resume] auth lookup failed:", authErr);
      return false;
    }
    if (!user?.id || !ctx.documentId) return false;

    try {
      const cloudRow = await fetchCloudWorkspace(ctx.documentId);
      if (cloudRow) {
        const snapshot = unpackWorkspaceRow(cloudRow);
        const choice = await showCloudResumeModal({
          documentName: snapshot?.documentName || ctx.documentTitle,
          updatedAt: cloudRow.updated_at,
        });

        if (choice === "continue" && snapshot) {
          applySnapshotToWorkspace(snapshot, state, ws);
          attemptSession.markClean(buildWorkspaceSnapshot(state, ws));
          await refreshWorkspaceAfterLoad();
          onResumeRestored?.("cloud");
          showToast?.("계정에 저장된 풀이를 불러왔습니다.");
          return true;
        }

        if (choice === "fresh") {
          await startFreshAttempt(ctx, { copyTags: false, copyMemo: false, copyAnnotations: false });
          return true;
        }

        if (choice === "cancel") {
          return false;
        }

        return true;
      }

      if (!wasLocalImportPromptShown(user.id, ctx.documentId)) {
        const hasLocal = await hasLocalResumeCandidate(ctx, ws, state);
        if (hasLocal) {
          markLocalImportPromptShown(user.id, ctx.documentId);
          const importChoice = await showLocalImportModal();
          if (importChoice === "import") {
            flushAnswerPersist?.();
            const draft = await getDraft(ctx.problemKey);
            if (draft?.snapshot) {
              applySnapshotToWorkspace(draft.snapshot, state, ws);
            } else if (!hasInProgressWorkspace(ws, state)) {
              const legacySnapshot = findLegacyWorkspaceSnapshot(ctx.documentId);
              if (legacySnapshot) {
                applySnapshotToWorkspace(legacySnapshot, state, ws);
              }
            }
            const snapshot = buildWorkspaceSnapshot(state, ws);
            if (!snapshot) return true;

            setSaveStatus?.("pending");
            try {
              const debugReport = await upsertCloudWorkspaceWithDebug({
                documentKey: ctx.documentId,
                documentName: ctx.documentTitle || getActiveSlot()?.name,
                snapshot,
                legacyFingerprint: ctx.legacyFingerprint,
              });
              showCloudSaveDebugPanel(debugReport);
              if (!debugReport.success) {
                setSaveStatus?.("error");
                showToast?.(mapCloudSaveError({ code: debugReport.error?.code, message: debugReport.error?.message }));
                return true;
              }
              attemptSession.markClean(snapshot);
              setSaveStatus?.("savedDb");
              showToast?.("기존 답안을 계정에 저장했습니다.");
              await refreshWorkspaceAfterLoad();
              onResumeRestored?.("cloud");
            } catch (err) {
              console.error("[cloud-import] failed:", err);
              setSaveStatus?.("error");
              showToast?.(mapCloudSaveError(err));
            }
            return true;
          }
        }
      }
    } catch (err) {
      console.warn("[cloud-resume] lookup failed:", err);
    }

    return false;
  }

  async function onDocumentReady({ forcePrompt = false } = {}) {
    if (document.body.dataset.mainView && document.body.dataset.mainView !== "solve") {
      return;
    }
    const ctx = getDocumentContext();
    if (!ctx) return;
    attemptSession.bindSession({ key: ctx.problemKey, docId: ctx.documentId });

    const ws = getActiveWorkspace();
    const cloudHandled = await tryCloudResumeFlow(ctx, ws);
    if (cloudHandled) return;

    const inProgress = hasInProgressWorkspace(ws, state);

    const draft = await attemptSession.restoreDraftIfAny(ctx.problemKey);
    if (draft) {
      await refreshWorkspaceAfterLoad();
      onResumeRestored?.("draft");
      showToast?.("이어서 풀기: 저장된 초안을 복원했습니다.");
      return;
    }

    if (inProgress) {
      attemptSession.markDirty();
      await attemptSession.flushDraftNow();
      attemptSession.markClean(buildWorkspaceSnapshot(state, ws));
      await refreshWorkspaceAfterLoad();
      onResumeRestored?.("session");
      showToast?.("이어서 풀기: 마지막 풀이 상태를 불러왔습니다.");
      return;
    }

    if (skipAttemptPrompt && !forcePrompt) return;

    const attempts = await listAttemptsByProblemKey(ctx.problemKey);
    if (attempts.length) {
      await attemptUi.showExistingAttemptsModal(ctx);
      return;
    }

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
    flushAnswerPersist?.();

    try {
      const report = await persistWorkspaceToCloudWithDebug({ flushLocal: false });
      showCloudSaveDebugPanel(report);
      if (!report.success) {
        throw Object.assign(new Error(report.error?.message || "CLOUD_SAVE_FAILED"), {
          code: report.error?.code,
          details: report.error?.details,
          hint: report.error?.hint,
          status: report.status,
        });
      }
    } catch (cloudErr) {
      console.error("[saveCompletedAttempt] cloud save failed:", cloudErr);
      throw cloudErr;
    }

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
    await deleteDraft(payload.problemKey).catch(() => {});
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
      const pages = attempt.answerPages || attempt.answerSheet || [];
      const typography = {
        fontSize: attempt.fontSize,
        letterSpacing: attempt.letterSpacing,
      };
      const clones = pages.map((pageHtml, index) =>
        buildAnswerSheetFromPageHtml(index, pageHtml, typography)
      );
      await downloadPdfFromClones(
        clones,
        buildAnswerPdfFilename({
          year: attempt.year,
          documentTitle: attempt.documentTitle,
          docTitle: attempt.documentTitle,
        }),
        typography,
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

  async function persistWorkspaceToCloudWithDebug({ flushLocal = true } = {}) {
    flushAnswerPersist?.();

    const ws = getActiveWorkspace();
    const saveTarget = (await resolveDocumentKeyForSave?.()) || null;
    const ctx = getDocumentContext();
    const documentKey = saveTarget?.documentKey || ctx?.documentId;
    const documentName =
      saveTarget?.documentName || ctx?.documentTitle || getActiveSlot()?.title || getActiveSlot()?.name;
    const legacyFingerprint =
      saveTarget?.legacyFingerprint || ctx?.legacyFingerprint || getActiveSlot()?.fingerprint || "";
    const snapshot = buildWorkspaceSnapshot(state, ws);

    if (!documentKey || !snapshot) {
      traceSaveError({
        code: "SAVE_CONTEXT_MISSING",
        message: "시험지 또는 답안 컨텍스트가 없습니다.",
      });
      return {
        success: false,
        userIdPresent: false,
        userIdPreview: null,
        sessionPresent: false,
        documentKey: documentKey || null,
        tableName: "workspaces",
        onConflict: "user_id,document_key",
        payloadFields: [],
        method: null,
        error: {
          code: "SAVE_CONTEXT_MISSING",
          message: "시험지 또는 답안 컨텍스트가 없습니다.",
          details: null,
          hint: null,
        },
        status: null,
        data: null,
      };
    }

    if (flushLocal) {
      try {
        flushSaveNow?.({ silentStatus: true });
        await attemptSession.flushDraftNow();
      } catch (localErr) {
        console.warn("[persistWorkspaceToCloudWithDebug] local backup failed:", localErr);
      }
    }

    traceSave("4", `payload fields: ${["documentKey", "documentName", "snapshot", "legacyFingerprint"].join(", ")}`);
    showSaveTraceStatus("데이터 준비 완료");

    return upsertCloudWorkspaceWithDebug({
      documentKey,
      documentName,
      snapshot,
      legacyFingerprint,
    });
  }

  async function saveAndPause() {
    if (saveAndPauseInFlight) {
      traceSaveError({
        code: "SAVE_AND_PAUSE_IN_FLIGHT",
        message: "saveAndPause가 이미 실행 중입니다.",
      });
      return false;
    }

    const btn = document.getElementById("ws-save-pause-btn");
    saveAndPauseInFlight = true;
    if (btn) btn.disabled = true;
    setSaveStatus?.("pending");

    try {
      const report = await persistWorkspaceToCloudWithDebug();
      showCloudSaveDebugPanel(report);

      if (!report.success) {
        traceSaveError({
          code: report.error?.code ?? null,
          message: report.error?.message ?? null,
          details: report.error?.details ?? null,
          hint: report.error?.hint ?? null,
          status: report.status ?? null,
        });
        console.error("[saveAndPause] cloud save failed:", report.error);
        setSaveStatus?.("error");
        showToast?.(mapCloudSaveError({ code: report.error?.code, message: report.error?.message }));
        showStatus?.(mapCloudSaveError({ code: report.error?.code, message: report.error?.message }), "error");
        return false;
      }

      traceSaveSuccess();
      const snapshot = buildWorkspaceSnapshot(state, getActiveWorkspace());
      attemptSession.markClean(snapshot);
      setSaveStatus?.("savedDb");
      showToast?.("저장되었습니다.");
      return true;
    } catch (err) {
      traceSaveError({
        code: err?.code ?? null,
        message: err?.message ?? String(err),
        details: err?.details ?? null,
        hint: err?.hint ?? null,
        status: err?.status ?? null,
      });
      console.error("[saveAndPause] unexpected failure:", err);
      showCloudSaveDebugPanel({
        success: false,
        userIdPresent: false,
        userIdPreview: null,
        sessionPresent: false,
        documentKey: null,
        tableName: "workspaces",
        onConflict: "user_id,document_key",
        payloadFields: [],
        method: null,
        error: {
          code: err?.code ?? null,
          message: err?.message ?? String(err),
          details: err?.details ?? null,
          hint: err?.hint ?? null,
        },
        status: err?.status ?? null,
        data: null,
      });
      setSaveStatus?.("error");
      showToast?.("저장에 실패했습니다.");
      showStatus?.("저장에 실패했습니다.", "error");
      return false;
    } finally {
      saveAndPauseInFlight = false;
      if (btn) btn.disabled = false;
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (attemptSession.isDirty()) {
      flushAnswerPersist?.();
      flushSaveNow?.();
      e.preventDefault();
      e.returnValue = "";
    }
  });

  window.addEventListener("pagehide", () => {
    flushAnswerPersist?.();
    flushSaveNow?.();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushAnswerPersist?.();
      flushSaveNow?.();
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
    saveAndPause,
    hasInProgressWork: () => hasInProgressWorkspace(getActiveWorkspace(), state),
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
