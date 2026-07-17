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

    await page.evaluate(() => {

      const el = document.getElementById("ws-exam");

      el.dispatchEvent(

        new WheelEvent("wheel", { deltaY: -120, ctrlKey: false, bubbles: true, clientX: 400, clientY: 300 })

      );

    });

    await sleep(1200);

    const zoomAfter = await page.evaluate(() => window.__workspaceExamUx?.getScale?.());

    record(

      results,

      "A: Ctrl 없이 wheel 확대",

      zoomAfter > zoomBefore,

      `${Math.round(zoomBefore * 100)}% → ${Math.round(zoomAfter * 100)}%`

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



    await page.hover("#ws-exam");
    await sleep(200);
    const panReady = await page.evaluate(() => document.getElementById("ws-exam")?.classList.contains("is-pan-ready"));

    record(results, "B: 커서 모드 pan 준비", panReady, `panReady=${panReady}`);



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



    const feedbackSchema = await page.evaluate(async () => {

      const mod = await import("./workspace-answer-feedback.js");

      const normalized = mod.normalizeFeedbackPayload({

        items: [

          {

            location: { page: 1, question: "물음2", item: "③" },

            type: "replace",

            original: "업무에서 제외한다.",

            suggestion: "해당 공인회계사를 감사업무에서 제외한다.",

            reason: "적용 대상과 범위가 명확해집니다.",

          },

          {

            location: { page: 2, question: "물음6", item: "④" },

            type: "delete",

            original: "이유를 모르겠어 ㅋㅋ",

            suggestion: "",

            reason: "요구사항과 관련이 없거나 시험 답안으로 적절하지 않은 내용입니다.",

          },

        ],

        repeatedHabits: [{ label: "목적어 생략", count: 2, advice: "대상을 함께 작성하세요." }],

      });

      const html = mod.formatFeedbackAsHtml(normalized);

      const prompt = mod.ANSWER_FEEDBACK_SYSTEM_PROMPT;

      return {

        itemCount: normalized.items.length,

        hasReplace: normalized.items.some((i) => i.type === "replace" && i.suggestion),

        hasDelete: normalized.items.some((i) => i.type === "delete"),

        htmlHasDelete: html.includes("삭제 권장"),

        noAbstractPraise: !prompt.includes("잘 작성된 점") && prompt.includes("당연한 형식 준수"),

        bansVagueOnly: prompt.includes("구체적인 수정안이 없는 피드백은 출력하지 마세요"),

      };

    });

    record(results, "F: 피드백 JSON 스키마", feedbackSchema.itemCount === 2, `items=${feedbackSchema.itemCount}`);

    record(results, "F: replace 항목에 수정안", feedbackSchema.hasReplace, "");

    record(results, "F: delete 항목 UI", feedbackSchema.hasDelete && feedbackSchema.htmlHasDelete, "");

    record(

      results,

      "G: 프롬프트 — 당연한 형식 칭찬 금지",

      feedbackSchema.noAbstractPraise && feedbackSchema.bansVagueOnly,

      ""

    );



    const apiOk = await page.evaluate(async () => {

      const res = await fetch("/api/answer-feedback/health");

      const ct = res.headers.get("content-type") || "";

      return { status: res.status, isJson: ct.includes("application/json") };

    });

    record(results, "H: 피드백 API health JSON", apiOk.status === 200 && apiOk.isJson, `status=${apiOk.status}`);



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

