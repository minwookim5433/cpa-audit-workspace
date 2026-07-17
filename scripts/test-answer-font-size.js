/**
 * 글자 크기 12/14/16px — 작성·미리보기·PDF HTML 줄바꿈 일치 검증
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const TEST_TEXT =
  "① 가능, 감사업무 수임 전 정상가액으로 회원권을 취득한 경우 공인회계사법상 직무제한의 예외에 해당한다.";

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
}`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setup(page) {
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.removeItem("cpa-workspace-session");
    const req = indexedDB.deleteDatabase("cpa-workspace-db");
    await new Promise((r) => { req.onsuccess = r; req.onerror = r; req.onblocked = r; });
  });
  await page.reload({ waitUntil: "networkidle0" });
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(800);
}

async function setFontSize(page, size) {
  for (let i = 0; i < 8; i++) {
    const current = await page.$eval("#ws-font-size-value", (el) => parseInt(el.textContent, 10) || 14);
    if (current === size) break;
    if (current < size) await page.click("#ws-font-inc");
    else await page.click("#ws-font-dec");
    await sleep(120);
  }
  await sleep(200);
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

async function measureSurfaces(page) {
  return page.evaluate(async (fn) => {
    eval(fn);
    if (document.fonts?.ready) await document.fonts.ready;
    window.__workspaceAnswerExportState?.();

    const editor = document.querySelector(".answer-doc-editor");
    const editorData = {
      fontSize: getComputedStyle(editor).fontSize,
      starts: measureStarts(editor),
      text: editor.innerText,
      width: editor.clientWidth,
    };

    document.getElementById("ws-answer-preview-btn")?.click();
    await new Promise((r) => setTimeout(r, 500));

    const previewEd = document.querySelector("#ws-modal-sheet-container .answer-doc-editor");
    const previewData = {
      fontSize: previewEd ? getComputedStyle(previewEd).fontSize : "",
      starts: measureStarts(previewEd),
      text: previewEd?.innerText || "",
    };

    const state = window.__workspaceAnswerExportState();
    const clone = state.clones?.[0];
    const mount = document.createElement("div");
    mount.className = "answer-doc-offscreen-mount";
    mount.appendChild(clone?.cloneNode(true) || document.createElement("div"));
    document.body.appendChild(mount);
    const liveSheet = document.querySelector(".answer-doc-sheet");
    const sheet = mount.querySelector(".answer-doc-sheet");
    if (sheet && liveSheet) {
      const w = Math.round(liveSheet.getBoundingClientRect().width);
      sheet.style.width = `${w}px`;
      sheet.style.maxWidth = `${w}px`;
    }
    const exportEd = mount.querySelector(".answer-doc-editor");
    const exportData = {
      fontSize: exportEd ? getComputedStyle(exportEd).fontSize : "",
      starts: measureStarts(exportEd),
      text: exportEd?.innerText || "",
    };
    mount.remove();
    document.querySelector("[data-modal-close]")?.click();

    return { editorData, previewData, exportData, stateFontSize: state.answerFontSize };
  }, measureFn);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await setup(page);
    await setAnswerText(page, TEST_TEXT);

    for (const size of [12, 14, 16]) {
      await setFontSize(page, size);
      await setAnswerText(page, TEST_TEXT);
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });

      const data = await measureSurfaces(page);
      const sameEp = JSON.stringify(data.editorData.starts) === JSON.stringify(data.previewData.starts);
      const sameEe = JSON.stringify(data.editorData.starts) === JSON.stringify(data.exportData.starts);
      const sameText =
        data.editorData.text === data.previewData.text &&
        data.editorData.text === data.exportData.text;
      const fontOk =
        data.editorData.fontSize === `${size}px` &&
        data.previewData.fontSize === `${size}px` &&
        data.exportData.fontSize === `${size}px`;

      const ok = sameEp && sameEe && fontOk;
      results.push({ size, ok, sameEp, sameEe, sameText, fontOk, starts: data.editorData.starts });
      console.log(
        `${ok ? "PASS" : "FAIL"} [${size}px] editor↔preview=${sameEp} editor↔export=${sameEe} text=${sameText} font=${fontOk} starts=${JSON.stringify(data.editorData.starts)}`
      );
    }

    // persistence
    await setFontSize(page, 16);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#ws-font-size-value"), { timeout: 20000 });
    await sleep(600);
    const restored = await page.$eval("#ws-font-size-value", (el) => el.textContent);
    const persistOk = restored === "16px";
    console.log(`${persistOk ? "PASS" : "FAIL"} [persist] 새로고침 후 16px 유지 — ${restored}`);
    if (!persistOk) results.push({ size: "persist", ok: false });

    const failed = results.filter((r) => !r.ok).length + (persistOk ? 0 : 1);
    console.log(`\n=== Summary: ${results.length + 1 - failed} passed, ${failed} failed ===`);
    if (failed) process.exitCode = 1;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
