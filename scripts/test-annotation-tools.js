/**
 * 시험지 주석 — 커서 정렬·지우개 테스트 A~J
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
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("cpa-workspace-db");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__workspaceExamUx !== "undefined", { timeout: 15000 });
  const input = await page.$("#ws-pdf-input");
  await input.uploadFile(PDF_PATH);
  await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 45000 });
  await page.waitForFunction(
    () => !document.querySelector("#ws-exam-pages p")?.textContent?.includes("렌더링"),
    { timeout: 45000 }
  );
  await sleep(800);
}

async function clientAtNorm(page, nx, ny) {
  return page.evaluate(
    ({ x, y }) => {
      const c = document.querySelector(".pdf-page-container");
      const r = c.getBoundingClientRect();
      return { cx: r.left + x * r.width, cy: r.top + y * r.height, w: r.width, h: r.height };
    },
    { x: nx, y: ny }
  );
}

async function drawLine(page, x1, y1, x2, y2) {
  const a = await clientAtNorm(page, x1, y1);
  const b = await clientAtNorm(page, x2, y2);
  await page.mouse.move(a.cx, a.cy);
  await page.mouse.down();
  await page.mouse.move(b.cx, b.cy, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
}

async function drawPenStroke(page, x1, y1, x2, y2) {
  await page.click('[data-tool="pen"]');
  await sleep(150);
  const a = await clientAtNorm(page, x1, y1);
  const b = await clientAtNorm(page, x2, y2);
  await page.mouse.move(a.cx, a.cy);
  await page.mouse.down();
  await page.mouse.move(b.cx, b.cy, { steps: 10 });
  await page.mouse.up();
  await sleep(350);
}

async function clickAtNorm(page, nx, ny) {
  const p = await clientAtNorm(page, nx, ny);
  await page.mouse.click(p.cx, p.cy);
  await sleep(200);
}

function near(a, b, tol = 0.025) {
  return Math.abs(a - b) <= tol;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await setup(page);

    // A: 밑줄 시작점 = pointerdown 위치
    await page.click('[data-tool="underline"]');
    await sleep(200);
    const startNorm = { x: 0.38, y: 0.42 };
    await drawLine(page, startNorm.x, startNorm.y, startNorm.x + 0.12, startNorm.y);
    const testA = await page.evaluate((sn) => {
      const line = (window.__workspaceExamUx?.getDrawAnnotations?.() || []).find((a) => a.type === "line");
      return line
        ? { x1: line.x1, y1: line.y1, ok: Math.abs(line.x1 - sn.x) < 0.025 && Math.abs(line.y1 - sn.y) < 0.025 }
        : { ok: false };
    }, startNorm);
    record(results, "A: 밑줄 시작점 = pointer 위치", testA.ok, JSON.stringify(testA));

    // B: 펜 첫 점 = pointerdown 위치
    const penStart = { x: 0.55, y: 0.35 };
    await drawPenStroke(page, penStart.x, penStart.y, penStart.x + 0.08, penStart.y + 0.06);
    const testB = await page.evaluate((sn) => {
      const pen = (window.__workspaceExamUx?.getDrawAnnotations?.() || []).find((a) => a.type === "pen");
      const p0 = pen?.points?.[0];
      return {
        ok: p0 && Math.abs(p0[0] - sn.x) < 0.025 && Math.abs(p0[1] - sn.y) < 0.025,
        p0,
      };
    }, penStart);
    record(results, "B: 펜 첫 점 = pointerdown", testB.ok, JSON.stringify(testB));

    // C: offset 없음 — 클릭 좌표와 저장 좌표 일치
    await page.click('[data-tool="underline"]');
    await sleep(150);
    const clickPoint = { x: 0.25, y: 0.55 };
    const clickPos = await clientAtNorm(page, clickPoint.x, clickPoint.y);
    await page.mouse.move(clickPos.cx, clickPos.cy);
    await page.mouse.down();
    await page.mouse.move(clickPos.cx + 40, clickPos.cy, { steps: 4 });
    await page.mouse.up();
    await sleep(300);
    const testC = await page.evaluate(({ cx, cy }) => {
      const norm = window.__workspaceExamUx?.normFromClient?.(cx, cy);
      const line = (window.__workspaceExamUx?.getDrawAnnotations?.() || [])
        .filter((a) => a.type === "line")
        .slice(-1)[0];
      if (!norm || !line) return { ok: false };
      const dx = Math.abs(line.x1 - norm.x);
      const dy = Math.abs(line.y1 - norm.y);
      return { ok: dx < 0.02 && dy < 0.02, dx, dy, lineStart: [line.x1, line.y1], norm: [norm.x, norm.y] };
    }, { cx: clickPos.cx, cy: clickPos.cy });
    record(results, "C: 커서-입력 offset 없음", testC.ok, JSON.stringify(testC));

    // D: 밑줄 커서 hotspot 상단 + custom cursor
    await page.click('[data-tool="underline"]');
    await sleep(200);
    const testD = await page.evaluate(() => {
      const cursor = document.querySelector(".draw-interact-layer")?.style.cursor || "";
      const specs = window.__workspaceExamUx?.getCursorSpecs?.();
      const hs = specs?.underline?.hotspot;
      const match = cursor.match(/\) (\d+) (\d+),/);
      const hotY = match ? Number(match[2]) : -1;
      return {
        hasCustom: cursor.startsWith("url("),
        hotY,
        specY: hs?.[1],
        tipAtTop: hotY <= 8,
      };
    });
    record(
      results,
      "D: 밑줄 연필 커서 + hotspot 상단",
      testD.hasCustom && testD.tipAtTop,
      JSON.stringify(testD)
    );

    // E: 지우개 클릭으로 밑줄 1개 삭제
    const beforeE = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter((a) => a.type === "line").length
    );
    const lineMid = await page.evaluate(() => {
      const line = (window.__workspaceExamUx?.getDrawAnnotations?.() || []).find((a) => a.type === "line");
      if (!line) return null;
      return { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 };
    });
    await page.click('[data-tool="eraser"]');
    await sleep(200);
    if (lineMid) await clickAtNorm(page, lineMid.x, lineMid.y);
    const afterE = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter((a) => a.type === "line").length
    );
    record(results, "E: 지우개 클릭 → 밑줄 1개 삭제", afterE === beforeE - 1, `${beforeE}→${afterE}`);

    // F: 지우개 드래그로 펜 stroke 삭제
    await drawPenStroke(page, 0.6, 0.5, 0.75, 0.52);
    const penBeforeF = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter((a) => a.type === "pen").length
    );
    await page.click('[data-tool="eraser"]');
    await sleep(150);
    const dragA = await clientAtNorm(page, 0.62, 0.51);
    const dragB = await clientAtNorm(page, 0.72, 0.515);
    await page.mouse.move(dragA.cx, dragA.cy);
    await page.mouse.down();
    await page.mouse.move(dragB.cx, dragB.cy, { steps: 8 });
    await page.mouse.up();
    await sleep(350);
    const penAfterF = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter((a) => a.type === "pen").length
    );
    record(results, "F: 지우개 드래그 → 펜 stroke 삭제", penAfterF < penBeforeF, `${penBeforeF}→${penAfterF}`);

    // G: 겹친 주석 — 최근 것부터 삭제
    await page.click('[data-tool="underline"]');
    await sleep(150);
    await drawLine(page, 0.45, 0.65, 0.55, 0.65);
    await sleep(120);
    await drawLine(page, 0.45, 0.65, 0.55, 0.65);
    await sleep(200);
    const newestId = await page.evaluate(() => {
      const lines = (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter((a) => a.type === "line");
      lines.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return lines[0]?.id || null;
    });
    await page.click('[data-tool="eraser"]');
    await sleep(150);
    await clickAtNorm(page, 0.5, 0.65);
    const testG = await page.evaluate((removedId) => {
      const lines = (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter((a) => a.type === "line");
      const stillHasNewest = lines.some((l) => l.id === removedId);
      return { stillHasNewest, count: lines.length, removedId };
    }, newestId);
    record(results, "G: 겹침 — 최근 주석 먼저 삭제", !testG.stillHasNewest, JSON.stringify(testG));

    // H: 지운 뒤 실행 취소 → 복원
    const countBeforeUndo = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length
    );
    await page.click("#ws-annot-undo");
    await sleep(300);
    const countAfterUndo = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length
    );
    record(results, "H: 지우개 삭제 실행 취소", countAfterUndo === countBeforeUndo + 1, `${countBeforeUndo}→${countAfterUndo}`);

    // I: 확대 후 지우개 hit test
    const beforeZoom = await page.evaluate(() => window.__workspaceExamUx?.getScale?.() ?? 1);
    await page.click("#ws-zoom-in");
    await page.waitForFunction(
      (prev) => (window.__workspaceExamUx?.getScale?.() ?? 1) > prev + 0.05,
      { timeout: 8000 },
      beforeZoom
    );
    await page.waitForFunction(() => document.querySelector(".draw-interact-layer"), { timeout: 8000 });
    await sleep(900);
    await page.evaluate(() => {
      const exam = document.getElementById("ws-exam");
      if (exam) exam.scrollTop = 0;
    });
    await page.click('[data-tool="underline"]');
    await sleep(150);
    const zoomLine = { x1: 0.15, y: 0.4, x2: 0.28 };
    await drawLine(page, zoomLine.x1, zoomLine.y, zoomLine.x2, zoomLine.y);
    const zoomLineId = await page.evaluate(({ y, x1, x2 }) => {
      const lines = (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter(
        (a) =>
          a.type === "line" &&
          Math.abs(a.y1 - y) < 0.03 &&
          Math.abs(a.x1 - x1) < 0.03 &&
          Math.abs(a.x2 - x2) < 0.03
      );
      return lines[lines.length - 1]?.id || null;
    }, zoomLine);
    await page.click('[data-tool="eraser"]');
    await sleep(250);
    await clickAtNorm(page, (zoomLine.x1 + zoomLine.x2) / 2, zoomLine.y);
    const testI = await page.evaluate((id) => {
      const lines = (window.__workspaceExamUx?.getDrawAnnotations?.() || []).filter((a) => a.type === "line");
      return { gone: id ? !lines.some((l) => l.id === id) : false, id };
    }, zoomLineId);
    record(results, "I: 확대 후 지우개 hit test", testI.gone, JSON.stringify(testI));

    // J: 저장소 반영 + 새로고침 후 삭제 상태 유지
    await page.evaluate(() => window.__workspaceExamUx?.flushSave?.());
    await sleep(300);
    const countBeforeReload = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length
    );
    const storageSynced = await page.evaluate((expected) => {
      const data = JSON.parse(localStorage.getItem("cpa-workspace-session") || "{}");
      const ws = Object.values(data.workspaces || {})[0];
      return (ws?.drawAnnotations || []).length === expected;
    }, countBeforeReload);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => typeof window.__workspaceExamUx !== "undefined", { timeout: 60000 });
    await page.waitForFunction(
      () =>
        document.querySelector(".pdf-page-container") &&
        !document.querySelector("#ws-exam-pages p")?.textContent?.includes("렌더링"),
      { timeout: 60000 }
    );
    await sleep(2000);
    const countAfterReload = await page.evaluate(
      () => (window.__workspaceExamUx?.getDrawAnnotations?.() || []).length
    );
    record(
      results,
      "J: 새로고침 후 삭제 상태 유지",
      storageSynced && countAfterReload === countBeforeReload,
      `storage=${storageSynced}, ${countBeforeReload}→${countAfterReload}`
    );
  } catch (err) {
    console.error(err);
    record(results, "테스트 실행", false, err.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== Summary: ${results.length - failed}/${results.length} passed ===`);
  if (failed) process.exitCode = 1;
}

main();
