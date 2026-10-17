'use client';
// Dates and day-by-day weather. A "day" is a whole number of days since 2000-01-01 (UTC).
// Each year's weather is a small binary file (scripts/build_daily.py) fetched when the dial reaches that year.
import { useEffect, useState } from 'react';
import { seasonDays } from './storms';
import type { County, CropKey } from './types';

export const DAY_MS = 864e5;
const EPOCH = Date.UTC(2000, 0, 1);
export const FIRST_YEAR = 2000;
export const LAST_YEAR = 2025;

export const dayOf = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS);
export const dateOf = (day: number) => new Date(EPOCH + day * DAY_MS);
export const FIRST_DAY = dayOf(FIRST_YEAR, 1, 1);
export const LAST_DAY = dayOf(LAST_YEAR, 12, 31);
export const yearOf = (day: number) => dateOf(day).getUTCFullYear();
export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysIn = (y: number) => (isLeap(y) ? 366 : 365);
/** Position of the day inside its calendar year, 0-based. */
export const dayIndex = (day: number) => day - dayOf(yearOf(day), 1, 1);
/** Position on a leap-year calendar (0-365), used for normals so Feb 29 has a slot. */
export const calendarSlot = (day: number) => {
  const d = dateOf(day);
  return dayOf(2000, d.getUTCMonth() + 1, d.getUTCDate());
};
export const clampDay = (day: number) => Math.max(FIRST_DAY, Math.min(LAST_DAY, Math.round(day)));

export const formatDay = (day: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  dateOf(day).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
export const isoDay = (day: number) => dateOf(day).toISOString().slice(0, 10);
export const parseIsoDay = (s: string | null) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? clampDay(dayOf(+m[1], +m[2], +m[3])) : null;
};

/** The harvest year whose growing season a date belongs to. Winter wheat planted in the fall counts toward next year. */
export function seasonYearOf(day: number, k: CropKey) {
  const d = dateOf(day), y = d.getUTCFullYear();
  return Math.max(FIRST_YEAR, Math.min(LAST_YEAR, k === 'W' && d.getUTCMonth() + 1 >= 9 ? y + 1 : y));
}

/** The same calendar date in another season, used when a season chart is clicked. */
export function sameDateInSeason(day: number, seasonYear: number, k: CropKey) {
  const d = dateOf(day), m = d.getUTCMonth() + 1, y = k === 'W' && m >= 9 ? seasonYear - 1 : seasonYear;
  return clampDay(dayOf(y, m, Math.min(d.getUTCDate(), m === 2 && !isLeap(y) ? 28 : 31)));
}

/** "Day 75 of 153 of the corn season", or where the date sits outside it. */
export function seasonProgress(day: number, k: CropKey) {
  const [from, to] = seasonDays(k, seasonYearOf(day, k));
  if (day < from) return { inSeason: false, label: `Before planting; the season starts ${formatDay(from, { month: 'short', day: 'numeric' })}` };
  if (day > to) return { inSeason: false, label: 'After harvest; the season has ended' };
  return { inSeason: true, label: `Day ${day - from + 1} of ${to - from + 1} of the season` };
}

// ---------- daily weather files ----------

// The first six come from the hackathon's daily weather; the rest from NASA POWER (scripts/power_pull.py).
export const CH = { tmax: 0, tmin: 1, pcpn: 2, rain7: 3, rain30: 4, dry: 5, vpd: 6, et0: 7, srad: 8, wind: 9, rh: 10, wb30: 11, soil: 12 } as const;
export type Channel = keyof typeof CH;
const SCALE = [10, 10, 10, 10, 1, 1, 100, 10, 1, 10, 1, 1, 1];
const CHANNELS = SCALE.length;
const NORMAL = { rain30: 0, tmax: 1, vpd: 2, wb30: 3, soil: 4 } as const;
const NORMAL_SCALE = [1, 10, 100, 1, 1];
const MISSING = -32768;

const loaded = new Map<number, Int16Array>();
const pending = new Map<number, Promise<void>>();
let normals: Int16Array | null = null;
let normalsPending: Promise<void> | null = null;

function load(year: number) {
  if (year < FIRST_YEAR || year > LAST_YEAR || loaded.has(year)) return Promise.resolve();
  if (!pending.has(year)) {
    pending.set(year, fetch(`/data/daily/${year}.bin`)
      .then(r => { if (!r.ok) throw new Error(`daily ${year}: ${r.status}`); return r.arrayBuffer(); })
      .then(b => { loaded.set(year, new Int16Array(b)); })
      .catch(() => { pending.delete(year); }));
  }
  return pending.get(year)!;
}

function loadNormals() {
  normalsPending ??= fetch('/data/daily/normals.bin')
    .then(r => r.arrayBuffer())
    .then(b => { normals = new Int16Array(b); })
    .catch(() => { normalsPending = null; });
  return normalsPending;
}

/** The selected year's daily weather (null while it loads), with the years either side fetched ahead. */
export function useDaily(year: number) {
  const [, rerender] = useState(0);
  useEffect(() => {
    let live = true;
    const bump = () => live && rerender(n => n + 1);
    load(year).then(bump);
    loadNormals().then(bump);
    load(year - 1);
    load(year + 1);
    return () => { live = false; };
  }, [year]);
  return { data: loaded.get(year) ?? null, normals };
}

/** Everything a day-by-day layer needs to read one county on one date. */
export interface DayContext {
  day: number;
  index: number; // position in the year file
  slot: number; // position in normals
  days: number; // days in the year file
  counties: number;
  order: Map<string, number>;
  data: Int16Array | null;
  normals: Int16Array | null;
}

export function dayContext(day: number, order: Map<string, number>, data: Int16Array | null, normalsData: Int16Array | null): DayContext {
  return { day, index: dayIndex(day), slot: calendarSlot(day), days: daysIn(yearOf(day)), counties: order.size, order, data, normals: normalsData };
}

/** A county's value for one channel on the context's day, or another day of the same year. */
export function dayValue(t: DayContext | undefined, ch: Channel, c: County, index = t?.index ?? 0) {
  if (!t?.data) return null;
  const ci = t.order.get(c.f);
  if (ci == null) return null;
  const at = (CH[ch] * t.counties + ci) * t.days + index;
  // Files built before gridMET was added hold only the first six channels.
  if (t.data.length < CHANNELS * t.counties * t.days && CH[ch] >= 6) return null;
  const v = t.data[at];
  return v === MISSING || v === undefined ? null : v / SCALE[CH[ch]];
}

export function normalValue(t: DayContext | undefined, ch: keyof typeof NORMAL, c: County, slot = t?.slot ?? 0) {
  if (!t?.normals) return null;
  const ci = t.order.get(c.f);
  if (ci == null) return null;
  const v = t.normals[(NORMAL[ch] * t.counties + ci) * 366 + slot];
  return v === MISSING || v === undefined ? null : v / NORMAL_SCALE[NORMAL[ch]];
}

const GDD_LIMITS: Record<CropKey, [number, number]> = { C: [10, 30], S: [10, 30], G: [10, 38], W: [0, 26] };

/** Sums a daily measure from the start of the crop's season to the context's day. Null outside the season or for winter wheat, whose season starts the year before. */
export function seasonToDate(t: DayContext | undefined, c: County, k: CropKey, measure: 'gdd' | 'hot') {
  if (!t?.data || k === 'W') return null;
  const [from, to] = seasonDays(k, seasonYearOf(t.day, k));
  if (t.day < from) return null;
  const start = t.index - (t.day - from), end = Math.min(t.index, t.index - (t.day - to));
  const [base, cap] = GDD_LIMITS[k];
  let sum = 0;
  for (let i = start; i <= end; i++) {
    const hi = dayValue(t, 'tmax', c, i), lo = dayValue(t, 'tmin', c, i);
    if (hi == null || lo == null) continue;
    sum += measure === 'hot' ? (hi >= 35 ? 1 : 0) : Math.max(0, (Math.min(hi, cap) + Math.max(lo, base)) / 2 - base);
  }
  return Math.round(sum);
}

// ---------- weekly drought, looked up by day ----------

const WEEK0 = dayOf(2000, 1, 4); // first Drought Monitor map
const B62 = '0123456789abcdefghijklmnopqrstuvwxyz' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The Drought Monitor map in effect on a day: worst category (0 none .. 5 D4) and DSCI. */
export function droughtOn(c: County, day: number) {
  const w = Math.floor((day - WEEK0) / 7);
  if (!c.wkc || w < 0 || 2 * w + 1 >= c.wkc.length) return null;
  return { cat: Number(c.wkc[2 * w]), dsci: Math.round((B62.indexOf(c.wkc[2 * w + 1]) / 61) * 500) };
}
