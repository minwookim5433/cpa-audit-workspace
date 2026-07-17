import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "..", "sample-data", "ar-analysis-sample.csv");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.click('[data-tool="analytical"]');

const fileInput = page.locator("#data-file-input");
await fileInput.setInputFiles(csvPath);
await page.waitForTimeout(800);

await page.selectOption("#account-select", { label: /매출채권/ });
await page.check('input.procedure-check[value="turnover"]');
await page.check('input.procedure-check[value="variance"]');
await page.click("#run-analysis-btn");
await page.waitForTimeout(500);

const result = await page.evaluate(() => ({
  resultsText: document.getElementById("results-area")?.innerText || "",
  chartVisible: !document.getElementById("analysis-chart")?.hidden,
  graphVisible: !document.getElementById("graph-section")?.hidden,
}));

console.log("ERRORS", errors);
console.log("chartVisible", result.chartVisible);
console.log("hasTurnover", result.resultsText.includes("회전율"));
console.log("has119", result.resultsText.includes("119.07"));

const ok = errors.length === 0 && result.chartVisible && result.resultsText.includes("3.07") && result.resultsText.includes("회전율");
await browser.close();
process.exit(ok ? 0 : 1);
