/**
 * 답안 편집기 입력·번호 삽입 버그 수정 검증
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

async function typeInEditor(page, text) {
  await page.click(".answer-doc-editor");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 30 });
  await sleep(600);
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

    const input = await page.$("#ws-pdf-input");
    await input.uploadFile(PDF_PATH);
    await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
    await sleep(1500);

    const samples = [
      "감사인은 내부통제를 검토하였다.",
      "audit procedure",
      "123456789",
      "KSA 570에 따라 검토하였다.",
    ];
    let typingOk = true;
    for (const s of samples) {
      await typeInEditor(page, s);
      const got = await page.$eval(".answer-doc-editor", (el) => el.innerText.trim());
      if (got !== s) {
        typingOk = false;
        record("T0", `연속 입력: ${s.slice(0, 12)}...`, false, `expected="${s}" got="${got}"`);
      }
    }
    record("T0", "두 글자 이상 연속 입력 유지", typingOk, typingOk ? "4문장 모두 유지" : "일부 실패");

    // Test 1: 번호 삽입 중간
    await typeInEditor(page, "감사인은 검토한다.");
    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      const text = ed.innerText;
      const pos = text.indexOf("검");
      const range = document.createRange();
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let rem = pos;
      while (node) {
        const len = node.textContent.length;
        if (rem <= len) {
          range.setStart(node, rem);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          break;
        }
        rem -= len;
        node = walker.nextNode();
      }
    });
    await page.click("#ws-number");
    await sleep(300);
    await page.select("#ws-num-format", "circled");
    await page.evaluate(() => {
      const inp = document.getElementById("ws-num-start");
      inp.value = "3";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#ws-num-insert-one");
    await sleep(500);
    const t1 = await page.$eval(".answer-doc-editor", (el) => el.innerText);
    record(1, "번호 중간 삽입 (③)", t1.includes("③") && /감사인은.*③.*검토/.test(t1.replace(/\s+/g, " ")), t1);

    // Test 2: 빈 줄 (2) 삽입
    await typeInEditor(page, "\n\n");
    await page.click(".answer-doc-editor");
    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.focus();
      const range = document.createRange();
      range.selectNodeContents(ed);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    await page.click("#ws-number");
    await sleep(200);
    await page.select("#ws-num-format", "paren");
    await page.evaluate(() => {
      document.getElementById("ws-num-start").value = "2";
      document.getElementById("ws-num-start").dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#ws-num-insert-one");
    await sleep(400);
    const t2 = await page.$eval(".answer-doc-editor", (el) => el.innerText.trim().startsWith("(2)"));
    record(2, "빈 줄 (2) 첫 클릭 삽입", t2, await page.$eval(".answer-doc-editor", (el) => el.innerText));

    // Test 3: page 2 insertion
    await typeInEditor(page, "페이지1내용");
    await page.evaluate(() => {
      document.getElementById("ws-ans-page-input").value = "2";
      document.getElementById("ws-ans-page-input").dispatchEvent(new Event("change", { bubbles: true }));
    });
    await sleep(500);
    await typeInEditor(page, "페이지2내용");
    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      const range = document.createRange();
      range.selectNodeContents(ed);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    await page.click("#ws-number");
    await sleep(200);
    await page.select("#ws-num-format", "circled");
    await page.evaluate(() => { document.getElementById("ws-num-start").value = "1"; });
    await page.click("#ws-num-insert-one");
    await sleep(400);
    const page2 = await page.evaluate(() => ({
      page: document.querySelector(".answer-doc-sheet")?.dataset.page,
      text: document.querySelector(".answer-doc-editor")?.innerText || "",
    }));
    await page.evaluate(() => {
      document.getElementById("ws-ans-page-input").value = "1";
      document.getElementById("ws-ans-page-input").dispatchEvent(new Event("change", { bubbles: true }));
    });
    await sleep(400);
    const page1 = await page.$eval(".answer-doc-editor", (el) => el.innerText.trim());
    record(
      3,
      "2페이지 번호 삽입 분리",
      page2.page === "2" && page2.text.includes("①") && page1.startsWith("페이지1내용") && !page1.includes("①"),
      `p2=${page2.text.trim()} p1=${page1}`
    );

    // Test 4: 한글 직후 번호
    await typeInEditor(page, "감사인은");
    await page.evaluate(() => {
      const ed = document.querySelector(".answer-doc-editor");
      const range = document.createRange();
      range.selectNodeContents(ed);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    await page.click("#ws-number");
    await sleep(200);
    await page.select("#ws-num-format", "circled");
    await page.evaluate(() => { document.getElementById("ws-num-start").value = "1"; });
    await page.click("#ws-num-insert-one");
    await sleep(400);
    const t4 = await page.$eval(".answer-doc-editor", (el) => el.innerText);
    record(4, "한글 직후 번호 삽입", t4.includes("감사인은") && t4.includes("①") && t4.indexOf("①") > 0, t4);

    // Test 5: 페이지 이동 시 줄 밀림 없음
    await typeInEditor(page, "첫줄내용");
    for (let i = 0; i < 4; i++) {
      await page.click("#ws-ans-next");
      await sleep(300);
      await page.click("#ws-ans-prev");
      await sleep(300);
    }
    const t5 = await page.$eval(".answer-doc-editor", (el) => el.innerText.trim());
    record(5, "페이지 이동 후 줄 유지", t5 === "첫줄내용", `got="${t5}"`);
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
