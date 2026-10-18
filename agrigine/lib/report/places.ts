// Turns place refs into counties and states, and reads one value for a place. A state's value combines its
// counties: totals for money and counts, the worst for drought level, and the county median for everything else.
import { STATES, STATE_CODES } from '../constants';
import { median, present } from '../format';
import type { MetricId } from '../metrics';
import type { Bundle, County, StateCode } from '../types';
import { MAX_PLACES, PLACE_COLORS, type PlaceRef } from './spec';

export interface Place {
  ref: PlaceRef;
  label: string;
  short: string;
  color: string;
  state: StateCode;
  /** The county itself, or every county in the state. */
  counties: County[];
  isState: boolean;
}

export type Combine = 'median' | 'sum' | 'max';

export const COMBINE: Partial<Record<MetricId, Combine | 'none'>> = {
  insTotal: 'sum', insDrought: 'sum', prod: 'sum', acres: 'sum',
  storms: 'sum', hail: 'sum', wind: 'sum', tornado: 'sum', floods: 'sum', cropDamage: 'sum',
  sev: 'max', insCause: 'none',
};

export function resolvePlaces(refs: PlaceRef[], bundle: Bundle, byFips: Map<string, County>): Place[] {
  const out: Place[] = [];
  for (const ref of refs.slice(0, MAX_PLACES)) {
    const color = PLACE_COLORS[out.length];
    if (ref.startsWith('s:')) {
      const code = ref.slice(2) as StateCode;
      if (!STATES[code]) continue;
      out.push({ ref, label: STATES[code], short: STATES[code], color, state: code, counties: bundle.counties.filter(c => c.s === code), isState: true });
    } else {
      const c = byFips.get(ref.slice(2));
      if (!c) continue;
      out.push({ ref, label: `${c.n} County, ${STATES[c.s]}`, short: `${c.n} Co., ${c.s}`, color, state: c.s, counties: [c], isState: false });
    }
  }
  return out;
}

/** One value for a place: the county's own, or its counties combined. */
export function placeValue(p: Place, get: (c: County) => number | null, how: Combine | 'none' = 'median'): number | null {
  if (!p.isState) return get(p.counties[0]);
  if (how === 'none') return null;
  const vals = present(p.counties.map(get));
  if (!vals.length) return null;
  return how === 'sum' ? vals.reduce((a, b) => a + b, 0) : how === 'max' ? Math.max(...vals) : median(vals);
}

/** Search options for the place picker: every state, then every county. */
export function placeOptions(bundle: Bundle) {
  return [
    ...STATE_CODES.map(code => ({ ref: `s:${code}`, label: `${STATES[code]} (whole state)` })),
    ...bundle.counties.map(c => ({ ref: `c:${c.f}`, label: `${c.n} County, ${STATES[c.s]}` })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
}
