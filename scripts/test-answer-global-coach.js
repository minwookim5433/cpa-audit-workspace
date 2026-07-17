/**
 * 부분 서식 제거 후 — 전체 타이포그래피, Answer Coach 선택, span 정리 검증
 */
const puppeteer = require("puppeteer");

const PDF_PATH = process.argv[2] || "C:\\Users\\bnb12\\Desktop\\1-3 회계감사 문제(2025-2).pdf";
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const LINE1 =
  "① 가능, 감사업무 수임 전 정상가액으로 회원권을 취득한 경우 공인회계사법상 직무제한의 예외에 해당한다.";
const LINE2 = "② 감사인은 관련 법규와 윤리적 요구사항을 고려하여야 한다.";
const FULL_TEXT = `${LINE1}\n${LINE2}`;

const SPANNED_HTML = `<span class="answer-format-span" data-font-size="9" data-letter-spacing="-1" style="font-size: 9px !important; letter-spacing: -1px !important;">${LINE1}</span>\n${LINE2}`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  await sleep(800);
}

function record(results, name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function dragFirstLine(page) {
  const box = await page.$(".answer-doc-editor");
  const rect = await box.boundingBox();
  await page.mouse.move(rect.x + 12, rect.y + 14);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 12, rect.y + 14);
  await page.mouse.up();
  await sleep(400);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const results = [];

  try {
    await setup(page);

    await page.evaluate((html) => {
      const ed = document.querySelector(".answer-doc-editor");
      ed.innerHTML = html;
      ed.dispatchEvent(new Event("input", { bubbles: true }));
    }, SPANNED_HTML);
    await sleep(300);
    await page.evaluate(() => window.__workspaceAnswerExportState?.());
    await sleep(400);

    const migrated = await page.evaluate((line1, fullText) => {
      const editor = document.querySelector(".answer-doc-editor");
      return {
        spanCount: editor.querySelectorAll(".answer-format-span").length,
        text: editor.innerText.replace(/\r/g, ""),
        html: editor.innerHTML,
        line1Present: editor.innerText.includes(line1.slice(0, 12)),
      };
    }, LINE1, FULL_TEXT);

    record(
      results,
      "기존 부분 span 제거 후 텍스트 보존",
      migrated.spanCount === 0 && migrated.text === FULL_TEXT,
      `spans=${migrated.spanCount} textLen=${migrated.text.length}`
    );

    await page.evaluate(() => {
      document.getElementById("ws-font-size-input").value = "10";
      document.getElementById("ws-font-size-input").dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("ws-letter-spacing-input").value = "-1.2";
      document.getElementById("ws-letter-spacing-input").dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(400);

    const globalTypo = await page.evaluate(() => {
      const editor = document.querySelector(".answer-doc-editor");
      const css = getComputedStyle(editor);
      return {
        fontSize: css.fontSize,
        letterSpacing: css.letterSpacing,
        stateFont: window.__workspaceAnswerExportState?.().answerTypography?.fontSize,
        stateSpacing: window.__workspaceAnswerExportState?.().answerTypography?.letterSpacing,
      };
    });

    record(
      results,
      "답안 전체 글자 크기 조정",
      globalTypo.fontSize === "10px" && globalTypo.stateFont === 10,
      `font=${globalTypo.fontSize}`
    );
    record(
      results,
      "답안 전체 자간 조정",
      globalTypo.letterSpacing === "-1.2px" && globalTypo.stateSpacing === -1.2,
      `spacing=${globalTypo.letterSpacing}`
    );

    await dragFirstLine(page);

    const menu = await page.evaluate(() => ({
      menuVisible: !document.getElementById("ws-answer-selection-menu").hidden,
      hasFormatBtn: !!document.getElementById("ws-sel-format-btn"),
      hasCoachBtn: !!document.getElementById("ws-sel-coach-btn"),
      hasCancelBtn: !!document.getElementById("ws-sel-cancel-btn"),
      hasFormatPanel: !!document.getElementById("ws-partial-format-panel"),
      coachAuto: !document.getElementById("ws-coach-menu").hidden,
      statusText: document.getElementById("ws-status")?.textContent || "",
    }));

    record(
      results,
      "드래그 시 Answer Coach와 취소만",
      menu.menuVisible && menu.hasCoachBtn && menu.hasCancelBtn && !menu.hasFormatBtn && !menu.hasFormatPanel,
      `formatBtn=${menu.hasFormatBtn}`
    );
    record(
      results,
      "드래그만으로 Answer Coach 자동 실행 없음",
      !menu.coachAuto && !menu.statusText.includes("분석 중"),
      menu.statusText || "no status"
    );

    await page.click("#ws-sel-coach-btn");
    await sleep(300);

    const coachClick = await page.evaluate(() => ({
      coachMenuVisible: !document.getElementById("ws-coach-menu").hidden,
      statusText: document.getElementById("ws-status")?.textContent || "",
    }));
    record(
      results,
      "Answer Coach 버튼 클릭 시에만 코치 메뉴",
      coachClick.coachMenuVisible && !coachClick.statusText.includes("분석 중")
    );

    await page.evaluate(() => {
      document.getElementById("ws-coach-menu").hidden = true;
      document.getElementById("ws-answer-selection-menu").hidden = true;
    });

    await page.click("#ws-answer-preview-btn");
    await sleep(500);

    const preview = await page.evaluate(() => {
      const editor = document.querySelector("#ws-modal-sheet-container .answer-doc-editor");
      const live = document.querySelector(".answer-doc-editor");
      const measureStarts = (root) => {
        const starts = [0];
        let lastTop = null;
        let charIndex = 0;
        const range = document.createRange();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const len = node.textContent?.length || 0;
          for (let i = 0; i < len; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rects = range.getClientRects();
            if (rects.length) {
              const top = Math.round(rects[0].top);
              if (lastTop !== null && top > lastTop + 1) starts.push(charIndex);
              lastTop = top;
            }
            charIndex++;
          }
          node = walker.nextNode();
        }
        return starts;
      };
      return {
        previewFont: getComputedStyle(editor).fontSize,
        previewSpacing: getComputedStyle(editor).letterSpacing,
        sameStarts: JSON.stringify(measureStarts(live)) === JSON.stringify(measureStarts(editor)),
        sameText: live.innerText === editor.innerText,
        spanCount: editor.querySelectorAll(".answer-format-span").length,
      };
    });
    await page.click("[data-modal-close]");
    await sleep(200);

    record(
      results,
      "미리보기 줄바꿈·전체 서식 일치",
      preview.sameStarts && preview.sameText && preview.previewFont === "10px" && preview.spanCount === 0,
      `font=${preview.previewFont} starts=${preview.sameStarts}`
    );

    const exportData = await page.evaluate(() => {
      const state = window.__workspaceAnswerExportState();
      const clone = state.clones?.[0];
      const live = document.querySelector(".answer-doc-editor");
      const mount = document.createElement("div");
      mount.className = "export-answer-page";
      if (clone) mount.appendChild(clone.cloneNode(true));
      document.body.appendChild(mount);

      const t = state.answerTypography || {};
      const vars = {
        "--answer-font-size": `${t.fontSize}px`,
        "--answer-letter-spacing": `${t.letterSpacing}px`,
      };
      Object.entries(vars).forEach(([k, v]) => {
        mount.style.setProperty(k, v);
        mount.querySelector(".answer-doc-sheet")?.style.setProperty(k, v);
      });

      const editor = mount.querySelector(".answer-doc-editor");
      const measureStarts = (root) => {
        if (!root) return [0];
        const starts = [0];
        let lastTop = null;
        let charIndex = 0;
        const range = document.createRange();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const len = node.textContent?.length || 0;
          for (let i = 0; i < len; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rects = range.getClientRects();
            if (rects.length) {
              const top = Math.round(rects[0].top);
              if (lastTop !== null && top > lastTop + 1) starts.push(charIndex);
              lastTop = top;
            }
            charIndex++;
          }
          node = walker.nextNode();
        }
        return starts;
      };

      const result = {
        cloneCount: state.clones?.length || 0,
        exportFont: editor ? getComputedStyle(editor).fontSize : "",
        sameStarts: editor && live
          ? JSON.stringify(measureStarts(live)) === JSON.stringify(measureStarts(editor))
          : false,
        spanCount: editor?.querySelectorAll(".answer-format-span").length || 0,
      };
      mount.remove();
      return result;
    });

    record(
      results,
      "PDF 클론 전체 서식·span 없음",
      exportData.cloneCount > 0 &&
        exportData.exportFont === "10px" &&
        exportData.sameStarts &&
        exportData.spanCount === 0,
      `clones=${exportData.cloneCount} font=${exportData.exportFont}`
    );

    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector(".answer-doc-editor"), { timeout: 20000 });
    await sleep(600);

    const restored = await page.evaluate((fullText) => {
      const editor = document.querySelector(".answer-doc-editor");
      return {
        text: editor.innerText.replace(/\r/g, ""),
        spanCount: editor.querySelectorAll(".answer-format-span").length,
        fontSize: getComputedStyle(editor).fontSize,
      };
    }, FULL_TEXT);

    record(
      results,
      "새로고침 후 답안·전체 서식 유지",
      restored.text === FULL_TEXT && restored.spanCount === 0 && restored.fontSize === "10px",
      `font=${restored.fontSize}`
    );

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
