require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");

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

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT = `당신은 Big4 감사인의 감사계획·위험평가·대응절차 수립을 보조하는 도구입니다.
CPA 정답·모범답안·최종감사의견을 작성하지 마세요.

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

app.listen(PORT, () => {
  console.log(`Audit AI Assistant server running at http://localhost:${PORT}`);
});
