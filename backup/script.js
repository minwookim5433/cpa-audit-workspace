const STORAGE_KEY = "audit-ai-selected-procedures";
const EVIDENCE_STATUS_STORAGE_KEY = "audit-ai-evidence-status";
const ENGAGEMENT_STORAGE_KEY = "audit-workbench-engagement";
const EVIDENCE_STATUSES = ["미요청", "요청", "수령", "검토완료"];
const GENERIC_GAP_TEXTS = new Set(["추가 정보 필요", "추가정보필요", "추가 확인 필요"]);

const VIEWS = ["overview", "planning", "risk", "response", "papers"];
const WORKFLOW_VIEWS = ["planning", "risk", "response", "papers"];

const pdfInput = document.getElementById("pdf-input");
const uploadBtn = document.getElementById("upload-btn");
const fileNameEl = document.getElementById("file-name");
const uploadStatusEl = document.getElementById("upload-status");
const problemNumberInput = document.getElementById("problem-number-input");
const analyzeBtn = document.getElementById("analyze-btn");
const sidebarNav = document.getElementById("sidebar-nav");
const gotoPlanningBtn = document.getElementById("goto-planning-btn");
const engagementLabel = document.getElementById("engagement-label");
const problemBadge = document.getElementById("problem-badge");
const sourceDocuments = document.getElementById("source-documents");
const sourceDocumentsList = document.getElementById("source-documents-list");
const planningMemo = document.getElementById("planning-memo");
const overviewAiArea = document.getElementById("overview-ai-area");
const planningAiArea = document.getElementById("planning-ai-area");
const riskAuditorArea = document.getElementById("risk-auditor-area");
const riskAiArea = document.getElementById("risk-ai-area");
const riskPendingCount = document.getElementById("risk-pending-count");
const responseAuditorArea = document.getElementById("response-auditor-area");
const procedureAuditorArea = document.getElementById("procedure-auditor-area");
const responseAiArea = document.getElementById("response-ai-area");
const papersAuditorArea = document.getElementById("papers-auditor-area");
const papersAiArea = document.getElementById("papers-ai-area");
const saveSelectionBtn = document.getElementById("save-selection-btn");
const selectionStatusEl = document.getElementById("selection-status");
const selectedSummary = document.getElementById("selected-summary");
const selectedSummaryList = document.getElementById("selected-summary-list");
const externalConfirmModal = document.getElementById("external-confirm-modal");
const copyExternalConfirmBtn = document.getElementById("copy-external-confirm-btn");
const statusEvidence = document.getElementById("status-evidence");
const statusPending = document.getElementById("status-pending");
const statusSaved = document.getElementById("status-saved");

const viewPanels = Object.fromEntries(
  VIEWS.map((v) => [v, document.getElementById(`view-${v}`)])
);

let extractedCaseText = "";
let uploadedFileName = "";
let currentProblemNumber = "";
let analysisData = null;
let currentView = "overview";
let selectedProcedureIds = new Set();
let evidenceStatusMap = {};
let engagementState = createDefaultEngagement();

function createDefaultEngagement() {
  return {
    planningMemo: "",
    riskConfirmations: {},
    auditTrail: [],
    lastSavedAt: null,
    lastView: "overview",
  };
}

function isMeaningful(value) {
  const t = String(value || "").trim();
  return Boolean(t) && !GENERIC_GAP_TEXTS.has(t);
}

function filterItems(items) {
  return (Array.isArray(items) ? items : []).map(String).map((s) => s.trim()).filter(isMeaningful);
}

function normalizeProblemNumber(value) {
  return String(value || "").trim().replace(/^문제\s*/i, "");
}

function esc(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList(items) {
  const safe = filterItems(items);
  if (!safe.length) return "";
  return `<ul class="result-list">${safe.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function renderNumberedList(items) {
  const safe = filterItems(items);
  if (!safe.length) return "";
  return `<ol class="reasoning-steps">${safe.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
}

function renderField(label, html) {
  if (!html) return "";
  return `<div class="risk-card-field"><p class="risk-card-label">${label}</p>${html}</div>`;
}

function renderText(value) {
  if (!isMeaningful(value)) return "";
  return `<p class="risk-card-text">${esc(value)}</p>`;
}

function renderOptionalField(label, value) {
  return isMeaningful(value) ? renderField(label, renderText(value)) : "";
}

function renderOptionalList(label, items) {
  const html = renderList(items);
  return html ? renderField(label, html) : "";
}

function renderRiskBadge(level) {
  const cls = { 높음: "risk-level-high", 중간: "risk-level-medium", 낮음: "risk-level-low", 추가정보필요: "risk-level-unknown" }[level] || "risk-level-unknown";
  return `<span class="risk-level ${cls}">${esc(level || "미분류")}</span>`;
}

function getEngagementKey() {
  if (!uploadedFileName) return null;
  return `${ENGAGEMENT_STORAGE_KEY}:${uploadedFileName}:problem-${currentProblemNumber || "default"}`;
}

function getStorageKey() {
  return `${STORAGE_KEY}:${uploadedFileName}:problem-${currentProblemNumber || "default"}`;
}

function getEvidenceStorageKey() {
  return `${EVIDENCE_STATUS_STORAGE_KEY}:${uploadedFileName}:problem-${currentProblemNumber || "default"}`;
}

function loadEngagement() {
  engagementState = createDefaultEngagement();
  const key = getEngagementKey();
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      engagementState = { ...createDefaultEngagement(), ...parsed };
    }
  } catch { /* ignore */ }
  if (planningMemo) planningMemo.value = engagementState.planningMemo || "";
}

function saveEngagement() {
  const key = getEngagementKey();
  if (!key) return;
  engagementState.lastSavedAt = new Date().toISOString();
  engagementState.lastView = currentView;
  localStorage.setItem(key, JSON.stringify(engagementState));
  updateStatusBar();
}

function addAuditTrail(action, detail) {
  engagementState.auditTrail.unshift({
    action,
    detail,
    at: new Date().toISOString(),
  });
  if (engagementState.auditTrail.length > 50) {
    engagementState.auditTrail = engagementState.auditTrail.slice(0, 50);
  }
  saveEngagement();
}

function getRiskConfirmation(riskId) {
  return engagementState.riskConfirmations[riskId] || { confirmed: false, memo: "", confirmedAt: null };
}

function setRiskConfirmation(riskId, patch) {
  const prev = getRiskConfirmation(riskId);
  engagementState.riskConfirmations[riskId] = { ...prev, ...patch };
  saveEngagement();
}

function getResponseForRisk(riskId) {
  return (analysisData?.responseProcedures?.byRisk || []).find((r) => r.riskId === riskId);
}

function getProcedureGroups() {
  return (analysisData?.riskAssessment?.risks || [])
    .map((risk) => {
      const resp = getResponseForRisk(risk.riskId);
      const alternatives = (resp?.procedureAlternatives || []).filter((a) => isMeaningful(a.procedure));
      return { risk, alternatives, response: resp };
    })
    .filter((g) => g.alternatives.length > 0);
}

function loadSelectionsFromStorage() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set((parsed.selectedProcedures || []).map((p) => p.procedureId).filter(Boolean));
  } catch {
    return new Set();
  }
}

function buildSelectedRecords() {
  const records = [];
  for (const { risk, alternatives } of getProcedureGroups()) {
    for (const alt of alternatives) {
      if (selectedProcedureIds.has(alt.procedureId)) {
        records.push({ ...alt, riskId: risk.riskId, riskTitle: risk.riskTitle });
      }
    }
  }
  return records.sort((a, b) => a.priority - b.priority);
}

function saveSelections() {
  localStorage.setItem(getStorageKey(), JSON.stringify({
    fileName: uploadedFileName,
    problemNumber: currentProblemNumber,
    savedAt: new Date().toISOString(),
    selectedProcedures: buildSelectedRecords(),
  }));
  addAuditTrail("절차 선택 저장", `${selectedProcedureIds.size}개 절차`);
}

function getEvidenceStatus(id) {
  return evidenceStatusMap[id] || "미요청";
}

function setEvidenceStatus(id, status) {
  if (!EVIDENCE_STATUSES.includes(status)) return;
  evidenceStatusMap[id] = status;
  localStorage.setItem(getEvidenceStorageKey(), JSON.stringify({
    fileName: uploadedFileName,
    problemNumber: currentProblemNumber,
    statuses: evidenceStatusMap,
  }));
  updateStatusBar();
}

function initEvidenceStatuses() {
  evidenceStatusMap = {};
  try {
    const raw = localStorage.getItem(getEvidenceStorageKey());
    if (raw) evidenceStatusMap = JSON.parse(raw).statuses || {};
  } catch { /* ignore */ }

  for (const item of analysisData?.responseProcedures?.byRisk || []) {
    for (const ev of item.requiredEvidence || []) {
      if (!evidenceStatusMap[ev.evidenceId]) evidenceStatusMap[ev.evidenceId] = "미요청";
    }
  }
}

function getEvidenceStats() {
  const ids = [];
  for (const item of analysisData?.responseProcedures?.byRisk || []) {
    for (const ev of item.requiredEvidence || []) {
      if (isMeaningful(ev.name)) ids.push(ev.evidenceId);
    }
  }
  const reviewed = ids.filter((id) => getEvidenceStatus(id) === "검토완료").length;
  return { total: ids.length, reviewed };
}

function getPendingRiskCount() {
  const risks = analysisData?.riskAssessment?.risks || [];
  return risks.filter((r) => !getRiskConfirmation(r.riskId).confirmed).length;
}

function getPendingJudgmentCount() {
  return getPendingRiskCount();
}

function updateEngagementHeader() {
  if (!analysisData) {
    engagementLabel.textContent = uploadedFileName ? `자료: ${uploadedFileName}` : "감사건 미설정";
    problemBadge.hidden = true;
    return;
  }
  const title = analysisData.problemTitle || "감사건";
  engagementLabel.textContent = title;
  problemBadge.textContent = `문제 ${analysisData.problemNumber}`;
  problemBadge.hidden = false;
}

function updateSourceDocuments() {
  if (!uploadedFileName) {
    sourceDocuments.hidden = true;
    return;
  }
  sourceDocuments.hidden = false;
  sourceDocumentsList.innerHTML = `<li>초기 PDF — ${esc(uploadedFileName)}</li>`;
}

function updateSidebarNav() {
  sidebarNav.querySelectorAll(".sidebar-item").forEach((btn) => {
    const view = btn.dataset.view;
    btn.classList.toggle("is-active", view === currentView);
    if (view === "overview") {
      btn.disabled = false;
    } else {
      btn.disabled = !analysisData;
    }
  });
  gotoPlanningBtn.disabled = !analysisData;
}

function showView(view) {
  if (view !== "overview" && !analysisData) return;
  currentView = view;
  VIEWS.forEach((v) => {
    const panel = viewPanels[v];
    if (!panel) return;
    const active = v === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  updateSidebarNav();
  saveEngagement();
  if (view !== "overview") {
    viewPanels[view]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateStatusBar() {
  const { total, reviewed } = getEvidenceStats();
  statusEvidence.textContent = total ? `증거 ${reviewed}/${total} 검토완료` : "증거 —";
  const pending = getPendingJudgmentCount();
  statusPending.textContent = analysisData
    ? (pending ? `미결 판단 ${pending}건` : "미결 판단 0건")
    : "미결 판단 —";
  const saved = engagementState.lastSavedAt;
  if (saved) {
    const d = new Date(saved);
    statusSaved.textContent = `마지막 저장 ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    statusSaved.textContent = "마지막 저장 —";
  }
}

function renderExtractionBanner(meta) {
  if (!meta) return "";
  const ok = meta.problemTextExtracted;
  const cls = ok ? "upload-status-success" : "upload-status-error";
  const msg = ok
    ? `문제 ${esc(meta.requestedProblemNumber)}번 텍스트를 분리하여 분석했습니다.`
    : esc(meta.warning);
  return `<p class="upload-status ${cls}">${msg}</p>`;
}

function renderPlanningAi(data) {
  const p = data.auditPlanning || {};
  const u = p.companyUnderstanding || {};
  const flow = [...(u.transactionFlow || [])].sort((a, b) => a.step - b.step);

  planningAiArea.innerHTML = `
    ${renderExtractionBanner(data.extractionMeta)}
    <div class="result-block">
      <h3 class="result-heading">문제 ${esc(data.problemNumber)} — ${esc(data.problemTitle || "감사계획")}</h3>
    </div>
    <div class="result-block company-profile-block">
      <h3 class="result-heading">피감사회사 이해</h3>
      ${renderOptionalField("산업", u.industry)}
      ${renderOptionalList("산업의 감사적 함의", u.industryAuditImplications)}
      ${renderOptionalField("경제환경의 감사적 영향", u.economicEnvironmentAuditImpact)}
      ${renderOptionalList("규제·시장 요인", u.regulatoryAndMarketFactors)}
      ${renderOptionalField("사업·수익 모델", u.businessModel)}
      ${renderOptionalField("거래 흐름 요약", u.transactionStory)}
      <div class="story-flow-diagram">
        ${flow.map((step, i) => `
          <div class="flow-step story-flow-step">
            <div class="flow-step-header">
              <span class="flow-step-order">${step.step || i + 1}</span>
              <span class="flow-step-title">${esc(step.event)}</span>
            </div>
            <p class="flow-step-description"><span>관련 경영진주장</span> ${esc((step.relatedAssertions || []).join(", "))}</p>
            <p class="flow-step-description"><span>감사 연관성</span> ${esc(step.auditRelevance)}</p>
            ${renderList(step.sourceFacts)}
          </div>
          ${i < flow.length - 1 ? '<div class="flow-arrow">↓</div>' : ""}
        `).join("")}
      </div>
      ${renderOptionalList("추가로 확인할 정보", p.informationGaps)}
      <button type="button" class="apply-ai-btn" data-apply="planning-gaps">추가 확인 항목을 메모에 추가</button>
    </div>
    ${
      (p.accountingNotes || []).filter((n) => isMeaningful(n.topic)).length
        ? `<div class="result-block"><h3 class="result-heading">회계처리 요약</h3>
          ${p.accountingNotes.map((n) => `
            <article class="accounting-brief-card">
              <h4 class="accounting-brief-title">${esc(n.topic)}</h4>
              <p class="accounting-brief-text">${esc(n.briefExplanation)}</p>
              ${isMeaningful(n.auditorFocus) ? `<p class="accounting-brief-focus"><span>감사 포인트</span> ${esc(n.auditorFocus)}</p>` : ""}
            </article>`).join("")}
        </div>`
        : ""
    }
    ${renderOptionalList("감사계획 초점", p.planningFocus)}
    <button type="button" class="apply-ai-btn" data-apply="planning-focus">감사계획 초점을 메모에 추가</button>
  `;
}

function renderRiskCardAi(risk) {
  const rc = risk.riskClassification || {};
  const sr = rc.significantRisk || {};

  return `
    <article class="risk-card risk-assessment-card">
      <div class="risk-card-header">
        <h4 class="risk-card-account">${risk.priority?.rank}. ${esc(risk.riskTitle)}</h4>
        <div class="risk-header-badges">
          ${sr.isSignificant ? '<span class="significant-risk-badge">유의적위험</span>' : ""}
          ${renderRiskBadge(rc.inherentRisk?.level)}
        </div>
      </div>
      ${renderOptionalList("사례 사실", risk.sourceFacts)}
      <div class="classification-table">
        <div class="classification-row"><span class="classification-label">고유위험</span><div class="classification-value">${renderRiskBadge(rc.inherentRisk?.level)}<span class="classification-reason">${esc(rc.inherentRisk?.reason)}</span></div></div>
        <div class="classification-row"><span class="classification-label">부정위험</span><div class="classification-value">${renderRiskBadge(rc.fraudRisk?.level)}<span class="classification-reason">${esc(rc.fraudRisk?.reason)}</span></div></div>
        <div class="classification-row"><span class="classification-label">유의적위험</span><div class="classification-value"><span class="significant-flag ${sr.isSignificant ? "is-yes" : "is-no"}">${sr.isSignificant ? "해당" : "해당 없음"}</span><span class="classification-reason">${esc(sr.reason)}</span></div></div>
      </div>
      ${isMeaningful(risk.whyThisRisk?.summary) ? `<p class="why-risk-summary">${esc(risk.whyThisRisk.summary)}</p>` : ""}
      ${renderNumberedList(risk.whyThisRisk?.reasoningChain)}
      ${renderOptionalList("추가로 확인할 정보", risk.informationGaps)}
    </article>
  `;
}

function renderRiskAuditorCard(risk) {
  const conf = getRiskConfirmation(risk.riskId);
  const confirmedCls = conf.confirmed ? "is-confirmed" : "";

  return `
    <article class="risk-confirm-card ${confirmedCls}" data-risk-id="${esc(risk.riskId)}">
      <div class="risk-confirm-header">
        <h4 class="risk-confirm-title">${risk.priority?.rank}. ${esc(risk.riskTitle)}</h4>
        <label class="risk-confirm-label">
          <input type="checkbox" class="risk-confirm-checkbox" data-risk-id="${esc(risk.riskId)}" ${conf.confirmed ? "checked" : ""} />
          감사인 확정
        </label>
      </div>
      <label class="auditor-memo-label" for="risk-memo-${esc(risk.riskId)}">위험 관련 메모</label>
      <textarea id="risk-memo-${esc(risk.riskId)}" class="auditor-memo risk-memo-input" rows="2" data-risk-id="${esc(risk.riskId)}" placeholder="감사인 판단, 팀 논의, 추가 절차 고려 사항">${esc(conf.memo)}</textarea>
      ${conf.confirmed && conf.confirmedAt ? `<p class="risk-confirm-meta"><span class="confirmed-at">확정</span> ${new Date(conf.confirmedAt).toLocaleString("ko-KR")}</p>` : ""}
    </article>
  `;
}

function renderRiskPhase(data) {
  const ra = data.riskAssessment || {};
  const risks = [...(ra.risks || [])].sort((a, b) => (a.priority?.rank || 99) - (b.priority?.rank || 99));

  riskAuditorArea.innerHTML = risks.length
    ? risks.map(renderRiskAuditorCard).join("")
    : "<p class='result-empty'>식별된 위험이 없습니다. AI 제안을 확인하세요.</p>";

  riskAiArea.innerHTML = `
    <div class="result-block">
      <h3 class="result-heading">위험 식별 및 평가 (AI 후보)</h3>
      <div class="risk-card-list">${risks.map(renderRiskCardAi).join("") || "<p class='result-empty'>식별된 위험이 없습니다.</p>"}</div>
      ${renderOptionalList("추가로 확인할 정보", ra.informationGaps)}
    </div>
  `;

  const pending = getPendingRiskCount();
  if (risks.length && pending > 0) {
    riskPendingCount.hidden = false;
    riskPendingCount.textContent = `미확정 ${pending}건`;
  } else {
    riskPendingCount.hidden = true;
  }
}

function renderEvidenceCard(ev) {
  const status = getEvidenceStatus(ev.evidenceId);
  const statusCls = { 미요청: "evidence-status-not-requested", 요청: "evidence-status-requested", 수령: "evidence-status-received", 검토완료: "evidence-status-reviewed" }[status];
  const isExternal = String(ev.requestMethod || "").includes("외부조회");

  return `
    <div class="evidence-item" data-evidence-id="${ev.evidenceId}">
      <div class="evidence-item-header">
        <h5 class="evidence-item-name">${esc(ev.name)}</h5>
        <span class="evidence-status-badge ${statusCls}">${status}</span>
      </div>
      ${isMeaningful(ev.reason) ? `<p class="evidence-request-row"><span>필요 이유</span> ${esc(ev.reason)}</p>` : ""}
      <div class="evidence-request-tool">
        ${isMeaningful(ev.requestTarget) ? `<p class="evidence-request-row"><span>요청 대상</span> ${esc(ev.requestTarget)}</p>` : ""}
        ${isMeaningful(ev.requestMethod) ? `<p class="evidence-request-row"><span>요청 방법</span> ${esc(ev.requestMethod)}</p>` : ""}
        ${renderList(ev.requestItems) ? `<div class="evidence-request-row"><span>요청 사항</span>${renderList(ev.requestItems)}</div>` : ""}
        ${isExternal ? `<button type="button" class="external-confirm-btn secondary-btn" data-target="${encodeURIComponent(ev.requestTarget || "")}" data-items="${encodeURIComponent((ev.requestItems || []).join("\n"))}" data-purpose="${encodeURIComponent(ev.reason || "")}">외부조회서 작성하기</button>` : ""}
      </div>
      <label class="evidence-status-label">상태
        <select class="evidence-status-select ${statusCls}" data-evidence-id="${ev.evidenceId}">
          ${EVIDENCE_STATUSES.map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderResponseAuditor(data) {
  const groups = (data.responseProcedures?.byRisk || []).map((resp) => {
    const risk = (data.riskAssessment?.risks || []).find((r) => r.riskId === resp.riskId);
    return { risk, resp };
  }).filter((g) => g.risk);

  responseAuditorArea.innerHTML = `
    <div class="result-block">
      <h3 class="result-heading">감사증거 추적</h3>
      ${groups.map(({ risk, resp }) => `
        <section class="response-risk-group">
          <h4 class="procedure-risk-title">${esc(risk.riskTitle)}</h4>
          <div class="evidence-item-list">${(resp.requiredEvidence || []).filter((e) => isMeaningful(e.name)).map(renderEvidenceCard).join("") || "<p class='result-empty'>연결된 증거가 없습니다.</p>"}</div>
        </section>
      `).join("")}
    </div>
  `;

  renderProcedurePanel();
}

function renderResponseAi(data) {
  const groups = (data.responseProcedures?.byRisk || []).map((resp) => {
    const risk = (data.riskAssessment?.risks || []).find((r) => r.riskId === resp.riskId);
    return { risk, resp };
  }).filter((g) => g.risk);

  responseAiArea.innerHTML = `
    <div class="result-block">
      <h3 class="result-heading">대응 초점 (AI 제안)</h3>
      ${groups.map(({ risk, resp }) => `
        <section class="response-risk-group">
          <h4 class="procedure-risk-title">${esc(risk.riskTitle)}</h4>
          ${isMeaningful(resp.responseFocus) ? `<p class="panel-desc">${esc(resp.responseFocus)}</p>` : "<p class='result-empty'>대응 초점 제안 없음</p>"}
        </section>
      `).join("")}
    </div>
  `;
}

function renderProcedurePanel() {
  const groups = getProcedureGroups();
  if (!groups.length) {
    procedureAuditorArea.innerHTML = "<p class='result-empty'>선택 가능한 대응절차 후보가 없습니다. AI 제안을 확인하세요.</p>";
    selectedSummary.hidden = true;
    return;
  }

  procedureAuditorArea.innerHTML = `
    <div class="result-block"><h3 class="result-heading">대응절차 선택</h3>
      <div class="procedure-selection-list">
        ${groups.map(({ risk, alternatives }) => `
          <section class="procedure-risk-group">
            <h4 class="procedure-risk-title">${esc(risk.riskTitle)}</h4>
            ${alternatives.map((alt) => {
              const checked = selectedProcedureIds.has(alt.procedureId);
              return `
                <label class="procedure-select-card ${checked ? "is-selected" : ""}">
                  <input type="checkbox" class="procedure-checkbox" data-procedure-id="${alt.procedureId}" ${checked ? "checked" : ""} />
                  <div class="procedure-select-content">
                    <div class="procedure-select-header"><span class="priority-badge">${alt.priority}순위</span><span class="procedure-select-title">${esc(alt.procedure)}</span></div>
                    ${isMeaningful(alt.purpose) ? `<p class="procedure-select-meta"><span>목적</span> ${esc(alt.purpose)}</p>` : ""}
                    ${isMeaningful(alt.selectionReason) ? `<p class="procedure-select-meta procedure-select-reason"><span>선택 이유</span> ${esc(alt.selectionReason)}</p>` : ""}
                  </div>
                </label>`;
            }).join("")}
          </section>
        `).join("")}
      </div>
    </div>
  `;

  const records = buildSelectedRecords();
  if (records.length) {
    selectedSummary.hidden = false;
    selectedSummaryList.innerHTML = records.map((r) => `
      <div class="selected-summary-item">
        <span class="priority-badge">${r.priority}순위</span> <strong>${esc(r.procedure)}</strong>
        <p class="selected-summary-meta">${esc(r.riskTitle)}</p>
      </div>`).join("");
  } else {
    selectedSummary.hidden = true;
  }
}

function renderPapersPhase(data) {
  const records = buildSelectedRecords();
  const { total, reviewed } = getEvidenceStats();
  const confirmedRisks = (data.riskAssessment?.risks || []).filter((r) => getRiskConfirmation(r.riskId).confirmed);

  papersAuditorArea.innerHTML = `
    <div class="papers-summary-grid">
      <div class="papers-summary-card">
        <h4>확정 위험</h4>
        <p>${confirmedRisks.length}건 확정 / ${(data.riskAssessment?.risks || []).length}건 후보</p>
      </div>
      <div class="papers-summary-card">
        <h4>선택 절차</h4>
        <p>${records.length}건 선택됨</p>
      </div>
      <div class="papers-summary-card">
        <h4>증거 검토</h4>
        <p>${reviewed}/${total} 검토완료</p>
      </div>
      <div class="papers-summary-card">
        <h4>감사계획 메모</h4>
        <p>${isMeaningful(engagementState.planningMemo) ? esc(engagementState.planningMemo).slice(0, 120) + (engagementState.planningMemo.length > 120 ? "…" : "") : "메모 없음"}</p>
      </div>
    </div>
    <div class="result-block" style="margin-top:1rem">
      <h3 class="result-heading">확정 이력 <span class="coming-soon-badge">조서 초안 준비 중</span></h3>
      <ul class="audit-trail-list">
        ${(engagementState.auditTrail || []).slice(0, 10).map((e) => `
          <li>${new Date(e.at).toLocaleString("ko-KR")} — ${esc(e.action)}${e.detail ? `: ${esc(e.detail)}` : ""}</li>
        `).join("") || "<li>아직 기록된 이력이 없습니다.</li>"}
      </ul>
    </div>
    <div class="coming-soon" style="margin-top:1rem">
      <p><strong>조서 초안 생성</strong> 및 <strong>추가 자료 변경 비교</strong> 기능은 다음 단계에서 제공됩니다.</p>
    </div>
  `;

  papersAiArea.innerHTML = `
    <p class="result-empty">검토완료 증거와 선택 절차를 바탕으로 조서 문장 초안을 생성하는 기능이 준비 중입니다.</p>
  `;
}

function renderOverviewAi(data) {
  if (!data) {
    overviewAiArea.innerHTML = "";
    return;
  }
  overviewAiArea.innerHTML = `
    <div class="result-block">
      <p class="risk-card-text"><strong>${esc(data.problemTitle)}</strong> — 문제 ${esc(data.problemNumber)}번 분석이 완료되었습니다.</p>
      <p class="risk-card-text">좌측 메뉴에서 감사계획·위험평가·대응·증거 영역으로 이동하여 작업을 진행하세요.</p>
    </div>
  `;
}

function renderAllPhases(data) {
  renderOverviewAi(data);
  renderPlanningAi(data);
  renderRiskPhase(data);
  renderResponseAuditor(data);
  renderResponseAi(data);
  renderPapersPhase(data);
  updateEngagementHeader();
  updateStatusBar();
}

function toggleAiLayer(layerEl) {
  const body = layerEl.querySelector(".ai-layer-body");
  const btn = layerEl.querySelector(".ai-toggle-btn");
  const expanded = layerEl.classList.toggle("is-expanded");
  layerEl.classList.toggle("is-collapsed", !expanded);
  if (body) body.hidden = !expanded;
  if (btn) {
    btn.textContent = expanded ? "접기" : "펼치기";
    btn.setAttribute("aria-expanded", String(expanded));
  }
}

function applyPlanningToMemo(type) {
  if (!analysisData || !planningMemo) return;
  const p = analysisData.auditPlanning || {};
  let text = "";
  if (type === "planning-gaps") {
    text = filterItems(p.informationGaps).map((g) => `[확인] ${g}`).join("\n");
  } else if (type === "planning-focus") {
    text = filterItems(p.planningFocus).map((f) => `[초점] ${f}`).join("\n");
  }
  if (!text) return;
  const prefix = planningMemo.value.trim() ? "\n" : "";
  planningMemo.value += prefix + text;
  engagementState.planningMemo = planningMemo.value;
  saveEngagement();
  addAuditTrail("AI 제안 적용", type === "planning-gaps" ? "추가 확인 항목" : "감사계획 초점");
}

function updateAnalyzeButtonState() {
  analyzeBtn.disabled = !extractedCaseText || !normalizeProblemNumber(problemNumberInput?.value);
}

function setAnalyzing(on) {
  analyzeBtn.disabled = on || !extractedCaseText || !normalizeProblemNumber(problemNumberInput?.value);
  analyzeBtn.textContent = on ? "분석 중..." : "분석 시작";
}

async function extractPdf(file) {
  const fd = new FormData();
  fd.append("pdf", file);
  const res = await fetch("/api/extract-pdf", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "PDF 추출 실패");
  return data;
}

async function analyzeCase(text, problemNumber) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseText: text, problemNumber }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "분석 실패");
  return data;
}

function openExternalModal(target, items, purpose) {
  document.getElementById("ecf-recipient").value = decodeURIComponent(target || "");
  document.getElementById("ecf-items").value = decodeURIComponent(items || "");
  document.getElementById("ecf-purpose").value = decodeURIComponent(purpose || "");
  externalConfirmModal.hidden = false;
}

function closeExternalModal() {
  externalConfirmModal.hidden = true;
}

uploadBtn.addEventListener("click", () => pdfInput.click());

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;
  extractedCaseText = "";
  analysisData = null;
  uploadedFileName = file.name;
  fileNameEl.textContent = file.name;
  uploadStatusEl.textContent = "PDF 추출 중...";
  updateSourceDocuments();
  updateEngagementHeader();
  updateAnalyzeButtonState();
  updateSidebarNav();
  try {
    const result = await extractPdf(file);
    extractedCaseText = result.extractedText;
    uploadedFileName = result.fileName || file.name;
    uploadStatusEl.textContent = "추출 완료. 문제 번호 입력 후 분석 시작.";
    uploadStatusEl.className = "upload-status upload-status-success";
    updateSourceDocuments();
  } catch (e) {
    uploadStatusEl.textContent = e.message;
    uploadStatusEl.className = "upload-status upload-status-error";
  } finally {
    pdfInput.value = "";
    updateAnalyzeButtonState();
  }
});

analyzeBtn.addEventListener("click", async () => {
  if (!extractedCaseText || !normalizeProblemNumber(problemNumberInput.value)) return;
  currentProblemNumber = normalizeProblemNumber(problemNumberInput.value);
  setAnalyzing(true);
  uploadStatusEl.textContent = `문제 ${currentProblemNumber}번 분석 중...`;
  try {
    analysisData = await analyzeCase(extractedCaseText, currentProblemNumber);
    loadEngagement();
    selectedProcedureIds = loadSelectionsFromStorage();
    initEvidenceStatuses();
    renderAllPhases(analysisData);
    updateSidebarNav();
    addAuditTrail("분석 완료", `문제 ${analysisData.problemNumber} — ${analysisData.problemTitle || ""}`);
    uploadStatusEl.textContent = `문제 ${analysisData.problemNumber}번 분석 완료. 감사계획 작업을 시작하세요.`;
    uploadStatusEl.className = "upload-status upload-status-success";
  } catch (e) {
    analysisData = null;
    overviewAiArea.innerHTML = `<p class="result-error">${esc(e.message)}</p>`;
    uploadStatusEl.textContent = e.message;
    uploadStatusEl.className = "upload-status upload-status-error";
    updateSidebarNav();
  } finally {
    setAnalyzing(false);
  }
});

problemNumberInput?.addEventListener("input", updateAnalyzeButtonState);

planningMemo?.addEventListener("input", () => {
  engagementState.planningMemo = planningMemo.value;
  saveEngagement();
});

gotoPlanningBtn?.addEventListener("click", () => showView("planning"));

sidebarNav.addEventListener("click", (e) => {
  const btn = e.target.closest(".sidebar-item");
  if (!btn || btn.disabled) return;
  showView(btn.dataset.view);
});

document.querySelectorAll(".nav-back-btn, .nav-forward-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (target) showView(target);
  });
});

document.querySelectorAll(".ai-layer").forEach((layer) => {
  const toggleBtn = layer.querySelector(".ai-toggle-btn");
  toggleBtn?.addEventListener("click", () => toggleAiLayer(layer));
});

document.addEventListener("change", (e) => {
  if (e.target.classList.contains("evidence-status-select")) {
    setEvidenceStatus(e.target.dataset.evidenceId, e.target.value);
    if (analysisData) {
      renderResponseAuditor(analysisData);
      renderPapersPhase(analysisData);
    }
  }
  if (e.target.classList.contains("procedure-checkbox")) {
    const id = e.target.dataset.procedureId;
    if (e.target.checked) selectedProcedureIds.add(id);
    else selectedProcedureIds.delete(id);
    saveSelections();
    renderProcedurePanel();
    if (analysisData) renderPapersPhase(analysisData);
  }
  if (e.target.classList.contains("risk-confirm-checkbox")) {
    const riskId = e.target.dataset.riskId;
    const risk = (analysisData?.riskAssessment?.risks || []).find((r) => r.riskId === riskId);
    const confirmed = e.target.checked;
    setRiskConfirmation(riskId, {
      confirmed,
      confirmedAt: confirmed ? new Date().toISOString() : null,
    });
    if (confirmed && risk) {
      addAuditTrail("위험 확정", risk.riskTitle);
    }
    if (analysisData) {
      renderRiskPhase(analysisData);
      renderPapersPhase(analysisData);
      updateStatusBar();
    }
  }
});

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("risk-memo-input")) {
    setRiskConfirmation(e.target.dataset.riskId, { memo: e.target.value });
  }
});

document.addEventListener("click", (e) => {
  const extBtn = e.target.closest(".external-confirm-btn");
  if (extBtn) openExternalModal(extBtn.dataset.target, extBtn.dataset.items, extBtn.dataset.purpose);
  if (e.target.closest("[data-modal-close]")) closeExternalModal();

  const applyBtn = e.target.closest(".apply-ai-btn");
  if (applyBtn) applyPlanningToMemo(applyBtn.dataset.apply);
});

copyExternalConfirmBtn?.addEventListener("click", async () => {
  const text = `[외부조회서]\n수신: ${document.getElementById("ecf-recipient").value}\n목적: ${document.getElementById("ecf-purpose").value}\n조회사항:\n${document.getElementById("ecf-items").value}`;
  try { await navigator.clipboard.writeText(text); } catch { window.prompt("복사", text); }
  addAuditTrail("외부조회서 복사", "");
});

saveSelectionBtn?.addEventListener("click", () => {
  if (!selectedProcedureIds.size) {
    selectionStatusEl.textContent = "대응절차를 하나 이상 선택해 주세요.";
    selectionStatusEl.className = "selection-status selection-status-error";
    return;
  }
  saveSelections();
  selectionStatusEl.textContent = `${selectedProcedureIds.size}개 절차 저장됨.`;
  selectionStatusEl.className = "selection-status selection-status-success";
});

updateAnalyzeButtonState();
updateSidebarNav();
updateSourceDocuments();
updateStatusBar();
