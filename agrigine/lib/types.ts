// Shape of public/data/agrigine.json, written by scripts/build_data.py.

export type CropKey = 'C' | 'S' | 'W' | 'G';
export type StateCode = 'CA' | 'DE' | 'IA' | 'NE';
export type Num = number | null;
export type LngLat = [number, number];

/** One crop's 26 seasons (2000-2025) from the master table. `st` holds one status letter per season. */
export interface CropSeries {
  y: Num[]; // yield, bu/ac
  a: Num[]; // yield vs trend, %
  st: string; // r = reported, n = not reported, s = suppressed (planted, no grain harvested)
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
}

export interface Bundle {
  years: number[];
  weekStart: string;
  nWeeks: number;
  counties: County[];
}
