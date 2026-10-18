// Report data as one long CSV table: one row per place, period and variable, so it loads straight into R, Python or Excel.
export interface Row {
  section: string;
  place: string;
  place_id: string;
  period: string;
  variable: string;
  value: number | string | null;
  unit: string;
  /** observed, predicted, or includes predicted; worked out from the period's years when left out. */
  status?: string;
}

const COLUMNS: (keyof Row)[] = ['section', 'place', 'place_id', 'period', 'variable', 'value', 'unit', 'status'];

/** Seasons after this one are predictions, not records (lib/daily.ts LAST_OBSERVED_YEAR). */
const LAST_RECORD_YEAR = 2025;
const statusOf = (period: string) => {
  const years = (period.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number), future = years.filter(y => y > LAST_RECORD_YEAR).length;
  return !future ? 'observed' : future === years.length ? 'predicted' : 'includes predicted';
};

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: Row[]) =>
  [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => cell(c === 'status' ? (r.status ?? statusOf(r.period)) : r[c])).join(','))].join('\n');

export function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report';
