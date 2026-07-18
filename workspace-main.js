/**
 * App entry — auth gate + MVP workspace
 */
import { initAuth } from "./workspace-auth.js";
import { bindSaveAndExitControl } from "./workspace-save-trace.js";

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindSaveAndExitControl);
  } else {
    bindSaveAndExitControl();
  }
}

let workspaceStarted = false;
let workspaceInitPromise = null;

async function ensureWorkspace() {
  const bridge = window.__workspaceAttemptBridge;
  if (bridge?.saveAndPause && bridge?.registerUploadedDocument) return;

  if (workspaceInitPromise) {
    await workspaceInitPromise;
    return;
  }

  workspaceInitPromise = (async () => {
    if (!workspaceStarted) workspaceStarted = true;
    try {
      const buildId = document.querySelector('meta[name="app-build-id"]')?.content?.trim();
      const moduleUrl = buildId ? `./workspace-app.js?v=${encodeURIComponent(buildId)}` : "./workspace-app.js";
      const { initWorkspace } = await import(moduleUrl);
      await initWorkspace();
    } catch (err) {
      workspaceStarted = false;
      throw err;
    }
  })();

  try {
    await workspaceInitPromise;
  } finally {
    workspaceInitPromise = null;
  }
}

if (typeof window !== "undefined") {
  window.__ensureWorkspace = ensureWorkspace;
}

async function handleSignedOut() {
  workspaceStarted = false;
  try {
    const mod = await import("./workspace-app.js");
    await mod.cleanupWorkspaceForLogout?.();
  } catch (err) {
    console.warn("[auth] Workspace reset on logout failed:", err);
  }
}

initAuth({
  onAuthenticated: ensureWorkspace,
  onSignedOut: handleSignedOut,
}).catch((err) => {
  console.error("App bootstrap failed:", err);
  const errorEl = document.getElementById("auth-gate-error");
  const btn = document.getElementById("auth-google-btn");
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = "로그인 모듈을 불러오지 못했습니다. 페이지를 새로고침해주세요.";
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-loading");
  }
});
