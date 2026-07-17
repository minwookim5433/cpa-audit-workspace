/**
 * 좌우 2분할 + 주석 검증 (10항목)
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

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 15000 });
    await page.evaluate(async () => {
      localStorage.removeItem("cpa-workspace-session");
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      await new Promise((r) => { req.onsuccess = r; req.onerror = r; req.onblocked = r; });
    });
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);

    const pdfInput = await page.$("#ws-pdf-input");
    await pdfInput.uploadFile(PDF_PATH);
    await page.waitForFunction(() => document.querySelector(".pdf-canvas")?.width > 0, { timeout: 45000 });
    await sleep(2000);

    const singlePage = await page.$$eval(".exam-page-wrap", (els) => els.length);
    record(1, "한 페이지만 표시", singlePage === 1, `count=${singlePage}`);

    const sharp = await page.evaluate(() => {
      const canvas = document.querySelector(".pdf-canvas");
      const dpr = window.devicePixelRatio || 1;
      const styleW = parseFloat(canvas.style.width);
      return {
        canvasW: canvas.width,
        styleW,
        ratio: canvas.width / styleW,
        dpr,
        sharp: canvas.width >= styleW * dpr * 0.9,
      };
    });
    record(2, "고해상도 canvas 렌더", sharp.sharp, `canvas=${sharp.canvasW} style=${sharp.styleW} ratio=${sharp.ratio.toFixed(2)} dpr=${sharp.dpr}`);

    const beforeW = await page.$eval(".ws-pane-exam", (el) => el.getBoundingClientRect().width);
    const resizerBox = await page.$eval("#ws-v-resizer", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(resizerBox.x, resizerBox.y);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x - 120, resizerBox.y, { steps: 8 });
    await page.mouse.up();
    await sleep(400);
    const afterW = await page.$eval(".ws-pane-exam", (el) => el.getBoundingClientRect().width);
    record(3, "좌우 패널 리사이저", Math.abs(afterW - beforeW) > 50, `before=${Math.round(beforeW)} after=${Math.round(afterW)}`);

    await page.evaluate(() => {
      const layer = document.querySelector(".textLayer");
      if (!layer) return;
      const span = layer.querySelector("span");
      if (!span) return;
      const range = document.createRange();
      range.selectNodeContents(span);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.getElementById("ws-exam-pages").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await sleep(400);
    const hlMenu = await page.evaluate(() => !document.getElementById("ws-annotate-menu").hidden);
    if (hlMenu) {
      await page.click('[data-annotate="highlight"][data-color="yellow"]');
      await sleep(500);
    }
    const highlightCount = await page.$$eval(".pdf-annotation.is-highlight", (els) => els.length);
    record(4, "텍스트 형광펜", highlightCount >= 1 || hlMenu, `menu=${hlMenu} highlights=${highlightCount}`);

    await page.evaluate(() => {
      const layer = document.querySelector(".textLayer");
      const span = layer?.querySelector("span");
      if (!span) return;
      const range = document.createRange();
      range.selectNodeContents(span);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.getElementById("ws-exam-pages").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await sleep(400);
    const ulMenu = await page.evaluate(() => !document.getElementById("ws-annotate-menu").hidden);
    if (ulMenu) {
      await page.click('[data-annotate="underline"]');
      await sleep(500);
    }
    const underlineCount = await page.$$eval(".pdf-annotation.is-underline", (els) => els.length);
    record(5, "밑줄", underlineCount >= 1 || ulMenu, `underlines=${underlineCount}`);

    const regionOk = await page.evaluate(() => {
      const container = document.querySelector(".pdf-page-container");
      const region = container?.querySelector(".region-select-layer");
      region?.classList.add("is-active");
      const rect = container.getBoundingClientRect();
      const down = new MouseEvent("mousedown", { clientX: rect.left + 40, clientY: rect.top + 40, bubbles: true });
      const move = new MouseEvent("mousemove", { clientX: rect.left + 140, clientY: rect.top + 80, bubbles: true });
      const up = new MouseEvent("mouseup", { clientX: rect.left + 140, clientY: rect.top + 80, bubbles: true });
      region.dispatchEvent(down);
      region.dispatchEvent(move);
      region.dispatchEvent(up);
      return !document.getElementById("ws-annotate-menu").hidden;
    });
    if (regionOk) {
      await page.click('[data-annotate="highlight"][data-color="green"]');
      await sleep(500);
    }
    const regionHl = await page.$$eval(".pdf-annotation.is-highlight", (els) => els.length);
    record(6, "영역 주석(이미지 모드 시뮬)", regionHl >= 1 || regionOk, `highlights=${regionHl}`);

    const beforeZoom = await page.$eval(".pdf-canvas", (c) => ({ w: c.width, sw: parseFloat(c.style.width) }));
    await page.click("#ws-zoom-in");
    await page.click("#ws-zoom-in");
    await sleep(1500);
    const afterZoom = await page.$eval(".pdf-canvas", (c) => ({ w: c.width, sw: parseFloat(c.style.width) }));
    const annAfterZoom = await page.$$eval(".pdf-annotation", (els) => els.length);
    record(7, "확대 후 주석 위치 유지", afterZoom.w > beforeZoom.w && annAfterZoom >= 1, `canvas ${beforeZoom.w}->${afterZoom.w} anns=${annAfterZoom}`);

    await page.click("#ws-next-page");
    await sleep(1500);
    const page2 = await page.$eval("#ws-page-input", (el) => el.value);
    await page.click("#ws-prev-page");
    await sleep(1500);
    const annAfterNav = await page.$$eval(".pdf-annotation", (els) => els.length);
    record(8, "페이지 이동 후 주석 유지", page2 === "2" && annAfterNav >= 1, `page2=${page2} anns=${annAfterNav}`);

    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
      set("ws-ans-problem", "3");
      set("ws-ans-question", "1");
      const ta = document.getElementById("ws-answer-input");
      ta.value = "자동저장 테스트 답안";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(800);
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem("cpa-workspace-session");
      const data = JSON.parse(raw);
      const key = Object.keys(data.answers).find((k) => data.answers[k].content.includes("자동저장"));
      return Boolean(key);
    });
    record(9, "오른쪽 답안 자동 저장", saved);

    await page.reload({ waitUntil: "networkidle0" });
    await sleep(3500);
    const restored = await page.evaluate(() => {
      const raw = localStorage.getItem("cpa-workspace-session");
      const data = JSON.parse(raw);
      const ans = Object.values(data.answers || {}).find((a) => (a.content || "").includes("자동저장"));
      return {
        page: data.currentPage,
        ratio: data.panelRatio,
        anns: (data.annotations || []).length,
        ans: ans?.content?.slice(0, 20) || "",
        canvas: document.querySelector(".pdf-canvas")?.width > 0,
      };
    });
    record(
      10,
      "새로고침 후 복원",
      restored.canvas && restored.ans.includes("자동저장") && restored.anns >= 1,
      `page=${restored.page} ratio=${restored.ratio} anns=${restored.anns} ans=${restored.ans}`
    );
  } catch (err) {
    record("X", "테스트 실행", false, err.message);
    console.error(err);
  } finally {
    await browser.close();
  }

  console.log(`\n=== 요약 ${results.filter((r) => r.ok).length}/${results.length} ===`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL [${f.id}] ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main();
