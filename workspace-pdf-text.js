/**
 * PDF textContent → 검색용 문자열 (페이지 좌표 정렬 + 정규화)
 */

const LINE_MERGE_THRESHOLD = 4;
const WORD_GAP_FACTOR = 0.3;

function itemGeometry(item) {
  const transform = item?.transform || [1, 0, 0, 1, 0, 0];
  const str = String(item?.str ?? "");
  const scaleX = Math.abs(transform[0]) || 1;
  const scaleY = Math.abs(transform[3]) || scaleX;
  const width = Math.abs(item?.width ?? 0) || scaleX * Math.max(str.length, 1) * 0.55;
  const height = Math.abs(item?.height ?? 0) || scaleY;
  return {
    str,
    x: transform[4],
    y: transform[5],
    width,
    height,
    hasEOL: Boolean(item?.hasEOL),
  };
}

function collapseSpaces(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** PDF.js textContent.items → 읽기 순서 문자열 */
export function buildSearchTextFromItems(items = []) {
  const parsed = items
    .map(itemGeometry)
    .filter((item) => item.str.length > 0);

  if (!parsed.length) return "";

  parsed.sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > LINE_MERGE_THRESHOLD) return dy;
    return a.x - b.x;
  });

  let out = "";
  let prev = null;

  for (const item of parsed) {
    if (prev) {
      const sameLine = Math.abs(item.y - prev.y) <= LINE_MERGE_THRESHOLD;
      if (!sameLine) {
        out += " ";
      } else {
        const gap = item.x - (prev.x + prev.width);
        const unit = Math.max(
          prev.height,
          item.height,
          prev.width / Math.max(prev.str.length, 1),
          item.width / Math.max(item.str.length, 1),
          1
        );
        if (gap > unit * WORD_GAP_FACTOR || (prev.hasEOL && gap > 0)) {
          out += " ";
        }
      }
    }
    out += item.str;
    prev = item;
  }

  return collapseSpaces(out);
}

export function buildSearchTextVariants(textContent) {
  const items = textContent?.items || [];
  const variants = new Set();

  const sorted = buildSearchTextFromItems(items);
  if (sorted) variants.add(sorted);

  const joined = items.map((item) => String(item?.str ?? "")).join("");
  if (joined.trim()) variants.add(collapseSpaces(joined));

  const spaced = items.map((item) => String(item?.str ?? "")).join(" ");
  if (spaced.trim()) variants.add(collapseSpaces(spaced));

  return [...variants];
}

/** PDF 텍스트 레이어 검색용 — 공백·호환 문자 정규화 */
export function normalizePdfSearchText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "");
}

function normalizePdfSearchQuery(query) {
  return normalizePdfSearchText(String(query || "").trim()).toLowerCase();
}

export function findNormalizedMatches(text, query) {
  const normalizedText = normalizePdfSearchText(text).toLowerCase();
  const normalizedQuery = normalizePdfSearchQuery(query);
  if (!normalizedQuery || !normalizedText) return [];

  const matches = [];
  let idx = 0;
  while (idx < normalizedText.length) {
    const found = normalizedText.indexOf(normalizedQuery, idx);
    if (found === -1) break;
    const snippetStart = Math.max(0, found - 20);
    const snippetEnd = Math.min(normalizedText.length, found + normalizedQuery.length + 20);
    matches.push({
      index: found,
      snippet: normalizedText.slice(snippetStart, snippetEnd),
    });
    idx = found + normalizedQuery.length;
  }
  return matches;
}

export function findNormalizedMatchesInTexts(texts, query) {
  const seen = new Set();
  const matches = [];

  for (const text of texts || []) {
    for (const match of findNormalizedMatches(text, query)) {
      const key = `${match.index}:${match.snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(match);
    }
  }

  return matches;
}

export function assessTextContent(textContent) {
  const items = textContent?.items || [];
  const variants = buildSearchTextVariants(textContent);
  const text = variants[0] || "";
  const charCount = Math.max(...variants.map((v) => v.length), 0);
  const itemCount = items.length;
  const isTextRich = itemCount >= 8 && charCount >= 40;

  return { isTextRich, charCount, itemCount, text, variants };
}
