/**
 * Study — 재무제표 영역 파싱 결과 기반 분석적절차 (클라이언트 계산)
 */

const ASSERTION_TERMS = ["발생", "완전성", "정확성", "평가", "귀속", "표시와 공시"];

const ACCOUNT_ALIASES = {
  매출채권: ["매출채권", "외상매출금", "매출채권및기타채권"],
  매출액: ["매출액", "매출", "수익", "영업수익", "매출수익"],
  매출원가: ["매출원가", "매출원가및기타원가"],
  매출총이익: ["매출총이익", "총이익"],
  유동자산: ["유동자산", "유동자산합계"],
  유동부채: ["유동부채", "유동부채합계"],
  자산총계: ["자산총계", "자산합계", "총자산"],
  부채총계: ["부채총계", "부채합계", "총부채"],
  자본총계: ["자본총계", "자본합계", "총자본"],
};

const PROCEDURE_DEFS = [
  { id: "variance", label: "증감분석" },
  { id: "composition", label: "구성비분석" },
  { id: "arTurnover", label: "매출채권회전율" },
  { id: "collectionPeriod", label: "평균회수기간" },
  { id: "grossMargin", label: "매출총이익률" },
  { id: "currentRatio", label: "유동비율" },
];

function normName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]]/g, "");
}

function findAccount(accounts, key) {
  const aliases = ACCOUNT_ALIASES[key] || [key];
  const aliasNorm = aliases.map(normName);
  return accounts.find((a) => aliasNorm.some((al) => normName(a.name).includes(al) || al.includes(normName(a.name))));
}

function fmtNum(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;
}

function fmtRatio(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
}

function safeDivide(num, den, label) {
  if (den === null || den === undefined || den === 0) {
    return { ok: false, error: `${label} 계산에 필요한 분모가 0이거나 없습니다.` };
  }
  if (num === null || num === undefined) {
    return { ok: false, error: `${label} 계산에 필요한 값이 없습니다.` };
  }
  return { ok: true, value: num / den };
}

export function normalizeFinancialParse(data) {
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

  for (const a of accounts) {
    if (!Number.isFinite(a.priorAmount)) a.priorAmount = null;
    if (!Number.isFinite(a.currentAmount)) a.currentAmount = null;
  }

  return {
    isFinancialStatement: Boolean(data.isFinancialStatement) && accounts.length >= 2,
    statementType: data.statementType || "unknown",
    statementTitle: String(data.statementTitle || "").trim(),
    periodLabels: data.periodLabels || ["전기", "당기"],
    accounts,
  };
}

export function detectAvailableProcedures(parsed) {
  const { accounts, statementType } = parsed;
  const available = [];
  const reasons = {};

  const hasVariance = accounts.some(
    (a) => a.priorAmount !== null && a.currentAmount !== null && (a.priorAmount !== 0 || a.currentAmount !== 0)
  );
  if (hasVariance) {
    available.push("variance");
    reasons.variance = "전기·당기 금액이 있는 계정";
  }

  const totalKey =
    statementType === "income_statement"
      ? findAccount(accounts, "매출액") || accounts.find((a) => /매출|수익/.test(a.name))
      : findAccount(accounts, "자산총계") || findAccount(accounts, "유동자산");
  const totalCurrent = totalKey?.currentAmount;
  const compCandidates = accounts.filter(
    (a) => a.currentAmount !== null && a.name !== totalKey?.name && Math.abs(a.currentAmount) > 0
  );
  if (totalCurrent && compCandidates.length >= 2) {
    available.push("composition");
    reasons.composition = `${totalKey.name} 대비 구성비 산출 가능`;
  }

  const ar = findAccount(accounts, "매출채권");
  const sales = findAccount(accounts, "매출액");
  if (ar && sales && ar.priorAmount !== null && ar.currentAmount !== null && sales.priorAmount !== null && sales.currentAmount !== null) {
    available.push("arTurnover", "collectionPeriod");
    reasons.arTurnover = "매출채권·매출액 동시 존재";
    reasons.collectionPeriod = "회전율 산출 후 회수기간 계산";
  }

  const revenue = findAccount(accounts, "매출액");
  const cogs = findAccount(accounts, "매출원가");
  const gross = findAccount(accounts, "매출총이익");
  if (revenue?.currentAmount && (cogs?.currentAmount !== null || gross?.currentAmount !== null)) {
    available.push("grossMargin");
    reasons.grossMargin = "매출·원가(또는 매출총이익) 존재";
  }

  const ca = findAccount(accounts, "유동자산");
  const cl = findAccount(accounts, "유동부채");
  if (ca?.currentAmount !== null && cl?.currentAmount !== null) {
    available.push("currentRatio");
    reasons.currentRatio = "유동자산·유동부채 존재";
  }

  return {
    procedures: PROCEDURE_DEFS.filter((p) => available.includes(p.id)),
    reasons,
  };
}

function runVariance(accounts) {
  const rows = accounts
    .filter((a) => a.priorAmount !== null && a.currentAmount !== null)
    .map((a) => {
      const change = a.currentAmount - a.priorAmount;
      const rate = a.priorAmount === 0 ? null : (change / a.priorAmount) * 100;
      return {
        account: a.name,
        priorAmount: a.priorAmount,
        currentAmount: a.currentAmount,
        changeAmount: change,
        changeRate: rate,
        formula:
          a.priorAmount === 0
            ? `증감액 = ${fmtNum(a.currentAmount)} − ${fmtNum(a.priorAmount)} = ${fmtNum(change)}`
            : `증감률 = (${fmtNum(change)} ÷ ${fmtNum(a.priorAmount)}) × 100 = ${fmtPct(rate)}`,
      };
    });
  return { ok: rows.length > 0, rows, summary: rows.length ? `${rows.length}개 계정 증감분석` : "증감분석 불가" };
}

function runComposition(accounts, statementType) {
  const totalAcc =
    statementType === "income_statement"
      ? findAccount(accounts, "매출액")
      : findAccount(accounts, "자산총계") || findAccount(accounts, "유동자산");
  if (!totalAcc?.currentAmount) return { ok: false, error: "구성비 기준 총액을 찾지 못했습니다." };

  const rows = accounts
    .filter((a) => a.currentAmount !== null && a.name !== totalAcc.name && Math.abs(a.currentAmount) > 0)
    .map((a) => {
      const ratio = (a.currentAmount / totalAcc.currentAmount) * 100;
      return {
        account: a.name,
        currentAmount: a.currentAmount,
        totalAmount: totalAcc.currentAmount,
        compositionRatio: ratio,
        formula: `${fmtNum(a.currentAmount)} ÷ ${fmtNum(totalAcc.currentAmount)} × 100 = ${fmtPct(ratio)}`,
      };
    });
  return {
    ok: rows.length > 0,
    baseAccount: totalAcc.name,
    rows,
    summary: rows.length ? `${totalAcc.name} 대비 ${rows.length}개 계정 구성비` : "구성비분석 불가",
  };
}

function runArTurnover(accounts) {
  const ar = findAccount(accounts, "매출채권");
  const sales = findAccount(accounts, "매출액");
  if (!ar || !sales) return { ok: false, error: "매출채권·매출액이 필요합니다." };

  const priorAvg = ar.priorAmount;
  const currentAvg = ar.currentAmount;
  const priorTurn = safeDivide(sales.priorAmount, priorAvg, "전기 회전율");
  const currentTurn = safeDivide(sales.currentAmount, currentAvg, "당기 회전율");

  return {
    ok: priorTurn.ok || currentTurn.ok,
    priorTurnover: priorTurn.ok ? priorTurn.value : null,
    currentTurnover: currentTurn.ok ? currentTurn.value : null,
    priorCollectionDays: priorTurn.ok && priorTurn.value ? 365 / priorTurn.value : null,
    currentCollectionDays: currentTurn.ok && currentTurn.value ? 365 / currentTurn.value : null,
    formula: `회전율 = 매출액 ÷ 평균매출채권 (기말잔액 근사)`,
    detail: `전기: ${fmtNum(sales.priorAmount)} ÷ ${fmtNum(priorAvg)} = ${fmtRatio(priorTurn.value)} / 당기: ${fmtNum(sales.currentAmount)} ÷ ${fmtNum(currentAvg)} = ${fmtRatio(currentTurn.value)}`,
    summary: `전기 회전율 ${fmtRatio(priorTurn.value)} → 당기 ${fmtRatio(currentTurn.value)}`,
  };
}

function runCollectionPeriod(accounts) {
  const t = runArTurnover(accounts);
  if (!t.ok) return t;
  return {
    ok: true,
    priorDays: t.priorCollectionDays,
    currentDays: t.currentCollectionDays,
    formula: "평균회수기간 = 365 ÷ 회전율",
    detail: `전기 ${fmtNum(t.priorCollectionDays)}일 / 당기 ${fmtNum(t.currentCollectionDays)}일`,
    summary: `전기 ${fmtNum(t.priorCollectionDays)}일 → 당기 ${fmtNum(t.currentCollectionDays)}일`,
  };
}

function runGrossMargin(accounts) {
  const revenue = findAccount(accounts, "매출액");
  const gross = findAccount(accounts, "매출총이익");
  const cogs = findAccount(accounts, "매출원가");
  if (!revenue?.currentAmount) return { ok: false, error: "매출액이 필요합니다." };

  const calc = (rev, g, c) => {
    const gp = g !== null && g !== undefined ? g : rev - (c || 0);
    const r = safeDivide(gp, rev, "매출총이익률");
    return r.ok ? r.value * 100 : null;
  };

  const priorRate = calc(revenue.priorAmount, gross?.priorAmount, cogs?.priorAmount);
  const currentRate = calc(revenue.currentAmount, gross?.currentAmount, cogs?.currentAmount);

  return {
    ok: priorRate !== null || currentRate !== null,
    priorMargin: priorRate,
    currentMargin: currentRate,
    formula: "매출총이익률 = 매출총이익 ÷ 매출액 × 100",
    summary: `전기 ${fmtPct(priorRate)} → 당기 ${fmtPct(currentRate)}`,
  };
}

function runCurrentRatio(accounts) {
  const ca = findAccount(accounts, "유동자산");
  const cl = findAccount(accounts, "유동부채");
  if (!ca || !cl) return { ok: false, error: "유동자산·유동부채가 필요합니다." };

  const prior = safeDivide(ca.priorAmount, cl.priorAmount, "전기 유동비율");
  const current = safeDivide(ca.currentAmount, cl.currentAmount, "당기 유동비율");

  return {
    ok: prior.ok || current.ok,
    priorRatio: prior.ok ? prior.value : null,
    currentRatio: current.ok ? current.value : null,
    formula: "유동비율 = 유동자산 ÷ 유동부채",
    detail: `전기 ${fmtRatio(prior.value)} / 당기 ${fmtRatio(current.value)}`,
    summary: `전기 ${fmtRatio(prior.value)} → 당기 ${fmtRatio(current.value)}`,
  };
}

const RUNNERS = {
  variance: runVariance,
  composition: (accounts, parsed) => runComposition(accounts, parsed.statementType),
  arTurnover: runArTurnover,
  collectionPeriod: runCollectionPeriod,
  grossMargin: runGrossMargin,
  currentRatio: runCurrentRatio,
};

export function runAnalyticalProcedures(parsed, procedureIds) {
  const ids = procedureIds?.length ? procedureIds : detectAvailableProcedures(parsed).procedures.map((p) => p.id);
  const results = [];

  for (const id of ids) {
    const def = PROCEDURE_DEFS.find((p) => p.id === id);
    const runner = RUNNERS[id];
    if (!def || !runner) continue;
    const output = runner(parsed.accounts, parsed);
    results.push({
      id,
      label: def.label,
      ok: output.ok !== false,
      ...output,
    });
  }

  return {
    statementType: parsed.statementType,
    statementTitle: parsed.statementTitle,
    identifiedAccounts: parsed.accounts.map((a) => a.name),
    results,
  };
}

export function renderAnalyticalResultsHtml(analytical) {
  if (!analytical?.results?.length) return "<p>실행 가능한 분석적절차 결과가 없습니다.</p>";

  return analytical.results
    .map((r) => {
      let body = "";
      if (r.id === "variance" && r.rows) {
        body = `<ul>${r.rows
          .map(
            (row) =>
              `<li><strong>${escapeHtml(row.account)}</strong>: 증감액 ${fmtNum(row.changeAmount)}, 증감률 ${fmtPct(row.changeRate)}</li>`
          )
          .join("")}</ul>`;
      } else if (r.id === "composition" && r.rows) {
        body = `<p>기준: ${escapeHtml(r.baseAccount)}</p><ul>${r.rows
          .map((row) => `<li><strong>${escapeHtml(row.account)}</strong>: ${fmtPct(row.compositionRatio)}</li>`)
          .join("")}</ul>`;
      } else {
        body = `<p>${escapeHtml(r.summary || "")}</p>${r.detail ? `<p class="study-formula">${escapeHtml(r.detail)}</p>` : ""}${r.formula ? `<p class="study-formula-note">${escapeHtml(r.formula)}</p>` : ""}`;
      }
      if (!r.ok) body = `<p class="study-analytical-error">${escapeHtml(r.error || "계산 불가")}</p>`;
      return `<div class="study-analytical-block"><h5>${escapeHtml(r.label)}</h5>${body}</div>`;
    })
    .join("");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export { PROCEDURE_DEFS, ASSERTION_TERMS };
