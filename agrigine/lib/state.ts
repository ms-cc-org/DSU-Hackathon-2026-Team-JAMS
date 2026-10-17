// Explorer state, its reducer, and the URL format that makes any view shareable,
// e.g. /?county=19007&year=2012&crop=C&layer=anom&height=wk&tab=drought
import type { BinKey } from './compute';
import { CROPS, STATE_CODES } from './constants';
import { CATEGORY_IDS, HEIGHT_IDS, METRIC_IDS, metric, reported, type CategoryId, type HeightId, type MetricId } from './metrics';
import type { Bundle, CropKey, StateCode } from './types';

export type TabId = 'overview' | 'crops' | 'weather' | 'drought' | 'land' | 'sat';
export const TAB_IDS: TabId[] = ['overview', 'crops', 'weather', 'drought', 'land', 'sat'];
export type MapMode = 'globe' | 'map';
export type RefLayer = 'imagery' | 'borders' | 'states' | 'counties' | 'labels';

export interface ExplorerState {
  mode: MapMode;
  metric: MetricId;
  height: HeightId;
  crop: CropKey;
  year: number;
  states: StateCode[];
  reportedOnly: boolean;
  hidden: BinKey[];
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
  | { type: 'height'; id: HeightId }
  | { type: 'crop'; crop: CropKey }
  | { type: 'year'; year: number }
  | { type: 'step' }
  | { type: 'toggleState'; code: StateCode }
  | { type: 'reportedOnly'; on: boolean }
  | { type: 'toggleBin'; bin: BinKey }
  | { type: 'showAllBins' }
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

export const FIRST_YEAR = 2000;
export const LAST_YEAR = 2025;

export function reducer(s: ExplorerState, a: Action): ExplorerState {
  switch (a.type) {
    case 'metric':
      return { ...s, metric: a.id, openCategory: metric(a.id).cat, hidden: [], playing: metric(a.id).fixed ? false : s.playing };
    case 'height':
      return { ...s, height: a.id };
    case 'crop':
      return { ...s, crop: a.crop, hidden: [] };
    case 'year':
      return { ...s, year: a.year, playing: false };
    case 'step':
      return s.year >= LAST_YEAR ? { ...s, playing: false } : { ...s, year: s.year + 1 };
    case 'toggleState': {
      const on = s.states.includes(a.code);
      if (on && s.states.length === 1) return s;
      return { ...s, states: on ? s.states.filter(x => x !== a.code) : [...s.states, a.code] };
    }
    case 'reportedOnly':
      return { ...s, reportedOnly: a.on };
    case 'toggleBin':
      return { ...s, hidden: s.hidden.includes(a.bin) ? s.hidden.filter(b => b !== a.bin) : [...s.hidden, a.bin] };
    case 'showAllBins':
      return { ...s, hidden: [] };
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
      return { ...s, playing: a.on, year: a.on && s.year >= LAST_YEAR ? FIRST_YEAR : s.year };
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
  const fips = q.get('county');
  const code = pick(q.get('state'), STATE_CODES);
  const metricId = pick(q.get('layer'), METRIC_IDS) ?? 'anom';
  const s: ExplorerState = {
    mode: pick(q.get('view'), ['globe', 'map'] as const) ?? 'globe',
    metric: metricId,
    height: pick(q.get('height'), HEIGHT_IDS) ?? 'wk',
    crop: pick(q.get('crop'), CROPS) ?? 'C',
    year: year >= FIRST_YEAR && year <= LAST_YEAR ? year : 2012,
    states: [...STATE_CODES],
    reportedOnly: false,
    hidden: [],
    refs: { imagery: true, borders: true, states: true, counties: true, labels: true },
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
  q.set('year', String(s.year));
  q.set('crop', s.crop);
  q.set('layer', s.metric);
  q.set('height', s.height);
  if (s.mode !== 'globe') q.set('view', s.mode);
  if (s.county && s.tab !== 'overview') q.set('tab', s.tab);
  return q.toString();
}
