/**
 * 시험 종료 후 전체 답안 피드백 — 테스트 A~E
 */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const MOCK_FEEDBACK = {
  items: [
    {
      location: { page: 1, question: "물음1", item: "①" },
      type: "replace",
      original: "업무에서 제외한다.",
      suggestion: "해당 공인회계사를 감사업무에서 제외한다.",
      reason: "적용 대상과 범위가 명확해집니다.",
    },
  ],
  repeatedHabits: [{ label: "목적어 생략", count: 1, advice: "행위의 대상을 함께 작성하세요." }],
};

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
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(800);
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
  await sleep(400);
  await page.evaluate((text) => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = text;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await sleep(300);
}

async function installFeedbackMock(page, mode = "success") {
  await page.setRequestInterception(true);
  page.removeAllListeners("request");
  page.on("request", (req) => {
    if (req.url().includes("/api/answer-feedback")) {
      if (mode === "fail") {
        req.respond({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "피드백 서비스를 일시적으로 사용할 수 없습니다." }),
        });
        return;
      }
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ feedback: MOCK_FEEDBACK }),
      });
      return;
    }
    req.continue();
  });
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  const outDir = path.join(__dirname, "..", "sample-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    await setup(page);

    await page.click("#ws-float-timer-start");
    await sleep(300);
    await setPageText(page, 0, "① 시험 중 답안 작성 테스트입니다.");
    await sleep(300);

    const duringExam = await page.evaluate(() => ({
      hasSelectionMenu: !!document.getElementById("ws-answer-selection-menu"),
      hasCoachMenu: !!document.getElementById("ws-coach-menu"),
      coachNavHidden: document.querySelector('[data-panel="coach"]')?.hidden === true,
      statusText: document.getElementById("ws-status")?.textContent || "",
    }));

    record(
      results,
      "A: 작성 중 플로팅 메뉴·코치 UI 없음",
      !duringExam.hasSelectionMenu && !duringExam.hasCoachMenu && duringExam.coachNavHidden,
      `menu=${duringExam.hasSelectionMenu} coachMenu=${duringExam.hasCoachMenu}`
    );
    record(
      results,
      "A: 작성 중 AI 분석 상태 없음",
      !duringExam.statusText.includes("분석") && !duringExam.statusText.includes("피드백"),
      duringExam.statusText || "(empty)"
    );

    await installFeedbackMock(page, "success");
    await setPageText(page, 1, "② 두 번째 페이지 답안입니다.");
    await sleep(300);

    await page.click("#ws-exam-end-btn");
    await page.waitForSelector("#ws-exam-end-modal:not([hidden])");
    await page.click("#ws-exam-end-save-feedback");
    await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 90000 });
    await sleep(2000);

    const attemptB = await page.evaluate(() => {
      const attempt = window.__workspaceExamEnd?.getLastAttempt?.();
      const plain = window.__workspaceExamEnd?.buildFullAnswerPlainText?.();
      return {
        writtenPageCount: attempt?.writtenPageCount,
        plainIncludesPage1: plain?.includes("[답안지 1페이지]"),
        plainIncludesPage2: plain?.includes("[답안지 2페이지]"),
        hasFeedback: Boolean(attempt?.feedback?.items?.length),
      };
    });

    record(
      results,
      "B: 2페이지 저장 후 전체 피드백 생성",
      attemptB.writtenPageCount === 2 &&
        attemptB.plainIncludesPage1 &&
        attemptB.plainIncludesPage2 &&
        attemptB.hasFeedback,
      `pages=${attemptB.writtenPageCount}`
    );

    const feedbackUi = await page.evaluate(() => {
      const text = document.getElementById("ws-exam-result-feedback")?.textContent || "";
      const summary = document.getElementById("ws-exam-result-summary")?.textContent || "";
      return {
        hasSuggestion: text.includes("수정 제안"),
        summaryHasStats: summary.includes("사용 시간") && summary.includes("총 글자"),
      };
    });
    record(
      results,
      "B: 피드백 UI에 수정 제안 표시",
      feedbackUi.hasSuggestion && feedbackUi.summaryHasStats,
      `suggestion=${feedbackUi.hasSuggestion}`
    );

    const promptCheck = await page.evaluate(async () => {
      const mod = await import("./workspace-answer-feedback.js");
      const prompt = mod.ANSWER_FEEDBACK_SYSTEM_PROMPT;
      const banned = ["정답 여부", "점수", "당연한 형식 준수"];
      const hasRestrictions = banned.every((w) => prompt.includes(w));
      const hasConcrete = prompt.includes("구체적인 수정안") && prompt.includes("items");
      return {
        hasRestrictions,
        hasConcrete,
        containsGradingInMock: mod.feedbackContainsGradingLanguage({
          items: [{ reason: "점수 80점" }],
        }),
      };
    });

    record(
      results,
      "C: 시스템 프롬프트가 구체적 수정안 중심",
      promptCheck.hasRestrictions && promptCheck.hasConcrete,
      `restrictions=${promptCheck.hasRestrictions}`
    );
    record(
      results,
      "C: 채점 표현 감지 유틸 동작",
      promptCheck.containsGradingInMock,
      `grading=${promptCheck.containsGradingInMock}`
    );

    await installFeedbackMock(page, "fail");
    await page.click("#ws-exam-result-close");
    await sleep(400);
    await page.evaluate(() => {
      localStorage.removeItem("cpa-workspace-exam-attempts");
    });
    await setPageText(page, 0, "① API 실패 테스트 답안");
    await page.click("#ws-exam-end-btn");
    await page.waitForSelector("#ws-exam-end-modal:not([hidden])");
    await page.click("#ws-exam-end-save-feedback");
    await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 90000 });
    await sleep(2500);

    const attemptD = await page.evaluate(() => {
      const attempt = window.__workspaceExamEnd?.getLastAttempt?.();
      const feedbackText = document.getElementById("ws-exam-result-feedback")?.textContent || "";
      return {
        hasAttempt: Boolean(attempt?.id),
        pdfSaved: attempt?.pdfSaved,
        feedbackError: attempt?.feedbackError || "",
        uiShowsSaveOk: feedbackText.includes("정상적으로 저장"),
      };
    });

    record(
      results,
      "D: API 실패해도 답안 저장 유지",
      attemptD.hasAttempt && attemptD.pdfSaved,
      `pdfSaved=${attemptD.pdfSaved}`
    );
    record(
      results,
      "D: 피드백 실패 안내 표시",
      Boolean(attemptD.feedbackError) && attemptD.uiShowsSaveOk,
      attemptD.feedbackError || "ui"
    );

    const attemptE = await page.evaluate(() => {
      const attempt = window.__workspaceExamEnd?.getLastAttempt?.();
      const stored = JSON.parse(localStorage.getItem("cpa-workspace-exam-attempts") || "[]");
      const modalVisible = !document.getElementById("ws-exam-result-modal").hidden;
      const summary = document.getElementById("ws-exam-result-summary")?.textContent || "";
      const feedbackText = document.getElementById("ws-exam-result-feedback")?.textContent || "";
      return {
        storedCount: stored.length,
        attemptId: attempt?.id,
        modalVisible,
        summaryHasStats: summary.includes("사용 시간") && summary.includes("총 글자"),
        feedbackShowsError: feedbackText.includes("불러오지 못했습니다"),
      };
    });

    record(
      results,
      "E: 결과 화면 통계·실패 안내 표시",
      attemptE.modalVisible && attemptE.summaryHasStats && attemptE.feedbackShowsError,
      `summary=${attemptE.summaryHasStats}`
    );
    record(
      results,
      "E: 시도 기록 스냅샷 저장",
      attemptE.storedCount >= 1 && attemptE.attemptId,
      `stored=${attemptE.storedCount}`
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
