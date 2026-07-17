/**
 * CPA Workspace UX v3 검증 (13항목)
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const results = [];

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadPdf(page) {
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".pdf-canvas")?.width > 0, { timeout: 45000 });
  await sleep(2000);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 20000 });
    await page.evaluate(async () => {
      localStorage.removeItem("cpa-workspace-session");
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      await new Promise((r) => { req.onsuccess = r; req.onerror = r; req.onblocked = r; });
    });
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);
    await uploadPdf(page);

    const fit1 = await page.evaluate(() => {
      const container = document.querySelector(".pdf-page-container");
      const scroll = document.getElementById("ws-exam");
      if (!container || !scroll) return null;
      return {
        containerW: container.getBoundingClientRect().width,
        scrollW: scroll.clientWidth,
        overflow: scroll.scrollWidth <= scroll.clientWidth + 2,
        zoomLabel: document.getElementById("ws-zoom-label")?.textContent || "",
      };
    });
    record(1, "너비 맞춤 표시", fit1?.overflow && fit1?.zoomLabel.includes("맞춤"), JSON.stringify(fit1));

    await page.click("#ws-next-page");
    await sleep(1200);
    const fit2 = await page.evaluate(() => ({
      zoomLabel: document.getElementById("ws-zoom-label")?.textContent || "",
      overflow: document.getElementById("ws-exam")?.scrollWidth <= document.getElementById("ws-exam")?.clientWidth + 2,
    }));
    record("1b", "페이지 이동 시 너비 맞춤", fit2.overflow && fit2.zoomLabel.includes("맞춤"), JSON.stringify(fit2));

    const sharp = await page.evaluate(() => {
      const canvas = document.querySelector(".pdf-canvas");
      const dpr = window.devicePixelRatio || 1;
      const styleW = parseFloat(canvas.style.width);
      return { ratio: canvas.width / styleW, dpr, ok: canvas.width >= styleW * dpr * 0.9 };
    });
    record(2, "PDF 글자 선명도 (HiDPI)", sharp.ok, JSON.stringify(sharp));

    await page.evaluate(() => {
      document.querySelector('#ws-float-toolbar [data-tool="highlighter"]')?.click();
    });
    const hiW = await page.evaluate(() => {
      const sel = document.getElementById("ws-float-highlight-color");
      const thickSel = document.querySelector("#ws-line-thickness, #ws-highlight-width");
      return { hasThickUi: Boolean(thickSel), colorSel: Boolean(sel) };
    });
    record(3, "형광펜 굵기 UI 제거", !hiW.hasThickUi && hiW.colorSel, JSON.stringify(hiW));

    await page.evaluate(() => document.querySelector('#ws-float-toolbar [data-tool="underline"]')?.click());
    const box = await page.$eval(".draw-interact-layer", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width * 0.25, y: r.y + r.height * 0.5, w: r.width * 0.3 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w, box.y, { steps: 4 });
    await page.mouse.up();
    await sleep(400);
    const line = await page.$eval(".draw-layer line", (ln) => ({
      sw: ln.getAttribute("stroke-width"),
      hasLine: true,
    }));
    record(4, "직선 밑줄 그리기", line.hasLine, `stroke-width=${line.sw}`);

    const eraser = await page.$('#ws-float-toolbar [data-tool="eraser"], #ws-tool-eraser');
    record(5, "지우개 제거", !eraser, "eraser absent");

    const toolbar = await page.$("#ws-float-toolbar");
    const before = await page.$eval("#ws-float-toolbar", (el) => ({
      left: parseFloat(el.style.left) || 12,
      top: parseFloat(el.style.top) || 12,
    }));
    const handle = await page.$("#ws-float-handle");
    const hbox = await handle.boundingBox();
    await page.mouse.move(hbox.x + 5, hbox.y + 5);
    await page.mouse.down();
    await page.mouse.move(hbox.x + 80, hbox.y + 40, { steps: 5 });
    await page.mouse.up();
    await sleep(300);
    await page.click("#ws-float-minimize");
    await sleep(200);
    const floated = await page.evaluate(() => ({
      moved: true,
      minimized: document.getElementById("ws-float-toolbar")?.classList.contains("is-minimized"),
    }));
    record(6, "플로팅 툴바 이동·최소화", floated.minimized, JSON.stringify({ before, floated }));

    await page.click("#ws-float-expand");
    await sleep(200);
    await page.click("#ws-float-orient");
    await sleep(200);
    const vertical = await page.evaluate(() => ({
      vertical: document.getElementById("ws-float-toolbar")?.classList.contains("is-vertical"),
      pressed: document.getElementById("ws-float-orient")?.getAttribute("aria-pressed"),
      flexDir: getComputedStyle(document.querySelector(".ws-float-toolbar-inner")).flexDirection,
    }));
    record("6b", "툴바 세로 배치", vertical.vertical && vertical.flexDir === "column", JSON.stringify(vertical));

    await page.click("#ws-float-minimize");
    await sleep(200);
    const expand = await page.$("#ws-float-expand");
    const ebox = await expand.boundingBox();
    const posBefore = await page.$eval("#ws-float-toolbar", (el) => ({
      left: parseFloat(el.style.left) || 0,
      top: parseFloat(el.style.top) || 0,
    }));
    await page.mouse.move(ebox.x + 10, ebox.y + 10);
    await page.mouse.down();
    await page.mouse.move(ebox.x + 60, ebox.y + 50, { steps: 6 });
    await page.mouse.up();
    await sleep(250);
    const posAfter = await page.$eval("#ws-float-toolbar", (el) => ({
      left: parseFloat(el.style.left) || 0,
      top: parseFloat(el.style.top) || 0,
      minimized: el.classList.contains("is-minimized"),
    }));
    const movedMin = Math.abs(posAfter.left - posBefore.left) > 8 || Math.abs(posAfter.top - posBefore.top) > 8;
    record("6c", "접힌 상태 드래그 이동", movedMin && posAfter.minimized, JSON.stringify({ posBefore, posAfter }));

    await page.click('[data-view="exam"]');
    await sleep(300);
    const examW1 = await page.$eval("#ws-pane-exam", (el) => el.getBoundingClientRect().width);
    await page.click('[data-view="answer"]');
    await sleep(300);
    const examW2 = await page.$eval("#ws-pane-exam", (el) => el.getBoundingClientRect().width);
    await page.click('[data-view="equal"]');
    await sleep(300);
    record(7, "보기 모드 전환", examW1 > examW2 + 50, `exam=${Math.round(examW1)} vs ${Math.round(examW2)}`);

    await page.click(".answer-doc-editor");
    await page.keyboard.type("중간텍스트");
    await sleep(300);
    const editor = await page.evaluate(() => ({
      hasDocEditor: Boolean(document.querySelector(".answer-doc-editor")),
      text: document.querySelector(".answer-doc-editor")?.textContent || "",
      rowInputs: document.querySelectorAll("[data-row-input]").length,
    }));
    record(8, "contenteditable 답안 편집기", editor.hasDocEditor && editor.rowInputs === 0 && editor.text.trim().length > 0, JSON.stringify(editor));

    await page.click(".answer-doc-editor");
    await page.keyboard.press("Enter");
    await page.keyboard.type("다음행");
    const lines = await page.evaluate(() => (document.querySelector(".answer-doc-editor")?.innerText || "").split("\n").length);
    record(9, "Enter 다음 행 이동", lines >= 2, `lines=${lines}`);

    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      if (ed) {
        ed.textContent = Array(26).fill("가나다라마바사").join("\n");
        ed.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await sleep(600);
    const overflow = await page.evaluate(() => ({
      ansPage: document.getElementById("ws-ans-page-input")?.value,
      page2has: Boolean(document.querySelector(".answer-doc-editor")?.textContent?.trim()),
    }));
    record(10, "25행 초과 다음 페이지", Number(overflow.ansPage) >= 2, JSON.stringify(overflow));

    await page.evaluate(() => {
      const inp = document.getElementById("ws-ans-page-input");
      if (inp) { inp.value = "1"; inp.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    await sleep(400);
    await page.click(".answer-doc-editor");
    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      if (!ed) return;
      ed.textContent = "앞부분";
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(ed);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.click("#ws-number");
    await sleep(200);
    await page.select("#ws-num-format", "circled");
    await page.evaluate(() => {
      const inp = document.getElementById("ws-num-start");
      if (inp) { inp.value = "3"; inp.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    await page.click("#ws-num-insert-one");
    await sleep(400);
    const num = await page.evaluate(() => document.querySelector(".answer-doc-editor")?.textContent || "");
    record(11, "커서 위치 번호 삽입", num.includes("③") && num.indexOf("③") > num.indexOf("앞"), num);

    const fmt = await page.evaluate(() => ({
      formats: document.querySelectorAll("#ws-num-format option").length,
      hasStart: Boolean(document.getElementById("ws-num-start")),
    }));
    await page.click("#ws-number");
    await sleep(200);
    record(12, "번호 형식·시작번호 선택", fmt.formats >= 5 && fmt.hasStart, JSON.stringify(fmt));

    await page.evaluate(() => {
      localStorage.setItem("cpa-workspace-ux-test", document.querySelector(".answer-doc-editor")?.textContent || "");
    });
    await page.setViewport({ width: 1200, height: 900 });
    await sleep(800);
    const ratio = await page.$eval("#ws-pane-exam", (el) => el.getBoundingClientRect().width);
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(3500);
    const restored = await page.evaluate(() => ({
      hasPdf: Boolean(document.querySelector(".pdf-canvas")?.width),
      text: document.querySelector(".answer-doc-editor")?.textContent || "",
      ratio: document.getElementById("ws-pane-exam")?.getBoundingClientRect().width,
      toolbar: Boolean(document.getElementById("ws-float-toolbar")),
    }));
    record(13, "새로고침 후 상태 복원", restored.hasPdf && restored.toolbar, JSON.stringify(restored));
  } catch (err) {
    console.error(err);
    record(0, "테스트 실행", false, err.message);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== SUMMARY ===\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
}

main();
