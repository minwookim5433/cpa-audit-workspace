/**
 * 감사 리스크 시나리오 샘플 — ar-risk-scenario-sample.csv (35 거래처, 특수관계자 5)
 * 집계 회전율 기반 평균회수기간: 특수 > 비특수, 주의대상 소수, 핵심 5개 중 특수 3+
 */
const fs = require("fs");
const path = require("path");

const header =
  "계정과목,거래처,전기기초잔액,전기기말잔액,당기기초잔액,당기기말잔액,전기매출액,당기매출액,만기구간,회수일수,특수관계자 여부,회사적용충당률,회사계상대손충당금";

function row(r) {
  const allowance =
    r.companyRate != null && r.companyRate !== ""
      ? Math.round(r.curClose * (Number(r.companyRate) / 100))
      : "";
  return [
    "매출채권",
    r.customer,
    r.priorOpen,
    r.priorClose,
    r.curOpen,
    r.curClose,
    r.priorSales,
    r.curSales,
    r.aging,
    r.days,
    r.related,
    r.companyRate ?? "",
    allowance,
  ].join(",");
}

const rows = [];

// --- 특수관계자 5개 (3개 고위험 + 2개 경미) ---
rows.push(
  {
    customer: "(주)알파특수",
    priorOpen: 420000000,
    priorClose: 480000000,
    curOpen: 480000000,
    curClose: 1200000000,
    priorSales: 380000000,
    curSales: 420000000,
    aging: "180일초과",
    days: 205,
    related: "Y",
    companyRate: 0.5,
  },
  {
    customer: "(주)베타관계",
    priorOpen: 350000000,
    priorClose: 400000000,
    curOpen: 400000000,
    curClose: 920000000,
    priorSales: 320000000,
    curSales: 360000000,
    aging: "90일 초과",
    days: 188,
    related: "Y",
    companyRate: 0.3,
  },
  {
    customer: "(주)감마연결",
    priorOpen: 650000000,
    priorClose: 720000000,
    curOpen: 720000000,
    curClose: 2100000000,
    priorSales: 780000000,
    curSales: 850000000,
    aging: "180일초과",
    days: 262,
    related: "Y",
    companyRate: 0,
  },
  {
    customer: "L특수지주",
    priorOpen: 42000000,
    priorClose: 45000000,
    curOpen: 45000000,
    curClose: 48000000,
    priorSales: 380000000,
    curSales: 420000000,
    aging: "31-60일",
    days: 48,
    related: "Y",
    companyRate: 1,
  },
  {
    customer: "M계열사",
    priorOpen: 38000000,
    priorClose: 40000000,
    curOpen: 40000000,
    curClose: 42000000,
    priorSales: 350000000,
    curSales: 390000000,
    aging: "정상",
    days: 42,
    related: "Y",
    companyRate: 0,
  }
);

// --- 비특수: 주의 대상 3개 ---
rows.push(
  {
    customer: "고액연체상사",
    priorOpen: 180000000,
    priorClose: 200000000,
    curOpen: 200000000,
    curClose: 420000000,
    priorSales: 280000000,
    curSales: 310000000,
    aging: "180일초과",
    days: 168,
    related: "N",
    companyRate: 1,
  },
  {
    customer: "장기미회수물류",
    priorOpen: 120000000,
    priorClose: 130000000,
    curOpen: 130000000,
    curClose: 280000000,
    priorSales: 220000000,
    curSales: 240000000,
    aging: "90일 초과",
    days: 135,
    related: "N",
    companyRate: 2,
  },
  {
    customer: "집중도대형",
    priorOpen: 175000000,
    priorClose: 190000000,
    curOpen: 190000000,
    curClose: 250000000,
    priorSales: 680000000,
    curSales: 720000000,
    aging: "31-60일",
    days: 58,
    related: "N",
    companyRate: 1,
  }
);

// --- 비특수: 정상 27개 (회수 30~70일, 매출 대비 채권 낮음) ---
const normalNames = [
  "동방유통", "서울전자", "한빛산업", "대한물류", "성신테크", "미래식품", "청운건설", "세영화학",
  "우림바이오", "신한모터", "경동철강", "한성에너지", "삼호디스플", "일진반도체", "넥스소프트",
  "태평물산", "현대엔지니", "국제파트너", "글로벌트레이드", "중앙상사", "남부유통", "북부전자",
  "강원산업", "전남물류", "충북테크", "제주식품", "인천건설",
];

const normalAging = ["정상", "30일이내", "31-60일", "정상", "30일이내"];
normalNames.forEach((name, i) => {
  const curClose = 65000000 + i * 2500000;
  const priorClose = Math.round(curClose * 0.97);
  const sales = Math.round(curClose * (6.2 + (i % 4) * 0.4));
  const days = 32 + (i % 6) * 4;
  const aging = normalAging[i % normalAging.length];
  let companyRate = 0;
  if (aging === "31-60일") companyRate = 1;
  else if (aging === "61-90일") companyRate = 3;
  rows.push({
    customer: name,
    priorOpen: Math.round(priorClose * 0.96),
    priorClose,
    curOpen: priorClose,
    curClose,
    priorSales: Math.round(sales * 0.94),
    curSales: sales,
    aging,
    days,
    related: "N",
    companyRate,
  });
});

const lines = [header, ...rows.map(row)];
const out = path.join(__dirname, "..", "sample-data", "ar-risk-scenario-sample.csv");
fs.writeFileSync(out, "\uFEFF" + lines.join("\n"), "utf8");

function groupMetrics(groupRows) {
  let priorOpen = 0;
  let priorClose = 0;
  let curOpen = 0;
  let curClose = 0;
  let sales = 0;
  for (const r of groupRows) {
    priorOpen += r.priorOpen;
    priorClose += r.priorClose;
    curOpen += r.curOpen;
    curClose += r.curClose;
    sales += r.curSales;
  }
  const avgAR = (curOpen + curClose) / 2;
  const turnover = avgAR > 0 ? sales / avgAR : 0;
  const collectionDays = turnover > 0 ? 365 / turnover : null;
  return { curClose, sales, avgAR, turnover, collectionDays };
}

const relatedRows = rows.filter((r) => r.related === "Y");
const nonRelatedRows = rows.filter((r) => r.related === "N");
const relatedM = groupMetrics(relatedRows);
const nonRelatedM = groupMetrics(nonRelatedRows);

console.log(`Wrote ${out}`);
console.log(`거래처 ${rows.length}개, 특수관계자 ${relatedRows.length}개`);
console.log("\n[생성 시 집계 회수기간 검증]");
console.log(`  특수관계자: ${relatedM.collectionDays?.toFixed(1)}일 (매출 ${relatedM.sales.toLocaleString()} / 평균채권 ${relatedM.avgAR.toLocaleString()})`);
console.log(`  비특수관계자: ${nonRelatedM.collectionDays?.toFixed(1)}일`);
console.log(
  relatedM.collectionDays > nonRelatedM.collectionDays
    ? "  ✓ 특수 > 비특수 (생성 단계)"
    : "  ✗ 특수 ≤ 비특수 — 데이터 조정 필요"
);
