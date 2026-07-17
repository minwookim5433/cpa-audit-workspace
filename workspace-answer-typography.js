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

  const checks = [
    ["font-size", ref.fontSize, out.fontSize],
    ["letter-spacing", ref.letterSpacing, out.letterSpacing],
    ["line-height", ref.lineHeight, out.lineHeight],
    ["font-family", ref.fontFamily, out.fontFamily],
    ["clientWidth", String(ref.clientWidth), String(out.clientWidth)],
    ["padding-left", ref.paddingLeft, out.paddingLeft],
    ["padding-right", ref.paddingRight, out.paddingRight],
  ];

  const mismatches = checks.filter(([, a, b]) => a !== b);
  if (mismatches.length) {
    const detail = mismatches.map(([k, a, b]) => `${k}: ref=${a} out=${b}`).join("; ");
    throw new Error(`답안 출력 스타일 불일치: ${detail}`);
  }
}

export async function waitForExportLayout(doc = document) {
  if (doc.fonts?.ready) {
    await doc.fonts.ready;
  }
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}
