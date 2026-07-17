/**
 * Attempt UI — 모달·저장 선택
 */
import {
  deleteAttemptRecord,
  duplicateAttemptAsNew,
  getAttempt,
  listAttemptsByProblemKey,
  saveAttempt,
  updateAttemptRecord,
} from "./workspace-attempt-service.js";
import {
  formatAttemptDate,
  formatAttemptDuration,
  memoPreview,
  statusLabel,
} from "./workspace-attempt-model.js";

function openModal(el) {
  if (!el) return;
  el.hidden = false;
  document.body.classList.add("ws-modal-open");
}

function closeModal(el) {
  if (!el) return;
  el.hidden = true;
  if (!document.querySelector('.ws-modal:not([hidden])')) {
    document.body.classList.remove("ws-modal-open");
  }
}

export function createAttemptUiController({
  buildAttemptPayload,
  countLinesFn,
  onLoadAttempt,
  onStartFresh,
  refreshHistory,
}) {
  const existingModal = document.getElementById("ws-attempt-existing-modal");
  const listModal = document.getElementById("ws-attempt-list-modal");
  const newModal = document.getElementById("ws-attempt-new-modal");
  const saveModal = document.getElementById("ws-attempt-save-modal");
  const unsavedModal = document.getElementById("ws-attempt-unsaved-modal");
  const deleteModal = document.getElementById("ws-attempt-delete-modal");

  let pendingContext = null;
  let pendingDeleteId = null;
  let saveResolver = null;

  function renderExistingSummary(attempts) {
    const el = document.getElementById("ws-attempt-existing-summary");
    if (!el || !attempts.length) return;
    const latest = attempts[0];
    el.innerHTML = `
      <p class="ws-attempt-existing-count">저장된 시도 ${attempts.length}개</p>
      <ul class="ws-attempt-existing-stats">
        <li><span>최근 풀이</span><strong>${formatAttemptDate(latest.updatedAt)}</strong></li>
        <li><span>사용 시간</span><strong>${formatAttemptDuration(latest.elapsedSeconds)}</strong></li>
        <li><span>작성 페이지</span><strong>${latest.answerPageCount}페이지</strong></li>
        <li><span>상태</span><strong>${statusLabel(latest.status)}</strong></li>
        ${latest.memo ? `<li><span>메모</span><strong>${memoPreview(latest.memo, 60)}</strong></li>` : ""}
      </ul>
    `;
  }

  function renderAttemptList(attempts, containerId, mode = "select") {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!attempts.length) {
      el.innerHTML = `<p class="ws-attempt-empty">풀이 기록이 없습니다.</p>`;
      return;
    }
    el.innerHTML = attempts
      .map(
        (a) => `
      <article class="ws-attempt-card" data-attempt-id="${a.id}">
        <div class="ws-attempt-card-head">
          <strong>${formatAttemptDate(a.updatedAt)}</strong>
          <span class="ws-attempt-badge">${a.attemptNumber}회차</span>
        </div>
        <ul class="ws-attempt-card-meta">
          <li>${statusLabel(a.status)}</li>
          <li>${formatAttemptDuration(a.elapsedSeconds)}</li>
          <li>${a.answerPageCount}페이지</li>
          ${a.memo ? "<li>메모 있음</li>" : ""}
        </ul>
        <div class="ws-attempt-card-actions">
          <button type="button" class="ws-btn" data-action="load">불러오기</button>
          <button type="button" class="ws-btn" data-action="preview">미리보기</button>
          <button type="button" class="ws-btn" data-action="duplicate">복제하여 다시 풀기</button>
          ${mode === "select" ? `<button type="button" class="ws-btn ws-btn-danger" data-action="delete">삭제</button>` : ""}
        </div>
      </article>`
      )
      .join("");

    el.querySelectorAll(".ws-attempt-card").forEach((card) => {
      const id = card.dataset.attemptId;
      card.querySelector('[data-action="load"]')?.addEventListener("click", async () => {
        const attempt = await getAttempt(id);
        if (attempt) {
          closeModal(listModal);
          closeModal(existingModal);
          await onLoadAttempt?.(attempt, pendingContext);
        }
      });
      card.querySelector('[data-action="preview"]')?.addEventListener("click", async () => {
        const attempt = await getAttempt(id);
        if (attempt) window.__workspaceAttemptPreview?.(attempt);
      });
      card.querySelector('[data-action="duplicate"]')?.addEventListener("click", async () => {
        const attempt = await getAttempt(id);
        if (!attempt) return;
        const copy = await duplicateAttemptAsNew(attempt, { countLinesFn });
        closeModal(listModal);
        closeModal(existingModal);
        await onLoadAttempt?.(copy, pendingContext);
      });
      card.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
        pendingDeleteId = id;
        openModal(deleteModal);
      });
    });
  }

  async function showExistingAttemptsModal(context) {
    pendingContext = context;
    const attempts = await listAttemptsByProblemKey(context.problemKey);
    if (!attempts.length) {
      await onStartFresh?.(context, { copyTags: true });
      return;
    }
    renderExistingSummary(attempts);
    openModal(existingModal);
  }

  async function showAttemptListModal(context) {
    pendingContext = context;
    const attempts = await listAttemptsByProblemKey(context.problemKey);
    renderAttemptList(attempts, "ws-attempt-list-body", "select");
    openModal(listModal);
  }

  function showNewAttemptModal(context) {
    pendingContext = context;
    openModal(newModal);
  }

  function askSaveChoice({ defaultChoice = "new" } = {}) {
    return new Promise((resolve) => {
      saveResolver = resolve;
      const updateBtn = saveModal?.querySelector('[data-save-choice="update"]');
      const newBtn = saveModal?.querySelector('[data-save-choice="new"]');
      if (updateBtn) updateBtn.classList.toggle("ws-btn-primary", defaultChoice === "update");
      if (newBtn) newBtn.classList.toggle("ws-btn-primary", defaultChoice === "new");
      openModal(saveModal);
    });
  }

  function askUnsavedChoice() {
    return new Promise((resolve) => {
      saveResolver = resolve;
      openModal(unsavedModal);
    });
  }

  async function performSave(choice, loadedAttemptId) {
    const payload = buildAttemptPayload?.();
    if (!payload) return null;
    if (choice === "update" && loadedAttemptId) {
      return updateAttemptRecord(loadedAttemptId, payload, { countLinesFn, addRevision: true });
    }
    return saveAttempt({ ...payload, sourceAttemptId: loadedAttemptId || null }, { countLinesFn });
  }

  existingModal?.querySelector('[data-action="load-latest"]')?.addEventListener("click", async () => {
    const attempts = await listAttemptsByProblemKey(pendingContext?.problemKey);
    if (attempts[0]) {
      closeModal(existingModal);
      await onLoadAttempt?.(attempts[0], pendingContext);
    }
  });
  existingModal?.querySelector('[data-action="open-list"]')?.addEventListener("click", () => {
    closeModal(existingModal);
    showAttemptListModal(pendingContext);
  });
  existingModal?.querySelector('[data-action="start-new"]')?.addEventListener("click", () => {
    closeModal(existingModal);
    showNewAttemptModal(pendingContext);
  });
  existingModal?.querySelector('[data-action="cancel-existing"]')?.addEventListener("click", () => {
    closeModal(existingModal);
  });

  listModal?.querySelector('[data-action="close-list"]')?.addEventListener("click", () => closeModal(listModal));

  newModal?.querySelector('[data-action="confirm-new"]')?.addEventListener("click", async () => {
    const copyMemo = document.getElementById("ws-new-copy-memo")?.checked;
    const copyTags = document.getElementById("ws-new-copy-tags")?.checked ?? true;
    const copyAnnotations = document.getElementById("ws-new-copy-annotations")?.checked;
    closeModal(newModal);
    await onStartFresh?.(pendingContext, { copyMemo, copyTags, copyAnnotations });
  });
  newModal?.querySelector('[data-action="cancel-new"]')?.addEventListener("click", () => closeModal(newModal));

  saveModal?.querySelectorAll("[data-save-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choice = btn.dataset.saveChoice;
      closeModal(saveModal);
      saveResolver?.(choice === "cancel" ? null : choice);
      saveResolver = null;
    });
  });

  unsavedModal?.querySelectorAll("[data-unsaved-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeModal(unsavedModal);
      saveResolver?.(btn.dataset.unsavedChoice);
      saveResolver = null;
    });
  });

  deleteModal?.querySelector('[data-action="confirm-delete"]')?.addEventListener("click", async () => {
    if (pendingDeleteId) {
      await deleteAttemptRecord(pendingDeleteId);
      pendingDeleteId = null;
      closeModal(deleteModal);
      if (pendingContext) renderAttemptList(await listAttemptsByProblemKey(pendingContext.problemKey), "ws-attempt-list-body");
      refreshHistory?.();
    }
  });
  deleteModal?.querySelector('[data-action="cancel-delete"]')?.addEventListener("click", () => {
    pendingDeleteId = null;
    closeModal(deleteModal);
  });

  return {
    showExistingAttemptsModal,
    showAttemptListModal,
    askSaveChoice,
    askUnsavedChoice,
    performSave,
  };
}
