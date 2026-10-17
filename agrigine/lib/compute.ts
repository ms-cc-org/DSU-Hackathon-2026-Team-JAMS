import { binOf, type Bin } from './bins';
import { height, metric, type HeightId, type MetricId } from './metrics';
import type { County, CropKey, LngLat, StateCode } from './types';

export type BinKey = number | 'nodata';
export type CountyStatus = 'on' | 'nodata' | 'hidden' | 'out';

export interface CountyStyle {
  status: CountyStatus;
  value: number | null;
  bin: number;
  color: string | null;
  /** 0-1 share of the height layer's maximum. */
  height: number;
}

export interface Ring {
  f: string;
  ring: LngLat[];
}

export interface MapStyle {
  byFips: Map<string, CountyStyle>;
  active: Ring[];
  ghost: Ring[];
  bins: Bin[];
  counts: number[];
  noData: number;
  shown: number;
  total: number;
}

export interface StyleInput {
  metric: MetricId;
  height: HeightId;
  crop: CropKey;
  yearIndex: number;
  states: StateCode[];
  reportedOnly: boolean;
  hidden: BinKey[];
}

export const ringsOf = (counties: County[]): Ring[] => counties.flatMap(c => c.p.map(ring => ({ f: c.f, ring })));

/**
 * Colors, heights and key counts for one view of the map. Counties outside the state or yield filters
 * are "out"; counties in a key band the user switched off are "hidden". Both draw as a gray ghost.
 */
export function computeStyle(counties: County[], rings: Ring[], s: StyleInput): MapStyle {
  const m = metric(s.metric), h = height(s.height);
  const k = s.crop, i = s.yearIndex;
  const bins = m.bins(k), counts = bins.map(() => 0);
  const hidden = new Set<BinKey>(s.hidden), states = new Set(s.states);
  const byFips = new Map<string, CountyStyle>();
  let noData = 0, shown = 0, total = 0;

  for (const c of counties) {
    let status: CountyStatus, value: number | null = null, bin = -1, hv = 0;
    const yieldOk = !s.reportedOnly || c.d[k]?.st[i] === 'r';
    if (!states.has(c.s) || !yieldOk) status = 'out';
    else {
      total++;
      value = m.get(c, k, i);
      if (value == null) {
        noData++;
        status = hidden.has('nodata') ? 'hidden' : 'nodata';
      } else {
        bin = bins.indexOf(binOf(bins, value));
        counts[bin]++;
        status = hidden.has(bin) ? 'hidden' : 'on';
      }
      if (status === 'on' && h.get && h.max) {
        const x = h.get(c, k, i);
        hv = x == null ? 0 : Math.max(0, Math.min(1, x / h.max(k)));
      }
      if (status !== 'hidden') shown++;
    }
    byFips.set(c.f, { status, value, bin, color: bin >= 0 ? bins[bin].color : null, height: hv });
  }

  const active: Ring[] = [], ghost: Ring[] = [];
  for (const r of rings) {
    const st = byFips.get(r.f)!.status;
    (st === 'on' || st === 'nodata' ? active : ghost).push(r);
  }
  return { byFips, active, ghost, bins, counts, noData, shown, total };
}
