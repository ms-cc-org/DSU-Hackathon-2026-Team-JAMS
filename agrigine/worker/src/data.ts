// Reads Agrigine's public data files from the Pages site. Cloudflare's edge caches each file, and parsed JSON stays
// in memory for as long as this Worker instance lives, so most requests read nothing over the network.

export interface Env {
  DATA_BASE_URL: string;
}

export type CropKey = 'C' | 'S' | 'W' | 'G';

export interface IndexCounty { f: string; n: string; s: string; i: number; c: [number, number]; crops: CropKey[] }
export type City = [string, string, string, number, number, number]; // name, state, county fips, lon, lat, population
export interface Index {
  years: number[];
  weekStart: string;
  daily: { channels: string[]; scale: number[]; missing: number; counties: number; normals: { channels: string[]; scale: number[]; days: number } };
  counties: IndexCounty[];
  cities: City[];
}

export interface CropSeries { y: (number | null)[]; a: (number | null)[]; st: string; ap: (number | null)[]; ah: (number | null)[]; pr: (number | null)[]; pa: (number | null)[]; tv: (number | null)[]; ht: (number | null)[]; gd: (number | null)[]; sv: (number | null)[]; wk: (number | null)[]; ds: (number | null)[] }
export interface County {
  f: string; n: string; s: string; c: [number, number];
  aws: number | null; dr: number | null; nc: Partial<Record<CropKey, number | null>>;
  d: Partial<Record<CropKey, CropSeries>>;
  ir?: Partial<Record<CropKey, { sh: (number | null)[]; yi: (number | null)[]; yn: (number | null)[] }>>;
  md: { nm: (number | null)[]; nx: (number | null)[]; na: (number | null)[]; pk: (number | null)[] } | null;
  wkc?: string;
  sw?: Partial<Record<CropKey, { hn: (number | null)[]; fh: (number | null)[]; dry: (number | null)[]; hr: (number | null)[] }>>;
  fz?: { ls: (number | null)[]; ff: (number | null)[]; sr: (number | null)[] };
  ev?: [number, number, number | null, number][];
  ins?: [number, number, number, number][];
}
export type SeasonRows = Record<string, { n: string; y: (number | null)[]; a: (number | null)[]; st: string; ap: (number | null)[]; sv: (number | null)[]; wk: (number | null)[]; pa: (number | null)[]; ht: (number | null)[]; ins: number[] }>;

const memory = new Map<string, Promise<unknown>>();

async function get(env: Env, path: string, kind: 'json' | 'bytes') {
  const res = await fetch(`${env.DATA_BASE_URL}/data/${path}`, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw new Error(`Data file ${path} returned ${res.status}`);
  return kind === 'json' ? res.json() : res.arrayBuffer();
}

/** A data file, fetched once per Worker instance. Daily files are big, so only the last few are kept. */
function cached<T>(env: Env, path: string, kind: 'json' | 'bytes'): Promise<T> {
  let hit = memory.get(path);
  if (!hit) {
    hit = get(env, path, kind).catch(e => { memory.delete(path); throw e; });
    memory.set(path, hit);
    const daily = [...memory.keys()].filter(k => k.startsWith('daily/'));
    if (daily.length > 3) memory.delete(daily[0]);
  }
  return hit as Promise<T>;
}

export const loadIndex = (env: Env) => cached<Index>(env, 'api/index.json', 'json');
export const loadCounty = (env: Env, fips: string) => cached<County>(env, `api/county/${fips}.json`, 'json');
export const loadSeason = (env: Env, state: string, k: CropKey) => cached<SeasonRows>(env, `api/season/${state}-${k}.json`, 'json');
export const loadDailyYear = (env: Env, year: number) => cached<ArrayBuffer>(env, `daily/${year}.bin`, 'bytes');
export const loadNormals = (env: Env) => cached<ArrayBuffer>(env, 'daily/normals.bin', 'bytes');
