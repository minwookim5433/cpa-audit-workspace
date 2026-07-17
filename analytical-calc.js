/**

 * 분석적 절차 — 파일 파싱·검증·계산 (순수 JavaScript, AI 미사용)

 */

(function () {

"use strict";



const SIMPLE_REQUIRED = ["계정과목", "전기금액", "당기금액"];

const AR_REQUIRED = [

  "계정과목", "전기기초잔액", "전기기말잔액", "당기기초잔액", "당기기말잔액",

  "전기매출액", "당기매출액",

];

const SIMPLE_OPTIONAL = ["매출액", "기초잔액", "기말잔액", "거래처", "만기구간"];

const AR_OPTIONAL = ["거래처", "만기구간", "회수일수", "특수관계자여부", "회사적용충당률", "회사계상대손충당금"];

const AGING_BUCKETS = [
  { id: "normal", label: "정상", order: 0 },
  { id: "within30", label: "30일 이하", order: 1 },
  { id: "31to60", label: "31~60일", order: 2 },
  { id: "61to90", label: "61~90일", order: 3 },
  { id: "over90", label: "90일 초과", order: 4 },
];



function normalizeHeader(header) {

  return String(header ?? "").trim().replace(/\s+/g, "");

}



function parseNumeric(value, { allowEmpty = false } = {}) {

  if (value === null || value === undefined) {

    return allowEmpty ? { ok: true, value: null } : { ok: false, error: "값이 비어 있습니다." };

  }



  let s = String(value).trim();

  if (!s) return allowEmpty ? { ok: true, value: null } : { ok: false, error: "값이 비어 있습니다." };



  let negative = false;

  if (/^\(.*\)$/.test(s)) {

    negative = true;

    s = s.slice(1, -1).trim();

  }



  s = s.replace(/,/g, "").replace(/%/g, "").replace(/\s/g, "");



  if (s.startsWith("-")) {

    negative = true;

    s = s.slice(1);

  }



  if (!s || s === "-") {

    return allowEmpty ? { ok: true, value: null } : { ok: false, error: "값이 비어 있습니다." };

  }



  const n = Number(s);

  if (!Number.isFinite(n)) {

    return { ok: false, error: `숫자로 변환할 수 없습니다: ${value}` };

  }



  return { ok: true, value: negative ? -n : n };

}



function formatNumber(n) {

  if (n === null || n === undefined || !Number.isFinite(n)) return "—";

  return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

}



function formatCompactAmount(n) {

  if (n === null || n === undefined || !Number.isFinite(n)) return "—";

  const abs = Math.abs(n);

  if (abs >= 100000000) {

    return `${new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 100000000)}억원`;

  }

  if (abs >= 1000000) {

    return `${new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n / 1000000)}백만원`;

  }

  return formatNumber(n);

}



function formatPercent(n) {

  if (n === null || n === undefined || !Number.isFinite(n)) return "—";

  return `${new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;

}



function formatRatio(n) {

  if (n === null || n === undefined || !Number.isFinite(n)) return "—";

  return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

}



function formatDays(n) {

  if (n === null || n === undefined || !Number.isFinite(n)) return "—";

  return `${formatRatio(n)}일`;

}



function readWorkbookRows(arrayBuffer, fileName) {

  if (typeof XLSX === "undefined") {

    throw new Error("xlsx 라이브러리가 로드되지 않았습니다.");

  }



  const isCsv = /\.csv$/i.test(fileName || "");

  const workbook = isCsv

    ? XLSX.read(new TextDecoder("utf-8").decode(arrayBuffer), { type: "string" })

    : XLSX.read(arrayBuffer, { type: "array", cellDates: false });



  const sheetName = workbook.SheetNames[0];

  if (!sheetName) throw new Error("시트가 비어 있습니다.");



  const sheet = workbook.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });



  if (!rawRows.length) throw new Error("데이터 행이 없습니다.");



  return rawRows;

}



function resolveColumnKeys(sampleRow) {

  const normalizedToOriginal = new Map();

  for (const key of Object.keys(sampleRow)) {

    normalizedToOriginal.set(normalizeHeader(key), key);

  }

  return normalizedToOriginal;

}



function detectFormat(normalizedToOriginal) {

  const hasSimple = SIMPLE_REQUIRED.every((col) => normalizedToOriginal.has(col));

  const hasAr = AR_REQUIRED.every((col) => normalizedToOriginal.has(col));

  if (hasAr) return "ar";

  if (hasSimple) return "simple";

  throw new Error(

    `지원하지 않는 파일 형식입니다. 필수 열: [${SIMPLE_REQUIRED.join(", ")}] 또는 [${AR_REQUIRED.join(", ")}]`

  );

}



function parseDataRows(rawRows) {

  const normalizedToOriginal = resolveColumnKeys(rawRows[0]);

  const format = detectFormat(normalizedToOriginal);

  const getKey = (col) => normalizedToOriginal.get(col);



  const detected = format === "ar"

    ? [...AR_REQUIRED, ...AR_OPTIONAL.filter((c) => normalizedToOriginal.has(c))]

    : [...SIMPLE_REQUIRED, ...SIMPLE_OPTIONAL.filter((c) => normalizedToOriginal.has(c))];



  const known = new Set([...SIMPLE_REQUIRED, ...AR_REQUIRED, ...SIMPLE_OPTIONAL, ...AR_OPTIONAL]);

  const unknown = [...normalizedToOriginal.keys()].filter((col) => !known.has(col));



  const parsedRows = [];

  const rowErrors = [];



  rawRows.forEach((raw, index) => {

    const rowNum = index + 2;

    const account = String(raw[getKey("계정과목")] ?? "").trim();



    if (!account) {

      rowErrors.push(`${rowNum}행: 계정과목이 비어 있습니다.`);

      return;

    }



    if (format === "simple") {

      const priorResult = parseNumeric(raw[getKey("전기금액")]);

      const currentResult = parseNumeric(raw[getKey("당기금액")]);

      if (!priorResult.ok) {

        rowErrors.push(`${rowNum}행 (${account}) — 전기금액: ${priorResult.error}`);

        return;

      }

      if (!currentResult.ok) {

        rowErrors.push(`${rowNum}행 (${account}) — 당기금액: ${currentResult.error}`);

        return;

      }



      const row = {

        rowNum,

        account,

        priorAmount: priorResult.value,

        currentAmount: currentResult.value,

        format: "simple",

        optional: {},

      };



      for (const col of SIMPLE_OPTIONAL) {

        const key = getKey(col);

        if (!key) continue;

        const rawVal = raw[key];

        if (String(rawVal ?? "").trim() === "") continue;

        if (["매출액", "기초잔액", "기말잔액"].includes(col)) {

          const num = parseNumeric(rawVal);

          if (!num.ok) rowErrors.push(`${rowNum}행 (${account}) — ${col}: ${num.error}`);

          else row.optional[col] = num.value;

        } else {

          row.optional[col] = String(rawVal).trim();

        }

      }

      parsedRows.push(row);

      return;

    }



    const priorOpen = parseNumeric(raw[getKey("전기기초잔액")]);

    const priorClose = parseNumeric(raw[getKey("전기기말잔액")]);

    const curOpen = parseNumeric(raw[getKey("당기기초잔액")]);

    const curClose = parseNumeric(raw[getKey("당기기말잔액")]);

    const priorSales = parseNumeric(raw[getKey("전기매출액")], { allowEmpty: true });

    const curSales = parseNumeric(raw[getKey("당기매출액")], { allowEmpty: true });



    for (const [label, res] of [

      ["전기기초잔액", priorOpen],

      ["전기기말잔액", priorClose],

      ["당기기초잔액", curOpen],

      ["당기기말잔액", curClose],

    ]) {

      if (!res.ok) {

        rowErrors.push(`${rowNum}행 (${account}) — ${label}: ${res.error}`);

        return;

      }

    }

    if (!priorSales.ok) rowErrors.push(`${rowNum}행 (${account}) — 전기매출액: ${priorSales.error}`);

    if (!curSales.ok) rowErrors.push(`${rowNum}행 (${account}) — 당기매출액: ${curSales.error}`);

    if (!priorSales.ok || !curSales.ok) return;



    const row = {

      rowNum,

      account,

      priorAmount: priorClose.value,

      currentAmount: curClose.value,

      format: "ar",

      arDetail: {

        customer: String(raw[getKey("거래처")] ?? "").trim() || null,

        priorOpening: priorOpen.value,

        priorClosing: priorClose.value,

        currentOpening: curOpen.value,

        currentClosing: curClose.value,

        priorSales: priorSales.value ?? 0,

        currentSales: curSales.value ?? 0,

        aging: String(raw[getKey("만기구간")] ?? "").trim() || null,

        collectionDays: null,

        relatedParty: String(raw[getKey("특수관계자여부")] ?? "").trim() || null,

        companyAppliedAllowanceRate: null,

        companyRecordedAllowance: null,

      },

      optional: {},

    };



    const daysKey = getKey("회수일수");

    if (daysKey) {

      const days = parseNumeric(raw[daysKey], { allowEmpty: true });

      if (!days.ok) rowErrors.push(`${rowNum}행 (${account}) — 회수일수: ${days.error}`);

      else row.arDetail.collectionDays = days.value;

    }



    const companyRateKey = getKey("회사적용충당률");

    if (companyRateKey) {

      const rate = parseNumeric(raw[companyRateKey], { allowEmpty: true });

      if (!rate.ok) rowErrors.push(`${rowNum}행 (${account}) — 회사적용충당률: ${rate.error}`);

      else if (rate.value !== null) row.arDetail.companyAppliedAllowanceRate = rate.value;

    }



    const companyAllowKey = getKey("회사계상대손충당금");

    if (companyAllowKey) {

      const allow = parseNumeric(raw[companyAllowKey], { allowEmpty: true });

      if (!allow.ok) rowErrors.push(`${rowNum}행 (${account}) — 회사계상대손충당금: ${allow.error}`);

      else if (allow.value !== null) row.arDetail.companyRecordedAllowance = allow.value;

    }



    parsedRows.push(row);

  });



  if (!parsedRows.length && rowErrors.length) {

    throw new Error(rowErrors.join("\n"));

  }



  const result = { parsedRows, rowErrors, detected, unknown, format };

  if (rowErrors.length) result.warning = rowErrors.join("\n");

  return result;

}



function aggregateAccounts(parsedRows) {

  const map = new Map();



  for (const row of parsedRows) {

    if (!map.has(row.account)) {

      map.set(row.account, {

        account: row.account,

        priorAmount: 0,

        currentAmount: 0,

        rowCount: 0,

        sourceRows: [],

        format: row.format,

        arAggregate: row.format === "ar" ? {

          priorOpening: 0,

          priorClosing: 0,

          currentOpening: 0,

          currentClosing: 0,

          priorSales: 0,

          currentSales: 0,

        } : null,

      });

    }

    const agg = map.get(row.account);

    agg.priorAmount += row.priorAmount;

    agg.currentAmount += row.currentAmount;

    agg.rowCount += 1;

    agg.sourceRows.push(row);



    if (row.format === "ar" && agg.arAggregate) {

      agg.arAggregate.priorOpening += row.arDetail.priorOpening;

      agg.arAggregate.priorClosing += row.arDetail.priorClosing;

      agg.arAggregate.currentOpening += row.arDetail.currentOpening;

      agg.arAggregate.currentClosing += row.arDetail.currentClosing;

      agg.arAggregate.priorSales += row.arDetail.priorSales;

      agg.arAggregate.currentSales += row.arDetail.currentSales;

    }

  }



  return [...map.values()].sort((a, b) => a.account.localeCompare(b.account, "ko"));

}



async function parseAnalyticalFile(file) {

  const buffer = await file.arrayBuffer();

  const rawRows = readWorkbookRows(buffer, file.name);

  const { parsedRows, rowErrors, detected, unknown, warning, format } = parseDataRows(rawRows);

  const accounts = aggregateAccounts(parsedRows);

  const totalCurrentAmount = accounts.reduce((sum, a) => sum + a.currentAmount, 0);



  return {

    fileName: file.name,

    format,

    columns: detected,

    unknownColumns: unknown,

    previewRows: parsedRows.slice(0, 5),

    allRows: parsedRows,

    accounts,

    totalCurrentAmount,

    warning,

    rowErrors,

    hasArDetail: format === "ar",

    hasAgingColumn: format === "ar" && detected.includes("만기구간"),

    hasRelatedPartyColumn: format === "ar" && detected.some((c) => String(c).replace(/\s+/g, "") === "특수관계자여부"),

  };

}



function calculateVariance(accountData) {

  const { priorAmount, currentAmount } = accountData;

  const changeAmount = currentAmount - priorAmount;



  if (priorAmount === 0) {

    return {

      ok: false,

      error: "전기금액이 0이어서 증감률을 계산할 수 없습니다.",

      changeAmount,

      changeRate: null,

      priorAmount,

      currentAmount,

    };

  }



  const changeRate = (changeAmount / priorAmount) * 100;

  return { ok: true, changeAmount, changeRate, priorAmount, currentAmount };

}



function calculateComposition(accountData, totalCurrentAmount) {

  if (totalCurrentAmount === 0) {

    return {

      ok: false,

      error: "당기 총액이 0이어서 구성비를 계산할 수 없습니다.",

      compositionRatio: null,

      currentAmount: accountData.currentAmount,

      totalCurrentAmount,

    };

  }



  const compositionRatio = (accountData.currentAmount / totalCurrentAmount) * 100;

  return { ok: true, compositionRatio, currentAmount: accountData.currentAmount, totalCurrentAmount };

}



function safeDivide(numerator, denominator, label) {

  if (denominator === null || denominator === undefined || denominator === 0) {

    return { ok: false, error: `${label}이(가) 0이어서 계산할 수 없습니다.`, value: null };

  }

  if (numerator === null || numerator === undefined) {

    return { ok: false, error: `${label}에 필요한 값이 누락되었습니다.`, value: null };

  }

  return { ok: true, value: numerator / denominator };

}



function normalizeAgingBucket(raw) {

  if (raw === null || raw === undefined || !String(raw).trim()) return null;

  const s = String(raw).trim().replace(/\s+/g, "").toLowerCase();

  if (["정상", "normal", "current"].includes(s)) return "normal";

  if (["30일이하", "30일이내", "30일초과미만", "30일이하", "30일미만"].includes(s)) return "within30";

  if (["31-60일", "31~60일", "31-60", "31~60", "31일-60일", "31일~60일"].includes(s)) return "31to60";

  if (["61-90일", "61~90일", "61-90", "61~90", "61일-90일", "61일~90일"].includes(s)) return "61to90";

  if (
    ["90일초과", "90일이상", "91-180일", "91~180일", "91-180", "91~180",
      "180일초과", "180일이상", "91일이상", "91일초과", "over90"].includes(s)
  ) return "over90";

  return null;

}



function isRelatedParty(raw) {

  if (raw === null || raw === undefined || !String(raw).trim()) return false;

  const s = String(raw).trim().toLowerCase();

  return ["y", "yes", "true", "1", "예", "특수관계자", "특수관계"].includes(s);

}



function calculateAging(accountData) {

  if (!accountData.arAggregate) {

    return { ok: false, error: "연령분석에 필요한 AR 상세 열이 없습니다." };

  }



  const bucketAmounts = new Map(AGING_BUCKETS.map((b) => [b.id, 0]));

  const bucketSources = new Map(AGING_BUCKETS.map((b) => [b.id, []]));

  const unclassified = { amount: 0, rows: [] };

  const warnings = [];



  for (const row of accountData.sourceRows) {

    const closing = row.arDetail.currentClosing;

    if (closing === null || closing === undefined || !Number.isFinite(closing)) {

      warnings.push(`${row.rowNum}행: 당기기말잔액이 유효하지 않아 제외되었습니다.`);

      continue;

    }



    const bucketId = normalizeAgingBucket(row.arDetail.aging);

    if (!bucketId) {

      unclassified.amount += closing;

      unclassified.rows.push({

        customer: row.arDetail.customer || `(${row.rowNum}행)`,

        amount: closing,

        rawAging: row.arDetail.aging,

      });

      if (row.arDetail.aging) {

        warnings.push(`${row.rowNum}행: 만기구간 "${row.arDetail.aging}"을(를) 인식하지 못해 미분류로 처리했습니다.`);

      } else {

        warnings.push(`${row.rowNum}행: 만기구간이 비어 있어 미분류로 처리했습니다.`);

      }

      continue;

    }



    bucketAmounts.set(bucketId, bucketAmounts.get(bucketId) + closing);

    bucketSources.get(bucketId).push({

      customer: row.arDetail.customer || `(${row.rowNum}행)`,

      amount: closing,

      rawAging: row.arDetail.aging,

    });

  }



  const totalAR = accountData.currentAmount;

  const classifiedTotal = [...bucketAmounts.values()].reduce((sum, v) => sum + v, 0);



  const buckets = AGING_BUCKETS.map((bucket) => {

    const amount = bucketAmounts.get(bucket.id);

    const ratioRes = safeDivide(amount, totalAR, "당기기말잔액 합계");

    return {

      ...bucket,

      amount,

      ratio: ratioRes.ok ? ratioRes.value * 100 : null,

      ratioFormula: ratioRes.ok

        ? `${formatNumber(amount)} ÷ ${formatNumber(totalAR)} × 100`

        : null,

      sources: bucketSources.get(bucket.id),

    };

  });



  const over90Amount = bucketAmounts.get("over90");

  const over90RatioRes = safeDivide(over90Amount, totalAR, "당기기말잔액 합계");



  return {

    ok: true,

    totalAR,

    classifiedTotal,

    unclassifiedAmount: unclassified.amount,

    unclassifiedRows: unclassified.rows,

    buckets,

    over90Amount,

    over90Ratio: over90RatioRes.ok ? over90RatioRes.value * 100 : null,

    over90Formula: over90RatioRes.ok

      ? `${formatNumber(over90Amount)} ÷ ${formatNumber(totalAR)} × 100`

      : null,

    warnings: [...new Set(warnings)],

    errors: totalAR === 0 ? ["당기기말잔액 합계가 0이어서 구성비를 계산할 수 없습니다."] : [],

  };

}



function calculateConcentration(accountData) {

  if (!accountData.arAggregate) {

    return { ok: false, error: "거래처 집중도 분석에 필요한 AR 상세 열이 없습니다." };

  }



  const customerMap = new Map();

  const warnings = [];



  for (const row of accountData.sourceRows) {

    const closing = row.arDetail.currentClosing;

    if (closing === null || closing === undefined || !Number.isFinite(closing)) {

      warnings.push(`${row.rowNum}행: 당기기말잔액이 유효하지 않아 제외되었습니다.`);

      continue;

    }



    const name = row.arDetail.customer || `(${row.rowNum}행)`;

    if (!customerMap.has(name)) {

      customerMap.set(name, {

        customer: name,

        amount: 0,

        relatedParty: isRelatedParty(row.arDetail.relatedParty),

        rawRelated: row.arDetail.relatedParty,

        rowCount: 0,

      });

    }



    const entry = customerMap.get(name);

    entry.amount += closing;

    entry.rowCount += 1;

    if (isRelatedParty(row.arDetail.relatedParty)) entry.relatedParty = true;

  }



  const totalAR = accountData.currentAmount;

  const ranked = [...customerMap.values()]

    .sort((a, b) => b.amount - a.amount || a.customer.localeCompare(b.customer, "ko"))

    .map((item, index) => {

      const ratioRes = safeDivide(item.amount, totalAR, "당기기말잔액 합계");

      return {

        rank: index + 1,

        customer: item.customer,

        amount: item.amount,

        ratio: ratioRes.ok ? ratioRes.value * 100 : null,

        ratioFormula: ratioRes.ok

          ? `${formatNumber(item.amount)} ÷ ${formatNumber(totalAR)} × 100`

          : null,

        relatedParty: item.relatedParty,

        rowCount: item.rowCount,

      };

    });



  const sumTop = (n) => ranked.slice(0, n).reduce((sum, r) => sum + r.amount, 0);



  const top1Amount = ranked.length >= 1 ? ranked[0].amount : 0;

  const top3Amount = sumTop(Math.min(3, ranked.length));

  const top5Amount = sumTop(Math.min(5, ranked.length));



  const top1RatioRes = safeDivide(top1Amount, totalAR, "당기기말잔액 합계");

  const top3RatioRes = safeDivide(top3Amount, totalAR, "당기기말잔액 합계");

  const top5RatioRes = safeDivide(top5Amount, totalAR, "당기기말잔액 합계");



  const relatedRows = ranked.filter((r) => r.relatedParty);

  const relatedAmount = relatedRows.reduce((sum, r) => sum + r.amount, 0);

  const relatedRatioRes = safeDivide(relatedAmount, totalAR, "당기기말잔액 합계");



  return {

    ok: true,

    totalAR,

    customerCount: ranked.length,

    ranked,

    top1Amount,

    top3Amount,

    top5Amount,

    top1Ratio: top1RatioRes.ok ? top1RatioRes.value * 100 : null,

    top3Ratio: top3RatioRes.ok ? top3RatioRes.value * 100 : null,

    top5Ratio: top5RatioRes.ok ? top5RatioRes.value * 100 : null,

    top1Formula: top1RatioRes.ok

      ? `${formatNumber(top1Amount)} ÷ ${formatNumber(totalAR)} × 100`

      : null,

    top3Formula: top3RatioRes.ok

      ? `${formatNumber(top3Amount)} ÷ ${formatNumber(totalAR)} × 100`

      : null,

    top5Formula: top5RatioRes.ok

      ? `${formatNumber(top5Amount)} ÷ ${formatNumber(totalAR)} × 100`

      : null,

    relatedAmount,

    relatedRatio: relatedRatioRes.ok ? relatedRatioRes.value * 100 : null,

    relatedFormula: relatedRatioRes.ok

      ? `${formatNumber(relatedAmount)} ÷ ${formatNumber(totalAR)} × 100`

      : null,

    relatedRows,

    warnings: [...new Set(warnings)],

    errors: totalAR === 0 ? ["당기기말잔액 합계가 0이어서 집중도를 계산할 수 없습니다."] : [],

  };

}



function calculateTurnover(accountData) {

  const ar = accountData.arAggregate;

  if (!ar) {

    return { ok: false, error: "회전율 분석에 필요한 AR 상세 열이 없습니다." };

  }



  const priorAvgAR = (ar.priorOpening + ar.priorClosing) / 2;

  const currentAvgAR = (ar.currentOpening + ar.currentClosing) / 2;



  const priorTurnoverRes = safeDivide(ar.priorSales, priorAvgAR, "전기 평균매출채권");

  const currentTurnoverRes = safeDivide(ar.currentSales, currentAvgAR, "당기 평균매출채권");



  const priorTurnover = priorTurnoverRes.ok ? priorTurnoverRes.value : null;

  const currentTurnover = currentTurnoverRes.ok ? currentTurnoverRes.value : null;



  const priorDaysRes = priorTurnoverRes.ok && priorTurnover !== 0

    ? safeDivide(365, priorTurnover, "전기 회전율")

    : { ok: false, error: "전기 회전율이 0이어서 평균회수기간을 계산할 수 없습니다.", value: null };

  const currentDaysRes = currentTurnoverRes.ok && currentTurnover !== 0

    ? safeDivide(365, currentTurnover, "당기 회전율")

    : { ok: false, error: "당기 회전율이 0이어서 평균회수기간을 계산할 수 없습니다.", value: null };



  const turnoverChange = priorTurnover !== null && currentTurnover !== null

    ? currentTurnover - priorTurnover

    : null;

  const daysChange = priorDaysRes.value !== null && currentDaysRes.value !== null

    ? currentDaysRes.value - priorDaysRes.value

    : null;



  return {

    ok: true,

    priorOpening: ar.priorOpening,

    priorClosing: ar.priorClosing,

    currentOpening: ar.currentOpening,

    currentClosing: ar.currentClosing,

    priorSales: ar.priorSales,

    currentSales: ar.currentSales,

    priorAvgAR,

    currentAvgAR,

    priorTurnover,

    currentTurnover,

    priorCollectionDays: priorDaysRes.value,

    currentCollectionDays: currentDaysRes.value,

    turnoverChange,

    daysChange,

    errors: [

      !priorTurnoverRes.ok ? priorTurnoverRes.error : null,

      !currentTurnoverRes.ok ? currentTurnoverRes.error : null,

      !priorDaysRes.ok ? priorDaysRes.error : null,

      !currentDaysRes.ok ? currentDaysRes.error : null,

    ].filter(Boolean),

  };

}



function runAnalyticalCalculations(dataset, accountName, selectedProcedureIds, criteria = null) {

  const accountData = dataset.accounts.find((a) => a.account === accountName);

  if (!accountData) {

    throw new Error(`선택한 계정과목을 찾을 수 없습니다: ${accountName}`);

  }



  const isAr = accountName === "매출채권" && accountData.format === "ar";

  const arCriteria = isAr && window.ArAnalysis

    ? window.ArAnalysis.parseCriteriaInput(criteria || window.ArAnalysis.loadArCriteria())

    : null;



  const results = { account: accountName, accountData, items: [], chartData: null, criteria: arCriteria };

  const chartData = { turnover: null, aging: null, concentration: null };



  if (selectedProcedureIds.has("variance")) {

    results.items.push({ type: "variance", ...calculateVariance(accountData) });

  }



  if (selectedProcedureIds.has("composition") && !isAr) {

    results.items.push({ type: "composition", ...calculateComposition(accountData, dataset.totalCurrentAmount) });

  }



  if (selectedProcedureIds.has("turnover")) {

    let turnover = calculateTurnover(accountData);

    if (arCriteria && window.ArAnalysis) {

      turnover = window.ArAnalysis.enrichTurnoverResult(turnover, arCriteria);

    }

    results.items.push({ type: "turnover", ...turnover });

    if (turnover.ok && turnover.priorTurnover !== null && turnover.currentTurnover !== null) {

      chartData.turnover = {

        turnover: { prior: turnover.priorTurnover, current: turnover.currentTurnover },

        collectionDays: {

          prior: turnover.priorCollectionDays,

          current: turnover.currentCollectionDays,

        },

      };

    }

  }



  if (selectedProcedureIds.has("aging")) {

    const agingFn = window.ArAnalysis?.calculateAgingOptional || calculateAging;

    const aging = agingFn(accountData);

    results.items.push({ type: "aging", ...aging });

    if (aging.ok && aging.buckets?.length) {

      chartData.aging = {

        buckets: aging.buckets.map((b) => ({ label: b.label, amount: b.amount, ratio: b.ratio })),

        over90Amount: aging.over90Amount,

        over90Ratio: aging.over90Ratio,

      };

    }

  }



  if (selectedProcedureIds.has("concentration")) {

    const concentration = calculateConcentration(accountData);

    results.items.push({ type: "concentration", ...concentration });

    if (concentration.ok && concentration.ranked?.length) {

      chartData.concentration = {

        customers: concentration.ranked.slice(0, 10).map((r) => ({

          customer: r.customer,

          amount: r.amount,

          ratio: r.ratio,

        })),

      };

    }

  }



  if (selectedProcedureIds.has("relatedParty") && arCriteria && window.ArAnalysis) {

    const related = window.ArAnalysis.calculateRelatedPartyAnalysis(accountData, arCriteria);

    results.items.push({ type: "relatedParty", ...related });

  }



  if (selectedProcedureIds.has("allowance") && arCriteria && window.ArAnalysis) {

    const allowance = window.ArAnalysis.calculateAllowanceGuidance(results.items, arCriteria);

    results.items.push({ type: "allowance", ...allowance });

  }



  if (selectedProcedureIds.has("watchlist") && arCriteria && window.ArAnalysis) {

    const watchlist = window.ArAnalysis.calculateWatchlistCustomers(accountData, arCriteria);

    results.items.push({ type: "watchlist", ...watchlist });

  }



  if (selectedProcedureIds.has("allowanceSim") && window.ArAnalysis) {

    const rates = criteria?.allowanceRates || window.ArAnalysis.loadAllowanceRates();

    const companyAllowance = criteria?.companyRecordedAllowance ?? null;

    const sim = window.ArAnalysis.calculateAllowanceSimulator(accountData, rates, companyAllowance);

    results.items.push({ type: "allowanceSim", ...sim });

  }



  if (chartData.turnover || chartData.aging || chartData.concentration) {

    results.chartData = chartData;

  }



  return results;

}



window.AnalyticalCalc = {

  SIMPLE_REQUIRED,

  AR_REQUIRED,

  SIMPLE_OPTIONAL,

  AR_OPTIONAL,

  parseAnalyticalFile,

  runAnalyticalCalculations,

  formatNumber,

  formatCompactAmount,

  formatPercent,

  formatRatio,

  formatDays,

  aggregateAccounts,

  calculateTurnover,

  calculateAging,

  calculateConcentration,

  normalizeAgingBucket,

  isRelatedParty,

  safeDivide,

};

})();


