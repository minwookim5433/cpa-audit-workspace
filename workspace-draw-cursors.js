/**
 * 시험지 주석 도구 — SVG data URI 커서
 * hotspot = SVG viewBox 좌표계에서 펜촉/접촉점 (24×24)
 */
const CURSOR_SIZE = 24;

function svgCursor(svg, hotX, hotY, fallback = "pointer") {
  const uri = encodeURIComponent(svg.replace(/\s+/g, " ").trim());
  return `url("data:image/svg+xml,${uri}") ${hotX} ${hotY}, ${fallback}`;
}

/** 연필 — 펜촉 끝 (3, 3) */
const SVG_UNDERLINE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path fill="#37474F" d="M2 2 L4.2 2 L5 3.8 L2.8 3.8 Z"/>
  <path fill="#FFB300" stroke="#6D4C41" stroke-width="0.45" d="M3.5 3.5 L6.5 6.5 L21 21 L18 21.5 L3.5 7 Z"/>
  <path fill="#BDBDBD" d="M6 6 L8 8 L9.5 8.5 L7.5 6.5 Z"/>
</svg>`;

/** 형광펜 — 촉 끝 (2, 19) */
const SVG_HIGHLIGHTER = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="10" y="4" width="10" height="15" rx="1" fill="#E6EE9C" stroke="#33691E" stroke-width="0.85"/>
  <path fill="#FFF176" stroke="#33691E" stroke-width="0.85" stroke-linejoin="round" d="M2 19 L10 15 L12 18 L4 22 Z"/>
</svg>`;

/** 가는 펜 — 펜촉 끝 (3, 2) */
const SVG_PEN = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path fill="#212121" d="M2 2 L3.8 1.2 L5.2 2.6 L3.4 3.4 Z"/>
  <path fill="#E53935" stroke="#B71C1C" stroke-width="0.4" d="M3.5 3 L6.5 6 L20 19.5 L17 20 L3.5 6.5 Z"/>
</svg>`;

/** 지우개 — 접촉 모서리 (4, 11) */
const SVG_ERASER = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path fill="#FFAB91" stroke="#D84315" stroke-width="0.55" d="M4 8 L16 8 L18 14 L6 14 Z"/>
  <path fill="#FF8A65" d="M4 8 L6 14 L4 14 Z"/>
  <rect x="15" y="8.5" width="3.5" height="5" rx="0.5" fill="#BDBDBD" stroke="#757575" stroke-width="0.4"/>
</svg>`;

export const CURSOR_SPECS = {
  underline: { size: CURSOR_SIZE, hotspot: [3, 3] },
  highlighter: { size: CURSOR_SIZE, hotspot: [2, 19] },
  pen: { size: CURSOR_SIZE, hotspot: [3, 2] },
  eraser: { size: CURSOR_SIZE, hotspot: [4, 11] },
};

export const CURSOR_UNDERLINE = svgCursor(SVG_UNDERLINE, 3, 3, "pointer");
export const CURSOR_HIGHLIGHTER = svgCursor(SVG_HIGHLIGHTER, 2, 19, "pointer");
export const CURSOR_PEN = svgCursor(SVG_PEN, 3, 2, "pointer");
export const CURSOR_ERASER = svgCursor(SVG_ERASER, 4, 11, "pointer");

export function getCursorForTool(tool) {
  switch (tool) {
    case "underline":
      return CURSOR_UNDERLINE;
    case "highlighter":
      return CURSOR_HIGHLIGHTER;
    case "pen":
      return CURSOR_PEN;
    case "eraser":
      return CURSOR_ERASER;
    default:
      return "";
  }
}

export function applyDrawToolCursor(el, tool) {
  if (!el) return;
  const cursor = getCursorForTool(tool);
  if (cursor) el.style.cursor = cursor;
  else el.style.removeProperty("cursor");
}
