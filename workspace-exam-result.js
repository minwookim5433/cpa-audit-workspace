/**

 * 시험 종료 결과 화면

 */

import {

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

  pdfStatusEl,

  tabButtons,

  panels,

  retryBtn,

  exportPdfBtn,

  closeBtn,

  finishBtn,

  onRetryExam,

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

      <h3 class="ws-result-title">${attempt.documentTitle || attempt.docTitle || "시험지"}</h3>

      <ul class="ws-result-stats">

        <li><span>사용 시간</span><strong>${formatDuration(attempt.elapsedSeconds ?? attempt.timerSeconds ?? 0)}</strong></li>

        <li><span>작성 페이지</span><strong>${attempt.answerPageCount ?? attempt.writtenPageCount ?? 0}페이지</strong></li>

        <li><span>작성 행</span><strong>${attempt.totalLines ?? attempt.usedRowCount ?? 0}행</strong></li>

        <li><span>총 글자 수</span><strong>${attempt.totalCharacters ?? attempt.totalCharCount ?? 0}자</strong></li>

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

    previewClones = buildPreviewClonesFromSheet(attempt.answerPages || attempt.answerSheet);

    applyAnswerSheetVars(previewEl, {

      fontSize: attempt.fontSize,

      letterSpacing: attempt.letterSpacing,

    });

    renderSummary(attempt);

    renderPreview();

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



  exportPdfBtn?.addEventListener("click", async () => {

    if (!currentAttempt) return;

    const clones = buildPreviewClonesFromSheet(currentAttempt.answerPages || currentAttempt.answerSheet).filter((clone) => {

      const html = clone.querySelector(".answer-doc-editor")?.innerHTML || "";

      return hasMeaningfulAnswerContent(html);

    });

    const filename = buildAnswerPdfFilename({
      year: currentAttempt.year,
      documentTitle: currentAttempt.documentTitle || currentAttempt.docTitle,
      docTitle: currentAttempt.documentTitle || currentAttempt.docTitle,
      pdfName: currentAttempt.pdfFileName,
      fileName: currentAttempt.pdfFileName,
    });

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

  finishBtn?.addEventListener("click", close);



  return { open, close, updateAttempt, getCurrentAttempt: () => currentAttempt };

}

