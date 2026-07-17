/**
 * PDF 주석 — 형광펜, 밑줄, 메모
 */

export const HIGHLIGHT_COLORS = {
  yellow: { fill: "rgba(255, 230, 0, 0.45)", label: "노랑" },
  green: { fill: "rgba(120, 220, 120, 0.45)", label: "초록" },
  pink: { fill: "rgba(255, 150, 200, 0.45)", label: "분홍" },
};

export const UNDERLINE_COLORS = {
  yellow: "#e6b800",
  green: "#2d8a2d",
  pink: "#d63384",
  blue: "#3d5a80",
};

export function createAnnotation({
  pdfFingerprint,
  pageNumber,
  type,
  x,
  y,
  width,
  height,
  color = "yellow",
  text = "",
  memoText = "",
}) {
  return {
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    pdfFingerprint,
    pageNumber,
    type,
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(width),
    height: clamp01(height),
    color,
    text,
    memoText,
    createdAt: new Date().toISOString(),
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

export function normalizeRectFromPixels(rect, displayWidth, displayHeight) {
  const w = Math.max(1, displayWidth);
  const h = Math.max(1, displayHeight);
  return {
    x: rect.x / w,
    y: rect.y / h,
    width: rect.width / w,
    height: rect.height / h,
  };
}

export function getAnnotationsForPage(annotations, pageNumber) {
  return (annotations || []).filter((a) => a.pageNumber === pageNumber);
}

export function renderAnnotations(layerEl, annotations, pageNumber) {
  if (!layerEl) return;
  const items = getAnnotationsForPage(annotations, pageNumber);
  layerEl.innerHTML = items
    .map((ann) => {
      const style = `left:${ann.x * 100}%;top:${ann.y * 100}%;width:${ann.width * 100}%;height:${ann.height * 100}%`;
      if (ann.type === "underline") {
        const color = UNDERLINE_COLORS[ann.color] || UNDERLINE_COLORS.yellow;
        return `<div class="pdf-annotation is-underline" data-id="${ann.id}" style="${style}" title="${escapeAttr(ann.text || "")}">
          <span class="pdf-underline-line" style="border-color:${color}"></span>
          <button type="button" class="pdf-annotation-del" data-del="${ann.id}" aria-label="삭제">×</button>
        </div>`;
      }
      if (ann.type === "memo") {
        return `<div class="pdf-annotation is-memo" data-id="${ann.id}" style="${style}" title="${escapeAttr(ann.memoText || ann.text || "")}">
          <span class="pdf-memo-icon">📝</span>
          <button type="button" class="pdf-annotation-del" data-del="${ann.id}" aria-label="삭제">×</button>
        </div>`;
      }
      const fill = HIGHLIGHT_COLORS[ann.color]?.fill || HIGHLIGHT_COLORS.yellow.fill;
      return `<div class="pdf-annotation is-highlight" data-id="${ann.id}" style="${style};background:${fill}" title="${escapeAttr(ann.text || "")}">
        <button type="button" class="pdf-annotation-del" data-del="${ann.id}" aria-label="삭제">×</button>
      </div>`;
    })
    .join("");
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function getTextSelectionRect(containerEl) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

  const range = sel.getRangeAt(0);
  const anchor = sel.anchorNode;
  if (!anchor || !containerEl.contains(anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor)) {
    return null;
  }

  const containerRect = containerEl.getBoundingClientRect();
  const displayW = containerEl.clientWidth;
  const displayH = containerEl.clientHeight;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of range.getClientRects()) {
    if (r.width === 0 && r.height === 0) continue;
    minX = Math.min(minX, r.left - containerRect.left);
    minY = Math.min(minY, r.top - containerRect.top);
    maxX = Math.max(maxX, r.right - containerRect.left);
    maxY = Math.max(maxY, r.bottom - containerRect.top);
  }

  if (!Number.isFinite(minX)) return null;

  const text = sel.toString().trim();
  const pixel = {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.max(2, maxX - minX),
    height: Math.max(2, maxY - minY),
  };

  return { ...normalizeRectFromPixels(pixel, displayW, displayH), text };
}

export function bindRegionSelection(regionLayer, containerEl, onRegionSelected) {
  if (!regionLayer || !containerEl) return () => {};

  let start = null;
  let preview = null;

  const cleanup = () => {
    start = null;
    if (preview) {
      preview.remove();
      preview = null;
    }
    regionLayer.classList.remove("is-selecting");
  };

  regionLayer.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const rect = containerEl.getBoundingClientRect();
    start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    regionLayer.classList.add("is-selecting");
    preview = document.createElement("div");
    preview.className = "region-select-preview";
    containerEl.append(preview);
    e.preventDefault();
  });

  regionLayer.addEventListener("mousemove", (e) => {
    if (!start || !preview) return;
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const left = Math.min(start.x, x);
    const top = Math.min(start.y, y);
    const width = Math.abs(x - start.x);
    const height = Math.abs(y - start.y);
    Object.assign(preview.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  });

  regionLayer.addEventListener("mouseup", (e) => {
    if (!start) return;
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const left = Math.min(start.x, x);
    const top = Math.min(start.y, y);
    const width = Math.abs(x - start.x);
    const height = Math.abs(y - start.y);
    cleanup();

    if (width < 8 || height < 8) return;

    const normalized = normalizeRectFromPixels(
      { x: left, y: top, width, height },
      containerEl.clientWidth,
      containerEl.clientHeight
    );
    onRegionSelected(normalized, { clientX: e.clientX, clientY: e.clientY });
  });

  return cleanup;
}

export function showAnnotateMenu(menuEl, x, y, selectedText = "") {
  if (!menuEl) return;
  menuEl.hidden = false;
  const preview = menuEl.querySelector(".ws-annotate-preview");
  if (preview) {
    if (selectedText) {
      preview.textContent = selectedText.length > 60 ? `${selectedText.slice(0, 60)}…` : selectedText;
      preview.hidden = false;
    } else {
      preview.hidden = true;
    }
  }
  const pad = 8;
  const mw = menuEl.offsetWidth || 200;
  const mh = menuEl.offsetHeight || 120;
  const left = Math.min(window.innerWidth - mw - pad, Math.max(pad, x));
  const top = Math.min(window.innerHeight - mh - pad, Math.max(pad, y));
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
}

export function hideAnnotateMenu(menuEl) {
  if (!menuEl) return;
  menuEl.hidden = true;
}

export function bindAnnotationDeletes(layerEl, onDelete) {
  if (!layerEl) return;
  layerEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    e.stopPropagation();
    onDelete(btn.dataset.del);
  });
}
