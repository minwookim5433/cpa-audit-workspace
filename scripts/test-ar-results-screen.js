/**
 * 매출채권 분석 결과 화면 구조 검증 (Puppeteer)
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const CSV = path.join(ROOT, "sample-data", "ar-risk-scenario-sample.csv");
const PORT = 3099;

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url.split("?")[0];
      const filePath = urlPath === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, urlPath.replace(/^\//, ""));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath);
        const types = {
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".csv": "text/csv; charset=utf-8",
        };
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch {
    console.error("puppeteer 필요");
    process.exit(2);
  }

  const server = await startStaticServer();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle0" });

    await page.click('[data-tool="analytical"]');
    await page.waitForSelector("#screen-analytical:not([hidden])");

    const input = await page.$("#data-file-input");
    await input.uploadFile(CSV);
    await page.waitForFunction(() => {
      const sel = document.getElementById("account-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await page.select("#account-select", "매출채권");

    await page.waitForFunction(() => document.querySelectorAll("#procedure-checklist input.procedure-check:not(:disabled)").length > 0);
    await page.$$eval("#procedure-checklist input.procedure-check:not(:disabled)", (els) => {
      els.forEach((el) => {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    await page.click("#run-analysis-btn");
    await page.waitForFunction(() => document.querySelector(".ar-results"), { timeout: 15000 });

    const checks = await page.evaluate(() => {
      const results = document.getElementById("results-area");
      const html = results?.innerHTML || "";
      const summaryCards = document.querySelectorAll(".ar-summary-card").length;
      const cautions = document.querySelectorAll(".ar-caution-item").length;
      const watchCards = document.querySelectorAll(".ar-watchlist-card").length;
      const checkboxes = document.querySelectorAll(".ar-action-checkbox").length;
      const detailsClosed = !document.querySelector(".ar-details-panel[open]");
      const chartsInResults = document.querySelectorAll("#ar-charts-mount canvas").length;
      const graphSectionHidden = document.getElementById("graph-section")?.hidden;

      return {
        hasArResults: html.includes("ar-results"),
        hasSummarySection: html.includes("핵심 분석 요약"),
        summaryCards,
        hasCautionsSection: html.includes("핵심 주의사항"),
        cautions,
        hasWatchSection: html.includes("핵심 주의 거래처"),
        watchCards,
        checkboxes,
        hasSignalFormat: html.includes("ar-caution-signal") && html.includes("고려할 후속절차"),
        hasDetailsPanel: html.includes("ar-details-panel"),
        detailsClosed,
        chartsInResults,
        graphSectionHidden,
        tableOnlyInDetails:
          !document.querySelector(".ar-watchlist-section .watchlist-scroll-wrap") &&
          Boolean(document.querySelector(".ar-details-panel .watchlist-scroll-wrap")),
      };
    });

    console.log("=== AR 결과 화면 검증 ===");
    const expected = [
      ["AR 결과 레이아웃", checks.hasArResults],
      ["핵심 분석 요약 섹션", checks.hasSummarySection],
      ["요약 카드 4개", checks.summaryCards === 4],
      ["핵심 주의사항 섹션", checks.hasCautionsSection],
      ["주의사항 1개 이상", checks.cautions >= 1],
      ["신호·근거·후속절차 형식", checks.hasSignalFormat],
      ["핵심 주의 거래처 섹션", checks.hasWatchSection],
      ["주의 거래처 카드 5개", checks.watchCards === 5],
      ["체크박스 존재", checks.checkboxes >= 5],
      ["상세 보기 접힘", checks.hasDetailsPanel && checks.detailsClosed],
      ["상세 표는 접힌 영역에만", checks.tableOnlyInDetails],
      ["그래프 3개 결과 영역", checks.chartsInResults === 3],
      ["별도 그래프 섹션 숨김", checks.graphSectionHidden],
    ];

    let pass = true;
    for (const [name, ok] of expected) {
      console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
      if (!ok) pass = false;
    }

    await browser.close();
    server.close();
    process.exit(pass ? 0 : 1);
  } catch (err) {
    await browser.close();
    server.close();
    console.error(err);
    process.exit(1);
  }
}

main();
