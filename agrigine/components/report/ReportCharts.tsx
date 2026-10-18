'use client';
// Charts for printed reports: they draw on white paper in both themes, so their colors are fixed, not theme tokens.
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

function scale(series: Series[]) {
  const vals = series.flatMap(s => s.values).filter((v): v is number => v != null);
  if (!vals.length) return null;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo > 0 && lo < hi * 0.4) lo = 0;
  if (hi < 0 && hi > lo * 0.4) hi = 0;
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

/**
 * Lines over an evenly spaced x axis (years or days). `ticks` are the x positions that get a label;
 * `bands` shade x ranges (the focus year, the crop season); `mark` puts a dot on one x position.
 */
export function LineChart({ series, ticks, bands = [], mark, unit = '', fmt, label, height = 220, hoverLabel }: {
  series: Series[];
  ticks: { at: number; text: string }[];
  bands?: [number, number][];
  mark?: number;
  unit?: string;
  fmt: (v: number) => string;
  label: string;
  height?: number;
  hoverLabel: (x: number) => string;
}) {
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
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="r-chart" role="img" aria-label={label}>
      {bands.map(([a, b], j) => <rect key={j} x={x(a) - (a === b ? 6 : 0)} y={T} width={Math.max(12, x(b) - x(a))} height={height - B - T} fill={BAND} />)}
      {sc.ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#B9C0B7' : GRID} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{tickText(v, unit)}</text>
        </g>
      ))}
      {ticks.map(t => <text key={t.at} x={x(t.at)} y={height - 8} textAnchor="middle" fontSize="11" fill={MUTED}>{t.text}</text>)}
      {series.map(s => (
        <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
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
