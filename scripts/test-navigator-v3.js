/**
 * Navigator v3 읽기 과정 테스트 — 2025 문제 2
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const PE = require("../problem-extractor");

const PDF_2025 = "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";

function checkCaseSeparation(nav) {
  const qs = nav.step3_questions || [];
  const q1 = qs.find((q) => q.questionNumber === 1);
  const q2 = qs.find((q) => q.questionNumber === 2);
  const q3 = qs.find((q) => q.questionNumber === 3);

  const q1Scope = (q1?.caseInfoToUse || "").toLowerCase();
  const q2Scope = (q2?.caseInfoToUse || "").toLowerCase();
  const q3Scope = (q3?.caseInfoToUse || "").toLowerCase();

  const q1ok = q1Scope.includes("릴리") || q1Scope.includes("물음1") || q1Scope.includes("물음 1");
  const q2ok = q2Scope.includes("새별") || q2Scope.includes("물음2") || q2Scope.includes("물음 2");
  const q3ok = q3Scope.includes("브로콜리") || q3Scope.includes("물음3") || /물음\s*3\s*[~～\-]\s*6/.test(q3Scope);

  const noMix =
    !q1Scope.includes("브로콜리") &&
    !q2Scope.includes("릴리") &&
    !(q1Scope.includes("새별") && !q1Scope.includes("금지"));

  return { q1ok, q2ok, q3ok, noMix, q1: q1?.caseInfoToUse, q2: q2?.caseInfoToUse, q3: q3?.caseInfoToUse };
}

async function main() {
  if (!fs.existsSync(PDF_2025)) {
    console.error("PDF 없음:", PDF_2025);
    process.exit(1);
  }

  const fullText = (await pdfParse(fs.readFileSync(PDF_2025))).text?.trim() || "";
  const extracted = PE.extractProblemText(fullText, 2);
  const problemText = extracted.text || "";

  console.log("========== 2025 문제 2 (붙여넣기 모드) ==========");
  console.log("문제 본문:", problemText.length, "자");

  if (!process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY 없음 — API 생략");
    process.exit(0);
  }

  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/analyze-navigator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseText: problemText,
      year: "2025",
      problemNumber: "2",
      inputSource: "paste",
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    console.log("API FAIL:", res.status, data.error);
    console.log("errors:", (data.errors || []).join("; "));
    if (data.navigator) {
      const out = path.join(__dirname, "..", "sample-output", "navigator-v3-2025-p2-partial.json");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(data.navigator, null, 2));
    }
    process.exit(1);
  }

  const nav = data;
  console.log("schema:", nav.schemaVersion);
  console.log("제목:", nav.problemTitle);
  console.log("STEP1 핵심정보:", nav.step1_keyFacts?.length, "개");
  nav.step1_keyFacts?.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log("STEP2 출제의도:", nav.step2_examinerIntent?.length, "개");
  nav.step2_examinerIntent?.slice(0, 3).forEach((item) => {
    console.log(`  · ${item.fact} → ${item.intent}`);
  });
  console.log("STEP3 물음:", nav.step3_questions?.length, "개");

  const sep = checkCaseSeparation(nav);
  console.log("\n사례 분리 검증:", sep);

  const out = path.join(__dirname, "..", "sample-output", "navigator-v3-2025-p2.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(nav, null, 2));
  console.log("\n저장:", out);

  const pass =
    nav.schemaVersion === "case-navigator-v3" &&
    (nav.step1_keyFacts?.length || 0) >= 3 &&
    (nav.step2_examinerIntent?.length || 0) >= 3 &&
    nav.step3_questions?.length === 6 &&
    sep.q1ok &&
    sep.q2ok &&
    sep.q3ok;

  console.log("\n결과:", pass ? "PASS" : "CHECK");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
