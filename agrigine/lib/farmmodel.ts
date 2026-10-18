// Simple predictive models a farmer builds from their own records, fitted in the browser (they're tiny).
// Each is checked by leaving out one season at a time and comparing with simply using the farmer's average.
import type { FarmCrop, FarmRecord } from './account';
import type { County, CropKey } from './types';

export type ModelKind = 'county_ratio' | 'own_trend' | 'weather';

export const MODEL_INFO: Record<ModelKind, { name: string; blurb: string; minSeasons: number }> = {
  county_ratio: { name: 'Follow the county', blurb: 'Your yield as a share of the county\'s, so your forecast moves with the county forecast.', minSeasons: 3 },
  own_trend: { name: 'Your own trend', blurb: 'A straight line through your own seasons.', minSeasons: 5 },
  weather: { name: 'Weather-adjusted', blurb: 'Your trend, plus how weeks of severe drought and rain against normal move your yield.', minSeasons: 8 },
};

export interface Season { year: number; y: number }
export interface Prediction { year: number; value: number; low: number; high: number }
export interface FitResult {
  kind: ModelKind;
  n: number;
  params: Record<string, number>;
  explain: string[];
  fitted: { year: number; actual: number; fit: number }[];
  /** Leave-one-season-out error, and the same for "your average", in bu/ac. */
  scores: { mae: number; baselineMae: number; skill: number };
  predictions: Prediction[];
}

/** One yield per season: the acre-weighted average of the farmer's fields (plain average where acres are missing). */
export function farmSeasons(records: FarmRecord[], crop: FarmCrop): Season[] {
  const by = new Map<number, { sum: number; w: number }>();
  for (const r of records) {
    if (r.crop !== crop || r.yield_bu_per_acre == null) continue;
    const w = r.acres && r.acres > 0 ? r.acres : 1, s = by.get(r.year) ?? { sum: 0, w: 0 };
    s.sum += r.yield_bu_per_acre * w; s.w += w;
    by.set(r.year, s);
  }
  return [...by].map(([year, s]) => ({ year, y: s.sum / s.w })).sort((a, b) => a.year - b.year);
}

/** Least squares with a little ridge shrinkage on everything but the intercept (column 0). */
function solve(X: number[][], y: number[], ridge = 0): number[] {
  const p = X[0].length, A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (let r = 0; r < X.length; r++) for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) A[i][j] += X[r][i] * X[r][j];
    A[i][p] += X[r][i] * y[r];
  }
  for (let i = 1; i < p; i++) A[i][i] += ridge;
  for (let i = 0; i < p; i++) {
    let m = i;
    for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]];
    if (Math.abs(A[i][i]) < 1e-12) return new Array(p).fill(0);
    for (let r = 0; r < p; r++) if (r !== i) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c];
    }
  }
  return A.map((row, i) => row[p] / A[i][i]);
}

interface Inputs { year: number; y: number; cy: number | null; pa: number | null; wk: number | null }
type Fitter = (rows: Inputs[]) => { predict: (r: Omit<Inputs, 'y'>) => number; params: Record<string, number> };

const FITTERS: Record<ModelKind, Fitter> = {
  county_ratio: rows => {
    const use = rows.filter(r => r.cy != null);
    const ratio = use.reduce((s, r) => s + r.y, 0) / use.reduce((s, r) => s + r.cy!, 0);
    return { predict: r => (r.cy == null ? NaN : ratio * r.cy), params: { ratio } };
  },
  own_trend: rows => {
    const [a, b] = solve(rows.map(r => [1, r.year - 2000]), rows.map(r => r.y));
    return { predict: r => a + b * (r.year - 2000), params: { intercept: a, per_year: b } };
  },
  weather: rows => {
    const use = rows.filter(r => r.pa != null && r.wk != null);
    // Rain in tens of percent and drought in weeks keep the shrinkage even-handed across inputs.
    const [a, b, c, d] = solve(use.map(r => [1, r.year - 2000, r.pa! / 10, r.wk!]), use.map(r => r.y), 1);
    return { predict: r => (r.pa == null || r.wk == null ? NaN : a + b * (r.year - 2000) + c * (r.pa / 10) + d * r.wk),
             params: { intercept: a, per_year: b, per_10pct_rain: c, per_drought_week: d } };
  },
};

const usable = (kind: ModelKind, rows: Inputs[]) =>
  kind === 'county_ratio' ? rows.filter(r => r.cy != null) : kind === 'weather' ? rows.filter(r => r.pa != null && r.wk != null) : rows;

const fmt = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

/** Fits one model to a farm's seasons, scores it season by season, and predicts 2026–2028 from the county forecasts. */
export function fitModel(kind: ModelKind, seasons: Season[], county: County, k: CropKey, years: number[], futureYears: number[]): FitResult | string {
  const d = county.d[k];
  if (!d) return `${county.n} County has no record for this crop, so there's nothing to model against.`;
  const at = (year: number): Omit<Inputs, 'y'> => {
    const i = years.indexOf(year), ok = i >= 0 && (d.st[i] === 'r' || d.st[i] === 'p');
    return { year, cy: ok ? d.y[i] : null, pa: i >= 0 ? d.pa[i] : null, wk: i >= 0 ? d.wk[i] : null };
  };
  const rows = usable(kind, seasons.filter(s => years.includes(s.year)).map(s => ({ ...at(s.year), y: s.y })));
  const need = MODEL_INFO[kind].minSeasons;
  if (rows.length < need) return `${MODEL_INFO[kind].name} needs at least ${need} seasons with your yield${kind === 'county_ratio' ? ' and a county yield' : ''}; you have ${rows.length}.`;

  const model = FITTERS[kind](rows);
  // Leave one season out: fit on the rest, predict the one left out; the baseline is the average of the rest.
  let err = 0, base = 0;
  const resid: number[] = [];
  for (let j = 0; j < rows.length; j++) {
    const rest = rows.filter((_, q) => q !== j), m = FITTERS[kind](rest);
    const e = rows[j].y - m.predict(rows[j]);
    resid.push(e); err += Math.abs(e);
    base += Math.abs(rows[j].y - rest.reduce((s, r) => s + r.y, 0) / rest.length);
  }
  const mae = err / rows.length, baselineMae = base / rows.length;
  const rmse = Math.sqrt(resid.reduce((s, e) => s + e * e, 0) / resid.length);

  const p = model.params;
  const explain = kind === 'county_ratio'
    ? [`Your yields have run ${Math.abs(p.ratio * 100 - 100).toFixed(0)}% ${p.ratio >= 1 ? 'above' : 'below'} ${county.n} County's in the same seasons (×${p.ratio.toFixed(2)}).`]
    : kind === 'own_trend'
      ? [`Your yield has changed by ${fmt(p.per_year)} bu/ac a year.`]
      : [`Trend: ${fmt(p.per_year)} bu/ac a year.`,
         `Each week of severe drought (D2+) in the season: ${fmt(p.per_drought_week)} bu/ac.`,
         `Season rain 10% above normal: ${fmt(p.per_10pct_rain)} bu/ac.`];

  const predictions = futureYears.map(year => {
    const v = model.predict(at(year));
    return { year, value: v, low: v - 1.28 * rmse, high: v + 1.28 * rmse };
  }).filter(q => Number.isFinite(q.value));

  return {
    kind, n: rows.length, params: p, explain,
    fitted: rows.map(r => ({ year: r.year, actual: r.y, fit: model.predict(r) })),
    scores: { mae, baselineMae, skill: baselineMae > 0 ? 1 - mae / baselineMae : 0 },
    predictions,
  };
}

/** Which county contains a point: ray casting over each county's outer rings. */
export function countyAt(counties: County[], lon: number, lat: number): County | null {
  const inside = (ring: [number, number][]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return counties.find(c => c.p.some(r => inside(r as [number, number][]))) ?? null;
}

export interface SavedValue { value: number; low?: number; high?: number; predicted: boolean }

/**
 * A saved model's yield for one season: its saved prediction for 2026-2028, or, for earlier seasons, its estimate
 * from the saved settings and that season's county data (the same formula it was fitted with).
 */
export function savedModelValue(m: { kind: string; params: Record<string, number>; predictions: { year: number; value: number; low: number; high: number }[] },
  county: County, k: CropKey, years: number[], year: number): SavedValue | null {
  const saved = m.predictions.find(p => p.year === year);
  if (saved) return { value: saved.value, low: saved.low, high: saved.high, predicted: true };
  const d = county.d[k], i = years.indexOf(year);
  if (!d || i < 0) return null;
  const p = m.params, cy = d.st[i] === 'r' ? d.y[i] : null, pa = d.pa[i], wk = d.wk[i];
  const v = m.kind === 'county_ratio' ? (cy == null ? null : p.ratio * cy)
    : m.kind === 'own_trend' ? p.intercept + p.per_year * (year - 2000)
    : pa == null || wk == null ? null : p.intercept + p.per_year * (year - 2000) + p.per_10pct_rain * (pa / 10) + p.per_drought_week * wk;
  return v == null || !Number.isFinite(v) ? null : { value: v, predicted: false };
}
