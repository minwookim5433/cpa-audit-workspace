/**
 * 풀이 기록 사이드바 패널
 */
import { filterAttempts, sortAttempts, listAllAttempts } from "./workspace-attempt-service.js";
import {
  formatAttemptDate,
  formatAttemptDuration,
  statusLabel,
} from "./workspace-attempt-model.js";

export function createAttemptHistoryPanel({
  containerEl,
  filterEl,
  sortEl,
  onContinue,
  onPreview,
  onRetry,
  onExportPdf,
}) {
  if (!containerEl) return { refresh: async () => {} };

  async function refresh() {
    const filter = filterEl?.value || "all";
    const sortBy = sortEl?.value || "updatedDesc";
    let attempts = await listAllAttempts();
    attempts = filterAttempts(attempts, { filter });
    attempts = sortAttempts(attempts, sortBy);

    if (!attempts.length) {
      containerEl.innerHTML = `<p class="ws-attempt-empty">풀이 기록이 없습니다.</p>`;
      return;
    }

    containerEl.innerHTML = attempts
      .map(
        (a) => `
      <article class="ws-attempt-history-card" data-id="${a.id}">
        <div class="ws-attempt-history-head">
          <strong>${a.documentTitle || "시험지"}</strong>
          <span class="ws-attempt-badge">${a.attemptNumber}회차</span>
        </div>
        <div class="ws-attempt-history-sub">${a.problemLabel}${a.questionRange ? ` · ${a.questionRange}` : ""}</div>
        <ul class="ws-attempt-card-meta">
          <li>${formatAttemptDate(a.updatedAt)}</li>
          <li>${formatAttemptDuration(a.elapsedSeconds)}</li>
          <li>${a.answerPageCount}페이지</li>
          <li>${statusLabel(a.status)}</li>
          ${a.memo ? "<li>메모</li>" : ""}
          ${a.tags?.length ? `<li>${a.tags.slice(0, 2).join(", ")}</li>` : ""}
        </ul>
        <div class="ws-attempt-card-actions">
          <button type="button" class="ws-btn" data-action="continue">이어 풀기</button>
          <button type="button" class="ws-btn" data-action="preview">미리보기</button>
          <button type="button" class="ws-btn" data-action="pdf">PDF 저장</button>
          <button type="button" class="ws-btn" data-action="retry">다시 풀기</button>
        </div>
      </article>`
      )
      .join("");

    containerEl.querySelectorAll(".ws-attempt-history-card").forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('[data-action="continue"]')?.addEventListener("click", () => onContinue?.(id));
      card.querySelector('[data-action="preview"]')?.addEventListener("click", () => onPreview?.(id));
      card.querySelector('[data-action="pdf"]')?.addEventListener("click", () => onExportPdf?.(id));
      card.querySelector('[data-action="retry"]')?.addEventListener("click", () => onRetry?.(id));
    });
  }

  filterEl?.addEventListener("change", refresh);
  sortEl?.addEventListener("change", refresh);

  return { refresh };
}

export function initMemoPanel({ attemptMemoEl, problemMemoEl, onAttemptMemoChange, onProblemMemoChange }) {
  const tabs = document.querySelectorAll("[data-memo-tab]");
  const panels = document.querySelectorAll("[data-memo-panel]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      panels.forEach((p) => p.classList.toggle("is-active", p.dataset.memoPanel === tab.dataset.memoTab));
    });
  });
  attemptMemoEl?.addEventListener("input", () => onAttemptMemoChange?.(attemptMemoEl.value));
  problemMemoEl?.addEventListener("input", () => onProblemMemoChange?.(problemMemoEl.value));
}

export function syncMemoPanelUi({ attemptMemo = "", problemMemo = "" } = {}) {
  const attemptEl = document.getElementById("ws-attempt-memo");
  const problemEl = document.getElementById("ws-problem-memo");
  if (attemptEl && attemptEl !== document.activeElement) attemptEl.value = attemptMemo;
  if (problemEl && problemEl !== document.activeElement) problemEl.value = problemMemo;
}
