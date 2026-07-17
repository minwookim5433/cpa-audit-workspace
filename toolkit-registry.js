/**
 * AI Audit Toolkit — 감사기술 정의 및 AI 추천 매핑
 * status: available | beta (70~80%)
 */
(function () {
  "use strict";

  const AUDIT_TOOLKIT = [
    {
      id: "analytical",
      priority: 1,
      icon: "📊",
      title: "분석적 절차",
      shortDesc: "증감·구성비·회전율·회수기간·위험신호·후속절차",
      detailDesc: "Excel·CSV 데이터로 계정 잔액·거래 추이를 계산하고, 결과 해석·판단근거·권장 후속감사절차를 제공합니다.",
      status: "available",
      capabilities: ["계산", "체크리스트", "판단근거", "권장 후속감사절차"],
      keywords: ["분석적", "증감", "구성비", "회전율", "회수기간", "추세", "비율", "분석"],
      accountHints: ["매출채권", "매출", "재고자산", "매입채무"],
      dataInput: "excel",
    },
    {
      id: "materiality",
      priority: 2,
      icon: "⚖️",
      title: "중요성 계산",
      shortDesc: "전사·수행중요성·명백히 사소한 왜곡표시",
      detailDesc: "기준값과 비율을 입력하여 중요성을 계산하고 계산 근거를 표시합니다.",
      status: "beta",
      capabilities: ["계산", "판단근거", "권장 후속감사절차"],
      keywords: ["중요성", "materiality", "수행중요성", "명백히 사소", "benchmark"],
    },
    {
      id: "sampling",
      priority: 3,
      icon: "🎯",
      title: "표본추출",
      shortDesc: "Random·MUS·고액항목·중요성 연동",
      detailDesc: "모집단에서 표본을 추출합니다. Random Sampling, Monetary Unit Sampling, 고액항목 선정을 지원합니다.",
      status: "beta",
      capabilities: ["계산", "판단근거"],
      keywords: ["표본", "모집단", "sampling", "mus", "추출", "무작위"],
      dataInput: "excel",
    },
    {
      id: "external-confirm",
      priority: 4,
      icon: "✉️",
      title: "외부조회",
      shortDesc: "조회 필요 여부·대상 추천, 조회서 양식, 확인 체크리스트",
      detailDesc: "외부조회 필요 여부와 대상을 추천하고, 조회서 양식 다운로드와 확인사항 체크리스트를 제공합니다.",
      status: "available",
      capabilities: ["체크리스트", "판단근거", "권장 후속감사절차"],
      keywords: ["외부조회", "조회서", "confirmation", "채권조회", "차입조회", "금융기관"],
    },
    {
      id: "aging-analysis",
      priority: 5,
      icon: "📅",
      title: "연령분석",
      shortDesc: "연령표 검토·회수지연 식별·후속절차 체크리스트",
      detailDesc: "연령분석 수행 시 확인사항, 회수지연 거래처 검토 포인트, 권장 후속감사절차를 제공합니다. 상세 계산은 분석적 절차와 병행할 수 있습니다.",
      status: "beta",
      capabilities: ["체크리스트", "판단근거", "권장 후속감사절차"],
      keywords: ["연령", "aging", "회수", "연체", "장기", "채권연령"],
      accountHints: ["매출채권", "매입채무"],
      dataInput: "excel",
    },
    {
      id: "estimates-review",
      priority: 6,
      icon: "🔍",
      title: "회계추정치 검토",
      shortDesc: "추정치 검토 체크포인트·회수가능성·후속절차",
      detailDesc: "회계추정치(대손충당금 등) 검토 시 확인사항, 회수가능성 판단 고려사항, 권장 후속감사절차를 제공합니다.",
      status: "beta",
      capabilities: ["체크리스트", "판단근거", "권장 후속감사절차"],
      keywords: ["추정", "대손", "충당금", "회수가능성", "회계추정", "valuation"],
      accountHints: ["매출채권"],
    },
    {
      id: "contract-review",
      priority: 7,
      icon: "📄",
      title: "계약서 검토",
      shortDesc: "계약서 체크리스트·수익인식·위험포인트",
      detailDesc: "계약서 검토 체크리스트, 수익인식 핵심 확인사항, 계약조건별 위험포인트를 정리합니다.",
      status: "beta",
      capabilities: ["체크리스트", "판단근거", "권장 후속감사절차"],
      keywords: ["계약", "계약서", "수익인식", "ifrs 15", "리스", "약정"],
    },
    {
      id: "related-party",
      priority: 8,
      icon: "🔗",
      title: "특수관계자 분석",
      shortDesc: "특수관계자 식별·거래 검토·후속절차 체크리스트",
      detailDesc: "특수관계자 거래 식별·검토 체크리스트, 공시·승인 확인사항, 권장 후속감사절차를 제공합니다.",
      status: "beta",
      capabilities: ["체크리스트", "판단근거", "권장 후속감사절차"],
      keywords: ["특수관계자", "관련자", "related party", "지배", "종속", "임원", "주주"],
      tagIds: ["related_party"],
    },
    {
      id: "it-controls",
      priority: 9,
      icon: "🖥️",
      title: "IT통제 체크리스트",
      shortDesc: "IT 일반통제·애플리케이션 통제 점검",
      detailDesc: "IT 환경에서 감사인이 확인할 통제 체크포인트를 제공합니다.",
      status: "planned",
      capabilities: ["체크리스트"],
      keywords: ["it", "통제", "전산", "erp", "access", "백업", "cyber"],
      tagIds: ["it_control"],
    },
    {
      id: "expert-review",
      priority: 10,
      icon: "👤",
      title: "전문가 활용 검토",
      shortDesc: "전문가 참여 필요성·확인사항 체크리스트",
      detailDesc: "전문가 활용이 필요한 영역과 감사인이 확인할 사항을 체크리스트로 정리합니다.",
      status: "planned",
      capabilities: ["체크리스트", "추천"],
      keywords: ["전문가", "valuation", "평가", "법률", "기술", "보험수리"],
      tagIds: ["expert_engagement"],
    },
  ];

  const TAG_TO_TOOL_IDS = {
    revenue_recognition: ["contract-review"],
    material_misstatement_risk: ["materiality"],
    inherent_risk: ["analytical"],
    fraud_risk: ["analytical", "sampling"],
    significant_risk: ["analytical"],
    accounting_estimates: ["estimates-review"],
    management_bias: ["estimates-review"],
    related_party: ["related-party", "external-confirm"],
    going_concern: [],
    internal_control: ["it-controls"],
    it_control: ["it-controls"],
    analytical_procedures: ["analytical"],
    external_confirmation: ["external-confirm"],
    expert_engagement: ["expert-review"],
    group_audit: [],
    audit_report: [],
  };

  function getToolById(id) {
    return AUDIT_TOOLKIT.find((t) => t.id === id) || null;
  }

  function scoreTool(tool, analysis, combinedText) {
    let score = 0;
    const text = combinedText.toLowerCase();

    for (const kw of tool.keywords) {
      if (text.includes(kw.toLowerCase())) score += 2;
    }
    for (const hint of tool.accountHints || []) {
      if (text.includes(hint.toLowerCase())) score += 1;
    }
    if (tool.id === "analytical") score += 1;

    const risks = analysis?.riskAssessment?.risks || [];
    for (const risk of risks) {
      const blob = [risk.riskTitle, risk.whyThisRisk?.summary, ...(risk.sourceFacts || [])].join(" ").toLowerCase();
      for (const kw of tool.keywords) {
        if (blob.includes(kw.toLowerCase())) score += 3;
      }
    }

    const byRisk = analysis?.responseProcedures?.byRisk || [];
    for (const item of byRisk) {
      const procText = [
        item.responseFocus,
        ...(item.requiredEvidence || []).map((e) => [e.name, e.requestMethod, ...(e.requestItems || [])].join(" ")),
        ...(item.procedureAlternatives || []).map((p) => [p.procedure, p.purpose].join(" ")),
      ].join(" ").toLowerCase();

      for (const kw of tool.keywords) {
        if (procText.includes(kw.toLowerCase())) score += 2;
      }
      if (tool.id === "external-confirm" && /외부조회/.test(procText)) score += 5;
      if (tool.id === "analytical" && /분석적/.test(procText)) score += 4;
      if (tool.id === "related-party" && /특수관계|관련자/.test(procText)) score += 5;
      if (tool.id === "aging-analysis" && /연령|aging|회수/.test(procText)) score += 4;
      if (tool.id === "estimates-review" && /추정|대손|충당/.test(procText)) score += 4;
    }

    const planning = analysis?.auditPlanning?.companyUnderstanding || {};
    const planningText = [
      planning.industry,
      planning.businessModel,
      planning.transactionStory,
      ...(planning.industryAuditImplications || []),
    ].join(" ").toLowerCase();

    for (const kw of tool.keywords) {
      if (planningText.includes(kw.toLowerCase())) score += 1;
    }

    return score;
  }

  function recommendToolsFromNavigator(navigator) {
    if (!navigator) return recommendTools(null);

    const scores = new Map();
    const reasons = new Map();

    const addScore = (toolId, pts, reason) => {
      scores.set(toolId, (scores.get(toolId) || 0) + pts);
      if (!reasons.has(toolId)) reasons.set(toolId, reason);
    };

    for (const tag of navigator.caseSummary?.auditIssueTags || []) {
      const toolIds = TAG_TO_TOOL_IDS[tag.tagId] || [];
      for (const tid of toolIds) {
        addScore(tid, 5, `쟁점 태그: ${tag.label || tag.tagId}`);
      }
    }

    for (const q of navigator.questions || []) {
      const blob = [
        q.questionText,
        q.examTopic?.primary,
        ...(q.examTopic?.secondary || []),
        ...(q.scoringKeywords || []),
      ].join(" ").toLowerCase();

      for (const tool of AUDIT_TOOLKIT) {
        for (const kw of tool.keywords) {
          if (blob.includes(kw.toLowerCase())) {
            addScore(tool.id, 2, `물음 ${q.questionNumber}: ${kw} 관련`);
          }
        }
      }
      if (q.suggestedToolkitIds) {
        for (const tid of q.suggestedToolkitIds) {
          addScore(tid, 3, `물음 ${q.questionNumber} 연계`);
        }
      }
    }

    const allTools = AUDIT_TOOLKIT.map((tool) => {
      const recommendScore = scores.get(tool.id) || 0;
      let recommendReason = reasons.get(tool.id) || "";
      if (!recommendReason && tool.status === "available") recommendReason = "기본 사용 가능 도구";
      if (!recommendReason && recommendScore === 0) return null;
      return { ...tool, recommendScore, recommendReason };
    }).filter(Boolean);

    return allTools
      .sort((a, b) => b.recommendScore - a.recommendScore || a.priority - b.priority)
      .slice(0, 9);
  }

  function recommendTools(analysis) {
    if (!analysis) {
      return AUDIT_TOOLKIT.filter((t) => t.status === "available" || t.status === "beta")
        .slice(0, 4)
        .map((t) => ({
          ...t,
          recommendScore: t.priority <= 2 ? 1 : 0,
          recommendReason: t.priority <= 2 ? "독립 실행 가능" : "",
        }));
    }

    const combinedText = JSON.stringify(analysis);
    const scored = AUDIT_TOOLKIT.map((tool) => {
      const recommendScore = scoreTool(tool, analysis, combinedText);
      let recommendReason = "";
      if (recommendScore >= 5) recommendReason = "사례 이슈·대응절차와 강한 연관";
      else if (recommendScore >= 3) recommendReason = "사례 맥락상 검토 권장";
      else if (recommendScore >= 1) recommendReason = "관련 이슈 참고";
      else if (tool.status === "available") recommendReason = "독립 실행 가능";
      return { ...tool, recommendScore, recommendReason };
    })
      .filter((t) => t.recommendScore > 0 || t.status === "available" || t.status === "beta")
      .sort((a, b) => b.recommendScore - a.recommendScore || a.priority - b.priority);

    return scored.slice(0, 8);
  }

  window.AuditToolkit = {
    AUDIT_TOOLKIT,
    getToolById,
    recommendTools,
    recommendToolsFromNavigator,
    TAG_TO_TOOL_IDS,
  };
})();
