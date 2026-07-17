/**
 * Problem Library — 통합 테스트
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function record(results, name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function reset(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });
  await page.reload({ waitUntil: "networkidle0" });
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await reset(page);
    await page.waitForFunction(() => typeof window.__problemLibraryRefresh === "function", { timeout: 15000 });
    await sleep(500);

    const navCheck = await page.evaluate(() => ({
      mainView: document.body.dataset.mainView,
      plView: document.getElementById("pl-view")?.classList.contains("is-active"),
      grid: !!document.getElementById("pl-grid"),
    }));
    record(results, "메인: Library 기본 화면", navCheck.mainView === "library" && navCheck.plView && navCheck.grid, JSON.stringify(navCheck));

    await page.evaluate(() => document.getElementById("pl-add-btn")?.click());
    await page.waitForSelector("#pl-add-modal:not([hidden])");
    const pdfInput = await page.$("#pl-pdf-input");
    await pdfInput.uploadFile(PDF_PATH);
    await page.type("#pl-meta-title", "2025 회계감사 기출");
    await page.select("#pl-meta-source", "past_exam");
    await page.type("#pl-meta-year", "2025");
    await page.type("#pl-meta-number", "2");
    await page.type("#pl-meta-tags", "독립성, 직무제한");
    await page.click("[data-add-submit]");
    await sleep(1500);

    const afterRegister = await page.evaluate(async () => {
      const { listAllProblems } = await import("./workspace-problem-service.js");
      const problems = await listAllProblems();
      return {
        count: problems.length,
        title: problems[0]?.title,
        tags: problems[0]?.tags?.length || 0,
        detailOpen: !document.getElementById("pl-detail").hidden,
      };
    });
    record(
      results,
      "PDF 등록 + 카드 생성",
      afterRegister.count >= 1 && afterRegister.title.includes("2025"),
      JSON.stringify(afterRegister)
    );

    await page.type("#pl-search", "독립성");
    await sleep(400);
    const searchResult = await page.evaluate(() => document.querySelectorAll(".pl-card").length);
    record(results, "검색", searchResult >= 1, `cards=${searchResult}`);

    await page.select("#pl-filter", "past_exam");
    await sleep(300);
    const filterResult = await page.evaluate(() => document.querySelectorAll(".pl-card").length);
    record(results, "필터", filterResult >= 1, `cards=${filterResult}`);

    await page.evaluate(() => document.querySelector(".pl-card")?.click());
    await sleep(800);
    const detailOpen = await page.evaluate(() => !document.getElementById("pl-detail").hidden);
    record(results, "상세화면 이동", detailOpen, "");

    await page.type("#pl-detail-notes", "독립성에서 자주 틀리는 문제");
    await sleep(800);
    const memoSaved = await page.evaluate(async () => {
      const { listAllProblems } = await import("./workspace-problem-service.js");
      const p = (await listAllProblems())[0];
      return p?.notes?.includes("자주 틀리는") || false;
    });
    record(results, "메모 저장", memoSaved, "");

    await page.evaluate(() => document.querySelector("[data-solve-problem]")?.click());
    await sleep(2000);
    const solveCheck = await page.evaluate(() => ({
      solveView: document.getElementById("solve-view")?.classList.contains("is-active"),
      editor: !!document.querySelector(".answer-doc-editor"),
    }));
    record(results, "문제 풀기 버튼", solveCheck.solveView && solveCheck.editor, JSON.stringify(solveCheck));

    const recentCheck = await page.evaluate(() => {
      const pane = document.getElementById("pl-detail-pane");
      return pane?.classList.contains("has-selection") || !document.getElementById("pl-detail").hidden;
    });
    record(results, "상세 패널", recentCheck, "");

    const tagSuggest = await page.evaluate(async () => {
      const { suggestSearchTags } = await import("./workspace-problem-tags.js");
      const tags = suggestSearchTags("독립성 위반 직무제한", []);
      return tags.includes("독립성");
    });
    record(results, "태그 추천", tagSuggest, "");

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
