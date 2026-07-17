/**
 * ar-risk-scenario-sample.csv — 점수 기반 주의거래처·시나리오 검증
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const calcPath = path.join(__dirname, "..", "analytical-calc.js");
const arPath = path.join(__dirname, "..", "ar-analysis.js");
const csvPath = path.join(__dirname, "..", "sample-data", "ar-risk-scenario-sample.csv");

global.XLSX = XLSX;
global.window = global;
eval(fs.readFileSync(calcPath, "utf8"));
eval(fs.readFileSync(arPath, "utf8"));

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

  const file = new MockFile("ar-risk-scenario-sample.csv", fs.readFileSync(csvPath));
  const dataset = await global.AnalyticalCalc.parseAnalyticalFile(file);
  const account = dataset.accounts.find((a) => a.account === "매출채권");

  const criteria = {
    ...global.ArAnalysis.loadArCriteria(),
    allowanceRates: global.ArAnalysis.loadAllowanceRates(),
  };

  const watch = global.ArAnalysis.calculateWatchlistCustomers(account, criteria);
  const related = global.ArAnalysis.calculateRelatedPartyAnalysis(account, criteria);
  const sim = global.ArAnalysis.calculateAllowanceSimulator(account, criteria.allowanceRates, null);

  const core5 = watch.eligibleCustomers.slice(0, 5);
  const relatedInCore5 = core5.filter((c) => c.relatedParty).length;
  const normalOrObs = watch.normalCount + watch.observationCount;
  const normalOrObsPct = (normalOrObs / watch.totalCustomers) * 100;
  const eligiblePct = (watch.eligibleCount / watch.totalCustomers) * 100;

  const relatedDays = related.related?.currentCollectionDays;
  const nonRelatedDays = related.nonRelated?.currentCollectionDays;
  const daysOk = relatedDays !== null && nonRelatedDays !== null && relatedDays > nonRelatedDays;
  const core5Ok = relatedInCore5 >= 3;
  const normalOk = normalOrObsPct >= 80;
  const notMostlyWatch = eligiblePct < 50;

  console.log("=== ar-risk-scenario-sample.csv 검증 (점수 기반) ===\n");
  console.log("거래처 수:", watch.totalCustomers);
  console.log("수행중요성:", criteria.performanceMaterialityAmount?.toLocaleString(), "원");
  console.log("거래처 중요성 비율:", criteria.customerMaterialityRatioPercent, "%");
  console.log("주의 최소 점수:", criteria.watchlistMinScore, "점\n");

  console.log("[분류]");
  console.log(`  정상: ${watch.normalCount}개`);
  console.log(`  일반관찰: ${watch.observationCount}개`);
  console.log(`  주의대상(점수≥${criteria.watchlistMinScore}): ${watch.eligibleCount}개 (${eligiblePct.toFixed(1)}%)`);
  console.log(`  정상·일반관찰 비율: ${normalOrObsPct.toFixed(1)}% (${normalOrObs}/${watch.totalCustomers})\n`);

  console.log("[집계 평균회수기간 — 특수관계자 분석]");
  console.log(`  특수관계자: ${relatedDays !== null ? relatedDays.toFixed(1) : "—"}일`);
  console.log(`  비특수관계자: ${nonRelatedDays !== null ? nonRelatedDays.toFixed(1) : "—"}일`);
  console.log(`  격차: ${related.diff?.daysDiff !== null ? related.diff.daysDiff.toFixed(1) : "—"}일\n`);

  console.log("[핵심 주의대상 상위 5개]");
  for (const c of core5) {
    console.log(
      `  - ${c.customer} | 특수:${c.relatedParty ? "Y" : "N"} | 점수:${c.riskScore} | 당기말:${c.currentClosing.toLocaleString()} | 비중:${c.arRatioPercent?.toFixed(2)}% | 회수:${c.collectionDays}일`
    );
  }
  console.log(`  상위 5 중 특수관계자: ${relatedInCore5}개\n`);

  console.log("[대손충당금]");
  console.log(`  회사 계상 합계: ${sim.companyRecordedAllowance?.toLocaleString() ?? "—"}`);
  console.log(`  추정 충당금: ${sim.totalEstimatedAllowance?.toLocaleString()}`);
  console.log(`  차이(추정-회사): ${sim.difference !== null ? sim.difference.toLocaleString() : "—"}\n`);

  console.log("[검증 조건]");
  console.log(`  1. 특수 평균회수 > 비특수: ${daysOk ? "PASS" : "FAIL"} (${relatedDays?.toFixed(1)} > ${nonRelatedDays?.toFixed(1)})`);
  console.log(`  2. 핵심 5개 중 특수 ≥3: ${core5Ok ? "PASS" : "FAIL"} (${relatedInCore5}/5)`);
  console.log(`  3. 정상·일반관찰 ≥80%: ${normalOk ? "PASS" : "FAIL"} (${normalOrObsPct.toFixed(1)}%)`);
  console.log(`  4. 주의대상이 전체 대부분 아님(<50%): ${notMostlyWatch ? "PASS" : "FAIL"} (주의 ${eligiblePct.toFixed(1)}%)`);

  const ok = daysOk && core5Ok && normalOk && notMostlyWatch;
  console.log(ok ? "\n✓ PASS" : "\n✗ FAIL");
  process.exit(ok ? 0 : 1);
})();
