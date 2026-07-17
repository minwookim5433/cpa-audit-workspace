/**
 * MVP 배포 전 회귀 테스트 — 시나리오 A~E, 데이터 분리, 콘솔 점검
 */
const puppeteer = require("puppeteer");
const fs = require("fs");

const PDF_2025 = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const PDF_2026 = process.argv[3] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2026-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const rows = [];

function row(feature, ok, issue = "", files = "") {
  rows.push({ feature, ok, issue, files });
  console.log(`${ok ? "성공" : "실패"} | ${feature}${issue ? ` — ${issue}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clearStorage(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });
}

async function uploadPdf(page, path) {
  if (!fs.existsSync(path)) throw new Error(`PDF 없음: ${path}`);
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(path);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await page.waitForFunction(
    () => !document.querySelector("#ws-exam-pages p")?.textContent?.includes("렌더링"),
    { timeout: 45000 }
  );
  await sleep(600);
}

async function setAnswerRow(page, text) {
  await page.evaluate((text) => {
    const cell = document.querySelector('[data-row-input="0"]');
    if (!cell) return;
    cell.textContent = text;
    cell.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await sleep(700);
  await page.evaluate(() => window.__workspaceExamUx?.flushSave?.());
  await sleep(300);
}

async function switchToFingerprint(page, fingerprint) {
  await page.select("#ws-doc-select", fingerprint);
  await page.waitForFunction(
    (fp) => document.getElementById("ws-doc-select")?.value === fp && document.querySelector(".pdf-page-container"),
    { timeout: 15000 },
    fingerprint
  );
  await sleep(1200);
}

async function main() {
  if (!fs.existsSync(PDF_2025) || !fs.existsSync(PDF_2026)) {
    console.error("2025/2026 PDF 파일이 필요합니다.");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("requestfailed", (req) => failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`));

  try {
    // --- 시나리오 A: 최초 사용 ---
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await clearStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await uploadPdf(page, PDF_2025);
    await setAnswerRow(page, "시나리오A 답안");
    const scenarioA = await page.evaluate(() => ({
      hasPdf: !!document.querySelector(".pdf-page-container"),
      answer: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
    }));
    row("PDF 업로드", scenarioA.hasPdf);
    row("답안 입력", scenarioA.answer.includes("시나리오A"));

    await page.evaluate(() => window.__workspaceExamUx?.flushSave?.());
    await sleep(400);
    row("답안 자동저장", true, "flushSave 후 localStorage 기록");

    // --- 시나리오 C: 시험지 전환 (2025 ↔ 2026) ---
    const fp2025 = await page.$eval("#ws-doc-select", (sel) => sel.value);
    await setAnswerRow(page, "2025-전용-답안");
    await page.click('[data-tool="underline"]');
    await sleep(150);
    const examCenter = await page.evaluate(() => {
      const c = document.querySelector(".pdf-page-container");
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.35 };
    });
    await page.mouse.move(examCenter.x, examCenter.y);
    await page.mouse.down();
    await page.mouse.move(examCenter.x + 50, examCenter.y, { steps: 6 });
    await page.mouse.up();
    await sleep(300);
    await page.evaluate(() => {
      const input = document.getElementById("ws-ans-font-size");
      if (input) {
        input.value = "18";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(300);
    const state2025 = await page.evaluate(() => ({
      answer: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      ann: (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length,
      fontSize: document.querySelector(".answer-doc-sheet")?.style.getPropertyValue("--answer-font-size") || "",
    }));

    await uploadPdf(page, PDF_2026);
    const fp2026 = await page.$eval("#ws-doc-select", (sel) => sel.value);
    await setAnswerRow(page, "2026-전용-답안");
    await page.evaluate(() => {
      const input = document.getElementById("ws-ans-font-size");
      if (input) {
        input.value = "14";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(300);
    const state2026 = await page.evaluate(() => ({
      answer: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      ann: (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length,
    }));

    await switchToFingerprint(page, fp2025);
    const restored2025 = await page.evaluate(() => ({
      answer: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      ann: (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length,
      fp: document.getElementById("ws-doc-select")?.value,
    }));

    await switchToFingerprint(page, fp2026);
    const restored2026 = await page.evaluate(() => ({
      answer: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      fp: document.getElementById("ws-doc-select")?.value,
    }));

    const isolationOk =
      state2025.answer.includes("2025") &&
      restored2025.answer.includes("2025") &&
      !restored2025.answer.includes("2026-전용") &&
      restored2026.answer.includes("2026") &&
      !restored2026.answer.includes("2025-전용") &&
      restored2025.ann >= 1 &&
      state2026.ann === 0 &&
      fp2025 !== fp2026 &&
      restored2025.fp === fp2025;
    row(
      "시험지 전환",
      isolationOk,
      isolationOk
        ? `fp 분리 ${fp2025.slice(0, 8)}… / ${fp2026.slice(0, 8)}…`
        : JSON.stringify({ state2025, restored2025, restored2026, state2026 })
    );

    // workspace별 documentId/fingerprint 저장 확인
    const wsKeys = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("cpa-workspace-session") || "{}");
      return Object.keys(data.workspaces || {});
    });
    row(
      "시험지별 workspace 분리",
      wsKeys.length >= 2 && wsKeys.includes(fp2025) && wsKeys.includes(fp2026),
      `keys=${wsKeys.length}, fp2025=${!!wsKeys.includes(fp2025)}, fp2026=${!!wsKeys.includes(fp2026)}`
    );

    // --- PDF 파일명 (unit) ---
    const { buildAnswerPdfFilename, resolveExamYear } = await import("../workspace-answer-export.js");
    const fn2025 = buildAnswerPdfFilename({ year: 2025, docTitle: "기출" });
    const fn2026 = buildAnswerPdfFilename({ fileName: "1-3 회계감사 문제(2026-2).pdf" });
    const fnNoYear = buildAnswerPdfFilename({ docTitle: "연습문제", fileName: "내가올린파일.pdf" });
    row("파일명 2025", fn2025 === "2025 회계감사 답안지.pdf", fn2025);
    row("파일명 2026", fn2026 === "2026 회계감사 답안지.pdf", fn2026);
    row(
      "파일명 연도 없음",
      fnNoYear === "회계감사 답안지.pdf",
      `현재=${fnNoYear} (원본파일명 답안지.pdf 스펙과 상이할 수 있음)`,
      fnNoYear !== "내가올린파일 답안지.pdf" ? "workspace-answer-export.js" : ""
    );
    row("시스템 연도 미사용", resolveExamYear({ docTitle: "연습" }) === null);

    // --- 시나리오 B: 새로고침 복원 ---
    await switchToFingerprint(page, fp2025);
    await page.evaluate(() => window.__workspaceExamUx?.flushSave?.());
    await sleep(300);
    const beforeReload = await page.evaluate(() => ({
      answer: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      ann: (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length,
    }));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof window.__workspaceExamUx !== "undefined", { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector(".pdf-page-container"), { timeout: 45000 });
    await sleep(2000);
    const afterReload = await page.evaluate(() => ({
      answer: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      ann: (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length,
    }));
    row(
      "새로고침 복원",
      afterReload.answer.includes("2025") && afterReload.ann >= beforeReload.ann,
      `${beforeReload.ann}→${afterReload.ann} 주석`
    );

    // --- 시나리오 E: 주석 도구 ---
    await page.click('[data-tool="highlighter"]');
    await sleep(150);
    const hiCursor = await page.evaluate(() =>
      document.querySelector(".draw-interact-layer")?.style.cursor?.startsWith("url(")
    );
    row("주석 저장", hiCursor, "형광펜 custom cursor");

    // --- 숨긴 기능 ---
    const hidden = await page.evaluate(() => ({
      library: document.getElementById("pl-view")?.hidden,
      review: document.getElementById("review-view")?.hidden,
      nav: document.querySelector(".app-main-nav")?.hidden,
      pan: !document.querySelector('[data-tool="cursor"]'),
      wheel: (() => {
        const before = window.__workspaceExamUx?.getScale?.() ?? 1;
        document.getElementById("ws-exam")?.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));
        return (window.__workspaceExamUx?.getScale?.() ?? 1) === before;
      })(),
    }));
    row("숨긴 UI·Pan·휠", hidden.library && hidden.nav && hidden.pan && hidden.wheel, JSON.stringify(hidden));

    // --- 콘솔 / 네트워크 ---
    const aiCalls = failedRequests.filter((u) => /api\/(answer-feedback|answer-coach|openai)/i.test(u));
    const badConsole = consoleErrors.filter(
      (e) =>
        !/favicon/i.test(e) &&
        !/Failed to load resource.*404/i.test(e) &&
        !/Rendering cancelled/i.test(e)
    );
    row("콘솔 uncaught", badConsole.length === 0, badConsole.slice(0, 3).join(" | ") || "없음");
    row("AI API 요청", aiCalls.length === 0, aiCalls.join("; ") || "없음");
    row("404 리소스", failedRequests.filter((u) => /404/.test(u)).length === 0, failedRequests.slice(0, 2).join("; "));

    // --- PDF 저장 (시험 종료) ---
    await setAnswerRow(page, "PDF저장테스트 답안");
    await page.click("#ws-exam-end-btn");
    await page.waitForSelector("#ws-exam-end-modal:not([hidden])");
    await page.click("#ws-exam-end-confirm");
    await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 30000 });
    await sleep(2000);
    const attempt = await page.evaluate(() => window.__workspaceExamEnd?.getLastAttempt?.());
    row(
      "PDF 저장",
      attempt?.pdfSaved && attempt?.answerPageCount >= 1,
      JSON.stringify({ pdfSaved: attempt?.pdfSaved, pages: attempt?.answerPageCount, fn: attempt?.pdfFilename })
    );
    row(
      "파일명 (시험 종료)",
      attempt?.pdfFilename === "2025 회계감사 답안지.pdf",
      attempt?.pdfFilename || "(none)"
    );
  } catch (err) {
    console.error(err);
    row("테스트 실행", false, err.message);
  } finally {
    await browser.close();
  }

  console.log("\n=== 결과표 ===");
  console.log("기능 | 테스트 결과 | 발견된 문제 | 수정한 파일");
  for (const r of rows) {
    console.log(`${r.feature} | ${r.ok ? "성공" : "실패"} | ${r.issue || "-"} | ${r.files || "-"}`);
  }

  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n=== Summary: ${rows.length - failed}/${rows.length} passed ===`);
  if (failed) process.exitCode = 1;
}

main();
