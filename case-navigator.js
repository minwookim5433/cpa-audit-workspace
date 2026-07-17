/**
 * CPA Audit Case Navigator v3 — 읽는 과정 (STEP 1·2·3)
 */
(function () {
  "use strict";

  const STORAGE_KEY = "audit-navigator-context";

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadContext() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveContext(ctx) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  }

  function clearContext() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function renderStandards(standards) {
    if (!standards?.length) return "<p class='nav-muted'>기준 확인 필요</p>";
    return `<ul class="nav-standards-list">${standards
      .map((s) => {
        const isUnverified = s.standardNumber === "기준 확인 필요" || !s.standardNumber;
        const text = isUnverified
          ? "기준 확인 필요"
          : `${escapeHtml(s.standardNumber)} ${escapeHtml(s.standardName || "")}`.trim();
        return `<li class="${isUnverified ? "nav-std-unverified" : ""}">${text}</li>`;
      })
      .join("")}</ul>`;
  }

  function renderKeywords(keywords) {
    if (!keywords?.length) return "<p class='nav-muted'>—</p>";
    return `<div class="nav-keyword-chips">${keywords
      .map((k) => `<span class="nav-keyword">${escapeHtml(k)}</span>`)
      .join("")}</div>`;
  }

  function renderProblemHeader(nav) {
    const meta = [];
    if (nav.year) meta.push(`<span class="nav-meta-badge">${escapeHtml(nav.year)}</span>`);
    if (nav.problemNumber) meta.push(`<span class="nav-meta-badge">문제 ${escapeHtml(nav.problemNumber)}</span>`);
    meta.push(`<span class="nav-meta-badge">물음 ${escapeHtml(nav.totalQuestions || nav.step3_questions?.length || 0)}개</span>`);

    return `<header class="nav-problem-header">
      <div class="nav-problem-meta">${meta.join("")}</div>
      <h2 class="nav-problem-title">${escapeHtml(nav.problemTitle || "사례형 문제")}</h2>
      <p class="nav-disclaimer">정답·모범답안·감사의견을 제공하지 않습니다. 문제를 읽는 과정만 안내합니다.</p>
    </header>`;
  }

  function renderStep1(keyFacts) {
    const bullets = keyFacts?.length
      ? keyFacts.map((b) => `<li>${escapeHtml(b)}</li>`).join("")
      : "<li class='nav-muted'>핵심 정보 없음</li>";

    return `<section class="nav-step" aria-label="STEP 1 사례 핵심정보">
      <h3 class="nav-step-title">STEP 1 · 사례 핵심정보</h3>
      <p class="nav-step-desc">문제 풀이에 반드시 알아야 하는 사실만 추출했습니다.</p>
      <ul class="nav-bullets">${bullets}</ul>
    </section>`;
  }

  function renderStep2(intentItems) {
    if (!intentItems?.length) {
      return `<section class="nav-step" aria-label="STEP 2 출제자의 의도">
        <h3 class="nav-step-title">STEP 2 · 출제자의 의도</h3>
        <p class="nav-muted">출제 의도 연결 항목이 없습니다.</p>
      </section>`;
    }

    const rows = intentItems
      .map(
        (item) => `<div class="nav-intent-row">
        <div class="nav-intent-fact">${escapeHtml(item.fact)}</div>
        <div class="nav-intent-arrow" aria-hidden="true">↓</div>
        <div class="nav-intent-text">${escapeHtml(item.intent)}</div>
      </div>`
      )
      .join("");

    return `<section class="nav-step" aria-label="STEP 2 출제자의 의도">
      <h3 class="nav-step-title">STEP 2 · 출제자의 의도</h3>
      <p class="nav-step-desc">출제자가 왜 이 정보를 줬는지 — 정답이 아니라 읽는 방향입니다.</p>
      <div class="nav-intent-list">${rows}</div>
    </section>`;
  }

  function renderQuestionBlock(q) {
    return `<article class="nav-question-block">
      <h4 class="nav-question-heading">물음 ${escapeHtml(q.questionNumber)}</h4>
      <div class="nav-question-field">
        <h5>① 물음 원문</h5>
        <p class="nav-question-text">${escapeHtml(q.originalText)}</p>
      </div>
      <div class="nav-question-field nav-case-scope">
        <h5>② 사용해야 하는 사례 정보</h5>
        <p>${escapeHtml(q.caseInfoToUse || "—")}</p>
      </div>
      <div class="nav-question-field">
        <h5>③ 핵심 출제주제</h5>
        <p>${escapeHtml(q.coreTopic || "—")}</p>
      </div>
      <div class="nav-question-field">
        <h5>④ 득점 키워드</h5>
        ${renderKeywords(q.scoringKeywords)}
      </div>
      <div class="nav-question-field">
        <h5>⑤ 관련 감사기준</h5>
        ${renderStandards(q.relatedStandards)}
      </div>
    </article>`;
  }

  function renderStep3(questions) {
    if (!questions?.length) {
      return `<section class="nav-step" aria-label="STEP 3 물음 분석">
        <h3 class="nav-step-title">STEP 3 · 물음 분석</h3>
        <p class="nav-muted">물음이 없습니다.</p>
      </section>`;
    }

    return `<section class="nav-step" aria-label="STEP 3 물음 분석">
      <h3 class="nav-step-title">STEP 3 · 물음 분석</h3>
      <p class="nav-step-desc">공통 사례와 독립 사례를 구분하여 답안에 사용할 정보를 안내합니다.</p>
      <div class="nav-question-stack">${questions.map(renderQuestionBlock).join("")}</div>
    </section>`;
  }

  function renderExtractionMeta(nav) {
    const pre = nav.preExtraction;
    const val = nav.extractionValidation;
    if (!pre && !val) return "";
    const lines = [];
    if (pre?.sliceWarning) lines.push(pre.sliceWarning);
    if (pre?.detectedNumbers?.length) lines.push(`탐지 물음: ${pre.detectedNumbers.join(", ")}`);
    if (val?.warnings?.length) lines.push(val.warnings.join("; "));
    if (!lines.length) return "";
    return `<p class="nav-extract-meta">${lines.map(escapeHtml).join(" · ")}</p>`;
  }

  function renderNavigatorPanel(navigator) {
    if (!navigator) return "";
    const questions = navigator.step3_questions || navigator.questions || [];
    return `${renderProblemHeader(navigator)}
      ${renderExtractionMeta(navigator)}
      ${renderStep1(navigator.step1_keyFacts)}
      ${renderStep2(navigator.step2_examinerIntent)}
      ${renderStep3(questions)}`;
  }

  function renderExtractionError(err) {
    const errors = err.errors || [err.error || "알 수 없는 오류"];
    const pre = err.preExtraction || {};
    return `<div class="nav-error-panel" role="alert">
      <h3>분석 불완전</h3>
      <ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
      ${pre.detectedNumbers ? `<p>규칙 탐지 물음: ${escapeHtml(pre.detectedNumbers.join(", "))}</p>` : ""}
      ${err.navigator ? `<details class="nav-partial-result"><summary>부분 결과 보기</summary>${renderNavigatorPanel(err.navigator)}</details>` : ""}
    </div>`;
  }

  window.CaseNavigator = {
    STORAGE_KEY,
    loadContext,
    saveContext,
    clearContext,
    renderNavigatorPanel,
    renderExtractionError,
  };
})();
