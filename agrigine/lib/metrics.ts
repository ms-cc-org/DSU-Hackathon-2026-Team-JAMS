// Every layer the map can be colored or raised by. A layer reads one value per county for a crop and season.
import { divBins, seqBins, zeroBins, type Bin } from './bins';
import { NEUTRAL, RAMP, SEVERITY, SEVERITY_SHORT, USDM } from './colors';
import { CROP_NAME } from './constants';
import { dayOfYear, num, pct, plural, signed, thousands } from './format';
import { DAMAGING, money, seasonDays, stormSeason, typicalWeek } from './storms';
import { dateOf, dayValue, droughtOn, isPredictedDay, normalValue, seasonToDate, type DayContext } from './daily';
import { expectedYield, frostRisk, predicted } from './predict';
import { LOSS_COLOR, LOSS_LABEL, insuranceMonth, insuranceSeason, mainCause } from './insurance';
import type { County, CropKey, SeriesField } from './types';

export type CategoryId = 'crops' | 'drought' | 'weather' | 'storms' | 'land' | 'sat';
export type MetricKind = 'daily' | 'yield' | 'insurance' | 'season' | 'derived' | 'freeze' | 'storm' | 'soil' | 'irrigation' | 'satellite';

/** Category colors come from a validated categorical palette and always appear with a label and icon. */
export const CATEGORIES: Record<CategoryId, { name: string; color: string }> = {
  crops: { name: 'Crops', color: 'var(--cat-crops)' },
  drought: { name: 'Drought', color: 'var(--cat-drought)' },
  weather: { name: 'Weather', color: 'var(--cat-weather)' },
  storms: { name: 'Storms', color: 'var(--cat-storms)' },
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
  /** Made by a model or from the county's history, not measured; labeled in the layer list. */
  predicted?: boolean;
  /** i is the season-year index; t is the selected date, which day-by-day layers read. */
  get: (c: County, k: CropKey, i: number, t?: DayContext) => number | null;
  bins: (k: CropKey) => Bin[];
  format: (v: number) => string;
  short: (v: number) => string;
}

/** A reported-yield field: null unless NASS published a yield that season. */
export const reported = (c: County, k: CropKey, i: number, f: SeriesField) => {
  const d = c.d[k];
  return d && (d.st[i] === 'r' || d.st[i] === 'p') && d[f][i] != null ? d[f][i] : null;
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

const FIRST_YEAR = 2000;
/** A crop-season measure derived from daily weather; available for every county, crops or not. */
const derived = (c: County, k: CropKey, i: number, f: 'hn' | 'fh' | 'dry' | 'hr') => c.sw?.[k]?.[f][i] ?? null;
const storm = (c: County, k: CropKey, i: number) => stormSeason(c, k, FIRST_YEAR + i);
const stormBins = (cuts: number[]) => zeroBins(cuts, RAMP.purple.slice(0, 4), String);
const chanceBins = (ramp: string[]) => seqBins([10, 25, 50, 75], ramp, v => `${v}%`);
const moneyBins = (cuts: number[]) => [{ color: NEUTRAL, test: (v: number) => v <= 0, label: 'None' }, ...seqBins(cuts, RAMP.red, money)];
const rainBins = (cuts: number[]) => [{ color: NEUTRAL, test: (v: number) => v < 0.3, label: 'No rain' }, ...seqBins(cuts, RAMP.blue.slice(0, 4), v => `${v} mm`)];

const production = (c: County, k: CropKey, i: number) => {
  const y = reported(c, k, i, 'y'), a = reported(c, k, i, 'ah');
  return y != null && a != null ? (y * a) / 1e6 : null;
};
const millions = (v: number) => (v < 1 ? v.toFixed(2) : v.toFixed(1));

export const METRICS = {
  // ---- On the selected date (daily weather, weekly drought, dated storm reports) ----
  dHighAnom: {
    cat: 'weather', name: 'High vs normal', unit: '°C above or below the normal high for this date', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => { const v = dayValue(t, 'tmax', c), n = normalValue(t, 'tmax', c); return v == null || n == null ? null : v - n; },
    bins: () => divBins([2, 5, 9], RAMP.divBlue, RAMP.divRed, v => `${signed(v)} °C`),
    format: v => `${signed(v, 1)} °C vs normal`, short: v => `${signed(v)} °C`,
  },
  dTmax: {
    cat: 'weather', name: 'Daily high', unit: '°C, highest temperature of the day', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => dayValue(t, 'tmax', c),
    bins: () => seqBins([0, 10, 20, 30], RAMP.red, v => `${v} °C`),
    format: v => `High ${num(v, 1)} °C`, short: v => `${num(v)} °C`,
  },
  dTmin: {
    cat: 'weather', name: 'Daily low', unit: '°C, lowest temperature of the day', kind: 'daily', worse: null,
    get: (c, _k, _i, t) => dayValue(t, 'tmin', c),
    bins: () => seqBins([-10, 0, 10, 20], RAMP.teal, v => `${v} °C`),
    format: v => `Low ${num(v, 1)} °C`, short: v => `${num(v)} °C`,
  },
  dRain: {
    cat: 'weather', name: 'Rain that day', unit: 'mm of rain on this date', kind: 'daily', worse: null,
    get: (c, _k, _i, t) => dayValue(t, 'pcpn', c),
    bins: () => rainBins([5, 15, 30]),
    format: v => (v < 0.3 ? 'No rain' : `${num(v, 1)} mm of rain`), short: v => `${num(v, 1)} mm`,
  },
  dRain7: {
    cat: 'weather', name: 'Rain, last 7 days', unit: 'mm of rain in the 7 days up to this date', kind: 'daily', worse: null,
    get: (c, _k, _i, t) => dayValue(t, 'rain7', c),
    bins: () => rainBins([10, 25, 50]),
    format: v => `${num(v, 1)} mm in 7 days`, short: v => `${num(v)} mm`,
  },
  dRain30Anom: {
    cat: 'weather', name: 'Rain vs normal, last 30 days', unit: '% above or below the normal 30-day rain for this date', kind: 'daily', worse: 'low',
    get: (c, _k, _i, t) => { const v = dayValue(t, 'rain30', c), n = normalValue(t, 'rain30', c); return v == null || n == null || n < 5 ? null : ((v - n) / n) * 100; },
    bins: () => divBins([15, 35, 60], RAMP.divDry, RAMP.divWet, v => pct(v)),
    format: v => `${pct(v)} vs normal (30 days)`, short: v => pct(v),
  },
  dDry: {
    cat: 'weather', name: 'Days since rain', unit: 'days since the last day with 2.5 mm of rain or more', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => dayValue(t, 'dry', c),
    bins: () => seqBins([7, 14, 21, 30], RAMP.brown, String, true),
    format: v => (v === 0 ? 'Rained today' : `${plural(v, 'day')} since rain`), short: String,
  },
  dGdd: {
    cat: 'weather', name: 'Heat units so far', unit: 'growing degree days from the start of the season to this date', kind: 'daily', worse: null,
    get: (c, k, _i, t) => seasonToDate(t, c, k, 'gdd'),
    bins: () => seqBins([300, 700, 1100, 1500], RAMP.green, v => num(v)),
    format: v => `${num(v)} GDD so far`, short: v => num(v),
  },
  pFrost: {
    cat: 'weather', name: 'Frost risk for this date', unit: 'before July: % of years with another freeze after this date; from July: % with a freeze by this date (2000–2025)', kind: 'daily', worse: 'high', predicted: true,
    get: (c, _k, _i, t) => frostRisk(t, c)?.pct ?? null,
    bins: () => [{ color: NEUTRAL, test: (v: number) => v <= 0, label: 'No risk' }, ...seqBins([5, 10, 25, 50], RAMP.purple, v => `${v}%`)],
    format: v => `${num(v)}% frost risk`, short: v => `${num(v)}%`,
  },
  dHot: {
    cat: 'weather', name: 'Hot days so far', unit: 'days at 35 °C or hotter from the start of the season to this date', kind: 'daily', worse: 'high',
    get: (c, k, _i, t) => seasonToDate(t, c, k, 'hot'),
    bins: () => zeroBins([3, 7, 14], RAMP.red.slice(0, 4), String),
    format: v => `${plural(v, 'hot day')} so far`, short: String,
  },
  dSev: {
    cat: 'drought', name: 'Drought level this week', unit: 'Drought Monitor map in effect on this date', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => (t ? droughtOn(c, t.day)?.cat ?? null : null),
    bins: () => USDM.map((color, n) => ({ color, label: SEVERITY[n], test: (v: number) => v <= n })),
    format: v => SEVERITY[v], short: v => SEVERITY_SHORT[v],
  },
  dDsci: {
    cat: 'drought', name: 'Drought intensity this week', unit: 'DSCI on the map in effect on this date, 0 to 500', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => (t ? droughtOn(c, t.day)?.dsci ?? null : null),
    bins: () => zeroBins([50, 100, 200], RAMP.orange.slice(0, 4), String),
    format: v => `DSCI ${v}`, short: String,
  },
  pDrought4: {
    cat: 'drought', name: 'Chance of severe drought in 4 weeks', unit: '% chance a Drought Monitor map in the next 4 weeks shows D2 or worse here (predicted)', kind: 'daily', worse: 'high', predicted: true,
    get: (c, _k, _i, t) => predicted(t, 'drought_4w', c),
    bins: () => chanceBins(RAMP.orange),
    format: v => `${num(v)}% chance of severe drought within 4 weeks`, short: v => `${num(v)}%`,
  },
  pDrought8: {
    cat: 'drought', name: 'Chance of severe drought in 8 weeks', unit: '% chance a Drought Monitor map in the next 8 weeks shows D2 or worse here (predicted)', kind: 'daily', worse: 'high', predicted: true,
    get: (c, _k, _i, t) => predicted(t, 'drought_8w', c),
    bins: () => chanceBins(RAMP.orange),
    format: v => `${num(v)}% chance of severe drought within 8 weeks`, short: v => `${num(v)}%`,
  },
  dStorms7: {
    cat: 'storms', name: 'Storms, last 7 days', unit: 'hail, wind, tornado and flood reports in the 7 days up to this date; after 2025, the 2000–2025 average for those dates', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => (!t ? null : isPredictedDay(t.day) ? typicalWeek(c, t.day)
      : (c.ev ?? []).filter(e => e[0] <= t.day && e[0] > t.day - 7 && DAMAGING.includes(e[1])).length),
    bins: () => stormBins([2, 4, 8]),
    format: v => (v % 1 ? `${num(v, 1)} storm reports on average` : plural(v, 'storm report')), short: v => num(v, v % 1 ? 1 : 0),
  },
  dVpd: {
    cat: 'weather', name: 'Dry air (VPD)', unit: 'vapor pressure deficit, kPa: how hard the air pulls water from plants', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => dayValue(t, 'vpd', c),
    bins: () => seqBins([1, 1.5, 2.2, 3], RAMP.orange, v => `${v} kPa`),
    format: v => `${num(v, 2)} kPa VPD`, short: v => num(v, 1),
  },
  dEt0: {
    cat: 'weather', name: 'Crop water demand', unit: 'mm of water a healthy crop would use that day (reference evapotranspiration)', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => dayValue(t, 'et0', c),
    bins: () => seqBins([2, 4, 6, 8], RAMP.teal, v => `${v} mm`),
    format: v => `${num(v, 1)} mm demand`, short: v => num(v, 1),
  },
  dSrad: {
    cat: 'weather', name: 'Sunlight', unit: 'W/m², average incoming sunlight that day', kind: 'daily', worse: null,
    get: (c, _k, _i, t) => dayValue(t, 'srad', c),
    bins: () => seqBins([100, 175, 250, 300], RAMP.gold, String),
    format: v => `${num(v)} W/m² sunlight`, short: v => num(v),
  },
  dWind: {
    cat: 'weather', name: 'Wind', unit: 'm/s, average wind speed at 2 m', kind: 'daily', worse: 'high',
    get: (c, _k, _i, t) => dayValue(t, 'wind', c),
    bins: () => seqBins([2, 4, 6, 8], RAMP.purple, v => `${v} m/s`),
    format: v => `${num(v, 1)} m/s wind`, short: v => num(v, 1),
  },
  dRh: {
    cat: 'weather', name: 'Humidity', unit: '% relative humidity, daily average', kind: 'daily', worse: 'low',
    get: (c, _k, _i, t) => dayValue(t, 'rh', c),
    bins: () => seqBins([40, 55, 70, 85], RAMP.blue, v => `${v}%`),
    format: v => `${num(v)}% humidity`, short: v => `${num(v)}%`,
  },
  dWb30: {
    cat: 'drought', name: 'Water balance, last 30 days', unit: 'mm of rain minus crop water demand over the 30 days up to this date', kind: 'daily', worse: 'low',
    get: (c, _k, _i, t) => dayValue(t, 'wb30', c),
    bins: () => divBins([25, 75, 150], RAMP.divDry, RAMP.divWet, v => `${signed(v)} mm`),
    format: v => `${signed(v)} mm water balance (30 days)`, short: v => `${signed(v)} mm`,
  },
  dWbAnom: {
    cat: 'drought', name: 'Water balance vs normal', unit: 'mm wetter or drier than the normal 30-day water balance for this date', kind: 'daily', worse: 'low',
    get: (c, _k, _i, t) => { const v = dayValue(t, 'wb30', c), n = normalValue(t, 'wb30', c); return v == null || n == null ? null : v - n; },
    bins: () => divBins([15, 40, 80], RAMP.divDry, RAMP.divWet, v => `${signed(v)} mm`),
    format: v => `${signed(v)} mm vs normal`, short: v => `${signed(v)} mm`,
  },
  dSoil: {
    cat: 'drought', name: 'Soil moisture', unit: 'root-zone soil wetness, 0 (dry) to 100 (saturated)', kind: 'daily', worse: 'low',
    get: (c, _k, _i, t) => dayValue(t, 'soil', c),
    bins: () => seqBins([25, 35, 45, 60], RAMP.teal, v => `${v}%`),
    format: v => `${num(v)}% soil wetness`, short: v => `${num(v)}%`,
  },
  dSoilAnom: {
    cat: 'drought', name: 'Soil moisture vs normal', unit: 'points wetter or drier than normal soil wetness for this date', kind: 'daily', worse: 'low',
    get: (c, _k, _i, t) => { const v = dayValue(t, 'soil', c), n = normalValue(t, 'soil', c); return v == null || n == null ? null : v - n; },
    bins: () => divBins([3, 8, 15], RAMP.divDry, RAMP.divWet, v => `${signed(v)} pts`),
    format: v => `${signed(v)} points vs normal`, short: v => signed(v),
  },
  pYield: {
    cat: 'crops', name: 'Expected yield this season', unit: '% above or below the county trend for the season this date belongs to, as predicted on this date', kind: 'daily', worse: 'low', predicted: true,
    get: (c, k, _i, t) => expectedYield(t, k, c, seasonDays)?.pct ?? null,
    bins: () => divBins([3, 8, 15], RAMP.divRed, RAMP.divBlue, v => pct(v)),
    format: v => `${pct(v, 1)} vs trend, expected for the season`, short: v => pct(v),
  },
  insMonth: {
    cat: 'crops', name: 'Insurance payouts this month', unit: 'USD paid for crop losses that happened in this calendar month', kind: 'daily', worse: 'high',
    get: (c, k, _i, t) => { if (!t) return null; const d = dateOf(t.day); return insuranceMonth(c, k, FIRST_YEAR, d.getUTCFullYear(), d.getUTCMonth() + 1); },
    bins: () => moneyBins([1e4, 1e5, 1e6, 5e6]),
    format: v => (v > 0 ? `${money(v)} paid for this month's losses` : 'No payouts for this month'), short: v => (v > 0 ? money(v) : '$0'),
  },
  // ---- Season and yearly layers ----
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
  insPerAcre: {
    cat: 'crops', name: 'Insurance payouts per acre', unit: 'USD of crop insurance paid per planted acre, all causes', kind: 'insurance', worse: 'high',
    get: (c, k, i) => { const s = insuranceSeason(c, k, i), ap = c.d[k]?.ap[i]; return s == null || !ap ? null : s.total / ap; },
    bins: () => moneyBins([5, 20, 50, 100]),
    format: v => (v > 0 ? `${money(v)} per planted acre` : 'No payouts'), short: v => (v > 0 ? money(v) : '$0'),
  },
  insTotal: {
    cat: 'crops', name: 'Insurance payouts', unit: 'USD of crop insurance paid for the season, all causes', kind: 'insurance', worse: 'high',
    get: (c, k, i) => insuranceSeason(c, k, i)?.total ?? null,
    bins: () => moneyBins([1e5, 1e6, 5e6, 2e7]),
    format: v => (v > 0 ? `${money(v)} in payouts` : 'No payouts'), short: v => (v > 0 ? money(v) : '$0'),
  },
  insDrought: {
    cat: 'crops', name: 'Drought payouts', unit: 'USD of crop insurance paid for drought losses', kind: 'insurance', worse: 'high',
    get: (c, k, i) => insuranceSeason(c, k, i)?.byGroup[0] ?? null,
    bins: () => moneyBins([1e5, 1e6, 5e6, 2e7]),
    format: v => (v > 0 ? `${money(v)} for drought` : 'No drought payouts'), short: v => (v > 0 ? money(v) : '$0'),
  },
  insCause: {
    cat: 'crops', name: 'Main cause of loss', unit: 'the cause behind most of the season’s insurance payouts', kind: 'insurance', worse: null,
    get: (c, k, i) => mainCause(insuranceSeason(c, k, i)),
    bins: () => [{ color: NEUTRAL, test: (v: number) => v < 0, label: 'No payouts' }, ...LOSS_LABEL.map((label, j) => ({ color: LOSS_COLOR[j], label, test: (v: number) => v === j }))],
    format: v => (v < 0 ? 'No payouts' : `Mostly ${LOSS_LABEL[v].toLowerCase()}`), short: v => (v < 0 ? 'None' : LOSS_LABEL[v]),
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
  hotNights: {
    cat: 'weather', name: 'Hot nights', unit: 'nights with a low of 22 °C or warmer, growing season', kind: 'derived', worse: 'high',
    get: (c, k, i) => derived(c, k, i, 'hn'),
    bins: () => zeroBins([5, 10, 20], RAMP.orange.slice(0, 4), String),
    format: v => plural(v, 'hot night'), short: String,
  },
  floweringHeat: {
    cat: 'weather', name: 'Heat at flowering', unit: 'days at 32 °C or hotter in the flowering month', kind: 'derived', worse: 'high',
    get: (c, k, i) => derived(c, k, i, 'fh'),
    bins: () => zeroBins([4, 8, 15], RAMP.red.slice(0, 4), String),
    format: v => `${plural(v, 'day')} ≥ 32 °C at flowering`, short: String,
  },
  drySpell: {
    cat: 'weather', name: 'Longest dry spell', unit: 'days in a row with under 1 mm of rain', kind: 'derived', worse: 'high',
    get: (c, k, i) => derived(c, k, i, 'dry'),
    bins: () => seqBins([10, 15, 21, 30], RAMP.brown, String, true),
    format: v => `${plural(v, 'day')} without rain`, short: String,
  },
  heavyRain: {
    cat: 'weather', name: 'Heavy rain days', unit: 'days with 25 mm of rain or more, growing season', kind: 'derived', worse: 'high',
    get: (c, k, i) => derived(c, k, i, 'hr'),
    bins: () => zeroBins([2, 4, 6], RAMP.blue.slice(0, 4), String),
    format: v => plural(v, 'heavy rain day'), short: String,
  },
  springRain: {
    cat: 'weather', name: 'Spring rain', unit: 'mm in April and May (planting season)', kind: 'freeze', worse: null,
    get: (c, _k, i) => c.fz?.sr[i] ?? null,
    bins: () => seqBins([100, 150, 200, 250], RAMP.blue, String),
    format: v => `${num(v)} mm in Apr–May`, short: v => num(v),
  },
  lastFreeze: {
    cat: 'weather', name: 'Last spring freeze', unit: 'last night at 0 °C or colder before August', kind: 'freeze', worse: 'high',
    get: (c, _k, i) => c.fz?.ls[i] ?? null,
    bins: () => seqBins([91, 105, 121, 135], RAMP.teal, dayOfYear),
    format: dayOfYear, short: dayOfYear,
  },
  firstFreeze: {
    cat: 'weather', name: 'First fall freeze', unit: 'first night at 0 °C or colder from August on', kind: 'freeze', worse: 'low',
    get: (c, _k, i) => c.fz?.ff[i] ?? null,
    bins: () => seqBins([274, 288, 305, 320], RAMP.teal, dayOfYear),
    format: dayOfYear, short: dayOfYear,
  },
  frostFree: {
    cat: 'weather', name: 'Frost-free days', unit: 'days between the last spring and first fall freeze', kind: 'freeze', worse: 'low',
    get: (c, _k, i) => { const f = c.fz; return f && f.ls[i] != null && f.ff[i] != null ? f.ff[i]! - f.ls[i]! : null; },
    bins: () => seqBins([150, 170, 190, 210], RAMP.green, String),
    format: v => plural(v, 'frost-free day'), short: String,
  },
  storms: {
    cat: 'storms', name: 'Damaging storms', unit: 'reported hail, wind, tornado and flood events, growing season', kind: 'storm', worse: 'high',
    get: (c, k, i) => storm(c, k, i).damaging,
    bins: () => stormBins([4, 8, 16]),
    format: v => plural(v, 'damaging storm report'), short: v => num(v, v % 1 ? 1 : 0),
  },
  hail: {
    cat: 'storms', name: 'Hail', unit: 'reported hail events, growing season', kind: 'storm', worse: 'high',
    get: (c, k, i) => storm(c, k, i).byType[0],
    bins: () => stormBins([3, 6, 10]),
    format: v => plural(v, 'hail report'), short: v => num(v, v % 1 ? 1 : 0),
  },
  wind: {
    cat: 'storms', name: 'Damaging wind', unit: 'reported thunderstorm and high-wind events, including derechos', kind: 'storm', worse: 'high',
    get: (c, k, i) => storm(c, k, i).byType[1],
    bins: () => stormBins([3, 6, 10]),
    format: v => plural(v, 'wind report'), short: v => num(v, v % 1 ? 1 : 0),
  },
  tornado: {
    cat: 'storms', name: 'Tornadoes', unit: 'reported tornadoes, growing season', kind: 'storm', worse: 'high',
    get: (c, k, i) => storm(c, k, i).byType[2],
    bins: () => stormBins([2, 4, 6]),
    format: v => plural(v, 'tornado', 'tornadoes'), short: v => num(v, v % 1 ? 1 : 0),
  },
  floods: {
    cat: 'storms', name: 'Floods', unit: 'reported flood and flash-flood events, growing season', kind: 'storm', worse: 'high',
    get: (c, k, i) => storm(c, k, i).byType[3],
    bins: () => stormBins([2, 4, 8]),
    format: v => plural(v, 'flood report'), short: v => num(v, v % 1 ? 1 : 0),
  },
  cropDamage: {
    cat: 'storms', name: 'Crop damage', unit: 'U.S. dollars of crop damage reported to NOAA, growing season', kind: 'storm', worse: 'high',
    get: (c, k, i) => storm(c, k, i).cropDamage,
    bins: () => [{ color: NEUTRAL, test: (v: number) => v <= 0, label: 'None reported' }, ...seqBins([1e4, 1e5, 1e6], RAMP.purple.slice(0, 4), money)],
    format: v => (v > 0 ? `${money(v)} crop damage` : 'No crop damage reported'), short: v => (v > 0 ? money(v) : '$0'),
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

/** Why a county has no value for a layer, in words a user can act on. */
export function whyMissing(c: County, id: MetricId, k: CropKey, i: number): string {
  const m = metric(id), d = c.d[k];
  if (m.kind === 'daily') return id === 'dGdd' || id === 'dHot' ? (k === 'W' ? 'Not yet available for winter wheat' : 'Outside the growing season') : 'No value on this date';
  if (m.kind === 'insurance') return !d ? `No ${CROP_NAME[k]} grown here` : id === 'insPerAcre' ? 'No planted acres reported' : 'No value this season';
  if (m.kind === 'soil') return 'No soil data for this county';
  if (m.kind === 'derived') return 'No weather record for this county';
  if (m.kind === 'freeze') return id === 'springRain' ? 'No weather record' : 'No freeze this year';
  if (m.kind === 'satellite') return c.md ? 'No satellite value this year' : 'No satellite record here';
  if (m.kind === 'irrigation') return c.s === 'IA' ? 'Iowa is rainfed: no irrigation series' : 'NASS published no irrigation split';
  if (!d) return `No ${CROP_NAME[k]} grown here`;
  if (m.kind === 'yield') return d.st[i] === 's' ? 'Planted, no grain harvested' : 'No reported yield';
  return 'No value this season';
}

/** How a layer relates to the selected date: read on that exact day, over the season it falls in, or fixed. */
export const scopeOf = (m: Metric) => (m.kind === 'daily' ? 'On this date' : m.fixed ? 'Fixed' : 'This season or year');
