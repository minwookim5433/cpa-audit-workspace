/**
 * CPA 기출 PDF — 문제·물음 구조 추출 (규칙 기반)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ProblemExtractor = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROBLEM_START_RE = /【\s*문제\s*(\d+)\s*】/g;
  const QUESTION_IN_PARENS_RE = /\(물음\s*(\d+)\)/g;
  const QUESTION_RANGE_HEADER_RE = /\(물음\s*(\d+)\)\s*[～~\-]\s*\(물음\s*(\d+)\)/;
  const CONTINUATION_RE = /\(계속\)|（계속）/;

  function normalizeProblemNumber(value) {
    return String(value || "").trim().replace(/^문제\s*/i, "");
  }

  /** @returns {{ text: string|null, startIndex: number, endIndex: number, length: number }} */
  function extractProblemText(fullText, problemNumber) {
    const num = normalizeProblemNumber(problemNumber);
    if (!num || !fullText) return { text: null, startIndex: -1, endIndex: -1, length: 0 };

    const numInt = parseInt(num, 10);
    if (Number.isNaN(numInt)) return { text: null, startIndex: -1, endIndex: -1, length: 0 };

    const problemStarts = [];
    let m;
    PROBLEM_START_RE.lastIndex = 0;
    while ((m = PROBLEM_START_RE.exec(fullText)) !== null) {
      problemStarts.push({ number: parseInt(m[1], 10), index: m.index });
    }

    const startEntry = problemStarts.find((p) => p.number === numInt);
    if (!startEntry) {
      return fallbackExtractProblemText(fullText, numInt);
    }

    const nextEntry = problemStarts.find((p) => p.number === numInt + 1);
    const endIndex = nextEntry ? nextEntry.index : fullText.length;
    const slice = fullText.slice(startEntry.index, endIndex).trim();

    return {
      text: slice.length >= 50 ? slice : null,
      startIndex: startEntry.index,
      endIndex,
      length: slice.length,
    };
  }

  function fallbackExtractProblemText(fullText, numInt) {
    const startPatterns = [
      new RegExp(`문제\\s*${numInt}(?:\\s*[_\\-]?\\s*|\\.|번|호|\\)|）|:)`, "i"),
    ];
    let startIndex = -1;
    for (const pattern of startPatterns) {
      const match = pattern.exec(fullText);
      if (match && (startIndex === -1 || match.index < startIndex)) startIndex = match.index;
    }
    if (startIndex === -1) return { text: null, startIndex: -1, endIndex: -1, length: 0 };

    const remainder = fullText.slice(startIndex + 5);
    const nextMatch = /【\s*문제\s*(\d+)\s*】/g.exec(remainder);
    const endIndex = nextMatch ? startIndex + 5 + nextMatch.index : fullText.length;
    const slice = fullText.slice(startIndex, endIndex).trim();
    return { text: slice.length >= 50 ? slice : null, startIndex, endIndex, length: slice.length };
  }

  function isRangeHeader(problemText, matchIndex) {
    const window = problemText.slice(matchIndex, matchIndex + 80);
    return QUESTION_RANGE_HEADER_RE.test(window) || /과관련된내용|과\s*관련된\s*내용/.test(window);
  }

  function detectQuestionNumbers(problemText) {
    if (!problemText) return { numbers: [], markers: [], actualQuestions: [] };

    const allMarkers = [];
    QUESTION_IN_PARENS_RE.lastIndex = 0;
    let match;
    while ((match = QUESTION_IN_PARENS_RE.exec(problemText)) !== null) {
      const n = parseInt(match[1], 10);
      if (n <= 0 || n > 20) continue;
      const isRange = isRangeHeader(problemText, match.index);
      allMarkers.push({
        number: n,
        index: match.index,
        raw: match[0],
        isRangeHeader: isRange,
      });
    }

    const actualQuestions = allMarkers.filter((m) => !m.isRangeHeader);
    const byNumber = new Map();
    for (const m of actualQuestions) {
      const prev = byNumber.get(m.number);
      if (!prev || m.index > prev.index) byNumber.set(m.number, m);
    }

    const markers = [...byNumber.values()].sort((a, b) => a.index - b.index);
    const numbers = markers.map((m) => m.number);

    return { numbers, markers, actualQuestions, allMarkers };
  }

  function inferExpectedQuestionCount(numbers) {
    if (!numbers.length) return 0;
    return Math.max(...numbers);
  }

  function detectStructureHints(problemText) {
    const hints = [];
    if (/각\s*물음은\s*독립적/.test(problemText)) hints.push("각 물음은 독립적");
    if (QUESTION_RANGE_HEADER_RE.test(problemText)) hints.push("물음 범위 공통 상황");
    if (/공통으로\s*적용|아래\s*물음에\s*공통/.test(problemText)) hints.push("공통 적용");
    if (/\[상황\]/.test(problemText)) hints.push("[상황] 블록");
    if (/<주요\s*재무정보>/.test(problemText)) hints.push("<주요 재무정보>");
    if (/다음을\s*읽고\s*물음에\s*답하시오/.test(problemText)) hints.push("공통 지문");
    if (CONTINUATION_RE.test(problemText)) hints.push("(계속) 페이지 연속");
    return hints;
  }

  function validateExtraction(detected, aiQuestions, contextGroups) {
    const errors = [];
    const warnings = [];

    const detectedNums = detected.numbers;
    const expected = inferExpectedQuestionCount(detectedNums);
    const aiNums = (aiQuestions || []).map((q) => Number(q.questionNumber)).filter((n) => n > 0);
    const aiSet = new Set(aiNums);

    const missing = detectedNums.filter((n) => !aiSet.has(n));
    if (detectedNums.length && missing.length) {
      errors.push(`물음 추출 불완전: 누락 물음 ${missing.join(", ")}`);
    }

    if (expected > 0 && aiNums.length < expected) {
      errors.push(`물음 추출 불완전: 예상 ${expected}개, AI 반환 ${aiNums.length}개`);
    }

    const assigned = new Map();
    const hasContextGroups = (contextGroups || []).length > 0;
    for (const g of contextGroups || []) {
      for (const n of g.appliesToQuestions || []) {
        if (assigned.has(n)) errors.push(`상황 그룹 중복: 물음 ${n}`);
        assigned.set(n, g.contextId);
      }
    }

    if (hasContextGroups) {
      for (const q of aiQuestions || []) {
        const qn = Number(q.questionNumber);
        if (!assigned.has(qn)) warnings.push(`물음 ${qn}: 상황 그룹 미연결`);
        const gid = assigned.get(qn);
        if (gid && q.contextId && gid !== q.contextId) {
          errors.push(`물음 ${qn}: contextId 불일치`);
        }
      }
    }

    return {
      complete: errors.length === 0,
      errors,
      warnings,
      detectedNumbers: detectedNums,
      expectedCount: expected || detectedNums.length,
      actualCount: aiNums.length,
      missing,
    };
  }

  function formatAppliesTo(nums) {
    if (!nums?.length) return "—";
    const sorted = [...nums].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i];
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      ranges.push(start === prev ? `물음 ${start}` : `물음 ${start}~${prev}`);
      start = cur;
      prev = cur;
    }
    return ranges.join(" / ");
  }

  return {
    normalizeProblemNumber,
    extractProblemText,
    detectQuestionNumbers,
    inferExpectedQuestionCount,
    detectStructureHints,
    validateExtraction,
    formatAppliesTo,
  };
});
