/**
 * App entry — auth gate + MVP workspace
 */
import { initAuth } from "./workspace-auth.js";

let workspaceStarted = false;

async function ensureWorkspace() {
  if (workspaceStarted) return;
  workspaceStarted = true;
  const { initWorkspace } = await import("./workspace-app.js");
  await initWorkspace();
}

initAuth({
  onAuthenticated: ensureWorkspace,
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
