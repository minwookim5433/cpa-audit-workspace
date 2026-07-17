/**
 * PDF 페이지 수 진단 — html2canvas + jsPDF 직접 캡처 (1페이지만 작성)
 */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const logs = [];
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("pageNodesCount") ||
      text.includes("[answer-export]") ||
      text.includes("page node metrics")
    ) {
      logs.push({ type: msg.type(), text });
    }
  });

  const outDir = path.join(__dirname, "..", "sample-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    const client = await page.createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: outDir,
    });

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
    await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
    await sleep(800);

    await page.click(".answer-doc-editor");
    await page.keyboard.type("① 답안지 1페이지만 작성합니다.", { delay: 15 });
    await sleep(600);
    await page.evaluate(() => window.__workspaceAnswerExportState?.());
    await sleep(300);

    const probe = await page.evaluate(async () => {
      const exportMod = await import("./workspace-answer-export.js");
      const captureMod = await import("./workspace-answer-pdf-capture.js");
      const pagesMod = await import("./workspace-answer-export-pages.js");
      const typoMod = await import("./workspace-answer-typography.js");

      const state = window.__workspaceAnswerExportState();
      const audit = pagesMod.buildExportPageAudit(state.clones || []);
      const selected = pagesMod.selectPagesForPdfExport(state.clones, { log: false });

      await captureMod.ensurePdfCaptureLibs();
      const t = typoMod.normalizeAnswerTypography(state.answerTypography);
      const html = exportMod.buildExportHtmlFromClones(selected.pagesToExport, state.docTitle, t);

      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;left:0;top:0;width:794px;height:1123px;border:none;opacity:0.01;pointer-events:none;z-index:-1;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument;
      idoc.open();
      idoc.write(html);
      idoc.close();
      typoMod.applyAnswerSheetVars(idoc.body, t);
      await typoMod.waitForExportLayout(idoc);

      const pageNodes = [...idoc.querySelectorAll(".export-answer-page")];
      const metrics = pageNodes.map((n) => {
        captureMod.normalizeExportPageNode(n, { log: true });
        return {
          rectHeight: n.getBoundingClientRect().height,
          scrollHeight: n.scrollHeight,
          offsetHeight: n.offsetHeight,
        };
      });

      const canvas = await captureMod.capturePageNodeToCanvas(pageNodes[0], idoc);
      const pdf = await captureMod.buildPdfFromPageNodes(pageNodes, { log: true });
      const pdfPageCount = pdf.internal.getNumberOfPages();
      document.body.removeChild(iframe);

      return {
        auditPdfPageCount: audit.pdfPageCount,
        pagesToExport: selected.pagesToExport.length,
        pageNodesCount: pageNodes.length,
        pdfPageCount,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        metrics,
      };
    });

    console.log("=== Pre-export audit ===");
    console.log(JSON.stringify(probe, null, 2));

    const targetPath = path.join(outDir, "diag-pdf.pdf");
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

    await page.click("#ws-answer-preview-btn");
    await sleep(500);
    await page.click("#ws-export-pdf");
    await sleep(30000);

    console.log("\n=== Browser console (filtered) ===");
    logs.forEach((l) => console.log(`[${l.type}] ${l.text}`));

    if (fs.existsSync(targetPath)) {
      const buf = fs.readFileSync(targetPath);
      const pageCount = (buf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
      console.log("\n=== Downloaded PDF ===");
      console.log("file exists:", true);
      console.log("/Type /Page count in file:", pageCount);
    } else {
      const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".pdf"));
      console.log("\n=== Downloaded PDF ===");
      console.log("expected path missing; pdf files:", files.join(", ") || "none");
      if (files.length) {
        const buf = fs.readFileSync(path.join(outDir, files[files.length - 1]));
        const pageCount = (buf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
        console.log("latest pdf /Type /Page count:", pageCount);
      }
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
