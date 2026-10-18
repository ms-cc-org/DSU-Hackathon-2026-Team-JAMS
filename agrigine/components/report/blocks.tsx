'use client';
// The report's building blocks. Each block is a module: a name, its options and their editor, how it draws in the
// report, which sources it uses, and the rows it adds to the CSV. Add a block type by adding an entry here.
import type { ReactNode } from 'react';
import { binOf } from '@/lib/bins';
import { SEVERITY, SEVERITY_SHORT, USDM } from '@/lib/colors';
import { CROP_NAME, CROP_TITLE, MONTH_SHORT, SEASON_LABEL, SEASON_MONTHS, STATES } from '@/lib/constants';
import { LAST_OBSERVED_YEAR, LAST_YEAR as LAST_PREDICTED_YEAR, calendarSlot, dayContext, dayOf, dayValue, daysIn, formatDay, isPredictedYear, isoDay, normalValue, useDaily, type Channel } from '@/lib/daily';
import { mean, num, present } from '@/lib/format';
import { LOSS_COLOR, LOSS_GROUPS, LOSS_LABEL, insuranceSeason } from '@/lib/insurance';
import { CATEGORIES, CATEGORY_IDS, METRICS, metric, type MetricId, type MetricKind } from '@/lib/metrics';
import { COMBINE, placeValue, type Place } from '@/lib/report/places';
import { PLACE_COLORS, type BlockType } from '@/lib/report/spec';
import type { Row } from '@/lib/report/csv';
import { STORM_TYPES, money, stormSeason } from '@/lib/storms';
import type { Bundle, CropKey, StateCode } from '@/lib/types';
import { BarChart, HBars, LineChart, Legend, PieChart, SplitBar, type Series, type Slice } from './ReportCharts';
import { CROP_KEY, CROP_LABEL } from '@/lib/farmcsv';
import { cachedFarms, modelName, useMyFarms } from '@/lib/farms';
import { farmRecordsIn, type FarmCrop, type FarmRecord, type SavedFarmModel } from '@/lib/account';
import { savedModelValue } from '@/lib/farmmodel';
import { useAuth } from '@/lib/supabase';
import { useEffect, useState } from 'react';

export interface ReportCtx {
  bundle: Bundle;
  order: Map<string, number>;
  places: Place[];
  k: CropKey;
  from: number;
  to: number;
  year: number;
  /** from..to */
  years: number[];
}
export type Opts = Record<string, unknown>;
export interface DailyData { data: Int16Array | null; normals: Int16Array | null }

export interface BlockDef {
  name: string;
  blurb: string;
  defaults: () => Opts;
  title: (o: Opts, ctx: ReportCtx) => string;
  sources: (o: Opts) => string[];
  Editor?: (p: { o: Opts; set: (patch: Opts) => void }) => ReactNode;
  View: (p: { o: Opts; ctx: ReportCtx }) => ReactNode;
  rows: (o: Opts, ctx: ReportCtx, daily?: DailyData) => Row[];
  /** Needs the day-by-day weather file for the report's season year. */
  daily?: boolean;
}

// ---------- shared helpers ----------

const SOURCE: Record<MetricKind, string> = {
  daily: 'NOAA ACIS daily weather', yield: 'USDA NASS county yields and acres', insurance: 'USDA RMA crop insurance Cause of Loss',
  season: 'U.S. Drought Monitor and NOAA ACIS weather', derived: 'NOAA ACIS daily weather', freeze: 'NOAA ACIS daily weather',
  storm: 'NOAA Storm Events', soil: 'USDA NRCS SSURGO soils', irrigation: 'USDA NASS irrigation', satellite: 'NASA MODIS vegetation index',
};
/** Layers a report can show: every season or fixed layer except the categorical main cause of loss. */
export const PICKABLE = (Object.keys(METRICS) as MetricId[]).filter(id => metric(id).kind !== 'daily' && id !== 'insCause');
const isMetric = (v: unknown): v is MetricId => typeof v === 'string' && PICKABLE.includes(v as MetricId);
const metricOpt = (o: Opts, key: string, fallback: MetricId) => (isMetric(o[key]) ? (o[key] as MetricId) : fallback);
const idx = (ctx: ReportCtx, year: number) => year - ctx.bundle.years[0];
const seasonValue = (ctx: ReportCtx, p: Place, id: MetricId, year: number) =>
  placeValue(p, c => metric(id).get(c, ctx.k, idx(ctx, year)), COMBINE[id] ?? 'median');
const fmt = (id: MetricId, v: number | null) => (v == null ? '—' : metric(id).short(v));
const isMoney = (id: MetricId) => metric(id).kind === 'insurance' || id === 'cropDamage';
const placeId = (p: Place) => p.ref.slice(2);
const row = (section: string, p: Place, period: string | number, variable: string, value: number | string | null, unit: string): Row =>
  ({ section, place: p.label, place_id: placeId(p), period: String(period), variable, value, unit });
/** A layer's value as the CSV writes it: drought level as its D0-D4 label rather than the code behind it. */
const csvValue = (id: MetricId, v: number | null) => (v != null && id === 'sev' ? SEVERITY_SHORT[Math.round(v)] : v);
const yearTicks = (ctx: ReportCtx) => ctx.years.map((y, j) => ({ at: j, y })).filter(({ y }, j, a) => y % 5 === 0 || j === 0 || j === a.length - 1)
  .filter(({ y }, j, a) => !(j === a.length - 1 && y % 5 !== 0 && y - a[j - 1]?.y < 3) && !(j === 0 && y % 5 !== 0 && a[1] && a[1].y - y < 3))
  .map(({ at, y }) => ({ at, text: String(y) }));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PlaceCell = ({ p }: { p: Place }) => <span className="r-place"><i style={{ background: p.color }} />{p.short}</span>;

// ---------- chart choices and predicted seasons ----------

type ChartKind = 'table' | 'strip' | 'line' | 'bars' | 'pie';
const CHART_LABEL: Record<ChartKind, string> = { table: 'Table', strip: 'Strip', line: 'Line', bars: 'Bars', pie: 'Pie' };
const chartOpt = <K extends ChartKind>(o: Opts, kinds: readonly K[]): K => (kinds.includes(o.chart as K) ? (o.chart as K) : kinds[0]);

function ChartPick({ o, set, kinds }: { o: Opts; set: (patch: Opts) => void; kinds: readonly ChartKind[] }) {
  const value = chartOpt(o, kinds);
  return (
    <div className="rb-field">
      <span>Chart</span>
      <div className="seg wide" role="group" aria-label="Chart">
        {kinds.map(c => <button key={c} type="button" aria-pressed={value === c} onClick={() => set({ chart: c })}>{CHART_LABEL[c]}</button>)}
      </div>
    </div>
  );
}

/** Which seasons a pie adds up: the report's years, the focus season, or only the predicted seasons. */
type Cover = 'all' | 'focus' | 'predicted';
const coverOpt = (o: Opts): Cover => (o.cover === 'focus' || o.cover === 'predicted' ? o.cover : 'all');
const predictedYears = (ctx: ReportCtx) => ctx.bundle.years.filter(isPredictedYear);
const span = (ys: number[]) => (!ys.length ? '' : ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`);
const coverYears = (o: Opts, ctx: ReportCtx) => {
  const c = coverOpt(o);
  return c === 'focus' ? [ctx.year] : c === 'predicted' ? predictedYears(ctx) : ctx.years;
};
const coverText = (o: Opts, ctx: ReportCtx) => {
  const c = coverOpt(o), ys = coverYears(o, ctx);
  return c === 'predicted' ? `the predicted seasons, ${span(ys)}` : c === 'focus' ? `the ${ctx.year} season${isPredictedYear(ctx.year) ? ' (predicted)' : ''}` : `${span(ys)}`;
};
function CoverPick({ o, set }: { o: Opts; set: (patch: Opts) => void }) {
  const c = coverOpt(o);
  return (
    <div className="rb-field">
      <span>Pie adds up</span>
      <div className="seg wide" role="group" aria-label="Seasons in the pie">
        <button type="button" aria-pressed={c === 'all'} onClick={() => set({ cover: 'all' })}>Report years</button>
        <button type="button" aria-pressed={c === 'focus'} onClick={() => set({ cover: 'focus' })}>Focus season</button>
        <button type="button" aria-pressed={c === 'predicted'} onClick={() => set({ cover: 'predicted' })}>Predicted</button>
      </div>
    </div>
  );
}

/** The index of the first predicted season among the report's years, for the charts' hatched zone. */
const predFrom = (ctx: ReportCtx) => { const j = ctx.years.findIndex(isPredictedYear); return j < 0 ? undefined : j; };
const predCap = (ctx: ReportCtx) => {
  const ys = ctx.years.filter(isPredictedYear);
  return ys.length ? ` Hatched: ${span(ys)} ${ys.length === 1 ? 'is a predicted season' : 'are predicted seasons'}, not records.` : '';
};
const predTag = (year: number) => (isPredictedYear(year) ? ' (predicted)' : '');
const seasonLabel = (ctx: ReportCtx, y: number) => `${y} ${CROP_NAME[ctx.k]} season${predTag(y)}`;

/** One donut per place, laid out side by side. */
const Pies = ({ children }: { children: ReactNode }) => <div className="r-pies">{children}</div>;

/** How a place's seasons split across a layer's key bands, as pie slices in the key's own colors. */
function bandSlices(ctx: ReportCtx, p: Place, id: MetricId, years: number[]) {
  const bins = metric(id).bins(ctx.k), counts = bins.map(() => 0);
  let missing = 0;
  for (const y of years) {
    const v = seasonValue(ctx, p, id, y);
    if (v == null) { missing++; continue; }
    counts[bins.indexOf(binOf(bins, v))]++;
  }
  return { slices: bins.map((b, j) => ({ label: b.label, color: b.color, value: counts[j] })), counted: years.length - missing };
}
const seasons = (n: number) => `${n} season${n === 1 ? '' : 's'}`;

function MetricSelect({ value, onChange, label }: { value: MetricId; onChange: (id: MetricId) => void; label: string }) {
  return (
    <label className="rb-field">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as MetricId)}>
        {CATEGORY_IDS.map(cat => (
          <optgroup key={cat} label={CATEGORIES[cat].name}>
            {PICKABLE.filter(id => metric(id).cat === cat).map(id => <option key={id} value={id}>{metric(id).name}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

// ---------- at a glance ----------

const GLANCE: [MetricId, string][] = [
  ['yield', 'Yield, bu/ac'], ['anom', 'Vs trend'], ['sev', 'Worst drought'], ['wk', 'Weeks in D2+'],
  ['rainAnom', 'Rain vs normal'], ['heat', 'Days ≥ 35 °C'], ['insPerAcre', 'Insurance per acre'],
];

const glance: BlockDef = {
  name: 'Season at a glance', blurb: 'Yield, drought, rain, heat and insurance for the season.',
  defaults: () => ({}),
  title: (_o, ctx) => `The ${ctx.year} ${CROP_NAME[ctx.k]} season at a glance${predTag(ctx.year)}`,
  sources: () => [SOURCE.yield, SOURCE.season, SOURCE.insurance],
  View: ({ ctx }) => (
    <>
      <div className="r-tablewrap">
        <table className="r-table">
          <thead><tr><th>Place</th>{GLANCE.map(([id, h]) => <th key={id}>{h}</th>)}</tr></thead>
          <tbody>
            {ctx.places.map(p => (
              <tr key={p.ref}><td><PlaceCell p={p} /></td>{GLANCE.map(([id]) => <td key={id}>{fmt(id, seasonValue(ctx, p, id, ctx.year))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="r-cap">{CROP_TITLE[ctx.k]} growing season, {SEASON_LABEL[ctx.k]}. D2+ is severe drought or worse on the Drought Monitor.</p>
    </>
  ),
  rows: (_o, ctx) => ctx.places.flatMap(p => GLANCE.map(([id]) => row('Season at a glance', p, ctx.year, metric(id).name, csvValue(id, seasonValue(ctx, p, id, ctx.year)), metric(id).unit))),
};

// ---------- side by side ----------

const DEFAULT_COMPARE: MetricId[] = ['anom', 'wk', 'rainAnom', 'heat', 'aws'];
const compareMetrics = (o: Opts) => (Array.isArray(o.metrics) ? (o.metrics as unknown[]).filter(isMetric) : DEFAULT_COMPARE);
const compareValue = (o: Opts, ctx: ReportCtx, p: Place, id: MetricId) =>
  o.span === 'average' ? mean(present(ctx.years.map(y => seasonValue(ctx, p, id, y)))) : seasonValue(ctx, p, id, ctx.year);
const spanLabel = (o: Opts, ctx: ReportCtx) => (o.span === 'average' ? `average of ${ctx.from}–${ctx.to}` : `${ctx.year} season`);

const COMPARE_CHARTS = ['table', 'bars'] as const;

const compare: BlockDef = {
  name: 'Side by side', blurb: 'Any layers you pick, for every place, in one table.',
  defaults: () => ({ metrics: DEFAULT_COMPARE, span: 'year' }),
  title: (o, ctx) => `Side by side, ${spanLabel(o, ctx)}${o.span === 'average' ? '' : predTag(ctx.year)}`,
  sources: o => [...new Set(compareMetrics(o).map(id => SOURCE[metric(id).kind]))],
  Editor: ({ o, set }) => {
    const picked = compareMetrics(o);
    const toggle = (id: MetricId) => set({ metrics: picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id].slice(0, 10) });
    return (
      <>
        <ChartPick o={o} set={set} kinds={COMPARE_CHARTS} />
        <div className="seg wide" role="group" aria-label="Which years">
          <button type="button" aria-pressed={o.span !== 'average'} onClick={() => set({ span: 'year' })}>Focus season</button>
          <button type="button" aria-pressed={o.span === 'average'} onClick={() => set({ span: 'average' })}>Average of all years</button>
        </div>
        <div className="rb-checks" role="group" aria-label="Layers in the table">
          {CATEGORY_IDS.map(cat => (
            <fieldset key={cat}>
              <legend>{CATEGORIES[cat].name}</legend>
              {PICKABLE.filter(id => metric(id).cat === cat).map(id => (
                <label key={id}><input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} />{metric(id).name}</label>
              ))}
            </fieldset>
          ))}
        </div>
        <p className="hint">{picked.length} of up to 10 layers picked.</p>
      </>
    );
  },
  View: ({ o, ctx }) => {
    const ids = compareMetrics(o);
    if (!ids.length) return <p className="r-empty r-placeholder">Pick layers for this table on the left.</p>;
    if (chartOpt(o, COMPARE_CHARTS) === 'bars') {
      // One small bar chart per layer: layers have different units, so they never share an axis.
      const pred = o.span !== 'average' && isPredictedYear(ctx.year);
      return (
        <>
          <div className="r-multiples">
            {ids.map(id => (
              <div key={id} className="r-multiple">
                <h3>{metric(id).name}<span className="r-unit">{metric(id).unit}</span></h3>
                <HBars rows={ctx.places.map(p => {
                  const v = compareValue(o, ctx, p, id);
                  return { key: p.ref, label: <PlaceCell p={p} />, color: p.color, value: v, text: fmt(id, v), predicted: pred };
                })} />
              </div>
            ))}
          </div>
          {pred && <p className="r-cap">Lighter bars: {ctx.year} is a predicted season, not a record.</p>}
        </>
      );
    }
    return (
      <div className="r-tablewrap">
        <table className="r-table">
          <thead><tr><th>Layer</th>{ctx.places.map(p => <th key={p.ref}><PlaceCell p={p} /></th>)}</tr></thead>
          <tbody>
            {ids.map(id => (
              <tr key={id}>
                <td><b>{metric(id).name}</b><span className="r-unit">{metric(id).unit}</span></td>
                {ctx.places.map(p => <td key={p.ref}>{fmt(id, compareValue(o, ctx, p, id))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
  rows: (o, ctx) => ctx.places.flatMap(p => compareMetrics(o).map(id =>
    row('Side by side', p, o.span === 'average' ? `${ctx.from}-${ctx.to} average` : ctx.year, metric(id).name, csvValue(id, compareValue(o, ctx, p, id)), metric(id).unit))),
};

// ---------- over the years ----------

const TREND_CHARTS = ['line', 'bars', 'pie'] as const;
/** A pie for one layer shows either how each place's seasons split across the key, or, for totals, each place's share. */
const pieOf = (o: Opts, id: MetricId) => (o.pie === 'share' && COMBINE[id] === 'sum' ? 'share' : 'bands');

function SeasonsChart({ series, ctx, kind, id }: { series: Series[]; ctx: ReportCtx; kind: 'line' | 'bars'; id: MetricId }) {
  const m = metric(id), fj = ctx.years.indexOf(ctx.year);
  const common = {
    series, ticks: yearTicks(ctx), mark: fj >= 0 ? fj : undefined, unit: isMoney(id) ? '$' : '', fmt: (v: number) => m.short(v),
    label: `${m.name} by season`, hoverLabel: (j: number) => seasonLabel(ctx, ctx.years[j]), predictedFrom: predFrom(ctx),
  };
  return kind === 'bars' ? <BarChart {...common} /> : <LineChart {...common} bands={fj >= 0 ? [[fj, fj]] : []} />;
}

function TrendPie({ o, ctx, id }: { o: Opts; ctx: ReportCtx; id: MetricId }) {
  const m = metric(id), ys = coverYears(o, ctx);
  if (pieOf(o, id) === 'share') {
    const parts = ctx.places.map(p => ({ label: p.short, color: p.color, value: Math.max(0, ys.reduce((a, y) => a + (seasonValue(ctx, p, id, y) ?? 0), 0)) }));
    const sum = parts.reduce((a, q) => a + q.value, 0);
    return (
      <>
        {ctx.places.length < 2 ? <p className="r-empty">Add a second place to split the total between places.</p> : (
          <Pies><PieChart parts={parts} fmt={v => m.short(v)} total={m.short(sum)} totalUnit="in all" label={`${m.name}: each place's share`} /></Pies>
        )}
        <p className="r-cap">Each place&apos;s share of the {m.name.toLowerCase()} added up over {coverText(o, ctx)}. {cap(m.unit)}.{ctx.places.some(p => p.isState) && ctx.places.some(p => !p.isState) ? ' A county inside a state in the report is counted in both.' : ''}</p>
      </>
    );
  }
  return (
    <>
      <Pies>
        {ctx.places.map(p => {
          const { slices, counted } = bandSlices(ctx, p, id, ys);
          return <PieChart key={p.ref} title={p.short} color={p.color} parts={slices} fmt={seasons} total={String(counted)} totalUnit={counted === 1 ? 'season' : 'seasons'} label={`${p.short}: seasons by ${m.name}`} />;
        })}
      </Pies>
      <p className="r-cap">How the seasons in {coverText(o, ctx)} split across the map key for {m.name.toLowerCase()} ({m.unit}). Seasons without data are left out.{m.fixed ? ' This layer does not change from year to year, so every season lands in the same slice.' : ''}</p>
    </>
  );
}

const trend: BlockDef = {
  name: 'Over the years', blurb: 'One layer for each place, season by season, as lines, bars or a pie.',
  defaults: () => ({ metric: 'anom', chart: 'line' }),
  title: (o, ctx) => {
    const id = metricOpt(o, 'metric', 'anom'), name = metric(id).name;
    if (chartOpt(o, TREND_CHARTS) !== 'pie') return `${name}, ${ctx.from}–${ctx.to}`;
    return pieOf(o, id) === 'share' ? `${name}: each place's share, ${span(coverYears(o, ctx))}` : `${name}: how the seasons split, ${span(coverYears(o, ctx))}`;
  },
  sources: o => [SOURCE[metric(metricOpt(o, 'metric', 'anom')).kind]],
  Editor: ({ o, set }) => {
    const id = metricOpt(o, 'metric', 'anom'), pie = chartOpt(o, TREND_CHARTS) === 'pie';
    return (
      <>
        <MetricSelect label="Layer" value={id} onChange={metric => set({ metric })} />
        <ChartPick o={o} set={set} kinds={TREND_CHARTS} />
        {pie && (
          <div className="rb-field">
            <span>Pie shows</span>
            <div className="seg wide" role="group" aria-label="What the pie shows">
              <button type="button" aria-pressed={pieOf(o, id) === 'bands'} onClick={() => set({ pie: 'bands' })}>Seasons by key band</button>
              <button type="button" aria-pressed={pieOf(o, id) === 'share'} disabled={COMBINE[id] !== 'sum'} onClick={() => set({ pie: 'share' })}
                title={COMBINE[id] === 'sum' ? undefined : 'Only for totals, like production, acres, payouts or storm reports'}>Share by place</button>
            </div>
          </div>
        )}
        {pie && <CoverPick o={o} set={set} />}
      </>
    );
  },
  View: ({ o, ctx }) => {
    const id = metricOpt(o, 'metric', 'anom'), m = metric(id), kind = chartOpt(o, TREND_CHARTS);
    if (kind === 'pie') return <TrendPie o={o} ctx={ctx} id={id} />;
    const series = ctx.places.map(p => ({ label: p.short, color: p.color, values: ctx.years.map(y => seasonValue(ctx, p, id, y)) }));
    return (
      <>
        {series.length > 1 && <Legend items={series} />}
        <SeasonsChart series={series} ctx={ctx} kind={kind} id={id} />
        <p className="r-cap">{cap(m.unit)}. The shaded column{kind === 'line' ? ' and dots mark' : ' marks'} {ctx.year}.{predCap(ctx)}{m.fixed ? ' This layer does not change from year to year.' : ''}</p>
      </>
    );
  },
  rows: (o, ctx) => {
    const id = metricOpt(o, 'metric', 'anom');
    return ctx.places.flatMap(p => ctx.years.map(y => row('Over the years', p, y, metric(id).name, csvValue(id, seasonValue(ctx, p, id, y)), metric(id).unit)));
  },
};

// ---------- day by day ----------

const CHANNELS: Partial<Record<Channel, { name: string; unit: string; normal: boolean; power?: boolean; d: number }>> = {
  rain30: { name: 'Rain over the last 30 days', unit: 'mm', normal: true, d: 0 },
  tmax: { name: 'Daily high', unit: '°C', normal: true, d: 1 },
  soil: { name: 'Root-zone soil moisture', unit: '% wet', normal: true, power: true, d: 0 },
  wb30: { name: 'Water balance over the last 30 days', unit: 'mm, rain minus crop water demand', normal: true, power: true, d: 0 },
  vpd: { name: 'Air dryness (VPD)', unit: 'kPa', normal: true, power: true, d: 2 },
  et0: { name: 'Crop water demand', unit: 'mm per day', normal: false, power: true, d: 1 },
  pcpn: { name: 'Rain each day', unit: 'mm', normal: false, d: 1 },
  srad: { name: 'Sunlight', unit: 'W/m², daily mean', normal: false, power: true, d: 0 },
};
const channelOpt = (o: Opts): Channel => (typeof o.channel === 'string' && o.channel in CHANNELS ? (o.channel as Channel) : 'rain30');

function dailySeries(o: Opts, ctx: ReportCtx, daily: DailyData) {
  const ch = channelOpt(o), info = CHANNELS[ch]!;
  const start = dayOf(ctx.year, 1, 1), n = daysIn(ctx.year);
  const t = dayContext(start, ctx.order, daily.data, daily.normals);
  const series = ctx.places.map(p => ({
    label: p.short, color: p.color,
    values: Array.from({ length: n }, (_, d) => placeValue(p, c => dayValue(t, ch, c, d))),
  }));
  const normal = info.normal && ctx.places.length === 1 ? {
    label: 'Normal for the date (2000–2025)', color: '#66716A', dashed: true,
    values: Array.from({ length: n }, (_, d) => placeValue(ctx.places[0], c => normalValue(t, ch as 'rain30', c, calendarSlot(start + d)))),
  } : null;
  return { ch, info, start, n, series, normal };
}

function DailyView({ o, ctx }: { o: Opts; ctx: ReportCtx }) {
  const daily = useDaily(ctx.year);
  if (!daily.data) return <p className="r-empty">Loading daily weather for {ctx.year}…</p>;
  const { info, start, n, series, normal } = dailySeries(o, ctx, daily);
  const all = normal ? [...series, normal] : series;
  const months = SEASON_MONTHS[ctx.k];
  const band: [number, number] = [dayOf(ctx.year, months[0], 1) - start, Math.min(n - 1, dayOf(ctx.year, months[months.length - 1] + 1, 1) - start - 1)];
  return (
    <>
      {all.length > 1 && <Legend items={all} />}
      <LineChart series={all} ticks={MONTH_SHORT.map((text, m) => ({ at: dayOf(ctx.year, m + 1, 1) - start, text }))} bands={[band]}
        fmt={v => `${num(v, info.d)} ${info.unit.split(',')[0]}`} label={`${info.name} each day of ${ctx.year}`} hoverLabel={d => formatDay(start + d)}
        predictedFrom={isPredictedYear(ctx.year) ? 0 : undefined} />
      <p className="r-cap">{cap(info.unit)}. Shaded: the {CROP_NAME[ctx.k]} growing season{ctx.k === 'W' ? ' months in this calendar year' : ''}.{isPredictedYear(ctx.year) ? ` Every day of ${ctx.year} is predicted from data through December 31, ${ctx.bundle.years.filter(y => !isPredictedYear(y)).pop()}.` : ''}</p>
    </>
  );
}

const daily: BlockDef = {
  name: 'Day by day', blurb: 'Rain, heat, soil moisture or crop water demand for every day of the season year.',
  defaults: () => ({ channel: 'rain30' }),
  title: (o, ctx) => `${CHANNELS[channelOpt(o)]!.name}, ${ctx.year}${predTag(ctx.year)}`,
  sources: o => (CHANNELS[channelOpt(o)]!.power ? ['NASA POWER daily weather and soil moisture', 'NOAA ACIS daily weather'] : ['NOAA ACIS daily weather']),
  Editor: ({ o, set }) => (
    <label className="rb-field">
      <span>Measure</span>
      <select value={channelOpt(o)} onChange={e => set({ channel: e.target.value })}>
        {Object.entries(CHANNELS).map(([ch, info]) => <option key={ch} value={ch}>{info!.name}</option>)}
      </select>
    </label>
  ),
  View: DailyView,
  rows: (o, ctx, d) => {
    if (!d?.data) return [];
    const { info, start, series, normal } = dailySeries(o, ctx, d);
    const out: Row[] = [];
    ctx.places.forEach((p, j) => series[j].values.forEach((v, k) => out.push(row('Day by day', p, isoDay(start + k), info.name, v, info.unit))));
    normal?.values.forEach((v, k) => out.push(row('Day by day', ctx.places[0], isoDay(start + k), `${info.name}, normal for the date`, v, info.unit)));
    return out;
  },
  daily: true,
};

// ---------- drought history ----------

const droughtCell = (ctx: ReportCtx, p: Place, y: number) => {
  const sev = placeValue(p, c => metric('sev').get(c, ctx.k, idx(ctx, y)));
  const wk = placeValue(p, c => metric('wk').get(c, ctx.k, idx(ctx, y)));
  return { sev: sev == null ? null : Math.round(sev), wk: wk == null ? null : Math.round(wk) };
};

const DROUGHT_CHARTS = ['strip', 'bars', 'pie'] as const;

function DroughtView({ o, ctx }: { o: Opts; ctx: ReportCtx }) {
  const kind = chartOpt(o, DROUGHT_CHARTS);
  if (kind === 'bars') {
    const series = ctx.places.map(p => ({ label: p.short, color: p.color, values: ctx.years.map(y => droughtCell(ctx, p, y).wk) }));
    return (
      <>
        {series.length > 1 && <Legend items={series} />}
        <SeasonsChart series={series} ctx={ctx} kind="bars" id="wk" />
        <p className="r-cap">Weeks in severe drought (D2) or worse in each growing season. The shaded column marks {ctx.year}.{predCap(ctx)}</p>
      </>
    );
  }
  if (kind === 'pie') {
    const ys = coverYears(o, ctx);
    return (
      <>
        <Pies>
          {ctx.places.map(p => {
            const counts = USDM.map(() => 0);
            for (const y of ys) { const { sev } = droughtCell(ctx, p, y); if (sev != null) counts[sev]++; }
            const n = counts.reduce((a, b) => a + b, 0);
            return <PieChart key={p.ref} title={p.short} color={p.color} parts={USDM.map((color, j) => ({ label: SEVERITY[j], color, value: counts[j] }))}
              fmt={seasons} total={String(n)} totalUnit={n === 1 ? 'season' : 'seasons'} label={`${p.short}: seasons by worst drought level`} />;
          })}
        </Pies>
        <p className="r-cap">Seasons in {coverText(o, ctx)}, by the worst Drought Monitor level each growing season reached.{ys.some(isPredictedYear) ? ' A predicted season counts at its predicted worst level.' : ''}</p>
      </>
    );
  }
  return (
    <>
      <div className="r-strip" style={{ gridTemplateColumns: `minmax(90px, 140px) repeat(${ctx.years.length}, minmax(0, 1fr))` }}>
        <span />
        {ctx.years.map(y => <span key={y} className="r-strip-y">{y % 5 === 0 || y === ctx.from || y === ctx.to ? `'${String(y).slice(2)}` : ''}</span>)}
        {ctx.places.map(p => [
          <PlaceCell key={p.ref} p={p} />,
          ...ctx.years.map(y => {
            const { sev, wk } = droughtCell(ctx, p, y);
            return (
              <span key={`${p.ref}${y}`} className={`r-strip-c${y === ctx.year ? ' focus' : ''}${isPredictedYear(y) ? ' pred' : ''}`} style={{ background: sev == null ? '#F1EFE6' : USDM[sev], color: (sev ?? 0) >= 4 ? '#fff' : '#14201A' }}
                title={`${p.short}, ${y}${predTag(y)}: ${sev == null ? 'no data' : SEVERITY[sev]}${wk ? `, ${wk} weeks in D2+` : ''}`}>
                {wk ? wk : ''}
              </span>
            );
          }),
        ])}
      </div>
      <div className="r-key">
        {USDM.map((c, n) => <span key={n}><i style={{ background: c }} />{SEVERITY_SHORT[n]}</span>)}
      </div>
      <p className="r-cap">Color is the worst Drought Monitor level in each growing season; the number is weeks in severe drought (D2) or worse. The outlined cell is {ctx.year}.{ctx.places.some(p => p.isState) ? ' State rows show the county median.' : ''}{ctx.years.some(isPredictedYear) ? ` Striped cells, ${span(ctx.years.filter(isPredictedYear))}, are predicted.` : ''}</p>
    </>
  );
}

const drought: BlockDef = {
  name: 'Drought history', blurb: 'The worst drought level each season, with weeks of severe drought, as a strip, bars or a pie.',
  defaults: () => ({ chart: 'strip' }),
  title: (o, ctx) => chartOpt(o, DROUGHT_CHARTS) === 'pie'
    ? `Seasons by worst drought level, ${span(coverYears(o, ctx))}`
    : `${chartOpt(o, DROUGHT_CHARTS) === 'bars' ? 'Weeks of severe drought' : 'Drought'} in the ${CROP_NAME[ctx.k]} season, ${ctx.from}–${ctx.to}`,
  sources: () => ['U.S. Drought Monitor'],
  Editor: ({ o, set }) => (
    <>
      <ChartPick o={o} set={set} kinds={DROUGHT_CHARTS} />
      {chartOpt(o, DROUGHT_CHARTS) === 'pie' && <CoverPick o={o} set={set} />}
    </>
  ),
  View: DroughtView,
  rows: (_o, ctx) => ctx.places.flatMap(p => ctx.years.flatMap(y => {
    const { sev, wk } = droughtCell(ctx, p, y);
    return [row('Drought history', p, y, 'Worst drought level', sev == null ? null : SEVERITY_SHORT[sev], 'Drought Monitor category'),
      row('Drought history', p, y, 'Weeks in D2 or worse', wk, 'weeks')];
  })),
};

// ---------- crop insurance ----------

const causeSlices = (byGroup: number[]): Slice[] => LOSS_GROUPS.map((_, g) => ({ label: LOSS_LABEL[g], color: LOSS_COLOR[g], value: byGroup[g] }));

function insurance_(ctx: ReportCtx, p: Place, years = ctx.years) {
  const byYear = years.map(y => {
    const j = idx(ctx, y);
    let total = 0, acres = 0, any = false;
    const byGroup = LOSS_GROUPS.map(() => 0);
    for (const c of p.counties) {
      const s = insuranceSeason(c, ctx.k, j);
      if (!s) continue;
      any = true;
      total += s.total;
      s.byGroup.forEach((v, g) => { byGroup[g] += v; });
      acres += c.d[ctx.k]?.ap[j] ?? 0;
    }
    return { y, any, total, acres, byGroup };
  });
  const grown = byYear.some(r => r.any);
  const total = byYear.reduce((a, r) => a + r.total, 0), acres = byYear.reduce((a, r) => a + r.acres, 0);
  const byGroup = LOSS_GROUPS.map((_, g) => byYear.reduce((a, r) => a + r.byGroup[g], 0));
  return { grown, byYear, total, acres, byGroup };
}

const INSURANCE_CHARTS = ['line', 'bars', 'pie'] as const;

const insurance: BlockDef = {
  name: 'Crop insurance payouts', blurb: 'What federal crop insurance paid, why, and per planted acre, with lines, bars or pies by cause.',
  defaults: () => ({ chart: 'line' }),
  title: (_o, ctx) => `${CROP_TITLE[ctx.k]} insurance payouts, ${ctx.from}–${ctx.to}`,
  sources: () => [SOURCE.insurance, SOURCE.yield],
  Editor: ({ o, set }) => (
    <>
      <ChartPick o={o} set={set} kinds={INSURANCE_CHARTS} />
      {chartOpt(o, INSURANCE_CHARTS) === 'pie' && <CoverPick o={o} set={set} />}
    </>
  ),
  View: ({ o, ctx }) => {
    const kind = chartOpt(o, INSURANCE_CHARTS);
    const data = ctx.places.map(p => ({ p, ...insurance_(ctx, p) }));
    const fj = ctx.years.indexOf(ctx.year);
    const used = LOSS_GROUPS.map((_, g) => g).filter(g => data.some(d => d.byGroup[g] > 0));
    const series = data.filter(d => d.grown).map(d => ({ label: d.p.short, color: d.p.color, values: d.byYear.map(r => (r.any && r.acres ? r.total / r.acres : null)) }));
    return (
      <>
        <div className="r-tablewrap">
          <table className="r-table">
            <thead><tr><th>Place</th><th>Paid, {ctx.from}–{ctx.to}</th><th>Per planted acre</th><th>Paid in {ctx.year}</th><th className="wide">Share by cause</th></tr></thead>
            <tbody>
              {data.map(d => (
                <tr key={d.p.ref}>
                  <td><PlaceCell p={d.p} /></td>
                  {d.grown ? (
                    <>
                      <td>{money(d.total)}</td>
                      <td>{d.acres ? `$${num(d.total / d.acres)}` : '—'}</td>
                      <td>{fj >= 0 ? money(d.byYear[fj].total) : '—'}</td>
                      <td className="wide"><SplitBar parts={causeSlices(d.byGroup)} /></td>
                    </>
                  ) : <td colSpan={4} className="r-unit">No {CROP_NAME[ctx.k]} grown here</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {used.length > 0 && <div className="r-key">{used.map(g => <span key={g}><i style={{ background: LOSS_COLOR[g] }} />{LOSS_LABEL[g]}</span>)}</div>}
        {kind === 'pie' ? (
          <>
            <h3>Payouts by cause, {coverText(o, ctx)}</h3>
            <Pies>
              {ctx.places.map(p => {
                const d = insurance_(ctx, p, coverYears(o, ctx));
                return d.grown
                  ? <PieChart key={p.ref} title={p.short} color={p.color} parts={causeSlices(d.byGroup)} fmt={money} total={money(d.total)} totalUnit="paid" label={`${p.short}: insurance payouts by cause`} />
                  : <PieChart key={p.ref} title={p.short} color={p.color} parts={[]} fmt={money} total="" label={`${p.short}: no ${CROP_NAME[ctx.k]} grown`} />;
              })}
            </Pies>
          </>
        ) : series.length > 0 && (
          <>
            <h3>Payouts per planted acre, by season</h3>
            {series.length > 1 && <Legend items={series} />}
            {kind === 'bars' ? (
              <BarChart series={series} ticks={yearTicks(ctx)} mark={fj >= 0 ? fj : undefined} unit="$" predictedFrom={predFrom(ctx)}
                fmt={v => `$${num(v)} per acre`} label="Insurance payouts per planted acre by season" hoverLabel={j => `${ctx.years[j]} crop year${predTag(ctx.years[j])}`} />
            ) : (
              <LineChart series={series} ticks={yearTicks(ctx)} bands={fj >= 0 ? [[fj, fj]] : []} mark={fj >= 0 ? fj : undefined} unit="$" predictedFrom={predFrom(ctx)}
                fmt={v => `$${num(v)} per acre`} label="Insurance payouts per planted acre by season" hoverLabel={j => `${ctx.years[j]} crop year${predTag(ctx.years[j])}`} />
            )}
          </>
        )}
        <p className="r-cap">Indemnities paid on federal crop insurance for the crop year. Price decline is a market loss on revenue policies, not crop damage.{ctx.k === 'W' ? ' Wheat combines winter and spring wheat.' : ''}{ctx.years.some(isPredictedYear) || (kind === 'pie' && coverYears(o, ctx).some(isPredictedYear)) ? ' Payouts for predicted seasons are the county’s typical season, not a forecast of one bad year.' : ''}{kind !== 'pie' ? predCap(ctx) : ''}</p>
      </>
    );
  },
  rows: (_o, ctx) => ctx.places.flatMap(p => {
    const d = insurance_(ctx, p);
    if (!d.grown) return [];
    return d.byYear.flatMap(r => [
      ...LOSS_GROUPS.map((_, g) => row('Crop insurance', p, r.y, `Payouts: ${LOSS_LABEL[g]}`, r.byGroup[g], 'USD')),
      row('Crop insurance', p, r.y, 'Payouts per planted acre', r.acres ? r.total / r.acres : null, 'USD per acre'),
    ]);
  }),
};

// ---------- storms ----------

const STORM_COLS = [0, 1, 2, 3];
/** Hail, wind and flood share the colors of the matching insurance causes; tornado takes the magenta. */
const STORM_COLOR = ['#7B4FD1', '#1BAF7A', '#E87BA4', '#2A78D6'];
const STORM_CHARTS = ['table', 'bars', 'pie'] as const;
function storms_(ctx: ReportCtx, p: Place, years = ctx.years) {
  const byType = [0, 0, 0, 0, 0];
  let damage = 0;
  const byYear = years.map(y => {
    const t = [0, 0, 0, 0, 0];
    let dmg = 0;
    for (const c of p.counties) {
      const s = stormSeason(c, ctx.k, y);
      s.byType.forEach((v, j) => { t[j] += v; });
      dmg += s.cropDamage;
    }
    t.forEach((v, j) => { byType[j] += v; });
    damage += dmg;
    return { y, t, dmg };
  });
  return { byType, damage, byYear };
}

function StormChart({ o, ctx }: { o: Opts; ctx: ReportCtx }) {
  const kind = chartOpt(o, STORM_CHARTS);
  if (kind === 'bars') {
    const series = ctx.places.map(p => ({ label: p.short, color: p.color, values: storms_(ctx, p).byYear.map(r => STORM_COLS.reduce((a, j) => a + r.t[j], 0)) }));
    return (
      <>
        <h3>Hail, wind, tornado and flood reports, by season</h3>
        {series.length > 1 && <Legend items={series} />}
        <BarChart series={series} ticks={yearTicks(ctx)} mark={Math.max(-1, ctx.years.indexOf(ctx.year))} predictedFrom={predFrom(ctx)}
          fmt={v => `${num(Math.round(v))} reports`} label="Storm reports by season" hoverLabel={j => seasonLabel(ctx, ctx.years[j])} />
      </>
    );
  }
  if (kind !== 'pie') return null;
  return (
    <>
      <h3>Reports by type, {coverText(o, ctx)}</h3>
      <Pies>
        {ctx.places.map(p => {
          const s = storms_(ctx, p, coverYears(o, ctx)), n = STORM_COLS.reduce((a, j) => a + s.byType[j], 0);
          return <PieChart key={p.ref} title={p.short} color={p.color} parts={STORM_COLS.map(j => ({ label: STORM_TYPES[j], color: STORM_COLOR[j], value: s.byType[j] }))}
            fmt={v => `${num(Math.round(v))} reports`} total={num(Math.round(n))} totalUnit="reports" label={`${p.short}: storm reports by type`} />;
        })}
      </Pies>
    </>
  );
}

const storms: BlockDef = {
  name: 'Storm reports', blurb: 'Hail, damaging wind, tornadoes and floods reported in the growing seasons, with bars or pies.',
  defaults: () => ({ chart: 'table' }),
  title: (_o, ctx) => `Storms in the ${CROP_NAME[ctx.k]} season, ${ctx.from}–${ctx.to}`,
  sources: () => [SOURCE.storm],
  Editor: ({ o, set }) => (
    <>
      <ChartPick o={o} set={set} kinds={STORM_CHARTS} />
      {chartOpt(o, STORM_CHARTS) === 'pie' && <CoverPick o={o} set={set} />}
    </>
  ),
  View: ({ o, ctx }) => (
    <>
      <div className="r-tablewrap">
        <table className="r-table">
          <thead><tr><th>Place</th>{STORM_COLS.map(j => <th key={j}>{STORM_TYPES[j]}</th>)}<th>Reported crop damage</th><th>In {ctx.year}</th></tr></thead>
          <tbody>
            {ctx.places.map(p => {
              const s = storms_(ctx, p), fy = s.byYear.find(r => r.y === ctx.year);
              return (
                <tr key={p.ref}>
                  <td><PlaceCell p={p} /></td>
                  {STORM_COLS.map(j => <td key={j}>{num(s.byType[j])}</td>)}
                  <td>{s.damage ? money(s.damage) : 'None'}</td>
                  <td>{fy ? `${num(STORM_COLS.reduce((a, j) => a + fy.t[j], 0))} reports` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <StormChart o={o} ctx={ctx} />
      <p className="r-cap">Reports filed with NOAA during each {SEASON_LABEL[ctx.k]} growing season. Reports depend on spotters, so quiet rural areas can be undercounted.{ctx.years.some(isPredictedYear) || coverYears(o, ctx).some(isPredictedYear) ? ' Predicted seasons count the county’s average storm season: single storms can’t be predicted.' : ''}{chartOpt(o, STORM_CHARTS) === 'bars' ? predCap(ctx) : ''}</p>
    </>
  ),
  rows: (_o, ctx) => ctx.places.flatMap(p => storms_(ctx, p).byYear.flatMap(r => [
    ...STORM_COLS.map(j => row('Storm reports', p, r.y, STORM_TYPES[j], r.t[j], 'reports')),
    row('Storm reports', p, r.y, 'Reported crop damage', r.dmg, 'USD'),
  ])),
};

// ---------- soil and land ----------

const LAND: [MetricId, string][] = [['aws', 'Soil water storage, mm'], ['droughty', 'Drought-prone soil'], ['nccpi', 'Soil productivity (0–1)'], ['irr', 'Irrigated share'], ['ndvi', 'Peak greenness (NDVI)']];

const land: BlockDef = {
  name: 'Soil and land', blurb: 'Water the soil holds, drought-prone soil, productivity, irrigation and greenness.',
  defaults: () => ({}),
  title: () => 'Soil and land',
  sources: () => [SOURCE.soil, SOURCE.irrigation, SOURCE.satellite],
  View: ({ ctx }) => (
    <>
      <div className="r-tablewrap">
        <table className="r-table">
          <thead><tr><th>Place</th>{LAND.map(([id, h]) => <th key={id}>{h}</th>)}</tr></thead>
          <tbody>
            {ctx.places.map(p => <tr key={p.ref}><td><PlaceCell p={p} /></td>{LAND.map(([id]) => <td key={id}>{fmt(id, seasonValue(ctx, p, id, ctx.year))}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="r-cap">Soil water storage is in the top 100 cm. Productivity is the NRCS crop productivity index for {CROP_NAME[ctx.k]}. Irrigated share and greenness are for {ctx.year}.</p>
    </>
  ),
  rows: (_o, ctx) => ctx.places.flatMap(p => LAND.map(([id]) => row('Soil and land', p, metric(id).fixed ? 'fixed' : ctx.year, metric(id).name, seasonValue(ctx, p, id, ctx.year), metric(id).unit))),
};

// ---------- map ----------

function StateMap({ code, id, ctx }: { code: StateCode; id: MetricId; ctx: ReportCtx }) {
  const counties = ctx.bundle.counties.filter(c => c.s === code);
  const pts = counties.flatMap(c => c.p.flat());
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const kx = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const w = 680, scale = Math.min(w / ((x1 - x0) * kx), 340 / (y1 - y0)), h = (y1 - y0) * scale;
  const path = (rings: [number, number][][]) => rings.map(r => 'M' + r.map(([lon, lat]) => `${((lon - x0) * kx * scale).toFixed(1)},${((y1 - lat) * scale).toFixed(1)}`).join('L') + 'Z').join('');
  const m = metric(id), bins = m.bins(ctx.k), i = idx(ctx, ctx.year);
  const marked = ctx.places.filter(p => !p.isState && p.state === code);
  return (
    <figure className="r-map">
      <svg viewBox={`-4 -4 ${(x1 - x0) * kx * scale + 8} ${h + 8}`} role="img" aria-label={`${STATES[code]} counties colored by ${m.name}`}>
        {counties.map(c => {
          const v = m.get(c, ctx.k, i);
          return (
            <path key={c.f} d={path(c.p as [number, number][][])} fill={v == null ? '#F1EFE6' : binOf(bins, v).color} stroke="#fff" strokeWidth={0.8}>
              <title>{`${c.n} County: ${v == null ? 'no data' : m.format(v)}`}</title>
            </path>
          );
        })}
        {marked.map(p => {
          const c = p.counties[0], d = path(c.p as [number, number][][]);
          const [lx, ly] = [(c.c[0] - x0) * kx * scale, (y1 - c.c[1]) * scale];
          return (
            <g key={p.ref}>
              <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={6} strokeLinejoin="round" />
              <path d={d} fill="none" stroke="#14201A" strokeWidth={2.5} strokeLinejoin="round" />
              <circle cx={lx} cy={ly} r={5} fill={p.color} stroke="#FFFFFF" strokeWidth={2} />
              <text x={lx + 8} y={ly + 4} fontSize="12" fontWeight="700" fill="#14201A" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">{c.n}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>{STATES[code]}</figcaption>
    </figure>
  );
}

const map: BlockDef = {
  name: 'Map', blurb: 'Every county in the report’s states, colored by one layer, with your places outlined.',
  defaults: () => ({ metric: 'anom' }),
  title: (o, ctx) => { const m = metric(metricOpt(o, 'metric', 'anom')); return `${m.name}${m.fixed ? '' : `, ${ctx.year}${predTag(ctx.year)}`}`; },
  sources: o => [SOURCE[metric(metricOpt(o, 'metric', 'anom')).kind], 'U.S. Census county boundaries'],
  Editor: ({ o, set }) => <MetricSelect label="Color counties by" value={metricOpt(o, 'metric', 'anom')} onChange={metric => set({ metric })} />,
  View: ({ o, ctx }) => {
    const id = metricOpt(o, 'metric', 'anom'), m = metric(id);
    const states = [...new Set(ctx.places.map(p => p.state))];
    return (
      <>
        <div className="r-maps">{states.map(code => <StateMap key={code} code={code} id={id} ctx={ctx} />)}</div>
        <div className="r-key">
          {m.bins(ctx.k).map(b => <span key={b.label}><i style={{ background: b.color }} />{b.label}</span>)}
          <span><i style={{ background: '#F1EFE6', boxShadow: 'inset 0 0 0 1px #C9CCC5' }} />No data</span>
        </div>
        <p className="r-cap">{cap(m.unit)}. Counties in the report are outlined, with a dot in their place color.</p>
      </>
    );
  },
  rows: (o, ctx) => {
    const id = metricOpt(o, 'metric', 'anom'), i = idx(ctx, ctx.year);
    const states = new Set(ctx.places.map(p => p.state));
    return ctx.bundle.counties.filter(c => states.has(c.s)).map(c => ({
      section: 'Map', place: `${c.n} County, ${STATES[c.s]}`, place_id: c.f, period: String(ctx.year), variable: metric(id).name, value: csvValue(id, metric(id).get(c, ctx.k, i)), unit: metric(id).unit,
    }));
  },
};

// ---------- my farm models ----------

const farmOf = (o: Opts) => {
  const all = cachedFarms();
  return all?.farms.find(f => f.id === o.farmId) ?? all?.farms[0] ?? null;
};

const FARM_CHARTS = ['table', 'line', 'bars', 'pie'] as const;
const FORECAST_YEARS = Array.from({ length: LAST_PREDICTED_YEAR - LAST_OBSERVED_YEAR }, (_, j) => LAST_OBSERVED_YEAR + 1 + j);
const pieYearOpt = (o: Opts) => (FORECAST_YEARS.includes(o.pieYear as number) ? (o.pieYear as number) : FORECAST_YEARS[0]);
const CROP_COLOR: Record<FarmCrop, string> = { corn: '#EDA100', soybeans: '#1BAF7A', winter_wheat: '#EB6834', sorghum: '#E87BA4' };
/** At most six models get a line or bar, one per color in the fixed order. */
const MAX_MODELS = PLACE_COLORS.length;
const modelLabel = (m: SavedFarmModel) => `${CROP_LABEL[m.crop]}, ${modelName(m.kind)}`;

function FarmEditor({ o, set }: { o: Opts; set: (patch: Opts) => void }) {
  const mine = useMyFarms();
  if (!mine) return <p className="hint">Sign in to add your farm models.</p>;
  if (!mine.farms.length) return <p className="hint">No farms yet. Add one and build a model on Predict.</p>;
  return (
    <>
      <label className="rb-field">
        <span>Farm</span>
        <select value={String(o.farmId ?? mine.farms[0].id)} onChange={e => set({ farmId: e.target.value })}>
          {mine.farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <ChartPick o={o} set={set} kinds={FARM_CHARTS} />
      {chartOpt(o, FARM_CHARTS) === 'pie' && (
        <div className="rb-field">
          <span>Harvest in</span>
          <div className="seg wide" role="group" aria-label="Season in the pie">
            {FORECAST_YEARS.map(y => <button key={y} type="button" aria-pressed={pieYearOpt(o) === y} onClick={() => set({ pieYear: y })}>{y}</button>)}
          </div>
        </div>
      )}
    </>
  );
}

/** The signed-in farmer's own records in the farm's county, or null while they load. */
function useFarmRecords(fips: string) {
  const { session } = useAuth();
  const uid = session?.user.id, key = `${uid}:${fips}`;
  const [got, setGot] = useState<{ key: string; records: FarmRecord[] } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    farmRecordsIn(uid, fips).then(records => live && setGot({ key, records })).catch(() => live && setGot({ key, records: [] }));
    return () => { live = false; };
  }, [uid, fips, key]);
  return got?.key === key ? got.records : null;
}

/** Expected bushels by crop in one predicted season: each crop's best model times the acres the farm usually gives it. */
function FarmPie({ o, models, fips }: { o: Opts; models: SavedFarmModel[]; fips: string }) {
  const records = useFarmRecords(fips), year = pieYearOpt(o);
  if (!records) return <p className="r-empty">Loading your field records…</p>;
  // Acres: the farm's average over its last four seasons, counting a season the crop wasn't grown as zero, so rotations even out.
  const seasonsSeen = [...new Set(records.map(r => r.year))].sort((a, b) => b - a).slice(0, 4);
  const acres = new Map<FarmCrop, number>();
  for (const r of records) if (seasonsSeen.includes(r.year) && r.acres) acres.set(r.crop, (acres.get(r.crop) ?? 0) + r.acres / seasonsSeen.length);
  const best = new Map<FarmCrop, SavedFarmModel>();
  for (const m of models) if (m.predictions.some(p => p.year === year) && (!best.has(m.crop) || m.scores.skill > best.get(m.crop)!.scores.skill)) best.set(m.crop, m);
  const parts = [...best.values()].map(m => {
    const a = acres.get(m.crop) ?? 0, y = m.predictions.find(p => p.year === year)!.value;
    return { label: CROP_LABEL[m.crop], color: CROP_COLOR[m.crop], value: Math.max(0, y * a), a, y, model: modelName(m.kind) };
  });
  const total = parts.reduce((a, q) => a + q.value, 0);
  const bu = (v: number) => (v >= 1e4 ? `${num(v / 1e3, v >= 1e5 ? 0 : 1)}k bu` : `${num(v)} bu`);
  return (
    <>
      <h3>Expected harvest by crop, {year} (predicted)</h3>
      {parts.length < 2 && <p className="r-empty">{parts.length ? `Only ${parts[0].label.toLowerCase()} has a model, so there is nothing to split yet. Build a model for another crop on Predict.` : `No model predicts ${year} yet.`}</p>}
      {parts.length >= 2 && <Pies><PieChart parts={parts} fmt={bu} total={bu(total)} totalUnit="expected" label={`Expected harvest by crop, ${year}`} /></Pies>}
      {parts.length > 0 && (
        <p className="r-cap">
          {parts.map(q => `${q.label}: ${num(q.y, 1)} bu/ac (${q.model}) × ${num(q.a)} acres`).join('; ')}.
          {' '}Acres are the farm&apos;s average over its last {seasonsSeen.length} seasons ({span([...seasonsSeen].reverse())}), so rotations even out. Bushels, not dollars: a bushel of soybeans is worth more than a bushel of corn.
        </p>
      )}
    </>
  );
}

function FarmChart({ o, ctx, models, county }: { o: Opts; ctx: ReportCtx; models: SavedFarmModel[]; county: ReportCtx['bundle']['counties'][number] | undefined }) {
  const kind = chartOpt(o, FARM_CHARTS), shown = models.slice(0, MAX_MODELS);
  if (kind === 'line') {
    if (!county) return null;
    const series = shown.map((m, j) => ({ label: modelLabel(m), color: PLACE_COLORS[j], values: ctx.years.map(y => savedModelValue(m, county, CROP_KEY[m.crop], ctx.bundle.years, y)?.value ?? null) }));
    return (
      <>
        <h3>Yield by season, bu/ac</h3>
        <Legend items={series} />
        <LineChart series={series} ticks={yearTicks(ctx)} predictedFrom={predFrom(ctx)} fmt={v => `${num(v, 1)} bu/ac`} label="Farm model yields by season" hoverLabel={j => seasonLabel(ctx, ctx.years[j])} />
        <p className="r-cap">Up to {LAST_OBSERVED_YEAR}, each line is what the model gives from that season&apos;s county data; after that, its saved prediction.{predFrom(ctx) == null ? ` Set the report's years to run past ${LAST_OBSERVED_YEAR} to see the predictions.` : ''}{models.length > MAX_MODELS ? ` The first ${MAX_MODELS} of ${models.length} models are drawn; all are in the table.` : ''}</p>
      </>
    );
  }
  if (kind === 'bars') {
    const ys = [...new Set(shown.flatMap(m => m.predictions.map(p => p.year)))].sort();
    const at = (m: SavedFarmModel, y: number) => m.predictions.find(p => p.year === y);
    const series = shown.map((m, j) => ({ label: modelLabel(m), color: PLACE_COLORS[j], values: ys.map(y => at(m, y)?.value ?? null) }));
    const ranges = shown.map(m => ys.map(y => { const p = at(m, y); return p ? [Math.max(0, p.low), p.high] as [number, number] : null; }));
    return (
      <>
        <h3>Predicted yield, bu/ac</h3>
        <Legend items={series} />
        <BarChart series={series} ranges={ranges} ticks={ys.map((y, j) => ({ at: j, text: String(y) }))} predictedFrom={0} fmt={v => `${num(v, 1)} bu/ac`}
          label="Predicted farm yields" hoverLabel={j => `${ys[j]} (predicted)`} />
        <p className="r-cap">Whiskers: the range 8 in 10 seasons should land in.{models.length > MAX_MODELS ? ` The first ${MAX_MODELS} of ${models.length} models are drawn; all are in the table.` : ''}</p>
      </>
    );
  }
  return null;
}

function FarmView({ o, ctx }: { o: Opts; ctx: ReportCtx }) {
  const mine = useMyFarms();
  if (!mine) return <p className="r-empty">Farm models are private: only the farm&apos;s owner, signed in, sees them here.</p>;
  const farm = mine.farms.find(f => f.id === o.farmId) ?? (o.farmId ? null : mine.farms[0]);
  if (!farm) return <p className="r-empty">This farm belongs to someone else, so its models aren&apos;t shown.</p>;
  const models = mine.models.filter(m => m.farm_id === farm.id);
  const county = ctx.bundle.counties.find(c => c.f === farm.fips);
  if (!models.length) return <p className="r-empty r-placeholder">No saved models for {farm.name} yet. Build one on Predict.</p>;
  const years = [...new Set(models.flatMap(m => m.predictions.map(p => p.year)))].sort();
  return (
    <>
      <p className="r-cap">{farm.name}{county ? `, ${county.n} County, ${STATES[county.s]}` : ''}. Models built from the farm&apos;s own records.</p>
      {chartOpt(o, FARM_CHARTS) === 'pie' ? <FarmPie o={o} models={models} fips={farm.fips} /> : <FarmChart o={o} ctx={ctx} models={models} county={county} />}
      <div className="r-tablewrap">
        <table className="r-table">
          <thead><tr><th>Crop and model</th>{years.map(y => <th key={y}>{y}</th>)}<th>Tested on your seasons</th></tr></thead>
          <tbody>
            {models.map(m => (
              <tr key={m.id}>
                <td><b>{CROP_LABEL[m.crop]}</b><span className="r-unit">{modelName(m.kind)}</span></td>
                {years.map(y => { const p = m.predictions.find(q => q.year === y); return <td key={y}>{p ? <>{num(p.value, 1)}<span className="r-unit">{num(Math.max(0, p.low))}–{num(p.high)}</span></> : '—'}</td>; })}
                <td>{m.scores.skill > 0 ? `${Math.round(m.scores.skill * 100)}% better than the farm's average` : 'Not better than the farm\'s average'}<span className="r-unit">{m.scores.n} seasons, missed by {num(m.scores.mae, 1)} bu/ac on average</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="r-cap">Predicted yields in bushels per acre, with the range 8 in 10 seasons should land in. Each model was tested by leaving out one of the farm&apos;s seasons at a time.</p>
    </>
  );
}

const farm: BlockDef = {
  name: 'My farm models', blurb: 'Your saved farm models and their predicted yields, as a table, lines, bars or a pie. Visible only to you.',
  defaults: () => ({ farmId: null, chart: 'table' }),
  title: o => { const f = farmOf(o); return f ? `${f.name}: predicted yields` : 'My farm models'; },
  sources: () => ['The farm\'s own field records, modeled in Agrigine'],
  Editor: FarmEditor,
  View: FarmView,
  rows: o => {
    const all = cachedFarms(), f = farmOf(o);
    if (!all || !f) return [];
    return all.models.filter(m => m.farm_id === f.id).flatMap(m => m.predictions.map(p => ({
      section: 'My farm models', place: f.name, place_id: f.fips, period: String(p.year),
      variable: `${CROP_LABEL[m.crop]} yield, ${modelName(m.kind)}`, value: Math.round(p.value * 10) / 10, unit: 'bu/ac',
    })));
  },
};

// ---------- notes ----------

const notes: BlockDef = {
  name: 'Notes', blurb: 'Your own observations, decisions or methods, in your words.',
  defaults: () => ({ heading: 'Notes', text: '' }),
  title: o => (typeof o.heading === 'string' && o.heading.trim()) || 'Notes',
  sources: () => [],
  Editor: ({ o, set }) => (
    <>
      <label className="rb-field"><span>Heading</span><input value={typeof o.heading === 'string' ? o.heading : ''} onChange={e => set({ heading: e.target.value })} maxLength={80} /></label>
      <label className="rb-field"><span>Text</span><textarea rows={5} value={typeof o.text === 'string' ? o.text : ''} onChange={e => set({ text: e.target.value })} placeholder="What you saw in the field, what you decided, how you read the numbers." /></label>
    </>
  ),
  View: ({ o }) => {
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) return <p className="r-empty r-placeholder">Write your notes in this block on the left. Empty notes don’t print.</p>;
    return <div className="r-notes">{text.split(/\n\s*\n/).map((para, j) => <p key={j}>{para}</p>)}</div>;
  },
  rows: () => [],
};

export const BLOCKS: Record<BlockType, BlockDef> = { glance, compare, trend, daily, drought, insurance, storms, land, map, farm, notes };
