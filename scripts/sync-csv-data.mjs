import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CODEX_ROOT = 'C:\\Software Developement\\ChatGPT Codex\\Solar Energy - SunRun';
const DEFAULT_SUNRUN_CSV = path.join(CODEX_ROOT, 'SunRun Data', 'Sunrun_Daily_Production_Data.csv');
const DEFAULT_NYSEG_CSV = path.join(CODEX_ROOT, 'SunRun Data', 'NYSEG_Daily_Usage_Data.csv');
const DEFAULT_APP_JSON = path.join(CODEX_ROOT, 'JSON', 'application_data_current.json');

const sunrunCsvPath = process.env.SUNRUN_CSV_PATH || DEFAULT_SUNRUN_CSV;
const nysegCsvPath = process.env.NYSEG_CSV_PATH || DEFAULT_NYSEG_CSV;
const outputJsonPath = path.join(projectRoot, 'src', 'data', 'telemetryData.json');
const notifyEmailScript = path.join(__dirname, 'notify_email.py');
const shouldSendEmail = process.env.NOTIFY_EMAIL === '1' || process.argv.includes('--notify');
const pipelineIssues = [];

// Snapshot previous telemetry before overwriting so new SunRun / NYSEG records can be detected
let previousPayload = null;
if (fs.existsSync(outputJsonPath)) {
  try {
    previousPayload = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
  } catch (err) {
    pipelineIssues.push({
      code: 'PRIOR_JSON_CORRUPT',
      severity: 'warning',
      title: 'Previous telemetryData.json could not be parsed cleanly',
      message: err.message,
      dates: [],
    });
  }
}

if (!fs.existsSync(sunrunCsvPath) || !fs.existsSync(nysegCsvPath)) {
  if (fs.existsSync(outputJsonPath)) {
    console.log(
      '[sync-csv-data] Local CSV paths not found (CI/build environment). Using existing src/data/telemetryData.json.'
    );
    process.exit(0);
  }
  console.error('[sync-csv-data] Error: Source CSV files not found and no cached telemetryData.json exists.');
  process.exit(1);
}

const KNOWN_WEATHER_OVERRIDES = {
  '2026-11-15': 'Clear',
  '2026-11-14': 'Overcast',
  '2026-11-13': 'Heavy drizzle',
  '2026-11-12': 'Drizzle',
  '2026-11-11': 'Overcast',
  '2026-11-10': 'Overcast',
  '2026-11-09': 'Overcast',
  '2026-11-08': 'Overcast',
  '2026-11-07': 'Fog',
  '2026-11-06': 'Cloudy',
  '2026-11-05': 'Heavy drizzle',
  '2026-11-04': 'Overcast',
};

// Optional enrichment from application_data_current.json
const appEntriesByDate = new Map();
if (fs.existsSync(DEFAULT_APP_JSON)) {
  try {
    const appData = JSON.parse(fs.readFileSync(DEFAULT_APP_JSON, 'utf8'));
    for (const entry of appData.daily_entries || []) {
      if (entry.entry_date) {
        appEntriesByDate.set(entry.entry_date, entry);
      }
    }
  } catch (err) {
    console.warn('[sync-csv-data] Warning: Could not parse application_data_current.json:', err.message);
    pipelineIssues.push({
      code: 'APP_DATA_PARSE_ERROR',
      severity: 'error',
      title: 'Failed to parse application_data_current.json',
      message: err.message,
      dates: [],
    });
  }
}

// Extract real NYSEG bill summary & 12-month credit_bank_forecast from solar_tracker.monthly_bill
let billSummaryReport = null;
if (fs.existsSync(path.join(CODEX_ROOT, 'solar_tracker', 'monthly_bill.py'))) {
  try {
    const pyOut = execFileSync(
      'python',
      [
        '-c',
        `import sys, json; sys.path.insert(0, ${JSON.stringify(CODEX_ROOT)}); from solar_tracker.monthly_bill import build_bill_summary_report; print(json.dumps(build_bill_summary_report()))`,
      ],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    billSummaryReport = JSON.parse(pyOut.trim());
  } catch (err) {
    console.warn('[sync-csv-data] Warning: Could not run build_bill_summary_report via python:', err.message);
    pipelineIssues.push({
      code: 'BILL_FORECAST_SYNC_ERROR',
      severity: 'error',
      title: 'Credit bank forecast / monthly_bill.py execution failed',
      message: err.message,
      dates: [],
    });
  }
}

// Parse all PDFs from NYSEG Bill\Bills\More Bills
let moreBillsReport = null;
const parseBillsScript = path.join(__dirname, 'parse_nyseg_bills.py');
if (fs.existsSync(parseBillsScript)) {
  try {
    const billsOut = execFileSync('python', [parseBillsScript], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    moreBillsReport = JSON.parse(billsOut.trim());
  } catch (err) {
    console.warn('[sync-csv-data] Warning: Could not run parse_nyseg_bills.py:', err.message);
    pipelineIssues.push({
      code: 'BILL_PDF_PARSE_ERROR',
      severity: 'error',
      title: 'NYSEG More Bills PDF parser failed',
      message: err.message,
      dates: [],
    });
  }
}

const srLines = fs
  .readFileSync(sunrunCsvPath, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1);
const nyLines = fs
  .readFileSync(nysegCsvPath, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1);

const srMap = new Map();
for (const line of srLines) {
  if (!line.trim()) continue;
  const [dateRaw, prodRaw, eodRaw] = line.split(',');
  const date = dateRaw.replace(/"/g, '').trim();
  srMap.set(date, {
    solar_kwh: Number(prodRaw || 0),
    eod_meter_kwh: Number(eodRaw || 0),
  });
}

const nyMap = new Map();
let nysegTotalHours = 0;

for (const line of nyLines) {
  if (!line.trim()) continue;
  const parts = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const date = (parts[5] || '').trim();
  if (!date) continue;

  const startTime = (parts[6] || '').trim();
  const hourMatch = startTime.match(/\s(\d{2}):/);
  const hour = hourMatch ? Number(hourMatch[1]) : 0;

  const net = Number(parts[8] || 0);
  const weatherRaw = (parts[11] || '').trim();
  const weather = weatherRaw !== '' ? Number(weatherRaw) : null;
  const delivered = Number(parts[12] || 0);
  const received = Number(parts[13] || 0);

  if (!nyMap.has(date)) {
    nyMap.set(date, {
      delivered: 0,
      received: 0,
      net: 0,
      temps: [],
      hours: 0,
      hourly: Array.from({ length: 24 }, (_, h) => ({ h, m01: 0, m02: 0, temp: null })),
    });
  }
  const entry = nyMap.get(date);
  entry.delivered += delivered;
  entry.received += received;
  entry.net += net;
  if (weather !== null && !Number.isNaN(weather)) {
    entry.temps.push(weather);
  }
  if (hour >= 0 && hour < 24) {
    entry.hourly[hour].m01 = Number((entry.hourly[hour].m01 + delivered).toFixed(3));
    entry.hourly[hour].m02 = Number((entry.hourly[hour].m02 + received).toFixed(3));
    if (weather !== null && !Number.isNaN(weather)) {
      entry.hourly[hour].temp = weather;
    }
  }
  entry.hours += 1;
  nysegTotalHours += 1;
}

function classifyIrradiance(solarKwh, dateStr) {
  if (solarKwh <= 0) return 'Pending';
  const month = Number(dateStr.slice(5, 7));
  const clearThreshold = month <= 8 ? 65 : month === 9 ? 50 : month === 10 ? 32 : 25;
  const partlyThreshold = clearThreshold * 0.65;
  const variableThreshold = clearThreshold * 0.35;

  if (solarKwh >= clearThreshold) return 'Clear';
  if (solarKwh >= partlyThreshold) return 'Partly Cloudy';
  if (solarKwh >= variableThreshold) return 'Variable';
  return 'Overcast';
}

const allDates = [...new Set([...srMap.keys(), ...nyMap.keys()])].sort();

const dailyRows = allDates.map((date, idx) => {
  const sr = srMap.get(date) || { solar_kwh: 0, eod_meter_kwh: 0 };
  const ny = nyMap.get(date) || null;
  const appEntry = appEntriesByDate.get(date) || null;

  const hasSunrun = sr.solar_kwh > 0 || (sr.eod_meter_kwh > 0 && date <= '2026-11-15');
  const hasNyseg = ny !== null && ny.hours > 0;

  const solar_kwh = Number(sr.solar_kwh.toFixed(3));
  const eod_meter_kwh = Number(sr.eod_meter_kwh.toFixed(3));
  const m01_import_kwh = hasNyseg ? Number(ny.delivered.toFixed(3)) : null;
  const m02_export_kwh = hasNyseg ? Number(ny.received.toFixed(3)) : null;
  const credit_delta = hasNyseg ? Number((ny.received - ny.delivered).toFixed(3)) : null;

  const avgTemp =
    hasNyseg && ny.temps.length > 0
      ? Math.round(ny.temps.reduce((a, b) => a + b, 0) / ny.temps.length)
      : appEntry?.temperature_f
      ? Math.round(Number(appEntry.temperature_f))
      : null;
  const minTemp =
    appEntry?.temperature_low_f != null
      ? Math.round(Number(appEntry.temperature_low_f))
      : hasNyseg && ny.temps.length > 0
      ? Math.min(...ny.temps)
      : null;
  const maxTemp =
    appEntry?.temperature_high_f != null
      ? Math.round(Number(appEntry.temperature_high_f))
      : hasNyseg && ny.temps.length > 0
      ? Math.max(...ny.temps)
      : null;

  const irradiance_wm2 =
    appEntry?.irradiance_peak_wm2 != null ? Math.round(Number(appEntry.irradiance_peak_wm2)) : null;

  const rawWeather = appEntry?.weather && appEntry.weather !== 'Unknown' ? appEntry.weather : null;
  const weather_label =
    KNOWN_WEATHER_OVERRIDES[date] || rawWeather || classifyIrradiance(solar_kwh, date);

  let status = 'RECONCILED';
  let note = appEntry?.notes_manual || '';

  if (solar_kwh === 0 && !hasNyseg) {
    status = 'PENDING_TELEMETRY';
    if (!note) {
      note = date === '2026-07-09' ? 'System commissioning baseline (0 kWh)' : 'Awaiting daily 7:30 AM telemetry sync';
    }
  } else if (!hasNyseg) {
    status = 'SUNRUN_ONLY';
    if (!note) {
      note =
        date < '2026-07-31'
          ? 'Sunrun production logged prior to NYSEG hourly CSV export start (2026-07-31)'
          : 'Sunrun production verified; NYSEG hourly interval export pending for this date';
    }
  } else if (ny.hours !== 24 && !note) {
    status = 'RECONCILED';
    note =
      ny.hours === 25
        ? 'DST Fall-Back (25 hourly NYSEG intervals reconciled)'
        : `${ny.hours} hourly NYSEG intervals recorded`;
  }

  return {
    id: `SR-${String(9001 + idx).padStart(4, '0')}`,
    date,
    solar_kwh,
    eod_meter_kwh,
    m01_import_kwh,
    m02_export_kwh,
    credit_delta,
    temp_f: avgTemp,
    temp_min_f: minTemp,
    temp_max_f: maxTemp,
    irradiance_wm2,
    nyseg_hours: hasNyseg ? ny.hours : 0,
    irradiance: weather_label,
    status,
    note,
    hourly: hasNyseg ? ny.hourly.map((h) => [h.m01, h.m02]) : null,
  };
});

// Monthly aggregations (stored newest-first descending: 2026-11 -> 2026-07)
const monthlyMap = new Map();
let cumulativeBank = 0;

for (const row of dailyRows) {
  const monthKey = row.date.slice(0, 7);
  if (!monthlyMap.has(monthKey)) {
    monthlyMap.set(monthKey, {
      month: monthKey,
      solar_kwh: 0,
      m01_import_kwh: 0,
      m02_export_kwh: 0,
      credit_delta: 0,
      reconciled_days: 0,
      sunrun_days: 0,
      prior_credit_bank: Number(cumulativeBank.toFixed(1)),
      ending_credit_bank: 0,
    });
  }
  const m = monthlyMap.get(monthKey);
  m.solar_kwh += row.solar_kwh;
  if (row.solar_kwh > 0) m.sunrun_days += 1;
  if (row.status === 'RECONCILED') {
    m.m01_import_kwh += row.m01_import_kwh || 0;
    m.m02_export_kwh += row.m02_export_kwh || 0;
    m.credit_delta += row.credit_delta || 0;
    m.reconciled_days += 1;
    cumulativeBank += row.credit_delta || 0;
  }
  m.ending_credit_bank = Number(cumulativeBank.toFixed(1));
}

const monthlySummaries = [...monthlyMap.values()]
  .map((m) => ({
    ...m,
    solar_kwh: Number(m.solar_kwh.toFixed(2)),
    m01_import_kwh: Number(m.m01_import_kwh.toFixed(2)),
    m02_export_kwh: Number(m.m02_export_kwh.toFixed(2)),
    credit_delta: Number(m.credit_delta.toFixed(2)),
  }))
  .reverse();

const reconciledRows = dailyRows.filter((r) => r.status === 'RECONCILED');
const totalSolarKwh = Number(dailyRows.reduce((acc, r) => acc + r.solar_kwh, 0).toFixed(3));
const reconciledSolarKwh = Number(reconciledRows.reduce((acc, r) => acc + r.solar_kwh, 0).toFixed(3));
const totalM01ImportKwh = Number(reconciledRows.reduce((acc, r) => acc + (r.m01_import_kwh || 0), 0).toFixed(3));
const totalM02ExportKwh = Number(reconciledRows.reduce((acc, r) => acc + (r.m02_export_kwh || 0), 0).toFixed(3));
const totalEdcConsumedKwh = Number((reconciledSolarKwh + totalM01ImportKwh - totalM02ExportKwh).toFixed(3));
const netCreditBankKwh = Number((totalM02ExportKwh - totalM01ImportKwh).toFixed(3));

// --- Data Anomaly & Issue Detection ---
const detectedAnomalies = [...pipelineIssues];

const exportExceedsSolarDates = dailyRows
  .filter((r) => r.status === 'RECONCILED' && (r.m02_export_kwh || 0) > r.solar_kwh + 0.5)
  .map((r) => r.date);
if (exportExceedsSolarDates.length > 0) {
  detectedAnomalies.push({
    code: 'EXPORT_EXCEEDS_SOLAR',
    severity: 'error',
    title: 'NYSEG M02 export exceeds SunRun solar production',
    message: `Physical bound check (M02 <= Solar + 0.5 kWh) failed on ${exportExceedsSolarDates.length} date(s). Check meter clock alignment or CSV source.`,
    dates: exportExceedsSolarDates,
  });
}

const negativeValueDates = dailyRows
  .filter(
    (r) =>
      r.solar_kwh < 0 ||
      (r.m01_import_kwh != null && r.m01_import_kwh < 0) ||
      (r.m02_export_kwh != null && r.m02_export_kwh < 0)
  )
  .map((r) => r.date);
if (negativeValueDates.length > 0) {
  detectedAnomalies.push({
    code: 'NEGATIVE_TELEMETRY_VALUE',
    severity: 'error',
    title: 'Negative solar or smart-meter reading detected',
    message: `One or more negative kWh values found on ${negativeValueDates.join(', ')}.`,
    dates: negativeValueDates,
  });
}

const missingNysegDates = dailyRows
  .filter((r) => r.status === 'SUNRUN_ONLY' && r.date >= '2026-07-31')
  .map((r) => r.date);
if (missingNysegDates.length > 0) {
  detectedAnomalies.push({
    code: 'MISSING_NYSEG_INTERVALS',
    severity: 'warning',
    title: `NYSEG hourly intervals missing for ${missingNysegDates.length} post-export date(s)`,
    message: `SunRun solar generation was recorded, but NYSEG smart-meter hourly CSV data is missing for: ${missingNysegDates.join(', ')}.`,
    dates: missingNysegDates,
  });
}

const partialNysegDays = dailyRows.filter((r) => r.nyseg_hours > 0 && r.nyseg_hours < 24);
if (partialNysegDays.length > 0) {
  detectedAnomalies.push({
    code: 'PARTIAL_NYSEG_INTERVALS',
    severity: 'warning',
    title: `Partial NYSEG day (< 24 hourly intervals) on ${partialNysegDays.length} date(s)`,
    message: partialNysegDays.map((r) => `${r.date} (${r.nyseg_hours}h)`).join(', '),
    dates: partialNysegDays.map((r) => r.date),
  });
}

// Rolling 7-day baseline solar underperformance check when irradiance is available
const underperfDates = [];
for (let i = 7; i < dailyRows.length; i += 1) {
  const row = dailyRows[i];
  if (row.irradiance_wm2 != null && row.irradiance_wm2 >= 650 && row.solar_kwh > 0) {
    const prev7 = dailyRows.slice(i - 7, i).map((d) => d.solar_kwh).filter((v) => v > 0);
    if (prev7.length >= 4) {
      const avg7 = prev7.reduce((a, b) => a + b, 0) / prev7.length;
      if (row.solar_kwh <= avg7 * 0.55) {
        underperfDates.push(row.date);
      }
    }
  }
}
if (underperfDates.length > 0) {
  detectedAnomalies.push({
    code: 'SOLAR_UNDERPERFORMANCE',
    severity: 'warning',
    title: 'Potential solar underperformance under high irradiance',
    message: `Production dropped below 55% of 7-day rolling baseline on high-irradiance day(s): ${underperfDates.join(', ')}.`,
    dates: underperfDates,
  });
}

// --- New SunRun & NYSEG Record Detection ---
const prevRowByDate = new Map(
  (previousPayload?.daily_rows || []).map((r) => [r.date, r])
);
const prevBillNames = new Set(
  (previousPayload?.more_bills?.bills || []).map((b) => b.file_name)
);

const newSunrunRecords = previousPayload
  ? dailyRows.filter((r) => {
      if (!(r.solar_kwh > 0)) return false;
      const prev = prevRowByDate.get(r.date);
      return !prev || !(prev.solar_kwh > 0);
    })
  : [];

const newNysegRecords = previousPayload
  ? dailyRows.filter((r) => {
      if (r.status !== 'RECONCILED' || !(r.nyseg_hours > 0)) return false;
      const prev = prevRowByDate.get(r.date);
      return !prev || prev.status !== 'RECONCILED' || !(prev.nyseg_hours > 0);
    })
  : [];

const currentBillFiles = (moreBillsReport?.bills || []).map((b) => b.file_name);
const newBillFiles = previousPayload
  ? currentBillFiles.filter((name) => !prevBillNames.has(name))
  : [];

let emailNotificationSummary = {
  recipient: process.env.HELIOSPULSE_ALERT_EMAIL || 'dglanville@gmail.com',
  should_send: shouldSendEmail,
  unsent_anomaly_count: detectedAnomalies.filter((a) => a.severity !== 'info').length,
  new_sunrun_count: newSunrunRecords.length,
  new_nyseg_count: newNysegRecords.length,
  new_bills_count: newBillFiles.length,
  emails_dispatched: [],
  recent_email_events: previousPayload?.notification_status?.recent_email_events || [],
};

if (fs.existsSync(notifyEmailScript)) {
  try {
    const notifyArgs = [notifyEmailScript, '--process-report', '-'];
    if (shouldSendEmail) {
      notifyArgs.push('--send');
    }
    const notifyPayload = {
      anomalies: detectedAnomalies,
      new_sunrun_records: newSunrunRecords,
      new_nyseg_records: newNysegRecords,
      new_bill_files: newBillFiles,
      current_sunrun_dates: dailyRows.filter((r) => r.solar_kwh > 0).map((r) => r.date),
      current_nyseg_dates: dailyRows.filter((r) => r.status === 'RECONCILED' && r.nyseg_hours > 0).map((r) => r.date),
      current_bill_files: currentBillFiles,
      daily_rows_compact: dailyRows.map((r) => ({
        date: r.date,
        solar_kwh: r.solar_kwh,
        eod_meter_kwh: r.eod_meter_kwh,
        m01_import_kwh: r.m01_import_kwh,
        m02_export_kwh: r.m02_export_kwh,
        nyseg_hours: r.nyseg_hours,
        status: r.status,
      })),
    };
    const notifyOut = execFileSync('python', notifyArgs, {
      input: JSON.stringify(notifyPayload),
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    });
    emailNotificationSummary = JSON.parse(notifyOut.trim());
  } catch (err) {
    console.warn('[sync-csv-data] Warning: Email notification step failed:', err.message);
    detectedAnomalies.push({
      code: 'EMAIL_DISPATCH_ERROR',
      severity: 'warning',
      title: 'Email notification dispatcher encountered an issue',
      message: err.message,
      dates: [],
    });
  }
}

const taskSchedulerScript = path.join(__dirname, 'task-scheduler.ps1');
let taskSchedulerSnapshot = previousPayload?.task_scheduler || null;
if (fs.existsSync(taskSchedulerScript)) {
  try {
    const psOut = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', taskSchedulerScript, '-Action', 'status'],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }
    );
    const parsedTaskStatus = JSON.parse(psOut.trim());
    if (Array.isArray(parsedTaskStatus?.jobs)) {
      const prevByKey = new Map(
        (previousPayload?.task_scheduler?.jobs || []).map((job) => [job.key, job])
      );
      parsedTaskStatus.jobs = parsedTaskStatus.jobs.map((job) => {
        const prev = prevByKey.get(job.key);
        if (job.state === 'Unavailable' && prev && prev.state && prev.state !== 'Unavailable') {
          return {
            ...prev,
            logInfo: job.logInfo || prev.logInfo || null,
            liveQueryNote: job.queryError || null,
          };
        }
        return job;
      });
      taskSchedulerSnapshot = parsedTaskStatus;
    }
  } catch (err) {
    console.warn('[sync-csv-data] Warning: Task Scheduler snapshot step failed:', err.message);
  }
}

const payload = {
  metadata: {
    generated_at: new Date().toISOString(),
    sync_schedule: 'Daily at 7:30 AM America/New_York',
    location: 'Yorktown Heights / Jefferson Valley, NY 10598',
    sunrun_source_path: DEFAULT_SUNRUN_CSV,
    nyseg_source_path: DEFAULT_NYSEG_CSV,
    sunrun_total_rows: srLines.length,
    nyseg_hourly_rows: nysegTotalHours,
    reconciled_days: reconciledRows.length,
    sunrun_only_days: dailyRows.filter((r) => r.status === 'SUNRUN_ONLY').length,
    pending_days: dailyRows.filter((r) => r.status === 'PENDING_TELEMETRY').length,
    date_range_start: allDates[0],
    date_range_end: allDates[allDates.length - 1],
    reconciled_range_start: reconciledRows[0]?.date || null,
    latest_reconciled_date: reconciledRows[reconciledRows.length - 1]?.date || null,
    latest_sunrun_date: [...dailyRows].reverse().find((r) => r.solar_kwh > 0)?.date || null,
    cumulative_solar_kwh: totalSolarKwh,
    reconciled_solar_kwh: reconciledSolarKwh,
    cumulative_m01_import_kwh: totalM01ImportKwh,
    cumulative_m02_export_kwh: totalM02ExportKwh,
    reconciled_edc_consumed_kwh: totalEdcConsumedKwh,
    cumulative_net_credit_bank_kwh: netCreditBankKwh,
  },
  task_scheduler: taskSchedulerSnapshot,
  alerts: detectedAnomalies,
  notification_status: {
    ...emailNotificationSummary,
    last_checked_at: new Date().toISOString(),
    new_sunrun_dates: newSunrunRecords.map((r) => r.date),
    new_nyseg_dates: newNysegRecords.map((r) => r.date),
    new_bill_files: newBillFiles,
  },
  monthly_summaries: monthlySummaries,
  credit_bank_forecast: billSummaryReport?.credit_bank_forecast || null,
  more_bills: moreBillsReport,
  bill_summary: billSummaryReport
    ? {
        file_count: billSummaryReport.file_count,
        period_count: billSummaryReport.period_count,
        totals: billSummaryReport.totals,
        cost_change: billSummaryReport.cost_change,
        credit_bank: billSummaryReport.credit_bank,
        latest: billSummaryReport.latest,
        next_bill_estimate: billSummaryReport.next_bill_estimate,
        records: billSummaryReport.records,
        authoritative_records: billSummaryReport.authoritative_records,
      }
    : null,
  daily_rows: [...dailyRows].reverse(),
};

fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
fs.writeFileSync(outputJsonPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(
  `[sync-csv-data] Synced ${dailyRows.length} daily records (${reconciledRows.length} reconciled with NYSEG, ${nysegTotalHours} NYSEG hourly intervals, anomalies=${detectedAnomalies.length}, newSR=${newSunrunRecords.length}, newNY=${newNysegRecords.length}, forecast=${Boolean(payload.credit_bank_forecast)}) -> src/data/telemetryData.json`
);
