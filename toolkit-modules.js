/**
 * Beta Toolkit 모듈 (연령분석·회계추정치·특수관계자 등, 70~80% 골격)
 */(function () {
  "use strict";

  function esc(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmt(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("ko-KR").format(Math.round(n));
  }

  function disclaimer() {
    return `<p class="tk-disclaimer">이 도구는 감사의견·중요왜곡표시위험을 확정하지 않습니다. 계산·체크리스트·판단근거·권장 후속감사절차만 제공합니다.</p>`;
  }

  function renderMateriality() {
    return `${disclaimer()}
    <div class="tk-panel" id="materiality-panel">
      <section class="tk-section">
        <h3>중요성 계산</h3>
        <div class="ar-criteria-grid">
          <label class="ar-criteria-field"><span>기준 지표</span>
            <select id="mat-benchmark" class="criteria-input">
              <option value="revenue">매출액</option>
              <option value="assets">총자산</option>
              <option value="profit">세전이익</option>
            </select>
          </label>
          <label class="ar-criteria-field"><span>기준 금액 (원)</span><input type="number" id="mat-base" class="criteria-input" min="0" step="1000000" value="10000000000" /></label>
          <label class="ar-criteria-field"><span>전사중요성 비율 (%)</span><input type="number" id="mat-pct" class="criteria-input" min="0.1" max="20" step="0.1" value="1" /></label>
          <label class="ar-criteria-field"><span>수행중요성 비율 (%)</span><input type="number" id="mat-perf-pct" class="criteria-input" min="50" max="90" step="1" value="75" /></label>
          <label class="ar-criteria-field"><span>명백히 사소 비율 (%)</span><input type="number" id="mat-trivial-pct" class="criteria-input" min="1" max="10" step="0.5" value="5" /></label>
        </div>
        <button type="button" id="mat-calc-btn" class="analyze-btn">계산</button>
        <div id="mat-result" class="tk-result"></div>
      </section>
    </div>`;
  }

  function calcMateriality() {
    const base = Number(document.getElementById("mat-base")?.value) || 0;
    const pct = Number(document.getElementById("mat-pct")?.value) || 1;
    const perfPct = Number(document.getElementById("mat-perf-pct")?.value) || 75;
    const trivialPct = Number(document.getElementById("mat-trivial-pct")?.value) || 5;
    const materiality = base * (pct / 100);
    const performance = materiality * (perfPct / 100);
    const trivial = materiality * (trivialPct / 100);
    const el = document.getElementById("mat-result");
    if (!el) return;
    el.innerHTML = `<table class="calc-table"><tbody>
      <tr><th>전사중요성</th><td class="num">${fmt(materiality)}원</td></tr>
      <tr><th>수행중요성</th><td class="num">${fmt(performance)}원</td></tr>
      <tr><th>명백히 사소한 왜곡표시</th><td class="num">${fmt(trivial)}원</td></tr>
    </tbody></table>
    <p class="fr-formula">전사중요성 = ${fmt(base)} × ${pct}% = ${fmt(materiality)}</p>
    <p class="fr-formula">수행중요성 = ${fmt(materiality)} × ${perfPct}% = ${fmt(performance)}</p>
    <p class="fr-formula">명백히 사소 = ${fmt(materiality)} × ${trivialPct}% = ${fmt(trivial)}</p>`;
  }

  function renderSampling() {
    return `${disclaimer()}
    <div class="tk-panel" id="sampling-panel">
      <section class="tk-section">
        <h3>감사표본추출</h3>
        <label class="ar-criteria-field"><span>수행중요성 (원)</span><input type="number" id="sample-materiality" class="criteria-input" value="300000000" /></label>
        <label class="ar-criteria-field"><span>모집단 (금액, 쉼표 구분)</span>
          <textarea id="sample-population" class="criteria-input tk-textarea" rows="4" placeholder="1000000, 2500000, 500000, ..."></textarea>
        </label>
        <div class="tk-btn-row">
          <button type="button" id="sample-random-btn" class="secondary-btn">Random 추출 (5건)</button>
          <button type="button" id="sample-mus-btn" class="secondary-btn">MUS 간편 추출</button>
          <button type="button" id="sample-high-btn" class="secondary-btn">고액항목 선정</button>
        </div>
        <div id="sample-result" class="tk-result"></div>
      </section>
    </div>`;
  }

  function parsePopulation() {
    const raw = document.getElementById("sample-population")?.value || "";
    return raw.split(/[\s,;\n]+/).map((s) => Number(s.replace(/,/g, ""))).filter((n) => n > 0);
  }

  function runRandomSample() {
    const pop = parsePopulation();
    const el = document.getElementById("sample-result");
    if (!pop.length) { el.innerHTML = "<p class='calc-info'>모집단을 입력하세요.</p>"; return; }
    const shuffled = [...pop].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(5, pop.length));
    el.innerHTML = `<p>Random Sampling — ${picked.length}건 (추가 검토 필요)</p><ul>${picked.map((v, i) => `<li>${i + 1}. ${fmt(v)}원</li>`).join("")}</ul>`;
  }

  function runMusSample() {
    const pop = parsePopulation();
    const mat = Number(document.getElementById("sample-materiality")?.value) || 0;
    const el = document.getElementById("sample-result");
    if (!pop.length || !mat) { el.innerHTML = "<p class='calc-info'>모집단과 수행중요성을 입력하세요.</p>"; return; }
    const total = pop.reduce((a, b) => a + b, 0);
    const interval = Math.max(mat, 1);
    const picked = [];
    let cum = 0;
    for (const v of pop) {
      cum += v;
      if (cum >= interval * (picked.length + 1)) picked.push(v);
    }
    if (!picked.length) picked.push(pop[0]);
    el.innerHTML = `<p>MUS 간편 추출 — 간격 ${fmt(interval)}원 · ${picked.length}건</p><ul>${picked.map((v, i) => `<li>${i + 1}. ${fmt(v)}원</li>`).join("")}</ul>`;
  }

  function runHighValue() {
    const pop = parsePopulation();
    const mat = Number(document.getElementById("sample-materiality")?.value) || 0;
    const el = document.getElementById("sample-result");
    const picked = pop.filter((v) => v >= mat);
    el.innerHTML = `<p>고액항목 (≥ 수행중요성 ${fmt(mat)}원) — ${picked.length}건</p><ul>${picked.map((v, i) => `<li>${i + 1}. ${fmt(v)}원</li>`).join("")}</ul>`;
  }

  function renderContract() {
    const items = [
      "계약 당사자·서명권한 확인",
      "대가(가격) 및 변동 조건",
      "인도·수령 시점 (수익인식 시점)",
      "검수·승인 조건",
      "반품·환불·보증 조건",
      "계약기간·갱신·해지 조건",
      "라이선스·지적재산권",
      "관련 당사자 거래 여부",
      "우발부채·손실 가능성",
    ];
    return `${disclaimer()}
    <div class="tk-panel">
      <section class="tk-section">
        <h3>계약서 검토 체크리스트</h3>
        <p class="tk-section-note">수익인식(IFRS 15) 관련 핵심 확인사항 — 감사인이 직접 판단</p>
        <ul class="tk-checklist">${items.map((t) => `<li><label><input type="checkbox" /> ${esc(t)}</label></li>`).join("")}</ul>
        <h4>계약조건별 위험포인트 (참고)</h4>
        <ul class="tk-bullets">
          <li>가변대가·추가대가 — 추정·제약 조건 추가 검토 필요</li>
          <li>다년계약 — 이행의무 분해 추가 검토 필요</li>
          <li>관련자 거래 — 공정가치·승인 절차 추가 검토 필요</li>
        </ul>
      </section>
    </div>`;
  }

  function renderEstimates(analysis) {
    const risks = (analysis?.riskAssessment?.risks || [])
      .filter((r) => /대손|충당|회수|추정|매출채권/.test([r.riskTitle, r.whyThisRisk?.summary].join("")))
      .slice(0, 3);

    const riskHtml = risks.length
      ? `<h4>사례 연계 이슈 (추가 검토 필요)</h4><ul>${risks.map((r) => `<li>${esc(r.riskTitle)} — ${esc(r.whyThisRisk?.summary || "")}</li>`).join("")}</ul>`
      : "";

    const checks = [
      "추정 방법론·가정·입력데이터 이해",
      "경영진 추정과 과거 실적·업황 비교",
      "민감도 분석·시나리오 검토",
      "전문가·외부자료 활용 여부 확인",
      "후속사건·보고기간 후 정보 반영",
      "공시·주석 일관성 확인",
      "회계정책·기준서 준수 여부",
      "감사인 독립 재계산·시뮬레이션",
    ];

    const followups = [
      "추정 가정에 대한 경영진·전문가 인터뷰",
      "과거 추정 정확도(사후검토) 확인",
      "민감 변수에 대한 추가 분석적 절차",
      "전문가 업무 범위·독립성 검토",
    ];

    return `${disclaimer()}
    <div class="tk-panel">
      <section class="tk-section">
        <h3>회계추정치 검토</h3>
        <p class="tk-section-note">대손충당금·평가추정 등 회계추정치 검토 시 확인사항. 연령표 계산은 「연령분석」·「분석적 절차」를 병행하세요.</p>
        ${riskHtml}
        <h4>검토 체크리스트</h4>
        <ul class="tk-checklist">${checks.map((c) => `<li><label><input type="checkbox" /> ${esc(c)}</label></li>`).join("")}</ul>
        <h4>회수가능성·추정 판단 시 고려사항</h4>
        <ul class="tk-bullets">
          <li>보고기간 후 현금회수(후속사건) — 추가 검토 필요</li>
          <li>거래처 재무상태·업황 변화 — 추가 검토 필요</li>
          <li>분쟁·소송·회생절차 진행 여부 — 추가 검토 필요</li>
        </ul>
        <h4>권장 후속감사절차 (후보)</h4>
        <ul class="tk-followup-list">${followups.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <button type="button" id="est-open-analytical-btn" class="secondary-btn">분석적 절차 열기</button>
      </section>
    </div>`;
  }

  function renderAging(analysis) {
    const risks = (analysis?.riskAssessment?.risks || [])
      .filter((r) => /연령|회수|연체|채권/.test([r.riskTitle, r.whyThisRisk?.summary].join("")))
      .slice(0, 3);

    const riskHtml = risks.length
      ? `<h4>사례 연계 이슈 (추가 검토 필요)</h4><ul>${risks.map((r) => `<li>${esc(r.riskTitle)} — ${esc(r.whyThisRisk?.summary || "")}</li>`).join("")}</ul>`
      : "";

    const checks = [
      "연령표·개별 잔액 목록 입수",
      "연령 구간 기준(30/60/90일 등) 확인",
      "회수지연·연체 거래처 식별",
      "기말 전후 대량 회수·상계 거래 검토",
      "특수관계자 채권 별도 표시",
      "외화·연체료·조정 항목 반영 여부",
      "연령표와 총계·원장 일치 확인",
    ];

    const followups = [
      "회수지연 거래처에 대한 추가 분석적 절차",
      "보고기간 후 회수 증빙 검토",
      "외부조회 대상 여부 검토",
      "대손충당금 추정과 연령 결과 비교",
    ];

    return `${disclaimer()}
    <div class="tk-panel">
      <section class="tk-section">
        <h3>연령분석</h3>
        <p class="tk-section-note">연령표 검토 체크리스트와 후속절차 후보. 상세 연령·회수기간 계산은 Excel·CSV 업로드 후 「분석적 절차」에서 수행할 수 있습니다.</p>
        ${riskHtml}
        <h4>연령분석 체크리스트</h4>
        <ul class="tk-checklist">${checks.map((c) => `<li><label><input type="checkbox" /> ${esc(c)}</label></li>`).join("")}</ul>
        <h4>권장 후속감사절차 (후보)</h4>
        <ul class="tk-followup-list">${followups.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <button type="button" id="aging-open-analytical-btn" class="secondary-btn">분석적 절차(데이터 업로드) 열기</button>
      </section>
    </div>`;
  }

  function renderRelatedParty(analysis) {
    const risks = (analysis?.riskAssessment?.risks || [])
      .filter((r) => /특수관계|관련자|지배|종속/.test([r.riskTitle, r.whyThisRisk?.summary].join("")))
      .slice(0, 3);

    const riskHtml = risks.length
      ? `<h4>사례 연계 이슈 (추가 검토 필요)</h4><ul>${risks.map((r) => `<li>${esc(r.riskTitle)} — ${esc(r.whyThisRisk?.summary || "")}</li>`).join("")}</ul>`
      : "";

    const checks = [
      "특수관계자 명단·변동 식별",
      "매출·매입·자금대여·담보 등 거래 유형 파악",
      "거래 조건·가격의 공정성 검토",
      "이사회·주주 승인·공시 요건 확인",
      "기말 전후 비정상 거래·상계 검토",
      "미공시 관련자 거래 가능성 검토",
      "종속·관계기업 투자·내부거래 소거",
    ];

    const followups = [
      "관련자 거래 계약서·승인 문서 검토",
      "공정가치·시가 비교 자료 요청",
      "법률자문·공시 담당자 확인",
      "분석적 절차로 관련자 거래 비중 분석",
    ];

    return `${disclaimer()}
    <div class="tk-panel">
      <section class="tk-section">
        <h3>특수관계자 분석</h3>
        <p class="tk-section-note">특수관계자 거래 식별·검토 체크리스트. 데이터 기반 비중 분석은 「분석적 절차」와 병행할 수 있습니다.</p>
        ${riskHtml}
        <h4>검토 체크리스트</h4>
        <ul class="tk-checklist">${checks.map((c) => `<li><label><input type="checkbox" /> ${esc(c)}</label></li>`).join("")}</ul>
        <h4>권장 후속감사절차 (후보)</h4>
        <ul class="tk-followup-list">${followups.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <button type="button" id="rp-open-analytical-btn" class="secondary-btn">분석적 절차(특수관계자 분석) 열기</button>
      </section>
    </div>`;
  }

  const RENDERERS = {
    materiality: renderMateriality,
    sampling: renderSampling,
    "contract-review": renderContract,
    "estimates-review": (ctx) => renderEstimates(ctx?.analysis),
    "aging-analysis": (ctx) => renderAging(ctx?.analysis),
    "related-party": (ctx) => renderRelatedParty(ctx?.analysis),
  };

  function bindEvents(toolId) {
    if (toolId === "materiality") {
      document.getElementById("mat-calc-btn")?.addEventListener("click", calcMateriality);
      calcMateriality();
    }
    if (toolId === "sampling") {
      document.getElementById("sample-random-btn")?.addEventListener("click", runRandomSample);
      document.getElementById("sample-mus-btn")?.addEventListener("click", runMusSample);
      document.getElementById("sample-high-btn")?.addEventListener("click", runHighValue);
    }
    if (toolId === "estimates-review") {
      document.getElementById("est-open-analytical-btn")?.addEventListener("click", () => {
        window.openToolkit?.("analytical");
      });
    }
    if (toolId === "aging-analysis") {
      document.getElementById("aging-open-analytical-btn")?.addEventListener("click", () => {
        window.openToolkit?.("analytical");
      });
    }
    if (toolId === "related-party") {
      document.getElementById("rp-open-analytical-btn")?.addEventListener("click", () => {
        window.openToolkit?.("analytical");
      });
    }
  }

  function render(toolId, caseContext, container) {
    const fn = RENDERERS[toolId];
    if (!fn || !container) return false;
    container.innerHTML = fn(caseContext);
    bindEvents(toolId);
    return true;
  }

  window.ToolkitModules = { render, RENDERERS };
})();
