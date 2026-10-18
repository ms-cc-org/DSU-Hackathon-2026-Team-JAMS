// A report is a saved set of settings: places, crop, years, and an ordered list of blocks. Saving settings rather
// than numbers means anyone can rebuild the same report from the same data. `owner` and `sharedWith` are ready for
// accounts; today reports are saved in this browser only.
import { CROPS } from '../constants';
import type { CropKey, StateCode } from '../types';

export const SCHEMA = 1;
export const FIRST_YEAR = 2000;
export const LAST_YEAR = 2025;
export const MAX_PLACES = 6;
/** One color per place, in fixed order: a validated categorical set (blue, orange, aqua, yellow, magenta, green). */
export const PLACE_COLORS = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300'];

/** 'c:19153' is a county, 's:IA' a state. */
export type PlaceRef = string;

export const BLOCK_TYPES = ['glance', 'compare', 'trend', 'daily', 'drought', 'insurance', 'storms', 'land', 'map', 'notes'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface BlockSpec {
  id: string;
  type: BlockType;
  options: Record<string, unknown>;
}

export interface ReportScope {
  places: PlaceRef[];
  crop: CropKey;
  from: number;
  to: number;
  /** The season the at-a-glance numbers, tables and map describe. */
  year: number;
}

export interface ReportSpec {
  schema: number;
  id: string;
  title: string;
  author: string;
  /** Account that owns the report, once accounts exist. */
  owner: string | null;
  /** Accounts it is shared with, once sharing exists. */
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
  scope: ReportScope;
  blocks: BlockSpec[];
}

// crypto.randomUUID needs a secure context, which a phone on the LAN address isn't.
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export interface Template {
  id: string;
  name: string;
  who: string;
  blurb: string;
  blocks: [BlockType, Record<string, unknown>?][];
}

export const TEMPLATES: Template[] = [
  {
    id: 'season', name: 'Season recap', who: 'For a farm',
    blurb: 'How one season went: yield, rain and soil moisture day by day, drought, storms and insurance payouts.',
    blocks: [['glance'], ['daily', { channel: 'rain30' }], ['daily', { channel: 'soil' }], ['drought'], ['storms'], ['insurance'], ['notes']],
  },
  {
    id: 'drought', name: 'Drought report card', who: 'For a drought program',
    blurb: 'Drought history, losses in drought seasons, soil that holds water, and drought insurance payouts.',
    blocks: [['glance'], ['drought'], ['trend', { metric: 'anom' }], ['land'], ['insurance'], ['map', { metric: 'wk' }]],
  },
  {
    id: 'compare', name: 'Compare places', who: 'For research',
    blurb: 'Places side by side on the layers you pick, a trend over the years, and a map.',
    blocks: [['compare', { metrics: ['anom', 'yield', 'wk', 'rainAnom', 'heat', 'insPerAcre', 'aws'], span: 'year' }], ['trend', { metric: 'yield' }], ['map', { metric: 'anom' }]],
  },
  { id: 'blank', name: 'Blank report', who: 'Start empty', blurb: 'Add your own blocks.', blocks: [] },
];

export function newReport(templateId: string, scope: Partial<ReportScope> = {}, defaults: (t: BlockType) => Record<string, unknown> = () => ({})): ReportSpec {
  const tpl = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0];
  const now = new Date().toISOString();
  return {
    schema: SCHEMA, id: newId(), title: tpl.id === 'blank' ? 'Untitled report' : tpl.name, author: '', owner: null, sharedWith: [],
    createdAt: now, updatedAt: now,
    scope: { places: ['c:19153'], crop: 'C', from: FIRST_YEAR, to: LAST_YEAR, year: 2012, ...scope },
    blocks: tpl.blocks.map(([type, options]) => ({ id: newId(), type, options: { ...defaults(type), ...options } })),
  };
}

const isYear = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= FIRST_YEAR && (v as number) <= LAST_YEAR;
const clampYear = (v: unknown, fallback: number) => (isYear(v) ? v : fallback);

/** Checks a settings file and fills anything missing. Returns an error message when it isn't a report. */
export function parseSpec(raw: unknown, isPlace: (ref: string) => boolean): ReportSpec | string {
  if (!raw || typeof raw !== 'object') return 'This file is not an Agrigine report.';
  const r = raw as Partial<ReportSpec>;
  if (typeof r.schema !== 'number' || !r.scope || !Array.isArray(r.blocks)) return 'This file is not an Agrigine report.';
  if (r.schema > SCHEMA) return 'This report was made with a newer version of Agrigine.';
  const sc = r.scope as Partial<ReportScope>;
  const places = (Array.isArray(sc.places) ? sc.places : []).filter((p): p is string => typeof p === 'string' && isPlace(p)).slice(0, MAX_PLACES);
  const from = clampYear(sc.from, FIRST_YEAR), to = Math.max(from, clampYear(sc.to, LAST_YEAR));
  const now = new Date().toISOString();
  return {
    schema: SCHEMA,
    id: typeof r.id === 'string' ? r.id : newId(),
    title: typeof r.title === 'string' ? r.title.slice(0, 120) : 'Untitled report',
    author: typeof r.author === 'string' ? r.author.slice(0, 80) : '',
    owner: typeof r.owner === 'string' ? r.owner : null,
    sharedWith: Array.isArray(r.sharedWith) ? r.sharedWith.filter(x => typeof x === 'string') : [],
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now,
    scope: { places, crop: CROPS.includes(sc.crop as CropKey) ? (sc.crop as CropKey) : 'C', from, to, year: Math.min(to, Math.max(from, clampYear(sc.year, to))) },
    blocks: r.blocks
      .filter(b => b && typeof b === 'object' && BLOCK_TYPES.includes(b.type))
      .map(b => ({ id: typeof b.id === 'string' ? b.id : newId(), type: b.type, options: b.options && typeof b.options === 'object' ? b.options : {} })),
  };
}

export const stateRef = (code: StateCode): PlaceRef => `s:${code}`;
export const countyRef = (fips: string): PlaceRef => `c:${fips}`;
