/**
 * Study — 목적 선택형 분석
 */

export const STUDY_PURPOSES = [
  { id: "keyIssues", label: "핵심 쟁점 설명" },
  { id: "hints", label: "힌트만 보기" },
  { id: "answerDirection", label: "정답 방향 보기" },
  { id: "standards", label: "관련 기준서 보기" },
  { id: "easyExplain", label: "쉽게 설명" },
  { id: "customAsk", label: "직접 질문하기" },
];

export function getPurposeLabel(id) {
  return STUDY_PURPOSES.find((p) => p.id === id)?.label || id;
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderPurposeResultHtml(purpose, result) {
  if (!result) return "";
  if (result.needsMoreContext) {
    const note = result.needsMoreContextNote || "선택 범위만으로는 판단이 어렵습니다.";
    return `<p class="study-purpose-note">${esc(note)}</p>`;
  }

  switch (purpose) {
    case "keyIssues":
      if (!result.issues?.length) return `<p class="study-purpose-note">추가 판단 필요</p>`;
      return `<ul class="study-purpose-list">${result.issues
        .map(
          (it) =>
            `<li><strong>${esc(it.point)}</strong>${it.whyImportant ? `<br /><span>${esc(it.whyImportant)}</span>` : ""}</li>`
        )
        .join("")}</ul>`;

    case "hints":
      if (!result.hints?.length) return `<p class="study-purpose-note">제공할 힌트가 없습니다.</p>`;
      return `<ul class="study-purpose-list">${result.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`;

    case "answerDirection": {
      const parts = [];
      if (result.answerStructure?.length) {
        parts.push(
          `<h5>답안 구성 순서</h5><ol>${result.answerStructure.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
        );
      }
      if (result.keyJudgmentSteps?.length) {
        parts.push(
          `<h5>핵심 판단 단계</h5><ol>${result.keyJudgmentSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
        );
      }
      if (result.mustReview?.length) {
        parts.push(
          `<h5>반드시 검토할 요소</h5><ul>${result.mustReview.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
        );
      }
      if (result.conclusionCandidates?.length) {
        parts.push(
          `<h5>결론 후보</h5><ul>${result.conclusionCandidates.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
        );
      }
      return parts.length ? parts.join("") : `<p class="study-purpose-note">추가 판단 필요</p>`;
    }

    case "standards":
      if (!result.standards?.length) return `<p class="study-purpose-note">관련 기준을 특정하기 어렵습니다.</p>`;
      return `<ul class="study-purpose-standards">${result.standards
        .map((s) => {
          const num = s.uncertain ? "기준 확인 필요" : esc(s.standardNumber || "기준 확인 필요");
          const name = esc(s.standardName || "");
          const reason = s.connectionReason ? `<p class="study-purpose-reason">${esc(s.connectionReason)}</p>` : "";
          return `<li><strong>${num}</strong> ${name}${reason}</li>`;
        })
        .join("")}</ul>`;

    case "easyExplain":
      return result.explanation
        ? `<p class="study-purpose-text">${esc(result.explanation)}</p>`
        : `<p class="study-purpose-note">추가 판단 필요</p>`;

    case "customAsk":
      return result.answer
        ? `<p class="study-purpose-text">${esc(result.answer)}</p>`
        : `<p class="study-purpose-note">답변을 생성하지 못했습니다.</p>`;

    default:
      return result.content ? `<p class="study-purpose-text">${esc(result.content)}</p>` : "";
  }
}
