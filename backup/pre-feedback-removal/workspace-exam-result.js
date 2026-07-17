/**
 * 시험 종료 결과 화면
 */
import { formatFeedbackAsHtml } from "./workspace-answer-feedback.js";
import {
  buildExportHtmlFromClones,
  buildAnswerPdfFilename,
  downloadPdfFromClones,
  NoAnswerContentError,
} from "./workspace-answer-export.js";
import { applyAnswerSheetVars } from "./workspace-answer-typography.js";
import { ANSWER_PAGE_COUNT } from "./workspace-answer-editor.js";
import { hasMeaningfulAnswerContent, stripFormatSpansFromHtml } from "./workspace-answer-format.js";

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildPreviewClonesFromSheet(answerSheet) {
  const container = document.createElement("div");
  container.className = "answer-doc-editor";
  return (answerSheet || []).map((pageHtml, index) => {
    const sheet = document.createElement("div");
    sheet.className = "answer-doc-sheet answer-sheet-page";
    sheet.dataset.page = String(index + 1);
    const editor = document.createElement("div");
    editor.className = "answer-doc-editor";
    editor.innerHTML = stripFormatSpansFromHtml(String(pageHtml ?? ""));
    sheet.appendChild(editor);
    return sheet;
  });
}

export function createExamResultController({
  modalEl,
  summaryEl,
  previewEl,
  feedbackEl,
  pdfStatusEl,
  tabButtons,
  panels,
  retryBtn,
  retryFeedbackBtn,
  skipFeedbackBtn,
  exportPdfBtn,
  closeBtn,
  onRetryExam,
  onRequestFeedback,
}) {
  let currentAttempt = null;
  let previewIndex = 0;
  let previewClones = [];

  function setActiveTab(tabId) {
    tabButtons?.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.resultTab === tabId);
    });
    panels?.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.resultPanel === tabId);
    });
  }

  function renderSummary(attempt) {
    if (!summaryEl || !attempt) return;
    summaryEl.innerHTML = `
      <h3 class="ws-result-title">${attempt.docTitle || "시험지"}</h3>
      <ul class="ws-result-stats">
        <li><span>사용 시간</span><strong>${formatDuration(attempt.timerSeconds)}</strong></li>
        <li><span>작성 페이지</span><strong>${attempt.writtenPageCount}페이지</strong></li>
        <li><span>작성 행</span><strong>${attempt.usedRowCount}행</strong></li>
        <li><span>총 글자 수</span><strong>${attempt.totalCharCount}자</strong></li>
      </ul>
    `;
  }

  function renderPreview() {
    if (!previewEl) return;
    previewEl.innerHTML = "";
    const clone = previewClones[previewIndex];
    if (clone) {
      const wrap = document.createElement("div");
      wrap.className = "ws-result-preview-page";
      wrap.appendChild(clone.cloneNode(true));
      previewEl.appendChild(wrap);
    }
    const label = previewEl.parentElement?.querySelector("[data-preview-label]");
    if (label) label.textContent = `${previewIndex + 1} / ${ANSWER_PAGE_COUNT}`;
  }

  function renderFeedback(attempt) {
    if (!feedbackEl) return;
    if (attempt.feedbackError && !attempt.feedback) {
      feedbackEl.innerHTML = `
        <p class="ws-result-feedback-error">답안은 정상적으로 저장되었으나<br>작성 피드백을 불러오지 못했습니다.</p>
        <p class="ws-result-feedback-detail">${attempt.feedbackError}</p>
        <div class="ws-result-feedback-actions">
          <button type="button" class="ws-btn" data-retry-feedback>다시 요청</button>
          <button type="button" class="ws-btn" data-skip-feedback>피드백 없이 종료</button>
        </div>
      `;
      feedbackEl.querySelector("[data-retry-feedback]")?.addEventListener("click", () => {
        onRequestFeedback?.(currentAttempt);
      });
      feedbackEl.querySelector("[data-skip-feedback]")?.addEventListener("click", () => {
        setActiveTab("preview");
      });
      return;
    }

    if (!attempt.feedback) {
      feedbackEl.innerHTML = `<p class="ws-result-feedback-empty">피드백을 요청하지 않았습니다.</p>`;
      return;
    }

    feedbackEl.innerHTML = formatFeedbackAsHtml(attempt.feedback);
  }

  function renderPdfStatus(attempt) {
    if (!pdfStatusEl) return;
    if (attempt.pdfSaved) {
      pdfStatusEl.innerHTML = `<p>PDF 저장 완료: <strong>${attempt.pdfFilename || "답안지.pdf"}</strong></p>`;
    } else {
      pdfStatusEl.innerHTML = `<p>PDF가 아직 저장되지 않았습니다.</p>`;
    }
  }

  function open(attempt) {
    if (!modalEl || !attempt) return;
    currentAttempt = attempt;
    previewIndex = 0;
    previewClones = buildPreviewClonesFromSheet(attempt.answerSheet);
    const typography = {
      fontSize: attempt.fontSize,
      letterSpacing: attempt.letterSpacing,
    };
    applyAnswerSheetVars(previewEl, typography);
    renderSummary(attempt);
    renderPreview();
    renderFeedback(attempt);
    renderPdfStatus(attempt);
    setActiveTab("preview");
    modalEl.hidden = false;
    document.body.classList.add("ws-modal-open");
  }

  function close() {
    if (!modalEl) return;
    modalEl.hidden = true;
    document.body.classList.remove("ws-modal-open");
  }

  function updateAttempt(attempt) {
    currentAttempt = attempt;
    renderFeedback(attempt);
    renderPdfStatus(attempt);
  }

  tabButtons?.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.resultTab));
  });

  modalEl?.querySelector("[data-preview-prev]")?.addEventListener("click", () => {
    if (previewIndex > 0) {
      previewIndex--;
      renderPreview();
    }
  });

  modalEl?.querySelector("[data-preview-next]")?.addEventListener("click", () => {
    if (previewIndex < ANSWER_PAGE_COUNT - 1) {
      previewIndex++;
      renderPreview();
    }
  });

  retryBtn?.addEventListener("click", () => {
    close();
    onRetryExam?.();
  });

  retryFeedbackBtn?.addEventListener("click", () => {
    if (currentAttempt) onRequestFeedback?.(currentAttempt);
  });

  skipFeedbackBtn?.addEventListener("click", () => setActiveTab("preview"));

  exportPdfBtn?.addEventListener("click", async () => {
    if (!currentAttempt) return;
    const clones = buildPreviewClonesFromSheet(currentAttempt.answerSheet).filter((clone) => {
      const html = clone.querySelector(".answer-doc-editor")?.innerHTML || "";
      return hasMeaningfulAnswerContent(html);
    });
    const filename = buildAnswerPdfFilename(currentAttempt.docTitle);
    try {
      await downloadPdfFromClones(
        clones,
        filename,
        { fontSize: currentAttempt.fontSize, letterSpacing: currentAttempt.letterSpacing },
        null,
        { logPages: false }
      );
      currentAttempt = { ...currentAttempt, pdfSaved: true, pdfFilename: filename };
      renderPdfStatus(currentAttempt);
    } catch (err) {
      if (!(err instanceof NoAnswerContentError)) {
        pdfStatusEl.innerHTML = `<p class="ws-result-feedback-error">${err.message || "PDF 저장 실패"}</p>`;
      }
    }
  });

  closeBtn?.addEventListener("click", close);

  return { open, close, updateAttempt, getCurrentAttempt: () => currentAttempt };
}
