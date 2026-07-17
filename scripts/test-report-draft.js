/**
 * 매출채권 보고서 초안 API 테스트
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const calcPath = path.join(__dirname, "..", "analytical-calc.js");
const csvPath = path.join(__dirname, "..", "sample-data", "ar-analysis-sample.csv");

global.XLSX = XLSX;
global.window = global;
eval(fs.readFileSync(calcPath, "utf8"));

function buildFacts(calcResults, meta) {
  const findItem = (type) => calcResults.items.find((i) => i.type === type) || null;
  const variance = findItem("variance");
  const composition = findItem("composition");
  const turnover = findItem("turnover");
  const aging = findItem("aging");
  const concentration = findItem("concentration");

  return {
    account: calcResults.account,
    fileName: meta.fileName,
    savedAt: new Date().toISOString(),
    auditorMemo: "회수 지연 거래처 추가 확인 예정",
    procedures: meta.procedureLabels,
    unavailableProcedures: [],
    balances: {
      priorLabel: "전기기말잔액 합계",
      currentLabel: "당기기말잔액 합계",
      priorAmount: calcResults.accountData.priorAmount,
      currentAmount: calcResults.accountData.currentAmount,
      rowCount: calcResults.accountData.rowCount,
    },
    variance: variance?.ok
      ? {
          priorAmount: variance.priorAmount,
          currentAmount: variance.currentAmount,
          changeAmount: variance.changeAmount,
          changeRatePercent: variance.changeRate,
          calculated: true,
        }
      : null,
    composition: composition?.ok
      ? {
          currentAmount: composition.currentAmount,
          totalCurrentAmount: composition.totalCurrentAmount,
          compositionRatioPercent: composition.compositionRatio,
          calculated: true,
        }
      : null,
    turnover: turnover?.ok
      ? {
          priorTurnover: turnover.priorTurnover,
          currentTurnover: turnover.currentTurnover,
          priorCollectionDays: turnover.priorCollectionDays,
          currentCollectionDays: turnover.currentCollectionDays,
        }
      : null,
    aging: aging?.ok
      ? {
          totalAR: aging.totalAR,
          buckets: aging.buckets.map((b) => ({ label: b.label, amount: b.amount, ratioPercent: b.ratio })),
          over90Amount: aging.over90Amount,
          over90RatioPercent: aging.over90Ratio,
        }
      : null,
    concentration: concentration?.ok
      ? {
          top1RatioPercent: concentration.top1Ratio,
          top3RatioPercent: concentration.top3Ratio,
          top5RatioPercent: concentration.top5Ratio,
          relatedRatioPercent: concentration.relatedRatio,
          top5Customers: concentration.ranked.slice(0, 5),
        }
      : null,
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
  const procedures = new Set(["variance", "composition", "turnover", "aging", "concentration"]);
  const calc = global.AnalyticalCalc.runAnalyticalCalculations(dataset, "매출채권", procedures);
  const facts = buildFacts(calc, {
    fileName: dataset.fileName,
    procedureLabels: ["증감분석", "구성비분석", "회전율·평균회수기간", "연령분석 (Aging)", "거래처 집중도"],
  });

  const res = await fetch("http://localhost:3000/api/analytical-report-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("API 오류:", data.error);
    process.exit(1);
  }

  const draft = data.draft || "";
  const sections = [
    "분석 목적",
    "사용한 데이터",
    "수행한 분석적 절차",
    "주요 계산 결과",
    "관찰된 특이사항",
    "추가 확인이 필요한 사항",
    "결론 초안",
  ];
  const missing = sections.filter((s) => !draft.includes(s));

  console.log("=== 보고서 초안 API 테스트 ===");
  console.log("응답 길이:", draft.length);
  console.log("필수 섹션 누락:", missing.length ? missing.join(", ") : "없음");
  console.log("\n--- 초안 미리보기 (앞 800자) ---\n");
  console.log(draft.slice(0, 800));

  const edited = `${draft}\n\n[감사인 수정] 후속 확인 절차를 수행할 예정입니다.`;
  const storage = { reportDraft: edited, reportDraftGeneratedAt: new Date().toISOString() };
  const roundTrip = JSON.parse(JSON.stringify(storage));

  const ok = missing.length === 0 && draft.length > 200 && roundTrip.reportDraft.includes("[감사인 수정]");
  console.log("\n검산 일치:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
})();
