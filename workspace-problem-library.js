/**
 * Problem Library — UI (목록 + 우측 상세 패널)
 */
import {
  createProblemFromImage,
  createProblemManual,
  createProblemFromPdf,
  createProblemFromScreenshot,
  deleteProblem,
  filterProblems,
  getProblem,
  listAllProblems,
  loadProblemNotes,
  markProblemViewed,
  saveProblem,
  searchProblems,
  sortProblems,
  syncProblemAttemptStats,
} from "./workspace-problem-service.js";
import { listAttemptsByProblemKey } from "./workspace-attempt-service.js";
import { formatProblemDate, sourceLabel } from "./workspace-problem-model.js";
import { formatAttemptDate, formatAttemptDuration, statusLabel } from "./workspace-attempt-model.js";
import { suggestSearchTags } from "./workspace-problem-tags.js";

export function initProblemLibrary({ onOpenSolve, onSwitchMainView }) {
  const els = {
    grid: document.getElementById("pl-grid"),
    search: document.getElementById("pl-search"),
    filter: document.getElementById("pl-filter"),
    sort: document.getElementById("pl-sort"),
    addBtn: document.getElementById("pl-add-btn"),
    addModal: document.getElementById("pl-add-modal"),
    detail: document.getElementById("pl-detail"),
    detailEmpty: document.getElementById("pl-detail-empty"),
    detailPane: document.getElementById("pl-detail-pane"),
    aiTagBtn: document.getElementById("pl-ai-tag-btn"),
    tagSuggestions: document.getElementById("pl-tag-suggestions"),
  };

  let allProblems = [];
  let selectedId = null;
  let pendingFile = null;
  let addMode = "pdf";

  async function refresh() {
    allProblems = await listAllProblems();
    for (const p of allProblems) {
      if (p.problemKey) await syncProblemAttemptStats(p.problemKey).catch(() => {});
    }
    allProblems = await listAllProblems();
    renderGrid();
    if (selectedId) await renderDetail(selectedId);
  }

  function visibleProblems() {
    const filtered = filterProblems(allProblems, els.filter?.value || "all");
    const searched = searchProblems(filtered, els.search?.value || "");
    return sortProblems(searched, els.sort?.value || "createdDesc");
  }

  function renderGrid() {
    if (!els.grid) return;
    const items = visibleProblems();
    if (!items.length) {
      els.grid.innerHTML = `<div class="pl-empty-state"><p>저장된 문제가 없습니다.</p></div>`;
      return;
    }
    els.grid.innerHTML = items
      .map((p) => {
        const active = p.id === selectedId ? " is-selected" : "";
        const tags = (p.tags || [])
          .slice(0, 3)
          .map((t) => `<span class="pl-tag">${escapeHtml(t)}</span>`)
          .join("");
        return `
      <article class="pl-card${active}" data-open-problem="${p.id}">
        <div class="pl-card-line pl-card-year">${p.year || "—"} · ${escapeHtml(p.problemNumber || "?")}${
          p.questionNumber ? `-${escapeHtml(p.questionNumber)}` : ""
        }</div>
        <div class="pl-card-tags">${tags || '<span class="pl-tag pl-tag-muted">태그 없음</span>'}</div>
        <div class="pl-card-line pl-card-date">최근 ${formatProblemDate(p.lastSolvedAt || p.updatedAt)}</div>
        <div class="pl-card-line">${p.notes?.trim() ? "메모 있음" : "메모 없음"}</div>
      </article>`;
      })
      .join("");
  }

  async function renderDetail(id) {
    const problem = await getProblem(id);
    if (!problem || !els.detail) return;
    selectedId = id;
    await markProblemViewed(id);
    renderGrid();

    const notes = await loadProblemNotes(problem);
    const attempts = problem.problemKey ? await listAttemptsByProblemKey(problem.problemKey) : [];

    els.detailEmpty.hidden = true;
    els.detail.hidden = false;
    els.detailPane?.classList.add("has-selection");

    document.getElementById("pl-detail-title").textContent =
      `${problem.year || ""} ${sourceLabel(problem.source)} 문제${problem.problemNumber || "?"}${
        problem.questionNumber ? ` (${problem.questionNumber})` : ""
      }`.trim();

    const preview = document.getElementById("pl-detail-preview");
    const att = problem.attachments?.[0];
    if (preview) {
      if (problem.thumbnail) {
        preview.innerHTML = `<img src="${problem.thumbnail}" alt="" class="pl-detail-image" />`;
      } else if (att?.dataUrl) {
        preview.innerHTML = `<img src="${att.dataUrl}" alt="" class="pl-detail-image" />`;
      } else {
        preview.innerHTML = `<div class="pl-detail-pdf-hint"><p>📄 ${escapeHtml(problem.pdfFileName || att?.fileName || "PDF")}</p><p class="pl-muted">${problem.examPage ? `${problem.examPage}쪽` : ""} · 문제 풀기에서 확인</p></div>`;
      }
    }

    const meta = document.getElementById("pl-detail-meta");
    if (meta) {
      meta.innerHTML = `
        <dt>출처</dt><dd>${escapeHtml(sourceLabel(problem.source))}</dd>
        <dt>PDF</dt><dd>${escapeHtml(problem.pdfFileName || "—")}</dd>
        <dt>페이지</dt><dd>${problem.examPage || 1}쪽</dd>
        <dt>풀이</dt><dd>${problem.attemptCount}회</dd>
      `;
    }

    renderTagEditor(problem.tags || []);
    document.getElementById("pl-detail-notes").value = notes;
    if (els.tagSuggestions) els.tagSuggestions.hidden = true;

    const attemptEl = document.getElementById("pl-detail-attempts");
    if (attemptEl) {
      attemptEl.innerHTML = attempts.length
        ? attempts
            .map(
              (a) => `
        <button type="button" class="pl-attempt-row" data-load-attempt="${a.id}">
          <strong>${a.attemptNumber || 1}회차</strong>
          <span>${formatAttemptDate(a.completedAt || a.updatedAt)}</span>
          <span>${formatAttemptDuration(a.elapsedSeconds)}</span>
          <span>${a.answerPageCount}p</span>
        </button>`
            )
            .join("")
        : `<p class="pl-muted">풀이 기록 없음</p>`;
    }
  }

  function renderTagEditor(tags) {
    const el = document.getElementById("pl-detail-tags");
    if (!el) return;
    el.innerHTML = `
      <div class="pl-tag-editor">
        ${tags.map((t) => `<span class="pl-tag pl-tag-removable" data-remove-tag="${escapeHtml(t)}">${escapeHtml(t)} ×</span>`).join("")}
        <input type="text" id="pl-tag-input" class="pl-tag-input" placeholder="태그 입력 후 Enter" />
      </div>`;
  }

  function closeDetail() {
    selectedId = null;
    if (els.detail) els.detail.hidden = true;
    if (els.detailEmpty) els.detailEmpty.hidden = false;
    els.detailPane?.classList.remove("has-selection");
    renderGrid();
  }

  function readMetaForm() {
    const form = els.addModal;
    return {
      title: form.querySelector("#pl-meta-title")?.value?.trim() || "",
      source: form.querySelector("#pl-meta-source")?.value || "custom",
      year: form.querySelector("#pl-meta-year")?.value || null,
      problemNumber: form.querySelector("#pl-meta-number")?.value?.trim() || "",
      questionNumber: form.querySelector("#pl-meta-question")?.value?.trim() || "",
      description: form.querySelector("#pl-meta-desc")?.value?.trim() || "",
      tags: (form.querySelector("#pl-meta-tags")?.value || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: form.querySelector("#pl-meta-notes")?.value?.trim() || "",
    };
  }

  function openAddModal(mode = "pdf") {
    addMode = mode;
    pendingFile = null;
    const modal = els.addModal;
    if (!modal) return;
    modal.querySelectorAll("[data-add-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.addTab === mode);
    });
    modal.querySelectorAll("[data-add-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.addPanel !== mode;
    });
    modal.hidden = false;
    document.body.classList.add("ws-modal-open");
  }

  function closeAddModal() {
    if (els.addModal) els.addModal.hidden = true;
    if (!document.querySelector(".ws-modal:not([hidden])")) document.body.classList.remove("ws-modal-open");
  }

  async function submitAdd() {
    const meta = readMetaForm();
    let problem;
    if (addMode === "pdf") {
      if (!pendingFile) return alert("PDF 파일을 선택해주세요.");
      problem = await createProblemFromPdf(pendingFile, meta);
    } else if (addMode === "image") {
      if (!pendingFile) return alert("이미지 파일을 선택해주세요.");
      problem = await createProblemFromImage(pendingFile, meta);
    } else if (addMode === "screenshot") {
      const dataUrl = els.addModal?.querySelector("#pl-screenshot-preview")?.dataset?.url;
      if (!dataUrl) return alert("스크린샷을 붙여넣어주세요.");
      problem = await createProblemFromScreenshot(dataUrl, meta);
    } else {
      if (!meta.title) return alert("제목을 입력해주세요.");
      problem = await createProblemManual(meta);
    }
    closeAddModal();
    await refresh();
    await renderDetail(problem.id);
  }

  async function applySuggestedTags(tags) {
    if (!selectedId || !tags.length) return;
    const p = await getProblem(selectedId);
    await saveProblem({ ...p, tags: [...new Set([...(p.tags || []), ...tags])] });
    await refresh();
  }

  els.grid?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-open-problem]");
    if (card) renderDetail(card.dataset.openProblem);
  });

  els.search?.addEventListener("input", () => renderGrid());
  els.filter?.addEventListener("change", () => renderGrid());
  els.sort?.addEventListener("change", () => renderGrid());
  els.addBtn?.addEventListener("click", () => openAddModal("pdf"));

  els.aiTagBtn?.addEventListener("click", async () => {
    if (!selectedId || !els.tagSuggestions) return;
    const p = await getProblem(selectedId);
    const notes = document.getElementById("pl-detail-notes")?.value || p.notes || "";
    const suggested = suggestSearchTags(`${p.title} ${notes} ${p.description}`, p.tags || []);
    if (!suggested.length) {
      els.tagSuggestions.hidden = false;
      els.tagSuggestions.innerHTML = `<p class="pl-muted">추천할 태그가 없습니다. 메모에 키워드를 추가해보세요.</p>`;
      return;
    }
    els.tagSuggestions.hidden = false;
    els.tagSuggestions.innerHTML = `
      <span class="pl-muted">추천 태그:</span>
      ${suggested.map((t) => `<button type="button" class="pl-tag-suggest-btn" data-add-suggest-tag="${escapeHtml(t)}">${escapeHtml(t)} +</button>`).join("")}
      <button type="button" class="pl-btn pl-btn-sm" data-apply-all-tags>전체 추가</button>`;
    els.tagSuggestions.dataset.suggested = JSON.stringify(suggested);
  });

  els.tagSuggestions?.addEventListener("click", async (e) => {
    const one = e.target.closest("[data-add-suggest-tag]");
    if (one) {
      await applySuggestedTags([one.dataset.addSuggestTag]);
      return;
    }
    if (e.target.matches("[data-apply-all-tags]")) {
      const tags = JSON.parse(els.tagSuggestions.dataset.suggested || "[]");
      await applySuggestedTags(tags);
    }
  });

  els.addModal?.addEventListener("click", (e) => {
    if (e.target.matches("[data-add-close]")) closeAddModal();
    const tab = e.target.closest("[data-add-tab]");
    if (tab) openAddModal(tab.dataset.addTab);
    if (e.target.matches("[data-add-submit]")) submitAdd();
  });

  els.addModal?.querySelector("#pl-pdf-input")?.addEventListener("change", (e) => {
    pendingFile = e.target.files?.[0] || null;
  });
  els.addModal?.querySelector("#pl-image-input")?.addEventListener("change", (e) => {
    pendingFile = e.target.files?.[0] || null;
  });
  els.addModal?.querySelector("#pl-screenshot-zone")?.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      const preview = els.addModal.querySelector("#pl-screenshot-preview");
      if (preview) {
        preview.src = reader.result;
        preview.dataset.url = reader.result;
        preview.hidden = false;
      }
    };
    reader.readAsDataURL(item.getAsFile());
  });

  els.detail?.addEventListener("click", async (e) => {
    if (e.target.matches("[data-solve-problem]")) {
      const problem = await getProblem(selectedId);
      if (problem) {
        onSwitchMainView?.("solve");
        await onOpenSolve?.(problem, { promptAttempts: true });
      }
      return;
    }
    const removeTag = e.target.closest("[data-remove-tag]");
    if (removeTag && selectedId) {
      const p = await getProblem(selectedId);
      await saveProblem({ ...p, tags: (p.tags || []).filter((t) => t !== removeTag.dataset.removeTag) });
      await refresh();
    }
    const attemptBtn = e.target.closest("[data-load-attempt]");
    if (attemptBtn) {
      onSwitchMainView?.("solve");
      await window.__workspaceAttemptBridge?.openAttemptById?.(attemptBtn.dataset.loadAttempt);
    }
  });

  els.detail?.addEventListener("keydown", async (e) => {
    if (e.target.id !== "pl-tag-input" || e.key !== "Enter") return;
    e.preventDefault();
    const tag = e.target.value.trim();
    if (!tag || !selectedId) return;
    const p = await getProblem(selectedId);
    await saveProblem({ ...p, tags: [...new Set([...(p.tags || []), tag])] });
    e.target.value = "";
    await refresh();
  });

  document.getElementById("pl-detail-notes")?.addEventListener(
    "input",
    debounce(async (e) => {
      if (!selectedId) return;
      const p = await getProblem(selectedId);
      await saveProblem({ ...p, notes: e.target.value });
    }, 600)
  );

  document.getElementById("pl-detail-delete")?.addEventListener("click", async () => {
    if (!selectedId || !confirm("이 문제를 삭제하시겠습니까?")) return;
    await deleteProblem(selectedId);
    closeDetail();
    await refresh();
  });

  window.__problemLibraryRefresh = refresh;
  window.__problemLibraryOpenDetail = renderDetail;
  refresh();
  return { refresh, openDetail: renderDetail };
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
