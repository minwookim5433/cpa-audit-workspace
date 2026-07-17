/**
 * 답안지 UX v4 — 줄번호 제거, 밀도, 동그라미 자동변환 검증 (10항목)
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const results = [];

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clearEditor(page) {
  await page.click(".answer-doc-editor");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await sleep(300);
}

async function setupPage(browserPage) {
  await browserPage.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await browserPage.evaluate(async () => {
    localStorage.removeItem("cpa-workspace-session");
    const req = indexedDB.deleteDatabase("cpa-workspace-db");
    await new Promise((r) => {
      req.onsuccess = r;
      req.onerror = r;
      req.onblocked = r;
    });
  });
  await browserPage.reload({ waitUntil: "networkidle0" });
  await sleep(400);
  const input = await browserPage.$("#ws-pdf-input");
  if (!input) throw new Error("PDF input not found");
  await input.uploadFile(PDF_PATH);
  await browserPage.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(1200);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await setupPage(page);

    // 1. 작성 화면 줄 번호 없음
    const editorLineNums = await page.evaluate(() => {
      const nums = document.querySelectorAll(".answer-doc-bg-line span, .answer-line-num");
      return nums.length;
    });
    record("1", "작성 화면 줄 번호 없음", editorLineNums === 0, `found=${editorLineNums}`);

    // 3. 본문 가로 폭 (editor clientWidth >= 500)
    const editorWidth = await page.$eval(".answer-doc-editor", (el) => el.clientWidth);
    record("3", "답안 본문 가로 폭 확대", editorWidth >= 500, `width=${editorWidth}px`);

    // 4. 글자 크기 즉시 반영
    await page.evaluate(() => {
      const el = document.getElementById("ws-font-size");
      el.value = "18";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(400);
    const fontSize = await page.$eval(".answer-doc-editor", (el) => getComputedStyle(el).fontSize);
    record("4", "글자 크기 즉시 반영", fontSize === "18px", `font-size=${fontSize}`);

    // 5. 자간 즉시 반영
    await page.evaluate(() => {
      const el = document.getElementById("ws-letter-spacing");
      el.value = "-10";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(400);
    const letterSpacing = await page.$eval(".answer-doc-editor", (el) => getComputedStyle(el).letterSpacing);
    record("5", "자간 즉시 반영", letterSpacing === "-1px", `letter-spacing=${letterSpacing}`);

    // 6. 1) + Space → ①
    await clearEditor(page);
    await page.keyboard.type("1)", { delay: 20 });
    await page.keyboard.press("Space");
    await sleep(400);
    const t6 = await page.$eval(".answer-doc-editor", (el) => el.innerText);
    record("6", '1) + Space → ①', t6.startsWith("① "), `text="${t6}"`);

    // 7. 10) + Space → ⑩
    await clearEditor(page);
    await page.keyboard.type("10)", { delay: 20 });
    await page.keyboard.press("Space");
    await sleep(400);
    const t7 = await page.$eval(".answer-doc-editor", (el) => el.innerText);
    record("7", '10) + Space → ⑩', t7.startsWith("⑩ "), `text="${t7}"`);

    // 8. 문장 중간 숫자 오변환 없음
    await clearEditor(page);
    await page.keyboard.type("감사인은 1) 항목을 검토한다", { delay: 15 });
    await sleep(400);
    const t8 = await page.$eval(".answer-doc-editor", (el) => el.innerText);
    record("8", "문장 중간 숫자 오변환 없음", t8.includes("1)") && !t8.includes("①"), `text="${t8}"`);

    // 9. Undo 복구
    await clearEditor(page);
    await page.keyboard.type("1)", { delay: 20 });
    await page.keyboard.press("Space");
    await sleep(300);
    await page.click("#ws-undo");
    await sleep(400);
    const t9 = await page.$eval(".answer-doc-editor", (el) => el.innerText);
    record("9", "Undo 시 원래 입력 복구", t9 === "1)", `text="${t9}"`);

    // 10. 촘촘하게 모드 PDF/HTML 반영
    await page.select("#ws-density-preset", "compact");
    await page.evaluate(() => {
      document.getElementById("ws-density-preset").dispatchEvent(new Event("change", { bubbles: true }));
    });
    await sleep(500);
    const exportCheck = await page.evaluate(async () => {
      const state = window.__workspaceAnswerExportState();
      const mod = await import("/workspace-answer-export.js");
      const html = mod.buildExportHtmlFromSheet({
        answerSheet: state.answerSheet,
        docTitle: state.docTitle,
        settings: state.sheetSettings,
        template: state.sheetTemplate,
      });
      return {
        compactInHtml: html.includes("font-size: 13px") && html.includes("letter-spacing: -0.5px"),
        noLineNumInHtml: !html.includes("export-answer-row-num") && !html.includes("answer-line-num"),
        settings: state.sheetSettings,
      };
    });
    record("2", "PDF/HTML 줄 번호 없음", exportCheck.noLineNumInHtml, exportCheck.noLineNumInHtml ? "ok" : "line num found");
    record("10", "촘촘하게 모드 PDF/HTML 반영", exportCheck.compactInHtml, exportCheck.compactInHtml ? "13px/-0.5px" : JSON.stringify(exportCheck.settings));

    // Persist test: refresh restores compact
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 20000 });
    await sleep(800);
    const presetAfter = await page.$eval("#ws-density-preset", (el) => el.value);
    record("P1", "새로고침 후 밀도 설정 복원", presetAfter === "compact", `preset=${presetAfter}`);

    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
    if (failed) process.exitCode = 1;
  } catch (err) {
    console.error("Test run error:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
