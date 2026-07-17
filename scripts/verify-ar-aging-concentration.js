/**
 * ar-analysis-sample.csv Aging·거래처 집중도 검산 스크립트
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const calcPath = path.join(__dirname, "..", "analytical-calc.js");
const csvPath = path.join(__dirname, "..", "sample-data", "ar-analysis-sample.csv");

global.XLSX = XLSX;
global.window = global;
eval(fs.readFileSync(calcPath, "utf8"));

const text = fs.readFileSync(csvPath, "utf8");
const wb = XLSX.read(text, { type: "string" });
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

const norm = (h) => String(h).trim().replace(/\s+/g, "");
const keys = Object.keys(raw[0]);
const map = Object.fromEntries(keys.map((k) => [norm(k), k]));

const arRows = raw.filter((r) => String(r[map["계정과목"]]).trim() === "매출채권");
const num = (v) => Number(String(v).replace(/,/g, ""));

const totalAR = arRows.reduce((s, r) => s + num(r[map["당기기말잔액"]]), 0);

const bucketLabels = {
  normal: "정상",
  within30: "30일 이하",
  "31to60": "31~60일",
  "61to90": "61~90일",
  over90: "90일 초과",
};

const manualBuckets = {};
for (const id of Object.keys(bucketLabels)) manualBuckets[id] = 0;

for (const r of arRows) {
  const closing = num(r[map["당기기말잔액"]]);
  const bucketId = global.AnalyticalCalc.normalizeAgingBucket(r[map["만기구간"]]);
  if (bucketId) manualBuckets[bucketId] += closing;
}

const over90Manual = manualBuckets.over90;
const over90RatioManual = (over90Manual / totalAR) * 100;

const customers = arRows
  .map((r) => ({
    customer: String(r[map["거래처"]]).trim(),
    amount: num(r[map["당기기말잔액"]]),
    related: global.AnalyticalCalc.isRelatedParty(r[map[norm("특수관계자 여부")]]),
  }))
  .sort((a, b) => b.amount - a.amount);

const top1Manual = customers[0]?.amount || 0;
const top3Manual = customers.slice(0, 3).reduce((s, c) => s + c.amount, 0);
const top5Manual = customers.slice(0, 5).reduce((s, c) => s + c.amount, 0);
const relatedManual = customers.filter((c) => c.related).reduce((s, c) => s + c.amount, 0);

console.log("=== 수동 검산 (Aging) ===");
console.log("당기기말잔액 합계:", totalAR);
for (const [id, label] of Object.entries(bucketLabels)) {
  const amt = manualBuckets[id];
  console.log(`${label}: ${amt.toFixed(0)} (${((amt / totalAR) * 100).toFixed(2)}%)`);
}
console.log("90일 초과:", over90Manual.toFixed(0), `(${over90RatioManual.toFixed(2)}%)`);

console.log("\n=== 수동 검산 (거래처 집중도) ===");
console.log("상위 1개:", top1Manual, `(${((top1Manual / totalAR) * 100).toFixed(2)}%)`);
console.log("상위 3개:", top3Manual, `(${((top3Manual / totalAR) * 100).toFixed(2)}%)`);
console.log("상위 5개:", top5Manual, `(${((top5Manual / totalAR) * 100).toFixed(2)}%)`);
console.log("특수관계자:", relatedManual, `(${((relatedManual / totalAR) * 100).toFixed(2)}%)`);
console.log("1위 거래처:", customers[0]?.customer, customers[0]?.amount);

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
  const result = global.AnalyticalCalc.runAnalyticalCalculations(
    dataset,
    "매출채권",
    new Set(["aging", "concentration"])
  );

  const aging = result.items.find((i) => i.type === "aging");
  const conc = result.items.find((i) => i.type === "concentration");

  console.log("\n=== 앱 계산 결과 (Aging) ===");
  for (const b of aging.buckets) {
    console.log(`${b.label}: ${b.amount} (${b.ratio?.toFixed(2)}%)`);
  }
  console.log("90일 초과:", aging.over90Amount, `(${aging.over90Ratio?.toFixed(2)}%)`);

  console.log("\n=== 앱 계산 결과 (집중도) ===");
  console.log("상위 1개:", conc.top1Amount, `(${conc.top1Ratio?.toFixed(2)}%)`);
  console.log("상위 3개:", conc.top3Amount, `(${conc.top3Ratio?.toFixed(2)}%)`);
  console.log("상위 5개:", conc.top5Amount, `(${conc.top5Ratio?.toFixed(2)}%)`);
  console.log("특수관계자:", conc.relatedAmount, `(${conc.relatedRatio?.toFixed(2)}%)`);
  console.log("1위 거래처:", conc.ranked[0]?.customer, conc.ranked[0]?.amount);

  const near = (a, b, tol = 0.01) => Math.abs(a - b) < tol;
  const ok =
    near(aging.totalAR, totalAR) &&
    near(aging.over90Amount, over90Manual) &&
    near(aging.over90Ratio, over90RatioManual) &&
    aging.buckets.every((b) => near(b.amount, manualBuckets[b.id])) &&
    near(conc.top1Amount, top1Manual) &&
    near(conc.top3Amount, top3Manual) &&
    near(conc.top5Amount, top5Manual) &&
    near(conc.relatedAmount, relatedManual) &&
    conc.ranked[0]?.customer === customers[0]?.customer;

  console.log("\n검산 일치:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
})();
