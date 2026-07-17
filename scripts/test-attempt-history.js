/**
 * 풀이 기록 관리 — 테스트 A~J
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

async function resetStorage(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });
}

async function switchToSolve(page) {
  await sleep(200);
}

async function uploadPdf(page, filePath) {
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(filePath);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(1200);
}

async function setAnswer(page, text) {
  await page.evaluate((text) => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = text;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await sleep(600);
}

async function completeExam(page) {
  await switchToSolve(page);
  await page.evaluate(() => document.getElementById("ws-exam-end-btn")?.click());
  await page.waitForSelector("#ws-exam-end-modal:not([hidden])");
  await page.evaluate(() => document.getElementById("ws-exam-end-confirm")?.click());
  await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 30000 });
  await sleep(1500);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
    await resetStorage(page);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => typeof window.__workspaceExamUx !== "undefined", { timeout: 15000 });

    await uploadPdf(page, PDF_PATH);
    await setAnswer(page, "① 첫 번째 풀이 테스트");
    await completeExam(page);

    const testA = await page.evaluate(async () => {
      const { listAllAttempts } = await import("./workspace-attempt-service.js");
      const attempts = await listAllAttempts();
      return { count: attempts.length, chars: attempts[0]?.totalCharacters || 0 };
    });
    record(results, "A: 첫 풀이 저장", testA.count >= 1 && testA.chars > 0, `count=${testA.count}`);

    await page.evaluate(() => document.getElementById("ws-exam-result-finish")?.click());
    await sleep(400);

    await setAnswer(page, "① 첫 번째 풀이 테스트 수정됨");
    const testC = await page.evaluate(async () => {
      const id = window.__workspaceAttemptBridge.getLoadedAttemptId();
      await window.__workspaceAttemptBridge.saveWithChoice("update");
      await new Promise((r) => setTimeout(r, 500));
      const { listAllAttempts } = await import("./workspace-attempt-service.js");
      const attempts = await listAllAttempts();
      return { count: attempts.length, revised: (attempts[0]?.revisionHistory || []).length >= 1, id };
    });
    record(results, "C: 기존 기록 업데이트", testC.count === 1 && testC.revised, JSON.stringify(testC));

    await setAnswer(page, "① 두 번째 버전");
    const testD = await page.evaluate(async () => {
      await window.__workspaceAttemptBridge.saveWithChoice("new");
      await new Promise((r) => setTimeout(r, 500));
      const { listAllAttempts } = await import("./workspace-attempt-service.js");
      const attempts = await listAllAttempts();
      return { count: attempts.length, topNumber: attempts[0]?.attemptNumber || 0 };
    });
    record(results, "D: 새 풀이 저장", testD.count >= 2 && testD.topNumber >= 2, `count=${testD.count}`);

    await page.evaluate(async () => {
      await window.__workspaceAttemptBridge.startFresh({ copyMemo: false, copyTags: true, copyAnnotations: false });
    });
    await sleep(800);
    const testE = await page.evaluate(() => {
      const t = document.querySelector(".answer-doc-editor")?.textContent || "";
      return !t.includes("두 번째");
    });
    record(results, "E: 새로 풀기 빈 답안", testE, "");

    await uploadPdf(page, PDF_PATH);
    await sleep(1500);
    const testB = await page.evaluate(() => ({
      modalHidden: document.getElementById("ws-attempt-existing-modal")?.hidden !== false,
      editorVisible: !!document.querySelector(".answer-doc-editor"),
    }));
    record(
      results,
      "B: MVP 재업로드 — 모달 없음",
      testB.modalHidden && testB.editorVisible,
      JSON.stringify(testB)
    );

    await page.evaluate(() => {
      const pm = document.getElementById("ws-problem-memo");
      pm.value = "공통 메모 테스트";
      pm.dispatchEvent(new Event("input", { bubbles: true }));
      const am = document.getElementById("ws-attempt-memo");
      am.value = "이번 풀이 메모";
      am.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(500);
    await setAnswer(page, "① 메모 테스트 답안");
    await completeExam(page);

    const testFG = await page.evaluate(async () => {
      const { listAllAttempts, getProblemNote } = await import("./workspace-attempt-service.js");
      const attempts = await listAllAttempts();
      const latest = attempts[0];
      const note = latest ? await getProblemNote(latest.problemKey) : "";
      return { attemptMemo: latest?.memo || "", problemMemo: note };
    });
    record(results, "F: 문제 공통 메모", testFG.problemMemo.includes("공통"), testFG.problemMemo);
    record(results, "G: 풀이별 메모", testFG.attemptMemo.includes("이번 풀이"), testFG.attemptMemo);

    await page.evaluate(() => document.getElementById("ws-exam-result-finish")?.click());
    await sleep(300);
    await setAnswer(page, "① draft 복원 테스트");
    await sleep(1200);
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(3000);
    const testH = await page.evaluate(() => document.querySelector(".answer-doc-editor")?.textContent || "");
    record(results, "H: draft 복원", testH.includes("draft"), testH.slice(0, 24));

    const testI = await page.evaluate(async () => {
      const { listAllAttempts } = await import("./workspace-attempt-service.js");
      return listAllAttempts().then((attempts) => attempts.length);
    });
    record(results, "I: 풀이 기록 IndexedDB 유지", testI >= 1, `attempts=${testI}`);

    const testJ = await page.evaluate(async () => {
      const { listAllAttempts } = await import("./workspace-attempt-service.js");
      const attempts = await listAllAttempts();
      const keys = new Set(attempts.map((a) => a.documentId));
      return { attemptCount: attempts.length, uniqueDocs: keys.size };
    });
    record(results, "J: documentId 기반 분리", testJ.attemptCount >= 1 && testJ.uniqueDocs >= 1, JSON.stringify(testJ));

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
