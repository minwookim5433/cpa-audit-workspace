/**
 * 시험지 텍스트 검색 — lazy textContent + 캐시
 */
import {
  assessTextContent,
  findNormalizedMatchesInTexts,
  normalizePdfSearchText,
} from "./workspace-pdf-text.js";

export { normalizePdfSearchText };

const pageTextCaches = new Map();

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

async function readPageTextContent(page) {
  const variants = [];
  const seen = new Set();

  for (const disableNormalization of [true, false]) {
    try {
      const textContent = await page.getTextContent({ disableNormalization });
      const key = JSON.stringify((textContent?.items || []).map((item) => item?.str ?? ""));
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push(textContent);
    } catch {
      /* try next mode */
    }
  }

  if (!variants.length) {
    return page.getTextContent();
  }
  return variants;
}

function mergePageTextAssessment(textContents) {
  const lists = Array.isArray(textContents) ? textContents : [textContents];
  const allVariants = new Set();
  let isTextRich = false;
  let charCount = 0;
  let itemCount = 0;
  let primaryText = "";

  for (const textContent of lists) {
    const assess = assessTextContent(textContent);
    itemCount = Math.max(itemCount, assess.itemCount);
    charCount = Math.max(charCount, assess.charCount);
    isTextRich = isTextRich || assess.isTextRich;
    for (const variant of assess.variants || []) {
      if (variant) allVariants.add(variant);
    }
    if (!primaryText && assess.text) primaryText = assess.text;
  }

  const textVariants = [...allVariants];
  return {
    text: primaryText || textVariants[0] || "",
    textVariants: textVariants.length ? textVariants : [primaryText].filter(Boolean),
    isTextRich,
  };
}

export async function extractPageText(pdfDoc, pageNumber) {
  const page = await pdfDoc.getPage(pageNumber);
  const textContents = await readPageTextContent(page);
  return mergePageTextAssessment(textContents);
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

  for (const { pageNumber, text, textVariants } of pageTexts || []) {
    const texts = textVariants?.length ? textVariants : [text];
    for (const match of findNormalizedMatchesInTexts(texts, q)) {
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
  if (!q || !pdfDoc?.numPages) {
    return { results: [], scannedPages: 0, cancelled: false, hadExtractableText: false };
  }

  const {
    cache = new Map(),
    onProgress,
    isCancelled = () => false,
    yieldEvery = 4,
  } = options;

  const results = [];
  const totalPages = pdfDoc.numPages;
  let hadExtractableText = false;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    if (isCancelled()) {
      return {
        results: [],
        scannedPages: pageNumber - 1,
        cancelled: true,
        hadExtractableText,
      };
    }

    onProgress?.(pageNumber, totalPages);

    let cached = cache.get(pageNumber);
    if (typeof cached === "string") {
      cached = { text: cached, textVariants: [cached] };
      cache.set(pageNumber, cached);
    }
    if (!cached) {
      const extracted = await extractPageText(pdfDoc, pageNumber);
      cached = {
        text: extracted.text,
        textVariants: extracted.textVariants || [extracted.text],
      };
      cache.set(pageNumber, cached);
    }

    if (extractedHasText(cached)) {
      hadExtractableText = true;
    }

    for (const match of findNormalizedMatchesInTexts(cached.textVariants, q)) {
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

  return { results, scannedPages: totalPages, cancelled: false, hadExtractableText };
}

function extractedHasText(cached) {
  if (!cached) return false;
  return (cached.textVariants || [cached.text]).some((text) => String(text || "").trim().length > 0);
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
