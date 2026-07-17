/**
 * 답안지 10페이지 × 25행 편집기
 */

export const ANSWER_PAGE_COUNT = 10;
export const ROWS_PER_PAGE = 25;
export const TOTAL_ROWS = ANSWER_PAGE_COUNT * ROWS_PER_PAGE;
export const CHARS_PER_ROW = 42;

const CIRCLED_NUMBERS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
];

const CIRCLED_RE = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*/;
const NUMERIC_RE = /^(\d+)\.\s*/;

export function createEmptyAnswerSheet() {
  return Array.from({ length: ANSWER_PAGE_COUNT }, () => "");
}

export function normalizeAnswerPages(data) {
  if (!Array.isArray(data)) return createEmptyAnswerSheet();
  if (!data.length) return createEmptyAnswerSheet();
  if (Array.isArray(data[0])) {
    return data
      .map((page) => {
        if (!Array.isArray(page)) return String(page ?? "");
        let end = page.length;
        while (end > 1 && !String(page[end - 1] || "").trim()) end--;
        return page.slice(0, end).join("\n");
      })
      .concat(Array(ANSWER_PAGE_COUNT).fill(""))
      .slice(0, ANSWER_PAGE_COUNT);
  }
  return data
    .map((p) => String(p ?? ""))
    .concat(Array(ANSWER_PAGE_COUNT).fill(""))
    .slice(0, ANSWER_PAGE_COUNT);
}

export function flattenSheet(pages) {
  const normalized = normalizeAnswerPages(pages);
  const rows = [];
  normalized.forEach((pageText) => {
    const lines = String(pageText || "").split("\n");
    lines.forEach((row) => rows.push(row));
  });
  return rows;
}

export function unflattenToSheet(rows) {
  const sheet = createEmptyAnswerSheet();
  rows.forEach((text, idx) => {
    const page = Math.floor(idx / ROWS_PER_PAGE);
    const row = idx % ROWS_PER_PAGE;
    if (page < ANSWER_PAGE_COUNT) sheet[page][row] = text;
  });
  return sheet;
}

export function wrapToRows(text, charsPerRow = CHARS_PER_ROW) {
  const out = [];
  const paras = String(text || "").split("\n");
  for (const para of paras) {
    if (!para) {
      out.push("");
      continue;
    }
    let rem = para;
    while (rem.length > 0) {
      if (rem.length <= charsPerRow) {
        out.push(rem);
        break;
      }
      let cut = charsPerRow;
      const slice = rem.slice(0, charsPerRow + 8);
      const sp = slice.lastIndexOf(" ");
      if (sp > charsPerRow * 0.35) cut = sp;
      out.push(rem.slice(0, cut).trimEnd());
      rem = rem.slice(cut).trimStart();
    }
  }
  return out.length ? out : [""];
}

export function distributeRows(rows, startPage = 0, startRow = 0) {
  const sheet = createEmptyAnswerSheet();
  let p = startPage;
  let r = startRow;
  for (const line of rows) {
    if (p >= ANSWER_PAGE_COUNT) break;
    sheet[p][r] = line;
    r++;
    if (r >= ROWS_PER_PAGE) {
      r = 0;
      p++;
    }
  }
  return { sheet, endPage: p, endRow: r, overflow: p >= ANSWER_PAGE_COUNT && rows.length > 0 };
}

export function countUsedRows(pages, countLines = null) {
  let used = 0;
  normalizeAnswerPages(pages).forEach((pageText) => {
    if (!String(pageText || "").trim()) return;
    if (countLines) {
      used += countLines(pageText);
      return;
    }
    used += String(pageText).split("\n").filter((l) => l.trim()).length || 1;
  });
  return used;
}

export function countPageUsedRows(pageRows) {
  return (pageRows || []).filter((r) => String(r || "").trim()).length;
}

export function getCircledNumber(n) {
  return CIRCLED_NUMBERS[Math.max(0, Math.min(19, n - 1))] || `${n}.`;
}

export function stripListPrefix(line) {
  return String(line || "").replace(CIRCLED_RE, "").replace(NUMERIC_RE, "");
}

export function detectListStyle(line) {
  if (CIRCLED_RE.test(line)) return "circled";
  if (NUMERIC_RE.test(line)) return "numeric";
  return null;
}

export function formatListLine(index, style, content = "") {
  const body = stripListPrefix(content);
  if (style === "numeric") return `${index}. ${body}`.trimEnd();
  return `${getCircledNumber(index)} ${body}`.trimEnd();
}

export function renumberListRows(rows, style = "circled") {
  let num = 0;
  let inList = false;
  return rows.map((row) => {
    const hasMarker = detectListStyle(row) !== null || (inList && String(row || "").trim());
    if (detectListStyle(row)) {
      inList = true;
      num++;
      return formatListLine(num, style, row);
    }
    if (inList && !String(row || "").trim()) {
      inList = false;
      num = 0;
      return "";
    }
    if (inList && String(row || "").trim()) {
      return stripListPrefix(row);
    }
    return row;
  });
}

export function insertNumberAtRow(rows, rowIndex, style = "circled") {
  const copy = [...rows];
  let listCount = 0;
  for (let i = 0; i <= rowIndex; i++) {
    if (detectListStyle(copy[i])) listCount++;
  }
  const nextNum = listCount + 1;
  if (nextNum > 20) return copy;
  const current = copy[rowIndex] || "";
  if (detectListStyle(current)) {
    copy[rowIndex] = formatListLine(nextNum, style, current);
  } else {
    copy[rowIndex] = formatListLine(nextNum, style, current);
  }
  return renumberListRows(copy, style);
}

export function handleEnterOnRow(rows, rowIndex, style = "circled", prevWasEmpty = false) {
  const line = rows[rowIndex] || "";
  const isListLine = detectListStyle(line) !== null;

  if (isListLine && !String(stripListPrefix(line)).trim() && prevWasEmpty) {
    const copy = [...rows];
    copy[rowIndex] = "";
    return { rows: renumberListRows(copy, style), endList: true };
  }

  if (isListLine) {
    const copy = [...rows];
    const nextIdx = rowIndex + 1;
    if (nextIdx >= ROWS_PER_PAGE) {
      let listCount = 0;
      for (let i = 0; i <= rowIndex; i++) if (detectListStyle(copy[i])) listCount++;
      return { rows: copy, endList: false, overflow: true, nextListNum: listCount + 1 };
    }
    let listCount = 0;
    for (let i = 0; i <= rowIndex; i++) if (detectListStyle(copy[i])) listCount++;
    copy.splice(nextIdx, 0, formatListLine(listCount + 1, style, ""));
    return { rows: renumberListRows(copy.slice(0, ROWS_PER_PAGE), style), endList: false };
  }

  return { rows, endList: false };
}

export function renderAnswerSheetEditor(container, pageRows, pageIndex, { onRowInput, onRowKeydown, activeRow } = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="answer-sheet-live" data-page="${pageIndex + 1}">
      <div class="answer-sheet-live-header">
        <span class="answer-sheet-live-title">답 안 지</span>
        <span class="answer-sheet-live-page">${pageIndex + 1} / ${ANSWER_PAGE_COUNT}</span>
      </div>
      <div class="answer-sheet-live-lines">
        ${pageRows
          .map(
            (text, idx) => `
          <div class="answer-live-row${activeRow === idx ? " is-active" : ""}" data-row="${idx}">
            <span class="answer-live-num">${idx + 1}</span>
            <div class="answer-live-cell" contenteditable="plaintext-only" data-row-input="${idx}" spellcheck="false">${escapeHtml(text) || "<br>"}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>`;

  container.querySelectorAll("[data-row-input]").forEach((cell) => {
    cell.addEventListener("input", () => onRowInput?.(Number(cell.dataset.rowInput), cell));
    cell.addEventListener("keydown", (e) => onRowKeydown?.(Number(cell.dataset.rowInput), e, cell));
    cell.addEventListener("focus", () => {
      container.querySelectorAll(".answer-live-row").forEach((r) => r.classList.remove("is-active"));
      cell.closest(".answer-live-row")?.classList.add("is-active");
    });
  });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function cellText(cell) {
  return (cell?.textContent || "").replace(/\u00a0/g, " ").trimEnd();
}

export function sheetToExportPages(pages, docTitle) {
  return (pages || createEmptyAnswerSheet()).map((pageRows, idx) => ({
    pageIndex: idx,
    rows: [...pageRows],
    docTitle,
  }));
}
