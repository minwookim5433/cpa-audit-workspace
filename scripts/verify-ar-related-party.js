/**
 * ar-analysis-sample.csv 특수관계자 / 비특수관계자 검산
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const calcPath = path.join(__dirname, "..", "analytical-calc.js");
const arPath = path.join(__dirname, "..", "ar-analysis.js");
const csvPath = path.join(__dirname, "..", "sample-data", "ar-analysis-sample.csv");

global.XLSX = XLSX;
global.window = global;
eval(fs.readFileSync(calcPath, "utf8"));
eval(fs.readFileSync(arPath, "utf8"));

const text = fs.readFileSync(csvPath, "utf8");
const wb = XLSX.read(text, { type: "string" });
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

const norm = (h) => String(h).trim().replace(/\s+/g, "");
const keys = Object.keys(raw[0]);
const map = Object.fromEntries(keys.map((k) => [norm(k), k]));

const arRows = raw.filter((r) => String(r[map["계정과목"]]).trim() === "매출채권");

function isRelated(val) {
  const s = String(val).trim().toLowerCase();
  return ["y", "yes", "true", "1", "예", "특수관계자", "특수관계"].includes(s);
}

function agingIsOver90(raw) {
  return global.AnalyticalCalc.normalizeAgingBucket(raw) === "over90";
}

function sumGroup(rows) {
  const n = (field) => rows.reduce((s, r) => s + Number(String(r[map[field]]).replace(/,/g, "")), 0);
  const priorOpen = n("전기기초잔액");
  const priorClose = n("전기기말잔액");
  const curOpen = n("당기기초잔액");
  const curClose = n("당기기말잔액");
  const priorSales = n("전기매출액");
  const curSales = n("당기매출액");
  const priorAvg = (priorOpen + priorClose) / 2;
  const curAvg = (curOpen + curClose) / 2;
  const curTurn = curSales / curAvg;
  const curDays = 365 / curTurn;
  let over90 = 0;
  const customers = new Map();
  for (const r of rows) {
    const close = Number(String(r[map["당기기말잔액"]]).replace(/,/g, ""));
    const cust = String(r[map["거래처"]]).trim();
    customers.set(cust, (customers.get(cust) || 0) + close);
    if (agingIsOver90(r[map["만기구간"]])) over90 += close;
  }
  const top = [...customers.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    currentClosing: curClose,
    priorAvgAR: priorAvg,
    currentAvgAR: curAvg,
    currentTurnover: curTurn,
    currentCollectionDays: curDays,
    over90Amount: over90,
    topCustomer: top ? { name: top[0], amount: top[1] } : null,
    rowCount: rows.length,
  };
}

const totalAR = sumGroup(arRows).currentClosing;
const relatedRows = arRows.filter((r) => isRelated(r[map["특수관계자여부"]]));
const nonRelatedRows = arRows.filter((r) => !isRelated(r[map["특수관계자여부"]]));

const manualRelated = sumGroup(relatedRows);
const manualNonRelated = sumGroup(nonRelatedRows);
manualRelated.ratio = (manualRelated.currentClosing / totalAR) * 100;
manualNonRelated.ratio = (manualNonRelated.currentClosing / totalAR) * 100;
manualRelated.over90Ratio = (manualRelated.over90Amount / totalAR) * 100;
manualNonRelated.over90Ratio = (manualNonRelated.over90Amount / totalAR) * 100;

console.log("=== 수동 검산 (특수관계자 / 비특수관계자) ===");
console.log("전체 당기기말:", totalAR);
console.log("특수 거래처 수:", relatedRows.length, "비특수:", nonRelatedRows.length);
console.log("\n[특수관계자]");
console.log("당기기말:", manualRelated.currentClosing.toFixed(2));
console.log("비중 %:", manualRelated.ratio.toFixed(4));
console.log("평균매출채권:", manualRelated.currentAvgAR.toFixed(2));
console.log("회전율:", manualRelated.currentTurnover.toFixed(4));
console.log("회수기간:", manualRelated.currentCollectionDays.toFixed(2));
console.log("90일초과:", manualRelated.over90Amount.toFixed(2), manualRelated.over90Ratio.toFixed(4) + "%");
console.log("상위:", manualRelated.topCustomer);

console.log("\n[비특수관계자]");
console.log("당기기말:", manualNonRelated.currentClosing.toFixed(2));
console.log("비중 %:", manualNonRelated.ratio.toFixed(4));
console.log("평균매출채권:", manualNonRelated.currentAvgAR.toFixed(2));
console.log("회전율:", manualNonRelated.currentTurnover.toFixed(4));
console.log("회수기간:", manualNonRelated.currentCollectionDays.toFixed(2));
console.log("90일초과:", manualNonRelated.over90Amount.toFixed(2), manualNonRelated.over90Ratio.toFixed(4) + "%");
console.log("상위:", manualNonRelated.topCustomer);

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
  const account = dataset.accounts.find((a) => a.account === "매출채권");
  const criteria = global.ArAnalysis.loadArCriteria();
  const result = global.ArAnalysis.calculateRelatedPartyAnalysis(account, criteria);

  console.log("\n=== 앱 계산 결과 ===");
  const r = result.related;
  const n = result.nonRelated;
  console.log("[특수] 기말:", r.currentClosing, "비중:", r.ratio?.toFixed(4));
  console.log("[특수] 평균AR:", r.currentAvgAR?.toFixed(2), "회전율:", r.currentTurnover?.toFixed(4), "회수:", r.currentCollectionDays?.toFixed(2));
  console.log("[특수] 90일초과:", r.over90Amount, r.over90Ratio?.toFixed(4) + "%");
  console.log("[비특수] 기말:", n.currentClosing, "비중:", n.ratio?.toFixed(4));
  console.log("[비특수] 평균AR:", n.currentAvgAR?.toFixed(2), "회전율:", n.currentTurnover?.toFixed(4), "회수:", n.currentCollectionDays?.toFixed(2));
  console.log("경고:", result.warnings.map((w) => w.message).join(" | "));

  const tol = 0.02;
  const ok =
    Math.abs(r.currentClosing - manualRelated.currentClosing) < tol &&
    Math.abs(r.ratio - manualRelated.ratio) < tol &&
    Math.abs(r.currentAvgAR - manualRelated.currentAvgAR) < tol &&
    Math.abs(r.currentTurnover - manualRelated.currentTurnover) < 0.0001 &&
    Math.abs(r.currentCollectionDays - manualRelated.currentCollectionDays) < tol &&
    Math.abs(n.currentClosing - manualNonRelated.currentClosing) < tol &&
    Math.abs(n.ratio - manualNonRelated.ratio) < tol &&
    Math.abs(n.currentAvgAR - manualNonRelated.currentAvgAR) < tol &&
    Math.abs(n.currentTurnover - manualNonRelated.currentTurnover) < 0.0001 &&
    Math.abs(n.currentCollectionDays - manualNonRelated.currentCollectionDays) < tol &&
    Math.abs(r.over90Amount - manualRelated.over90Amount) < tol &&
    Math.abs(n.over90Amount - manualNonRelated.over90Amount) < tol;

  console.log(ok ? "\n✓ PASS — 특수/비특수 검산 일치" : "\n✗ FAIL — 불일치");
  process.exit(ok ? 0 : 1);
})();
