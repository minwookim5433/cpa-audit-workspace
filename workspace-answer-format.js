/**
 * 답안 HTML 유틸 — 부분 서식 span 정리 · 빈 내용 판별
 */
export const ANSWER_FORMAT_SPAN_CLASS = "answer-format-span";

export function isHtmlContent(content) {
  return /<[a-z][\s\S]*>/i.test(String(content || ""));
}

function unwrapFormatSpan(span) {
  const parent = span.parentNode;
  if (!parent) return;
  while (span.firstChild) {
    parent.insertBefore(span.firstChild, span);
  }
  parent.removeChild(span);
}

export function stripFormatSpansFromNode(root) {
  if (!root) return;
  let changed = true;
  while (changed) {
    changed = false;
    const spans = [...(root.querySelectorAll?.(`span.${ANSWER_FORMAT_SPAN_CLASS}`) || [])];
    for (const span of spans) {
      unwrapFormatSpan(span);
      changed = true;
    }
  }
}

export function stripFormatSpansFromHtml(html) {
  const value = String(html ?? "");
  if (!value || !isHtmlContent(value)) return value;
  const div = document.createElement("div");
  div.innerHTML = value;
  stripFormatSpansFromNode(div);
  return div.innerHTML;
}

export function stripFormatSpansFromSheet(pages) {
  if (!Array.isArray(pages)) return pages;
  return pages.map((page) => stripFormatSpansFromHtml(String(page ?? "")));
}

export function normalizeAnswerText(text) {
  return String(text ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function cleanEmptyAnswerMarkupInNode(root) {
  if (!root) return;

  stripFormatSpansFromNode(root);

  root.querySelectorAll("br").forEach((node) => node.remove());
  root
    .querySelectorAll(
      ".answer-line-background, .answer-placeholder, .answer-doc-bg, .answer-doc-header"
    )
    .forEach((node) => node.remove());

  let changed = true;
  while (changed) {
    changed = false;
    root.querySelectorAll("span, div, p").forEach((node) => {
      if (node === root) return;
      const text = normalizeAnswerText(node.textContent);
      if (!text) {
        node.remove();
        changed = true;
      }
    });
  }
}

export function hasMeaningfulAnswerContent(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html || "";
  cleanEmptyAnswerMarkupInNode(temp);
  return normalizeAnswerText(temp.textContent).length > 0;
}

export function setEditorContent(editor, content) {
  if (!editor) return;
  const value = String(content ?? "");
  if (isHtmlContent(value)) {
    editor.innerHTML = stripFormatSpansFromHtml(value);
  } else {
    editor.textContent = value;
  }
}

export function getEditorContent(editor) {
  return editor?.innerHTML ?? "";
}

export function plainTextFromHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.innerText || "").replace(/\r/g, "");
}
