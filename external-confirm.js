/**
 * 외부조회 Toolkit (2순위)
 * AI/규칙 기반 추천 · 조회서 양식 · 체크리스트 (메일·회신관리 없음)
 */
(function () {
  "use strict";

  const CONFIRM_TARGETS = [
    {
      id: "ar",
      label: "매출채권(채무자) 조회",
      keywords: ["매출채권", "외상매출", "채권", "수취어음", "받을어음"],
      defaultReason: "잔액·회수조건·담보·상계 등 독립적 확인",
      checklist: [
        "조회일 기준 잔액이 장부와 일치하는지",
        "만기일·이자조건·상환일정 확인",
        "회사에 대한 채무(상계) 존재 여부",
        "담보·보증 제공 여부",
        "조건부 합의·우발채무 관련 문구",
      ],
      templateKey: "ar",
    },
    {
      id: "ap",
      label: "매입채무(채권자) 조회",
      keywords: ["매입채무", "외상매입", "미지급금"],
      defaultReason: "미지급 잔액·약정 조건 확인",
      checklist: [
        "조회일 기준 잔액 일치 여부",
        "지급 조건·만기 확인",
        "회사에 대한 채권(상계) 존재 여부",
        "우발부채·소송 관련 문구",
      ],
      templateKey: "ap",
    },
    {
      id: "bank",
      label: "금융기관 조회",
      keywords: ["차입", "대출", "예금", "금융", "한도", "담보", "어음할인"],
      defaultReason: "차입·예금·한도·담보·우발채무 확인",
      checklist: [
        "차입금·예금 잔액 일치",
        "한도·만기·이자율·상환조건",
        "담보·보증·약정 사항",
        "미결제 파생상품·외화포지션",
        "우발채무·소송 관련 문구",
      ],
      templateKey: "bank",
    },
    {
      id: "legal",
      label: "법률전문가 조회",
      keywords: ["소송", "분쟁", "법률", "claim", "claim"],
      defaultReason: "소송·분쟁·우발채무 관련 법률적 평가",
      checklist: [
        "계류 중 소송·중재 현황",
        "결과 가능성 및 금액 추정 근거",
        "회계처리·공시 영향",
        "우발부채 인식 요건 검토",
      ],
      templateKey: "legal",
    },
  ];

  const TEMPLATES = {
    ar: `외부조회서 (매출채권)

[조회 수신] ______________________ 귀중
[조회 발신] ______________________ (감사인)
[피감사회사] ______________________

아래 잔액이 귀사 기록과 일치하는지 회신하여 주시기 바랍니다.
불일치 시 차이 내역을 기재해 주십오.

조회 기준일: ____년 __월 __일

| 거래처명 | 장부금액 | 회신금액 | 비고 |
|---------|---------|---------|-----|
|         |         |         |     |

□ 상기 금액이 귀사 기록과 일치함
□ 불일치 (사유: _________________)

기타 확인사항:
- 회사에 대한 채무(상계) 여부: ___________
- 담보·보증: ___________
- 조건부 합의: ___________

회신자: ___________  직위: ___________  일자: ___________
※ 본 양식은 감사인 검토용 초안입니다.`,
    ap: `외부조회서 (매입채무)

[조회 수신] ______________________ 귀중
[피감사회사] ______________________ 의 채무

조회 기준일: ____년 __월 __일

| 공급자 | 장부금액 | 회신금액 | 비고 |
|-------|---------|---------|-----|
|       |         |         |     |

회신자: ___________  일자: ___________`,
    bank: `금융기관 조회서

[조회 수신] ______________________ 은행 귀중
[피감사회사] ______________________

조회 기준일: ____년 __월 __일

1. 차입금 잔액: _______________
2. 예금 잔액: _______________
3. 한도·담보·약정: _______________
4. 우발채무·소송: _______________

회신 담당: ___________  일자: ___________`,
    legal: `법률전문가 조회서

[조회 수신] ______________________ 귀중

1. 계류 중 소송·분쟁 목록
2. 결과 가능성 및 금액 추정 근거
3. 회계처리·공시에 대한 의견

※ 감사인 최종 판단용 참고자료입니다.`,
  };

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatNumber(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("ko-KR").format(n);
  }

  function collectEvidenceFromAnalysis(analysis) {
    const items = [];
    for (const block of analysis?.responseProcedures?.byRisk || []) {
      for (const ev of block.requiredEvidence || []) {
        if (/외부조회/.test(ev.requestMethod || "") || /조회/.test(ev.name || "")) {
          items.push({
            name: ev.name,
            target: ev.requestTarget,
            items: ev.requestItems || [],
            reason: ev.reason,
            relatedRisk: block.responseFocus,
          });
        }
      }
    }
    return items;
  }

  function recommendTargets(analysis, focusAccount = "") {
    const text = [
      focusAccount,
      JSON.stringify(analysis || {}),
      ...(analysis?.riskAssessment?.risks || []).map((r) => [r.riskTitle, ...(r.sourceFacts || [])].join(" ")),
    ].join(" ").toLowerCase();

    const evidence = collectEvidenceFromAnalysis(analysis);
    const results = [];

    for (const target of CONFIRM_TARGETS) {
      let score = 0;
      const reasons = [];

      for (const kw of target.keywords) {
        if (text.includes(kw.toLowerCase())) {
          score += 2;
          reasons.push(`사례/계정 키워드 「${kw}」 관련 — 추가 검토 필요`);
        }
      }

      for (const ev of evidence) {
        const evText = [ev.name, ev.target, ev.reason, ...(ev.items || [])].join(" ").toLowerCase();
        if (target.keywords.some((kw) => evText.includes(kw.toLowerCase())) || /외부조회/.test(evText)) {
          score += 4;
          reasons.push(ev.reason || `${ev.name} — 외부조회 증거 후보`);
        }
      }

      if (score > 0) {
        results.push({
          ...target,
          score,
          reasons: [...new Set(reasons)],
          recommendLevel: score >= 4 ? "추가 검토 필요" : "검토 고려",
        });
      }
    }

    if (!results.length && focusAccount) {
      const matched = CONFIRM_TARGETS.find((t) => t.keywords.some((kw) => focusAccount.includes(kw)));
      if (matched) {
        results.push({
          ...matched,
          score: 1,
          reasons: [`선택 계정「${focusAccount}」— 외부조회 필요 여부 추가 검토`],
          recommendLevel: "검토 고려",
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  function needsConfirmationSummary(targets) {
    if (!targets.length) {
      return {
        needed: false,
        message: "현재 입력·사례 기준으로 외부조회가 강하게 시사되지 않습니다. 감사인 판단으로 필요 시 수행하세요.",
      };
    }
    const strong = targets.filter((t) => t.score >= 4);
    return {
      needed: true,
      message:
        strong.length > 0
          ? `외부조회가 ${strong.length}개 영역에서 추가 검토가 필요해 보입니다. (위험 확정 아님)`
          : `${targets.length}개 영역에서 외부조회 검토를 고려할 수 있습니다.`,
    };
  }

  function downloadTemplate(templateKey, filename) {
    const content = TEMPLATES[templateKey];
    if (!content) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `외부조회서_${templateKey}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderPanel(analysis, options = {}) {
    const focusAccount = options.focusAccount || "";
    const targets = recommendTargets(analysis, focusAccount);
    const summary = needsConfirmationSummary(targets);

    let html = `<div class="tk-panel external-confirm-panel">
      <p class="tk-disclaimer">감사의견·중요왜곡표시위험을 확정하지 않습니다. 외부조회 추천·체크리스트·양식만 제공하며, 발송·회신 관리는 포함하지 않습니다.</p>

      <section class="tk-section">
        <h3>외부조회 필요 여부 (추천)</h3>
        <p class="tk-summary ${summary.needed ? "tk-summary-review" : ""}">${escapeHtml(summary.message)}</p>
        <label class="ar-criteria-field">
          <span>중점 검토 계정/영역 (선택)</span>
          <input type="text" id="ext-confirm-focus" class="criteria-input" value="${escapeHtml(focusAccount)}" placeholder="예: 매출채권, 차입금" />
        </label>
        <button type="button" id="ext-confirm-refresh-btn" class="secondary-btn">추천 다시 계산</button>
      </section>`;

    if (targets.length) {
      html += `<section class="tk-section"><h3>추천 조회 대상</h3><div class="ext-target-list">`;
      for (const t of targets) {
        html += `<article class="ext-target-card">
          <header>
            <h4>${escapeHtml(t.label)}</h4>
            <span class="status-badge status-review">${escapeHtml(t.recommendLevel)}</span>
          </header>
          <p class="ext-default-reason">${escapeHtml(t.defaultReason)}</p>
          <h5>추천 근거</h5>
          <ul>${t.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
          <div class="ext-card-actions">
            <button type="button" class="secondary-btn ext-download-btn" data-template="${t.templateKey}">조회서 양식 다운로드</button>
          </div>
          <h5>조회 시 확인사항</h5>
          <ul class="ext-checklist">${t.checklist.map((c) => `<li><label><input type="checkbox" /> ${escapeHtml(c)}</label></li>`).join("")}</ul>
        </article>`;
      }
      html += `</div></section>`;
    }

    html += `<section class="tk-section">
      <h3>권장 후속감사절차</h3>
      <ul class="tk-followup-list">
        <li>조회 대상·시점·범위를 감사인이 확정</li>
        <li>조회서 발송 전 피감사회사 확인(주소·잔액·서명권자)</li>
        <li>미회신·예외회신에 대한 대체절차 검토</li>
        <li>회신 내용과 장부·계약서·이후 수금의 일관성 확인</li>
      </ul>
    </section></div>`;

    return html;
  }

  window.ExternalConfirmToolkit = {
    CONFIRM_TARGETS,
    recommendTargets,
    needsConfirmationSummary,
    renderPanel,
    downloadTemplate,
  };
})();
