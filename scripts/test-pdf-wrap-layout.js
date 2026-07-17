/**
 * PDF export — 자동 줄바꿈·빈 줄·세로 위치 보존 검증
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const LONG =
  "① 가능, 감사업무 수임 전 정상가액으로 회원권을 취득한 경우 공인회계사법상 직무제한의 예외에 해당한다.";
const SAMPLE = [
  "물음3",
  LONG,
  "",
  "물음4",
  LONG,
  "",
  "물음5",
  LONG,
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
  await sleep(700);
  await page.evaluate(() => window.__workspaceAnswerExportState?.());
  await sleep(200);

  const result = await page.evaluate(async () => {
    const exportMod = await import("./workspace-answer-export.js");
    const captureMod = await import("./workspace-answer-pdf-capture.js");
    const pagesMod = await import("./workspace-answer-export-pages.js");
    const typoMod = await import("./workspace-answer-typography.js");

    const state = window.__workspaceAnswerExportState();
    const liveSheet = document.querySelector(".answer-doc-sheet");
    const liveEditor = document.querySelector(".answer-doc-editor");
    const audit = pagesMod.selectPagesForPdfExport(state.clones, { log: false });
    await captureMod.ensurePdfCaptureLibs();

    const previewClone = state.clones[0]?.cloneNode(true);
    if (previewClone && liveSheet) {
      typoMod.copyAnswerSheetComputedStyles(liveSheet, previewClone);
    }
    await typoMod.waitForExportLayout(document);

    const liveLayout = typoMod.measureAnswerContentVerticalLayout(liveSheet);
    const previewLayout = typoMod.measureAnswerContentVerticalLayout(previewClone);
    const liveEditorStyle = typoMod.getAnswerEditorStyleSnapshot(liveEditor);
    const previewEditorStyle = typoMod.getAnswerEditorStyleSnapshot(
      previewClone?.querySelector(".answer-doc-editor")
    );

    const mount = document.createElement("div");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;background:#fff;transform:none;zoom:1;opacity:0.01;";
    document.body.appendChild(mount);

    const t = typoMod.normalizeAnswerTypography(state.answerTypography);
    const page = document.createElement("section");
    page.className = "export-answer-page";
    Object.assign(page.style, {
      width: `${captureMod.EXPORT_PAGE_WIDTH_PX}px`,
      height: `${captureMod.EXPORT_PAGE_HEIGHT_PX}px`,
      boxSizing: "border-box",
      overflow: "hidden",
      margin: "0",
      padding: "0",
      background: "#fff",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
    });
    const inner = document.createElement("div");
    inner.className = "export-answer-page-inner";
    Object.assign(inner.style, {
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      overflow: "hidden",
      paddingTop: "24px",
      display: "flex",
      justifyContent: "center",
    });
    const exportSheet = audit.pagesToExport[0].cloneNode(true);
    inner.appendChild(exportSheet);
    page.appendChild(inner);
    mount.appendChild(page);
    typoMod.copyAnswerSheetComputedStyles(liveSheet, exportSheet);
    await typoMod.waitForExportLayout(document);

    const exportLayout = typoMod.measureAnswerContentVerticalLayout(exportSheet);
    const exportEditorStyle = typoMod.getAnswerEditorStyleSnapshot(
      exportSheet.querySelector(".answer-doc-editor")
    );

    captureMod.normalizeExportPageNode(page);
    const canvas = await captureMod.capturePageNodeToCanvas(page, document);

    let lastInkY = 0;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
          lastInkY = y;
        }
      }
    }
    const remainingPx = canvas.height - lastInkY;
    const lineHeightNum = parseFloat(liveEditorStyle?.lineHeight) || 28;
    const pngMetrics = {
      lastInkY,
      remainingPx,
      remainingRows: remainingPx / (lineHeightNum * 2),
    };

    mount.remove();

    return {
      liveLayout,
      previewLayout,
      exportLayout,
      liveEditorStyle,
      previewEditorStyle,
      exportEditorStyle,
      editorHtmlLen: liveEditor?.innerHTML?.length ?? 0,
      exportEditorHtmlLen: exportSheet.querySelector(".answer-doc-editor")?.innerHTML?.length ?? 0,
      canvas: { w: canvas.width, h: canvas.height },
      pngMetrics,
    };
  });

  console.log("\n=== vertical layout ===");
  console.log("live:", result.liveLayout);
  console.log("preview clone:", result.previewLayout);
  console.log("export clone:", result.exportLayout);

  console.log("\n=== contentWidth ===");
  console.log("live:", result.liveEditorStyle?.contentWidth);
  console.log("preview:", result.previewEditorStyle?.contentWidth);
  console.log("export:", result.exportEditorStyle?.contentWidth);

  console.log("\n=== innerHTML length (blank lines preserved) ===");
  console.log("live:", result.editorHtmlLen, "export:", result.exportEditorHtmlLen);

  console.log("\n=== PNG bottom space ===");
  console.log(result.pngMetrics);

  const lineHeight = parseFloat(result.liveEditorStyle?.lineHeight) || 28;
  const remainingDelta = Math.abs(
    result.liveLayout.remainingBelowContent - result.exportLayout.remainingBelowContent
  );
  const widthMatch =
    Math.abs(result.liveEditorStyle.contentWidth - result.exportEditorStyle.contentWidth) <= 1;
  const htmlPreserved = result.exportEditorHtmlLen >= result.editorHtmlLen;
  const pngRowsOk = result.pngMetrics.lastInkY > 0;

  const ok = remainingDelta <= lineHeight * 2 && widthMatch && htmlPreserved && pngRowsOk;
  console.log(
    ok
      ? "PASS: wrapping/blank lines/layout preserved"
      : "FAIL: layout mismatch",
    { remainingDelta, widthMatch, htmlPreserved, pngRowsOk }
  );

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
