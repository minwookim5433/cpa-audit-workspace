/**
 * 답안지 공통 타이포그래피 — 단일 font-size / letter-spacing 소스
 */
export const DEFAULT_ANSWER_FONT_SIZE = 14;
export const MIN_ANSWER_FONT_SIZE = 8;
export const MAX_ANSWER_FONT_SIZE = 18;
export const FONT_SIZE_STEP = 0.5;

export const DEFAULT_ANSWER_LETTER_SPACING = 0;
export const MIN_ANSWER_LETTER_SPACING = -2;
export const MAX_ANSWER_LETTER_SPACING = 1;
export const LETTER_SPACING_STEP = 0.1;

export const ANSWER_PAGE_WIDTH_PX = 560;
export const ANSWER_PADDING_LEFT_PX = 10;
export const ANSWER_PADDING_RIGHT_PX = 10;
export const ANSWER_LINE_HEIGHT_PX = 28;
export const ANSWER_FONT_FAMILY =
  '"Batang", "Nanum Myeongjo", "Noto Serif KR", "Times New Roman", serif';

const EXPORT_STYLE_PROPS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "textAlign",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "width",
  "maxWidth",
  "minHeight",
  "height",
  "boxSizing",
  "borderTopWidth",
  "borderTopStyle",
  "borderTopColor",
  "borderRightWidth",
  "borderRightStyle",
  "borderRightColor",
  "borderBottomWidth",
  "borderBottomStyle",
  "borderBottomColor",
  "borderLeftWidth",
  "borderLeftStyle",
  "borderLeftColor",
  "whiteSpace",
  "overflowWrap",
  "wordBreak",
  "color",
  "backgroundColor",
];

export function clampAnswerFontSize(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULT_ANSWER_FONT_SIZE;
  const clamped = Math.min(MAX_ANSWER_FONT_SIZE, Math.max(MIN_ANSWER_FONT_SIZE, n));
  return Math.round(clamped * 2) / 2;
}

export function clampAnswerLetterSpacing(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULT_ANSWER_LETTER_SPACING;
  const clamped = Math.min(MAX_ANSWER_LETTER_SPACING, Math.max(MIN_ANSWER_LETTER_SPACING, n));
  return Math.round(clamped * 10) / 10;
}

export function normalizeAnswerTypography(input = {}) {
  return {
    fontSize: clampAnswerFontSize(input.fontSize ?? DEFAULT_ANSWER_FONT_SIZE),
    letterSpacing: clampAnswerLetterSpacing(
      input.letterSpacing ?? DEFAULT_ANSWER_LETTER_SPACING
    ),
  };
}

export function answerSheetCssVars(typography = {}) {
  const t = normalizeAnswerTypography(typography);
  return {
    "--answer-page-width": `${ANSWER_PAGE_WIDTH_PX}px`,
    "--answer-content-width": `${ANSWER_PAGE_WIDTH_PX - ANSWER_PADDING_LEFT_PX - ANSWER_PADDING_RIGHT_PX}px`,
    "--answer-padding-left": `${ANSWER_PADDING_LEFT_PX}px`,
    "--answer-padding-right": `${ANSWER_PADDING_RIGHT_PX}px`,
    "--answer-font-size": `${t.fontSize}px`,
    "--answer-line-height": `${ANSWER_LINE_HEIGHT_PX}px`,
    "--answer-letter-spacing": `${t.letterSpacing}px`,
  };
}

export function applyAnswerSheetVars(el, typography = {}) {
  if (!el) return;
  const vars = answerSheetCssVars(typography);
  Object.entries(vars).forEach(([key, value]) => {
    el.style.setProperty(key, value);
  });
}

export function answerSheetVarsStyleAttr(typography = {}) {
  const vars = answerSheetCssVars(typography);
  const style = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `style="${style}"`;
}

export function getAnswerEditorExportStyles(typography = {}, referenceEditor = null) {
  const t = normalizeAnswerTypography(typography);
  const ref = referenceEditor ? getAnswerEditorStyleSnapshot(referenceEditor) : null;
  return {
    fontFamily: ref?.fontFamily || ANSWER_FONT_FAMILY,
    fontSize: `${t.fontSize}px`,
    fontWeight: ref?.fontWeight || "400",
    letterSpacing: `${t.letterSpacing}px`,
    lineHeight: `${ANSWER_LINE_HEIGHT_PX}px`,
    paddingLeft: `${ANSWER_PADDING_LEFT_PX}px`,
    paddingRight: `${ANSWER_PADDING_RIGHT_PX}px`,
    paddingTop: "0px",
    paddingBottom: "0px",
    boxSizing: "border-box",
    width: `${ANSWER_PAGE_WIDTH_PX}px`,
    maxWidth: `${ANSWER_PAGE_WIDTH_PX}px`,
    minHeight: `${ANSWER_LINE_HEIGHT_PX * 25}px`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    overflowWrap: "anywhere",
    position: "relative",
    zIndex: "1",
    margin: "0",
    color: "#000000",
    backgroundColor: "#ffffff",
  };
}

export function applyAnswerEditorExportStyles(el, typography = {}, referenceEditor = null) {
  if (!el) return;
  Object.assign(el.style, getAnswerEditorExportStyles(typography, referenceEditor));
}

export function applyAnswerSheetExportLayout(el, typography = {}) {
  if (!el) return;
  applyAnswerSheetVars(el, typography);
  Object.assign(el.style, {
    width: `${ANSWER_PAGE_WIDTH_PX}px`,
    maxWidth: `${ANSWER_PAGE_WIDTH_PX}px`,
    boxSizing: "border-box",
    margin: "0 auto",
    background: "#ffffff",
  });
}

export function applyAnswerBodyExportLayout(el) {
  if (!el) return;
  Object.assign(el.style, {
    position: "relative",
    minHeight: `${ANSWER_LINE_HEIGHT_PX * 25}px`,
    boxSizing: "border-box",
  });
}

export function copyExportStylesFromElement(source, target, props = EXPORT_STYLE_PROPS) {
  if (!source || !target) return;
  const css = getComputedStyle(source);
  props.forEach((prop) => {
    const value = css[prop];
    if (value) target.style[prop] = value;
  });
}

function parseCssPx(value) {
  const n = parseFloat(String(value || "").replace("px", ""));
  return Number.isFinite(n) ? n : null;
}

function pxValuesClose(a, b, tolerance = 1) {
  const na = parseCssPx(a);
  const nb = parseCssPx(b);
  if (na == null || nb == null) return String(a) === String(b);
  return Math.abs(na - nb) <= tolerance;
}

function normalizeFontFamily(value) {
  return String(value || "")
    .replace(/["']/g, "")
    .toLowerCase()
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function fontFamiliesMatch(a, b) {
  const refParts = normalizeFontFamily(a);
  const outParts = normalizeFontFamily(b);
  if (!refParts.length || !outParts.length) return a === b;
  return refParts[0] === outParts[0];
}

export function copyAnswerSheetLayoutFromSource(target, source) {
  if (!target || !source) return;
  const rect = source.getBoundingClientRect();
  const w = Math.round(rect.width);
  if (w > 0) {
    target.style.width = `${w}px`;
    target.style.maxWidth = `${w}px`;
  }
  const css = getComputedStyle(source);
  [
    "--answer-page-width",
    "--answer-content-width",
    "--answer-padding-left",
    "--answer-padding-right",
    "--answer-font-size",
    "--answer-line-height",
    "--answer-letter-spacing",
  ].forEach((key) => {
    const fromSource = css.getPropertyValue(key).trim();
    if (fromSource) target.style.setProperty(key, fromSource);
  });
}

export function normalizeLetterSpacingCss(value) {
  const v = String(value || "").trim();
  if (!v || v === "normal") return "0px";
  return v;
}

export function getAnswerEditorStyleSnapshot(editorEl) {
  if (!editorEl) return null;
  const css = getComputedStyle(editorEl);
  const padL = parseFloat(css.paddingLeft) || 0;
  const padR = parseFloat(css.paddingRight) || 0;
  return {
    fontSize: css.fontSize,
    letterSpacing: normalizeLetterSpacingCss(css.letterSpacing),
    lineHeight: css.lineHeight,
    fontFamily: css.fontFamily,
    fontWeight: css.fontWeight,
    clientWidth: editorEl.clientWidth,
    contentWidth: Math.max(0, editorEl.clientWidth - padL - padR),
    paddingLeft: css.paddingLeft,
    paddingRight: css.paddingRight,
  };
}

export function assertAnswerTypographyMatch(referenceEl, outputEl) {
  const ref = getAnswerEditorStyleSnapshot(referenceEl);
  const out = getAnswerEditorStyleSnapshot(outputEl);
  if (!ref || !out) return;

  const mismatches = [];
  if (!pxValuesClose(ref.fontSize, out.fontSize)) {
    mismatches.push(["font-size", ref.fontSize, out.fontSize]);
  }
  if (!pxValuesClose(ref.letterSpacing, out.letterSpacing, 0.05)) {
    mismatches.push(["letter-spacing", ref.letterSpacing, out.letterSpacing]);
  }
  if (!pxValuesClose(ref.lineHeight, out.lineHeight)) {
    mismatches.push(["line-height", ref.lineHeight, out.lineHeight]);
  }
  if (!fontFamiliesMatch(ref.fontFamily, out.fontFamily)) {
    mismatches.push(["font-family", ref.fontFamily, out.fontFamily]);
  }
  if (Math.abs(ref.clientWidth - out.clientWidth) > 1) {
    mismatches.push(["clientWidth", String(ref.clientWidth), String(out.clientWidth)]);
  }
  if (!pxValuesClose(ref.paddingLeft, out.paddingLeft)) {
    mismatches.push(["padding-left", ref.paddingLeft, out.paddingLeft]);
  }
  if (!pxValuesClose(ref.paddingRight, out.paddingRight)) {
    mismatches.push(["padding-right", ref.paddingRight, out.paddingRight]);
  }

  if (mismatches.length) {
    const detail = mismatches.map(([k, a, b]) => `${k}: ref=${a} out=${b}`).join("; ");
    console.error("[answer-export] typography mismatch:", detail);
    throw new Error("답안 출력 스타일을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

export async function waitForExportStylesheets(doc = document) {
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
  await Promise.all(
    links.map(
      (link) =>
        new Promise((resolve) => {
          if (link.sheet) {
            resolve();
            return;
          }
          link.addEventListener("load", resolve, { once: true });
          link.addEventListener("error", resolve, { once: true });
        })
    )
  );
  await waitForExportLayout(doc);
}

export async function waitForExportLayout(doc = document) {
  if (doc.fonts?.ready) {
    await doc.fonts.ready;
  }
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}
