/**

 * 시험 종료 MVP 흐름 — 피드백 없음

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

  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });

  await page.evaluate(async () => {

    localStorage.removeItem("cpa-workspace-session");

    localStorage.removeItem("cpa-workspace-exam-attempts");

    const req = indexedDB.deleteDatabase("cpa-workspace-db");

    await new Promise((r) => {

      req.onsuccess = r;

      req.onerror = r;

      req.onblocked = r;

    });

  });

  await page.reload({ waitUntil: "networkidle0" });

  await page.waitForFunction(() => typeof window.__workspaceExamUx !== "undefined", { timeout: 15000 });

  const input = await page.$("#ws-pdf-input");

  await input.uploadFile(PDF_PATH);

  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });

  await sleep(800);

}



async function setPageText(page, text) {

  await page.evaluate((text) => {

    const ed = document.querySelector(".answer-doc-editor");

    ed.textContent = text;

    ed.dispatchEvent(new Event("input", { bubbles: true }));

  }, text);

  await sleep(300);

}



async function main() {

  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });

  const page = await browser.newPage();

  await page.setViewport({ width: 1400, height: 900 });

  const results = [];



  let feedbackApiCalled = false;

  await page.setRequestInterception(true);

  page.on("request", (req) => {

    if (req.url().includes("/api/answer-feedback")) {

      feedbackApiCalled = true;

      req.abort();

      return;

    }

    req.continue();

  });



  try {

    await setup(page);



    const uiCheck = await page.evaluate(() => ({

      hasFeedbackBtn: !!document.getElementById("ws-exam-end-save-feedback"),

      hasFeedbackTab: !!document.querySelector('[data-result-tab="feedback"]'),

      hasConfirmBtn: !!document.getElementById("ws-exam-end-confirm"),

      hasFinishBtn: !!document.getElementById("ws-exam-result-finish"),

      coachText: document.getElementById("ws-coach-result")?.textContent || "",

    }));

    record(results, "1: 피드백 버튼·탭 제거", !uiCheck.hasFeedbackBtn && !uiCheck.hasFeedbackTab, "");

    record(results, "1: 시험 종료·종료 버튼 존재", uiCheck.hasConfirmBtn && uiCheck.hasFinishBtn, "");

    record(

      results,

      "1: 피드백 안내 문구 제거",

      !uiCheck.coachText.includes("피드백"),

      uiCheck.coachText

    );



    await setPageText(page, "① 시험 종료 테스트 답안입니다.");

    const start = Date.now();

    await page.evaluate(() => document.getElementById("ws-exam-end-btn")?.click());

    await page.waitForSelector("#ws-exam-end-modal:not([hidden])");

    await page.evaluate(() => document.getElementById("ws-exam-end-confirm")?.click());

    await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 30000 });

    await sleep(1500);

    const elapsed = Date.now() - start;



    record(results, "2: AI API 없이 즉시 종료", !feedbackApiCalled && elapsed < 20000, `${elapsed}ms`);



    const afterEnd = await page.evaluate(() => {

      const attempt = window.__workspaceExamEnd?.getLastAttempt?.();

      const summary = document.getElementById("ws-exam-result-summary")?.textContent || "";

      const body = document.body.textContent || "";

      return {

        pdfSaved: attempt?.pdfSaved,

        answerPageCount: attempt?.answerPageCount ?? attempt?.writtenPageCount ?? 0,

        summaryHasStats:

          summary.includes("사용 시간") &&

          summary.includes("작성 페이지") &&

          summary.includes("작성 행") &&

          summary.includes("총 글자"),

        noFeedbackUi:

          !body.includes("작성 피드백") &&

          !body.includes("다시 요청") &&

          !body.includes("피드백 생성"),

        hasPreviewTab: !!document.querySelector('[data-result-tab="preview"]'),

        hasPdfTab: !!document.querySelector('[data-result-tab="pdf"]'),

        hasRetryTab: !!document.querySelector('[data-result-tab="retry"]'),

      };

    });



    record(results, "3: 답안 저장·PDF 저장", afterEnd.pdfSaved && afterEnd.answerPageCount >= 1, "");

    record(results, "3: 풀이 통계 표시", afterEnd.summaryHasStats, "");

    record(

      results,

      "4: 피드백 UI·문구 없음",

      afterEnd.noFeedbackUi && afterEnd.hasPreviewTab && afterEnd.hasPdfTab && afterEnd.hasRetryTab,

      ""

    );



    const stored = await page.evaluate(async () => {

      const session = localStorage.getItem("cpa-workspace-session");

      const { listAllAttempts } = await import("./workspace-attempt-service.js");

      const attempts = await listAllAttempts();

      const editorText = document.querySelector(".answer-doc-editor")?.textContent || "";

      return {

        hasSession: Boolean(session && session.length > 50),

        attemptCount: attempts.length,

        editorHasAnswer: editorText.includes("시험 종료 테스트"),

      };

    });

    record(

      results,

      "5: 기존 답안·풀이 기록 유지",

      stored.hasSession && stored.attemptCount >= 1 && stored.editorHasAnswer,

      `attempts=${stored.attemptCount}`

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

