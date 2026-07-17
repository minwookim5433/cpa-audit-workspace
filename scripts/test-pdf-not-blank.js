/**
 * PDF 캡처 결과가 백지가 아닌지 확인 (15534ab export 경로)
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setup(page) {
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.removeItem("cpa-workspace-session");
    const req = indexedDB.deleteDatabase("cpa-workspace-db");
    await new Promise((r) => {
      req.onsuccess = r;
      req.onerror = r;
      req.onblocked = r;
    });
  });
  await page.reload({ waitUntil: "networkidle0" });
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), {
    timeout: 45000,
  });
  await sleep(800);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await setup(page);

  await page.evaluate(() => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = "① 회계감사 답안 테스트 내용입니다.";
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(600);
  await page.evaluate(() => window.__workspaceAnswerExportState?.());
  await sleep(200);

  const result = await page.evaluate(async () => {
    const captureMod = await import("./workspace-answer-pdf-capture.js");
    const pagesMod = await import("./workspace-answer-export-pages.js");
    const typoMod = await import("./workspace-answer-typography.js");

    const state = window.__workspaceAnswerExportState();
    const audit = pagesMod.selectPagesForPdfExport(state.clones, { log: false });
    await captureMod.ensurePdfCaptureLibs();
    const referenceEditor = document.querySelector(".answer-doc-editor");
    const t = typoMod.normalizeAnswerTypography(state.answerTypography);
    const mount = document.createElement("div");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;background:#fff;opacity:0.01;";
    document.body.appendChild(mount);

    const pageNodes = audit.pagesToExport.map((clone) => {
      const page = document.createElement("section");
      page.className = "export-answer-page";
      const inner = document.createElement("div");
      inner.className = "export-answer-page-inner";
      Object.assign(inner.style, {
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        margin: "0",
        padding: "0",
      });
      const sheet = clone.cloneNode(true);
      inner.appendChild(sheet);
      page.appendChild(inner);
      mount.appendChild(page);
      typoMod.applyPdfA4ExportFillLayout(page, sheet, t, referenceEditor);
      return page;
    });

    await typoMod.waitForExportLayout(document);
    pageNodes.forEach((page) => {
      typoMod.finalizePdfA4ExportRowHeights(page.querySelector(".answer-doc-sheet"));
    });
    await typoMod.waitForExportLayout(document);
    pageNodes.forEach((n) => captureMod.normalizeExportPageNode(n));

    const editor = pageNodes[0]?.querySelector(".answer-doc-editor");
    const editorText = editor?.textContent || "";
    const editorHtml = editor?.innerHTML || "";

    const canvas = pageNodes.length
      ? await captureMod.capturePageNodeToCanvas(pageNodes[0], document)
      : null;

    let nonWhitePixels = 0;
    if (canvas) {
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhitePixels++;
      }
    }

    const pdf = await captureMod.buildPdfFromPageNodes(pageNodes, { log: false });
    const pdfPages = pdf.internal.getNumberOfPages();
    mount.remove();

    return {
      captureSelector: ".export-answer-page",
      pageNodes: pageNodes.length,
      pdfPages,
      editorText,
      editorHtmlLen: editorHtml.length,
      canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
      nonWhitePixels,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  const ok =
    result.nonWhitePixels > 100 &&
    result.editorText.includes("회계감사") &&
    result.pdfPages === 1 &&
    result.pageNodes === 1;
  console.log(ok ? "PASS: PDF has visible content" : "FAIL: blank or no text");
  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
