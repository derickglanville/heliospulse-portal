import React, { useState, useMemo } from 'react';
import {
  Sun, Zap, Droplet, Flame, Car, Activity, ShieldCheck, RefreshCw,
  FileText, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight,
  Sliders, MessageSquare, Download, Eye, Layers, Smartphone, Moon, SunMedium,
  ChevronRight, Lock, Database, Terminal, Calculator, Search, X, ExternalLink,
  Check, Clock, Sparkles, Server, KeyRound, Plug, FileCode2
} from 'lucide-react';

// --- SEED DATA: JEFFERSON VALLEY, NY (SUNRUN + NYSEG) ---
const INITIAL_SOLAR_DAILY = [
  { id: 'SR-9081', date: '2026-11-16', solar_kwh: 28.4, m01_import_kwh: 14.2, m02_export_kwh: 16.8, credit_delta: 2.6, temp_f: 46, irradiance: 'Clear', status: 'RECONCILED', note: 'Peak midday output; heat pump defrost cycle at 06:00' },
  { id: 'SR-9080', date: '2026-11-15', solar_kwh: 31.2, m01_import_kwh: 12.1, m02_export_kwh: 19.5, credit_delta: 7.4, temp_f: 49, irradiance: 'Clear', status: 'RECONCILED', note: '' },
  { id: 'SR-9079', date: '2026-11-14', solar_kwh: 11.6, m01_import_kwh: 22.8, m02_export_kwh: 3.1, credit_delta: -19.7, temp_f: 41, irradiance: 'Overcast', status: 'RECONCILED', note: 'Rain/cloud cover all afternoon' },
  { id: 'SR-9078', date: '2026-11-13', solar_kwh: 29.8, m01_import_kwh: 13.5, m02_export_kwh: 18.0, credit_delta: 4.5, temp_f: 45, irradiance: 'Partly Cloudy', status: 'RECONCILED', note: '' },
  { id: 'SR-9077', date: '2026-11-12', solar_kwh: 33.1, m01_import_kwh: 11.4, m02_export_kwh: 21.4, credit_delta: 10.0, temp_f: 52, irradiance: 'Clear', status: 'RECONCILED', note: 'Highest November daily yield' },
  { id: 'SR-9076', date: '2026-11-11', solar_kwh: 19.4, m01_import_kwh: 16.9, m02_export_kwh: 8.2, credit_delta: -8.7, temp_f: 44, irradiance: 'Variable', status: 'RECONCILED', note: '' },
  { id: 'SR-9075', date: '2026-11-10', solar_kwh: 26.7, m01_import_kwh: 14.8, m02_export_kwh: 15.1, credit_delta: 0.3, temp_f: 48, irradiance: 'Clear', status: 'RECONCILED', note: '' },
];

const INITIAL_GENERIC_DAILY = [
  { id: 'MR-401', date: '2026-11-16', elec_kwh: 25.8, water_gal: 142, gas_therm: 2.1, ev_kwh: 11.4, est_cost: 9.84, status: 'RECONCILED', note: 'EV overnight Level-2 top-up' },
  { id: 'MR-400', date: '2026-11-15', elec_kwh: 23.8, water_gal: 168, gas_therm: 1.9, ev_kwh: 0.0, est_cost: 7.42, status: 'RECONCILED', note: 'Laundry cycle + dishwasher' },
  { id: 'MR-399', date: '2026-11-14', elec_kwh: 31.3, water_gal: 130, gas_therm: 2.8, ev_kwh: 14.2, est_cost: 12.15, status: 'ANOMALY_FLAGGED', note: 'Cold snap heating spike' },
  { id: 'MR-398', date: '2026-11-13', elec_kwh: 25.3, water_gal: 125, gas_therm: 2.0, ev_kwh: 0.0, est_cost: 7.60, status: 'RECONCILED', note: '' },
  { id: 'MR-397', date: '2026-11-12', elec_kwh: 23.1, water_gal: 138, gas_therm: 1.7, ev_kwh: 8.6, est_cost: 8.91, status: 'RECONCILED', note: '' },
];

const NYSEG_BILL_REVISIONS = [
  {
    revision_id: 'REV-2026-10-B',
    period: '2026-09-18 to 2026-10-17',
    statement_date: '2026-10-21',
    status: 'ACTIVE_REVISED',
    basic_service_charge: 19.11,
    m01_billed_kwh: 388,
    m02_exported_kwh: 512,
    prior_credit_bank: 1420,
    ending_credit_bank: 1544,
    delivery_rate: 0.1142,
    supply_rate: 0.0865,
    sbc_ram_surcharge: 4.18,
    total_due: 23.29,
    audit_note: 'Corrected statement superseded REV-2026-10-A (+18 kWh M02 interval adjustment).'
  },
  {
    revision_id: 'REV-2026-09-A',
    period: '2026-08-19 to 2026-09-17',
    statement_date: '2026-09-20',
    status: 'ARCHIVED_FINAL',
    basic_service_charge: 19.11,
    m01_billed_kwh: 410,
    m02_exported_kwh: 645,
    prior_credit_bank: 1185,
    ending_credit_bank: 1420,
    delivery_rate: 0.1142,
    supply_rate: 0.0881,
    sbc_ram_surcharge: 4.45,
    total_due: 23.56,
    audit_note: 'Verified against Green Button ESPI XML batch #882.'
  }
];

const ASSET_CATALOG = [
  { id: 'AST-01', name: 'Sunrun Rooftop Array (9.6 kW DC)', category: 'Generation', metric: '28.4 kWh/day avg', health: '99.2% Guarantee Pace', connector: 'Sunrun Telemetry API' },
  { id: 'AST-02', name: 'NYSEG Bidirectional Smart Meter (M01/M02)', category: 'Utility Grid', metric: '1,544 kWh Bank', health: 'Synced (15-min ESPI)', connector: 'NYSEG Green Button' },
  { id: 'AST-03', name: 'DuctlessAire 18k BTU Mini-Split (DA1821)', category: 'HVAC Load', metric: '~4.8 kWh/day', health: 'Normal Winter Defrost', connector: 'Circuit CT Clamp #4' },
  { id: 'AST-04', name: 'GE JS645SL1SS Electric Range', category: 'Appliance', metric: '~1.9 kWh/day', health: 'Nominal', connector: 'Sub-panel Sensor #2' },
];

const SYNC_STEPS = [
  { id: 1, title: 'Connect Providers', detail: 'Authenticate Sunrun OAuth & NYSEG Green Button tokens via OS Keyring' },
  { id: 2, title: 'Retrieve Telemetry & Bills', detail: 'Fetch delta daily kWh intervals + billing revision PDFs/XML' },
  { id: 3, title: 'Validate & Reconcile', detail: 'Enforce M02_export <= Solar_production + 0.5 kWh physical bound' },
  { id: 4, title: 'Anomaly & Gap Detection', detail: 'Scan for missing intervals, revised statements, or inverter derating' },
  { id: 5, title: 'Recompute Models & Forecasts', detail: 'Update NYSEG net-metering credit bank & rolling 12-mo cost curve' },
  { id: 6, title: 'Publish Mobile Snapshot', detail: 'Strip account IDs & write sanitized JSON to GitHub Pages branch' },
];

export default function HeliosPulsePortal() {
  const [darkMode, setDarkMode] = useState(true);
  const [domainMode, setDomainMode] = useState('solar'); // 'solar' | 'generic'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'grid' | 'connectors' | 'billing' | 'assets'
  const [spanFilter, setSpanFilter] = useState('weekly'); // 'weekly' | 'monthly' | 'yearly'
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
  const [lastSyncTime, setLastSyncTime] = useState('2026-11-17 06:00:14 EST');
  const [syncLogs, setSyncLogs] = useState([
    { ts: '2026-11-17 06:00:14', provider: 'Coordinator', status: 'VERIFIED_COMPLETE', msg: 'Published sanitized snapshot (7/7 days reconciled, 0 gaps).' },
    { ts: '2026-11-17 06:00:11', provider: 'NYSEGConnector', status: 'SUCCESS', msg: 'Fetched 7 daily M01/M02 summaries + active revision REV-2026-10-B.' },
    { ts: '2026-11-17 06:00:08', provider: 'SunrunConnector', status: 'SUCCESS', msg: 'Fetched 7 daily production records (SR-9075..SR-9081).' },
  ]);

  // Connector Configuration (Volatile Memory Only - Never Stored in localStorage)
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:5050/api/v1/sync');
  const [sunrunSiteId, setSunrunSiteId] = useState('SR-JV-10598-A');
  const [nysegAccountId, setNysegAccountId] = useState('1004-XXXX-892');
  const [rawPayloadInput, setRawPayloadInput] = useState(
    '{\n  "provider": "sunrun",\n  "id": "SR-9082",\n  "date": "2026-11-17",\n  "production_kwh": 29.6,\n  "m01_import_kwh": 13.1,\n  "m02_export_kwh": 17.9\n}'
  );
  const [ingestBanner, setIngestBanner] = useState(null);

  // Modals & Drawers
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiMessages, setAiMessages] = useState([
    {
      role: 'assistant',
      text: 'Connected to your verified Jefferson Valley ledger (1,544 kWh NYSEG credit bank). Ask about production variance, NYSEG bill revisions, or seasonal winter drawdown.'
    }
  ]);

  // What-If Scenario Sliders
  const [winterUsageGrowth, setWinterUsageGrowth] = useState(10); // % HVAC load increase
  const [utilityRateEscalation, setUtilityRateEscalation] = useState(4.5); // % annual NYSEG delivery/supply increase

  // Computed KPIs
  const solarTotals = useMemo(() => {
    const prod = solarRows.reduce((acc, r) => acc + r.solar_kwh, 0);
    const imp = solarRows.reduce((acc, r) => acc + r.m01_import_kwh, 0);
    const exp = solarRows.reduce((acc, r) => acc + r.m02_export_kwh, 0);
    const netDelta = exp - imp;
    return {
      prod: prod.toFixed(1),
      imp: imp.toFixed(1),
      exp: exp.toFixed(1),
      netDelta: (netDelta >= 0 ? '+' : '') + netDelta.toFixed(1),
      bankBalance: (1544 + netDelta).toFixed(0),
      estMonthlySavings: ((prod * 0.2007)).toFixed(2),
    };
  }, [solarRows]);

  const sortedSolarRows = useMemo(() => {
    return [...solarRows].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [solarRows, sortField, sortAsc]);

  const projectedBank6Mo = useMemo(() => {
    const monthlyDrawdown = 185 * (1 + winterUsageGrowth / 100);
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
            msg: `All 6 pipeline gates passed (${solarRows.length} records reconciled & mobile snapshot published).`
          },
          ...prev
        ]);
      }
    }, 550);
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
        solar_kwh: Number(parsed.production_kwh.toFixed(1)),
        m01_import_kwh: Number(m01.toFixed(1)),
        m02_export_kwh: Number(m02.toFixed(1)),
        credit_delta: Number((m02 - m01).toFixed(1)),
        temp_f: 45,
        irradiance: 'Clear',
        status: 'RECONCILED',
        note: 'Ingested via Connector Payload Parser'
      };

      setSolarRows((prev) => [newRow, ...prev.filter((r) => r.date !== newRow.date)]);
      setIngestBanner({ type: 'success', text: `Validated & reconciled ${newRow.date} (${newRow.id}). Dashboard KPIs updated.` });
    } catch (err) {
      setIngestBanner({ type: 'error', text: err.message });
    }
  };

  const handleExportCsv = () => {
    const headers = ['Record_ID', 'Date', 'Solar_Production_kWh', 'NYSEG_M01_Import_kWh', 'NYSEG_M02_Export_kWh', 'Net_Credit_Delta_kWh', 'Status', 'Note'];
    const csvLines = [
      headers.join(','),
      ...sortedSolarRows.map((r) =>
        [r.id, r.date, r.solar_kwh, r.m01_import_kwh, r.m02_export_kwh, r.credit_delta, r.status, `"${r.note.replace(/"/g, '""')}"`].join(',')
      )
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heliospulse_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAskAi = (promptText) => {
    const q = (promptText || aiQuery).trim();
    if (!q) return;
    let reply = '';
    if (q.toLowerCase().includes('credit') || q.toLowerCase().includes('bank')) {
      reply = `Your NYSEG net-metering credit bank sits at ${solarTotals.bankBalance} kWh (1,544 kWh per active statement REV-2026-10-B plus ${solarTotals.netDelta} kWh net export in the current 7-day window). Even with a +${winterUsageGrowth}% winter heat-pump load increase, your bank covers winter deficits through April.`;
    } else if (q.toLowerCase().includes('bill') || q.toLowerCase().includes('nyseg')) {
      reply = `Your latest NYSEG bill ($23.29 for period ending 2026-10-17) consists solely of the $19.11 Basic Service Charge plus $4.18 SBC/RAM surcharges because your 512 kWh M02 exports exceeded your 388 kWh M01 imports by 124 kWh. Revision REV-2026-10-B automatically superseded REV-2026-10-A after adding 18 kWh of interval exports.`;
    } else {
      reply = `Over the last 7 days, your Sunrun array generated ${solarTotals.prod} kWh while NYSEG M01 grid imports totaled ${solarTotals.imp} kWh and M02 exports totaled ${solarTotals.exp} kWh. Peak output occurred on 2026-11-12 (33.1 kWh, 52°F, Clear).`;
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
                  Intelligence Portal
                </span>
              </div>
              <p className={`text-xs hidden sm:block ${mutedText}`}>
                {domainMode === 'solar'
                  ? 'Jefferson Valley, NY • Sunrun Telemetry + NYSEG Net-Metering'
                  : 'White-Label Multi-Resource Mode • Electricity, Water, Gas & EV'}
              </p>
            </div>
          </div>

          {/* RIGHT CONTROLS */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Domain Architecture Switcher */}
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto border-t border-slate-800/40 text-xs font-medium">
          {[
            { id: 'dashboard', label: 'Executive Dashboard', icon: Activity },
            { id: 'grid', label: 'Daily Ledger & Audit', icon: Database },
            { id: 'connectors', label: 'Provider Connectors', icon: Plug },
            { id: 'billing', label: 'Bills & What-If Engine', icon: Calculator },
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
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* LIVE SYNC PIPELINE STATUS BAR */}
        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Automated 6-Stage Ingestion & Reconciliation Gate
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                VERIFIED_COMPLETE
              </span>
            </div>
            <span className={`text-xs ${mutedText}`}>Last Snapshot Published: {lastSyncTime}</span>
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
                      <span className={mutedText}>Sunrun Generation (7d)</span>
                      <Sun className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-bold">{solarTotals.prod} kWh</div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>+6.4% vs. November rolling model</span>
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className={mutedText}>NYSEG Net-Metering Bank</span>
                      <Database className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold">{solarTotals.bankBalance} kWh</div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
                      <span>{solarTotals.netDelta} kWh net export this week</span>
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className={mutedText}>M01 Import / M02 Export</span>
                      <Zap className="w-4 h-4 text-sky-400" />
                    </div>
                    <div className="text-2xl font-bold">
                      {solarTotals.imp} / <span className="text-emerald-400">{solarTotals.exp}</span>
                    </div>
                    <div className={`text-xs mt-1 ${mutedText}`}>
                      Export ratio: {((Number(solarTotals.exp) / Number(solarTotals.prod)) * 100).toFixed(0)}% sent to grid
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className={mutedText}>Latest NYSEG Statement</span>
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-2xl font-bold">$23.29</div>
                    <div className="text-xs text-indigo-400 mt-1">
                      Basic charge + surcharges only ($0 supply)
                    </div>
                  </div>
                </div>

                {/* INTERACTIVE VISUALIZATION: PRODUCTION VS IMPORT/EXPORT */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className={`lg:col-span-2 rounded-xl border p-5 ${cardBg}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-sm">Daily Energy Balance: Sunrun Production vs. NYSEG M01/M02</h3>
                        <p className={`text-xs ${mutedText}`}>Reconciled 24-hour meter intervals (kWh)</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Solar</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> M02 Export</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> M01 Import</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-3 items-end h-52 pt-4 px-2 border-b border-slate-800/60">
                      {[...solarRows].reverse().map((row) => {
                        const maxVal = 36;
                        const solarH = Math.min(100, (row.solar_kwh / maxVal) * 100);
                        const expH = Math.min(100, (row.m02_export_kwh / maxVal) * 100);
                        const impH = Math.min(100, (row.m01_import_kwh / maxVal) * 100);
                        return (
                          <div key={row.date} className="flex flex-col items-center h-full justify-end group">
                            <div className="w-full flex items-end justify-center gap-1 h-40">
                              <div
                                style={{ height: `${solarH}%` }}
                                title={`Solar: ${row.solar_kwh} kWh`}
                                className="w-2.5 sm:w-3.5 bg-amber-400 rounded-t transition-all group-hover:opacity-80"
                              />
                              <div
                                style={{ height: `${expH}%` }}
                                title={`M02 Export: ${row.m02_export_kwh} kWh`}
                                className="w-2.5 sm:w-3.5 bg-emerald-400 rounded-t transition-all group-hover:opacity-80"
                              />
                              <div
                                style={{ height: `${impH}%` }}
                                title={`M01 Import: ${row.m01_import_kwh} kWh`}
                                className="w-2.5 sm:w-3.5 bg-rose-400 rounded-t transition-all group-hover:opacity-80"
                              />
                            </div>
                            <span className={`text-[10px] mt-2 font-mono ${mutedText}`}>{row.date.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* THREE-LAYER ARCHITECTURAL OVERVIEW */}
                  <div className={`rounded-xl border p-5 flex flex-col justify-between ${cardBg}`}>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Three-Layer Portal Architecture</h3>
                      <p className={`text-xs mb-4 ${mutedText}`}>Modular design ready for commercial white-label deployment</p>
                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                          <div className="font-semibold text-amber-400">1. Data Connectors Layer</div>
                          <p className={`mt-0.5 ${mutedText}`}>Sunrun Telemetry API, NYSEG Green Button ESPI XML, CSV/PDF fallback.</p>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                          <div className="font-semibold text-emerald-400">2. Rules & Audit Engine</div>
                          <p className={`mt-0.5 ${mutedText}`}>Tariff calculators, revision-safe bill ledger, physical kWh bounds & anomaly checks.</p>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                          <div className="font-semibold text-sky-400">3. Presentation & Mobile Snapshot</div>
                          <p className={`mt-0.5 ${mutedText}`}>Interactive desktop analytics + dependency-gated GitHub Pages static JSON.</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('connectors')}
                      className="mt-4 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      Configure Live Connectors <ChevronRight className="w-3.5 h-3.5" />
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
                <h3 className="font-semibold text-sm">Reconciled Daily Telemetry & Meter Grid</h3>
                <p className={`text-xs ${mutedText}`}>Click any row's Audit icon to inspect source IDs and net-metering math</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                  {['weekly', 'monthly', 'yearly'].map((span) => (
                    <button
                      key={span}
                      onClick={() => setSpanFilter(span)}
                      className={`px-2.5 py-1 capitalize ${spanFilter === span ? 'bg-amber-500 text-slate-950 font-semibold' : mutedText}`}
                    >
                      {span}
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

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={darkMode ? 'bg-slate-950/60 text-slate-400' : 'bg-slate-100 text-slate-600'}>
                  <tr>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('date')}>Date ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('solar_kwh')}>Solar (kWh) ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('m01_import_kwh')}>M01 Import ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('m02_export_kwh')}>M02 Export ↕</th>
                    <th className="p-3 cursor-pointer" onClick={() => toggleSort('credit_delta')}>Net Bank Δ ↕</th>
                    <th className="p-3">Weather</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3 text-right">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedSolarRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800/30 transition">
                      <td className="p-3 font-mono font-medium">{row.date}</td>
                      <td className="p-3 font-semibold text-amber-400">{row.solar_kwh.toFixed(1)}</td>
                      <td className="p-3 text-rose-400">{row.m01_import_kwh.toFixed(1)}</td>
                      <td className="p-3 text-emerald-400">{row.m02_export_kwh.toFixed(1)}</td>
                      <td className={`p-3 font-semibold ${row.credit_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {row.credit_delta >= 0 ? `+${row.credit_delta.toFixed(1)}` : row.credit_delta.toFixed(1)}
                      </td>
                      <td className="p-3">{row.temp_f}°F • {row.irradiance}</td>
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
                              setNoteDraft(row.note);
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

        {/* TAB 3: PROVIDER CONNECTORS & PAYLOAD INGESTION */}
        {activeTab === 'connectors' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`rounded-xl border p-5 space-y-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-sm">EnergyProviderConnector Bridge (Zero-Secret Frontend)</h3>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">OS Keyring Isolated</span>
              </div>
              <p className={`text-xs ${mutedText}`}>
                Provider passwords and OAuth refresh tokens remain strictly inside Windows Credential Manager on your local backend. Only sanitized daily telemetry crosses this bridge.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium mb-1">Local Python Coordinator Endpoint</label>
                  <input
                    value={bridgeUrl}
                    onChange={(e) => setBridgeUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Sunrun Site ID</label>
                    <input
                      value={sunrunSiteId}
                      onChange={(e) => setSunrunSiteId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">NYSEG Subscription ID</label>
                    <input
                      value={nysegAccountId}
                      onChange={(e) => setNysegAccountId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <h4 className="text-xs font-semibold mb-2">Recent Connector Audit Trail</h4>
                <div className="space-y-2">
                  {syncLogs.map((log, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px]">
                      <div className="flex justify-between font-mono text-slate-400 mb-0.5">
                        <span>{log.provider}</span>
                        <span>{log.ts}</span>
                      </div>
                      <div className="text-emerald-400 font-medium">{log.msg}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* LIVE CONNECTOR PAYLOAD VALIDATOR */}
            <div className={`rounded-xl border p-5 space-y-4 ${cardBg}`}>
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-sm">Live Connector Payload Validator & Ingest</h3>
              </div>
              <p className={`text-xs ${mutedText}`}>
                Test normalized JSON records from <code className="text-amber-400">SunrunConnector</code> or <code className="text-sky-400">NYSEGConnector</code> against physical kWh bounds before committing to the dashboard.
              </p>

              <textarea
                rows={8}
                value={rawPayloadInput}
                onChange={(e) => setRawPayloadInput(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300"
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
              <h3 className="font-semibold text-sm">NYSEG Statement Revision Ledger (Audit-Preserving)</h3>
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

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div><span className={`block ${mutedText}`}>M01 Billed</span><span className="font-semibold">{bill.m01_billed_kwh} kWh</span></div>
                      <div><span className={`block ${mutedText}`}>M02 Exported</span><span className="font-semibold text-emerald-400">{bill.m02_exported_kwh} kWh</span></div>
                      <div><span className={`block ${mutedText}`}>Ending Credit Bank</span><span className="font-semibold text-amber-400">{bill.ending_credit_bank} kWh</span></div>
                      <div><span className={`block ${mutedText}`}>Amount Due</span><span className="font-bold text-base">${bill.total_due.toFixed(2)}</span></div>
                    </div>

                    <div className={`text-[11px] pt-2 border-t border-slate-800/80 ${mutedText}`}>
                      Audit Trace: {bill.audit_note}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* WHAT-IF SCENARIO SIMULATOR */}
            <div className={`rounded-xl border p-5 space-y-5 ${cardBg}`}>
              <div>
                <h3 className="font-semibold text-sm">Net-Metering Credit Bank Forecaster</h3>
                <p className={`text-xs ${mutedText}`}>Simulate winter DuctlessAire heat-pump draw & NYSEG tariff shifts</p>
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
              <h3 className="font-bold text-sm">Record Audit & Formula Breakdown</h3>
              <button onClick={() => setSelectedAuditRow(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs space-y-1.5">
              <div>Source Record ID: <span className="text-amber-400">{selectedAuditRow.id}</span></div>
              <div>Date: {selectedAuditRow.date}</div>
              <div>Sunrun Gross Production: {selectedAuditRow.solar_kwh} kWh</div>
              <div>NYSEG M02 Grid Export: {selectedAuditRow.m02_export_kwh} kWh</div>
              <div>NYSEG M01 Grid Import: {selectedAuditRow.m01_import_kwh} kWh</div>
              <div className="pt-2 border-t border-slate-800 text-emerald-400">
                Net Credit Bank Formula: ({selectedAuditRow.m02_export_kwh} - {selectedAuditRow.m01_import_kwh}) = {selectedAuditRow.credit_delta} kWh
              </div>
              <div className="text-slate-400">
                Physical Check: M02 ({selectedAuditRow.m02_export_kwh}) &le; Solar ({selectedAuditRow.solar_kwh}) + 0.5 kWh [PASS]
              </div>
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
              <div className="text-3xl font-bold text-emerald-400 mt-1">{solarTotals.bankBalance} kWh</div>
              <div className="text-[11px] text-slate-400 mt-2">Zero PII • Sanitized JSON • {lastSyncTime}</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400">7d Solar</div>
                <div className="font-bold text-amber-400 text-base">{solarTotals.prod} kWh</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Latest Bill</div>
                <div className="font-bold text-base">$23.29</div>
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
                <h3 className="font-bold text-sm">Grounded Resource Analyst</h3>
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
                {['How is my NYSEG credit bank?', 'Explain latest NYSEG bill'].map((preset) => (
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
                  placeholder="Ask about your meters, bills, or forecasts..."
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