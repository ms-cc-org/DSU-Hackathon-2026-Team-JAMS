'use client';
// Small SVG charts for the profile panel. All share one width so their axes line up down the panel.
import { binOf } from '@/lib/bins';
import { RAMP, SEVERITY, USDM } from '@/lib/colors';
import { CROP_NAME, MONTH_LETTER, MONTH_SHORT, SEASON_MONTHS, STATES } from '@/lib/constants';
import { MINUS, mean, niceCeil, num, ordinal, present } from '@/lib/format';
import { metric, whyMissing, type MetricId } from '@/lib/metrics';
import type { County, CropKey, CropSeries } from '@/lib/types';
import { useExplorer } from './explorer-context';

const W = 392;
const L0 = 38;
const R0 = W - 4;

export function barPath(x: number, y0: number, y1: number, w: number, r: number) {
  const h = Math.abs(y1 - y0);
  if (h < 0.8) return `M${x},${y0 - 0.4}h${w}v0.8h${-w}Z`;
  r = Math.min(r, h, w / 2);
  const x2 = x + w;
  return y1 < y0
    ? `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x2 - r}Q${x2},${y1} ${x2},${y1 + r}V${y0}Z`
    : `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x2 - r}Q${x2},${y1} ${x2},${y1 - r}V${y0}Z`;
}

const Tick = ({ x, y, children, anchor = 'end', bold = false }: { x: number; y: number; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end'; bold?: boolean }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={10} fontWeight={bold ? 700 : 400} fill={bold ? 'var(--ink)' : 'var(--muted)'}>
    {children}
  </text>
);

/** Year labels under a 26-season chart: the ends, plus the selected season in bold. */
function SeasonAxis({ step, h }: { step: number; h: number }) {
  const { s, bundle } = useExplorer();
  const n = bundle.years.length, si = s.year - bundle.years[0];
  const sx = Math.min(R0 - 12, Math.max(L0 + 12, L0 + si * step + step / 2));
  return (
    <>
      {si > 3 && <Tick x={L0} y={h - 4} anchor="start">{bundle.years[0]}</Tick>}
      {si < n - 4 && <Tick x={R0} y={h - 4}>{bundle.years[n - 1]}</Tick>}
      <Tick x={sx} y={h - 4} anchor="middle" bold>{s.year}</Tick>
    </>
  );
}

interface YearBarsProps {
  values: (number | null)[];
  color: (v: number, j: number) => string;
  tip: (j: number) => string;
  label: string;
  centered?: boolean;
  unit?: string;
}

/** One bar per season, 2000-2025. Click or press Enter on a bar to jump to that season. */
export function YearBars({ values, color, tip, label, centered = false, unit = '' }: YearBarsProps) {
  const { s, bundle, dispatch } = useExplorer();
  const years = bundle.years, n = years.length, si = s.year - years[0];
  const h = 120, T = 12, B = h - 20, step = (R0 - L0) / n, bw = Math.max(3, step - 2);
  const fin = present(values);
  const hi = niceCeil(Math.max(1e-9, ...(centered ? fin.map(Math.abs) : fin)));
  const lo = centered ? -hi : 0;
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T);
  const y0 = y(0);
  const pick = (j: number) => dispatch({ type: 'year', year: years[j] });
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="chart" role="img" aria-label={label}>
      <rect x={L0 + si * step} y={T - 4} width={step} height={B - T + 8} rx={3} fill="var(--sel-band)" />
      <line x1={L0} x2={R0} y1={y0} y2={y0} stroke="var(--line-2)" />
      <Tick x={L0 - 6} y={y(hi) + 4}>{`${centered ? '+' : ''}${num(hi)}${unit}`}</Tick>
      <Tick x={L0 - 6} y={y0 + 4}>0</Tick>
      {centered && <Tick x={L0 - 6} y={y(lo) + 4}>{`${MINUS}${num(hi)}${unit}`}</Tick>}
      {values.map((v, j) => {
        const x = L0 + j * step + (step - bw) / 2;
        return (
          <g key={years[j]}>
            {v == null ? (
              <circle cx={x + bw / 2} cy={y0} r={1.6} fill="var(--muted)" opacity={0.7} />
            ) : (
              <path d={barPath(x, y0, y(Math.max(lo, Math.min(hi, v))), bw, 2)} fill={color(v, j)} />
            )}
            <rect
              className="hitbar" role="button" tabIndex={0} aria-label={tip(j)}
              x={L0 + j * step} y={T - 4} width={step} height={B - T + 8} fill="transparent"
              onClick={() => pick(j)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(j); } }}
            >
              <title>{tip(j)}</title>
            </rect>
          </g>
        );
      })}
      <SeasonAxis step={step} h={h} />
    </svg>
  );
}

/** Monthly values for the selected year and the 2000-2025 average for each month. */
function monthly(series: (number | null)[] | undefined, yi: number, years: number) {
  if (!series) return null;
  const cur: (number | null)[] = [], avg: (number | null)[] = [];
  for (let m = 0; m < 12; m++) {
    cur.push(series[yi * 12 + m]);
    const all: number[] = [];
    for (let y = 0; y < years; y++) {
      const v = series[y * 12 + m];
      if (v != null) all.push(v);
    }
    avg.push(mean(all));
  }
  return { cur, avg };
}

function SeasonShade({ crop, step, T, B }: { crop: CropKey; step: number; T: number; B: number }) {
  return (
    <>
      {SEASON_MONTHS[crop].map(m => (
        <rect key={m} x={L0 + (m - 1) * step} y={T - 4} width={step} height={B - T + 8} fill="var(--sel-band)" />
      ))}
    </>
  );
}

export function MonthlyRain({ county }: { county: County }) {
  const { s, bundle, i } = useExplorer();
  const d = monthly(county.mp, i, bundle.years.length);
  if (!d) return null;
  const h = 130, T = 12, B = h - 20, step = (R0 - L0) / 12, bw = step * 0.62;
  const hi = niceCeil(Math.max(1, ...present(d.cur), ...present(d.avg)));
  const y = (v: number) => B - (v / hi) * (B - T);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="chart" role="img" aria-label={`Monthly rainfall in ${s.year} against the 2000 to 2025 average`}>
      <SeasonShade crop={s.crop} step={step} T={T} B={B} />
      <line x1={L0} x2={R0} y1={B} y2={B} stroke="var(--line-2)" />
      <Tick x={L0 - 6} y={y(hi) + 4}>{`${hi} mm`}</Tick>
      <Tick x={L0 - 6} y={B + 4}>0</Tick>
      {d.cur.map((v, m) => {
        const x = L0 + m * step + (step - bw) / 2, a = d.avg[m];
        return (
          <g key={m}>
            {v != null && (
              <path d={barPath(x, B, y(v), bw, 2)} fill={RAMP.blue[1]}>
                <title>{`${MONTH_SHORT[m]} ${s.year}: ${num(v)} mm (average ${num(a ?? 0)} mm)`}</title>
              </path>
            )}
            {a != null && <line x1={x - 3} x2={x + bw + 3} y1={y(a)} y2={y(a)} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />}
            <Tick x={L0 + m * step + step / 2} y={h - 4} anchor="middle">{MONTH_LETTER[m]}</Tick>
          </g>
        );
      })}
    </svg>
  );
}

export function MonthlyHigh({ county }: { county: County }) {
  const { s, bundle, i } = useExplorer();
  const d = monthly(county.mx, i, bundle.years.length);
  if (!d) return null;
  const h = 130, T = 12, B = h - 20, step = (R0 - L0) / 12;
  const all = present([...d.cur, ...d.avg]);
  const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5 || 5;
  const y = (v: number) => B - ((v - lo) / (hi - lo || 1)) * (B - T);
  const xm = (m: number) => L0 + m * step + step / 2;
  const line = (arr: (number | null)[]) => {
    let p = '', pen = false;
    arr.forEach((v, m) => {
      if (v == null) { pen = false; return; }
      p += `${pen ? 'L' : 'M'}${xm(m)},${y(v)}`;
      pen = true;
    });
    return p;
  };
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="chart" role="img" aria-label={`Monthly average daily high in ${s.year} against the 2000 to 2025 average`}>
      <SeasonShade crop={s.crop} step={step} T={T} B={B} />
      <line x1={L0} x2={R0} y1={B} y2={B} stroke="var(--line-2)" />
      <Tick x={L0 - 6} y={y(hi) + 4}>{`${hi} °C`}</Tick>
      <Tick x={L0 - 6} y={B + 4}>{`${num(lo)} °C`}</Tick>
      <path d={line(d.avg)} fill="none" stroke="var(--bar-rest)" strokeWidth={2} strokeLinejoin="round" />
      <path d={line(d.cur)} fill="none" stroke={RAMP.red[2]} strokeWidth={2} strokeLinejoin="round" />
      {d.cur.map((v, m) =>
        v == null ? null : (
          <circle key={m} cx={xm(m)} cy={y(v)} r={3} fill={RAMP.red[2]} stroke="var(--surface)" strokeWidth={1.5}>
            <title>{`${MONTH_SHORT[m]} ${s.year}: ${num(v, 1)} °C (average ${num(d.avg[m] ?? 0, 1)} °C)`}</title>
          </circle>
        ),
      )}
      {MONTH_LETTER.map((t, m) => <Tick key={m} x={xm(m)} y={h - 4} anchor="middle">{t}</Tick>)}
    </svg>
  );
}

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Decode one calendar year of the weekly drought string: worst category and DSCI per week. */
export function weeksOf(county: County, year: number, weekStart: string, nWeeks: number) {
  const code = county.wkc;
  if (!code) return [];
  const start = Date.parse(weekStart + 'T00:00:00Z');
  const out: { date: Date; cat: number; dsci: number }[] = [];
  for (let w = 0; w < nWeeks; w++) {
    const date = new Date(start + w * 7 * 864e5);
    if (date.getUTCFullYear() !== year) continue;
    out.push({ date, cat: Number(code[2 * w]), dsci: Math.round((B62.indexOf(code[2 * w + 1]) / 61) * 500) });
  }
  return out;
}

export function WeeklyDrought({ county }: { county: County }) {
  const { s, bundle } = useExplorer();
  const wk = weeksOf(county, s.year, bundle.weekStart, bundle.nWeeks);
  if (!wk.length) return null;
  const h = 130, T = 12, B = h - 20, n = wk.length, step = (R0 - L0) / n, bw = Math.max(2, step - 1.2);
  const hi = 400, y = (v: number) => B - (Math.min(v, hi) / hi) * (B - T);
  const months = SEASON_MONTHS[s.crop];
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="chart" role="img" aria-label={`Weekly drought in ${s.year}`}>
      {wk.map((w, j) => months.includes(w.date.getUTCMonth() + 1) && (
        <rect key={`s${j}`} x={L0 + j * step} y={T - 4} width={step + 0.3} height={B - T + 8} fill="var(--sel-band)" />
      ))}
      <line x1={L0} x2={R0} y1={B} y2={B} stroke="var(--line-2)" />
      <Tick x={L0 - 6} y={y(hi) + 4}>400</Tick>
      <Tick x={L0 - 6} y={B + 4}>0</Tick>
      {wk.map((w, j) => {
        const x = L0 + j * step + (step - bw) / 2, m = w.date.getUTCMonth();
        const firstOfMonth = j === 0 || wk[j - 1].date.getUTCMonth() !== m;
        const label = w.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        return (
          <g key={j}>
            {w.dsci > 0 ? <path d={barPath(x, B, y(w.dsci), bw, 1)} fill={USDM[w.cat]} /> : <rect x={x} y={B - 1} width={bw} height={1} fill="var(--line-2)" />}
            <rect x={L0 + j * step} y={T - 4} width={step} height={B - T + 8} fill="transparent">
              <title>{`Week of ${label}: ${SEVERITY[w.cat]} at worst, DSCI ${w.dsci}`}</title>
            </rect>
            {firstOfMonth && m % 2 === 0 && <Tick x={L0 + j * step} y={h - 4} anchor="start">{MONTH_SHORT[m]}</Tick>}
          </g>
        );
      })}
    </svg>
  );
}

export function CropSpark({ series, title }: { series: CropSeries; title: string }) {
  const { bundle, i } = useExplorer();
  const w = 180, h = 54, T = 6, B = h - 6, n = bundle.years.length;
  const v = series.y.map((x, j) => (series.st[j] === 'r' ? x : null));
  const fin = present(v);
  if (!fin.length) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="chart">
        <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} fill="var(--muted)">No reported yields</text>
      </svg>
    );
  }
  const lo = Math.min(...fin), hi = Math.max(...fin), step = (w - 4) / (n - 1);
  const y = (x: number) => B - ((x - lo) / (hi - lo || 1)) * (B - T);
  let p = '', pen = false;
  v.forEach((x, j) => {
    if (x == null) { pen = false; return; }
    p += `${pen ? 'L' : 'M'}${2 + j * step},${y(x)}`;
    pen = true;
  });
  const cur = v[i];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label={title}>
      <path d={p} fill="none" stroke="var(--cat-crops)" strokeWidth={2} strokeLinejoin="round" />
      {cur != null && <circle cx={2 + i * step} cy={y(cur)} r={3.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />}
    </svg>
  );
}

/** Where a county sits among the other counties in its state: one tick per county, a dot for this one. */
export function PeerStrip({ id, county }: { id: MetricId; county: County }) {
  const { bundle, s, i } = useExplorer();
  const m = metric(id), k = s.crop;
  const v = m.get(county, k, i);
  const peers = present(bundle.counties.filter(p => p.s === county.s).map(p => m.get(p, k, i)));
  if (v == null || peers.length < 3) {
    return (
      <div className="srow">
        <div className="srow-top"><span>{m.name}</span><span className="hint">{v == null ? whyMissing(county, id, k, i) : 'Too few counties to compare'}</span></div>
      </div>
    );
  }
  const lo = Math.min(...peers), hi = Math.max(...peers), span = hi - lo || 1, sw = 360;
  const x = (q: number) => 6 + ((q - lo) / span) * (sw - 12);
  const rank = m.worse === 'low' ? peers.filter(p => p < v).length + 1 : peers.filter(p => p > v).length + 1;
  const rankText = m.worse ? `${ordinal(rank)} ${m.worse === 'low' ? 'lowest' : 'highest'} of ${peers.length}` : `${peers.length}`;
  return (
    <div className="srow">
      <div className="srow-top"><span>{m.name}</span><b>{m.format(v)}</b></div>
      <svg viewBox={`0 0 ${sw} 20`} preserveAspectRatio="none" aria-hidden="true">
        <line x1={6} x2={sw - 6} y1={10} y2={10} stroke="var(--line)" strokeWidth={2} />
        {peers.map((p, j) => <line key={j} x1={x(p)} x2={x(p)} y1={5} y2={15} stroke="var(--ink-2)" strokeOpacity={0.28} strokeWidth={1.2} />)}
        <circle cx={x(v)} cy={10} r={6} fill={binOf(m.bins(k), v).color} stroke="var(--ink)" strokeWidth={1.5} />
      </svg>
      <div className="srow-bot"><span>{m.short(lo)}</span><span>{rankText} {STATES[county.s]} counties</span><span>{m.short(hi)}</span></div>
    </div>
  );
}

export const severeColor = (series: CropSeries) => (_v: number, j: number) => ((series.wk[j] ?? 0) >= 4 ? 'var(--bar-drought)' : 'var(--bar-rest)');

export function DroughtSeasonKey({ crop }: { crop: CropKey }) {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--bar-drought)' }} />Severe-drought {CROP_NAME[crop]} season (4+ weeks in D2+)</span>
      <span><i style={{ background: 'var(--bar-rest)' }} />Other seasons</span>
    </div>
  );
}
