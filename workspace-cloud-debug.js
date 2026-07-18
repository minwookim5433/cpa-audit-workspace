/**
 * 임시 Supabase 저장 디버그 패널 (개발용)
 */
const PANEL_ID = "ws-cloud-save-debug";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SENSITIVE_FIELD = /token|secret|password|authorization|apikey|refresh|publishable|email|answer_data|answerSheet/i;

function redactDebugValue(key, value) {
  if (key && SENSITIVE_FIELD.test(key)) return "[redacted]";
  return value;
}

function formatDebugField(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (key, val) => redactDebugValue(key, val), 2);
  } catch {
    return String(value);
  }
}

function formatJson(value) {
  try {
    return JSON.stringify(value, (key, val) => redactDebugValue(key, val), 2);
  } catch {
    return String(value);
  }
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "ws-cloud-save-debug";
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <header class="ws-cloud-save-debug-head">
      <strong>Supabase 저장 디버그</strong>
      <button type="button" class="ws-btn ws-cloud-save-debug-close" data-debug-close aria-label="닫기">✕</button>
    </header>
    <pre class="ws-cloud-save-debug-body" id="ws-cloud-save-debug-body"></pre>
  `;
  document.body.appendChild(panel);

  panel.querySelector("[data-debug-close]")?.addEventListener("click", () => {
    panel.hidden = true;
  });

  return panel;
}

export function showCloudSaveDebugPanel(report) {
  const panel = ensurePanel();
  const body = document.getElementById("ws-cloud-save-debug-body");
  if (!body) return;

  const lines = [
    `success: ${Boolean(report?.success)}`,
    `user.id exists: ${Boolean(report?.userIdPresent)}`,
    report?.userIdPreview ? `user.id preview: ${report.userIdPreview}` : "user.id preview: —",
    `session active: ${Boolean(report?.sessionPresent)}`,
    `document_key: ${report?.documentKey ?? "—"}`,
    `table: ${report?.tableName ?? "workspaces"}`,
    `onConflict: ${report?.onConflict ?? "—"}`,
    `method: ${report?.method ?? "—"}`,
    `payload fields: ${(report?.payloadFields || []).join(", ") || "—"}`,
    "",
    "— error —",
    `code: ${report?.error?.code ?? "—"}`,
    `message: ${report?.error?.message ?? "—"}`,
    `details: ${formatDebugField(report?.error?.details)}`,
    `hint: ${formatDebugField(report?.error?.hint)}`,
    `status: ${report?.status ?? "—"}`,
    "",
    "— data —",
    formatJson(report?.data ?? null),
  ];

  body.textContent = lines.join("\n");
  panel.hidden = false;
  panel.classList.toggle("is-success", Boolean(report?.success));
  panel.classList.toggle("is-error", !report?.success);
}
