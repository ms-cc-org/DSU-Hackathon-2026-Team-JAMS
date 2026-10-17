// USDA RMA crop insurance payouts (Cause of Loss), grouped by cause. Built by scripts/rma_pull.py.
import type { County, CropKey } from './types';

export const LOSS_GROUPS = ['drought', 'heat', 'wet', 'hail', 'wind', 'freeze', 'price', 'other'] as const;
export const LOSS_LABEL = ['Drought', 'Heat', 'Too wet', 'Hail', 'Wind', 'Freeze', 'Price decline', 'Other'];
/** One color per cause, always shown with its label. */
export const LOSS_COLOR = ['#D98A00', '#E34948', '#2A78D6', '#7B4FD1', '#1BAF7A', '#8FA8BF', '#9AA39C', '#C9BFA6'];
const CROP_INDEX: Record<CropKey, number> = { C: 0, S: 1, W: 2, G: 3 };

export interface InsuranceSeason {
  total: number;
  byGroup: number[];
}

const cache = new WeakMap<County, Map<string, InsuranceSeason>>();

/** Payouts for one crop's season in a county. Null when the county doesn't grow the crop. */
export function insuranceSeason(c: County, k: CropKey, i: number): InsuranceSeason | null {
  if (!c.d[k]) return null;
  let byCounty = cache.get(c);
  if (!byCounty) cache.set(c, (byCounty = new Map()));
  const key = `${k}${i}`;
  const hit = byCounty.get(key);
  if (hit) return hit;
  const s: InsuranceSeason = { total: 0, byGroup: LOSS_GROUPS.map(() => 0) };
  for (const r of c.ins ?? []) {
    if (r[0] !== i || r[1] !== CROP_INDEX[k]) continue;
    s.total += r[3];
    s.byGroup[r[2]] += r[3];
  }
  byCounty.set(key, s);
  return s;
}

/** The cause behind most of a season's payouts, or -1 when nothing was paid. */
export function mainCause(s: InsuranceSeason | null) {
  if (!s || s.total <= 0) return s ? -1 : null;
  return s.byGroup.indexOf(Math.max(...s.byGroup));
}

/** Payouts for losses that happened in a given calendar month, for any crop year of the crop. */
export function insuranceMonth(c: County, k: CropKey, firstYear: number, year: number, month: number) {
  if (!c.d[k]) return null;
  let sum = 0;
  for (const r of c.insm ?? []) {
    if (r[0] === CROP_INDEX[k] && r[2] === month && firstYear + r[1] === year) sum += r[3];
  }
  return sum;
}
