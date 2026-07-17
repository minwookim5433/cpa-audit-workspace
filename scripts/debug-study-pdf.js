const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  });
  const page = await browser.newPage();
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("PAGEERR", e.message));
  await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
  const input = await page.$("#study-pdf-input");
  await input.uploadFile("C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf");
  await page.evaluate(() => {
    document.getElementById("study-pdf-input").dispatchEvent(new Event("change", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 20000));
  const st = await page.evaluate(() => ({
    status: document.getElementById("study-status")?.textContent,
    pages: document.querySelectorAll(".study-page-wrap").length,
  }));
  console.log("STATE", st);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
