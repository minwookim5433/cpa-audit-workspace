/**
 * Smoke test — cloud save/resume UI wiring (requires login + Supabase env)
 * Run: node scripts/test-cloud-workspace.js
 */
import puppeteer from "puppeteer";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const TIMEOUT = 60000;

async function main() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  const results = [];

  try {
    await page.goto(BASE, { waitUntil: "networkidle2" });

    const hasAuthGate = await page.$("#auth-gate:not([hidden])");
    results.push({
      id: "auth-gate",
      ok: Boolean(hasAuthGate),
      detail: hasAuthGate ? "login gate visible" : "auth gate missing",
    });

    const modulesLoaded = await page.evaluate(async () => {
      try {
        const mod = await import("/workspace-cloud-service.js");
        return typeof mod.packWorkspaceRow === "function" && typeof mod.upsertCloudWorkspace === "function";
      } catch (err) {
        return String(err.message || err);
      }
    });
    results.push({
      id: "cloud-module",
      ok: modulesLoaded === true,
      detail: String(modulesLoaded),
    });

    const modalExists = await page.evaluate(() => ({
      resume: Boolean(document.getElementById("ws-cloud-resume-modal")),
      import: Boolean(document.getElementById("ws-cloud-import-modal")),
    }));
    results.push({
      id: "cloud-modals",
      ok: modalExists.resume && modalExists.import,
      detail: JSON.stringify(modalExists),
    });

    const saveBtn = await page.$("#ws-save-pause-btn");
    results.push({
      id: "save-button",
      ok: Boolean(saveBtn),
      detail: saveBtn ? "present" : "missing",
    });
  } catch (err) {
    results.push({ id: "runtime", ok: false, detail: err.message });
  } finally {
    await browser.close();
  }

  console.log("\nCloud workspace smoke test\n");
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "OK" : "FAIL";
    if (!r.ok) failed += 1;
    console.log(`[${mark}] ${r.id}: ${r.detail}`);
  }

  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
