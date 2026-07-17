/**
 * 답안 동그라미 번호 — 세션 기반 삽입
 */

const CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
];

const CIRCLED_RE = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g;

export const CIRCLED_MAX = 20;
export const CIRCLED_LIMIT_MESSAGE = "동그라미 번호는 ⑳까지 입력할 수 있습니다.";

export function formatCircledNumber(n) {
  const num = Math.max(1, Math.min(CIRCLED_MAX, Number(n) || 1));
  return CIRCLED[num - 1] || `${num}`;
}

/** @deprecated */
export function formatNumberToken(_format, n) {
  return formatCircledNumber(n);
}

export function parseTypedCircledPattern(lineText) {
  const m = String(lineText || "").match(/^(\d{1,2})\)$/);
  if (!m) return null;
  const num = Number(m[1]);
  if (num < 1 || num > CIRCLED_MAX) return null;
  return num;
}

export function getLeadingWhitespace(text) {
  const match = String(text || "").match(/^(\s*)/);
  return match ? match[1] : "";
}

export function isCircledOnlyLine(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return true;
  return /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]$/.test(trimmed);
}

/** @deprecated */
export function nextCircledAfter(text) {
  const trimmed = String(text || "").trim();
  for (let i = 0; i < CIRCLED.length; i++) {
    if (trimmed.startsWith(CIRCLED[i])) {
      return i + 2 <= CIRCLED_MAX ? i + 2 : CIRCLED_MAX;
    }
  }
  return 1;
}

export function getLastCircledNumberInText(text) {
  let last = 0;
  const matches = String(text || "").match(CIRCLED_RE);
  if (!matches) return 0;
  for (const ch of matches) {
    const idx = CIRCLED.indexOf(ch);
    if (idx >= 0) last = idx + 1;
  }
  return last;
}

export function getSessionTextFromPages(pages, session, plainTextFromHtml) {
  const list = Array.isArray(pages) ? pages : [];
  if (!session) {
    return list.map((page) => plainTextFromHtml(page)).join("\n");
  }
  let out = "";
  for (let i = session.startPage; i < list.length; i++) {
    let text = plainTextFromHtml(list[i] ?? "");
    if (i === session.startPage) {
      text = text.slice(Math.max(0, session.startOffset || 0));
    }
    if (out) out += "\n";
    out += text;
  }
  return out;
}

export function computeNextCircledNumber(pages, session, plainTextFromHtml) {
  const sessionText = getSessionTextFromPages(pages, session, plainTextFromHtml);
  const last = getLastCircledNumberInText(sessionText);
  return last + 1;
}

export function findPreviousNumberedLineLeading(text, caret) {
  const before = String(text || "").slice(0, Math.max(0, caret));
  const lines = before.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(trimmed)) {
      return getLeadingWhitespace(line);
    }
  }
  return "";
}

export function buildCircledInsertPlan(text, caret, num) {
  const circled = formatCircledNumber(num);
  const safeCaret = Math.max(0, Math.min(caret, String(text || "").length));
  const before = String(text || "").slice(0, safeCaret);
  const after = String(text || "").slice(safeCaret);
  const lineStart = Math.max(0, before.lastIndexOf("\n") + 1);
  const lineBeforeCaret = before.slice(lineStart);
  const userLeading = getLeadingWhitespace(lineBeforeCaret);
  const atLineStart = lineBeforeCaret.trim().length === 0;

  if (atLineStart) {
    const prevLeading = findPreviousNumberedLineLeading(text, safeCaret);
    const leading = userLeading || prevLeading;
    const insertText = `${leading}${circled} `;
    return {
      insertAt: lineStart,
      deleteCount: lineBeforeCaret.length,
      insertText,
      newCaret: lineStart + insertText.length,
    };
  }

  const insertText = `${circled} `;
  return {
    insertAt: safeCaret,
    deleteCount: 0,
    insertText,
    newCaret: safeCaret + insertText.length,
  };
}

export function createCircledSession(pageIndex, caretOffset) {
  return {
    startPage: Math.max(0, pageIndex),
    startOffset: Math.max(0, caretOffset || 0),
  };
}
