/**
 * 답안지 — 템플릿 업로드, 다중 페이지
 */
export function wrapTextToLines(text, charsPerLine) {
  const lines = [];
  const paragraphs = String(text || "").split("\n");

  for (const para of paragraphs) {
    if (!para) {
      lines.push("");
      continue;
    }
    let remaining = para;
    while (remaining.length > 0) {
      if (remaining.length <= charsPerLine) {
        lines.push(remaining);
        break;
      }
      let breakAt = charsPerLine;
      const slice = remaining.slice(0, charsPerLine + 5);
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace > charsPerLine * 0.4) breakAt = lastSpace;
      lines.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }
  }
  if (!lines.length) lines.push("");
  return lines;
}

export function paginateLines(lines, linesPerPage) {
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    const chunk = lines.slice(i, i + linesPerPage);
    while (chunk.length < linesPerPage) chunk.push("");
    pages.push(chunk);
  }
  if (!pages.length) pages.push(Array(linesPerPage).fill(""));
  return pages;
}

export function estimateStats(text, settings) {
  const lines = wrapTextToLines(text, settings.charsPerLine);
  const pages = paginateLines(lines, settings.linesPerPage);
  return {
    charCount: String(text || "").length,
    lineCount: lines.length,
    pageCount: pages.length,
  };
}

export function createAnswerPage(index = 0) {
  return {
    id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    content: "",
    problemNumber: "",
    questionNumber: "",
    label: `답안지 ${index + 1}`,
  };
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderFixedAnswerSheetPage(container, pageRows, pageIndex, totalPages, _settings, template, docTitle) {
  if (!container) return;
  const rows = pageRows?.length === 25
    ? pageRows
    : [...(pageRows || [])].concat(Array(25).fill("")).slice(0, 25);
  const hasTemplate = Boolean(template?.dataUrl);
  container.innerHTML = `
    <article class="answer-sheet-page" data-sheet-page="${pageIndex + 1}">
      ${hasTemplate ? `<img class="answer-sheet-template" src="${template.dataUrl}" alt="" style="opacity:0.35" />` : ""}
      <div class="answer-sheet-content">
        <header class="answer-sheet-header"><h3>답 안 지</h3></header>
        <div class="answer-sheet-meta">
          <span>${escapeHtml(docTitle || "CPA 답안")}</span>
          <span>${pageIndex + 1} / ${totalPages}</span>
        </div>
        <div class="answer-sheet-lines">
          ${rows.map((lineText) => `
            <div class="answer-line">
              <span class="answer-line-text">${escapeHtml(lineText) || "&nbsp;"}</span>
            </div>`).join("")}
        </div>
      </div>
    </article>`;
}

export function renderAnswerSheetPage(container, page, pageIndex, totalPages, settings, template, docTitle) {
  if (!container) return;

  const lines = wrapTextToLines(page.content, settings.charsPerLine);
  const pageLines = paginateLines(lines, settings.linesPerPage)[0] || Array(settings.linesPerPage).fill("");

  const metaParts = [
    docTitle || "",
    page.problemNumber ? `문제 ${page.problemNumber}` : "",
    page.questionNumber ? `물음 ${page.questionNumber}` : "",
  ].filter(Boolean);

  const hasTemplate = Boolean(template?.dataUrl);
  const templateNote = hasTemplate
    ? "참고 템플릿 적용 중"
    : "기본 연습 답안지 (공식 양식과 동일하지 않음)";

  container.innerHTML = `
    <article class="answer-sheet-page" data-sheet-page="${pageIndex + 1}">
      ${
        hasTemplate
          ? `<img class="answer-sheet-template" src="${template.dataUrl}" alt="답안지 참고 템플릿" style="opacity:${settings.templateOpacity}" />`
          : ""
      }
      <div class="answer-sheet-content" style="
        padding-top:${settings.paddingTop}px;
        padding-left:${settings.paddingLeft}px;
        padding-right:${settings.paddingRight}px;
        font-family:${settings.fontFamily};
        font-size:${settings.fontSize}px;
        line-height:${settings.lineHeight}px;
      ">
        <header class="answer-sheet-header">
          <h3>답 안 지</h3>
          <p class="answer-sheet-note">${escapeHtml(templateNote)}</p>
        </header>
        <div class="answer-sheet-meta">
          <span>${escapeHtml(metaParts.join(" · ") || "—")}</span>
          <span>${pageIndex + 1} / ${totalPages}쪽</span>
        </div>
        <div class="answer-sheet-lines">
          ${pageLines
            .map(
              (lineText) => `
            <div class="answer-line" style="min-height:${settings.lineHeight}px;line-height:${settings.lineHeight}px">
              <span class="answer-line-text">${escapeHtml(lineText) || "&nbsp;"}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>
    </article>`;
}

export async function readTemplateFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        dataUrl: reader.result,
        name: file.name,
        type: file.type,
      });
    reader.onerror = () => reject(reader.error);
    if (file.type === "application/pdf") {
      reader.readAsDataURL(file);
    } else if (file.type.startsWith("image/")) {
      reader.readAsDataURL(file);
    } else {
      reject(new Error("PDF 또는 이미지 파일만 지원합니다."));
    }
  });
}
