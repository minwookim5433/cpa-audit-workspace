/**
 * ar-analysis-sample.csv — 주의 거래처·대손충당금 시뮬레이터 검산
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
const num = (v) => Number(String(v).replace(/,/g, "")) || 0;

const totalAR = arRows.reduce((s, r) => s + num(r[map["당기기말잔액"]]), 0);
const totalSales = arRows.reduce((s, r) => s + num(r[map["당기매출액"]]), 0);

const criteria = global.ArAnalysis.DEFAULT_AR_CRITERIA;
const rates = global.ArAnalysis.DEFAULT_ALLOWANCE_RATES;

function isRelated(val) {
  const s = String(val).trim().toLowerCase();
  return ["y", "yes", "true", "1", "예", "특수관계자", "특수관계"].includes(s);
}

function manualWatchlistCount() {
  let count = 0;
  for (const r of arRows) {
    const collectionDays = num(r[map["회수일수"]]);
    const closing = num(r[map["당기기말잔액"]]);
    const sales = num(r[map["당기매출액"]]);
    const priorClose = num(r[map["전기기말잔액"]]);
    const arRatio = (closing / totalAR) * 100;
    const salesShare = (sales / totalSales) * 100;
    const arToSales = sales ? (closing / sales) * 100 : null;
    const balanceInc = priorClose ? ((closing - priorClose) / priorClose) * 100 : null;
    const bucket = global.AnalyticalCalc.normalizeAgingBucket(r[map["만기구간"]]);
    const hit =
      collectionDays > criteria.watchlistCollectionDays ||
      arRatio >= criteria.watchlistArRatioPercent ||
      salesShare >= criteria.watchlistSalesRatioPercent ||
      bucket === "over90" ||
      collectionDays >= criteria.watchlistOverdueDays ||
      isRelated(r[map["특수관계자여부"]]) ||
      (balanceInc !== null && balanceInc >= criteria.watchlistBalanceIncreasePercent) ||
      (arToSales !== null && arToSales >= criteria.watchlistArToSalesRatioPercent);
    if (hit) count += 1;
  }
  return count;
}

function manualAllowanceTotal() {
  const bucketAmounts = { normal: 0, within30: 0, "31to60": 0, "61to90": 0, over90: 0 };
  for (const r of arRows) {
    const closing = num(r[map["당기기말잔액"]]);
    const bucket = global.AnalyticalCalc.normalizeAgingBucket(r[map["만기구간"]]);
    if (bucket && bucketAmounts[bucket] !== undefined) bucketAmounts[bucket] += closing;
  }
  let total = 0;
  for (const [id, amount] of Object.entries(bucketAmounts)) {
    total += (amount * rates[id]) / 100;
  }
  return { bucketAmounts, total };
}

const manualWatch = manualWatchlistCount();
const manualAllow = manualAllowanceTotal();

console.log("=== 수동 검산 ===");
console.log("주의 거래처 수:", manualWatch);
console.log("구간별 잔액:", manualAllow.bucketAmounts);
console.log("총 추정 충당금:", manualAllow.total.toFixed(2));

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

  const watch = global.ArAnalysis.calculateWatchlistCustomers(account, criteria);
  const sim = global.ArAnalysis.calculateAllowanceSimulator(account, rates, null);

  console.log("\n=== 앱 계산 결과 ===");
  console.log("주의 거래처 수:", watch.watchlistCount);
  console.log("총 추정 충당금:", sim.totalEstimatedAllowance);
  for (const b of sim.buckets) {
    console.log(`  ${b.label}: ${b.amount} × ${b.ratePercent}% = ${b.allowance}`);
  }

  const watchOk = watch.watchlistCount === manualWatch;
  const allowOk = Math.abs(sim.totalEstimatedAllowance - manualAllow.total) < 0.02;
  const bucketOk = sim.buckets.every((b) => {
    const manualAmt = manualAllow.bucketAmounts[b.id] || 0;
    return Math.abs(b.amount - manualAmt) < 0.02;
  });

  console.log(watchOk && allowOk && bucketOk ? "\n✓ PASS" : "\n✗ FAIL", {
    watchOk,
    allowOk,
    bucketOk,
  });
  process.exit(watchOk && allowOk && bucketOk ? 0 : 1);
})();
