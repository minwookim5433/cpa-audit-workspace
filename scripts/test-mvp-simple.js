/**
 * MVP 단순화 — 테스트 A~I
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

async function setup(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(1500);
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await page.waitForFunction(
    () => !document.querySelector("#ws-exam-pages p")?.textContent?.includes("렌더링"),
    { timeout: 45000 }
  );
  await sleep(800);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(1200);

    const testA = await page.evaluate(() => ({
      solveActive: document.getElementById("solve-view")?.classList.contains("is-active"),
      hasApp: !!document.getElementById("ws-app"),
      libraryHidden: document.getElementById("pl-view")?.hidden === true,
    }));
    record(results, "A: 문제풀이 화면 진입", testA.solveActive && testA.hasApp && testA.libraryHidden, JSON.stringify(testA));

    await setup(page);

    const testB = await page.evaluate(() => {
      const el = document.getElementById("ws-exam");
      const before = window.__workspaceExamUx?.getScale?.() ?? 1;
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
      const after = window.__workspaceExamUx?.getScale?.() ?? 1;
      return { before, after };
    });
    record(results, "B: 휠 확대 없음", testB.before === testB.after, `${testB.before}→${testB.after}`);

    const beforeZoom = await page.evaluate(() => window.__workspaceExamUx?.getScale?.() ?? 1);
    const btnBoxBefore = await page.$eval("#ws-zoom-in", (el) => el.getBoundingClientRect().x);
    await page.click("#ws-zoom-in");
    await page.waitForFunction(
      (prev) => (window.__workspaceExamUx?.getScale?.() ?? 1) > prev + 0.05,
      { timeout: 5000 },
      beforeZoom
    );
    const afterZoom = await page.evaluate(() => window.__workspaceExamUx?.getScale?.() ?? 1);
    const btnBoxAfter = await page.$eval("#ws-zoom-in", (el) => el.getBoundingClientRect().x);
    record(results, "C: 확대 버튼", afterZoom > beforeZoom && btnBoxBefore === btnBoxAfter, `${beforeZoom}→${afterZoom}`);

    const noPanUi = await page.evaluate(() => ({
      moveBtn: !document.querySelector('[data-tool="cursor"]'),
      viewBtn: !!document.querySelector('[data-tool="view"]'),
      panReady: document.getElementById("ws-exam")?.classList.contains("is-pan-ready"),
      defaultTool: window.__workspaceExamUx?.getDrawTool?.(),
    }));
    record(
      results,
      "D: Pan UI 제거·보기 기본",
      noPanUi.moveBtn && noPanUi.viewBtn && !noPanUi.panReady && noPanUi.defaultTool === "view",
      JSON.stringify(noPanUi)
    );

    await page.click('[data-tool="highlighter"]');
    await sleep(200);
    await page.click('[data-tool="underline"]');
    await sleep(200);
    await page.click('[data-tool="pen"]');
    await sleep(200);
    const toolSwitch = await page.evaluate(() => window.__workspaceExamUx?.getDrawTool?.());
    record(results, "E: 밑줄·형광펜·펜 전환", toolSwitch === "pen", toolSwitch);

    const drawLayer = await page.evaluate(() => {
      const layer = document.querySelector(".draw-interact-layer");
      return {
        ok: layer?.classList.contains("is-annotation-mode"),
        cursor: layer?.style.cursor?.startsWith("url("),
      };
    });
    record(results, "F: 주석 모드·custom cursor", drawLayer.ok && drawLayer.cursor, JSON.stringify(drawLayer));

    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.textContent = "MVP 자동저장 테스트";
      ed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(1200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(3000);
    const testG = await page.evaluate(() => document.querySelector(".answer-doc-editor")?.textContent || "");
    record(results, "G: 자동저장 복원", testG.includes("MVP"), testG.slice(0, 20));

    await page.evaluate(() => document.getElementById("ws-exam-end-btn")?.click());
    await page.waitForSelector("#ws-exam-end-modal:not([hidden])");
    await page.evaluate(() => document.getElementById("ws-exam-end-confirm")?.click());
    await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 30000 });
    await sleep(1000);
    const testH = await page.evaluate(() => {
      const attempt = window.__workspaceExamEnd?.getLastAttempt?.();
      return { pdfSaved: attempt?.pdfSaved, pages: attempt?.answerPageCount };
    });
    record(results, "H: 시험 종료 PDF", testH.pdfSaved && testH.pages >= 1, JSON.stringify(testH));

    const testI = await page.evaluate(() => ({
      libraryHidden: document.getElementById("pl-view")?.hidden === true,
      reviewHidden: document.getElementById("review-view")?.hidden === true,
      navHidden: document.querySelector(".app-main-nav")?.hidden === true,
      attemptsPanel: document.getElementById("ws-panel-attempts")?.hidden === true,
    }));
    record(
      results,
      "I: Library·AI UI 숨김",
      testI.libraryHidden && testI.navHidden && testI.attemptsPanel,
      JSON.stringify(testI)
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
