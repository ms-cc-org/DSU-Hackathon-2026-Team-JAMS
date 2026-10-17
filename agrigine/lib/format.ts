export const MINUS = '−';

export const signed = (v: number, d = 0) => (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(d);
export const pct = (v: number, d = 0) => signed(v, d) + '%';
export const num = (v: number, d = 0) =>
  (v < 0 ? MINUS : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const thousands = (v: number) =>
  v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v));
export const plural = (n: number, word: string, many?: string) => `${num(n)} ${n === 1 ? word : many || word + 's'}`;
export const ordinal = (n: number) => {
  const t = n % 100;
  return n + (t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
};
export const dayOfYear = (d: number) =>
  new Date(Date.UTC(2021, 0, Math.round(d))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const present = <T,>(a: (T | null | undefined)[]) => a.filter((v): v is T => v != null);

/** Round up to 1, 2, 2.5 or 5 times a power of ten, for axis maxima. */
export const niceCeil = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
};
