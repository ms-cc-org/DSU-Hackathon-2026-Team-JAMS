// Explorer state, its reducer, and the URL format that makes any view shareable,
// e.g. /?county=19007&date=2012-07-15&crop=C&layer=dRain30Anom&tab=drought
import type { BinKey } from './compute';
import { FIRST_DAY, FIRST_YEAR, LAST_DAY, LAST_YEAR, clampDay, dayOf, isoDay, parseIsoDay, sameDateInSeason, seasonYearOf } from './daily';
import { CROPS, STATE_CODES } from './constants';
import { CATEGORY_IDS, METRIC_IDS, metric, reported, type CategoryId, type MetricId } from './metrics';
import type { Bundle, CropKey, StateCode } from './types';

export type TabId = 'overview' | 'crops' | 'weather' | 'drought' | 'storms' | 'land' | 'sat';
export const TAB_IDS: TabId[] = ['overview', 'crops', 'weather', 'drought', 'storms', 'land', 'sat'];
/** "Show only" filters: severe drought this season, damaging storms this season, a long yield record. */
export type ConditionId = 'drought' | 'storms' | 'longRecord' | 'myFarms';
export const CONDITION_IDS: ConditionId[] = ['drought', 'storms', 'longRecord', 'myFarms'];
export type MapMode = 'globe' | 'map';
export type RefLayer = 'imagery' | 'dayphoto' | 'farms' | 'cities' | 'borders' | 'states' | 'counties' | 'labels';

export interface ExplorerState {
  mode: MapMode;
  metric: MetricId;
  /** Raise counties by the layer on the map: higher on its key, taller county. */
  raised: boolean;
  crop: CropKey;
  /** The selected date, as days since 2000-01-01. */
  day: number;
  /** The harvest year whose season the date falls in, for season and yearly layers. Kept in step with day and crop. */
  year: number;
  states: StateCode[];
  reportedOnly: boolean;
  conditions: ConditionId[];
  hidden: BinKey[];
  /** Saved farm models whose predictions are shown on the map and in profiles (ids; not put in the URL). */
  shownModels: string[];
  refs: Record<RefLayer, boolean>;
  county: string | null;
  state: StateCode | null;
  outside: string | null;
  tab: TabId;
  openCategory: CategoryId | null;
  playing: boolean;
  layersOpen: boolean;
}

export type Action =
  | { type: 'metric'; id: MetricId }
  | { type: 'raised'; on: boolean }
  | { type: 'crop'; crop: CropKey }
  | { type: 'day'; day: number }
  | { type: 'year'; year: number }
  | { type: 'tick'; by: number }
  | { type: 'toggleState'; code: StateCode }
  | { type: 'reportedOnly'; on: boolean }
  | { type: 'condition'; id: ConditionId }
  | { type: 'toggleBin'; bin: BinKey }
  | { type: 'showAllBins' }
  | { type: 'farmModel'; id: string; on: boolean }
  | { type: 'ref'; layer: RefLayer; on: boolean }
  | { type: 'county'; fips: string }
  | { type: 'state'; code: StateCode }
  | { type: 'outside'; name: string }
  | { type: 'close' }
  | { type: 'tab'; tab: TabId }
  | { type: 'category'; id: CategoryId }
  | { type: 'mode'; mode: MapMode }
  | { type: 'play'; on: boolean }
  | { type: 'layers'; open: boolean };

export { FIRST_YEAR, LAST_YEAR };

const atDay = (s: ExplorerState, day: number, crop = s.crop): ExplorerState => {
  const d = clampDay(day);
  return { ...s, day: d, crop, year: seasonYearOf(d, crop) };
};

export function reducer(s: ExplorerState, a: Action): ExplorerState {
  switch (a.type) {
    case 'metric':
      return { ...s, metric: a.id, openCategory: metric(a.id).cat, hidden: [], playing: metric(a.id).fixed ? false : s.playing };
    case 'raised':
      return { ...s, raised: a.on };
    case 'crop':
      return { ...atDay(s, s.day, a.crop), hidden: [] };
    case 'day':
      return { ...atDay(s, a.day), playing: false };
    case 'year':
      return { ...atDay(s, sameDateInSeason(s.day, a.year, s.crop)), playing: false };
    case 'tick':
      return s.day >= LAST_DAY ? { ...s, playing: false } : atDay(s, s.day + a.by);
    case 'toggleState': {
      const on = s.states.includes(a.code);
      if (on && s.states.length === 1) return s;
      return { ...s, states: on ? s.states.filter(x => x !== a.code) : [...s.states, a.code] };
    }
    case 'reportedOnly':
      return { ...s, reportedOnly: a.on };
    case 'condition':
      return { ...s, conditions: s.conditions.includes(a.id) ? s.conditions.filter(c => c !== a.id) : [...s.conditions, a.id] };
    case 'toggleBin':
      return { ...s, hidden: s.hidden.includes(a.bin) ? s.hidden.filter(b => b !== a.bin) : [...s.hidden, a.bin] };
    case 'showAllBins':
      return { ...s, hidden: [] };
    case 'farmModel':
      return { ...s, shownModels: a.on ? [...new Set([...s.shownModels, a.id])] : s.shownModels.filter(x => x !== a.id) };
    case 'ref':
      return { ...s, refs: { ...s.refs, [a.layer]: a.on } };
    case 'county':
      return { ...s, county: a.fips, state: null, outside: null };
    case 'state':
      return { ...s, state: a.code, county: null, outside: null, states: s.states.includes(a.code) ? s.states : [...s.states, a.code] };
    case 'outside':
      return { ...s, outside: a.name, county: null, state: null };
    case 'close':
      return { ...s, county: null, state: null, outside: null };
    case 'tab':
      return { ...s, tab: a.tab };
    case 'category':
      return { ...s, openCategory: s.openCategory === a.id ? null : a.id };
    case 'mode':
      return { ...s, mode: a.mode };
    case 'play':
      return a.on && s.day >= LAST_DAY ? { ...atDay(s, FIRST_DAY), playing: true } : { ...s, playing: a.on };
    case 'layers':
      return { ...s, layersOpen: a.open };
  }
}

const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | undefined =>
  v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/** Start from the URL when it names a view; otherwise open on 2012 corn with the hardest-hit long-record county selected. */
export function initialState(bundle: Bundle, search: string, narrow: boolean): ExplorerState {
  const q = new URLSearchParams(search);
  const year = Number(q.get('year'));
  // A shared link names a date; older links name a year, which opens on July 15 of it.
  const day = parseIsoDay(q.get('date')) ?? (year >= FIRST_YEAR && year <= LAST_YEAR ? dayOf(year, 7, 15) : dayOf(2012, 7, 15));
  const fips = q.get('county');
  const code = pick(q.get('state'), STATE_CODES);
  const metricId = pick(q.get('layer'), METRIC_IDS) ?? 'dRain30Anom';
  const crop = pick(q.get('crop'), CROPS) ?? 'C';
  const s: ExplorerState = {
    mode: pick(q.get('view'), ['globe', 'map'] as const) ?? 'globe',
    metric: metricId,
    // ?3d=1, or a link from before heights followed the layer (?height=wk).
    raised: q.get('3d') === '1' || (!!q.get('height') && q.get('height') !== 'none'),
    crop,
    day,
    year: seasonYearOf(day, crop),
    states: [...STATE_CODES],
    reportedOnly: false,
    conditions: (q.get('only') ?? '').split(',').filter((v): v is ConditionId => (CONDITION_IDS as string[]).includes(v)),
    hidden: [],
    shownModels: [],
    refs: { imagery: true, dayphoto: false, farms: true, cities: true, borders: true, states: true, counties: true, labels: true },
    county: fips && bundle.counties.some(c => c.f === fips) ? fips : null,
    state: code ?? null,
    outside: null,
    tab: pick(q.get('tab'), TAB_IDS) ?? 'overview',
    openCategory: pick(metric(metricId).cat, CATEGORY_IDS) ?? 'crops',
    playing: false,
    layersOpen: !narrow,
  };
  if (!s.county && !s.state && !q.toString()) s.county = hardestHit(bundle, 'C', 2012);
  return s;
}

function hardestHit(bundle: Bundle, k: CropKey, year: number): string | null {
  const i = year - bundle.years[0];
  let best: { f: string; a: number } | null = null;
  for (const c of bundle.counties) {
    const d = c.d[k];
    if (!d || [...d.st].filter(x => x === 'r').length < 22) continue;
    const a = reported(c, k, i, 'a');
    if (a != null && (!best || a < best.a)) best = { f: c.f, a };
  }
  return best?.f ?? null;
}

export function toSearch(s: ExplorerState): string {
  const q = new URLSearchParams();
  if (s.county) q.set('county', s.county);
  if (s.state) q.set('state', s.state);
  q.set('date', isoDay(s.day));
  q.set('crop', s.crop);
  q.set('layer', s.metric);
  if (s.raised) q.set('3d', '1');
  if (s.mode !== 'globe') q.set('view', s.mode);
  if (s.conditions.length) q.set('only', s.conditions.join(','));
  if (s.county && s.tab !== 'overview') q.set('tab', s.tab);
  return q.toString();
}
