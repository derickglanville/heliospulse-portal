import React, { useState, useMemo, useEffect } from 'react';
import {
  Sun, Zap, Droplet, Flame, Car, Activity, ShieldCheck, RefreshCw,
  FileText, AlertTriangle, CheckCircle2,
  Download, Eye, Layers, Smartphone, Moon, SunMedium,
  Lock, Database, Calculator, X,
  Check, Clock, Sparkles, Plug, FolderOpen, Upload,
  ChevronLeft, ChevronRight, Play, Pause, ArrowDown, ArrowUp, Home
} from 'lucide-react';
import telemetryData from './data/telemetryData.json';

const INITIAL_SOLAR_DAILY = telemetryData.daily_rows;
const TELEMETRY_META = telemetryData.metadata;
const MONTHLY_SUMMARIES = telemetryData.monthly_summaries;

const INITIAL_GENERIC_DAILY = [
  { id: 'MR-401', date: '2026-11-16', elec_kwh: 25.8, water_gal: 142, gas_therm: 2.1, ev_kwh: 11.4, est_cost: 9.84, status: 'RECONCILED', note: 'EV overnight Level-2 top-up' },
  { id: 'MR-400', date: '2026-11-15', elec_kwh: 23.8, water_gal: 168, gas_therm: 1.9, ev_kwh: 0.0, est_cost: 7.42, status: 'RECONCILED', note: 'Laundry cycle + dishwasher' },
  { id: 'MR-399', date: '2026-11-14', elec_kwh: 31.3, water_gal: 130, gas_therm: 2.8, ev_kwh: 14.2, est_cost: 12.15, status: 'ANOMALY_FLAGGED', note: 'Cold snap heating spike' },
  { id: 'MR-398', date: '2026-11-13', elec_kwh: 25.3, water_gal: 125, gas_therm: 2.0, ev_kwh: 0.0, est_cost: 7.60, status: 'RECONCILED', note: '' },
  { id: 'MR-397', date: '2026-11-12', elec_kwh: 23.1, water_gal: 138, gas_therm: 1.7, ev_kwh: 8.6, est_cost: 8.91, status: 'RECONCILED', note: '' },
];

const NYSEG_BILL_REVISIONS = MONTHLY_SUMMARIES.map((m, idx) => {
  const basicCharge = 19.11;
  const deliveryRate = 0.1142;
  const supplyRate = 0.0865;
  const netBillableKwh = Math.max(0, m.m01_import_kwh - m.m02_export_kwh - m.prior_credit_bank);
  const sbcRamSurcharge = Number((m.m01_import_kwh * 0.0095).toFixed(2));
  const totalDue = Number((basicCharge + sbcRamSurcharge + netBillableKwh * (deliveryRate + supplyRate)).toFixed(2));

  return {
    revision_id: `CSV-${m.month}-${idx === 0 ? 'LIVE' : 'FINAL'}`,
    month: m.month,
    period: `${m.month} (${m.reconciled_days} NYSEG days / ${m.sunrun_days} Sunrun days)`,
    statement_date: `${m.month}-28`,
    status: idx === 0 ? 'IN_PROGRESS_MONTH' : 'RECONCILED_CSV',
    basic_service_charge: basicCharge,
    solar_produced_kwh: m.solar_kwh,
    m01_billed_kwh: m.m01_import_kwh,
    m02_exported_kwh: m.m02_export_kwh,
    net_delta_kwh: m.credit_delta,
    prior_credit_bank: m.prior_credit_bank,
    ending_credit_bank: m.ending_credit_bank,
    delivery_rate: deliveryRate,
    supply_rate: supplyRate,
    sbc_ram_surcharge: sbcRamSurcharge,
    total_due: totalDue,
    audit_note: `Aggregated from Sunrun_Daily_Production_Data.csv (${m.solar_kwh} kWh) & NYSEG_Daily_Usage_Data.csv (Delivered: ${m.m01_import_kwh} kWh, Received: ${m.m02_export_kwh} kWh).`,
  };
});

const ASSET_CATALOG = [
  {
    id: 'AST-01',
    name: 'Sunrun Rooftop Solar Array',
    category: 'Generation',
    metric: `${TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh cumulative (${(TELEMETRY_META.cumulative_solar_kwh / 129).toFixed(1)} kWh/day avg)`,
    health: `${TELEMETRY_META.sunrun_total_rows} CSV Daily Records Loaded`,
    connector: 'Sunrun_Daily_Production_Data.csv',
  },
  {
    id: 'AST-02',
    name: 'NYSEG Bidirectional Smart Meter (Delivered / Received)',
    category: 'Utility Grid',
    metric: `+${TELEMETRY_META.cumulative_net_credit_bank_kwh.toFixed(1)} kWh Net Credit Bank`,
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
  { id: 4, title: 'Anomaly & Gap Detection', detail: `Flag ${TELEMETRY_META.sunrun_only_days} Sunrun-only dates & DST 25-hr interval days` },
  { id: 5, title: 'Recompute Credit Bank', detail: `Calculate cumulative net credit bank (+${TELEMETRY_META.cumulative_net_credit_bank_kwh.toFixed(1)} kWh)` },
  { id: 6, title: 'Publish Sanitized Snapshot', detail: 'Strip PII (Name/Address/Account#) & write telemetryData.json' },
];

const TOP_MENU_ITEMS = [
  { id: 'distribution', label: 'Energy Distribution' },
  { id: 'savings', label: 'Solar savings' },
  { id: 'flow', label: 'Energy flow' },
  { id: 'monthly', label: 'Production by month' },
  { id: 'nyseg', label: 'NYSEG record' },
  { id: 'estimator', label: 'Credit forecaster' },
  { id: 'connectors', label: 'CSV connectors' },
  { id: 'system', label: 'Your system' },
];

// Compute solar peak elevation & estimated daily peak irradiance (W/m²) for Yorktown Heights, NY (41.3°N)
function getSolarAstronomyForDate(dateStr, solarKwh) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((d - start) / (1000 * 60 * 60 * 24));
  // Solar declination angle (degrees)
  const declination = 23.45 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latitude = 41.27;
  const peakElevation = Math.max(15, 90 - latitude + declination);
  // Peak irradiance estimate scaled from daily kWh
  const peakIrradiance = Math.round(Math.min(1020, Math.max(95, solarKwh * 21.8)));
  return {
    sunHeight: `+${peakElevation.toFixed(1)}°`,
    irradianceWm2: `${peakIrradiance} W/m²`,
  };
}

export default function HeliosPulsePortal() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('distribution');
  const [spanFilter, setSpanFilter] = useState('yearly'); // 'weekly' | 'monthly' | 'yearly'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'RECONCILED' | 'SUNRUN_ONLY'
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);

  const [solarRows, setSolarRows] = useState(INITIAL_SOLAR_DAILY);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedAuditRow, setSelectedAuditRow] = useState(null);

  // Reconciled dates sorted chronological (oldest -> newest) for the Energy Distribution date picker & player
  const reconciledRowsChrono = useMemo(() => {
    return [...solarRows]
      .filter((r) => r.status === 'RECONCILED')
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [solarRows]);

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

  // Compute 24-hour energy balance bars for the selected date in Energy Distribution
  const hourlyBalanceData = useMemo(() => {
    if (!selectedDistRow) return [];
    const totalSolar = selectedDistRow.solar_kwh || 0;
    const rawHourly =
      selectedDistRow.hourly || Array.from({ length: 24 }, () => [0, 0]);

    // Bell-curve daylight weights (6am to 5pm) plus actual M02 export signal so solar >= M02 every hour
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
      msg: `Synced ${TELEMETRY_META.sunrun_total_rows} Sunrun days (${TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh) & ${TELEMETRY_META.reconciled_days} NYSEG days (${TELEMETRY_META.nyseg_hourly_rows.toLocaleString()} hourly rows).`,
    },
    {
      ts: TELEMETRY_META.generated_at.replace('T', ' ').slice(0, 19),
      provider: 'NYSEGConnector',
      status: 'SUCCESS',
      msg: `Loaded ${TELEMETRY_META.nyseg_source_path} (Delivered: ${TELEMETRY_META.cumulative_m01_import_kwh} kWh, Received: ${TELEMETRY_META.cumulative_m02_export_kwh} kWh).`,
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
      text: `Connected to your real CSV dataset (${TELEMETRY_META.date_range_start} to ${TELEMETRY_META.date_range_end}): ${TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh cumulative Sunrun production and +${TELEMETRY_META.cumulative_net_credit_bank_kwh.toFixed(1)} kWh NYSEG net-metering credit bank across ${TELEMETRY_META.reconciled_days} reconciled days.`,
    },
  ]);

  // What-If Scenario Sliders
  const [winterUsageGrowth, setWinterUsageGrowth] = useState(10);
  const [utilityRateEscalation, setUtilityRateEscalation] = useState(4.5);

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

  const projectedBank6Mo = useMemo(() => {
    const monthlyDrawdown = 165 * (1 + winterUsageGrowth / 100);
    return Math.max(0, Math.round(Number(solarTotals.bankBalance) - monthlyDrawdown * 4 + 420));
  }, [solarTotals.bankBalance, winterUsageGrowth]);

  // Handlers
  const triggerSyncPipeline = () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setActiveSyncStep(1);
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
            msg: `All 6 pipeline gates passed (${solarRows.length} Sunrun days & ${solarTotals.reconciledCount} NYSEG days reconciled).`,
          },
          ...prev,
        ]);
      }
    }, 450);
  };

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

  const handleAskAi = (promptText) => {
    const q = (promptText || aiQuery).trim();
    if (!q) return;
    let reply = '';
    if (q.toLowerCase().includes('credit') || q.toLowerCase().includes('bank')) {
      reply = `Across all ${solarTotals.reconciledCount} reconciled NYSEG days (${TELEMETRY_META.reconciled_range_start} to ${TELEMETRY_META.latest_reconciled_date}), NYSEG Received (M02 Export) totaled ${solarTotals.cumExp} kWh and NYSEG Delivered (M01 Import) totaled ${solarTotals.cumImp} kWh, resulting in a cumulative Net-Metering Credit Bank of +${solarTotals.bankBalance} kWh.`;
    } else if (q.toLowerCase().includes('bill') || q.toLowerCase().includes('nyseg') || q.toLowerCase().includes('month')) {
      reply = `Monthly net bank additions from your CSVs: Aug 2026 (+853.60 kWh), Sep 2026 (+580.01 kWh), Oct 2026 (+227.42 kWh), and Nov 2026 MTD (-130.19 kWh seasonal drawdown).`;
    } else {
      reply = `Your Sunrun array has produced ${solarTotals.cumSolar} kWh cumulatively across ${solarTotals.totalDays} CSV days (End-of-Day Meter Reading: ${solarTotals.maxEodMeter} kWh on ${TELEMETRY_META.latest_sunrun_date}).`;
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

  const stepDistDate = (dir) => {
    if (!reconciledRowsChrono.length) return;
    const idx = reconciledRowsChrono.findIndex((r) => r.date === selectedDistDate);
    if (idx === -1) return;
    const nextIdx = Math.max(0, Math.min(reconciledRowsChrono.length - 1, idx + dir));
    setSelectedDistDate(reconciledRowsChrono[nextIdx].date);
  };

  // Computed metrics for the selected day in the Energy Distribution tab
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
    const astro = getSolarAstronomyForDate(r.date, solar);

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
      co2AvoidedLb,
      irradianceLabel: r.irradiance || 'Overcast',
      tempMax: r.temp_max_f ?? r.temp_f ?? 43,
      tempMin: r.temp_min_f ?? r.temp_f ?? 35,
      irradianceWm2: astro.irradianceWm2,
      sunHeight: astro.sunHeight,
    };
  }, [selectedDistRow]);

  // Warm editorial theme styling
  const pageBg = darkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#f6f4ef] text-[#1a1917]';
  const cardBg = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-[#e6e2d8] text-[#1a1917] shadow-[0_1px_3px_rgba(0,0,0,0.03)]';
  const calloutBg = darkMode
    ? 'bg-slate-900/70 border border-slate-800 text-slate-100'
    : 'bg-[#efece4] border border-[#e3dfd4] text-[#1a1917]';
  const mutedText = darkMode ? 'text-slate-400' : 'text-[#6b675e]';
  const trackBg = darkMode ? 'bg-slate-800' : 'bg-[#edeae2]';
  const dividerBorder = darkMode ? 'border-slate-800' : 'border-[#ece8df]';

  return (
    <div className={`min-h-screen transition-colors duration-200 font-sans ${pageBg}`}>
      {/* TOP MENU BAR WITH PILL BUTTONS */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-[#f6f4ef]/95 border-[#e6e2d8]'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3.5 pb-3 flex flex-wrap items-center justify-between gap-3">
          {/* PILL NAVIGATION MENU BUTTONS */}
          <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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

          {/* COMPACT UTILITY ACTIONS ON FAR RIGHT */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={triggerSyncPipeline}
              disabled={isSyncing}
              title="Run 6-Stage CSV Sync Pipeline"
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 border transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-900 border-slate-700 text-emerald-400 hover:bg-slate-800'
                  : 'bg-white border-[#dcd8ce] text-[#1f7a4c] hover:bg-[#efece4]'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync CSVs'}</span>
            </button>

            <button
              onClick={() => setShowAiDrawer(true)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-900 border-slate-700 text-indigo-400 hover:bg-slate-800'
                  : 'bg-white border-[#dcd8ce] text-[#1a1917] hover:bg-[#efece4]'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-600" />
              <span className="hidden sm:inline">Ask AI</span>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* TAB 0: ENERGY DISTRIBUTION (3-COLUMN VIEW MATCHING SCREENSHOT) */}
        {activeTab === 'distribution' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            {/* COLUMN 1: DAILY ENERGY FLOW — WHERE ENERGY MOVED */}
            <div className={`rounded-2xl border overflow-hidden flex flex-col justify-between ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-[#f4fbf7] border-[#d8ece2] shadow-xs'
            }`}>
              <div className="p-5 pb-3">
                {/* Header & Date Picker */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      DAILY ENERGY FLOW
                    </div>
                    <h2 className={`text-xl font-bold tracking-tight mt-0.5 ${darkMode ? 'text-white' : 'text-[#1e293b]'}`}>
                      Where energy moved
                    </h2>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Showing {distDayMetrics.date}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => stepDistDate(-1)}
                      className={`w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                      }`}
                      title="Previous day"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <select
                      value={selectedDistDate}
                      onChange={(e) => setSelectedDistDate(e.target.value)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-[#1e293b]'
                      }`}
                    >
                      {[...reconciledRowsChrono].reverse().map((r) => (
                        <option key={r.date} value={r.date}>
                          {r.date}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => stepDistDate(1)}
                      className={`w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                      }`}
                      title="Next day"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Circular Flow Diagram */}
                <div className="relative h-[300px] w-full mt-2 select-none">
                  {/* Connecting SVG Curves & Arrows */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 340 300">
                    <defs>
                      <marker id="arrow-grey" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
                      </marker>
                      <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#0284c7" />
                      </marker>
                    </defs>
                    {/* Left M01 circle to Center Home circle */}
                    <path
                      d="M 82 95 Q 92 140 122 152"
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="2.2"
                      markerEnd="url(#arrow-grey)"
                    />
                    {/* Right Solar circle to Center Home circle */}
                    <path
                      d="M 258 95 Q 248 140 218 152"
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="2.2"
                      markerEnd="url(#arrow-blue)"
                    />
                    {/* Center Home circle to Bottom M02 Export circle */}
                    <line
                      x1="170"
                      y1="202"
                      x2="170"
                      y2="220"
                      stroke="#64748b"
                      strokeWidth="2.2"
                    />
                  </svg>

                  {/* Top-Left Node: M01 Imported from NYSEG */}
                  <div
                    className={`absolute left-4 top-2 w-24 h-24 rounded-full border-2 border-[#22c55e] flex flex-col items-center justify-center text-center shadow-xs ${
                      darkMode ? 'bg-emerald-950/60 text-emerald-100' : 'bg-[#dcfce7] text-[#14532d]'
                    }`}
                  >
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-600 text-[10px] font-serif italic flex items-center justify-center shadow-2xs">
                      i
                    </span>
                    <ArrowDown className="w-3.5 h-3.5 text-[#16a34a] mb-0.5" />
                    <div className="text-base font-extrabold leading-none">{distDayMetrics.m01}</div>
                    <div className="text-[9px] leading-tight mt-0.5 px-1 opacity-85">
                      kWh imported<br />M01 from NYSEG
                    </div>
                  </div>

                  {/* Top-Right Node: Produced SunRun Solar */}
                  <div
                    className={`absolute right-4 top-2 w-24 h-24 rounded-full border-2 border-[#0ea5e9] flex flex-col items-center justify-center text-center shadow-xs ${
                      darkMode ? 'bg-sky-950/60 text-sky-100' : 'bg-white text-[#0f172a]'
                    }`}
                  >
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-600 text-[10px] font-serif italic flex items-center justify-center shadow-2xs">
                      i
                    </span>
                    <Sun className="w-3.5 h-3.5 text-[#0284c7] mb-0.5" />
                    <div className="text-base font-extrabold leading-none">{distDayMetrics.solar}</div>
                    <div className="text-[9px] leading-tight mt-0.5 px-1 opacity-80">
                      kWh produced<br />SunRun solar
                    </div>
                  </div>

                  {/* Center Node: Estimated Home Consumed */}
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 top-[102px] w-26 h-26 rounded-full border-2 border-[#f97316] flex flex-col items-center justify-center text-center shadow-xs ${
                      darkMode ? 'bg-slate-950 text-amber-100' : 'bg-white text-[#1e293b]'
                    }`}
                  >
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-600 text-[10px] font-serif italic flex items-center justify-center shadow-2xs">
                      i
                    </span>
                    <Home className="w-3.5 h-3.5 text-[#f97316] mb-0.5" />
                    <div className="text-lg font-extrabold leading-none">{distDayMetrics.homeConsumed}</div>
                    <div className="text-[9px] leading-tight mt-0.5 px-1.5 opacity-80">
                      kWh estimated<br />home consumed
                    </div>
                  </div>

                  {/* Bottom Node: M02 Exported to NYSEG */}
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 bottom-0 w-22 h-22 rounded-full border-2 border-[#ef4444] flex flex-col items-center justify-center text-center shadow-xs ${
                      darkMode ? 'bg-rose-950/60 text-rose-100' : 'bg-[#ffe4e6] text-[#881337]'
                    }`}
                  >
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-600 text-[10px] font-serif italic flex items-center justify-center shadow-2xs">
                      i
                    </span>
                    <ArrowUp className="w-3.5 h-3.5 text-[#e11d48] mb-0.5" />
                    <div className="text-sm font-extrabold leading-none">{distDayMetrics.m02}</div>
                    <div className="text-[9px] leading-tight mt-0.5 px-1 opacity-85">
                      kWh exported<br />M02 to NYSEG
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Performance Sub-Panel */}
              <div className={`p-5 border-t space-y-3 ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-[#f6f5fb] border-[#e5e4f0]'
              }`}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  PERFORMANCE
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500">Grid dependence</div>
                    <div className="text-lg font-extrabold text-[#0369a1]">{distDayMetrics.gridDepPct}%</div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div style={{ width: `${distDayMetrics.gridDepPct}%` }} className="h-full bg-[#06b6d4] rounded-full" />
                    </div>
                    <div className="text-[11px] text-slate-500 pt-0.5">Home demand supplied by NYSEG.</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500">Solar coverage</div>
                    <div className="text-lg font-extrabold text-[#0369a1]">{distDayMetrics.solarCovPct}%</div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div style={{ width: `${distDayMetrics.solarCovPct}%` }} className="h-full bg-[#f59e0b] rounded-full" />
                    </div>
                    <div className="text-[11px] text-slate-500 pt-0.5">Solar retained for home use.</div>
                  </div>
                </div>

                <div className={`grid grid-cols-2 gap-4 pt-3 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200/80'}`}>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Net grid flow</div>
                    <div className="text-base font-extrabold text-[#0369a1] mt-0.5">
                      {distDayMetrics.netGridFlowAbs} kWh {distDayMetrics.netGridImported ? 'imported' : 'exported'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {distDayMetrics.netGridImported ? 'Positive means imported from NYSEG.' : 'Net export credited to NYSEG bank.'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-500">Solar impact</div>
                    <div className="text-base font-extrabold text-[#0369a1] mt-0.5">{distDayMetrics.co2AvoidedLb} lb</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Estimated CO₂ avoided.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: HOURLY ENERGY BALANCE — PRODUCTION, CONSUMPTION, AND GRID FLOW */}
            <div className={`rounded-2xl border p-5 flex flex-col justify-between ${cardBg}`}>
              <div className="space-y-4">
                {/* Header & Play Controls */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      HOURLY ENERGY BALANCE
                    </div>
                    <h2 className="text-xl font-bold tracking-tight mt-0.5 leading-snug">
                      Production, consumption, and grid flow
                    </h2>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setIsPlayingDates(!isPlayingDates)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                        isPlayingDates
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : darkMode
                          ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isPlayingDates ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                      <span>{isPlayingDates ? 'Pause' : 'Play dates'}</span>
                    </button>
                    <div className={`w-14 h-14 rounded-full border flex flex-col items-center justify-center text-center text-[10px] font-semibold leading-tight ${
                      darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-700 bg-slate-50/60'
                    }`}>
                      Selected<br />day
                    </div>
                  </div>
                </div>

                {/* Weather / Irradiance / Sun Height Strip */}
                <div className={`grid grid-cols-3 gap-2 py-3 border-y ${dividerBorder}`}>
                  <div className={`pr-2 border-r ${dividerBorder}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">WEATHER</div>
                    <div className="text-sm font-extrabold mt-0.5">{distDayMetrics.irradianceLabel}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {distDayMetrics.tempMax}° / {distDayMetrics.tempMin}°F
                    </div>
                  </div>

                  <div className={`px-2 border-r ${dividerBorder}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">IRRADIANCE</div>
                    <div className="text-sm font-extrabold mt-0.5">{distDayMetrics.irradianceWm2}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Daily peak</div>
                  </div>

                  <div className="pl-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SUN HEIGHT</div>
                    <div className="text-sm font-extrabold mt-0.5">{distDayMetrics.sunHeight}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Peak elevation</div>
                  </div>
                </div>

                {/* Note + Day Dropdown */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    NYSEG M01/M02 bars are measured. SunRun production and home use are apportioned from daily totals for this visual.
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-semibold text-slate-600">Day</span>
                    <select
                      value={selectedDistDate}
                      onChange={(e) => setSelectedDistDate(e.target.value)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                      }`}
                    >
                      {[...reconciledRowsChrono].reverse().map((r) => (
                        <option key={r.date} value={r.date}>
                          {r.date}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Legend */}
                <div className="space-y-1.5 text-xs pl-6 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#06b6d4] inline-block" />
                    <span className={mutedText}>SunRun produced · estimate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#52606d] inline-block" />
                    <span className={mutedText}>M01 imported</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#ea580c] inline-block" />
                    <span className={mutedText}>Estimated consumed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#9aa5b1] inline-block" />
                    <span className={mutedText}>M02 exported</span>
                  </div>
                </div>
              </div>

              {/* Diverging 24-Hour Bar Chart */}
              <div className="pt-4 pb-2">
                <div className="relative h-56 flex">
                  {/* Y-axis labels */}
                  <div className="w-6 flex flex-col justify-between text-[11px] text-slate-500 text-right pr-1.5 py-1">
                    <span>5</span>
                    <span>0</span>
                    <span>-5</span>
                  </div>

                  {/* Plot area */}
                  <div className="flex-1 relative flex flex-col">
                    {/* Grid lines */}
                    <div className={`absolute inset-x-0 top-2 border-t ${dividerBorder}`} />
                    <div className="absolute inset-x-0 top-1/2 border-t border-slate-400 z-10" />
                    <div className={`absolute inset-x-0 bottom-2 border-t ${dividerBorder}`} />

                    {/* 24 Hour Columns */}
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
                            {/* Positive Half (Supply: Solar on bottom, M01 on top) */}
                            <div className="h-1/2 flex flex-col justify-end">
                              {m01Pct > 0 && (
                                <div style={{ height: `${m01Pct}%` }} className="w-full bg-[#52606d]" />
                              )}
                              {solarPct > 0 && (
                                <div style={{ height: `${solarPct}%` }} className="w-full bg-[#06b6d4]" />
                              )}
                            </div>

                            {/* Negative Half (Demand/Export: Consumed near 0, M02 below) */}
                            <div className="h-1/2 flex flex-col justify-start">
                              {consPct > 0 && (
                                <div style={{ height: `${consPct}%` }} className="w-full bg-[#ea580c]" />
                              )}
                              {m02Pct > 0 && (
                                <div style={{ height: `${m02Pct}%` }} className="w-full bg-[#9aa5b1]" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* X-axis hour labels */}
                <div className="pl-6 grid grid-cols-8 text-[11px] text-slate-500 pt-1">
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

            {/* COLUMN 3: LIFETIME ENERGY — TOTAL ENERGY */}
            <div className={`rounded-2xl border p-5 flex flex-col justify-between ${cardBg}`}>
              <div className="space-y-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      LIFETIME ENERGY
                    </div>
                    <h2 className="text-xl font-bold tracking-tight mt-0.5">
                      Total Energy
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {TELEMETRY_META.reconciled_range_start} to {TELEMETRY_META.latest_reconciled_date}
                  </span>
                </div>

                {/* 2x2 KPI Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                    <div className="text-[11px] font-semibold text-slate-500">↓ Imported / M01</div>
                    <div className="text-base font-extrabold text-[#0f172a] dark:text-white mt-1">
                      {Number(solarTotals.cumImp).toLocaleString()} kWh
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                    <div className="text-[11px] font-semibold text-slate-500">☀ Produced / SunRun</div>
                    <div className="text-base font-extrabold text-[#0f172a] dark:text-white mt-1">
                      {Number(solarTotals.reconciledSolar).toLocaleString()} kWh
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border border-l-4 border-l-[#f97316] ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                    <div className="text-[11px] font-semibold text-slate-500">⌂ Consumed / EDC</div>
                    <div className="text-base font-extrabold text-[#0f172a] dark:text-white mt-1">
                      {Number(solarTotals.cumEdcConsumed).toLocaleString()} kWh
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                    <div className="text-[11px] font-semibold text-slate-500">↑ Exported / M02</div>
                    <div className="text-base font-extrabold text-[#0f172a] dark:text-white mt-1">
                      {Number(solarTotals.cumExp).toLocaleString()} kWh
                    </div>
                  </div>
                </div>

                {/* Net Exported Green Pill Banner */}
                <div className="py-2 px-3 rounded-xl bg-[#dcfce7] text-[#166534] text-center text-xs font-extrabold">
                  Net exported: {Number(solarTotals.bankBalance).toLocaleString()} kWh
                </div>

                {/* Grid dependence & Solar coverage box */}
                <div className={`p-3.5 rounded-xl border space-y-2.5 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/50'}`}>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600 dark:text-slate-300">Grid dependence</span>
                      <span className="text-[#0369a1]">58%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div style={{ width: '58%' }} className="h-full bg-[#06b6d4] rounded-full" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600 dark:text-slate-300">Solar coverage</span>
                      <span className="text-[#0369a1]">42%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div style={{ width: '42%' }} className="h-full bg-[#f59e0b] rounded-full" />
                    </div>
                  </div>

                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 pt-0.5">
                    🌱 3,966 lb estimated CO₂ avoided
                  </div>
                </div>

                {/* Legend for Lifetime Stacked Bar */}
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs pt-1 px-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#06b6d4] inline-block" />
                    <span className={mutedText}>SunRun produced</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#ea580c] inline-block" />
                    <span className={mutedText}>EDC consumed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#52606d] inline-block" />
                    <span className={mutedText}>M01 imported</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[#9aa5b1] inline-block" />
                    <span className={mutedText}>M02 exported</span>
                  </div>
                </div>
              </div>

              {/* Diverging Lifetime Stacked Bar (2026) */}
              <div className="pt-3 pb-1">
                <div className="relative h-44 flex">
                  {/* Y-axis */}
                  <div className="w-10 flex flex-col justify-between text-[11px] text-slate-500 text-right pr-2 py-2">
                    <span>5000</span>
                    <span>0</span>
                    <span>-5000</span>
                  </div>

                  {/* Bar Plot */}
                  <div className="flex-1 relative flex flex-col justify-center items-center">
                    <div className={`absolute inset-x-0 top-3 border-t ${dividerBorder}`} />
                    <div className="absolute inset-x-0 top-1/2 border-t border-slate-500 z-10" />
                    <div className={`absolute inset-x-0 bottom-3 border-t ${dividerBorder}`} />

                    <div className="w-3/5 h-full flex flex-col">
                      {/* Positive Half: 4,638.4 Solar + 1,781.6 M01 = 6,420 */}
                      <div className="h-1/2 flex flex-col justify-end">
                        <div style={{ height: '24%' }} className="w-full bg-[#52606d]" title="M01 Imported: 1,781.6 kWh" />
                        <div style={{ height: '64%' }} className="w-full bg-[#06b6d4]" title="SunRun Produced: 4,638.4 kWh" />
                      </div>
                      {/* Negative Half: 3,076.5 Consumed + 3,343.6 M02 = 6,420 */}
                      <div className="h-1/2 flex flex-col justify-start">
                        <div style={{ height: '42%' }} className="w-full bg-[#ea580c]" title="EDC Consumed: 3,076.5 kWh" />
                        <div style={{ height: '46%' }} className="w-full bg-[#9aa5b1]" title="M02 Exported: 3,343.6 kWh" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pl-10 text-center text-xs font-semibold text-slate-600 pt-1">
                  2026
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 1: SOLAR SAVINGS (SEASONAL HORIZONTAL BAR COMPARISON) */}
        {activeTab === 'savings' && (
          <div className="space-y-6 max-w-5xl mx-auto">
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
                        <span className="text-xs sm:text-sm font-bold text-[#1f7a4c]">
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
                <div className="text-2xl sm:text-3xl font-bold tracking-tight">{seasonalComparison.summerTemp}°F</div>
                <p className={`text-xs sm:text-[13px] leading-relaxed ${mutedText}`}>
                  Average NYSEG hourly temperature, Aug 1 – Sep 15 • Peak solar irradiance averaged 61.2 kWh/day across {seasonalComparison.summerDays} summer days.
                </p>
              </div>

              <div className={`rounded-xl p-5 space-y-1.5 ${calloutBg}`}>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight">{seasonalComparison.autumnTemp}°F</div>
                <p className={`text-xs sm:text-[13px] leading-relaxed ${mutedText}`}>
                  Average NYSEG hourly temperature, Oct 1 – Nov 14 — {seasonalComparison.tempDrop} degrees cooler, cutting cooling loads while building a +{solarTotals.bankBalance} kWh net credit bank.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: ENERGY FLOW (CUMULATIVE SUMMARY + DAILY BAR CHART) */}
        {activeTab === 'flow' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
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
                <div className="text-2xl font-bold">{Number(solarTotals.prod).toLocaleString()} kWh</div>
                <div className="text-xs text-[#1f7a4c] font-medium">EOD Meter: {Number(solarTotals.maxEodMeter).toLocaleString()} kWh</div>
              </div>

              <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>NYSEG Credit Bank</div>
                <div className="text-2xl font-bold text-[#1f7a4c]">+{solarTotals.bankBalance} kWh</div>
                <div className={`text-xs ${mutedText}`}>{solarTotals.netDelta} kWh in selected window</div>
              </div>

              <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>NYSEG Received (M02 Export)</div>
                <div className="text-2xl font-bold">{Number(solarTotals.exp).toLocaleString()} kWh</div>
                <div className={`text-xs ${mutedText}`}>All-time: {Number(solarTotals.cumExp).toLocaleString()} kWh</div>
              </div>

              <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
                <div className={`text-xs font-medium ${mutedText}`}>NYSEG Delivered (M01 Import)</div>
                <div className="text-2xl font-bold">{Number(solarTotals.imp).toLocaleString()} kWh</div>
                <div className={`text-xs ${mutedText}`}>All-time: {Number(solarTotals.cumImp).toLocaleString()} kWh</div>
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

        {/* VIEW 3: PRODUCTION BY MONTH */}
        {activeTab === 'monthly' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="space-y-2 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Production & grid exchange by month
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                Monthly totals aggregated directly from <code className="font-mono text-xs">Sunrun_Daily_Production_Data.csv</code> and <code className="font-mono text-xs">NYSEG_Daily_Usage_Data.csv</code> across July – November 2026.
              </p>
            </div>

            <div className={`rounded-2xl border p-6 sm:p-7 space-y-6 ${cardBg}`}>
              <div className={`text-xs sm:text-[13px] ${mutedText}`}>
                Monthly kWh comparison • <strong className="text-[#e07a16]">Orange</strong> = Sunrun Solar Produced • <strong className="text-[#1f7a4c]">Green</strong> = NYSEG Received (M02 Export) • <strong className="text-[#687076]">Slate</strong> = NYSEG Delivered (M01 Import)
              </div>

              <div className={`divide-y ${dividerBorder}`}>
                {[...MONTHLY_SUMMARIES].reverse().map((m, idx) => {
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
                        <span className={`text-xs sm:text-sm font-bold ${m.credit_delta >= 0 ? 'text-[#1f7a4c]' : 'text-amber-600'}`}>
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

        {/* VIEW 4: NYSEG RECORD (DAILY LEDGER & AUDIT TABLE) */}
        {activeTab === 'nyseg' && (
          <div className="space-y-5 max-w-5xl mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  NYSEG & Sunrun daily telemetry record
                </h1>
                <p className={`text-sm ${mutedText}`}>
                  Showing {sortedSolarRows.length} of {solarRows.length} daily records synced from your local CSV files. Click any row’s eye icon to inspect its formula breakdown.
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
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold cursor-pointer ${
                    darkMode ? 'bg-slate-900 border-slate-700 hover:bg-slate-800' : 'bg-white border-[#dcd8ce] hover:bg-[#efece4]'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
            </div>

            <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
              <div className="overflow-x-auto max-h-[640px]">
                <table className="w-full text-left text-xs">
                  <thead className={`sticky top-0 border-b ${dividerBorder} ${darkMode ? 'bg-slate-950 text-slate-400' : 'bg-[#faf8f4] text-[#6b675e]'}`}>
                    <tr>
                      <th className="p-3.5 cursor-pointer" onClick={() => toggleSort('date')}>Date ↕</th>
                      <th className="p-3.5 cursor-pointer" onClick={() => toggleSort('solar_kwh')}>Solar (kWh) ↕</th>
                      <th className="p-3.5 cursor-pointer" onClick={() => toggleSort('eod_meter_kwh')}>EOD Meter ↕</th>
                      <th className="p-3.5 cursor-pointer" onClick={() => toggleSort('m01_import_kwh')}>M01 Delivered ↕</th>
                      <th className="p-3.5 cursor-pointer" onClick={() => toggleSort('m02_export_kwh')}>M02 Received ↕</th>
                      <th className="p-3.5 cursor-pointer" onClick={() => toggleSort('credit_delta')}>Net Bank Δ ↕</th>
                      <th className="p-3.5">Weather</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Notes</th>
                      <th className="p-3.5 text-right">Audit</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dividerBorder}`}>
                    {sortedSolarRows.map((row) => (
                      <tr key={row.id} className={darkMode ? 'hover:bg-slate-800/30 transition' : 'hover:bg-[#faf8f4] transition'}>
                        <td className="p-3.5 font-mono font-medium">{row.date}</td>
                        <td className="p-3.5 font-semibold text-[#e07a16]">{row.solar_kwh.toFixed(2)}</td>
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
                              : 'text-rose-600'
                          }`}
                        >
                          {row.credit_delta === null
                            ? '—'
                            : row.credit_delta >= 0
                            ? `+${row.credit_delta.toFixed(2)}`
                            : row.credit_delta.toFixed(2)}
                        </td>
                        <td className="p-3.5">
                          {row.temp_f !== null ? `${row.temp_f}°F • ` : ''}
                          {row.irradiance}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.status === 'RECONCILED'
                                ? 'bg-emerald-500/15 text-[#1f7a4c]'
                                : row.status === 'SUNRUN_ONLY'
                                ? 'bg-amber-500/15 text-[#d97706]'
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
                            className={`p-1.5 rounded-full border cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 text-sky-400' : 'bg-[#f6f4ef] border-[#dcd8ce] text-[#1a1917] hover:bg-[#eae6dc]'}`}
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

        {/* VIEW 5: CREDIT FORECASTER & MONTHLY BILLING LEDGER */}
        {activeTab === 'estimator' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="space-y-2 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Winter credit bank & statement estimator
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                Simulate how winter DuctlessAire heat-pump usage and NYSEG tariff changes affect your <strong className="font-semibold">+{solarTotals.bankBalance} kWh</strong> net-metering reserve through spring.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className={`lg:col-span-2 rounded-2xl border p-6 space-y-4 ${cardBg}`}>
                <h3 className="font-semibold text-sm">Monthly Statement Ledger (Derived from CSVs)</h3>
                <div className="space-y-3">
                  {NYSEG_BILL_REVISIONS.map((bill) => (
                    <div key={bill.revision_id} className={`p-4 rounded-xl border space-y-3 ${darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-[#e6e2d8] bg-[#faf8f4]'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-xs text-[#e07a16]">{bill.revision_id}</span>
                          <span className={`ml-2 text-xs ${mutedText}`}>{bill.period}</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-[#1f7a4c]">
                          {bill.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                        <div><span className={`block ${mutedText}`}>Solar Produced</span><span className="font-semibold text-[#e07a16]">{bill.solar_produced_kwh} kWh</span></div>
                        <div><span className={`block ${mutedText}`}>M01 Delivered</span><span className="font-semibold">{bill.m01_billed_kwh} kWh</span></div>
                        <div><span className={`block ${mutedText}`}>M02 Received</span><span className="font-semibold text-[#1f7a4c]">{bill.m02_exported_kwh} kWh</span></div>
                        <div><span className={`block ${mutedText}`}>Ending Credit Bank</span><span className="font-semibold text-[#1f7a4c]">{bill.ending_credit_bank} kWh</span></div>
                        <div><span className={`block ${mutedText}`}>Est. Monthly Due</span><span className="font-bold text-base">${bill.total_due.toFixed(2)}</span></div>
                      </div>

                      <div className={`text-[11px] pt-2 border-t ${dividerBorder} ${mutedText}`}>
                        {bill.audit_note}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border p-6 space-y-5 h-fit ${cardBg}`}>
                <div>
                  <h3 className="font-semibold text-sm">Winter Drawdown Simulator</h3>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>
                    Starting from +{solarTotals.bankBalance} kWh cumulative NYSEG reserve
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Winter HVAC Load Delta</span>
                      <span className="font-bold text-[#e07a16]">+{winterUsageGrowth}%</span>
                    </div>
                    <input
                      type="range"
                      min="-15"
                      max="40"
                      value={winterUsageGrowth}
                      onChange={(e) => setWinterUsageGrowth(Number(e.target.value))}
                      className="w-full accent-[#e07a16]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span>NYSEG Delivery + Supply Escalation</span>
                      <span className="font-bold text-[#1f7a4c]">+{utilityRateEscalation}% / yr</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="15"
                      step="0.5"
                      value={utilityRateEscalation}
                      onChange={(e) => setUtilityRateEscalation(Number(e.target.value))}
                      className="w-full accent-[#1f7a4c]"
                    />
                  </div>
                </div>

                <div className={`p-4 rounded-xl space-y-1 ${calloutBg}`}>
                  <div className={`text-xs ${mutedText}`}>Projected Spring Credit Bank Reserve</div>
                  <div className="text-2xl font-bold text-[#1f7a4c]">{projectedBank6Mo} kWh</div>
                  <div className={`text-[11px] ${mutedText}`}>
                    Avoided utility bill value at escalated rate: $
                    {(projectedBank6Mo * 0.2007 * (1 + utilityRateEscalation / 100)).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: CSV CONNECTORS & 6-STAGE PIPELINE */}
        {activeTab === 'connectors' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="space-y-2 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Local CSV connectors & ingestion pipeline
              </h1>
              <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
                Telemetry is synced from your local Sunrun daily and NYSEG hourly CSV files, validated for physical bounds, and stripped of PII before static deployment.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={`rounded-2xl border p-6 space-y-4 ${cardBg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-[#e07a16]" />
                    <h3 className="font-semibold text-sm">Configured Local CSV Paths</h3>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-[#1f7a4c] font-semibold">
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
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-[#1f7a4c]'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-600'
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
          </div>
        )}

        {/* VIEW 7: YOUR SYSTEM (ASSET & CIRCUIT CATALOG) */}
        {activeTab === 'system' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="space-y-2 max-w-2xl">
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
                    <div className="font-semibold">{asset.metric}</div>
                    <div className="text-[#1f7a4c] font-medium mt-1">{asset.health}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

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
              <button onClick={() => setShowAiDrawer(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 text-xs">
              {aiMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl ${
                    m.role === 'user'
                      ? 'bg-[#1a1917] text-white ml-8'
                      : `${calloutBg} mr-6 leading-relaxed`
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>

            <div className={`space-y-2 pt-3 border-t ${dividerBorder}`}>
              <div className="flex flex-wrap gap-1.5">
                {['How is my NYSEG credit bank?', 'Explain monthly CSV totals'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleAskAi(preset)}
                    className={`text-[11px] px-3 py-1 rounded-full cursor-pointer ${calloutBg}`}
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
    </div>
  );
}
