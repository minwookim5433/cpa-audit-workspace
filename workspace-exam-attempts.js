/**
 * 시험 종료 시도 기록 — IndexedDB 래퍼 (하위 호환)
 */
import { saveAttempt, getAttempt, listAllAttempts, updateAttemptRecord } from "./workspace-attempt-service.js";

export async function saveExamAttempt(attempt) {
  return saveAttempt({
    documentId: attempt.documentId || attempt.examId || "",
    documentTitle: attempt.docTitle || attempt.documentTitle || "",
    problemLabel: attempt.problemLabel || attempt.docTitle || "전체",
    questionRange: attempt.questionRange || "전체",
    legacyFingerprint: attempt.examId || "",
    elapsedSeconds: attempt.timerSeconds,
    answerPages: attempt.answerSheet,
    completedAt: attempt.endedAt,
    fontSize: attempt.fontSize,
    letterSpacing: attempt.letterSpacing,
    answerPageCount: attempt.writtenPageCount,
    totalCharacters: attempt.totalCharCount,
    totalLines: attempt.usedRowCount,
    pdfSaved: attempt.pdfSaved,
    pdfFilename: attempt.pdfFilename,
    status: "completed",
  });
}

export async function loadExamAttempts(examId) {
  const all = await listAllAttempts();
  if (!examId) return all;
  return all.filter((a) => a.legacyFingerprint === examId || a.documentId === examId);
}

export { getAttempt as getExamAttempt, updateAttemptRecord as updateExamAttempt };
