import { NEUTRAL } from './colors';

export interface Bin {
  color: string;
  label: string;
  test: (v: number) => boolean;
}

/** Ascending cut points; colors.length must be cuts.length + 1. `whole` labels integer ranges as 4 to 7 instead of 4 to 8. */
export function seqBins(cuts: number[], colors: string[], f: (v: number) => string, whole = false): Bin[] {
  return colors.map((color, j) => ({
    color,
    test: (v: number) => j === cuts.length || v < cuts[j],
    label:
      j === 0
        ? `Under ${f(cuts[0])}`
        : j === cuts.length
          ? `${f(cuts[j - 1])} or more`
          : `${f(cuts[j - 1])} to ${f(whole ? cuts[j] - 1 : cuts[j])}`,
  }));
}

/** A gray "none" bin for exactly zero, then whole-number ranges. */
export function zeroBins(cuts: number[], colors: string[], f: (v: number) => string): Bin[] {
  const bins = seqBins(cuts, colors, f, true);
  bins[0] = { ...bins[0], label: `1 to ${f(cuts[0] - 1)}` };
  return [{ color: NEUTRAL, test: v => v <= 0, label: 'None' }, ...bins];
}

/** Seven bins around zero: three per arm (light to dark) and a gray middle. `cuts` are positive magnitudes. */
export function divBins(cuts: [number, number, number], neg: string[], pos: string[], f: (v: number) => string): Bin[] {
  const [a, b, c] = cuts;
  return [
    { color: neg[2], test: v => v <= -c, label: `${f(-c)} or lower` },
    { color: neg[1], test: v => v <= -b, label: `${f(-c)} to ${f(-b)}` },
    { color: neg[0], test: v => v < -a, label: `${f(-b)} to ${f(-a)}` },
    { color: NEUTRAL, test: v => v <= a, label: `Within ±${f(a).replace(/^\+/, '')}` },
    { color: pos[0], test: v => v < b, label: `${f(a)} to ${f(b)}` },
    { color: pos[1], test: v => v < c, label: `${f(b)} to ${f(c)}` },
    { color: pos[2], test: () => true, label: `${f(c)} or higher` },
  ];
}

export const binOf = (bins: Bin[], v: number) => bins.find(b => b.test(v)) ?? bins[bins.length - 1];
