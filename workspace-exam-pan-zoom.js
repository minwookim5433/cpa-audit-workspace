/**
 * 시험지 PDF 배율 유틸 (Pan 제거 — 브라우저 기본 스크롤만 사용)
 */
export const MIN_EXAM_SCALE = 0.5;
export const MAX_EXAM_SCALE = 3;
export const BUTTON_ZOOM_STEP = 0.1;

export function clampExamScale(scale) {
  const n = Number(scale);
  if (Number.isNaN(n)) return 1;
  return Math.max(MIN_EXAM_SCALE, Math.min(MAX_EXAM_SCALE, Math.round(n * 100) / 100));
}

export function calcZoomScrollAnchor(scrollEl, clientX, clientY, oldScale, newScale) {
  if (!scrollEl || oldScale <= 0 || newScale <= 0) {
    return { scrollLeft: scrollEl?.scrollLeft || 0, scrollTop: scrollEl?.scrollTop || 0 };
  }
  const rect = scrollEl.getBoundingClientRect();
  const offsetX = clientX - rect.left + scrollEl.scrollLeft;
  const offsetY = clientY - rect.top + scrollEl.scrollTop;
  const ratio = newScale / oldScale;
  return {
    scrollLeft: offsetX * ratio - (clientX - rect.left),
    scrollTop: offsetY * ratio - (clientY - rect.top),
  };
}

export function clampExamScroll(scrollEl) {
  if (!scrollEl) return;
  const maxLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
  const maxTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
  scrollEl.scrollLeft = Math.max(0, Math.min(maxLeft, scrollEl.scrollLeft));
  scrollEl.scrollTop = Math.max(0, Math.min(maxTop, scrollEl.scrollTop));
}
