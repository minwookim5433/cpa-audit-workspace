/**
 * 레이아웃 개편 검증
 */
const puppeteer = require("puppeteer");
const path = require("path");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 15000 });
    await page.evaluate(async () => {
      localStorage.removeItem("cpa-workspace-session");
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      await new Promise((r) => { req.onsuccess = r; req.onerror = r; req.onblocked = r; });
    });
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);

    const sheetGone = await page.$("#ws-sheet") === null;
    record("오른쪽 답안지 패널 제거", sheetGone);

    const examWidth = await page.$eval(".ws-exam", (el) => el.getBoundingClientRect().width);
    const centerWidth = await page.$eval(".ws-center", (el) => el.getBoundingClientRect().width);
    record("시험지 영역 전체 너비 사용", examWidth > centerWidth * 0.85, `exam=${Math.round(examWidth)} center=${Math.round(centerWidth)}`);

    const pdfInput = await page.$("#ws-pdf-input");
    await pdfInput.uploadFile(PDF_PATH);
    await page.waitForFunction(
      () => document.querySelector(".pdf-canvas")?.width > 0,
      { timeout: 45000 }
    );
    await sleep(2000);

    await page.click("#ws-next-page");
    await sleep(2000);

    const spreadInfo = await page.evaluate(() => {
      const wraps = document.querySelectorAll(".exam-page-wrap");
      const exam = document.querySelector(".ws-exam");
      const canvas = document.querySelector(".pdf-canvas");
      return {
        spreadCount: wraps.length,
        examW: exam?.clientWidth,
        canvasW: canvas?.width,
        canvasStyleW: canvas?.style.width,
      };
    });
    record(
      "양면 페이지 크기",
      spreadInfo.spreadCount === 2 && spreadInfo.canvasW > 300,
      `spreads=${spreadInfo.spreadCount}, canvas=${spreadInfo.canvasW}`
    );

    const hasResizer = await page.$("#ws-resizer") !== null;
    record("리사이저 존재", hasResizer);

    const beforeH = await page.$eval("#ws-input-area", (el) => el.getBoundingClientRect().height);
    const resizerBox = await page.$eval("#ws-resizer", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(resizerBox.x, resizerBox.y);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x, resizerBox.y + 80, { steps: 8 });
    await page.mouse.up();
    await sleep(400);
    const afterH = await page.$eval("#ws-input-area", (el) => el.getBoundingClientRect().height);
    record("입력창 높이 조절", Math.abs(afterH - beforeH) > 15, `before=${Math.round(beforeH)} after=${Math.round(afterH)}`);

    await page.evaluate(() => {
      const set = (id, val) => {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("ws-ans-problem", "1");
      set("ws-ans-question", "1");
      const ta = document.getElementById("ws-answer-input");
      ta.value = "문제1 물음1 답안입니다.";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(500);

    await page.evaluate(() => {
      const set = (id, val) => {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("ws-ans-problem", "2");
      set("ws-ans-question", "1");
      const ta = document.getElementById("ws-answer-input");
      ta.value = "문제2 물음1 답안입니다.";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(500);

    await page.evaluate(() => {
      const set = (id, val) => {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("ws-ans-problem", "1");
      set("ws-ans-question", "1");
    });
    await sleep(500);

    const ans1 = await page.$eval("#ws-answer-input", (el) => el.value);
    record("문제/물음별 답안 저장", ans1.includes("문제1 물음1"), ans1.slice(0, 40));

    await page.click("#ws-preview-btn");
    await sleep(800);
    const modalOpen = await page.evaluate(() => !document.getElementById("ws-preview-modal").hidden);
    const modalSheet = await page.$("#ws-modal-sheet-container .answer-sheet-page") !== null;
    record("답안지 미리보기 모달", modalOpen && modalSheet);

    await page.click("[data-modal-close]");
    await sleep(400);

    await page.click("#ws-preview-btn");
    await sleep(600);
    const exportHtmlExists = await page.$("#ws-export-html") !== null;
    const exportPdfExists = await page.$("#ws-export-pdf") !== null;
    const exportPrintExists = await page.$("#ws-export-print") !== null;
    record("보내기 버튼 존재", exportHtmlExists && exportPdfExists && exportPrintExists);
    await page.click("[data-modal-close]");
    await sleep(300);

    await page.reload({ waitUntil: "networkidle0" });
    await sleep(2500);
    const restored = await page.$eval("#ws-answer-input", (el) => el.value);
    const listCount = await page.$$eval(".ws-answer-link", (els) => els.length);
    record("새로고침 후 답안 유지", restored.includes("문제1") && listCount >= 2, `answers=${listCount}`);
  } catch (err) {
    record("테스트 실행", false, err.message);
    console.error(err);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== 요약 ${results.length - failed.length}/${results.length} ===`);
  if (failed.length) process.exit(1);
}

main();
