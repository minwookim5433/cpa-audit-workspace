/**
 * 문제번호·물음번호별 답안 관리
 */
import {
  DEFAULT_SETTINGS,
  wrapTextToLines,
  paginateLines,
  estimateStats,
  escapeHtml,
} from "./workspace-answer-sheet.js";

export const ANSWER_STATUS = {
  empty: { label: "미작성", className: "is-empty" },
  draft: { label: "작성 중", className: "is-draft" },
  done: { label: "완료", className: "is-done" },
};

export function makeAnswerKey(problemNumber, questionNumber) {
  const p = String(problemNumber || "").trim() || "1";
  const q = String(questionNumber || "").trim() || "1";
  return `${p}::${q}`;
}

export function parseAnswerKey(key) {
  const [p, q] = String(key || "").split("::");
  return { problemNumber: p || "1", questionNumber: q || "1" };
}

export function createAnswer(problemNumber = "", questionNumber = "") {
  const now = new Date().toISOString();
  return {
    problemNumber: String(problemNumber || "").trim(),
    questionNumber: String(questionNumber || "").trim(),
    title: "",
    content: "",
    status: "empty",
    writingSeconds: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function inferAnswerStatus(answer) {
  if (!answer) return "empty";
  if (answer.status === "done") return "done";
  const text = String(answer.content || "").trim();
  if (!text) return "empty";
  return "draft";
}

export function getAnswerLabel(answer) {
  const p = answer.problemNumber || "?";
  const q = answer.questionNumber || "?";
  return `문제 ${p} - 물음 ${q}`;
}

export function sortAnswerKeys(keys, answers) {
  return [...keys].sort((a, b) => {
    const aa = answers[a] || parseAnswerKey(a);
    const bb = answers[b] || parseAnswerKey(b);
    const pa = Number(aa.problemNumber) || 0;
    const pb = Number(bb.problemNumber) || 0;
    if (pa !== pb) return pa - pb;
    const qa = Number(aa.questionNumber) || 0;
    const qb = Number(bb.questionNumber) || 0;
    return qa - qb;
  });
}

export function migrateAnswerPages(answerPages) {
  const answers = {};
  const keys = [];
  (answerPages || []).forEach((page, idx) => {
    const p = page.problemNumber || String(idx + 1);
    const q = page.questionNumber || "1";
    const key = makeAnswerKey(p, q);
    answers[key] = {
      problemNumber: String(p),
      questionNumber: String(q),
      title: page.label || "",
      content: page.content || "",
      status: page.content?.trim() ? "draft" : "empty",
      writingSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    keys.push(key);
  });
  if (!keys.length) {
    const key = makeAnswerKey("1", "1");
    answers[key] = createAnswer("1", "1");
    keys.push(key);
  }
  return { answers, keys, currentKey: keys[0] };
}

export function buildAnswerSheetPages(answers, settings, docTitle) {
  const keys = sortAnswerKeys(Object.keys(answers), answers);
  const sheets = [];

  for (const key of keys) {
    const ans = answers[key];
    if (!ans) continue;
    const lines = wrapTextToLines(ans.content, settings.charsPerLine);
    const pages = paginateLines(lines, settings.linesPerPage);
    pages.forEach((pageLines, pageIdx) => {
      sheets.push({
        key,
        answer: ans,
        pageLines,
        pageIndex: pageIdx,
        totalPages: pages.length,
        globalIndex: sheets.length,
      });
    });
    if (!pages.length) {
      sheets.push({
        key,
        answer: ans,
        pageLines: Array(settings.linesPerPage).fill(""),
        pageIndex: 0,
        totalPages: 1,
        globalIndex: sheets.length,
      });
    }
  }

  if (!sheets.length) {
    const blank = createAnswer("1", "1");
    sheets.push({
      key: makeAnswerKey("1", "1"),
      answer: blank,
      pageLines: Array(settings.linesPerPage).fill(""),
      pageIndex: 0,
      totalPages: 1,
      globalIndex: 0,
    });
  }

  return sheets;
}

export function renderAnswerListPanel(container, answers, currentKey, onSelect, onStatusChange) {
  if (!container) return;
  const keys = sortAnswerKeys(Object.keys(answers), answers);

  if (!keys.length) {
    container.innerHTML = '<p class="ws-empty-msg">아직 작성한 답안이 없습니다.</p>';
    return;
  }

  container.innerHTML = `
    <ul class="ws-answer-list">
      ${keys
        .map((key) => {
          const ans = answers[key];
          const status = inferAnswerStatus(ans);
          const meta = ANSWER_STATUS[status] || ANSWER_STATUS.empty;
          const active = key === currentKey ? " is-active" : "";
          const title = ans.title ? ` · ${escapeHtml(ans.title)}` : "";
          return `
            <li class="ws-answer-item">
              <button type="button" class="ws-answer-link${active}" data-key="${escapeHtml(key)}">
                <span class="ws-answer-link-label">${escapeHtml(getAnswerLabel(ans))}${title}</span>
                <span class="ws-answer-status ${meta.className}">${meta.label}</span>
              </button>
              <select class="ws-answer-status-select" data-key="${escapeHtml(key)}" aria-label="답안 상태">
                <option value="empty" ${status === "empty" ? "selected" : ""}>미작성</option>
                <option value="draft" ${status === "draft" ? "selected" : ""}>작성 중</option>
                <option value="done" ${status === "done" ? "selected" : ""}>완료</option>
              </select>
            </li>`;
        })
        .join("")}
    </ul>`;

  container.querySelectorAll(".ws-answer-link").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.key));
  });
  container.querySelectorAll(".ws-answer-status-select").forEach((sel) => {
    sel.addEventListener("change", () => onStatusChange(sel.dataset.key, sel.value));
  });
}

export function formatWritingTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function updateInputStatsDisplay(el, text, settings, writingSeconds) {
  if (!el) return;
  const stats = estimateStats(text, settings);
  el.textContent = `${stats.charCount}자 · ${stats.lineCount}줄 · ${stats.pageCount}쪽 · 작성 ${formatWritingTime(writingSeconds)}`;
}

export function buildExportDocumentHtml({ docTitle, answers, settings, template }) {
  const sheets = buildAnswerSheetPages(answers, settings, docTitle);
  const dateStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hasTemplate = Boolean(template?.dataUrl);

  const pagesHtml = sheets
    .map((sheet, idx) => {
      const ans = sheet.answer;
      const metaParts = [
        docTitle || "CPA 답안",
        ans.problemNumber ? `문제 ${escapeHtml(ans.problemNumber)}` : "",
        ans.questionNumber ? `물음 ${escapeHtml(ans.questionNumber)}` : "",
        ans.title ? escapeHtml(ans.title) : "",
      ].filter(Boolean);

      return `
        <section class="export-page" data-page="${idx + 1}">
          ${
            hasTemplate
              ? `<img class="export-template" src="${template.dataUrl}" alt="" style="opacity:${settings.templateOpacity}" />`
              : ""
          }
          <div class="export-content" style="
            padding-top:${settings.paddingTop}px;
            padding-left:${settings.paddingLeft}px;
            padding-right:${settings.paddingRight}px;
            font-family:${settings.fontFamily};
            font-size:${settings.fontSize}px;
            line-height:${settings.lineHeight}px;
          ">
            <header class="export-header">
              <h1>${escapeHtml(docTitle || "CPA 답안")}</h1>
              <p class="export-date">작성일: ${dateStr}</p>
            </header>
            <div class="export-meta">
              <span>${metaParts.join(" · ")}</span>
              <span>${idx + 1} / ${sheets.length}</span>
            </div>
            <div class="export-lines">
              ${sheet.pageLines
                .map(
                  (line, lineIdx) => `
                <div class="export-line" style="min-height:${settings.lineHeight}px;line-height:${settings.lineHeight}px">
                  <span class="export-line-num">${lineIdx + 1}</span>
                  <span class="export-line-text">${escapeHtml(line) || "&nbsp;"}</span>
                </div>`
                )
                .join("")}
            </div>
            <footer class="export-footer">— ${idx + 1} —</footer>
          </div>
        </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(docTitle || "CPA 답안")}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Batang", "Nanum Myeongjo", serif; background: #f0f1f3; }
    .export-page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 16px;
      background: #fff;
      box-shadow: 0 1px 6px rgba(0,0,0,0.1);
      overflow: hidden;
      page-break-after: always;
    }
    .export-template { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
    .export-content { position: relative; z-index: 1; }
    .export-header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #c8ccd4; }
    .export-header h1 { margin: 0 0 4px; font-size: 1rem; letter-spacing: 0.08em; }
    .export-date { margin: 0; font-size: 0.75rem; color: #6b7280; }
    .export-meta { display: flex; justify-content: space-between; font-size: 0.72rem; color: #6b7280; margin-bottom: 16px; }
    .export-line { display: flex; border-bottom: 1px solid #c8ccd4; }
    .export-line-num { width: 24px; flex-shrink: 0; font-size: 0.65rem; color: #aab0ba; text-align: right; padding-right: 8px; font-family: sans-serif; }
    .export-line-text { flex: 1; white-space: pre-wrap; word-break: break-all; }
    .export-footer { text-align: center; font-size: 0.7rem; color: #9ca3af; margin-top: 12px; }
    @media print {
      body { background: #fff; }
      .export-page { box-shadow: none; margin: 0; }
    }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`;
}

export function downloadHtmlFile(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "cpa-answers.html";
  a.click();
  URL.revokeObjectURL(url);
}

export function printHtmlDocument(html) {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.");
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

export async function downloadPdfFromHtml(html, filename) {
  if (!window.html2pdf) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/node_modules/html2pdf.js/dist/html2pdf.bundle.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("html2pdf 로드 실패"));
      document.head.appendChild(script);
    });
  }

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;width:210mm;";
  container.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;
  document.body.appendChild(container);

  try {
    await window.html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: filename || "cpa-answers.pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], after: ".export-page" },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
