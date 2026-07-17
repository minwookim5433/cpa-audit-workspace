/**
 * Attempt 데이터 모델
 */
import { normalizeAnswerPages } from "./workspace-answer-editor.js";
import { hasMeaningfulAnswerContent, normalizeAnswerText, plainTextFromHtml, stripFormatSpansFromHtml } from "./workspace-answer-format.js";

export const ATTEMPT_STATUSES = ["draft", "completed", "review"];
export const SOURCE_TYPES = ["past_exam", "mock_exam", "book", "custom"];

export function buildProblemKey(documentId, problemLabel) {
  return `${documentId}::${String(problemLabel || "전체").trim()}`;
}

export function inferSourceType(fileName = "") {
  const n = String(fileName).toLowerCase();
  if (n.includes("모의") || n.includes("mock")) return "mock_exam";
  if (n.includes("연습") || n.includes("workbook")) return "book";
  if (n.includes("기출") || n.includes("회계감사")) return "past_exam";
  return "custom";
}

export function formatAttemptDuration(seconds) {
  const m = Math.floor(Number(seconds) / 60);
  const s = Number(seconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatAttemptDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${mo}.${da} ${h}:${mi}`;
}

export function statusLabel(status) {
  switch (status) {
    case "completed":
      return "완료";
    case "review":
      return "복습 필요";
    default:
      return "초안";
  }
}

export function computeAnswerMetrics(answerPages, countLinesFn) {
  const pages = normalizeAnswerPages(answerPages).map((p) => stripFormatSpansFromHtml(String(p ?? "")));
  let totalCharacters = 0;
  let answerPageCount = 0;
  pages.forEach((page) => {
    if (hasMeaningfulAnswerContent(page)) answerPageCount += 1;
    totalCharacters += normalizeAnswerText(plainTextFromHtml(page)).length;
  });
  const totalLines = typeof countLinesFn === "function" ? countLinesFn(pages) : 0;
  return { totalCharacters, answerPageCount, totalLines, answerPages: pages };
}

export function normalizeAttempt(raw = {}) {
  const now = new Date().toISOString();
  return {
    id: raw.id || `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    documentId: String(raw.documentId || ""),
    documentTitle: String(raw.documentTitle || raw.docTitle || ""),
    year: raw.year != null && raw.year !== "" ? Number(raw.year) : null,
    sourceType: SOURCE_TYPES.includes(raw.sourceType) ? raw.sourceType : "custom",
    problemLabel: String(raw.problemLabel || raw.documentTitle || "전체"),
    questionRange: String(raw.questionRange || "전체"),
    problemKey: String(raw.problemKey || ""),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    completedAt: raw.completedAt ?? null,
    elapsedSeconds: Number(raw.elapsedSeconds ?? raw.timerSeconds ?? 0) || 0,
    answerPages: Array.isArray(raw.answerPages)
      ? [...raw.answerPages]
      : Array.isArray(raw.answerSheet)
        ? [...raw.answerSheet]
        : [],
    memo: String(raw.memo || ""),
    annotations: Array.isArray(raw.annotations) ? [...raw.annotations] : [],
    bookmarks: Array.isArray(raw.bookmarks) ? [...raw.bookmarks] : [],
    tags: Array.isArray(raw.tags) ? [...raw.tags] : [],
    status: ATTEMPT_STATUSES.includes(raw.status) ? raw.status : "draft",
    fontSize: raw.fontSize,
    letterSpacing: raw.letterSpacing,
    answerPageCount: Number(raw.answerPageCount ?? raw.writtenPageCount ?? 0) || 0,
    totalCharacters: Number(raw.totalCharacters ?? raw.totalCharCount ?? 0) || 0,
    totalLines: Number(raw.totalLines ?? raw.usedRowCount ?? 0) || 0,
    attemptNumber:
      Number.isFinite(Number(raw.attemptNumber)) && Number(raw.attemptNumber) > 0
        ? Number(raw.attemptNumber)
        : undefined,
    sourceAttemptId: raw.sourceAttemptId || null,
    revisionHistory: Array.isArray(raw.revisionHistory) ? [...raw.revisionHistory] : [],
    pdfSaved: Boolean(raw.pdfSaved),
    pdfFilename: String(raw.pdfFilename || ""),
    examPage: Number(raw.examPage ?? raw.currentPage ?? 1) || 1,
    pageViews: raw.pageViews && typeof raw.pageViews === "object" ? { ...raw.pageViews } : {},
    answerSheetPage: Number(raw.answerSheetPage ?? 0) || 0,
    legacyFingerprint: String(raw.legacyFingerprint || raw.examId || ""),
  };
}

export function buildRevisionEntry(previous, next) {
  return {
    revisedAt: new Date().toISOString(),
    previousCharacterCount: Number(previous.totalCharacters) || 0,
    newCharacterCount: Number(next.totalCharacters) || 0,
    previousPageCount: Number(previous.answerPageCount) || 0,
    newPageCount: Number(next.answerPageCount) || 0,
  };
}

export function memoPreview(text, max = 40) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
