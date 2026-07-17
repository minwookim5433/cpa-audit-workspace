/**
 * 시험지 텍스트 검색
 */
import { extractAllPageTexts } from "./study-problem-range.js";

export async function buildPageTexts(pdfDoc) {
  return extractAllPageTexts(pdfDoc);
}

export function searchInPages(pageTexts, query) {
  const q = String(query || "").trim();
  if (!q) return [];

  const lower = q.toLowerCase();
  const results = [];

  for (const { pageNumber, text } of pageTexts) {
    const tLower = (text || "").toLowerCase();
    let idx = 0;
    while (idx < tLower.length) {
      const found = tLower.indexOf(lower, idx);
      if (found === -1) break;
      const snippetStart = Math.max(0, found - 30);
      const snippetEnd = Math.min(text.length, found + q.length + 30);
      results.push({
        pageNumber,
        index: found,
        snippet: text.slice(snippetStart, snippetEnd).replace(/\s+/g, " ").trim(),
      });
      idx = found + q.length;
    }
  }
  return results;
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
