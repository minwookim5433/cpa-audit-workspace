/**
 * 시험 종료 시도 기록 — 스냅샷 저장
 */
const ATTEMPTS_KEY = "cpa-workspace-exam-attempts";

function readAll() {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(attempts) {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

export function saveExamAttempt(attempt) {
  const entry = {
    id: attempt.id || `attempt-${Date.now()}`,
    examId: attempt.examId || "",
    docTitle: attempt.docTitle || "",
    endedAt: attempt.endedAt || new Date().toISOString(),
    timerSeconds: Number(attempt.timerSeconds) || 0,
    answerSheet: Array.isArray(attempt.answerSheet) ? [...attempt.answerSheet] : [],
    fontSize: attempt.fontSize,
    letterSpacing: attempt.letterSpacing,
    writtenPageCount: Number(attempt.writtenPageCount) || 0,
    usedRowCount: Number(attempt.usedRowCount) || 0,
    totalCharCount: Number(attempt.totalCharCount) || 0,
    pdfFilename: attempt.pdfFilename || "",
    pdfSaved: Boolean(attempt.pdfSaved),
    feedback: attempt.feedback ?? null,
    feedbackError: attempt.feedbackError || "",
    feedbackRequested: Boolean(attempt.feedbackRequested),
  };

  const all = readAll();
  all.unshift(entry);
  if (all.length > 50) all.length = 50;
  writeAll(all);
  return entry;
}

export function loadExamAttempts(examId) {
  const all = readAll();
  if (!examId) return all;
  return all.filter((a) => a.examId === examId);
}

export function getExamAttempt(id) {
  return readAll().find((a) => a.id === id) || null;
}

export function updateExamAttempt(id, patch) {
  const all = readAll();
  const index = all.findIndex((a) => a.id === id);
  if (index === -1) return null;
  all[index] = { ...all[index], ...patch };
  writeAll(all);
  return all[index];
}
