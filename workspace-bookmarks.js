/**
 * 시험지 북마크
 */
const BOOKMARK_PRESETS = ["문제 1", "문제 2", "문제 3", "물음 1", "물음 2"];

export function createBookmark(name, pageNumber) {
  return {
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    name: String(name || "").trim() || `p.${pageNumber}`,
    pageNumber: Number(pageNumber) || 1,
    createdAt: new Date().toISOString(),
  };
}

export function renderBookmarkPanel(container, bookmarks, currentPage, onJump, onAdd, onDelete) {
  if (!container) return;

  container.innerHTML = `
    <div class="ws-bookmark-add">
      <input type="text" id="ws-bookmark-name" class="ws-bookmark-input" placeholder="북마크 이름" list="ws-bookmark-presets" />
      <datalist id="ws-bookmark-presets">
        ${BOOKMARK_PRESETS.map((p) => `<option value="${p}">`).join("")}
      </datalist>
      <button type="button" id="ws-bookmark-add-btn" class="ws-btn ws-btn-primary">북마크 추가 (p.${currentPage})</button>
    </div>
    <ul class="ws-bookmark-list" id="ws-bookmark-list">
      ${
        bookmarks.length
          ? bookmarks
              .map(
                (bm) => `
          <li class="ws-bookmark-item">
            <button type="button" class="ws-bookmark-link" data-bm-id="${bm.id}">${escapeHtml(bm.name)} <span>p.${bm.pageNumber}</span></button>
            <button type="button" class="ws-bookmark-del" data-bm-del="${bm.id}" title="삭제">×</button>
          </li>`
              )
              .join("")
          : `<li class="ws-empty-msg">북마크가 없습니다</li>`
      }
    </ul>`;

  document.getElementById("ws-bookmark-add-btn")?.addEventListener("click", () => {
    const name = document.getElementById("ws-bookmark-name")?.value?.trim();
    onAdd(name);
  });

  container.querySelectorAll("[data-bm-id]").forEach((btn) => {
    btn.addEventListener("click", () => onJump(btn.dataset.bmId));
  });

  container.querySelectorAll("[data-bm-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete(btn.dataset.bmDel);
    });
  });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
