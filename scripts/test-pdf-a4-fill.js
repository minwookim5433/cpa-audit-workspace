/**
 * A4 export — wrapper vs answer sheet dimensions
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const SAMPLE = [
  "물음3",
  "① 가능, 감사업무 수임 전 정상가액으로 회원권을 취득한 경우 공인회계사법상 직무제한의 예외에 해당한다.",
  "",
  "물음4",
  "② 감사인의 독립성을 훼손할 우려가 있는 경우에는 해당 거래를 제한해야 한다.",
  "",
  "물음5",
  "③ 공인회계사법상 금지된 행위에 해당하지 않는다.",
].join("\n");

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
  await page.evaluate((text) => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = text;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }, SAMPLE);
  await sleep(600);
  await page.evaluate(() => window.__workspaceAnswerExportState?.());
  await sleep(200);

  const result = await page.evaluate(async () => {
    const captureMod = await import("./workspace-answer-pdf-capture.js");
    const pagesMod = await import("./workspace-answer-export-pages.js");
    const typoMod = await import("./workspace-answer-typography.js");

    const state = window.__workspaceAnswerExportState();
    const audit = pagesMod.selectPagesForPdfExport(state.clones, { log: false });
    if (!audit.pagesToExport.length) {
      return { error: "no pages to export" };
    }
    await captureMod.ensurePdfCaptureLibs();
    const referenceEditor = document.querySelector(".answer-doc-editor");
    const t = typoMod.normalizeAnswerTypography(state.answerTypography);

    const mount = document.createElement("div");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;background:#fff;opacity:0.01;";
    document.body.appendChild(mount);

    const sourceClone = audit.pagesToExport[0];
    const beforeSheet = typoMod.measureAnswerPageLayout(sourceClone, "before");

    const page = document.createElement("section");
    page.className = "export-answer-page";
    const sheet = sourceClone.cloneNode(true);
    page.appendChild(sheet);
    mount.appendChild(page);

    typoMod.applyPdfA4ExportFillLayout(page, sheet, t, referenceEditor);
    await typoMod.waitForExportLayout(document);
    const rowMetrics = typoMod.finalizePdfA4ExportRowHeights(sheet);
    await typoMod.waitForExportLayout(document);

    const after = typoMod.measurePdfA4ExportDimensions(page, sheet);
    captureMod.normalizeExportPageNode(page);
    const canvas = await captureMod.capturePageNodeToCanvas(page, document);

    let lastInkY = 0;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) lastInkY = y;
      }
    }

    mount.remove();

    return {
      before: {
        width: beforeSheet.offsetWidth,
        height: beforeSheet.offsetHeight,
      },
      after,
      rowMetrics,
      canvas: { w: canvas.width, h: canvas.height, lastInkY },
      editorTextLen: sheet.querySelector(".answer-doc-editor")?.textContent?.length ?? 0,
    };
  });

  console.log(JSON.stringify(result, null, 2));

  const ok =
    result.after?.wrapper?.width === 794 &&
    result.after?.wrapper?.height === 1123 &&
    result.after?.sheet?.offsetWidth >= 790 &&
    result.after?.sheet?.offsetHeight >= 1118 &&
    result.after?.rows25Height >= 1080 &&
    result.after?.gapBelowLastRow != null &&
    result.after.gapBelowLastRow <= 8 &&
    result.canvas.lastInkY > 0;

  console.log(ok ? "PASS: A4 fill layout" : "FAIL: A4 fill layout");
  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
