/**
 * 보고서 누적 기능 검증 — 2개 이상 계정 분석 저장 시뮬레이션
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const calcPath = path.join(__dirname, "..", "analytical-calc.js");
const csvPath = path.join(__dirname, "..", "sample-data", "ar-analysis-sample.csv");

global.XLSX = XLSX;
global.window = global;
eval(fs.readFileSync(calcPath, "utf8"));

const storage = new Map();
global.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

function buildHtml(calcResults) {
  const { account, accountData, items } = calcResults;
  const lines = [`<h4>${account}</h4>`, `prior:${accountData.priorAmount}`, `current:${accountData.currentAmount}`];
  for (const item of items) lines.push(`type:${item.type}`);
  return lines.join("|");
}

function serializeEntry(calcResults, meta) {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: new Date().toISOString(),
    memo: "",
    expanded: true,
    account: calcResults.account,
    procedureIds: meta.procedureIds,
    procedureLabels: meta.procedureLabels,
    fileName: meta.fileName,
    sourceData: {
      priorAmount: calcResults.accountData.priorAmount,
      currentAmount: calcResults.accountData.currentAmount,
      rowCount: calcResults.accountData.rowCount,
      format: calcResults.accountData.format,
    },
    items: calcResults.items,
    chartData: calcResults.chartData,
    resultsHtml: buildHtml(calcResults),
  };
}

(async () => {
  class MockFile {
    constructor(name, buf) {
      this.name = name;
      this._buf = buf;
    }
    async arrayBuffer() {
      return this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength);
    }
  }

  const file = new MockFile("ar-analysis-sample.csv", fs.readFileSync(csvPath));
  const dataset = await global.AnalyticalCalc.parseAnalyticalFile(file);

  const scenarios = [
    { account: "매출채권", procedures: new Set(["variance", "composition", "turnover"]) },
    { account: "재고자산", procedures: new Set(["variance", "composition"]) },
    { account: "매입채무", procedures: new Set(["variance", "composition"]) },
  ];

  const reportEntries = [];

  for (const { account, procedures } of scenarios) {
    const calcResults = global.AnalyticalCalc.runAnalyticalCalculations(dataset, account, procedures);
    const labels = [...procedures].map((id) => ({
      variance: "증감분석",
      composition: "구성비분석",
      turnover: "회전율·평균회수기간",
      aging: "연령분석 (Aging)",
      concentration: "거래처 집중도",
    }[id] || id));

    reportEntries.push(serializeEntry(calcResults, {
      procedureIds: [...procedures],
      procedureLabels: labels,
      fileName: dataset.fileName,
    }));
  }

  localStorage.setItem("audit-workbench-report-entries", JSON.stringify(reportEntries));
  const loaded = JSON.parse(localStorage.getItem("audit-workbench-report-entries"));

  console.log("=== 보고서 누적 시뮬레이션 ===");
  console.log("저장 건수:", loaded.length);
  loaded.forEach((entry, i) => {
    console.log(`${i + 1}. ${entry.account} | ${entry.procedureLabels.join(", ")} | prior=${entry.sourceData.priorAmount} current=${entry.sourceData.currentAmount}`);
  });

  const ok =
    loaded.length === 3 &&
    loaded[0].account === "매출채권" &&
    loaded[1].account === "재고자산" &&
    loaded[2].account === "매입채무" &&
    loaded[0].items.some((i) => i.type === "turnover") &&
    loaded[0].chartData?.turnover &&
    loaded[1].items.every((i) => i.type !== "turnover") &&
    loaded.every((e) => e.resultsHtml && e.savedAt && Array.isArray(e.procedureIds));

  console.log("\n검산 일치:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
})();
