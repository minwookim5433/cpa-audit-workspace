/**
 * 글자 크기·자간 A~D — 작성·미리보기·PDF DOM·인쇄 DOM 일치 검증
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const TEST_TEXT =
  "① 가능, 감사업무 수임 전 정상가액으로 회원권을 취득한 경우 공인회계사법상 직무제한의 예외에 해당한다.";

const CASES = [
  { id: "A", fontSize: 8, letterSpacing: -1.5 },
  { id: "B", fontSize: 9.5, letterSpacing: -0.8 },
  { id: "C", fontSize: 12, letterSpacing: 0 },
  { id: "D", fontSize: 16, letterSpacing: 0.5 },
];

const measureFn = `function measureStarts(root) {
  if (!root) return [0];
  const starts = [0];
  let lastTop = null;
  let charIndex = 0;
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    for (let i = 0; i < len; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rects = range.getClientRects();
      if (rects.length) {
        const top = Math.round(rects[0].top);
        if (lastTop !== null && top > lastTop + 1) starts.push(charIndex);
        lastTop = top;
      }
      charIndex++;
    }
    node = walker.nextNode();
  }
  return starts;
}

function normalizeLetterSpacingCss(value) {
  const v = String(value || "").trim();
  if (!v || v === "normal") return "0px";
  return v;
}

function styleSnapshot(el) {
  if (!el) return null;
  const css = getComputedStyle(el);
  const padL = parseFloat(css.paddingLeft) || 0;
  const padR = parseFloat(css.paddingRight) || 0;
  return {
    fontSize: css.fontSize,
    letterSpacing: normalizeLetterSpacingCss(css.letterSpacing),
    lineHeight: css.lineHeight,
    fontFamily: css.fontFamily,
    fontWeight: css.fontWeight,
    clientWidth: el.clientWidth,
    contentWidth: Math.max(0, el.clientWidth - padL - padR),
    paddingLeft: css.paddingLeft,
    paddingRight: css.paddingRight,
    whiteSpace: css.whiteSpace,
    wordBreak: css.wordBreak,
    overflowWrap: css.overflowWrap,
    boxSizing: css.boxSizing,
  };
}`;

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
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(800);
}

async function setAnswerText(page, text) {
  await page.evaluate((t) => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.textContent = t;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await sleep(500);
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
  await sleep(350);
}

async function measureAllSurfaces(page, expected) {
  return page.evaluate(
    async (fn, expected) => {
      eval(fn);
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const state = window.__workspaceAnswerExportState?.() || {};
      const editor = document.querySelector(".answer-doc-editor");
      const editorData = {
        ...styleSnapshot(editor),
        starts: measureStarts(editor),
        text: editor?.textContent || "",
      };

      document.getElementById("ws-answer-preview-btn")?.click();
      await new Promise((r) => setTimeout(r, 500));
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const previewEd = document.querySelector("#ws-modal-sheet-container .answer-doc-editor");
      const previewData = {
        ...styleSnapshot(previewEd),
        starts: measureStarts(previewEd),
        text: previewEd?.textContent || "",
      };

      document.querySelector("[data-modal-close]")?.click();
      await new Promise((r) => setTimeout(r, 200));

      const clone = state.clones?.[0];
      const exportMount = document.createElement("div");
      exportMount.className = "export-answer-page";
      exportMount.appendChild(clone?.cloneNode(true) || document.createElement("div"));
      document.body.appendChild(exportMount);

      const liveSheet = document.querySelector(".answer-doc-sheet");
      const exportSheet = exportMount.querySelector(".answer-doc-sheet");
      if (exportSheet && liveSheet) {
        const w = Math.round(liveSheet.getBoundingClientRect().width);
        exportSheet.style.width = `${w}px`;
        exportSheet.style.maxWidth = `${w}px`;
      }

      const t = state.answerTypography || {
        fontSize: expected.fontSize,
        letterSpacing: expected.letterSpacing,
      };
      const vars = {
        "--answer-font-size": `${t.fontSize}px`,
        "--answer-letter-spacing": `${t.letterSpacing}px`,
      };
      Object.entries(vars).forEach(([k, v]) => {
        exportMount.style.setProperty(k, v);
        exportSheet?.style.setProperty(k, v);
      });

      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const exportEd = exportMount.querySelector(".answer-doc-editor");
      const exportData = {
        ...styleSnapshot(exportEd),
        starts: measureStarts(exportEd),
        text: exportEd?.textContent || "",
      };
      exportMount.remove();

      const printIframe = document.createElement("iframe");
      printIframe.style.cssText =
        "position:fixed;left:0;top:0;width:794px;height:1123px;border:none;opacity:0.01;pointer-events:none;z-index:-1;";
      document.body.appendChild(printIframe);
      const idoc = printIframe.contentDocument;
      idoc.open();
      idoc.write(
        `<!DOCTYPE html><html><head><link rel="stylesheet" href="/workspace.css" /></head><body></body></html>`
      );
      idoc.close();
      const printMount = idoc.createElement("section");
      printMount.className = "export-answer-page";
      printMount.appendChild(clone?.cloneNode(true) || idoc.createElement("div"));
      idoc.body.appendChild(printMount);
      Object.entries(vars).forEach(([k, v]) => {
        idoc.body.style.setProperty(k, v);
        printMount.style.setProperty(k, v);
        printMount.querySelector(".answer-doc-sheet")?.style.setProperty(k, v);
      });
      if (idoc.fonts?.ready) await idoc.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const printEd = printMount.querySelector(".answer-doc-editor");
      const printData = {
        ...styleSnapshot(printEd),
        starts: measureStarts(printEd),
        text: printEd?.textContent || "",
      };
      printIframe.remove();

      return {
        editorData,
        previewData,
        exportData,
        printData,
        stateTypography: state.answerTypography,
      };
    },
    measureFn,
    expected
  );
}

function compareStyle(ref, out, label) {
  const keys = [
    "fontSize",
    "letterSpacing",
    "lineHeight",
    "fontFamily",
    "clientWidth",
    "paddingLeft",
    "paddingRight",
    "whiteSpace",
    "wordBreak",
    "overflowWrap",
    "boxSizing",
  ];
  const mismatches = keys.filter((k) => ref[k] !== out[k]);
  return { label, ok: mismatches.length === 0, mismatches, ref, out };
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await setup(page);
    await setAnswerText(page, TEST_TEXT);

    for (const c of CASES) {
      await setTypography(page, c.fontSize, c.letterSpacing);
      await setAnswerText(page, TEST_TEXT);

      const data = await measureAllSurfaces(page, c);
      const ref = data.editorData;
      const surfaces = [
        ["preview", data.previewData],
        ["export", data.exportData],
        ["print", data.printData],
      ];

      const fontOk =
        ref.fontSize === `${c.fontSize}px` &&
        ref.letterSpacing === `${c.letterSpacing}px`;
      const spacingOk =
        data.stateTypography?.fontSize === c.fontSize &&
        data.stateTypography?.letterSpacing === c.letterSpacing;

      let caseOk = fontOk && spacingOk;
      const details = [];

      for (const [name, surf] of surfaces) {
        const sameStarts = JSON.stringify(ref.starts) === JSON.stringify(surf.starts);
        const sameText = ref.text === surf.text;
        const styleCmp = compareStyle(ref, surf, name);
        const surfOk = sameStarts && sameText && styleCmp.ok;
        caseOk = caseOk && surfOk;
        details.push({
          surface: name,
          ok: surfOk,
          sameStarts,
          sameText,
          styleOk: styleCmp.ok,
          styleMismatches: styleCmp.mismatches,
          starts: ref.starts,
        });
      }

      results.push({ id: c.id, ok: caseOk, fontOk, spacingOk, details });
      console.log(
        `${caseOk ? "PASS" : "FAIL"} [${c.id}] ${c.fontSize}px / ${c.letterSpacing}px font=${fontOk} state=${spacingOk}`
      );
      for (const d of details) {
        console.log(
          `  ${d.ok ? "  ok" : "FAIL"} ${d.surface}: lines=${d.sameStarts} text=${d.sameText} style=${d.styleOk}${
            d.styleMismatches.length ? ` mismatch=${d.styleMismatches.join(",")}` : ""
          } starts=${JSON.stringify(d.starts)}`
        );
      }
      if (!caseOk) {
        console.log("  editor style:", JSON.stringify(ref));
        for (const d of details.filter((x) => !x.ok)) {
          console.log(`  ${d.surface} style:`, JSON.stringify(data[`${d.surface}Data`]));
        }
      }
    }

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
