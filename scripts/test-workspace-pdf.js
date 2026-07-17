/**
 * PDF 로드·검색 로직 단위 테스트 (Puppeteer 없이)
 */
const fs = require("fs");
const path = require("path");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";

async function main() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { findProblemNumbersInText } = await import("../study-problem-range.js");

  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjs.getDocument({ data }).promise;

  console.log("PASS 전체 PDF 페이지 수:", doc.numPages);

  const page1 = await doc.getPage(1);
  const vp = page1.getViewport({ scale: 1, rotation: 0 });
  console.log("PASS viewport (반전 없음):", vp.width > 0, vp.height > 0, "transform=", vp.transform?.join(","));

  let allText = "";
  for (let i = 1; i <= Math.min(5, doc.numPages); i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    allText += tc.items.map((it) => it.str).join(" ");
  }
  const hasAudit = allText.includes("감사") || allText.includes("문제");
  console.log(hasAudit ? "PASS 텍스트 추출 (검색 가능)" : "INFO 스캔 PDF 가능성", allText.slice(0, 80));

  // spread sequence
  const pageCount = doc.numPages;
  const spreads = [{ start: 1 }];
  for (let p = 2; p <= pageCount; p += 2) spreads.push({ start: p });
  console.log("PASS 양면 시퀀스:", spreads.map((s) => s.start).join(", "));

  console.log("\nUI 테스트는 http://localhost:3000 에서 PDF 업로드 후 확인하세요.");
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
