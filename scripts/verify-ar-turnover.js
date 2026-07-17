/**
 * ar-analysis-sample.csv 회전율 검산 스크립트
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const calcPath = path.join(__dirname, "..", "analytical-calc.js");
const csvPath = path.join(__dirname, "..", "sample-data", "ar-analysis-sample.csv");

global.XLSX = XLSX;
global.window = global;
const code = fs.readFileSync(calcPath, "utf8");
eval(code);

const text = fs.readFileSync(csvPath, "utf8");
const wb = XLSX.read(text, { type: "string" });
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

const norm = (h) => String(h).trim().replace(/\s+/g, "");
const keys = Object.keys(raw[0]);
const map = Object.fromEntries(keys.map((k) => [norm(k), k]));

const arRows = raw.filter((r) => String(r[map["계정과목"]]).trim() === "매출채권");

const sum = (field) => arRows.reduce((s, r) => s + Number(String(r[map[field]]).replace(/,/g, "")), 0);

const priorOpen = sum("전기기초잔액");
const priorClose = sum("전기기말잔액");
const curOpen = sum("당기기초잔액");
const curClose = sum("당기기말잔액");
const priorSales = sum("전기매출액");
const curSales = sum("당기매출액");

const priorAvg = (priorOpen + priorClose) / 2;
const curAvg = (curOpen + curClose) / 2;
const priorTurn = priorSales / priorAvg;
const curTurn = curSales / curAvg;
const priorDays = 365 / priorTurn;
const curDays = 365 / curTurn;

console.log("=== 수동 검산 (매출채권 35개 거래처 합산) ===");
console.log("전기기초/기말:", priorOpen, priorClose);
console.log("당기기초/기말:", curOpen, curClose);
console.log("전기/당기 매출:", priorSales, curSales);
console.log("전기 평균매출채권:", priorAvg.toFixed(2));
console.log("당기 평균매출채권:", curAvg.toFixed(2));
console.log("전기 회전율:", priorTurn.toFixed(4));
console.log("당기 회전율:", curTurn.toFixed(4));
console.log("전기 평균회수기간:", priorDays.toFixed(2), "일");
console.log("당기 평균회수기간:", curDays.toFixed(2), "일");
console.log("회전율 변화:", (curTurn - priorTurn).toFixed(4));
console.log("회수기간 변화:", (curDays - priorDays).toFixed(2), "일");

// App calc via parse pipeline
(async () => {
  class MockFile {
    constructor(name, buf) { this.name = name; this._buf = buf; }
    async arrayBuffer() { return this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength); }
  }
  const file = new MockFile("ar-analysis-sample.csv", fs.readFileSync(csvPath));
  const dataset = await global.AnalyticalCalc.parseAnalyticalFile(file);
  const account = dataset.accounts.find((a) => a.account === "매출채권");
  const result = global.AnalyticalCalc.runAnalyticalCalculations(
    dataset,
    "매출채권",
    new Set(["turnover", "variance", "composition"])
  );
  const t = result.items.find((i) => i.type === "turnover");
  console.log("\n=== 앱 계산 결과 ===");
  console.log("전기 평균매출채권:", t.priorAvgAR);
  console.log("당기 평균매출채권:", t.currentAvgAR);
  console.log("전기 회전율:", t.priorTurnover?.toFixed(4));
  console.log("당기 회전율:", t.currentTurnover?.toFixed(4));
  console.log("전기 평균회수기간:", t.priorCollectionDays?.toFixed(2));
  console.log("당기 평균회수기간:", t.currentCollectionDays?.toFixed(2));
  console.log("거래처 행 수:", account.rowCount);

  const ok =
    Math.abs(t.priorAvgAR - priorAvg) < 0.01 &&
    Math.abs(t.currentAvgAR - curAvg) < 0.01 &&
    Math.abs(t.priorTurnover - priorTurn) < 0.0001 &&
    Math.abs(t.currentTurnover - curTurn) < 0.0001;
  console.log("\n검산 일치:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
})();
