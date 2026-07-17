/**
 * A4 export page capture 치수 검증
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

    const mount = document.createElement("div");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;background:#fff;transform:none;zoom:1;";
    document.body.appendChild(mount);

    const pageEl = document.createElement("div");
    pageEl.className = "export-answer-page";
    const sheet = liveSheet.cloneNode(true);
    pageEl.appendChild(sheet);
    mount.appendChild(pageEl);
    typo.applyA4ExportCaptureLayout(pageEl, sheet, typography, liveSheet, liveEditor);
    await typo.waitForExportLayout(document);

    await cap.ensurePdfCaptureLibs();
    cap.normalizeExportPageNode(pageEl);
    const canvas = await cap.captureExportPageToCanvas(pageEl, document);

    const out = {
      exportPage: {
        w: pageEl.offsetWidth,
        h: pageEl.offsetHeight,
        transform: getComputedStyle(pageEl).transform,
      },
      sheet: {
        w: sheet.offsetWidth,
        h: sheet.offsetHeight,
      },
      editor: {
        fontSize: getComputedStyle(sheet.querySelector(".answer-doc-editor")).fontSize,
        lineHeight: getComputedStyle(sheet.querySelector(".answer-doc-editor")).lineHeight,
        letterSpacing: getComputedStyle(sheet.querySelector(".answer-doc-editor")).letterSpacing,
      },
      canvas: { w: canvas.width, h: canvas.height },
      addImage: { x: 0, y: 0, w: 210, h: 297 },
    };

    liveMount.remove();
    mount.remove();
    return out;
  });

  console.log(JSON.stringify(result, null, 2));

  const ok =
    result.exportPage.w === 794 &&
    result.exportPage.h === 1123 &&
    result.sheet.w === 794 &&
    result.sheet.h === 1123 &&
    result.canvas.w === 1588 &&
    result.canvas.h === 2246 &&
    result.editor.fontSize === "12px" &&
    result.editor.lineHeight === "28px" &&
    result.editor.letterSpacing === "-2px";

  console.log(ok ? "PASS A4 full bleed capture" : "FAIL");
  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
