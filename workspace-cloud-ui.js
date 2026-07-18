/**
 * Supabase 이어풀기 / 로컬 가져오기 모달
 */
import { formatAttemptDate } from "./workspace-attempt-model.js";

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

export function showCloudResumeModal({ documentName = "", updatedAt = null } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("ws-cloud-resume-modal");
    const summary = document.getElementById("ws-cloud-resume-summary");
    if (!modal) {
      resolve("fresh");
      return;
    }

    const title = documentName || "시험지";
    const savedAt = updatedAt ? formatAttemptDate(updatedAt) : "—";
    if (summary) {
      summary.innerHTML = `
        <p><strong>${escapeHtml(title)}</strong>에 저장된 풀이가 있습니다.</p>
        <ul class="ws-attempt-existing-stats">
          <li><span>마지막 저장</span><strong>${escapeHtml(savedAt)}</strong></li>
        </ul>
        <p class="ws-cloud-resume-hint">이어서 풀기를 선택하면 답안·주석·페이지·타이머 상태가 복원됩니다.</p>
      `;
    }

    const finish = (choice) => {
      closeModal(modal);
      resolve(choice);
    };

    const onContinue = () => finish("continue");
    const onFresh = () => finish("fresh");
    const onCancel = () => finish("cancel");

    modal.querySelector('[data-action="cloud-continue"]')?.addEventListener("click", onContinue, { once: true });
    modal.querySelector('[data-action="cloud-fresh"]')?.addEventListener("click", onFresh, { once: true });
    modal.querySelector('[data-action="cloud-cancel"]')?.addEventListener("click", onCancel, { once: true });

    openModal(modal);
  });
}

export function showLocalImportModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById("ws-cloud-import-modal");
    if (!modal) {
      resolve("skip");
      return;
    }

    const finish = (choice) => {
      closeModal(modal);
      resolve(choice);
    };

    modal.querySelector('[data-action="import-local"]')?.addEventListener("click", () => finish("import"), {
      once: true,
    });
    modal.querySelector('[data-action="skip-import"]')?.addEventListener("click", () => finish("skip"), {
      once: true,
    });

    openModal(modal);
  });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
