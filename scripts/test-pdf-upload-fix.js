/**
 * PDF 업로드 수정 검증 (7항목)
 * node scripts/test-pdf-upload-fix.js [pdf-path]
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const DB_NAME = "cpa-workspace-db";
const PDF_STORE = "pdfs";

const results = [];

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPdfRendered(page, timeout = 45000) {
  await page.waitForFunction(
    () => {
      const pages = document.getElementById("ws-exam-pages");
      const canvas = pages?.querySelector(".pdf-canvas");
      return pages && !pages.hidden && canvas && canvas.width > 0 && canvas.height > 0;
    },
    { timeout }
  );
}

async function clearWorkspaceState(page) {
  await page.evaluate(async () => {
    localStorage.removeItem("cpa-workspace-session");
    const req = indexedDB.deleteDatabase("cpa-workspace-db");
    await new Promise((resolve) => {
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    location.reload();
  });
  await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 });
  await sleep(800);
}

async function uploadViaInput(page, filePath) {
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(filePath);
  await waitForPdfRendered(page);
  await sleep(1500);
}

async function uploadWithEmptyType(page, pdfBytes, fileName) {
  const b64 = Buffer.from(pdfBytes).toString("base64");
  await page.evaluate(async (payload) => {
    const bytes = Uint8Array.from(atob(payload.b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes]);
    const file = new File([blob], payload.name, { type: "" });
    const input = document.getElementById("ws-pdf-input");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { b64, name: fileName });
  await waitForPdfRendered(page);
  await sleep(1500);
}

async function readIdbPdfCount(page) {
  return page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open("cpa-workspace-db", 2);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("pdfs")) {
          resolve(0);
          return;
        }
        const tx = db.transaction("pdfs", "readonly");
        const countReq = tx.objectStore("pdfs").count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(0);
      };
      req.onerror = () => resolve(0);
    });
  });
}

async function getPageInfo(page) {
  return page.evaluate(() => ({
    pdfName: document.getElementById("ws-pdf-name")?.textContent || "",
    status: document.getElementById("ws-status")?.textContent || "",
    statusClass: document.getElementById("ws-status")?.className || "",
    pageLabel: document.getElementById("ws-page-label")?.textContent || "",
    spreadCount: document.querySelectorAll(".exam-page-wrap").length,
    canvasOk: (() => {
      const c = document.querySelector(".pdf-canvas");
      return !!(c && c.width > 0 && c.height > 0);
    })(),
  }));
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error("PDF not found:", PDF_PATH);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(PDF_PATH);
  const pdfStat = fs.statSync(PDF_PATH);

  let browser;
  const chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
    });
  } catch (err) {
    console.error("Puppeteer launch failed:", err.message);
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 15000 });
    await clearWorkspaceState(page);

    // [1] file.type === application/pdf
    await uploadViaInput(page, PDF_PATH);
    const info1 = await getPageInfo(page);
    const pageMatch = info1.pdfName.match(/\((\d+)쪽\)/);
    const pageCount = pageMatch ? Number(pageMatch[1]) : 0;
    record(
      1,
      "file.type=application/pdf 업로드",
      info1.canvasOk && pageCount > 0,
      `name=${info1.pdfName}, canvas=${info1.canvasOk}`
    );

    // [3] 전체 페이지 수
    record(3, "전체 페이지 수 읽기", pageCount === 15, `${pageCount}쪽 (기대: 15)`);

    // [4] 첫 페이지 렌더링
    record(
      4,
      "첫 페이지 렌더링",
      info1.canvasOk && info1.spreadCount === 1,
      `spread=${info1.spreadCount}, label=${info1.pageLabel}`
    );

    // [5] 양면 보기 다음 페이지
    await page.setViewport({ width: 1280, height: 900 });
    await page.click("#ws-next-page");
    await sleep(2000);
    const info5 = await getPageInfo(page);
    record(
      5,
      "양면 보기 다음 페이지 이동",
      info5.spreadCount === 2 && /2/.test(info5.pageLabel),
      `spread=${info5.spreadCount}, label=${info5.pageLabel}`
    );

    // [6] IndexedDB 저장 성공
    await sleep(2000);
    const idbCount = await readIdbPdfCount(page);
    const statusOk = /로드 완료/.test(info1.status) || /로드 완료/.test(info5.status);
    record(6, "IndexedDB 저장 성공", idbCount >= 1, `stored=${idbCount}, status=${info5.status || info1.status}`);

    // [2] file.type 빈 문자열 + .pdf 확장자
    await clearWorkspaceState(page);
    await uploadWithEmptyType(page, pdfBytes, "empty-type-exam.pdf");
    const info2 = await getPageInfo(page);
    record(
      2,
      "file.type='' + .pdf 확장자 업로드",
      info2.canvasOk && /empty-type-exam\.pdf/.test(info2.pdfName),
      `name=${info2.pdfName}`
    );

    // [7] 저장 실패 강제 — PDF는 계속 표시
    await clearWorkspaceState(page);
    await page.evaluateOnNewDocument(() => {
      const NativeIDB = window.indexedDB;
      window.__forceIdbSaveFail = true;
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        get() {
          if (window.__forceIdbSaveFail) {
            return {
              open() {
                const req = {};
                setTimeout(() => {
                  req.onerror?.({ target: { error: new DOMException("forced IDB failure", "AbortError") } });
                }, 0);
                return req;
              },
              deleteDatabase: NativeIDB.deleteDatabase.bind(NativeIDB),
            };
          }
          return NativeIDB;
        },
      });
    });
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 15000 });
    await sleep(500);
    await uploadViaInput(page, PDF_PATH);
    const info7 = await getPageInfo(page);
    const warningShown =
      /자동 저장에 실패/.test(info7.status) && info7.statusClass.includes("is-warning");
    record(
      7,
      "저장 실패 강제 시 PDF 유지",
      info7.canvasOk && warningShown,
      `canvas=${info7.canvasOk}, status="${info7.status}"`
    );
  } catch (err) {
    record("X", "테스트 실행", false, err.message);
    console.error(err);
  } finally {
    await browser.close();
  }

  console.log("\n=== 요약 ===");
  const failed = results.filter((r) => !r.ok);
  console.log(`성공: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL [${f.id}] ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main();
