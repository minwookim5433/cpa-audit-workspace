/**
 * 답안 렌더링 통일 검증 — 작성 화면 DOM 클론 = 미리보기 = PDF HTML
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

function record(results, id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const measureLineStartsFn = `function measureStarts(root) {
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
  await sleep(1000);
}

async function clearAndType(page, text) {
  await page.click(".answer-doc-editor");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 8 });
  await sleep(500);
}

async function main() {
  const results = [];
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await setup(page);

    const sample100 =
      "감사인은 내부통제를 이해하고 중요한 왜곡표시 위험을 평가하며 충분하고 적합한 감사증거를 확보하여 감사의견을 형성한다.① 항목";

    await clearAndType(page, sample100);

    const editorData = await page.evaluate((fn) => {
      eval(fn);
      const editor = document.querySelector(".answer-doc-editor");
      return {
        text: editor?.innerText || "",
        starts: measureStarts(editor),
        width: editor?.clientWidth || 0,
      };
    }, measureLineStartsFn);

    const cloneCompare = await page.evaluate(() => {
      const state = window.__workspaceAnswerExportState();
      const editor = document.querySelector(".answer-doc-editor");
      const cloneEditor = state.clones?.[0]?.querySelector?.(".answer-doc-editor");
      return {
        editorText: editor?.innerText || "",
        cloneText: cloneEditor?.innerText || "",
      };
    });

    await page.click("#ws-answer-preview-btn");
    await page.waitForFunction(() => !document.getElementById("ws-preview-modal").hidden, { timeout: 5000 });
    await sleep(400);

    const previewData = await page.evaluate((fn) => {
      eval(fn);
      const editor = document.querySelector("#ws-modal-sheet-container .answer-doc-editor");
      return {
        text: editor?.innerText || "",
        starts: measureStarts(editor),
      };
    }, measureLineStartsFn);

    const sameTextEditorPreview = editorData.text === previewData.text;
    const sameStartsEditorPreview =
      JSON.stringify(editorData.starts) === JSON.stringify(previewData.starts);
    record(
      results,
      "1",
      "작성 화면 ↔ 미리보기 줄바꿈 동일",
      sameTextEditorPreview && sameStartsEditorPreview,
      `editorLines=${editorData.starts.length} previewLines=${previewData.starts.length}`
    );

    record(
      results,
      "2",
      "글자 100자 줄 위치 동일 (작성↔미리보기)",
      sameStartsEditorPreview,
      `starts=${JSON.stringify(editorData.starts)}`
    );

    record(
      results,
      "1b",
      "작성 화면 ↔ PDF HTML 클론 텍스트 동일",
      cloneCompare.editorText === cloneCompare.cloneText,
      `editorLen=${cloneCompare.editorText.length} cloneLen=${cloneCompare.cloneText.length}`
    );

    // 3. 줄 삭제 후 동일
    await page.click("[data-modal-close]");
    await sleep(200);
    await clearAndType(page, "첫줄내용\n둘째줄내용\n③ 번호항목");
    await page.click(".answer-doc-editor");
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await sleep(300);
    await page.click("#ws-del-line");
    await sleep(400);

    const afterDelete = await page.evaluate((fn) => {
      eval(fn);
      const editor = document.querySelector(".answer-doc-editor");
      return { text: editor.innerText, starts: measureStarts(editor) };
    }, measureLineStartsFn);

    await page.click("#ws-answer-preview-btn");
    await sleep(400);
    const previewAfterDelete = await page.evaluate((fn) => {
      eval(fn);
      const editor = document.querySelector("#ws-modal-sheet-container .answer-doc-editor");
      return { text: editor.innerText, starts: measureStarts(editor) };
    }, measureLineStartsFn);

    record(
      results,
      "3",
      "줄 삭제 후 미리보기 동일",
      afterDelete.text === previewAfterDelete.text &&
        JSON.stringify(afterDelete.starts) === JSON.stringify(previewAfterDelete.starts),
      `editor="${afterDelete.text}"`
    );

    // 4. 번호 위치
    await page.click("[data-modal-close]");
    await sleep(200);
    await clearAndType(page, "1)");
    await page.keyboard.press("Space");
    await sleep(300);
    await page.keyboard.type("감사절차", { delay: 10 });
    await sleep(300);

    const numPos = await page.evaluate((fn) => {
      eval(fn);
      const editor = document.querySelector(".answer-doc-editor");
      const text = editor.innerText;
      const idx = text.indexOf("①");
      const starts = measureStarts(editor);
      const lineIdx = starts.findIndex((s, i) => idx >= s && idx < (starts[i + 1] ?? text.length));
      return { text, idx, lineIdx, starts };
    }, measureLineStartsFn);

    await page.click("#ws-answer-preview-btn");
    await sleep(400);
    const previewNumPos = await page.evaluate((fn) => {
      eval(fn);
      const editor = document.querySelector("#ws-modal-sheet-container .answer-doc-editor");
      const text = editor.innerText;
      const idx = text.indexOf("①");
      const starts = measureStarts(editor);
      const lineIdx = starts.findIndex((s, i) => idx >= s && idx < (starts[i + 1] ?? text.length));
      return { text, idx, lineIdx, starts };
    }, measureLineStartsFn);

    record(
      results,
      "4",
      "번호 위치 동일",
      numPos.text === previewNumPos.text &&
        numPos.idx === previewNumPos.idx &&
        numPos.lineIdx === previewNumPos.lineIdx,
      `① line=${numPos.lineIdx}`
    );

    // 5. 페이지 끝 줄바꿈 — 긴 텍스트로 overflow 유도
    await page.click("[data-modal-close]");
    await sleep(200);
    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.textContent = "가".repeat(1200);
      ed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(900);
    await page.evaluate(() => {
      document.querySelector("#ws-answer-preview-btn")?.click();
    });
    await sleep(300);
    await page.evaluate(() => {
      document.querySelector("[data-modal-close]")?.click();
    });
    await sleep(200);

    const overflowCheck = await page.evaluate(() => {
      const state = window.__workspaceAnswerExportState();
      const pages = state.answerSheet || [];
      return {
        page0Len: String(pages[0] || "").length,
        page1Len: String(pages[1] || "").length,
        totalLen: String(pages[0] || "").length + String(pages[1] || "").length,
        currentPage: document.querySelector(".answer-doc-page")?.textContent || "",
      };
    });

    record(
      results,
      "5",
      "페이지 끝 줄바꿈(overflow) 저장 일관",
      overflowCheck.page0Len > 0 &&
        overflowCheck.page1Len > 0 &&
        overflowCheck.totalLen >= 1200,
      `p0=${overflowCheck.page0Len} p1=${overflowCheck.page1Len} total=${overflowCheck.totalLen} page=${overflowCheck.currentPage}`
    );

    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
    if (failed) process.exitCode = 1;
  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
