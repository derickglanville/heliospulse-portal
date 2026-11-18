import React, { useState, useMemo } from 'react';
import { X, Minimize2 } from 'lucide-react';

const RATE_PER_KWH = 0.24;

function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

function sliceByRange(rows, range) {
  if (range === '7d') return rows.slice(-7);
  if (range === '30d') return rows.slice(-30);
  if (range === '90d') return rows.slice(-90);
  return rows;
}

function buildPolyline(points) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function buildAreaPolygon(points, baselineY) {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${first.x.toFixed(1)},${baselineY.toFixed(1)} ${buildPolyline(points)} ${last.x.toFixed(1)},${baselineY.toFixed(1)}`;
}

export default function EnergyCostChartsTab({
  reconciledRowsChrono,
  darkMode,
  cardBg,
  calloutBg,
  subPanelBg,
  mutedText,
  dividerBorder,
  pillBtnSecondary,
  pageBg,
}) {
  // Chart 1 controls
  const [c1Range, setC1Range] = useState('30d');
  const [c1Style, setC1Style] = useState('area'); // 'area' | 'lines' | 'bars'
  const [c1HoverIdx, setC1HoverIdx] = useState(null);

  // Chart 2 controls
  const [c2Range, setC2Range] = useState('30d');
  const [c2Style, setC2Style] = useState('area'); // 'area' | 'lines' | 'bars'
  const [c2HoverIdx, setC2HoverIdx] = useState(null);

  // Chart 3 controls (Start/End default to last 30 reconciled days: 2026-10-14 to 2026-11-15)
  const defaultEnd = reconciledRowsChrono[reconciledRowsChrono.length - 1]?.date || '2026-11-15';
  const defaultStart =
    reconciledRowsChrono[Math.max(0, reconciledRowsChrono.length - 30)]?.date || '2026-10-14';

  const [c3Start, setC3Start] = useState(defaultStart);
  const [c3End, setC3End] = useState(defaultEnd);
  const [c3HoverIdx, setC3HoverIdx] = useState(null);

  // Pop Out modal state ('c1' | 'c2' | 'c3' | null)
  const [popOutCard, setPopOutCard] = useState(null);

  // Enrich chronological reconciled rows
  const enrichedRows = useMemo(() => {
    return reconciledRowsChrono.map((r) => {
      const solar = r.solar_kwh || 0;
      const m01 = r.m01_import_kwh || 0;
      const m02 = r.m02_export_kwh || 0;
      const edc = Math.max(0, solar + m01 - m02);
      const importCost = m01 * RATE_PER_KWH;
      const exportValue = m02 * RATE_PER_KWH;
      const netCost = (m01 - m02) * RATE_PER_KWH;
      return {
        date: r.date,
        solar,
        m01,
        m02,
        edc,
        importCost,
        exportValue,
        netCost,
        diff: m01 - m02,
      };
    });
  }, [reconciledRowsChrono]);

  // Card 1 data & KPIs
  const c1Rows = useMemo(() => sliceByRange(enrichedRows, c1Range), [enrichedRows, c1Range]);
  const c1Kpis = useMemo(() => {
    const solar = c1Rows.reduce((a, r) => a + r.solar, 0);
    const edc = c1Rows.reduce((a, r) => a + r.edc, 0);
    const netImp = c1Rows.reduce((a, r) => a + (r.m01 - r.m02), 0);
    return {
      solar: solar.toFixed(1),
      edc: edc.toFixed(1),
      netImpAbs: Math.abs(netImp).toFixed(1),
      isNetImport: netImp >= 0,
    };
  }, [c1Rows]);

  // Card 2 data & KPIs
  const c2Rows = useMemo(() => sliceByRange(enrichedRows, c2Range), [enrichedRows, c2Range]);
  const c2Kpis = useMemo(() => {
    const impCost = c2Rows.reduce((a, r) => a + r.importCost, 0);
    const expVal = c2Rows.reduce((a, r) => a + r.exportValue, 0);
    const billEffect = impCost - expVal;
    return {
      impCost: impCost.toFixed(2),
      expVal: expVal.toFixed(2),
      billEffectAbs: Math.abs(billEffect).toFixed(2),
      isNegative: billEffect < 0,
    };
  }, [c2Rows]);

  // Card 3 data & window navigation
  const c3Rows = useMemo(() => {
    return enrichedRows.filter((r) => r.date >= c3Start && r.date <= c3End);
  }, [enrichedRows, c3Start, c3End]);

  const shiftC3Window = (direction) => {
    if (!enrichedRows.length) return;
    const endIdx = enrichedRows.findIndex((r) => r.date >= c3End);
    const currentEndIdx = endIdx === -1 ? enrichedRows.length - 1 : endIdx;
    const windowSize = Math.max(7, c3Rows.length || 30);
    const step = Math.max(7, Math.round(windowSize / 2));
    const nextEndIdx = Math.max(
      windowSize - 1,
      Math.min(enrichedRows.length - 1, currentEndIdx + direction * step)
    );
    const nextStartIdx = Math.max(0, nextEndIdx - windowSize + 1);
    setC3Start(enrichedRows[nextStartIdx].date);
    setC3End(enrichedRows[nextEndIdx].date);
  };

  // --- SVG CHART RENDERERS ---
  const renderComparisonChart = (isLarge = false) => {
    const W = isLarge ? 780 : 380;
    const H = isLarge ? 320 : 210;
    const padL = 32;
    const padR = 12;
    const padT = 14;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const maxVal = Math.max(
      40,
      ...c1Rows.map((r) => Math.max(r.solar, r.m01, r.m02, r.edc))
    );
    const yMax = Math.ceil(maxVal / 10) * 10;
    const yTicks = [0, 10, 20, 30, 40].filter((t) => t <= yMax);
    if (yMax > 40) yTicks.push(yMax);

    const xFor = (i) =>
      c1Rows.length <= 1 ? padL + plotW / 2 : padL + (i / (c1Rows.length - 1)) * plotW;
    const yFor = (v) => padT + plotH - (v / yMax) * plotH;
    const baseLineY = yFor(0);

    const solarPts = c1Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.solar) }));
    const m01Pts = c1Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.m01) }));
    const m02Pts = c1Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.m02) }));
    const edcPts = c1Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.edc) }));

    const labelStep = Math.max(1, Math.floor(c1Rows.length / (isLarge ? 8 : 4)));
    const hovered = c1HoverIdx !== null ? c1Rows[c1HoverIdx] : null;

    return (
      <div className="space-y-3">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#e07a16] inline-block" />
            <span className={mutedText}>SunRun solar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#687076] inline-block" />
            <span className={mutedText}>M01 delivered</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#1f7a4c] inline-block" />
            <span className={mutedText}>M02 received</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#b45309] inline-block" />
            <span className={mutedText}>Estimated home demand</span>
          </span>
        </div>

        {/* Hover readout strip */}
        <div className={`min-h-[24px] px-2.5 py-1 rounded-lg text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 ${subPanelBg} border ${dividerBorder}`}>
          {hovered ? (
            <>
              <span className="font-bold">{hovered.date}</span>
              <span>
                <span className="text-[#e07a16]">Solar {hovered.solar.toFixed(1)}</span> ·{' '}
                <span className={mutedText}>M01 {hovered.m01.toFixed(1)}</span> ·{' '}
                <span className="text-[#1f7a4c]">M02 {hovered.m02.toFixed(1)}</span> ·{' '}
                <span className="text-[#b45309]">EDC {hovered.edc.toFixed(1)} kWh</span>
              </span>
            </>
          ) : (
            <span className={mutedText}>Hover chart points to inspect daily kWh values</span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none overflow-visible"
          onMouseLeave={() => setC1HoverIdx(null)}
        >
          {/* Horizontal gridlines & Y ticks */}
          {yTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke={darkMode ? '#334155' : '#e6e2d8'}
                  strokeWidth="1"
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] font-mono fill-[#6b675e]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Vertical gridlines & X labels */}
          {c1Rows.map((r, i) => {
            if (i % labelStep !== 0 && i !== c1Rows.length - 1) return null;
            const x = xFor(i);
            return (
              <g key={r.date}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={baseLineY}
                  stroke={darkMode ? '#1e293b' : '#f0ece3'}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={H - 10}
                  textAnchor="middle"
                  className="text-[10px] font-mono fill-[#6b675e]"
                >
                  {formatShortDate(r.date)}
                </text>
              </g>
            );
          })}

          {/* Area fills when STYLE = Vivid area */}
          {c1Style === 'area' && (
            <>
              <polygon points={buildAreaPolygon(edcPts, baseLineY)} fill="#b45309" fillOpacity="0.12" />
              <polygon points={buildAreaPolygon(solarPts, baseLineY)} fill="#e07a16" fillOpacity="0.14" />
              <polygon points={buildAreaPolygon(m02Pts, baseLineY)} fill="#1f7a4c" fillOpacity="0.12" />
              <polygon points={buildAreaPolygon(m01Pts, baseLineY)} fill="#687076" fillOpacity="0.14" />
            </>
          )}

          {/* Bars or Lines */}
          {c1Style === 'bars' ? (
            c1Rows.map((r, i) => {
              const bw = Math.max(2, plotW / c1Rows.length / 4.5);
              const x = xFor(i);
              return (
                <g key={r.date}>
                  <rect x={x - bw * 1.5} y={yFor(r.solar)} width={bw} height={baseLineY - yFor(r.solar)} fill="#e07a16" />
                  <rect x={x - bw * 0.5} y={yFor(r.edc)} width={bw} height={baseLineY - yFor(r.edc)} fill="#b45309" />
                  <rect x={x + bw * 0.5} y={yFor(r.m02)} width={bw} height={baseLineY - yFor(r.m02)} fill="#1f7a4c" />
                  <rect x={x + bw * 1.5} y={yFor(r.m01)} width={bw} height={baseLineY - yFor(r.m01)} fill="#687076" />
                </g>
              );
            })
          ) : (
            <>
              <polyline fill="none" stroke="#b45309" strokeWidth="2" points={buildPolyline(edcPts)} />
              <polyline fill="none" stroke="#e07a16" strokeWidth="2" points={buildPolyline(solarPts)} />
              <polyline fill="none" stroke="#1f7a4c" strokeWidth="2" points={buildPolyline(m02Pts)} />
              <polyline fill="none" stroke="#687076" strokeWidth="2" points={buildPolyline(m01Pts)} />

              {c1Rows.map((r, i) => (
                <g key={r.date}>
                  <circle cx={edcPts[i].x} cy={edcPts[i].y} r="2.6" fill="#b45309" />
                  <circle cx={solarPts[i].x} cy={solarPts[i].y} r="2.6" fill="#e07a16" />
                  <circle cx={m02Pts[i].x} cy={m02Pts[i].y} r="2.6" fill="#1f7a4c" />
                  <circle cx={m01Pts[i].x} cy={m01Pts[i].y} r="2.6" fill="#687076" />
                </g>
              ))}
            </>
          )}

          {/* Hover vertical guide + hit zones */}
          {c1HoverIdx !== null && c1Rows[c1HoverIdx] && (
            <line
              x1={xFor(c1HoverIdx)}
              y1={padT}
              x2={xFor(c1HoverIdx)}
              y2={baseLineY}
              stroke="#1a1917"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}
          {c1Rows.map((r, i) => {
            const colW = plotW / Math.max(1, c1Rows.length);
            return (
              <rect
                key={r.date}
                x={xFor(i) - colW / 2}
                y={padT}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setC1HoverIdx(i)}
              />
            );
          })}
        </svg>
      </div>
    );
  };

  const renderCostChart = (isLarge = false) => {
    const W = isLarge ? 780 : 380;
    const H = isLarge ? 320 : 210;
    const padL = 36;
    const padR = 12;
    const padT = 14;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const allVals = c2Rows.flatMap((r) => [r.importCost, r.exportValue, r.netCost]);
    const yMin = Math.min(-5, Math.floor(Math.min(0, ...allVals)));
    const yMax = Math.max(8, Math.ceil(Math.max(5, ...allVals)));
    const span = yMax - yMin || 1;

    const xFor = (i) =>
      c2Rows.length <= 1 ? padL + plotW / 2 : padL + (i / (c2Rows.length - 1)) * plotW;
    const yFor = (v) => padT + plotH - ((v - yMin) / span) * plotH;
    const zeroY = yFor(0);

    const impPts = c2Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.importCost) }));
    const expPts = c2Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.exportValue) }));
    const netPts = c2Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.netCost) }));

    const yTicks = [-5, 0, 5];
    if (yMax >= 10) yTicks.push(10);

    const labelStep = Math.max(1, Math.floor(c2Rows.length / (isLarge ? 8 : 3)));
    const hovered = c2HoverIdx !== null ? c2Rows[c2HoverIdx] : null;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#b91c1c] inline-block" />
            <span className={mutedText}>Import cost</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#1f7a4c] inline-block" />
            <span className={mutedText}>Export value</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#1a1917] dark:bg-amber-400 inline-block" />
            <span className={mutedText}>Net energy cost</span>
          </span>
        </div>

        <div className={`min-h-[24px] px-2.5 py-1 rounded-lg text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 ${subPanelBg} border ${dividerBorder}`}>
          {hovered ? (
            <>
              <span className="font-bold">{hovered.date}</span>
              <span>
                <span className="text-[#b91c1c]">Import ${hovered.importCost.toFixed(2)}</span> ·{' '}
                <span className="text-[#1f7a4c]">Export ${hovered.exportValue.toFixed(2)}</span> ·{' '}
                <span>Net {hovered.netCost >= 0 ? `+$${hovered.netCost.toFixed(2)}` : `-$${Math.abs(hovered.netCost).toFixed(2)}`}</span>
              </span>
            </>
          ) : (
            <span className={mutedText}>Hover chart points to inspect daily cost impact</span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none overflow-visible"
          onMouseLeave={() => setC2HoverIdx(null)}
        >
          {yTicks.map((tick) => {
            const y = yFor(tick);
            const isZero = tick === 0;
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke={isZero ? (darkMode ? '#94a3b8' : '#687076') : darkMode ? '#334155' : '#e6e2d8'}
                  strokeWidth={isZero ? '1.3' : '1'}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] font-mono fill-[#6b675e]"
                >
                  {tick < 0 ? `$-${Math.abs(tick)}` : `$${tick}`}
                </text>
              </g>
            );
          })}

          {c2Rows.map((r, i) => {
            if (i % labelStep !== 0 && i !== c2Rows.length - 1) return null;
            const x = xFor(i);
            return (
              <g key={r.date}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={padT + plotH}
                  stroke={darkMode ? '#1e293b' : '#f0ece3'}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={H - 10}
                  textAnchor="middle"
                  className="text-[10px] font-mono fill-[#6b675e]"
                >
                  {formatShortDate(r.date)}
                </text>
              </g>
            );
          })}

          {c2Style === 'area' && (
            <polygon
              points={buildAreaPolygon(netPts, zeroY)}
              fill="#687076"
              fillOpacity="0.18"
            />
          )}

          {c2Style === 'bars' ? (
            c2Rows.map((r, i) => {
              const bw = Math.max(2.5, plotW / c2Rows.length / 3.5);
              const x = xFor(i);
              const ny = yFor(r.netCost);
              return (
                <g key={r.date}>
                  <rect x={x - bw} y={yFor(r.importCost)} width={bw} height={zeroY - yFor(r.importCost)} fill="#b91c1c" />
                  <rect x={x} y={yFor(r.exportValue)} width={bw} height={zeroY - yFor(r.exportValue)} fill="#1f7a4c" />
                  <rect
                    x={x + bw}
                    y={Math.min(ny, zeroY)}
                    width={bw}
                    height={Math.abs(ny - zeroY)}
                    fill={darkMode ? '#f59e0b' : '#1a1917'}
                  />
                </g>
              );
            })
          ) : (
            <>
              <polyline fill="none" stroke="#b91c1c" strokeWidth="2" points={buildPolyline(impPts)} />
              <polyline fill="none" stroke="#1f7a4c" strokeWidth="2" points={buildPolyline(expPts)} />
              <polyline
                fill="none"
                stroke={darkMode ? '#f59e0b' : '#1a1917'}
                strokeWidth="2.2"
                points={buildPolyline(netPts)}
              />
              {c2Rows.map((r, i) => (
                <g key={r.date}>
                  <circle cx={impPts[i].x} cy={impPts[i].y} r="2.6" fill="#b91c1c" />
                  <circle cx={expPts[i].x} cy={expPts[i].y} r="2.6" fill="#1f7a4c" />
                  <circle cx={netPts[i].x} cy={netPts[i].y} r="2.6" fill={darkMode ? '#f59e0b' : '#1a1917'} />
                </g>
              ))}
            </>
          )}

          {c2HoverIdx !== null && c2Rows[c2HoverIdx] && (
            <line
              x1={xFor(c2HoverIdx)}
              y1={padT}
              x2={xFor(c2HoverIdx)}
              y2={padT + plotH}
              stroke="#1a1917"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}
          {c2Rows.map((r, i) => {
            const colW = plotW / Math.max(1, c2Rows.length);
            return (
              <rect
                key={r.date}
                x={xFor(i) - colW / 2}
                y={padT}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setC2HoverIdx(i)}
              />
            );
          })}
        </svg>
      </div>
    );
  };

  const renderRelationshipChart = (isLarge = false) => {
    const W = isLarge ? 780 : 380;
    const H = isLarge ? 340 : 240;
    const padL = 32;
    const padR = 12;
    const padT = 14;
    const padB = 38;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const maxVal = Math.max(30, ...c3Rows.map((r) => Math.max(r.m01, r.m02)));
    const yMax = Math.ceil(maxVal / 5) * 5;
    const yTicks = [0, 5, 10, 15, 20, 25, 30].filter((t) => t <= yMax);
    if (yMax > 30) yTicks.push(yMax);

    const xFor = (i) =>
      c3Rows.length <= 1 ? padL + plotW / 2 : padL + (i / (c3Rows.length - 1)) * plotW;
    const yFor = (v) => padT + plotH - (v / yMax) * plotH;

    const m02Pts = c3Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.m02) }));
    const m01Pts = c3Rows.map((r, i) => ({ x: xFor(i), y: yFor(r.m01) }));

    // Closed polygon filling between M02 (top/left->right) and M01 (right->left)
    const betweenPolygon =
      m02Pts.length > 0
        ? `${buildPolyline(m02Pts)} ${buildPolyline([...m01Pts].reverse())}`
        : '';

    const labelStep = Math.max(1, Math.floor(c3Rows.length / (isLarge ? 8 : 5)));
    const hovered = c3HoverIdx !== null ? c3Rows[c3HoverIdx] : null;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#1f7a4c] inline-block" />
            <span className={mutedText}>Received / M02</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#687076] inline-block" />
            <span className={mutedText}>Delivered / M01</span>
          </span>
        </div>

        <div className={`min-h-[24px] px-2.5 py-1 rounded-lg text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 ${subPanelBg} border ${dividerBorder}`}>
          {hovered ? (
            <>
              <span className="font-bold">{hovered.date}</span>
              <span>
                <span className="text-[#1f7a4c]">M02 {hovered.m02.toFixed(1)}</span> ·{' '}
                <span className={mutedText}>M01 {hovered.m01.toFixed(1)}</span> ·{' '}
                <span className={hovered.diff > 0 ? 'text-[#b91c1c]' : 'text-[#1f7a4c]'}>
                  Diff {hovered.diff >= 0 ? `+${hovered.diff.toFixed(1)}` : hovered.diff.toFixed(1)} kWh
                </span>
              </span>
            </>
          ) : (
            <span className={mutedText}>Hover either line to inspect M01, M02, and daily difference</span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none overflow-visible"
          onMouseLeave={() => setC3HoverIdx(null)}
        >
          {yTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke={tick === 0 ? (darkMode ? '#94a3b8' : '#687076') : darkMode ? '#334155' : '#e6e2d8'}
                  strokeWidth={tick === 0 ? '1.3' : '1'}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] font-mono fill-[#6b675e]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {c3Rows.map((r, i) => {
            if (i % labelStep !== 0 && i !== c3Rows.length - 1) return null;
            const x = xFor(i);
            return (
              <g key={r.date}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={yFor(0)}
                  stroke={darkMode ? '#1e293b' : '#f0ece3'}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={H - 12}
                  textAnchor="middle"
                  className="text-[10px] font-mono fill-[#6b675e]"
                >
                  {formatShortDate(r.date)}
                </text>
              </g>
            );
          })}

          {betweenPolygon && (
            <polygon points={betweenPolygon} fill="#1f7a4c" fillOpacity="0.14" />
          )}

          <polyline fill="none" stroke="#1f7a4c" strokeWidth="2.1" points={buildPolyline(m02Pts)} />
          <polyline fill="none" stroke="#687076" strokeWidth="2.1" points={buildPolyline(m01Pts)} />

          {c3Rows.map((r, i) => (
            <g key={r.date}>
              <circle cx={m02Pts[i].x} cy={m02Pts[i].y} r="2.6" fill="#1f7a4c" />
              <circle cx={m01Pts[i].x} cy={m01Pts[i].y} r="2.6" fill="#687076" />
            </g>
          ))}

          {c3HoverIdx !== null && c3Rows[c3HoverIdx] && (
            <line
              x1={xFor(c3HoverIdx)}
              y1={padT}
              x2={xFor(c3HoverIdx)}
              y2={yFor(0)}
              stroke="#1a1917"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}
          {c3Rows.map((r, i) => {
            const colW = plotW / Math.max(1, c3Rows.length);
            return (
              <rect
                key={r.date}
                x={xFor(i) - colW / 2}
                y={padT}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setC3HoverIdx(i)}
              />
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2.5 max-w-2xl">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Daily energy, cost & meter relationship charts
        </h1>
        <p className={`text-sm sm:text-[15px] leading-relaxed ${mutedText}`}>
          Compare daily Sunrun solar generation, NYSEG smart-meter import/export flows, and estimated bill effects at <strong className="font-semibold">$0.24/kWh</strong> across custom date windows.
        </p>
      </div>

      {/* 3-COLUMN CHARTS GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
        {/* CHART 1: DAILY ENERGY COMPARISON */}
        <div className={`rounded-2xl border p-5 flex flex-col justify-between space-y-4 ${cardBg}`}>
          <div className="space-y-3">
            <div>
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                DAILY ENERGY COMPARISON
              </div>
              <h2 className="text-lg font-bold tracking-tight mt-0.5 leading-snug">
                Solar production, meter flow, and estimated home demand
              </h2>
              <p className={`text-xs leading-relaxed mt-1 ${mutedText}`}>
                Follow the story: solar production, what NYSEG delivered (M01), what it received (M02), and estimated daily consumption (EDC).
              </p>
            </div>

            <div className={`p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs ${calloutBg}`}>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase ${mutedText}`}>RANGE</span>
                <select
                  value={c1Range}
                  onChange={(e) => setC1Range(e.target.value)}
                  className={`px-2 py-1 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase ${mutedText}`}>STYLE</span>
                <select
                  value={c1Style}
                  onChange={(e) => setC1Style(e.target.value)}
                  className={`px-2 py-1 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
                >
                  <option value="area">Vivid area</option>
                  <option value="lines">Clean lines</option>
                  <option value="bars">Daily bars</option>
                </select>
              </div>
              <button
                onClick={() => setPopOutCard('c1')}
                className={`px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
              >
                Pop Out
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className={`p-2.5 rounded-xl border-l-3 border-l-[#e07a16] ${calloutBg}`}>
                <div className="text-sm font-mono font-bold text-[#e07a16]">{c1Kpis.solar} kWh</div>
                <div className={`text-[10px] mt-0.5 ${mutedText}`}>solar produced</div>
              </div>
              <div className={`p-2.5 rounded-xl border-l-3 border-l-[#687076] ${calloutBg}`}>
                <div className="text-sm font-mono font-bold">{c1Kpis.edc} kWh</div>
                <div className={`text-[10px] mt-0.5 leading-tight ${mutedText}`}>estimated home demand</div>
              </div>
              <div className={`p-2.5 rounded-xl border-l-3 border-l-[#b91c1c] ${calloutBg}`}>
                <div className={`text-sm font-mono font-bold ${c1Kpis.isNetImport ? 'text-[#b91c1c]' : 'text-[#1f7a4c]'}`}>
                  {c1Kpis.netImpAbs} kWh
                </div>
                <div className={`text-[10px] mt-0.5 ${mutedText}`}>
                  {c1Kpis.isNetImport ? 'net imported' : 'net exported'}
                </div>
              </div>
            </div>
          </div>

          {renderComparisonChart(false)}
        </div>

        {/* CHART 2: DAILY ESTIMATED COST */}
        <div className={`rounded-2xl border p-5 flex flex-col justify-between space-y-4 ${cardBg}`}>
          <div className="space-y-3">
            <div>
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                DAILY ESTIMATED COST
              </div>
              <h2 className="text-lg font-bold tracking-tight mt-0.5 leading-snug">
                NYSEG import, export value, and net bill effect
              </h2>
              <p className={`text-xs leading-relaxed mt-1 ${mutedText}`}>
                Uses the configured $0.24/kWh rate. A negative net cost means exported energy is reducing estimated energy charges.
              </p>
            </div>

            <div className={`p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs ${calloutBg}`}>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase ${mutedText}`}>RANGE</span>
                <select
                  value={c2Range}
                  onChange={(e) => setC2Range(e.target.value)}
                  className={`px-2 py-1 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase ${mutedText}`}>STYLE</span>
                <select
                  value={c2Style}
                  onChange={(e) => setC2Style(e.target.value)}
                  className={`px-2 py-1 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
                >
                  <option value="area">Vivid area</option>
                  <option value="lines">Clean lines</option>
                  <option value="bars">Daily bars</option>
                </select>
              </div>
              <button
                onClick={() => setPopOutCard('c2')}
                className={`px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
              >
                Pop Out
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className={`p-2.5 rounded-xl border-l-3 border-l-[#687076] ${calloutBg}`}>
                <div className="text-sm font-mono font-bold">${c2Kpis.impCost}</div>
                <div className={`text-[10px] mt-0.5 leading-tight ${mutedText}`}>estimated import value</div>
              </div>
              <div className={`p-2.5 rounded-xl border-l-3 border-l-[#1f7a4c] ${calloutBg}`}>
                <div className="text-sm font-mono font-bold text-[#1f7a4c]">${c2Kpis.expVal}</div>
                <div className={`text-[10px] mt-0.5 ${mutedText}`}>export value</div>
              </div>
              <div className={`p-2.5 rounded-xl border-l-3 border-l-[#b91c1c] ${calloutBg}`}>
                <div className={`text-sm font-mono font-bold ${c2Kpis.isNegative ? 'text-[#1f7a4c]' : 'text-[#b91c1c]'}`}>
                  {c2Kpis.isNegative ? `-$${c2Kpis.billEffectAbs}` : `$${c2Kpis.billEffectAbs}`}
                </div>
                <div className={`text-[10px] mt-0.5 leading-tight ${mutedText}`}>estimated bill effect</div>
              </div>
            </div>
          </div>

          {renderCostChart(false)}
        </div>

        {/* CHART 3: DAILY METER RELATIONSHIP (M01 VS M02) */}
        <div className={`rounded-2xl border p-5 flex flex-col justify-between space-y-4 ${cardBg}`}>
          <div className="space-y-3">
            <div>
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                DAILY METER RELATIONSHIP
              </div>
              <h2 className="text-lg font-bold tracking-tight mt-0.5 leading-snug">
                M01 vs M02
              </h2>
              <p className={`text-xs leading-relaxed mt-1 ${mutedText}`}>
                Compare NYSEG&apos;s daily Delivered / M01 and Received / M02 values. Hover either line to see M01, M02, and their daily difference.
              </p>
            </div>

            <div className={`p-2.5 rounded-xl space-y-2 text-xs ${calloutBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <span className={`font-medium ${mutedText}`}>Start</span>
                  <input
                    type="date"
                    value={c3Start}
                    onChange={(e) => setC3Start(e.target.value)}
                    className={`px-2 py-1 rounded-full border text-[11px] font-mono ${pillBtnSecondary}`}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className={`font-medium ${mutedText}`}>End</span>
                  <input
                    type="date"
                    value={c3End}
                    onChange={(e) => setC3End(e.target.value)}
                    className={`px-2 py-1 rounded-full border text-[11px] font-mono ${pillBtnSecondary}`}
                  />
                </div>
                <button
                  onClick={() => setPopOutCard('c3')}
                  className={`px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer ${pillBtnSecondary}`}
                >
                  Pop Out
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => shiftC3Window(-1)}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${pillBtnSecondary}`}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => shiftC3Window(1)}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${pillBtnSecondary}`}
                  >
                    Next
                  </button>
                </div>
                <span className="text-[11px] font-mono font-bold text-[#1f7a4c]">
                  {c3Rows.length} days selected
                </span>
              </div>
            </div>
          </div>

          {renderRelationshipChart(false)}
        </div>
      </div>

      {/* POP OUT MODAL FOR ANY OF THE 3 CHARTS */}
      {popOutCard && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className={`w-full max-w-5xl rounded-2xl border p-6 space-y-5 shadow-2xl ${cardBg}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
                  {popOutCard === 'c1'
                    ? 'DAILY ENERGY COMPARISON'
                    : popOutCard === 'c2'
                    ? 'DAILY ESTIMATED COST'
                    : 'DAILY METER RELATIONSHIP'}
                </div>
                <h3 className="text-xl font-bold tracking-tight">
                  {popOutCard === 'c1'
                    ? 'Solar production, meter flow, and estimated home demand'
                    : popOutCard === 'c2'
                    ? 'NYSEG import, export value, and net bill effect'
                    : 'M01 vs M02'}
                </h3>
              </div>
              <button
                onClick={() => setPopOutCard(null)}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1 cursor-pointer ${pillBtnSecondary}`}
              >
                <Minimize2 className="w-3.5 h-3.5" /> Close
              </button>
            </div>

            {popOutCard === 'c1' && renderComparisonChart(true)}
            {popOutCard === 'c2' && renderCostChart(true)}
            {popOutCard === 'c3' && renderRelationshipChart(true)}
          </div>
        </div>
      )}
    </div>
  );
}
