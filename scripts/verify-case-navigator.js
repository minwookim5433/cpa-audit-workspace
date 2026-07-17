/**
 * Navigator v2 UI 검증 (오프라인)
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(ROOT, "problem-extractor.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "case-navigator.js"), "utf8"));

const mockNav = {
  schemaVersion: "case-navigator-v2",
  year: "2025",
  problemNumber: 2,
  problemTitle: "감사계획·위험평가",
  totalQuestions: 6,
  contextGroups: [
    { contextId: "context-1", appliesToQuestions: [1], summaryBullets: ["릴리펏 소규모"] },
    { contextId: "context-2", appliesToQuestions: [2], summaryBullets: ["새별전자 반도체"] },
    { contextId: "context-3", appliesToQuestions: [3, 4, 5, 6], summaryBullets: ["브로콜리 매출"] },
  ],
  questions: [
    {
      questionNumber: 1,
      contextId: "context-1",
      originalText: "물음1 원문",
      coreTopic: "적발위험",
      scoringKeywords: ["적발위험", "감사위험", "영향"],
      relatedStandards: [{ standardNumber: "KSA 315", standardName: "위험평가" }],
    },
  ],
};

const html = global.CaseNavigator.renderNavigatorPanel(mockNav);
const errHtml = global.CaseNavigator.renderExtractionError({
  error: "물음 추출 불완전",
  errors: ["물음 3 누락"],
  preExtraction: { detectedNumbers: [1, 2, 3, 4, 5, 6] },
});

const checks = [
  ["상황 그룹", html.includes("상황 그룹") && html.includes("물음 3~6")],
  ["3개 그룹 bullet", html.includes("릴리펏") && html.includes("브로콜리")],
  ["물음 카드 5항목", html.includes("물음 원문") && html.includes("득점 키워드")],
  ["답안란 없음", !html.includes("nav-answer-input")],
  ["Toolkit 없음", !html.includes("nav-toolkit")],
  ["태그 없음", !html.includes("nav-tag")],
  ["추출 오류 UI", errHtml.includes("물음 추출 불완전")],
];

console.log("=== Navigator v2 UI 검증 ===");
let pass = true;
checks.forEach(([name, ok]) => {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
  if (!ok) pass = false;
});
process.exit(pass ? 0 : 1);
