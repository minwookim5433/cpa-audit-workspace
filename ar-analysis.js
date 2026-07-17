/**
 * 매출채권 실무 분석 — 기준 비교, 특수관계자, 대손충당금 안내 (순수 JS)
 */
(function () {
  "use strict";

  const { formatNumber, formatPercent, formatRatio, formatDays, safeDivide, isRelatedParty, normalizeAgingBucket } =
    window.AnalyticalCalc || {};

  const DEFAULT_AR_CRITERIA = {
    normalDays: 60,
    cautionDays: 90,
    relatedPartyRatioThreshold: 10,
    relatedDaysGap: 30,
    concentrationTop5Threshold: 25,
    over90RatioThreshold: 15,
    watchlistCollectionDays: 60,
    watchlistOverdueDays: 90,
    watchlistBalanceIncreasePercent: 30,
    watchlistArToSalesRatioPercent: 50,
    performanceMaterialityAmount: 300000000,
    customerMaterialityRatioPercent: 5,
    watchlistMinScore: 3,
    watchlistDisplayLimit: 5,
  };

  const WATCHLIST_SCORE = {
    related_party: 2,
    collection_days: 2,
    long_overdue: 2,
    materiality_ar: 2,
    ar_to_sales: 2,
    balance_increase: 1,
    low_company_allowance: 2,
  };

  const DEFAULT_ALLOWANCE_RATES = {
    normal: 0,
    within30: 0,
    "31to60": 1,
    "61to90": 3,
    over90: 10,
  };

  const AGING_BUCKET_DEFS = [
    { id: "normal", label: "정상" },
    { id: "within30", label: "30일 이하" },
    { id: "31to60", label: "31~60일" },
    { id: "61to90", label: "61~90일" },
    { id: "over90", label: "90일 초과" },
  ];

  const FOLLOW_UP_BY_REASON = {
    collection_days: ["후속현금회수 확인", "계약서 검토"],
    materiality_ar: ["외부조회", "후속현금회수 확인"],
    long_overdue: ["후속현금회수 확인", "개별평가 검토"],
    related_party: ["계약서 검토", "외부조회"],
    balance_increase: ["후속현금회수 확인", "외부조회"],
    ar_to_sales: ["후속현금회수 확인", "계약서 검토"],
    low_company_allowance: ["개별평가 검토", "대손충당금 산정 근거 검토"],
  };

  const REVIEW_PHRASE = {
    fictitious: "가공매출 가능성 추가 검토",
    collectibility: "회수가능성 추가 검토",
    allowance: "대손충당금 과소계상 가능성 추가 검토",
  };

  const REASON_REVIEW_TYPE = {
    collection_days: "collectibility",
    materiality_ar: "collectibility",
    long_overdue: "collectibility",
    related_party: "fictitious",
    balance_increase: "fictitious",
    ar_to_sales: "fictitious",
    low_company_allowance: "allowance",
  };

  function buildReviewReason(code, detail) {
    const type = REASON_REVIEW_TYPE[code] || "collectibility";
    return {
      code,
      reviewType: type,
      reviewPhrase: REVIEW_PHRASE[type],
      message: `${REVIEW_PHRASE[type]} — ${detail}`,
    };
  }

  function watchlistSortScore(customer) {
    return (
      customer.riskScore * 1e12 +
      (customer.currentClosing || 0) * 1e6 +
      (customer.arRatioPercent || 0)
    );
  }

  function tierFromScore(score, minScore) {
    if (score >= minScore) return { tier: "watchlist", label: "주의 대상" };
    if (score >= 1) return { tier: "observation", label: "일반관찰" };
    return { tier: "normal", label: "정상" };
  }

  function meetsMaterialityThreshold(closing, arRatio, criteria) {
    const byAmount =
      criteria.performanceMaterialityAmount > 0 && closing >= criteria.performanceMaterialityAmount;
    const byRatio = arRatio !== null && arRatio >= criteria.customerMaterialityRatioPercent;
    return byAmount || byRatio;
  }

  function sliceWatchlistDisplay(eligible, displayLimit) {
    if (!Number.isFinite(displayLimit)) return eligible;
    return eligible.slice(0, displayLimit);
  }

  const CRITERIA_STORAGE_KEY = "audit-workbench-ar-criteria";
  const ALLOWANCE_RATES_STORAGE_KEY = "audit-workbench-ar-allowance-rates";

  function loadArCriteria() {
    try {
      const raw = localStorage.getItem(CRITERIA_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_AR_CRITERIA };
      return { ...DEFAULT_AR_CRITERIA, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_AR_CRITERIA };
    }
  }

  function saveArCriteria(criteria) {
    localStorage.setItem(CRITERIA_STORAGE_KEY, JSON.stringify(criteria));
  }

  function loadAllowanceRates() {
    try {
      const raw = localStorage.getItem(ALLOWANCE_RATES_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_ALLOWANCE_RATES };
      return { ...DEFAULT_ALLOWANCE_RATES, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_ALLOWANCE_RATES };
    }
  }

  function saveAllowanceRates(rates) {
    localStorage.setItem(ALLOWANCE_RATES_STORAGE_KEY, JSON.stringify(rates));
  }

  function parseAllowanceRatesInput(rates) {
    const parsed = { ...DEFAULT_ALLOWANCE_RATES, ...rates };
    for (const key of Object.keys(parsed)) {
      parsed[key] = Math.max(0, Number(parsed[key]) || 0);
    }
    return parsed;
  }

  function parseCriteriaInput(criteria) {
    const c = { ...DEFAULT_AR_CRITERIA, ...criteria };
    c.normalDays = Math.max(1, Number(c.normalDays) || DEFAULT_AR_CRITERIA.normalDays);
    c.cautionDays = Math.max(c.normalDays, Number(c.cautionDays) || DEFAULT_AR_CRITERIA.cautionDays);
    c.relatedPartyRatioThreshold = Math.max(0, Number(c.relatedPartyRatioThreshold) || 0);
    c.relatedDaysGap = Math.max(0, Number(c.relatedDaysGap) || 0);
    c.concentrationTop5Threshold = Math.max(0, Number(c.concentrationTop5Threshold) || 0);
    c.over90RatioThreshold = Math.max(0, Number(c.over90RatioThreshold) || 0);
    c.watchlistCollectionDays = Math.max(1, Number(c.watchlistCollectionDays) || DEFAULT_AR_CRITERIA.watchlistCollectionDays);
    c.watchlistOverdueDays = Math.max(1, Number(c.watchlistOverdueDays) || DEFAULT_AR_CRITERIA.watchlistOverdueDays);
    c.watchlistBalanceIncreasePercent = Math.max(0, Number(c.watchlistBalanceIncreasePercent) || 0);
    c.watchlistArToSalesRatioPercent = Math.max(0, Number(c.watchlistArToSalesRatioPercent) || 0);
    c.performanceMaterialityAmount = Math.max(0, Number(c.performanceMaterialityAmount) || 0);
    c.customerMaterialityRatioPercent = Math.max(0, Number(c.customerMaterialityRatioPercent) || 0);
    c.watchlistMinScore = Math.max(1, Number(c.watchlistMinScore) || DEFAULT_AR_CRITERIA.watchlistMinScore);
    const displayLimitRaw = criteria?.watchlistDisplayLimit;
    if (displayLimitRaw === "all" || displayLimitRaw === 0 || displayLimitRaw === "0") {
      c.watchlistDisplayLimit = Infinity;
    } else {
      c.watchlistDisplayLimit = Math.max(1, Number(displayLimitRaw) || DEFAULT_AR_CRITERIA.watchlistDisplayLimit);
    }
    return c;
  }

  function formatTurnoverTimes(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return `${formatRatio(value)}회`;
  }

  function formatTurnoverChangeLabel(change) {
    if (!change || change.absolute === null) return "";
    if (change.directionCode === "flat") return " (변동 없음)";
    return change.directionCode === "down" ? " (감소)" : " (증가)";
  }

  function formatDaysChangeLabel(change) {
    if (!change || change.absolute === null) return "";
    if (change.directionCode === "flat") return " (변동 없음)";
    const abs = formatRatio(Math.abs(change.absolute));
    return change.improved === false ? ` (${abs}일 악화)` : change.improved === true ? ` (${abs}일 개선)` : ` (${abs}일 변동)`;
  }

  function buildCompactTurnoverSummaries(turnover) {
    if (!turnover?.ok) return turnover;
    const daysLine =
      turnover.priorCollectionDays !== null && turnover.currentCollectionDays !== null
        ? `전기 ${formatRatio(turnover.priorCollectionDays)}일 → 당기 ${formatRatio(turnover.currentCollectionDays)}일${formatDaysChangeLabel(turnover.daysChangeAnalysis)}`
        : null;
    const turnoverLine =
      turnover.priorTurnover !== null && turnover.currentTurnover !== null
        ? `전기 ${formatTurnoverTimes(turnover.priorTurnover)} → 당기 ${formatTurnoverTimes(turnover.currentTurnover)}${formatTurnoverChangeLabel(turnover.turnoverChangeAnalysis)}`
        : null;
    return { ...turnover, daysSummaryLine: daysLine, turnoverSummaryLine: turnoverLine };
  }

  function classifyCollectionDays(days, criteria) {
    if (days === null || days === undefined || !Number.isFinite(days)) {
      return { status: "—", label: "계산 불가", exceedsNormal: null, exceedsCaution: null };
    }
    const normalMax = criteria.normalDays;
    const cautionMax = criteria.cautionDays;
    if (days <= normalMax) {
      return {
        status: "normal",
        label: "정상",
        exceedsNormal: false,
        exceedsCaution: false,
        description: `정상 신용기간 ${normalMax}일 이하`,
      };
    }
    if (days <= cautionMax) {
      return {
        status: "caution",
        label: "주의",
        exceedsNormal: true,
        exceedsCaution: false,
        description: `${normalMax + 1}~${cautionMax}일 (주의 구간)`,
      };
    }
    return {
      status: "review",
      label: "추가 검토 필요",
      exceedsNormal: true,
      exceedsCaution: true,
      description: `${cautionMax}일 초과`,
    };
  }

  function computeChangeAnalysis(prior, current, { higherIsBetter = false } = {}) {
    if (prior === null || current === null || !Number.isFinite(prior) || !Number.isFinite(current)) {
      return {
        absolute: null,
        ratePercent: null,
        direction: "—",
        directionCode: null,
        improved: null,
      };
    }
    const absolute = current - prior;
    const ratePercent = prior !== 0 ? (absolute / prior) * 100 : null;
    let directionCode;
    if (absolute > 0) directionCode = "up";
    else if (absolute < 0) directionCode = "down";
    else directionCode = "flat";

    const improved =
      directionCode === "flat"
        ? null
        : higherIsBetter
          ? absolute > 0
          : absolute < 0;

    const direction =
      directionCode === "flat"
        ? "변동 없음"
        : improved
          ? "개선"
          : "악화";

    return { absolute, ratePercent, direction, directionCode, improved };
  }

  function enrichTurnoverResult(turnover, criteria) {
    if (!turnover?.ok || !criteria) return turnover;

    const turnoverChangeAnalysis = computeChangeAnalysis(turnover.priorTurnover, turnover.currentTurnover, {
      higherIsBetter: true,
    });
    const daysChangeAnalysis = computeChangeAnalysis(turnover.priorCollectionDays, turnover.currentCollectionDays, {
      higherIsBetter: false,
    });

    const priorDaysClass = classifyCollectionDays(turnover.priorCollectionDays, criteria);
    const currentDaysClass = classifyCollectionDays(turnover.currentCollectionDays, criteria);

    return {
      ...turnover,
      criteria: { ...criteria },
      turnoverChangeAnalysis,
      daysChangeAnalysis,
      priorDaysClass,
      currentDaysClass,
      turnoverChangeRatePercent: turnoverChangeAnalysis.ratePercent,
      daysChangeRatePercent: daysChangeAnalysis.ratePercent,
      ...buildCompactTurnoverSummaries({
        ...turnover,
        turnoverChangeAnalysis,
        daysChangeAnalysis,
      }),
    };
  }

  function computeCustomerCollectionDays(d) {
    if (d.collectionDays !== null && d.collectionDays !== undefined && Number.isFinite(d.collectionDays)) {
      return d.collectionDays;
    }
    const avg = (d.currentOpening + d.currentClosing) / 2;
    if (!avg || !d.currentSales) return null;
    const turnRes = safeDivide(d.currentSales, avg, "거래처 평균매출채권");
    if (!turnRes.ok || !turnRes.value) return null;
    const daysRes = safeDivide(365, turnRes.value, "거래처 회전율");
    return daysRes.ok ? daysRes.value : null;
  }

  function agingBucketLabel(bucket, raw) {
    if (raw) return String(raw);
    const found = AGING_BUCKET_DEFS.find((b) => b.id === bucket);
    return found ? found.label : "—";
  }

  function isLongOverdue(bucket, collectionDays, overdueDays) {
    if (bucket === "over90") return true;
    return collectionDays !== null && collectionDays >= overdueDays;
  }

  function calculateWatchlistCustomers(accountData, criteria) {
    if (!accountData.arAggregate) {
      return { ok: false, error: "주의 거래처 분석에 필요한 AR 상세 열이 없습니다." };
    }

    const parsedCriteria = parseCriteriaInput(criteria);
    const userRates = criteria?.allowanceRates || loadAllowanceRates();
    const totalAR = accountData.currentAmount;
    let totalSales = 0;
    for (const row of accountData.sourceRows) {
      totalSales += row.arDetail?.currentSales || 0;
    }

    const customers = [];
    const allRows = [];
    let normalCount = 0;
    let observationCount = 0;

    for (const row of accountData.sourceRows) {
      const d = row.arDetail;
      if (!d) continue;

      const collectionDays = computeCustomerCollectionDays(d);
      const arRatioRes = safeDivide(d.currentClosing, totalAR, "당기기말잔액 합계");
      const arRatio = arRatioRes.ok ? arRatioRes.value * 100 : null;
      const arToSalesRes = safeDivide(d.currentClosing, d.currentSales, "당기 매출액");
      const arToSales = arToSalesRes.ok ? arToSalesRes.value * 100 : null;
      const bucket = normalizeAgingBucket(d.aging);
      const agingLabel = agingBucketLabel(bucket, d.aging);
      const balanceIncreaseRes =
        d.priorClosing > 0 ? safeDivide(d.currentClosing - d.priorClosing, d.priorClosing, "전기기말잔액") : { ok: false };
      const balanceIncrease = balanceIncreaseRes.ok ? balanceIncreaseRes.value * 100 : null;

      let riskScore = 0;
      const reasons = [];
      const isRelated = isRelatedParty(d.relatedParty);

      if (isRelated) {
        riskScore += WATCHLIST_SCORE.related_party;
        reasons.push(buildReviewReason("related_party", "특수관계자 거래처"));
      }
      if (collectionDays !== null && collectionDays > parsedCriteria.watchlistCollectionDays) {
        riskScore += WATCHLIST_SCORE.collection_days;
        reasons.push(
          buildReviewReason(
            "collection_days",
            `회수기간 ${formatDays(collectionDays)} (기준 ${parsedCriteria.watchlistCollectionDays}일 초과)`
          )
        );
      }
      if (isLongOverdue(bucket, collectionDays, parsedCriteria.watchlistOverdueDays)) {
        riskScore += WATCHLIST_SCORE.long_overdue;
        reasons.push(buildReviewReason("long_overdue", `연체구간 ${agingLabel}`));
      }
      if (meetsMaterialityThreshold(d.currentClosing, arRatio, parsedCriteria)) {
        riskScore += WATCHLIST_SCORE.materiality_ar;
        const detail =
          d.currentClosing >= parsedCriteria.performanceMaterialityAmount
            ? `당기말 ${formatNumber(d.currentClosing)} (수행중요성 ${formatNumber(parsedCriteria.performanceMaterialityAmount)} 이상)`
            : `채권비중 ${formatPercent(arRatio)} (기준 ${formatPercent(parsedCriteria.customerMaterialityRatioPercent)} 이상)`;
        reasons.push(buildReviewReason("materiality_ar", detail));
      }
      if (arToSales !== null && arToSales >= parsedCriteria.watchlistArToSalesRatioPercent) {
        riskScore += WATCHLIST_SCORE.ar_to_sales;
        reasons.push(
          buildReviewReason(
            "ar_to_sales",
            `매출액 대비 채권비율 ${formatPercent(arToSales)} (기준 ${formatPercent(parsedCriteria.watchlistArToSalesRatioPercent)} 이상)`
          )
        );
      }
      if (balanceIncrease !== null && balanceIncrease >= parsedCriteria.watchlistBalanceIncreasePercent) {
        riskScore += WATCHLIST_SCORE.balance_increase;
        reasons.push(
          buildReviewReason(
            "balance_increase",
            `전기 대비 잔액 증가율 ${formatPercent(balanceIncrease)} (기준 ${formatPercent(parsedCriteria.watchlistBalanceIncreasePercent)} 이상)`
          )
        );
      }
      if (d.companyAppliedAllowanceRate !== null && bucket && userRates[bucket] !== undefined) {
        if (d.companyAppliedAllowanceRate < userRates[bucket]) {
          riskScore += WATCHLIST_SCORE.low_company_allowance;
          reasons.push(
            buildReviewReason(
              "low_company_allowance",
              `회사적용 ${formatPercent(d.companyAppliedAllowanceRate)} < 사용자 충당률 ${formatPercent(userRates[bucket])}`
            )
          );
        }
      }

      const tierInfo = tierFromScore(riskScore, parsedCriteria.watchlistMinScore);
      if (tierInfo.tier === "normal") normalCount += 1;
      else if (tierInfo.tier === "observation") observationCount += 1;

      const followUp = new Set();
      for (const reason of reasons) {
        for (const proc of FOLLOW_UP_BY_REASON[reason.code] || []) followUp.add(proc);
      }

      const record = {
        customer: d.customer || `(${row.rowNum}행)`,
        relatedParty: isRelated,
        currentSales: d.currentSales,
        currentClosing: d.currentClosing,
        arRatioPercent: arRatio,
        arToSalesRatioPercent: arToSales,
        collectionDays,
        agingLabel,
        balanceIncreasePercent: balanceIncrease,
        riskScore,
        reasons,
        followUpProcedures: [...followUp],
        tier: tierInfo.tier,
        status: tierInfo.label,
      };

      allRows.push(record);
      if (riskScore >= parsedCriteria.watchlistMinScore) {
        customers.push(record);
      }
    }

    customers.sort((a, b) => watchlistSortScore(b) - watchlistSortScore(a));
    const displayed = sliceWatchlistDisplay(customers, parsedCriteria.watchlistDisplayLimit);

    return {
      ok: true,
      criteria: parsedCriteria,
      totalAR,
      totalSales,
      totalCustomers: allRows.length,
      normalCount,
      observationCount,
      eligibleCount: customers.length,
      customers: displayed,
      eligibleCustomers: customers,
      allCustomers: allRows,
      watchlistCount: displayed.length,
      displayLimit: Number.isFinite(parsedCriteria.watchlistDisplayLimit)
        ? parsedCriteria.watchlistDisplayLimit
        : "all",
    };
  }

  function calculateAllowanceSimulator(accountData, rates, companyAllowance = null) {
    if (!accountData.arAggregate) {
      return { ok: false, error: "대손충당금 시뮬레이터에 필요한 AR 상세 열이 없습니다." };
    }

    const parsedRates = parseAllowanceRatesInput(rates);
    const totalAR = accountData.currentAmount;
    const bucketAmounts = Object.fromEntries(AGING_BUCKET_DEFS.map((b) => [b.id, 0]));
    let unclassifiedAmount = 0;
    let hasAgingData = false;

    for (const row of accountData.sourceRows) {
      const d = row.arDetail;
      if (!d) continue;
      if (d.aging) hasAgingData = true;
      const bucket = normalizeAgingBucket(d.aging);
      if (bucket && bucketAmounts[bucket] !== undefined) {
        bucketAmounts[bucket] += d.currentClosing;
      } else {
        unclassifiedAmount += d.currentClosing;
      }
    }

    const buckets = AGING_BUCKET_DEFS.map((def) => {
      const amount = bucketAmounts[def.id] || 0;
      const ratePercent = parsedRates[def.id];
      const allowance = (amount * ratePercent) / 100;
      return {
        id: def.id,
        label: def.label,
        amount,
        ratePercent,
        allowance,
        formula: `${formatNumber(amount)} × ${formatPercent(ratePercent)} = ${formatNumber(allowance)}`,
      };
    });

    const totalEstimatedAllowance = buckets.reduce((sum, b) => sum + b.allowance, 0);
    let companyRecorded =
      companyAllowance !== null && companyAllowance !== "" && Number.isFinite(Number(companyAllowance))
        ? Number(companyAllowance)
        : null;

    if (companyRecorded === null) {
      let sumCompany = 0;
      let hasCompany = false;
      for (const row of accountData.sourceRows) {
        const d = row.arDetail;
        if (d?.companyRecordedAllowance !== null && d?.companyRecordedAllowance !== undefined) {
          sumCompany += d.companyRecordedAllowance;
          hasCompany = true;
        }
      }
      if (hasCompany) companyRecorded = sumCompany;
    }
    const difference = companyRecorded !== null ? totalEstimatedAllowance - companyRecorded : null;
    const allowanceRatioRes = safeDivide(totalEstimatedAllowance, totalAR, "당기기말잔액 합계");
    const allowanceRatioPercent = allowanceRatioRes.ok ? allowanceRatioRes.value * 100 : null;

    let relatedAR = 0;
    let relatedAllowance = 0;
    const individualReviewCustomers = [];
    const reviewAmountThreshold = totalAR * 0.01;

    for (const row of accountData.sourceRows) {
      const d = row.arDetail;
      if (!d) continue;
      const bucket = normalizeAgingBucket(d.aging);
      const rate = bucket ? parsedRates[bucket] : 0;
      const estimated = (d.currentClosing * rate) / 100;

      if (isRelatedParty(d.relatedParty)) {
        relatedAR += d.currentClosing;
        relatedAllowance += estimated;
      }

      const isLongTerm = bucket === "over90" || bucket === "61to90";
      if (isLongTerm && d.currentClosing >= reviewAmountThreshold) {
        individualReviewCustomers.push({
          customer: d.customer || `(${row.rowNum}행)`,
          amount: d.currentClosing,
          agingLabel: agingBucketLabel(bucket, d.aging),
          relatedParty: isRelatedParty(d.relatedParty),
          estimatedAllowance: estimated,
          note: "개별평가 검토 대상 — 고액 또는 장기연체",
        });
      }
    }

    individualReviewCustomers.sort((a, b) => b.amount - a.amount);
    const relatedArRatioRes = safeDivide(relatedAR, totalAR, "당기기말잔액 합계");

    return {
      ok: true,
      rates: parsedRates,
      totalAR,
      buckets,
      unclassifiedAmount,
      hasAgingData,
      totalEstimatedAllowance,
      companyRecordedAllowance: companyRecorded,
      difference,
      allowanceRatioPercent,
      relatedParty: {
        arAmount: relatedAR,
        estimatedAllowance: relatedAllowance,
        arRatioPercent: relatedArRatioRes.ok ? relatedArRatioRes.value * 100 : null,
      },
      individualReviewCustomers,
    };
  }

  function sumGroupRows(rows) {
    const agg = {
      priorOpening: 0,
      priorClosing: 0,
      currentOpening: 0,
      currentClosing: 0,
      priorSales: 0,
      currentSales: 0,
      over90Amount: 0,
      customers: new Map(),
      rowCount: 0,
    };

    for (const row of rows) {
      const d = row.arDetail;
      if (!d) continue;
      agg.priorOpening += d.priorOpening;
      agg.priorClosing += d.priorClosing;
      agg.currentOpening += d.currentOpening;
      agg.currentClosing += d.currentClosing;
      agg.priorSales += d.priorSales || 0;
      agg.currentSales += d.currentSales || 0;
      agg.rowCount += 1;

      const bucket = normalizeAgingBucket(d.aging);
      if (bucket === "over90") agg.over90Amount += d.currentClosing;

      const name = d.customer || `(${row.rowNum}행)`;
      if (!agg.customers.has(name)) agg.customers.set(name, 0);
      agg.customers.set(name, agg.customers.get(name) + d.currentClosing);
    }

    return agg;
  }

  function metricsFromAgg(agg, totalAR) {
    const priorAvgAR = (agg.priorOpening + agg.priorClosing) / 2;
    const currentAvgAR = (agg.currentOpening + agg.currentClosing) / 2;

    const priorTurnRes = safeDivide(agg.priorSales, priorAvgAR, "전기 평균매출채권");
    const curTurnRes = safeDivide(agg.currentSales, currentAvgAR, "당기 평균매출채권");
    const priorTurnover = priorTurnRes.ok ? priorTurnRes.value : null;
    const currentTurnover = curTurnRes.ok ? curTurnRes.value : null;

    const priorDaysRes =
      priorTurnover && priorTurnover !== 0 ? safeDivide(365, priorTurnover, "전기 회전율") : { ok: false, value: null };
    const curDaysRes =
      currentTurnover && currentTurnover !== 0 ? safeDivide(365, currentTurnover, "당기 회전율") : { ok: false, value: null };

    const closingRes = safeDivide(agg.currentClosing, totalAR, "당기기말잔액 합계");
    const over90Res = safeDivide(agg.over90Amount, totalAR, "당기기말잔액 합계");

    const topCustomer = [...agg.customers.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      currentClosing: agg.currentClosing,
      priorClosing: agg.priorClosing,
      ratio: closingRes.ok ? closingRes.value * 100 : null,
      priorAvgAR,
      currentAvgAR,
      priorTurnover,
      currentTurnover,
      priorCollectionDays: priorDaysRes.value,
      currentCollectionDays: curDaysRes.value,
      over90Amount: agg.over90Amount,
      over90Ratio: over90Res.ok ? over90Res.value * 100 : null,
      topCustomer: topCustomer ? { name: topCustomer[0], amount: topCustomer[1] } : null,
      customerCount: agg.customers.size,
    };
  }

  function calculateRelatedPartyAnalysis(accountData, criteria) {
    if (!accountData.arAggregate) {
      return { ok: false, error: "특수관계자 분석에 필요한 AR 상세 열이 없습니다." };
    }

    const parsedCriteria = parseCriteriaInput(criteria);
    const totalAR = accountData.currentAmount;
    const relatedRows = accountData.sourceRows.filter((r) => r.arDetail && isRelatedParty(r.arDetail.relatedParty));
    const nonRelatedRows = accountData.sourceRows.filter((r) => r.arDetail && !isRelatedParty(r.arDetail.relatedParty));

    const related = metricsFromAgg(sumGroupRows(relatedRows), totalAR);
    const nonRelated = metricsFromAgg(sumGroupRows(nonRelatedRows), totalAR);

    const warnings = [];

    if (related.ratio !== null && related.ratio > parsedCriteria.relatedPartyRatioThreshold) {
      warnings.push({
        code: "related_ratio",
        message: `${REVIEW_PHRASE.collectibility} — 특수관계자 비중 ${formatPercent(related.ratio)} (기준 ${formatPercent(parsedCriteria.relatedPartyRatioThreshold)} 초과)`,
      });
    }

    if (
      related.currentCollectionDays !== null &&
      nonRelated.currentCollectionDays !== null &&
      related.currentCollectionDays - nonRelated.currentCollectionDays >= parsedCriteria.relatedDaysGap
    ) {
      warnings.push({
        code: "related_days_gap",
        message: `${REVIEW_PHRASE.collectibility} — 특수관계자 회수기간 ${formatDays(related.currentCollectionDays)}이 비특수 ${formatDays(nonRelated.currentCollectionDays)}보다 ${formatRatio(related.currentCollectionDays - nonRelated.currentCollectionDays)}일 김`,
      });
    }

    if (related.over90Amount > 0) {
      warnings.push({
        code: "related_over90",
        message: `${REVIEW_PHRASE.allowance} — 특수관계자 90일 초과 채권 ${formatNumber(related.over90Amount)}`,
      });
    }

    const diff = {
      closingDiff: related.currentClosing - nonRelated.currentClosing,
      ratioDiff: related.ratio !== null && nonRelated.ratio !== null ? related.ratio - nonRelated.ratio : null,
      turnoverDiff:
        related.currentTurnover !== null && nonRelated.currentTurnover !== null
          ? related.currentTurnover - nonRelated.currentTurnover
          : null,
      daysDiff:
        related.currentCollectionDays !== null && nonRelated.currentCollectionDays !== null
          ? related.currentCollectionDays - nonRelated.currentCollectionDays
          : null,
      over90RatioDiff:
        related.over90Ratio !== null && nonRelated.over90Ratio !== null ? related.over90Ratio - nonRelated.over90Ratio : null,
    };

    return {
      ok: true,
      criteria: parsedCriteria,
      totalAR,
      related,
      nonRelated,
      relatedRowCount: relatedRows.length,
      nonRelatedRowCount: nonRelatedRows.length,
      diff,
      warnings,
      relatedDaysClass: classifyCollectionDays(related.currentCollectionDays, parsedCriteria),
      nonRelatedDaysClass: classifyCollectionDays(nonRelated.currentCollectionDays, parsedCriteria),
    };
  }

  function calculateAllowanceGuidance(items, criteria) {
    const parsedCriteria = parseCriteriaInput(criteria);
    const notes = [];
    const turnover = items.find((i) => i.type === "turnover");
    const aging = items.find((i) => i.type === "aging");
    const concentration = items.find((i) => i.type === "concentration");
    const relatedParty = items.find((i) => i.type === "relatedParty");

    if (turnover?.daysChangeAnalysis?.directionCode === "up" && turnover.daysChange > 0) {
      notes.push({
        code: "days_worse",
        message: `${REVIEW_PHRASE.collectibility} — 평균회수기간 전기 대비 ${formatRatio(turnover.daysChange)}일 증가`,
      });
    }

    if (aging?.ok && aging.over90Ratio !== null && aging.over90Ratio >= parsedCriteria.over90RatioThreshold) {
      notes.push({
        code: "over90_high",
        message: `${REVIEW_PHRASE.allowance} — 90일 초과 채권 비중 ${formatPercent(aging.over90Ratio)}`,
      });
    }

    if (
      concentration?.ok &&
      concentration.top5Ratio !== null &&
      concentration.top5Ratio >= parsedCriteria.concentrationTop5Threshold
    ) {
      notes.push({
        code: "concentration_high",
        message: `${REVIEW_PHRASE.collectibility} — 상위 5개 거래처 집중도 ${formatPercent(concentration.top5Ratio)}`,
      });
    }

    const relatedOver90 = relatedParty?.warnings?.find((w) => w.code === "related_over90");
    if (relatedOver90) {
      notes.push({
        code: "related_long_overdue",
        message: `${REVIEW_PHRASE.allowance} — 특수관계자 장기 미회수 채권 존재`,
      });
    }

    const allowanceSim = items.find((i) => i.type === "allowanceSim");
    if (allowanceSim?.ok && allowanceSim.difference !== null && allowanceSim.difference > 0) {
      notes.push({
        code: "allowance_shortfall",
        message: `${REVIEW_PHRASE.allowance} — 추정 충당금 ${formatNumber(allowanceSim.totalEstimatedAllowance)} 대비 회사 계상 ${formatNumber(allowanceSim.companyRecordedAllowance)} 부족`,
      });
    }

    return {
      ok: true,
      notes,
      hasGuidance: notes.length > 0,
      criteria: parsedCriteria,
    };
  }

  function datasetHasAgingColumn(dataset) {
    return Boolean(dataset?.columns?.includes("만기구간"));
  }

  function datasetHasRelatedPartyColumn(dataset) {
    return Boolean(dataset?.columns?.some((c) => c.replace(/\s+/g, "") === "특수관계자여부"));
  }

  function calculateAgingOptional(accountData) {
    const hasAnyAging = accountData.sourceRows.some((r) => r.arDetail?.aging);
    if (!hasAnyAging) {
      return {
        ok: false,
        skipped: true,
        error: "만기구간 데이터가 없어 연령분석을 수행하지 않았습니다.",
      };
    }
    return window.AnalyticalCalc.calculateAging(accountData);
  }

  window.ArAnalysis = {
    DEFAULT_AR_CRITERIA,
    DEFAULT_ALLOWANCE_RATES,
    AGING_BUCKET_DEFS,
    CRITERIA_STORAGE_KEY,
    ALLOWANCE_RATES_STORAGE_KEY,
    loadArCriteria,
    saveArCriteria,
    loadAllowanceRates,
    saveAllowanceRates,
    parseCriteriaInput,
    parseAllowanceRatesInput,
    classifyCollectionDays,
    enrichTurnoverResult,
    calculateRelatedPartyAnalysis,
    calculateAllowanceGuidance,
    calculateWatchlistCustomers,
    calculateAllowanceSimulator,
    datasetHasAgingColumn,
    datasetHasRelatedPartyColumn,
    calculateAgingOptional,
    sliceWatchlistDisplay,
    formatTurnoverTimes,
    formatTurnoverChangeLabel,
    formatDaysChangeLabel,
  };
})();
