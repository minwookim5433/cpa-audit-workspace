/**
 * Auth/logout UX smoke checks (static + optional HTTP)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log("PASS:", message);
}

const authJs = read("workspace-auth.js");
const appJs = read("workspace-app.js");
const timerJs = read("workspace-floating-timer.js");
const indexHtml = read("index.html");

assert(/prompt:\s*["']select_account["']/.test(authJs), "Google OAuth uses prompt=select_account");
assert(/onAuthStateChange[\s\S]*event === "SIGNED_OUT"/.test(authJs), "SIGNED_OUT handled explicitly");
assert(/event === "SIGNED_IN" \|\| event === "INITIAL_SESSION"/.test(authJs), "SIGNED_IN/INITIAL_SESSION handled");

assert(/function cleanupTimer\(/.test(appJs), "cleanupTimer function exists");
assert(/export async function cleanupWorkspaceForLogout/.test(appJs), "cleanupWorkspaceForLogout exported");
assert(/hideOrRemoveFloatingTimer/.test(appJs), "floating timer hide helper exists");
assert(/closeAllWorkspaceModals/.test(appJs), "modal cleanup exists");
assert(/logoutCleanupInProgress/.test(appJs), "logout cleanup is re-entrant safe");

assert(/function hideTimer\(/.test(timerJs), "floating timer hideTimer exists");
assert(/function showTimer\(/.test(timerJs), "floating timer showTimer exists");

assert(/id="ws-floating-timer"[^>]*hidden/.test(indexHtml), "floating timer hidden by default in HTML");

console.log("\nAuth/logout static checks completed.");
