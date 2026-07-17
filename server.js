require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");
const ProblemExtractor = require("./problem-extractor");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_PDF_SIZE = 10 * 1024 * 1024;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("PDF 파일만 업로드할 수 있습니다."));
  },
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("이미지 파일(JPEG, PNG, WebP)만 업로드할 수 있습니다."));
  },
});

app.use(express.json({ limit: "5mb" }));

const nodeModulesDir = path.join(__dirname, "node_modules");
app.use("/node_modules", express.static(nodeModulesDir));
app.use(express.static(path.join(__dirname)));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const SYSTEM_PROMPT = `당신은 감사인이 CPA 사례형 문제·실무 감사업무를 수행할 때 사용하는 AI Audit Workbench의 보조 도구입니다.
기업을 자동으로 진단하거나 CPA 정답·모범답안·최종감사의견을 작성하지 마세요.
감사인이 Tool을 선택하여 문제를 해결할 수 있도록, 사례 맥락·핵심 이슈·대응절차 후보만 구조화하세요.

[실제 감사 흐름 — 반드시 이 순서로 JSON 작성]
1. auditPlanning (감사계획 수립): 피감사회사 이해, 산업·경제환경, 거래흐름, 회계처리 요약
2. riskAssessment (위험평가절차): 위험 식별·분류·유의적위험·경영진주장 연결
3. responseProcedures (대응절차): 위험별 감사증거·대응절차 후보

[문제 번호 — 최우선]
- 사용자가 지정한 문제 번호와 problemNumber가 반드시 일치해야 합니다.
- 입력 텍스트는 해당 문제만 포함합니다. 다른 문제 내용을 분석하지 마세요.
- problemTitle은 해당 문제의 회사명·주제를 반영하세요.

[환각 방지]
- 입력 텍스트에 없는 사실 금지
- informationGaps는 구체적 확인 항목만. 없으면 []
- 회계처리 설명은 accountingNotes에 2~3문장으로 간략히

반환 JSON:
{
  "problemNumber": "지정 번호",
  "problemTitle": "해당 문제 주제",
  "auditPlanning": {
    "companyUnderstanding": {
      "industry": "",
      "industryAuditImplications": [],
      "economicEnvironmentAuditImpact": "",
      "regulatoryAndMarketFactors": [],
      "businessModel": "",
      "transactionStory": "한 줄 거래 흐름",
      "transactionFlow": [
        { "step": 1, "event": "", "relatedAssertions": ["발생"], "sourceFacts": [], "auditRelevance": "" }
      ]
    },
    "accountingNotes": [{ "topic": "", "briefExplanation": "", "auditorFocus": "" }],
    "planningFocus": ["감사계획 시 초점"],
    "informationGaps": []
  },
  "riskAssessment": {
    "risks": [{
      "riskId": "risk-1",
      "riskTitle": "",
      "sourceFacts": [],
      "riskClassification": {
        "inherentRisk": { "level": "높음", "reason": "", "reasoningSteps": [] },
        "fraudRisk": { "level": "추가정보필요", "reason": "", "reasoningSteps": [] },
        "significantRisk": { "isSignificant": true, "reason": "", "reasoningSteps": [], "relatedKSA": ["KSA 315"] },
        "accountingEstimates": { "applies": false, "estimateItems": [], "reason": "" },
        "managementBiasRisk": { "level": "중간", "reason": "", "reasoningSteps": [] }
      },
      "standardsLinkage": { "IFRS": [], "KSA": [] },
      "managementAssertions": [{ "assertion": "발생", "reason": "" }],
      "whyThisRisk": { "summary": "", "reasoningChain": [] },
      "informationGaps": [],
      "priority": { "rank": 1, "reason": "" }
    }],
    "relationships": [{ "fromRiskId": "", "toRiskId": "", "relationship": "" }],
    "informationGaps": []
  },
  "responseProcedures": {
    "byRisk": [{
      "riskId": "risk-1",
      "responseFocus": "",
      "requiredEvidence": [{
        "evidenceId": "risk-1-ev-1",
        "name": "",
        "reason": "",
        "requestTarget": "",
        "requestItems": [],
        "requestMethod": "외부조회"
      }],
      "procedureAlternatives": [{
        "procedureId": "risk-1-proc-1",
        "priority": 1,
        "procedure": "",
        "purpose": "",
        "selectionReason": "",
        "assertionsToVerify": []
      }]
    }]
  }
}`;

function buildUserPrompt(problemText, problemNumber) {
  return `아래는 회계감사 기출 PDF에서 **문제 ${problemNumber}번**만 추출한 텍스트입니다.
이 문제만 분석하세요. problemNumber는 반드시 "${problemNumber}"로 설정하세요.

감사계획 수립 → 위험평가절차 → 대응절차 순서로 JSON을 작성하세요.

[문제 ${problemNumber} 텍스트]
${problemText}`;
}

const NAVIGATOR_SYSTEM_PROMPT = `당신은 CPA 감사 사례형 문제를 "읽는 사고과정"을 돕는 Navigator입니다.
정답·모범답안·감사의견·위험 확정을 하지 마세요. 부정·중요왜곡을 단정하지 마세요.

[역할]
수험생이 긴 사례를 빠르게 읽고, 출제 의도를 파악하고, 필요한 사례 정보를 찾고, 관련 감사기준을 연결하도록 돕습니다.
"왜 이 정보가 중요할까"를 설명하세요. 정답 대신 읽는 과정을 보여주세요.

[상황 분리 — 최우선]
- "각 물음은 독립적이다" → 물음마다 별도 사례만 사용
- "다음은 (물음3)~(물음6)과 관련된 내용이다" → 3~6만 공통 사례
- "(계속)"은 페이지 연속이지 새 물음이 아님
- 독립 물음의 사례 정보를 다른 물음에 섞지 말 것

[STEP 1 — step1_keyFacts] 3~8개 bullet
- 기업 전체 요약 금지. 문제 풀이에 반드시 필요한 사실만.
- 회사 소개·배경 설명 등 중요하지 않은 정보 제거
- 매출인식 변경, 특수관계자 거래, 내부통제 변경 등 풀이 관련 사실만

[STEP 2 — step2_examinerIntent]
- 사례에 나온 사실(fact) → 출제자가 왜 이 정보를 줬는지(intent) 연결
- "회수가능성 평가하라" 같은 정답 유도 금지. "왜 이 단서가 주어졌는지"만 설명
- 4~10개 연결 항목

[STEP 3 — step3_questions] 물음마다 다음 5가지만:
1. originalText: 물음 원문 전체
2. caseInfoToUse: 이 물음에서 사용해야 하는 사례 정보 (공통/독립 명시 필수)
   예) "물음1 → (주)릴리펏 소규모기업 사례만. 물음2~6 사례 사용 금지."
3. coreTopic: 핵심 출제주제 (1줄)
4. scoringKeywords: 3~7개, 답안에 쓸 핵심 용어 (정답 문장 금지)
5. relatedStandards: standardNumber+standardName, 불확실하면 standardNumber:"기준 확인 필요"

반환 JSON (schemaVersion: "case-navigator-v3"):
{
  "schemaVersion": "case-navigator-v3",
  "year": "",
  "problemNumber": null,
  "problemTitle": "문제 대주제",
  "totalQuestions": 6,
  "step1_keyFacts": ["...", "..."],
  "step2_examinerIntent": [
    { "fact": "매출채권 급증", "intent": "회수가능성·충당금 평가 필요성을 스스로 떠올리도록 유도" }
  ],
  "step3_questions": [
    {
      "questionNumber": 1,
      "originalText": "...",
      "caseInfoToUse": "물음1 → (주)릴리펏 사례만 사용",
      "coreTopic": "...",
      "scoringKeywords": ["...", "..."],
      "relatedStandards": [
        { "standardNumber": "KSA 315", "standardName": "위험평가 및 감사대응" }
      ]
    }
  ]
}`;

function buildNavigatorUserPrompt(problemText, meta, preExtract) {
  const detected = preExtract.detectedNumbers.join(", ") || "(규칙 탐지 없음)";
  const hints = preExtract.structureHints.join(", ") || "(없음)";
  const yearLine = meta.year ? `연도: ${meta.year}` : "연도: (미지정)";
  const problemLine = meta.problemNumber ? `문제 번호: ${meta.problemNumber}` : "문제 번호: (미지정)";
  const countRule =
    preExtract.expectedCount > 0
      ? `탐지된 물음이 ${preExtract.expectedCount}개이면 step3_questions도 반드시 ${preExtract.expectedCount}개여야 합니다.`
      : "텍스트에 있는 모든 (물음N)을 step3_questions에 포함하세요.";

  return `${yearLine}
${problemLine}
입력 방식: ${meta.inputSource || "paste"}

[규칙 기반 사전 탐지]
- 탐지된 물음 번호: ${detected}
- 예상 물음 개수: ${preExtract.expectedCount}
- 구조 힌트: ${hints}

${countRule}
독립 물음과 공통 사례를 caseInfoToUse에서 명확히 구분하세요.

[문제 텍스트]
${problemText}`;
}

function clampKeywords(list) {
  return normalizeStringArray(list).slice(0, 7);
}

function normalizeV2Standards(list) {
  if (!Array.isArray(list)) return [{ standardNumber: "기준 확인 필요", standardName: "" }];
  const out = list.map((s) => {
    const num = s.standardNumber || s.code || "";
    const name = s.standardName || s.name || "";
    if (!num || /확인\s*필요|unverified/i.test(num)) {
      return { standardNumber: "기준 확인 필요", standardName: name };
    }
    return { standardNumber: String(num), standardName: String(name) };
  });
  return out.length ? out : [{ standardNumber: "기준 확인 필요", standardName: "" }];
}

function normalizeNavigatorV3(data, meta) {
  if (!data || typeof data !== "object") {
    throw new Error("Navigator 분석 결과 형식이 올바르지 않습니다.");
  }

  const pn = meta.problemNumber ? parseInt(meta.problemNumber, 10) : null;
  data.schemaVersion = "case-navigator-v3";
  data.year = String(meta.year || data.year || "");
  data.problemNumber = Number.isFinite(pn) ? pn : data.problemNumber ?? null;
  data.problemTitle = data.problemTitle || "";
  data.step1_keyFacts = normalizeStringArray(data.step1_keyFacts).slice(0, 8);

  data.step2_examinerIntent = (data.step2_examinerIntent || [])
    .map((item) => ({
      fact: String(item.fact || item.caseFact || "").trim(),
      intent: String(item.intent || item.examinerIntent || "").trim(),
    }))
    .filter((item) => item.fact && item.intent)
    .slice(0, 12);

  const rawQuestions = data.step3_questions || data.questions || [];
  data.step3_questions = rawQuestions.map((q, index) => ({
    questionNumber: Number(q.questionNumber) || index + 1,
    originalText: q.originalText || q.questionText || "",
    caseInfoToUse: q.caseInfoToUse || q.contextScope || q.caseScope || "",
    coreTopic: q.coreTopic || q.examTopic?.primary || "",
    scoringKeywords: clampKeywords(q.scoringKeywords),
    relatedStandards: normalizeV2Standards(q.relatedStandards),
  }));

  data.totalQuestions = data.step3_questions.length;
  return data;
}

function resolveNavigatorProblemText(caseText, options) {
  const trimmed = caseText.trim();
  const inputSource = options.inputSource || "paste";
  const problemNumber = options.problemNumber ? normalizeProblemNumber(options.problemNumber) : "";
  const isFullExam = /【\s*문제\s*\d+\s*】/.test(trimmed);
  const shouldSlice =
    problemNumber &&
    (inputSource === "pdf" || options.sliceProblem === true || isFullExam);

  if (!shouldSlice) {
    return {
      problemText: trimmed,
      extracted: { text: trimmed, startIndex: 0, endIndex: trimmed.length, length: trimmed.length },
      sliced: false,
    };
  }

  const extracted = ProblemExtractor.extractProblemText(trimmed, problemNumber);
  if (extracted.text) {
    return { problemText: extracted.text, extracted, sliced: true };
  }

  if (inputSource === "paste" || inputSource === "image") {
    return {
      problemText: trimmed,
      extracted: { text: trimmed, startIndex: 0, endIndex: trimmed.length, length: trimmed.length },
      sliced: false,
      sliceWarning: `【문제${problemNumber}】 경계를 찾지 못해 전체 텍스트로 분석합니다.`,
    };
  }

  return { problemText: null, extracted, sliced: false };
}

const ANALYTICAL_REPORT_SYSTEM_PROMPT = `당신은 감사인이 분석적 절차 결과를 감사조서 문장으로 정리할 수 있도록 돕는 보조 도구입니다.

[절대 금지]
- 숫자를 새로 계산하거나 추정하지 마세요. 사용자가 제공한 계산 결과만 그대로 인용하세요.
- 중요왜곡표시위험, 감사의견, 내부통제 효과성, 경영진 부정 여부를 단정하지 마세요.
- 제공된 facts에 없는 사실·거래·정책·산업 정보를 만들지 마세요.
- "확실히 문제 없음", "위험 없음" 등 최종 판단을 내리지 마세요.

[작성 원칙]
- 한국어로 작성하세요.
- 아래 7개 섹션 제목을 반드시 포함하고, 각 섹션은 2~5문장으로 작성하세요.
- 수치는 제공된 값만 사용하고, 단위(원, %, 일, 회)를 명시하세요.
- 수행되지 않은 분석(unavailableProcedures)은 "추가 확인 필요"로 표기하세요.
- 결론 초안은 "~할 필요가 있음", "~를 추가로 검토할 필요가 있음" 수준의 초안 문장으로 작성하세요.

[출력 형식 — 반드시 이 순서]
## 분석 목적
## 사용한 데이터
## 수행한 분석적 절차
## 주요 계산 결과
## 관찰된 특이사항
## 추가 확인이 필요한 사항
## 결론 초안`;

function buildAnalyticalReportUserPrompt(facts) {
  return `아래 JSON은 JavaScript 코드로 이미 계산된 매출채권 분석 결과입니다.
숫자를 재계산하지 말고, 이 JSON만 근거로 분석적 절차 보고서 초안을 작성하세요.

[감사인 메모]
${facts.auditorMemo || "(없음)"}

[계산 결과 JSON]
${JSON.stringify(facts, null, 2)}`;
}

function normalizeProblemNumber(value) {
  return String(value || "").trim().replace(/^문제\s*/i, "");
}

function extractProblemText(fullText, problemNumber) {
  const num = normalizeProblemNumber(problemNumber);
  if (!num || !fullText) return null;

  const numInt = parseInt(num, 10);
  if (Number.isNaN(numInt)) return null;

  const startPatterns = [
    new RegExp(`문제\\s*${num}(?:\\s*[_\\-]?\\s*|\\.|번|호|\\)|）)`, "im"),
    new RegExp(`(?:^|\\n)\\s*${num}\\.\\s*(?:문제)?`, "m"),
    new RegExp(`제\\s*${num}\\s*문제`, "im"),
    new RegExp(`\\[\\s*문제\\s*${num}\\s*\\]`, "im"),
  ];

  let startIndex = -1;
  for (const pattern of startPatterns) {
    const match = pattern.exec(fullText);
    if (match && (startIndex === -1 || match.index < startIndex)) {
      startIndex = match.index;
    }
  }

  if (startIndex === -1) return null;

  const searchFrom = startIndex + Math.max(5, num.length);
  const remainder = fullText.slice(searchFrom);

  const endCandidates = [];
  for (let next = numInt + 1; next <= numInt + 5; next += 1) {
    const patterns = [
      new RegExp(`문제\\s*${next}(?:\\s*[_\\-]?\\s*|\\.|번|호|\\)|）)`, "im"),
      new RegExp(`(?:^|\\n)\\s*${next}\\.\\s`, "m"),
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(remainder);
      if (match) endCandidates.push(searchFrom + match.index);
    }
  }

  const anyProblem = /문제\s*(\d+)/gim;
  let match;
  while ((match = anyProblem.exec(fullText)) !== null) {
    const foundNum = parseInt(match[1], 10);
    if (match.index > startIndex + 10 && foundNum > numInt) {
      endCandidates.push(match.index);
      break;
    }
  }

  const endIndex =
    endCandidates.length > 0 ? Math.min(...endCandidates) : fullText.length;
  const slice = fullText.slice(startIndex, endIndex).trim();

  return slice.length >= 80 ? slice : null;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

const GENERIC_GAP_TEXTS = new Set([
  "추가 정보 필요",
  "추가정보필요",
  "추가 확인 필요",
  "사례에 관련 정보가 명시되지 않음",
]);

function filterSpecificGaps(value) {
  return normalizeStringArray(value).filter((item) => {
    const t = item.trim();
    return t && !GENERIC_GAP_TEXTS.has(t);
  });
}

const RISK_LEVELS = new Set(["높음", "중간", "낮음", "추가정보필요"]);

function normalizeRiskLevel(value, fallback = "중간") {
  return RISK_LEVELS.has(value) ? value : fallback;
}

function normalizeTransactionFlow(list) {
  if (!Array.isArray(list)) return [];
  return list.map((step, index) => ({
    step: Number(step.step) > 0 ? Number(step.step) : index + 1,
    event: step.event || "",
    relatedAssertions: normalizeStringArray(step.relatedAssertions || step.linkedAccounts),
    sourceFacts: normalizeStringArray(step.sourceFacts),
    auditRelevance: step.auditRelevance || "",
  }));
}

function normalizeRisks(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => {
    const rc = item.riskClassification || {};
    const ir = rc.inherentRisk || {};
    const fr = rc.fraudRisk || {};
    const sr = rc.significantRisk || {};
    const ae = rc.accountingEstimates || {};
    const mb = rc.managementBiasRisk || {};
    const why = item.whyThisRisk || {};
    const pr = item.priority || {};

    return {
      riskId: item.riskId || `risk-${index + 1}`,
      riskTitle: item.riskTitle || "",
      sourceFacts: normalizeStringArray(item.sourceFacts),
      riskClassification: {
        inherentRisk: {
          level: normalizeRiskLevel(ir.level),
          reason: ir.reason || "",
          reasoningSteps: normalizeStringArray(ir.reasoningSteps),
        },
        fraudRisk: {
          level: normalizeRiskLevel(fr.level, "추가정보필요"),
          reason: fr.reason || "",
          reasoningSteps: normalizeStringArray(fr.reasoningSteps),
        },
        significantRisk: {
          isSignificant: Boolean(sr.isSignificant),
          reason: sr.reason || "",
          reasoningSteps: normalizeStringArray(sr.reasoningSteps),
          relatedKSA: normalizeStringArray(sr.relatedKSA),
        },
        accountingEstimates: {
          applies: Boolean(ae.applies),
          estimateItems: normalizeStringArray(ae.estimateItems),
          reason: ae.reason || "",
        },
        managementBiasRisk: {
          level: normalizeRiskLevel(mb.level, "추가정보필요"),
          reason: mb.reason || "",
          reasoningSteps: normalizeStringArray(mb.reasoningSteps),
        },
      },
      standardsLinkage: {
        IFRS: Array.isArray(item.standardsLinkage?.IFRS)
          ? item.standardsLinkage.IFRS.map((s) => ({
              standard: s.standard || "",
              relevance: s.relevance || "",
            }))
          : [],
        KSA: Array.isArray(item.standardsLinkage?.KSA)
          ? item.standardsLinkage.KSA.map((s) => ({
              standard: s.standard || "",
              relevance: s.relevance || "",
            }))
          : [],
      },
      managementAssertions: (item.managementAssertions || []).map((a) => ({
        assertion: a.assertion || "",
        reason: a.reason || "",
      })),
      whyThisRisk: {
        summary: why.summary || "",
        reasoningChain: normalizeStringArray(why.reasoningChain),
      },
      informationGaps: filterSpecificGaps(item.informationGaps),
      priority: {
        rank: Number(pr.rank) > 0 ? Number(pr.rank) : index + 1,
        reason: pr.reason || "",
      },
    };
  });
}

function normalizeResponseProcedures(data, risks) {
  const titleMap = new Map(risks.map((r) => [r.riskId, r.riskTitle]));
  const list = data?.byRisk || data || [];

  if (!Array.isArray(list)) return { byRisk: [] };

  return {
    byRisk: list.map((item, index) => {
      const riskId = item.riskId || `risk-${index + 1}`;
      const title = titleMap.get(riskId) || "";

      return {
        riskId,
        responseFocus: item.responseFocus || item.suggestedFocus || "",
        requiredEvidence: (item.requiredEvidence || []).map((ev, evi) => ({
          evidenceId: ev.evidenceId || `${riskId}-ev-${evi + 1}`,
          name: ev.name || "",
          reason: ev.reason || "",
          relatedRisk: ev.relatedRisk || title,
          requestTarget: ev.requestTarget || "",
          requestItems: normalizeStringArray(ev.requestItems),
          requestMethod: ev.requestMethod || "내부자료요청",
          linkedAssertions: normalizeStringArray(ev.linkedAssertions),
        })),
        procedureAlternatives: (item.procedureAlternatives || [])
          .map((alt, alti) => ({
            procedureId: alt.procedureId || `${riskId}-proc-${alti + 1}`,
            priority: Number(alt.priority) > 0 ? Number(alt.priority) : alti + 1,
            procedure: alt.procedure || "",
            purpose: alt.purpose || "",
            selectionReason: alt.selectionReason || alt.reason || "",
            assertionsToVerify: normalizeStringArray(alt.assertionsToVerify),
          }))
          .sort((a, b) => a.priority - b.priority),
      };
    }),
  };
}

function validateAnalysisResult(data, requestedProblemNumber) {
  if (!data || typeof data !== "object") {
    throw new Error("분석 결과 형식이 올바르지 않습니다.");
  }

  data.problemNumber = requestedProblemNumber;
  data.problemTitle = data.problemTitle || "";

  const planning = data.auditPlanning || {};
  const understanding = planning.companyUnderstanding || {};

  data.auditPlanning = {
    companyUnderstanding: {
      industry: understanding.industry || "",
      industryAuditImplications: normalizeStringArray(understanding.industryAuditImplications),
      economicEnvironmentAuditImpact: understanding.economicEnvironmentAuditImpact || "",
      regulatoryAndMarketFactors: normalizeStringArray(understanding.regulatoryAndMarketFactors),
      businessModel: understanding.businessModel || "",
      transactionStory: understanding.transactionStory || planning.transactionStory || "",
      transactionFlow: normalizeTransactionFlow(understanding.transactionFlow),
    },
    accountingNotes: (planning.accountingNotes || []).map((n, i) => ({
      id: n.id || `note-${i + 1}`,
      topic: n.topic || "",
      briefExplanation: n.briefExplanation || "",
      auditorFocus: n.auditorFocus || "",
    })),
    planningFocus: normalizeStringArray(planning.planningFocus),
    informationGaps: filterSpecificGaps(planning.informationGaps),
  };

  const assessment = data.riskAssessment || {};
  data.riskAssessment = {
    risks: normalizeRisks(assessment.risks),
    relationships: (assessment.relationships || []).map((r) => ({
      fromRiskId: r.fromRiskId || "",
      toRiskId: r.toRiskId || "",
      relationship: r.relationship || "",
    })),
    informationGaps: filterSpecificGaps(assessment.informationGaps),
  };

  data.responseProcedures = normalizeResponseProcedures(
    data.responseProcedures,
    data.riskAssessment.risks
  );

  return data;
}

async function extractPdfText(buffer) {
  const result = await pdfParse(buffer);
  const text = result.text?.trim() || "";
  if (!text) throw new Error("PDF에서 텍스트를 추출하지 못했습니다.");
  return text;
}

app.post("/api/extract-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDF 파일이 필요합니다." });
    const extractedText = await extractPdfText(req.file.buffer);
    res.json({ fileName: req.file.originalname, extractedText });
  } catch (error) {
    console.error("PDF extract error:", error);
    res.status(500).json({ error: error.message || "PDF 추출 오류" });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const { caseText, problemNumber } = req.body;
    if (!caseText?.trim()) {
      return res.status(400).json({ error: "분석할 텍스트가 필요합니다." });
    }

    const normalizedProblemNumber = normalizeProblemNumber(problemNumber);
    if (!normalizedProblemNumber) {
      return res.status(400).json({ error: "문제 번호가 필요합니다." });
    }

    const extractedProblemText = extractProblemText(caseText.trim(), normalizedProblemNumber);
    const textForAnalysis = extractedProblemText || caseText.trim();

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.15,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(textForAnalysis, normalizedProblemNumber) },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });

    const parsed = JSON.parse(content);
    const validated = validateAnalysisResult(parsed, normalizedProblemNumber);

    validated.extractionMeta = {
      requestedProblemNumber: normalizedProblemNumber,
      problemTextExtracted: Boolean(extractedProblemText),
      extractedLength: extractedProblemText?.length || 0,
      warning: extractedProblemText
        ? null
        : `문제 ${normalizedProblemNumber}번을 PDF에서 자동 분리하지 못했습니다. 전체 텍스트로 분석했으니 결과를 확인해 주세요.`,
    };

    res.json(validated);
  } catch (error) {
    console.error("Analyze error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "분석 오류" });
  }
});

app.post("/api/extract-image", imageUpload.single("image"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }
    if (!req.file) return res.status(400).json({ error: "이미지 파일이 필요합니다." });

    const visionModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const base64 = req.file.buffer.toString("base64");
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    const completion = await openai.chat.completions.create({
      model: visionModel,
      temperature: 0,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `이 이미지는 CPA 회계감사 사례형 기출 문제입니다.
보이는 한국어 텍스트를 원문 그대로 추출하세요.
(물음N), 【문제N】, [상황], <주요 재무정보> 등 표기를 유지하세요.
설명·요약·해석 없이 텍스트만 출력하세요.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const extractedText = completion.choices[0]?.message?.content?.trim() || "";
    if (!extractedText) {
      return res.status(502).json({ error: "이미지에서 텍스트를 추출하지 못했습니다." });
    }

    res.json({
      fileName: req.file.originalname,
      extractedText,
      inputSource: "image",
      extractedLength: extractedText.length,
    });
  } catch (error) {
    console.error("Image extract error:", error);
    res.status(500).json({ error: error.message || "이미지 추출 오류" });
  }
});

app.post("/api/analyze-navigator", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const { caseText, problemNumber, year, inputSource, sliceProblem } = req.body;
    if (!caseText?.trim()) {
      return res.status(400).json({ error: "분석할 텍스트가 필요합니다." });
    }

    const normalizedProblemNumber = problemNumber ? normalizeProblemNumber(problemNumber) : "";
    const source = inputSource || "paste";

    const resolved = resolveNavigatorProblemText(caseText.trim(), {
      problemNumber: normalizedProblemNumber,
      inputSource: source,
      sliceProblem,
    });

    if (!resolved.problemText) {
      return res.status(422).json({
        extractionStatus: "failed",
        error: normalizedProblemNumber
          ? `문제 ${normalizedProblemNumber}번 본문을 찾지 못했습니다. 【문제${normalizedProblemNumber}】 표기를 확인하세요.`
          : "분석할 문제 본문이 비어 있습니다.",
        preExtraction: { problemTextExtracted: false },
      });
    }

    const problemText = resolved.problemText;
    const detected = ProblemExtractor.detectQuestionNumbers(problemText);
    const structureHints = ProblemExtractor.detectStructureHints(problemText);
    const expectedCount = ProblemExtractor.inferExpectedQuestionCount(detected.numbers);

    if (!detected.numbers.length && problemText.length < 150) {
      return res.status(422).json({
        extractionStatus: "failed",
        error: "물음 추출 불완전: (물음N) 패턴을 찾지 못했습니다. 텍스트를 더 붙여넣거나 이미지를 다시 업로드해 주세요.",
        preExtraction: {
          problemTextExtracted: true,
          extractedLength: resolved.extracted.length,
          detectedNumbers: [],
          expectedCount: 0,
          structureHints,
        },
      });
    }

    const preExtract = {
      detectedNumbers: detected.numbers,
      expectedCount,
      structureHints,
      extractedLength: resolved.extracted.length,
      inputSource: source,
      sliced: resolved.sliced,
      sliceWarning: resolved.sliceWarning || null,
    };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.05,
      max_tokens: 16000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: NAVIGATOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildNavigatorUserPrompt(
            problemText,
            { year: year || "", problemNumber: normalizedProblemNumber, inputSource: source },
            preExtract
          ),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });

    const parsed = JSON.parse(content);
    const validated = normalizeNavigatorV3(parsed, {
      year: year || "",
      problemNumber: normalizedProblemNumber,
    });
    const validation = ProblemExtractor.validateExtraction(
      detected,
      validated.step3_questions,
      []
    );

    validated.preExtraction = {
      ...preExtract,
      problemTextExtracted: true,
      startIndex: resolved.extracted.startIndex,
      endIndex: resolved.extracted.endIndex,
    };
    validated.extractionValidation = validation;

    if (!validation.complete && detected.numbers.length) {
      return res.status(422).json({
        extractionStatus: "incomplete",
        error: "물음 추출 불완전",
        errors: validation.errors,
        warnings: validation.warnings,
        navigator: validated,
        preExtraction: validated.preExtraction,
      });
    }

    validated.extractionStatus = detected.numbers.length ? "complete" : "partial";
    validated.totalQuestions = validated.step3_questions.length;
    res.json(validated);
  } catch (error) {
    console.error("Navigator analyze error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "Navigator 분석 오류" });
  }
});

const ASSERTION_TERMS = ["발생", "완전성", "정확성", "평가", "귀속", "표시와 공시"];

const SELECTION_ANALYSIS_PROMPT = `당신은 CPA 회계감사 시험 학습을 돕는 시험지 주석 도우미입니다.
정답·모범답안·감사의견을 작성하지 마세요. 위험·부정·중요왜곡을 확정하지 마세요.
선택된 문장과 주변 문맥만 근거로 분석하세요. 없는 사실을 만들지 마세요.

경영진 주장은 반드시 다음 용어만 사용하세요: 발생, 완전성, 정확성, 평가, 귀속, 표시와 공시
확신이 낮으면 confidence를 "low"로 표시하세요.

중요한 이유·고려 가능한 위험은 선택 내용만으로 실제로 판단 가능한 경우에만 작성하세요.
불확실하면 빈 문자열로 두세요. 억지로 생성하지 마세요.

반환 JSON:
{
  "whyImportant": "실제로 중요한 경우만 2~4문장, 아니면 빈 문자열",
  "possibleRisks": "실제로 고려할 위험이 있는 경우만, 아니면 빈 문자열",
  "assertions": [
    { "term": "완전성", "confidence": "high" },
    { "term": "평가", "confidence": "low" }
  ],
  "auditProcedures": ["고려 가능한 감사절차"],
  "relatedStandards": [
    { "standardNumber": "KSA 315", "standardName": "위험평가 및 감사대응" }
  ],
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`;

function normalizeAssertions(data) {
  let items = [];
  if (Array.isArray(data?.assertions)) {
    items = data.assertions
      .filter((a) => a && ASSERTION_TERMS.includes(a.term))
      .map((a) => ({
        term: a.term,
        confidence: a.confidence === "high" ? "high" : "low",
      }));
  } else if (Array.isArray(data?.managementAssertions)) {
    items = data.managementAssertions
      .map((s) => {
        const hit = ASSERTION_TERMS.find((t) => String(s).includes(t));
        return hit ? { term: hit, confidence: "low" } : null;
      })
      .filter(Boolean);
  }
  const confirmed = [...new Set(items.filter((i) => i.confidence === "high").map((i) => i.term))];
  const candidates = [
    ...new Set(items.filter((i) => i.confidence !== "high").map((i) => i.term)),
  ].filter((t) => !confirmed.includes(t));
  return { confirmed, candidates };
}

function optionalInsight(value) {
  const s = String(value || "").trim();
  if (!s || /추가\s*판단\s*필요|확인\s*필요|불명|불확실/i.test(s)) return null;
  return s;
}

function normalizeSelectionAnalysis(data) {
  if (!data || typeof data !== "object") {
    throw new Error("선택 분석 결과 형식이 올바르지 않습니다.");
  }
  const assertions = normalizeAssertions(data);
  return {
    whyImportant: optionalInsight(data.whyImportant),
    possibleRisks: optionalInsight(data.possibleRisks),
    assertions,
    auditProcedures: normalizeStringArray(data.auditProcedures).slice(0, 8),
    relatedStandards: normalizeV2Standards(data.relatedStandards),
    needsMoreContext: Boolean(data.needsMoreContext),
    needsMoreContextNote: String(data.needsMoreContextNote || "").trim(),
  };
}

function buildSelectionUserPrompt(payload) {
  const qLine = payload.questionNumber
    ? `연결 물음 번호: ${payload.questionNumber}`
    : "연결 물음 번호: (미지정)";
  return `페이지: ${payload.pageNumber}
${qLine}

[선택한 원문]
${payload.selectedText}

[앞 문맥]
${payload.contextBefore || "(없음)"}

[뒤 문맥]
${payload.contextAfter || "(없음)"}`;
}

const REGION_ANALYSIS_PROMPT = `당신은 CPA 회계감사 시험 학습을 돕는 시험지 주석 도우미입니다.
이미지에 보이는 선택 영역만 근거로 분석하세요. 정답·모범답안·감사의견을 작성하지 마세요.
재무제표·수치표는 OCR 원문을 나열하지 마세요. (재무제표는 별도 처리됩니다.)
보이지 않는 내용을 추측하지 마세요.

경영진 주장 용어: 발생, 완전성, 정확성, 평가, 귀속, 표시와 공시 (확신 낮으면 confidence "low")
중요한 이유·고려 가능한 위험은 실제로 판단 가능한 경우에만, 아니면 빈 문자열.

반환 JSON:
{
  "whyImportant": "",
  "possibleRisks": "",
  "assertions": [{ "term": "정확성", "confidence": "low" }],
  "auditProcedures": [],
  "relatedStandards": [],
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`;

const FINANCIAL_PARSE_PROMPT = `이 이미지는 CPA 시험지의 재무상태표 또는 포괄손익계산서(손익계산서) 영역입니다.
보이는 계정과목과 금액만 구조화하세요. 설명·해석·분석은 하지 마세요.

반환 JSON:
{
  "isFinancialStatement": true,
  "statementType": "balance_sheet",
  "statementTitle": "재무상태표",
  "periodLabels": ["전기", "당기"],
  "accounts": [
    { "name": "매출채권", "priorAmount": 1000, "currentAmount": 1200 }
  ]
}

statementType: balance_sheet | income_statement | unknown
금액은 숫자만(쉼표 제거). 보이지 않는 계정은 넣지 마세요.
재무제표가 아니면 isFinancialStatement: false, accounts: []`;

function normalizeRegionAnalysis(data) {
  if (!data || typeof data !== "object") {
    throw new Error("영역 분석 결과 형식이 올바르지 않습니다.");
  }
  return normalizeSelectionAnalysis(data);
}

function normalizeFinancialParse(data) {
  if (!data || typeof data !== "object") {
    return { isFinancialStatement: false, accounts: [], statementType: "unknown" };
  }
  const accounts = (data.accounts || [])
    .map((a) => ({
      name: String(a.name || "").trim(),
      priorAmount: Number(a.priorAmount),
      currentAmount: Number(a.currentAmount),
    }))
    .filter((a) => a.name && (Number.isFinite(a.priorAmount) || Number.isFinite(a.currentAmount)));
  return {
    isFinancialStatement: Boolean(data.isFinancialStatement) && accounts.length >= 2,
    statementType: data.statementType || "unknown",
    statementTitle: String(data.statementTitle || "").trim(),
    periodLabels: data.periodLabels || ["전기", "당기"],
    accounts,
  };
}

app.post("/api/parse-financial-region", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }
    const { imageDataUrl } = req.body;
    if (!imageDataUrl?.startsWith("data:image/")) {
      return res.status(400).json({ error: "선택 영역 이미지가 필요합니다." });
    }
    const visionModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model: visionModel,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: FINANCIAL_PARSE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "선택 영역의 재무제표 데이터만 JSON으로 추출하세요." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });
    res.json(normalizeFinancialParse(JSON.parse(content)));
  } catch (error) {
    console.error("Financial parse error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "재무제표 파싱 오류" });
  }
});

const PURPOSE_BASE_RULES = `당신은 CPA 회계감사 시험 학습 도우미입니다.
- 선택 범위와 앞뒤 문맥만 근거로 답하세요. 문제 전체를 추측하지 마세요.
- 선택 내용에 없는 위험·개념·기준을 억지로 만들지 마세요.
- 관련성이 낮으면 해당 항목을 비우거나 needsMoreContext를 true로 설정하세요.
- 모범답안 전체를 작성하지 마세요.`;

const PURPOSE_PROMPTS = {
  keyIssues: `${PURPOSE_BASE_RULES}

[핵심 쟁점 설명]
선택 내용에서 시험상 중요한 논점만 2~5개로 정리하세요. 왜 중요한지 간결히 설명하세요. 정답 전체는 제시하지 마세요.

반환 JSON:
{
  "issues": [{ "point": "쟁점", "whyImportant": "중요 이유" }],
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`,

  hints: `${PURPOSE_BASE_RULES}

[힌트만 보기]
정답을 직접 제시하지 말고, 스스로 생각할 수 있는 짧은 힌트만 2~5개 제공하세요.

반환 JSON:
{
  "hints": ["힌트1", "힌트2"],
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`,

  answerDirection: `${PURPOSE_BASE_RULES}

[정답 방향 보기]
답안 구성 순서·논리, 핵심 판단 단계, 반드시 검토할 요소를 안내하세요.
필요하면 결론 후보를 제시하되 단정적 모범답안은 작성하지 마세요.

반환 JSON:
{
  "answerStructure": ["1단계", "2단계"],
  "keyJudgmentSteps": ["판단 단계"],
  "mustReview": ["검토 요소"],
  "conclusionCandidates": ["결론 후보"],
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`,

  standards: `${PURPOSE_BASE_RULES}

[관련 기준서 보기]
관련 회계감사기준 번호·기준명·연결 이유만 제시하세요. 불확실하면 uncertain: true, standardNumber: "기준 확인 필요".

반환 JSON:
{
  "standards": [
    { "standardNumber": "KSA 315", "standardName": "위험평가 및 감사대응", "connectionReason": "연결 이유", "uncertain": false }
  ],
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`,

  easyExplain: `${PURPOSE_BASE_RULES}

[쉽게 설명]
선택 내용을 초보 수험생도 이해할 수 있게 쉬운 말로 설명하세요. 불필요한 감사 용어 남용을 피하세요.

반환 JSON:
{
  "explanation": "쉬운 설명",
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`,

  customAsk: `${PURPOSE_BASE_RULES}

[직접 질문하기]
사용자 질문에만 답하세요. 선택 범위와 문맥에 없는 내용은 추측하지 마세요.

반환 JSON:
{
  "answer": "질문에 대한 답변",
  "needsMoreContext": false,
  "needsMoreContextNote": ""
}`,
};

function buildPurposeMeta({ pageNumbers, pageNumber, questionNumber, purpose, userQuestion, selectionCount }) {
  const pages = pageNumbers?.length ? pageNumbers.join(", ") : String(pageNumber || 1);
  const lines = [`페이지: ${pages}`];
  if (selectionCount > 1) lines.push(`선택 영역 수: ${selectionCount}`);
  if (questionNumber) lines.push(`연결 물음: ${questionNumber}`);
  if (purpose === "customAsk" && userQuestion?.trim()) {
    lines.push(`사용자 질문: ${userQuestion.trim()}`);
  }
  return lines.join("\n");
}

function buildPurposeTextBlock({ selectedText, contextBefore, contextAfter, hasImage }) {
  const parts = [];
  if (hasImage) parts.push("[선택 영역] 첨부 이미지를 참고하세요.");
  if (selectedText) parts.push(`[선택 원문]\n${selectedText}`);
  if (contextBefore) parts.push(`[앞 문맥]\n${contextBefore}`);
  if (contextAfter) parts.push(`[뒤 문맥]\n${contextAfter}`);
  return parts.join("\n\n") || "[선택 내용] 이미지 참조";
}

function buildMultiPurposeTextBlock(selections) {
  return selections
    .map((s, i) => {
      const hasImage = s.imageDataUrl?.startsWith("data:image/");
      const parts = [`[선택 ${i + 1}] 페이지 ${s.pageNumber || 1}`];
      if (hasImage) parts.push("[유형] 영역 이미지 첨부");
      if (s.selectedText?.trim()) parts.push(`[선택 원문]\n${s.selectedText.trim()}`);
      if (s.contextBefore) parts.push(`[앞 문맥]\n${s.contextBefore}`);
      if (s.contextAfter) parts.push(`[뒤 문맥]\n${s.contextAfter}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function normalizePurposeSelections(body) {
  const { selections, selectedText, imageDataUrl, contextBefore, contextAfter, pageNumber } = body;
  if (Array.isArray(selections) && selections.length) {
    return selections.map((s, i) => ({
      pageNumber: s.pageNumber || pageNumber || i + 1,
      selectedText: String(s.selectedText || "").trim(),
      imageDataUrl: s.imageDataUrl || s.previewDataUrl || "",
      contextBefore: String(s.contextBefore || "").trim(),
      contextAfter: String(s.contextAfter || "").trim(),
    }));
  }
  return [
    {
      pageNumber: pageNumber || 1,
      selectedText: String(selectedText || "").trim(),
      imageDataUrl: imageDataUrl || "",
      contextBefore: String(contextBefore || "").trim(),
      contextAfter: String(contextAfter || "").trim(),
    },
  ];
}

function normalizePurposeResult(purpose, data) {
  if (!data || typeof data !== "object") {
    throw new Error("목적 분석 결과 형식이 올바르지 않습니다.");
  }
  const base = {
    purpose,
    needsMoreContext: Boolean(data.needsMoreContext),
    needsMoreContextNote: String(data.needsMoreContextNote || "").trim(),
  };

  switch (purpose) {
    case "keyIssues":
      return {
        ...base,
        issues: Array.isArray(data.issues)
          ? data.issues
              .filter((i) => i?.point)
              .slice(0, 5)
              .map((i) => ({
                point: String(i.point).trim(),
                whyImportant: String(i.whyImportant || "").trim(),
              }))
          : [],
      };
    case "hints":
      return { ...base, hints: normalizeStringArray(data.hints).slice(0, 6) };
    case "answerDirection":
      return {
        ...base,
        answerStructure: normalizeStringArray(data.answerStructure).slice(0, 8),
        keyJudgmentSteps: normalizeStringArray(data.keyJudgmentSteps).slice(0, 8),
        mustReview: normalizeStringArray(data.mustReview).slice(0, 8),
        conclusionCandidates: normalizeStringArray(data.conclusionCandidates).slice(0, 5),
      };
    case "standards":
      return {
        ...base,
        standards: Array.isArray(data.standards)
          ? data.standards.slice(0, 6).map((s) => ({
              standardNumber: s.uncertain ? "기준 확인 필요" : String(s.standardNumber || "기준 확인 필요").trim(),
              standardName: String(s.standardName || "").trim(),
              connectionReason: String(s.connectionReason || "").trim(),
              uncertain: Boolean(s.uncertain),
            }))
          : [],
      };
    case "easyExplain":
      return { ...base, explanation: String(data.explanation || "").trim() };
    case "customAsk":
      return { ...base, answer: String(data.answer || "").trim() };
    default:
      return base;
  }
}

app.post("/api/analyze-purpose", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const {
      purpose,
      selections,
      selectedText,
      imageDataUrl,
      contextBefore,
      contextAfter,
      pageNumber,
      questionNumber,
      userQuestion,
    } = req.body;

    const validPurposes = ["keyIssues", "hints", "answerDirection", "standards", "easyExplain", "customAsk"];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({ error: "유효하지 않은 분석 목적입니다." });
    }

    if (purpose === "customAsk" && !userQuestion?.trim()) {
      return res.status(400).json({ error: "질문을 입력해주세요." });
    }

    const items = normalizePurposeSelections(req.body);
    const hasAnyImage = items.some((s) => s.imageDataUrl?.startsWith("data:image/"));
    const hasAnyText = items.some((s) => s.selectedText);
    if (!hasAnyImage && !hasAnyText) {
      return res.status(400).json({ error: "선택 텍스트 또는 영역 이미지가 필요합니다." });
    }

    const pageNumbers = [...new Set(items.map((s) => s.pageNumber))];
    const systemPrompt = PURPOSE_PROMPTS[purpose];
    const meta = buildPurposeMeta({
      pageNumbers,
      pageNumber,
      questionNumber,
      purpose,
      userQuestion,
      selectionCount: items.length,
    });
    const textBlock =
      items.length > 1
        ? buildMultiPurposeTextBlock(items)
        : buildPurposeTextBlock({
            selectedText: items[0].selectedText,
            contextBefore: items[0].contextBefore,
            contextAfter: items[0].contextAfter,
            hasImage: hasAnyImage,
          });

    const visionModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const textModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

    let messages;
    if (hasAnyImage) {
      const content = [{ type: "text", text: `${meta}\n\n${textBlock}` }];
      items.forEach((s) => {
        if (s.imageDataUrl?.startsWith("data:image/")) {
          content.push({ type: "image_url", image_url: { url: s.imageDataUrl } });
        }
      });
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ];
    } else {
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${meta}\n\n${textBlock}` },
      ];
    }

    const completion = await openai.chat.completions.create({
      model: hasAnyImage ? visionModel : textModel,
      temperature: 0.15,
      max_tokens: 2800,
      response_format: { type: "json_object" },
      messages,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });

    const parsed = JSON.parse(content);
    res.json(normalizePurposeResult(purpose, parsed));
  } catch (error) {
    console.error("Purpose analyze error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "목적 분석 오류" });
  }
});

app.post("/api/analyze-region", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const { imageDataUrl, pageNumber, questionNumber, year, problemNumber } = req.body;
    if (!imageDataUrl?.startsWith("data:image/")) {
      return res.status(400).json({ error: "선택 영역 이미지가 필요합니다." });
    }

    const visionModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const meta = [
      year ? `연도: ${year}` : null,
      problemNumber ? `문제번호: ${problemNumber}` : null,
      questionNumber ? `물음: ${questionNumber}` : null,
      `페이지: ${pageNumber || 1}`,
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: visionModel,
      temperature: 0.15,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REGION_ANALYSIS_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `아래는 시험지에서 사용자가 지정한 작은 영역입니다. 전체 페이지가 아닙니다.\n${meta}` },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });

    const parsed = JSON.parse(content);
    res.json(normalizeRegionAnalysis(parsed));
  } catch (error) {
    console.error("Region analyze error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "영역 분석 오류" });
  }
});

app.post("/api/analyze-selection", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const { selectedText, contextBefore, contextAfter, pageNumber, questionNumber } = req.body;
    if (!selectedText?.trim()) {
      return res.status(400).json({ error: "선택한 원문이 필요합니다." });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.15,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SELECTION_ANALYSIS_PROMPT },
        {
          role: "user",
          content: buildSelectionUserPrompt({
            selectedText: selectedText.trim(),
            contextBefore: contextBefore || "",
            contextAfter: contextAfter || "",
            pageNumber: pageNumber || 1,
            questionNumber: questionNumber || "",
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });

    const parsed = JSON.parse(content);
    res.json(normalizeSelectionAnalysis(parsed));
  } catch (error) {
    console.error("Selection analyze error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "선택 분석 오류" });
  }
});

app.post("/api/analytical-report-draft", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const { facts } = req.body;
    if (!facts || typeof facts !== "object") {
      return res.status(400).json({ error: "계산 결과(facts)가 필요합니다." });
    }

    if (facts.account !== "매출채권") {
      return res.status(400).json({ error: "매출채권 분석 결과만 보고서 초안을 생성할 수 있습니다." });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        { role: "system", content: ANALYTICAL_REPORT_SYSTEM_PROMPT },
        { role: "user", content: buildAnalyticalReportUserPrompt(facts) },
      ],
    });

    const draft = completion.choices[0]?.message?.content?.trim();
    if (!draft) return res.status(502).json({ error: "AI 응답 없음" });

    res.json({ draft });
  } catch (error) {
    console.error("Analytical report draft error:", error);
    res.status(500).json({ error: error.message || "보고서 초안 생성 오류" });
  }
});

const ANSWER_COACH_PROMPTS = {
  expression: `당신은 CPA 회계감사 시험 답안 코치입니다.
절대로 모범답안·정답·완성된 답안을 작성하지 마세요.
사용자가 이미 작성한 문장에 대해 "수정 포인트"만 제시하세요.

각 피드백은 반드시:
- original: 사용자가 선택한 원문 (또는 그 일부)
- suggestion: 개선된 표현 (한 문장 또는 구절)
- reason: 왜 수정해야 하는지 (감사 답안 작성 관점)
- category: "표현" | "감사기준 표현" | "논리" | "문장구성" | "용어선택" 중 하나

JSON 형식:
{ "feedbacks": [{ "original": "", "suggestion": "", "reason": "", "category": "" }] }
최대 4개. 수정이 필요 없으면 feedbacks를 빈 배열로.`,

  logic: `당신은 CPA 회계감사 시험 답안 코치입니다.
절대로 모범답안·정답을 작성하지 마세요.
선택된 답안의 논리 흐름(근거→분석→결론)만 점검하고 수정 포인트를 제시하세요.

예: "근거를 먼저 제시한 후 결론을 작성하는 것이 좋습니다."

JSON: { "feedbacks": [{ "original": "", "suggestion": "", "reason": "", "category": "논리" }] }`,

  auditTerm: `당신은 CPA 회계감사 시험 답안 코치입니다.
절대로 모범답안·정답을 작성하지 마세요.
감사기준·감사절차 관련 용어가 적절한지 점검하고 수정 포인트만 제시하세요.

예: "적절하다" → "적절한 것으로 판단된다", "검토하였다" → "감사절차를 수행하였다"

JSON: { "feedbacks": [{ "original": "", "suggestion": "", "reason": "", "category": "감사기준 표현" }] }`,

  conciseness: `당신은 CPA 회계감사 시험 답안 코치입니다.
절대로 모범답안·정답을 작성하지 마세요.
불필요한 반복·장황한 표현을 간결하게 다듬는 수정 포인트만 제시하세요.
의미는 유지하되 시험 답안에 적합한 간결함을 목표로 하세요.

JSON: { "feedbacks": [{ "original": "", "suggestion": "", "reason": "", "category": "문장구성" }] }`,
};

const VALID_COACH_MODES = ["expression", "logic", "auditTerm", "conciseness"];

function normalizeAnswerFeedback(data) {
  if (!data || typeof data !== "object") {
    return { items: [], repeatedHabits: [] };
  }

  const validTypes = new Set(["replace", "delete", "split", "clarify"]);
  const items = Array.isArray(data.items)
    ? data.items
        .slice(0, 5)
        .map((item) => {
          const type = validTypes.has(item?.type) ? item.type : "replace";
          const original = String(item?.original || "").trim();
          const suggestion = String(item?.suggestion || "").trim();
          const reason = String(item?.reason || "").trim();
          if (!original && type !== "clarify") return null;
          if (type === "replace" && !suggestion) return null;
          const loc = item?.location || {};
          return {
            location: {
              page: Number.isFinite(Number(loc.page)) ? Number(loc.page) : null,
              question: String(loc.question || "").trim(),
              item: String(loc.item || "").trim(),
            },
            type,
            original,
            suggestion,
            reason,
          };
        })
        .filter(Boolean)
    : [];

  const repeatedHabits = Array.isArray(data.repeatedHabits)
    ? data.repeatedHabits
        .map((h) => {
          if (typeof h === "string") {
            const label = h.trim();
            return label ? { label, count: 1, advice: "" } : null;
          }
          const label = String(h?.label || "").trim();
          if (!label) return null;
          return {
            label,
            count: Number.isFinite(Number(h?.count)) ? Number(h.count) : 1,
            advice: String(h?.advice || "").trim(),
          };
        })
        .filter(Boolean)
    : [];

  return { items, repeatedHabits };
}

const ANSWER_FEEDBACK_SYSTEM_PROMPT = `당신은 회계감사 시험 답안의 표현과 가독성을 점검하는 간결한 답안 코치입니다.

문제 원문, 모범답안, 채점 기준을 완전히 알지 못하므로
답안의 정답 여부, 점수, 전문적 타당성을 판단해서는 안 됩니다.

당연한 형식 준수는 칭찬하거나 피드백하지 마세요.
예: "아니오, ~하기 때문이다." 형식 자체, 번호 사용, 물음 구분, 줄바꿈·문단 사용은
요구사항이 명시적으로 요구하지 않는 한 피드백 대상이 아닙니다.
형식이 실제로 잘못되었을 때만 지적하세요.

사용자가 실제로 고칠 수 있는 부분만 찾으세요.
각 항목에는 반드시 원문, 구체적인 수정안 또는 삭제 조치, 짧은 이유가 포함되어야 합니다.

"모호하다", "명확하게 작성하라", "전문적으로 수정하라"처럼
구체적인 수정안이 없는 피드백은 출력하지 마세요.

"모르겠다", "ㅋㅋ" 등 시험 답안과 무관하거나 부적절한 표현은
장황하게 해설하지 말고 type "delete"로 간결히 안내하세요.

사용자의 답안에 없는 전문 내용을 새로 추가하지 마세요.
정답이나 새로운 감사 지식, 기준서 근거를 만들어내지 마세요.
수정 예시는 사용자가 작성한 내용의 범위 안에서만 고치세요.

우선 검토 순서:
1. 요구사항과 무관하거나 시험 답안으로 부적절한 내용
2. 주어·목적어·대상이 빠져 의미가 불분명한 문장
3. 결론과 이유가 문장상 서로 모순되는 경우
4. 한 문장에 여러 행위가 뒤섞여 분리가 필요한 경우
5. 같은 말의 불필요한 반복
6. 구어적이거나 지나치게 축약된 표현
7. 맞춤법·띄어쓰기

최대 5개 항목만 출력하세요. 같은 문제 유형은 하나로 묶고, 같은 단어 중복 출력 금지.
수정할 내용이 없으면 items를 빈 배열로 반환하세요. 억지로 피드백을 생성하지 마세요.

JSON 형식으로만 응답하세요:
{
  "items": [
    {
      "location": { "page": 1, "question": "물음2", "item": "③" },
      "type": "replace",
      "original": "업무에서 제외한다.",
      "suggestion": "해당 공인회계사를 감사업무에서 제외한다.",
      "reason": "적용 대상과 범위가 명확해집니다."
    },
    {
      "location": { "page": 2, "question": "물음6", "item": "④" },
      "type": "delete",
      "original": "이유를 모르겠어 ㅋㅋ",
      "suggestion": "",
      "reason": "요구사항과 관련이 없거나 시험 답안으로 적절하지 않은 내용입니다."
    }
  ],
  "repeatedHabits": [
    {
      "label": "목적어 생략",
      "count": 2,
      "advice": "행위의 대상과 적용 범위를 함께 작성하세요."
    }
  ]
}

type 허용값: replace, delete, split, clarify
repeatedHabits는 실제 반복된 습관만 포함하세요.`;

app.get("/api/answer-feedback/health", (_req, res) => {
  res.json({ ok: true, hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY) });
});

app.post("/api/answer-feedback", async (req, res) => {
  try {
    if (req.body?.forceFail) {
      return res.status(503).json({ error: "피드백 서비스를 일시적으로 사용할 수 없습니다." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const answerText = String(req.body?.answerText || "").trim();
    if (!answerText) {
      return res.status(400).json({ error: "답안 텍스트가 필요합니다." });
    }

    const docTitle = String(req.body?.docTitle || "").trim();
    const userPrompt = `${docTitle ? `시험지: ${docTitle}\n\n` : ""}[전체 답안]\n${answerText}`;

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANSWER_FEEDBACK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });

    const parsed = JSON.parse(content);
    res.json({ feedback: normalizeAnswerFeedback(parsed) });
  } catch (error) {
    console.error("Answer feedback error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "피드백 오류" });
  }
});

function normalizeCoachFeedbacks(data) {
  if (!data || !Array.isArray(data.feedbacks)) return [];
  const validCategories = ["감사기준 표현", "논리", "문장구성", "용어선택", "표현"];
  return data.feedbacks
    .filter((f) => f?.suggestion || f?.reason)
    .slice(0, 5)
    .map((f) => ({
      original: String(f.original || "").trim(),
      suggestion: String(f.suggestion || "").trim(),
      reason: String(f.reason || "").trim(),
      category: validCategories.includes(f.category) ? f.category : "표현",
    }));
}

app.post("/api/answer-coach", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const { mode, selectedText, fullAnswer, problemNumber, year, questionNumber } = req.body;

    if (!VALID_COACH_MODES.includes(mode)) {
      return res.status(400).json({ error: "유효하지 않은 첨삭 유형입니다." });
    }

    const text = String(selectedText || "").trim();
    if (!text) {
      return res.status(400).json({ error: "선택된 답안 텍스트가 필요합니다." });
    }

    const meta = [
      year ? `연도: ${year}` : null,
      problemNumber ? `문제번호: ${problemNumber}` : null,
      questionNumber ? `물음: ${questionNumber}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const userPrompt = `${meta ? meta + "\n\n" : ""}[선택된 답안 부분]\n${text}${
      fullAnswer ? `\n\n[전체 답안 맥락 참고용 — 이 내용을 대신 작성하지 마세요]\n${String(fullAnswer).slice(0, 2000)}` : ""
    }`;

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANSWER_COACH_PROMPTS[mode] },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI 응답 없음" });

    const parsed = JSON.parse(content);
    res.json({ feedbacks: normalizeCoachFeedbacks(parsed), mode });
  } catch (error) {
    console.error("Answer coach error:", error);
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "AI 응답 JSON 파싱 실패" });
    }
    res.status(500).json({ error: error.message || "첨삭 오류" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CPA Answer Coach Workspace running on port ${PORT}`);
});
