// NOAA storm reports grouped into crop seasons. Counts are reported events, so a zero means none were reported.
import type { County, CropKey, StormEvent } from './types';

export const STORM_TYPES = ['Hail', 'Damaging wind', 'Tornado', 'Flood', 'Other'] as const;
/** Hail, wind, tornado and flood: the types that hurt crops. */
export const DAMAGING = [0, 1, 2, 3];

const DAY0 = Date.UTC(2000, 0, 1);
const DAY = 864e5;
// [start month, start day, end month, end day, starts the year before harvest]
const WINDOWS: Record<CropKey, [number, number, number, number, boolean]> = {
  C: [5, 1, 9, 30, false],
  S: [5, 1, 10, 31, false],
  G: [6, 1, 10, 31, false],
  W: [9, 1, 6, 30, true],
};

/** First and last day (days since 2000-01-01) of a crop's growing season in a harvest year. */
export function seasonDays(k: CropKey, year: number): [number, number] {
  const [sm, sd, em, ed, before] = WINDOWS[k];
  return [(Date.UTC(before ? year - 1 : year, sm - 1, sd) - DAY0) / DAY, (Date.UTC(year, em - 1, ed) - DAY0) / DAY];
}

export const eventDate = (e: StormEvent) => new Date(DAY0 + e[0] * DAY);

export interface StormSeason {
  byType: number[];
  damaging: number;
  cropDamage: number;
}

const cache = new WeakMap<County, Map<string, StormSeason>>();

/** Reported storms in a county during one crop season. Counties with no reports get zeros, not blanks. */
export function stormSeason(c: County, k: CropKey, year: number): StormSeason {
  let byCounty = cache.get(c);
  if (!byCounty) cache.set(c, (byCounty = new Map()));
  const key = `${k}${year}`;
  const hit = byCounty.get(key);
  if (hit) return hit;
  const [from, to] = seasonDays(k, year);
  const s: StormSeason = { byType: [0, 0, 0, 0, 0], damaging: 0, cropDamage: 0 };
  for (const e of c.ev ?? []) {
    if (e[0] < from || e[0] > to) continue;
    s.byType[e[1]]++;
    if (DAMAGING.includes(e[1])) s.damaging++;
    s.cropDamage += e[3];
  }
  byCounty.set(key, s);
  return s;
}

/** The individual reports in a crop season, oldest first. */
export function seasonEvents(c: County, k: CropKey, year: number): StormEvent[] {
  const [from, to] = seasonDays(k, year);
  return (c.ev ?? []).filter(e => e[0] >= from && e[0] <= to);
}

export const money = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`;

/** Hail is reported in inches; wind in knots. */
export const magnitude = (e: StormEvent) => (e[2] == null ? '' : e[1] === 0 ? `${e[2]} in hail` : e[1] === 1 ? `${Math.round(e[2])} kt` : String(e[2]));
