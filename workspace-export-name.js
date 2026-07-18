/**
 * PDF 저장 파일명 입력 모달
 */
import { buildAnswerPdfFilename, sanitizePdfBaseName } from "./workspace-answer-export.js";

const MODAL_ID = "ws-export-name-modal";
const INPUT_ID = "ws-export-name-input";
const ERROR_ID = "ws-export-name-error";

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "ws-modal ws-modal-sm";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="ws-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ws-export-name-title">
      <header class="ws-modal-header">
        <h2 id="ws-export-name-title">답안 이름</h2>
      </header>
      <div class="ws-modal-body">
        <label class="ws-export-name-label" for="${INPUT_ID}">저장할 PDF 파일 이름</label>
        <input type="text" id="${INPUT_ID}" class="ws-export-name-input" maxlength="120" />
        <p id="${ERROR_ID}" class="ws-export-name-error" hidden></p>
      </div>
      <footer class="ws-modal-footer">
        <button type="button" class="ws-btn" data-export-name-cancel>취소</button>
        <button type="button" class="ws-btn ws-btn-primary" data-export-name-save>저장</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function setError(message = "") {
  const errorEl = document.getElementById(ERROR_ID);
  if (!errorEl) return;
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

/**
 * @param {object} meta — buildAnswerPdfFilename에 전달할 메타
 * @returns {Promise<string|null>} sanitized base name or null if cancelled
 */
export function promptPdfExportBaseName(meta = {}) {
  const modal = ensureModal();
  const input = document.getElementById(INPUT_ID);
  if (!input) return Promise.resolve(null);

  const defaultBase = sanitizePdfBaseName(
    buildAnswerPdfFilename(meta).replace(/\.pdf$/i, "")
  );

  return new Promise((resolve) => {
    const close = (value) => {
      modal.hidden = true;
      document.body.classList.remove("ws-modal-open");
      cancelBtn.removeEventListener("click", onCancel);
      saveBtn.removeEventListener("click", onSave);
      input.removeEventListener("keydown", onKeydown);
      modal.removeEventListener("click", onBackdrop);
      resolve(value);
    };

    const onCancel = () => close(null);
    const onSave = () => {
      const raw = input.value;
      if (/[\\/:*?"<>|]/.test(raw)) {
        setError('다음 문자는 사용할 수 없습니다: \\ / : * ? " < > |');
        return;
      }
      const sanitized = sanitizePdfBaseName(raw);
      if (!sanitized) {
        setError("파일 이름을 입력해주세요.");
        return;
      }
      setError("");
      close(sanitized);
    };
    const onKeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSave();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    const onBackdrop = (event) => {
      if (event.target === modal) onCancel();
    };

    const cancelBtn = modal.querySelector("[data-export-name-cancel]");
    const saveBtn = modal.querySelector("[data-export-name-save]");

    input.value = defaultBase;
    setError("");
    modal.hidden = false;
    document.body.classList.add("ws-modal-open");
    input.focus();
    input.select();

    cancelBtn.addEventListener("click", onCancel);
    saveBtn.addEventListener("click", onSave);
    input.addEventListener("keydown", onKeydown);
    modal.addEventListener("click", onBackdrop);
  });
}
