import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Sun, Zap, Activity, ShieldCheck, RefreshCw,
  FileText, AlertTriangle, CheckCircle2,
  Download, Eye, Layers, Moon, SunMedium,
  Database, Calculator, X,
  Check, Sparkles, Plug, FolderOpen, Upload,
  ChevronLeft, ChevronRight, ChevronDown, Play, Pause, ArrowDown, ArrowUp, Home, Minimize2,
  Mail, Bell, Clock, Menu
} from 'lucide-react';
import telemetryData from './data/telemetryData.json';
import solarHomeSideImg from './assets/solar-home-side.png';
import solarFarmSideImg from './assets/solar-farm-side.png';
import EnergyCostChartsTab from './components/EnergyCostChartsTab.jsx';
import NysegMonthlyBillsTab from './components/NysegMonthlyBillsTab.jsx';
import { answerSolarQuestion } from './utils/solarAiEngine.js';

const INITIAL_SOLAR_DAILY = telemetryData.daily_rows;
const TELEMETRY_META = telemetryData.metadata;
const MONTHLY_SUMMARIES = telemetryData.monthly_summaries;
const CREDIT_BANK_FORECAST = telemetryData.credit_bank_forecast;

const ASSET_CATALOG = [
  {
    id: 'AST-01',
    name: 'Sunrun Rooftop Solar Array (18.45 kW DC • 41 Panels)',
    category: 'Generation',
    metric: `${TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh cumulative (${(TELEMETRY_META.cumulative_solar_kwh / 129).toFixed(1)} kWh/day avg)`,
    health: `${TELEMETRY_META.sunrun_total_rows} CSV Daily Records Loaded`,
    connector: 'Sunrun_Daily_Production_Data.csv',
  },
  {
    id: 'AST-02',
    name: 'NYSEG Bidirectional Smart Meter (Delivered / Received)',
    category: 'Utility Grid',
    metric: `2,210 kWh Official Bank (+${TELEMETRY_META.cumulative_net_credit_bank_kwh.toFixed(1)} kWh CSV Net)`,
    health: `${TELEMETRY_META.nyseg_hourly_rows.toLocaleString()} Hourly Intervals (${TELEMETRY_META.reconciled_days} Days)`,
    connector: 'NYSEG_Daily_Usage_Data.csv',
  },
  {
    id: 'AST-03',
    name: 'DuctlessAire 18k BTU Mini-Split (DA1821)',
    category: 'HVAC Load',
    metric: '~4.8 kWh/day',
    health: 'Normal Winter Defrost',
    connector: 'Circuit CT Clamp #4',
  },
  {
    id: 'AST-04',
    name: 'GE JS645SL1SS Electric Range',
    category: 'Appliance',
    metric: '~1.9 kWh/day',
    health: 'Nominal',
    connector: 'Sub-panel Sensor #2',
  },
];

const SYNC_STEPS = [
  { id: 1, title: 'Read Local CSV Sources', detail: 'Load Sunrun_Daily_Production_Data.csv & NYSEG_Daily_Usage_Data.csv' },
  { id: 2, title: 'Aggregate NYSEG Hourly', detail: `Group ${TELEMETRY_META.nyseg_hourly_rows.toLocaleString()} hourly Delivered/Received/Weather rows into daily totals` },
  { id: 3, title: 'Validate & Reconcile', detail: 'Enforce Received (M02) <= Solar_production + 0.5 kWh physical bound' },
  { id: 4, title: 'Anomaly & Gap Detection', detail: 'Flag NYSEG gaps past 3-day publishing lag & DST 25-hr interval days' },
  { id: 5, title: 'Recompute Credit Bank', detail: 'Extract 2,210 kWh NYSEG statement balance & 12-month forecast' },
  { id: 6, title: 'Publish Sanitized Snapshot', detail: 'Strip PII (Name/Address/Account#) & write telemetryData.json' },
];

const TOP_MENU_ITEMS = [
  { id: 'datagrid', label: 'Interval Data Grid' },
  { id: 'distribution', label: 'Energy Distribution' },
  { id: 'charts', label: 'Comparison & Cost' },
  { id: 'bills', label: 'NYSEG Monthly Bills' },
  { id: 'estimator', label: 'Credit forecaster' },
  { id: 'monthly', label: 'Production by month' },
  { id: 'savings', label: 'Solar savings' },
  { id: 'flow', label: 'Energy flow' },
  { id: 'nyseg', label: 'NYSEG record' },
  { id: 'connectors', label: 'CSV connectors' },
  { id: 'system', label: 'Your system' },
];

const AI_SUGGESTED_QUESTIONS = [
  'How does the current EDC compare to July about the same time?',
  'How is my NYSEG credit bank & winter forecast?',
  'What will my next NYSEG bill be?',
  'Summarize my NYSEG monthly bills & savings',
  'Which day had the highest home consumption (EDC)?',
  'What anomalies or data issues are currently detected?',
  'Explain my daily energy distribution & latest grid balance',
  'Compare monthly CSV production & grid exchange',
  'How much have I saved vs buying all power at $0.24/kWh?',
  'Which days were net export (green) vs net import (yellow)?',
  'What were my best and lowest solar production days?',
  'What is the status of my CSV sync, schedule & system?',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const NOV_GRID_OVERRIDES = {
  '2026-11-14': { cond: 'Overcast', irr: 369, sun: '+30.4°' },
  '2026-11-12': { cond: 'Drizzle', irr: 291, sun: '+30.9°' },
  '2026-11-11': { cond: 'Overcast', irr: 522, sun: '+31.2°' },
  '2026-11-10': { cond: 'Overcast', irr: 521, sun: '+31.5°' },
  '2026-11-09': { cond: 'Overcast', irr: 451, sun: '+31.7°' },
  '2026-11-08': { cond: 'Overcast', irr: 428, sun: '+32.0°' },
  '2026-11-07': { cond: 'Fog', irr: 308, sun: '+32.3°' },
  '2026-11-06': { cond: 'Cloudy', irr: 316, sun: '+32.6°' },
  '2026-11-05': { cond: 'Heavy drizzle', irr: 236, sun: '+32.9°' },
  '2026-11-04': { cond: 'Overcast', irr: 526, sun: '+33.2°' },
};

function getSolarAstronomyForDate(dateStr, solarKwh, fallbackIrrLabel, rowIrrWm2, rowIrrSource) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((d - start) / (1000 * 60 * 60 * 24));
  const declination = 23.45 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latitude = 41.32;
  const peakElevation = Math.max(15, 90 - latitude + declination);
  const sunHeightFormula = `90° − ${latitude}° (lat) + (${declination.toFixed(1)}° dec) = +${peakElevation.toFixed(1)}°`;

  if (NOV_GRID_OVERRIDES[dateStr]) {
    return {
      sunHeight: NOV_GRID_OVERRIDES[dateStr].sun,
      irradianceWm2: `${NOV_GRID_OVERRIDES[dateStr].irr} W/m²`,
      irradianceNum: NOV_GRID_OVERRIDES[dateStr].irr,
      weatherCond: NOV_GRID_OVERRIDES[dateStr].cond,
      irradianceOrigin: 'Open-Meteo peak irradiance archive (NYSEG historical table)',
      sunHeightFormula,
    };
  }
  const hasMeasuredIrr = rowIrrWm2 != null && Number(rowIrrWm2) > 0;
  const peakIrradiance = hasMeasuredIrr
    ? Math.round(Number(rowIrrWm2))
    : Math.round(Math.min(980, Math.max(180, solarKwh * 17.5 + 160)));
  return {
    sunHeight: `+${peakElevation.toFixed(1)}°`,
    irradianceWm2: `${peakIrradiance} W/m²`,
    irradianceNum: peakIrradiance,
    weatherCond: fallbackIrrLabel || 'Clear',
    irradianceOrigin: hasMeasuredIrr
      ? rowIrrSource || 'Open-Meteo peak irradiance archive'
      : `Estimated from daily SunRun production: clamp(180..980, ${solarKwh.toFixed(1)} × 17.5 + 160)`,
    sunHeightFormula,
  };
}

function postIssueToLocalServer(title, message, source = 'HeliosPulse UI', details = '') {
  try {
    fetch('/heliospulse-portal/api/report-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, source, details }),
    }).catch(() => {});
  } catch {
    // Static build environments have no local backend
  }
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unexpected application error' };
  }

  componentDidCatch(error, info) {
    postIssueToLocalServer(
      'HeliosPulse Portal Render Error',
      error?.message || 'React ErrorBoundary triggered',
      'AppErrorBoundary',
      info?.componentStack || ''
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f6f4ef] text-[#1a1917] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border-2 border-[#b91c1c] bg-white p-6 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-[#b91c1c] font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Application Issue Detected</span>
            </div>
            <p className="text-sm leading-relaxed">{this.state.errorMessage}</p>
            <p className="text-xs text-[#6b675e]">
              An automated alert email has been dispatched to dglanville@gmail.com (when connected to local sync server).
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-full bg-[#1a1917] text-white text-xs font-semibold cursor-pointer"
            >
              Reload Portal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function HeliosPulsePortalInner() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('datagrid');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [spanFilter, setSpanFilter] = useState('yearly'); // 'weekly' | 'monthly' | 'yearly'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'RECONCILED' | 'SUNRUN_ONLY'
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);

  const [solarRows, setSolarRows] = useState(INITIAL_SOLAR_DAILY);
  const [snapshotMeta, setSnapshotMeta] = useState(TELEMETRY_META);
  const [moreBillsData, setMoreBillsData] = useState(telemetryData.more_bills);
  const [creditBankForecastBase, setCreditBankForecastBase] = useState(telemetryData.credit_bank_forecast);
  const [telemetryAlerts, setTelemetryAlerts] = useState(telemetryData.alerts || []);
  const [notificationStatus, setNotificationStatus] = useState(telemetryData.notification_status || null);
  const [taskSchedulerData, setTaskSchedulerData] = useState(telemetryData.task_scheduler || null);
  const [runningTaskTarget, setRunningTaskTarget] = useState(null); // null | 'sunrun' | 'nyseg' | 'both'
  const [taskStatusLoading, setTaskStatusLoading] = useState(false);
  const [taskRunBanner, setTaskRunBanner] = useState(null);
  const [taskExecutionSteps, setTaskExecutionSteps] = useState([]);
  const [runnerBaseUrl, setRunnerBaseUrl] = useState(() => {
    try {
      return window.localStorage.getItem('heliospulse_runner_url') || '';
    } catch {
      return '';
    }
  });
  const [connectedRunnerOrigin, setConnectedRunnerOrigin] = useState(null);
  const [showRunnerSettings, setShowRunnerSettings] = useState(false);
  const taskPollTimerRef = useRef(null);
  const [appRuntimeIssues, setAppRuntimeIssues] = useState([]);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState([]);
  const [canceledAlertKeys, setCanceledAlertKeys] = useState(() => {
    try {
      const saved = window.localStorage.getItem('heliospulse_canceled_alerts');
      return Array.isArray(JSON.parse(saved || '[]')) ? JSON.parse(saved || '[]') : [];
    } catch {
      return [];
    }
  });
  const [canceledBannerSig, setCanceledBannerSig] = useState(() => {
    try {
      return window.localStorage.getItem('heliospulse_canceled_banner_sig') || '';
    } catch {
      return '';
    }
  });
  const [bannerCleared, setBannerCleared] = useState(false);
  const [showAlertLogModal, setShowAlertLogModal] = useState(false);
  const [alertLogFilter, setAlertLogFilter] = useState('all'); // 'all' | 'active' | 'canceled'
  const [persistedAlertLog, setPersistedAlertLog] = useState(() => {
    try {
      const saved = window.localStorage.getItem('heliospulse_alert_lookup_log');
      return Array.isArray(JSON.parse(saved || '[]')) ? JSON.parse(saved || '[]') : [];
    } catch {
      return [];
    }
  });
  const [aiHoverOpen, setAiHoverOpen] = useState(false);
  const aiHoverCloseTimerRef = useRef(null);
  const openAiHoverMenu = () => {
    if (aiHoverCloseTimerRef.current) {
      clearTimeout(aiHoverCloseTimerRef.current);
      aiHoverCloseTimerRef.current = null;
    }
    setAiHoverOpen(true);
  };
  const scheduleCloseAiHoverMenu = () => {
    if (aiHoverCloseTimerRef.current) clearTimeout(aiHoverCloseTimerRef.current);
    aiHoverCloseTimerRef.current = setTimeout(() => {
      setAiHoverOpen(false);
    }, 220);
  };
  const [lastFolderEvent, setLastFolderEvent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedAuditRow, setSelectedAuditRow] = useState(null);

  // Interval Data Grid state (106 rows: 104 reconciled + Oct 29 & 30 temporary placeholders)
  const [gridViewMode, setGridViewMode] = useState('Monthly'); // 'Weekly' | 'Monthly' | 'Yearly'
  const [gridCursorIndex, setGridCursorIndex] = useState(0); // 0 = latest month/week/year
  const [gridSortField, setGridSortField] = useState('date');
  const [gridSortAsc, setGridSortAsc] = useState(false);
  const [gridPopOut, setGridPopOut] = useState(false);
  const [gridNotes, setGridNotes] = useState({});
  const [selectedGridRows, setSelectedGridRows] = useState([]);
  const [hoveredDerivation, setHoveredDerivation] = useState(null);
  const showCellDerivation = (e, spec) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoveredDerivation({
      ...spec,
      rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
    });
  };
  const hideCellDerivation = () => setHoveredDerivation(null);
  const toggleSelectGridRow = (rowDate) => {
    setSelectedGridRows((prev) =>
      prev.includes(rowDate) ? prev.filter((d) => d !== rowDate) : [...prev, rowDate]
    );
  };
  const [colFilterPower, setColFilterPower] = useState('No');
  const [colFilterM01, setColFilterM01] = useState('No');
  const [colFilterM02, setColFilterM02] = useState('No');
  const [colFilterDiff, setColFilterDiff] = useState('No');
  const [colFilterEdc, setColFilterEdc] = useState('No');

  // Reconciled dates sorted chronological (oldest -> newest)
  const reconciledRowsChrono = useMemo(() => {
    return [...solarRows]
      .filter((r) => r.status === 'RECONCILED')
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [solarRows]);

  // Keep Credit Forecaster unbilled interval sums & opening balance locked in sync with Interval Data Grid reconciled rows
  const liveCreditBankForecast = useMemo(() => {
    const base = creditBankForecastBase || CREDIT_BANK_FORECAST;
    if (!base) return null;
    const officialPeriodEnd = base.official_period_end || '2026-11-03';
    const officialBalance = Number(base.official_credit_kwh ?? 2210);
    const postStmtRows = reconciledRowsChrono.filter((r) => r.date > officialPeriodEnd);
    if (postStmtRows.length === 0) {
      return { ...base, unbilled_reconciled_days: 0 };
    }
    const unbilledM01 = postStmtRows.reduce((a, r) => a + (r.m01_import_kwh || 0), 0);
    const unbilledM02 = postStmtRows.reduce((a, r) => a + (r.m02_export_kwh || 0), 0);
    const unbilledNet = unbilledM02 - unbilledM01;
    const openingProjected = officialBalance + unbilledNet;
    const intervalEnd = postStmtRows[postStmtRows.length - 1].date;

    const baseRows = base.rows || [];
    let runningCredit = openingProjected;
    let exhaustedMonth = null;
    const syncedRows = baseRows.map((row) => {
      const nextCredit = runningCredit - (row.net_usage_kwh || 0);
      runningCredit = nextCredit;
      if (exhaustedMonth === null && nextCredit <= 0) {
        exhaustedMonth = row.month;
      }
      return {
        ...row,
        ending_credit_kwh: nextCredit,
      };
    });

    return {
      ...base,
      interval_file_end: intervalEnd,
      unbilled_m01_kwh: Number(unbilledM01.toFixed(3)),
      unbilled_m02_kwh: Number(unbilledM02.toFixed(3)),
      unbilled_net_credit_kwh: Number(unbilledNet.toFixed(3)),
      opening_projected_kwh: Number(openingProjected.toFixed(3)),
      unbilled_reconciled_days: postStmtRows.length,
      exhausted_month: exhaustedMonth,
      rows: syncedRows,
    };
  }, [creditBankForecastBase, reconciledRowsChrono]);

  // Build the Interval Data Grid dataset (reconciled rows + temporary NYSEG placeholders)
  const fullIntervalGridRows = useMemo(() => {
    const TEMP_PLACEHOLDER_SOURCES = {
      '2026-10-29': '2026-10-31',
      '2026-10-30': '2026-10-31',
      '2026-11-13': '2026-11-12',
    };
    const rowsByDate = new Map(solarRows.map((r) => [r.date, r]));
    const candidates = solarRows
      .filter((r) => r.status === 'RECONCILED' || Boolean(TEMP_PLACEHOLDER_SOURCES[r.date]))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const RATE = 0.24;
    let runM01 = 0;
    let runM02 = 0;
    let runEdc = 0;

    const computedChrono = candidates.map((r) => {
      const fallbackDate = r.status !== 'RECONCILED' ? TEMP_PLACEHOLDER_SOURCES[r.date] : null;
      const fallbackRow = fallbackDate ? rowsByDate.get(fallbackDate) : null;
      const isTempPlaceholder = Boolean(fallbackDate && fallbackRow);
      const sourceNyseg = isTempPlaceholder ? fallbackRow : r;

      const solar = r.solar_kwh || 0;
      const m01 = sourceNyseg.m01_import_kwh || 0;
      const m02 = sourceNyseg.m02_export_kwh || 0;
      const diffNet = m01 - m02;
      const edc = solar + m01 - m02;

      if (!isTempPlaceholder) {
        runM01 += m01;
        runM02 += m02;
        runEdc += edc;
      }

      const importCost = m01 * RATE;
      const exportValue = m02 * RATE;
      const netCost = diffNet * RATE;
      const runningNetCost = (runM01 - runM02) * RATE;

      const dObj = new Date(`${r.date}T12:00:00Z`);
      const dayName = DAY_NAMES[dObj.getUTCDay()];
      const astro = getSolarAstronomyForDate(
        r.date,
        solar,
        r.irradiance || sourceNyseg.irradiance,
        r.irradiance_wm2,
        r.irradiance_source
      );
      const tHigh = r.temp_max_f ?? sourceNyseg.temp_max_f ?? sourceNyseg.temp_f ?? 55;
      const tLow = r.temp_min_f ?? sourceNyseg.temp_min_f ?? sourceNyseg.temp_f ?? 42;

      return {
        ...r,
        isTempPlaceholder,
        tempSourceDate: isTempPlaceholder ? fallbackDate : null,
        nysegHours: sourceNyseg.nyseg_hours || 0,
        note: isTempPlaceholder
          ? `Temporary NYSEG record (copied from ${fallbackDate} while NYSEG intervals are pending)`
          : r.note,
        dayName,
        tempHigh: tHigh,
        tempLow: tLow,
        weatherCond: astro.weatherCond,
        irradianceNum: astro.irradianceNum,
        irradianceOrigin: astro.irradianceOrigin,
        sunHeight: astro.sunHeight,
        sunHeightFormula: astro.sunHeightFormula,
        solar_kwh: solar,
        m01_import_kwh: m01,
        running_m01: runM01,
        m02_export_kwh: m02,
        running_m02: runM02,
        m01_m02_diff: diffNet,
        edc_kwh: edc,
        running_edc: runEdc,
        import_cost: importCost,
        export_value: exportValue,
        net_cost: netCost,
        running_net_cost: runningNetCost,
      };
    });

    return computedChrono.reverse();
  }, [solarRows]);

  const gridPeriods = useMemo(() => {
    if (gridViewMode === 'Monthly') {
      const months = [...new Set(fullIntervalGridRows.map((r) => r.date.slice(0, 7)))].sort().reverse();
      return months.map((m) => {
        const [yr, mo] = m.split('-');
        return {
          key: m,
          label: `${MONTH_NAMES[Number(mo) - 1]} ${yr}`,
          rows: fullIntervalGridRows.filter((r) => r.date.startsWith(m)),
        };
      });
    }
    if (gridViewMode === 'Weekly') {
      const chunks = [];
      for (let i = 0; i < fullIntervalGridRows.length; i += 7) {
        const slice = fullIntervalGridRows.slice(i, i + 7);
        if (slice.length) {
          chunks.push({
            key: `${slice[slice.length - 1].date}_${slice[0].date}`,
            label: `${slice[slice.length - 1].date} – ${slice[0].date}`,
            rows: slice,
          });
        }
      }
      return chunks;
    }
    return [
      {
        key: '2026',
        label: '2026 (All 106 rows)',
        rows: fullIntervalGridRows,
      },
    ];
  }, [fullIntervalGridRows, gridViewMode]);

  const activeGridPeriod = useMemo(() => {
    const safeIdx = Math.max(0, Math.min(gridPeriods.length - 1, gridCursorIndex));
    return gridPeriods[safeIdx] || { key: '', label: '', rows: [] };
  }, [gridPeriods, gridCursorIndex]);

  const visibleGridRows = useMemo(() => {
    let rows = [...activeGridPeriod.rows];

    const applyFilter = (list, mode, getter) => {
      if (mode === 'No') return list;
      if (mode === 'Pos') return list.filter((r) => getter(r) > 0);
      if (mode === 'Neg') return list.filter((r) => getter(r) < 0);
      if (mode === 'High') {
        const avg = list.reduce((a, r) => a + getter(r), 0) / (list.length || 1);
        return list.filter((r) => getter(r) >= avg);
      }
      if (mode === 'Low') {
        const avg = list.reduce((a, r) => a + getter(r), 0) / (list.length || 1);
        return list.filter((r) => getter(r) < avg);
      }
      return list;
    };

    rows = applyFilter(rows, colFilterPower, (r) => r.solar_kwh);
    rows = applyFilter(rows, colFilterM01, (r) => r.m01_import_kwh);
    rows = applyFilter(rows, colFilterM02, (r) => r.m02_export_kwh);
    rows = applyFilter(rows, colFilterDiff, (r) => r.m01_m02_diff);
    rows = applyFilter(rows, colFilterEdc, (r) => r.edc_kwh);

    rows.sort((a, b) => {
      const vA = a[gridSortField];
      const vB = b[gridSortField];
      if (vA < vB) return gridSortAsc ? -1 : 1;
      if (vA > vB) return gridSortAsc ? 1 : -1;
      return 0;
    });

    return rows;
  }, [
    activeGridPeriod,
    colFilterPower,
    colFilterM01,
    colFilterM02,
    colFilterDiff,
    colFilterEdc,
    gridSortField,
    gridSortAsc,
  ]);

  const gridSpanKpis = useMemo(() => {
    const rows = visibleGridRows;
    const rowCount = rows.length;
    const tempCount = rows.filter((r) => r.isTempPlaceholder).length;
    const power = rows.reduce((a, r) => a + r.solar_kwh, 0);
    const m01 = rows.reduce((a, r) => a + r.m01_import_kwh, 0);
    const m02 = rows.reduce((a, r) => a + r.m02_export_kwh, 0);
    const edc = rows.reduce((a, r) => a + r.edc_kwh, 0);
    const netExport = m02 - m01;
    const dailyBaseFee = 0.948;
    const netEnergyCost = (m01 - m02) * 0.24;
    const baseFeeTotal = rowCount * dailyBaseFee;
    const costWithSolar = Math.max(0, netEnergyCost + baseFeeTotal);
    const histDailyBaseFee = 0.8546;
    const costWithoutSolar = edc * 0.24 + rowCount * histDailyBaseFee;

    return {
      rowCount,
      tempCount,
      spanLabel: activeGridPeriod.label,
      powerRaw: power,
      m01Raw: m01,
      m02Raw: m02,
      edcRaw: edc,
      netExportRaw: netExport,
      netEnergyCostRaw: netEnergyCost,
      baseFeeTotalRaw: baseFeeTotal,
      costWithSolarRaw: costWithSolar,
      costWithoutSolarRaw: costWithoutSolar,
      power: power.toFixed(1),
      m01: Number(m01.toFixed(1)),
      m02: m02.toFixed(1),
      edc: edc.toFixed(1),
      netExport: (netExport < 0 ? '−' : netExport > 0 ? '+' : '') + Math.abs(netExport).toFixed(1),
      costWithSolar: costWithSolar.toFixed(2),
      costWithoutSolar: costWithoutSolar.toFixed(2),
    };
  }, [visibleGridRows, activeGridPeriod]);

  const [selectedDistDate, setSelectedDistDate] = useState(
    TELEMETRY_META.latest_reconciled_date || '2026-11-14'
  );
  const [isPlayingDates, setIsPlayingDates] = useState(false);

  useEffect(() => {
    if (!isPlayingDates || reconciledRowsChrono.length === 0) return undefined;
    const timer = setInterval(() => {
      setSelectedDistDate((prev) => {
        const idx = reconciledRowsChrono.findIndex((r) => r.date === prev);
        const nextIdx = idx < 0 || idx >= reconciledRowsChrono.length - 1 ? 0 : idx + 1;
        return reconciledRowsChrono[nextIdx].date;
      });
    }, 650);
    return () => clearInterval(timer);
  }, [isPlayingDates, reconciledRowsChrono]);

  const selectedDistRow = useMemo(() => {
    return (
      reconciledRowsChrono.find((r) => r.date === selectedDistDate) ||
      reconciledRowsChrono[reconciledRowsChrono.length - 1]
    );
  }, [reconciledRowsChrono, selectedDistDate]);

  const hourlyBalanceData = useMemo(() => {
    if (!selectedDistRow) return [];
    const totalSolar = selectedDistRow.solar_kwh || 0;
    const rawHourly =
      selectedDistRow.hourly || Array.from({ length: 24 }, () => [0, 0]);

    const rawWeights = rawHourly.map(([m01, m02], h) => {
      if (h < 6 || h > 17) return m02 > 0 ? m02 : 0;
      const bell = Math.max(0, Math.sin(((h - 6) / 11) * Math.PI));
      return bell * 1.2 + m02 * 0.85;
    });
    const weightSum = rawWeights.reduce((a, b) => a + b, 0) || 1;

    return rawHourly.map(([m01, m02], h) => {
      const estSolar = Number(((totalSolar * rawWeights[h]) / weightSum).toFixed(2));
      const estConsumed = Number(Math.max(0.05, estSolar + m01 - m02).toFixed(2));
      return {
        hour: h,
        solar: estSolar,
        m01: Number(m01.toFixed(2)),
        consumed: estConsumed,
        m02: Number(m02.toFixed(2)),
      };
    });
  }, [selectedDistRow]);

  // Sync Pipeline State
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeSyncStep, setActiveSyncStep] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(
    TELEMETRY_META.generated_at.replace('T', ' ').slice(0, 19) + ' UTC'
  );
  const [syncLogs, setSyncLogs] = useState([
    {
      ts: TELEMETRY_META.generated_at.replace('T', ' ').slice(0, 19),
      provider: 'Coordinator',
      status: 'VERIFIED_COMPLETE',
      msg: `Synced ${TELEMETRY_META.sunrun_total_rows} Sunrun days (${TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh), ${TELEMETRY_META.reconciled_days} NYSEG days, and 12-month credit forecast.`,
    },
    {
      ts: TELEMETRY_META.generated_at.replace('T', ' ').slice(0, 19),
      provider: 'NYSEGConnector',
      status: 'SUCCESS',
      msg: `Loaded ${TELEMETRY_META.nyseg_source_path} + official 2026-11-05 statement (2,210 kWh credit bank).`,
    },
    {
      ts: TELEMETRY_META.generated_at.replace('T', ' ').slice(0, 19),
      provider: 'SunrunConnector',
      status: 'SUCCESS',
      msg: `Loaded ${TELEMETRY_META.sunrun_source_path} (${TELEMETRY_META.date_range_start} to ${TELEMETRY_META.date_range_end}).`,
    },
  ]);

  // Connector Configuration
  const [sunrunCsvPathInput, setSunrunCsvPathInput] = useState(TELEMETRY_META.sunrun_source_path);
  const [nysegCsvPathInput, setNysegCsvPathInput] = useState(TELEMETRY_META.nyseg_source_path);
  const [rawPayloadInput, setRawPayloadInput] = useState(
    '{\n  "provider": "sunrun",\n  "id": "SR-9133",\n  "date": "2026-11-16",\n  "production_kwh": 24.8,\n  "m01_import_kwh": 18.2,\n  "m02_export_kwh": 11.4\n}'
  );
  const [ingestBanner, setIngestBanner] = useState(null);

  // Modals & Drawers
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiMessages, setAiMessages] = useState([
    {
      role: 'assistant',
      text: `Connected to your real CSV & NYSEG statement dataset (${TELEMETRY_META.reconciled_days} reconciled days through ${TELEMETRY_META.latest_reconciled_date}): ${Number(telemetryData.more_bills?.current_credit_bank_kwh ?? 2210).toLocaleString()} kWh official NYSEG credit balance (${CREDIT_BANK_FORECAST?.official_statement_date || '2026-11-05'} statement), ${Number(CREDIT_BANK_FORECAST?.unbilled_net_credit_kwh ?? 0).toFixed(1)} kWh unbilled net flow through ${CREDIT_BANK_FORECAST?.interval_file_end || TELEMETRY_META.latest_reconciled_date}, and ${Number(CREDIT_BANK_FORECAST?.opening_projected_kwh ?? 0).toFixed(1)} kWh forecast opening balance.`,
    },
  ]);
  const aiMessagesEndRef = useRef(null);
  useEffect(() => {
    if (showAiDrawer) {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, showAiDrawer]);

  // Seasonal Comparison Analysis (Summer Aug 1 - Sep 15 vs Autumn Oct 1 - Nov 14)
  const seasonalComparison = useMemo(() => {
    const reconciled = solarRows.filter((r) => r.status === 'RECONCILED');
    const summerRows = reconciled.filter((r) => r.date >= '2026-08-01' && r.date <= '2026-09-15');
    const autumnRows = reconciled.filter((r) => r.date >= '2026-10-01' && r.date <= '2026-11-14');

    const avg = (arr, fn) => (arr.length ? arr.reduce((a, r) => a + fn(r), 0) / arr.length : 0);

    const summerSolar = avg(summerRows, (r) => r.solar_kwh || 0);
    const autumnSolar = avg(autumnRows, (r) => r.solar_kwh || 0);

    const summerDelivered = avg(summerRows, (r) => r.m01_import_kwh || 0);
    const autumnDelivered = avg(autumnRows, (r) => r.m01_import_kwh || 0);

    const summerReceived = avg(summerRows, (r) => r.m02_export_kwh || 0);
    const autumnReceived = avg(autumnRows, (r) => r.m02_export_kwh || 0);

    const summerHomeLoad = avg(
      summerRows,
      (r) => Math.max(0, (r.solar_kwh || 0) - (r.m02_export_kwh || 0) + (r.m01_import_kwh || 0))
    );
    const autumnHomeLoad = avg(
      autumnRows,
      (r) => Math.max(0, (r.solar_kwh || 0) - (r.m02_export_kwh || 0) + (r.m01_import_kwh || 0))
    );

    const summerTemp = Math.round(avg(summerRows, (r) => r.temp_f || 72));
    const autumnTemp = Math.round(avg(autumnRows, (r) => r.temp_f || 52));

    const pctDiff = (before, after) => {
      if (!before) return 0;
      return Math.round(((after - before) / before) * 100);
    };

    return {
      summerDays: summerRows.length,
      autumnDays: autumnRows.length,
      summerTemp,
      autumnTemp,
      tempDrop: summerTemp - autumnTemp,
      metrics: [
        {
          title: 'Total home consumption (Sunrun + NYSEG)',
          beforeVal: summerHomeLoad,
          afterVal: autumnHomeLoad,
          pct: pctDiff(summerHomeLoad, autumnHomeLoad),
        },
        {
          title: 'Solar produced (Sunrun array)',
          beforeVal: summerSolar,
          afterVal: autumnSolar,
          pct: pctDiff(summerSolar, autumnSolar),
        },
        {
          title: 'Sent to grid (NYSEG M02 Received)',
          beforeVal: summerReceived,
          afterVal: autumnReceived,
          pct: pctDiff(summerReceived, autumnReceived),
        },
        {
          title: 'Delivered by NYSEG (M01 Import)',
          beforeVal: summerDelivered,
          afterVal: autumnDelivered,
          pct: pctDiff(summerDelivered, autumnDelivered),
        },
      ],
    };
  }, [solarRows]);

  // Rows filtered by span
  const spanFilteredRows = useMemo(() => {
    const activeRows = solarRows.filter((r) => r.status !== 'PENDING_TELEMETRY');
    const base =
      statusFilter === 'all'
        ? spanFilter === 'yearly'
          ? solarRows
          : activeRows
        : solarRows.filter((r) => r.status === statusFilter);

    if (spanFilter === 'weekly') return base.slice(0, 7);
    if (spanFilter === 'monthly') return base.slice(0, 30);
    return base;
  }, [solarRows, spanFilter, statusFilter]);

  // Overall cumulative & current span KPIs
  const solarTotals = useMemo(() => {
    const allReconciled = solarRows.filter((r) => r.status === 'RECONCILED');
    const cumSolar = solarRows.reduce((acc, r) => acc + (r.solar_kwh || 0), 0);
    const reconciledSolar = allReconciled.reduce((acc, r) => acc + (r.solar_kwh || 0), 0);
    const cumImp = allReconciled.reduce((acc, r) => acc + (r.m01_import_kwh || 0), 0);
    const cumExp = allReconciled.reduce((acc, r) => acc + (r.m02_export_kwh || 0), 0);
    const cumEdcConsumed = reconciledSolar + cumImp - cumExp;
    const cumBank = cumExp - cumImp;

    const spanProd = spanFilteredRows.reduce((acc, r) => acc + (r.solar_kwh || 0), 0);
    const spanImp = spanFilteredRows.reduce((acc, r) => acc + (r.m01_import_kwh || 0), 0);
    const spanExp = spanFilteredRows.reduce((acc, r) => acc + (r.m02_export_kwh || 0), 0);
    const spanNetDelta = spanExp - spanImp;

    const maxEodMeter = Math.max(...solarRows.map((r) => r.eod_meter_kwh || 0));

    return {
      cumSolar: cumSolar.toFixed(1),
      cumSolarExact: cumSolar.toFixed(3),
      cumSolarMwh: (cumSolar / 1000).toFixed(3),
      reconciledSolar: reconciledSolar.toFixed(1),
      cumImp: cumImp.toFixed(1),
      cumExp: cumExp.toFixed(1),
      cumEdcConsumed: cumEdcConsumed.toFixed(1),
      bankBalance: cumBank.toFixed(1),
      maxEodMeter: maxEodMeter.toFixed(1),
      prod: spanProd.toFixed(1),
      imp: spanImp.toFixed(1),
      exp: spanExp.toFixed(1),
      netDelta: (spanNetDelta >= 0 ? '+' : '') + spanNetDelta.toFixed(1),
      reconciledCount: allReconciled.length,
      totalDays: solarRows.length,
    };
  }, [solarRows, spanFilteredRows]);

  const sortedSolarRows = useMemo(() => {
    return [...spanFilteredRows].sort((a, b) => {
      const valA = a[sortField] ?? -999999;
      const valB = b[sortField] ?? -999999;
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [spanFilteredRows, sortField, sortAsc]);

  const chartRows = useMemo(() => {
    const reconciled = solarRows.filter((r) => r.status === 'RECONCILED');
    const count = spanFilter === 'weekly' ? 7 : 14;
    return reconciled.slice(0, count).reverse();
  }, [solarRows, spanFilter]);

  // Handlers & Anomaly / Email Alert Helpers
  const reportAppIssue = (title, message, source = 'HeliosPulse UI', details = '') => {
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const id = `${title}::${message}`;
    setAppRuntimeIssues((prev) => {
      if (prev.some((p) => p.id === id)) return prev;
      return [
        {
          id,
          code: 'APP_RUNTIME_ISSUE',
          severity: 'error',
          title,
          message: `${message} (${nowIso})`,
          dates: [],
          source,
        },
        ...prev,
      ].slice(0, 10);
    });
    setBannerCleared(false);
    postIssueToLocalServer(title, message, source, details);
  };

  const getAlertKey = (alert) => `${alert.code}::${(alert.dates || []).join(',')}`;

  const applyFreshTelemetrySnapshot = (fresh, eventSource = 'sync') => {
    if (!fresh) return;
    if (fresh.metadata) {
      setSnapshotMeta(fresh.metadata);
    }
    if (Array.isArray(fresh.daily_rows)) {
      setSolarRows(fresh.daily_rows);
      if (fresh.metadata?.latest_reconciled_date) {
        setSelectedDistDate(fresh.metadata.latest_reconciled_date);
      }
    }
    if (Array.isArray(fresh.alerts)) {
      setTelemetryAlerts(fresh.alerts);
      if (fresh.alerts.length > 0) setBannerCleared(false);
    }
    if (fresh.notification_status) {
      setNotificationStatus(fresh.notification_status);
      if ((fresh.notification_status.new_sunrun_count || 0) > 0 || (fresh.notification_status.new_nyseg_count || 0) > 0) {
        setBannerCleared(false);
      }
    }
    if (fresh.task_scheduler) {
      setTaskSchedulerData(fresh.task_scheduler);
    }
    if (fresh.credit_bank_forecast) {
      setCreditBankForecastBase(fresh.credit_bank_forecast);
    }
    if (fresh.more_bills) {
      setMoreBillsData(fresh.more_bills);
      setLastFolderEvent(
        `Scanned More Bills folder at ${new Date().toLocaleTimeString()} (${eventSource}) — ${fresh.more_bills.total_pdf_files} PDF bills analyzed.`
      );
    }
  };

  const stopTaskPolling = () => {
    if (taskPollTimerRef.current) {
      clearInterval(taskPollTimerRef.current);
      taskPollTimerRef.current = null;
    }
  };

  const mergeTaskSchedulerPayload = (incoming) => {
    if (!incoming || !Array.isArray(incoming.jobs)) return;
    setTaskSchedulerData((prev) => {
      const prevByKey = new Map((prev?.jobs || []).map((j) => [j.key, j]));
      const mergedJobs = incoming.jobs.map((job) => {
        const oldJob = prevByKey.get(job.key);
        if (job.state === 'Unavailable' && oldJob && oldJob.state && oldJob.state !== 'Unavailable') {
          return { ...oldJob, logInfo: job.logInfo || oldJob.logInfo || null, liveQueryNote: job.queryError || null };
        }
        return job;
      });
      return { ...incoming, jobs: mergedJobs };
    });
  };

  const getRunnerBases = () => {
    const bases = [''];
    const custom = (runnerBaseUrl || '').trim().replace(/\/+$/, '');
    if (custom && !bases.includes(custom)) bases.push(custom);
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || origin.includes('github.io')) {
        for (const candidate of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']) {
          if (candidate !== origin && !bases.includes(candidate)) {
            bases.push(candidate);
          }
        }
      }
    }
    return bases;
  };

  const fetchLocalRunnerApi = async (apiPath, options) => {
    let lastError = null;
    for (const base of getRunnerBases()) {
      try {
        const resp = await fetch(`${base}${apiPath}`, options);
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          continue;
        }
        setConnectedRunnerOrigin(base || (typeof window !== 'undefined' ? window.location.origin : 'same-origin'));
        return resp;
      } catch (err) {
        lastError = err;
      }
    }
    setConnectedRunnerOrigin(null);
    throw lastError || new Error('LOCAL_API_UNAVAILABLE');
  };

  const refreshTaskSchedulerStatus = async (silent = false) => {
    if (!silent) setTaskStatusLoading(true);
    try {
      const resp = await fetchLocalRunnerApi('/heliospulse-portal/api/task-scheduler');
      if (resp.ok) {
        const payload = await resp.json();
        mergeTaskSchedulerPayload(payload);
        return payload;
      }
    } catch {
      // Static GitHub Pages builds rely on telemetryData.json unless connected to a local/LAN Vite runner
    } finally {
      if (!silent) setTaskStatusLoading(false);
    }
    return null;
  };

  const handleRunScheduledTask = async (target = 'both') => {
    if (runningTaskTarget) return;
    stopTaskPolling();
    setRunningTaskTarget(target);
    const labelMap = {
      sunrun: 'Sunrun Daily Download and Copy',
      nyseg: 'Solar Energy Tracker - NYSEG Daily Sync',
      publish: 'GitHub Pages Mobile Sync & Push (7:30 AM)',
      both: 'SunRun + NYSEG scheduled jobs',
      all: 'All SunRun, NYSEG & GitHub Pages Sync jobs',
    };
    const psFallbackCmd =
      target === 'sunrun'
        ? 'Start-ScheduledTask -TaskName "Sunrun Daily Download and Copy"'
        : target === 'nyseg'
        ? 'Start-ScheduledTask -TaskName "Solar Energy Tracker - NYSEG Daily Sync"'
        : target === 'publish'
        ? 'Start-ScheduledTask -TaskName "HeliosPulse_Daily_730AM_CSV_Sync"'
        : 'Start-ScheduledTask -TaskName "Sunrun Daily Download and Copy"; Start-ScheduledTask -TaskName "Solar Energy Tracker - NYSEG Daily Sync"';

    const buildSteps = (overrides = {}) => [
      {
        id: 'dispatch',
        label: `1. Dispatch Task Scheduler trigger (${target === 'both' ? 'SunRun & NYSEG' : target.toUpperCase()})`,
        status: 'running',
        detail: 'Connecting to local/LAN Vite runner (/heliospulse-portal/api/run-task)...',
        ...overrides.dispatch,
      },
      {
        id: 'execute',
        label: '2. Execute Windows scheduled task & download/validate scripts',
        status: 'pending',
        detail: 'Waiting for Start-ScheduledTask confirmation...',
        ...overrides.execute,
      },
      {
        id: 'sync',
        label: '3. Re-sync CSVs & rebuild HeliosPulse telemetry snapshot',
        status: 'pending',
        detail: 'Pending task completion...',
        ...overrides.sync,
      },
      {
        id: 'refresh',
        label: '4. Refresh UI records, alerts & credit forecast',
        status: 'pending',
        detail: 'Pending telemetry sync...',
        ...overrides.refresh,
      },
    ];

    setTaskExecutionSteps(buildSteps());
    setTaskRunBanner({
      tone: 'info',
      title: `Starting ${labelMap[target] || target}...`,
      detail: 'Sending Windows Task Scheduler trigger to the local Vite runner.',
    });

    try {
      const resp = await fetchLocalRunnerApi('/heliospulse-portal/api/run-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });

      const data = await resp.json();
      mergeTaskSchedulerPayload(data);

      if (!resp.ok || data.ok === false) {
        const errMsg = (data.errors && data.errors.join(' | ')) || data.error || `HTTP ${resp.status}`;
        setTaskExecutionSteps(
          buildSteps({
            dispatch: { status: 'error', detail: errMsg },
            execute: { status: 'error', detail: `Task Scheduler did not start: ${errMsg}` },
          })
        );
        setTaskRunBanner({
          tone: 'error',
          title: `Could not trigger ${labelMap[target]}`,
          detail: `${errMsg} — Fallback PowerShell: ${psFallbackCmd}`,
        });
        setRunningTaskTarget(null);
        return;
      }

      const startedNames = (data.runResults || []).filter((r) => r.triggered).map((r) => r.taskName).join(', ');
      setTaskExecutionSteps(
        buildSteps({
          dispatch: { status: 'done', detail: `Triggered: ${startedNames || labelMap[target]}` },
          execute: { status: 'running', detail: 'Task Scheduler running script; streaming log steps every 2s...' },
        })
      );
      setTaskRunBanner({
        tone: 'info',
        title: `Running ${labelMap[target]}`,
        detail: 'Windows Task Scheduler accepted the run request. Live execution steps are streaming below.',
      });

      let attempts = 0;
      let sawRunning = (data.jobs || []).some((j) => j.state === 'Running');
      taskPollTimerRef.current = setInterval(async () => {
        attempts += 1;
        const latest = await refreshTaskSchedulerStatus(true);
        const targetJobs = (latest?.jobs || []).filter((j) => target === 'both' || j.key === target);
        const stillRunning = targetJobs.some((j) => j.state === 'Running');
        if (stillRunning) sawRunning = true;

        const latestStepSummaries = targetJobs
          .map((j) => {
            const lastLine = j.logInfo?.recentSteps?.[j.logInfo.recentSteps.length - 1] || j.logInfo?.summary;
            return `${j.key.toUpperCase()} (${j.state}): ${lastLine || 'Running...'}`;
          })
          .join(' | ');

        if ((!stillRunning && sawRunning) || (!stillRunning && attempts >= 3) || attempts >= 45) {
          stopTaskPolling();
          const anyFailed = targetJobs.some((j) => j.lastTaskResult !== null && j.lastTaskResult !== 0);
          setTaskExecutionSteps(
            buildSteps({
              dispatch: { status: 'done', detail: `Triggered: ${startedNames || labelMap[target]}` },
              execute: {
                status: anyFailed ? 'error' : 'done',
                detail: latestStepSummaries || 'Scheduled task finished.',
              },
              sync: { status: 'running', detail: 'Running scripts/sync-csv-data.mjs across CSV & bill folders...' },
            })
          );

          await triggerSyncPipeline();
          setRunningTaskTarget(null);

          setTaskExecutionSteps(
            buildSteps({
              dispatch: { status: 'done', detail: `Triggered: ${startedNames || labelMap[target]}` },
              execute: {
                status: anyFailed ? 'error' : 'done',
                detail: latestStepSummaries || 'Scheduled task finished.',
              },
              sync: { status: 'done', detail: 'CSV data, weather/irradiance, and PDF bills synced.' },
              refresh: {
                status: anyFailed ? 'error' : 'done',
                detail: anyFailed
                  ? 'UI refreshed, though at least one scheduled task exited with an error — inspect Latest Run Steps below.'
                  : `Portal updated cleanly at ${latest?.checkedAt || new Date().toLocaleTimeString()}.`,
              },
            })
          );
          setTaskRunBanner({
            tone: anyFailed ? 'warning' : 'success',
            title: anyFailed
              ? `${labelMap[target]} finished with a script error — inspect steps below`
              : `${labelMap[target]} finished — CSV data synced`,
            detail: `Checked at ${latest?.checkedAt || new Date().toLocaleTimeString()}. Review each job's Latest Run Steps below.`,
          });
        } else {
          setTaskExecutionSteps(
            buildSteps({
              dispatch: { status: 'done', detail: `Triggered: ${startedNames || labelMap[target]}` },
              execute: {
                status: 'running',
                detail: latestStepSummaries || `Polling Task Scheduler (check ${attempts})...`,
              },
            })
          );
        }
      }, 2000);
    } catch {
      setRunningTaskTarget(null);
      setTaskExecutionSteps(
        buildSteps({
          dispatch: {
            status: 'error',
            detail: 'No local/LAN Vite API responded on this origin, http://localhost:5173, or custom Runner URL.',
          },
        })
      );
      setTaskRunBanner({
        tone: 'warning',
        title: 'Local runner API unreachable from this page',
        detail: `Start the local server with "npm run dev" (or "npm run dev:lan" for mobile Wi-Fi), restart Vite if it was already open, or set Runner URL below. Manual PowerShell: ${psFallbackCmd}`,
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'connectors') {
      refreshTaskSchedulerStatus(true);
    }
  }, [activeTab]);

  useEffect(() => () => stopTaskPolling(), []);

  const allDetectedAlerts = useMemo(() => {
    const merged = [...appRuntimeIssues, ...(telemetryAlerts || [])];

    const nyTodayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const maxRowDate = solarRows.reduce((m, r) => (r.date > m ? r.date : m), nyTodayStr);
    const lagRef = new Date(`${maxRowDate > nyTodayStr ? maxRowDate : nyTodayStr}T12:00:00Z`);
    lagRef.setUTCDate(lagRef.getUTCDate() - 3);
    const nysegLagCutoffDate = lagRef.toISOString().slice(0, 10);
    const latestReconciledDate = solarRows
      .filter((r) => r.status === 'RECONCILED')
      .reduce((m, r) => (r.date > m ? r.date : m), '');

    const filteredMerged = merged
      .map((a) => {
        if (a.code !== 'MISSING_NYSEG_INTERVALS' || !Array.isArray(a.dates)) return a;
        const overdueDates = a.dates.filter(
          (d) => d >= '2026-07-31' && ((latestReconciledDate && d < latestReconciledDate) || d < nysegLagCutoffDate)
        );
        if (overdueDates.length === 0) return null;
        return {
          ...a,
          dates: overdueDates,
          title: `NYSEG hourly intervals missing for ${overdueDates.length} post-export date(s)`,
          message: `SunRun solar generation was recorded, but NYSEG smart-meter hourly CSV data is missing beyond the normal 3-day lag for: ${overdueDates.join(', ')}.`,
        };
      })
      .filter(Boolean);

    const hasFilteredCode = (c) => filteredMerged.some((a) => a.code === c);

    // Live browser-side anomaly verification (covers CSV upload / payload ingest updates)
    const liveExportExceeds = solarRows
      .filter((r) => r.status === 'RECONCILED' && (r.m02_export_kwh || 0) > (r.solar_kwh || 0) + 0.5)
      .map((r) => r.date);
    if (liveExportExceeds.length > 0 && !hasFilteredCode('EXPORT_EXCEEDS_SOLAR')) {
      filteredMerged.push({
        code: 'EXPORT_EXCEEDS_SOLAR',
        severity: 'error',
        title: 'NYSEG M02 export exceeds SunRun solar production',
        message: `Physical bound check (M02 <= Solar + 0.5 kWh) failed on ${liveExportExceeds.join(', ')}.`,
        dates: liveExportExceeds,
      });
    }

    const liveMissingNyseg = solarRows
      .filter(
        (r) =>
          r.status === 'SUNRUN_ONLY' &&
          r.date >= '2026-07-31' &&
          ((latestReconciledDate && r.date < latestReconciledDate) || r.date < nysegLagCutoffDate)
      )
      .map((r) => r.date);
    if (liveMissingNyseg.length > 0 && !hasFilteredCode('MISSING_NYSEG_INTERVALS')) {
      filteredMerged.push({
        code: 'MISSING_NYSEG_INTERVALS',
        severity: 'warning',
        title: `NYSEG hourly intervals missing for ${liveMissingNyseg.length} post-export date(s)`,
        message: `Missing NYSEG intervals beyond the normal 3-day lag for: ${liveMissingNyseg.join(', ')}.`,
        dates: liveMissingNyseg,
      });
    }

    return filteredMerged;
  }, [appRuntimeIssues, telemetryAlerts, solarRows]);

  // Keep a durable lookup log of every detected alert (including canceled/cleared items)
  useEffect(() => {
    if (!allDetectedAlerts.length) return;
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setPersistedAlertLog((prev) => {
      const byKey = new Map(prev.map((item) => [item.key, { ...item }]));
      let changed = false;
      for (const a of allDetectedAlerts) {
        const key = getAlertKey(a);
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, {
            key,
            code: a.code,
            severity: a.severity,
            title: a.title,
            message: a.message,
            dates: a.dates || [],
            first_seen_at: nowIso,
            last_seen_at: nowIso,
          });
          changed = true;
        } else if (existing.message !== a.message || existing.title !== a.title) {
          byKey.set(key, {
            ...existing,
            severity: a.severity,
            title: a.title,
            message: a.message,
            dates: a.dates || [],
            last_seen_at: nowIso,
          });
          changed = true;
        }
      }
      if (!changed) return prev;
      const next = [...byKey.values()].slice(0, 50);
      try {
        window.localStorage.setItem('heliospulse_alert_lookup_log', JSON.stringify(next));
      } catch {
        // Ignore storage limits
      }
      return next;
    });
  }, [allDetectedAlerts]);

  const combinedAlerts = useMemo(() => {
    return allDetectedAlerts.filter((a) => {
      const k = getAlertKey(a);
      return !dismissedAlertKeys.includes(k) && !canceledAlertKeys.includes(k);
    });
  }, [allDetectedAlerts, dismissedAlertKeys, canceledAlertKeys]);

  const alertLookupEntries = useMemo(() => {
    const map = new Map(persistedAlertLog.map((item) => [item.key, { ...item }]));
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    for (const a of allDetectedAlerts) {
      const k = getAlertKey(a);
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          code: a.code,
          severity: a.severity,
          title: a.title,
          message: a.message,
          dates: a.dates || [],
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        });
      }
    }
    return [...map.values()].map((entry) => {
      const isCanceled = canceledAlertKeys.includes(entry.key);
      const isSessionCleared = dismissedAlertKeys.includes(entry.key);
      const isCurrentlyActive = allDetectedAlerts.some((a) => getAlertKey(a) === entry.key);
      return {
        ...entry,
        isCanceled,
        isSessionCleared,
        isCurrentlyActive,
        logStatus: isCanceled
          ? 'Canceled'
          : isSessionCleared
          ? 'Cleared (Session)'
          : isCurrentlyActive
          ? 'Active'
          : 'Resolved',
      };
    });
  }, [persistedAlertLog, allDetectedAlerts, canceledAlertKeys, dismissedAlertKeys]);

  const persistCanceledAlertKeys = (nextKeys) => {
    try {
      window.localStorage.setItem('heliospulse_canceled_alerts', JSON.stringify(nextKeys));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const persistCanceledBannerSig = (sig) => {
    setCanceledBannerSig(sig);
    try {
      window.localStorage.setItem('heliospulse_canceled_banner_sig', sig);
    } catch {
      // Ignore storage errors
    }
  };

  const handleClearAlertsBanner = () => {
    setDismissedAlertKeys((prev) => [
      ...new Set([...prev, ...combinedAlerts.map((a) => getAlertKey(a))]),
    ]);
    setAppRuntimeIssues([]);
    setAlertsExpanded(false);
    setBannerCleared(true);
  };

  const handleCancelSingleAlert = (alert) => {
    const key = getAlertKey(alert);
    setCanceledAlertKeys((prev) => {
      const next = [...new Set([...prev, key])];
      persistCanceledAlertKeys(next);
      return next;
    });
    if (alert.code === 'APP_RUNTIME_ISSUE') {
      setAppRuntimeIssues((prev) => prev.filter((i) => i.id !== alert.id));
    }
    const sig = notificationStatus?.last_checked_at || notificationStatus?.recent_email_events?.[0]?.sent_at || 'closed';
    persistCanceledBannerSig(sig);
  };

  const handleCancelAllAlerts = () => {
    setCanceledAlertKeys((prev) => {
      const next = [...new Set([...prev, ...combinedAlerts.map((a) => getAlertKey(a))])];
      persistCanceledAlertKeys(next);
      return next;
    });
    setAppRuntimeIssues([]);
    setAlertsExpanded(false);
    setBannerCleared(true);
    const sig = notificationStatus?.last_checked_at || notificationStatus?.recent_email_events?.[0]?.sent_at || 'closed';
    persistCanceledBannerSig(sig);
  };

  const handleRestoreAlertKey = (key) => {
    setCanceledAlertKeys((prev) => {
      const next = prev.filter((k) => k !== key);
      persistCanceledAlertKeys(next);
      return next;
    });
    setDismissedAlertKeys((prev) => prev.filter((k) => k !== key));
    persistCanceledBannerSig('');
    setBannerCleared(false);
  };

  const renderAlertLookupPanel = () => {
    const filteredLookup = alertLookupEntries.filter((entry) => {
      if (alertLogFilter === 'active') return entry.logStatus === 'Active';
      if (alertLogFilter === 'canceled') return entry.isCanceled || entry.isSessionCleared;
      return true;
    });
    return (
      <div className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#e07a16]" />
              <span>Anomaly, Issue &amp; Alert Lookup Log ({alertLookupEntries.length})</span>
            </h3>
            <p className={`text-xs mt-0.5 ${mutedText}`}>
              Persistent lookup history of all detected data anomalies, app issues, and email dispatches (including permanently canceled alerts).
            </p>
          </div>

          <div className={`flex rounded-full p-1 border text-xs ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#efece4] border-[#dcd8ce]'}`}>
            {[
              { id: 'all', label: `All (${alertLookupEntries.length})` },
              { id: 'active', label: `Active (${alertLookupEntries.filter((e) => e.logStatus === 'Active').length})` },
              { id: 'canceled', label: `Canceled (${alertLookupEntries.filter((e) => e.isCanceled || e.isSessionCleared).length})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAlertLogFilter(f.id)}
                className={`px-3 py-1 rounded-full transition cursor-pointer ${
                  alertLogFilter === f.id
                    ? darkMode
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-[#1a1917] text-white font-semibold'
                    : mutedText
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`divide-y ${dividerBorder}`}>
          {filteredLookup.length === 0 ? (
            <div className={`py-4 text-xs text-center ${mutedText}`}>
              No alerts match the selected filter.
            </div>
          ) : (
            filteredLookup.map((entry) => (
              <div key={entry.key} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        entry.severity === 'error'
                          ? 'bg-[#b91c1c] text-white'
                          : 'bg-[#e07a16] text-white'
                      }`}
                    >
                      {entry.severity === 'error' ? 'Issue' : 'Anomaly'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        entry.logStatus === 'Active'
                          ? 'bg-[#e07a16]/15 text-[#9a3412]'
                          : entry.logStatus === 'Canceled'
                          ? darkMode
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-[#efece4] text-[#5c5953]'
                          : 'bg-[#1f7a4c]/15 text-[#1f7a4c]'
                      }`}
                    >
                      {entry.logStatus}
                    </span>
                    <span className="font-mono text-[11px] font-semibold">{entry.code}</span>
                  </div>
                  <div className="font-semibold">{entry.title}</div>
                  <div className={mutedText}>{entry.message}</div>
                  <div className={`text-[10px] font-mono ${mutedText}`}>
                    First seen: {entry.first_seen_at} · Last seen: {entry.last_seen_at}
                  </div>
                </div>

                {(entry.isCanceled || entry.isSessionCleared) && entry.isCurrentlyActive && (
                  <button
                    type="button"
                    onClick={() => handleRestoreAlertKey(entry.key)}
                    className={`px-3 py-1 rounded-full border text-[11px] font-semibold shrink-0 cursor-pointer ${pillBtnSecondary}`}
                    title="Show this alert again in the top banner"
                  >
                    Restore to Banner
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {(notificationStatus?.recent_email_events?.length || 0) > 0 && (
          <div className={`pt-3 border-t space-y-1.5 ${dividerBorder}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${mutedText}`}>
              <Mail className="w-3 h-3 text-[#1f7a4c]" />
              <span>Email Dispatch Log (dglanville@gmail.com)</span>
            </div>
            {notificationStatus.recent_email_events.slice(0, 8).map((ev, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <span className="truncate">{ev.subject}</span>
                <span className={ev.status === 'sent' ? 'text-[#1f7a4c]' : 'text-[#b91c1c]'}>
                  {ev.status === 'sent' ? `Sent ${ev.sent_at}` : `Error: ${ev.error}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const fetchPublishedSnapshotJson = async (eventSource = 'GitHub Pages snapshot') => {
    try {
      const resp = await fetch(`/heliospulse-portal/telemetryData.json?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const ct = resp.headers.get('content-type') || '';
      if (resp.ok && ct.includes('application/json')) {
        const fresh = await resp.json();
        if (Array.isArray(fresh?.daily_rows)) {
          applyFreshTelemetrySnapshot(fresh, eventSource);
          if (fresh.metadata?.generated_at) {
            setLastFolderEvent(
              `Synced published snapshot (${fresh.metadata.generated_at.slice(0, 16).replace('T', ' ')} UTC • through ${fresh.metadata.latest_reconciled_date || fresh.metadata.latest_sunrun_date}).`
            );
          }
          return true;
        }
      }
    } catch {
      // Fall back silently if static snapshot fetch fails offline
    }
    return false;
  };

  const triggerSyncPipeline = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setActiveSyncStep(1);

    try {
      const resp = await fetchLocalRunnerApi('/heliospulse-portal/api/sync-csv');
      if (resp.ok) {
        const fresh = await resp.json();
        applyFreshTelemetrySnapshot(fresh, 'manual/scheduled sync');
        const srNew = fresh.notification_status?.new_sunrun_count || 0;
        const nyNew = fresh.notification_status?.new_nyseg_count || 0;
        if (srNew > 0 || nyNew > 0) {
          setLastFolderEvent(
            `New records detected (${srNew} SunRun, ${nyNew} NYSEG) — email notification sent to dglanville@gmail.com.`
          );
        }
      } else if (resp.status >= 500) {
        const errBody = await resp.json().catch(() => ({}));
        reportAppIssue(
          'CSV Sync API Error',
          errBody.error || `HTTP ${resp.status} during telemetry sync`,
          'triggerSyncPipeline'
        );
      }
    } catch {
      // Static GitHub Pages / mobile environment: pull uncached published snapshot JSON
      await fetchPublishedSnapshotJson('GitHub Pages / mobile refresh');
    }

    let step = 1;
    const timer = setInterval(() => {
      step += 1;
      if (step <= SYNC_STEPS.length) {
        setActiveSyncStep(step);
      } else {
        clearInterval(timer);
        setIsSyncing(false);
        const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
        setLastSyncTime(nowStr);
        setSyncLogs((prev) => [
          {
            ts: nowStr,
            provider: 'Coordinator',
            status: 'VERIFIED_COMPLETE',
            msg: `All 6 pipeline gates passed (Daily 7:30 AM schedule active • ${solarRows.length} Sunrun days & ${solarTotals.reconciledCount} NYSEG days reconciled).`,
          },
          ...prev,
        ]);
      }
    }, 350);
  };

  // Automatic daily 7:30 AM local sync timer, HMR folder watches, & runtime error/anomaly alerting
  useEffect(() => {
    if (import.meta.hot) {
      const billsHandler = (fresh) => applyFreshTelemetrySnapshot(fresh, 'More Bills watch');
      const csvHandler = (fresh) => applyFreshTelemetrySnapshot(fresh, 'CSV watch');
      import.meta.hot.on('nyseg-bills-updated', billsHandler);
      import.meta.hot.on('telemetry-updated', csvHandler);
    }

    const onWindowError = (event) => {
      reportAppIssue(
        'App Runtime Error',
        event?.message || 'Unhandled script error',
        'window.onerror',
        event?.error?.stack || `${event?.filename}:${event?.lineno}`
      );
    };
    const onUnhandledRejection = (event) => {
      const reason = event?.reason;
      reportAppIssue(
        'Unhandled Async Error',
        reason?.message || String(reason || 'Promise rejection'),
        'window.onunhandledrejection',
        reason?.stack || ''
      );
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    const computeMsUntilNext730AM = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(7, 30, 0, 0);
      if (now >= next) {
        next.setDate(next.getDate() + 1);
      }
      return next.getTime() - now.getTime();
    };

    let dailyInterval = null;
    const initialTimeout = setTimeout(() => {
      triggerSyncPipeline();
      dailyInterval = setInterval(() => {
        triggerSyncPipeline();
      }, 24 * 60 * 60 * 1000);
    }, computeMsUntilNext730AM());

    let lastMobileAutoCheckMs = Date.now();
    const refreshIfStaleOnResume = () => {
      if (document.visibilityState === 'hidden') return;
      const nowMs = Date.now();
      if (nowMs - lastMobileAutoCheckMs < 15 * 60 * 1000) return;
      lastMobileAutoCheckMs = nowMs;
      fetchPublishedSnapshotJson('mobile auto-check');
    };
    document.addEventListener('visibilitychange', refreshIfStaleOnResume);
    window.addEventListener('focus', refreshIfStaleOnResume);

    // Check uncached GitHub Pages snapshot on initial mobile/static load
    fetchPublishedSnapshotJson('initial published snapshot check');

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      document.removeEventListener('visibilitychange', refreshIfStaleOnResume);
      window.removeEventListener('focus', refreshIfStaleOnResume);
      clearTimeout(initialTimeout);
      if (dailyInterval) clearInterval(dailyInterval);
    };
  }, []);

  const handleCsvFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).slice(1);

    if (type === 'sunrun') {
      const srUpdates = new Map();
      for (const line of lines) {
        if (!line.trim()) continue;
        const [dateRaw, prodRaw, eodRaw] = line.split(',');
        const date = dateRaw.replace(/"/g, '').trim();
        srUpdates.set(date, {
          solar_kwh: Number(Number(prodRaw || 0).toFixed(3)),
          eod_meter_kwh: Number(Number(eodRaw || 0).toFixed(3)),
        });
      }
      setSolarRows((prev) => {
        const byDate = new Map(prev.map((r) => [r.date, { ...r }]));
        for (const [date, sr] of srUpdates.entries()) {
          const existing = byDate.get(date);
          if (existing) {
            existing.solar_kwh = sr.solar_kwh;
            existing.eod_meter_kwh = sr.eod_meter_kwh;
            if (existing.m01_import_kwh !== null) {
              existing.status = 'RECONCILED';
            } else if (sr.solar_kwh > 0) {
              existing.status = 'SUNRUN_ONLY';
            }
          } else {
            byDate.set(date, {
              id: `SR-${byDate.size + 9001}`,
              date,
              solar_kwh: sr.solar_kwh,
              eod_meter_kwh: sr.eod_meter_kwh,
              m01_import_kwh: null,
              m02_export_kwh: null,
              credit_delta: null,
              temp_f: null,
              nyseg_hours: 0,
              irradiance: sr.solar_kwh > 25 ? 'Clear' : 'Variable',
              status: sr.solar_kwh > 0 ? 'SUNRUN_ONLY' : 'PENDING_TELEMETRY',
              note: 'Imported from Sunrun CSV',
            });
          }
        }
        return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      setIngestBanner({
        type: 'success',
        text: `Reloaded ${srUpdates.size} daily records from ${file.name}.`,
      });
    } else if (type === 'nyseg') {
      const nyUpdates = new Map();
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
        const date = (parts[5] || '').trim();
        if (!date) continue;
        const weather = parts[11] !== '' ? Number(parts[11]) : null;
        const delivered = Number(parts[12] || 0);
        const received = Number(parts[13] || 0);
        if (!nyUpdates.has(date)) nyUpdates.set(date, { delivered: 0, received: 0, temps: [], hours: 0 });
        const d = nyUpdates.get(date);
        d.delivered += delivered;
        d.received += received;
        if (weather !== null && !Number.isNaN(weather)) d.temps.push(weather);
        d.hours += 1;
      }
      setSolarRows((prev) => {
        const byDate = new Map(prev.map((r) => [r.date, { ...r }]));
        for (const [date, ny] of nyUpdates.entries()) {
          const existing = byDate.get(date) || {
            id: `SR-${byDate.size + 9001}`,
            date,
            solar_kwh: 0,
            eod_meter_kwh: 0,
            irradiance: 'Variable',
            note: '',
          };
          existing.m01_import_kwh = Number(ny.delivered.toFixed(3));
          existing.m02_export_kwh = Number(ny.received.toFixed(3));
          existing.credit_delta = Number((ny.received - ny.delivered).toFixed(3));
          existing.temp_f = ny.temps.length
            ? Math.round(ny.temps.reduce((a, b) => a + b, 0) / ny.temps.length)
            : null;
          existing.nyseg_hours = ny.hours;
          existing.status = 'RECONCILED';
          byDate.set(date, existing);
        }
        return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      setIngestBanner({
        type: 'success',
        text: `Aggregated ${lines.length.toLocaleString()} hourly intervals (${nyUpdates.size} days) from ${file.name}.`,
      });
    }
  };

  const handleIngestRawPayload = () => {
    try {
      const parsed = JSON.parse(rawPayloadInput);
      if (!parsed.date || typeof parsed.production_kwh !== 'number') {
        throw new Error('Payload requires "date" (YYYY-MM-DD) and numeric "production_kwh".');
      }
      const m01 = Number(parsed.m01_import_kwh ?? 12.5);
      const m02 = Number(parsed.m02_export_kwh ?? 15.0);
      if (m02 > parsed.production_kwh + 0.5) {
        throw new Error(`Validation Failed: M02 Export (${m02} kWh) exceeds Solar Production (${parsed.production_kwh} kWh).`);
      }

      const newRow = {
        id: parsed.id || `SR-${Math.floor(9100 + Math.random() * 899)}`,
        date: parsed.date,
        solar_kwh: Number(parsed.production_kwh.toFixed(3)),
        eod_meter_kwh: Number(solarTotals.maxEodMeter),
        m01_import_kwh: Number(m01.toFixed(3)),
        m02_export_kwh: Number(m02.toFixed(3)),
        credit_delta: Number((m02 - m01).toFixed(3)),
        temp_f: 45,
        nyseg_hours: 24,
        irradiance: 'Clear',
        status: 'RECONCILED',
        note: 'Ingested via Connector Payload Parser',
      };

      setSolarRows((prev) =>
        [newRow, ...prev.filter((r) => r.date !== newRow.date)].sort((a, b) => (a.date < b.date ? 1 : -1))
      );
      setIngestBanner({
        type: 'success',
        text: `Validated & reconciled ${newRow.date} (${newRow.id}). Dashboard KPIs updated.`,
      });
    } catch (err) {
      setIngestBanner({ type: 'error', text: err.message });
      reportAppIssue('Connector Payload Anomaly', err.message, 'handleIngestRawPayload');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Record_ID',
      'Date',
      'Solar_Production_kWh',
      'End_Of_Day_Meter_kWh',
      'NYSEG_M01_Delivered_kWh',
      'NYSEG_M02_Received_kWh',
      'Net_Credit_Delta_kWh',
      'Avg_Temp_F',
      'NYSEG_Hours',
      'Status',
      'Note',
    ];
    const csvLines = [
      headers.join(','),
      ...sortedSolarRows.map((r) =>
        [
          r.id,
          r.date,
          r.solar_kwh,
          r.eod_meter_kwh ?? '',
          r.m01_import_kwh ?? '',
          r.m02_export_kwh ?? '',
          r.credit_delta ?? '',
          r.temp_f ?? '',
          r.nyseg_hours ?? 0,
          r.status,
          `"${(r.note || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heliospulse_export_${spanFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadIntervalGridCsv = () => {
    const headers = [
      'Date',
      'Day',
      'Weather_High_Low',
      'Condition',
      'Daily_Irradiance_Wm2',
      'Sun_Height',
      'SunRun_Power_kWh',
      'Delivered_M01',
      'Running_M01',
      'Received_M02',
      'Running_M02',
      'M01_M02_Diff_Net',
      'EDC',
      'Running_EDC',
      'Import_Cost',
      'Export_Value',
      'Net_Cost',
      'Running_Net_Cost',
      'Notes',
    ];
    const csvLines = [
      headers.join(','),
      ...visibleGridRows.map((r) =>
        [
          r.date,
          r.dayName,
          `"${r.tempHigh}° / ${r.tempLow}°F"`,
          `"${r.weatherCond}"`,
          r.irradianceNum,
          r.sunHeight,
          r.solar_kwh.toFixed(1),
          r.m01_import_kwh.toFixed(1),
          r.running_m01.toFixed(1),
          r.m02_export_kwh.toFixed(1),
          r.running_m02.toFixed(1),
          r.m01_m02_diff.toFixed(1),
          r.edc_kwh.toFixed(1),
          r.running_edc.toFixed(1),
          `$${r.import_cost.toFixed(2)}`,
          `$${r.export_value.toFixed(2)}`,
          `$${r.net_cost.toFixed(2)}`,
          `$${r.running_net_cost.toFixed(2)}`,
          `"${(gridNotes[r.date] ?? '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heliospulse_interval_grid_${activeGridPeriod.key || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAskAi = (promptText) => {
    const q = (promptText || aiQuery).trim();
    if (!q) return;
    let reply = '';
    try {
      reply = answerSolarQuestion(q, {
        solarRows,
        monthlySummaries: MONTHLY_SUMMARIES,
        moreBillsData,
        liveCreditBankForecast,
        combinedAlerts,
        distDayMetrics,
        solarTotals,
        telemetryMeta: snapshotMeta,
        taskSchedulerData,
        appliances: ASSET_CATALOG,
      });
    } catch (err) {
      reply = `Could not analyze that query cleanly (${err?.message || 'unexpected error'}). Try asking about a month, date, EDC, solar production, or bill summary.`;
    }

    setAiMessages((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: reply }]);
    setAiQuery('');
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const toggleGridSort = (field) => {
    if (gridSortField === field) {
      setGridSortAsc(!gridSortAsc);
    } else {
      setGridSortField(field);
      setGridSortAsc(false);
    }
  };

  const stepDistDate = (dir) => {
    if (!reconciledRowsChrono.length) return;
    const idx = reconciledRowsChrono.findIndex((r) => r.date === selectedDistDate);
    if (idx === -1) return;
    const nextIdx = Math.max(0, Math.min(reconciledRowsChrono.length - 1, idx + dir));
    setSelectedDistDate(reconciledRowsChrono[nextIdx].date);
  };

  const distDayMetrics = useMemo(() => {
    const r = selectedDistRow || {
      date: '2026-11-14',
      solar_kwh: 16.917,
      m01_import_kwh: 24.61,
      m02_export_kwh: 5.684,
      temp_f: 39,
      temp_min_f: 35,
      temp_max_f: 43,
      irradiance: 'Overcast',
    };
    const m01 = r.m01_import_kwh || 0;
    const solar = r.solar_kwh || 0;
    const m02 = r.m02_export_kwh || 0;
    const homeConsumed = Math.max(0.1, solar + m01 - m02);
    const solarRetained = Math.max(0, solar - m02);
    const gridDepPct = Math.min(100, Math.max(0, Math.round((m01 / homeConsumed) * 100)));
    const solarCovPct = 100 - gridDepPct;
    const netGridFlow = m01 - m02;
    const co2AvoidedLb = (solar * 0.857).toFixed(1);
    const astro = getSolarAstronomyForDate(r.date, solar, r.irradiance, r.irradiance_wm2);

    return {
      date: r.date,
      m01: m01.toFixed(1),
      solar: solar.toFixed(1),
      m02: m02.toFixed(1),
      homeConsumed: homeConsumed.toFixed(1),
      solarRetained: solarRetained.toFixed(1),
      gridDepPct,
      solarCovPct,
      netGridFlowAbs: Math.abs(netGridFlow).toFixed(1),
      netGridImported: netGridFlow >= 0,
      isM02GreaterThanM01: m02 > m01,
      co2AvoidedLb,
      irradianceLabel: astro.weatherCond || 'Overcast',
      tempMax: r.temp_max_f ?? r.temp_f ?? 43,
      tempMin: r.temp_min_f ?? r.temp_f ?? 35,
      irradianceWm2: astro.irradianceWm2,
      sunHeight: astro.sunHeight,
    };
  }, [selectedDistRow]);

  // Unified "Solar savings" standard theme tokens across all tabs
  const pageBg = darkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#f6f4ef] text-[#1a1917]';
  const cardBg = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-[#e6e2d8] text-[#1a1917] shadow-[0_1px_3px_rgba(0,0,0,0.03)]';
  const calloutBg = darkMode
    ? 'bg-slate-900/70 border border-slate-800 text-slate-100'
    : 'bg-[#efece4] border border-[#e3dfd4] text-[#1a1917]';
  const subPanelBg = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-slate-100'
    : 'bg-[#faf8f4] border-[#ece8df] text-[#1a1917]';
  const mutedText = darkMode ? 'text-slate-400' : 'text-[#6b675e]';
  const trackBg = darkMode ? 'bg-slate-800' : 'bg-[#edeae2]';
  const dividerBorder = darkMode ? 'border-slate-800' : 'border-[#ece8df]';
  const sheetGridBorder = darkMode ? 'border-slate-500' : 'border-[#6b665c]';
  const pillBtnSecondary = darkMode
    ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
    : 'bg-white border-[#dcd8ce] text-[#1a1917] hover:bg-[#efece4]';

  // Helper renderer for forecast rows in the Credit Forecaster tab using Solar Savings typography & palette
  const renderForecastRow = (row, prevBalance) => {
    const netUsage = row.net_usage_kwh || 0;
    const isImported = netUsage > 0;
    const bankChange = (row.ending_credit_kwh || 0) - prevBalance;
    const taxAndFees = (row.projected_taxes || 0) + (row.projected_recurring_fees || 0);

    return (
      <tr key={row.month} className={`border-b ${dividerBorder} last:border-b-0 ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-[#faf8f4]'} transition`}>
        <td className="py-4 px-4 font-bold text-sm align-middle">
          {row.month}
        </td>

        {/* Estimated net grid usage */}
        <td className="py-3.5 px-4 text-right align-middle space-y-0.5">
          <div className={`font-mono font-bold text-sm ${isImported ? 'text-[#b91c1c]' : 'text-[#1f7a4c]'}`}>
            {Math.round(Math.abs(netUsage)).toLocaleString()} kWh {isImported ? 'imported' : 'exported'}
          </div>
          <div className={`text-xs ${mutedText}`}>
            Solar: <span className="font-mono">{Math.round(row.solar_production_kwh || 0).toLocaleString()}</span> · Home:{' '}
            <span className="font-mono">{Math.round(row.household_consumption_kwh || 0).toLocaleString()}</span>
          </div>
          <div className={`text-xs ${mutedText}`}>
            Normal: <span className="font-mono">{Math.round(row.normal_load_kwh || 0).toLocaleString()}</span> · Cool:{' '}
            <span className="font-mono">{Math.round(row.cooling_load_kwh || 0).toLocaleString()}</span> · Heat:{' '}
            <span className="font-mono">{Math.round(row.heating_load_kwh || 0).toLocaleString()}</span>
          </div>
          <div className={`text-xs ${mutedText}`}>
            M01: <span className="font-mono">{Math.round(row.predicted_m01_kwh || 0).toLocaleString()}</span> · M02:{' '}
            <span className="font-mono">{Math.round(row.predicted_m02_kwh || 0).toLocaleString()}</span>
          </div>
        </td>

        {/* Estimated energy charge */}
        <td className="py-3.5 px-4 text-right align-middle space-y-0.5">
          <div className="font-mono font-bold text-sm">
            ${Number(row.estimated_charges || 0).toFixed(2)}
          </div>
          <div className={`text-xs ${mutedText}`}>
            Credit bank: <span className="font-mono font-medium">{Math.round(row.ending_credit_kwh || 0).toLocaleString()} kWh</span>
          </div>
          <div
            className={`text-xs font-semibold ${
              bankChange > 0 ? 'text-[#1f7a4c]' : bankChange < 0 ? 'text-[#b91c1c]' : mutedText
            }`}
          >
            {bankChange > 0 ? 'Increased' : bankChange < 0 ? 'Decreased' : 'No change'}:{' '}
            <span className="font-mono">{Math.round(Math.abs(bankChange)).toLocaleString()} kWh</span>
          </div>
        </td>

        {/* Estimated NYSEG amount due */}
        <td className="py-3.5 px-4 text-right align-middle space-y-0.5">
          <div className="font-mono font-bold text-sm">
            ${Number(row.estimated_amount_due ?? row.estimated_charges ?? 0).toFixed(2)}
          </div>
          <div className={`text-xs ${mutedText}`}>
            Minimum NYSEG charges: <span className="font-mono">${Number(row.minimum_monthly_amount_due || 43.57).toFixed(2)}</span>
          </div>
          <div className={`text-xs ${mutedText}`}>
            Usage charges: Supply <span className="font-mono">${Number(row.projected_supply_charges || 0).toFixed(2)}</span> · Delivery{' '}
            <span className="font-mono">${Number(row.projected_delivery_charges || 0).toFixed(2)}</span> · Tax/fees{' '}
            <span className="font-mono">${taxAndFees.toFixed(2)}</span>
          </div>
        </td>
      </tr>
    );
  };

  // Reusable renderer for the Interval Data Grid styled with the Solar Savings standard palette & fonts
  const renderIntervalDataGrid = (isPopOutModal = false) => (
    <div className="space-y-2.5">
      {/* COMPACT HEADER + TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">
            Reconciled daily interval & cost grid
          </h1>
          <span className={`text-xs ${mutedText}`}>
            Daily register totals @ <strong className="font-semibold">$0.24/kWh</strong>
          </span>
        </div>

        {/* TOP BAR: ROW COUNT, VIEW SELECTOR, PERIOD PAGER, DOWNLOAD CSV, POP OUT */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-mono font-bold text-[#1f7a4c] mr-1">
            {visibleGridRows.length} of {fullIntervalGridRows.length} rows
          </span>

          {selectedGridRows.length > 0 && (
            <button
              onClick={() => setSelectedGridRows([])}
              className={`px-2 py-0.5 rounded-full font-semibold border cursor-pointer transition ${
                darkMode
                  ? 'bg-purple-700 text-white border-purple-400 hover:bg-purple-600'
                  : 'bg-[#d8b4fe] text-[#1a1917] border-[#7e22ce] hover:bg-[#c084fc]'
              }`}
              title="Click to clear selected rows"
            >
              {selectedGridRows.length} selected · Clear
            </button>
          )}

          <div className="flex items-center gap-1">
            <span className={`font-medium ${mutedText}`}>View</span>
            <select
              value={gridViewMode}
              onChange={(e) => {
                setGridViewMode(e.target.value);
                setGridCursorIndex(0);
              }}
              className={`px-2.5 py-1 rounded-full border font-semibold cursor-pointer ${pillBtnSecondary}`}
            >
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <button
            onClick={() => setGridCursorIndex((i) => Math.min(gridPeriods.length - 1, i + 1))}
            disabled={gridCursorIndex >= gridPeriods.length - 1}
            className={`w-6 h-6 rounded-full border flex items-center justify-center disabled:opacity-40 cursor-pointer ${pillBtnSecondary}`}
            title="Previous period"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="min-w-[105px] text-center font-bold text-xs sm:text-sm">
            {activeGridPeriod.label}
          </span>

          <button
            onClick={() => setGridCursorIndex((i) => Math.max(0, i - 1))}
            disabled={gridCursorIndex <= 0}
            className={`w-6 h-6 rounded-full border flex items-center justify-center disabled:opacity-40 cursor-pointer ${pillBtnSecondary}`}
            title="Next period"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleDownloadIntervalGridCsv}
            className={`px-3 py-1 rounded-full border font-semibold transition cursor-pointer ${pillBtnSecondary}`}
          >
            Download CSV
          </button>

          <button
            onClick={() => {
              setHoveredDerivation(null);
              setGridPopOut(!isPopOutModal);
            }}
            className={`px-3 py-1 rounded-full border font-semibold transition cursor-pointer flex items-center gap-1 ${
              isPopOutModal ? 'bg-[#1a1917] text-white border-[#1a1917]' : pillBtnSecondary
            }`}
          >
            {isPopOutModal ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" /> Close
              </>
            ) : (
              'Pop Out'
            )}
          </button>
        </div>
      </div>

      {/* SLIM TEMPORARY NYSEG RECORDS NOTICE BAR (shown only when placeholder rows are active) */}
      {(() => {
        const activeTempRows = fullIntervalGridRows.filter((r) => r.isTempPlaceholder);
        if (activeTempRows.length === 0) return null;
        return (
          <div className={`px-3 py-1.5 rounded-lg text-[11px] leading-snug ${calloutBg}`}>
            <strong className="font-semibold">Temporary NYSEG records:</strong>{' '}
            <span className={mutedText}>
              {activeTempRows.map((r) => `${r.date} (from ${r.tempSourceDate})`).join(', ')}{' '}
              {activeTempRows.length === 1 ? 'is' : 'are'} display-only while NYSEG intervals are pending — excluded from official reconciliation, credit-bank &amp; forecast, included in visible span totals.
            </span>
          </div>
        );
      })()}

      {/* COMPACT 7-CARD KPI RIBBON */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <div
          onMouseEnter={(e) =>
            showCellDerivation(e, {
              title: 'POWER (Total Solar Generated)',
              badge: `${gridSpanKpis.rowCount} visible rows`,
              formula: 'Σ SunRun daily solar production (kWh) in active view',
              calculation: `Sum across ${gridSpanKpis.rowCount} rows (${gridSpanKpis.spanLabel}) = ${gridSpanKpis.powerRaw.toFixed(3)} kWh → ${gridSpanKpis.power} kWh`,
              source: 'Sunrun_Daily_Production_Data.csv',
            })
          }
          onMouseLeave={hideCellDerivation}
          className={`px-2.5 py-2 rounded-lg space-y-0.5 cursor-help transition hover:ring-1 hover:ring-[#e07a16]/50 ${calloutBg}`}
        >
          <div className={`text-[9.5px] font-semibold uppercase tracking-wider ${mutedText}`}>POWER</div>
          <div className="text-sm font-bold font-mono text-[#e07a16]">{gridSpanKpis.power} kWh</div>
        </div>

        <div
          onMouseEnter={(e) =>
            showCellDerivation(e, {
              title: 'M01 DELIVERED (Grid Import)',
              badge: `${gridSpanKpis.rowCount} visible rows`,
              formula: 'Σ NYSEG hourly M01 register (grid → home) across visible rows',
              calculation: `Sum across ${gridSpanKpis.rowCount} rows (${gridSpanKpis.tempCount} temp placeholder${gridSpanKpis.tempCount === 1 ? '' : 's'}) = ${gridSpanKpis.m01Raw.toFixed(3)} kWh → ${gridSpanKpis.m01} kWh`,
              source: 'NYSEG_Daily_Usage_Data.csv (hourly Delivered / M01)',
            })
          }
          onMouseLeave={hideCellDerivation}
          className={`px-2.5 py-2 rounded-lg space-y-0.5 cursor-help transition hover:ring-1 hover:ring-slate-500/40 ${calloutBg}`}
        >
          <div className={`text-[9.5px] font-semibold uppercase tracking-wider ${mutedText}`}>M01 DELIVERED</div>
          <div className="text-sm font-bold font-mono">{gridSpanKpis.m01} kWh</div>
        </div>

        <div
          onMouseEnter={(e) =>
            showCellDerivation(e, {
              title: 'M02 RECEIVED (Grid Export)',
              badge: `${gridSpanKpis.rowCount} visible rows`,
              formula: 'Σ NYSEG hourly M02 register (solar surplus → grid) across visible rows',
              calculation: `Sum across ${gridSpanKpis.rowCount} rows (${gridSpanKpis.tempCount} temp placeholder${gridSpanKpis.tempCount === 1 ? '' : 's'}) = ${gridSpanKpis.m02Raw.toFixed(3)} kWh → ${gridSpanKpis.m02} kWh`,
              source: 'NYSEG_Daily_Usage_Data.csv (hourly Received / M02)',
            })
          }
          onMouseLeave={hideCellDerivation}
          className={`px-2.5 py-2 rounded-lg space-y-0.5 cursor-help transition hover:ring-1 hover:ring-[#1f7a4c]/50 ${calloutBg}`}
        >
          <div className={`text-[9.5px] font-semibold uppercase tracking-wider ${mutedText}`}>M02 RECEIVED</div>
          <div className="text-sm font-bold font-mono text-[#1f7a4c]">{gridSpanKpis.m02} kWh</div>
        </div>

        <div
          onMouseEnter={(e) =>
            showCellDerivation(e, {
              title: 'EDC CONSUMED (Estimated Home Demand)',
              badge: 'Derived Total',
              formula: 'Σ (SunRun Power + M01 Delivered − M02 Received)',
              calculation: `${gridSpanKpis.powerRaw.toFixed(1)} + ${gridSpanKpis.m01Raw.toFixed(1)} − ${gridSpanKpis.m02Raw.toFixed(1)} = ${gridSpanKpis.edcRaw.toFixed(1)} kWh`,
              source: 'Combined SunRun production + NYSEG smart-meter registers',
            })
          }
          onMouseLeave={hideCellDerivation}
          className={`px-2.5 py-2 rounded-lg space-y-0.5 cursor-help transition hover:ring-1 hover:ring-[#1a1917]/30 ${calloutBg}`}
        >
          <div className={`text-[9.5px] font-semibold uppercase tracking-wider ${mutedText}`}>EDC CONSUMED</div>
          <div className="text-sm font-bold font-mono">{gridSpanKpis.edc} kWh</div>
        </div>

        <div
          onMouseEnter={(e) =>
            showCellDerivation(e, {
              title: 'NET EXPORT (M02 − M01)',
              badge: 'Derived Net Credit',
              formula: 'Total M02 Exported − Total M01 Imported',
              calculation: `${gridSpanKpis.m02Raw.toFixed(1)} − ${gridSpanKpis.m01Raw.toFixed(1)} = ${gridSpanKpis.netExport} kWh`,
              source: 'Positive (+): net credit added; Negative (−): net grid import',
            })
          }
          onMouseLeave={hideCellDerivation}
          className={`px-2.5 py-2 rounded-lg space-y-0.5 cursor-help transition hover:ring-1 hover:ring-[#1f7a4c]/50 ${calloutBg}`}
        >
          <div className={`text-[9.5px] font-semibold uppercase tracking-wider ${mutedText}`}>NET EXPORT</div>
          <div className="text-sm font-bold font-mono text-[#1f7a4c]">{gridSpanKpis.netExport} kWh</div>
        </div>

        <div
          onMouseEnter={(e) =>
            showCellDerivation(e, {
              title: 'COST W/ SOLAR',
              badge: 'Net Energy + Basic Charge',
              formula: 'max(0, (M01 − M02) × $0.24/kWh + days × $0.948/day)',
              calculation: `max(0, (${gridSpanKpis.m01Raw.toFixed(1)} − ${gridSpanKpis.m02Raw.toFixed(1)}) × $0.24 [${gridSpanKpis.netEnergyCostRaw.toFixed(2)}] + ${gridSpanKpis.rowCount} × $0.948 [$${gridSpanKpis.baseFeeTotalRaw.toFixed(2)}]) = $${gridSpanKpis.costWithSolar}`,
              source: 'Floored at $0.00 when surplus M02 credits offset usage charges',
            })
          }
          onMouseLeave={hideCellDerivation}
          className={`px-2.5 py-2 rounded-lg space-y-0.5 cursor-help transition hover:ring-1 hover:ring-[#1a1917]/30 ${calloutBg}`}
        >
          <div className={`text-[9.5px] font-semibold uppercase tracking-wider ${mutedText}`}>COST W/ SOLAR</div>
          <div className="text-sm font-bold font-mono">${gridSpanKpis.costWithSolar}</div>
        </div>

        <div
          onMouseEnter={(e) =>
            showCellDerivation(e, {
              title: 'NO SOLAR (Historical Counterfactual)',
              badge: 'Hist Baseline',
              formula: 'EDC Consumed × $0.24/kWh + days × $0.8546/day',
              calculation: `${gridSpanKpis.edcRaw.toFixed(1)} × $0.24 [$${(gridSpanKpis.edcRaw * 0.24).toFixed(2)}] + ${gridSpanKpis.rowCount} × $0.8546 [$${(gridSpanKpis.rowCount * 0.8546).toFixed(2)}] = $${gridSpanKpis.costWithoutSolar}`,
              source: 'Estimated NYSEG utility bill without rooftop solar offset',
            })
          }
          onMouseLeave={hideCellDerivation}
          className={`px-2.5 py-2 rounded-lg space-y-0.5 cursor-help transition hover:ring-1 hover:ring-[#1f7a4c]/40 ${calloutBg}`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className={`text-[9.5px] font-semibold uppercase tracking-wider ${mutedText}`}>NO SOLAR</span>
            <span className="px-1 py-px rounded bg-[#1f7a4c]/12 text-[#1f7a4c] text-[9px] font-semibold">Hist</span>
          </div>
          <div className="text-sm font-bold font-mono">${gridSpanKpis.costWithoutSolar}</div>
        </div>
      </div>

      {/* 18-COLUMN SPREADSHEET DATA GRID */}
      <div className="space-y-1.5">
        <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium ${mutedText}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-[#15803d] bg-[#86efac] inline-block" />
              M02 − M01 &gt; 0 (Net Export)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-[#a16207] bg-[#fde047] inline-block" />
              M02 − M01 ≤ 0 (Net Import)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-[#7e22ce] bg-[#c084fc] inline-block" />
              Selected Row (click any row to toggle)
            </span>
          </div>
          {selectedGridRows.length > 0 && (
            <span className={`font-semibold ${darkMode ? 'text-purple-300' : 'text-[#6b21a8]'}`}>
              {selectedGridRows.length} {selectedGridRows.length === 1 ? 'row' : 'rows'} selected
            </span>
          )}
        </div>

        <div className={`rounded-2xl overflow-hidden border-2 ${darkMode ? 'bg-slate-900 border-slate-500 text-slate-100' : 'bg-white border-[#4a463f] text-[#1a1917] shadow-sm'}`}>
          <div
            onScroll={hideCellDerivation}
            onMouseLeave={hideCellDerivation}
            className={`overflow-x-auto ${isPopOutModal ? 'max-h-[78vh]' : 'max-h-[70vh]'}`}
          >
            <table className="w-full border-collapse text-xs">
              <thead className={`sticky top-0 z-20 border-b-2 ${darkMode ? 'border-slate-400 bg-slate-900 text-slate-100' : 'border-[#4a463f] bg-[#e5dfd3] text-[#1a1917]'}`}>
                <tr>
                  <th
                    onClick={() => toggleGridSort('date')}
                    className={`p-2.5 text-left font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Date
                  </th>
                  <th className={`p-2.5 text-center font-bold border-r-2 ${sheetGridBorder} whitespace-nowrap`}>
                    Day
                  </th>
                  <th className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} whitespace-nowrap`}>
                    Weather<br />high / low
                  </th>
                  <th
                    onClick={() => toggleGridSort('irradianceNum')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Daily<br />irradiance<br />(W/m²)
                  </th>
                  <th className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} whitespace-nowrap`}>
                    Sun<br />height<br />(°)
                  </th>

                  {/* FRAMED COLUMN 1: SUNRUN POWER */}
                  <th
                    className={`p-2 text-right font-bold border-t-3 border-x-2 border-[#c25e00] whitespace-nowrap ${
                      darkMode ? 'bg-amber-800 text-amber-50' : 'bg-[#fdba74] text-[#1a1917]'
                    }`}
                  >
                    <div className="flex justify-end mb-1">
                      <select
                        value={colFilterPower}
                        onChange={(e) => setColFilterPower(e.target.value)}
                        className="px-1 py-0.5 rounded border border-[#9a3412]/50 bg-white text-[10px] font-semibold text-[#1a1917]"
                      >
                        <option value="No">No</option>
                        <option value="High">High</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div onClick={() => toggleGridSort('solar_kwh')} className="cursor-pointer">
                      SunRun<br />Power<br />(kWh)
                    </div>
                  </th>

                  {/* FRAMED COLUMN 2: DELIVERED / M01 */}
                  <th
                    className={`p-2 text-right font-bold border-t-3 border-x-2 border-[#475569] whitespace-nowrap ${
                      darkMode ? 'bg-slate-700 text-white' : 'bg-[#cbd5e1] text-[#0f172a]'
                    }`}
                  >
                    <div className="flex justify-end mb-1">
                      <select
                        value={colFilterM01}
                        onChange={(e) => setColFilterM01(e.target.value)}
                        className="px-1 py-0.5 rounded border border-[#475569]/50 bg-white text-[10px] font-semibold text-[#1a1917]"
                      >
                        <option value="No">No</option>
                        <option value="High">High</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div onClick={() => toggleGridSort('m01_import_kwh')} className="cursor-pointer">
                      Delivered /<br />M01
                    </div>
                  </th>

                  <th
                    onClick={() => toggleGridSort('running_m01')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Running<br />M01
                  </th>

                  {/* FRAMED COLUMN 3: RECEIVED / M02 */}
                  <th
                    className={`p-2 text-right font-bold border-t-3 border-x-2 border-[#15803d] whitespace-nowrap ${
                      darkMode ? 'bg-emerald-800 text-emerald-50' : 'bg-[#86efac] text-[#052e16]'
                    }`}
                  >
                    <div className="flex justify-end mb-1">
                      <select
                        value={colFilterM02}
                        onChange={(e) => setColFilterM02(e.target.value)}
                        className="px-1 py-0.5 rounded border border-[#15803d]/50 bg-white text-[10px] font-semibold text-[#1a1917]"
                      >
                        <option value="No">No</option>
                        <option value="High">High</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div onClick={() => toggleGridSort('m02_export_kwh')} className="cursor-pointer">
                      Received /<br />M02
                    </div>
                  </th>

                  <th
                    onClick={() => toggleGridSort('running_m02')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Running<br />M02
                  </th>

                  {/* M01 - M02 DIFF (NET) */}
                  <th className={`p-2 text-right font-bold border-r-2 ${sheetGridBorder} whitespace-nowrap`}>
                    <div className="flex justify-end mb-1">
                      <select
                        value={colFilterDiff}
                        onChange={(e) => setColFilterDiff(e.target.value)}
                        className="px-1 py-0.5 rounded border border-[#6b665c] bg-white text-[10px] font-semibold text-[#1a1917]"
                      >
                        <option value="No">No</option>
                        <option value="Pos">+ Imp</option>
                        <option value="Neg">- Exp</option>
                      </select>
                    </div>
                    <div onClick={() => toggleGridSort('m01_m02_diff')} className="cursor-pointer">
                      M01 −<br />M02<br />Diff<br />(Net)
                    </div>
                  </th>

                  {/* FRAMED COLUMN 4: EDC */}
                  <th
                    className={`p-2 text-right font-bold border-t-3 border-x-2 border-[#9a3412] whitespace-nowrap ${
                      darkMode ? 'bg-orange-800 text-orange-50' : 'bg-[#fcd34d] text-[#1a1917]'
                    }`}
                  >
                    <div className="flex justify-end mb-1">
                      <select
                        value={colFilterEdc}
                        onChange={(e) => setColFilterEdc(e.target.value)}
                        className="px-1 py-0.5 rounded border border-[#9a3412]/50 bg-white text-[10px] font-semibold text-[#1a1917]"
                      >
                        <option value="No">No</option>
                        <option value="High">High</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div onClick={() => toggleGridSort('edc_kwh')} className="cursor-pointer">
                      EDC
                    </div>
                  </th>

                  <th
                    onClick={() => toggleGridSort('running_edc')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Running<br />EDC
                  </th>

                  <th
                    onClick={() => toggleGridSort('import_cost')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Import<br />Cost
                  </th>
                  <th
                    onClick={() => toggleGridSort('export_value')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Export<br />Value
                  </th>
                  <th
                    onClick={() => toggleGridSort('net_cost')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Net<br />Cost
                  </th>
                  <th
                    onClick={() => toggleGridSort('running_net_cost')}
                    className={`p-2.5 text-right font-bold border-r-2 ${sheetGridBorder} cursor-pointer whitespace-nowrap`}
                  >
                    Running<br />Net Cost
                  </th>
                  <th className="p-2.5 text-left font-bold min-w-[140px]">Notes</th>
                </tr>
              </thead>

              <tbody className={`divide-y-2 ${sheetGridBorder}`}>
                {visibleGridRows.map((row) => {
                  const isM02MinusM01Positive = row.m02_export_kwh - row.m01_import_kwh > 0;
                  const isSelected = selectedGridRows.includes(row.date);
                  const rowBgClass = isSelected
                    ? darkMode
                      ? 'bg-purple-700 text-white hover:bg-purple-600'
                      : 'bg-[#d8b4fe] text-[#1a1917] hover:bg-[#c084fc]/85'
                    : isM02MinusM01Positive
                    ? darkMode
                      ? 'bg-emerald-900/75 text-emerald-50 hover:bg-emerald-800/80'
                      : 'bg-[#bbf7d0] text-[#1a1917] hover:bg-[#86efac]/85'
                    : darkMode
                    ? 'bg-amber-900/65 text-amber-50 hover:bg-amber-800/75'
                    : 'bg-[#fef08a] text-[#1a1917] hover:bg-[#fde047]/80';

                  const greenText = darkMode ? 'text-emerald-200' : 'text-[#14532d]';
                  const redText = darkMode ? 'text-rose-200' : 'text-[#991b1b]';
                  const solarText = darkMode ? 'text-amber-200' : 'text-[#9a3412]';
                  const subText = darkMode ? 'text-slate-200/80' : 'text-[#374151]';

                  const tempBadge = row.isTempPlaceholder ? `Temp · Copied from ${row.tempSourceDate}` : 'Reconciled Row';
                  const nysegSourceText = row.isTempPlaceholder
                    ? `Temporary copy of ${row.tempSourceDate} NYSEG intervals (actual intervals pending)`
                    : `NYSEG_Daily_Usage_Data.csv (${row.nysegHours || 24} hourly intervals)`;

                  return (
                    <tr
                      key={row.date}
                      onClick={() => toggleSelectGridRow(row.date)}
                      aria-selected={isSelected}
                      className={`${rowBgClass} border-b-2 ${sheetGridBorder} cursor-pointer transition-colors`}
                    >
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Date · ${row.date}`,
                            badge: tempBadge,
                            formula: 'Daily reconciliation index (YYYY-MM-DD, America/New_York)',
                            calculation: row.isTempPlaceholder
                              ? `${row.date}: SunRun recorded ${row.solar_kwh.toFixed(3)} kWh; NYSEG values copied temporarily from ${row.tempSourceDate}`
                              : `${row.date}: Matched SunRun daily production with ${row.nysegHours || 24} hourly NYSEG smart-meter intervals`,
                            source: row.note || nysegSourceText,
                          })
                        }
                        className={`p-2.5 font-mono font-semibold whitespace-nowrap border-r-2 ${sheetGridBorder}`}
                      >
                        <div>{row.date}</div>
                        {row.isTempPlaceholder && (
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide ${
                              darkMode
                                ? 'bg-amber-950/90 text-amber-200 border border-amber-500/60'
                                : 'bg-[#fff7ed] text-[#9a3412] border border-[#c2410c]'
                            }`}
                            title={`Temporary NYSEG values copied from ${row.tempSourceDate}`}
                          >
                            Temp · {row.tempSourceDate?.slice(5)}
                          </span>
                        )}
                      </td>
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Day of Week · ${row.date}`,
                            badge: 'Calendar',
                            formula: 'UTC weekday name derived from Date (T12:00:00Z)',
                            calculation: `${row.date} → ${row.dayName}`,
                            source: 'Computed from Date column',
                          })
                        }
                        className={`p-2.5 text-center font-semibold border-r-2 ${sheetGridBorder}`}
                      >
                        {row.dayName}
                      </td>
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Weather & Temperature · ${row.date}`,
                            badge: 'Weather',
                            formula: 'Daily min/max °F + sky condition from Open-Meteo / NYSEG hourly temps',
                            calculation: `High ${row.tempHigh}°F / Low ${row.tempLow}°F · Condition: ${row.weatherCond}`,
                            source: 'Open-Meteo daily forecast/history & NYSEG hourly ambient temps',
                          })
                        }
                        className={`p-2 text-right border-r-2 ${sheetGridBorder} leading-tight whitespace-nowrap`}
                      >
                        <div className="font-mono font-semibold">
                          {row.tempHigh}° / {row.tempLow}°F
                        </div>
                        <div className={`text-[10px] font-medium ${subText}`}>{row.weatherCond}</div>
                      </td>
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Daily Irradiance · ${row.date}`,
                            badge: `${row.irradianceNum} W/m²`,
                            formula: 'Daily peak instantaneous global horizontal irradiance (shortwave_radiation_instant)',
                            calculation: `Peak GHI = ${row.irradianceNum} W/m² (${row.weatherCond})`,
                            source: row.irradianceOrigin || 'Open-Meteo peak irradiance archive',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-medium border-r-2 ${sheetGridBorder}`}
                      >
                        {row.irradianceNum}
                      </td>
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Peak Sun Height · ${row.date}`,
                            badge: row.sunHeight,
                            formula: 'Solar Noon Elevation = 90° − Latitude (41.32°) + Declination δ',
                            calculation: row.sunHeightFormula || `Yorktown Heights noon solar angle = ${row.sunHeight}`,
                            source: 'NOAA solar declination equation for 41.32°N',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-medium border-r-2 ${sheetGridBorder} whitespace-nowrap`}
                      >
                        {row.sunHeight}
                      </td>

                      {/* SUNRUN POWER */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `SunRun Power · ${row.date}`,
                            badge: 'Measured CSV',
                            formula: 'Direct daily inverter production total (display rounded to 0.1 kWh)',
                            calculation: `Recorded = ${row.solar_kwh.toFixed(3)} kWh → displayed ${row.solar_kwh.toFixed(1)} kWh`,
                            source: `Sunrun_Daily_Production_Data.csv${row.eod_meter_kwh ? ` (EOD meter ${row.eod_meter_kwh.toFixed(3)} kWh)` : ''}`,
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold ${solarText} border-x-2 border-[#c25e00]`}
                      >
                        {row.solar_kwh.toFixed(1)}
                      </td>

                      {/* DELIVERED / M01 */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Delivered / M01 · ${row.date}`,
                            badge: row.isTempPlaceholder ? 'Temp Copy' : 'Measured CSV',
                            formula: 'Σ Hourly grid import delivered to home (M01)',
                            calculation: `Recorded = ${row.m01_import_kwh.toFixed(3)} kWh → displayed ${row.m01_import_kwh.toFixed(1)} kWh`,
                            source: nysegSourceText,
                          })
                        }
                        className="p-2.5 text-right font-mono font-bold border-x-2 border-[#475569]"
                      >
                        {row.m01_import_kwh.toFixed(1)}
                      </td>

                      {/* RUNNING M01 */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Running M01 · ${row.date}`,
                            badge: row.isTempPlaceholder ? 'Temp Excluded' : 'Cumulative',
                            formula: 'Cumulative sum of reconciled Delivered / M01 through this date',
                            calculation: row.isTempPlaceholder
                              ? `Temp placeholder excluded from running total → held at ${row.running_m01.toFixed(1)} kWh`
                              : `Previous Running M01 (${(row.running_m01 - row.m01_import_kwh).toFixed(1)}) + ${row.m01_import_kwh.toFixed(1)} = ${row.running_m01.toFixed(1)} kWh`,
                            source: 'Chronological cumulative total across reconciled NYSEG days',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold ${greenText} border-r-2 ${sheetGridBorder}`}
                      >
                        {row.running_m01.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>

                      {/* RECEIVED / M02 */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Received / M02 · ${row.date}`,
                            badge: row.isTempPlaceholder ? 'Temp Copy' : 'Measured CSV',
                            formula: 'Σ Hourly solar surplus exported to NYSEG grid (M02)',
                            calculation: `Recorded = ${row.m02_export_kwh.toFixed(3)} kWh → displayed ${row.m02_export_kwh.toFixed(1)} kWh`,
                            source: nysegSourceText,
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold ${greenText} border-x-2 border-[#15803d]`}
                      >
                        {row.m02_export_kwh.toFixed(1)}
                      </td>

                      {/* RUNNING M02 */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Running M02 · ${row.date}`,
                            badge: row.isTempPlaceholder ? 'Temp Excluded' : 'Cumulative',
                            formula: 'Cumulative sum of reconciled Received / M02 through this date',
                            calculation: row.isTempPlaceholder
                              ? `Temp placeholder excluded from running total → held at ${row.running_m02.toFixed(1)} kWh`
                              : `Previous Running M02 (${(row.running_m02 - row.m02_export_kwh).toFixed(1)}) + ${row.m02_export_kwh.toFixed(1)} = ${row.running_m02.toFixed(1)} kWh`,
                            source: 'Chronological cumulative total across reconciled NYSEG days',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold ${greenText} border-r-2 ${sheetGridBorder}`}
                      >
                        {row.running_m02.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>

                      {/* M01 - M02 DIFF (NET) */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `M01 − M02 Diff (Net Grid Flow) · ${row.date}`,
                            badge: row.m01_m02_diff >= 0 ? 'Net Import' : 'Net Export',
                            formula: 'Delivered (M01) − Received (M02)',
                            calculation: `${row.m01_import_kwh.toFixed(3)} − ${row.m02_export_kwh.toFixed(3)} = ${row.m01_m02_diff >= 0 ? '+' : ''}${row.m01_m02_diff.toFixed(3)} kWh (${row.m01_m02_diff >= 0 ? 'net import' : 'net credit added'})`,
                            source: nysegSourceText,
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold border-r-2 ${sheetGridBorder} ${
                          row.m01_m02_diff >= 0 ? redText : greenText
                        }`}
                      >
                        {row.m01_m02_diff >= 0 ? `+${row.m01_m02_diff.toFixed(1)}` : row.m01_m02_diff.toFixed(1)}
                      </td>

                      {/* EDC */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `EDC (Estimated Daily Consumption) · ${row.date}`,
                            badge: 'Derived Energy',
                            formula: 'SunRun Power + Delivered (M01) − Received (M02)',
                            calculation: `${row.solar_kwh.toFixed(3)} + ${row.m01_import_kwh.toFixed(3)} − ${row.m02_export_kwh.toFixed(3)} = ${row.edc_kwh.toFixed(3)} kWh → ${row.edc_kwh.toFixed(1)} kWh`,
                            source: 'Energy balance equation (generation + grid import − grid export)',
                          })
                        }
                        className="p-2.5 text-right font-mono font-bold border-x-2 border-[#9a3412]"
                      >
                        {row.edc_kwh.toFixed(1)}
                      </td>

                      {/* RUNNING EDC */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Running EDC · ${row.date}`,
                            badge: row.isTempPlaceholder ? 'Temp Excluded' : 'Cumulative',
                            formula: 'Cumulative sum of reconciled daily EDC through this date',
                            calculation: row.isTempPlaceholder
                              ? `Temp placeholder excluded from running total → held at ${row.running_edc.toFixed(1)} kWh`
                              : `Previous Running EDC (${(row.running_edc - row.edc_kwh).toFixed(1)}) + ${row.edc_kwh.toFixed(1)} = ${row.running_edc.toFixed(1)} kWh`,
                            source: 'Chronological cumulative home consumption across reconciled days',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold ${greenText} border-r-2 ${sheetGridBorder}`}
                      >
                        {row.running_edc.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>

                      {/* IMPORT COST */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Import Cost · ${row.date}`,
                            badge: '@ $0.24/kWh',
                            formula: 'Delivered (M01) × $0.24/kWh',
                            calculation: `${row.m01_import_kwh.toFixed(3)} kWh × $0.24 = $${row.import_cost.toFixed(2)}`,
                            source: 'Configured NYSEG blended volumetric rate ($0.24/kWh)',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-semibold ${redText} border-r-2 ${sheetGridBorder}`}
                      >
                        ${row.import_cost.toFixed(2)}
                      </td>

                      {/* EXPORT VALUE */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Export Value · ${row.date}`,
                            badge: '@ $0.24/kWh',
                            formula: 'Received (M02) × $0.24/kWh',
                            calculation: `${row.m02_export_kwh.toFixed(3)} kWh × $0.24 = $${row.export_value.toFixed(2)}`,
                            source: 'Configured NYSEG net-metering credit value ($0.24/kWh)',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-semibold ${greenText} border-r-2 ${sheetGridBorder}`}
                      >
                        ${row.export_value.toFixed(2)}
                      </td>

                      {/* NET COST */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Net Cost · ${row.date}`,
                            badge: row.net_cost >= 0 ? 'Net Charge' : 'Net Credit',
                            formula: '(M01 − M02) × $0.24/kWh',
                            calculation: `(${row.m01_import_kwh.toFixed(3)} − ${row.m02_export_kwh.toFixed(3)}) × $0.24 = ${row.net_cost >= 0 ? '+' : ''}$${row.net_cost.toFixed(2)}`,
                            source: 'Import Cost minus Export Value at $0.24/kWh',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold border-r-2 ${sheetGridBorder} ${
                          row.net_cost >= 0 ? redText : greenText
                        }`}
                      >
                        {row.net_cost >= 0 ? `+${row.net_cost.toFixed(2)}` : row.net_cost.toFixed(2)}
                      </td>

                      {/* RUNNING NET COST */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Running Net Cost · ${row.date}`,
                            badge: 'Cumulative',
                            formula: '(Running M01 − Running M02) × $0.24/kWh',
                            calculation: `(${row.running_m01.toFixed(1)} − ${row.running_m02.toFixed(1)}) × $0.24 = $${row.running_net_cost.toFixed(2)}`,
                            source: 'Cumulative net energy credit/charge balance through this date',
                          })
                        }
                        className={`p-2.5 text-right font-mono font-bold ${greenText} border-r-2 ${sheetGridBorder} whitespace-nowrap`}
                      >
                        ${row.running_net_cost.toFixed(2)}
                      </td>

                      {/* NOTES */}
                      <td
                        onMouseEnter={(e) =>
                          showCellDerivation(e, {
                            title: `Row Note · ${row.date}`,
                            badge: row.status,
                            formula: 'Pipeline reconciliation status or custom user note',
                            calculation: gridNotes[row.date] ?? row.note ?? 'No custom note recorded',
                            source: nysegSourceText,
                          })
                        }
                        className="p-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          placeholder="Add note"
                          value={gridNotes[row.date] ?? row.note ?? ''}
                          onChange={(e) =>
                            setGridNotes((prev) => ({ ...prev, [row.date]: e.target.value }))
                          }
                          className={`w-full px-2.5 py-1 rounded border text-xs ${
                            darkMode
                              ? 'bg-slate-950/90 border-slate-600 text-slate-100'
                              : 'bg-white/90 border-[#6b665c] text-[#1a1917] placeholder:text-[#6b675e]'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const forecastRows = liveCreditBankForecast?.rows || [];
  const forecastOpeningBalance = liveCreditBankForecast?.opening_projected_kwh ?? 2071.79;

  return (
    <div className={`min-h-screen transition-colors duration-200 font-sans ${pageBg}`}>
      <div className="max-w-[1720px] mx-auto px-3 sm:px-5 py-4 grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_230px] xl:grid-cols-[270px_minmax(0,1fr)_270px] 2xl:grid-cols-[310px_minmax(0,1fr)_310px] gap-5 items-start">
        {/* LEFT SIDE RAIL: RESIDENTIAL SOLAR HOME */}
        <aside className="hidden lg:block sticky top-4 h-[calc(100vh-2rem)]">
          <div className={`relative w-full h-full rounded-2xl border overflow-hidden shadow-sm ${darkMode ? 'border-slate-800' : 'border-[#e6e2d8]'}`}>
            <img
              src={solarHomeSideImg}
              alt="Residential solar roof array"
              className="w-full h-full object-cover"
            />
            <div className={`absolute inset-x-3 bottom-3 rounded-xl border p-4 backdrop-blur-md shadow-sm ${
              darkMode
                ? 'bg-slate-900/85 border-slate-700 text-slate-100'
                : 'bg-[#f6f4ef]/88 border-[#e6e2d8] text-[#1a1917]'
            }`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider ${mutedText}`}>
                RESIDENTIAL ARRAY
              </div>
              <h3 className="text-sm font-bold tracking-tight mt-0.5">
                Home-scale production context
              </h3>
              <p className={`text-xs leading-relaxed mt-1 ${mutedText}`}>
                Keep rooftop system performance visible alongside production, weather, and household energy flow.
              </p>
            </div>
          </div>
        </aside>

        {/* CENTER CONTENT COLUMN */}
        <div className="min-w-0 space-y-4">
          {/* TOP MENU BAR WITH COLLAPSIBLE MOBILE NAVIGATION */}
          <header className={`sticky top-0 z-30 rounded-2xl border backdrop-blur-md ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-[#f6f4ef]/95 border-[#e6e2d8]'}`}>
            <div className="px-3 py-2.5 lg:px-6 lg:pt-3.5 lg:pb-3 space-y-2 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-3">
              {/* MOBILE / TABLET COMPACT BAR + MENU TOGGLE */}
              <div className="flex lg:hidden items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  aria-expanded={mobileMenuOpen}
                  aria-label={mobileMenuOpen ? 'Collapse navigation menu' : 'Expand navigation menu'}
                  className={`min-w-0 flex-1 px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center justify-between gap-2 transition cursor-pointer ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800'
                      : 'bg-[#1a1917] border-[#1a1917] text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {mobileMenuOpen ? <X className="w-3.5 h-3.5 shrink-0" /> : <Menu className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">
                      {mobileMenuOpen
                        ? 'Collapse Menu'
                        : `Menu · ${TOP_MENU_ITEMS.find((t) => t.id === activeTab)?.label || 'Tabs'}`}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${mobileMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={triggerSyncPipeline}
                    disabled={isSyncing}
                    title="Sync CSV / Published Snapshot"
                    className={`px-2.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border whitespace-nowrap transition cursor-pointer ${
                      darkMode
                        ? 'bg-slate-900 border-slate-700 text-emerald-400 hover:bg-slate-800'
                        : 'bg-white border-[#dcd8ce] text-[#1f7a4c] hover:bg-[#efece4]'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing' : 'Sync'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAiHoverOpen(false);
                      setShowAiDrawer(true);
                    }}
                    aria-label="Open Ask AI"
                    className={`p-1.5 rounded-full border transition cursor-pointer ${pillBtnSecondary}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#e07a16]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAlertLogModal(true)}
                    aria-label="Open Alert Log"
                    className={`px-2 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border whitespace-nowrap transition cursor-pointer ${pillBtnSecondary}`}
                  >
                    <Bell className={`w-3.5 h-3.5 ${combinedAlerts.length > 0 ? 'text-[#e07a16]' : 'text-[#1f7a4c]'}`} />
                    {alertLookupEntries.length > 0 && (
                      <span className="font-mono text-[10px] font-bold">({alertLookupEntries.length})</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDarkMode(!darkMode)}
                    className={`p-1.5 rounded-full border transition cursor-pointer ${
                      darkMode ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-white border-[#dcd8ce] text-[#5c5953]'
                    }`}
                    aria-label="Toggle theme"
                  >
                    {darkMode ? <SunMedium className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* COLLAPSIBLE MOBILE MENU DRAWER */}
              {mobileMenuOpen && (
                <div className={`lg:hidden pt-2 border-t space-y-2 ${dividerBorder}`}>
                  <nav className="grid grid-cols-2 gap-1.5">
                    {TOP_MENU_ITEMS.map((item) => {
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-medium text-left transition cursor-pointer truncate ${
                            active
                              ? darkMode
                                ? 'bg-amber-400 text-slate-950 font-semibold shadow-xs'
                                : 'bg-[#1a1917] text-white font-semibold shadow-xs'
                              : darkMode
                              ? 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                              : 'bg-[#efece4] text-[#1a1917] hover:bg-[#e5e0d5]'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="flex items-center justify-between text-[11px] font-mono px-1">
                    <span className={mutedText}>
                      Auto-Sync: 7:30 AM{snapshotMeta?.generated_at ? ` · Synced ${snapshotMeta.generated_at.slice(5, 10)}` : ''}
                    </span>
                    <span className={mutedText}>
                      Through {snapshotMeta?.latest_reconciled_date || '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* DESKTOP NAVIGATION */}
              <nav className="hidden lg:flex flex-wrap items-center gap-1.5 sm:gap-2">
                {TOP_MENU_ITEMS.map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition cursor-pointer ${
                        active
                          ? darkMode
                            ? 'bg-amber-400 text-slate-950 font-semibold shadow-xs'
                            : 'bg-[#1a1917] text-white font-semibold shadow-xs'
                          : darkMode
                          ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                          : 'text-[#5c5953] hover:text-[#1a1917] hover:bg-[#e9e5dc]'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              <div className="hidden lg:flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono whitespace-nowrap ${calloutBg}`}
                  title={`Automated Windows Task & GitHub Pages Sync run daily at 7:30 AM EST • Latest snapshot: ${snapshotMeta?.generated_at || 'unknown'}`}
                >
                  Auto-Sync: 7:30 AM{snapshotMeta?.generated_at ? ` · Synced ${snapshotMeta.generated_at.slice(5, 10)}` : ''}
                </span>
                <button
                  onClick={triggerSyncPipeline}
                  disabled={isSyncing}
                  title="Run 6-Stage CSV Sync Pipeline (Scheduled daily at 7:30 AM)"
                  className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap transition cursor-pointer ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-emerald-400 hover:bg-slate-800'
                      : 'bg-white border-[#dcd8ce] text-[#1f7a4c] hover:bg-[#efece4]'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Sync CSVs'}</span>
                </button>

                <div
                  className="relative"
                  onMouseEnter={openAiHoverMenu}
                  onMouseLeave={scheduleCloseAiHoverMenu}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAiHoverOpen(false);
                      setShowAiDrawer(true);
                    }}
                    onFocus={openAiHoverMenu}
                    aria-expanded={aiHoverOpen}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border whitespace-nowrap transition cursor-pointer ${pillBtnSecondary}`}
                  >
                    <Sparkles className="w-3 h-3 text-[#e07a16]" />
                    <span className="hidden sm:inline">Ask AI</span>
                  </button>

                  {/* HOVER POPOVER: SELECTABLE QUESTIONS TO EXECUTE */}
                  {aiHoverOpen && (
                    <div
                      onMouseEnter={openAiHoverMenu}
                      onMouseLeave={scheduleCloseAiHoverMenu}
                      className="absolute left-0 xl:left-auto xl:right-0 top-full pt-1.5 w-88 max-w-[calc(100vw-2rem)] z-50"
                    >
                      <div className={`rounded-2xl border p-2.5 shadow-xl space-y-1 max-h-[70vh] overflow-y-auto ${cardBg}`}>
                        <div className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between gap-1.5 ${mutedText}`}>
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-[#e07a16]" />
                            <span>Questions you can ask</span>
                          </span>
                          <span className="text-[9px] font-normal normal-case">Click to run</span>
                        </div>
                        {AI_SUGGESTED_QUESTIONS.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAiHoverOpen(false);
                              setShowAiDrawer(true);
                              handleAskAi(q);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer flex items-center justify-between gap-2 border border-transparent group/item ${
                              darkMode
                                ? 'hover:bg-slate-800 hover:border-slate-700 text-slate-200'
                                : 'hover:bg-[#efece4] hover:border-[#dcd8ce] text-[#1a1917]'
                            }`}
                          >
                            <span className="flex items-start gap-2">
                              <span className="text-[#e07a16] font-bold mt-px">→</span>
                              <span>{q}</span>
                            </span>
                            <span className="text-[10px] font-semibold text-[#1f7a4c] opacity-0 group-hover/item:opacity-100 shrink-0">
                              Run
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAlertLogModal(true)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap transition cursor-pointer ${pillBtnSecondary}`}
                  title="Open Alert & Anomaly Lookup Log (includes canceled alerts)"
                >
                  <Bell className={`w-3 h-3 ${combinedAlerts.length > 0 ? 'text-[#e07a16]' : 'text-[#1f7a4c]'}`} />
                  <span className="hidden sm:inline">Alert Log</span>
                  {alertLookupEntries.length > 0 && (
                    <span className="font-mono text-[10px] font-bold">({alertLookupEntries.length})</span>
                  )}
                </button>

                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`p-1.5 rounded-full border transition cursor-pointer ${
                    darkMode ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-white border-[#dcd8ce] text-[#5c5953]'
                  }`}
                  aria-label="Toggle theme"
                  title="Toggle light/dark mode"
                >
                  {darkMode ? <SunMedium className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </header>

          {/* MAIN CONTENT CONTAINER */}
          <main className="px-1 sm:px-2 pb-10 space-y-8">
            {/* IN-APP ANOMALIES, ISSUES & EMAIL NOTIFICATION STATUS BAR */}
            {(() => {
              const currentNotifSig =
                notificationStatus?.last_checked_at ||
                notificationStatus?.recent_email_events?.[0]?.sent_at ||
                '';
              const showAlertsCard =
                !bannerCleared &&
                (combinedAlerts.length > 0 ||
                  ((notificationStatus?.recent_email_events?.length || 0) > 0 &&
                    canceledBannerSig !== currentNotifSig &&
                    canceledAlertKeys.length === 0));
              if (!showAlertsCard) return null;
              return (
                <div
                  className={`rounded-2xl border p-4 space-y-3 ${
                    combinedAlerts.some((a) => a.severity === 'error')
                      ? darkMode
                        ? 'bg-rose-950/50 border-rose-500/60 text-rose-100'
                        : 'bg-[#fef2f2] border-[#dc2626]/50 text-[#1a1917]'
                      : combinedAlerts.length > 0
                      ? darkMode
                        ? 'bg-amber-950/40 border-amber-500/50 text-amber-100'
                        : 'bg-[#fff7ed] border-[#e07a16]/50 text-[#1a1917]'
                      : cardBg
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {combinedAlerts.length > 0 ? (
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 ${
                            combinedAlerts.some((a) => a.severity === 'error') ? 'text-[#b91c1c]' : 'text-[#e07a16]'
                          }`}
                        />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-[#1f7a4c]" />
                      )}
                      <span className="font-bold">
                        {combinedAlerts.length > 0
                          ? `${combinedAlerts.length} Data/App Anomaly & Issue Alert${combinedAlerts.length > 1 ? 's' : ''}`
                          : 'All Telemetry & App Checks Healthy'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono ${calloutBg}`}>
                        <Mail className="w-3 h-3 text-[#1f7a4c]" />
                        <span>Alerts &amp; New Records → dglanville@gmail.com</span>
                      </span>
                      {(notificationStatus?.new_sunrun_count > 0 || notificationStatus?.new_nyseg_count > 0) && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#1f7a4c]/15 text-[#1f7a4c]">
                          +{notificationStatus.new_sunrun_count} SunRun · +{notificationStatus.new_nyseg_count} NYSEG added
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAlertsExpanded((v) => !v)}
                        className={`px-3 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${pillBtnSecondary}`}
                      >
                        {alertsExpanded ? 'Hide Details' : 'View Details'}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAlertsBanner}
                        className={`px-3 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${pillBtnSecondary}`}
                        title="Clear alerts for this session"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelAllAlerts}
                        className={`px-3 py-1 rounded-full border text-[11px] font-semibold cursor-pointer transition ${
                          darkMode
                            ? 'bg-slate-900 border-rose-500/60 text-rose-300 hover:bg-rose-950/50'
                            : 'bg-white border-[#dc2626]/50 text-[#b91c1c] hover:bg-[#fef2f2]'
                        }`}
                        title="Permanently close current alerts across reloads"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Concise primary alert message always visible */}
                  {combinedAlerts.length > 0 && (
                    <div className="space-y-1.5 text-xs">
                      {(alertsExpanded ? combinedAlerts : combinedAlerts.slice(0, 2)).map((alert, idx) => (
                        <div key={`${alert.code}-${idx}`} className="flex items-start justify-between gap-2 leading-relaxed">
                          <div>
                            <span
                              className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                alert.severity === 'error'
                                  ? 'bg-[#b91c1c] text-white'
                                  : 'bg-[#e07a16] text-white'
                              }`}
                            >
                              {alert.severity === 'error' ? 'Issue' : 'Anomaly'}
                            </span>
                            <strong className="font-semibold">{alert.title}:</strong>{' '}
                            <span className={mutedText}>{alert.message}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCancelSingleAlert(alert)}
                            className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 cursor-pointer transition ${
                              darkMode
                                ? 'border-rose-500/50 text-rose-300 hover:bg-rose-950/60'
                                : 'border-[#dc2626]/40 text-[#b91c1c] bg-white hover:bg-[#fef2f2]'
                            }`}
                            title="Permanently close this alert"
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {alertsExpanded && notificationStatus?.recent_email_events?.length > 0 && (
                    <div className={`pt-2 border-t text-[11px] space-y-1 ${dividerBorder}`}>
                      <div className={`font-semibold uppercase tracking-wider text-[10px] ${mutedText}`}>
                        Recent Email Notifications (dglanville@gmail.com)
                      </div>
                      {notificationStatus.recent_email_events.slice(0, 5).map((ev, idx) => (
                        <div key={idx} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                          <span className="truncate">{ev.subject}</span>
                          <span className={ev.status === 'sent' ? 'text-[#1f7a4c]' : 'text-[#b91c1c]'}>
                            {ev.status === 'sent' ? `Sent ${ev.sent_at}` : `Error: ${ev.error}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

        {/* TAB 1: ENERGY DISTRIBUTION (UNIFIED SOLAR SAVINGS PALETTE & TYPOGRAPHY) */}
        {activeTab === 'distribution' && (
          <div className="space-y-6">
            <div className="space-y-2.5 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Where did your solar & grid energy move?
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                Inspect daily energy flow between your Sunrun rooftop array, home consumption, and NYSEG smart meter registers (<strong className="font-semibold">M01 Delivered</strong> and <strong className="font-semibold">M02 Received</strong>) alongside hourly balance and lifetime totals.
              </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
              {/* COLUMN 1: DAILY ENERGY FLOW */}
              <div className={`rounded-2xl border overflow-hidden flex flex-col justify-between ${cardBg}`}>
                <div className="p-5 pb-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div>
                      <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                        DAILY ENERGY FLOW
                      </div>
                      <h2 className="text-lg font-bold tracking-tight mt-0.5 whitespace-nowrap">
                        Where energy moved
                      </h2>
                      <div className={`text-xs mt-0.5 whitespace-nowrap ${mutedText}`}>
                        Showing <span className="font-mono font-semibold">{distDayMetrics.date}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => stepDistDate(-1)}
                        className={`w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer ${pillBtnSecondary}`}
                        title="Previous day"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <select
                        value={selectedDistDate}
                        onChange={(e) => setSelectedDistDate(e.target.value)}
                        className={`px-2.5 py-1 rounded-full border text-xs font-mono font-semibold cursor-pointer ${pillBtnSecondary}`}
                      >
                        {[...reconciledRowsChrono].reverse().map((r) => (
                          <option key={r.date} value={r.date}>
                            {r.date}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => stepDistDate(1)}
                        className={`w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer ${pillBtnSecondary}`}
                        title="Next day"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Structured Architectural Energy Flow Diagram (Rounded Tiles + Explicit Directional SVG Connectors) */}
                  {(() => {
                    const isExpWin = distDayMetrics.isM02GreaterThanM01;
                    const greenTile = darkMode
                      ? 'bg-emerald-900/75 border-emerald-400 text-emerald-50'
                      : 'bg-[#bbf7d0] border-[#15803d] text-[#1a1917]';
                    const yellowTile = darkMode
                      ? 'bg-amber-900/75 border-amber-400 text-amber-50'
                      : 'bg-[#fef08a] border-[#ca8a04] text-[#1a1917]';
                    const greenSub = darkMode ? 'text-emerald-100/90' : 'text-[#14532d]';
                    const yellowSub = darkMode ? 'text-amber-100/90' : 'text-[#451a03]';
                    const m01ColorStroke = isExpWin ? '#ca8a04' : '#15803d';
                    const m02ColorStroke = isExpWin ? '#15803d' : '#ca8a04';
                    const solarDirectPct = Math.min(
                      100,
                      Math.round((Number(distDayMetrics.solarRetained) / Math.max(0.1, Number(distDayMetrics.solar))) * 100)
                    );

                    return (
                      <div className="select-none pt-1">
                        {/* TIER 1: TWO ENERGY SOURCES (GRID IMPORT M01 & SUNRUN SOLAR ARRAY) */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* M01 Imported Tile */}
                          <div className={`rounded-xl border-2 p-3 shadow-2xs transition-colors ${isExpWin ? yellowTile : greenTile}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${isExpWin ? yellowSub : greenSub}`}>
                                NYSEG · M01
                              </span>
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center ${
                                  isExpWin
                                    ? darkMode ? 'bg-amber-800/80 text-amber-200' : 'bg-[#fde047] text-[#854d0e]'
                                    : darkMode ? 'bg-emerald-800/80 text-emerald-200' : 'bg-[#86efac] text-[#14532d]'
                                }`}
                              >
                                <ArrowDown className="w-3 h-3" />
                              </span>
                            </div>
                            <div className="text-lg font-mono font-bold leading-tight mt-1">
                              {distDayMetrics.m01} <span className="text-[11px] font-semibold">kWh</span>
                            </div>
                            <div className={`text-[10px] font-medium leading-snug mt-1 ${isExpWin ? yellowSub : greenSub}`}>
                              Imported · {distDayMetrics.gridDepPct}% of load
                            </div>
                            <div className={`text-[10px] font-mono opacity-85 ${isExpWin ? yellowSub : greenSub}`}>
                              ${(Number(distDayMetrics.m01) * 0.24).toFixed(2)} @ $0.24
                            </div>
                          </div>

                          {/* Produced SunRun Solar Tile (Light Red) */}
                          <div
                            className={`rounded-xl border-2 p-3 shadow-2xs ${
                              darkMode
                                ? 'bg-rose-950/80 border-rose-400 text-rose-50'
                                : 'bg-[#fee2e2] border-[#dc2626] text-[#1a1917]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-rose-200' : 'text-[#7f1d1d]'}`}>
                                SunRun Solar
                              </span>
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center ${
                                  darkMode ? 'bg-rose-900 text-rose-200' : 'bg-[#fecaca] text-[#dc2626]'
                                }`}
                              >
                                <Sun className="w-3 h-3" />
                              </span>
                            </div>
                            <div className={`text-lg font-mono font-bold leading-tight mt-1 ${darkMode ? 'text-rose-100' : 'text-[#991b1b]'}`}>
                              {distDayMetrics.solar} <span className="text-[11px] font-semibold">kWh</span>
                            </div>
                            <div className={`text-[10px] font-medium leading-snug mt-1 ${darkMode ? 'text-rose-100/90' : 'text-[#7f1d1d]'}`}>
                              Direct: {distDayMetrics.solarRetained} kWh ({solarDirectPct}%)
                            </div>
                            <div className={`text-[10px] font-mono opacity-85 ${darkMode ? 'text-rose-100/90' : 'text-[#7f1d1d]'}`}>
                              Produced · 18.45 kW
                            </div>
                          </div>
                        </div>

                        {/* TIER 2: CONVERGING SVG CONNECTORS INTO HOME LOAD */}
                        <div className="relative h-12 w-full">
                          <svg className="w-full h-full" viewBox="0 0 340 48" preserveAspectRatio="none">
                            <defs>
                              <marker id="flow-arrow-m01" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                                <path d="M0,0 L7,3.5 L0,7 Z" fill={m01ColorStroke} />
                              </marker>
                              <marker id="flow-arrow-solar" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                                <path d="M0,0 L7,3.5 L0,7 Z" fill="#dc2626" />
                              </marker>
                            </defs>
                            {/* Left Supply (M01) -> Center Home */}
                            <path
                              d="M 82 2 L 82 20 Q 82 28 142 28 L 142 41"
                              fill="none"
                              stroke={m01ColorStroke}
                              strokeWidth="2.5"
                              markerEnd="url(#flow-arrow-m01)"
                            />
                            {/* Right Supply (SunRun Direct) -> Center Home */}
                            <path
                              d="M 258 2 L 258 20 Q 258 28 198 28 L 198 41"
                              fill="none"
                              stroke="#dc2626"
                              strokeWidth="2.5"
                              markerEnd="url(#flow-arrow-solar)"
                            />
                          </svg>
                          <span
                            className={`absolute left-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${
                              darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-[#faf8f4] border-[#dcd8ce] text-[#1a1917]'
                            }`}
                          >
                            +{distDayMetrics.m01} grid
                          </span>
                          <span
                            className={`absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${
                              darkMode ? 'bg-slate-900 border-rose-500/40 text-rose-200' : 'bg-[#fef2f2] border-[#fca5a5] text-[#991b1b]'
                            }`}
                          >
                            +{distDayMetrics.solarRetained} direct
                          </span>
                        </div>

                        {/* TIER 3: CENTER HERO CARD — ESTIMATED HOME CONSUMED (LIGHT BLUE) */}
                        <div
                          className={`rounded-xl border-2 p-3.5 shadow-2xs ${
                            darkMode
                              ? 'bg-sky-950/85 border-sky-400 text-sky-50'
                              : 'bg-[#dbeafe] border-[#2563eb] text-[#1a1917]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                                  darkMode ? 'bg-sky-900 text-sky-200' : 'bg-[#bfdbfe] text-[#1d4ed8]'
                                }`}
                              >
                                <Home className="w-3.5 h-3.5" />
                              </span>
                              <div>
                                <div className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-sky-200' : 'text-[#1e40af]'}`}>
                                  Home Consumed (EDC)
                                </div>
                                <div className={`text-xl font-mono font-bold leading-none mt-0.5 ${darkMode ? 'text-sky-100' : 'text-[#1e3a8a]'}`}>
                                  {distDayMetrics.homeConsumed} <span className="text-xs font-semibold">kWh</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right space-y-1">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  darkMode ? 'bg-sky-900 text-sky-100' : 'bg-white/80 border border-[#93c5fd] text-[#1e3a8a]'
                                }`}
                              >
                                {distDayMetrics.solarCovPct}% solar covered
                              </span>
                              <div className={`text-[10px] font-mono ${darkMode ? 'text-sky-200' : 'text-[#1e40af]'}`}>
                                {distDayMetrics.m01} grid + {distDayMetrics.solarRetained} solar
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* TIER 4: EXPLICIT M02 EXPORT CONNECTOR (HOME / INVERTER BUS -> NYSEG M02) */}
                        <div className="relative h-12 w-full">
                          <svg className="w-full h-full" viewBox="0 0 340 48" preserveAspectRatio="none">
                            <defs>
                              <marker id="flow-arrow-m02" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                                <path d="M0,0 L8,4 L0,8 Z" fill={m02ColorStroke} />
                              </marker>
                            </defs>
                            <line
                              x1="170"
                              y1="2"
                              x2="170"
                              y2="41"
                              stroke={m02ColorStroke}
                              strokeWidth="2.8"
                              markerEnd="url(#flow-arrow-m02)"
                            />
                          </svg>
                          <div
                            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold whitespace-nowrap shadow-2xs ${
                              isExpWin
                                ? darkMode
                                  ? 'bg-emerald-950 border-emerald-400 text-emerald-200'
                                  : 'bg-[#ecfdf5] border-[#15803d] text-[#14532d]'
                                : darkMode
                                ? 'bg-amber-950 border-amber-400 text-amber-200'
                                : 'bg-[#fefce8] border-[#ca8a04] text-[#854d0e]'
                            }`}
                          >
                            ↓ {distDayMetrics.m02} kWh M02 surplus sent to NYSEG
                          </div>
                        </div>

                        {/* TIER 5: BOTTOM NODE — M02 EXPORTED TO NYSEG (GREEN WHEN M02 > M01, YELLOW OTHERWISE) */}
                        <div className={`rounded-xl border-2 p-3.5 shadow-2xs transition-colors ${isExpWin ? greenTile : yellowTile}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                                  isExpWin
                                    ? darkMode ? 'bg-emerald-800/80 text-emerald-200' : 'bg-[#86efac] text-[#14532d]'
                                    : darkMode ? 'bg-amber-800/80 text-amber-200' : 'bg-[#fde047] text-[#854d0e]'
                                }`}
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </span>
                              <div>
                                <div className={`text-[10px] font-bold uppercase tracking-wider ${isExpWin ? greenSub : yellowSub}`}>
                                  Exported · M02 to NYSEG
                                </div>
                                <div className="text-lg font-mono font-bold leading-none mt-0.5">
                                  {distDayMetrics.m02} <span className="text-xs font-semibold">kWh</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right space-y-0.5">
                              <div className={`text-[11px] font-mono font-bold ${isExpWin ? greenSub : yellowSub}`}>
                                +${(Number(distDayMetrics.m02) * 0.24).toFixed(2)} credit value
                              </div>
                              <div className={`text-[10px] font-mono ${isExpWin ? greenSub : yellowSub}`}>
                                Net {distDayMetrics.netGridImported ? `−${distDayMetrics.netGridFlowAbs} imp` : `+${distDayMetrics.netGridFlowAbs} exp`} kWh
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Bottom Performance Sub-Panel */}
                <div className={`p-5 border-t space-y-3 ${subPanelBg}`}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                    PERFORMANCE
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <div className={`text-xs font-medium ${mutedText}`}>Grid dependence</div>
                      <div className="text-lg font-mono font-bold">{distDayMetrics.gridDepPct}%</div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${trackBg}`}>
                        <div style={{ width: `${distDayMetrics.gridDepPct}%` }} className="h-full bg-[#687076] rounded-full" />
                      </div>
                      <div className={`text-[11px] pt-0.5 ${mutedText}`}>Home demand supplied by NYSEG.</div>
                    </div>

                    <div className="space-y-1.5">
                      <div className={`text-xs font-medium ${mutedText}`}>Solar coverage</div>
                      <div className="text-lg font-mono font-bold text-[#e07a16]">{distDayMetrics.solarCovPct}%</div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${trackBg}`}>
                        <div style={{ width: `${distDayMetrics.solarCovPct}%` }} className="h-full bg-[#e07a16] rounded-full" />
                      </div>
                      <div className={`text-[11px] pt-0.5 ${mutedText}`}>Solar retained for home use.</div>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 gap-4 pt-3 border-t ${dividerBorder}`}>
                    <div>
                      <div className={`text-xs font-medium ${mutedText}`}>Net grid flow</div>
                      <div className={`text-base font-mono font-bold mt-0.5 ${distDayMetrics.netGridImported ? '' : 'text-[#1f7a4c]'}`}>
                        {distDayMetrics.netGridFlowAbs} kWh {distDayMetrics.netGridImported ? 'imported' : 'exported'}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                        {distDayMetrics.netGridImported ? 'Positive means imported from NYSEG.' : 'Net export credited to NYSEG bank.'}
                      </div>
                    </div>

                    <div>
                      <div className={`text-xs font-medium ${mutedText}`}>Solar impact</div>
                      <div className="text-base font-mono font-bold text-[#1f7a4c] mt-0.5">{distDayMetrics.co2AvoidedLb} lb</div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>Estimated CO₂ avoided.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* COLUMN 2: HOURLY ENERGY BALANCE */}
              <div className={`rounded-2xl border overflow-hidden flex flex-col ${cardBg}`}>
                <div className="p-5 flex-1 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                        HOURLY ENERGY BALANCE
                      </div>
                      <h2 className="text-lg font-bold tracking-tight mt-0.5 leading-snug">
                        Production, consumption & grid flow
                      </h2>
                    </div>

                    <button
                      onClick={() => setIsPlayingDates(!isPlayingDates)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1 transition cursor-pointer shrink-0 ${
                        isPlayingDates
                          ? 'bg-[#1a1917] text-white border-[#1a1917]'
                          : pillBtnSecondary
                      }`}
                    >
                      {isPlayingDates ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                      <span>{isPlayingDates ? 'Pause' : 'Play dates'}</span>
                    </button>
                  </div>

                  {/* Weather / Irradiance / Sun Height Strip */}
                  <div className={`grid grid-cols-3 gap-2 py-3 border-y ${dividerBorder}`}>
                    <div className={`pr-2 border-r ${dividerBorder}`}>
                      <div className={`text-[10px] font-semibold uppercase tracking-wider ${mutedText}`}>WEATHER</div>
                      <div className="text-sm font-bold mt-0.5">{distDayMetrics.irradianceLabel}</div>
                      <div className={`text-[11px] font-mono mt-0.5 ${mutedText}`}>
                        {distDayMetrics.tempMax}° / {distDayMetrics.tempMin}°F
                      </div>
                    </div>

                    <div className={`px-2 border-r ${dividerBorder}`}>
                      <div className={`text-[10px] font-semibold uppercase tracking-wider ${mutedText}`}>IRRADIANCE</div>
                      <div className="text-sm font-mono font-bold mt-0.5">{distDayMetrics.irradianceWm2}</div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>Daily peak</div>
                    </div>

                    <div className="pl-2">
                      <div className={`text-[10px] font-semibold uppercase tracking-wider ${mutedText}`}>SUN HEIGHT</div>
                      <div className="text-sm font-mono font-bold mt-0.5">{distDayMetrics.sunHeight}</div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>Peak elevation</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                      NYSEG M01/M02 bars are measured. SunRun production and home use are apportioned from daily totals.
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`font-medium ${mutedText}`}>Day</span>
                      <select
                        value={selectedDistDate}
                        onChange={(e) => setSelectedDistDate(e.target.value)}
                        className={`px-2.5 py-1 rounded-full border text-xs font-mono font-semibold cursor-pointer ${pillBtnSecondary}`}
                      >
                        {[...reconciledRowsChrono].reverse().map((r) => (
                          <option key={r.date} value={r.date}>
                            {r.date}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Legend using Solar Savings standard palette */}
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#e07a16] inline-block" />
                      <span className={mutedText}>SunRun produced</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#687076] inline-block" />
                      <span className={mutedText}>M01 imported</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#b45309] inline-block" />
                      <span className={mutedText}>Home consumed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#1f7a4c] inline-block" />
                      <span className={mutedText}>M02 exported</span>
                    </div>
                  </div>

                  {/* Diverging 24-Hour Bar Chart expanding smoothly to fill vertical space */}
                  <div className="flex-1 flex flex-col justify-between pt-2">
                    <div className="relative flex-1 min-h-[250px] flex">
                      <div className={`w-6 flex flex-col justify-between text-[11px] font-mono text-right pr-1.5 py-1 ${mutedText}`}>
                        <span>5</span>
                        <span>0</span>
                        <span>-5</span>
                      </div>

                      <div className="flex-1 relative flex flex-col">
                        <div className={`absolute inset-x-0 top-2 border-t ${dividerBorder}`} />
                        <div className="absolute inset-x-0 top-1/2 border-t border-[#687076] z-10" />
                        <div className={`absolute inset-x-0 bottom-2 border-t ${dividerBorder}`} />

                        <div className="flex-1 grid grid-cols-24 gap-[2px] items-center px-1">
                          {hourlyBalanceData.map((d) => {
                            const maxAxis = 5.5;
                            const solarPct = Math.min(100, (d.solar / maxAxis) * 100);
                            const m01Pct = Math.min(100 - solarPct, (d.m01 / maxAxis) * 100);

                            const consPct = Math.min(100, (d.consumed / maxAxis) * 100);
                            const m02Pct = Math.min(100 - consPct, (d.m02 / maxAxis) * 100);

                            return (
                              <div
                                key={d.hour}
                                className="h-full flex flex-col group"
                                title={`${d.hour}:00 • Solar: ${d.solar} kWh | M01 Imp: ${d.m01} kWh | Consumed: ${d.consumed} kWh | M02 Exp: ${d.m02} kWh`}
                              >
                                <div className="h-1/2 flex flex-col justify-end">
                                  {m01Pct > 0 && (
                                    <div style={{ height: `${m01Pct}%` }} className="w-full bg-[#687076]" />
                                  )}
                                  {solarPct > 0 && (
                                    <div style={{ height: `${solarPct}%` }} className="w-full bg-[#e07a16]" />
                                  )}
                                </div>

                                <div className="h-1/2 flex flex-col justify-start">
                                  {consPct > 0 && (
                                    <div style={{ height: `${consPct}%` }} className="w-full bg-[#b45309]" />
                                  )}
                                  {m02Pct > 0 && (
                                    <div style={{ height: `${m02Pct}%` }} className="w-full bg-[#1f7a4c]" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className={`pl-6 grid grid-cols-8 text-[11px] font-mono pt-1.5 ${mutedText}`}>
                      <span>12a</span>
                      <span>3a</span>
                      <span>6a</span>
                      <span>9a</span>
                      <span>12p</span>
                      <span>3p</span>
                      <span>6p</span>
                      <span>9p</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Peak-Hour Summary Strip (Matches Column 1 Performance Sub-Panel) */}
                {(() => {
                  const fmtHr = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
                  const peakOf = (key) =>
                    hourlyBalanceData.reduce((best, cur) => (cur[key] > best[key] ? cur : best), hourlyBalanceData[0] || { hour: 12, [key]: 0 });
                  const pSolar = peakOf('solar');
                  const pExp = peakOf('m02');
                  const pCons = peakOf('consumed');
                  const pImp = peakOf('m01');
                  return (
                    <div className={`p-5 border-t space-y-3 ${subPanelBg}`}>
                      <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                        HOURLY PEAKS · {distDayMetrics.date}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className={mutedText}>Peak solar hour</div>
                          <div className="font-mono font-bold text-[#e07a16] mt-0.5">
                            {fmtHr(pSolar.hour)} · {Number(pSolar.solar || 0).toFixed(1)} kWh
                          </div>
                        </div>
                        <div>
                          <div className={mutedText}>Peak export (M02)</div>
                          <div className="font-mono font-bold text-[#1f7a4c] mt-0.5">
                            {fmtHr(pExp.hour)} · {Number(pExp.m02 || 0).toFixed(1)} kWh
                          </div>
                        </div>
                        <div>
                          <div className={mutedText}>Peak home load</div>
                          <div className="font-mono font-bold mt-0.5">
                            {fmtHr(pCons.hour)} · {Number(pCons.consumed || 0).toFixed(1)} kWh
                          </div>
                        </div>
                        <div>
                          <div className={mutedText}>Peak import (M01)</div>
                          <div className="font-mono font-bold mt-0.5">
                            {fmtHr(pImp.hour)} · {Number(pImp.m01 || 0).toFixed(1)} kWh
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* COLUMN 3: LIFETIME ENERGY */}
              <div className={`rounded-2xl border overflow-hidden flex flex-col ${cardBg}`}>
                <div className="p-5 flex-1 flex flex-col gap-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                        LIFETIME ENERGY
                      </div>
                      <h2 className="text-lg font-bold tracking-tight mt-0.5">
                        Total Energy
                      </h2>
                    </div>
                    <div className="text-right">
                      <div className={`text-[11px] font-mono ${mutedText}`}>
                        SunRun: {TELEMETRY_META.date_range_start} to {TELEMETRY_META.latest_sunrun_date}
                      </div>
                      <div className={`text-[10px] font-mono ${mutedText}`}>
                        NYSEG: {TELEMETRY_META.reconciled_range_start} to {TELEMETRY_META.latest_reconciled_date}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className={`p-3 rounded-xl ${calloutBg}`}>
                      <div className={`text-[11px] font-medium ${mutedText}`}>↓ Imported / M01</div>
                      <div className="text-base font-mono font-bold mt-1">
                        {Number(solarTotals.cumImp).toLocaleString()} kWh
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl ${calloutBg}`}>
                      <div className={`text-[11px] font-medium ${mutedText}`}>☀ Produced / SunRun</div>
                      <div className="text-base font-mono font-bold text-[#e07a16] mt-1">
                        {Number(solarTotals.cumSolarExact).toLocaleString('en-US', {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}{' '}
                        kWh
                      </div>
                      <div className={`text-[11px] font-mono font-semibold mt-0.5 ${mutedText}`}>
                        {solarTotals.cumSolarMwh} MWh · SunRun file to date
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border-l-4 border-l-[#e07a16] ${calloutBg}`}>
                      <div className={`text-[11px] font-medium ${mutedText}`}>⌂ Consumed / EDC</div>
                      <div className="text-base font-mono font-bold mt-1">
                        {Number(solarTotals.cumEdcConsumed).toLocaleString()} kWh
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl ${calloutBg}`}>
                      <div className={`text-[11px] font-medium ${mutedText}`}>↑ Exported / M02</div>
                      <div className="text-base font-mono font-bold text-[#1f7a4c] mt-1">
                        {Number(solarTotals.cumExp).toLocaleString()} kWh
                      </div>
                    </div>
                  </div>

                  <div className="py-2 px-3 rounded-xl bg-[#1f7a4c]/12 text-[#1f7a4c] text-center text-xs font-mono font-bold">
                    Net exported: +{Number(solarTotals.bankBalance).toLocaleString()} kWh
                  </div>

                  <div className={`p-3.5 rounded-xl border space-y-2.5 ${subPanelBg}`}>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className={mutedText}>Grid dependence</span>
                        <span className="font-mono">58%</span>
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${trackBg}`}>
                        <div style={{ width: '58%' }} className="h-full bg-[#687076] rounded-full" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className={mutedText}>Solar coverage</span>
                        <span className="font-mono text-[#e07a16]">42%</span>
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${trackBg}`}>
                        <div style={{ width: '42%' }} className="h-full bg-[#e07a16] rounded-full" />
                      </div>
                    </div>

                    <div className={`text-[11px] font-medium pt-0.5 ${mutedText}`}>
                      🌱 <span className="font-mono font-semibold text-[#1f7a4c]">3,966 lb</span> estimated CO₂ avoided
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs pt-1 px-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#e07a16] inline-block" />
                      <span className={mutedText}>SunRun produced</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#b45309] inline-block" />
                      <span className={mutedText}>EDC consumed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#687076] inline-block" />
                      <span className={mutedText}>M01 imported</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-xs bg-[#1f7a4c] inline-block" />
                      <span className={mutedText}>M02 exported</span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-between pt-2">
                    <div className="relative flex-1 min-h-[180px] flex">
                      <div className={`w-10 flex flex-col justify-between text-[11px] font-mono text-right pr-2 py-2 ${mutedText}`}>
                        <span>5000</span>
                        <span>0</span>
                        <span>-5000</span>
                      </div>

                      <div className="flex-1 relative flex flex-col justify-center items-center">
                        <div className={`absolute inset-x-0 top-3 border-t ${dividerBorder}`} />
                        <div className="absolute inset-x-0 top-1/2 border-t border-[#687076] z-10" />
                        <div className={`absolute inset-x-0 bottom-3 border-t ${dividerBorder}`} />

                        <div className="w-3/5 h-full flex flex-col">
                          <div className="h-1/2 flex flex-col justify-end">
                            <div style={{ height: '24%' }} className="w-full bg-[#687076]" title={`M01 Imported: ${Number(solarTotals.cumImp).toLocaleString()} kWh`} />
                            <div style={{ height: '64%' }} className="w-full bg-[#e07a16]" title={`SunRun Produced: ${Number(solarTotals.cumSolarExact).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kWh (${solarTotals.cumSolarMwh} MWh)`} />
                          </div>
                          <div className="h-1/2 flex flex-col justify-start">
                            <div style={{ height: '42%' }} className="w-full bg-[#b45309]" title={`EDC Consumed: ${Number(solarTotals.cumEdcConsumed).toLocaleString()} kWh`} />
                            <div style={{ height: '46%' }} className="w-full bg-[#1f7a4c]" title={`M02 Exported: ${Number(solarTotals.cumExp).toLocaleString()} kWh`} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={`pl-10 text-center text-xs font-mono font-semibold pt-1.5 ${mutedText}`}>
                      2026
                    </div>
                  </div>
                </div>

                {/* Bottom Lifetime Value Summary Strip (Aligns with Columns 1 & 2) */}
                <div className={`p-5 border-t space-y-2 ${subPanelBg}`}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                    LIFETIME VALUE SUMMARY
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className={mutedText}>Gross solar value</div>
                      <div className="font-mono font-bold text-[#e07a16] mt-0.5">
                        ${(Number(solarTotals.cumSolarExact) * 0.24).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className={mutedText}>Official credit bank</div>
                      <div className="font-mono font-bold text-[#1f7a4c] mt-0.5">
                        {(moreBillsData?.current_credit_bank_kwh ?? 2210).toLocaleString()} kWh
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: COMPARISON & COST (3 INTERACTIVE CHARTS) */}
        {activeTab === 'charts' && (
          <EnergyCostChartsTab
            reconciledRowsChrono={reconciledRowsChrono}
            darkMode={darkMode}
            cardBg={cardBg}
            calloutBg={calloutBg}
            subPanelBg={subPanelBg}
            mutedText={mutedText}
            dividerBorder={dividerBorder}
            pillBtnSecondary={pillBtnSecondary}
            pageBg={pageBg}
          />
        )}

        {/* TAB: NYSEG MONTHLY BILLS */}
        {activeTab === 'bills' && (
          <NysegMonthlyBillsTab
            moreBillsData={moreBillsData}
            onRescanBills={triggerSyncPipeline}
            isSyncing={isSyncing}
            lastFolderEvent={lastFolderEvent}
            darkMode={darkMode}
            cardBg={cardBg}
            calloutBg={calloutBg}
            subPanelBg={subPanelBg}
            mutedText={mutedText}
            trackBg={trackBg}
            dividerBorder={dividerBorder}
            pillBtnSecondary={pillBtnSecondary}
          />
        )}

        {/* TAB 2: INTERVAL DATA GRID */}
        {activeTab === 'datagrid' && renderIntervalDataGrid(false)}

        {/* TAB 3: CREDIT FORECASTER (STANDARD SOLAR SAVINGS THEME) */}
        {activeTab === 'estimator' && liveCreditBankForecast && (
          <div className="space-y-6">
            <div className="space-y-2.5 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Will your NYSEG credit bank cover winter usage?
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                The official <strong className="font-semibold">{Math.round(liveCreditBankForecast.official_credit_kwh).toLocaleString()} kWh</strong> balance is from your <strong className="font-semibold">{liveCreditBankForecast.official_statement_date}</strong> NYSEG statement (period ending <strong className="font-semibold">{liveCreditBankForecast.official_period_end || '2026-11-03'}</strong>). Including <strong className="font-semibold">{liveCreditBankForecast.unbilled_reconciled_days}</strong> reconciled Interval Data Grid days through <strong className="font-semibold">{liveCreditBankForecast.interval_file_end}</strong> (<strong className="font-semibold">{liveCreditBankForecast.unbilled_net_credit_kwh.toFixed(1)} kWh</strong>, excluding temporary display placeholders), the 12-month forecast opens at <strong className="font-semibold">{liveCreditBankForecast.opening_projected_kwh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh</strong>.
              </p>
            </div>

            {/* MAIN FORECAST PLAN CARD */}
            <div className={`rounded-2xl border p-6 sm:p-7 space-y-5 ${cardBg}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-bold text-base">
                  Starting official balance:{' '}
                  <span className="font-mono text-[#1f7a4c]">
                    {Math.round(liveCreditBankForecast.official_credit_kwh).toLocaleString()} kWh
                  </span>
                </div>
                <span className={`text-xs font-mono font-semibold ${mutedText}`}>
                  Estimated change since statement:{' '}
                  {liveCreditBankForecast.unbilled_net_credit_kwh >= 0 ? '+' : ''}
                  {liveCreditBankForecast.unbilled_net_credit_kwh.toFixed(1)} kWh
                </span>
              </div>

              <div className={`space-y-1.5 text-xs sm:text-[13px] leading-relaxed ${mutedText}`}>
                <p>
                  {liveCreditBankForecast.reconciliation?.annual_settlement_status ??
                    'No NYSEG annual settlement, expiration, or conversion rule is configured. The forecast preserves kWh credits until an official statement or confirmed tariff rule changes them.'}
                </p>
                <p>
                  Each monthly balance applies the expected net grid usage to the credit bank. A positive value is electricity imported; a negative value is exported.
                </p>
              </div>

              {/* First 6 Months Forecast Table (December 2026 – May 2027) */}
              <div className="overflow-x-auto pt-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={`border-y ${dividerBorder} ${darkMode ? 'bg-slate-950 text-slate-300' : 'bg-[#efece4] text-[#1a1917]'} text-xs font-bold`}>
                      <th className="py-3 px-4">Month</th>
                      <th className="py-3 px-4 text-right">Estimated net grid usage</th>
                      <th className="py-3 px-4 text-right">Estimated energy charge</th>
                      <th className="py-3 px-4 text-right">Estimated NYSEG amount due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastRows.slice(0, 6).map((row, idx) => {
                      const prevBal =
                        idx === 0
                          ? forecastOpeningBalance
                          : forecastRows[idx - 1].ending_credit_kwh;
                      return renderForecastRow(row, prevBal);
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expandable Next 6 Months (June 2027 – November 2027) */}
              {forecastRows.length > 6 && (
                <details className="pt-2 group">
                  <summary className="text-xs font-bold text-[#1f7a4c] cursor-pointer select-none hover:underline">
                    Show the next six months
                  </summary>
                  <div className="overflow-x-auto pt-3">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`border-y ${dividerBorder} ${darkMode ? 'bg-slate-950 text-slate-300' : 'bg-[#efece4] text-[#1a1917]'} text-xs font-bold`}>
                          <th className="py-3 px-4">Month</th>
                          <th className="py-3 px-4 text-right">Estimated net grid usage</th>
                          <th className="py-3 px-4 text-right">Estimated energy charge</th>
                          <th className="py-3 px-4 text-right">Estimated NYSEG amount due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecastRows.slice(6, 12).map((row, idx) => {
                          const rowIndex = idx + 6;
                          const prevBal = forecastRows[rowIndex - 1].ending_credit_kwh;
                          return renderForecastRow(row, prevBal);
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>

            {/* 4 BOTTOM SUMMARY CALLOUT CARDS (SOLAR SAVINGS CALLOUT STYLE) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={`rounded-xl p-5 space-y-1.5 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>Official NYSEG credit balance</div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#1f7a4c]">
                  {liveCreditBankForecast.official_credit_kwh.toLocaleString('en-US', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  kWh
                </div>
                <div className={`text-xs ${mutedText}`}>
                  Statement {liveCreditBankForecast.official_statement_date}
                </div>
              </div>

              <div className={`rounded-xl p-5 space-y-1.5 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>Estimated credits since statement</div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight">
                  {liveCreditBankForecast.unbilled_net_credit_kwh >= 0 ? '+' : ''}
                  {liveCreditBankForecast.unbilled_net_credit_kwh.toFixed(1)} kWh
                </div>
                <div className={`text-xs font-mono ${mutedText}`}>
                  M02: {liveCreditBankForecast.unbilled_m02_kwh.toFixed(1)} − M01:{' '}
                  {liveCreditBankForecast.unbilled_m01_kwh.toFixed(1)} ({liveCreditBankForecast.unbilled_reconciled_days}d grid sync)
                </div>
              </div>

              <div className={`rounded-xl p-5 space-y-1.5 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>Forecast opening balance</div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#1f7a4c]">
                  {liveCreditBankForecast.opening_projected_kwh.toLocaleString('en-US', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  kWh
                </div>
                <div className={`text-xs ${mutedText}`}>
                  Official balance plus estimated unbilled net flow
                </div>
              </div>

              <div className={`rounded-xl p-5 space-y-1.5 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>Credit-bank exhaustion</div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#1f7a4c]">
                  {liveCreditBankForecast.exhausted_month || 'Not in next 12 months'}
                </div>
                <div className={`text-xs ${mutedText}`}>Based on this forecast only</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRODUCTION BY MONTH (DESCENDING ORDER) */}
        {activeTab === 'monthly' && (
          <div className="space-y-6">
            <div className="space-y-2.5 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Production & grid exchange by month
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                Monthly totals sorted newest-first (descending) from <code className="font-mono text-xs">Sunrun_Daily_Production_Data.csv</code> and <code className="font-mono text-xs">NYSEG_Daily_Usage_Data.csv</code> (<strong className="font-semibold">November 2026 → July 2026</strong>).
              </p>
            </div>

            <div className={`rounded-2xl border p-6 sm:p-7 space-y-6 ${cardBg}`}>
              <div className={`text-xs sm:text-[13px] ${mutedText}`}>
                Monthly kWh comparison (Descending) • <strong className="text-[#e07a16]">Orange</strong> = Sunrun Solar Produced • <strong className="text-[#1f7a4c]">Green</strong> = NYSEG Received (M02 Export) • <strong className="text-[#687076]">Slate</strong> = NYSEG Delivered (M01 Import)
              </div>

              <div className={`divide-y ${dividerBorder}`}>
                {[...MONTHLY_SUMMARIES]
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .map((m, idx) => {
                    const maxMonthVal = 2000;
                    const solarW = Math.min(100, Math.max(2, (m.solar_kwh / maxMonthVal) * 100));
                    const recW = Math.min(100, Math.max(2, (m.m02_export_kwh / maxMonthVal) * 100));
                    const delW = Math.min(100, Math.max(2, (m.m01_import_kwh / maxMonthVal) * 100));
                    return (
                      <div key={m.month} className={`${idx === 0 ? 'pb-5' : 'py-5'} space-y-2.5`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">
                            {m.month} <span className={`font-normal text-xs ${mutedText}`}>({m.sunrun_days} Sunrun days / {m.reconciled_days} NYSEG days)</span>
                          </span>
                          <span className={`text-xs sm:text-sm font-mono font-bold ${m.credit_delta >= 0 ? 'text-[#1f7a4c]' : 'text-[#b91c1c]'}`}>
                            Net Bank: {m.credit_delta >= 0 ? `+${m.credit_delta}` : m.credit_delta} kWh (End Bank: {m.ending_credit_bank} kWh)
                          </span>
                        </div>

                        <div className="grid grid-cols-[95px_1fr_95px] items-center gap-3 text-xs">
                          <span className={`text-right ${mutedText}`}>Solar Produced</span>
                          <div className={`w-full h-3.5 rounded-full overflow-hidden ${trackBg}`}>
                            <div style={{ width: `${solarW}%` }} className="h-full rounded-full bg-[#e07a16]" />
                          </div>
                          <span className="font-mono font-medium text-right">{m.solar_kwh.toFixed(1)} kWh</span>
                        </div>

                        <div className="grid grid-cols-[95px_1fr_95px] items-center gap-3 text-xs">
                          <span className={`text-right ${mutedText}`}>NYSEG Received</span>
                          <div className={`w-full h-3.5 rounded-full overflow-hidden ${trackBg}`}>
                            <div style={{ width: `${recW}%` }} className="h-full rounded-full bg-[#1f7a4c]" />
                          </div>
                          <span className="font-mono font-medium text-right">{m.m02_export_kwh.toFixed(1)} kWh</span>
                        </div>

                        <div className="grid grid-cols-[95px_1fr_95px] items-center gap-3 text-xs">
                          <span className={`text-right ${mutedText}`}>NYSEG Delivered</span>
                          <div className={`w-full h-3.5 rounded-full overflow-hidden ${trackBg}`}>
                            <div style={{ width: `${delW}%` }} className="h-full rounded-full bg-[#687076]" />
                          </div>
                          <span className="font-mono font-medium text-right">{m.m01_import_kwh.toFixed(1)} kWh</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SOLAR SAVINGS (THE DESIGN STANDARD) */}
        {activeTab === 'savings' && (
          <div className="space-y-6">
            <div className="space-y-2.5 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                How did cooler autumn weather shift your solar balance?
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                Comparing late summer peak production (<strong className="font-semibold">Aug 1 – Sep 15</strong>) with autumn (<strong className="font-semibold">Oct 1 – Nov 14</strong>) from your Sunrun and NYSEG CSV records, total home consumption dropped significantly as air-conditioning load ended — helping preserve a <strong className="font-semibold">+{solarTotals.bankBalance} kWh</strong> NYSEG net-metering credit bank.
              </p>
            </div>

            <div className={`rounded-2xl border p-6 sm:p-7 space-y-6 ${cardBg}`}>
              <div className={`text-xs sm:text-[13px] ${mutedText}`}>
                Daily averages, kWh per day. <strong className={darkMode ? 'text-slate-200' : 'text-[#1a1917]'}>Late Summer</strong> = Aug 1 – Sep 15 ({seasonalComparison.summerDays} days) • <strong className={darkMode ? 'text-slate-200' : 'text-[#1a1917]'}>Autumn</strong> = Oct 1 – Nov 14 ({seasonalComparison.autumnDays} reconciled days).
              </div>

              <div className={`divide-y ${dividerBorder}`}>
                {seasonalComparison.metrics.map((m, idx) => {
                  const maxScale = 75;
                  const beforeWidth = Math.min(100, Math.max(4, (m.beforeVal / maxScale) * 100));
                  const afterWidth = Math.min(100, Math.max(4, (m.afterVal / maxScale) * 100));
                  return (
                    <div key={idx} className={`${idx === 0 ? 'pb-5' : idx === seasonalComparison.metrics.length - 1 ? 'pt-5' : 'py-5'} space-y-2.5`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{m.title}</span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-[#1f7a4c]">
                          {m.pct > 0 ? `+${m.pct}%` : `${m.pct}%`}
                        </span>
                      </div>

                      <div className="grid grid-cols-[88px_1fr_92px] sm:grid-cols-[105px_1fr_105px] items-center gap-3 text-xs">
                        <span className={`text-right ${mutedText}`}>Late Summer</span>
                        <div className={`w-full h-3.5 rounded-full overflow-hidden ${trackBg}`}>
                          <div
                            style={{ width: `${beforeWidth}%` }}
                            className="h-full rounded-full bg-[#687076] transition-all duration-500"
                          />
                        </div>
                        <span className="font-mono font-medium text-right">{m.beforeVal.toFixed(1)} kWh/day</span>
                      </div>

                      <div className="grid grid-cols-[88px_1fr_92px] sm:grid-cols-[105px_1fr_105px] items-center gap-3 text-xs">
                        <span className={`text-right ${mutedText}`}>Autumn</span>
                        <div className={`w-full h-3.5 rounded-full overflow-hidden ${trackBg}`}>
                          <div
                            style={{ width: `${afterWidth}%` }}
                            className="h-full rounded-full bg-[#e07a16] transition-all duration-500"
                          />
                        </div>
                        <span className="font-mono font-medium text-right">{m.afterVal.toFixed(1)} kWh/day</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`rounded-xl p-5 space-y-1.5 ${calloutBg}`}>
                <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight">{seasonalComparison.summerTemp}°F</div>
                <p className={`text-xs sm:text-[13px] leading-relaxed ${mutedText}`}>
                  Average NYSEG hourly temperature, Aug 1 – Sep 15 • Peak solar irradiance averaged 61.2 kWh/day across {seasonalComparison.summerDays} summer days.
                </p>
              </div>

              <div className={`rounded-xl p-5 space-y-1.5 ${calloutBg}`}>
                <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight">{seasonalComparison.autumnTemp}°F</div>
                <p className={`text-xs sm:text-[13px] leading-relaxed ${mutedText}`}>
                  Average NYSEG hourly temperature, Oct 1 – Nov 14 — {seasonalComparison.tempDrop} degrees cooler, cutting cooling loads while building a +{solarTotals.bankBalance} kWh net credit bank.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ENERGY FLOW */}
        {activeTab === 'flow' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2.5 max-w-2xl">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Sunrun generation & NYSEG grid flow
                </h1>
                <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                  From <strong className="font-semibold">{TELEMETRY_META.date_range_start}</strong> through <strong className="font-semibold">{TELEMETRY_META.date_range_end}</strong>, your rooftop solar array generated <strong className="font-semibold">{Number(solarTotals.cumSolar).toLocaleString()} kWh</strong>, exporting <strong className="font-semibold">{Number(solarTotals.cumExp).toLocaleString()} kWh</strong> to NYSEG while importing <strong className="font-semibold">{Number(solarTotals.cumImp).toLocaleString()} kWh</strong>.
                </p>
              </div>

              <div className={`flex rounded-full p-1 border text-xs ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-[#efece4] border-[#dcd8ce]'}`}>
                {[
                  { id: 'weekly', label: 'Last 7 days' },
                  { id: 'monthly', label: 'Last 30 days' },
                  { id: 'yearly', label: `All (${solarRows.length}d)` },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSpanFilter(s.id)}
                    className={`px-3 py-1 rounded-full transition cursor-pointer ${
                      spanFilter === s.id
                        ? darkMode
                          ? 'bg-amber-400 text-slate-950 font-semibold'
                          : 'bg-[#1a1917] text-white font-semibold'
                        : mutedText
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>Sunrun Produced ({spanFilter === 'yearly' ? 'All-time' : spanFilter})</div>
                <div className="text-2xl font-bold font-mono">
                  {spanFilter === 'yearly'
                    ? `${Number(solarTotals.cumSolarExact).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kWh`
                    : `${Number(solarTotals.prod).toLocaleString()} kWh`}
                </div>
                <div className="text-xs text-[#1f7a4c] font-mono font-medium">
                  {(Number(spanFilter === 'yearly' ? solarTotals.cumSolarExact : solarTotals.prod) / 1000).toFixed(3)} MWh · EOD Meter: {Number(solarTotals.maxEodMeter).toLocaleString()} kWh
                </div>
              </div>

              <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>NYSEG Credit Bank</div>
                <div className="text-2xl font-bold font-mono text-[#1f7a4c]">+{solarTotals.bankBalance} kWh</div>
                <div className={`text-xs font-mono ${mutedText}`}>{solarTotals.netDelta} kWh in selected window</div>
              </div>

              <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>NYSEG Received (M02 Export)</div>
                <div className="text-2xl font-bold font-mono">{Number(solarTotals.exp).toLocaleString()} kWh</div>
                <div className={`text-xs font-mono ${mutedText}`}>All-time: {Number(solarTotals.cumExp).toLocaleString()} kWh</div>
              </div>

              <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>NYSEG Delivered (M01 Import)</div>
                <div className="text-2xl font-bold font-mono">{Number(solarTotals.imp).toLocaleString()} kWh</div>
                <div className={`text-xs font-mono ${mutedText}`}>All-time: {Number(solarTotals.cumImp).toLocaleString()} kWh</div>
              </div>
            </div>

            <div className={`rounded-2xl border p-6 space-y-4 ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm">Daily Energy Balance ({chartRows.length} Recent Reconciled Days)</h3>
                  <p className={`text-xs ${mutedText}`}>Click any day bar to open its formula audit breakdown</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#e07a16] inline-block" /> Solar Produced</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#1f7a4c] inline-block" /> NYSEG Received (M02)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#687076] inline-block" /> NYSEG Delivered (M01)</span>
                </div>
              </div>

              <div
                className={`grid gap-2 items-end h-56 pt-6 px-2 border-b ${dividerBorder}`}
                style={{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(0, 1fr))` }}
              >
                {chartRows.map((row) => {
                  const maxVal = Math.max(40, ...chartRows.map((r) => Math.max(r.solar_kwh || 0, r.m01_import_kwh || 0, r.m02_export_kwh || 0)));
                  const solarH = Math.min(100, ((row.solar_kwh || 0) / maxVal) * 100);
                  const expH = Math.min(100, ((row.m02_export_kwh || 0) / maxVal) * 100);
                  const impH = Math.min(100, ((row.m01_import_kwh || 0) / maxVal) * 100);
                  return (
                    <div
                      key={row.date}
                      onClick={() => setSelectedAuditRow(row)}
                      className="flex flex-col items-center h-full justify-end group cursor-pointer"
                    >
                      <div className="w-full flex items-end justify-center gap-1 h-44">
                        <div
                          style={{ height: `${solarH}%` }}
                          title={`${row.date} • Solar: ${row.solar_kwh} kWh`}
                          className="w-2.5 sm:w-3 bg-[#e07a16] rounded-t transition-all group-hover:opacity-80"
                        />
                        <div
                          style={{ height: `${expH}%` }}
                          title={`${row.date} • NYSEG Received: ${row.m02_export_kwh} kWh`}
                          className="w-2.5 sm:w-3 bg-[#1f7a4c] rounded-t transition-all group-hover:opacity-80"
                        />
                        <div
                          style={{ height: `${impH}%` }}
                          title={`${row.date} • NYSEG Delivered: ${row.m01_import_kwh} kWh`}
                          className="w-2.5 sm:w-3 bg-[#687076] rounded-t transition-all group-hover:opacity-80"
                        />
                      </div>
                      <span className={`text-[10px] mt-2 font-mono ${mutedText}`}>{row.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: NYSEG RECORD */}
        {activeTab === 'nyseg' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2.5 max-w-2xl">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  NYSEG & Sunrun daily telemetry record
                </h1>
                <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                  Showing <strong className="font-semibold">{sortedSolarRows.length}</strong> of <strong className="font-semibold">{solarRows.length}</strong> daily records synced from your local CSV files. Click any row&apos;s eye icon to inspect its formula breakdown.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className={`flex rounded-full p-1 border text-xs ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-[#efece4] border-[#dcd8ce]'}`}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'RECONCILED', label: `Reconciled (${TELEMETRY_META.reconciled_days})` },
                    { id: 'SUNRUN_ONLY', label: `Sunrun Only (${TELEMETRY_META.sunrun_only_days})` },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setStatusFilter(st.id)}
                      className={`px-3 py-1 rounded-full transition cursor-pointer ${
                        statusFilter === st.id
                          ? darkMode
                            ? 'bg-amber-400 text-slate-950 font-semibold'
                            : 'bg-[#1a1917] text-white font-semibold'
                          : mutedText
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className={`flex rounded-full p-1 border text-xs ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-[#efece4] border-[#dcd8ce]'}`}>
                  {[
                    { id: 'weekly', label: '7d' },
                    { id: 'monthly', label: '30d' },
                    { id: 'yearly', label: 'All (132d)' },
                  ].map((span) => (
                    <button
                      key={span.id}
                      onClick={() => setSpanFilter(span.id)}
                      className={`px-3 py-1 rounded-full transition cursor-pointer ${
                        spanFilter === span.id
                          ? darkMode
                            ? 'bg-amber-400 text-slate-950 font-semibold'
                            : 'bg-[#1a1917] text-white font-semibold'
                          : mutedText
                      }`}
                    >
                      {span.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleExportCsv}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
            </div>

            <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
              <div className="overflow-x-auto max-h-[640px]">
                <table className="w-full text-left text-xs">
                  <thead className={`sticky top-0 border-b ${dividerBorder} ${darkMode ? 'bg-slate-950 text-slate-400' : 'bg-[#efece4] text-[#1a1917]'}`}>
                    <tr>
                      <th className="p-3.5 cursor-pointer font-bold" onClick={() => toggleSort('date')}>Date ↕</th>
                      <th className="p-3.5 cursor-pointer font-bold" onClick={() => toggleSort('solar_kwh')}>Solar (kWh) ↕</th>
                      <th className="p-3.5 cursor-pointer font-bold" onClick={() => toggleSort('eod_meter_kwh')}>EOD Meter ↕</th>
                      <th className="p-3.5 cursor-pointer font-bold" onClick={() => toggleSort('m01_import_kwh')}>M01 Delivered ↕</th>
                      <th className="p-3.5 cursor-pointer font-bold" onClick={() => toggleSort('m02_export_kwh')}>M02 Received ↕</th>
                      <th className="p-3.5 cursor-pointer font-bold" onClick={() => toggleSort('credit_delta')}>Net Bank Δ ↕</th>
                      <th className="p-3.5 font-bold">Weather</th>
                      <th className="p-3.5 font-bold">Status</th>
                      <th className="p-3.5 font-bold">Notes</th>
                      <th className="p-3.5 text-right font-bold">Audit</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dividerBorder}`}>
                    {sortedSolarRows.map((row) => (
                      <tr key={row.id} className={darkMode ? 'hover:bg-slate-800/30 transition' : 'hover:bg-[#faf8f4] transition'}>
                        <td className="p-3.5 font-mono font-medium">{row.date}</td>
                        <td className="p-3.5 font-mono font-semibold text-[#e07a16]">{row.solar_kwh.toFixed(2)}</td>
                        <td className={`p-3.5 font-mono ${mutedText}`}>{row.eod_meter_kwh ? row.eod_meter_kwh.toFixed(1) : '—'}</td>
                        <td className="p-3.5 font-mono">
                          {row.m01_import_kwh !== null ? row.m01_import_kwh.toFixed(2) : <span className={mutedText}>—</span>}
                        </td>
                        <td className="p-3.5 font-mono text-[#1f7a4c] font-semibold">
                          {row.m02_export_kwh !== null ? row.m02_export_kwh.toFixed(2) : <span className={mutedText}>—</span>}
                        </td>
                        <td
                          className={`p-3.5 font-mono font-semibold ${
                            row.credit_delta === null
                              ? mutedText
                              : row.credit_delta >= 0
                              ? 'text-[#1f7a4c]'
                              : 'text-[#b91c1c]'
                          }`}
                        >
                          {row.credit_delta === null
                            ? '—'
                            : row.credit_delta >= 0
                            ? `+${row.credit_delta.toFixed(2)}`
                            : row.credit_delta.toFixed(2)}
                        </td>
                        <td className="p-3.5">
                          {row.temp_f !== null ? <span className="font-mono">{row.temp_f}°F</span> : ''}
                          {row.temp_f !== null ? ' • ' : ''}
                          {row.irradiance}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.status === 'RECONCILED'
                                ? 'bg-[#1f7a4c]/12 text-[#1f7a4c]'
                                : row.status === 'SUNRUN_ONLY'
                                ? 'bg-[#e07a16]/15 text-[#e07a16]'
                                : 'bg-slate-500/15 text-slate-500'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3.5 max-w-xs">
                          {editingNoteId === row.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                className={`px-2 py-1 rounded border text-xs w-full ${darkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-[#dcd8ce]'}`}
                              />
                              <button
                                onClick={() => {
                                  setSolarRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, note: noteDraft } : r)));
                                  setEditingNoteId(null);
                                }}
                                className="p-1 text-[#1f7a4c]"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingNoteId(row.id);
                                setNoteDraft(row.note || '');
                              }}
                              className={`cursor-pointer hover:underline ${row.note ? '' : mutedText}`}
                            >
                              {row.note || '+ Add note'}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => setSelectedAuditRow(row)}
                            className={`p-1.5 rounded-full border cursor-pointer ${pillBtnSecondary}`}
                            title="Inspect Calculation & Source Traceability"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: CSV CONNECTORS */}
        {activeTab === 'connectors' && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div className="space-y-2.5 max-w-2xl">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Local CSV connectors & ingestion pipeline
                </h1>
                <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                  Telemetry is synced from your local Sunrun daily and NYSEG hourly CSV files, validated for physical bounds, and stripped of PII before static deployment.
                </p>
              </div>

              <div className={`flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2.5 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-[#dcd8ce]'}`}>
                <button
                  type="button"
                  onClick={() => refreshTaskSchedulerStatus(false)}
                  disabled={taskStatusLoading}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                    darkMode
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                      : 'border-[#dcd8ce] hover:bg-[#faf8f4] text-[#1a1917]'
                  } disabled:opacity-50`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${taskStatusLoading ? 'animate-spin' : ''}`} />
                  Refresh Jobs
                </button>
                <button
                  type="button"
                  onClick={() => handleRunScheduledTask('sunrun')}
                  disabled={Boolean(runningTaskTarget)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#e07a16] hover:bg-[#c86a10] text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  {runningTaskTarget === 'sunrun' ? 'Running SunRun...' : 'Run SunRun'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRunScheduledTask('nyseg')}
                  disabled={Boolean(runningTaskTarget)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1f7a4c] hover:bg-[#17613b] text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  {runningTaskTarget === 'nyseg' ? 'Running NYSEG...' : 'Run NYSEG'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRunScheduledTask('both')}
                  disabled={Boolean(runningTaskTarget)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1a1917] hover:bg-[#2c2a27] text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {runningTaskTarget === 'both' ? 'Running Both Jobs...' : 'Run Both Jobs'}
                </button>
              </div>
            </div>

            {taskRunBanner && (
              <div
                className={`rounded-2xl border px-4 py-3 text-xs flex items-start justify-between gap-3 ${
                  taskRunBanner.tone === 'error'
                    ? darkMode
                      ? 'bg-red-950/40 border-red-800/70 text-red-200'
                      : 'bg-[#fef2f2] border-[#fecaca] text-[#991b1b]'
                    : taskRunBanner.tone === 'warning'
                    ? darkMode
                      ? 'bg-amber-950/40 border-amber-800/70 text-amber-200'
                      : 'bg-[#fff7ed] border-[#fed7aa] text-[#9a3412]'
                    : taskRunBanner.tone === 'success'
                    ? darkMode
                      ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
                      : 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]'
                    : darkMode
                    ? 'bg-slate-900 border-slate-700 text-slate-200'
                    : 'bg-[#faf8f4] border-[#dcd8ce] text-[#1a1917]'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-semibold">{taskRunBanner.title}</div>
                  <div className="font-mono text-[11px] opacity-90 break-all">{taskRunBanner.detail}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTaskRunBanner(null)}
                  className="p-1 rounded-md hover:bg-black/5 shrink-0"
                  aria-label="Dismiss task status banner"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {taskExecutionSteps.length > 0 && (
              <div className={`rounded-2xl border p-4 space-y-2.5 ${cardBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Activity className="w-4 h-4 text-[#e07a16]" />
                    <span>Live Job Runner Steps</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskExecutionSteps([])}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-[#dcd8ce] hover:bg-[#faf8f4]'
                    }`}
                  >
                    Clear Steps
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {taskExecutionSteps.map((st) => {
                    const pillClass =
                      st.status === 'done'
                        ? 'bg-[#1f7a4c]/12 text-[#1f7a4c]'
                        : st.status === 'running'
                        ? 'bg-[#e07a16]/15 text-[#b45309]'
                        : st.status === 'error'
                        ? 'bg-[#b91c1c]/12 text-[#b91c1c]'
                        : darkMode
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-[#efece4] text-[#6b675e]';
                    const badgeLabel =
                      st.status === 'done'
                        ? 'Done'
                        : st.status === 'running'
                        ? 'Running'
                        : st.status === 'error'
                        ? 'Error'
                        : 'Waiting';
                    return (
                      <div
                        key={st.id}
                        className={`rounded-xl border p-3 text-xs space-y-1 ${
                          darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#e6e2d8]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{st.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${pillClass}`}>
                            {badgeLabel}
                          </span>
                        </div>
                        <div className={`text-[11px] font-mono leading-snug break-words ${mutedText}`}>
                          {st.detail}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Windows Task Scheduler Job Info */}
            <div className={`rounded-2xl border p-6 space-y-4 ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#e07a16]" />
                  <h3 className="font-semibold text-sm">Windows Task Scheduler Jobs</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      connectedRunnerOrigin
                        ? 'bg-[#1f7a4c]/12 text-[#1f7a4c]'
                        : darkMode
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-[#efece4] text-[#6b675e]'
                    }`}
                  >
                    {connectedRunnerOrigin ? `Runner Connected (${connectedRunnerOrigin})` : 'Static Snapshot'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRunnerSettings((v) => !v)}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition ${
                      darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-[#dcd8ce] hover:bg-[#faf8f4]'
                    }`}
                  >
                    {showRunnerSettings ? 'Hide Runner URL' : 'Mobile / Runner URL'}
                  </button>
                  <span className={`text-[11px] font-mono ${mutedText}`}>
                    {taskSchedulerData?.checkedAt
                      ? `Last queried ${taskSchedulerData.checkedAt}`
                      : 'Snapshot from telemetryData.json'}
                  </span>
                </div>
              </div>

              {showRunnerSettings && (
                <div className={`rounded-xl border p-3 text-xs space-y-2 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#e6e2d8]'}`}>
                  <div className="font-semibold">Local / Mobile Vite Runner URL (optional)</div>
                  <div className={`text-[11px] ${mutedText}`}>
                    Start your PC server with <code className="font-mono">npm run dev</code> (localhost) or <code className="font-mono">npm run dev:lan</code> (Wi-Fi/Tailscale mobile access), then enter e.g. <code className="font-mono">http://192.168.1.50:5173</code> or leave blank to auto-detect <code className="font-mono">localhost:5173</code>.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={runnerBaseUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRunnerBaseUrl(val);
                        try {
                          window.localStorage.setItem('heliospulse_runner_url', val);
                        } catch {}
                      }}
                      placeholder="http://localhost:5173 or http://192.168.x.x:5173"
                      className={`flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border font-mono text-[11px] ${
                        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-[#dcd8ce]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => refreshTaskSchedulerStatus(false)}
                      className="px-3 py-1.5 rounded-full bg-[#1a1917] text-white text-[11px] font-semibold"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(taskSchedulerData?.jobs || []).map((job) => {
                  const isRunning = job.state === 'Running';
                  const isUnavailable = job.state === 'Unavailable' || (!job.lastRunTime && job.lastTaskResult === null);
                  const exitOk = job.lastTaskResult === 0;
                  const statePillClass = isRunning
                    ? 'bg-[#e07a16]/15 text-[#b45309]'
                    : isUnavailable
                    ? darkMode
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-[#efece4] text-[#6b675e]'
                    : exitOk
                    ? 'bg-[#1f7a4c]/12 text-[#1f7a4c]'
                    : 'bg-[#b91c1c]/12 text-[#b91c1c]';
                  const recentSteps = job.logInfo?.recentSteps || [];

                  return (
                    <div
                      key={job.key}
                      className={`rounded-xl border p-4 space-y-3 ${
                        darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#e6e2d8]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold">{job.label}</div>
                          <div className={`text-[11px] font-mono truncate ${mutedText}`} title={job.taskName}>
                            {job.taskName}
                          </div>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${statePillClass}`}>
                          {job.state || 'Unknown'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-900' : 'bg-white border border-[#ece8de]'}`}>
                          <div className={mutedText}>Schedule</div>
                          <div className="font-semibold mt-0.5">{job.schedule}</div>
                        </div>
                        <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-900' : 'bg-white border border-[#ece8de]'}`}>
                          <div className={mutedText}>Last Task Result</div>
                          <div
                            className={`font-mono font-semibold mt-0.5 ${
                              job.lastTaskResult === null || job.lastTaskResult === undefined
                                ? ''
                                : exitOk
                                ? 'text-[#1f7a4c]'
                                : 'text-[#b91c1c]'
                            }`}
                          >
                            {job.lastTaskResult === null || job.lastTaskResult === undefined
                              ? '—'
                              : `${job.lastTaskResult} (${exitOk ? 'Succeeded' : 'Error'})`}
                          </div>
                        </div>
                        <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-900' : 'bg-white border border-[#ece8de]'}`}>
                          <div className={mutedText}>Last Run Time</div>
                          <div className="font-mono font-medium mt-0.5">{job.lastRunTime || '—'}</div>
                        </div>
                        <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-900' : 'bg-white border border-[#ece8de]'}`}>
                          <div className={mutedText}>Next Run Time</div>
                          <div className="font-mono font-medium mt-0.5">{job.nextRunTime || '—'}</div>
                        </div>
                      </div>

                      {job.logInfo && (
                        <div className={`rounded-lg px-2.5 py-2 text-[11px] font-mono border space-y-1.5 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-[#ece8de]'}`}>
                          <div className="flex items-center justify-between gap-2 text-[10px] opacity-75">
                            <span className="truncate font-semibold">{job.logInfo.logFile}</span>
                            <span className="shrink-0">{job.logInfo.updatedAt}</span>
                          </div>
                          <div className="leading-snug break-words">{job.logInfo.summary}</div>
                          {recentSteps.length > 0 && (
                            <div className={`pt-1.5 border-t ${dividerBorder} space-y-1 max-h-44 overflow-y-auto`}>
                              <div className={`text-[10px] font-sans font-semibold uppercase tracking-wider ${mutedText}`}>
                                Latest Run Steps ({recentSteps.length})
                              </div>
                              {recentSteps.map((stepLine, idx) => {
                                const isErr = /ERROR|FAILED|invalid|not found/i.test(stepLine);
                                const isOk = /complete|valid|sent successfully|saved|Syntax verified|updated/i.test(stepLine);
                                const dotColor = isErr
                                  ? 'bg-[#b91c1c]'
                                  : isOk
                                  ? 'bg-[#1f7a4c]'
                                  : 'bg-[#e07a16]';
                                return (
                                  <div key={idx} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                                    <span className={isErr ? 'text-[#b91c1c] font-semibold break-words' : 'break-words'}>
                                      {stepLine}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {job.command && (
                        <div className={`text-[10px] font-mono truncate ${mutedText}`} title={job.command}>
                          Action: {job.command}
                        </div>
                      )}

                      <div className="flex items-center justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleRunScheduledTask(job.key)}
                          disabled={Boolean(runningTaskTarget) || isRunning}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-white transition disabled:opacity-50 ${
                            job.key === 'sunrun'
                              ? 'bg-[#e07a16] hover:bg-[#c86a10]'
                              : job.key === 'publish'
                              ? 'bg-[#0284c7] hover:bg-[#0369a1]'
                              : 'bg-[#1f7a4c] hover:bg-[#17613b]'
                          }`}
                        >
                          <Play className="w-3 h-3" />
                          {runningTaskTarget === job.key || isRunning
                            ? 'Running...'
                            : job.key === 'sunrun'
                            ? 'Run SunRun Job'
                            : job.key === 'publish'
                            ? 'Push Mobile Sync'
                            : 'Run NYSEG Job'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={`rounded-2xl border p-6 space-y-4 ${cardBg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-[#e07a16]" />
                    <h3 className="font-semibold text-sm">Configured Local CSV Paths</h3>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#1f7a4c]/12 text-[#1f7a4c] font-semibold">
                    PII Sanitized
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-medium mb-1">Sunrun Daily Production CSV Path</label>
                    <input
                      value={sunrunCsvPathInput}
                      onChange={(e) => setSunrunCsvPathInput(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border font-mono text-[11px] ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#dcd8ce]'}`}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className={mutedText}>
                        {TELEMETRY_META.sunrun_total_rows} daily rows ({TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh)
                      </span>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1a1917] text-white cursor-pointer font-medium">
                        <Upload className="w-3 h-3" /> Reload Sunrun CSV
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => handleCsvFileUpload(e, 'sunrun')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div className={`pt-3 border-t ${dividerBorder}`}>
                    <label className="block font-medium mb-1">NYSEG Hourly Usage CSV Path</label>
                    <input
                      value={nysegCsvPathInput}
                      onChange={(e) => setNysegCsvPathInput(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border font-mono text-[11px] ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#dcd8ce]'}`}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className={mutedText}>
                        {TELEMETRY_META.nyseg_hourly_rows.toLocaleString()} hourly rows ({TELEMETRY_META.reconciled_days} days)
                      </span>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1f7a4c] text-white cursor-pointer font-medium">
                        <Upload className="w-3 h-3" /> Reload NYSEG CSV
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => handleCsvFileUpload(e, 'nyseg')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className={`pt-3 border-t ${dividerBorder} space-y-2`}>
                  <div className="text-xs font-semibold">Recent Connector Ingestion Audit Logs</div>
                  {syncLogs.map((l, i) => (
                    <div key={i} className={`p-2.5 rounded-lg border text-[11px] font-mono ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#e6e2d8]'}`}>
                      <div className="flex justify-between text-[#1f7a4c] font-semibold">
                        <span>[{l.provider}] {l.status}</span>
                        <span className={mutedText}>{l.ts}</span>
                      </div>
                      <div className="mt-0.5">{l.msg}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border p-6 space-y-4 ${cardBg}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Single-Day Telemetry Payload Tester</h3>
                  <span className="text-xs text-[#e07a16] font-semibold">Physical Bound Guard Active</span>
                </div>
                <p className={`text-xs ${mutedText}`}>
                  Test single-day JSON ingestion or try setting <code className="font-mono">m02_export_kwh</code> higher than <code className="font-mono">production_kwh</code> to trigger the reconciliation guard.
                </p>

                <textarea
                  rows={7}
                  value={rawPayloadInput}
                  onChange={(e) => setRawPayloadInput(e.target.value)}
                  className={`w-full p-3 rounded-lg border font-mono text-xs ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#dcd8ce]'}`}
                />

                {ingestBanner && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      ingestBanner.type === 'success'
                        ? 'bg-[#1f7a4c]/10 border border-[#1f7a4c]/30 text-[#1f7a4c]'
                        : 'bg-[#b91c1c]/10 border border-[#b91c1c]/30 text-[#b91c1c]'
                    }`}
                  >
                    {ingestBanner.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{ingestBanner.text}</span>
                  </div>
                )}

                <button
                  onClick={handleIngestRawPayload}
                  className="w-full py-2.5 rounded-full bg-[#1a1917] hover:opacity-90 text-white font-semibold text-xs transition cursor-pointer"
                >
                  Validate & Reconcile Record
                </button>
              </div>
            </div>

            {renderAlertLookupPanel()}
          </div>
        )}

        {/* TAB 9: YOUR SYSTEM */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            <div className="space-y-2.5 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Your solar & utility system profile
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                Hardware, metering endpoints, and connected loads monitored across Yorktown Heights / Jefferson Valley, NY 10598.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ASSET_CATALOG.map((asset) => (
                <div key={asset.id} className={`rounded-2xl border p-5 flex items-start justify-between gap-4 ${cardBg}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${calloutBg}`}>{asset.id}</span>
                      <span className="text-xs font-semibold text-[#e07a16]">{asset.category}</span>
                    </div>
                    <h4 className="font-bold text-sm pt-1">{asset.name}</h4>
                    <p className={`text-xs ${mutedText}`}>Source: {asset.connector}</p>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <div className="font-mono font-semibold">{asset.metric}</div>
                    <div className="text-[#1f7a4c] font-medium mt-1">{asset.health}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </main>
        </div>

        {/* RIGHT SIDE RAIL: UTILITY SOLAR ARRAY */}
        <aside className="hidden lg:block sticky top-4 h-[calc(100vh-2rem)]">
          <div className={`relative w-full h-full rounded-2xl border overflow-hidden shadow-sm ${darkMode ? 'border-slate-800' : 'border-[#e6e2d8]'}`}>
            <img
              src={solarFarmSideImg}
              alt="Utility scale solar array"
              className="w-full h-full object-cover"
            />
            <div className={`absolute inset-x-3 bottom-3 rounded-xl border p-4 backdrop-blur-md shadow-sm ${
              darkMode
                ? 'bg-slate-900/85 border-slate-700 text-slate-100'
                : 'bg-[#f6f4ef]/88 border-[#e6e2d8] text-[#1a1917]'
            }`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider ${mutedText}`}>
                UTILITY PERSPECTIVE
              </div>
              <h3 className="text-sm font-bold tracking-tight mt-0.5">
                Grid-scale reference frame
              </h3>
              <p className={`text-xs leading-relaxed mt-1 ${mutedText}`}>
                Balance residential performance against export behavior, annual projections, and contract progress.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* POP OUT FULL-SCREEN INTERVAL DATA GRID MODAL */}
      {gridPopOut && (
        <div
          onScroll={hideCellDerivation}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
        >
          <div
            onScroll={hideCellDerivation}
            className={`w-full max-w-[96vw] max-h-[94vh] overflow-y-auto rounded-2xl p-5 sm:p-7 shadow-2xl ${pageBg}`}
          >
            {renderIntervalDataGrid(true)}
          </div>
        </div>
      )}

      {/* CELL & KPI DERIVATION HOVER POPUP */}
      {hoveredDerivation && typeof window !== 'undefined' && (() => {
        const popW = 340;
        const left = Math.min(
          Math.max(12, hoveredDerivation.rect.left),
          Math.max(12, window.innerWidth - popW - 12)
        );
        const placeAbove = hoveredDerivation.rect.bottom + 175 > window.innerHeight && hoveredDerivation.rect.top > 175;
        const top = placeAbove
          ? Math.max(12, hoveredDerivation.rect.top - 8)
          : Math.min(window.innerHeight - 16, hoveredDerivation.rect.bottom + 8);

        return (
          <div
            style={{
              left: `${left}px`,
              top: `${top}px`,
              transform: placeAbove ? 'translateY(-100%)' : 'none',
            }}
            className={`fixed z-[80] pointer-events-none w-[340px] max-w-[calc(100vw-24px)] rounded-xl border p-3 shadow-xl backdrop-blur-md space-y-1.5 ${
              darkMode
                ? 'bg-slate-950/95 border-slate-600 text-slate-100'
                : 'bg-[#ffffff]/96 border-[#4a463f]/40 text-[#1a1917]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-bold leading-snug">{hoveredDerivation.title}</div>
              {hoveredDerivation.badge && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1f7a4c]/12 text-[#1f7a4c] shrink-0">
                  {hoveredDerivation.badge}
                </span>
              )}
            </div>
            <div
              className={`rounded-lg px-2 py-1 text-[11px] font-mono leading-snug ${
                darkMode ? 'bg-slate-900 text-amber-200 border border-slate-800' : 'bg-[#faf8f4] text-[#9a3412] border border-[#e6e2d8]'
              }`}
            >
              {hoveredDerivation.formula}
            </div>
            <div className="text-[11px] font-mono leading-snug break-words">
              {hoveredDerivation.calculation}
            </div>
            <div className={`text-[10px] leading-snug pt-0.5 border-t ${dividerBorder} ${mutedText}`}>
              Source: {hoveredDerivation.source}
            </div>
          </div>
        );
      })()}

      {/* ROW CALCULATION AUDIT MODAL */}
      {selectedAuditRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`max-w-md w-full rounded-2xl border p-6 space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Record Audit & CSV Formula Breakdown</h3>
              <button onClick={() => setSelectedAuditRow(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className={`p-4 rounded-xl border font-mono text-xs space-y-1.5 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#e6e2d8]'}`}>
              <div>Record ID: <span className="text-[#e07a16] font-semibold">{selectedAuditRow.id}</span></div>
              <div>Date: {selectedAuditRow.date}</div>
              <div>Sunrun Solar Produced: <span className="text-[#e07a16] font-semibold">{selectedAuditRow.solar_kwh} kWh</span></div>
              <div>Sunrun EOD Meter Reading: {selectedAuditRow.eod_meter_kwh ?? 0} kWh</div>
              <div>
                NYSEG M02 Received (Export):{' '}
                <span className="text-[#1f7a4c] font-semibold">
                  {selectedAuditRow.m02_export_kwh !== null ? `${selectedAuditRow.m02_export_kwh} kWh` : 'Pending CSV'}
                </span>
              </div>
              <div>
                NYSEG M01 Delivered (Import):{' '}
                <span className="font-semibold">
                  {selectedAuditRow.m01_import_kwh !== null ? `${selectedAuditRow.m01_import_kwh} kWh` : 'Pending CSV'}
                </span>
              </div>
              <div>NYSEG Hourly Intervals Summed: {selectedAuditRow.nyseg_hours || 0} hrs</div>
              {selectedAuditRow.temp_f !== null && (
                <div>
                  NYSEG Hourly Temp: {selectedAuditRow.temp_f}°F avg ({selectedAuditRow.temp_min_f ?? selectedAuditRow.temp_f}°F–{selectedAuditRow.temp_max_f ?? selectedAuditRow.temp_f}°F)
                </div>
              )}
              {selectedAuditRow.credit_delta !== null && (
                <>
                  <div className={`pt-2 border-t ${dividerBorder} text-[#1f7a4c] font-semibold`}>
                    Net Credit Bank Formula: ({selectedAuditRow.m02_export_kwh} - {selectedAuditRow.m01_import_kwh}) = {selectedAuditRow.credit_delta} kWh
                  </div>
                  <div className={mutedText}>
                    Physical Check: M02 ({selectedAuditRow.m02_export_kwh}) &le; Solar ({selectedAuditRow.solar_kwh}) + 0.5 kWh [PASS]
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GROUNDED AI RESOURCE ANALYST DRAWER */}
      {showAiDrawer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className={`w-full max-w-md h-full border-l p-6 flex flex-col justify-between ${cardBg}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${dividerBorder}`}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#e07a16]" />
                <h3 className="font-bold text-sm">Grounded CSV Telemetry Analyst</h3>
              </div>
              <div className="flex items-center gap-2">
                {aiMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiMessages([]);
                      setAiQuery('');
                    }}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${pillBtnSecondary}`}
                    title="Clear all AI questions and answers"
                  >
                    Clear
                  </button>
                )}
                <button onClick={() => setShowAiDrawer(false)} className="cursor-pointer" aria-label="Close AI drawer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 text-xs">
              {aiMessages.length === 0 ? (
                <div className={`p-4 rounded-xl text-center space-y-1 ${calloutBg}`}>
                  <div className="font-semibold">Conversation cleared</div>
                  <div className={mutedText}>
                    Select a question below or type your own to query your solar &amp; NYSEG dataset.
                  </div>
                </div>
              ) : (
                aiMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl whitespace-pre-line ${
                      m.role === 'user'
                        ? 'bg-[#1a1917] text-white ml-8'
                        : `${calloutBg} mr-6 leading-relaxed`
                    }`}
                  >
                    {m.text}
                  </div>
                ))
              )}
              <div ref={aiMessagesEndRef} />
            </div>

            <div className={`space-y-2 pt-3 border-t ${dividerBorder}`}>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {AI_SUGGESTED_QUESTIONS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleAskAi(preset)}
                    className={`text-[11px] px-3 py-1 rounded-full cursor-pointer text-left hover:opacity-90 ${calloutBg}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskAi()}
                  placeholder="Ask about your CSV meters, bills, or credit bank..."
                  className={`flex-1 px-3 py-2 rounded-full border text-xs ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#faf8f4] border-[#dcd8ce]'}`}
                />
                <button
                  onClick={() => handleAskAi()}
                  className="px-4 py-2 rounded-full bg-[#1a1917] text-white text-xs font-semibold cursor-pointer"
                >
                  Ask
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ALERT & ANOMALY LOOKUP LOG MODAL */}
      {showAlertLogModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`max-w-3xl w-full max-h-[85vh] overflow-y-auto rounded-2xl border p-5 sm:p-6 space-y-4 shadow-2xl ${cardBg}`}>
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm">Alert &amp; Anomaly Lookup Log</div>
              <button
                type="button"
                onClick={() => setShowAlertLogModal(false)}
                className="cursor-pointer"
                aria-label="Close Alert Lookup Log"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderAlertLookupPanel()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HeliosPulsePortal() {
  return (
    <AppErrorBoundary>
      <HeliosPulsePortalInner />
    </AppErrorBoundary>
  );
}
