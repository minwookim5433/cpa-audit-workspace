/**
 * html2pdf.js로 최종보고서 PDF 생성 테스트
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const calcPath = path.join(__dirname, "..", "analytical-calc.js");
const arPath = path.join(__dirname, "..", "ar-analysis.js");
const frPath = path.join(__dirname, "..", "final-report.js");
const csvPath = path.join(__dirname, "..", "sample-data", "ar-risk-scenario-sample.csv");
const html2pdfPath = path.join(__dirname, "..", "node_modules", "html2pdf.js", "dist", "html2pdf.bundle.min.js");
const outDir = path.join(__dirname, "..", "sample-output");

const ALL_AR_PROCEDURES = new Set([
  "variance",
  "turnover",
  "aging",
  "concentration",
  "relatedParty",
  "watchlist",
  "allowanceSim",
  "allowance",
]);

function verifyReportHtml(html) {
  const checks = [
    { name: "Executive Summary", ok: html.includes("Executive Summary") },
    { name: "요약 카드", ok: html.includes("fr-exec-cards") },
    { name: "핵심 관찰사항", ok: html.includes("핵심 관찰사항") },
    { name: "분석 목적 섹션", ok: html.includes("분석 목적 및 사용 데이터") },
    { name: "핵심 주의 거래처", ok: html.includes("핵심 주의 거래처") },
    { name: "부록 전체 거래처", ok: html.includes("거래처 집중도 — 전체 목록") },
    { name: "후속절차 섹션", ok: html.includes("감사인이 선택한 후속절차") },
    { name: "word-break keep-all", ok: html.includes("word-break: keep-all") },
  ];

  const concSection = html.match(/<h3>거래처 집중도<\/h3>[\s\S]*?(?=<section class="fr-section"><h3>핵심)/);
  const concRankedRows = concSection
    ? ((concSection[0].match(/fr-concentration-table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1]?.match(/<tr>/g) || []).length
    : 0;
  checks.push({ name: "본문 집중도 상위 10행", ok: concRankedRows === 10 });

  const appendixMatch = html.match(/거래처 집중도 — 전체 목록 \((\d+)개\)/);
  if (appendixMatch) {
    checks.push({ name: "부록 거래처 35개", ok: Number(appendixMatch[1]) === 35 });
  }

  const watchSection = html.match(/<h3>핵심 주의 거래처<\/h3>[\s\S]*?(?=<section class="fr-section"><h3>특수)/);
  const watchRows = watchSection
    ? ((watchSection[0].match(/fr-watchlist-table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1]?.match(/<tr>/g) || []).length
    : 0;
  checks.push({ name: "본문 주의 거래처 5행", ok: watchRows === 5 });

  return checks;
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch {
    console.error("puppeteer가 설치되지 않았습니다. 브라우저 수동 테스트가 필요합니다.");
    process.exit(2);
  }

  global.XLSX = XLSX;
  global.window = global;
  eval(fs.readFileSync(calcPath, "utf8"));
  eval(fs.readFileSync(arPath, "utf8"));
  eval(fs.readFileSync(frPath, "utf8"));

  class MockFile {
    constructor(name, buf) {
      this.name = name;
      this._buf = buf;
    }
    async arrayBuffer() {
      return this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength);
    }
  }

  const dataset = await global.AnalyticalCalc.parseAnalyticalFile(new MockFile("s.csv", fs.readFileSync(csvPath)));
  const accountName = "매출채권";
  const criteria = {
    ...global.ArAnalysis.loadArCriteria(),
    allowanceRates: global.ArAnalysis.loadAllowanceRates(),
  };
  const calcResults = global.AnalyticalCalc.runAnalyticalCalculations(
    dataset,
    accountName,
    ALL_AR_PROCEDURES,
    criteria
  );

  const entry = {
    id: "pdf-test",
    account: accountName,
    fileName: "ar-risk-scenario-sample.csv",
    procedureLabels: [
      "증감분석",
      "회전율·평균회수기간",
      "연령분석 (Aging)",
      "거래처 집중도",
      "특수관계자 분석",
      "주의 거래처 목록",
      "대손충당금 시뮬레이터",
      "대손충당금 검토 안내",
    ],
    savedAt: new Date().toISOString(),
    sourceData: {
      format: "ar",
      priorAmount: calcResults.accountData.priorAmount,
      currentAmount: calcResults.accountData.currentAmount,
      priorLabel: "전기기말잔액",
      currentLabel: "당기기말잔액",
    },
    criteria,
    items: calcResults.items,
  };

  const html = global.FinalReport.buildDocument([entry], {}, new Date().toISOString());
  const checks = verifyReportHtml(html);

  console.log("=== HTML 구조 검증 ===");
  let htmlOk = true;
  checks.forEach((c) => {
    console.log(`${c.ok ? "PASS" : "FAIL"} — ${c.name}`);
    if (!c.ok) htmlOk = false;
  });

  const observations = global.FinalReport.buildKeyObservations(entry);
  console.log("\n핵심 관찰사항 수:", observations.length, `(3~5 권장: ${observations.length >= 3 && observations.length <= 5 ? "PASS" : "CHECK"})`);
  observations.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.addScriptTag({ path: html2pdfPath });
  await page.waitForFunction("typeof html2pdf === 'function'");

  const stamp = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  })();

  const dataUri = await page.evaluate(async () => {
    const body = document.body;
    const worker = html2pdf().set({
      margin: [18, 15, 20, 15],
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: [".fr-exec-card", ".fr-chart"] },
    }).from(body);
    const pdf = await worker.toPdf().get("pdf");
    const total = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= total; i += 1) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      pdf.text(`${i} / ${total}`, w / 2, h - 6, { align: "center" });
    }
    return pdf.output("datauristring");
  });

  await browser.close();

  const base64 = dataUri.replace(/^data:application\/pdf;[^,]*,/, "");
  const pdfBuffer = Buffer.from(base64, "base64");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `Audit_Report_${stamp}.pdf`);
  fs.writeFileSync(outFile, pdfBuffer);

  const header = pdfBuffer.subarray(0, 4).toString("ascii");
  const pageCount = (pdfBuffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;

  console.log("\n=== PDF 생성 테스트 ===");
  console.log("파일:", outFile);
  console.log("크기:", pdfBuffer.length, "bytes");
  console.log("헤더:", header, header === "%PDF" ? "PASS" : "FAIL");
  console.log("페이지 수(추정):", pageCount);

  const pass = htmlOk && header === "%PDF" && pdfBuffer.length > 1000 && pageCount >= 2;
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
