/**
 * 시험지 텍스트 검색 — lazy textContent + 캐시
 */
import { assessTextContent } from "./study-problem-range.js";

const pageTextCaches = new Map();

function textFromContent(textContent) {
  return (textContent?.items || [])
    .map((item) => String(item?.str ?? ""))
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** PDF 텍스트 레이어 검색용 — 글자 사이 불필요 공백 제거 */
export function normalizePdfSearchText(text) {
  return String(text ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "");
}

function normalizePdfSearchQuery(query) {
  return normalizePdfSearchText(String(query || "").trim()).toLowerCase();
}

function findNormalizedMatches(text, query) {
  const normalizedText = normalizePdfSearchText(text).toLowerCase();
  const normalizedQuery = normalizePdfSearchQuery(query);
  if (!normalizedQuery) return [];

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

export function getPageTextCache(fingerprint) {
  if (!fingerprint) return new Map();
  if (!pageTextCaches.has(fingerprint)) pageTextCaches.set(fingerprint, new Map());
  return pageTextCaches.get(fingerprint);
}

export function clearPageTextCache(fingerprint) {
  if (fingerprint) pageTextCaches.delete(fingerprint);
}

export function clearAllPageTextCaches() {
  pageTextCaches.clear();
}

export async function extractPageText(pdfDoc, pageNumber) {
  const page = await pdfDoc.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const assess = assessTextContent(textContent);
  return {
    text: assess.text,
    isTextRich: assess.isTextRich,
  };
}

/** @deprecated lazy search + cache 사용 권장 */
export async function buildPageTexts(pdfDoc) {
  if (!pdfDoc?.numPages) return [];
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
    const { text } = await extractPageText(pdfDoc, pageNumber);
    pages.push({ pageNumber, text });
  }
  return pages;
}

export function searchInPages(pageTexts, query) {
  const q = String(query || "").trim();
  if (!q) return [];

  const results = [];

  for (const { pageNumber, text } of pageTexts || []) {
    for (const match of findNormalizedMatches(text, q)) {
      results.push({
        pageNumber,
        index: match.index,
        snippet: match.snippet,
      });
    }
  }
  return results;
}

export async function searchPdfDocument(pdfDoc, query, options = {}) {
  const q = String(query || "").trim();
  if (!q || !pdfDoc?.numPages) return { results: [], scannedPages: 0 };

  const {
    cache = new Map(),
    onProgress,
    isCancelled = () => false,
    yieldEvery = 4,
  } = options;

  const results = [];
  const totalPages = pdfDoc.numPages;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    if (isCancelled()) {
      return { results: [], scannedPages: pageNumber - 1, cancelled: true };
    }

    onProgress?.(pageNumber, totalPages);

    let text = cache.get(pageNumber);
    if (text === undefined) {
      const extracted = await extractPageText(pdfDoc, pageNumber);
      text = extracted.text;
      cache.set(pageNumber, text);
    }

    for (const match of findNormalizedMatches(text, q)) {
      results.push({
        pageNumber,
        index: match.index,
        snippet: match.snippet,
      });
    }

    if (pageNumber % yieldEvery === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { results, scannedPages: totalPages, cancelled: false };
}

export function renderSearchResults(container, results, currentIdx, onJump) {
  if (!container) return;
  if (!results.length) {
    container.innerHTML = `<p class="ws-empty-msg">검색 결과 없음</p>`;
    return;
  }

  const pages = [...new Set(results.map((r) => r.pageNumber))];
  container.innerHTML = `
    <p class="ws-search-summary">${results.length}건 · ${pages.length}페이지</p>
    <ul class="ws-search-list">
      ${results
        .map(
          (r, i) => `
        <li>
          <button type="button" class="ws-search-item${i === currentIdx ? " is-active" : ""}" data-search-idx="${i}">
            <span class="ws-search-page">p.${r.pageNumber}</span>
            <span class="ws-search-snippet">…${escapeHtml(r.snippet)}…</span>
          </button>
        </li>`
        )
        .join("")}
    </ul>`;

  container.querySelectorAll("[data-search-idx]").forEach((btn) => {
    btn.addEventListener("click", () => onJump(Number(btn.dataset.searchIdx)));
  });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
