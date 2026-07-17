/**
 * 문제지 플로팅 주석 툴바
 */

const DEFAULT_POS = { x: 12, y: 12 };
const DRAG_THRESHOLD = 4;

export function createFloatingToolbar({
  toolbarEl,
  handleEl,
  minimizeBtn,
  expandBtn,
  orientBtn,
  paneEl,
  getState,
  setState,
  onToolChange,
  onAction,
}) {
  if (!toolbarEl || !paneEl) return null;

  let dragging = false;
  let dragMoved = false;
  let dragStart = { x: 0, y: 0, left: 0, top: 0 };

  function applyOrientation(vertical) {
    toolbarEl.classList.toggle("is-vertical", vertical);
    if (orientBtn) {
      orientBtn.title = vertical ? "가로 배치" : "세로 배치";
      orientBtn.textContent = vertical ? "⇄" : "⇅";
      orientBtn.setAttribute("aria-pressed", vertical ? "true" : "false");
    }
  }

  function clampPosition(x, y) {
    const pane = paneEl.getBoundingClientRect();
    const bar = toolbarEl.getBoundingClientRect();
    const maxX = Math.max(0, pane.width - bar.width - 4);
    const maxY = Math.max(0, pane.height - bar.height - 4);
    return {
      x: Math.max(4, Math.min(maxX, x)),
      y: Math.max(4, Math.min(maxY, y)),
    };
  }

  function applyPosition(pos) {
    const p = clampPosition(pos?.x ?? DEFAULT_POS.x, pos?.y ?? DEFAULT_POS.y);
    toolbarEl.style.left = `${p.x}px`;
    toolbarEl.style.top = `${p.y}px`;
    setState?.({ floatToolbarPos: p });
  }

  function restore() {
    const pos = getState()?.floatToolbarPos || DEFAULT_POS;
    const minimized = Boolean(getState()?.floatToolbarMinimized);
    const vertical = Boolean(getState()?.floatToolbarVertical);
    applyOrientation(vertical);
    toolbarEl.classList.toggle("is-minimized", minimized);
    applyPosition(pos);
  }

  function canStartDrag(target) {
    if (target.closest("#ws-float-handle")) return true;
    if (toolbarEl.classList.contains("is-minimized") && target.closest("#ws-float-expand")) {
      return true;
    }
    return false;
  }

  function startDrag(e) {
    if (!canStartDrag(e.target)) return;
    dragging = true;
    dragMoved = false;
    const pos = getState()?.floatToolbarPos || DEFAULT_POS;
    dragStart = { x: e.clientX, y: e.clientY, left: pos.x, top: pos.y };
    e.preventDefault();
  }

  toolbarEl.addEventListener("mousedown", startDrag);

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      dragMoved = true;
    }
    applyPosition({ x: dragStart.left + dx, y: dragStart.top + dy });
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    if (dragMoved) onAction?.("savePosition");
  });

  minimizeBtn?.addEventListener("click", () => {
    toolbarEl.classList.add("is-minimized");
    setState?.({ floatToolbarMinimized: true });
    applyPosition(getState()?.floatToolbarPos || DEFAULT_POS);
    onAction?.("savePosition");
  });

  expandBtn?.addEventListener("click", (e) => {
    if (dragMoved) {
      e.preventDefault();
      dragMoved = false;
      return;
    }
    toolbarEl.classList.remove("is-minimized");
    setState?.({ floatToolbarMinimized: false });
    applyPosition(getState()?.floatToolbarPos || DEFAULT_POS);
    onAction?.("savePosition");
  });

  orientBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const vertical = !Boolean(getState()?.floatToolbarVertical);
    applyOrientation(vertical);
    setState?.({ floatToolbarVertical: vertical });
    applyPosition(getState()?.floatToolbarPos || DEFAULT_POS);
    onAction?.("savePosition");
  });

  toolbarEl.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => onToolChange?.(btn.dataset.tool));
  });

  toolbarEl.querySelectorAll("[data-draw-action]").forEach((btn) => {
    btn.addEventListener("click", () => onAction?.(btn.dataset.drawAction));
  });

  toolbarEl.querySelector("#ws-float-line-color")?.addEventListener("change", (e) => {
    onAction?.("lineColor", e.target.value);
  });
  toolbarEl.querySelector("#ws-float-highlight-color")?.addEventListener("change", (e) => {
    onAction?.("highlightColor", e.target.value);
  });

  restore();

  return { restore, applyPosition };
}

export function updateFloatingToolUi(tool, colorState = {}) {
  const root = document.getElementById("ws-float-toolbar");
  if (!root) return;
  const normalized = tool === "cursor" ? "view" : tool;
  root.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tool === normalized);
  });
  const colorWrap = root.querySelector("#ws-float-color-wrap");
  const lineSel = root.querySelector("#ws-float-line-color");
  const hiSel = root.querySelector("#ws-float-highlight-color");
  const penSel = root.querySelector("#ws-float-pen-color");
  if (colorWrap) {
    colorWrap.hidden = !["underline", "highlighter", "pen"].includes(normalized);
    if (lineSel) {
      lineSel.hidden = normalized !== "underline";
      lineSel.style.display = normalized === "underline" ? "" : "none";
    }
    if (hiSel) {
      hiSel.hidden = normalized !== "highlighter";
      hiSel.style.display = normalized === "highlighter" ? "" : "none";
    }
    if (penSel) {
      penSel.hidden = normalized !== "pen";
      penSel.style.display = normalized === "pen" ? "" : "none";
    }
  }
  if (lineSel && colorState.lineColor) lineSel.value = colorState.lineColor;
  if (hiSel && colorState.highlightColor) hiSel.value = colorState.highlightColor;
  if (penSel && colorState.penColor) penSel.value = colorState.penColor;
}
