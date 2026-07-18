/**
 * [임시저장] 단계별 진단 — 개발 환경에서만 Console + 화면 패널
 */
export const DEBUG_SAVE = false;

const PANEL_ID = "ws-save-trace-status";
const BODY_ID = "ws-save-trace-status-body";

function ensurePanel() {
  if (!DEBUG_SAVE) return null;
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "ws-save-trace-status";
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <header class="ws-save-trace-status-head">
      <strong>저장 진단</strong>
      <button type="button" class="ws-btn ws-save-trace-status-close" data-save-trace-close aria-label="닫기">✕</button>
    </header>
    <pre class="ws-save-trace-status-body" id="${BODY_ID}"></pre>
  `;
  document.body.appendChild(panel);

  panel.querySelector("[data-save-trace-close]")?.addEventListener("click", () => {
    panel.hidden = true;
  });

  return panel;
}

function appendPanelLine(line) {
  if (!DEBUG_SAVE) return;
  const panel = ensurePanel();
  const body = document.getElementById(BODY_ID);
  if (!panel || !body) return;

  const prefix = body.textContent ? "\n" : "";
  body.textContent += `${prefix}${line}`;
  panel.hidden = false;
  panel.classList.remove("is-success", "is-error");
}

export function resetSaveTracePanel() {
  if (!DEBUG_SAVE) return;
  const panel = ensurePanel();
  const body = document.getElementById(BODY_ID);
  if (body) body.textContent = "";
  if (panel) {
    panel.hidden = false;
    panel.classList.remove("is-success", "is-error");
  }
}

export function showSaveTraceStatus(message) {
  if (!DEBUG_SAVE) return;
  ensurePanel();
  appendPanelLine(String(message ?? ""));
}

export function traceSave(step, detail = null) {
  const suffix = detail == null || detail === "" ? "" : ` ${detail}`;
  const line = `[SAVE_TRACE ${step}]${suffix}`;
  if (DEBUG_SAVE) {
    console.log(line);
    appendPanelLine(line);
  }
}

export function traceSaveError(error = {}) {
  const parts = [
    `[SAVE_TRACE ERROR]`,
    `code: ${error.code ?? "—"}`,
    `message: ${error.message ?? "—"}`,
    `details: ${error.details ?? "—"}`,
    `hint: ${error.hint ?? "—"}`,
    `status: ${error.status ?? "—"}`,
  ];
  const line = parts.join("\n");
  console.error(line);
  if (DEBUG_SAVE) {
    appendPanelLine(line);
    const panel = ensurePanel();
    panel?.classList.add("is-error");
  }
}

export function traceSaveSuccess(message = "save succeeded") {
  traceSave("7", message);
  if (!DEBUG_SAVE) return;
  showSaveTraceStatus("임시저장 완료");
  const panel = ensurePanel();
  panel?.classList.add("is-success");
}

let saveExitControlBound = false;
let saveExitClickInFlight = false;

function resolveAttemptBridge() {
  return window.__workspaceAttemptBridge || null;
}

async function waitForAttemptBridge() {
  let bridge = resolveAttemptBridge();
  if (bridge?.saveAndPause) return bridge;

  if (DEBUG_SAVE) {
    showSaveTraceStatus("워크스페이스 준비 중…");
    traceSave("2b", "waiting for workspace init");
  }
  try {
    await window.__ensureWorkspace?.();
  } catch (err) {
    traceSaveError({
      code: "WORKSPACE_INIT_FAILED",
      message: err?.message ?? String(err),
    });
    return null;
  }

  bridge = resolveAttemptBridge();
  return bridge?.saveAndPause ? bridge : null;
}

async function handleSaveAndExitClick(event) {
  const btn = event.target.closest("#ws-save-pause-btn");
  if (!btn || btn.disabled) return;

  event.preventDefault();
  event.stopPropagation();

  if (DEBUG_SAVE) {
    resetSaveTracePanel();
    traceSave("1", "save-and-exit button clicked");
    showSaveTraceStatus("임시저장 요청 시작");
    traceSave("2", "handler entered");
  }

  if (saveExitClickInFlight) {
    traceSaveError({
      code: "SAVE_IN_FLIGHT",
      message: "이미 저장 요청이 진행 중입니다.",
    });
    return;
  }

  const bridge = await waitForAttemptBridge();
  if (!bridge?.saveAndPause) {
    traceSaveError({
      code: "ATTEMPT_BRIDGE_MISSING",
      message: "attemptBridge.saveAndPause가 준비되지 않았습니다.",
      details: "initWorkspace() 이후에도 bridge를 찾지 못했습니다.",
    });
    if (DEBUG_SAVE) showSaveTraceStatus("저장 모듈 미준비");
    return;
  }

  saveExitClickInFlight = true;
  try {
    await bridge.saveAndPause();
  } catch (err) {
    traceSaveError({
      code: err?.code ?? null,
      message: err?.message ?? String(err),
      details: err?.details ?? null,
      hint: err?.hint ?? null,
      status: err?.status ?? null,
    });
  } finally {
    saveExitClickInFlight = false;
  }
}

export function bindSaveAndExitControl() {
  if (saveExitControlBound) return;
  saveExitControlBound = true;

  const root = document.getElementById("app-root") || document.body;
  root.addEventListener("click", handleSaveAndExitClick);
  if (DEBUG_SAVE) {
    console.info("[save-exit] delegation bound:", root.id || "body", "→ #ws-save-pause-btn");
  }
}
