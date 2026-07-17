/**
 * 2025 회계감사 기출 PDF — 문제 2 Navigator API 테스트
 * Usage: node scripts/test-navigator-problem2.js [pdfPath]
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const ROOT = path.join(__dirname, "..");

function findDefaultPdf() {
  const desktop = "C:\\Users\\bnb12\\Desktop";
  const files = fs.readdirSync(desktop).filter((f) => f.endsWith(".pdf") && f.includes("2025"));
  if (!files.length) return null;
  return path.join(desktop, files[0]);
}

function extractProblemText(fullText, problemNumber) {
  const num = String(problemNumber).trim();
  const numInt = parseInt(num, 10);
  const startPatterns = [
    new RegExp(`문제\\s*${num}(?:\\s*[_\\-]?\\s*|\\.|번|호|\\)|）)`, "im"),
    new RegExp(`(?:^|\\n)\\s*${num}\\.\\s*(?:문제)?`, "m"),
  ];
  let startIndex = -1;
  for (const p of startPatterns) {
    const m = p.exec(fullText);
    if (m && (startIndex === -1 || m.index < startIndex)) startIndex = m.index;
  }
  if (startIndex === -1) return null;
  const remainder = fullText.slice(startIndex + 5);
  const endCandidates = [];
  for (let next = numInt + 1; next <= numInt + 3; next++) {
    const m = new RegExp(`문제\\s*${next}`, "im").exec(remainder);
    if (m) endCandidates.push(startIndex + 5 + m.index);
  }
  const endIndex = endCandidates.length ? Math.min(...endCandidates) : fullText.length;
  const slice = fullText.slice(startIndex, endIndex).trim();
  return slice.length >= 80 ? slice : null;
}

async function main() {
  const pdfPath = process.argv[2] || findDefaultPdf();
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.error("PDF not found. Pass path as argument.");
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY required for live test.");
    process.exit(1);
  }

  const buf = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(buf);
  const fullText = parsed.text?.trim() || "";
  const problemText = extractProblemText(fullText, "2");
  console.log("PDF:", pdfPath);
  console.log("Full text length:", fullText.length);
  console.log("Problem 2 extracted:", problemText ? problemText.length + " chars" : "FAILED");

  if (!problemText) process.exit(1);

  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/analyze-navigator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseText: fullText, problemNumber: "2" }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("API error:", data.error);
    process.exit(1);
  }

  const qNums = (data.questions || []).map((q) => q.questionNumber);
  const checks = [
    ["schemaVersion", data.schemaVersion === "case-navigator-v1"],
    ["problemNumber 2", data.problemNumber === "2"],
    ["questions 6개", data.questions?.length === 6],
    ["우선 확인 3개", data.priorityChecks?.length === 3],
    ["caseSummary 4영역", data.caseSummary?.businessContext?.text && data.caseSummary?.auditIssueTags],
    ["득점키워드 3~7", data.questions?.every((q) => q.scoringKeywords?.length >= 1 && q.scoringKeywords?.length <= 7)],
    ["물음 원문 존재", data.questions?.every((q) => q.questionText?.length > 10)],
    ["답안형식", data.questions?.every((q) => q.answerFormat != null)],
  ];

  console.log("\n=== 문제 2 Navigator API 결과 ===");
  console.log("제목:", data.problemTitle);
  console.log("연도:", data.examYear);
  console.log("물음 번호:", qNums.join(", "));
  console.log("쟁점 태그:", (data.caseSummary?.auditIssueTags || []).map((t) => t.label).join(", "));
  console.log("추출 경고:", data.extractionMeta?.warning || "(없음)");

  let pass = true;
  checks.forEach(([name, ok]) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
    if (!ok) pass = false;
  });

  if (data.questions?.length) {
    const q1 = data.questions[0];
    console.log("\n[물음 1 샘플]");
    console.log("주제:", q1.examTopic?.primary);
    console.log("키워드:", q1.scoringKeywords?.join(", "));
    console.log("형식:", JSON.stringify(q1.answerFormat));
  }

  const outPath = path.join(ROOT, "sample-output", "navigator-problem2.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
  console.log("\nSaved:", outPath);

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
