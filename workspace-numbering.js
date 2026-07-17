/**
 * 답안 동그라미 번호 — 타이핑 변환 / 보조 삽입
 */

const CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
];

const CIRCLED_RE = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]$/;

export function formatCircledNumber(n) {
  const num = Math.max(1, Math.min(20, Number(n) || 1));
  return CIRCLED[num - 1] || `${num}`;
}

/** @deprecated use formatCircledNumber */
export function formatNumberToken(format, n) {
  if (format === "circled" || !format) return formatCircledNumber(n);
  return formatCircledNumber(n);
}

export function parseTypedCircledPattern(lineText) {
  const m = String(lineText || "").match(/^(\d{1,2})\)$/);
  if (!m) return null;
  const num = Number(m[1]);
  if (num < 1 || num > 20) return null;
  return num;
}

export function getLeadingWhitespace(text) {
  const match = String(text || "").match(/^(\s*)/);
  return match ? match[1] : "";
}

export function isCircledOnlyLine(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return true;
  return CIRCLED_RE.test(trimmed);
}

export function nextCircledAfter(text) {
  const trimmed = String(text || "").trim();
  for (let i = 0; i < CIRCLED.length; i++) {
    if (trimmed.startsWith(CIRCLED[i])) {
      return i + 2 <= 20 ? i + 2 : 20;
    }
  }
  return 1;
}

export function renderNumberPopup(popupEl, { onInsert, onAutoIncrementChange, getAutoIncrement, onClose }) {
  if (!popupEl) return;
  popupEl.innerHTML = `
    <div class="ws-number-popup-inner">
      <header class="ws-number-popup-header">
        <strong>번호 도구</strong>
        <button type="button" class="ws-btn ws-number-popup-close" data-num-close>✕</button>
      </header>
      <div class="ws-number-popup-body">
        <p class="ws-number-hint">타이핑: <code>1)</code> + Space → ①</p>
        <label class="ws-number-field ws-number-toggle">
          <input type="checkbox" id="ws-circled-auto" />
          <span>동그라미 번호 자동 증가</span>
        </label>
        <label class="ws-number-field">
          <span>번호 직접 삽입</span>
          <div class="ws-number-insert-row">
            <input type="number" id="ws-num-start" min="1" max="20" value="1" class="ws-input-short" />
            <div class="ws-number-preview" id="ws-num-preview">①</div>
            <button type="button" id="ws-num-insert-one" class="ws-btn ws-btn-primary">삽입</button>
          </div>
        </label>
      </div>
    </div>`;

  const startEl = popupEl.querySelector("#ws-num-start");
  const previewEl = popupEl.querySelector("#ws-num-preview");
  const autoEl = popupEl.querySelector("#ws-circled-auto");

  const updatePreview = () => {
    const n = Number(startEl?.value) || 1;
    if (previewEl) previewEl.textContent = formatCircledNumber(n);
  };

  startEl?.addEventListener("input", updatePreview);
  updatePreview();

  autoEl?.addEventListener("change", () => {
    onAutoIncrementChange?.(Boolean(autoEl.checked));
  });

  popupEl.querySelector("#ws-num-insert-one")?.addEventListener("click", () => {
    onInsert?.(Number(startEl?.value) || 1);
    onClose?.();
  });

  popupEl.querySelector("[data-num-close]")?.addEventListener("click", () => onClose?.());

  popupEl._syncAutoIncrement = () => {
    if (autoEl) autoEl.checked = Boolean(getAutoIncrement?.());
  };
}

export function showNumberPopup(popupEl, anchorRect) {
  if (!popupEl) return;
  popupEl.hidden = false;
  popupEl._syncAutoIncrement?.();
  const left = Math.min(anchorRect?.left ?? 100, window.innerWidth - 280);
  const top = (anchorRect?.bottom ?? 100) + 6;
  popupEl.style.left = `${Math.max(8, left)}px`;
  popupEl.style.top = `${top}px`;
}

export function hideNumberPopup(popupEl) {
  if (popupEl) popupEl.hidden = true;
}
