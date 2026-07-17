/**
 * 드래그 가능한 플로팅 시험 타이머
 */

const STORAGE_KEY = "cpa-workspace-timer-pos";
const DEFAULT_POS = { x: null, y: null };
const DRAG_THRESHOLD = 4;
const MIN_DURATION_MIN = 1;
const MAX_DURATION_MIN = 300;

export function formatTimerClock(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function clampDurationMinutes(minutes) {
  return Math.max(MIN_DURATION_MIN, Math.min(MAX_DURATION_MIN, Number(minutes) || MIN_DURATION_MIN));
}

export function minutesToSeconds(minutes) {
  return clampDurationMinutes(minutes) * 60;
}

export function loadTimerPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_POS };
    const parsed = JSON.parse(raw);
    return {
      x: Number.isFinite(parsed?.x) ? parsed.x : null,
      y: Number.isFinite(parsed?.y) ? parsed.y : null,
    };
  } catch {
    return { ...DEFAULT_POS };
  }
}

export function saveTimerPosition(pos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: pos.x, y: pos.y }));
}

export function createFloatingTimer({
  rootEl,
  dragHandleEl,
  displayEl,
  startBtn,
  presetButtons,
  customInputEl,
  getState,
  setState,
  onSave,
}) {
  if (!rootEl) return null;

  let dragging = false;
  let dragMoved = false;
  let dragStart = { x: 0, y: 0, left: 0, top: 0 };

  function clampPosition(x, y) {
    const rect = rootEl.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    return {
      x: Math.max(8, Math.min(maxX, x)),
      y: Math.max(8, Math.min(maxY, y)),
    };
  }

  function defaultPosition() {
    const rect = rootEl.getBoundingClientRect();
    return clampPosition(window.innerWidth - rect.width - 16, window.innerHeight - rect.height - 16);
  }

  function applyPosition(pos) {
    const stored = pos?.x != null && pos?.y != null ? pos : defaultPosition();
    const p = clampPosition(stored.x, stored.y);
    rootEl.style.left = `${p.x}px`;
    rootEl.style.top = `${p.y}px`;
    setState?.({ timerPos: p });
    saveTimerPosition(p);
  }

  function restore() {
    const pos = getState()?.timerPos || loadTimerPosition();
    applyPosition(pos);
    refreshDisplay();
    syncSettingsUi();
  }

  function refreshDisplay() {
    if (!displayEl) return;
    const remaining = getState()?.timerRemainingSeconds ?? getState()?.timerDurationSeconds ?? 7200;
    displayEl.textContent = formatTimerClock(remaining);
    if (startBtn) {
      startBtn.textContent = getState()?.timerRunning ? "⏸" : "▶";
      startBtn.title = getState()?.timerRunning ? "일시정지" : "시작";
    }
  }

  function syncSettingsUi() {
    const minutes = Math.round((getState()?.timerDurationSeconds ?? 7200) / 60);
    presetButtons?.forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.dataset.timerMinutes) === minutes);
    });
    if (customInputEl) customInputEl.value = String(minutes);
  }

  function canStartDrag(target) {
    if (!dragHandleEl) return false;
    return dragHandleEl.contains(target);
  }

  dragHandleEl?.addEventListener("mousedown", (e) => {
    if (!canStartDrag(e.target)) return;
    dragging = true;
    dragMoved = false;
    const rect = rootEl.getBoundingClientRect();
    dragStart = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) dragMoved = true;
    applyPosition({ x: dragStart.left + dx, y: dragStart.top + dy });
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    if (dragMoved) onSave?.();
    dragMoved = false;
  });

  window.addEventListener("resize", () => {
    applyPosition(getState()?.timerPos || loadTimerPosition());
  });

  restore();

  return { restore, refreshDisplay, applyPosition, syncSettingsUi };
}
