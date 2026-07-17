/**
 * Navigator v2 구조 추출 테스트 — 2025/2026 문제 2
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const PE = require("../problem-extractor");

const PDFS = {
  "2025": "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf",
  "2026": "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2026-2).pdf",
};

function reportContextGroups(nav) {
  return (nav.contextGroups || []).map((g) => ({
    id: g.contextId,
    applies: g.appliesToQuestions,
    bullets: g.summaryBullets?.length || 0,
  }));
}

function checkContextSeparation2025(nav) {
  const groups = nav.contextGroups || [];
  const g1 = groups.find((g) => g.appliesToQuestions?.includes(1));
  const g2 = groups.find((g) => g.appliesToQuestions?.includes(2));
  const g36 = groups.find((g) => g.appliesToQuestions?.some((n) => n >= 3 && n <= 6));

  const ok =
    g1 && g1.appliesToQuestions.length === 1 &&
    g2 && g2.appliesToQuestions.length === 1 &&
    g36 && g36.appliesToQuestions.includes(3) && g36.appliesToQuestions.includes(6);

  const mixed =
    (g1?.summaryBullets?.join("") || "").includes("브로콜리") ||
    (g2?.summaryBullets?.join("") || "").includes("릴리펏");

  return { ok, mixed: !mixed, g1: g1?.appliesToQuestions, g2: g2?.appliesToQuestions, g36: g36?.appliesToQuestions };
}

async function runOne(year, problemNumber) {
  const pdfPath = PDFS[year];
  if (!fs.existsSync(pdfPath)) {
    console.log(`SKIP ${year} — PDF 없음`);
    return null;
  }

  const fullText = (await pdfParse(fs.readFileSync(pdfPath))).text?.trim() || "";
  const extracted = PE.extractProblemText(fullText, problemNumber);
  const detected = PE.detectQuestionNumbers(extracted.text || "");

  console.log(`\n========== ${year} 문제 ${problemNumber} ==========`);
  console.log("PDF 전체:", fullText.length, "자");
  console.log("문제 본문 추출:", extracted.length || 0, "자", extracted.text ? "OK" : "FAIL");
  console.log("규칙 탐지 물음:", detected.numbers.join(", ") || "(없음)");

  if (!process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY 없음 — API 테스트 생략");
    return { year, preOnly: true, detected: detected.numbers };
  }

  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/analyze-navigator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseText: fullText, problemNumber: String(problemNumber), year }),
  });
  const data = await res.json();

  if (!res.ok) {
    console.log("API 상태:", res.status, data.error);
    console.log("오류:", (data.errors || []).join("; "));
    console.log("탐지:", data.preExtraction?.detectedNumbers?.join(", "));
    if (data.navigator) {
      console.log("부분 물음:", data.navigator.questions?.map((q) => q.questionNumber).join(", "));
      console.log("부분 그룹:", JSON.stringify(reportContextGroups(data.navigator)));
    }
    return { year, ok: false, status: res.status, data };
  }

  const nav = data;
  console.log("제목:", nav.problemTitle);
  console.log("물음 개수:", nav.questions?.length);
  console.log("상황 그룹:", JSON.stringify(reportContextGroups(nav), null, 2));

  if (year === "2025") {
    const sep = checkContextSeparation2025(nav);
    console.log("2025 3그룹 분리:", sep.ok ? "PASS" : "FAIL", sep);
    console.log("상황 혼입 없음:", sep.mixed ? "PASS" : "CHECK");
  }

  const out = path.join(__dirname, "..", "sample-output", `navigator-v2-${year}-p${problemNumber}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(nav, null, 2));
  console.log("저장:", out);

  return { year, ok: true, qCount: nav.questions?.length, groups: nav.contextGroups?.length, nav };
}

async function main() {
  const r2025 = await runOne("2025", 2);
  const r2026 = await runOne("2026", 2);

  console.log("\n========== 요약 ==========");
  if (r2025) {
    console.log(`2025: 물음 ${r2025.qCount ?? r2025.detected?.length ?? "?"}개, 그룹 ${r2025.groups ?? "?"}개, ${r2025.ok === false ? "FAIL" : r2025.preOnly ? "PRE-ONLY" : "PASS"}`);
  }
  if (r2026) {
    console.log(`2026: 물음 ${r2026.qCount ?? r2026.detected?.length ?? "?"}개, 그룹 ${r2026.groups ?? "?"}개, ${r2026.ok === false ? "FAIL" : r2026.preOnly ? "PRE-ONLY" : "PASS"}`);
    if (r2026.preOnly && r2026.detected?.length === 0) {
      console.log("2026 PDF 주의: 【문제N】 본문이 없는 샘플 PDF(약 1110자)일 수 있습니다.");
    }
  }

  const fail2025 = r2025 && r2025.ok === false;
  const fail2026 = r2026 && r2026.ok === false && r2026.status !== 422;
  process.exit(fail2025 || fail2026 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
