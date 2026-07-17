/**
 * Attempt CRUD — IndexedDB
 */
import {
  ATTEMPTS_STORE,
  DOCUMENTS_STORE,
  DRAFTS_STORE,
  PROBLEM_NOTES_STORE,
  SETTINGS_STORE,
  idbDelete,
  idbGet,
  idbGetAll,
  idbGetAllByIndex,
  idbPut,
  sha256Hex,
} from "./workspace-attempt-db.js";
import {
  buildProblemKey,
  buildRevisionEntry,
  computeAnswerMetrics,
  inferSourceType,
  normalizeAttempt,
} from "./workspace-attempt-model.js";
import { resolveExamYear } from "./workspace-answer-export.js";

const LEGACY_ATTEMPTS_KEY = "cpa-workspace-exam-attempts";
let migrationDone = false;

export async function computeDocumentId(buffer) {
  return sha256Hex(buffer);
}

export async function upsertDocument({ buffer, fileName, fileSize, pageCount, title, legacyFingerprint, sourceType }) {
  const id = await computeDocumentId(buffer);
  const existing = await idbGet(DOCUMENTS_STORE, id);
  const parsedYear = resolveExamYear({ title, fileName });
  const doc = {
    id,
    sha256: id,
    fileName: String(fileName || ""),
    fileSize: Number(fileSize) || 0,
    pageCount: Number(pageCount) || 0,
    title: String(title || fileName || ""),
    year: existing?.year ?? (parsedYear ? Number(parsedYear) : null),
    sourceType: sourceType || inferSourceType(fileName),
    legacyFingerprint: String(legacyFingerprint || ""),
    uploadedAt: existing?.uploadedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await idbPut(DOCUMENTS_STORE, doc);
  return doc;
}

export async function getDocument(documentId) {
  return idbGet(DOCUMENTS_STORE, documentId);
}

export async function listAttemptsByProblemKey(problemKey) {
  const rows = await idbGetAllByIndex(ATTEMPTS_STORE, "problemKey", problemKey);
  return rows.map(normalizeAttempt).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function listAllAttempts() {
  const rows = await idbGetAll(ATTEMPTS_STORE);
  return rows.map(normalizeAttempt).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getAttempt(id) {
  const row = await idbGet(ATTEMPTS_STORE, id);
  return row ? normalizeAttempt(row) : null;
}

export async function getNextAttemptNumber(problemKey) {
  const rows = await listAttemptsByProblemKey(problemKey);
  if (!rows.length) return 1;
  return Math.max(...rows.map((a) => a.attemptNumber || 1)) + 1;
}

export async function saveAttempt(attemptInput, { countLinesFn } = {}) {
  const base = normalizeAttempt(attemptInput);
  if (!base.problemKey && base.documentId) {
    base.problemKey = buildProblemKey(base.documentId, base.problemLabel);
  }
  const metrics = computeAnswerMetrics(base.answerPages, countLinesFn);
  const attempt = normalizeAttempt({
    ...base,
    ...metrics,
    updatedAt: new Date().toISOString(),
  });
  if (!attempt.attemptNumber) {
    attempt.attemptNumber = await getNextAttemptNumber(attempt.problemKey);
  }
  await idbPut(ATTEMPTS_STORE, attempt);
  return attempt;
}

export async function updateAttemptRecord(id, patch, { countLinesFn, addRevision = false } = {}) {
  const existing = await getAttempt(id);
  if (!existing) return null;
  const merged = normalizeAttempt({ ...existing, ...patch, id: existing.id });
  if (patch.answerPages) {
    const metrics = computeAnswerMetrics(merged.answerPages, countLinesFn);
    Object.assign(merged, metrics);
  }
  merged.updatedAt = new Date().toISOString();
  if (addRevision) {
    merged.revisionHistory = [...(existing.revisionHistory || []), buildRevisionEntry(existing, merged)];
  }
  await idbPut(ATTEMPTS_STORE, merged);
  return merged;
}

export async function deleteAttemptRecord(id) {
  await idbDelete(ATTEMPTS_STORE, id);
}

export async function duplicateAttemptAsNew(source, { countLinesFn, copyMemo = true, copyTags = true, copyAnnotations = true } = {}) {
  const attemptNumber = await getNextAttemptNumber(source.problemKey);
  return saveAttempt(
    {
      ...source,
      id: undefined,
      attemptNumber,
      sourceAttemptId: source.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      status: "draft",
      revisionHistory: [],
      memo: copyMemo ? source.memo : "",
      tags: copyTags ? [...(source.tags || [])] : [],
      annotations: copyAnnotations ? JSON.parse(JSON.stringify(source.annotations || [])) : [],
      pdfSaved: false,
      pdfFilename: "",
    },
    { countLinesFn }
  );
}

export async function getProblemNote(problemKey) {
  const row = await idbGet(PROBLEM_NOTES_STORE, problemKey);
  return row?.note || "";
}

export async function saveProblemNote(problemKey, note) {
  await idbPut(PROBLEM_NOTES_STORE, {
    problemKey,
    note: String(note || ""),
    updatedAt: new Date().toISOString(),
  });
}

export async function getDraft(problemKey) {
  return idbGet(DRAFTS_STORE, `draft:${problemKey}`);
}

export async function saveDraft(draft) {
  const row = {
    ...draft,
    id: draft.id || `draft:${draft.problemKey}`,
    updatedAt: new Date().toISOString(),
  };
  await idbPut(DRAFTS_STORE, row);
  return row;
}

export async function deleteDraft(problemKey) {
  await idbDelete(DRAFTS_STORE, `draft:${problemKey}`);
}

export async function migrateLegacyAttempts(documentIdByFingerprint = {}) {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const raw = localStorage.getItem(LEGACY_ATTEMPTS_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw);
    if (!Array.isArray(legacy) || !legacy.length) return;
    const existing = await idbGetAll(ATTEMPTS_STORE);
    if (existing.length) return;

    for (const item of legacy) {
      const fp = item.examId || "";
      const documentId = documentIdByFingerprint[fp] || fp;
      const problemLabel = item.docTitle || "전체";
      await saveAttempt({
        documentId,
        documentTitle: item.docTitle || "",
        problemLabel,
        questionRange: "전체",
        problemKey: buildProblemKey(documentId, problemLabel),
        sourceType: "past_exam",
        createdAt: item.endedAt || new Date().toISOString(),
        updatedAt: item.endedAt || new Date().toISOString(),
        completedAt: item.endedAt || null,
        elapsedSeconds: item.timerSeconds || 0,
        answerPages: item.answerSheet || [],
        status: "completed",
        fontSize: item.fontSize,
        letterSpacing: item.letterSpacing,
        answerPageCount: item.writtenPageCount || 0,
        totalCharacters: item.totalCharCount || 0,
        totalLines: item.usedRowCount || 0,
        pdfSaved: item.pdfSaved,
        pdfFilename: item.pdfFilename || "",
        legacyFingerprint: fp,
      });
    }
  } catch (err) {
    console.warn("Legacy attempt migration failed:", err);
  }
}

export function filterAttempts(attempts, { filter = "all", sourceType } = {}) {
  return attempts.filter((a) => {
    if (sourceType && a.sourceType !== sourceType) return false;
    switch (filter) {
      case "past_exam":
      case "mock_exam":
      case "book":
        return a.sourceType === filter;
      case "draft":
        return a.status === "draft";
      case "completed":
        return a.status === "completed";
      case "review":
        return a.status === "review";
      default:
        return true;
    }
  });
}

export function sortAttempts(attempts, sortBy = "updatedDesc") {
  const copy = [...attempts];
  copy.sort((a, b) => {
    switch (sortBy) {
      case "createdDesc":
        return new Date(b.createdAt) - new Date(a.createdAt);
      case "createdAsc":
        return new Date(a.createdAt) - new Date(b.createdAt);
      case "elapsedDesc":
        return (b.elapsedSeconds || 0) - (a.elapsedSeconds || 0);
      case "elapsedAsc":
        return (a.elapsedSeconds || 0) - (b.elapsedSeconds || 0);
      default:
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    }
  });
  return copy;
}

export async function getSetting(key, fallback = null) {
  const row = await idbGet(SETTINGS_STORE, key);
  return row?.value ?? fallback;
}

export async function setSetting(key, value) {
  await idbPut(SETTINGS_STORE, { id: key, value, updatedAt: new Date().toISOString() });
}
