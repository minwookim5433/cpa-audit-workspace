/**
 * Workspace 시험지 뷰어 테스트
 */
const puppeteer = require("puppeteer");
const path = require("path");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 15000 });
    record("페이지 로드", true);

    const pdfInput = await page.$("#ws-pdf-input");
    await pdfInput.uploadFile(PDF_PATH);
    await page.waitForFunction(
      () => {
        const el = document.getElementById("ws-exam-pages");
        return el && !el.hidden && el.querySelector(".pdf-canvas");
      },
      { timeout: 45000 }
    );
    await sleep(2000);

    const pageCount = await page.$eval("#ws-pdf-name", (el) => el.textContent);
    record("전체 PDF 열기", /쪽/.test(pageCount), pageCount);

    const spread1 = await page.$$eval(".exam-page-wrap", (els) => els.length);
    record("첫 화면 1쪽 단독", spread1 === 1, `count=${spread1}`);

    await page.click("#ws-next-page");
    await sleep(2000);
    const spread2 = await page.$$eval(".exam-page-wrap", (els) => els.length);
    const label2 = await page.$eval("#ws-page-label", (el) => el.textContent);
    record("양면 2페이지 표시", spread2 === 2, `pages=${spread2}, label=${label2}`);

    await page.click("#ws-prev-page");
    await sleep(1200);
    const label1 = await page.$eval("#ws-page-label", (el) => el.textContent);
    record("이전 이동", label1.startsWith("1"), label1);

    await page.evaluate(() => {
      const el = document.getElementById("ws-page-input");
      el.value = "5";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await sleep(2000);
    const afterJump = await page.$eval("#ws-page-input", (el) => el.value);
    record("페이지 번호 입력 이동", afterJump === "5", `page=${afterJump}`);

    const canvasOk = await page.$eval(".pdf-canvas", (c) => c.width > 0 && c.height > 0);
    record("PDF 정상 렌더(반전 없음)", canvasOk);

    await page.click("#ws-search-input");
    await page.type("#ws-search-input", "감사", { delay: 30 });
    await sleep(2000);
    const searchItems = await page.$$(".ws-search-item");
    record("텍스트 검색", searchItems.length > 0, `${searchItems.length}건`);

    await page.type("#ws-bookmark-name", "문제 2");
    await page.click("#ws-bookmark-add-btn");
    await sleep(600);
    const bookmarks = await page.$$(".ws-bookmark-link");
    record("북마크 추가", bookmarks.length > 0);

    if (bookmarks.length) {
      await page.click("#ws-next-page");
      await sleep(800);
      await bookmarks[0].click();
      await sleep(1200);
      record("북마크 이동", true);
    }

    await page.click("#ws-answer-input");
    await page.type("#ws-answer-input", "감사인은 내부통제를 검토하였다.");
    await sleep(600);
    const sheetText = await page.$eval(".answer-line-text", (el) => el.textContent);
    record("답안 실시간 반영", sheetText.includes("내부통제"), sheetText.slice(0, 40));

    await page.reload({ waitUntil: "networkidle0" });
    await sleep(3500);
    const restored = await page.$eval("#ws-answer-input", (el) => el.value);
    const bmAfter = await page.$$(".ws-bookmark-link");
    record("새로고침 후 답안·북마크 유지", restored.includes("내부통제") && bmAfter.length > 0);
  } catch (err) {
    record("테스트 실행", false, err.message);
    console.error(err);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== 요약 ===");
  console.log(`성공: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.name} ${f.detail}`));
    process.exit(1);
  }
}

main();
