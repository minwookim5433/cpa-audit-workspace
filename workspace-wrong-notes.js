/**
 * 오답노트 저장 및 반복 실수 통계
 */

const STORAGE_KEY = "cpa-workspace-wrong-notes";

const CATEGORIES = ["감사기준 표현", "논리", "문장구성", "용어선택", "표현"];

export function loadWrongNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWrongNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function addWrongNote(entry) {
  const notes = loadWrongNotes();
  const note = {
    id: `wn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    year: entry.year || "",
    problemNumber: entry.problemNumber || "",
    originalText: entry.originalText || "",
    suggestion: entry.suggestion || "",
    reason: entry.reason || "",
    category: normalizeCategory(entry.category),
    coachType: entry.coachType || "",
  };
  notes.unshift(note);
  saveWrongNotes(notes);
  return note;
}

function normalizeCategory(cat) {
  if (CATEGORIES.includes(cat)) return cat;
  return "표현";
}

export function computeMistakeStats(notes) {
  const counts = {};
  CATEGORIES.forEach((c) => {
    counts[c] = 0;
  });
  for (const note of notes) {
    const cat = normalizeCategory(note.category);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const sorted = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  return { counts, sorted, max };
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderWrongNotesList(container, notes) {
  if (!container) return;
  if (!notes.length) {
    container.innerHTML = `<p class="ws-empty-msg">아직 저장된 수정 포인트가 없습니다.<br>답안을 드래그하여 Answer Coach를 실행하세요.</p>`;
    return;
  }

  container.innerHTML = `<div class="ws-note-list">${notes
    .slice(0, 50)
    .map((note) => {
      const date = new Date(note.date).toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
      <article class="ws-note-card" data-note-id="${note.id}">
        <div class="ws-note-card-head">
          <span>${escapeHtml(date)} · 문제 ${escapeHtml(note.problemNumber || "—")}</span>
          <span class="ws-note-category">${escapeHtml(note.category)}</span>
        </div>
        <div class="ws-note-original"><strong>현재</strong> ${escapeHtml(note.originalText)}</div>
        <div class="ws-note-suggestion"><strong>추천</strong> ${escapeHtml(note.suggestion)}</div>
        ${note.reason ? `<p class="ws-note-reason">${escapeHtml(note.reason)}</p>` : ""}
      </article>`;
    })
    .join("")}</div>`;
}

export function renderStatsDashboard(container, notes) {
  if (!container) return;
  const { sorted, max } = computeMistakeStats(notes);

  if (!sorted.length) {
    container.innerHTML = `<p class="ws-empty-msg">반복 실수 데이터가 없습니다.<br>Answer Coach로 첨삭을 받으면 통계가 쌓입니다.</p>`;
    return;
  }

  container.innerHTML = `
    <p class="ws-panel-desc">오답노트 기반 반복 실수 분석 (총 ${notes.length}건)</p>
    <div class="ws-stats-list">
      ${sorted
        .map(
          ([label, count]) => `
        <div class="ws-stat-row">
          <span class="ws-stat-label">${escapeHtml(label)}</span>
          <div class="ws-stat-bar-wrap">
            <div class="ws-stat-bar" style="width: ${Math.round((count / max) * 100)}%"></div>
          </div>
          <span class="ws-stat-count">${count}</span>
        </div>`
        )
        .join("")}
    </div>`;
}
