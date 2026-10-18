'use client';
// Loads the static data the explorer needs. There is no backend: the county bundle is a file in public/data
// and the outlines come from the world-atlas and us-atlas packages.
import type { FeatureCollection, MultiLineString } from 'geojson';
import { useEffect, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Bundle, CropKey, Num } from './types';

export interface Outlines {
  land: FeatureCollection;
  worldLines: MultiLineString;
  usStates: FeatureCollection;
  stateLines: MultiLineString;
}

type World = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
type Usa = Topology<{ states: GeometryCollection<{ name: string }>; nation: GeometryCollection }>;

export const DATA_URL = '/data/agrigine.json';

export const FUTURE_URL = '/data/predict/future.json';

interface FutureCounty {
  d: Partial<Record<CropKey, Record<string, Num[]> & { st: string }>>;
  ir?: Partial<Record<CropKey, Record<string, Num[]>>>;
  md?: Record<string, Num[]>;
  mp?: Num[]; mx?: Num[];
  sw?: Partial<Record<CropKey, Record<string, Num[]>>>;
  fz?: Record<string, Num[]>;
  stm?: Partial<Record<CropKey, number[]>>;
  ins: [number, number, number, number][];
  insm: [number, number, number, number][];
  wkc: string;
}
interface Future { years: number[]; nWeeks: number; counties: Record<string, FutureCounty> }

/** Appends the pre-run 2026-2028 predictions to every county's series, so each layer reads them like any other year. */
function mergeFuture(b: Bundle, f: Future): Bundle {
  const n = f.years.length;
  const extend = (target: Record<string, unknown>, add: Record<string, Num[]> | undefined, fields: string[]) => {
    for (const k of fields) (target[k] as Num[]).push(...(add?.[k] ?? Array(n).fill(null)));
  };
  for (const c of b.counties) {
    const p = f.counties[c.f];
    for (const k of Object.keys(c.d) as CropKey[]) {
      const d = c.d[k]!, add = p?.d[k];
      extend(d as unknown as Record<string, unknown>, add, ['y', 'a', 'ap', 'ah', 'pr', 'pa', 'tv', 'ht', 'gd', 'sv', 'wk', 'ds']);
      d.st += add?.st ?? '-'.repeat(n);
    }
    for (const k of Object.keys(c.ir ?? {}) as CropKey[]) extend(c.ir![k] as unknown as Record<string, unknown>, p?.ir?.[k], ['sh', 'yi', 'yn']);
    if (c.md) extend(c.md as unknown as Record<string, unknown>, p?.md, ['nm', 'nx', 'em', 'na', 'pk']);
    if (c.mp) c.mp.push(...(p?.mp ?? Array(12 * n).fill(null)));
    if (c.mx) c.mx.push(...(p?.mx ?? Array(12 * n).fill(null)));
    for (const k of Object.keys(c.sw ?? {}) as CropKey[]) extend(c.sw![k] as unknown as Record<string, unknown>, p?.sw?.[k], ['hn', 'fh', 'dry', 'hr']);
    if (c.fz) extend(c.fz as unknown as Record<string, unknown>, p?.fz, ['ls', 'ff', 'sr']);
    if (p) {
      c.stm = p.stm;
      c.ins = [...(c.ins ?? []), ...p.ins];
      c.insm = [...(c.insm ?? []), ...p.insm];
      if (c.wkc) c.wkc += p.wkc;
    }
  }
  b.years = [...b.years, ...f.years];
  b.nWeeks += f.nWeeks;
  return b;
}

let bundlePromise: Promise<Bundle> | null = null;
/** The data bundle with its 2026-2028 predictions, fetched once per page load and shared by every page. */
export function loadBundle(): Promise<Bundle> {
  const get = <T,>(url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json() as Promise<T>;
  });
  bundlePromise ??= Promise.all([get<Bundle>(DATA_URL), get<Future>(FUTURE_URL).catch(() => null)])
    .then(([b, f]) => (f ? mergeFuture(b, f) : b))
    .catch(e => { bundlePromise = null; throw e; });
  return bundlePromise;
}

async function loadOutlines(): Promise<Outlines> {
  const [w, u] = await Promise.all([import('world-atlas/countries-110m.json'), import('us-atlas/states-10m.json')]);
  const world = w.default as unknown as World;
  const usa = u.default as unknown as Usa;
  return {
    land: feature(world, world.objects.land) as unknown as FeatureCollection,
    worldLines: mesh(world, world.objects.countries),
    usStates: feature(usa, usa.objects.states) as unknown as FeatureCollection,
    stateLines: mesh(usa, usa.objects.states, (a, b) => a !== b),
  };
}

export function useAgData() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadBundle().then(b => live && setBundle(b), e => live && setError(String(e.message || e)));
    // Outlines are optional: without them the counties still draw.
    loadOutlines().then(o => live && setOutlines(o), () => undefined);
    return () => {
      live = false;
    };
  }, []);
  return { bundle, outlines, error };
}
