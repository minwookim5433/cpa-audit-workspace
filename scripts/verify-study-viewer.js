/**
 * Study Annotator E2E — PDF 로드 · 메모 저장 · 새로고침 복원
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");

const PDF_PATH = "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

async function run() {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch {
    console.log("puppeteer 없음 — fetch API 테스트만 수행");
    await testAnalyzeApi();
    return;
  }

  if (!fs.existsSync(PDF_PATH)) {
    console.error("PDF 없음:", PDF_PATH);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  console.log("1. 페이지 로드");
  await page.goto(BASE, { waitUntil: "networkidle0" });

  console.log("2. PDF 업로드");
  const input = await page.$("#study-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(
    () => {
      const status = document.getElementById("study-status")?.textContent || "";
      const pages = document.querySelectorAll(".study-page-wrap").length;
      return status.includes("페이지") && pages >= 5;
    },
    { timeout: 120000 }
  );
  const pageCount = await page.$$eval(".study-page-wrap", (els) => els.length);
  console.log("   페이지 렌더:", pageCount);

  const sessionMeta = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("cpa-study-session") || "{}");
    return { fingerprint: s.pdfFingerprint, pdfName: s.pdfName };
  });
  console.log("   PDF 식별:", sessionMeta.fingerprint?.slice(0, 40));

  console.log("3. 선택 문장 AI 분석 + 메모 저장");
  const hasApi = !!process.env.OPENAI_API_KEY;
  const analyzed = await page.evaluate(async (meta) => {
    const layer = document.querySelector(".study-page-wrap .textLayer");
    if (!layer || !layer.textContent?.trim()) return { ok: false, reason: "no-text-layer" };

    const pageWrap = layer.closest(".study-page-wrap");
    const full = layer.textContent.trim();
    const text = full.slice(0, Math.min(100, full.length));

    let analysis = null;
    if (typeof meta.hasApi !== "undefined" && meta.hasApi) {
      const res = await fetch("/api/analyze-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: text,
          contextBefore: "",
          contextAfter: full.slice(100, 250),
          pageNumber: Number(pageWrap.dataset.page),
          questionNumber: "2",
        }),
      });
      analysis = await res.json();
      if (!res.ok) return { ok: false, reason: analysis.error };
    }

    const session = JSON.parse(localStorage.getItem("cpa-study-session") || "{}");
    session.annotations = [
      {
        id: "test-ann-1",
        pageNumber: Number(pageWrap.dataset.page),
        selectedText: text,
        contextBefore: "",
        contextAfter: full.slice(100, 250),
        highlightColor: "yellow",
        rects: [{ left: 0.05, top: 0.12, width: 0.85, height: 0.025 }],
        questionNumber: "2",
        important: true,
        collapsed: false,
        userMemo: "브라우저 테스트 메모",
        analysis,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem("cpa-study-session", JSON.stringify(session));
    return { ok: true, textLen: text.length, hasAnalysis: !!analysis?.whyImportant };
  }, { hasApi });
  console.log("   분석:", analyzed);

  console.log("4. 새로고침 후 복원");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".study-page-wrap").length >= 5 &&
      document.querySelectorAll(".study-memo-card").length >= 1,
    { timeout: 120000 }
  );

  const afterReload = await page.evaluate(() => {
    const session = localStorage.getItem("cpa-study-session");
    const parsed = session ? JSON.parse(session) : null;
    return {
      annCount: parsed?.annotations?.length || 0,
      highlights: document.querySelectorAll(".study-highlight").length,
      cards: document.querySelectorAll(".study-memo-card").length,
      pins: document.querySelectorAll(".study-memo-pin").length,
      pdfPages: document.querySelectorAll(".study-page-wrap").length,
      userMemo: parsed?.annotations?.[0]?.userMemo || "",
    };
  });

  console.log("   복원 결과:", afterReload);

  await browser.close();

  const pass =
    analyzed.ok &&
    afterReload.annCount >= 1 &&
    afterReload.highlights >= 1 &&
    afterReload.cards >= 1 &&
    afterReload.pdfPages >= 1 &&
    afterReload.userMemo.includes("브라우저");

  console.log("\n결과:", pass ? "PASS" : "CHECK");
  process.exit(pass ? 0 : 1);
}

async function testAnalyzeApi() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("SKIP API");
    process.exit(0);
  }
  const res = await fetch(`${BASE}/api/analyze-selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selectedText: "감사인은 수용가능한 적발위험의 수준을 결정하여야 한다.",
      contextBefore: "소규모기업 감사위험평가",
      contextAfter: "중요왜곡표시위험",
      pageNumber: 1,
      questionNumber: "1",
    }),
  });
  const data = await res.json();
  console.log(res.status, data.whyImportant ? "OK" : data);
  process.exit(res.ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
