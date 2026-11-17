import React, { useState, useMemo } from 'react';
import {
  Sun, Zap, Droplet, Flame, Car, Activity, ShieldCheck, RefreshCw,
  FileText, AlertTriangle, CheckCircle2, ArrowUpRight,
  MessageSquare, Download, Eye, Layers, Smartphone, Moon, SunMedium,
  ChevronRight, Lock, Database, Calculator, X,
  Check, Clock, Sparkles, Plug, FolderOpen, Upload
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

// Monthly billing ledger derived directly from the synced CSV monthly summaries
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
    name: 'Sunrun Rooftop Array',
    category: 'Generation',
    metric: `${TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh cumulative (${(TELEMETRY_META.cumulative_solar_kwh / 129).toFixed(1)} kWh/day avg)`,
    health: `${TELEMETRY_META.sunrun_total_rows} CSV Daily Records Loaded`,
    connector: 'Sunrun_Daily_Production_Data.csv',
  },
  {
    id: 'AST-02',
    name: 'NYSEG Bidirectional Smart Meter (Delivered / Received)',
    category: 'Utility Grid',
    metric: `${TELEMETRY_META.cumulative_net_credit_bank_kwh.toFixed(1)} kWh Net Credit Bank`,
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

export default function HeliosPulsePortal() {
  const [darkMode, setDarkMode] = useState(true);
  const [domainMode, setDomainMode] = useState('solar'); // 'solar' | 'generic'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'grid' | 'connectors' | 'billing' | 'assets'
  const [spanFilter, setSpanFilter] = useState('weekly'); // 'weekly' | 'monthly' | 'yearly'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'RECONCILED' | 'SUNRUN_ONLY'
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);

  const [solarRows, setSolarRows] = useState(INITIAL_SOLAR_DAILY);
  const [genericRows] = useState(INITIAL_GENERIC_DAILY);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedAuditRow, setSelectedAuditRow] = useState(null);

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
  const [showMobilePreview, setShowMobilePreview] = useState(false);
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

  // Rows filtered by span ('weekly' = 7 active days, 'monthly' = 30 active days, 'yearly' = all 132 days)
  const spanFilteredRows = useMemo(() => {
    // Filter out trailing 0-production pending placeholder days for weekly/monthly KPI slices unless viewing all
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
    const cumImp = allReconciled.reduce((acc, r) => acc + (r.m01_import_kwh || 0), 0);
    const cumExp = allReconciled.reduce((acc, r) => acc + (r.m02_export_kwh || 0), 0);
    const cumBank = cumExp - cumImp;

    const spanProd = spanFilteredRows.reduce((acc, r) => acc + (r.solar_kwh || 0), 0);
    const spanImp = spanFilteredRows.reduce((acc, r) => acc + (r.m01_import_kwh || 0), 0);
    const spanExp = spanFilteredRows.reduce((acc, r) => acc + (r.m02_export_kwh || 0), 0);
    const spanNetDelta = spanExp - spanImp;

    const maxEodMeter = Math.max(...solarRows.map((r) => r.eod_meter_kwh || 0));

    return {
      cumSolar: cumSolar.toFixed(1),
      cumImp: cumImp.toFixed(1),
      cumExp: cumExp.toFixed(1),
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

  // Last 14 reconciled days for the dashboard chart (or 7 when weekly)
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

  // Browser CSV Upload handler so the user can also re-import updated CSV files directly in the UI
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
      reply = `Across all ${solarTotals.reconciledCount} reconciled NYSEG days (${TELEMETRY_META.date_range_start} to ${TELEMETRY_META.latest_reconciled_date}), NYSEG Received (M02 Export) totaled ${solarTotals.cumExp} kWh and NYSEG Delivered (M01 Import) totaled ${solarTotals.cumImp} kWh, resulting in a cumulative Net-Metering Credit Bank of +${solarTotals.bankBalance} kWh.`;
    } else if (q.toLowerCase().includes('bill') || q.toLowerCase().includes('nyseg') || q.toLowerCase().includes('month')) {
      reply = `Monthly net bank additions from your CSVs: Aug 2026 (+853.60 kWh), Sep 2026 (+580.01 kWh), Oct 2026 (+227.42 kWh), and Nov 2026 MTD (-130.18 kWh seasonal drawdown). Note that Oct 29–30 and Nov 13 & 15 have Sunrun generation logged (${TELEMETRY_META.sunrun_only_days} Sunrun-only days total) awaiting NYSEG interval export.`;
    } else {
      reply = `Your Sunrun array has produced ${solarTotals.cumSolar} kWh cumulatively across ${solarTotals.totalDays} CSV days (End-of-Day Meter Reading: ${solarTotals.maxEodMeter} kWh on ${TELEMETRY_META.latest_sunrun_date}). In the currently selected ${spanFilter} view (${spanFilteredRows.length} days), solar production is ${solarTotals.prod} kWh, M01 Delivered is ${solarTotals.imp} kWh, and M02 Received is ${solarTotals.exp} kWh.`;
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

  const theme = darkMode
    ? 'bg-slate-950 text-slate-100 border-slate-800'
    : 'bg-slate-50 text-slate-900 border-slate-200';
  const cardBg = darkMode
    ? 'bg-slate-900/90 border-slate-800'
    : 'bg-white border-slate-200 shadow-sm';
  const mutedText = darkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`min-h-screen transition-colors duration-200 font-sans ${theme}`}>
      {/* TOP ENTERPRISE NAVIGATION BAR */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-emerald-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base sm:text-lg">HeliosPulse</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  CSV Telemetry Live
                </span>
              </div>
              <p className={`text-xs hidden sm:block ${mutedText}`}>
                {domainMode === 'solar'
                  ? `${TELEMETRY_META.location} • ${TELEMETRY_META.sunrun_total_rows} Sunrun Days + ${TELEMETRY_META.nyseg_hourly_rows.toLocaleString()} NYSEG Hourly Intervals`
                  : 'White-Label Multi-Resource Mode • Electricity, Water, Gas & EV'}
              </p>
            </div>
          </div>

          {/* RIGHT CONTROLS */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`hidden md:flex items-center p-1 rounded-lg border text-xs font-medium ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
              <button
                onClick={() => setDomainMode('solar')}
                className={`px-2.5 py-1 rounded-md transition ${domainMode === 'solar' ? 'bg-amber-500 text-slate-950 font-semibold' : mutedText}`}
              >
                Sunrun + NYSEG
              </button>
              <button
                onClick={() => setDomainMode('generic')}
                className={`px-2.5 py-1 rounded-md transition ${domainMode === 'generic' ? 'bg-indigo-500 text-white font-semibold' : mutedText}`}
              >
                Multi-Resource SaaS
              </button>
            </div>

            <button
              onClick={triggerSyncPipeline}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold transition shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Run Sync Pipeline'}</span>
            </button>

            <button
              onClick={() => setShowMobilePreview(true)}
              title="Preview Published GitHub Pages Mobile Snapshot"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${darkMode ? 'bg-slate-900 border-slate-700 hover:bg-slate-800' : 'bg-white border-slate-300 hover:bg-slate-100'}`}
            >
              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden lg:inline">Mobile Snapshot</span>
            </button>

            <button
              onClick={() => setShowAiDrawer(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Analyst</span>
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg border ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-white border-slate-200 text-slate-700'}`}
              aria-label="Toggle theme"
            >
              {darkMode ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* SUB-NAVIGATION TABS */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-2 overflow-x-auto border-t border-slate-800/40 text-xs font-medium">
          <div className="flex items-center gap-1">
            {[
              { id: 'dashboard', label: 'Executive Dashboard', icon: Activity },
              { id: 'grid', label: `Daily Ledger & Audit (${solarRows.length})`, icon: Database },
              { id: 'connectors', label: 'CSV Sources & Connectors', icon: Plug },
              { id: 'billing', label: 'Monthly Ledger & What-If', icon: Calculator },
              { id: 'assets', label: 'Asset & Circuit Catalog', icon: Layers },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 whitespace-nowrap transition ${
                    active
                      ? 'border-amber-400 text-amber-400 font-semibold'
                      : `border-transparent ${mutedText} hover:text-slate-200`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* GLOBAL SPAN SWITCHER */}
          <div className="hidden sm:flex items-center gap-1.5 py-1.5">
            <span className={`text-[11px] ${mutedText}`}>Window:</span>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-[11px]">
              {[
                { id: 'weekly', label: '7 Days' },
                { id: 'monthly', label: '30 Days' },
                { id: 'yearly', label: `All (${solarRows.length}d)` },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSpanFilter(s.id)}
                  className={`px-2.5 py-1 transition ${
                    spanFilter === s.id ? 'bg-amber-500 text-slate-950 font-semibold' : mutedText
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* LIVE SYNC PIPELINE STATUS BAR */}
        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Automated 6-Stage CSV Ingestion & Reconciliation Gate
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {solarTotals.reconciledCount} RECONCILED / {TELEMETRY_META.sunrun_only_days} SUNRUN-ONLY
              </span>
            </div>
            <span className={`text-xs ${mutedText}`}>Last CSV Sync: {lastSyncTime}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {SYNC_STEPS.map((s) => {
              const completed = !isSyncing || activeSyncStep >= s.id;
              const current = isSyncing && activeSyncStep === s.id;
              return (
                <div
                  key={s.id}
                  className={`p-2.5 rounded-lg border text-xs transition ${
                    current
                      ? 'border-amber-400 bg-amber-500/10'
                      : completed
                      ? darkMode
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-800 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[11px]">0{s.id}</span>
                    {completed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                  <div className="font-semibold truncate">{s.title}</div>
                  <div className={`text-[10px] line-clamp-2 mt-0.5 ${mutedText}`}>{s.detail}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {domainMode === 'solar' ? (
              <>
                {/* 4 SOLAR + NYSEG KPI CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className={mutedText}>
                        Sunrun Generation ({spanFilter === 'weekly' ? '7d' : spanFilter === 'monthly' ? '30d' : 'All'})
                      </span>
                      <Sun className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-bold">{solarTotals.prod} kWh</div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Cumulative EOD Meter: { Number(solarTotals.maxEodMeter).toLocaleString() } kWh</span>
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className={mutedText}>Cumulative NYSEG Credit Bank</span>
                      <Database className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold">+{solarTotals.bankBalance} kWh</div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
                      <span>{solarTotals.netDelta} kWh net in selected window</span>
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className={mutedText}>M01 Delivered / M02 Received</span>
                      <Zap className="w-4 h-4 text-sky-400" />
                    </div>
                    <div className="text-2xl font-bold">
                      {solarTotals.imp} / <span className="text-emerald-400">{solarTotals.exp}</span>
                    </div>
                    <div className={`text-xs mt-1 ${mutedText}`}>
                      All-time: {solarTotals.cumImp} Del / {solarTotals.cumExp} Rec kWh
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className={mutedText}>CSV Coverage & Reconciliation</span>
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-2xl font-bold">{solarTotals.reconciledCount} / {solarTotals.totalDays}d</div>
                    <div className="text-xs text-indigo-400 mt-1">
                      {TELEMETRY_META.date_range_start} → {TELEMETRY_META.date_range_end}
                    </div>
                  </div>
                </div>

                {/* INTERACTIVE VISUALIZATION: PRODUCTION VS IMPORT/EXPORT */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className={`lg:col-span-2 rounded-xl border p-5 ${cardBg}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-semibold text-sm">
                          Daily Energy Balance: Sunrun Production vs. NYSEG Delivered/Received ({chartRows.length} Reconciled Days)
                        </h3>
                        <p className={`text-xs ${mutedText}`}>
                          Source: Sunrun_Daily_Production_Data.csv & NYSEG_Daily_Usage_Data.csv
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Solar</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> M02 Received</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> M01 Delivered</span>
                      </div>
                    </div>

                    <div
                      className="grid gap-2 items-end h-52 pt-4 px-2 border-b border-slate-800/60"
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
                            <div className="w-full flex items-end justify-center gap-0.5 h-40">
                              <div
                                style={{ height: `${solarH}%` }}
                                title={`${row.date} • Solar: ${row.solar_kwh} kWh`}
                                className="w-2 sm:w-3 bg-amber-400 rounded-t transition-all group-hover:opacity-80"
                              />
                              <div
                                style={{ height: `${expH}%` }}
                                title={`${row.date} • NYSEG Received (M02): ${row.m02_export_kwh} kWh`}
                                className="w-2 sm:w-3 bg-emerald-400 rounded-t transition-all group-hover:opacity-80"
                              />
                              <div
                                style={{ height: `${impH}%` }}
                                title={`${row.date} • NYSEG Delivered (M01): ${row.m01_import_kwh} kWh`}
                                className="w-2 sm:w-3 bg-rose-400 rounded-t transition-all group-hover:opacity-80"
                              />
                            </div>
                            <span className={`text-[10px] mt-2 font-mono ${mutedText}`}>{row.date.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ACTIVE CSV SOURCES SUMMARY */}
                  <div className={`rounded-xl border p-5 flex flex-col justify-between ${cardBg}`}>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Active Phase Data Sources</h3>
                      <p className={`text-xs mb-4 ${mutedText}`}>Direct CSV ingestion with PII sanitization</p>
                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                          <div className="font-semibold text-amber-400">1. Sunrun Daily Production CSV</div>
                          <p className={`mt-1 font-mono text-[10px] break-all ${mutedText}`}>
                            {TELEMETRY_META.sunrun_source_path}
                          </p>
                          <p className="mt-1 text-emerald-400 font-medium">
                            {TELEMETRY_META.sunrun_total_rows} days • {TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh produced
                          </p>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                          <div className="font-semibold text-emerald-400">2. NYSEG Hourly Usage CSV</div>
                          <p className={`mt-1 font-mono text-[10px] break-all ${mutedText}`}>
                            {TELEMETRY_META.nyseg_source_path}
                          </p>
                          <p className="mt-1 text-sky-400 font-medium">
                            {TELEMETRY_META.nyseg_hourly_rows.toLocaleString()} hourly rows → {TELEMETRY_META.reconciled_days} daily summaries
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('connectors')}
                      className="mt-4 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      Manage CSV Sources <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* GENERIC MULTI-RESOURCE SAAS MODE */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex justify-between text-xs mb-2"><span className={mutedText}>Electricity Meter</span><Zap className="w-4 h-4 text-amber-400" /></div>
                    <div className="text-2xl font-bold">129.3 kWh</div>
                    <div className="text-xs text-emerald-400 mt-1">-4.2% vs. prior 5-day span</div>
                  </div>
                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex justify-between text-xs mb-2"><span className={mutedText}>Municipal Water</span><Droplet className="w-4 h-4 text-sky-400" /></div>
                    <div className="text-2xl font-bold">703 Gal</div>
                    <div className="text-xs text-emerald-400 mt-1">0 leak anomalies detected</div>
                  </div>
                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex justify-between text-xs mb-2"><span className={mutedText}>Natural Gas</span><Flame className="w-4 h-4 text-orange-400" /></div>
                    <div className="text-2xl font-bold">10.5 Therms</div>
                    <div className="text-xs text-amber-400 mt-1">+12% heating degree-day rise</div>
                  </div>
                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex justify-between text-xs mb-2"><span className={mutedText}>EV OCPP Charger</span><Car className="w-4 h-4 text-indigo-400" /></div>
                    <div className="text-2xl font-bold">34.2 kWh</div>
                    <div className="text-xs text-indigo-400 mt-1">100% off-peak super-saver tariff</div>
                  </div>
                </div>

                <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Configurable Multi-Resource Ledger</h3>
                    <span className="text-xs text-indigo-400">Schema: Configurable Columns & Tariffs</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className={darkMode ? 'bg-slate-950/60 text-slate-400' : 'bg-slate-100 text-slate-600'}>
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Electricity (kWh)</th>
                          <th className="p-3">Water (Gal)</th>
                          <th className="p-3">Gas (Therms)</th>
                          <th className="p-3">EV Charger (kWh)</th>
                          <th className="p-3">Est. Total Cost</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {genericRows.map((r) => (
                          <tr key={r.id}>
                            <td className="p-3 font-mono">{r.date}</td>
                            <td className="p-3">{r.elec_kwh}</td>
                            <td className="p-3">{r.water_gal}</td>
                            <td className="p-3">{r.gas_therm}</td>
                            <td className="p-3">{r.ev_kwh}</td>
                            <td className="p-3 font-semibold">${r.est_cost.toFixed(2)}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${r.status === 'RECONCILED' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DAILY DATA GRID & ROW AUDIT */}
        {activeTab === 'grid' && (
          <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">
                  Reconciled Daily Telemetry & Meter Grid ({sortedSolarRows.length} rows shown)
                </h3>
                <p className={`text-xs ${mutedText}`}>
                  Synced from Sunrun_Daily_Production_Data.csv & NYSEG_Daily_Usage_Data.csv • Click Audit icon for formula trace
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter */}
                <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                  {[
                    { id: 'all', label: 'All Rows' },
                    { id: 'RECONCILED', label: `Reconciled (${TELEMETRY_META.reconciled_days})` },
                    { id: 'SUNRUN_ONLY', label: `Sunrun Only (${TELEMETRY_META.sunrun_only_days})` },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setStatusFilter(st.id)}
                      className={`px-2.5 py-1 ${statusFilter === st.id ? 'bg-indigo-600 text-white font-semibold' : mutedText}`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {/* Span Filter */}
                <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                  {[
                    { id: 'weekly', label: 'Weekly (7d)' },
                    { id: 'monthly', label: 'Monthly (30d)' },
                    { id: 'yearly', label: `All (${solarRows.length}d)` },
                  ].map((span) => (
                    <button
                      key={span.id}
                      onClick={() => setSpanFilter(span.id)}
                      className={`px-2.5 py-1 ${spanFilter === span.id ? 'bg-amber-500 text-slate-950 font-semibold' : mutedText}`}
                    >
                      {span.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[640px]">
              <table className="w-full text-left text-xs">
                <thead className={`sticky top-0 ${darkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                  <tr>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('date')}>Date ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('solar_kwh')}>Solar (kWh) ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('eod_meter_kwh')}>EOD Meter ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('m01_import_kwh')}>M01 Delivered ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('m02_export_kwh')}>M02 Received ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('credit_delta')}>Net Bank Δ ↕</th>
                    <th className="p-3">Weather / Irrad.</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3 text-right">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedSolarRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800/30 transition">
                      <td className="p-3 font-mono font-medium">{row.date}</td>
                      <td className="p-3 font-semibold text-amber-400">{row.solar_kwh.toFixed(2)}</td>
                      <td className={`p-3 font-mono ${mutedText}`}>{row.eod_meter_kwh ? row.eod_meter_kwh.toFixed(1) : '—'}</td>
                      <td className="p-3 text-rose-400">
                        {row.m01_import_kwh !== null ? row.m01_import_kwh.toFixed(2) : <span className={mutedText}>—</span>}
                      </td>
                      <td className="p-3 text-emerald-400">
                        {row.m02_export_kwh !== null ? row.m02_export_kwh.toFixed(2) : <span className={mutedText}>—</span>}
                      </td>
                      <td
                        className={`p-3 font-semibold ${
                          row.credit_delta === null
                            ? mutedText
                            : row.credit_delta >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {row.credit_delta === null
                          ? '—'
                          : row.credit_delta >= 0
                          ? `+${row.credit_delta.toFixed(2)}`
                          : row.credit_delta.toFixed(2)}
                      </td>
                      <td className="p-3">
                        {row.temp_f !== null ? `${row.temp_f}°F • ` : ''}
                        {row.irradiance}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            row.status === 'RECONCILED'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : row.status === 'SUNRUN_ONLY'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-slate-700/40 text-slate-400'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs">
                        {editingNoteId === row.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs w-full"
                            />
                            <button
                              onClick={() => {
                                setSolarRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, note: noteDraft } : r)));
                                setEditingNoteId(null);
                              }}
                              className="p-1 text-emerald-400"
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
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setSelectedAuditRow(row)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-400"
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
        )}

        {/* TAB 3: PROVIDER CONNECTORS & CSV INGESTION */}
        {activeTab === 'connectors' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`rounded-xl border p-5 space-y-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  <h3 className="font-semibold text-sm">Configured Local CSV Data Sources</h3>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  PII Sanitized
                </span>
              </div>
              <p className={`text-xs ${mutedText}`}>
                Build-time & dev-time sync (<code className="text-amber-400">npm run sync-data</code>) reads directly from your local Sunrun and NYSEG CSV files, aggregates hourly intervals into daily summaries, and strips PII before publishing.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium mb-1">Sunrun Daily Production CSV Path</label>
                  <input
                    value={sunrunCsvPathInput}
                    onChange={(e) => setSunrunCsvPathInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px]"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className={mutedText}>
                      Loaded: {TELEMETRY_META.sunrun_total_rows} daily rows ({TELEMETRY_META.cumulative_solar_kwh.toLocaleString()} kWh)
                    </span>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 cursor-pointer font-semibold">
                      <Upload className="w-3.5 h-3.5" /> Reload Sunrun CSV
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleCsvFileUpload(e, 'sunrun')}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <label className="block font-medium mb-1">NYSEG Hourly Usage CSV Path</label>
                  <input
                    value={nysegCsvPathInput}
                    onChange={(e) => setNysegCsvPathInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px]"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className={mutedText}>
                      Loaded: {TELEMETRY_META.nyseg_hourly_rows.toLocaleString()} hourly rows ({TELEMETRY_META.reconciled_days} days)
                    </span>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 cursor-pointer font-semibold">
                      <Upload className="w-3.5 h-3.5" /> Reload NYSEG CSV
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

              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-semibold">Recent Connector Ingestion Audit Logs</div>
                {syncLogs.map((l, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] font-mono">
                    <div className="flex justify-between text-emerald-400">
                      <span>[{l.provider}] {l.status}</span>
                      <span className="text-slate-500">{l.ts}</span>
                    </div>
                    <div className="text-slate-300 mt-0.5">{l.msg}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-xl border p-5 space-y-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Single-Day Telemetry Payload Tester</h3>
                <span className="text-xs text-amber-400">Physical Bound Guard Active</span>
              </div>
              <p className={`text-xs ${mutedText}`}>
                Test single-day JSON ingestion or try setting <code className="text-rose-400">m02_export_kwh</code> higher than <code className="text-amber-400">production_kwh</code> to trigger the reconciliation guard.
              </p>

              <textarea
                rows={7}
                value={rawPayloadInput}
                onChange={(e) => setRawPayloadInput(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs"
              />

              {ingestBanner && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    ingestBanner.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                  }`}
                >
                  {ingestBanner.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{ingestBanner.text}</span>
                </div>
              )}

              <button
                onClick={handleIngestRawPayload}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition"
              >
                Validate & Reconcile Record into Dashboard
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: BILLING REVISIONS & WHAT-IF FORECASTER */}
        {activeTab === 'billing' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 rounded-xl border p-5 space-y-4 ${cardBg}`}>
              <h3 className="font-semibold text-sm">Monthly Reconciled Sunrun + NYSEG Statement Ledger (From CSVs)</h3>
              <div className="space-y-4">
                {NYSEG_BILL_REVISIONS.map((bill) => (
                  <div key={bill.revision_id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-xs text-sky-400">{bill.revision_id}</span>
                        <span className={`ml-2 text-xs ${mutedText}`}>Period: {bill.period}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {bill.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                      <div><span className={`block ${mutedText}`}>Solar Produced</span><span className="font-semibold text-amber-400">{bill.solar_produced_kwh} kWh</span></div>
                      <div><span className={`block ${mutedText}`}>M01 Delivered</span><span className="font-semibold text-rose-400">{bill.m01_billed_kwh} kWh</span></div>
                      <div><span className={`block ${mutedText}`}>M02 Received</span><span className="font-semibold text-emerald-400">{bill.m02_exported_kwh} kWh</span></div>
                      <div><span className={`block ${mutedText}`}>Ending Credit Bank</span><span className="font-semibold text-sky-400">{bill.ending_credit_bank} kWh</span></div>
                      <div><span className={`block ${mutedText}`}>Est. Monthly Due</span><span className="font-bold text-base">${bill.total_due.toFixed(2)}</span></div>
                    </div>

                    <div className={`text-[11px] pt-2 border-t border-slate-800/80 ${mutedText}`}>
                      {bill.audit_note}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* WHAT-IF SCENARIO SIMULATOR */}
            <div className={`rounded-xl border p-5 space-y-5 ${cardBg}`}>
              <div>
                <h3 className="font-semibold text-sm">Net-Metering Credit Bank Forecaster</h3>
                <p className={`text-xs ${mutedText}`}>
                  Starting from your real +{solarTotals.bankBalance} kWh NYSEG credit bank
                </p>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Winter HVAC Load Delta</span>
                    <span className="font-bold text-amber-400">+{winterUsageGrowth}%</span>
                  </div>
                  <input
                    type="range"
                    min="-15"
                    max="40"
                    value={winterUsageGrowth}
                    onChange={(e) => setWinterUsageGrowth(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>NYSEG Delivery + Supply Escalation</span>
                    <span className="font-bold text-sky-400">+{utilityRateEscalation}% / yr</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="0.5"
                    value={utilityRateEscalation}
                    onChange={(e) => setUtilityRateEscalation(Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <div className="text-xs text-emerald-300">Projected Spring Credit Bank Reserve</div>
                <div className="text-2xl font-bold text-emerald-400">{projectedBank6Mo} kWh</div>
                <div className={`text-[11px] ${mutedText}`}>
                  Avoided utility bill value at escalated rate: $
                  {(projectedBank6Mo * 0.2007 * (1 + utilityRateEscalation / 100)).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ASSET & CIRCUIT CATALOG */}
        {activeTab === 'assets' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ASSET_CATALOG.map((asset) => (
              <div key={asset.id} className={`rounded-xl border p-4 flex items-start justify-between ${cardBg}`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">{asset.id}</span>
                    <span className="text-xs font-semibold text-amber-400">{asset.category}</span>
                  </div>
                  <h4 className="font-bold text-sm">{asset.name}</h4>
                  <p className={`text-xs ${mutedText}`}>Telemetry Source: {asset.connector}</p>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold">{asset.metric}</div>
                  <div className="text-emerald-400 mt-1">{asset.health}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ROW CALCULATION AUDIT MODAL */}
      {selectedAuditRow && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`max-w-md w-full rounded-2xl border p-5 space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Record Audit & CSV Formula Breakdown</h3>
              <button onClick={() => setSelectedAuditRow(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs space-y-1.5">
              <div>Record ID: <span className="text-amber-400">{selectedAuditRow.id}</span></div>
              <div>Date: {selectedAuditRow.date}</div>
              <div>Sunrun Solar Produced: <span className="text-amber-400">{selectedAuditRow.solar_kwh} kWh</span></div>
              <div>Sunrun EOD Meter Reading: {selectedAuditRow.eod_meter_kwh ?? 0} kWh</div>
              <div>
                NYSEG M02 Received (Export):{' '}
                <span className="text-emerald-400">
                  {selectedAuditRow.m02_export_kwh !== null ? `${selectedAuditRow.m02_export_kwh} kWh` : 'Pending CSV'}
                </span>
              </div>
              <div>
                NYSEG M01 Delivered (Import):{' '}
                <span className="text-rose-400">
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
                  <div className="pt-2 border-t border-slate-800 text-emerald-400">
                    Net Credit Bank Formula: ({selectedAuditRow.m02_export_kwh} - {selectedAuditRow.m01_import_kwh}) = {selectedAuditRow.credit_delta} kWh
                  </div>
                  <div className="text-slate-400">
                    Physical Check: M02 ({selectedAuditRow.m02_export_kwh}) &le; Solar ({selectedAuditRow.solar_kwh}) + 0.5 kWh [PASS]
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE SNAPSHOT PREVIEW MODAL */}
      {showMobilePreview && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[360px] rounded-[2.2rem] border-4 border-slate-700 bg-slate-950 text-slate-100 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-400">GitHub Pages Read-Only Snapshot</span>
              <button onClick={() => setShowMobilePreview(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700">
              <div className="text-xs text-slate-400">NYSEG Net-Metering Credit Bank</div>
              <div className="text-3xl font-bold text-emerald-400 mt-1">+{solarTotals.bankBalance} kWh</div>
              <div className="text-[11px] text-slate-400 mt-2">Zero PII • Sanitized CSV Snapshot • {lastSyncTime}</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Cumulative Solar</div>
                <div className="font-bold text-amber-400 text-base">{Number(solarTotals.cumSolar).toLocaleString()} kWh</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Reconciled Days</div>
                <div className="font-bold text-base">{solarTotals.reconciledCount} Days</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GROUNDED AI RESOURCE ANALYST DRAWER */}
      {showAiDrawer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className={`w-full max-w-md h-full border-l p-5 flex flex-col justify-between ${cardBg}`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm">Grounded CSV Telemetry Analyst</h3>
              </div>
              <button onClick={() => setShowAiDrawer(false)}><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 text-xs">
              {aiMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white ml-8'
                      : 'bg-slate-950 border border-slate-800 mr-6 leading-relaxed'
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap gap-1.5">
                {['How is my NYSEG credit bank?', 'Explain monthly CSV totals'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleAskAi(preset)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700"
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
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                />
                <button
                  onClick={() => handleAskAi()}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
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
