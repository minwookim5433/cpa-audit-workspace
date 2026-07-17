/**
 * 답안 편집기 시각적 줄 측정 — 브라우저 렌더 결과 기준
 */
import { ROWS_PER_PAGE } from "./workspace-answer-editor.js";

export function measureVisualLineStarts(root) {
  if (!root) return [0];
  const starts = [0];
  let lastTop = null;
  let charIndex = 0;
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    for (let i = 0; i < len; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rects = range.getClientRects();
      if (rects.length) {
        const top = Math.round(rects[0].top);
        if (lastTop !== null && top > lastTop + 1) {
          starts.push(charIndex);
        }
        lastTop = top;
      }
      charIndex++;
    }
    node = walker.nextNode();
  }
  return starts;
}

export function countVisualLines(root) {
  const starts = measureVisualLineStarts(root);
  return Math.max(1, starts.length);
}

export function getTextOffsetBoundaryRange(root, offset) {
  const range = document.createRange();
  if (!root) return range;
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.setEnd(node, remaining);
      return range;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  range.selectNodeContents(root);
  range.collapse(false);
  return range;
}

export function extractHtmlBetweenOffsets(root, startOffset, endOffset) {
  if (!root) return "";
  const start = getTextOffsetBoundaryRange(root, startOffset);
  const end = getTextOffsetBoundaryRange(root, endOffset);
  const range = document.createRange();
  range.setStart(start.startContainer, start.startOffset);
  range.setEnd(end.startContainer, end.startOffset);
  const div = document.createElement("div");
  div.appendChild(range.cloneContents());
  return div.innerHTML;
}

export function splitHtmlAtVisualLines(root, maxLines = ROWS_PER_PAGE) {
  const text = String(root?.innerText || "").replace(/\r/g, "");
  const starts = measureVisualLineStarts(root);
  if (starts.length <= maxLines) {
    return {
      kept: text,
      overflow: "",
      keptHtml: root?.innerHTML ?? "",
      overflowHtml: "",
    };
  }
  const splitAt = starts[maxLines] ?? text.length;
  return {
    kept: text.slice(0, splitAt),
    overflow: text.slice(splitAt),
    keptHtml: extractHtmlBetweenOffsets(root, 0, splitAt),
    overflowHtml: extractHtmlBetweenOffsets(root, splitAt, text.length),
  };
}

export function countNonEmptyVisualLines(root) {
  if (!root) return 0;
  const text = String(root.innerText || "").replace(/\r/g, "");
  const starts = measureVisualLineStarts(root);
  let count = 0;
  for (let i = 0; i < starts.length; i++) {
    const slice = text.slice(starts[i], starts[i + 1] ?? text.length);
    if (slice.trim()) count++;
  }
  return count;
}
