/**
 * 작성 화면 vs PDF export DOM 치수 비교
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  const input = await page.$("#ws-pdf-input");
  if (input) await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await page.evaluate(() => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = "① 테스트 답안\n".repeat(10);
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 800));

  const result = await page.evaluate(async () => {
    function measureEl(el, name) {
      if (!el) return { name, missing: true };
      const css = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        name,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        rectW: Math.round(r.width * 100) / 100,
        rectH: Math.round(r.height * 100) / 100,
        fontSize: css.fontSize,
        letterSpacing: css.letterSpacing,
        lineHeight: css.lineHeight,
        transform: css.transform,
        zoom: css.zoom || "1",
      };
    }

    const typo = await import("./workspace-answer-typography.js");
    const cap = await import("./workspace-answer-pdf-capture.js");
    const exp = await import("./workspace-answer-export.js");

    const state = window.__workspaceAnswerExportState?.();
    const liveSheet = document.querySelector(".answer-doc-sheet");
    const liveEditor = document.querySelector(".answer-doc-editor");
    const liveLines = [...liveSheet.querySelectorAll(".answer-doc-bg-line")];

    const live = {
      sheet: measureEl(liveSheet, "live-sheet"),
      editor: measureEl(liveEditor, "live-editor"),
      body: measureEl(liveSheet.querySelector(".answer-doc-body"), "live-body"),
      header: measureEl(liveSheet.querySelector(".answer-doc-header"), "live-header"),
      line0: measureEl(liveLines[0], "live-line0"),
      rows25Height: liveLines.reduce((s, l) => s + l.getBoundingClientRect().height, 0),
      lineHeights: liveLines.slice(0, 5).map((l) => l.getBoundingClientRect().height),
      dpr: window.devicePixelRatio,
    };

    const clone = state?.clones?.[0];
    const t = state?.answerTypography || { fontSize: 12, letterSpacing: -2 };
    await typo.waitForExportLayout(document);

    const mount = document.createElement("div");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;background:#fff;transform:none;zoom:1;";
    document.body.appendChild(mount);
    const captureSheet = clone.cloneNode(true);
    mount.appendChild(captureSheet);
    typo.copyAnswerSheetComputedStyles(liveSheet, captureSheet);
    await typo.waitForExportLayout(document);

    const captureLines = [...captureSheet.querySelectorAll(".answer-doc-bg-line")];
    const capM = {
      sheet: measureEl(captureSheet, "capture-sheet"),
      editor: measureEl(captureSheet.querySelector(".answer-doc-editor"), "capture-editor"),
      body: measureEl(captureSheet.querySelector(".answer-doc-body"), "capture-body"),
      line0: measureEl(captureLines[0], "capture-line0"),
      rows25Height: captureLines.reduce((s, l) => s + l.getBoundingClientRect().height, 0),
      lineHeights: captureLines.slice(0, 5).map((l) => l.getBoundingClientRect().height),
    };

    await cap.ensurePdfCaptureLibs();
    cap.normalizeSheetCaptureNode(captureSheet);
    const canvas = await cap.captureSheetNodeToCanvas(captureSheet, document);
    const fit = cap.fitSheetCanvasToA4Mm(
      canvas,
      captureSheet.offsetWidth,
      captureSheet.offsetHeight
    );
    mount.remove();

    return {
      live,
      capM,
      canvas: { width: canvas.width, height: canvas.height },
      html2canvasScale: 2,
      jsPdfAddImage: fit,
      sheetToCanvasWidthRatio: capM.sheet.offsetWidth / (canvas.width / 2),
      sheetToCanvasHeightRatio: capM.sheet.offsetHeight / (canvas.height / 2),
    };
  });

  console.log("\n=== 작성 화면 ===");
  console.table([result.live.sheet, result.live.editor, result.live.body, result.live.header]);
  console.log("25행 높이:", result.live.rows25Height, "행 높이 샘플:", result.live.lineHeights);

  console.log("\n=== offscreen capture (신규) ===");
  console.table([result.capM.sheet, result.capM.editor, result.capM.body]);
  console.log("25행 높이:", result.capM.rows25Height, "행 높이 샘플:", result.capM.lineHeights);

  console.log("\n=== 캡처/PDF ===");
  console.log("canvas:", result.canvas);
  console.log("html2canvas scale:", result.html2canvasScale);
  console.log("jsPDF addImage:", result.jsPdfAddImage);
  console.log("sheet/canvas ratio (should be ~1):", {
    width: result.sheetToCanvasWidthRatio,
    height: result.sheetToCanvasHeightRatio,
  });
  console.log("devicePixelRatio:", result.live.dpr);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
