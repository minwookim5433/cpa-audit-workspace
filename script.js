const BASE_PROCEDURES = [
  { id: "variance", label: "증감분석", available: true },
  { id: "composition", label: "구성비분석", available: true },
  { id: "turnover", label: "회전율·평균회수기간", available: false, requiresAr: true, account: "매출채권" },
  { id: "aging", label: "연령분석 (Aging)", available: false, requiresAr: true, account: "매출채권", optionalData: true },
  { id: "relatedParty", label: "특수관계자 분석", available: false, requiresAr: true, account: "매출채권", requiresRelatedParty: true },
  { id: "watchlist", label: "주의 거래처 목록", available: false, requiresAr: true, account: "매출채권" },
  { id: "concentration", label: "거래처 집중도", available: false, requiresAr: true, account: "매출채권" },
  { id: "allowanceSim", label: "대손충당금 시뮬레이터", available: false, requiresAr: true, account: "매출채권" },
  { id: "allowance", label: "대손충당금 검토 안내", available: false, requiresAr: true, account: "매출채권" },
];

const screenHome = document.getElementById("screen-home");
const screenAnalytical = document.getElementById("screen-analytical");
const screenToolkit = document.getElementById("screen-toolkit");
const screenToolPlaceholder = document.getElementById("screen-tool-placeholder");
const backHomeBtn = document.getElementById("back-home-btn");
const backHomeFromToolkitBtn = document.getElementById("back-home-from-toolkit-btn");
const backHomeFromPlaceholderBtn = document.getElementById("back-home-from-placeholder-btn");
const toolkitScreenTitle = document.getElementById("toolkit-screen-title");
const toolkitScreenDesc = document.getElementById("toolkit-screen-desc");
const toolkitContent = document.getElementById("toolkit-content");
const casePdfInput = document.getElementById("case-pdf-input");
const casePdfBtn = document.getElementById("case-pdf-btn");
const casePdfNameEl = document.getElementById("case-pdf-name");
const caseTextInput = document.getElementById("case-text-input");
const caseImageInput = document.getElementById("case-image-input");
const caseImageBtn = document.getElementById("case-image-btn");
const caseImageNameEl = document.getElementById("case-image-name");
const caseImagePasteZone = document.getElementById("case-image-paste-zone");
const caseImagePreview = document.getElementById("case-image-preview");
const caseImagePreviewList = document.getElementById("case-image-preview-list");
const caseImageClearAllBtn = document.getElementById("case-image-clear-all-btn");
const caseInputPrimary = document.getElementById("case-input-primary");
const caseExamYearInput = document.getElementById("case-exam-year");
const caseProblemNumberInput = document.getElementById("case-problem-number");
const caseAnalyzeBtn = document.getElementById("case-analyze-btn");
const caseClearBtn = document.getElementById("case-clear-btn");
const caseStatusEl = document.getElementById("case-status");
const navigatorResultsArea = document.getElementById("navigator-results-area");
const allToolsArea = document.getElementById("all-tools-area");
const placeholderToolTitle = document.getElementById("placeholder-tool-title");
const placeholderToolDesc = document.getElementById("placeholder-tool-desc");
const placeholderToolDetail = document.getElementById("placeholder-tool-detail");
const placeholderToolCapabilities = document.getElementById("placeholder-tool-capabilities");
const placeholderOpenAnalyticalBtn = document.getElementById("placeholder-open-analytical-btn");
const dataFileInput = document.getElementById("data-file-input");
const dataUploadBtn = document.getElementById("data-upload-btn");
const dataFileNameEl = document.getElementById("data-file-name");
const accountSelect = document.getElementById("account-select");
const accountSelectHint = document.getElementById("account-select-hint");
const procedureAccountLabel = document.getElementById("procedure-account-label");
const procedureChecklist = document.getElementById("procedure-checklist");
const arCriteriaPanel = document.getElementById("ar-criteria-panel");
const arNormalDaysInput = document.getElementById("ar-normal-days");
const arCautionDaysInput = document.getElementById("ar-caution-days");
const arRelatedRatioInput = document.getElementById("ar-related-ratio");
const arRelatedDaysGapInput = document.getElementById("ar-related-days-gap");
const arWatchDaysInput = document.getElementById("ar-watch-days");
const arPerformanceMaterialityInput = document.getElementById("ar-performance-materiality");
const arWatchArRatioInput = document.getElementById("ar-watch-ar-ratio");
const arWatchOverdueDaysInput = document.getElementById("ar-watch-overdue-days");
const arWatchBalanceIncInput = document.getElementById("ar-watch-balance-inc");
const arWatchArToSalesInput = document.getElementById("ar-watch-ar-to-sales");
const arWatchMinScoreInput = document.getElementById("ar-watch-min-score");
const arWatchDisplayLimitSelect = document.getElementById("ar-watch-display-limit");
const arRateNormalInput = document.getElementById("ar-rate-normal");
const arRateWithin30Input = document.getElementById("ar-rate-within30");
const arRate31to60Input = document.getElementById("ar-rate-31to60");
const arRate61to90Input = document.getElementById("ar-rate-61to90");
const arRateOver90Input = document.getElementById("ar-rate-over90");
const selectionSummary = document.getElementById("selection-summary");
const runAnalysisBtn = document.getElementById("run-analysis-btn");
const analysisStatusEl = document.getElementById("analysis-status");
const previewArea = document.getElementById("preview-area");
const resultsArea = document.getElementById("results-area");
const graphSection = document.getElementById("graph-section");
const graphArea = document.getElementById("graph-area");
const chartTurnover = document.getElementById("chart-turnover");
const chartAging = document.getElementById("chart-aging");
const chartConcentration = document.getElementById("chart-concentration");
const addToReportActions = document.getElementById("add-to-report-actions");
const addToReportBtn = document.getElementById("add-to-report-btn");
const reportEntriesArea = document.getElementById("report-entries-area");
const reportCountBadge = document.getElementById("report-count-badge");
const finalReportBtn = document.getElementById("final-report-btn");
const finalReportModal = document.getElementById("final-report-modal");
const finalReportPreviewFrame = document.getElementById("final-report-preview-frame");
const finalReportModalStatus = document.getElementById("final-report-modal-status");
const finalReportCloseBtn = document.getElementById("final-report-close-btn");
const finalReportPdfBtn = document.getElementById("final-report-pdf-btn");
const finalReportDownloadBtn = document.getElementById("final-report-download-btn");
const toastEl = document.getElementById("toast");

const REPORT_STORAGE_KEY = "audit-workbench-report-entries";

let selectedDataFile = null;
let parsedDataset = null;
let selectedAccount = "";
let selectedProcedureIds = new Set();
let parseError = null;
let currentCalcResults = null;
let currentAnalysisMeta = null;
let companyRecordedAllowance = "";
let watchlistDisplayLimit = 5;
let reportEntries = [];
let lastFinalReportHtml = "";
let casePdfFile = null;
/** @type {{ id: string, file: File, previewUrl: string, label: string }[]} */
let caseImageItems = [];
let caseContext = null;

function createCaseImageId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeImageFile(file, index, labelPrefix) {
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const baseName =
    file instanceof File && file.name && !/^screenshot-\d+\./.test(file.name)
      ? file.name
      : `${labelPrefix || "screenshot"}-${index + 1}.${ext}`;
  return file instanceof File && file.name === baseName
    ? file
    : new File([file], baseName, { type: file.type || "image/png" });
}

function updateCaseImageNameLabel() {
  if (!caseImageNameEl) return;
  const count = caseImageItems.length;
  caseImageNameEl.textContent = count ? `이미지 ${count}장 (순서대로)` : "선택된 이미지 없음";
}

function renderCaseImagePreviews() {
  if (!caseImagePreviewList) return;

  caseImagePreviewList.innerHTML = caseImageItems
    .map(
      (item, index) => `<li class="case-image-preview-item" data-image-id="${item.id}">
      <span class="case-image-order" aria-label="순서 ${index + 1}">${index + 1}</span>
      <img src="${item.previewUrl}" alt="이미지 ${index + 1}" />
      <button type="button" class="secondary-btn case-image-item-remove" data-remove-id="${item.id}">제거</button>
    </li>`
    )
    .join("");

  if (caseImagePreview) caseImagePreview.hidden = caseImageItems.length === 0;
  caseImagePasteZone?.classList.toggle("has-image", caseImageItems.length > 0);
  updateCaseImageNameLabel();
}

function addCaseImageFiles(files, labelPrefix) {
  const imageFiles = [...(files || [])].filter((f) => f?.type?.startsWith("image/"));
  if (!imageFiles.length) return 0;

  const startIndex = caseImageItems.length;
  imageFiles.forEach((rawFile, offset) => {
    const file = normalizeImageFile(rawFile, startIndex + offset, labelPrefix);
    caseImageItems.push({
      id: createCaseImageId(),
      file,
      previewUrl: URL.createObjectURL(file),
      label: file.name,
    });
  });

  renderCaseImagePreviews();
  updateCaseAnalyzeButtonState();

  const added = imageFiles.length;
  const total = caseImageItems.length;
  showToast(
    added === 1
      ? `이미지 ${total}번째가 추가되었습니다.`
      : `이미지 ${added}장이 추가되었습니다. (총 ${total}장)`
  );
  return added;
}

function removeCaseImage(imageId) {
  const index = caseImageItems.findIndex((item) => item.id === imageId);
  if (index === -1) return;

  const [removed] = caseImageItems.splice(index, 1);
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  renderCaseImagePreviews();
  updateCaseAnalyzeButtonState();
}

function clearCaseImages() {
  caseImageItems.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  caseImageItems = [];
  if (caseImageInput) caseImageInput.value = "";
  renderCaseImagePreviews();
  updateCaseAnalyzeButtonState();
}

function extractImagesFromClipboard(clipboardData) {
  if (!clipboardData) return [];

  const fromItems = clipboardData.items
    ? [...clipboardData.items]
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean)
    : [];

  if (fromItems.length) return fromItems;

  return [...(clipboardData.files || [])].filter((f) => f.type.startsWith("image/"));
}

function handleCaseImagePaste(e) {
  const images = extractImagesFromClipboard(e.clipboardData);
  if (!images.length) return false;

  e.preventDefault();
  addCaseImageFiles(images, "screenshot");
  return true;
}

function bindCasePasteHandlers() {
  const pasteTargets = [caseTextInput, caseImagePasteZone, caseInputPrimary].filter(Boolean);
  pasteTargets.forEach((el) => {
    el.addEventListener("paste", (e) => handleCaseImagePaste(e));
  });

  caseImagePasteZone?.addEventListener("click", () => caseImagePasteZone.focus());
  caseImagePasteZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    caseImagePasteZone.classList.add("is-dragover");
  });
  caseImagePasteZone?.addEventListener("dragleave", () => {
    caseImagePasteZone.classList.remove("is-dragover");
  });
  caseImagePasteZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    caseImagePasteZone.classList.remove("is-dragover");
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) addCaseImageFiles(files, "image");
  });

  caseImagePreviewList?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-id]");
    if (!btn) return;
    removeCaseImage(btn.dataset.removeId);
  });
}

function updateCaseAnalyzeButtonState() {
  if (!caseAnalyzeBtn) return;
  const hasText = (caseTextInput?.value || "").trim().length >= 80;
  const hasImage = caseImageItems.length > 0;
  const hasPdf = !!casePdfFile;
  caseAnalyzeBtn.disabled = !(hasText || hasImage || hasPdf);
}

function showScreen(name) {
  const screens = {
    home: screenHome,
    analytical: screenAnalytical,
    toolkit: screenToolkit,
    "tool-placeholder": screenToolPlaceholder,
  };

  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    const active = key === name;
    el.hidden = !active;
    el.classList.toggle("is-active", active);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindExternalConfirmEvents() {
  document.getElementById("ext-confirm-refresh-btn")?.addEventListener("click", () => {
    const focus = document.getElementById("ext-confirm-focus")?.value || "";
    if (toolkitContent && window.ExternalConfirmToolkit) {
      toolkitContent.innerHTML = window.ExternalConfirmToolkit.renderPanel(caseContext?.navigator || caseContext?.analysis, { focusAccount: focus });
      bindExternalConfirmEvents();
    }
  });

  toolkitContent?.querySelectorAll(".ext-download-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.template;
      window.ExternalConfirmToolkit?.downloadTemplate(key, `외부조회서_${key}.txt`);
      showToast("조회서 양식을 다운로드했습니다.");
    });
  });
}

function openToolkitScreen(tool) {
  if (toolkitScreenTitle) toolkitScreenTitle.textContent = tool.title;
  if (toolkitScreenDesc) toolkitScreenDesc.textContent = tool.shortDesc;
  if (!toolkitContent) return;

  if (tool.id === "external-confirm" && window.ExternalConfirmToolkit) {
    toolkitContent.innerHTML = window.ExternalConfirmToolkit.renderPanel(caseContext?.navigator || caseContext?.analysis, {});
    bindExternalConfirmEvents();
    showScreen("toolkit");
    return;
  }

  if (tool.status === "beta" && window.ToolkitModules?.render(tool.id, caseContext, toolkitContent)) {
    showScreen("toolkit");
    return;
  }

  showToast("해당 Toolkit을 열 수 없습니다.");
}

function openTool(toolId) {
  const tool = window.AuditToolkit?.getToolById(toolId);
  if (!tool) return;

  if (tool.status === "available" && toolId === "analytical") {
    resetAnalyticalForm();
    showScreen("analytical");
    return;
  }

  if (tool.status === "available" || tool.status === "beta") {
    openToolkitScreen(tool);
    return;
  }

  if (tool.status === "planned") {
    if (placeholderToolTitle) placeholderToolTitle.textContent = tool.title;
    if (placeholderToolDesc) placeholderToolDesc.textContent = tool.shortDesc;
    if (placeholderToolDetail) placeholderToolDetail.textContent = tool.detailDesc;
    if (placeholderToolCapabilities) {
      placeholderToolCapabilities.innerHTML = (tool.capabilities || [])
        .map((c) => `<li>${escapeHtml(c)}</li>`)
        .join("");
    }
    showScreen("tool-placeholder");
    return;
  }

  showToast("해당 도구를 열 수 없습니다.");
}

window.openToolkit = openTool;

function renderNavigatorResults() {
  if (!navigatorResultsArea || !window.CaseNavigator) return;

  const ctx = caseContext;
  if (!ctx?.navigator) {
    navigatorResultsArea.hidden = true;
    navigatorResultsArea.innerHTML = "";
    return;
  }

  navigatorResultsArea.hidden = false;
  navigatorResultsArea.innerHTML = window.CaseNavigator.renderNavigatorPanel(ctx.navigator);
}

function renderToolboxHome() {
  if (!window.AuditToolkit || !window.CaseWorkbench || !allToolsArea) return;
  allToolsArea.innerHTML = window.CaseWorkbench.renderAllTools(window.AuditToolkit.AUDIT_TOOLKIT, []);
}

function restoreCaseFromStorage() {
  if (!window.CaseNavigator) return;
  const saved = window.CaseNavigator.loadContext();
  if (!saved?.navigator) return;

  caseContext = saved;
  if (caseTextInput && saved.extractedText) caseTextInput.value = saved.extractedText;
  if (casePdfNameEl) casePdfNameEl.textContent = saved.fileName || "저장된 분석";
  if (caseExamYearInput && saved.year) caseExamYearInput.value = saved.year;
  if (caseProblemNumberInput && saved.problemNumber) caseProblemNumberInput.value = saved.problemNumber;
  if (caseClearBtn) caseClearBtn.hidden = false;
  if (caseStatusEl) {
    const n = saved.navigator;
    const qCount = n.step3_questions?.length || n.questions?.length || 0;
    caseStatusEl.textContent = `${n.year || saved.year || ""} 문제 ${n.problemNumber || saved.problemNumber || ""} — 물음 ${qCount}개 (저장됨)`;
    caseStatusEl.className = "case-status case-status-success";
  }
  updateCaseAnalyzeButtonState();
  renderNavigatorResults();
  renderToolboxHome();
}

async function handleCasePdfSelected(file) {
  casePdfFile = file || null;
  if (casePdfNameEl) casePdfNameEl.textContent = file ? file.name : "선택된 파일 없음";
  updateCaseAnalyzeButtonState();
}

async function handleCaseImageSelected(fileList) {
  const files = fileList ? [...fileList] : [];
  if (!files.length) return;
  addCaseImageFiles(files, "image");
}

async function extractCaseImagesText() {
  const files = caseImageItems.map((item) => item.file);
  const onProgress = (current, total) => {
    if (caseStatusEl) {
      caseStatusEl.textContent = `이미지 ${current}/${total} 텍스트 추출 중…`;
      caseStatusEl.className = "case-status case-status-loading";
    }
  };
  return window.CaseWorkbench.extractImages(files, onProgress);
}

async function resolveCaseTextForAnalysis() {
  const pasted = (caseTextInput?.value || "").trim();
  const hasImage = caseImageItems.length > 0;

  if (hasImage && pasted.length < 80) {
    const extracted = await extractCaseImagesText();
    if (caseTextInput) caseTextInput.value = extracted.extractedText;
    return {
      text: extracted.extractedText,
      inputSource: "image",
      fileName: `이미지 ${caseImageItems.length}장`,
    };
  }

  if (pasted.length >= 80) {
    return { text: pasted, inputSource: "paste", fileName: "붙여넣기" };
  }

  if (hasImage) {
    const extracted = await extractCaseImagesText();
    if (caseTextInput) caseTextInput.value = extracted.extractedText;
    return {
      text: extracted.extractedText,
      inputSource: "image",
      fileName: `이미지 ${caseImageItems.length}장`,
    };
  }

  if (casePdfFile) {
    if (caseStatusEl) {
      caseStatusEl.textContent = "PDF 텍스트 추출 중…";
      caseStatusEl.className = "case-status case-status-loading";
    }
    const extracted = await window.CaseWorkbench.extractPdf(casePdfFile);
    if (caseTextInput) caseTextInput.value = extracted.extractedText;
    return {
      text: extracted.extractedText,
      inputSource: "pdf",
      fileName: casePdfFile.name,
      sliceProblem: true,
    };
  }

  return null;
}

async function runCaseAnalysis() {
  if (!window.CaseWorkbench || !window.CaseNavigator) return;

  const year = String(caseExamYearInput?.value || "").trim();
  const problemNumber = String(caseProblemNumberInput?.value || "").trim();
  if (caseAnalyzeBtn) caseAnalyzeBtn.disabled = true;
  if (caseStatusEl) {
    caseStatusEl.textContent = "입력 준비 중…";
    caseStatusEl.className = "case-status case-status-loading";
  }

  try {
    const resolved = await resolveCaseTextForAnalysis();
    if (!resolved?.text) {
      throw new Error("분석할 텍스트·이미지·PDF가 없습니다.");
    }

    if (caseStatusEl) {
      caseStatusEl.textContent = "문제 읽기 과정 분석 중… (STEP 1→2→3)";
      caseStatusEl.className = "case-status case-status-loading";
    }

    const navigator = await window.CaseWorkbench.analyzeNavigator(resolved.text, {
      problemNumber: resolved.sliceProblem ? problemNumber : problemNumber || "",
      year,
      inputSource: resolved.inputSource,
      sliceProblem: resolved.sliceProblem,
    });

    caseContext = {
      fileName: resolved.fileName,
      year,
      problemNumber,
      extractedText: resolved.text,
      navigator,
      analyzedAt: new Date().toISOString(),
    };
    window.CaseNavigator.saveContext(caseContext);

    renderNavigatorResults();

    const qCount = navigator.step3_questions?.length || 0;
    const factCount = navigator.step1_keyFacts?.length || 0;
    if (caseStatusEl) {
      caseStatusEl.textContent = `분석 완료 — 핵심정보 ${factCount}개 · 물음 ${qCount}개`;
      caseStatusEl.className = "case-status case-status-success";
    }
    if (caseClearBtn) caseClearBtn.hidden = false;
    showToast("분석이 완료되었습니다.");
  } catch (err) {
    if (err.payload?.extractionStatus && navigatorResultsArea) {
      navigatorResultsArea.hidden = false;
      navigatorResultsArea.innerHTML = window.CaseNavigator.renderExtractionError(err.payload);
      if (err.payload.navigator) {
        caseContext = {
          fileName: caseImageItems.length ? `이미지 ${caseImageItems.length}장` : casePdfFile?.name || "분석",
          year,
          problemNumber,
          navigator: err.payload.navigator,
          extractionIncomplete: true,
        };
      }
    }
    if (caseStatusEl) {
      caseStatusEl.textContent = err.message || "분석에 실패했습니다.";
      caseStatusEl.className = "case-status case-status-error";
    }
    showToast(err.message || "분석 실패");
  } finally {
    updateCaseAnalyzeButtonState();
  }
}

function clearCaseWorkspace() {
  casePdfFile = null;
  caseContext = null;
  window.CaseNavigator?.clearContext();
  clearCaseImages();
  if (casePdfInput) casePdfInput.value = "";
  if (caseTextInput) caseTextInput.value = "";
  if (casePdfNameEl) casePdfNameEl.textContent = "선택된 파일 없음";
  if (navigatorResultsArea) {
    navigatorResultsArea.hidden = true;
    navigatorResultsArea.innerHTML = "";
  }
  if (caseStatusEl) {
    caseStatusEl.textContent = "";
    caseStatusEl.className = "case-status";
  }
  if (caseClearBtn) caseClearBtn.hidden = true;
  updateCaseAnalyzeButtonState();
  renderToolboxHome();
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2800);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSavedAt(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function createEntryId() {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isArReportEntry(entry) {
  return String(entry?.account ?? "").trim() === "매출채권";
}

function normalizeReportEntry(entry) {
  return {
    reportDraft: "",
    reportDraftGeneratedAt: null,
    reportDraftError: null,
    expanded: false,
    memo: "",
    ...entry,
    account: String(entry.account ?? "").trim(),
    reportDraft: entry.reportDraft ?? "",
    reportDraftError: entry.reportDraftError ?? null,
    memo: entry.memo ?? "",
  };
}

function loadReportEntries() {
  try {
    const raw = localStorage.getItem(REPORT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    reportEntries = Array.isArray(parsed) ? parsed.map(normalizeReportEntry) : [];
  } catch {
    reportEntries = [];
  }
}

function persistReportEntries() {
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reportEntries));
}

function getProcedureLabel(id) {
  return BASE_PROCEDURES.find((p) => p.id === id)?.label || id;
}

function serializeCalcSnapshot(calcResults, meta) {
  const { account, accountData, items, chartData } = calcResults;
  const priorLabel = accountData.format === "ar" ? "전기기말잔액 합계" : "전기금액";
  const currentLabel = accountData.format === "ar" ? "당기기말잔액 합계" : "당기금액";

  return {
    account,
    procedureIds: [...meta.procedureIds],
    procedureLabels: [...meta.procedureLabels],
    fileName: meta.fileName,
    criteria: calcResults.criteria ? { ...calcResults.criteria } : null,
    sourceData: {
      priorAmount: accountData.priorAmount,
      currentAmount: accountData.currentAmount,
      format: accountData.format,
      priorLabel,
      currentLabel,
    },
    items: JSON.parse(JSON.stringify(items)),
    chartData: chartData ? JSON.parse(JSON.stringify(chartData)) : null,
    resultsHtml: buildCalculationResultsHtml(calcResults, { includeFooter: true }),
  };
}

function addCurrentAnalysisToReport() {
  if (!currentCalcResults || !currentAnalysisMeta) {
    showToast("먼저 분석을 실행하세요.");
    return;
  }

  const entry = {
    id: createEntryId(),
    savedAt: new Date().toISOString(),
    memo: "",
    reportDraft: "",
    reportDraftGeneratedAt: null,
    expanded: true,
    ...serializeCalcSnapshot(currentCalcResults, currentAnalysisMeta),
  };

  reportEntries.push(entry);
  persistReportEntries();
  renderReportEntries();
  showToast(`${entry.account} 분석이 보고서에 추가되었습니다.`);
}

function deleteReportEntry(id) {
  reportEntries = reportEntries.filter((e) => e.id !== id);
  persistReportEntries();
  renderReportEntries();
  showToast("보고서 항목이 삭제되었습니다.");
}

function updateReportEntryMemo(id, memo) {
  const entry = reportEntries.find((e) => e.id === id);
  if (!entry) return;
  entry.memo = memo;
  persistReportEntries();
}

function updateReportEntryDraft(id, draft) {
  const entry = reportEntries.find((e) => e.id === id);
  if (!entry) return;
  entry.reportDraft = draft;
  persistReportEntries();
}

const generatingDraftIds = new Set();

function buildReportFactsFromEntry(entry) {
  const findItem = (type) => entry.items?.find((i) => i.type === type) || null;
  const variance = findItem("variance");
  const composition = findItem("composition");
  const turnover = findItem("turnover");
  const aging = findItem("aging");
  const concentration = findItem("concentration");
  const relatedParty = findItem("relatedParty");
  const watchlist = findItem("watchlist");
  const allowanceSim = findItem("allowanceSim");
  const allowance = findItem("allowance");
  const performed = new Set(entry.procedureIds || []);
  const unavailable = ["variance", "composition", "turnover", "aging", "concentration", "relatedParty", "watchlist", "allowanceSim", "allowance"]
    .filter((id) => !performed.has(id))
    .map(getProcedureLabel);

  return {
    account: entry.account,
    fileName: entry.fileName,
    savedAt: entry.savedAt,
    auditorMemo: entry.memo || "",
    procedures: entry.procedureLabels || [],
    unavailableProcedures: unavailable,
    criteria: entry.criteria || null,
    balances: {
      priorLabel: entry.sourceData?.priorLabel || "전기기말잔액",
      currentLabel: entry.sourceData?.currentLabel || "당기기말잔액",
      priorAmount: entry.sourceData?.priorAmount ?? null,
      currentAmount: entry.sourceData?.currentAmount ?? null,
    },
    variance: variance
      ? {
          priorAmount: variance.priorAmount,
          currentAmount: variance.currentAmount,
          changeAmount: variance.changeAmount,
          changeRatePercent: variance.changeRate,
          calculated: Boolean(variance.ok),
          error: variance.error || null,
        }
      : null,
    composition: composition
      ? {
          currentAmount: composition.currentAmount,
          totalCurrentAmount: composition.totalCurrentAmount,
          compositionRatioPercent: composition.compositionRatio,
          calculated: Boolean(composition.ok),
        }
      : null,
    turnover: turnover?.ok
      ? {
          priorAvgAR: turnover.priorAvgAR,
          currentAvgAR: turnover.currentAvgAR,
          priorSales: turnover.priorSales,
          currentSales: turnover.currentSales,
          priorTurnover: turnover.priorTurnover,
          currentTurnover: turnover.currentTurnover,
          priorCollectionDays: turnover.priorCollectionDays,
          currentCollectionDays: turnover.currentCollectionDays,
          turnoverChange: turnover.turnoverChange,
          daysChange: turnover.daysChange,
          turnoverChangeAnalysis: turnover.turnoverChangeAnalysis || null,
          daysChangeAnalysis: turnover.daysChangeAnalysis || null,
          priorDaysClass: turnover.priorDaysClass || null,
          currentDaysClass: turnover.currentDaysClass || null,
          daysSummaryLine: turnover.daysSummaryLine || null,
          turnoverSummaryLine: turnover.turnoverSummaryLine || null,
          criteria: turnover.criteria || entry.criteria || null,
        }
      : null,
    aging: aging?.ok
      ? {
          totalAR: aging.totalAR,
          buckets: (aging.buckets || []).map((b) => ({
            label: b.label,
            amount: b.amount,
            ratioPercent: b.ratio,
          })),
          over90Amount: aging.over90Amount,
          over90RatioPercent: aging.over90Ratio,
          unclassifiedAmount: aging.unclassifiedAmount,
        }
      : null,
    concentration: concentration?.ok
      ? {
          totalAR: concentration.totalAR,
          customerCount: concentration.customerCount,
          top1RatioPercent: concentration.top1Ratio,
          top3RatioPercent: concentration.top3Ratio,
          top5RatioPercent: concentration.top5Ratio,
          relatedAmount: concentration.relatedAmount,
          relatedRatioPercent: concentration.relatedRatio,
          top5Customers: (concentration.ranked || []).slice(0, 5).map((r) => ({
            rank: r.rank,
            customer: r.customer,
            amount: r.amount,
            ratioPercent: r.ratio,
            relatedParty: r.relatedParty,
          })),
        }
      : null,
    relatedParty: relatedParty?.ok
      ? {
          totalAR: relatedParty.totalAR,
          related: relatedParty.related,
          nonRelated: relatedParty.nonRelated,
          diff: relatedParty.diff,
          warnings: relatedParty.warnings || [],
        }
      : null,
    allowance: allowance?.ok
      ? {
          hasGuidance: allowance.hasGuidance,
          notes: allowance.notes || [],
        }
      : null,
    watchlist: watchlist?.ok
      ? {
          watchlistCount: watchlist.watchlistCount,
          customers: watchlist.customers || [],
        }
      : null,
    allowanceSim: allowanceSim?.ok
      ? {
          totalEstimatedAllowance: allowanceSim.totalEstimatedAllowance,
          companyRecordedAllowance: allowanceSim.companyRecordedAllowance,
          difference: allowanceSim.difference,
          allowanceRatioPercent: allowanceSim.allowanceRatioPercent,
        }
      : null,
  };
}

async function generateReportDraft(id) {
  const entry = reportEntries.find((e) => e.id === id);
  if (!entry) return;
  if (!isArReportEntry(entry)) {
    showToast("매출채권 분석만 보고서 초안을 생성할 수 있습니다.");
    return;
  }

  entry.expanded = true;
  entry.reportDraftError = null;
  generatingDraftIds.add(id);
  renderReportEntries();

  try {
    const facts = buildReportFactsFromEntry(entry);
    const res = await fetch("/api/analytical-report-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "보고서 초안 생성에 실패했습니다.");

    entry.reportDraft = data.draft;
    entry.reportDraftGeneratedAt = new Date().toISOString();
    entry.reportDraftError = null;
    persistReportEntries();
    showToast("AI 보고서 초안이 생성되었습니다.");
  } catch (err) {
    entry.reportDraftError = err.message;
    persistReportEntries();
    showToast(err.message);
  } finally {
    generatingDraftIds.delete(id);
    renderReportEntries();
  }
}

function moveReportEntry(id, direction) {
  const index = reportEntries.findIndex((e) => e.id === id);
  if (index < 0) return;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= reportEntries.length) return;
  [reportEntries[index], reportEntries[target]] = [reportEntries[target], reportEntries[index]];
  persistReportEntries();
  renderReportEntries();
}

function toggleReportEntry(id) {
  const entry = reportEntries.find((e) => e.id === id);
  if (!entry) return;
  entry.expanded = !entry.expanded;
  persistReportEntries();
  renderReportEntries();
}

function renderReportEntryCharts(entry, container) {
  if (!entry.chartData || !container) return;

  container.innerHTML = "";

  if (entry.chartData.turnover) {
    const wrap = document.createElement("div");
    wrap.className = "report-entry-chart-wrap";
    const canvas = document.createElement("canvas");
    canvas.className = "analysis-chart";
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    renderTurnoverChart(entry.chartData.turnover, canvas, wrap);
  }

  if (entry.chartData.aging) {
    const wrap = document.createElement("div");
    wrap.className = "report-entry-chart-wrap";
    const canvas = document.createElement("canvas");
    canvas.className = "analysis-chart";
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    renderAgingChart(entry.chartData.aging, canvas, wrap);
  }

  if (entry.chartData.concentration) {
    const wrap = document.createElement("div");
    wrap.className = "report-entry-chart-wrap";
    const canvas = document.createElement("canvas");
    canvas.className = "analysis-chart";
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    renderConcentrationChart(entry.chartData.concentration, canvas, wrap);
  }
}

function renderReportDraftGenerateButton(entry) {
  if (!isArReportEntry(entry)) return "";

  const isGenerating = generatingDraftIds.has(entry.id);
  return `<button type="button" class="report-entry-action-btn report-draft-generate-btn" data-action="generate-draft" data-id="${escapeHtml(entry.id)}" ${isGenerating ? "disabled" : ""} title="AI 보고서 초안 생성">
    ${isGenerating ? "생성 중..." : "AI 보고서 초안 생성"}
  </button>`;
}

function renderReportDraftSection(entry) {
  if (!isArReportEntry(entry)) return "";

  const isGenerating = generatingDraftIds.has(entry.id);
  const generatedNote = entry.reportDraftGeneratedAt
    ? `<p class="report-draft-meta">초안 생성: ${formatSavedAt(entry.reportDraftGeneratedAt)} · 수치는 JavaScript 계산 결과만 사용</p>`
    : `<p class="report-draft-meta">AI는 제공된 계산 결과만 사용하며, 감사판단을 대체하지 않습니다.</p>`;

  const errorNote = entry.reportDraftError
    ? `<p class="report-draft-error">${escapeHtml(entry.reportDraftError)}</p>`
    : "";

  const loadingNote = isGenerating
    ? `<p class="report-draft-loading">보고서 초안을 생성하는 중입니다...</p>`
    : "";

  return `
    <div class="report-draft-section">
      <h5 class="report-draft-title">분석적 절차 보고서 초안</h5>
      ${generatedNote}
      ${loadingNote}
      ${errorNote}
      <label class="report-entry-memo">
        <span class="report-entry-memo-label">보고서 초안 (직접 수정 가능)</span>
        <textarea class="report-draft-input" data-action="draft" data-id="${escapeHtml(entry.id)}" placeholder="AI 보고서 초안 생성 후 여기에 표시됩니다. 감사인이 직접 수정할 수 있습니다." rows="14" ${isGenerating ? "disabled" : ""}>${escapeHtml(entry.reportDraft || "")}</textarea>
      </label>
    </div>`;
}

function renderReportEntries() {
  if (!reportEntriesArea) return;

  if (reportCountBadge) {
    reportCountBadge.textContent = `${reportEntries.length}건`;
  }
  if (finalReportBtn) {
    finalReportBtn.hidden = reportEntries.length === 0;
  }

  if (!reportEntries.length) {
    reportEntriesArea.innerHTML = '<p class="output-placeholder">분석 결과를 검토한 뒤 「이 분석을 보고서에 추가」로 누적할 수 있습니다.</p>';
    return;
  }

  reportEntriesArea.innerHTML = reportEntries.map((entry, index) => `
    <article class="report-entry-card ${entry.expanded ? "is-expanded" : ""}" data-entry-id="${escapeHtml(entry.id)}">
      <div class="report-entry-header">
        <button type="button" class="report-entry-toggle" data-action="toggle" data-id="${escapeHtml(entry.id)}" aria-expanded="${entry.expanded}">
          <span>${escapeHtml(entry.account)}</span>
          <span class="report-entry-meta">${escapeHtml(entry.procedureLabels.join(", "))} · ${formatSavedAt(entry.savedAt)}</span>
        </button>
        <div class="report-entry-actions">
          ${renderReportDraftGenerateButton(entry)}
          <button type="button" class="report-entry-action-btn" data-action="up" data-id="${escapeHtml(entry.id)}" ${index === 0 ? "disabled" : ""} title="위로">↑</button>
          <button type="button" class="report-entry-action-btn" data-action="down" data-id="${escapeHtml(entry.id)}" ${index === reportEntries.length - 1 ? "disabled" : ""} title="아래로">↓</button>
          <button type="button" class="report-entry-action-btn is-danger" data-action="delete" data-id="${escapeHtml(entry.id)}" title="삭제">삭제</button>
        </div>
      </div>
      <div class="report-entry-body">
        <div class="report-entry-procedures">
          ${entry.procedureLabels.map((label) => `<span class="report-procedure-tag">${escapeHtml(label)}</span>`).join("")}
        </div>
        <label class="report-entry-memo">
          <span class="report-entry-memo-label">감사인 메모</span>
          <textarea class="report-entry-memo-input" data-action="memo" data-id="${escapeHtml(entry.id)}" placeholder="추가 검토 사항, 후속 절차 메모 등">${escapeHtml(entry.memo)}</textarea>
        </label>
        <div class="report-entry-results">${entry.resultsHtml}</div>
        <div class="report-entry-charts" data-charts-for="${escapeHtml(entry.id)}"></div>
        ${renderReportDraftSection(entry)}
      </div>
    </article>
  `).join("");

  for (const entry of reportEntries) {
    if (!entry.expanded) continue;
    const chartHost = reportEntriesArea.querySelector(`[data-charts-for="${entry.id}"]`);
    renderReportEntryCharts(entry, chartHost);
  }
}

function updateAddToReportButton() {
  const ready = Boolean(currentCalcResults && currentAnalysisMeta);
  if (addToReportActions) addToReportActions.hidden = !ready;
}

async function captureEntryChartImages(entry) {
  if (!entry.chartData) return [];

  const host = document.createElement("div");
  host.className = "report-chart-capture-host";
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:640px;visibility:hidden;";
  document.body.appendChild(host);

  const images = [];

  try {
    if (entry.chartData.turnover) {
      const wrap = document.createElement("div");
      wrap.style.width = "600px";
      const canvas = document.createElement("canvas");
      wrap.appendChild(canvas);
      host.appendChild(wrap);
      renderTurnoverChart(entry.chartData.turnover, canvas, wrap);
      images.push({ title: "매출채권 회전율·평균회수기간", dataUrl: canvas.toDataURL("image/png") });
    }
    if (entry.chartData.aging) {
      const wrap = document.createElement("div");
      wrap.style.width = "600px";
      const canvas = document.createElement("canvas");
      wrap.appendChild(canvas);
      host.appendChild(wrap);
      renderAgingChart(entry.chartData.aging, canvas, wrap);
      images.push({ title: "만기구간별 연령분석", dataUrl: canvas.toDataURL("image/png") });
    }
    if (entry.chartData.concentration) {
      const wrap = document.createElement("div");
      wrap.style.width = "600px";
      const canvas = document.createElement("canvas");
      wrap.appendChild(canvas);
      host.appendChild(wrap);
      renderConcentrationChart(entry.chartData.concentration, canvas, wrap);
      images.push({ title: "거래처 집중도", dataUrl: canvas.toDataURL("image/png") });
    }
  } finally {
    document.body.removeChild(host);
  }

  return images;
}

function syncReportEntriesFromDom() {
  for (const entry of reportEntries) {
    const memoEl = reportEntriesArea?.querySelector(`textarea[data-action="memo"][data-id="${entry.id}"]`);
    const draftEl = reportEntriesArea?.querySelector(`textarea[data-action="draft"][data-id="${entry.id}"]`);
    if (memoEl) entry.memo = memoEl.value;
    if (draftEl) entry.reportDraft = draftEl.value;
  }
  persistReportEntries();
}

function showFinalReportPreview(html) {
  lastFinalReportHtml = html;
  if (finalReportPreviewFrame) {
    finalReportPreviewFrame.srcdoc = html;
  }
  if (finalReportModal) finalReportModal.hidden = false;
  if (finalReportModalStatus) {
    finalReportModalStatus.textContent = `보고서에 추가된 분석 ${reportEntries.length}건이 포함되었습니다.`;
    finalReportModalStatus.className = "final-report-modal-status";
  }
}

function closeFinalReportModal() {
  if (finalReportModal) finalReportModal.hidden = true;
}

async function openFinalReportPreview() {
  if (!reportEntries.length) {
    showToast("보고서에 추가된 분석이 없습니다.");
    return;
  }
  if (!window.FinalReport) {
    showToast("보고서 생성 모듈을 불러오지 못했습니다.");
    return;
  }

  syncReportEntriesFromDom();

  if (finalReportBtn) finalReportBtn.disabled = true;
  if (finalReportModalStatus) {
    finalReportModalStatus.textContent = "보고서를 생성하는 중입니다...";
    finalReportModalStatus.className = "final-report-modal-status is-loading";
  }
  if (finalReportModal) finalReportModal.hidden = false;

  try {
    const chartImagesByEntryId = {};
    for (const entry of reportEntries) {
      chartImagesByEntryId[entry.id] = await captureEntryChartImages(entry);
    }

    const html = window.FinalReport.buildDocument(
      reportEntries,
      chartImagesByEntryId,
      new Date().toISOString()
    );
    showFinalReportPreview(html);
    showToast("최종 보고서 미리보기가 준비되었습니다.");
  } catch (err) {
    closeFinalReportModal();
    showToast(err.message || "보고서 생성에 실패했습니다.");
  } finally {
    if (finalReportBtn) finalReportBtn.disabled = false;
  }
}

function formatPdfFilenameStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function saveFinalReportPdf() {
  if (!lastFinalReportHtml) {
    showToast("먼저 최종 보고서를 생성하세요.");
    return;
  }
  if (typeof html2pdf === "undefined") {
    showToast("PDF 라이브러리를 불러오지 못했습니다.");
    return;
  }

  if (finalReportPdfBtn) finalReportPdfBtn.disabled = true;
  if (finalReportModalStatus) {
    finalReportModalStatus.textContent = "PDF를 생성하는 중입니다...";
    finalReportModalStatus.className = "final-report-modal-status is-loading";
  }

  const renderFrame = document.createElement("iframe");
  renderFrame.setAttribute("aria-hidden", "true");
  renderFrame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;min-height:297mm;border:0;visibility:hidden;";
  document.body.appendChild(renderFrame);

  try {
    await new Promise((resolve, reject) => {
      renderFrame.onload = () => resolve();
      renderFrame.onerror = () => reject(new Error("보고서 렌더링에 실패했습니다."));
      renderFrame.srcdoc = lastFinalReportHtml;
    });
    await new Promise((r) => setTimeout(r, 600));

    const element = renderFrame.contentDocument?.body;
    if (!element) throw new Error("보고서 본문을 불러오지 못했습니다.");

    const filename = `Audit_Report_${formatPdfFilenameStamp()}.pdf`;
    const pdfOptions = {
      margin: [18, 15, 20, 15],
      filename,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: element.scrollWidth,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: [".fr-exec-card", ".fr-chart"] },
    };

    const worker = html2pdf().set(pdfOptions).from(element);
    const pdf = await worker.toPdf().get("pdf");
    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i += 1) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.text(`${i} / ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: "center" });
    }
    pdf.save(filename);

    if (finalReportModalStatus) {
      finalReportModalStatus.textContent = `PDF 저장 완료 — ${filename}`;
      finalReportModalStatus.className = "final-report-modal-status";
    }
    showToast(`${filename} 저장이 완료되었습니다.`);
  } catch (err) {
    if (finalReportModalStatus) {
      finalReportModalStatus.textContent = err.message || "PDF 생성에 실패했습니다.";
      finalReportModalStatus.className = "final-report-modal-status";
    }
    showToast(err.message || "PDF 생성에 실패했습니다.");
  } finally {
    renderFrame.remove();
    if (finalReportPdfBtn) finalReportPdfBtn.disabled = false;
  }
}

function downloadFinalReportHtml() {
  if (!lastFinalReportHtml) {
    showToast("먼저 최종 보고서를 생성하세요.");
    return;
  }

  const stamp = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date()).replace(/[^\d]/g, "");
  const blob = new Blob(["\uFEFF", lastFinalReportHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `분석적절차보고서_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("HTML 파일을 다운로드했습니다.");
}

const { formatNumber, formatPercent, formatRatio, formatDays, formatCompactAmount } = window.AnalyticalCalc || {};

function isArAccountSelected() {
  return Boolean(parsedDataset?.hasArDetail && selectedAccount === "매출채권");
}

function populateArCriteriaForm() {
  if (!window.ArAnalysis) return;
  const c = window.ArAnalysis.loadArCriteria();
  const rates = window.ArAnalysis.loadAllowanceRates();
  if (arNormalDaysInput) arNormalDaysInput.value = c.normalDays;
  if (arCautionDaysInput) arCautionDaysInput.value = c.cautionDays;
  if (arRelatedRatioInput) arRelatedRatioInput.value = c.relatedPartyRatioThreshold;
  if (arRelatedDaysGapInput) arRelatedDaysGapInput.value = c.relatedDaysGap;
  if (arWatchDaysInput) arWatchDaysInput.value = c.watchlistCollectionDays;
  if (arPerformanceMaterialityInput) arPerformanceMaterialityInput.value = c.performanceMaterialityAmount;
  if (arWatchArRatioInput) arWatchArRatioInput.value = c.customerMaterialityRatioPercent;
  if (arWatchOverdueDaysInput) arWatchOverdueDaysInput.value = c.watchlistOverdueDays;
  if (arWatchBalanceIncInput) arWatchBalanceIncInput.value = c.watchlistBalanceIncreasePercent;
  if (arWatchArToSalesInput) arWatchArToSalesInput.value = c.watchlistArToSalesRatioPercent;
  if (arWatchMinScoreInput) arWatchMinScoreInput.value = c.watchlistMinScore;
  watchlistDisplayLimit = c.watchlistDisplayLimit === Infinity ? "all" : c.watchlistDisplayLimit;
  if (arWatchDisplayLimitSelect) {
    arWatchDisplayLimitSelect.value = watchlistDisplayLimit === "all" ? "all" : String(watchlistDisplayLimit);
  }
  if (arRateNormalInput) arRateNormalInput.value = rates.normal;
  if (arRateWithin30Input) arRateWithin30Input.value = rates.within30;
  if (arRate31to60Input) arRate31to60Input.value = rates["31to60"];
  if (arRate61to90Input) arRate61to90Input.value = rates["61to90"];
  if (arRateOver90Input) arRateOver90Input.value = rates.over90;
}

function readArCriteriaFromForm() {
  if (!window.ArAnalysis) return null;
  const criteria = window.ArAnalysis.parseCriteriaInput({
    normalDays: arNormalDaysInput?.value,
    cautionDays: arCautionDaysInput?.value,
    relatedPartyRatioThreshold: arRelatedRatioInput?.value,
    relatedDaysGap: arRelatedDaysGapInput?.value,
    watchlistCollectionDays: arWatchDaysInput?.value,
    performanceMaterialityAmount: arPerformanceMaterialityInput?.value,
    customerMaterialityRatioPercent: arWatchArRatioInput?.value,
    watchlistOverdueDays: arWatchOverdueDaysInput?.value,
    watchlistBalanceIncreasePercent: arWatchBalanceIncInput?.value,
    watchlistArToSalesRatioPercent: arWatchArToSalesInput?.value,
    watchlistMinScore: arWatchMinScoreInput?.value,
    watchlistDisplayLimit: arWatchDisplayLimitSelect?.value ?? (watchlistDisplayLimit === "all" ? "all" : watchlistDisplayLimit),
  });
  watchlistDisplayLimit =
    criteria.watchlistDisplayLimit === Infinity ? "all" : criteria.watchlistDisplayLimit;
  const allowanceRates = window.ArAnalysis.parseAllowanceRatesInput({
    normal: arRateNormalInput?.value,
    within30: arRateWithin30Input?.value,
    "31to60": arRate31to60Input?.value,
    "61to90": arRate61to90Input?.value,
    over90: arRateOver90Input?.value,
  });
  window.ArAnalysis.saveArCriteria(criteria);
  window.ArAnalysis.saveAllowanceRates(allowanceRates);
  return {
    ...criteria,
    allowanceRates,
    companyRecordedAllowance: companyRecordedAllowance !== "" ? companyRecordedAllowance : null,
  };
}

function refreshWatchlistDisplayInResults() {
  if (!currentCalcResults) return;
  const item = currentCalcResults.items.find((i) => i.type === "watchlist");
  if (!item?.eligibleCustomers) return;
  const limit = watchlistDisplayLimit === "all" ? Infinity : Number(watchlistDisplayLimit) || 5;
  item.customers = window.ArAnalysis.sliceWatchlistDisplay(item.eligibleCustomers, limit);
  item.watchlistCount = item.customers.length;
  item.displayLimit = watchlistDisplayLimit;
  renderCalculationResults(currentCalcResults);
}

function refreshAllowanceSimulatorInResults() {
  const criteria = readArCriteriaFromForm();
  const accountData = currentCalcResults.accountData;
  const sim = window.ArAnalysis.calculateAllowanceSimulator(
    accountData,
    criteria.allowanceRates,
    companyRecordedAllowance
  );
  const idx = currentCalcResults.items.findIndex((i) => i.type === "allowanceSim");
  if (idx >= 0) currentCalcResults.items[idx] = { type: "allowanceSim", ...sim };
  else currentCalcResults.items.push({ type: "allowanceSim", ...sim });
  renderCalculationResults(currentCalcResults);
}

function updateArCriteriaPanel() {
  if (!arCriteriaPanel) return;
  const show = isArAccountSelected();
  arCriteriaPanel.hidden = !show;
  if (show) populateArCriteriaForm();
}

function statusBadgeClass(status) {
  return { normal: "status-badge status-normal", caution: "status-badge status-caution", review: "status-badge status-review" }[status] || "status-badge";
}

function statusLabelKo(status) {
  return { normal: "정상", caution: "주의", review: "추가 검토 필요" }[status] || "추가 검토 필요";
}

function findCalcItem(calcResults, type) {
  return calcResults.items?.find((i) => i.type === type) || null;
}

function getArCriteriaFromResults(calcResults) {
  const turnover = findCalcItem(calcResults, "turnover");
  return turnover?.criteria || window.ArAnalysis?.loadArCriteria?.() || {};
}

const AR_ACTION_PROCEDURES = [
  { id: "external-inquiry", label: "외부조회", match: ["외부조회"] },
  { id: "cash-collection", label: "후속현금회수 확인", match: ["후속현금회수 확인"] },
  { id: "contract-review", label: "계약서 검토", match: ["계약서 검토"] },
  { id: "individual-allowance", label: "대손충당금 개별평가", match: ["개별평가 검토", "대손충당금 산정 근거 검토"] },
  { id: "related-party-review", label: "특수관계자 거래 검토", match: [], relatedParty: true },
];

function renderSummaryCard({ label, value, change, status }) {
  const resolvedStatus = status || "review";
  return `<article class="ar-summary-card">
    <h6 class="ar-summary-card-label">${escapeHtml(label)}</h6>
    <p class="ar-summary-card-value">${escapeHtml(value)}</p>
    <p class="ar-summary-card-change">${escapeHtml(change || "—")}</p>
    <span class="${statusBadgeClass(resolvedStatus)} ar-summary-card-status">${escapeHtml(statusLabelKo(resolvedStatus))}</span>
  </article>`;
}

function buildArSummaryCards(calcResults) {
  const turnover = findCalcItem(calcResults, "turnover");
  const aging = findCalcItem(calcResults, "aging");
  const concentration = findCalcItem(calcResults, "concentration");
  const allowanceSim = findCalcItem(calcResults, "allowanceSim");
  const criteria = getArCriteriaFromResults(calcResults);

  const cards = [];

  if (turnover) {
    let daysStatus = turnover.currentDaysClass?.status || "normal";
    if (turnover.daysChangeAnalysis?.directionCode === "up" && turnover.daysChange > 0) {
      daysStatus = daysStatus === "normal" ? "caution" : daysStatus;
    }
    cards.push(
      renderSummaryCard({
        label: "평균회수기간 변화",
        value: turnover.currentCollectionDays != null ? formatDays(turnover.currentCollectionDays) : "—",
        change: turnover.daysSummaryLine || formatSummaryChangeFromTurnover(turnover),
        status: daysStatus,
      })
    );
  } else {
    cards.push(renderSummaryCard({ label: "평균회수기간 변화", value: "—", change: "분석 미수행", status: "review" }));
  }

  if (aging?.ok) {
    const threshold = criteria.over90RatioThreshold ?? 15;
    let over90Status = "normal";
    if (aging.over90Ratio >= threshold) over90Status = "review";
    else if (aging.over90Ratio >= threshold * 0.7) over90Status = "caution";
    cards.push(
      renderSummaryCard({
        label: "90일 초과 채권 비중",
        value: aging.over90Ratio != null ? formatPercent(aging.over90Ratio) : "—",
        change: `금액 ${formatNumber(aging.over90Amount)} · 기준 ${formatPercent(threshold)}`,
        status: over90Status,
      })
    );
  } else {
    cards.push(renderSummaryCard({ label: "90일 초과 채권 비중", value: "—", change: aging?.skipped ? "연령 데이터 없음" : "분석 미수행", status: "review" }));
  }

  const relatedRatio = concentration?.relatedRatio;
  if (relatedRatio != null) {
    const threshold = criteria.relatedPartyRatioThreshold ?? 10;
    let relatedStatus = "normal";
    if (relatedRatio >= threshold) relatedStatus = "review";
    else if (relatedRatio >= threshold * 0.7) relatedStatus = "caution";
    cards.push(
      renderSummaryCard({
        label: "특수관계자 채권 비중",
        value: formatPercent(relatedRatio),
        change: `잔액 ${formatNumber(concentration.relatedAmount)} · 기준 ${formatPercent(threshold)}`,
        status: relatedStatus,
      })
    );
  } else {
    cards.push(renderSummaryCard({ label: "특수관계자 채권 비중", value: "—", change: "분석 미수행", status: "review" }));
  }

  if (allowanceSim?.ok) {
    let allowanceStatus = "normal";
    let value = formatNumber(allowanceSim.totalEstimatedAllowance);
    let change = "회사 계상액 미입력 — 상세에서 입력";
    if (allowanceSim.companyRecordedAllowance !== null && allowanceSim.difference !== null) {
      value = formatNumber(allowanceSim.difference);
      change = `추정 ${formatNumber(allowanceSim.totalEstimatedAllowance)} / 계상 ${formatNumber(allowanceSim.companyRecordedAllowance)}`;
      if (allowanceSim.difference > 0) allowanceStatus = "review";
      else if (allowanceSim.difference < 0) allowanceStatus = "caution";
    } else {
      allowanceStatus = "caution";
    }
    cards.push(
      renderSummaryCard({
        label: "대손충당금 추정·계상 차이",
        value,
        change,
        status: allowanceStatus,
      })
    );
  } else {
    cards.push(renderSummaryCard({ label: "대손충당금 추정·계상 차이", value: "—", change: "분석 미수행", status: "review" }));
  }

  return `<section class="ar-section ar-summary-section">
    <h5 class="ar-section-title">핵심 분석 요약</h5>
    <p class="ar-section-note">위험 확정이 아닌 분석 신호입니다. 추가 검토 여부는 감사인 판단에 따릅니다.</p>
    <div class="ar-summary-cards">${cards.join("")}</div>
  </section>`;
}

function formatSummaryChangeFromTurnover(turnover) {
  if (turnover.priorCollectionDays == null || turnover.currentCollectionDays == null) return "—";
  const dir = turnover.daysChangeAnalysis?.direction || (turnover.daysChange > 0 ? "악화" : turnover.daysChange < 0 ? "개선" : "변동 없음");
  return `전기 ${formatRatio(turnover.priorCollectionDays)}일 → 당기 ${formatRatio(turnover.currentCollectionDays)}일 (${dir})`;
}

function buildKeyCautionItems(calcResults) {
  const items = [];
  const turnover = findCalcItem(calcResults, "turnover");
  const aging = findCalcItem(calcResults, "aging");
  const concentration = findCalcItem(calcResults, "concentration");
  const relatedParty = findCalcItem(calcResults, "relatedParty");
  const allowanceSim = findCalcItem(calcResults, "allowanceSim");
  const criteria = getArCriteriaFromResults(calcResults);
  const seen = new Set();

  const pushItem = (signal, reason, followUps) => {
    if (seen.has(signal) || items.length >= 5) return;
    seen.add(signal);
    items.push({ signal, reason, followUps });
  };

  if (concentration?.relatedRatio != null && concentration.relatedRatio >= (criteria.relatedPartyRatioThreshold ?? 10)) {
    pushItem(
      "특수관계자 채권 집중",
      `특수관계자 채권 비중 ${formatPercent(concentration.relatedRatio)} (잔액 ${formatNumber(concentration.relatedAmount)}) — 추가 검토 필요`,
      ["특수관계자 거래 검토", "계약서 검토", "외부조회"]
    );
  }

  if (aging?.ok && aging.over90Ratio != null && aging.over90Ratio >= (criteria.over90RatioThreshold ?? 15)) {
    pushItem(
      "90일 초과 비중 과다",
      `90일 초과 채권 비중 ${formatPercent(aging.over90Ratio)} (금액 ${formatNumber(aging.over90Amount)}) — 추가 검토 필요`,
      ["후속현금회수 확인", "대손충당금 개별평가"]
    );
  }

  if (turnover?.ok && turnover.daysChangeAnalysis?.directionCode === "up" && turnover.daysChange > 0) {
    pushItem(
      "회수기간 악화",
      `평균회수기간 전기 ${formatRatio(turnover.priorCollectionDays)}일 → 당기 ${formatRatio(turnover.currentCollectionDays)}일 — 추가 검토 필요`,
      ["후속현금회수 확인", "외부조회"]
    );
  }

  if (relatedParty?.ok && relatedParty.diff?.daysDiff != null && relatedParty.diff.daysDiff >= (criteria.relatedDaysGap ?? 30)) {
    pushItem(
      "장기 미회수 채권 증가",
      `특수관계자 평균회수기간(${formatDays(relatedParty.related.currentCollectionDays)})이 비특수관계자(${formatDays(relatedParty.nonRelated.currentCollectionDays)})보다 김 — 추가 검토 필요`,
      ["후속현금회수 확인", "특수관계자 거래 검토", "대손충당금 개별평가"]
    );
  }

  if (allowanceSim?.ok && allowanceSim.difference != null && allowanceSim.difference > 0) {
    pushItem(
      "대손충당금 부족 가능성",
      `시뮬레이션 추정 ${formatNumber(allowanceSim.totalEstimatedAllowance)} 대비 회사 계상 ${formatNumber(allowanceSim.companyRecordedAllowance)} (차이 ${formatNumber(allowanceSim.difference)}) — 추가 검토 필요`,
      ["대손충당금 개별평가", "후속현금회수 확인"]
    );
  }

  if (relatedParty?.warnings?.length) {
    for (const w of relatedParty.warnings) {
      if (w.code === "related_over90") {
        pushItem("장기 미회수 채권 증가", `${w.message}`, ["후속현금회수 확인", "대손충당금 개별평가"]);
      }
    }
  }

  return items.slice(0, 5);
}

function renderKeyCautionsSection(calcResults) {
  const cautions = buildKeyCautionItems(calcResults);
  if (!cautions.length) {
    return `<section class="ar-section ar-cautions-section">
      <h5 class="ar-section-title">핵심 주의사항</h5>
      <p class="ar-section-note">현재 분석 기준에서 별도 주의 신호가 감지되지 않았습니다. 상세 데이터는 하단 「상세 보기」에서 확인하세요.</p>
    </section>`;
  }

  const itemsHtml = cautions
    .map(
      (c) => `<article class="ar-caution-item">
      <h6 class="ar-caution-signal">${escapeHtml(c.signal)}</h6>
      <dl class="ar-caution-detail">
        <div><dt>근거</dt><dd>${escapeHtml(c.reason)}</dd></div>
        <div><dt>고려할 후속절차</dt><dd><ul class="ar-caution-followups">${c.followUps.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul></dd></div>
      </dl>
    </article>`
    )
    .join("");

  return `<section class="ar-section ar-cautions-section">
    <h5 class="ar-section-title">핵심 주의사항</h5>
    <p class="ar-section-note">신호 · 근거 · 후속절차 순으로 정리했습니다. 위험 확정이 아닙니다.</p>
    <div class="ar-caution-list">${itemsHtml}</div>
  </section>`;
}

function isWatchlistOver90(row) {
  return row.reasons?.some((r) => r.code === "long_overdue") || String(row.agingLabel || "").includes("90");
}

function renderWatchlistActionCheckboxes(row, cardIndex) {
  const suggested = new Set();
  (row.followUpProcedures || []).forEach((p) => {
    AR_ACTION_PROCEDURES.forEach((ap) => {
      if (ap.match.includes(p)) suggested.add(ap.id);
    });
  });
  if (row.relatedParty) suggested.add("related-party-review");

  return AR_ACTION_PROCEDURES.map((ap) => {
    const checked = suggested.has(ap.id) ? " checked" : "";
    return `<label class="ar-action-check">
      <input type="checkbox" class="ar-action-checkbox" data-card="${cardIndex}" data-action="${ap.id}"${checked} />
      <span>${escapeHtml(ap.label)}</span>
    </label>`;
  }).join("");
}

function renderArWatchlistCards(item) {
  if (!item?.ok) {
    return `<section class="ar-section ar-watchlist-section"><h5 class="ar-section-title">핵심 주의 거래처</h5><p class="result-error">${escapeHtml(item?.error || "분석을 수행하지 않았습니다.")}</p></section>`;
  }

  const rows = (item.eligibleCustomers || item.customers || []).slice(0, 5);
  if (!rows.length) {
    return `<section class="ar-section ar-watchlist-section"><h5 class="ar-section-title">핵심 주의 거래처</h5><p class="ar-section-note">최소 점수 이상 주의 거래처가 없습니다.</p></section>`;
  }

  let html = `<section class="ar-section ar-watchlist-section">
    <h5 class="ar-section-title">핵심 주의 거래처</h5>
    <p class="ar-section-note">상위 ${rows.length}개 · 위험 확정 아님 — 체크박스로 수행할 절차를 선택하세요.</p>
    <div class="ar-watchlist-cards">`;

  rows.forEach((row, index) => {
    const reasons = renderWatchlistReasonsHtml(row);
    const followUpList = formatWatchlistFollowupChecklist(row.followUpProcedures);
    const followUp = followUpList
      ? `<ul class="watchlist-checklist">${followUpList}</ul>`
      : `<span class="watchlist-empty">—</span>`;

    html += `<article class="ar-watchlist-card">
      <header class="ar-watchlist-card-header">
        <h6 class="ar-watchlist-card-title">${escapeHtml(row.customer)}</h6>
        ${row.relatedParty ? '<span class="ar-tag-related">특수관계자</span>' : ""}
      </header>
      <dl class="ar-watchlist-card-metrics">
        <div><dt>당기말채권</dt><dd>${formatNumber(row.currentClosing)}</dd></div>
        <div><dt>채권 비중</dt><dd>${row.arRatioPercent !== null ? formatPercent(row.arRatioPercent) : "—"}</dd></div>
        <div><dt>회수기간</dt><dd>${row.collectionDays !== null ? formatDays(row.collectionDays) : "—"}</dd></div>
        <div><dt>90일 초과</dt><dd>${isWatchlistOver90(row) ? "Y" : "N"}</dd></div>
      </dl>
      <div class="ar-watchlist-card-block"><strong>선정 사유</strong>${reasons}</div>
      <div class="ar-watchlist-card-block"><strong>권장 후속절차</strong>${followUp}</div>
      <div class="ar-watchlist-card-block ar-watchlist-card-actions"><strong>감사인 체크</strong><div class="ar-action-checklist">${renderWatchlistActionCheckboxes(row, index)}</div></div>
    </article>`;
  });

  return `${html}</div></section>`;
}

function renderWatchlistDetailTable(item) {
  if (!item?.ok) return "";
  const c = item.criteria;
  const displayVal = watchlistDisplayLimit === "all" ? "all" : String(watchlistDisplayLimit);

  let html = `<div class="calc-block"><h5 class="calc-block-title">주의 거래처 전체 목록</h5>`;
  html += `<div class="watchlist-display-controls">
    <label class="ar-criteria-field watchlist-limit-field">
      <span>표시 개수</span>
      <select id="watchlist-display-limit" class="criteria-input">
        <option value="5"${displayVal === "5" ? " selected" : ""}>상위 5개</option>
        <option value="10"${displayVal === "10" ? " selected" : ""}>상위 10개</option>
        <option value="all"${displayVal === "all" ? " selected" : ""}>전체</option>
      </select>
    </label>
  </div>`;

  if (!item.customers.length) {
    html += `<p class="calc-info">주의 거래처가 없습니다.</p></div>`;
    return html;
  }

  html += `<div class="watchlist-scroll-wrap"><table class="calc-table watchlist-table">
    <thead><tr>
      <th class="watchlist-col-customer">거래처</th>
      <th class="watchlist-col-related">특수관계자</th>
      <th class="num watchlist-col-sales">당기매출</th>
      <th class="num watchlist-col-ar">당기말채권</th>
      <th class="num watchlist-col-ratio">채권비중</th>
      <th class="num watchlist-col-ar-sales">매출대비</th>
      <th class="num watchlist-col-days">회수기간</th>
      <th class="watchlist-col-aging">연체구간</th>
      <th class="watchlist-col-reasons">선정 사유</th>
      <th class="watchlist-col-followup">후속 절차</th>
    </tr></thead><tbody>`;
  for (const row of item.customers) {
    const { cells } = renderWatchlistRowCells(row);
    html += `<tr>${cells}</tr>`;
  }
  html += `</tbody></table></div></div>`;
  return html;
}

function buildArDetailsSection(calcResults) {
  const { accountData, items } = calcResults;
  const isAr = accountData.format === "ar";
  const priorLabel = isAr ? "전기기말잔액 합계" : "전기금액";
  const currentLabel = isAr ? "당기기말잔액 합계" : "당기금액";

  let html = `<details class="ar-details-panel">
    <summary class="ar-details-summary">상세 보기</summary>
    <div class="ar-details-body">
      <p class="calc-source-note">원본 수치 — ${priorLabel}: <strong>${formatNumber(accountData.priorAmount)}</strong> · ${currentLabel}: <strong>${formatNumber(accountData.currentAmount)}</strong></p>`;

  for (const item of items) {
    if (item.type === "variance") {
      html += `<div class="calc-block"><h5 class="calc-block-title">증감분석</h5>`;
      if (!item.ok) {
        html += `<p class="result-error">${escapeHtml(item.error)}</p>`;
      } else {
        html += `<dl class="calc-formula-list">
          <div class="calc-formula-row"><dt>증감액</dt><dd><strong>${formatNumber(item.changeAmount)}</strong></dd></div>
          <div class="calc-formula-row"><dt>증감률</dt><dd><strong>${formatPercent(item.changeRate)}</strong></dd></div>
        </dl>`;
      }
      html += `</div>`;
    }
    if (item.type === "turnover") html += renderTurnoverBlock(item, { detailsMode: true });
    if (item.type === "aging") html += renderAgingBlock(item);
    if (item.type === "concentration") html += renderConcentrationBlock(item);
    if (item.type === "relatedParty") html += renderRelatedPartyBlock(item);
    if (item.type === "watchlist") html += renderWatchlistDetailTable(item);
    if (item.type === "allowanceSim") html += renderAllowanceSimBlock(item);
    if (item.type === "allowance") html += renderAllowanceBlock(item);
  }

  html += `</div></details>`;
  return html;
}

function buildArAnalysisResultsHtml(calcResults, { includeFooter = true } = {}) {
  const { account } = calcResults;
  const watchlist = findCalcItem(calcResults, "watchlist");

  let html = `<div class="ar-results">
    <div class="calc-result-header ar-result-header">
      <h4>${escapeHtml(account)}</h4>
    </div>`;

  html += buildArSummaryCards(calcResults);
  html += renderKeyCautionsSection(calcResults);
  html += renderArWatchlistCards(watchlist);
  html += `<section class="ar-section ar-charts-section">
    <h5 class="ar-section-title">핵심 그래프</h5>
    <div class="ar-charts-grid" id="ar-charts-mount"></div>
  </section>`;
  html += buildArDetailsSection(calcResults);

  if (includeFooter) {
    html += `<p class="calc-footer-note">※ 모든 수치는 JavaScript 코드로 계산되었습니다. AI는 사용하지 않았습니다.</p>`;
  }

  return `${html}</div>`;
}

function mountArChartsInResults(chartData) {
  const mount = document.getElementById("ar-charts-mount");
  const isAr = currentCalcResults?.accountData?.format === "ar";

  if (!isAr || !mount) {
    if (graphSection) graphSection.hidden = !chartData;
    return false;
  }

  if (graphSection) graphSection.hidden = true;
  mount.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "ar-charts-inner";

  for (const id of ["chart-turnover", "chart-aging", "chart-concentration"]) {
    const canvas = document.getElementById(id);
    if (!canvas) continue;
    const wrap = document.createElement("div");
    wrap.className = "ar-chart-item";
    wrap.appendChild(canvas);
    grid.appendChild(wrap);
  }

  mount.appendChild(grid);
  return true;
}

function restoreChartsToGraphSection() {
  const graphAreaEl = document.getElementById("graph-area");
  if (!graphAreaEl) return;
  for (const id of ["chart-turnover", "chart-aging", "chart-concentration"]) {
    const canvas = document.getElementById(id);
    if (canvas && canvas.parentElement?.id !== "graph-area" && !graphAreaEl.contains(canvas)) {
      graphAreaEl.appendChild(canvas);
    }
  }
}

function getAvailableProcedures() {
  const isAr = isArAccountSelected();
  return BASE_PROCEDURES.map((proc) => {
    if (proc.id === "composition" && isAr) {
      return { ...proc, available: false };
    }
    if (proc.requiresAr && proc.account) {
      if (!isAr) return { ...proc, available: false };
      if (proc.requiresRelatedParty && !parsedDataset?.hasRelatedPartyColumn) {
        return { ...proc, available: false };
      }
      return { ...proc, available: true };
    }
    return { ...proc };
  });
}

function getSelectedProcedures() {
  return getAvailableProcedures().filter((p) => p.available && selectedProcedureIds.has(p.id));
}

function updateStepProgress() {
  const hasFile = Boolean(parsedDataset);
  const hasAccount = Boolean(selectedAccount);
  const hasProcedures = selectedProcedureIds.size > 0;

  let activeStep = 1;
  if (hasFile && hasAccount && hasProcedures) activeStep = 4;
  else if (hasFile && hasAccount) activeStep = 3;
  else if (hasFile) activeStep = 2;

  document.querySelectorAll(".step-progress-item").forEach((el) => {
    const step = Number(el.dataset.stepIndicator);
    el.classList.remove("is-active", "is-done", "is-pending");
    if (step < activeStep) el.classList.add("is-done");
    else if (step === activeStep) el.classList.add("is-active");
    else el.classList.add("is-pending");
  });
}

function updateWizardSteps() {
  const hasFile = Boolean(parsedDataset);
  const hasAccount = Boolean(selectedAccount);

  document.querySelectorAll(".wizard-step").forEach((section) => {
    const step = Number(section.dataset.wizardStep);
    section.classList.remove("is-active", "is-locked");
    if (step === 1) {
      section.classList.add("is-active");
      section.removeAttribute("aria-disabled");
    } else if (step === 2) {
      if (hasFile) {
        section.classList.add("is-active");
        section.removeAttribute("aria-disabled");
      } else {
        section.classList.add("is-locked");
        section.setAttribute("aria-disabled", "true");
      }
    } else if (step === 3) {
      if (hasFile && hasAccount) {
        section.classList.add("is-active");
        section.removeAttribute("aria-disabled");
      } else {
        section.classList.add("is-locked");
        section.setAttribute("aria-disabled", "true");
      }
    } else if (step === 4) {
      if (hasFile && hasAccount && selectedProcedureIds.size > 0) {
        section.classList.add("is-active");
        section.removeAttribute("aria-disabled");
      } else {
        section.classList.add("is-locked");
        section.setAttribute("aria-disabled", "true");
      }
    }
  });

  accountSelect.disabled = !hasFile;
  accountSelectHint.textContent = hasFile
    ? `${parsedDataset.accounts.length}개 계정과목 중 선택하세요.`
    : "파일 업로드 후 선택할 수 있습니다.";
}

function populateAccountSelect() {
  accountSelect.innerHTML = '<option value="">계정과목을 선택하세요</option>';
  if (!parsedDataset) return;

  for (const acc of parsedDataset.accounts) {
    const label = acc.rowCount > 1 && acc.format !== "ar"
      ? `${acc.account} (${acc.rowCount}행 합산)`
      : acc.account;
    accountSelect.innerHTML += `<option value="${escapeHtml(acc.account)}">${escapeHtml(label)}</option>`;
  }
}

function renderProcedureChecklist() {
  if (!selectedAccount) {
    procedureAccountLabel.textContent = "계정과목을 먼저 선택하세요.";
    procedureChecklist.innerHTML = "";
    updateArCriteriaPanel();
    return;
  }

  procedureAccountLabel.innerHTML = `<strong>${escapeHtml(selectedAccount)}</strong> — 수행할 분석적 절차를 선택하세요.`;
  updateArCriteriaPanel();
  const procedures = getAvailableProcedures();
  procedureChecklist.innerHTML = procedures.map((proc) => {
    if (!proc.available) {
      let soonLabel = proc.requiresAr ? "데이터 필요" : "해당 없음";
      if (proc.id === "composition" && isArAccountSelected()) soonLabel = "매출채권 제외";
      return `
        <label class="procedure-check-item is-disabled">
          <input type="checkbox" disabled />
          <span>${escapeHtml(proc.label)}</span>
          <span class="procedure-soon-tag">${soonLabel}</span>
        </label>`;
    }
    const optionalNote = proc.optionalData ? ' <span class="procedure-optional-tag">선택</span>' : "";
    return `
      <label class="procedure-check-item">
        <input type="checkbox" class="procedure-check" value="${proc.id}" ${selectedProcedureIds.has(proc.id) ? "checked" : ""} />
        <span>${escapeHtml(proc.label)}${optionalNote}</span>
      </label>`;
  }).join("");
}

function renderSelectionSummary() {
  const procedures = getSelectedProcedures();
  if (!parsedDataset || !selectedAccount || !procedures.length) {
    selectionSummary.innerHTML = '<p class="selection-summary-empty">파일·계정·절차를 모두 선택하면 분석을 실행할 수 있습니다.</p>';
    return;
  }

  selectionSummary.innerHTML = `
    <dl class="selection-summary-list">
      <div class="selection-summary-row"><dt>파일</dt><dd>${escapeHtml(parsedDataset.fileName)}</dd></div>
      <div class="selection-summary-row"><dt>계정</dt><dd>${escapeHtml(selectedAccount)}</dd></div>
      <div class="selection-summary-row"><dt>선택 절차</dt><dd>${procedures.map((p) => escapeHtml(p.label)).join(", ")}</dd></div>
    </dl>
  `;
}

function updateRunButtonState() {
  const ready = parsedDataset && selectedAccount && selectedProcedureIds.size > 0;
  runAnalysisBtn.disabled = !ready;
  renderSelectionSummary();
  updateWizardSteps();
  updateStepProgress();
}

function renderPreview(dataset) {
  const cols = dataset.columns;
  const previewCols = cols.slice(0, 12);

  const headerHtml = previewCols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const bodyHtml = dataset.previewRows.map((row) => {
    const cells = previewCols.map((col) => {
      if (col === "계정과목") return `<td>${escapeHtml(row.account)}</td>`;
      if (col === "전기금액") return `<td class="num">${formatNumber(row.priorAmount)}</td>`;
      if (col === "당기금액") return `<td class="num">${formatNumber(row.currentAmount)}</td>`;
      if (row.format === "ar" && row.arDetail) {
        const map = {
          거래처: row.arDetail.customer,
          전기기초잔액: row.arDetail.priorOpening,
          전기기말잔액: row.arDetail.priorClosing,
          당기기초잔액: row.arDetail.currentOpening,
          당기기말잔액: row.arDetail.currentClosing,
          전기매출액: row.arDetail.priorSales,
          당기매출액: row.arDetail.currentSales,
          만기구간: row.arDetail.aging,
          회수일수: row.arDetail.collectionDays,
          특수관계자여부: row.arDetail.relatedParty,
        };
        const val = map[col];
        if (val === null || val === undefined || val === "") return "<td>—</td>";
        if (typeof val === "number") return `<td class="num">${formatNumber(val)}</td>`;
        return `<td>${escapeHtml(val)}</td>`;
      }
      const val = row.optional?.[col];
      if (val === undefined) return "<td>—</td>";
      if (typeof val === "number") return `<td class="num">${formatNumber(val)}</td>`;
      return `<td>${escapeHtml(val)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  const unknownNote = dataset.unknownColumns.length
    ? `<p class="preview-note">인식되지 않은 열: ${dataset.unknownColumns.map(escapeHtml).join(", ")}</p>`
    : "";

  const warningNote = dataset.warning
    ? `<p class="preview-warning">${escapeHtml(dataset.warning).replace(/\n/g, "<br>")}</p>`
    : "";

  const isArPreview = dataset.format === "ar";
  const totalNote = isArPreview
    ? ""
    : `<p><strong>당기 총액 (전체 계정 합계):</strong> ${formatNumber(dataset.totalCurrentAmount)}</p>`;

  previewArea.innerHTML = `
    <div class="preview-meta">
      <p><strong>파일 형식:</strong> ${dataset.format === "ar" ? "매출채권 상세 (AR)" : "기본"}</p>
      <p><strong>감지된 열:</strong> ${cols.map(escapeHtml).join(", ")}</p>
      <p><strong>계정과목:</strong> ${dataset.accounts.length}개 · <strong>데이터 행:</strong> ${dataset.allRows.length}개</p>
      ${totalNote}
      ${isArPreview && dataset.hasAgingColumn ? '<p><strong>연령분석:</strong> 만기구간 열 감지됨</p>' : ""}
      ${isArPreview && !dataset.hasAgingColumn ? '<p class="preview-note">만기구간 열 없음 — 연령분석은 선택 시 건너뜁니다.</p>' : ""}
      ${isArPreview && dataset.hasRelatedPartyColumn ? '<p><strong>특수관계자:</strong> 특수관계자 여부 열 감지됨</p>' : ""}
    </div>
    ${unknownNote}
    ${warningNote}
    <div class="preview-table-wrap">
      <table class="preview-table">
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
    <p class="preview-note">상위 ${Math.min(5, dataset.allRows.length)}행 미리보기</p>
  `;
}

function renderPreviewError(message) {
  previewArea.innerHTML = `<p class="result-error">${escapeHtml(message)}</p>`;
}

function renderTurnoverBlock(item, options = {}) {
  let html = `<div class="calc-block"><h5 class="calc-block-title">회전율·평균회수기간</h5>`;
  if (item.errors?.length) {
    html += item.errors.map((e) => `<p class="result-error">${escapeHtml(e)}</p>`).join("");
  }
  if (!options.detailsMode && item.criteria) {
    const c = item.criteria;
    html += `<p class="calc-criteria-note">사용자 기준 — 정상: ${c.normalDays}일 이하 · 주의: ${c.normalDays + 1}~${c.cautionDays}일 · 추가 검토: ${c.cautionDays}일 초과</p>`;
  }
  if (!options.detailsMode) {
    html += `<div class="calc-key-metrics">`;
    if (item.daysSummaryLine) {
      const badge = item.currentDaysClass
        ? ` <span class="${statusBadgeClass(item.currentDaysClass.status)}">${escapeHtml(item.currentDaysClass.label)}</span>`
        : "";
      html += `<p class="calc-key-metric"><strong>평균회수기간:</strong> ${escapeHtml(item.daysSummaryLine)}${badge}</p>`;
    }
    if (item.turnoverSummaryLine) {
      html += `<p class="calc-key-metric"><strong>매출채권 회전율:</strong> ${escapeHtml(item.turnoverSummaryLine)}</p>`;
    }
    html += `</div>`;
  }
  html += `<details class="calc-detail-toggle"${options.detailsMode ? " open" : ""}><summary>계산 상세 보기</summary><dl class="calc-formula-list">
    <div class="calc-formula-row"><dt>전기 평균매출채권</dt><dd><strong>${formatNumber(item.priorAvgAR)}</strong></dd></div>
    <div class="calc-formula-row"><dt>당기 평균매출채권</dt><dd><strong>${formatNumber(item.currentAvgAR)}</strong></dd></div>
    <div class="calc-formula-row"><dt>전기 회전율</dt><dd>${formatNumber(item.priorSales)} ÷ ${formatNumber(item.priorAvgAR)} = <strong>${formatRatio(item.priorTurnover)}</strong></dd></div>
    <div class="calc-formula-row"><dt>당기 회전율</dt><dd>${formatNumber(item.currentSales)} ÷ ${formatNumber(item.currentAvgAR)} = <strong>${formatRatio(item.currentTurnover)}</strong></dd></div>
    <div class="calc-formula-row"><dt>전기 평균회수기간</dt><dd>365 ÷ ${formatRatio(item.priorTurnover)} = <strong>${formatDays(item.priorCollectionDays)}</strong></dd></div>
    <div class="calc-formula-row"><dt>당기 평균회수기간</dt><dd>365 ÷ ${formatRatio(item.currentTurnover)} = <strong>${formatDays(item.currentCollectionDays)}</strong></dd></div>
  </dl></details></div>`;
  return html;
}

function renderAgingBlock(item) {
  let html = `<div class="calc-block"><h5 class="calc-block-title">연령분석 (Aging)</h5>`;
  if (item.skipped) {
    html += `<p class="calc-info">${escapeHtml(item.error)}</p></div>`;
    return html;
  }
  if (item.errors?.length) {
    html += item.errors.map((e) => `<p class="result-error">${escapeHtml(e)}</p>`).join("");
  }
  if (item.warnings?.length) {
    html += `<p class="calc-warning">${item.warnings.map(escapeHtml).join("<br>")}</p>`;
  }

  html += `<p class="calc-source-note">집계 기준: 당기기말잔액 합계 <strong>${formatNumber(item.totalAR)}</strong></p>`;

  html += `<table class="calc-table">
    <thead><tr><th>만기구간</th><th class="num">금액</th><th class="num">구성비</th><th>계산식</th></tr></thead>
    <tbody>`;
  for (const bucket of item.buckets) {
    html += `<tr>
      <td>${escapeHtml(bucket.label)}</td>
      <td class="num">${formatNumber(bucket.amount)}</td>
      <td class="num">${bucket.ratio !== null ? formatPercent(bucket.ratio) : "—"}</td>
      <td class="formula-cell">${bucket.ratioFormula ? `${bucket.ratioFormula} = ${formatPercent(bucket.ratio)}` : "—"}</td>
    </tr>`;
  }
  html += `</tbody></table>`;

  if (item.unclassifiedAmount > 0) {
    html += `<p class="calc-warning">미분류 잔액: ${formatNumber(item.unclassifiedAmount)} (${item.unclassifiedRows.length}건)</p>`;
  }

  html += `<dl class="calc-formula-list">
    <div class="calc-formula-row"><dt>90일 초과</dt><dd>금액 <strong>${formatNumber(item.over90Amount)}</strong></dd></div>
    <div class="calc-formula-row"><dt>90일 초과 비중</dt><dd>${item.over90Formula ? `${item.over90Formula} = <strong>${formatPercent(item.over90Ratio)}</strong>` : "—"}</dd></div>
  </dl></div>`;
  return html;
}

function renderConcentrationBlock(item) {
  let html = `<div class="calc-block"><h5 class="calc-block-title">거래처 집중도</h5>`;
  if (item.errors?.length) {
    html += item.errors.map((e) => `<p class="result-error">${escapeHtml(e)}</p>`).join("");
  }
  if (item.warnings?.length) {
    html += `<p class="calc-warning">${item.warnings.map(escapeHtml).join("<br>")}</p>`;
  }

  html += `<p class="calc-source-note">기준 잔액: 당기기말잔액 합계 <strong>${formatNumber(item.totalAR)}</strong> · 거래처 ${item.customerCount}개</p>`;

  html += `<dl class="calc-formula-list">
    <div class="calc-formula-row"><dt>상위 1개</dt><dd>${item.top1Formula ? `${formatNumber(item.top1Amount)} ÷ ${formatNumber(item.totalAR)} × 100 = <strong>${formatPercent(item.top1Ratio)}</strong>` : "—"}</dd></div>
    <div class="calc-formula-row"><dt>상위 3개</dt><dd>${item.top3Formula ? `${formatNumber(item.top3Amount)} ÷ ${formatNumber(item.totalAR)} × 100 = <strong>${formatPercent(item.top3Ratio)}</strong>` : "—"}</dd></div>
    <div class="calc-formula-row"><dt>상위 5개</dt><dd>${item.top5Formula ? `${formatNumber(item.top5Amount)} ÷ ${formatNumber(item.totalAR)} × 100 = <strong>${formatPercent(item.top5Ratio)}</strong>` : "—"}</dd></div>
    <div class="calc-formula-row"><dt>특수관계자</dt><dd>잔액 <strong>${formatNumber(item.relatedAmount)}</strong> · ${item.relatedFormula ? `${item.relatedFormula} = <strong>${formatPercent(item.relatedRatio)}</strong>` : "—"}</dd></div>
  </dl>`;

  html += `<table class="calc-table">
    <thead><tr><th>순위</th><th>거래처</th><th class="num">당기기말잔액</th><th class="num">비중</th><th>특수관계자</th></tr></thead>
    <tbody>`;
  for (const row of item.ranked) {
    html += `<tr>
      <td class="num">${row.rank}</td>
      <td>${escapeHtml(row.customer)}</td>
      <td class="num">${formatNumber(row.amount)}</td>
      <td class="num">${row.ratio !== null ? formatPercent(row.ratio) : "—"}</td>
      <td>${row.relatedParty ? "Y" : "N"}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

function renderRelatedPartyMetrics(label, m, daysClass) {
  return `<div class="related-party-group">
    <h6>${escapeHtml(label)}</h6>
    <dl class="calc-formula-list">
      <div class="calc-formula-row"><dt>당기기말잔액</dt><dd><strong>${formatNumber(m.currentClosing)}</strong> (${m.ratio !== null ? formatPercent(m.ratio) : "—"})</dd></div>
      <div class="calc-formula-row"><dt>평균회수기간</dt><dd><strong>${formatDays(m.currentCollectionDays)}</strong>${daysClass ? ` · <span class="${statusBadgeClass(daysClass.status)}">${escapeHtml(daysClass.label)}</span>` : ""}</dd></div>
      <div class="calc-formula-row"><dt>90일 초과</dt><dd><strong>${formatNumber(m.over90Amount)}</strong>${m.over90Ratio !== null ? ` (${formatPercent(m.over90Ratio)})` : ""}</dd></div>
    </dl>
  </div>`;
}

function renderRelatedPartyBlock(item) {
  let html = `<div class="calc-block"><h5 class="calc-block-title">특수관계자 분석</h5>`;
  if (!item.ok) {
    html += `<p class="result-error">${escapeHtml(item.error)}</p></div>`;
    return html;
  }
  if (item.warnings?.length) {
    html += `<div class="calc-review-list">${item.warnings.map((w) => `<p class="calc-review-note">${escapeHtml(w.message)}</p>`).join("")}</div>`;
  }
  html += `<div class="related-party-grid">`;
  html += renderRelatedPartyMetrics("특수관계자", item.related, item.relatedDaysClass);
  html += renderRelatedPartyMetrics("비특수관계자", item.nonRelated, item.nonRelatedDaysClass);
  html += `</div></div>`;
  return html;
}

function formatWatchlistReasonBullet(reason, row) {
  switch (reason.code) {
    case "collection_days":
      return row.collectionDays !== null
        ? `회수기간 ${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(row.collectionDays)}일`
        : "회수기간 초과";
    case "related_party":
      return "특수관계자 거래";
    case "long_overdue":
      return "90일 초과 채권";
    case "materiality_ar":
      return reason.message?.includes("수행중요성") ? "수행중요성 초과" : "채권비중 초과";
    case "ar_to_sales":
      return "매출 대비 채권 과다";
    case "balance_increase":
      return "전기 대비 잔액 급증";
    case "low_company_allowance":
      return "충당률 부족";
    default:
      return reason.reviewPhrase || "추가 검토";
  }
}

const WATCHLIST_FOLLOWUP_LABELS = {
  "외부조회": "외부조회",
  "후속현금회수 확인": "후속현금회수 확인",
  "계약서 검토": "계약서 검토",
  "개별평가 검토": "개별평가",
  "대손충당금 산정 근거 검토": "충당금 근거 검토",
};

function formatWatchlistFollowupChecklist(procedures) {
  const unique = [...new Set(procedures || [])];
  if (!unique.length) return "";
  return unique
    .map((p) => `<li class="watchlist-check-item">☐ ${escapeHtml(WATCHLIST_FOLLOWUP_LABELS[p] || p)}</li>`)
    .join("");
}

function renderWatchlistReasonsHtml(row) {
  const items = row.reasons.map(
    (r) => `<li>${escapeHtml(formatWatchlistReasonBullet(r, row))}</li>`
  );
  return `<ul class="watchlist-reasons">${items.join("")}</ul>`;
}

function renderWatchlistFollowupHtml(row) {
  const checklist = formatWatchlistFollowupChecklist(row.followUpProcedures);
  return checklist ? `<ul class="watchlist-checklist">${checklist}</ul>` : `<span class="watchlist-empty">—</span>`;
}

function renderWatchlistRowCells(row) {
  const reasons = renderWatchlistReasonsHtml(row);
  const followUp = renderWatchlistFollowupHtml(row);
  return {
    reasons,
    followUp,
    cells: `
      <td class="watchlist-col-customer">${escapeHtml(row.customer)}</td>
      <td class="watchlist-col-related">${row.relatedParty ? "Y" : "N"}</td>
      <td class="num watchlist-col-sales">${formatNumber(row.currentSales)}</td>
      <td class="num watchlist-col-ar">${formatNumber(row.currentClosing)}</td>
      <td class="num watchlist-col-ratio">${row.arRatioPercent !== null ? formatPercent(row.arRatioPercent) : "—"}</td>
      <td class="num watchlist-col-ar-sales">${row.arToSalesRatioPercent !== null ? formatPercent(row.arToSalesRatioPercent) : "—"}</td>
      <td class="num watchlist-col-days">${row.collectionDays !== null ? formatDays(row.collectionDays) : "—"}</td>
      <td class="watchlist-col-aging">${escapeHtml(row.agingLabel)}</td>
      <td class="watchlist-text-cell watchlist-col-reasons">
        <span class="${statusBadgeClass("caution")} watchlist-tier-badge">${escapeHtml(row.status)}</span>
        ${reasons}
      </td>
      <td class="watchlist-text-cell watchlist-col-followup">${followUp}</td>
    `,
  };
}

function renderWatchlistBlock(item) {
  let html = `<div class="calc-block"><h5 class="calc-block-title">주의 거래처 목록</h5>`;
  if (!item.ok) {
    html += `<p class="result-error">${escapeHtml(item.error)}</p></div>`;
    return html;
  }
  const c = item.criteria;
  const displayVal = watchlistDisplayLimit === "all" ? "all" : String(watchlistDisplayLimit);
  const normalOrObs = (item.normalCount || 0) + (item.observationCount || 0);
  const normalObsPct = item.totalCustomers ? (normalOrObs / item.totalCustomers) * 100 : 0;

  html += `<p class="calc-criteria-note">선정 기준 — 수행중요성 ${formatNumber(c.performanceMaterialityAmount)}원 · 거래처 중요성 ${formatPercent(c.customerMaterialityRatioPercent)} · 최소 점수 ${c.watchlistMinScore}점 · 회수기간 ${c.watchlistCollectionDays}일 · 장기연체 ${c.watchlistOverdueDays}일 · 잔액증가 ${formatPercent(c.watchlistBalanceIncreasePercent)} · 매출대비채권 ${formatPercent(c.watchlistArToSalesRatioPercent)}</p>`;
  html += `<p class="calc-source-note">분류 요약 — 정상 <strong>${item.normalCount || 0}</strong> · 일반관찰 <strong>${item.observationCount || 0}</strong> · 주의대상 <strong>${item.eligibleCount || 0}</strong> (전체 ${item.totalCustomers}개 중 ${formatPercent(normalObsPct)} 정상·관찰)</p>`;

  html += `<div class="watchlist-display-controls">
    <label class="ar-criteria-field watchlist-limit-field">
      <span>핵심 주의대상 표시</span>
      <select id="watchlist-display-limit" class="criteria-input">
        <option value="5"${displayVal === "5" ? " selected" : ""}>상위 5개</option>
        <option value="10"${displayVal === "10" ? " selected" : ""}>상위 10개</option>
        <option value="all"${displayVal === "all" ? " selected" : ""}>전체</option>
      </select>
    </label>
  </div>`;

  if (!item.customers.length) {
    html += `<p class="calc-info">최소 점수(${c.watchlistMinScore}점) 이상 주의 거래처가 없습니다.</p></div>`;
    return html;
  }
  html += `<p class="calc-source-note">핵심 주의대상 <strong>${item.watchlistCount}</strong>개 표시 (주의대상 ${item.eligibleCount}개 중 · 위험 확정 아님 — 추가 검토용)</p>`;

  html += `<div class="watchlist-scroll-wrap"><table class="calc-table watchlist-table">
    <thead><tr>
      <th class="watchlist-col-customer">거래처</th>
      <th class="watchlist-col-related">특수관계자</th>
      <th class="num watchlist-col-sales">당기매출</th>
      <th class="num watchlist-col-ar">당기말채권</th>
      <th class="num watchlist-col-ratio">채권비중</th>
      <th class="num watchlist-col-ar-sales">매출대비</th>
      <th class="num watchlist-col-days">회수기간</th>
      <th class="watchlist-col-aging">연체구간</th>
      <th class="watchlist-col-reasons">선정 사유</th>
      <th class="watchlist-col-followup">후속 절차</th>
    </tr></thead><tbody>`;
  for (const row of item.customers) {
    const { cells } = renderWatchlistRowCells(row);
    html += `<tr>${cells}</tr>`;
  }
  html += `</tbody></table></div>`;

  html += `<div class="watchlist-cards">`;
  for (const row of item.customers) {
    const { reasons, followUp } = renderWatchlistRowCells(row);
    html += `<article class="watchlist-card">
      <div class="watchlist-card-header">
        <span class="watchlist-card-title">${escapeHtml(row.customer)}</span>
        <span class="${statusBadgeClass("caution")}">${escapeHtml(row.status)}</span>
      </div>
      <dl class="watchlist-card-grid">
        <dt>특수관계자</dt><dd>${row.relatedParty ? "Y" : "N"}</dd>
        <dt>당기매출</dt><dd>${formatNumber(row.currentSales)}</dd>
        <dt>당기말채권</dt><dd>${formatNumber(row.currentClosing)}</dd>
        <dt>채권비중</dt><dd>${row.arRatioPercent !== null ? formatPercent(row.arRatioPercent) : "—"}</dd>
        <dt>매출대비</dt><dd>${row.arToSalesRatioPercent !== null ? formatPercent(row.arToSalesRatioPercent) : "—"}</dd>
        <dt>회수기간</dt><dd>${row.collectionDays !== null ? formatDays(row.collectionDays) : "—"}</dd>
        <dt>연체구간</dt><dd>${escapeHtml(row.agingLabel)}</dd>
      </dl>
      <p class="watchlist-text-cell"><strong>선정 사유</strong></p>
      ${reasons}
      <p class="watchlist-text-cell"><strong>후속 절차</strong></p>
      ${followUp}
    </article>`;
  }
  html += `</div></div>`;
  return html;
}

function renderAllowanceSimBlock(item) {
  let html = `<div class="calc-block" id="allowance-sim-block"><h5 class="calc-block-title">대손충당금 시뮬레이터</h5>`;
  if (!item.ok) {
    html += `<p class="result-error">${escapeHtml(item.error)}</p></div>`;
    return html;
  }
  if (!item.hasAgingData) {
    html += `<p class="calc-warning">만기구간 데이터가 없어 일부 잔액이 미분류될 수 있습니다.</p>`;
  }
  html += `<table class="calc-table"><thead><tr><th>연령구간</th><th class="num">잔액</th><th class="num">충당률</th><th class="num">추정 충당금</th></tr></thead><tbody>`;
  for (const b of item.buckets) {
    html += `<tr><td>${escapeHtml(b.label)}</td><td class="num">${formatNumber(b.amount)}</td><td class="num">${formatPercent(b.ratePercent)}</td><td class="num">${formatNumber(b.allowance)}</td></tr>`;
  }
  html += `</tbody></table>`;
  if (item.unclassifiedAmount > 0) {
    html += `<p class="calc-info">미분류 잔액: ${formatNumber(item.unclassifiedAmount)} (충당률 미적용)</p>`;
  }
  html += `<div class="allowance-sim-summary">
    <div class="allowance-sim-card"><span>총 추정 충당금</span><strong>${formatNumber(item.totalEstimatedAllowance)}</strong></div>
    <div class="allowance-sim-card"><span>채권 대비 설정률</span><strong>${item.allowanceRatioPercent !== null ? formatPercent(item.allowanceRatioPercent) : "—"}</strong></div>
    <div class="allowance-sim-card"><span>특수관계자 추정 충당금</span><strong>${formatNumber(item.relatedParty.estimatedAllowance)}</strong></div>
  </div>`;
  html += `<label class="ar-criteria-field company-allowance-input"><span>회사 계상 충당금</span>
    <input type="number" id="company-allowance-input" class="criteria-input" min="0" step="1" value="${companyRecordedAllowance}" placeholder="금액 입력" />
  </label>`;
  if (item.companyRecordedAllowance !== null) {
    const diffClass = item.difference > 0 ? "change-worsened" : item.difference < 0 ? "change-improved" : "";
    html += `<p class="calc-key-metric">추정액 대비 차이: <strong class="${diffClass}">${formatNumber(item.difference)}</strong> (추정 ${formatNumber(item.totalEstimatedAllowance)} − 회사 ${formatNumber(item.companyRecordedAllowance)})</p>`;
  }
  if (item.individualReviewCustomers?.length) {
    html += `<h6 class="calc-subtitle">개별평가 검토 대상 (고액·장기연체)</h6><table class="calc-table"><thead><tr><th>거래처</th><th>특수</th><th class="num">잔액</th><th>연체구간</th><th class="num">추정충당금</th></tr></thead><tbody>`;
    for (const r of item.individualReviewCustomers.slice(0, 10)) {
      html += `<tr><td>${escapeHtml(r.customer)}</td><td>${r.relatedParty ? "Y" : "N"}</td><td class="num">${formatNumber(r.amount)}</td><td>${escapeHtml(r.agingLabel)}</td><td class="num">${formatNumber(r.estimatedAllowance)}</td></tr>`;
    }
    html += `</tbody></table>`;
  }
  html += `</div>`;
  return html;
}

function renderAllowanceBlock(item) {
  let html = `<div class="calc-block"><h5 class="calc-block-title">대손충당금 검토 안내</h5>`;
  if (!item.ok) {
    html += `<p class="result-error">${escapeHtml(item.error || "안내를 생성할 수 없습니다.")}</p></div>`;
    return html;
  }
  if (!item.hasGuidance) {
    html += `<p class="calc-info">현재 선택된 분석 결과 기준으로 대손충당금 평가의 추가 검토가 필요한 항목이 감지되지 않았습니다.</p>`;
  } else {
    html += `<div class="calc-review-list">${item.notes.map((n) => `<p class="calc-review-note">${escapeHtml(n.message)}</p>`).join("")}</div>`;
  }
  html += `</div>`;
  return html;
}

function setupCanvas(canvas, height, containerEl = graphArea, minWidth = null) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max((containerEl?.clientWidth || graphArea?.clientWidth || 320) - 32, minWidth || 240);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function renderTurnoverChart(turnoverData, canvas = chartTurnover, containerEl = graphArea) {
  if (!canvas || !turnoverData) return;

  canvas.hidden = false;
  const { ctx, width, height } = setupCanvas(canvas, 280, containerEl);

  const groups = [
    { title: "매출채권 회전율", prior: turnoverData.turnover.prior, current: turnoverData.turnover.current },
    { title: "평균회수기간", prior: turnoverData.collectionDays.prior, current: turnoverData.collectionDays.current },
  ];

  const margin = { top: 36, right: 20, bottom: 52, left: 48 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const groupW = chartW / groups.length;

  groups.forEach((group, gi) => {
    const maxVal = Math.max(group.prior || 0, group.current || 0, 1) * 1.2;
    const baseX = margin.left + gi * groupW;
    const barW = 36;
    const gap = 18;
    const centerX = baseX + groupW / 2;

    ctx.fillStyle = "#1a2a44";
    ctx.font = "600 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(group.title, centerX, 18);

    const priorH = ((group.prior || 0) / maxVal) * chartH;
    const currentH = ((group.current || 0) / maxVal) * chartH;
    const baseY = margin.top + chartH;

    ctx.fillStyle = "#8fa3c4";
    ctx.fillRect(centerX - barW - gap / 2, baseY - priorH, barW, priorH);
    ctx.fillStyle = "#2c4a7c";
    ctx.fillRect(centerX + gap / 2, baseY - currentH, barW, currentH);

    ctx.fillStyle = "#444";
    ctx.font = "11px sans-serif";
    ctx.fillText("전기", centerX - barW / 2 - gap / 2, baseY + 16);
    ctx.fillText("당기", centerX + barW / 2 + gap / 2, baseY + 16);

    ctx.fillStyle = "#333";
    ctx.font = "10px sans-serif";
    ctx.fillText(formatRatio(group.prior), centerX - barW / 2 - gap / 2, baseY - priorH - 6);
    ctx.fillText(formatRatio(group.current), centerX + barW / 2 + gap / 2, baseY - currentH - 6);

    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(baseX + 8, baseY);
    ctx.lineTo(baseX + groupW - 8, baseY);
    ctx.stroke();
  });
}

function renderAgingChart(agingData, canvas = chartAging, containerEl = graphArea) {
  if (!canvas || !agingData?.buckets?.length) return;

  canvas.hidden = false;
  const height = 260;
  const { ctx, width } = setupCanvas(canvas, height, containerEl);

  const colors = ["#2c4a7c", "#4a6fa5", "#6b8fc7", "#8fa3c4", "#a8b8d0"];
  const buckets = agingData.buckets.filter((b) => b.amount > 0);

  const margin = { top: 28, right: 16, bottom: 56, left: 16 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const barW = Math.min(52, chartW / Math.max(buckets.length, 1) - 14);
  const gap = (chartW - barW * buckets.length) / (buckets.length + 1);
  const baseY = margin.top + chartH;

  ctx.fillStyle = "#1a2a44";
  ctx.font = "600 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("만기구간별 당기기말잔액", width / 2, 16);

  const maxVal = Math.max(...buckets.map((b) => b.amount), 1) * 1.15;

  buckets.forEach((bucket, i) => {
    const x = margin.left + gap + i * (barW + gap);
    const barH = (bucket.amount / maxVal) * chartH;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, baseY - barH, barW, barH);

    ctx.fillStyle = "#333";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(formatNumber(bucket.amount), x + barW / 2, baseY - barH - 4);
    ctx.fillText(formatPercent(bucket.ratio), x + barW / 2, baseY - barH - 16);

    ctx.save();
    ctx.translate(x + barW / 2, baseY + 10);
    ctx.rotate(-0.4);
    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(bucket.label, 0, 0);
    ctx.restore();
  });

  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(margin.left, baseY);
  ctx.lineTo(width - margin.right, baseY);
  ctx.stroke();
}

function renderConcentrationChart(concentrationData, canvas = chartConcentration, containerEl = graphArea) {
  if (!canvas || !concentrationData?.customers?.length) return;

  canvas.hidden = false;
  const customers = concentrationData.customers;
  const barHeight = 22;
  const height = Math.max(220, customers.length * (barHeight + 8) + 56);
  const margin = { top: 32, right: 24, bottom: 16, left: 110 };
  const labelReserve = 155;
  const chartMinWidth = margin.left + 360 + labelReserve + margin.right;
  const { ctx, width } = setupCanvas(canvas, height, containerEl, chartMinWidth);

  const chartW = width - margin.left - margin.right - labelReserve;
  const maxVal = Math.max(...customers.map((c) => c.amount), 1) * 1.08;

  if (!canvas.parentElement?.classList.contains("graph-chart-scroll")) {
    const wrap = document.createElement("div");
    wrap.className = "graph-chart-scroll";
    canvas.parentNode.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
  }
  canvas.style.minWidth = `${chartMinWidth}px`;

  ctx.fillStyle = "#1a2a44";
  ctx.font = "600 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("상위 5개 거래처 잔액", width / 2, 16);

  customers.forEach((customer, i) => {
    const y = margin.top + i * (barHeight + 8);
    const barW = (customer.amount / maxVal) * chartW;
    const name = customer.customer.length > 10 ? `${customer.customer.slice(0, 10)}…` : customer.customer;
    const label = `${formatCompactAmount(customer.amount)} (${formatPercent(customer.ratio)})`;

    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(name, margin.left - 8, y + barHeight / 2 + 4);

    ctx.fillStyle = i < 3 ? "#2c4a7c" : "#8fa3c4";
    ctx.fillRect(margin.left, y, barW, barHeight);

    ctx.fillStyle = "#333";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    const labelX = margin.left + barW + 8;
    ctx.fillText(label, labelX, y + barHeight / 2 + 4);
  });
}

function renderCharts(chartData) {
  if (!chartData) {
    clearChart();
    return;
  }

  const displayData = { ...chartData };
  if (displayData.concentration?.customers?.length > 5) {
    displayData.concentration = {
      customers: displayData.concentration.customers.slice(0, 5),
    };
  }

  const hasChart = displayData.turnover || displayData.aging || displayData.concentration;
  if (!hasChart) {
    clearChart();
    return;
  }

  const mountedInResults = mountArChartsInResults(displayData);
  if (!mountedInResults) {
    restoreChartsToGraphSection();
    graphSection.hidden = false;
    const placeholder = graphArea.querySelector(".output-placeholder");
    if (placeholder) placeholder.hidden = true;
  }

  if (displayData.turnover) renderTurnoverChart(displayData.turnover);
  else if (chartTurnover) chartTurnover.hidden = true;

  if (displayData.aging) renderAgingChart(displayData.aging);
  else if (chartAging) chartAging.hidden = true;

  if (displayData.concentration) renderConcentrationChart(displayData.concentration);
  else if (chartConcentration) chartConcentration.hidden = true;
}

function clearChart() {
  restoreChartsToGraphSection();
  if (graphSection) graphSection.hidden = true;
  for (const canvas of [chartTurnover, chartAging, chartConcentration]) {
    if (!canvas) continue;
    canvas.hidden = true;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  const placeholder = graphArea?.querySelector(".output-placeholder");
  if (placeholder) placeholder.hidden = false;
}

function buildCalculationResultsHtml(calcResults, { includeFooter = true } = {}) {
  const { account, accountData, items } = calcResults;
  if (accountData.format === "ar") {
    return buildArAnalysisResultsHtml(calcResults, { includeFooter });
  }

  const priorLabel = "전기금액";
  const currentLabel = "당기금액";

  let html = `
    <div class="calc-result-header">
      <h4>${escapeHtml(account)}</h4>
      <p class="calc-source-note">원본 수치 — ${priorLabel}: <strong>${formatNumber(accountData.priorAmount)}</strong> · ${currentLabel}: <strong>${formatNumber(accountData.currentAmount)}</strong></p>
    </div>
  `;

  for (const item of items) {
    if (item.type === "variance") {
      html += `<div class="calc-block">
        <h5 class="calc-block-title">증감분석</h5>`;
      if (!item.ok) {
        html += `<p class="result-error">${escapeHtml(item.error)}</p>`;
        html += `<dl class="calc-formula-list">
          <div class="calc-formula-row"><dt>증감액</dt><dd>당기금액 − 전기금액 = ${formatNumber(item.currentAmount)} − ${formatNumber(item.priorAmount)} = <strong>${formatNumber(item.changeAmount)}</strong></dd></div>
        </dl>`;
      } else {
        html += `<dl class="calc-formula-list">
          <div class="calc-formula-row"><dt>증감액</dt><dd>당기금액 − 전기금액 = ${formatNumber(item.currentAmount)} − ${formatNumber(item.priorAmount)} = <strong>${formatNumber(item.changeAmount)}</strong></dd></div>
          <div class="calc-formula-row"><dt>증감률</dt><dd>(당기금액 − 전기금액) ÷ 전기금액 × 100 = ${formatNumber(item.changeAmount)} ÷ ${formatNumber(item.priorAmount)} × 100 = <strong>${formatPercent(item.changeRate)}</strong></dd></div>
        </dl>`;
      }
      html += `</div>`;
    }

    if (item.type === "composition") {
      html += `<div class="calc-block">
        <h5 class="calc-block-title">구성비분석</h5>`;
      if (!item.ok) {
        html += `<p class="result-error">${escapeHtml(item.error)}</p>`;
      } else {
        html += `<dl class="calc-formula-list">
          <div class="calc-formula-row"><dt>구성비</dt><dd>당기금액 ÷ 당기 총액 × 100 = ${formatNumber(item.currentAmount)} ÷ ${formatNumber(item.totalCurrentAmount)} × 100 = <strong>${formatPercent(item.compositionRatio)}</strong></dd></div>
        </dl>`;
      }
      html += `</div>`;
    }

    if (item.type === "turnover") html += renderTurnoverBlock(item);
    if (item.type === "aging") html += renderAgingBlock(item);
    if (item.type === "concentration") html += renderConcentrationBlock(item);
    if (item.type === "relatedParty") html += renderRelatedPartyBlock(item);
    if (item.type === "watchlist") html += renderWatchlistBlock(item);
    if (item.type === "allowanceSim") html += renderAllowanceSimBlock(item);
    if (item.type === "allowance") html += renderAllowanceBlock(item);
  }

  if (includeFooter) {
    html += `<p class="calc-footer-note">※ 모든 수치는 JavaScript 코드로 계산되었습니다. AI는 사용하지 않았습니다.</p>`;
  }

  return html;
}

function renderCalculationResults(calcResults) {
  resultsArea.innerHTML = buildCalculationResultsHtml(calcResults);
  renderCharts(calcResults.chartData);
  updateAddToReportButton();

  const limitSelect = document.getElementById("watchlist-display-limit");
  limitSelect?.addEventListener("change", (e) => {
    watchlistDisplayLimit = e.target.value === "all" ? "all" : Number(e.target.value) || 5;
    window.ArAnalysis?.saveArCriteria({
      ...window.ArAnalysis.loadArCriteria(),
      watchlistDisplayLimit: watchlistDisplayLimit === "all" ? "all" : watchlistDisplayLimit,
    });
    refreshWatchlistDisplayInResults();
  });
}

// Expose for automated UI tests
window.buildCalculationResultsHtml = buildCalculationResultsHtml;
window.buildArAnalysisResultsHtml = buildArAnalysisResultsHtml;
window.buildKeyCautionItems = buildKeyCautionItems;

function resetAnalyticalForm() {
  selectedDataFile = null;
  parsedDataset = null;
  parseError = null;
  selectedAccount = "";
  selectedProcedureIds = new Set();
  currentCalcResults = null;
  currentAnalysisMeta = null;
  if (dataFileInput) dataFileInput.value = "";
  dataFileNameEl.textContent = "선택된 파일 없음";
  accountSelect.innerHTML = '<option value="">파일 업로드 후 계정과목이 표시됩니다</option>';
  procedureChecklist.innerHTML = "";
  procedureAccountLabel.textContent = "계정과목을 먼저 선택하세요.";
  previewArea.innerHTML = '<p class="output-placeholder">파일 업로드 후 열 이름과 샘플 데이터가 표시됩니다.</p>';
  resultsArea.innerHTML = '<p class="output-placeholder">분석 실행 후 코드 기반 계산 결과가 여기에 표시됩니다.</p>';
  clearChart();
  analysisStatusEl.textContent = "";
  analysisStatusEl.className = "analysis-status";
  loadReportEntries();
  renderReportEntries();
  updateAddToReportButton();
  updateRunButtonState();
}

async function handleFileUpload(file) {
  selectedDataFile = file || null;
  parsedDataset = null;
  parseError = null;
  selectedAccount = "";
  selectedProcedureIds = new Set();

  dataFileNameEl.textContent = file ? file.name : "선택된 파일 없음";

  if (!file) {
    accountSelect.innerHTML = '<option value="">파일 업로드 후 계정과목이 표시됩니다</option>';
    procedureChecklist.innerHTML = "";
    procedureAccountLabel.textContent = "계정과목을 먼저 선택하세요.";
    previewArea.innerHTML = '<p class="output-placeholder">파일 업로드 후 열 이름과 샘플 데이터가 표시됩니다.</p>';
    currentCalcResults = null;
    currentAnalysisMeta = null;
    resultsArea.innerHTML = '<p class="output-placeholder">분석 실행 후 코드 기반 계산 결과가 여기에 표시됩니다.</p>';
    clearChart();
    updateAddToReportButton();
    updateRunButtonState();
    return;
  }

  previewArea.innerHTML = '<p class="output-placeholder">파일을 읽는 중...</p>';
  analysisStatusEl.textContent = "파일 파싱 중...";
  analysisStatusEl.className = "analysis-status";

  try {
    parsedDataset = await window.AnalyticalCalc.parseAnalyticalFile(file);
    parseError = null;
    populateAccountSelect();
    renderPreview(parsedDataset);
    analysisStatusEl.textContent = `파일 로드 완료 — ${parsedDataset.accounts.length}개 계정과목`;
    analysisStatusEl.className = "analysis-status analysis-status-success";
  } catch (err) {
    parseError = err.message;
    parsedDataset = null;
    renderPreviewError(err.message);
    accountSelect.innerHTML = '<option value="">파일 오류 — 계정을 불러올 수 없습니다</option>';
    analysisStatusEl.textContent = err.message;
    analysisStatusEl.className = "analysis-status analysis-status-error";
  }

  updateRunButtonState();
}

document.getElementById("screen-home")?.addEventListener("click", (e) => {
  const card = e.target.closest(".tool-card");
  if (!card) return;
  openTool(card.dataset.tool);
});

casePdfBtn?.addEventListener("click", () => casePdfInput?.click());
casePdfInput?.addEventListener("change", () => handleCasePdfSelected(casePdfInput.files?.[0] || null));
caseImageBtn?.addEventListener("click", () => caseImageInput?.click());
caseImageInput?.addEventListener("change", () => {
  handleCaseImageSelected(caseImageInput.files);
  caseImageInput.value = "";
});
caseImageClearAllBtn?.addEventListener("click", clearCaseImages);
caseTextInput?.addEventListener("input", updateCaseAnalyzeButtonState);
caseAnalyzeBtn?.addEventListener("click", runCaseAnalysis);
caseClearBtn?.addEventListener("click", clearCaseWorkspace);

bindCasePasteHandlers();

backHomeBtn?.addEventListener("click", () => showScreen("home"));
backHomeFromToolkitBtn?.addEventListener("click", () => showScreen("home"));
backHomeFromPlaceholderBtn?.addEventListener("click", () => showScreen("home"));
placeholderOpenAnalyticalBtn?.addEventListener("click", () => openTool("analytical"));

renderToolboxHome();
restoreCaseFromStorage();
updateCaseAnalyzeButtonState();

dataUploadBtn?.addEventListener("click", () => dataFileInput?.click());

dataFileInput?.addEventListener("change", async () => {
  const file = dataFileInput.files?.[0];
  await handleFileUpload(file || null);
});

accountSelect?.addEventListener("change", () => {
  selectedAccount = accountSelect.value;
  selectedProcedureIds = new Set();
  renderProcedureChecklist();
  if (currentCalcResults) {
    renderCalculationResults(currentCalcResults);
    if (analysisStatusEl) {
      analysisStatusEl.textContent = `이전 분석 결과 표시 중 (${currentCalcResults.account}). 다른 계정을 분석하려면 절차를 선택하고 분석을 실행하세요.`;
      analysisStatusEl.className = "analysis-status analysis-status-info";
    }
  }
  updateRunButtonState();
});

procedureChecklist?.addEventListener("change", (e) => {
  if (!e.target.classList.contains("procedure-check")) return;
  const id = e.target.value;
  if (e.target.checked) selectedProcedureIds.add(id);
  else selectedProcedureIds.delete(id);
  updateRunButtonState();
});

for (const input of [
  arNormalDaysInput, arCautionDaysInput, arRelatedRatioInput, arRelatedDaysGapInput,
  arWatchDaysInput, arPerformanceMaterialityInput, arWatchArRatioInput, arWatchOverdueDaysInput,
  arWatchBalanceIncInput, arWatchArToSalesInput, arWatchMinScoreInput,
  arRateNormalInput, arRateWithin30Input, arRate31to60Input, arRate61to90Input, arRateOver90Input,
]) {
  input?.addEventListener("change", () => readArCriteriaFromForm());
}

arWatchDisplayLimitSelect?.addEventListener("change", () => {
  readArCriteriaFromForm();
  refreshWatchlistDisplayInResults();
});

resultsArea?.addEventListener("input", (e) => {
  if (e.target.id === "company-allowance-input") {
    companyRecordedAllowance = e.target.value;
    refreshAllowanceSimulatorInResults();
  }
});

runAnalysisBtn?.addEventListener("click", () => {
  if (!parsedDataset || !selectedAccount || !selectedProcedureIds.size) return;

  try {
    const criteria = isArAccountSelected() ? readArCriteriaFromForm() : null;
    const calcResults = window.AnalyticalCalc.runAnalyticalCalculations(
      parsedDataset,
      selectedAccount,
      selectedProcedureIds,
      criteria
    );
    currentCalcResults = calcResults;
    currentAnalysisMeta = {
      account: selectedAccount,
      procedureIds: [...selectedProcedureIds],
      procedureLabels: getSelectedProcedures().map((p) => p.label),
      fileName: parsedDataset.fileName,
    };
    renderCalculationResults(calcResults);
    analysisStatusEl.textContent = "계산 완료 — 검토 후 보고서에 추가할 수 있습니다.";
    analysisStatusEl.className = "analysis-status analysis-status-success";
  } catch (err) {
    currentCalcResults = null;
    currentAnalysisMeta = null;
    resultsArea.innerHTML = `<p class="result-error">${escapeHtml(err.message)}</p>`;
    clearChart();
    updateAddToReportButton();
    analysisStatusEl.textContent = err.message;
    analysisStatusEl.className = "analysis-status analysis-status-error";
  }
});

addToReportBtn?.addEventListener("click", addCurrentAnalysisToReport);

finalReportBtn?.addEventListener("click", openFinalReportPreview);
finalReportCloseBtn?.addEventListener("click", closeFinalReportModal);
finalReportPdfBtn?.addEventListener("click", saveFinalReportPdf);
finalReportDownloadBtn?.addEventListener("click", downloadFinalReportHtml);
finalReportModal?.addEventListener("click", (e) => {
  if (e.target.dataset.action === "close-final-report") closeFinalReportModal();
});

reportEntriesArea?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (!id) return;

  if (action === "generate-draft") {
    e.stopPropagation();
    generateReportDraft(id);
    return;
  }

  if (action === "toggle") toggleReportEntry(id);
  if (action === "delete") deleteReportEntry(id);
  if (action === "up") moveReportEntry(id, "up");
  if (action === "down") moveReportEntry(id, "down");
});

reportEntriesArea?.addEventListener("input", (e) => {
  if (e.target.matches("[data-action='memo']")) {
    updateReportEntryMemo(e.target.dataset.id, e.target.value);
    return;
  }
  if (e.target.matches("[data-action='draft']")) {
    updateReportEntryDraft(e.target.dataset.id, e.target.value);
  }
});

loadReportEntries();
renderReportEntries();
updateAddToReportButton();
updateRunButtonState();
