'use client';
// Charts for printed reports: they draw on white paper in both themes, so their colors are fixed, not theme tokens.
// Predicted seasons sit in a hatched zone at the right end of a chart, drawn dashed (lines) or lighter (bars).
import { useId, type ReactNode } from 'react';
import { MINUS } from '@/lib/format';

const W = 680, L = 48, R = 14, T = 12, B = 26;
const INK = '#14201A', MUTED = '#66716A', GRID = '#E3E6E1', BAND = '#EEF3EA';

export interface Series {
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

const nice = (x: number) => {
  const p = 10 ** Math.floor(Math.log10(x)), f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};

function scale(series: Series[], zero = false, extra: number[] = []) {
  const vals = [...series.flatMap(s => s.values), ...extra].filter((v): v is number => v != null);
  if (!vals.length) return null;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if ((lo > 0 && lo < hi * 0.4) || (zero && lo > 0)) lo = 0;
  if ((hi < 0 && hi > lo * 0.4) || (zero && hi < 0)) hi = 0;
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = nice((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}

const tickText = (v: number, unit: string) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${+(a / 1e3).toFixed(0)}k` : `${+a.toFixed(a < 10 && a % 1 ? 1 : 0)}`;
  return `${v < 0 ? MINUS : ''}${unit === '$' ? '$' : ''}${s}`;
};

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="r-legend">
      {items.map(it => (
        <span key={it.label}>
          <svg width="18" height="10" aria-hidden><line x1="1" x2="17" y1="5" y2="5" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dashed ? '4 3' : undefined} strokeLinecap="round" /></svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** The hatched zone for predicted seasons, from x0 to the right edge, labeled at the top. */
function PredictedZone({ x0, height, id }: { x0: number; height: number; id: string }) {
  return (
    <g aria-hidden>
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#F7F8F5" /><line x1="0" y1="0" x2="0" y2="6" stroke={GRID} strokeWidth="2" />
        </pattern>
      </defs>
      <rect x={x0} y={T} width={W - R - x0} height={height - B - T} fill={`url(#${id})`} />
      <line x1={x0} x2={x0} y1={T} y2={height - B} stroke={MUTED} strokeOpacity={0.5} strokeDasharray="2 3" />
    </g>
  );
}
/** Drawn last, so no band or bar covers it. */
const PredictedLabel = () => (
  <text x={W - R - 4} y={T + 11} textAnchor="end" fontSize="10" fontWeight="700" letterSpacing=".06em" fill={MUTED} stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke" aria-hidden>PREDICTED</text>
);

/**
 * Lines over an evenly spaced x axis (years or days). `ticks` are the x positions that get a label;
 * `bands` shade x ranges (the focus year, the crop season); `mark` puts a dot on one x position;
 * from `predictedFrom` on, the x positions are predictions: hatched behind, lines dashed.
 */
export function LineChart({ series, ticks, bands = [], mark, unit = '', fmt, label, height = 220, hoverLabel, predictedFrom }: {
  series: Series[];
  ticks: { at: number; text: string }[];
  bands?: [number, number][];
  mark?: number;
  unit?: string;
  fmt: (v: number) => string;
  label: string;
  height?: number;
  hoverLabel: (x: number) => string;
  predictedFrom?: number;
}) {
  const hatch = useId().replace(/:/g, '');
  const n = Math.max(0, ...series.map(s => s.values.length));
  const sc = scale(series);
  if (!sc || n < 2) return <p className="r-empty">No data for this chart.</p>;
  const x = (j: number) => L + (j / (n - 1)) * (W - L - R);
  const y = (v: number) => height - B - ((v - sc.lo) / (sc.hi - sc.lo)) * (height - B - T);
  const path = (vals: (number | null)[]) => {
    let d = '', pen = false;
    vals.forEach((v, j) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(j).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  // Hover targets: one per x position when there are few, one per week-sized slice when there are many.
  const stride = n > 60 ? 7 : 1, slots = Math.ceil(n / stride), slotW = (W - L - R) / slots;
  const pf = predictedFrom != null && predictedFrom < n ? Math.max(0, predictedFrom) : null;
  // Observed part solid, predicted part dashed, joined at the last observed point.
  const pieces = series.flatMap(s => (pf == null || s.dashed ? [{ s, values: s.values, dashed: !!s.dashed }] : [
    { s, values: s.values.map((v, j) => (j < pf ? v : null)), dashed: false },
    { s, values: s.values.map((v, j) => (j >= pf - 1 ? v : null)), dashed: true },
  ]));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="r-chart" role="img" aria-label={label}>
      {pf != null && <PredictedZone x0={pf === 0 ? L : (x(pf - 1) + x(pf)) / 2} height={height} id={hatch} />}
      {bands.map(([a, b], j) => <rect key={j} x={x(a) - (a === b ? 6 : 0)} y={T} width={Math.max(12, x(b) - x(a))} height={height - B - T} fill={BAND} fillOpacity={pf != null && a >= pf ? 0.7 : 1} />)}
      {sc.ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#B9C0B7' : GRID} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{tickText(v, unit)}</text>
        </g>
      ))}
      {ticks.map(t => <text key={t.at} x={x(t.at)} y={height - 8} textAnchor="middle" fontSize="11" fill={MUTED}>{t.text}</text>)}
      {pieces.map((p, j) => (
        <path key={j} d={path(p.values)} fill="none" stroke={p.s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={p.dashed ? '5 4' : undefined} />
      ))}
      {mark != null && series.map(s => s.values[mark] != null && !s.dashed && (
        <circle key={s.label} cx={x(mark)} cy={y(s.values[mark]!)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
      ))}
      {Array.from({ length: slots }, (_, k) => {
        const j = Math.min(n - 1, k * stride + Math.floor(stride / 2));
        const parts = series.map(s => `${s.label}: ${s.values[j] == null ? 'no data' : fmt(s.values[j]!)}`);
        return (
          <rect key={k} x={L + k * slotW} y={T} width={slotW} height={height - B - T} fill="transparent">
            <title>{`${hoverLabel(j)}\n${parts.join('\n')}`}</title>
          </rect>
        );
      })}
      <line x1={L} x2={W - R} y1={height - B} y2={height - B} stroke={INK} strokeOpacity={0.25} />
      {pf != null && <PredictedLabel />}
    </svg>
  );
}

/** A horizontal bar split into parts, each part's width its share of the total. */
export function SplitBar({ parts }: { parts: { label: string; color: string; value: number }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return <span className="r-splitbar empty" />;
  return (
    <span className="r-splitbar">
      {parts.filter(p => p.value > 0).map(p => (
        <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${Math.round((p.value / total) * 100)}%`} />
      ))}
    </span>
  );
}

/** The path of one bar with 4px rounded data-end, anchored on the zero line. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0)), up = y1 < y0, e = up ? r : -r;
  return `M${x},${y0}V${y1 + e}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + e}V${y0}Z`;
}

/**
 * Bars over evenly spaced categories (seasons), one bar per series in each category. `ranges` adds a low-high
 * whisker to a bar; from `predictedFrom` on, bars are predictions: lighter, outlined, on a hatched zone.
 */
export function BarChart({ series, ticks, mark, unit = '', fmt, label, height = 220, hoverLabel, predictedFrom, ranges }: {
  series: Series[];
  ticks: { at: number; text: string }[];
  mark?: number;
  unit?: string;
  fmt: (v: number) => string;
  label: string;
  height?: number;
  hoverLabel: (x: number) => string;
  predictedFrom?: number;
  /** ranges[series][x] */
  ranges?: (([number, number] | null)[] | undefined)[];
}) {
  const hatch = useId().replace(/:/g, '');
  const n = Math.max(0, ...series.map(s => s.values.length));
  const sc = scale(series, true, (ranges ?? []).flatMap(r => (r ?? []).flatMap(q => q ?? [])));
  if (!sc || !n) return <p className="r-empty">No data for this chart.</p>;
  const m = series.length, slot = (W - L - R) / n, group = slot * (n > 12 ? 0.84 : 0.66);
  const gap = group / m > 7 ? 2 : 0, bw = Math.max(1, (group - gap * (m - 1)) / m);
  const cx = (j: number) => L + (j + 0.5) * slot;
  const y = (v: number) => height - B - ((v - sc.lo) / (sc.hi - sc.lo)) * (height - B - T);
  const pf = predictedFrom != null && predictedFrom < n ? Math.max(0, predictedFrom) : null;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="r-chart" role="img" aria-label={label}>
      {pf != null && <PredictedZone x0={L + pf * slot} height={height} id={hatch} />}
      {mark != null && mark >= 0 && mark < n && <rect x={L + mark * slot} y={T} width={slot} height={height - B - T} fill={BAND} />}
      {sc.ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#B9C0B7' : GRID} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{tickText(v, unit)}</text>
        </g>
      ))}
      {ticks.map(t => <text key={t.at} x={cx(t.at)} y={height - 8} textAnchor="middle" fontSize="11" fill={MUTED}>{t.text}</text>)}
      {series.map((s, k) => s.values.map((v, j) => {
        if (v == null) return null;
        const x0 = cx(j) - group / 2 + k * (bw + gap), pred = pf != null && j >= pf, r = ranges?.[k]?.[j];
        return (
          <g key={`${k}-${j}`}>
            <path d={barPath(x0, bw, y(0), y(v) === y(0) ? y(0) - 0.5 : y(v))} fill={s.color} fillOpacity={pred ? 0.42 : 1} stroke={pred ? s.color : 'none'} strokeWidth={pred ? 1.2 : 0}>
              <title>{`${hoverLabel(j)}\n${s.label}: ${fmt(v)}${r ? ` (likely ${fmt(r[0])} to ${fmt(r[1])})` : ''}`}</title>
            </path>
            {r && bw >= 4 && (
              <g stroke={INK} strokeOpacity={0.7} strokeWidth={1.2} aria-hidden>
                <line x1={x0 + bw / 2} x2={x0 + bw / 2} y1={y(r[0])} y2={y(r[1])} />
                <line x1={x0 + bw / 2 - 3} x2={x0 + bw / 2 + 3} y1={y(r[0])} y2={y(r[0])} />
                <line x1={x0 + bw / 2 - 3} x2={x0 + bw / 2 + 3} y1={y(r[1])} y2={y(r[1])} />
              </g>
            )}
          </g>
        );
      }))}
      <line x1={L} x2={W - R} y1={height - B} y2={height - B} stroke={INK} strokeOpacity={0.25} />
      {pf != null && <PredictedLabel />}
    </svg>
  );
}

export interface Slice { label: string; color: string; value: number }

/** A donut of parts of one whole, with each part listed beside it: its color, name, share and amount. */
export function PieChart({ parts, title, color, fmt, total, totalUnit, label }: {
  parts: Slice[];
  title?: string;
  /** The place color shown next to the title. */
  color?: string;
  fmt: (v: number) => string;
  /** Text in the middle: the whole, e.g. "$4.2M", with an optional smaller word under it ("seasons"). */
  total: string;
  totalUnit?: string;
  label: string;
}) {
  const shown = parts.filter(p => p.value > 0), sum = shown.reduce((a, p) => a + p.value, 0);
  const S = 150, c = S / 2, ro = 70, ri = 44;
  let a0 = -Math.PI / 2;
  const pt = (a: number, r: number) => `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`;
  const arcs = shown.map(p => {
    const a1 = a0 + (p.value / sum) * 2 * Math.PI, big = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M${pt(a0, ro)}A${ro},${ro} 0 ${big} 1 ${pt(a1, ro)}L${pt(a1, ri)}A${ri},${ri} 0 ${big} 0 ${pt(a0, ri)}Z`;
    a0 = a1;
    return { p, d };
  });
  const pct = (v: number) => { const x = (v / sum) * 100; return x >= 1 || x === 0 ? `${Math.round(x)}%` : '<1%'; };
  return (
    <figure className="r-pie">
      {title && <figcaption className="r-place">{color && <i style={{ background: color }} />}{title}</figcaption>}
      {!sum ? <p className="r-empty">Nothing to split here.</p> : (
        <div className="r-pie-body">
          <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={label}>
            {shown.length === 1 ? (
              <circle cx={c} cy={c} r={(ro + ri) / 2} fill="none" stroke={shown[0].color} strokeWidth={ro - ri}><title>{`${shown[0].label}: 100%`}</title></circle>
            ) : arcs.map(({ p, d }) => (
              <path key={p.label} d={d} fill={p.color} stroke="#FFFFFF" strokeWidth={2} strokeLinejoin="round"><title>{`${p.label}: ${pct(p.value)}, ${fmt(p.value)}`}</title></path>
            ))}
            <text x={c} y={totalUnit ? c + 1 : c + 5} textAnchor="middle" fontSize="15" fontWeight="800" fill={INK}>{total}</text>
            {totalUnit && <text x={c} y={c + 15} textAnchor="middle" fontSize="10" fill={MUTED}>{totalUnit}</text>}
          </svg>
          <ul className="r-pie-list">
            {shown.map(p => (
              <li key={p.label}><i style={{ background: p.color }} /><span>{p.label}</span><b>{pct(p.value)}</b><em>{fmt(p.value)}</em></li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars for a handful of rows on one scale that includes zero, each with its value written out. */
export function HBars({ rows }: { rows: { key: string; label: ReactNode; color: string; value: number | null; text: string; predicted?: boolean }[] }) {
  const vals = rows.map(r => r.value).filter((v): v is number => v != null);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;
  return (
    <div className="r-hbars">
      {rows.map(r => (
        <div key={r.key} className="r-hbar">
          <span className="r-hbar-label">{r.label}</span>
          <span className="r-hbar-track">
            {lo < 0 && <i className="r-hbar-zero" style={{ left: `${at(0)}%` }} />}
            {r.value != null && (
              <i className={`r-hbar-fill${r.value < 0 ? ' neg' : ''}${r.predicted ? ' pred' : ''}`}
                style={{ left: `${at(Math.min(0, r.value))}%`, width: `${Math.max(0.6, (Math.abs(r.value) / span) * 100)}%`, background: r.color, borderColor: r.color }} />
            )}
          </span>
          <span className="r-hbar-value">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
