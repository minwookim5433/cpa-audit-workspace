/**
 * offscreen sheet capture 치수 검증 (PDF 업로드 불필요)
 */
const puppeteer = require("puppeteer");

const BASE = "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle0" });

  const result = await page.evaluate(async () => {
    const typo = await import("./workspace-answer-typography.js");
    const cap = await import("./workspace-answer-pdf-capture.js");
    const cloneMod = await import("./workspace-answer-clone.js");

    const typography = { fontSize: 12, letterSpacing: -2 };
    const liveMount = cloneMod.mountOffscreenSheet(0, "① 테스트\n② 두번째", null, typography);
    const liveSheet = liveMount.querySelector(".answer-doc-sheet");
    const liveEditor = liveMount.querySelector(".answer-doc-editor");
    const liveLines = [...liveSheet.querySelectorAll(".answer-doc-bg-line")];

    const clone = cloneMod.finalizeSheetClone(liveSheet.cloneNode(true));
    const captureMount = document.createElement("div");
    captureMount.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;background:#fff;transform:none;zoom:1;";
    document.body.appendChild(captureMount);
    captureMount.appendChild(clone);
    typo.copyAnswerSheetComputedStyles(liveSheet, clone);
    await typo.waitForExportLayout(document);

    const captureLines = [...clone.querySelectorAll(".answer-doc-bg-line")];
    await cap.ensurePdfCaptureLibs();
    cap.normalizeSheetCaptureNode(clone);
    const canvas = await cap.captureSheetNodeToCanvas(clone, document);
    const fit = cap.fitSheetCanvasToA4Mm(canvas, clone.offsetWidth, clone.offsetHeight);

    const row = (el, label) => ({
      label,
      offsetWidth: el?.offsetWidth,
      offsetHeight: el?.offsetHeight,
      rectH: el ? Math.round(el.getBoundingClientRect().height) : null,
      fontSize: el ? getComputedStyle(el).fontSize : null,
      lineHeight: el ? getComputedStyle(el).lineHeight : null,
      letterSpacing: el ? getComputedStyle(el).letterSpacing : null,
    });

    const out = {
      live: {
        sheet: row(liveSheet, "live-sheet"),
        editor: row(liveEditor, "live-editor"),
        rows25: liveLines.reduce((s, l) => s + l.getBoundingClientRect().height, 0),
      },
      capture: {
        sheet: row(clone, "capture-sheet"),
        editor: row(clone.querySelector(".answer-doc-editor"), "capture-editor"),
        rows25: captureLines.reduce((s, l) => s + l.getBoundingClientRect().height, 0),
      },
      canvas: { width: canvas.width, height: canvas.height },
      jsPdf: fit,
      html2canvasScale: cap.PDF_CAPTURE_SCALE,
    };

    liveMount.remove();
    captureMount.remove();
    return out;
  });

  console.log("LIVE", result.live);
  console.log("CAPTURE", result.capture);
  console.log("CANVAS", result.canvas, "scale", result.html2canvasScale);
  console.log("jsPDF", result.jsPdf);

  const ok =
    result.live.sheet.offsetWidth === result.capture.sheet.offsetWidth &&
    result.live.sheet.offsetHeight === result.capture.sheet.offsetHeight &&
    result.live.rows25 === result.capture.rows25 &&
    result.live.editor.fontSize === result.capture.editor.fontSize &&
    result.capture.editor.lineHeight === "28px" &&
    result.canvas.width === result.capture.sheet.offsetWidth * 2 &&
    result.canvas.height === result.capture.sheet.offsetHeight * 2;

  console.log(ok ? "PASS layout match" : "FAIL layout match");
  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
