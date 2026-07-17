/**
 * Study Annotator 상호작용 테스트 — 단일 페이지 · 텍스트 선택 · 메모
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const puppeteer = require("puppeteer");

const PDF_PATH = "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

const results = [];

function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${step}: ${detail}`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  const consoleLogs = [];
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[Study]")) consoleLogs.push(t);
  });
  page.on("dialog", async (dialog) => {
    await dialog.accept("E2E 테스트 메모");
  });

  await page.goto(BASE, { waitUntil: "networkidle0" });

  const input = await page.$("#study-pdf-input");
  await input.uploadFile(PDF_PATH);

  await page.waitForFunction(
    () => {
      const status = document.getElementById("study-status")?.textContent || "";
      return document.querySelector(".pdf-page-container") && status.includes("페이지");
    },
    { timeout: 120000 }
  );

  const afterLoad = await page.evaluate(() => ({
    containers: document.querySelectorAll(".pdf-page-container").length,
    total: document.getElementById("study-page-total")?.textContent,
    pageInput: document.getElementById("study-page-input")?.value,
  }));
  log("1. 단일 페이지 표시", afterLoad.containers === 1, `컨테이너 ${afterLoad.containers}개, 전체 ${afterLoad.total}페이지`);

  await page.click("#study-next-page");
  await page.waitForFunction(() => document.getElementById("study-page-input")?.value === "2");
  const page2 = await page.$eval("#study-page-input", (el) => el.value);
  log("2. 다음 페이지 이동", page2 === "2", `현재 페이지 ${page2}`);

  await page.click("#study-prev-page");
  await page.waitForFunction(() => document.getElementById("study-page-input")?.value === "1");
  log("3. 이전 페이지 이동", true, "페이지 1 복귀");

  const zoomBefore = await page.$eval("#study-zoom-label", (el) => el.textContent);
  await page.click("#study-zoom-in");
  await page.waitForFunction(
    (b) => document.getElementById("study-zoom-label")?.textContent !== b,
    {},
    zoomBefore
  );
  const zoomAfter = await page.$eval("#study-zoom-label", (el) => el.textContent);
  log("4. 확대/축소", zoomAfter !== zoomBefore, `${zoomBefore} → ${zoomAfter}`);

  const layerDiag = await page.evaluate(() => {
    const container = document.querySelector(".pdf-page-container");
    const canvas = container?.querySelector(".pdf-canvas");
    const textLayer = container?.querySelector(".textLayer");
    const ann = container?.querySelector(".annotation-layer");
    const cs = textLayer ? getComputedStyle(textLayer) : null;
    return {
      hasContainer: !!container,
      hasCanvas: !!canvas,
      hasTextLayer: !!textLayer,
      hasAnnotation: !!ann,
      spanCount: textLayer?.querySelectorAll("span").length || 0,
      textLayerW: cs?.width,
      textLayerH: cs?.height,
      zIndex: cs?.zIndex,
      pointerEvents: cs?.pointerEvents,
      userSelect: cs?.userSelect,
      canvasPointer: canvas ? getComputedStyle(canvas).pointerEvents : null,
    };
  });
  log(
    "5. textLayer DOM",
    layerDiag.hasTextLayer && layerDiag.spanCount > 0,
    JSON.stringify(layerDiag)
  );

  const selectionTest = await page.evaluate(() => {
    const container = document.querySelector(".pdf-page-container");
    const spans = [...container.querySelectorAll(".textLayer span")].filter((s) => s.textContent?.trim());
    if (spans.length < 2) return { ok: false, reason: "not-enough-spans", count: spans.length };

    const start = spans[0];
    const end = spans[Math.min(8, spans.length - 1)];
    const range = document.createRange();
    const startNode = start.firstChild || start;
    const endNode = end.firstChild || end;
    range.setStart(startNode, 0);
    range.setEnd(endNode, endNode.textContent?.length || 0);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const selected = sel.toString().trim();

    container.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    return { ok: selected.length > 2, selected: selected.slice(0, 80), len: selected.length };
  });

  await new Promise((r) => setTimeout(r, 50));

  const floatVisible = await page.evaluate(() => !document.getElementById("study-float-menu").hidden);
  log(
    "6. 텍스트 드래그 선택",
    selectionTest.ok,
    selectionTest.selected || selectionTest.reason || "empty"
  );
  log(
    "7. 플로팅 버튼 표시",
    floatVisible,
    floatVisible ? "표시됨" : "숨김"
  );
  log(
    "8. 콘솔 선택 로그",
    consoleLogs.some((l) => l.includes("선택 텍스트")),
    consoleLogs.find((l) => l.includes("선택 텍스트")) || "(없음)"
  );

  if (floatVisible) {
    await page.evaluate(() => {
      document.querySelector('#study-float-menu [data-action="memo"]').click();
    });
    await page.waitForFunction(() => document.querySelectorAll(".study-memo-card").length >= 1, {
      timeout: 30000,
    });
  }

  const cardCount = await page.$$eval(".study-memo-card", (els) => els.length);
  log("9. 메모 패널 저장", cardCount >= 1, `카드 ${cardCount}개`);

  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => document.querySelector(".pdf-page-container") && document.querySelectorAll(".study-memo-card").length >= 1,
    { timeout: 120000 }
  );

  const afterReload = await page.evaluate(() => ({
    containers: document.querySelectorAll(".pdf-page-container").length,
    cards: document.querySelectorAll(".study-memo-card").length,
    highlights: document.querySelectorAll(".study-highlight").length,
    page: document.getElementById("study-page-input")?.value,
    zoom: document.getElementById("study-zoom-label")?.textContent,
  }));
  log(
    "10. 새로고침 후 유지",
    afterReload.cards >= 1 && afterReload.containers === 1,
    JSON.stringify(afterReload)
  );

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("\n========== 요약 ==========");
  console.log(`통과 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(` - ${f.step}: ${f.detail}`));
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
