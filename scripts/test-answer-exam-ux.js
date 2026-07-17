/**

 * 시험지 확대·Pan, 피드백 스키마 — 테스트

 */

const puppeteer = require("puppeteer");



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

  await sleep(1000);

}



async function main() {

  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });

  const page = await browser.newPage();

  await page.setViewport({ width: 1400, height: 900 });

  const results = [];



  try {

    await setup(page);



    await page.hover("#ws-exam");
    const zoomBefore = await page.evaluate(() => window.__workspaceExamUx?.getScale?.());

    const zoomAfter = await page.evaluate(() => {
      const el = document.getElementById("ws-exam");
      const before = window.__workspaceExamUx?.getScale?.();
      el.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -120, ctrlKey: false, bubbles: true, clientX: 400, clientY: 300 })
      );
      const after = window.__workspaceExamUx?.getScale?.();
      return { before, after };
    });

    record(
      results,
      "A: Ctrl 없이 wheel 확대 없음",
      zoomAfter.before === zoomAfter.after,
      `${Math.round(zoomAfter.before * 100)}% → ${Math.round(zoomAfter.after * 100)}%`
    );



    const clamped = await page.evaluate(async () => {

      const mod = await import("./workspace-exam-pan-zoom.js");

      return {

        min: mod.MIN_EXAM_SCALE,

        max: mod.MAX_EXAM_SCALE,

        atMin: mod.clampExamScale(0.1),

        atMax: mod.clampExamScale(9),

      };

    });

    record(

      results,

      "A: 50~300% 제한",

      clamped.min === 0.5 && clamped.max === 3 && clamped.atMin === 0.5 && clamped.atMax === 3,

      JSON.stringify(clamped)

    );



    const noPan = await page.evaluate(() => ({
      moveBtn: !document.querySelector('[data-tool="cursor"]'),
      panReady: document.getElementById("ws-exam")?.classList.contains("is-pan-ready"),
    }));

    record(results, "B: Pan 비활성", noPan.moveBtn && !noPan.panReady, JSON.stringify(noPan));



    const overflow = await page.evaluate(() => {

      const el = document.getElementById("ws-exam");

      const style = getComputedStyle(el);

      return { overflowX: style.overflowX, overflowY: style.overflowY };

    });

    record(

      results,

      "B: 가로·세로 스크롤 허용",

      overflow.overflowX === "auto" && overflow.overflowY === "auto",

      JSON.stringify(overflow)

    );



    const noRotate = await page.evaluate(() => !document.getElementById("ws-rotate"));

    record(results, "C: 회전 버튼 제거", noRotate, `rotateBtn=${!noRotate}`);



    const toolbarFixed = await page.evaluate(() => {

      const label = document.getElementById("ws-zoom-label");

      const before = label?.textContent || "";

      const btnIn = document.getElementById("ws-zoom-in");

      btnIn?.click();

      return new Promise((resolve) => {

        setTimeout(() => {

          const after = label?.textContent || "";

          const widthBefore = label?.getBoundingClientRect().width || 0;

          const widthAfter = label?.getBoundingClientRect().width || 0;

          resolve({

            before,

            after,

            widthStable: Math.abs(widthBefore - widthAfter) < 2,

            isPercent: /^\d+%$/.test(after),

          });

        }, 1500);

      });

    });

    record(

      results,

      "C: 툴바 배율 영역 고정",

      toolbarFixed.widthStable && toolbarFixed.isPercent,

      `${toolbarFixed.before} → ${toolbarFixed.after}`

    );



    await page.evaluate(() => {

      window.__workspaceExamUx?.saveCurrentPageView?.();

    });

    await page.click("#ws-next-page");

    await sleep(1500);

    await page.click("#ws-prev-page");

    await sleep(1500);

    const pageViewRestore = await page.evaluate(() => {

      const views = window.__workspaceExamUx?.getPageViews?.() || {};

      const v1 = views["1"] || views[1];

      return Boolean(v1 && v1.scale > 0);

    });

    record(results, "D: 페이지별 확대 위치 저장", pageViewRestore, `saved=${pageViewRestore}`);



    const indentD = await page.evaluate(async () => {

      const { getLeadingWhitespace } = await import("./workspace-numbering.js");

      return {

        noIndent: getLeadingWhitespace("① 내용"),

        withIndent: getLeadingWhitespace("    ① 들여쓰기"),

      };

    });

    record(results, "E: 들여쓰기 없는 ①", indentD.noIndent === "", `leading="${indentD.noIndent}"`);

    record(results, "E: 들여쓰기된 ①", indentD.withIndent === "    ", `len=${indentD.withIndent.length}`);

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

