/**
 * 최종 보고서 HTML 생성 (저장된 계산 결과만 사용, AI 재계산 없음)
 */
(function () {
  "use strict";

  const { formatNumber, formatPercent, formatRatio, formatDays } = window.AnalyticalCalc || {};

  function esc(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatReportDate(iso) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function findItem(entry, type) {
    return entry.items?.find((i) => i.type === type) || null;
  }

  function textToHtml(text) {
    if (!text) return "<p>—</p>";
    return esc(text).split(/\n/).map((line) => (line.trim() ? `<p>${line}</p>` : "<br>")).join("");
  }

  function formatTurnoverChangeLine(turnover) {
    if (!turnover?.ok) return "—";
    if (turnover.turnoverSummaryLine) return turnover.turnoverSummaryLine;
    if (turnover.priorTurnover != null && turnover.currentTurnover != null) {
      return `전기 ${formatRatio(turnover.priorTurnover)} → 당기 ${formatRatio(turnover.currentTurnover)}`;
    }
    return "—";
  }

  function formatDaysChangeLine(turnover) {
    if (!turnover?.ok) return "—";
    if (turnover.daysSummaryLine) return turnover.daysSummaryLine;
    if (turnover.priorCollectionDays != null && turnover.currentCollectionDays != null) {
      return `전기 ${formatRatio(turnover.priorCollectionDays)}일 → 당기 ${formatRatio(turnover.currentCollectionDays)}일`;
    }
    return "—";
  }

  function buildKeyObservations(entry) {
    const observations = [];
    const turnover = findItem(entry, "turnover");
    const aging = findItem(entry, "aging");
    const concentration = findItem(entry, "concentration");
    const relatedParty = findItem(entry, "relatedParty");
    const allowanceSim = findItem(entry, "allowanceSim");

    if (
      turnover?.ok &&
      turnover.priorCollectionDays != null &&
      turnover.currentCollectionDays != null &&
      turnover.daysChange != null
    ) {
      const absChange = formatRatio(Math.abs(turnover.daysChange));
      if (turnover.daysChange > 0) {
        observations.push(
          `평균회수기간이 전기 ${formatRatio(turnover.priorCollectionDays)}일에서 당기 ${formatRatio(turnover.currentCollectionDays)}일로 ${absChange}일 악화 — 추가 검토 필요`
        );
      } else if (turnover.daysChange < 0) {
        observations.push(
          `평균회수기간이 전기 ${formatRatio(turnover.priorCollectionDays)}일에서 당기 ${formatRatio(turnover.currentCollectionDays)}일로 ${absChange}일 개선 — 추세 확인 및 추가 검토 필요`
        );
      }
    }

    if (aging?.ok && aging.over90Ratio != null) {
      observations.push(`90일 초과 채권 비중이 ${formatPercent(aging.over90Ratio)} — 추가 검토 필요`);
    }

    const relatedRatio = concentration?.relatedRatio ?? relatedParty?.related?.ratio;
    if (relatedRatio != null) {
      observations.push(`특수관계자 채권 비중이 ${formatPercent(relatedRatio)} — 추가 검토 필요`);
    }

    if (
      relatedParty?.ok &&
      relatedParty.related?.currentCollectionDays != null &&
      relatedParty.nonRelated?.currentCollectionDays != null &&
      relatedParty.related.currentCollectionDays > relatedParty.nonRelated.currentCollectionDays
    ) {
      observations.push(
        `특수관계자 평균회수기간(${formatDays(relatedParty.related.currentCollectionDays)})이 비특수관계자(${formatDays(relatedParty.nonRelated.currentCollectionDays)})보다 길어 보임 — 추가 검토 필요`
      );
    }

    if (
      allowanceSim?.ok &&
      allowanceSim.difference != null &&
      allowanceSim.companyRecordedAllowance != null &&
      allowanceSim.totalEstimatedAllowance != null
    ) {
      if (allowanceSim.difference > 0) {
        observations.push(
          `회사 계상 대손충당금(${formatNumber(allowanceSim.companyRecordedAllowance)})이 시뮬레이션 추정액(${formatNumber(allowanceSim.totalEstimatedAllowance)})보다 낮아 보임 — 추가 검토 필요`
        );
      } else if (allowanceSim.difference < 0) {
        observations.push(
          `회사 계상 대손충당금이 시뮬레이션 추정액보다 높게 계상된 것으로 보임 — 추가 검토 필요`
        );
      }
    }

    if (
      observations.length < 3 &&
      turnover?.ok &&
      turnover.turnoverChange != null &&
      turnover.priorTurnover != null &&
      turnover.currentTurnover != null &&
      turnover.turnoverChange !== 0
    ) {
      const direction = turnover.turnoverChange < 0 ? "감소" : "증가";
      observations.push(
        `매출채권 회전율이 전기 ${formatRatio(turnover.priorTurnover)}에서 당기 ${formatRatio(turnover.currentTurnover)}로 ${direction} — 추가 검토 필요`
      );
    }

    const variance = findItem(entry, "variance");
    if (observations.length < 3 && variance?.ok && variance.changeRate != null && Math.abs(variance.changeRate) >= 10) {
      observations.push(`전기 대비 잔액 증감률이 ${formatPercent(variance.changeRate)} — 추가 검토 필요`);
    }

    return observations.slice(0, 5);
  }

  function buildExecutiveSummary(entry) {
    const sd = entry.sourceData || {};
    const variance = findItem(entry, "variance");
    const turnover = findItem(entry, "turnover");
    const aging = findItem(entry, "aging");
    const concentration = findItem(entry, "concentration");
    const relatedParty = findItem(entry, "relatedParty");
    const watchlist = findItem(entry, "watchlist");
    const allowanceSim = findItem(entry, "allowanceSim");

    const currentBalance = sd.currentAmount ?? variance?.currentAmount;
    const changeRate = variance?.changeRate;
    const relatedRatio = concentration?.relatedRatio ?? relatedParty?.related?.ratio;
    const eligibleCount =
      watchlist?.eligibleCount ?? (watchlist?.eligibleCustomers || watchlist?.customers || []).length;
    const bodyWatchCount = Math.min(5, eligibleCount || 0);

    const cards = [
      { label: "매출채권 당기말잔액", value: formatNumber(currentBalance) },
      { label: "전기 대비 증감률", value: changeRate != null ? formatPercent(changeRate) : "—" },
      { label: "매출채권 회전율 변화", value: formatTurnoverChangeLine(turnover) },
      { label: "평균회수기간 변화", value: formatDaysChangeLine(turnover) },
      { label: "90일 초과 채권 비중", value: aging?.over90Ratio != null ? formatPercent(aging.over90Ratio) : "—" },
      { label: "특수관계자 채권 비중", value: relatedRatio != null ? formatPercent(relatedRatio) : "—" },
      {
        label: "핵심 주의 거래처 수",
        value: eligibleCount ? `본문 ${bodyWatchCount}개 / 후보 ${eligibleCount}개` : "—",
      },
      {
        label: "대손충당금 추정·계상 차이",
        value:
          allowanceSim?.difference != null
            ? formatNumber(allowanceSim.difference)
            : allowanceSim?.ok
              ? "—"
              : "—",
      },
    ];

    const observations = buildKeyObservations(entry);
    const observationHtml = observations.length
      ? observations.map((o) => `<li>${esc(o)}</li>`).join("")
      : `<li>저장된 분석 결과에서 핵심 관찰사항을 도출하지 못했습니다 — 추가 검토 필요</li>`;

    const cardsHtml = cards
      .map(
        (card) => `<div class="fr-exec-card">
        <div class="fr-exec-card-label">${esc(card.label)}</div>
        <div class="fr-exec-card-value">${esc(card.value)}</div>
      </div>`
      )
      .join("");

    return `<section class="fr-section fr-executive-summary">
      <h3>Executive Summary</h3>
      <div class="fr-exec-cards">${cardsHtml}</div>
      <h4 class="fr-obs-heading">핵심 관찰사항</h4>
      <ul class="fr-observation-list">${observationHtml}</ul>
    </section>`;
  }

  function buildPurposeSection(entry) {
    const sd = entry.sourceData || {};
    const procedures = (entry.procedureLabels || []).join(", ");
    const isAr = sd.format === "ar";

    let html = `<section class="fr-section"><h3>분석 목적 및 사용 데이터</h3>`;
    html += `<p>본 절차는 <strong>${esc(entry.account)}</strong>에 대한 분석적 감사절차 결과를 정리한 것입니다. 아래 수치는 업로드된 데이터를 JavaScript로 계산한 저장 결과이며, AI는 수치를 재계산하지 않습니다.</p>`;
    html += `<table class="fr-table fr-meta"><tbody>
      <tr><th>분석 대상 계정</th><td>${esc(entry.account)}</td></tr>
      <tr><th>사용한 데이터</th><td>${esc(entry.fileName || "—")}</td></tr>
      <tr><th>수행한 분석적 절차</th><td>${esc(procedures || "—")}</td></tr>
      <tr><th>분석 저장 시각</th><td>${formatReportDate(entry.savedAt)}</td></tr>
      <tr><th>${esc(sd.priorLabel || "전기금액")}</th><td class="num">${formatNumber(sd.priorAmount)}</td></tr>
      <tr><th>${esc(sd.currentLabel || "당기금액")}</th><td class="num">${formatNumber(sd.currentAmount)}</td></tr>
    </tbody></table>`;

    if (entry.criteria) {
      const c = entry.criteria;
      html += `<p class="fr-criteria">분석 기준 — 수행중요성 ${formatNumber(c.performanceMaterialityAmount)}원 · 정상 회수기간 ${c.normalCollectionDays}일 · 주의 회수기간 ${c.cautionCollectionDays}일</p>`;
    }

    if (!isAr) {
      const composition = findItem(entry, "composition");
      if (composition?.ok) {
        html += `<p>구성비: ${formatPercent(composition.compositionRatio)} (당기 총액 대비)</p>`;
      }
    }

    return `${html}</section>`;
  }

  function buildCompositionSection(item, options = {}) {
    if (!item) return "";
    const heading = options.heading || "구성비분석";
    let html = `<section class="fr-section"><h3>${esc(heading)}</h3>`;
    if (!item.ok) {
      html += `<p class="fr-note">${esc(item.error)}</p>`;
    } else {
      html += `<table class="fr-table"><tbody>
        <tr><th>당기금액</th><td class="num">${formatNumber(item.currentAmount)}</td></tr>
        <tr><th>당기 총액</th><td class="num">${formatNumber(item.totalCurrentAmount)}</td></tr>
        <tr><th>구성비</th><td class="num">${formatPercent(item.compositionRatio)}</td></tr>
      </tbody></table>`;
    }
    return `${html}</section>`;
  }

  function buildVarianceSection(item, options = {}) {
    if (!item) return "";
    const heading = options.heading || "증감분석";
    let html = `<section class="fr-section"><h3>${esc(heading)}</h3>`;
    if (!item.ok) {
      html += `<p class="fr-note">${esc(item.error)}</p>`;
      html += `<p>증감액 = ${formatNumber(item.currentAmount)} − ${formatNumber(item.priorAmount)} = <strong>${formatNumber(item.changeAmount)}</strong></p>`;
    } else {
      html += `<table class="fr-table"><tbody>
        <tr><th>전기금액</th><td class="num">${formatNumber(item.priorAmount)}</td></tr>
        <tr><th>당기금액</th><td class="num">${formatNumber(item.currentAmount)}</td></tr>
        <tr><th>증감액</th><td class="num">${formatNumber(item.changeAmount)}</td></tr>
        <tr><th>증감률</th><td class="num">${formatPercent(item.changeRate)}</td></tr>
      </tbody></table>`;
      if (options.showFormulas) {
        html += `<p class="fr-formula">증감액 = 당기금액 − 전기금액 = ${formatNumber(item.changeAmount)}</p>`;
        html += `<p class="fr-formula">증감률 = (${formatNumber(item.changeAmount)} ÷ ${formatNumber(item.priorAmount)}) × 100 = ${formatPercent(item.changeRate)}</p>`;
      }
    }
    return `${html}</section>`;
  }

  function buildTurnoverSection(item) {
    if (!item) return "";
    let html = `<section class="fr-section"><h3>회전율 및 평균회수기간</h3>`;
    if (item.errors?.length) {
      html += item.errors.map((e) => `<p class="fr-note">${esc(e)}</p>`).join("");
    }
    if (item.daysSummaryLine) {
      html += `<p><strong>평균회수기간:</strong> ${esc(item.daysSummaryLine)}${item.currentDaysClass ? ` (${esc(item.currentDaysClass.label)})` : ""}</p>`;
    }
    if (item.turnoverSummaryLine) {
      html += `<p><strong>매출채권 회전율:</strong> ${esc(item.turnoverSummaryLine)}</p>`;
    }
    if (item.ok) {
      html += `<table class="fr-table"><tbody>
        <tr><th>전기 회전율</th><td class="num">${item.priorTurnover != null ? formatRatio(item.priorTurnover) : "—"}</td></tr>
        <tr><th>당기 회전율</th><td class="num">${item.currentTurnover != null ? formatRatio(item.currentTurnover) : "—"}</td></tr>
        <tr><th>전기 평균회수기간</th><td class="num">${item.priorCollectionDays != null ? formatDays(item.priorCollectionDays) : "—"}</td></tr>
        <tr><th>당기 평균회수기간</th><td class="num">${item.currentCollectionDays != null ? formatDays(item.currentCollectionDays) : "—"}</td></tr>
      </tbody></table>`;
    }
    return `${html}</section>`;
  }

  function buildRelatedPartySection(item) {
    if (!item?.ok) return "";
    let html = `<section class="fr-section"><h3>특수관계자 분석</h3>`;
    if (item.warnings?.length) {
      html += item.warnings.map((w) => `<p class="fr-review">${esc(w.message)}</p>`).join("");
    }
    const renderGroup = (label, g, daysClass) => `
      <h4>${esc(label)}</h4>
      <table class="fr-table"><tbody>
        <tr><th>당기기말잔액</th><td class="num">${formatNumber(g.currentClosing)} (${g.ratio !== null ? formatPercent(g.ratio) : "—"})</td></tr>
        <tr><th>평균회수기간</th><td class="num">${formatDays(g.currentCollectionDays)}${daysClass ? ` (${esc(daysClass.label)})` : ""}</td></tr>
        <tr><th>90일 초과</th><td class="num">${formatNumber(g.over90Amount)}${g.over90Ratio !== null ? ` (${formatPercent(g.over90Ratio)})` : ""}</td></tr>
      </tbody></table>`;
    html += renderGroup("특수관계자", item.related, item.relatedDaysClass);
    html += renderGroup("비특수관계자", item.nonRelated, item.nonRelatedDaysClass);
    return `${html}</section>`;
  }

  const WATCHLIST_FOLLOWUP_LABELS = {
    "외부조회": "외부조회",
    "후속현금회수 확인": "후속현금회수 확인",
    "계약서 검토": "계약서 검토",
    "개별평가 검토": "개별평가",
    "대손충당금 산정 근거 검토": "충당금 근거 검토",
  };

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

  function renderWatchlistReasonsHtml(row) {
    const items = (row.reasons || []).map(
      (r) => `<li>${esc(formatWatchlistReasonBullet(r, row))}</li>`
    );
    if (!items.length) return `<span class="fr-watchlist-empty">—</span>`;
    return `<ul class="fr-watchlist-reasons-list">${items.join("")}</ul>`;
  }

  function renderWatchlistFollowupHtml(row) {
    const unique = [...new Set(row.followUpProcedures || [])];
    if (!unique.length) return `<span class="fr-watchlist-empty">—</span>`;
    const items = unique
      .map((p) => `<li class="fr-watchlist-check-item">☐ ${esc(WATCHLIST_FOLLOWUP_LABELS[p] || p)}</li>`)
      .join("");
    return `<ul class="fr-watchlist-checklist">${items}</ul>`;
  }

  function renderConcentrationRankedTable(rows) {
    let html = `<div class="fr-table-wrap"><table class="fr-table fr-concentration-table"><colgroup>
      <col class="fr-conc-rank" style="width:6%" />
      <col class="fr-conc-customer" style="width:34%" />
      <col class="fr-conc-amount" style="width:28%" />
      <col class="fr-conc-ratio" style="width:16%" />
      <col class="fr-conc-related" style="width:16%" />
    </colgroup><thead><tr>
      <th class="fr-conc-rank">순위</th>
      <th class="fr-conc-customer">거래처</th>
      <th class="fr-conc-amount">당기기말잔액</th>
      <th class="fr-conc-ratio">비중</th>
      <th class="fr-conc-related">특수관계자</th>
    </tr></thead><tbody>`;
    for (const r of rows) {
      html += `<tr>
        <td class="fr-conc-rank fr-conc-rank-cell">${r.rank}</td>
        <td class="fr-conc-customer fr-conc-customer-cell" title="${esc(r.customer)}">${esc(r.customer)}</td>
        <td class="fr-conc-amount fr-conc-amount-cell">${formatNumber(r.amount)}</td>
        <td class="fr-conc-ratio fr-conc-ratio-cell">${r.ratio !== null ? formatPercent(r.ratio) : "—"}</td>
        <td class="fr-conc-related fr-conc-related-cell">${r.relatedParty ? "Y" : "N"}</td>
      </tr>`;
    }
    return `${html}</tbody></table></div>`;
  }

  function buildWatchlistSection(item, options = {}) {
    if (!item?.ok) return "";
    const limit = options.limit;
    const title = options.title || "주의 거래처 목록";
    const source = item.eligibleCustomers || item.customers || [];
    const rows = limit ? source.slice(0, limit) : source;
    const eligibleCount = item.eligibleCount ?? source.length;

    let html = `<section class="fr-section"><h3>${esc(title)}</h3>`;
    html += `<p>핵심 주의대상 <strong>${rows.length}</strong>개 표시 (주의대상 ${eligibleCount}개 중 · 위험 확정 아님 — 추가 검토용)</p>`;
    html += `<div class="fr-table-wrap"><table class="fr-table fr-watchlist-table"><colgroup>
      <col class="fr-col-rank" style="width:5%" />
      <col class="fr-col-customer" style="width:22%" />
      <col class="fr-col-ar" style="width:20%" />
      <col class="fr-col-ratio" style="width:8%" />
      <col class="fr-col-related" style="width:8%" />
      <col class="fr-col-reasons" style="width:22%" />
      <col class="fr-col-followup" style="width:15%" />
    </colgroup><thead><tr>
      <th class="fr-col-rank">순위</th>
      <th class="fr-col-customer">거래처</th>
      <th class="fr-col-ar">당기말잔액</th>
      <th class="fr-col-ratio">비중</th>
      <th class="fr-col-related">특수관계자</th>
      <th class="fr-col-reasons">선정 사유</th>
      <th class="fr-col-followup">후속 절차</th>
    </tr></thead><tbody>`;
    rows.forEach((row, index) => {
      html += `<tr>
        <td class="fr-col-rank fr-watchlist-rank">${index + 1}</td>
        <td class="fr-col-customer fr-watchlist-ellipsis" title="${esc(row.customer)}">${esc(row.customer)}</td>
        <td class="fr-col-ar fr-watchlist-amount">${formatNumber(row.currentClosing)}</td>
        <td class="fr-col-ratio fr-watchlist-ratio">${row.arRatioPercent !== null ? formatPercent(row.arRatioPercent) : "—"}</td>
        <td class="fr-col-related fr-watchlist-related">${row.relatedParty ? "Y" : "N"}</td>
        <td class="fr-col-reasons fr-watchlist-reasons">${renderWatchlistReasonsHtml(row)}</td>
        <td class="fr-col-followup fr-watchlist-followup">${renderWatchlistFollowupHtml(row)}</td>
      </tr>`;
    });
    return `${html}</tbody></table></div></section>`;
  }

  function buildAllowanceSimSection(item, options = {}) {
    if (!item?.ok) return "";
    const heading = options.heading || "대손충당금 시뮬레이터";
    let html = `<section class="fr-section"><h3>${esc(heading)}</h3>`;
    html += `<div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>연령구간</th><th>잔액</th><th>충당률</th><th>추정 충당금</th></tr></thead><tbody>`;
    for (const b of item.buckets || []) {
      html += `<tr><td>${esc(b.label)}</td><td class="num">${formatNumber(b.amount)}</td><td class="num">${formatPercent(b.ratePercent)}</td><td class="num">${formatNumber(b.allowance)}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    html += `<p>총 추정 충당금: <strong>${formatNumber(item.totalEstimatedAllowance)}</strong> · 채권 대비 ${item.allowanceRatioPercent !== null ? formatPercent(item.allowanceRatioPercent) : "—"}`;
    if (item.companyRecordedAllowance !== null) {
      html += ` · 회사 계상 ${formatNumber(item.companyRecordedAllowance)} · 차이 ${formatNumber(item.difference)}`;
    }
    html += `</p>`;
    return `${html}</section>`;
  }

  function buildAllowanceReviewSection(sim, allowance) {
    if (!sim?.ok && !allowance?.ok) return "";
    let html = `<section class="fr-section"><h3>대손충당금 검토</h3>`;
    if (sim?.ok) {
      html += `<table class="fr-table"><tbody>
        <tr><th>시뮬레이션 추정 충당금</th><td class="num">${formatNumber(sim.totalEstimatedAllowance)}</td></tr>
        <tr><th>회사 계상액</th><td class="num">${sim.companyRecordedAllowance !== null ? formatNumber(sim.companyRecordedAllowance) : "—"}</td></tr>
        <tr><th>차이 (추정 − 계상)</th><td class="num">${sim.difference !== null ? formatNumber(sim.difference) : "—"}</td></tr>
        <tr><th>추정 충당금/채권 비율</th><td class="num">${sim.allowanceRatioPercent !== null ? formatPercent(sim.allowanceRatioPercent) : "—"}</td></tr>
      </tbody></table>`;
      html += `<p class="fr-note-appendix">연령구간별 상세 시뮬레이션 표는 부록을 참조하세요.</p>`;
    }
    if (allowance?.ok) {
      if (!allowance.hasGuidance) {
        html += `<p class="fr-note">추가 검토가 필요한 항목이 감지되지 않았습니다.</p>`;
      } else {
        html += allowance.notes.map((n) => `<p class="fr-review">${esc(n.message)}</p>`).join("");
      }
    }
    return `${html}</section>`;
  }

  function buildFollowUpProceduresSection(item) {
    if (!item?.ok) return "";
    const rows = (item.eligibleCustomers || item.customers || []).slice(0, 5);
    const procedureSet = new Set();
    rows.forEach((row) => (row.followUpProcedures || []).forEach((p) => procedureSet.add(p)));

    let html = `<section class="fr-section"><h3>감사인이 선택한 후속절차</h3>`;
    if (!procedureSet.size) {
      html += `<p class="fr-note">핵심 주의 거래처에 대한 후속절차가 정의되지 않았습니다.</p>`;
      return `${html}</section>`;
    }

    html += `<p>핵심 주의 거래처 ${rows.length}개 기준 권장 후속절차입니다. 실제 수행 여부는 감사인 판단에 따릅니다.</p>`;
    html += `<ul class="fr-followup-aggregate">`;
    [...procedureSet].sort().forEach((procedure) => {
      const targets = rows
        .filter((r) => (r.followUpProcedures || []).includes(procedure))
        .map((r) => r.customer);
      html += `<li class="fr-followup-check-item">☐ ${esc(WATCHLIST_FOLLOWUP_LABELS[procedure] || procedure)} <span class="fr-followup-targets">— ${esc(targets.join(", "))}</span></li>`;
    });
    html += `</ul></section>`;
    return html;
  }

  function buildAgingSection(item) {
    if (!item) return "";
    if (item.skipped) {
      return `<section class="fr-section"><h3>연령분석</h3><p class="fr-note">${esc(item.error)}</p></section>`;
    }
    let html = `<section class="fr-section"><h3>연령분석</h3>`;
    html += `<p>집계 기준 당기기말잔액 합계: <strong>${formatNumber(item.totalAR)}</strong></p>`;
    html += `<div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>만기구간</th><th>금액</th><th>구성비</th></tr></thead><tbody>`;
    for (const b of item.buckets || []) {
      html += `<tr><td>${esc(b.label)}</td><td class="num">${formatNumber(b.amount)}</td><td class="num">${b.ratio !== null ? formatPercent(b.ratio) : "—"}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    html += `<p>90일 초과: <strong>${formatNumber(item.over90Amount)}</strong> (${item.over90Ratio !== null ? formatPercent(item.over90Ratio) : "—"})</p>`;
    return `${html}</section>`;
  }

  function buildConcentrationSection(item, options = {}) {
    if (!item) return "";
    const limit = options.limit;
    const ranked = item.ranked || [];
    const displayRows = limit ? ranked.slice(0, limit) : ranked;

    let html = `<section class="fr-section"><h3>거래처 집중도</h3>`;
    html += `<p>기준 잔액: ${formatNumber(item.totalAR)} · 거래처 ${item.customerCount}개</p>`;
    html += `<table class="fr-table"><tbody>
      <tr><th>상위 1개 비중</th><td class="num">${item.top1Ratio !== null ? formatPercent(item.top1Ratio) : "—"}</td></tr>
      <tr><th>상위 3개 비중</th><td class="num">${item.top3Ratio !== null ? formatPercent(item.top3Ratio) : "—"}</td></tr>
      <tr><th>상위 5개 비중</th><td class="num">${item.top5Ratio !== null ? formatPercent(item.top5Ratio) : "—"}</td></tr>
      <tr><th>특수관계자 비중</th><td class="num">${item.relatedRatio !== null ? formatPercent(item.relatedRatio) : "—"} (${formatNumber(item.relatedAmount)})</td></tr>
    </tbody></table>`;
    if (limit && ranked.length > limit) {
      html += `<p class="fr-note-appendix">상위 ${limit}개만 본문에 표시합니다. 전체 ${ranked.length}개 거래처 목록은 부록을 참조하세요.</p>`;
    }
    html += renderConcentrationRankedTable(displayRows);
    return `${html}</section>`;
  }

  function buildChartsSection(images, options = {}) {
    if (!images?.length) return "";
    const heading = options.heading || "주요 그래프";
    let html = `<section class="fr-section"><h3>${esc(heading)}</h3>`;
    for (const img of images) {
      html += `<figure class="fr-chart"><figcaption>${esc(img.title)}</figcaption><img src="${img.dataUrl}" alt="${esc(img.title)}" /></figure>`;
    }
    return `${html}</section>`;
  }

  function buildAppendixSection(entry, chartImages) {
    const concentration = findItem(entry, "concentration");
    const allowanceSim = findItem(entry, "allowanceSim");
    const variance = findItem(entry, "variance");
    const sd = entry.sourceData || {};
    const isAr = sd.format === "ar";

    const hasFullConcentration = (concentration?.ranked?.length || 0) > 10;
    const hasCharts = chartImages?.length > 0;
    const hasAllowanceDetail = allowanceSim?.ok;
    const hasVarianceDetail = variance?.ok;
    const hasDraft = Boolean(entry.reportDraft);
    const hasMemo = Boolean(entry.memo);
    const hasComposition = !isAr && findItem(entry, "composition")?.ok;

    if (
      !hasFullConcentration &&
      !hasCharts &&
      !hasAllowanceDetail &&
      !hasVarianceDetail &&
      !hasDraft &&
      !hasMemo &&
      !hasComposition
    ) {
      return "";
    }

    let html = `<section class="fr-section fr-appendix"><h3>상세 데이터 및 그래프 부록</h3>`;

    if (hasFullConcentration) {
      html += `<h4 class="fr-subheading">거래처 집중도 — 전체 목록 (${concentration.ranked.length}개)</h4>`;
      html += renderConcentrationRankedTable(concentration.ranked);
    }

    if (hasAllowanceDetail) {
      html += buildAllowanceSimSection(allowanceSim, { heading: "대손충당금 시뮬레이션 상세" });
    }

    if (hasVarianceDetail) {
      html += buildVarianceSection(variance, { heading: "증감분석 상세", showFormulas: true });
    }

    if (hasComposition) {
      html += buildCompositionSection(findItem(entry, "composition"), { heading: "구성비분석 상세" });
    }

    if (hasCharts) {
      html += buildChartsSection(chartImages, { heading: "분석 그래프" });
    }

    if (hasDraft) {
      html += `<section class="fr-section"><h4 class="fr-subheading">AI 보고서 초안 (감사인 수정본)</h4><div class="fr-draft">${textToHtml(entry.reportDraft)}</div></section>`;
    }

    if (hasMemo) {
      html += `<section class="fr-section"><h4 class="fr-subheading">감사인 메모</h4><div class="fr-memo">${textToHtml(entry.memo)}</div></section>`;
    }

    return `${html}</section>`;
  }

  function buildEntrySection(entry, chartImages) {
    let html = `<article class="fr-entry">
      <h2 class="fr-entry-title">${esc(entry.account)}</h2>`;

    html += buildExecutiveSummary(entry);
    html += buildPurposeSection(entry);
    html += buildTurnoverSection(findItem(entry, "turnover"));
    html += buildAgingSection(findItem(entry, "aging"));
    html += buildConcentrationSection(findItem(entry, "concentration"), { limit: 10 });
    html += buildWatchlistSection(findItem(entry, "watchlist"), { limit: 5, title: "핵심 주의 거래처" });
    html += buildRelatedPartySection(findItem(entry, "relatedParty"));
    html += buildAllowanceReviewSection(findItem(entry, "allowanceSim"), findItem(entry, "allowance"));
    html += buildFollowUpProceduresSection(findItem(entry, "watchlist"));
    html += buildAppendixSection(entry, chartImages);

    return `${html}</article>`;
  }

  const REPORT_STYLES = `
    @page {
      size: A4 portrait;
      margin: 18mm 15mm 20mm 15mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      margin: 0 auto;
      padding: 0;
      background: #fff;
      max-width: 180mm;
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    .fr-doc-header {
      border-bottom: 2px solid #2c4a7c;
      padding-bottom: 14px;
      margin-bottom: 20px;
      page-break-after: avoid;
    }
    .fr-doc-title { font-size: 18pt; color: #1a2a44; margin: 0 0 6px; }
    .fr-doc-meta { font-size: 9.5pt; color: #555; margin: 2px 0; }
    .fr-entry { margin-bottom: 24px; }
    .fr-entry-title {
      font-size: 14pt;
      color: #2c4a7c;
      border-left: 4px solid #2c4a7c;
      padding-left: 10px;
      margin: 20px 0 12px;
      page-break-after: avoid;
    }
    .fr-section { margin: 18px 0; }
    .fr-section h3 {
      font-size: 11.5pt;
      color: #2c4a7c;
      margin: 0 0 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #d8e2f0;
      page-break-after: avoid;
    }
    .fr-subheading {
      font-size: 10.5pt;
      color: #3a5070;
      margin: 14px 0 8px;
      page-break-after: avoid;
    }
    .fr-obs-heading {
      font-size: 10.5pt;
      color: #3a5070;
      margin: 14px 0 8px;
    }
    .fr-exec-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin: 12px 0 16px;
    }
    .fr-exec-card {
      border: 1px solid #c5d4e8;
      border-radius: 6px;
      padding: 10px 12px;
      background: #f7fafd;
      page-break-inside: avoid;
    }
    .fr-exec-card-label {
      font-size: 8.5pt;
      color: #555;
      margin-bottom: 4px;
      line-height: 1.4;
    }
    .fr-exec-card-value {
      font-size: 11pt;
      font-weight: 700;
      color: #1a2a44;
      line-height: 1.35;
      word-break: keep-all;
    }
    .fr-observation-list {
      margin: 0;
      padding: 0 0 0 1.1rem;
      list-style: disc;
      font-size: 10pt;
      line-height: 1.65;
      word-break: keep-all;
    }
    .fr-observation-list li { margin-bottom: 6px; }
    .fr-table-wrap { page-break-inside: auto; margin: 8px 0; }
    .fr-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
      font-size: 10pt;
      page-break-inside: auto;
    }
    .fr-table thead { display: table-header-group; }
    .fr-table tbody { page-break-inside: auto; }
    .fr-table tr { page-break-inside: avoid; page-break-after: auto; }
    .fr-table th, .fr-table td {
      border: 1px solid #ccc;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
      word-break: keep-all;
    }
    .fr-table th { background: #eef3fa; font-weight: 600; width: 28%; }
    .fr-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .fr-concentration-table {
      table-layout: fixed;
      width: 100%;
      max-width: 100%;
    }
    .fr-concentration-table thead th {
      width: auto;
      white-space: nowrap;
      word-break: keep-all;
    }
    .fr-concentration-table th.fr-conc-related,
    .fr-concentration-table td.fr-conc-related-cell {
      white-space: nowrap;
      word-break: keep-all;
      text-align: center;
    }
    .fr-concentration-table th.fr-conc-rank,
    .fr-concentration-table td.fr-conc-rank-cell {
      text-align: center;
      white-space: nowrap;
      max-width: 0;
      overflow: hidden;
    }
    .fr-concentration-table th.fr-conc-amount,
    .fr-concentration-table td.fr-conc-amount-cell,
    .fr-concentration-table th.fr-conc-ratio,
    .fr-concentration-table td.fr-conc-ratio-cell {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      max-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fr-concentration-table td.fr-conc-customer-cell {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 0;
    }
    .fr-watchlist-table {
      table-layout: fixed;
      width: 100%;
      max-width: 100%;
    }
    .fr-watchlist-table thead th { width: auto; white-space: nowrap; }
    .fr-watchlist-table .fr-col-related { white-space: nowrap; }
    .fr-watchlist-rank,
    .fr-watchlist-related,
    .fr-watchlist-ratio {
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 0;
    }
    .fr-watchlist-amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 0;
    }
    .fr-watchlist-ellipsis {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 0;
    }
    .fr-watchlist-reasons,
    .fr-watchlist-followup {
      word-break: keep-all;
      overflow-wrap: break-word;
      white-space: normal;
      line-height: 1.6;
      max-width: none;
      overflow: visible;
    }
    .fr-watchlist-reasons-list,
    .fr-watchlist-checklist,
    .fr-followup-aggregate {
      margin: 0;
      padding: 0;
      list-style: none;
      word-break: keep-all;
      overflow-wrap: break-word;
      white-space: normal;
      line-height: 1.6;
    }
    .fr-watchlist-reasons-list li {
      position: relative;
      padding-left: 0.85rem;
      margin-bottom: 0.2rem;
    }
    .fr-watchlist-reasons-list li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #555;
      font-weight: 700;
    }
    .fr-watchlist-check-item,
    .fr-followup-check-item {
      margin-bottom: 0.35rem;
      color: #2c4a7c;
      page-break-inside: avoid;
    }
    .fr-followup-targets { color: #555; font-size: 9.5pt; }
    .fr-watchlist-empty { color: #888; }
    .fr-formula { font-size: 9pt; color: #555; margin: 4px 0; }
    .fr-note { color: #8b1e1e; font-size: 10pt; }
    .fr-note-appendix { color: #555; font-size: 9.5pt; font-style: italic; }
    .fr-review {
      color: #7a4f00;
      background: #fff8e6;
      border-left: 3px solid #d4a017;
      padding: 8px 10px;
      margin: 6px 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    .fr-criteria {
      font-size: 10pt;
      color: #444;
      background: #f5f8fc;
      padding: 8px;
      border-radius: 4px;
    }
    .fr-chart {
      margin: 12px 0;
      text-align: center;
      page-break-inside: avoid;
      max-width: 100%;
    }
    .fr-chart img {
      max-width: 100%;
      height: auto;
      border: 1px solid #ddd;
    }
    .fr-chart figcaption { font-size: 10pt; color: #555; margin-bottom: 6px; }
    .fr-draft, .fr-memo {
      background: #fafbfc;
      border: 1px solid #e2e8f0;
      padding: 12px;
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: keep-all;
    }
    .fr-footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #888;
    }
    .fr-executive-summary { page-break-after: auto; }
    .fr-appendix { page-break-before: auto; }
    @media print {
      body { padding: 0; max-width: none; }
      .fr-table thead { display: table-header-group; }
      .fr-table tr { page-break-inside: avoid; }
      .fr-chart { page-break-inside: avoid; max-width: 100%; }
      .fr-chart img { max-width: 100%; }
    }
  `;

  function buildDocument(entries, chartImagesByEntryId, generatedAt) {
    const accounts = entries.map((e) => e.account).join(", ");
    const bodyParts = entries.map((entry) =>
      buildEntrySection(entry, chartImagesByEntryId[entry.id] || [])
    );

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>분석적 절차 최종 보고서 — ${esc(accounts)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <header class="fr-doc-header">
    <h1 class="fr-doc-title">분석적 절차 최종 보고서</h1>
    <p class="fr-doc-meta">작성일시: ${formatReportDate(generatedAt)}</p>
    <p class="fr-doc-meta">분석 대상 계정: ${esc(accounts)}</p>
    <p class="fr-doc-meta">포함 분석 건수: ${entries.length}건 (보고서에 추가된 분석만 포함)</p>
  </header>
  ${bodyParts.join("\n")}
  <footer class="fr-footer">※ 본 보고서의 수치는 JavaScript 코드로 계산된 저장 결과를 그대로 사용하였습니다. AI는 보고서 초안 문장 정리에만 사용되었으며 수치를 재계산하지 않았습니다.</footer>
</body>
</html>`;
  }

  window.FinalReport = {
    buildDocument,
    buildExecutiveSummary,
    buildKeyObservations,
    formatReportDate,
  };
})();
