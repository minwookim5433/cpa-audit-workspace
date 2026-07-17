/**
 * Audit Toolkit 구조 검증
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "toolkit-registry.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "case-workbench.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "external-confirm.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "toolkit-modules.js"), "utf8"));

const tools = global.AuditToolkit.AUDIT_TOOLKIT;
const toolIds = tools.map((t) => t.id);
const expectedIds = [
  "analytical",
  "materiality",
  "sampling",
  "external-confirm",
  "aging-analysis",
  "estimates-review",
  "contract-review",
  "related-party",
];

const mockAnalysis = {
  auditPlanning: { companyUnderstanding: { industry: "제조", transactionStory: "외상매출 특수관계자" } },
  riskAssessment: {
    risks: [
      { riskTitle: "매출채권 회수 지연", whyThisRisk: { summary: "장기연체" }, sourceFacts: ["90일 초과"] },
      { riskTitle: "특수관계자 거래", whyThisRisk: { summary: "비공정 조건" }, sourceFacts: [] },
    ],
  },
  responseProcedures: {
    byRisk: [{
      requiredEvidence: [{ name: "채권조회", requestMethod: "외부조회", reason: "잔액 확인" }],
      procedureAlternatives: [{ procedure: "분석적 절차", purpose: "추세" }],
    }],
  },
};

const recommended = global.AuditToolkit.recommendTools(mockAnalysis);
const extHtml = global.ExternalConfirmToolkit.renderPanel(mockAnalysis);
const agingHtml = global.ToolkitModules.RENDERERS["aging-analysis"]({ analysis: mockAnalysis });
const rpHtml = global.ToolkitModules.RENDERERS["related-party"]({ analysis: mockAnalysis });

const checks = [
  ["도구 10개 등록", tools.length === 10],
  ["Toolkit ID 일치", expectedIds.every((id) => toolIds.includes(id))],
  ["분석적절차 available", tools.find((t) => t.id === "analytical")?.status === "available"],
  ["외부조회 available", tools.find((t) => t.id === "external-confirm")?.status === "available"],
  ["연령·추정·특수관계자 beta", ["aging-analysis", "estimates-review", "related-party"].every((id) => tools.find((t) => t.id === id)?.status === "beta")],
  ["추천 8개 이하", recommended.length <= 8 && recommended.length >= 3],
  ["외부조회 추천", recommended.some((t) => t.id === "external-confirm")],
  ["연령분석 UI", agingHtml.includes("연령분석") && agingHtml.includes("후속감사절차")],
  ["특수관계자 UI", rpHtml.includes("특수관계자") && rpHtml.includes("후속감사절차")],
  ["면책 문구", extHtml.includes("확정하지 않")],
];

console.log("=== AI Audit Workbench 구조 검증 ===");
let pass = true;
checks.forEach(([name, ok]) => {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
  if (!ok) pass = false;
});

process.exit(pass ? 0 : 1);
