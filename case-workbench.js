/**

 * Case Workbench — 텍스트·이미지·PDF 입력 · Navigator API

 */

(function () {

  "use strict";



  async function extractPdf(file) {

    const form = new FormData();

    form.append("pdf", file);

    const res = await fetch("/api/extract-pdf", { method: "POST", body: form });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "PDF 추출 실패");

    return data;

  }



  async function extractImage(file) {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch("/api/extract-image", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "이미지 추출 실패");
    return data;
  }

  async function extractImages(files, onProgress) {
    const list = Array.from(files || []).filter((f) => f?.type?.startsWith("image/"));
    if (!list.length) throw new Error("추출할 이미지가 없습니다.");

    const parts = [];
    for (let i = 0; i < list.length; i += 1) {
      if (onProgress) onProgress(i + 1, list.length);
      const data = await extractImage(list[i]);
      const text = data.extractedText?.trim();
      if (text) parts.push(text);
    }

    const extractedText = parts.join("\n\n");
    if (!extractedText) throw new Error("이미지에서 텍스트를 추출하지 못했습니다.");

    return {
      extractedText,
      pageCount: list.length,
      extractedLength: extractedText.length,
      inputSource: "image",
    };
  }



  async function analyzeNavigator(caseText, options = {}) {

    const res = await fetch("/api/analyze-navigator", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({

        caseText,

        problemNumber: options.problemNumber || "",

        year: options.year || "",

        inputSource: options.inputSource || "paste",

        sliceProblem: options.sliceProblem,

      }),

    });

    const data = await res.json();

    if (!res.ok) {

      const err = new Error(data.error || "Navigator 분석 실패");

      err.status = res.status;

      err.payload = data;

      throw err;

    }

    return data;

  }



  /** @deprecated legacy workbench */

  async function analyzeCase(caseText, problemNumber) {

    const res = await fetch("/api/analyze", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ caseText, problemNumber }),

    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "사례 분석 실패");

    return data;

  }



  function renderAllTools(tools, recommendedIds) {

    const escapeHtml = (text) =>

      String(text ?? "")

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;");



    const recSet = new Set(recommendedIds || []);

    return `<div class="tool-grid" id="tool-grid">${tools

      .map((tool) => {

        const isAvailable = tool.status === "available";

        const isBeta = tool.status === "beta";

        const statusLabel = isAvailable ? "사용 가능" : isBeta ? "Beta" : "Coming Soon";

        const statusClass = isAvailable ? "" : isBeta ? " beta" : " soon";

        const classes = [

          "tool-card",

          isAvailable ? "is-available" : isBeta ? "is-beta" : "is-soon",

        ].join(" ");

        return `<button type="button" class="${classes}" data-tool="${escapeHtml(tool.id)}" role="listitem">

          <span class="tool-card-icon">${tool.icon}</span>

          <span class="tool-card-title">${escapeHtml(tool.title)}</span>

          <span class="tool-card-desc">${escapeHtml(tool.shortDesc)}</span>

          ${recSet.has(tool.id) ? '<span class="tool-card-reason">추천</span>' : ""}

          <span class="tool-card-status${statusClass}">${statusLabel}</span>

        </button>`;

      })

      .join("")}</div>`;

  }



  window.CaseWorkbench = {

    extractPdf,

    extractImage,
    extractImages,

    analyzeNavigator,

    analyzeCase,

    renderAllTools,

  };

})();

