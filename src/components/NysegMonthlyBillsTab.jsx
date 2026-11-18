import React, { useState, useMemo } from 'react';
import { RefreshCw, FolderOpen, FileText, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';

export default function NysegMonthlyBillsTab({
  moreBillsData,
  onRescanBills,
  isSyncing,
  lastFolderEvent,
  darkMode,
  cardBg,
  calloutBg,
  subPanelBg,
  mutedText,
  trackBg,
  dividerBorder,
  pillBtnSecondary,
}) {
  const [billFilter, setBillFilter] = useState('authoritative'); // 'all' | 'authoritative' | 'post_solar' | 'pre_solar'
  const [expandedIdx, setExpandedIdx] = useState(null);

  const bills = moreBillsData?.bills || [];
  const creditHistory = moreBillsData?.credit_bank_history || [];
  const projection = moreBillsData?.next_bill_projection || null;

  const filteredBills = useMemo(() => {
    if (billFilter === 'authoritative') return bills.filter((b) => b.is_authoritative);
    if (billFilter === 'post_solar') return bills.filter((b) => b.is_authoritative && (b.exported_kwh > 0 || b.remaining_excess_generation_kwh != null));
    if (billFilter === 'pre_solar') return bills.filter((b) => b.is_authoritative && !b.exported_kwh && b.remaining_excess_generation_kwh == null);
    return bills;
  }, [bills, billFilter]);

  const maxBankKwh = useMemo(() => {
    const vals = creditHistory.map((c) => c.remaining_kwh || 0);
    if (projection?.credit_bank_after_kwh) vals.push(projection.credit_bank_after_kwh);
    return Math.max(2500, ...vals);
  }, [creditHistory, projection]);

  return (
    <div className="space-y-6">
      {/* EDITORIAL HEADING + LIVE FOLDER SYNC STATUS */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            NYSEG monthly bills, credit bank & next-bill projection
          </h1>
          <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
            Analyzed directly from <code className="font-mono text-xs">{moreBillsData?.source_folder || 'NYSEG Bill\\Bills\\More Bills'}</code> ({moreBillsData?.total_pdf_files || bills.length} PDF files scanned · {moreBillsData?.authoritative_count || bills.length} billing periods). Adding a new PDF bill to that folder automatically updates this page.
          </p>
        </div>

        <button
          onClick={onRescanBills}
          disabled={isSyncing}
          className={`px-4 py-2 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${pillBtnSecondary}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#1f7a4c] ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Scanning Bills...' : 'Scan Bills Folder'}</span>
        </button>
      </div>

      {lastFolderEvent && (
        <div className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${calloutBg}`}>
          <FolderOpen className="w-4 h-4 text-[#1f7a4c] shrink-0" />
          <span>{lastFolderEvent}</span>
        </div>
      )}

      {/* TOP 4 KPI SUMMARY CALLOUTS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
          <div className={`text-xs font-medium ${mutedText}`}>Current Official Credit Bank</div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#1f7a4c]">
            {(moreBillsData?.current_credit_bank_kwh ?? 0).toLocaleString()} kWh
          </div>
          <div className={`text-xs ${mutedText}`}>
            ≈ ${((moreBillsData?.current_credit_bank_kwh ?? 0) * 0.24).toFixed(2)} est. offset @ $0.24/kWh
          </div>
        </div>

        <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
          <div className={`text-xs font-medium ${mutedText}`}>Latest Bill Energy Charge</div>
          <div className="text-2xl sm:text-3xl font-bold font-mono">
            ${Number(filteredBills[0]?.total_energy_charges ?? 43.57).toFixed(2)}
          </div>
          <div className={`text-xs font-mono ${mutedText}`}>
            {filteredBills[0]?.billing_start_date} → {filteredBills[0]?.billing_end_date}
          </div>
        </div>

        <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
          <div className={`text-xs font-medium ${mutedText}`}>Projected Next Bill Charge</div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#e07a16]">
            ${Number(projection?.projected_energy_charge ?? 43.57).toFixed(2)}
          </div>
          <div className={`text-xs font-mono ${mutedText}`}>
            {projection ? `${projection.billing_start_date} → ${projection.billing_end_date}` : 'Pending'}
          </div>
        </div>

        <div className={`rounded-xl p-5 space-y-1 ${calloutBg}`}>
          <div className={`text-xs font-medium ${mutedText}`}>Projected Post-Bill Credit Bank</div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#1f7a4c]">
            {projection ? `${projection.credit_bank_after_kwh.toLocaleString()} kWh` : '—'}
          </div>
          <div className={`text-xs font-mono ${projection?.credit_bank_delta_kwh < 0 ? 'text-[#b91c1c]' : 'text-[#1f7a4c]'}`}>
            {projection ? `${projection.credit_bank_delta_kwh >= 0 ? '+' : ''}${projection.credit_bank_delta_kwh.toFixed(1)} kWh projected impact` : ''}
          </div>
        </div>
      </div>

      {/* SECTION 2 & 3: CREDIT BANK CHANGE OVER TIME + NEXT BILL PROJECTION */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* CREDIT BANK OVER TIME */}
        <div className={`xl:col-span-2 rounded-2xl border p-6 space-y-5 ${cardBg}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Credit Bank history & change over time</h2>
              <p className={`text-xs mt-0.5 ${mutedText}`}>
                Official NYSEG excess-generation kWh balance across every post-solar billing statement plus projected next-bill shift
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#1f7a4c]">
              0 → {(moreBillsData?.current_credit_bank_kwh ?? 0).toLocaleString()} kWh
            </span>
          </div>

          {/* Horizontal Progression Bars */}
          <div className={`divide-y ${dividerBorder}`}>
            {creditHistory.map((item, idx) => {
              const barPct = Math.min(100, Math.max(4, (item.remaining_kwh / maxBankKwh) * 100));
              return (
                <div key={item.period_label} className={`${idx === 0 ? 'pb-4' : 'py-4'} space-y-2`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold font-mono">{item.period_label}</span>
                      <span className={`ml-2 ${mutedText}`}>Stmt {item.statement_date}</span>
                    </div>
                    <span className="font-mono font-bold text-[#1f7a4c]">
                      {item.remaining_kwh.toLocaleString()} kWh ({item.net_change_kwh >= 0 ? `+${item.net_change_kwh}` : item.net_change_kwh} kWh)
                    </span>
                  </div>

                  <div className={`w-full h-3 rounded-full overflow-hidden ${trackBg}`}>
                    <div
                      style={{ width: `${barPct}%` }}
                      className="h-full rounded-full bg-[#1f7a4c] transition-all duration-500"
                    />
                  </div>

                  <div className={`text-[11px] font-mono ${mutedText}`}>
                    Prior {item.prior_kwh.toLocaleString()} + M02 Export {item.exported_kwh.toLocaleString()} − Credited Use {item.credited_used_kwh.toLocaleString()} = <strong className={darkMode ? 'text-slate-200' : 'text-[#1a1917]'}>{item.remaining_kwh.toLocaleString()} kWh</strong> (~${item.estimated_value.toFixed(2)})
                  </div>
                </div>
              );
            })}

            {/* Projected Next Bill Bar */}
            {projection && (
              <div className="pt-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold font-mono text-[#e07a16]">
                      {projection.billing_start_date} to {projection.billing_end_date} (Projected)
                    </span>
                  </div>
                  <span className="font-mono font-bold text-[#e07a16]">
                    {projection.credit_bank_after_kwh.toLocaleString()} kWh ({projection.credit_bank_delta_kwh.toFixed(1)} kWh)
                  </span>
                </div>

                <div className={`w-full h-3 rounded-full overflow-hidden ${trackBg}`}>
                  <div
                    style={{ width: `${Math.min(100, Math.max(4, (projection.credit_bank_after_kwh / maxBankKwh) * 100))}%` }}
                    className="h-full rounded-full bg-[#e07a16] transition-all duration-500"
                  />
                </div>

                <div className={`text-[11px] font-mono ${mutedText}`}>
                  Prior {projection.credit_bank_before_kwh.toLocaleString()} + Proj. M02 {projection.projected_m02_kwh} − Proj. M01 {projection.projected_m01_kwh} = <strong className="text-[#e07a16]">{projection.credit_bank_after_kwh.toLocaleString()} kWh</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* NEXT BILL PROJECTION CARD */}
        {projection && (
          <div className={`rounded-2xl border p-6 flex flex-col justify-between space-y-5 ${cardBg}`}>
            <div className="space-y-3">
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                  NEXT BILL PROJECTION
                </div>
                <h2 className="text-lg font-bold mt-0.5">
                  {projection.billing_start_date} → {projection.billing_end_date}
                </h2>
                <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>
                  Combines <strong className="font-semibold">{projection.measured_days} measured days</strong> through {projection.measured_through_date} with <strong className="font-semibold">{projection.remaining_forecast_days} forecasted days</strong>.
                </p>
              </div>

              <div className={`p-4 rounded-xl space-y-2 text-xs ${calloutBg}`}>
                <div className="flex justify-between">
                  <span className={mutedText}>Measured M01 / M02 ({projection.measured_days}d)</span>
                  <span className="font-mono font-semibold">
                    {projection.measured_m01_kwh} / <span className="text-[#1f7a4c]">{projection.measured_m02_kwh} kWh</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={mutedText}>Projected Full-Period M01</span>
                  <span className="font-mono font-semibold">{projection.projected_m01_kwh} kWh</span>
                </div>
                <div className="flex justify-between">
                  <span className={mutedText}>Projected Full-Period M02</span>
                  <span className="font-mono font-semibold text-[#1f7a4c]">{projection.projected_m02_kwh} kWh</span>
                </div>
                <div className={`flex justify-between pt-2 border-t ${dividerBorder}`}>
                  <span className="font-semibold">Projected Net Grid Import</span>
                  <span className="font-mono font-bold text-[#b91c1c]">+{projection.projected_net_import_kwh} kWh</span>
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl border space-y-2.5 ${subPanelBg}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">Projected Energy Charge</span>
                <span className="text-xl font-mono font-bold text-[#e07a16]">
                  ${projection.projected_energy_charge.toFixed(2)}
                </span>
              </div>
              <div className={`text-[11px] leading-relaxed ${mutedText}`}>
                Credit Bank covers all {projection.projected_net_import_kwh} kWh of net import, leaving only the observed ${projection.minimum_charge_floor.toFixed(2)} NYSEG post-solar delivery/tax floor.
              </div>
              <div className={`pt-2 border-t ${dividerBorder} flex items-center justify-between text-xs font-mono font-bold`}>
                <span>{projection.credit_bank_before_kwh.toLocaleString()} kWh</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#e07a16]" />
                <span className="text-[#1f7a4c]">{projection.credit_bank_after_kwh.toLocaleString()} kWh</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: ONE-LINE COST & CREDIT SUMMARY FOR EACH BILL */}
      <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
        <div className={`p-5 border-b ${dividerBorder} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h2 className="text-base font-bold">
              Analyzed NYSEG Bills — One-Line Cost & Credit Summary ({filteredBills.length} shown)
            </h2>
            <p className={`text-xs mt-0.5 ${mutedText}`}>
              Click any bill row to expand its itemized delivery, supply, tax, and register breakdown.
            </p>
          </div>

          <div className={`flex flex-wrap rounded-full p-1 border text-xs ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#efece4] border-[#dcd8ce]'}`}>
            {[
              { id: 'authoritative', label: `Authoritative (${bills.filter((b) => b.is_authoritative).length})` },
              { id: 'all', label: `All PDFs (${bills.length})` },
              { id: 'post_solar', label: 'Post-Solar' },
              { id: 'pre_solar', label: 'Pre-Solar' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setBillFilter(f.id);
                  setExpandedIdx(null);
                }}
                className={`px-3 py-1 rounded-full transition cursor-pointer ${
                  billFilter === f.id
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
          {filteredBills.map((bill, idx) => {
            const isOpen = expandedIdx === idx;
            return (
              <div key={`${bill.file_name}-${bill.statement_date}`} className="transition">
                <button
                  onClick={() => setExpandedIdx(isOpen ? null : idx)}
                  className={`w-full text-left px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 cursor-pointer ${
                    darkMode ? 'hover:bg-slate-800/40' : 'hover:bg-[#faf8f4]'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <FileText className="w-3.5 h-3.5 text-[#e07a16]" />
                    <span className="font-mono font-bold text-xs">
                      {bill.billing_start_date} → {bill.billing_end_date}
                    </span>
                    <span className={`text-[11px] font-mono ${mutedText}`}>
                      (Stmt {bill.statement_date})
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        bill.is_authoritative
                          ? 'bg-[#1f7a4c]/12 text-[#1f7a4c]'
                          : 'bg-[#e07a16]/15 text-[#e07a16]'
                      }`}
                    >
                      {bill.is_authoritative ? 'Authoritative' : 'Superseded'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-3 flex-1 min-w-0">
                    <span className="text-xs font-mono truncate">
                      {bill.one_line_summary}
                    </span>
                    {isOpen ? (
                      <ChevronUp className={`w-4 h-4 shrink-0 ${mutedText}`} />
                    ) : (
                      <ChevronDown className={`w-4 h-4 shrink-0 ${mutedText}`} />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className={`px-5 pb-4 pt-2 border-t ${dividerBorder} ${subPanelBg} grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs`}>
                    <div>
                      <span className={`block text-[10px] uppercase ${mutedText}`}>Source PDF</span>
                      <span className="font-mono font-medium break-all">{bill.file_name}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${mutedText}`}>Imported (M01)</span>
                      <span className="font-mono font-semibold">{bill.imported_kwh} kWh</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${mutedText}`}>Exported (M02)</span>
                      <span className="font-mono font-semibold text-[#1f7a4c]">{bill.exported_kwh} kWh</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${mutedText}`}>Delivery / Supply / Tax</span>
                      <span className="font-mono">
                        ${bill.delivery_charges?.toFixed(2)} / ${bill.supply_charges?.toFixed(2)} / ${bill.taxes?.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${mutedText}`}>Energy Charges</span>
                      <span className="font-mono font-bold">${bill.total_energy_charges?.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${mutedText}`}>Total Amount Due</span>
                      <span className="font-mono font-bold">${bill.amount_due?.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
