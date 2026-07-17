/**
 * 매출채권 결과 화면 HTML 구조 검증 (브라우저 없이)
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function createMockEl(id = "") {
  const el = {
    id,
    hidden: false,
    innerHTML: "",
    value: "",
    disabled: false,
    textContent: "",
    options: [],
    selectedIndex: 0,
    dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    style: {},
    parentElement: null,
    parentNode: null,
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild(child) {
      child.parentElement = el;
      return child;
    },
    insertBefore() {},
    contains() { return false; },
    getContext() { return { clearRect() {}, setTransform() {}, fillRect() {}, fillText() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {}, save() {}, restore() {}, translate() {}, rotate() {} }; },
    setAttribute() {},
  };
  return el;
}

function setupBrowserContext() {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, createMockEl(id));
    return elements.get(id);
  };

  const body = createMockEl("body");
  const graphArea = createMockEl("graph-area");
  graphArea.querySelector = (sel) => (sel === ".output-placeholder" ? createMockEl("placeholder") : null);

  global.window = global;
  global.document = {
    getElementById: getEl,
    querySelector: (sel) => {
      if (sel === "#graph-area") return graphArea;
      if (sel === ".output-placeholder") return createMockEl("placeholder");
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => createMockEl(tag),
    body,
    addEventListener: () => {},
  };

  global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); },
  };

  global.XLSX = XLSX;
  global.currentCalcResults = null;

  for (const id of [
    "screen-home", "screen-analytical", "results-area", "graph-section", "graph-area",
    "chart-turnover", "chart-aging", "chart-concentration", "add-to-report-actions",
    "report-entries-area", "final-report-modal", "analysis-status", "run-analysis-btn",
    "procedure-checklist", "account-select", "preview-area", "selection-summary",
    "ar-criteria-panel", "ar-watch-display-limit",
  ]) {
    getEl(id);
  }

  vm.runInThisContext(fs.readFileSync(path.join(ROOT, "analytical-calc.js"), "utf8"));
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, "ar-analysis.js"), "utf8"));
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, "script.js"), "utf8"));
}

async function main() {
  setupBrowserContext();

  class MockFile {
    constructor(name, buf) {
      this.name = name;
      this._buf = buf;
    }
    async arrayBuffer() {
      return this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength);
    }
  }

  const csvPath = path.join(ROOT, "sample-data", "ar-risk-scenario-sample.csv");
  const dataset = await global.AnalyticalCalc.parseAnalyticalFile(new MockFile("sample.csv", fs.readFileSync(csvPath)));
  const criteria = {
    ...global.ArAnalysis.loadArCriteria(),
    allowanceRates: global.ArAnalysis.loadAllowanceRates(),
    companyRecordedAllowance: 26290000,
  };

  const calcResults = global.AnalyticalCalc.runAnalyticalCalculations(
    dataset,
    "매출채권",
    new Set(["variance", "turnover", "aging", "concentration", "relatedParty", "watchlist", "allowanceSim", "allowance"]),
    criteria
  );

  global.currentCalcResults = calcResults;
  const html = global.buildArAnalysisResultsHtml(calcResults);
  const cautions = global.buildKeyCautionItems(calcResults);

  const summaryCards = (html.match(/<article class="ar-summary-card">/g) || []).length;
  const watchCards = (html.match(/<article class="ar-watchlist-card">/g) || []).length;
  const checkboxes = (html.match(/class="ar-action-checkbox"/g) || []).length;
  const hasDetails = html.includes("ar-details-panel") && html.includes("상세 보기");
  const detailsBlock = html.match(/<details class="ar-details-panel">[\s\S]*<\/details>/)?.[0] || "";
  const tableInDetails = detailsBlock.includes("watchlist-scroll-wrap");
  const mainBeforeDetails = html.split('<details class="ar-details-panel">')[0] || "";
  const tableInMain = mainBeforeDetails.includes("watchlist-scroll-wrap");

  const checks = [
    ["핵심 분석 요약", html.includes("핵심 분석 요약")],
    ["요약 카드 4개", summaryCards === 4],
    ["핵심 주의사항", html.includes("핵심 주의사항")],
    ["주의사항 3~5개", cautions.length >= 3 && cautions.length <= 5],
    ["신호·근거·후속절차", html.includes("고려할 후속절차") && html.includes("ar-caution-signal")],
    ["주의 거래처 카드 5개", watchCards === 5],
    ["체크박스 25개(5×5)", checkboxes === 25],
    ["상세 보기 패널", hasDetails],
    ["전체 표는 상세 영역", tableInDetails && !tableInMain],
    ["추가 검토 표현", html.includes("추가 검토")],
  ];

  console.log("=== AR 결과 HTML 검증 ===");
  let pass = true;
  checks.forEach(([name, ok]) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
    if (!ok) pass = false;
  });

  console.log("\n핵심 주의사항:");
  cautions.forEach((c, i) => console.log(`  ${i + 1}. ${c.signal}`));

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
