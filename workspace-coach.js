/**
 * Answer Coach — 드래그 첨삭 UI 및 결과 처리
 */

import { addWrongNote } from "./workspace-wrong-notes.js";

export const COACH_MODES = {
  expression: { id: "expression", label: "표현 개선", category: "표현" },
  logic: { id: "logic", label: "논리 흐름 점검", category: "논리" },
  auditTerm: { id: "auditTerm", label: "감사기준 용어 점검", category: "감사기준 표현" },
  conciseness: { id: "conciseness", label: "문장 간결화", category: "문장구성" },
};

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function showCoachMenu(menuEl, previewEl, selectedText, clientX, clientY) {
  if (!menuEl) return;
  menuEl.hidden = false;
  menuEl.style.left = `${Math.min(clientX, window.innerWidth - 240)}px`;
  menuEl.style.top = `${Math.min(clientY + 6, window.innerHeight - 200)}px`;

  if (previewEl) {
    const preview = selectedText.length > 80 ? `${selectedText.slice(0, 80)}…` : selectedText;
    previewEl.textContent = `"${preview}"`;
    previewEl.hidden = false;
  }
}

export function hideCoachMenu(menuEl, previewEl) {
  if (menuEl) menuEl.hidden = true;
  if (previewEl) previewEl.hidden = true;
}

export async function requestCoachFeedback({ mode, selectedText, fullAnswer, problemNumber, year, questionNumber }) {
  const res = await fetch("/api/answer-coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      selectedText,
      fullAnswer: fullAnswer || "",
      problemNumber,
      year,
      questionNumber,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "첨삭 요청 실패");
  return data;
}

export function saveFeedbacksToWrongNotes(feedbacks, meta) {
  const saved = [];
  for (const fb of feedbacks) {
    const note = addWrongNote({
      year: meta.year,
      problemNumber: meta.problemNumber,
      originalText: fb.original || meta.selectedText,
      suggestion: fb.suggestion,
      reason: fb.reason,
      category: fb.category,
      coachType: meta.coachType,
    });
    saved.push(note);
  }
  return saved;
}

export function formatCoachResultText(feedbacks) {
  if (!feedbacks?.length) return "수정 포인트가 없습니다. 잘 작성하셨습니다.";
  return feedbacks
    .map((fb, i) => {
      const parts = [`[${i + 1}] ${fb.category || "표현"}`];
      if (fb.original) parts.push(`현재: ${fb.original}`);
      if (fb.suggestion) parts.push(`추천: ${fb.suggestion}`);
      if (fb.reason) parts.push(`이유: ${fb.reason}`);
      return parts.join("\n");
    })
    .join("\n\n—\n\n");
}
