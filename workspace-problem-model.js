/**
 * Problem Library — 데이터 모델
 */
import { buildProblemKey } from "./workspace-attempt-model.js";

export const PROBLEM_SOURCES = {
  past_exam: "기출",
  mock_exam: "모의고사",
  book: "연습서",
  custom: "직접추가",
};

export const REVIEW_STATUSES = {
  unsolved: "미풀이",
  completed: "풀이완료",
  review_needed: "복습필요",
};

export const DEFAULT_TAGS = [
  "독립성",
  "감사증거",
  "위험평가",
  "계속기업",
  "품질관리",
  "내부통제",
  "회계추정치",
  "특수관계자",
  "부정위험",
  "조회",
  "재고실사",
];

export function formatProblemDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}.${mo}.${da}`;
}

export function buildProblemLabel({ year, title, problemNumber, questionNumber }) {
  const parts = [];
  if (year) parts.push(String(year));
  if (title) parts.push(String(title).trim());
  if (problemNumber) parts.push(`문제${problemNumber}`);
  if (questionNumber) parts.push(`물음${questionNumber}`);
  return parts.join(" ").trim() || "문제";
}

export function normalizeProblem(raw = {}) {
  const now = new Date().toISOString();
  const id = raw.id || `problem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const problemLabel = String(raw.problemLabel || buildProblemLabel(raw));
  const documentId = String(raw.documentId || "");
  const problemKey =
    String(raw.problemKey || "") ||
    (documentId ? buildProblemKey(documentId, problemLabel) : buildProblemKey(id, problemLabel));

  return {
    id,
    title: String(raw.title || "제목 없음"),
    source: Object.keys(PROBLEM_SOURCES).includes(raw.source) ? raw.source : "custom",
    year: raw.year != null && raw.year !== "" ? Number(raw.year) : null,
    problemNumber: String(raw.problemNumber || ""),
    questionNumber: String(raw.questionNumber || ""),
    pdfFileName: String(raw.pdfFileName || raw.attachments?.[0]?.fileName || ""),
    examPage: Number(raw.examPage ?? 1) || 1,
    description: String(raw.description || ""),
    tags: Array.isArray(raw.tags) ? [...raw.tags] : [],
    favorite: Boolean(raw.favorite),
    reviewStatus: Object.keys(REVIEW_STATUSES).includes(raw.reviewStatus) ? raw.reviewStatus : "unsolved",
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    notes: String(raw.notes || ""),
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map((a) => ({ ...a })) : [],
    attemptCount: Number(raw.attemptCount) || 0,
    lastSolvedAt: raw.lastSolvedAt ?? null,
    lastViewedAt: raw.lastViewedAt ?? null,
    thumbnail: raw.thumbnail || null,
    documentId,
    problemLabel,
    problemKey,
    legacyFingerprint: String(raw.legacyFingerprint || ""),
  };
}

export function sourceLabel(source) {
  return PROBLEM_SOURCES[source] || PROBLEM_SOURCES.custom;
}

export function reviewStatusLabel(status) {
  return REVIEW_STATUSES[status] || REVIEW_STATUSES.unsolved;
}

export function problemSearchHaystack(problem) {
  return [
    problem.title,
    sourceLabel(problem.source),
    problem.year,
    problem.problemNumber,
    problem.questionNumber,
    problem.pdfFileName,
    ...(problem.tags || []),
    problem.notes,
    problem.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
