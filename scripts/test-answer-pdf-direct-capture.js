/**
 * html2canvas + jsPDF 직접 캡처 — 테스트 A~E (실제 PDF 페이지 수)
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const LINE1 = "① 첫 페이지 답안입니다.";
const LINE2 = "② 두 번째 페이지 답안입니다.";
const LINE3 = "③ 세 번째 페이지 답안입니다.";
const LONG_TEXT =
  "① 가능, 감사업무 수임 전 정상가액으로 회원권을 취득한 경우 공인회계사법상 직무제한의 예외에 해당한다.";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function record(results, name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
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
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(800);
}

async function setPageText(page, pageIndex, text) {
  await page.evaluate(
    (pageIndex, text) => {
      const go = document.getElementById("ws-ans-page-input");
      if (go) {
        go.value = String(pageIndex + 1);
        go.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    pageIndex,
    text
  );
  await sleep(500);
  await page.evaluate((text) => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = text;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await sleep(400);
  await page.evaluate(() => window.__workspaceAnswerExportState?.());
  await sleep(200);
}

async function setTypography(page, fontSize, letterSpacing) {
  await page.evaluate(
    ({ fontSize, letterSpacing }) => {
      const fontInput = document.getElementById("ws-font-size-input");
      const spacingInput = document.getElementById("ws-letter-spacing-input");
      if (fontInput) {
        fontInput.value = String(fontSize);
        fontInput.dispatchEvent(new Event("input", { bubbles: true }));
        fontInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (spacingInput) {
        spacingInput.value = String(letterSpacing);
        spacingInput.dispatchEvent(new Event("input", { bubbles: true }));
        spacingInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    { fontSize, letterSpacing }
  );
  await sleep(500);
}

async function probePdfExport(page) {
  return page.evaluate(async () => {
    const exportMod = await import("./workspace-answer-export.js");
    const captureMod = await import("./workspace-answer-pdf-capture.js");
    const pagesMod = await import("./workspace-answer-export-pages.js");
    const typoMod = await import("./workspace-answer-typography.js");

    const state = window.__workspaceAnswerExportState();
    const audit = pagesMod.selectPagesForPdfExport(state.clones, { log: false });
    if (!audit.pagesToExport.length) {
      return { error: "no pages", audit, pageNodesCount: 0, pdfPageCount: 0 };
    }

    await captureMod.ensurePdfCaptureLibs();
    const t = typoMod.normalizeAnswerTypography(state.answerTypography);
    const liveSheet = document.querySelector(".answer-doc-sheet");
    const liveEditor = document.querySelector(".answer-doc-editor");

    const mount = document.createElement("div");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;background:#fff;transform:none;zoom:1;";
    document.body.appendChild(mount);

    const sheets = audit.pagesToExport.map((clone) => {
      const sheet = clone.cloneNode(true);
      mount.appendChild(sheet);
      if (liveSheet) typoMod.copyAnswerSheetComputedStyles(liveSheet, sheet);
      return sheet;
    });
    await typoMod.waitForExportLayout(document);

    const metrics = sheets.map((n, index) => ({
      index,
      rectHeight: n.getBoundingClientRect().height,
      scrollHeight: n.scrollHeight,
      offsetHeight: n.offsetHeight,
      offsetWidth: n.offsetWidth,
    }));

    const firstSheet = sheets[0];
    const firstCanvas = firstSheet
      ? await captureMod.captureSheetNodeToCanvas(firstSheet, document)
      : null;

    const exportEditor = firstSheet?.querySelector(".answer-doc-editor");
    const exportStyle = exportEditor
      ? {
          fontSize: getComputedStyle(exportEditor).fontSize,
          letterSpacing: getComputedStyle(exportEditor).letterSpacing,
        }
      : null;

    const pdf = await captureMod.buildPdfFromSheetNodes(sheets, { log: false });
    const pdfPageCount = pdf.internal.getNumberOfPages();
    mount.remove();

    return {
      audit,
      pageNodesCount: sheets.length,
      pdfPageCount,
      metrics,
      canvasWidth: firstCanvas?.width ?? 0,
      canvasHeight: firstCanvas?.height ?? 0,
      expectedCanvasHeight: (firstSheet?.offsetHeight ?? 0) * 2,
      exportStyle,
      typography: t,
    };
  });
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];
  let lastProbe = null;

  try {
    await setup(page);

    await setPageText(page, 0, LINE1);
    lastProbe = await probePdfExport(page);
    record(
      results,
      "A: 1페이지 작성 → PDF 1페이지",
      lastProbe.pdfPageCount === 1 && lastProbe.pageNodesCount === 1,
      `nodes=${lastProbe.pageNodesCount} pdf=${lastProbe.pdfPageCount}`
    );

    await setPageText(page, 0, LINE1);
    await setPageText(page, 1, LINE2);
    lastProbe = await probePdfExport(page);
    record(
      results,
      "B: 2페이지 작성 → PDF 2페이지",
      lastProbe.pdfPageCount === 2 && lastProbe.pageNodesCount === 2,
      `nodes=${lastProbe.pageNodesCount} pdf=${lastProbe.pdfPageCount}`
    );

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

    await setTypography(page, 8, -1.5);
    await setPageText(page, 0, LONG_TEXT);
    lastProbe = await probePdfExport(page);
    const typoC =
      lastProbe.exportStyle?.fontSize === "8px" &&
      (lastProbe.exportStyle?.letterSpacing === "-1.5px" ||
        lastProbe.exportStyle?.letterSpacing === "-1.5px");
    record(
      results,
      "C: 8px / -1.5px → PDF 1페이지 + 타이포 유지",
      lastProbe.pdfPageCount === 1 && typoC,
      `pdf=${lastProbe.pdfPageCount} font=${lastProbe.exportStyle?.fontSize} spacing=${lastProbe.exportStyle?.letterSpacing}`
    );

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
    await page.$("#ws-pdf-input").then((el) => el.uploadFile(PDF_PATH));
    await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
    await sleep(800);

    await setTypography(page, 16, 0.5);
    await setPageText(page, 0, LONG_TEXT);
    lastProbe = await probePdfExport(page);
    const typoD =
      lastProbe.exportStyle?.fontSize === "16px" &&
      (lastProbe.exportStyle?.letterSpacing === "0.5px" || lastProbe.exportStyle?.letterSpacing === "0.5px");
    record(
      results,
      "D: 16px / 0.5px → PDF 1페이지 (자동 분할 없음)",
      lastProbe.pdfPageCount === 1 && typoD,
      `pdf=${lastProbe.pdfPageCount} canvasH=${lastProbe.canvasHeight} sheetH=${lastProbe.expectedCanvasHeight}`
    );

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
    await page.$("#ws-pdf-input").then((el) => el.uploadFile(PDF_PATH));
    await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
    await sleep(800);

    await setPageText(page, 0, LINE1);
    await setPageText(page, 2, LINE3);
    lastProbe = await probePdfExport(page);
    record(
      results,
      "E: 1·빈·3페이지 → PDF 3페이지",
      lastProbe.pdfPageCount === 3 &&
        lastProbe.pageNodesCount === 3 &&
        lastProbe.audit?.rows?.[1]?.hasMeaningfulContent === false,
      `nodes=${lastProbe.pageNodesCount} pdf=${lastProbe.pdfPageCount} page2empty=${!lastProbe.audit?.rows?.[1]?.hasMeaningfulContent}`
    );

    console.log("\n=== Diagnostics ===");
    console.log("canvas height (scale 2):", lastProbe?.canvasHeight);
    console.log("sheet canvas height at scale 2:", lastProbe?.expectedCanvasHeight);
    console.log("page metrics sample:", JSON.stringify(lastProbe?.metrics?.[0], null, 2));

    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n=== Summary: ${results.length - failed}/${results.length} passed ===`);
    if (failed) process.exitCode = 1;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
