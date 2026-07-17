/**
 * 답안지 PDF 저장 검증
 */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const results = [];

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const outDir = path.join(__dirname, "..", "sample-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    const client = await page.createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: outDir,
    });

    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 20000 });
    await page.evaluate(async () => {
      localStorage.removeItem("cpa-workspace-session");
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      await new Promise((r) => { req.onsuccess = r; req.onerror = r; req.onblocked = r; });
    });
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);

    const input = await page.$("#ws-pdf-input");
    await input.uploadFile(PDF_PATH);
    await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
    await sleep(1200);

    await page.click(".answer-doc-editor");
    await page.keyboard.type("감사인은 ① 내부통제를 검토하였다.", { delay: 20 });
    await sleep(800);

    const exportMeta = await page.evaluate(async () => {
      const { buildExportHtmlFromSheet, buildAnswerPdfFilename } = await import("./workspace-answer-export.js");
      const state = window.__workspaceAnswerExportState?.();
      const html = buildExportHtmlFromSheet({
        answerSheet: state?.answerSheet,
        docTitle: state?.docTitle || "회계감사 문제(2025-2)",
        settings: state?.sheetSettings || {},
      });
      const filename = buildAnswerPdfFilename(state?.docTitle || "회계감사 문제(2025-2)");
      return {
        pageCount: (html.match(/<section class="export-answer-page"/g) || []).length,
        hasCircled: html.includes("①"),
        hasText: html.includes("내부통제"),
        rowCount: (html.match(/<span class="export-answer-row-text"/g) || []).length,
        filename,
        sheetRow0: state?.answerSheet?.[0]?.[0] || "",
      };
    });

    record(1, "시트 1행 데이터", exportMeta.sheetRow0.includes("①"), exportMeta.sheetRow0);
    record(2, "HTML 10페이지", exportMeta.pageCount === 10, `pages=${exportMeta.pageCount}`);
    record(3, "HTML 번호 포함", exportMeta.hasCircled, "");
    record(4, "HTML 답안 텍스트", exportMeta.hasText, "");
    record(5, "HTML 250행", exportMeta.rowCount === 250, `rows=${exportMeta.rowCount}`);
    record(6, "파일명 형식", exportMeta.filename === "2025 회계감사 답안지.pdf", exportMeta.filename);

    await page.click("#ws-answer-preview-btn");
    await sleep(500);

    const targetName = "2025 회계감사 답안지.pdf";
    const targetPath = path.join(outDir, targetName);
    const mtimeBefore = fs.existsSync(targetPath) ? fs.statSync(targetPath).mtimeMs : 0;

    await page.click("#ws-export-pdf");
    await sleep(60000);

    const downloaded = fs.existsSync(targetPath);
    const mtimeAfter = downloaded ? fs.statSync(targetPath).mtimeMs : 0;
    const updated = downloaded && mtimeAfter > mtimeBefore;

    record(7, "PDF 다운로드", updated, downloaded ? targetName : "none");
    if (updated) {
      const buf = fs.readFileSync(targetPath);
      const header = buf.subarray(0, 4).toString("ascii");
      const pageCount = (buf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
      record(8, "PDF 헤더/용량", header === "%PDF" && buf.length > 5000, `${header}, ${buf.length}b`);
      record(9, "PDF 10페이지", pageCount >= 10, `pages≈${pageCount}`);
      record(10, "다운로드 파일명", targetName === "2025 회계감사 답안지.pdf", targetName);
    } else {
      record(8, "PDF 헤더/용량", false, "no file");
      record(9, "PDF 10페이지", false, "no file");
      record(10, "다운로드 파일명", false, "no file");
    }
  } catch (err) {
    console.error(err);
    record(0, "테스트 실행", false, err.message);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== SUMMARY ===\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
}

main();
