/**
 * CPA Workspace v2 검증 (11항목)
 * - 자유 주석, 10×25 답안지, 번호 매기기, 다중 PDF
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const NODE = "C:\\Program Files\\nodejs\\node.exe";
const results = [];

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadPdf(page, filePath) {
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(filePath);
  await page.waitForFunction(() => document.querySelector(".pdf-canvas")?.width > 0, { timeout: 45000 });
  await sleep(1500);
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF not found: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdf2Path = path.join(path.dirname(PDF_PATH), "_test-copy-2026.pdf");
  fs.copyFileSync(PDF_PATH, pdf2Path);

  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 20000 });
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
    await sleep(500);

    // 8. 큰 회색 안내 영역 제거
    const emptyUi = await page.evaluate(() => ({
      hasBigEmpty: Boolean(document.querySelector(".ws-exam-empty")),
      hintText: document.getElementById("ws-exam-hint")?.textContent?.trim() || "",
      hintVisible: !document.getElementById("ws-exam-hint")?.hidden,
    }));
    record(
      8,
      "큰 회색 업로드 안내 제거",
      !emptyUi.hasBigEmpty && emptyUi.hintVisible && emptyUi.hintText.includes("기출"),
      JSON.stringify(emptyUi)
    );

    await uploadPdf(page, PDF_PATH);

    // 1. 직선 밑줄 그리기
    await page.click("#ws-tool-underline");
    const drawBox = await page.$eval(".draw-interact-layer", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width * 0.2, y: r.y + r.height * 0.5, w: r.width * 0.4 };
    });
    await page.mouse.move(drawBox.x, drawBox.y);
    await page.mouse.down();
    await page.mouse.move(drawBox.x + drawBox.w, drawBox.y, { steps: 5 });
    await page.mouse.up();
    await sleep(400);

    const lineCount = await page.$$eval(".draw-layer .draw-line", (els) => els.length);
    record(1, "마우스로 직선 밑줄 그리기", lineCount >= 1, `lines=${lineCount}`);

    // 2. 밑줄 수정 (핸들 드래그)
    await page.click("#ws-tool-cursor");
    const lineBox = await page.$eval(".draw-layer line", (ln) => {
      const r = ln.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(lineBox.x, lineBox.y);
    await sleep(200);
    const x2Before = await page.$eval(".draw-layer line", (ln) => Number(ln.getAttribute("x2")));
    const handle = await page.$(".draw-handle[data-handle='end']");
    if (handle) {
      const hbox = await handle.boundingBox();
      await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
      await page.mouse.down();
      await page.mouse.move(hbox.x + hbox.width / 2 + 40, hbox.y + hbox.height / 2, { steps: 4 });
      await page.mouse.up();
      await sleep(300);
    }
    const x2After = await page.$eval(".draw-layer line", (ln) => Number(ln.getAttribute("x2")));
    record(2, "밑줄 길이·위치 수정", Boolean(handle) && Math.abs(x2After - x2Before) > 1, `before=${x2Before} after=${x2After}`);

    const annBeforeZoom = await page.evaluate(() => {
      const ln = document.querySelector(".draw-layer line");
      return ln ? { x1: ln.getAttribute("x1"), x2: ln.getAttribute("x2") } : null;
    });

    // 3. 확대/축소·페이지 이동 후 위치 유지
    await page.click("#ws-zoom-in");
    await page.click("#ws-zoom-in");
    await sleep(800);
    await page.click("#ws-next-page");
    await sleep(800);
    await page.click("#ws-prev-page");
    await sleep(800);
    const annAfterNav = await page.evaluate(() => {
      const ln = document.querySelector(".draw-layer line");
      return ln ? { x1: ln.getAttribute("x1"), x2: ln.getAttribute("x2") } : null;
    });
    record(
      3,
      "확대/축소·페이지 이동 후 밑줄 유지",
      annBeforeZoom && annAfterNav && annBeforeZoom.x1 === annAfterNav.x1 && annBeforeZoom.x2 === annAfterNav.x2,
      `before=${JSON.stringify(annBeforeZoom)} after=${JSON.stringify(annAfterNav)}`
    );

    // 4. 번호 ①②③ 순차
    await page.click('[data-row-input="0"]');
    await page.click("#ws-number");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await sleep(300);
    const rowTexts = await page.$$eval("[data-row-input]", (cells) =>
      cells.slice(0, 3).map((c) => c.textContent.trim())
    );
    const numsOk =
      /^①/.test(rowTexts[0]) && /^②/.test(rowTexts[1]) && /^③/.test(rowTexts[2]);
    record(4, "번호 ①②③ 순차 증가", numsOk, rowTexts.join(" | "));

    // 5. 답안지 10페이지
    const ansNav = await page.evaluate(() => ({
      max: document.getElementById("ws-ans-page-input")?.max,
      label: document.getElementById("ws-ans-page-label")?.textContent,
      nextDisabledOn10: null,
    }));
    await page.evaluate(() => {
      const inp = document.getElementById("ws-ans-page-input");
      if (inp) {
        inp.value = "10";
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(400);
    const onPage10 = await page.evaluate(() => ({
      page: document.querySelector(".answer-sheet-live")?.dataset.page,
      nextDisabled: document.getElementById("ws-ans-next")?.disabled,
    }));
    record(
      5,
      "답안지 10페이지 고정",
      ansNav.label === "10" && onPage10.page === "10" && onPage10.nextDisabled === true,
      `label=${ansNav.label} page=${onPage10.page}`
    );

    // 6. 페이지당 25행
    const rowCount = await page.$$eval(".answer-live-row", (rows) => rows.length);
    record(6, "페이지당 25행", rowCount === 25, `rows=${rowCount}`);

    // 7. 25행 초과 시 다음 페이지 (빈 2페이지에서 테스트)
    await page.evaluate(() => {
      const inp = document.getElementById("ws-ans-page-input");
      if (inp) {
        inp.value = "2";
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(300);
    await page.click('[data-row-input="24"]');
    await page.click("#ws-number");
    await sleep(300);
    await page.keyboard.press("Enter");
    await sleep(500);
    const overflow = await page.evaluate(() => ({
      page: document.querySelector(".answer-sheet-live")?.dataset.page,
      row0: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
    }));
    record(7, "25행 초과 시 다음 페이지", overflow.page === "3" && /^②/.test(overflow.row0), JSON.stringify(overflow));

    // 9. 두 PDF 업로드·전환
    await page.click("#ws-doc-manage");
    await sleep(200);
    await uploadPdf(page, pdf2Path);
    const slotCount = await page.$$eval("#ws-doc-select option", (opts) => opts.length - 1);
    await page.select("#ws-doc-select", await page.$eval("#ws-doc-select option:nth-child(3)", (o) => o.value));
    await sleep(1500);
    const switched = await page.evaluate(() => ({
      slots: document.querySelectorAll("#ws-doc-select option").length - 1,
      hasCanvas: Boolean(document.querySelector(".pdf-canvas")?.width),
    }));
    record(9, "두 PDF 업로드·목록 전환", slotCount >= 2 && switched.slots >= 2 && switched.hasCanvas, `slots=${switched.slots}`);

    // 10. 시험지별 답안·주석 분리
    await page.evaluate(() => {
      const inp = document.getElementById("ws-ans-page-input");
      if (inp) {
        inp.value = "1";
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(300);
    await page.evaluate(() => {
      const cell = document.querySelector('[data-row-input="0"]');
      if (!cell) return;
      cell.textContent = "2026전용답안";
      cell.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(800);
    await page.click("#ws-tool-underline");
    const box2 = await page.$eval(".draw-interact-layer", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width * 0.3, y: r.y + r.height * 0.3 };
    });
    await page.mouse.move(box2.x, box2.y);
    await page.mouse.down();
    await page.mouse.move(box2.x + 80, box2.y, { steps: 3 });
    await page.mouse.up();
    await sleep(800);

    const fp2025 = await page.$eval("#ws-doc-select option:nth-child(2)", (o) => o.value);
    await page.select("#ws-doc-select", fp2025);
    await sleep(1500);
    await page.evaluate(() => {
      const inp = document.getElementById("ws-ans-page-input");
      if (inp) {
        inp.value = "1";
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(400);

    const slot2025 = await page.evaluate(() => ({
      ans: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      lines: document.querySelectorAll(".draw-layer .draw-line").length,
    }));

    await page.select("#ws-doc-select", await page.$eval("#ws-doc-select option:nth-child(3)", (o) => o.value));
    await sleep(1500);
    await page.evaluate(() => {
      const inp = document.getElementById("ws-ans-page-input");
      if (inp) {
        inp.value = "1";
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(400);
    const slot2026 = await page.evaluate(() => ({
      ans: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      lines: document.querySelectorAll(".draw-layer .draw-line").length,
    }));

    record(
      10,
      "시험지별 답안·주석 분리",
      slot2026.ans.includes("2026") && !slot2025.ans.includes("2026") && slot2025.ans.includes("①"),
      `2025="${slot2025.ans}" lines=${slot2025.lines} | 2026="${slot2026.ans}" lines=${slot2026.lines}`
    );

    const lastFp = await page.$eval("#ws-doc-select", (sel) => sel.value);
    await sleep(1200);

    // 11. 새로고침 후 복원
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(3500);
    await page.evaluate(() => {
      const inp = document.getElementById("ws-ans-page-input");
      if (inp) {
        inp.value = "1";
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(500);
    const restored = await page.evaluate(() => ({
      fp: document.getElementById("ws-doc-select")?.value,
      ans: document.querySelector('[data-row-input="0"]')?.textContent?.trim() || "",
      hasPdf: Boolean(document.querySelector(".pdf-canvas")?.width),
      hintHidden: document.getElementById("ws-exam-hint")?.hidden,
    }));
    record(
      11,
      "새로고침 후 마지막 시험지·상태 복원",
      restored.hasPdf && restored.hintHidden && restored.fp === lastFp && restored.ans.includes("2026"),
      JSON.stringify(restored)
    );
  } catch (err) {
    console.error("Test error:", err);
    record(0, "테스트 실행", false, err.message);
  } finally {
    try {
      fs.unlinkSync(path.join(path.dirname(PDF_PATH), "_test-copy-2026.pdf"));
    } catch (_) {}
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  console.log(`${passed}/${results.length} passed`);
  if (failed.length) {
    console.log("Failed:", failed.map((f) => `[${f.id}] ${f.name}`).join(", "));
    process.exit(1);
  }
}

main();
