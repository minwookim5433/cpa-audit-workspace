/**
 * PDF 페이지별 텍스트에서 문제 번호 범위 탐지
 */
const PROBLEM_MARKER_RES = [
  /【\s*문제\s*(\d+)\s*】/gi,
  /\[\s*문제\s*(\d+)\s*\]/gi,
  /(?:^|[\n\r\s])문제\s*(\d+)(?=[\s\】\]）):：\.번호]|$)/gim,
];

const QUESTION_RE = /\(물음\s*(\d+)\)/g;

export function findProblemNumbersInText(text) {
  const found = new Set();
  if (!text) return [];
  for (const re of PROBLEM_MARKER_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > 0 && n <= 30) found.add(n);
    }
  }
  return [...found].sort((a, b) => a - b);
}

export function findQuestionNumbersInText(text) {
  if (!text) return [];
  const nums = new Set();
  QUESTION_RE.lastIndex = 0;
  let m;
  while ((m = QUESTION_RE.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > 0 && n <= 20) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

export async function extractAllPageTexts(pdfDoc) {
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map((it) => it.str || "").join(" ");
    const charCount = text.replace(/\s/g, "").length;
    pages.push({ pageNumber: i, text, charCount, itemCount: tc.items.length });
  }
  return pages;
}

/**
 * @returns {{ ok: true, startPage: number, endPage: number, problemNumber: number, questionNumbers: number[] } | { ok: false, reason: string }}
 */
export function findProblemPageRange(pageTexts, problemNumber) {
  const num = parseInt(String(problemNumber).trim(), 10);
  if (Number.isNaN(num) || num < 1) {
    return { ok: false, reason: "invalid_number" };
  }

  let startPage = null;
  let nextProblemPage = null;

  for (const { pageNumber, text } of pageTexts) {
    const markers = findProblemNumbersInText(text);
    if (markers.includes(num) && startPage === null) startPage = pageNumber;
    if (markers.includes(num + 1) && nextProblemPage === null) nextProblemPage = pageNumber;
  }

  if (startPage === null) {
    return { ok: false, reason: "not_found" };
  }

  const lastPage = pageTexts[pageTexts.length - 1]?.pageNumber || startPage;
  const endPage = nextProblemPage ? nextProblemPage - 1 : lastPage;

  if (endPage < startPage) {
    return { ok: false, reason: "invalid_range" };
  }

  const rangeText = pageTexts
    .filter((p) => p.pageNumber >= startPage && p.pageNumber <= endPage)
    .map((p) => p.text)
    .join("\n");

  const questionNumbers = findQuestionNumbersInText(rangeText);

  return {
    ok: true,
    startPage,
    endPage,
    problemNumber: num,
    questionNumbers,
    rangeTextLength: rangeText.replace(/\s/g, "").length,
  };
}

export function assessTextContent(textContent, minChars = 80, minItems = 5) {
  let chars = 0;
  const items = textContent?.items?.length || 0;
  for (const item of textContent?.items || []) {
    chars += (item.str || "").length;
  }
  return {
    chars,
    items,
    isTextRich: chars >= minChars && items >= minItems,
  };
}
