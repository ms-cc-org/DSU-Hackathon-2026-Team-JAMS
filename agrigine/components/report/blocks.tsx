'use client';
// The report's building blocks. Each block is a module: a name, its options and their editor, how it draws in the
// report, which sources it uses, and the rows it adds to the CSV. Add a block type by adding an entry here.
import type { ReactNode } from 'react';
import { binOf } from '@/lib/bins';
import { SEVERITY, SEVERITY_SHORT, USDM } from '@/lib/colors';
import { CROP_NAME, CROP_TITLE, MONTH_SHORT, SEASON_LABEL, SEASON_MONTHS, STATES } from '@/lib/constants';
import { calendarSlot, dayContext, dayOf, dayValue, daysIn, formatDay, isoDay, normalValue, useDaily, type Channel } from '@/lib/daily';
import { mean, num, present } from '@/lib/format';
import { LOSS_COLOR, LOSS_GROUPS, LOSS_LABEL, insuranceSeason } from '@/lib/insurance';
import { CATEGORIES, CATEGORY_IDS, METRICS, metric, type MetricId, type MetricKind } from '@/lib/metrics';
import { COMBINE, placeValue, type Place } from '@/lib/report/places';
import type { BlockType } from '@/lib/report/spec';
import type { Row } from '@/lib/report/csv';
import { STORM_TYPES, money, stormSeason } from '@/lib/storms';
import type { Bundle, CropKey, StateCode } from '@/lib/types';
import { LineChart, Legend, SplitBar } from './ReportCharts';

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
  title: (_o, ctx) => `The ${ctx.year} ${CROP_NAME[ctx.k]} season at a glance`,
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

const compare: BlockDef = {
  name: 'Side by side', blurb: 'Any layers you pick, for every place, in one table.',
  defaults: () => ({ metrics: DEFAULT_COMPARE, span: 'year' }),
  title: (o, ctx) => `Side by side, ${spanLabel(o, ctx)}`,
  sources: o => [...new Set(compareMetrics(o).map(id => SOURCE[metric(id).kind]))],
  Editor: ({ o, set }) => {
    const picked = compareMetrics(o);
    const toggle = (id: MetricId) => set({ metrics: picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id].slice(0, 10) });
    return (
      <>
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

const trend: BlockDef = {
  name: 'Over the years', blurb: 'One layer as a line for each place, season by season.',
  defaults: () => ({ metric: 'anom' }),
  title: (o, ctx) => `${metric(metricOpt(o, 'metric', 'anom')).name}, ${ctx.from}–${ctx.to}`,
  sources: o => [SOURCE[metric(metricOpt(o, 'metric', 'anom')).kind]],
  Editor: ({ o, set }) => <MetricSelect label="Layer" value={metricOpt(o, 'metric', 'anom')} onChange={metric => set({ metric })} />,
  View: ({ o, ctx }) => {
    const id = metricOpt(o, 'metric', 'anom'), m = metric(id), fj = ctx.years.indexOf(ctx.year);
    const series = ctx.places.map(p => ({ label: p.short, color: p.color, values: ctx.years.map(y => seasonValue(ctx, p, id, y)) }));
    return (
      <>
        {series.length > 1 && <Legend items={series} />}
        <LineChart series={series} ticks={yearTicks(ctx)} bands={fj >= 0 ? [[fj, fj]] : []} mark={fj >= 0 ? fj : undefined}
          unit={isMoney(id) ? '$' : ''} fmt={v => m.short(v)} label={`${m.name} by season`} hoverLabel={j => `${ctx.years[j]} ${CROP_NAME[ctx.k]} season`} />
        <p className="r-cap">{cap(m.unit)}. The shaded column and dots mark {ctx.year}.{m.fixed ? ' This layer does not change from year to year.' : ''}</p>
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
        fmt={v => `${num(v, info.d)} ${info.unit.split(',')[0]}`} label={`${info.name} each day of ${ctx.year}`} hoverLabel={d => formatDay(start + d)} />
      <p className="r-cap">{cap(info.unit)}. Shaded: the {CROP_NAME[ctx.k]} growing season{ctx.k === 'W' ? ' months in this calendar year' : ''}.</p>
    </>
  );
}

const daily: BlockDef = {
  name: 'Day by day', blurb: 'Rain, heat, soil moisture or crop water demand for every day of the season year.',
  defaults: () => ({ channel: 'rain30' }),
  title: (o, ctx) => `${CHANNELS[channelOpt(o)]!.name}, ${ctx.year}`,
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

const drought: BlockDef = {
  name: 'Drought history', blurb: 'The worst drought level each season, with weeks of severe drought.',
  defaults: () => ({}),
  title: (_o, ctx) => `Drought in the ${CROP_NAME[ctx.k]} season, ${ctx.from}–${ctx.to}`,
  sources: () => ['U.S. Drought Monitor'],
  View: ({ ctx }) => (
    <>
      <div className="r-strip" style={{ gridTemplateColumns: `minmax(90px, 140px) repeat(${ctx.years.length}, minmax(0, 1fr))` }}>
        <span />
        {ctx.years.map(y => <span key={y} className="r-strip-y">{y % 5 === 0 || y === ctx.from || y === ctx.to ? `'${String(y).slice(2)}` : ''}</span>)}
        {ctx.places.map(p => [
          <PlaceCell key={p.ref} p={p} />,
          ...ctx.years.map(y => {
            const { sev, wk } = droughtCell(ctx, p, y);
            return (
              <span key={`${p.ref}${y}`} className={`r-strip-c${y === ctx.year ? ' focus' : ''}`} style={{ background: sev == null ? '#F1EFE6' : USDM[sev], color: (sev ?? 0) >= 4 ? '#fff' : '#14201A' }}
                title={`${p.short}, ${y}: ${sev == null ? 'no data' : SEVERITY[sev]}${wk ? `, ${wk} weeks in D2+` : ''}`}>
                {wk ? wk : ''}
              </span>
            );
          }),
        ])}
      </div>
      <div className="r-key">
        {USDM.map((c, n) => <span key={n}><i style={{ background: c }} />{SEVERITY_SHORT[n]}</span>)}
      </div>
      <p className="r-cap">Color is the worst Drought Monitor level in each growing season; the number is weeks in severe drought (D2) or worse. The outlined cell is {ctx.year}.{ctx.places.some(p => p.isState) ? ' State rows show the county median.' : ''}</p>
    </>
  ),
  rows: (_o, ctx) => ctx.places.flatMap(p => ctx.years.flatMap(y => {
    const { sev, wk } = droughtCell(ctx, p, y);
    return [row('Drought history', p, y, 'Worst drought level', sev == null ? null : SEVERITY_SHORT[sev], 'Drought Monitor category'),
      row('Drought history', p, y, 'Weeks in D2 or worse', wk, 'weeks')];
  })),
};

// ---------- crop insurance ----------

function insurance_(ctx: ReportCtx, p: Place) {
  const byYear = ctx.years.map(y => {
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

const insurance: BlockDef = {
  name: 'Crop insurance payouts', blurb: 'What federal crop insurance paid, why, and per planted acre.',
  defaults: () => ({}),
  title: (_o, ctx) => `${CROP_TITLE[ctx.k]} insurance payouts, ${ctx.from}–${ctx.to}`,
  sources: () => [SOURCE.insurance, SOURCE.yield],
  View: ({ ctx }) => {
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
                      <td className="wide"><SplitBar parts={LOSS_GROUPS.map((_, g) => ({ label: LOSS_LABEL[g], color: LOSS_COLOR[g], value: d.byGroup[g] }))} /></td>
                    </>
                  ) : <td colSpan={4} className="r-unit">No {CROP_NAME[ctx.k]} grown here</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {used.length > 0 && <div className="r-key">{used.map(g => <span key={g}><i style={{ background: LOSS_COLOR[g] }} />{LOSS_LABEL[g]}</span>)}</div>}
        {series.length > 0 && (
          <>
            <h3>Payouts per planted acre, by season</h3>
            {series.length > 1 && <Legend items={series} />}
            <LineChart series={series} ticks={yearTicks(ctx)} bands={fj >= 0 ? [[fj, fj]] : []} mark={fj >= 0 ? fj : undefined} unit="$"
              fmt={v => `$${num(v)} per acre`} label="Insurance payouts per planted acre by season" hoverLabel={j => `${ctx.years[j]} crop year`} />
          </>
        )}
        <p className="r-cap">Indemnities paid on federal crop insurance for the crop year. Price decline is a market loss on revenue policies, not crop damage.{ctx.k === 'W' ? ' Wheat combines winter and spring wheat.' : ''}</p>
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
function storms_(ctx: ReportCtx, p: Place) {
  const byType = [0, 0, 0, 0, 0];
  let damage = 0;
  const byYear = ctx.years.map(y => {
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

const storms: BlockDef = {
  name: 'Storm reports', blurb: 'Hail, damaging wind, tornadoes and floods reported in the growing seasons.',
  defaults: () => ({}),
  title: (_o, ctx) => `Storms in the ${CROP_NAME[ctx.k]} season, ${ctx.from}–${ctx.to}`,
  sources: () => [SOURCE.storm],
  View: ({ ctx }) => (
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
      <p className="r-cap">Reports filed with NOAA during each {SEASON_LABEL[ctx.k]} growing season. Reports depend on spotters, so quiet rural areas can be undercounted.</p>
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
  title: (o, ctx) => { const m = metric(metricOpt(o, 'metric', 'anom')); return `${m.name}${m.fixed ? '' : `, ${ctx.year}`}`; },
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

export const BLOCKS: Record<BlockType, BlockDef> = { glance, compare, trend, daily, drought, insurance, storms, land, map, notes };
