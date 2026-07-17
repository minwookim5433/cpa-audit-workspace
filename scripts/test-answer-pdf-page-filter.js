/**
 * PDF 빈 페이지 선별 — 테스트 A~E
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const LINE1 = "① 첫 페이지 답안입니다.";
const LINE3 = "③ 세 번째 페이지 답안입니다.";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setup(page) {
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.removeItem("cpa-workspace-session");
    const req = indexedDB.deleteDatabase("cpa-workspace-db");
    await new Promise((r) => {
      req.onsuccess = r;
      req.onerror = r;
      req.onblocked = r;
    });
  });
  await page.reload({ waitUntil: "networkidle0" });
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(800);
}

function record(results, name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function setPageText(page, pageIndex, text) {
  await page.evaluate(
    (pageIndex, text) => {
      const go = document.getElementById("ws-ans-page-input");
      if (go) {
        go.value = String(pageIndex + 1);
        go.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    pageIndex,
    text
  );
  await sleep(500);
  await page.evaluate((text) => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = text;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await sleep(400);
  await page.evaluate(() => window.__workspaceAnswerExportState?.());
  await sleep(200);
}

async function auditPdfPages(page) {
  return page.evaluate(async () => {
    const { buildExportPageAudit } = await import("./workspace-answer-export-pages.js");
    const state = window.__workspaceAnswerExportState();
    return buildExportPageAudit(state.clones || []);
  });
}

async function clearAllAnswerPages(page) {
  for (let i = 0; i < 10; i++) {
    await setPageText(page, i, "");
  }
}

async function freshSetup(page) {
  await page.evaluate(async () => {
    localStorage.removeItem("cpa-workspace-session");
    const req = indexedDB.deleteDatabase("cpa-workspace-db");
    await new Promise((r) => {
      req.onsuccess = r;
      req.onerror = r;
      req.onblocked = r;
    });
  });
  await page.reload({ waitUntil: "networkidle0" });
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(800);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await setup(page);

    await setPageText(page, 0, LINE1);
    let audit = await auditPdfPages(page);
    record(
      results,
      "A: 1페이지만 작성 → PDF 1페이지",
      audit.pdfPageCount === 1 && audit.lastUsedPageIndex === 0,
      `pdfPages=${audit.pdfPageCount} lastUsed=${audit.lastUsedPageIndex + 1}`
    );
    record(
      results,
      "A: 2페이지 미포함",
      audit.rows[1]?.includedInPdf === false,
      `page2included=${audit.rows[1]?.includedInPdf}`
    );

    await setPageText(page, 2, LINE3);
    audit = await auditPdfPages(page);
    record(
      results,
      "B: 1·2·3페이지 구성 → PDF 3페이지",
      audit.pdfPageCount === 3 && audit.lastUsedPageIndex === 2,
      `pdfPages=${audit.pdfPageCount}`
    );
    record(
      results,
      "B: 2페이지 빈 답안지 유지",
      audit.rows[1]?.includedInPdf === true && audit.rows[1]?.hasMeaningfulContent === false,
      `page2meaningful=${audit.rows[1]?.hasMeaningfulContent}`
    );

    await freshSetup(page);

    await setPageText(page, 0, "① 1페이지");
    await setPageText(page, 1, "② 2페이지");
    audit = await auditPdfPages(page);
    record(
      results,
      "C: 1~2페이지 작성 → PDF 2페이지",
      audit.pdfPageCount === 2 && audit.lastUsedPageIndex === 1,
      `pdfPages=${audit.pdfPageCount}`
    );
    record(
      results,
      "C: 추가 빈 페이지 없음",
      audit.rows.filter((r) => r.includedInPdf).length === 2,
      `included=${audit.rows.filter((r) => r.includedInPdf).length}`
    );

    await freshSetup(page);

    let dialogMessage = "";
    page.on("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });

    audit = await auditPdfPages(page);
    record(
      results,
      "D: 답안 없음 → lastUsed -1",
      audit.lastUsedPageIndex === -1 && audit.pdfPageCount === 0,
      `lastUsed=${audit.lastUsedPageIndex}`
    );

    await page.click("#ws-answer-preview-btn");
    await sleep(400);
    await page.click("#ws-export-pdf");
    await sleep(800);
    record(
      results,
      "D: 저장할 답안 없음 안내",
      dialogMessage.includes("저장할 답안이 없습니다"),
      dialogMessage || "no dialog"
    );

    await page.click("[data-modal-close]");
    await sleep(200);

    await freshSetup(page);

    const spanned = `<span class="answer-format-span" data-font-size="9"></span>${LINE1}`;
    await page.evaluate((html) => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.innerHTML = html;
      ed.dispatchEvent(new Event("input", { bubbles: true }));
    }, spanned);
    await sleep(400);
    await page.evaluate(() => window.__workspaceAnswerExportState?.());
    audit = await auditPdfPages(page);
    record(
      results,
      "E: format-span+텍스트 → PDF 1페이지, 유령 2페이지 없음",
      audit.pdfPageCount === 1 &&
        audit.rows[0]?.hasMeaningfulContent === true &&
        audit.rows[1]?.includedInPdf === false,
      `pdfPages=${audit.pdfPageCount} page2=${audit.rows[1]?.includedInPdf}`
    );

    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n=== Summary: ${results.length - failed}/${results.length} passed ===`);
    if (failed) process.exitCode = 1;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
