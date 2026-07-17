/**
 * 답안 PDF 파일명 연도 버그 수정 검증
 */
const puppeteer = require("puppeteer");

const PDF_2025 = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const PDF_2026 = process.argv[3] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2026-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

function record(results, name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runUnitTests(results) {
  const { resolveExamYear, buildAnswerPdfFilename } = await import("../workspace-answer-export.js");

  record(
    results,
    "Unit: year 메타데이터 우선",
    buildAnswerPdfFilename({ year: 2025, docTitle: "기출" }) === "2025 회계감사 답안지.pdf"
  );
  record(
    results,
    "Unit: 제목에서 연도 추출",
    buildAnswerPdfFilename({ docTitle: "2025 기출", pdfName: "exam.pdf" }) === "2025 회계감사 답안지.pdf"
  );
  record(
    results,
    "Unit: 파일명에서 연도 추출",
    buildAnswerPdfFilename({ docTitle: "기출", fileName: "1-3 회계감사 문제(2026-2).pdf" }) === "2026 회계감사 답안지.pdf"
  );
  record(
    results,
    "Unit: 시스템 날짜 미사용",
    resolveExamYear({ docTitle: "기출" }) === null
  );
  record(
    results,
    "Unit: documentTitle 필드",
    buildAnswerPdfFilename({ documentTitle: "2026 모의고사" }) === "2026 회계감사 답안지.pdf"
  );
}

async function runBrowserExamEnd(page, pdfPath, expectedYear, label, results) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__workspaceExamUx !== "undefined", { timeout: 15000 });

  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(pdfPath);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(1200);

  await page.evaluate((label) => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = `① ${label} 답안 테스트`;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }, label);
  await sleep(800);

  await page.click("#ws-exam-end-btn");
  await page.waitForSelector("#ws-exam-end-modal:not([hidden])");
  await page.click("#ws-exam-end-confirm");
  await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 30000 });
  await sleep(2500);

  const attempt = await page.evaluate(() => window.__workspaceExamEnd?.getLastAttempt?.());
  const expected = `${expectedYear} 회계감사 답안지.pdf`;
  record(
    results,
    `Browser ${label}: 시험 종료 PDF 파일명`,
    attempt?.pdfFilename === expected,
    `got=${attempt?.pdfFilename || "(none)"} want=${expected}`
  );

  const reexport = await page.evaluate(async () => {
    const { buildAnswerPdfFilename } = await import("./workspace-answer-export.js");
    const attempt = window.__workspaceExamEnd?.getLastAttempt?.();
    return buildAnswerPdfFilename({
      year: attempt?.year,
      documentTitle: attempt?.documentTitle,
      docTitle: attempt?.docTitle,
    });
  });
  record(
    results,
    `Browser ${label}: 결과 모달 재저장 파일명`,
    reexport === expected,
    reexport
  );
}

async function main() {
  const results = [];
  await runUnitTests(results);

  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await runBrowserExamEnd(page, PDF_2025, "2025", "2025", results);
    await runBrowserExamEnd(page, PDF_2026, "2026", "2026", results);
  } catch (err) {
    console.error(err);
    record(results, "Browser 테스트 실행", false, err.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== Summary: ${results.length - failed}/${results.length} passed ===`);
  if (failed) process.exitCode = 1;
}

main();
