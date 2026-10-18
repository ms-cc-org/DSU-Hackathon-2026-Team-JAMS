// Shape of public/data/agrigine.json, written by scripts/build_data.py.

export type CropKey = 'C' | 'S' | 'W' | 'G';
export type StateCode = 'CA' | 'DE' | 'IA' | 'NE';
export type Num = number | null;
export type LngLat = [number, number];

/** One crop's seasons, 2000-2025 from the master table plus predicted 2026-2028. `st` holds one status letter per season. */
export interface CropSeries {
  y: Num[]; // yield, bu/ac
  a: Num[]; // yield vs trend, %
  st: string; // r = reported, n = not reported, s = suppressed (planted, no grain harvested), p = predicted
  ap: Num[]; // acres planted
  ah: Num[]; // acres harvested
  pr: Num[]; // season rainfall, mm
  pa: Num[]; // season rainfall vs normal, %
  tv: Num[]; // season mean temperature, C
  ht: Num[]; // days at 35 C or hotter
  gd: Num[]; // growing degree days
  sv: Num[]; // worst drought level, 0 none .. 5 D4
  wk: Num[]; // weeks in D2 or worse
  ds: Num[]; // mean DSCI
}
export type SeriesField = Exclude<keyof CropSeries, 'st'>;

export interface IrrigationSeries {
  sh: Num[]; // irrigated share, 0-1
  yi: Num[]; // irrigated yield
  yn: Num[]; // dryland yield
}

export interface ModisSeries {
  nm: Num[]; // NDVI mean
  nx: Num[]; // NDVI max
  em: Num[]; // EVI mean
  na: Num[]; // NDVI vs normal, %
  pk: Num[]; // peak greenness day of year
}

/** Crop-season weather measures derived from the daily weather (scripts/derive_weather.py). */
export interface SeasonWeather {
  hn: Num[]; // hot nights, low of 22 C or warmer
  fh: Num[]; // days at 32 C or hotter in the flowering month
  dry: Num[]; // longest run of days under 1 mm of rain
  hr: Num[]; // days with 25 mm of rain or more
}

/** Calendar-year freeze dates (day of year) and April-May rain. */
export interface FreezeSeries {
  ls: Num[]; // last spring freeze
  ff: Num[]; // first fall freeze
  sr: Num[]; // spring rain, mm
}

/** One NOAA storm report: days since 2000-01-01, type code (0 hail, 1 wind, 2 tornado, 3 flood, 4 other), magnitude, crop damage in USD. */
export type StormEvent = [number, number, number | null, number];

export interface County {
  f: string; // 5-digit FIPS, always text
  n: string; // name without "County"
  s: StateCode;
  p: LngLat[][]; // outer rings
  c: LngLat; // centroid
  aws: Num; // soil water storage, mm
  dr: Num; // drought-prone soil, %
  nc: Partial<Record<CropKey, Num>>; // NCCPI per crop
  d: Partial<Record<CropKey, CropSeries>>;
  ir?: Partial<Record<CropKey, IrrigationSeries>>;
  md: ModisSeries | null;
  mp?: Num[]; // monthly rainfall, 26 years x 12 months
  mx?: Num[]; // monthly mean daily high, 26 years x 12 months
  wkc?: string | null; // weekly drought, 2 characters per week from weekStart
  sw?: Partial<Record<CropKey, SeasonWeather>>;
  fz?: FreezeSeries;
  ev?: StormEvent[];
  /** Crop insurance payouts by season and cause: [season-year index, crop, cause group, USD]; see lib/insurance.ts */
  ins?: [number, number, number, number][];
  /** Crop insurance payouts by month of loss: [crop, loss-year index, month, USD] */
  insm?: [number, number, number, number][];
  /** Predicted seasons only: the county's average storm season per crop, [hail, wind, tornado, flood, other, crop damage USD] */
  stm?: Partial<Record<CropKey, number[]>>;
}

/** [name, state, county FIPS, longitude, latitude, population] */
export type City = [string, StateCode, string, number, number, number];

export interface Bundle {
  years: number[];
  cities?: City[];
  weekStart: string;
  nWeeks: number;
  counties: County[];
}
