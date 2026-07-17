/**
 * Numbering, layout, timer regression — tests A~V
 */
const puppeteer = require("puppeteer");
const fs = require("fs");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function record(results, name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function setup(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(1200);
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await sleep(1000);
}

async function clickNumber(page) {
  await page.evaluate(() => {
    document.getElementById("ws-number")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await page.click("#ws-number");
  await sleep(300);
}

async function clickFromOne(page) {
  await page.evaluate(() => {
    document.getElementById("ws-number-from-one")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await page.click("#ws-number-from-one");
  await sleep(300);
}

async function typeNewLine(page) {
  await page.evaluate(() => {
    const ed = document.querySelector(".answer-doc-editor");
    ed.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertLineBreak");
  });
  await sleep(200);
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error("PDF not found:", PDF_PATH);
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await setup(page);
    const editor = ".answer-doc-editor";

    await clickNumber(page);
    const a = await page.$eval(editor, (el) => el.textContent);
    record(results, "A. [번호] → ①", a.includes("①"), a);

    await typeNewLine(page);
    await clickNumber(page);
    const b = await page.$eval(editor, (el) => el.textContent);
    record(results, "B. 다음 행 [번호] → ②", /①[\s\S]*②/.test(b), b.replace(/\s+/g, " ").slice(0, 40));

    await typeNewLine(page);
    await clickNumber(page);
    const c = await page.$eval(editor, (el) => el.textContent);
    record(results, "C. 다음 행 [번호] → ③", /②[\s\S]*③/.test(c), c.replace(/\s+/g, " ").slice(0, 50));

    await typeNewLine(page);
    await clickFromOne(page);
    await typeNewLine(page);
    await clickNumber(page);
    const d = await page.$eval(editor, (el) => el.textContent);
    const dOk = (d.match(/①/g) || []).length >= 2 && /①[\s\S]*①[\s\S]*②/.test(d);
    record(results, "D. [①부터] 후 [번호] → ②", dOk, d.replace(/\s+/g, " ").slice(0, 60));

    await page.click("#ws-undo");
    await sleep(400);
    await clickNumber(page);
    const e = await page.$eval(editor, (el) => el.textContent);
    record(results, "E. Undo 후 [번호] → ③", e.includes("③"), e.replace(/\s+/g, " ").slice(0, 60));

    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.textContent = "앞글";
      ed.focus();
      const range = document.createRange();
      const node = ed.firstChild || ed;
      range.setStart(node, 2);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.evaluate(() => document.getElementById("ws-number")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await page.click("#ws-number");
    await sleep(300);
    const f = await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      const text = ed.textContent;
      const idxCircled = text.indexOf("①");
      const idxFront = text.indexOf("앞");
      return { text, ok: idxCircled > idxFront && idxCircled < 10 };
    });
    record(results, "F. caret 위치 삽입", f.ok, f.text);

    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.textContent = "    ① 첫 줄\n    ② 둘째";
      ed.focus();
      const range = document.createRange();
      range.selectNodeContents(ed);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand("insertLineBreak");
    });
    await page.evaluate(() => document.getElementById("ws-number")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await page.click("#ws-number");
    await sleep(300);
    const g = await page.$eval(editor, (el) => el.textContent);
    record(results, "G. 들여쓰기 유지", /    ③/.test(g), g.replace(/\s+/g, " ").slice(0, 80));

    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.textContent = "자동저장테스트";
      ed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(2200);
    const sEarly = await page.evaluate(() => localStorage.getItem("cpa-workspace-session")?.includes("자동저장") || false);
    record(results, "S. 자동저장", sEarly, String(sEarly));

    const h = await page.evaluate(() => ({
      noInternalNav: !document.querySelector("#ws-pane-exam .ws-exam-nav"),
      noExamToolbar: !document.getElementById("ws-exam-toolbar"),
      hasHeaderTools: !!document.getElementById("ws-header-exam-tools"),
    }));
    record(results, "H. 시험지 위 툴바 제거", h.noInternalNav && h.noExamToolbar && h.hasHeaderTools, JSON.stringify(h));

    const i = await page.evaluate(() => ({
      prev: !!document.getElementById("ws-prev-page"),
      zoom: !!document.getElementById("ws-zoom-in"),
      pen: !!document.querySelector('[data-tool="pen"]'),
      undo: !!document.getElementById("ws-annot-undo"),
    }));
    record(results, "I. 상단 도구 유지", i.prev && i.zoom && i.pen && i.undo, JSON.stringify(i));

    const layout = await page.evaluate(() => {
      const examScroll = document.querySelector("#ws-pane-exam .ws-pane-scroll");
      const answerScroll = document.querySelector("#ws-pane-answer .ws-pane-scroll");
      return {
        examH: examScroll?.clientHeight || 0,
        answerH: answerScroll?.clientHeight || 0,
        centerH: document.querySelector(".ws-center")?.clientHeight || 0,
      };
    });
    record(
      results,
      "J/K. PDF·답안 영역 확대",
      layout.examH > 400 && layout.answerH > 400 && layout.examH >= layout.centerH * 0.55,
      JSON.stringify(layout)
    );

    const l = await page.evaluate(() => ({
      floating: !!document.getElementById("ws-floating-timer"),
      sidebarHidden: document.querySelector(".ws-sidebar")?.hidden === true,
    }));
    record(results, "L. 플로팅 타이머", l.floating && l.sidebarHidden, JSON.stringify(l));

    const beforeDrag = await page.evaluate(() => {
      const el = document.getElementById("ws-floating-timer");
      return { left: el.style.left, top: el.style.top };
    });
    const handleBox = await page.$eval("#ws-floating-timer-drag", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.move(handleBox.x + handleBox.w / 2, handleBox.y + handleBox.h / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 120, handleBox.y - 80, { steps: 10 });
    await page.mouse.up();
    await sleep(300);
    const afterDrag = await page.evaluate(() => {
      const el = document.getElementById("ws-floating-timer");
      return { left: el.style.left, top: el.style.top };
    });
    record(results, "M. 타이머 드래그", beforeDrag.left !== afterDrag.left || beforeDrag.top !== afterDrag.top, JSON.stringify(afterDrag));

    const beforeBtn = afterDrag;
    await page.evaluate(() => document.getElementById("ws-float-timer-start")?.click());
    await sleep(200);
    const afterBtn = await page.evaluate(() => {
      const el = document.getElementById("ws-floating-timer");
      return { left: el.style.left, top: el.style.top };
    });
    record(results, "N. 버튼 클릭 시 이동 없음", beforeBtn.left === afterBtn.left && beforeBtn.top === afterBtn.top, "");

    await page.evaluate(() => document.getElementById("ws-float-timer-settings")?.click());
    await sleep(200);
    await page.evaluate(() => document.querySelector('[data-timer-minutes="120"]')?.click());
    await sleep(200);
    const o = await page.$eval("#ws-float-timer-display", (el) => el.textContent.trim());
    record(results, "O. 120분 → 02:00:00", o === "02:00:00", o);

    await page.evaluate(() => document.getElementById("ws-float-timer-start")?.click());
    await sleep(1200);
    await page.evaluate(() => document.getElementById("ws-float-timer-start")?.click());
    await page.evaluate(() => document.getElementById("ws-float-timer-reset")?.click());
    await sleep(200);
    const p = await page.evaluate(() => ({
      display: document.getElementById("ws-float-timer-display")?.textContent,
      running: window.__workspaceTimer?.()?.running,
    }));
    record(results, "P. 시작/일시정지/초기화", p.display === "02:00:00", JSON.stringify(p));

    const q = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("cpa-workspace-timer-pos") || "null");
      } catch {
        return null;
      }
    });
    record(results, "Q. 타이머 위치 저장", q && Number.isFinite(q.x) && Number.isFinite(q.y), JSON.stringify(q));

    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.textContent = "① 종료테스트";
      ed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(800);
    let autoPdf = false;
    page.on("response", (res) => {
      if (res.url().includes(".pdf")) autoPdf = true;
    });
    await page.evaluate(() => document.getElementById("ws-float-exam-end-btn")?.click());
    await page.waitForSelector("#ws-exam-end-modal:not([hidden])");
    await page.evaluate(() => document.getElementById("ws-exam-end-confirm")?.click());
    await page.waitForSelector("#ws-exam-result-modal:not([hidden])", { timeout: 30000 });
    await sleep(1500);
    const r = await page.evaluate(() => ({
      pdfStatus: document.getElementById("ws-exam-result-pdf-status")?.textContent || "",
      pdfSaved: window.__workspaceExamEnd?.getLastAttempt?.()?.pdfSaved,
    }));
    record(results, "R. 시험 종료 자동 PDF 없음", !autoPdf && r.pdfSaved === false && !r.pdfStatus.includes("PDF 저장 완료"), JSON.stringify(r));

    await page.evaluate(() => document.getElementById("ws-exam-result-export-pdf")?.click());
    await page.waitForFunction(
      () => (document.getElementById("ws-exam-result-pdf-status")?.textContent || "").includes("PDF 저장 완료"),
      { timeout: 60000 }
    );
    record(results, "T. 수동 PDF 저장", true, "ok");

    const u = await page.evaluate(() => ({
      drawTool: !!document.querySelector('[data-tool="highlighter"]'),
      annot: !!document.getElementById("ws-annot-undo"),
    }));
    record(results, "U. 주석 UI", u.drawTool && u.annot, JSON.stringify(u));

    const v = await page.evaluate(() => {
      const sheet = document.querySelector(".answer-doc-sheet");
      const editor = document.querySelector(".answer-doc-editor");
      const body = document.querySelector(".answer-doc-body");
      const lastLine = document.querySelector(".answer-doc-bg-line:last-child");
      const sheetRect = sheet?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      const lastLineRect = lastLine?.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(editor || sheet).lineHeight || "0");
      return {
        sheet: !!sheet,
        editor: !!editor,
        width: Math.round(sheetRect?.width || 0),
        height: Math.round(sheetRect?.height || 0),
        lineHeight: Math.round(lineHeight * 100) / 100,
        bottomGap: Math.round((sheetRect?.bottom || 0) - (lastLineRect?.bottom || 0)),
        bodyFills: Math.abs((bodyRect?.bottom || 0) - (lastLineRect?.bottom || 0)) <= 2,
      };
    });
    record(
      results,
      "V. 답안 A4 레이아웃",
      v.sheet && v.editor && v.width >= 790 && v.height >= 1100 && v.lineHeight >= 40 && v.bottomGap <= 4,
      JSON.stringify(v)
    );

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
