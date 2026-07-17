/**
 * 답안 작성 화면 DOM 클론 — 미리보기/PDF/인쇄용
 */
import { ANSWER_PAGE_COUNT } from "./workspace-answer-editor.js";
import { applyAnswerSheetVars, normalizeAnswerTypography } from "./workspace-answer-typography.js";

export const SHEET_MARKUP = (pageIndex) => `
  <div class="answer-doc-sheet answer-sheet-page" data-page="${pageIndex + 1}">
    <div class="answer-doc-header">
      <span class="answer-doc-title">답 안 지</span>
      <span class="answer-doc-page">${pageIndex + 1} / ${ANSWER_PAGE_COUNT}</span>
    </div>
    <div class="answer-doc-body answer-sheet-content">
      <div class="answer-doc-bg answer-line-background" aria-hidden="true">
        ${Array.from({ length: 25 }, () => `<div class="answer-doc-bg-line"></div>`).join("")}
      </div>
      <div class="answer-doc-editor" spellcheck="false" role="textbox" aria-multiline="true"></div>
      <svg class="draw-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="draw-interact-layer" aria-hidden="true"></div>
    </div>
  </div>`;

export function ensureAnswerDrawLayers(bodyEl) {
  if (!bodyEl || bodyEl.querySelector(".draw-layer")) return;
  const drawLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  drawLayer.classList.add("draw-layer");
  drawLayer.setAttribute("viewBox", "0 0 100 100");
  drawLayer.setAttribute("preserveAspectRatio", "none");
  drawLayer.setAttribute("aria-hidden", "true");
  const drawInteract = document.createElement("div");
  drawInteract.className = "draw-interact-layer";
  drawInteract.setAttribute("aria-hidden", "true");
  bodyEl.append(drawLayer, drawInteract);
}

export function finalizeSheetClone(clone) {
  if (!clone) return clone;
  clone.classList.add("answer-doc-sheet-clone");
  const editor = clone.querySelector(".answer-doc-editor");
  if (editor) {
    editor.contentEditable = "false";
    editor.removeAttribute("contenteditable");
  }
  return clone;
}

import { setEditorContent } from "./workspace-answer-format.js";

export function buildAnswerSheetFromPageHtml(pageIndex, pageHtml, typography = {}) {
  const mount = document.createElement("div");
  mount.innerHTML = SHEET_MARKUP(pageIndex);
  const t = normalizeAnswerTypography(typography);
  applyAnswerSheetVars(mount, t);
  const sheet = mount.querySelector(".answer-doc-sheet");
  applyAnswerSheetVars(sheet, t);
  const editor = sheet.querySelector(".answer-doc-editor");
  setEditorContent(editor, pageHtml ?? "");
  return finalizeSheetClone(sheet);
}

export function mountOffscreenSheet(pageIndex, pageContent, widthPx, typography = {}) {
  const mount = document.createElement("div");
  mount.className = "answer-doc-offscreen-mount";
  mount.innerHTML = SHEET_MARKUP(pageIndex);
  const t = normalizeAnswerTypography(typography);
  applyAnswerSheetVars(mount, t);
  const sheet = mount.querySelector(".answer-doc-sheet");
  if (widthPx) {
    sheet.style.width = `${widthPx}px`;
    sheet.style.maxWidth = `${widthPx}px`;
  }
  applyAnswerSheetVars(sheet, t);
  const editor = mount.querySelector(".answer-doc-editor");
  setEditorContent(editor, pageContent ?? "");
  document.body.appendChild(mount);
  return mount;
}

export function cloneSheetFromMount(mount) {
  const sheet = mount?.querySelector(".answer-doc-sheet");
  if (!sheet) return null;
  return finalizeSheetClone(sheet.cloneNode(true));
}
