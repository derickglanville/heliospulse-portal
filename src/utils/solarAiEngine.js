const MONTH_ALIASES = [
  { num: '01', names: ['january', 'jan'] },
  { num: '02', names: ['february', 'feb'] },
  { num: '03', names: ['march', 'mar'] },
  { num: '04', names: ['april', 'apr'] },
  { num: '05', names: ['may'] },
  { num: '06', names: ['june', 'jun'] },
  { num: '07', names: ['july', 'jul'] },
  { num: '08', names: ['august', 'aug'] },
  { num: '09', names: ['september', 'sept', 'sep'] },
  { num: '10', names: ['october', 'oct'] },
  { num: '11', names: ['november', 'nov'] },
  { num: '12', names: ['december', 'dec'] },
];

function round1(n) {
  return Number(n || 0).toFixed(1);
}

function fmtKwh(n) {
  return `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
}

function calcPctDiff(current, baseline) {
  if (!baseline || Math.abs(baseline) < 0.001) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function formatMonthName(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '';
  const [year, m] = ym.split('-');
  const idx = Number(m) - 1;
  const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][idx];
  return full ? `${full} ${year}` : ym;
}

function enrichRow(row) {
  const solar = Number(row.solar_kwh || 0);
  const m01 = row.m01_import_kwh != null ? Number(row.m01_import_kwh) : null;
  const m02 = row.m02_export_kwh != null ? Number(row.m02_export_kwh) : null;
  const isReconciled = row.status === 'RECONCILED' && m01 != null && m02 != null;
  const edc = isReconciled ? Math.max(0, solar + m01 - m02) : null;
  const net = isReconciled ? m02 - m01 : null;
  return {
    ...row,
    solar,
    m01,
    m02,
    edc,
    net,
    isReconciled,
    dayOfMonth: Number(row.date.slice(8, 10)),
    monthKey: row.date.slice(0, 7),
  };
}

function summarizeSpan(rows) {
  const reconciled = rows.filter((r) => r.isReconciled);
  const solarDays = rows.filter((r) => r.solar > 0);
  const totalSolar = rows.reduce((s, r) => s + r.solar, 0);
  const recSolar = reconciled.reduce((s, r) => s + r.solar, 0);
  const totalM01 = reconciled.reduce((s, r) => s + r.m01, 0);
  const totalM02 = reconciled.reduce((s, r) => s + r.m02, 0);
  const totalEdc = reconciled.reduce((s, r) => s + r.edc, 0);
  const totalNet = totalM02 - totalM01;
  const avgSolar = solarDays.length ? totalSolar / solarDays.length : 0;
  const avgEdc = reconciled.length ? totalEdc / reconciled.length : null;
  const avgM01 = reconciled.length ? totalM01 / reconciled.length : null;
  const avgM02 = reconciled.length ? totalM02 / reconciled.length : null;
  const irrRows = rows.filter((r) => Number(r.irradiance_wm2 || 0) > 0);
  const avgIrr = irrRows.length ? irrRows.reduce((s, r) => s + Number(r.irradiance_wm2), 0) / irrRows.length : null;
  const peakEdcRow = reconciled.length ? reconciled.reduce((a, b) => (b.edc > a.edc ? b : a)) : null;
  const peakSolarRow = solarDays.length ? solarDays.reduce((a, b) => (b.solar > a.solar ? b : a)) : null;

  return {
    totalRows: rows.length,
    reconciledCount: reconciled.length,
    solarDayCount: solarDays.length,
    totalSolar,
    recSolar,
    totalM01,
    totalM02,
    totalEdc,
    totalNet,
    avgSolar,
    avgEdc,
    avgM01,
    avgM02,
    avgIrr,
    peakEdcRow,
    peakSolarRow,
    startDate: rows[0]?.date || null,
    endDate: rows[rows.length - 1]?.date || null,
    recStartDate: reconciled[0]?.date || null,
    recEndDate: reconciled[reconciled.length - 1]?.date || null,
  };
}

function extractMonthsFromQuery(ql, availableMonths) {
  const found = [];
  const defaultYear = availableMonths[0]?.slice(0, 4) || '2026';

  for (const m of MONTH_ALIASES) {
    for (const alias of m.names) {
      const re = new RegExp(`\\b${alias}(?:\\s+(202\\d))?\\b`, 'gi');
      let match;
      while ((match = re.exec(ql)) !== null) {
        const explicitYear = match[1];
        let ym = `${explicitYear || defaultYear}-${m.num}`;
        if (!explicitYear && !availableMonths.includes(ym)) {
          const fallback = availableMonths.find((x) => x.endsWith(`-${m.num}`));
          if (fallback) ym = fallback;
        }
        found.push({ index: match.index, ym });
      }
    }
  }

  found.sort((a, b) => a.index - b.index);
  const deduped = [];
  for (const item of found) {
    if (!deduped.includes(item.ym)) deduped.push(item.ym);
  }
  return deduped;
}

function extractIsoDateFromQuery(ql, rowsChrono) {
  const isoMatch = ql.match(/\b(202\d-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const slashMatch = ql.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(202\d|\d{2}))?\b/);
  if (slashMatch) {
    const mm = String(slashMatch[1]).padStart(2, '0');
    const dd = String(slashMatch[2]).padStart(2, '0');
    const yr = slashMatch[3] ? (slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]) : '2026';
    return `${yr}-${mm}-${dd}`;
  }

  for (const m of MONTH_ALIASES) {
    for (const alias of m.names) {
      const mdMatch = ql.match(new RegExp(`\\b${alias}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(202\\d))?\\b`, 'i'));
      if (mdMatch) {
        const dd = String(mdMatch[1]).padStart(2, '0');
        const yr = mdMatch[2] || rowsChrono[rowsChrono.length - 1]?.date.slice(0, 4) || '2026';
        return `${yr}-${m.num}-${dd}`;
      }
    }
  }

  if (/\byesterday\b/.test(ql)) {
    const rec = rowsChrono.filter((r) => r.isReconciled);
    return rec[rec.length - 2]?.date || rec[rec.length - 1]?.date || null;
  }
  if (/\b(today|latest day|most recent day)\b/.test(ql)) {
    const rec = rowsChrono.filter((r) => r.isReconciled || r.solar > 0);
    return rec[rec.length - 1]?.date || null;
  }
  return null;
}

function detectMetrics(ql) {
  return {
    edc: /\b(edc|consum\w*|usage|use|demand|load|home\s+energy)\b/.test(ql),
    solar: /\b(solar|produc\w*|generat\w*|power|sunrun|pv)\b/.test(ql),
    m01: /\b(m01|import\w*|deliver\w*|bought|grid\s+in)\b/.test(ql),
    m02: /\b(m02|export\w*|receiv\w*|sent|surplus|green\s+rows?)\b/.test(ql),
    net: /\b(net|diff|credit\s+delta)\b/.test(ql),
    irradiance: /\b(irradianc\w*|weather|temp\w*|sun\s+height|overcast|clear|cloudy|rain|drizzle)\b/.test(ql),
    cost: /\b(save\w*|saving\w*|cost\w*|dollar\w*|\$0\.24|no\s+solar|value)\b/.test(ql),
  };
}

function formatMetricSummary(label, span, metrics) {
  const parts = [];
  if (metrics.edc || (!metrics.solar && !metrics.m01 && !metrics.m02 && !metrics.net)) {
    if (span.reconciledCount > 0) {
      parts.push(`EDC ${fmtKwh(span.totalEdc)} (${round1(span.avgEdc)} kWh/day across ${span.reconciledCount} reconciled days)`);
    } else {
      parts.push(`EDC unavailable (0 NYSEG-reconciled days in span)`);
    }
  }
  if (metrics.solar || metrics.edc) {
    parts.push(`Solar ${fmtKwh(span.totalSolar)} (${round1(span.avgSolar)} kWh/day over ${span.solarDayCount} active days)`);
  }
  if (metrics.m01) {
    parts.push(`M01 imported ${fmtKwh(span.totalM01)} (${span.avgM01 != null ? round1(span.avgM01) : '—'} kWh/day)`);
  }
  if (metrics.m02) {
    parts.push(`M02 exported ${fmtKwh(span.totalM02)} (${span.avgM02 != null ? round1(span.avgM02) : '—'} kWh/day)`);
  }
  if (metrics.net && span.reconciledCount > 0) {
    parts.push(`Net ${span.totalNet >= 0 ? '+' : ''}${round1(span.totalNet)} kWh`);
  }
  if (metrics.irradiance && span.avgIrr != null) {
    parts.push(`Avg Peak Irradiance ${Math.round(span.avgIrr)} W/m²`);
  }
  return `${label}: ${parts.join(' • ')}.`;
}

function findHistoricalBillForMonth(moreBillsData, ym) {
  const monthLabel = formatMonthName(ym).toLowerCase();
  const histList = moreBillsData?.historical_usage_analysis || [];
  return histList.find((item) => (item.month_label || '').toLowerCase() === monthLabel) || null;
}

function findDetailedJulyBills(moreBillsData) {
  const bills = moreBillsData?.bills || [];
  return bills
    .filter((b) => b.billing_start_date >= '2026-06-01' && b.billing_end_date <= '2026-08-06')
    .sort((a, b) => (a.billing_start_date > b.billing_start_date ? 1 : -1));
}

function buildComparisonReply(ql, rowsChrono, monthlySummaries, moreBillsData, metrics) {
  const availableMonths = [...new Set([...monthlySummaries.map((m) => m.month), ...rowsChrono.map((r) => r.monthKey)])]
    .sort()
    .reverse();
  const mentionedMonths = extractMonthsFromQuery(ql, availableMonths);
  const currentMonth = availableMonths[0] || '2026-11';
  const prevMonth = availableMonths[1] || '2026-10';
  const sameTimeRequested = /\b(same\s*time|this\s*time|month[\s-]to[\s-]date|mtd|so\s*far|to\s*date)\b/.test(ql);
  const asksCurrent = /\b(current\w*|this\s+month|now|nov|latest)\b/.test(ql);

  let monthA = mentionedMonths[0] || currentMonth;
  let monthB = mentionedMonths[1] || null;
  if (mentionedMonths.length === 1) {
    if (asksCurrent && mentionedMonths[0] !== currentMonth) {
      monthA = currentMonth;
      monthB = mentionedMonths[0];
    } else if (mentionedMonths[0] === currentMonth) {
      monthB = prevMonth;
    } else {
      monthA = currentMonth;
      monthB = mentionedMonths[0];
    }
  } else if (mentionedMonths.length === 0) {
    monthA = currentMonth;
    monthB = prevMonth;
  }

  const rowsAAll = rowsChrono.filter((r) => r.monthKey === monthA && (r.isReconciled || r.solar > 0));
  const recA = rowsAAll.filter((r) => r.isReconciled);
  const maxDayA = recA.length
    ? recA[recA.length - 1].dayOfMonth
    : rowsAAll.length
    ? rowsAAll[rowsAAll.length - 1].dayOfMonth
    : 31;

  const spanA = summarizeSpan(rowsAAll);
  const rowsBAll = rowsChrono.filter((r) => r.monthKey === monthB && (r.isReconciled || r.solar > 0));
  const rowsBSameTime = sameTimeRequested ? rowsBAll.filter((r) => r.dayOfMonth <= maxDayA) : rowsBAll;
  const spanB = summarizeSpan(rowsBSameTime);
  const spanBFull = summarizeSpan(rowsBAll);

  const lines = [];
  const labelA = `${formatMonthName(monthA)} (${spanA.recStartDate || spanA.startDate} to ${spanA.recEndDate || spanA.endDate})`;
  lines.push(formatMetricSummary(`• ${labelA}`, spanA, metrics));

  // Case: Period B has reconciled days in the target window
  if (spanB.reconciledCount > 0 && !(monthB === '2026-07' && sameTimeRequested)) {
    const labelB = sameTimeRequested
      ? `${formatMonthName(monthB)} Days 1–${maxDayA}`
      : `${formatMonthName(monthB)} (${spanB.recStartDate} to ${spanB.recEndDate})`;
    lines.push(formatMetricSummary(`• ${labelB}`, spanB, metrics));

    if ((metrics.edc || !metrics.solar) && spanA.avgEdc != null && spanB.avgEdc != null) {
      const pct = calcPctDiff(spanA.avgEdc, spanB.avgEdc);
      const diffPerDay = spanA.avgEdc - spanB.avgEdc;
      lines.push(
        `• Daily EDC comparison: ${formatMonthName(monthA)} averages ${round1(spanA.avgEdc)} kWh/day vs ${round1(spanB.avgEdc)} kWh/day in ${labelB} (${diffPerDay >= 0 ? '+' : ''}${round1(diffPerDay)} kWh/day, ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).`
      );
    }
    if (metrics.solar && spanA.avgSolar > 0 && spanB.avgSolar > 0) {
      const pct = calcPctDiff(spanA.avgSolar, spanB.avgSolar);
      lines.push(
        `• Daily Solar comparison: ${round1(spanA.avgSolar)} kWh/day vs ${round1(spanB.avgSolar)} kWh/day (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).`
      );
    }
    return lines.join('\n');
  }

  // Case: July 2026 or partial-reconciliation month where NYSEG hourly intervals only began July 31
  const histB = findHistoricalBillForMonth(moreBillsData, monthB);
  if (monthB === '2026-07') {
    const julMidBill = findDetailedJulyBills(moreBillsData).find(
      (b) => b.billing_start_date === '2026-07-02' && b.billing_end_date === '2026-07-15'
    );
    const julSolarSame = rowsChrono.filter((r) => r.monthKey === '2026-07' && r.dayOfMonth <= maxDayA && r.solar > 0);
    const julSolarSpan = summarizeSpan(julSolarSame);

    lines.push(
      `• July 2026 CSV note: NYSEG hourly smart-meter CSV intervals started on 2026-07-31 (single reconciled day: EDC ${fmtKwh(spanBFull.totalEdc)} = ${round1(spanBFull.recSolar)} solar + ${round1(spanBFull.totalM01)} M01 − ${round1(spanBFull.totalM02)} M02), so daily CSV EDC isn't recorded for July 1–${maxDayA}.`
    );

    if (julMidBill) {
      const days = 14;
      const julDailyAvg = julMidBill.imported_kwh / days;
      const diff = spanA.avgEdc != null ? spanA.avgEdc - julDailyAvg : null;
      const pct = spanA.avgEdc != null ? calcPctDiff(spanA.avgEdc, julDailyAvg) : null;
      lines.push(
        `• July 2–15 NYSEG Statement (closest bill to days 1–${maxDayA}): ${julMidBill.imported_kwh.toLocaleString()} kWh billed (${round1(julDailyAvg)} kWh/day, $${julMidBill.total_energy_charges.toFixed(2)})${diff != null ? ` — ${formatMonthName(monthA)} EDC (${round1(spanA.avgEdc)} kWh/day) is ${diff >= 0 ? '+' : ''}${round1(diff)} kWh/day (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}.`
      );
    } else if (histB) {
      lines.push(
        `• ${histB.month_label} Historical Bill (${histB.billing_period_display}): ${histB.usage_display} ($${Number(histB.charges).toFixed(2)}).`
      );
    }

    if (julSolarSpan.solarDayCount > 0) {
      lines.push(
        `• July 10–${maxDayA} SunRun Solar (${julSolarSpan.solarDayCount} active days after commissioning): ${fmtKwh(julSolarSpan.totalSolar)} (${round1(julSolarSpan.avgSolar)} kWh/day) vs ${formatMonthName(monthA)} ${round1(spanA.avgSolar)} kWh/day.`
      );
    }

    // Earliest full mid-month reconciled summer baseline (August Days 1..N)
    const augSameTime = rowsChrono.filter((r) => r.monthKey === '2026-08' && r.dayOfMonth <= maxDayA && r.isReconciled);
    if (augSameTime.length > 0) {
      const augSpan = summarizeSpan(augSameTime);
      const augPct = spanA.avgEdc != null ? calcPctDiff(spanA.avgEdc, augSpan.avgEdc) : null;
      lines.push(
        `• Earliest Full Summer Reconciled Comparison (Aug 1–${maxDayA}, ${augSpan.reconciledCount} days): EDC ${fmtKwh(augSpan.totalEdc)} (${round1(augSpan.avgEdc)} kWh/day)${augPct != null ? ` — ${formatMonthName(monthA)} EDC is ${augPct >= 0 ? '+' : ''}${augPct.toFixed(1)}% vs early August.` : '.'}`
      );
    }
    return lines.join('\n');
  }

  if (histB) {
    lines.push(
      `• ${histB.month_label} Historical NYSEG Bill (${histB.billing_period_display}): ${histB.usage_display} ($${Number(histB.charges).toFixed(2)}). Daily NYSEG smart-meter CSV intervals start on 2026-07-31.`
    );
    return lines.join('\n');
  }

  lines.push(`• No reconciled CSV or billing records were found for ${formatMonthName(monthB)}.`);
  return lines.join('\n');
}

export function answerSolarQuestion(promptText, ctx) {
  const q = (promptText || '').trim();
  if (!q) return '';
  const ql = q.toLowerCase();

  const {
    solarRows = [],
    monthlySummaries = MONTHLY_SUMMARIES_FALLBACK,
    moreBillsData = null,
    liveCreditBankForecast = null,
    combinedAlerts = [],
    distDayMetrics = null,
    solarTotals = {},
    telemetryMeta = {},
    taskSchedulerData = null,
    appliances = [],
  } = ctx;

  const rowsChrono = [...solarRows]
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map(enrichRow);

  const reconciledChrono = rowsChrono.filter((r) => r.isReconciled);
  const availableMonths = [...new Set([...monthlySummaries.map((m) => m.month), ...rowsChrono.map((r) => r.monthKey)])]
    .sort()
    .reverse();

  const proj = moreBillsData?.next_bill_projection;
  const bankNow = moreBillsData?.current_credit_bank_kwh ?? 2210;
  const metrics = detectMetrics(ql);

  // 1. Explicit comparison or "same time" query (e.g. "How does the current EDC compare to July about the same time")
  const isCompare =
    /\b(compar\w*|vs\.?|versus|against|relative\s+to|same\s+time|than\s+(last|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/.test(
      ql
    );
  const mentionedMonths = extractMonthsFromQuery(ql, availableMonths);
  if (isCompare && (mentionedMonths.length >= 1 || /\b(month|edc|solar|m01|m02)\b/.test(ql))) {
    return buildComparisonReply(ql, rowsChrono, monthlySummaries, moreBillsData, metrics);
  }

  // 2. Next NYSEG Bill Projection
  if (/\bnext\b.*\bbill\b|\bbill\s+projection\b|\bupcoming\s+bill\b/.test(ql)) {
    return proj
      ? `Projected next NYSEG bill (${proj.billing_start_date} to ${proj.billing_end_date}, ${proj.days_in_period} days): $${proj.projected_energy_charge.toFixed(2)} minimum charge floor (${proj.measured_days} measured days through ${proj.measured_through_date} + ${proj.remaining_forecast_days} forecast days). Projected M01 import is ${proj.projected_m01_kwh} kWh vs ${proj.projected_m02_kwh} kWh M02 export (${proj.projected_net_import_kwh} kWh net import), reducing your Credit Bank from ${proj.credit_bank_before_kwh.toLocaleString()} kWh to ${proj.credit_bank_after_kwh.toLocaleString()} kWh (${proj.credit_bank_delta_kwh.toFixed(1)} kWh).`
      : `Your latest NYSEG bill was $43.57; no next-bill projection is currently loaded.`;
  }

  // 3. Alerts & Anomalies
  if (/\b(anomal\w*|issue\w*|alert\w*|missing|warn\w*|error\w*)\b/.test(ql)) {
    if (combinedAlerts.length === 0) {
      return `No data or application anomalies are currently active. Email alerts to dglanville@gmail.com are armed for missing NYSEG intervals (past the 3-day lag), physical bound violations (M02 > Solar + 0.5 kWh), solar underperformance, and pipeline/app errors.`;
    }
    const itemsText = combinedAlerts
      .map((a, idx) => `${idx + 1}) [${a.severity.toUpperCase()}] ${a.title}: ${a.message}`)
      .join(' ');
    return `${combinedAlerts.length} active alert(s) detected and tracked for email notification to dglanville@gmail.com: ${itemsText}`;
  }

  // 4. Credit Bank & Winter Forecast
  if (/\b(credit\s*bank|credit|bank|winter|forecast|exhaust\w*|rollover)\b/.test(ql)) {
    const forecastRowsList = liveCreditBankForecast?.rows || [];
    const minBankRow = forecastRowsList.length
      ? forecastRowsList.reduce((minR, r) => (r.ending_credit_kwh < minR.ending_credit_kwh ? r : minR), forecastRowsList[0])
      : null;
    const historyText = (moreBillsData?.credit_bank_history || [])
      .map((h) => `${h.period_label.slice(0, 10)}: ${h.remaining_kwh} kWh`)
      .join(' → ');
    return `Your official NYSEG credit-bank balance is ${bankNow.toLocaleString()} kWh (${historyText || '0 → 2,210 kWh'}). With ${liveCreditBankForecast?.unbilled_reconciled_days ?? 11} reconciled grid days after ${liveCreditBankForecast?.official_period_end || '2026-11-03'} (${(liveCreditBankForecast?.unbilled_net_credit_kwh ?? -138.2).toFixed(1)} kWh), the 12-month forecast opens at ${(liveCreditBankForecast?.opening_projected_kwh ?? 2071.8).toFixed(1)} kWh${minBankRow ? `, reaches its winter low of ${Math.round(minBankRow.ending_credit_kwh).toLocaleString()} kWh in ${minBankRow.month}` : ''}, and ${liveCreditBankForecast?.exhausted_month ? `exhausts in ${liveCreditBankForecast.exhausted_month}` : 'does not exhaust in the next 12 months'}.`;
  }

  // 5. Appliances / Breakdown
  if (metrics.irradiance === false && /\b(appliance\w*|hvac|mini[\s-]?split|ev\s+charger|water\s+heater|refrigerator|dryer|base\s*load)\b/.test(ql)) {
    if (appliances.length > 0) {
      const appSummary = appliances
        .map((a) => `${a.name}: ${a.est_kwh_day} kWh/day ($${(a.est_kwh_day * 0.24).toFixed(2)}/day)`)
        .join(' • ');
      const totalApp = appliances.reduce((s, a) => s + Number(a.est_kwh_day || 0), 0);
      return `Tracked household loads total ~${round1(totalApp)} kWh/day: ${appSummary}.`;
    }
  }

  // 6. Specific Date Query (e.g. "2026-11-15", "Nov 15", "yesterday")
  const specificDate = extractIsoDateFromQuery(ql, rowsChrono);
  if (specificDate) {
    const rawRow = rowsChrono.find((r) => r.date === specificDate);
    if (rawRow) {
      const edcTxt = rawRow.edc != null ? `${fmtKwh(rawRow.edc)} EDC` : 'EDC pending NYSEG';
      const m01Txt = rawRow.m01 != null ? `${fmtKwh(rawRow.m01)} M01` : 'M01 pending';
      const m02Txt = rawRow.m02 != null ? `${fmtKwh(rawRow.m02)} M02` : 'M02 pending';
      const weatherTxt = rawRow.irradiance || 'Unknown';
      const irrTxt = rawRow.irradiance_wm2 > 0 ? `${rawRow.irradiance_wm2} W/m²` : 'n/a';
      return `${rawRow.date} (${rawRow.status}): SunRun Solar ${fmtKwh(rawRow.solar)} • ${m01Txt} • ${m02Txt} • Home ${edcTxt}. Weather: ${weatherTxt} (Peak Irradiance: ${irrTxt}${rawRow.temp_max_f != null ? `, ${rawRow.temp_max_f}°/${rawRow.temp_min_f}°F` : ''}).`;
    }
    return `No CSV record found for ${specificDate}. Recorded range covers ${telemetryMeta.date_range_start || rowsChrono[0]?.date} through ${telemetryMeta.date_range_end || rowsChrono[rowsChrono.length - 1]?.date}.`;
  }

  // 7. Rolling "last N days" / "past N days" / "this week" query
  const lastDaysMatch = ql.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/) || (/\bthis\s+week\b|\bpast\s+week\b/.test(ql) ? [null, '7'] : null);
  if (lastDaysMatch) {
    const n = Math.min(365, Math.max(1, Number(lastDaysMatch[1])));
    const slice = reconciledChrono.slice(-n);
    const span = summarizeSpan(slice);
    return `${formatMetricSummary(`Last ${slice.length} reconciled days (${span.recStartDate} to ${span.recEndDate})`, span, {
      ...metrics,
      edc: true,
      solar: true,
      m01: true,
      m02: true,
    })}`;
  }

  // 8. Highest / Lowest / Peak / Best queries across ANY metric (EDC, Solar, M01, M02, Irradiance)
  if (/\b(best|highest|max\w*|peak|most|lowest|min\w*|worst)\b/.test(ql)) {
    const scopeRows = mentionedMonths.length
      ? rowsChrono.filter((r) => r.monthKey === mentionedMonths[0])
      : rowsChrono;
    const scopeRec = scopeRows.filter((r) => r.isReconciled);
    const scopeLabel = mentionedMonths.length ? formatMonthName(mentionedMonths[0]) : 'All recorded days';

    if (metrics.edc && scopeRec.length) {
      const hi = scopeRec.reduce((a, b) => (b.edc > a.edc ? b : a));
      const lo = scopeRec.reduce((a, b) => (b.edc < a.edc ? b : a));
      const avg = scopeRec.reduce((s, r) => s + r.edc, 0) / scopeRec.length;
      return `${scopeLabel} Home Consumption (EDC): Highest day was ${hi.date} at ${fmtKwh(hi.edc)} (${round1(hi.solar)} solar + ${round1(hi.m01)} M01 − ${round1(hi.m02)} M02). Lowest day was ${lo.date} at ${fmtKwh(lo.edc)}. Period average: ${round1(avg)} kWh/day across ${scopeRec.length} reconciled days.`;
    }
    if (metrics.m02 && scopeRec.length) {
      const hi = scopeRec.reduce((a, b) => (b.m02 > a.m02 ? b : a));
      const lo = scopeRec.reduce((a, b) => (b.m02 < a.m02 ? b : a));
      return `${scopeLabel} M02 Grid Export: Peak export was ${hi.date} at ${fmtKwh(hi.m02)} (${round1(hi.solar)} kWh solar). Lowest export was ${lo.date} at ${fmtKwh(lo.m02)}.`;
    }
    if (metrics.m01 && scopeRec.length) {
      const hi = scopeRec.reduce((a, b) => (b.m01 > a.m01 ? b : a));
      const lo = scopeRec.reduce((a, b) => (b.m01 < a.m01 ? b : a));
      return `${scopeLabel} M01 Grid Import: Peak import was ${hi.date} at ${fmtKwh(hi.m01)} (${hi.edc != null ? `${round1(hi.edc)} kWh EDC` : ''}). Lowest import was ${lo.date} at ${fmtKwh(lo.m01)}.`;
    }
    if (metrics.irradiance) {
      const irrRows = scopeRows.filter((r) => Number(r.irradiance_wm2 || 0) > 0);
      if (irrRows.length) {
        const hi = irrRows.reduce((a, b) => (Number(b.irradiance_wm2) > Number(a.irradiance_wm2) ? b : a));
        const lo = irrRows.reduce((a, b) => (Number(b.irradiance_wm2) < Number(a.irradiance_wm2) ? b : a));
        return `${scopeLabel} Peak Irradiance: Highest was ${hi.date} at ${hi.irradiance_wm2} W/m² (${hi.irradiance}, ${fmtKwh(hi.solar)} solar). Lowest was ${lo.date} at ${lo.irradiance_wm2} W/m² (${lo.irradiance}, ${fmtKwh(lo.solar)} solar).`;
      }
    }
    const posSolar = scopeRows.filter((r) => r.solar > 0);
    if (posSolar.length) {
      const best = posSolar.reduce((a, b) => (b.solar > a.solar ? b : a));
      const low = posSolar.reduce((a, b) => (b.solar < a.solar ? b : a));
      return `${scopeLabel} Solar Production: Best day was ${best.date} at ${fmtKwh(best.solar)} (${best.irradiance}${best.irradiance_wm2 ? `, ${best.irradiance_wm2} W/m²` : ''}). Lowest non-zero day was ${low.date} at ${fmtKwh(low.solar)} (${low.irradiance}).`;
    }
  }

  // 9. Single Month / Current Month Query (e.g. "How much EDC in October?", "What is current November EDC?")
  if (mentionedMonths.length === 1 || /\b(this\s+month|current\s+(?:edc|solar|month|usage|m01|m02))\b/.test(ql)) {
    const targetMonth = mentionedMonths[0] || availableMonths[0] || '2026-11';
    const monthRows = rowsChrono.filter((r) => r.monthKey === targetMonth && (r.isReconciled || r.solar > 0));
    if (monthRows.length > 0) {
      const span = summarizeSpan(monthRows);
      const histBill = findHistoricalBillForMonth(moreBillsData, targetMonth);
      let ans = formatMetricSummary(formatMonthName(targetMonth), span, {
        ...metrics,
        edc: true,
        solar: true,
        m01: true,
        m02: true,
      });
      if (span.reconciledCount === 0 && histBill) {
        ans += ` Official NYSEG historical bill (${histBill.billing_period_display}): ${histBill.usage_display}, $${Number(histBill.charges).toFixed(2)}.`;
      }
      return ans;
    }
    const histOnly = findHistoricalBillForMonth(moreBillsData, targetMonth);
    if (histOnly) {
      return `${histOnly.month_label} (${histOnly.billing_period_display}): NYSEG billed ${histOnly.usage_display} for $${Number(histOnly.charges).toFixed(2)} (pre-SunRun CSV commissioning).`;
    }
  }

  // 10. Daily Distribution / Grid Balance
  if (/\b(distribution|grid\s+balance|energy\s+flow)\b/.test(ql) && distDayMetrics) {
    return `On ${distDayMetrics.date} (Energy Distribution), your SunRun array produced ${distDayMetrics.solar} kWh, NYSEG delivered ${distDayMetrics.m01} kWh (M01) and received ${distDayMetrics.m02} kWh (M02), resulting in ${distDayMetrics.homeConsumed} kWh estimated home consumption (EDC). Grid dependence was ${distDayMetrics.gridDepPct}% and solar coverage was ${distDayMetrics.solarCovPct}% (${distDayMetrics.co2AvoidedLb} lb CO₂ avoided).`;
  }

  // 11. Savings / Dollar Value
  if (metrics.cost && !/\bmonthly\b/.test(ql)) {
    const rate = 0.24;
    const grossSolarVal = Number(solarTotals.cumSolar || 0) * rate;
    const exportVal = Number(solarTotals.cumExp || 0) * rate;
    const selfConsumedKwh = Math.max(0, Number(solarTotals.reconciledSolar || 0) - Number(solarTotals.cumExp || 0));
    const selfConsumedVal = selfConsumedKwh * rate;
    return `At $0.24/kWh across ${solarTotals.totalDays} days: total solar produced (${Number(solarTotals.cumSolar).toLocaleString()} kWh) equals ~$${grossSolarVal.toFixed(2)} of electricity value. Across ${solarTotals.reconciledCount} NYSEG-reconciled days, M02 exports (${Number(solarTotals.cumExp).toLocaleString()} kWh = $${exportVal.toFixed(2)}) plus direct solar self-consumption (${selfConsumedKwh.toFixed(1)} kWh = $${selfConsumedVal.toFixed(2)}) keep NYSEG post-solar bills at the $43.57 minimum charge floor with +${Number(solarTotals.bankBalance).toLocaleString()} kWh net exported.`;
  }

  // 12. Monthly CSV Breakdown (or Monthly EDC breakdown!)
  if (/\bmonthly\b|\bby\s+month\b|\bevery\s+month\b/.test(ql)) {
    const summaryLines = availableMonths
      .map((ym) => {
        const span = summarizeSpan(rowsChrono.filter((r) => r.monthKey === ym && (r.isReconciled || r.solar > 0)));
        return `${ym}: ${round1(span.totalSolar)} kWh solar • ${span.reconciledCount ? `${round1(span.totalEdc)} kWh EDC (${round1(span.avgEdc)}/day)` : 'EDC N/A'} • ${round1(span.totalM01)} M01 / ${round1(span.totalM02)} M02`;
      })
      .join(' | ');
    return `Monthly CSV summary (newest first): ${summaryLines}.`;
  }

  // 13. Monthly Bills / Historical Usage
  if (/\b(bill\w*|statement\w*|summar\w*|historical)\b/.test(ql)) {
    const totalBills = moreBillsData?.total_pdf_files ?? 19;
    const authCount = moreBillsData?.authoritative_count ?? 17;
    const latestAuth = (moreBillsData?.bills || []).find((b) => b.is_authoritative);
    return `Analyzed ${totalBills} NYSEG PDF bills (${authCount} unique billing periods) from More Bills. Latest authoritative statement (${latestAuth?.statement_date || '2026-11-05'} for ${latestAuth?.billing_start_date || '2026-10-07'} to ${latestAuth?.billing_end_date || '2026-11-03'}): $${Number(latestAuth?.total_energy_charges ?? 43.57).toFixed(2)} energy charge, ${latestAuth?.imported_kwh ?? 437} kWh M01 import, ${latestAuth?.exported_kwh ?? 591} kWh M02 export, leaving ${bankNow.toLocaleString()} kWh in your Credit Bank.`;
  }

  // 14. Net Export vs Import day counts
  if (/\b(export|import|green|yellow|m02|m01)\b/.test(ql)) {
    const allSpan = summarizeSpan(reconciledChrono);
    const exportDays = reconciledChrono.filter((r) => r.m02 > r.m01).length;
    const importDays = reconciledChrono.length - exportDays;
    return `Across ${reconciledChrono.length} NYSEG-reconciled days: ${exportDays} days were net exports (M02 > M01, green rows) and ${importDays} days were net imports (M02 ≤ M01, yellow rows). Totals: ${fmtKwh(allSpan.totalM02)} M02 exported (${round1(allSpan.avgM02)}/day) vs ${fmtKwh(allSpan.totalM01)} M01 imported (${round1(allSpan.avgM01)}/day), +${round1(allSpan.totalNet)} kWh net.`;
  }

  // 15. General EDC / Consumption query
  if (metrics.edc) {
    const allRecSpan = summarizeSpan(reconciledChrono);
    const curMonthRows = rowsChrono.filter((r) => r.monthKey === availableMonths[0] && r.isReconciled);
    const curSpan = summarizeSpan(curMonthRows);
    return `Across ${reconciledChrono.length} NYSEG-reconciled days (${allRecSpan.recStartDate} to ${allRecSpan.recEndDate}), total Home Consumption (EDC) is ${fmtKwh(allRecSpan.totalEdc)} (${round1(allRecSpan.avgEdc)} kWh/day avg). Current month (${formatMonthName(availableMonths[0])}, ${curSpan.reconciledCount} days): ${fmtKwh(curSpan.totalEdc)} (${round1(curSpan.avgEdc)} kWh/day). Peak day overall: ${allRecSpan.peakEdcRow?.date} (${fmtKwh(allRecSpan.peakEdcRow?.edc)}).`;
  }

  // 16. System, Sync & Task Scheduler Status
  if (/\b(sync|schedule|task|job|system|hardware|panel|inverter|mobile|github)\b/.test(ql)) {
    const jobsTxt = (taskSchedulerData?.jobs || [])
      .map((j) => `${j.taskName}: ${j.state}${j.lastRunTime ? ` (last ${j.lastRunTime}, exit ${j.lastTaskResult})` : ''}`)
      .join(' | ');
    return `System: Sunrun 18.45 kW DC rooftop array (41 panels) + NYSEG Bidirectional Smart Meter. Loaded ${telemetryMeta.sunrun_total_rows} SunRun CSV days and ${Number(telemetryMeta.nyseg_hourly_rows || 0).toLocaleString()} NYSEG hourly intervals (${solarTotals.reconciledCount} reconciled days through ${telemetryMeta.latest_reconciled_date}, snapshot synced ${telemetryMeta.generated_at ? telemetryMeta.generated_at.slice(0, 16).replace('T', ' ') : 'today'}). Daily 7:30 AM sync & GitHub Pages push keep mobile updated.${jobsTxt ? ` Tasks: ${jobsTxt}.` : ''}`;
  }

  // 17. Rich General Summary Fallback
  const overallSpan = summarizeSpan(reconciledChrono);
  return `HeliosPulse Summary (${reconciledChrono.length} reconciled days through ${telemetryMeta.latest_reconciled_date}): Solar ${Number(solarTotals.cumSolar).toLocaleString()} kWh cumulative (${fmtKwh(overallSpan.recSolar)} reconciled), Home EDC ${fmtKwh(overallSpan.totalEdc)} (${round1(overallSpan.avgEdc)}/day), M02 Export ${fmtKwh(overallSpan.totalM02)}, M01 Import ${fmtKwh(overallSpan.totalM01)}, Official Credit Bank ${bankNow.toLocaleString()} kWh. You can ask to compare any two months (e.g. "Compare current EDC to November/October/July"), ask about a specific date ("Nov 15"), "last 7 days", "highest EDC day", or "monthly bills & forecast".`;
}

const MONTHLY_SUMMARIES_FALLBACK = [];
