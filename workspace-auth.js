/**
 * Google OAuth 로그인 / 로그아웃 (Supabase Auth)
 */
import { getSupabaseClient } from "/public/js/supabase-client.js";

const els = {};

let onAuthenticatedCallback = null;
let onSignedOutCallback = null;

function cacheElements() {
  els.gate = document.getElementById("auth-gate");
  els.appRoot = document.getElementById("app-root");
  els.googleBtn = document.getElementById("auth-google-btn");
  els.errorEl = document.getElementById("auth-gate-error");
  els.userBar = document.getElementById("ws-auth-user");
  els.avatar = document.getElementById("ws-auth-avatar");
  els.label = document.getElementById("ws-auth-label");
  els.logoutBtn = document.getElementById("ws-auth-logout");
}

function showAuthError(message = "") {
  if (!els.errorEl) return;
  if (!message) {
    els.errorEl.hidden = true;
    els.errorEl.textContent = "";
    return;
  }
  els.errorEl.hidden = false;
  els.errorEl.textContent = message;
}

function mapConfigError(err) {
  const code = String(err?.message || "");
  if (code === "PUBLIC_CONFIG_UNAVAILABLE" || code === "PUBLIC_CONFIG_INCOMPLETE") {
    return "Supabase 환경변수가 설정되지 않았습니다. .env 파일의 TODO 값을 Supabase Dashboard에서 복사한 실제 값으로 바꿔주세요.";
  }
  return "로그인 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function mapSignInError(err) {
  const message = String(err?.message || err || "").toLowerCase();

  if (message.includes("network") || message.includes("fetch")) {
    return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
  }
  if (message.includes("redirect") || message.includes("oauth")) {
    return "OAuth 설정 오류입니다. Redirect URL 설정을 확인해주세요.";
  }
  if (message.includes("popup") || message.includes("closed") || message.includes("cancel")) {
    return "Google 로그인이 취소되었습니다.";
  }

  return "Google 로그인에 실패했습니다. 다시 시도해주세요.";
}

function getUserDisplay(user) {
  const meta = user?.user_metadata || {};
  const fullName = meta.full_name || meta.name || "";
  const email = user?.email || "";
  const avatarUrl = meta.avatar_url || meta.picture || "";

  return {
    label: fullName || email || "사용자",
    email,
    avatarUrl,
  };
}

function renderUser(session) {
  const user = session?.user;
  if (!user || !els.userBar) return;

  const { label, avatarUrl } = getUserDisplay(user);
  if (els.label) els.label.textContent = label;

  if (avatarUrl && els.avatar) {
    els.avatar.src = avatarUrl;
    els.avatar.alt = label;
    els.avatar.hidden = false;
  } else if (els.avatar) {
    els.avatar.hidden = true;
    els.avatar.removeAttribute("src");
  }

  els.userBar.hidden = false;
}

function showAuthenticatedUI() {
  els.gate?.setAttribute("hidden", "");
  els.appRoot?.removeAttribute("hidden");
}

function showSignedOutUI() {
  hideWorkspaceChrome();
  if (els.userBar) els.userBar.hidden = true;
  els.appRoot?.setAttribute("hidden", "");
  els.gate?.removeAttribute("hidden");
}

function hideWorkspaceChrome() {
  const timer = document.getElementById("ws-floating-timer");
  if (timer) {
    timer.hidden = true;
    timer.setAttribute("hidden", "");
    timer.style.display = "none";
    timer.classList.add("is-hidden");
  }

  const settingsPanel = document.getElementById("ws-timer-settings-panel");
  if (settingsPanel) settingsPanel.hidden = true;

  document.querySelectorAll(".ws-modal").forEach((modal) => {
    modal.hidden = true;
  });
  document.body.classList.remove("ws-modal-open");

  const toast = document.getElementById("ws-toast");
  if (toast) {
    toast.hidden = true;
    toast.textContent = "";
  }
}

function consumeOAuthCallbackErrors() {
  const hash = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);
  const error = hashParams.get("error") || queryParams.get("error");
  const description =
    hashParams.get("error_description") || queryParams.get("error_description");

  if (error || description) {
    const decoded = description
      ? decodeURIComponent(String(description).replace(/\+/g, " "))
      : "";
    if (decoded.toLowerCase().includes("access_denied")) {
      showAuthError("Google 로그인이 취소되었습니다.");
    } else if (decoded.toLowerCase().includes("redirect")) {
      showAuthError("Redirect URL 설정이 일치하지 않습니다. 관리자 설정을 확인해주세요.");
    } else {
      showAuthError(decoded || "Google 로그인에 실패했습니다. 다시 시도해주세요.");
    }
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }

  return false;
}

async function applyAuthenticatedSession(session) {
  renderUser(session);
  showAuthError("");
  setGoogleButtonState({ loading: true, disabled: true, label: "워크스페이스 준비 중..." });

  try {
    if (onAuthenticatedCallback) {
      await onAuthenticatedCallback(session);
    }
    showAuthenticatedUI();
  } catch (err) {
    console.error("[auth] workspace init failed:", err);
    showAuthError("워크스페이스를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
    showSignedOutUI();
  } finally {
    setGoogleButtonState({ label: "Google로 계속하기" });
  }
}

async function applySignedOutSession() {
  hideWorkspaceChrome();
  if (onSignedOutCallback) {
    await onSignedOutCallback();
  }
  hideWorkspaceChrome();
  showSignedOutUI();
  showAuthError("");
}

function setGoogleButtonState({ loading = false, disabled = false, label = "Google로 계속하기" } = {}) {
  if (!els.googleBtn) return;
  els.googleBtn.disabled = disabled || loading;
  els.googleBtn.textContent = label;
  els.googleBtn.classList.toggle("is-loading", loading);
}

export async function getAuthSession() {
  try {
    const supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  } catch {
    return null;
  }
}

export async function getAuthUserId() {
  const session = await getAuthSession();
  return session?.user?.id || null;
}

export async function initAuth({ onAuthenticated, onSignedOut } = {}) {
  onAuthenticatedCallback = onAuthenticated;
  onSignedOutCallback = onSignedOut;
  cacheElements();
  setGoogleButtonState({ loading: true, disabled: true, label: "로그인 준비 중..." });

  consumeOAuthCallbackErrors();

  let supabase;
  try {
    supabase = await getSupabaseClient();
  } catch (err) {
    console.error("[auth] Supabase init failed:", err);
    showAuthError(mapConfigError(err));
    setGoogleButtonState({ disabled: true, label: "Google로 계속하기" });
    showSignedOutUI();
    return;
  }

  setGoogleButtonState({ label: "Google로 계속하기" });

  els.googleBtn?.addEventListener("click", async () => {
    showAuthError("");
    setGoogleButtonState({ loading: true, disabled: true, label: "Google로 이동 중..." });

    try {
      const redirectTo = `${window.location.origin}/`;
      console.log("[auth] OAuth redirectTo:", redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) throw error;
      if (!data?.url) {
        throw new Error("OAuth redirect URL was not returned.");
      }
      window.location.assign(data.url);
    } catch (err) {
      console.error("[auth] Google sign-in failed:", err);
      showAuthError(mapSignInError(err));
      setGoogleButtonState({ label: "Google로 계속하기" });
    }
  });

  els.logoutBtn?.addEventListener("click", async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error("[auth] Sign out failed:", err);
      showAuthError("로그아웃에 실패했습니다. 다시 시도해주세요.");
    }
  });

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("[auth] getSession failed:", error);
    showAuthError("로그인 상태를 확인하지 못했습니다. 다시 시도해주세요.");
    showSignedOutUI();
  } else if (session) {
    await applyAuthenticatedSession(session);
  } else {
    showSignedOutUI();
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT") {
      await applySignedOutSession();
      return;
    }

    if (!session?.user) {
      return;
    }

    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      await applyAuthenticatedSession(session);
      return;
    }

    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      renderUser(session);
    }
  });
}
