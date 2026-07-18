/**
 * 상단 고정 시험 타이머
 */

export function formatTimerClock(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function clampDurationMinutes(minutes) {
  return Math.max(1, Math.min(300, Number(minutes) || 1));
}

export function minutesToSeconds(minutes) {
  return clampDurationMinutes(minutes) * 60;
}

export function loadTimerPosition() {
  return { x: null, y: null };
}

export function saveTimerPosition() {}

export function createFloatingTimer({
  rootEl,
  displayEl,
  startBtn,
  presetButtons,
  customInputEl,
  getState,
}) {
  if (!rootEl) return null;

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

  function hideTimer() {
    rootEl.hidden = true;
    rootEl.setAttribute("hidden", "");
    rootEl.style.display = "none";
    rootEl.classList.add("is-hidden");
    const settingsPanel = document.getElementById("ws-timer-settings-panel");
    if (settingsPanel) settingsPanel.hidden = true;
  }

  function showTimer() {
    rootEl.hidden = false;
    rootEl.removeAttribute("hidden");
    rootEl.style.display = "";
    rootEl.classList.remove("is-hidden");
  }

  function restore() {
    refreshDisplay();
    syncSettingsUi();
  }

  restore();

  return { restore, refreshDisplay, syncSettingsUi, hideTimer, showTimer };
}
