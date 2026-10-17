// Every layer the map can be colored or raised by. A layer reads one value per county for a crop and season.
import { divBins, seqBins, zeroBins, type Bin } from './bins';
import { RAMP, SEVERITY, SEVERITY_SHORT, USDM } from './colors';
import { CROP_NAME, MAX_WEEKS } from './constants';
import { dayOfYear, num, pct, plural, thousands } from './format';
import type { County, CropKey, SeriesField } from './types';

export type CategoryId = 'crops' | 'drought' | 'weather' | 'land' | 'sat';
export type MetricKind = 'yield' | 'season' | 'soil' | 'irrigation' | 'satellite';

/** Category colors come from a validated categorical palette and always appear with a label and icon. */
export const CATEGORIES: Record<CategoryId, { name: string; color: string }> = {
  crops: { name: 'Crops', color: 'var(--cat-crops)' },
  drought: { name: 'Drought', color: 'var(--cat-drought)' },
  weather: { name: 'Weather', color: 'var(--cat-weather)' },
  land: { name: 'Land & water', color: 'var(--cat-land)' },
  sat: { name: 'Satellite', color: 'var(--cat-sat)' },
};
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export interface Metric {
  cat: CategoryId;
  name: string;
  unit: string;
  kind: MetricKind;
  /** Which end is bad for crops, used for ranking; null when neither end is. */
  worse: 'low' | 'high' | null;
  /** Soil layers don't change by season. */
  fixed?: boolean;
  get: (c: County, k: CropKey, i: number) => number | null;
  bins: (k: CropKey) => Bin[];
  format: (v: number) => string;
  short: (v: number) => string;
}

/** A reported-yield field: null unless NASS published a yield that season. */
export const reported = (c: County, k: CropKey, i: number, f: SeriesField) => {
  const d = c.d[k];
  return d && d.st[i] === 'r' && d[f][i] != null ? d[f][i] : null;
};
/** A growing-season field (weather, drought): present whenever the county grows the crop. */
export const season = (c: County, k: CropKey, i: number, f: SeriesField) => {
  const d = c.d[k];
  return d && d[f][i] != null ? d[f][i] : null;
};

const YIELD_CUTS: Record<CropKey, number[]> = { C: [130, 150, 170, 190], S: [40, 46, 52, 58], W: [35, 45, 55, 70], G: [50, 65, 80, 95] };
const ACRE_CUTS: Record<CropKey, number[]> = { C: [25e3, 60e3, 110e3, 150e3], S: [25e3, 55e3, 85e3, 115e3], W: [2e3, 7e3, 20e3, 45e3], G: [1e3, 2e3, 5e3, 12e3] };
const PROD_CUTS: Record<CropKey, number[]> = { C: [5, 10, 20, 30], S: [1.5, 3, 4.5, 6], W: [0.1, 0.4, 1, 2], G: [0.1, 0.25, 0.5, 1] };
const RAIN_CUTS: Record<CropKey, number[]> = { C: [250, 375, 500, 625], S: [350, 450, 550, 675], W: [300, 400, 525, 675], G: [200, 300, 400, 500] };
const TEMP_CUTS: Record<CropKey, number[]> = { C: [19, 20, 21, 22], S: [17.5, 18.5, 19.5, 20.5], W: [6, 7.5, 9, 12], G: [18.5, 19.5, 20.5, 21.5] };
const GDD_CUTS: Record<CropKey, number[]> = { C: [1450, 1550, 1650, 1750], S: [1575, 1675, 1775, 1875], W: [2600, 2800, 3100, 3600], G: [1500, 1600, 1700, 1850] };

const production = (c: County, k: CropKey, i: number) => {
  const y = reported(c, k, i, 'y'), a = reported(c, k, i, 'ah');
  return y != null && a != null ? (y * a) / 1e6 : null;
};
const millions = (v: number) => (v < 1 ? v.toFixed(2) : v.toFixed(1));

export const METRICS = {
  anom: {
    cat: 'crops', name: 'Yield vs trend', unit: '% above or below the county trend', kind: 'yield', worse: 'low',
    get: (c, k, i) => reported(c, k, i, 'a'),
    bins: () => divBins([5, 15, 30], RAMP.divRed, RAMP.divBlue, v => pct(v)),
    format: v => `${pct(v, 1)} vs trend`, short: v => pct(v),
  },
  yield: {
    cat: 'crops', name: 'Yield', unit: 'bushels per acre', kind: 'yield', worse: 'low',
    get: (c, k, i) => reported(c, k, i, 'y'),
    bins: k => seqBins(YIELD_CUTS[k], RAMP.gold, String),
    format: v => `${num(v, 1)} bu/ac`, short: v => num(v),
  },
  acres: {
    cat: 'crops', name: 'Harvested acres', unit: 'acres harvested for grain', kind: 'yield', worse: 'low',
    get: (c, k, i) => reported(c, k, i, 'ah'),
    bins: k => seqBins(ACRE_CUTS[k], RAMP.gold, thousands),
    format: v => `${thousands(v)} acres`, short: thousands,
  },
  prod: {
    cat: 'crops', name: 'Production', unit: 'million bushels harvested', kind: 'yield', worse: 'low',
    get: production,
    bins: k => seqBins(PROD_CUTS[k], RAMP.gold, String),
    format: v => `${millions(v)}M bu`, short: millions,
  },
  sev: {
    cat: 'drought', name: 'Worst drought level', unit: 'Drought Monitor category in the growing season', kind: 'season', worse: 'high',
    get: (c, k, i) => season(c, k, i, 'sv'),
    bins: () => USDM.map((color, n) => ({ color, label: SEVERITY[n], test: (v: number) => v <= n })),
    format: v => SEVERITY[v], short: v => SEVERITY_SHORT[v],
  },
  wk: {
    cat: 'drought', name: 'Weeks in severe drought', unit: 'weeks in D2 or worse, growing season', kind: 'season', worse: 'high',
    get: (c, k, i) => season(c, k, i, 'wk'),
    bins: () => zeroBins([4, 8, 13], RAMP.orange.slice(0, 4), String),
    format: v => `${plural(v, 'week')} in D2+`, short: String,
  },
  dsci: {
    cat: 'drought', name: 'Drought intensity', unit: 'mean DSCI, 0 to 500', kind: 'season', worse: 'high',
    get: (c, k, i) => season(c, k, i, 'ds'),
    bins: () => zeroBins([50, 100, 200], RAMP.orange.slice(0, 4), String),
    format: v => `DSCI ${v}`, short: String,
  },
  rain: {
    cat: 'weather', name: 'Rainfall', unit: 'mm in the growing season', kind: 'season', worse: 'low',
    get: (c, k, i) => season(c, k, i, 'pr'),
    bins: k => seqBins(RAIN_CUTS[k], RAMP.blue, String),
    format: v => `${num(v)} mm`, short: v => num(v),
  },
  rainAnom: {
    cat: 'weather', name: 'Rainfall vs normal', unit: '% vs the 2000–2025 average', kind: 'season', worse: 'low',
    get: (c, k, i) => season(c, k, i, 'pa'),
    bins: () => divBins([5, 20, 40], RAMP.divDry, RAMP.divWet, v => pct(v)),
    format: v => `${pct(v)} vs normal`, short: v => pct(v),
  },
  heat: {
    cat: 'weather', name: 'Days at 35 °C or hotter', unit: 'days in the growing season', kind: 'season', worse: 'high',
    get: (c, k, i) => season(c, k, i, 'ht'),
    bins: () => zeroBins([4, 8, 15], RAMP.red.slice(0, 4), String),
    format: v => `${plural(v, 'day')} ≥ 35 °C`, short: String,
  },
  tavg: {
    cat: 'weather', name: 'Average temperature', unit: '°C over the growing season', kind: 'season', worse: 'high',
    get: (c, k, i) => season(c, k, i, 'tv'),
    bins: k => seqBins(TEMP_CUTS[k], RAMP.red, String),
    format: v => `${num(v, 1)} °C`, short: v => num(v, 1),
  },
  gdd: {
    cat: 'weather', name: 'Growing degree days', unit: 'heat units in the growing season', kind: 'season', worse: null,
    get: (c, k, i) => season(c, k, i, 'gd'),
    bins: k => seqBins(GDD_CUTS[k], RAMP.red, v => num(v)),
    format: v => `${num(v)} GDD`, short: v => num(v),
  },
  aws: {
    cat: 'land', name: 'Soil water storage', unit: 'mm the top 100 cm of soil can hold', kind: 'soil', worse: 'low', fixed: true,
    get: c => c.aws,
    bins: () => seqBins([100, 140, 170, 190], RAMP.teal, String),
    format: v => `${num(v)} mm`, short: v => num(v),
  },
  droughty: {
    cat: 'land', name: 'Drought-prone soil', unit: '% of county area', kind: 'soil', worse: 'high', fixed: true,
    get: c => c.dr,
    bins: () => seqBins([10, 25, 50, 75], RAMP.brown, v => v + '%'),
    format: v => `${num(v, 1)}% of county`, short: v => num(v) + '%',
  },
  nccpi: {
    cat: 'land', name: 'Soil productivity', unit: 'NCCPI for the crop, 0 to 1', kind: 'soil', worse: 'low', fixed: true,
    get: (c, k) => c.nc[k] ?? null,
    bins: () => seqBins([0.2, 0.4, 0.6, 0.75], RAMP.gold, v => v.toFixed(2)),
    format: v => `NCCPI ${v.toFixed(2)}`, short: v => v.toFixed(2),
  },
  irr: {
    cat: 'land', name: 'Irrigated share', unit: '% of harvested acres irrigated', kind: 'irrigation', worse: null,
    get: (c, k, i) => { const s = c.ir?.[k]?.sh[i]; return s == null ? null : s * 100; },
    bins: () => seqBins([10, 30, 50, 75], RAMP.teal, v => v + '%'),
    format: v => `${Math.round(v)}% irrigated`, short: v => Math.round(v) + '%',
  },
  ndvi: {
    cat: 'sat', name: 'Peak greenness', unit: 'NDVI, greenest 16 days of the year', kind: 'satellite', worse: 'low',
    get: (c, _k, i) => c.md?.nx[i] ?? null,
    bins: () => seqBins([0.65, 0.75, 0.83, 0.87], RAMP.green, v => v.toFixed(2)),
    format: v => `NDVI ${v.toFixed(2)}`, short: v => v.toFixed(2),
  },
  ndviAnom: {
    cat: 'sat', name: 'Greenness vs normal', unit: '% vs the county average NDVI', kind: 'satellite', worse: 'low',
    get: (c, _k, i) => c.md?.na[i] ?? null,
    bins: () => divBins([1.5, 4, 8], RAMP.divDry, RAMP.divGreen, v => pct(v, 1)),
    format: v => `${pct(v, 1)} vs normal`, short: v => pct(v, 1),
  },
  peak: {
    cat: 'sat', name: 'Peak greenness date', unit: 'day the county was greenest', kind: 'satellite', worse: null,
    get: (c, _k, i) => c.md?.pk[i] ?? null,
    bins: () => seqBins([152, 182, 202, 222], RAMP.purple, dayOfYear),
    format: dayOfYear, short: dayOfYear,
  },
} satisfies Record<string, Metric>;

export type MetricId = keyof typeof METRICS;
export const METRIC_IDS = Object.keys(METRICS) as MetricId[];
export const metric = (id: MetricId): Metric => METRICS[id];

export interface HeightLayer {
  name: string;
  get?: (c: County, k: CropKey, i: number) => number | null;
  max?: (k: CropKey) => number;
}
const loss = (v: number | null) => (v == null ? null : Math.max(0, -v));
export const HEIGHTS = {
  none: { name: 'Flat, no height' },
  wk: { name: 'Weeks in severe drought', get: (c, k, i) => season(c, k, i, 'wk'), max: k => MAX_WEEKS[k] },
  loss: { name: 'Yield loss below trend', get: (c, k, i) => loss(reported(c, k, i, 'a')), max: () => 40 },
  dsci: { name: 'Drought intensity', get: (c, k, i) => season(c, k, i, 'ds'), max: () => 400 },
  deficit: { name: 'Rain deficit', get: (c, k, i) => loss(season(c, k, i, 'pa')), max: () => 60 },
  heat: { name: 'Days at 35 °C or hotter', get: (c, k, i) => season(c, k, i, 'ht'), max: () => 30 },
  yield: { name: 'Yield', get: (c, k, i) => reported(c, k, i, 'y'), max: k => ({ C: 240, S: 70, W: 90, G: 130 })[k] },
  prod: { name: 'Production', get: production, max: k => ({ C: 40, S: 8, W: 3, G: 1.5 })[k] },
  droughty: { name: 'Drought-prone soil', get: c => c.dr, max: () => 100 },
  greenDrop: { name: 'Greenness drop', get: (c, _k, i) => loss(c.md?.na[i] ?? null), max: () => 12 },
} satisfies Record<string, HeightLayer>;

export type HeightId = keyof typeof HEIGHTS;
export const HEIGHT_IDS = Object.keys(HEIGHTS) as HeightId[];
export const height = (id: HeightId): HeightLayer => HEIGHTS[id];

/** Why a county has no value for a layer, in words a user can act on. */
export function whyMissing(c: County, id: MetricId, k: CropKey, i: number): string {
  const m = metric(id), d = c.d[k];
  if (m.kind === 'soil') return 'No soil data for this county';
  if (m.kind === 'satellite') return c.md ? 'No satellite value this year' : 'No satellite record here';
  if (m.kind === 'irrigation') return c.s === 'IA' ? 'Iowa is rainfed: no irrigation series' : 'NASS published no irrigation split';
  if (!d) return `No ${CROP_NAME[k]} grown here`;
  if (m.kind === 'yield') return d.st[i] === 's' ? 'Planted, no grain harvested' : 'No reported yield';
  return 'No value this season';
}
