// Reads a farmer's CSV of field records and checks each row before anything is saved.
import { STATES } from './constants';
import type { FarmCrop, FarmRecord } from './account';
import type { County } from './types';

export const MAX_ROWS = 5000;
export const TEMPLATE = [
  'field,county,crop,year,yield_bu_per_acre,acres,planted_on,harvested_on,irrigated,notes',
  'North 80,"Polk County, Iowa",corn,2012,138,80,2012-04-28,2012-10-02,no,Drought cut yield in July',
  'River bottom,19153,soybeans,2013,52,40,2013-05-20,2013-10-10,no,',
].join('\n');

/** The columns, and the other header names people use for them. */
const HEADERS: Record<keyof Omit<FarmRecord, 'id' | 'upload_id' | 'fips'> | 'county', string[]> = {
  field: ['field', 'field_name', 'name'],
  county: ['county', 'fips', 'county_fips'],
  crop: ['crop', 'commodity'],
  year: ['year', 'crop_year', 'season'],
  yield_bu_per_acre: ['yield_bu_per_acre', 'yield', 'yield_bu_ac', 'bu_per_acre', 'bu/ac'],
  acres: ['acres', 'planted_acres', 'harvested_acres'],
  planted_on: ['planted_on', 'planting_date', 'planted'],
  harvested_on: ['harvested_on', 'harvest_date', 'harvested'],
  irrigated: ['irrigated', 'irrigation'],
  notes: ['notes', 'note', 'comments'],
};

const CROP_WORDS: Record<string, FarmCrop> = {
  corn: 'corn', 'corn for grain': 'corn', maize: 'corn',
  soybeans: 'soybeans', soybean: 'soybeans', soy: 'soybeans', beans: 'soybeans',
  wheat: 'winter_wheat', 'winter wheat': 'winter_wheat', winter_wheat: 'winter_wheat',
  sorghum: 'sorghum', 'grain sorghum': 'sorghum', milo: 'sorghum',
};

/** Splits CSV text into rows of cells, handling quoted cells with commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let j = 0; j < text.length; j++) {
    const ch = text[j];
    if (quoted) {
      if (ch === '"' && text[j + 1] === '"') { cell += '"'; j++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[j + 1] === '\n') j++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function dateOf(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) [y, m, d] = [+iso[1], +iso[2], +iso[3]];
  else if (us) [y, m, d] = [+us[3], +us[1], +us[2]];
  else return undefined;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : undefined;
}

function countyOf(v: string, counties: County[]): string | 'ambiguous' | undefined {
  const s = v.trim();
  if (/^\d{4,5}$/.test(s)) {
    const f = s.padStart(5, '0');
    return counties.some(c => c.f === f) ? f : undefined;
  }
  // "Polk County, Iowa", "Polk County, IA", "Polk, IA"
  const [name, state = ''] = s.split(',').map(x => norm(x));
  const n = name.replace(/ county$/, '');
  const st = Object.entries(STATES).find(([code, full]) => state === code.toLowerCase() || state === full.toLowerCase())?.[0];
  const hits = counties.filter(c => c.n.toLowerCase() === n && (!st || c.s === st));
  return hits.length === 1 ? hits[0].f : hits.length > 1 ? 'ambiguous' : undefined;
}

export interface Checked { records: FarmRecord[]; problems: { row: number; message: string }[]; total: number }

/** Turns CSV text into records Agrigine can store, with a plain message for every row it can't use. */
export function checkCsv(text: string, counties: County[]): Checked | string {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return 'The file needs a header row and at least one record. Download the template to see the layout.';
  const header = rows[0].map(norm);
  const col = Object.fromEntries(Object.entries(HEADERS).map(([key, names]) => [key, header.findIndex(h => names.includes(h))])) as Record<keyof typeof HEADERS, number>;
  const missing = (['field', 'county', 'crop', 'year'] as const).filter(k => col[k] < 0);
  if (missing.length) return `The header row is missing: ${missing.join(', ')}. Download the template to see the layout.`;
  const body = rows.slice(1);
  if (body.length > MAX_ROWS) return `That file has ${body.length.toLocaleString()} records; one upload can hold ${MAX_ROWS.toLocaleString()}. Split it into smaller files.`;

  const records: FarmRecord[] = [], problems: Checked['problems'] = [];
  body.forEach((r, j) => {
    const get = (k: keyof typeof HEADERS) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '');
    const issues: string[] = [];
    const field = get('field').slice(0, 80);
    if (!field) issues.push('field name is empty');
    const fips = countyOf(get('county'), counties);
    if (fips === 'ambiguous') issues.push(`county "${get('county')}" is in more than one state; add the state, e.g. "${get('county')} County, Iowa"`);
    else if (!fips) issues.push(`county "${get('county')}" isn't a county in California, Delaware, Iowa or Nebraska (use "Polk County, Iowa" or a FIPS code)`);
    const crop = CROP_WORDS[norm(get('crop'))];
    if (!crop) issues.push(`crop "${get('crop')}" should be corn, soybeans, winter wheat or sorghum`);
    const year = Number(get('year'));
    if (!Number.isInteger(year) || year < 1980 || year > 2100) issues.push(`year "${get('year')}" isn't a year`);
    const num = (k: 'yield_bu_per_acre' | 'acres', max: number) => {
      const s = get(k).replace(/,/g, '');
      if (!s) return null;
      const v = Number(s);
      if (!Number.isFinite(v) || v < 0 || v >= max) { issues.push(`${k.replace(/_/g, ' ')} "${get(k)}" isn't a number from 0 to ${max.toLocaleString()}`); return null; }
      return v;
    };
    const yieldV = num('yield_bu_per_acre', 1000), acres = num('acres', 1000000);
    const planted = dateOf(get('planted_on')), harvested = dateOf(get('harvested_on'));
    if (planted === undefined) issues.push(`planted_on "${get('planted_on')}" should look like 2012-04-28`);
    if (harvested === undefined) issues.push(`harvested_on "${get('harvested_on')}" should look like 2012-10-02`);
    const irr = norm(get('irrigated'));
    const irrigated = !irr ? null : ['yes', 'y', 'true', '1', 'irrigated'].includes(irr) ? true : ['no', 'n', 'false', '0', 'dryland'].includes(irr) ? false : undefined;
    if (irrigated === undefined) issues.push(`irrigated "${get('irrigated')}" should be yes or no`);
    if (issues.length) { problems.push({ row: j + 2, message: issues.join('; ') }); return; }
    records.push({
      field, fips: fips!, crop: crop!, year, yield_bu_per_acre: yieldV, acres, planted_on: planted ?? null, harvested_on: harvested ?? null,
      irrigated: irrigated ?? null, notes: get('notes').slice(0, 1000) || null,
    });
  });
  return { records, problems, total: body.length };
}

export const CROP_KEY: Record<FarmCrop, 'C' | 'S' | 'W' | 'G'> = { corn: 'C', soybeans: 'S', winter_wheat: 'W', sorghum: 'G' };
export const CROP_LABEL: Record<FarmCrop, string> = { corn: 'Corn', soybeans: 'Soybeans', winter_wheat: 'Winter wheat', sorghum: 'Sorghum' };

/** Records back out as CSV, in the template's layout, so people can take their data with them. */
export function recordsToCsv(records: FarmRecord[]) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [TEMPLATE.split('\n')[0], ...records.map(r => [r.field, r.fips, r.crop, r.year, r.yield_bu_per_acre, r.acres, r.planted_on, r.harvested_on, r.irrigated, r.notes].map(cell).join(','))].join('\n');
}
