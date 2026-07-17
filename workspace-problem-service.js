/**
 * Problem Library — IndexedDB CRUD
 */
import {
  PDF_STORE,
  PROBLEMS_STORE,
  SETTINGS_STORE,
  idbDelete,
  idbGet,
  idbGetAll,
  idbGetAllByIndex,
  idbPut,
} from "./workspace-attempt-db.js";
import { upsertDocument, listAttemptsByProblemKey, saveProblemNote, getProblemNote } from "./workspace-attempt-service.js";
import { inferSourceType } from "./workspace-attempt-model.js";
import { normalizeProblem, problemSearchHaystack, buildProblemLabel } from "./workspace-problem-model.js";
import { buildProblemKey } from "./workspace-attempt-model.js";

const RECENT_SETTINGS_KEY = "library-recent";

function pdfFingerprint(file) {
  return `${file.name}|${file.size}|${file.lastModified ?? 0}`;
}

export async function listAllProblems() {
  const rows = await idbGetAll(PROBLEMS_STORE);
  return rows.map(normalizeProblem).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getProblem(id) {
  const row = await idbGet(PROBLEMS_STORE, id);
  return row ? normalizeProblem(row) : null;
}

export async function saveProblem(input) {
  const problem = normalizeProblem(input);
  if (problem.documentId && problem.problemLabel) {
    problem.problemKey = buildProblemKey(problem.documentId, problem.problemLabel);
  } else if (problem.problemLabel) {
    problem.problemKey = buildProblemKey(problem.id, problem.problemLabel);
  }
  problem.updatedAt = new Date().toISOString();
  await idbPut(PROBLEMS_STORE, problem);
  if (problem.notes && problem.problemKey) {
    await saveProblemNote(problem.problemKey, problem.notes);
  }
  return problem;
}

export async function deleteProblem(id) {
  await idbDelete(PROBLEMS_STORE, id);
}

export async function savePdfBuffer(fingerprint, buffer, name) {
  await idbPut(PDF_STORE, {
    fingerprint,
    buffer,
    name,
    savedAt: new Date().toISOString(),
  });
}

export async function loadPdfBuffer(fingerprint) {
  const row = await idbGet(PDF_STORE, fingerprint);
  return row?.buffer || null;
}

async function createThumbnailFromFile(file) {
  if (file.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
  return null;
}

export async function createProblemFromPdf(file, meta = {}) {
  const buffer = await file.arrayBuffer();
  const fp = pdfFingerprint(file);
  const doc = await upsertDocument({
    buffer,
    fileName: file.name,
    fileSize: file.size,
    pageCount: meta.pageCount || 0,
    title: meta.title || file.name.replace(/\.pdf$/i, ""),
    legacyFingerprint: fp,
    sourceType: meta.source || inferSourceType(file.name),
  });
  await savePdfBuffer(fp, buffer.slice(0), file.name);
  const thumbnail = await createThumbnailFromFile(file);
  return saveProblem({
    title: meta.title || doc.title,
    source: meta.source || doc.sourceType,
    year: meta.year ?? null,
    problemNumber: meta.problemNumber || "",
    questionNumber: meta.questionNumber || "",
    pdfFileName: file.name,
    description: meta.description || "",
    tags: meta.tags || [],
    notes: meta.notes || "",
    documentId: doc.id,
    legacyFingerprint: fp,
    problemLabel: meta.problemLabel,
    examPage: meta.examPage || 1,
    thumbnail,
    attachments: [{ type: "pdf", fileName: file.name, fingerprint: fp, documentId: doc.id }],
    reviewStatus: "unsolved",
  });
}

export async function createProblemFromImage(file, meta = {}) {
  const dataUrl = await createThumbnailFromFile(file);
  return saveProblem({
    ...meta,
    thumbnail: dataUrl,
    attachments: [{ type: "image", fileName: file.name, dataUrl }],
    reviewStatus: meta.reviewStatus || "unsolved",
  });
}

export async function createProblemFromScreenshot(dataUrl, meta = {}) {
  return saveProblem({
    ...meta,
    thumbnail: dataUrl,
    attachments: [{ type: "image", fileName: "screenshot.png", dataUrl }],
    reviewStatus: meta.reviewStatus || "unsolved",
  });
}

export async function createProblemManual(meta = {}) {
  return saveProblem({
    title: meta.title || "새 문제",
    source: meta.source || "custom",
    year: meta.year ?? null,
    problemNumber: meta.problemNumber || "",
    description: meta.description || "",
    tags: meta.tags || [],
    notes: meta.notes || "",
    reviewStatus: "unsolved",
  });
}

export async function syncProblemAttemptStats(problemKey) {
  const problems = await idbGetAllByIndex(PROBLEMS_STORE, "problemKey", problemKey);
  if (!problems.length) return;
  const attempts = await listAttemptsByProblemKey(problemKey);
  const latest = attempts[0];
  const problem = normalizeProblem(problems[0]);
  problem.attemptCount = attempts.length;
  problem.lastSolvedAt = latest?.completedAt || latest?.updatedAt || problem.lastSolvedAt;
  if (attempts.some((a) => a.status === "completed")) {
    problem.reviewStatus = problem.reviewStatus === "review_needed" ? "review_needed" : "completed";
  }
  problem.updatedAt = new Date().toISOString();
  await idbPut(PROBLEMS_STORE, problem);
  return problem;
}

export async function markProblemViewed(id) {
  const problem = await getProblem(id);
  if (!problem) return null;
  problem.lastViewedAt = new Date().toISOString();
  problem.updatedAt = problem.lastViewedAt;
  await idbPut(PROBLEMS_STORE, problem);
  await pushRecent("recentViewed", id);
  return problem;
}

async function getRecentSettings() {
  const row = await idbGet(SETTINGS_STORE, RECENT_SETTINGS_KEY);
  return row?.value || { recentViewed: [], recentSolved: [] };
}

async function setRecentSettings(value) {
  await idbPut(SETTINGS_STORE, { id: RECENT_SETTINGS_KEY, value });
}

async function pushRecent(key, id) {
  const settings = await getRecentSettings();
  const list = [id, ...(settings[key] || []).filter((x) => x !== id)].slice(0, 8);
  settings[key] = list;
  await setRecentSettings(settings);
}

export async function markProblemSolved(id) {
  await pushRecent("recentSolved", id);
}

export async function getRecentProblems() {
  const [all, settings] = await Promise.all([listAllProblems(), getRecentSettings()]);
  const byId = new Map(all.map((p) => [p.id, p]));
  return {
    recentViewed: (settings.recentViewed || []).map((id) => byId.get(id)).filter(Boolean),
    recentSolved: (settings.recentSolved || []).map((id) => byId.get(id)).filter(Boolean),
  };
}

export function filterProblems(problems, filter) {
  if (!filter || filter === "all") return problems;
  if (filter === "favorite") return problems.filter((p) => p.favorite);
  if (filter === "review_needed") return problems.filter((p) => p.reviewStatus === "review_needed");
  if (filter === "unsolved") return problems.filter((p) => p.reviewStatus === "unsolved");
  return problems.filter((p) => p.source === filter);
}

export function sortProblems(problems, sort) {
  const rows = [...problems];
  switch (sort) {
    case "createdAsc":
      return rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case "lastSolvedDesc":
      return rows.sort(
        (a, b) => new Date(b.lastSolvedAt || 0) - new Date(a.lastSolvedAt || 0)
      );
    case "attemptDesc":
      return rows.sort((a, b) => b.attemptCount - a.attemptCount);
    case "yearDesc":
      return rows.sort((a, b) => (b.year || 0) - (a.year || 0));
    case "titleAsc":
      return rows.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    case "createdDesc":
    default:
      return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export function searchProblems(problems, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return problems;
  return problems.filter((p) => problemSearchHaystack(p).includes(q));
}

export async function saveProblemFromWorkspace({
  slot,
  workspace,
  state,
  meta = {},
  thumbnail = null,
}) {
  if (!slot?.documentId && !slot?.fingerprint) {
    throw new Error("저장할 PDF가 없습니다.");
  }

  const problemLabel = buildProblemLabel({
    year: meta.year,
    title: meta.title || slot.title || slot.name,
    problemNumber: meta.problemNumber,
    questionNumber: meta.questionNumber,
  });

  const existing = (await listAllProblems()).find(
    (p) =>
      p.documentId === slot.documentId &&
      p.problemNumber === String(meta.problemNumber || "") &&
      p.questionNumber === String(meta.questionNumber || "")
  );

  const payload = {
    ...(existing || {}),
    title: meta.title || slot.title || slot.name?.replace(/\.pdf$/i, "") || "문제",
    source: meta.source || slot.sourceType || "custom",
    year: meta.year ?? null,
    problemNumber: String(meta.problemNumber || ""),
    questionNumber: String(meta.questionNumber || ""),
    pdfFileName: slot.name || "",
    documentId: slot.documentId || "",
    legacyFingerprint: slot.fingerprint || "",
    problemLabel,
    examPage: Number(state?.currentPage ?? workspace?.currentPage ?? 1) || 1,
    notes: meta.notes || workspace?.attemptMemo || "",
    tags: meta.tags || workspace?.attemptTags || [],
    thumbnail: thumbnail || existing?.thumbnail || null,
    attachments: [
      {
        type: "pdf",
        fileName: slot.name || "",
        fingerprint: slot.fingerprint || "",
        documentId: slot.documentId || "",
      },
    ],
  };

  return saveProblem(payload);
}

export async function loadProblemNotes(problem) {
  if (!problem?.problemKey) return problem?.notes || "";
  const note = await getProblemNote(problem.problemKey);
  return note || problem.notes || "";
}
