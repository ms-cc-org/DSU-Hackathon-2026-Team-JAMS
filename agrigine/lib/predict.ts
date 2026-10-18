'use client';
// Day-by-day predictions from notebooks/Agrigine_Daily_Predictions.ipynb (2000-2025, each year by a model that never
// saw it) and notebooks/Agrigine_2026_2028.ipynb (2026-2028, pre-run from Dec 31, 2025). Same layout as the daily
// weather files: predict/<year>.bin is int16 [channel][county][day of year]; static.bin is [channel][county][slot].
import { useEffect, useState } from 'react';
import { FIRST_YEAR, LAST_YEAR, dateOf, seasonYearOf, type DayContext } from './daily';
import type { County, CropKey } from './types';

export interface PredictIndex {
  years: number[];
  channels: string[];
  scale: number[];
  missing: number;
  static: { channels: string[]; scale: number[]; days: number };
  /** Each crop's expected (trend) yield for every county and season, to turn % vs trend into bushels per acre. */
  trend: Record<CropKey, (number | null)[][]>;
  scores: {
    crops_end_of_season_skill: Record<CropKey, number>;
    august_1_catch: Record<string, { model: number; drought_list: number }>;
    frost_late_share: number;
    drought: { Horizon: string; Days: string; 'Skill vs usual rate': string; AUC: number }[];
    tested_on: [number, number];
  };
}

export interface PredictData { year: Int16Array | null; statics: Int16Array | null; index: PredictIndex | null }

const years = new Map<number, Int16Array>();
const pending = new Map<number, Promise<void>>();
let statics: Int16Array | null = null;
let index: PredictIndex | null = null;
let shared: Promise<void> | null = null;

function loadShared() {
  shared ??= Promise.all([
    fetch('/data/predict/index.json').then(r => r.json()).then(j => { index = j; }),
    fetch('/data/predict/static.bin').then(r => r.arrayBuffer()).then(b => { statics = new Int16Array(b); }),
  ]).then(() => undefined).catch(() => { shared = null; });
  return shared;
}

function loadYear(year: number) {
  if (year < FIRST_YEAR || year > LAST_YEAR || years.has(year)) return Promise.resolve();
  if (!pending.has(year)) {
    pending.set(year, fetch(`/data/predict/${year}.bin`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then(b => { years.set(year, new Int16Array(b)); })
      .catch(() => { pending.delete(year); }));
  }
  return pending.get(year)!;
}

/** The selected year's predictions (null while they load), with the shared index and calendar file. */
export function usePredict(year: number): PredictData {
  const [, rerender] = useState(0);
  useEffect(() => {
    let live = true;
    const bump = () => live && rerender(n => n + 1);
    loadShared().then(bump);
    loadYear(year).then(bump);
    loadYear(year + 1);
    return () => { live = false; };
  }, [year]);
  return { year: years.get(year) ?? null, statics, index };
}

const read = (arr: Int16Array | null, at: number, scale: number, missing: number) => {
  if (!arr) return null;
  const v = arr[at];
  return v === undefined || v === missing ? null : v / scale;
};

/** A county's predicted value for one channel on the context's day (yield_C…, drought_4w, drought_8w). */
export function predicted(t: DayContext | undefined, channel: string, c: County) {
  const p = t?.p, ix = p?.index, ci = t?.order.get(c.f);
  if (!t || !p?.year || !ix || ci == null) return null;
  const ch = ix.channels.indexOf(channel);
  return ch < 0 ? null : read(p.year, (ch * t.counties + ci) * t.days + t.index, ix.scale[ch], ix.missing);
}

/** A county's calendar value for the context's date (frost_spring, frost_fall, tmax_p10…, rain30_p90). */
export function calendarValue(t: DayContext | undefined, channel: string, c: County) {
  const p = t?.p, ix = p?.index, ci = t?.order.get(c.f);
  if (!t || !p?.statics || !ix || ci == null) return null;
  const ch = ix.static.channels.indexOf(channel);
  return ch < 0 ? null : read(p.statics, (ch * t.counties + ci) * ix.static.days + t.slot, ix.static.scale[ch], ix.missing);
}

export interface ExpectedYield { pct: number; bu: number | null; season: number; phase: 'before' | 'during' | 'after' }

/** The expected yield of the season this day belongs to, as known on this day: % vs the county trend, and bu/ac. */
export function expectedYield(t: DayContext | undefined, k: CropKey, c: County, seasonDays: (k: CropKey, y: number) => [number, number]): ExpectedYield | null {
  const pct = predicted(t, `yield_${k}`, c);
  if (!t || pct == null || !c.d[k]) return null;
  const season = seasonYearOf(t.day, k), ci = t.order.get(c.f)!;
  const trend = t.p?.index?.trend[k]?.[ci]?.[season - FIRST_YEAR] ?? null;
  const [from, to] = seasonDays(k, season);
  return { pct, bu: trend == null ? null : trend * (1 + pct / 100), season, phase: t.day < from ? 'before' : t.day > to ? 'after' : 'during' };
}

/** Frost risk for the date: before July, the chance of another freeze later this spring; from July, of a freeze by now. */
export function frostRisk(t: DayContext | undefined, c: County) {
  if (!t) return null;
  const spring = dateOf(t.day).getUTCMonth() < 6;
  const v = calendarValue(t, spring ? 'frost_spring' : 'frost_fall', c);
  return v == null ? null : { pct: v, spring };
}
