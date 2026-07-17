/**
 * 답안지 미리보기 — 작성 화면 DOM 클론
 */
import {
  ANSWER_PAGE_COUNT,
  buildExportHtmlFromClones,
  buildAnswerPdfFilename,
  buildAnswerHtmlFilename,
  downloadHtmlFile,
  printHtmlDocument,
  downloadPdfFromClones,
  NoAnswerContentError,
} from "./workspace-answer-export.js";
import { applyAnswerSheetVars } from "./workspace-answer-typography.js";

export function createPreviewController({
  modalEl,
  containerEl,
  pageLabelEl,
  prevBtn,
  nextBtn,
  exportPdfBtn,
  exportHtmlBtn,
  exportPrintBtn,
  closeBtn,
  getClones,
  getInitialPageIndex,
  getAnswerTypography,
  getReferenceEditor,
  onBeforeExport,
}) {
  let previewIndex = 0;
  let cachedClones = [];

  function refreshClones() {
    const meta = onBeforeExport?.() || {};
    cachedClones = getClones?.() || [];
    if (previewIndex >= cachedClones.length) previewIndex = 0;
    return meta;
  }

  function renderCurrent() {
    if (!containerEl) return;
    const meta = refreshClones();
    const typography = meta.answerTypography || getAnswerTypography?.() || {};
    applyAnswerSheetVars(containerEl, typography);
    containerEl.innerHTML = "";
    const clone = cachedClones[previewIndex];
    if (clone) {
      containerEl.appendChild(clone.cloneNode(true));
    }
    if (pageLabelEl) {
      pageLabelEl.textContent = `${previewIndex + 1} / ${ANSWER_PAGE_COUNT}`;
    }
    if (prevBtn) prevBtn.disabled = previewIndex <= 0;
    if (nextBtn) nextBtn.disabled = previewIndex >= ANSWER_PAGE_COUNT - 1;
  }

  function open() {
    if (!modalEl) return;
    previewIndex = getInitialPageIndex?.() ?? 0;
    if (previewIndex < 0 || previewIndex >= ANSWER_PAGE_COUNT) previewIndex = 0;
    renderCurrent();
    modalEl.hidden = false;
    document.body.classList.add("ws-modal-open");
  }

  function close() {
    if (!modalEl) return;
    modalEl.hidden = true;
    document.body.classList.remove("ws-modal-open");
  }

  prevBtn?.addEventListener("click", () => {
    if (previewIndex > 0) {
      previewIndex--;
      renderCurrent();
    }
  });

  nextBtn?.addEventListener("click", () => {
    if (previewIndex < ANSWER_PAGE_COUNT - 1) {
      previewIndex++;
      renderCurrent();
    }
  });

  exportHtmlBtn?.addEventListener("click", async () => {
    const meta = refreshClones();
    const html = buildExportHtmlFromClones(cachedClones, meta, meta.answerTypography);
    downloadHtmlFile(html, buildAnswerHtmlFilename(meta));
  });

  exportPrintBtn?.addEventListener("click", async () => {
    const meta = refreshClones();
    const html = buildExportHtmlFromClones(cachedClones, meta, meta.answerTypography);
    const ref = getReferenceEditor?.();
    await printHtmlDocument(html, meta.answerTypography, ref);
  });

  exportPdfBtn?.addEventListener("click", async () => {
    const meta = refreshClones();
    const name = buildAnswerPdfFilename(meta);
    const ref = getReferenceEditor?.();
    try {
      await downloadPdfFromClones(cachedClones, name, meta.answerTypography, ref);
    } catch (err) {
      if (err instanceof NoAnswerContentError || err?.name === "NoAnswerContentError") {
        alert(err.message);
        return;
      }
      console.error("[answer-preview] PDF export failed:", err);
      alert(err.message || "PDF 저장에 실패했습니다.");
    }
  });

  closeBtn?.addEventListener("click", close);
  modalEl?.addEventListener("click", (e) => {
    if (e.target === modalEl || e.target.closest("[data-modal-close]")) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl && !modalEl.hidden) close();
  });

  return { open, close, refresh: renderCurrent };
}
