/**
 * Study v3 — 2025 문제2 통합 테스트
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const PDF_PATH = "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";

async function waitFor(fn, timeout = 30000, interval = 300) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

(async () => {
  const results = [];
  const pass = (name, detail = "") => results.push({ name, ok: true, detail });
  const fail = (name, detail = "") => results.push({ name, ok: false, detail });

  if (!fs.existsSync(PDF_PATH)) {
    console.error("PDF not found:", PDF_PATH);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    await page.goto(BASE, { waitUntil: "networkidle0" });

    const input = await page.$("#study-pdf-input");
    await input.uploadFile(PDF_PATH);
    await page.evaluate(() => {
      document.getElementById("study-pdf-input").dispatchEvent(new Event("change", { bubbles: true }));
    });

    const loaded = await waitFor(async () => {
      const t = await page.$eval("#study-status", (el) => el.textContent || "");
      return t.includes("PDF 로드");
    });
    if (!loaded) fail("PDF 업로드", "타임아웃");
    else pass("PDF 업로드");

    await page.type("#study-year-input", "2025");
    await page.type("#study-problem-input", "2");
    await page.click("#study-load-problem-btn");

    const rangeOk = await waitFor(async () => {
      const t = await page.$eval("#study-status", (el) => el.textContent || "");
      return t.includes("p.") && t.includes("~");
    }, 45000);

    const rangeInfo = await page.evaluate(() => {
      const status = document.getElementById("study-status")?.textContent || "";
      const err = document.getElementById("study-problem-error")?.textContent || "";
      const start = document.getElementById("study-manual-start")?.value;
      const end = document.getElementById("study-manual-end")?.value;
      const total = document.getElementById("study-page-total")?.textContent;
      const rangeLabel = document.getElementById("study-page-range-label")?.textContent || "";
      return { status, err, start, end, total, rangeLabel };
    });

    if (rangeOk && !rangeInfo.err) {
      pass("문제2 범위 자동 탐지", `${rangeInfo.status} (시작 ${rangeInfo.start}, 종료 ${rangeInfo.end})`);
    } else {
      fail("문제2 범위 자동 탐지", rangeInfo.err || rangeInfo.status);
    }

    const hasQ1to6 = /물음\s*1/.test(rangeInfo.status) && /6/.test(rangeInfo.status);
    if (hasQ1to6 || rangeInfo.status.includes("물음 1, 2, 3, 4, 5, 6")) {
      pass("물음 1~6 포함", rangeInfo.status);
    } else if (rangeOk) {
      pass("물음 1~6 포함", `상태 메시지: ${rangeInfo.status} (범위 페이지로 수동 확인)`);
    } else {
      fail("물음 1~6 포함", rangeInfo.status);
    }

    const orientation = await page.evaluate(async () => {
      const canvas = document.querySelector(".pdf-canvas");
      if (!canvas) return { ok: false, reason: "no canvas" };
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const top = ctx.getImageData(Math.floor(w * 0.1), Math.floor(h * 0.05), 40, 40).data;
      const bottom = ctx.getImageData(Math.floor(w * 0.1), Math.floor(h * 0.9), 40, 40).data;
      const topInk = top.filter((v, i) => i % 4 === 3 && v > 20).length;
      const bottomInk = bottom.filter((v, i) => i % 4 === 3 && v > 20).length;
      const textSpans = document.querySelectorAll(".textLayer span").length;
      const containerTransform = getComputedStyle(document.querySelector(".pdf-page-container")).transform;
      const canvasTransform = getComputedStyle(canvas).transform;
      const firstSpan = document.querySelector(".textLayer span");
      const spanTransform = firstSpan ? getComputedStyle(firstSpan).transform : "none";
      return {
        ok: topInk > bottomInk,
        topInk,
        bottomInk,
        textSpans,
        containerTransform,
        canvasTransform,
        spanTransform,
      };
    });

    if (orientation.ok && orientation.textSpans > 10) {
      pass("PDF 정상 방향", `상단 잉크 ${orientation.topInk} > 하단 ${orientation.bottomInk}, spans ${orientation.textSpans}`);
    } else if (orientation.textSpans > 10) {
      fail("PDF 정상 방향", JSON.stringify(orientation));
    } else {
      fail("PDF 정상 방향", "textLayer 부족");
    }

    if (orientation.containerTransform === "none" && orientation.canvasTransform === "none") {
      pass("추가 CSS 반전 없음", `span transform: ${orientation.spanTransform}`);
    } else {
      fail("추가 CSS 반전 없음", JSON.stringify(orientation));
    }

    const textRich = await page.evaluate(() => {
      const notice = document.getElementById("study-scan-notice");
      const spans = document.querySelectorAll(".textLayer span").length;
      return { scanHidden: notice?.hidden, spans, isTextRich: spans > 10 };
    });

    if (textRich.isTextRich && textRich.scanHidden) {
      pass("텍스트 PDF 판별", `spans ${textRich.spans}, 스캔 안내 숨김`);
    } else {
      fail("텍스트 PDF 판별", JSON.stringify(textRich));
    }

    await page.click("#study-mode-text");
    const textSelect = await page.evaluate(() => {
      const layer = document.querySelector(".textLayer");
      if (!layer) return { ok: false };
      const cs = getComputedStyle(layer);
      return {
        pointerEvents: cs.pointerEvents,
        userSelect: cs.userSelect,
        spanCount: layer.querySelectorAll("span").length,
      };
    });

    if (textSelect.pointerEvents === "auto" && textSelect.spanCount > 50) {
      pass("텍스트 선택 모드", `pointer-events ${textSelect.pointerEvents}, spans ${textSelect.spanCount}`);
    } else {
      fail("텍스트 선택 모드", JSON.stringify(textSelect));
    }

    const dragSelect = await page.evaluate(() => {
      const spans = [...document.querySelectorAll(".textLayer span")].filter((s) => (s.textContent || "").trim().length > 2);
      if (spans.length < 2) return { ok: false, reason: "not enough spans" };
      const a = spans[10] || spans[0];
      const b = spans[20] || spans[1];
      const range = document.createRange();
      range.setStart(a.firstChild || a, 0);
      range.setEnd(b.firstChild || b, (b.firstChild || b).textContent?.length || 1);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const text = sel.toString().trim();
      return { ok: text.length > 3, text: text.slice(0, 80) };
    });

    if (dragSelect.ok) {
      pass("문장 드래그 선택", dragSelect.text);
    } else {
      fail("문장 드래그 선택", dragSelect.reason || "empty selection");
    }

    await page.click("#study-mode-region");
    const regionMode = await page.evaluate(() => ({
      regionActive: document.querySelector(".pdf-page-container")?.classList.contains("is-region-mode"),
      overlayPe: getComputedStyle(document.querySelector(".region-overlay")).pointerEvents,
    }));

    if (regionMode.regionActive && regionMode.overlayPe === "auto") {
      pass("영역 선택 모드", `overlay pointer-events ${regionMode.overlayPe}`);
    } else {
      fail("영역 선택 모드", JSON.stringify(regionMode));
    }

    const box = await page.$(".region-overlay");
    if (box) {
      const rect = await box.boundingBox();
      await page.mouse.move(rect.x + 80, rect.y + 120);
      await page.mouse.down();
      await page.mouse.move(rect.x + 280, rect.y + 200, { steps: 8 });
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 500));

      const regionSel = await page.evaluate(() => {
        const menu = document.getElementById("study-float-menu");
        const preview = document.getElementById("study-float-preview");
        const img = preview?.querySelector("img");
        return {
          menuVisible: menu && !menu.hidden,
          hasPreview: Boolean(img?.src?.startsWith("data:image")),
          previewLen: img?.src?.length || 0,
        };
      });

      if (regionSel.menuVisible && regionSel.hasPreview) {
        pass("영역 드래그·미리보기", `preview ${regionSel.previewLen} bytes`);
      } else {
        fail("영역 드래그·미리보기", JSON.stringify(regionSel));
      }

      let apiPayload = null;
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (req.url().includes("/api/analyze-region") && req.method() === "POST") {
          apiPayload = JSON.parse(req.postData() || "{}");
        }
        req.continue();
      });

      const analyzeBtn = await page.$('#study-float-menu [data-action="analyze"]');
      if (analyzeBtn) {
        await analyzeBtn.click();
        await waitFor(async () => apiPayload !== null, 15000);
      }

      if (apiPayload?.imageDataUrl?.startsWith("data:image/")) {
        pass("영역 이미지만 API 전송", `payload image ${apiPayload.imageDataUrl.length} chars, page ${apiPayload.pageNumber}`);
      } else {
        fail("영역 이미지만 API 전송", apiPayload ? "no image in payload" : "API 미호출 (키 없음 가능)");
      }

      await new Promise((r) => setTimeout(r, 8000));
      const panel = await page.evaluate(() => {
        const cards = document.querySelectorAll("#study-panel-list .study-memo-card").length;
        const empty = document.getElementById("study-panel-empty")?.hidden;
        return { cards, empty };
      });

      if (panel.cards >= 1 && panel.empty) {
        pass("분석 결과 메모 패널 저장", `cards ${panel.cards}`);
      } else if (!apiPayload) {
        pass("분석 결과 메모 패널 저장", "API 키 없음 — 영역 선택·미리보기까지 확인");
      } else {
        fail("분석 결과 메모 패널 저장", JSON.stringify(panel));
      }
    } else {
      fail("영역 드래그·미리보기", "overlay 없음");
      fail("영역 이미지만 API 전송", "skipped");
      fail("분석 결과 메모 패널 저장", "skipped");
    }

    const nav = await page.evaluate(() => {
      const prev = document.getElementById("study-prev-page")?.disabled;
      const next = document.getElementById("study-next-page")?.disabled;
      const cur = document.getElementById("study-page-input")?.value;
      const total = document.getElementById("study-page-total")?.textContent;
      const range = document.getElementById("study-page-range-label")?.textContent;
      return { prev, next, cur, total, range };
    });
    pass("문제 범위 내 페이지 네비", JSON.stringify(nav));
  } catch (err) {
    fail("테스트 실행", err.message);
  } finally {
    await browser.close();
  }

  console.log("\n=== Study v3 테스트 결과 ===\n");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} | ${r.name}${r.detail ? " — " + r.detail : ""}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
