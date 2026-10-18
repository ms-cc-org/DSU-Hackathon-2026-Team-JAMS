// Everything stored in a person's account: saved reports, shares with other accounts, and their own farm records.
// The database's row-level security enforces who sees what; these functions just ask for it.
import type { ReportSpec } from './report/spec';
import { supabase } from './supabase';

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

// ---------- Reports ----------

export interface AccountReport { rowId: string; spec: ReportSpec; updatedAt: string }
export interface SharedReport { rowId: string; spec: ReportSpec; from: string; expiresAt: string }
export interface Share { id: string; email: string; expiresAt: string }

export async function listMyReports(userId: string): Promise<AccountReport[]> {
  const { data, error } = await supabase().from('reports').select('id, spec, updated_at').eq('owner', userId).order('updated_at', { ascending: false });
  fail(error);
  return (data ?? []).map(r => ({ rowId: r.id, spec: r.spec as ReportSpec, updatedAt: r.updated_at }));
}

/** Saves the report's settings to the account, replacing an earlier save of the same report. */
export async function saveReport(spec: ReportSpec, userId: string) {
  const saved = { ...spec, owner: userId, updatedAt: new Date().toISOString() };
  const { error } = await supabase().from('reports')
    .upsert({ owner: userId, spec_id: spec.id, title: spec.title || 'Untitled report', spec: saved }, { onConflict: 'owner,spec_id' });
  fail(error);
  return saved;
}

export async function deleteReport(rowId: string) {
  const { error } = await supabase().from('reports').delete().eq('id', rowId);
  fail(error);
}

export async function sharedWithMe(): Promise<SharedReport[]> {
  const { data, error } = await supabase().rpc('reports_shared_with_me');
  fail(error);
  return ((data ?? []) as { report_id: string; spec: ReportSpec; shared_by_email: string; expires_at: string }[])
    .map(r => ({ rowId: r.report_id, spec: r.spec, from: r.shared_by_email, expiresAt: r.expires_at }));
}

/** Gives another account read access for a number of days. Returns when the share ends. */
export async function shareReport(rowId: string, email: string, days: number): Promise<string> {
  const { data, error } = await supabase().rpc('share_report', { p_report: rowId, p_email: email, p_days: days });
  fail(error);
  return data as string;
}

export async function listShares(rowId: string): Promise<Share[]> {
  const { data, error } = await supabase().rpc('report_share_list', { p_report: rowId });
  fail(error);
  return ((data ?? []) as { share_id: string; email: string; expires_at: string }[]).map(s => ({ id: s.share_id, email: s.email, expiresAt: s.expires_at }));
}

export async function endShare(id: string) {
  const { error } = await supabase().from('report_shares').delete().eq('id', id);
  fail(error);
}

// ---------- Farm records ----------

export const FARM_CROPS = ['corn', 'soybeans', 'winter_wheat', 'sorghum'] as const;
export type FarmCrop = (typeof FARM_CROPS)[number];

export interface FarmRecord {
  id?: string;
  upload_id?: string | null;
  field: string;
  fips: string;
  crop: FarmCrop;
  year: number;
  yield_bu_per_acre: number | null;
  acres: number | null;
  planted_on: string | null;
  harvested_on: string | null;
  irrigated: boolean | null;
  notes: string | null;
}
export interface FarmUpload { id: string; file_name: string; row_count: number; created_at: string }

const COLUMNS = 'id, upload_id, field, fips, crop, year, yield_bu_per_acre, acres, planted_on, harvested_on, irrigated, notes';
// Records per county, cached so the county profile doesn't ask again on every click. Cleared on any change.
const byCounty = new Map<string, Promise<FarmRecord[]>>();

export async function listFarmRecords(): Promise<FarmRecord[]> {
  const { data, error } = await supabase().from('farm_records').select(COLUMNS).order('year', { ascending: false }).order('field');
  fail(error);
  return (data ?? []) as FarmRecord[];
}

export function farmRecordsIn(userId: string, fips: string): Promise<FarmRecord[]> {
  const key = `${userId}:${fips}`;
  if (!byCounty.has(key)) {
    byCounty.set(key, (async () => {
      const { data, error } = await supabase().from('farm_records').select(COLUMNS).eq('fips', fips).order('year', { ascending: false });
      fail(error);
      return (data ?? []) as FarmRecord[];
    })().catch(e => { byCounty.delete(key); throw e; }));
  }
  return byCounty.get(key)!;
}

export async function listUploads(): Promise<FarmUpload[]> {
  const { data, error } = await supabase().from('farm_uploads').select('id, file_name, row_count, created_at').order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as FarmUpload[];
}

/** Stores one file's records, grouped as an upload so the whole file can be removed again in one step. */
export async function importRecords(fileName: string, records: FarmRecord[]) {
  byCounty.clear();
  const db = supabase();
  const { data: upload, error } = await db.from('farm_uploads').insert({ file_name: fileName.slice(0, 200), row_count: records.length }).select('id').single();
  fail(error);
  for (let j = 0; j < records.length; j += 500) {
    const { error: e } = await db.from('farm_records').insert(records.slice(j, j + 500).map(r => ({ ...r, upload_id: upload!.id })));
    if (e) {
      await db.from('farm_uploads').delete().eq('id', upload!.id);
      throw new Error(`Nothing was saved: ${e.message}`);
    }
  }
}

export async function deleteUpload(id: string) {
  byCounty.clear();
  const { error } = await supabase().from('farm_uploads').delete().eq('id', id);
  fail(error);
}

export async function deleteAllFarmData(userId: string) {
  byCounty.clear();
  const db = supabase();
  fail((await db.from('farm_records').delete().eq('owner', userId)).error);
  fail((await db.from('farm_uploads').delete().eq('owner', userId)).error);
}

export interface FarmSummary { records: number; counties: number; from: number | null; to: number | null }

/** How many records someone has, across how many counties and years, for their profile. */
export async function farmSummary(): Promise<FarmSummary> {
  const { data, count, error } = await supabase().from('farm_records').select('fips, year', { count: 'exact' });
  fail(error);
  const rows = (data ?? []) as { fips: string; year: number }[], years = rows.map(r => r.year);
  return {
    records: count ?? rows.length,
    counties: new Set(rows.map(r => r.fips)).size,
    from: years.length ? Math.min(...years) : null,
    to: years.length ? Math.max(...years) : null,
  };
}

/** The name shown on the profile and the top-bar button, kept in the sign-in record itself. */
export async function setDisplayName(name: string) {
  const { error } = await supabase().auth.updateUser({ data: { display_name: name.trim().slice(0, 60) } });
  fail(error);
}

// ---------- Farms and farm models ----------

export interface Farm { id: string; name: string; fips: string; lat: number | null; lon: number | null; created_at: string }
export interface SavedFarmModel {
  id: string; farm_id: string; crop: FarmCrop; kind: string; created_at: string;
  params: Record<string, number>; scores: { mae: number; baselineMae: number; skill: number; n: number };
  predictions: { year: number; value: number; low: number; high: number }[];
}

export async function listFarms(): Promise<Farm[]> {
  const { data, error } = await supabase().from('farms').select('id, name, fips, lat, lon, created_at').order('created_at');
  fail(error);
  return (data ?? []) as Farm[];
}

export async function addFarm(farm: { name: string; fips: string; lat: number | null; lon: number | null }): Promise<Farm> {
  const { data, error } = await supabase().from('farms').insert(farm).select('id, name, fips, lat, lon, created_at').single();
  fail(error);
  return data as Farm;
}

export async function deleteFarm(id: string) {
  fail((await supabase().from('farms').delete().eq('id', id)).error);
}

/** The farmer's records in one county (their farm's county). */
export async function recordsInCounty(fips: string): Promise<FarmRecord[]> {
  const { data, error } = await supabase().from('farm_records').select(COLUMNS).eq('fips', fips).order('year');
  fail(error);
  return (data ?? []) as FarmRecord[];
}

export async function listFarmModels(farmId: string): Promise<SavedFarmModel[]> {
  const { data, error } = await supabase().from('farm_models').select('id, farm_id, crop, kind, params, scores, predictions, created_at')
    .eq('farm_id', farmId).order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as SavedFarmModel[];
}

export async function saveFarmModel(m: Omit<SavedFarmModel, 'id' | 'created_at'>) {
  fail((await supabase().from('farm_models').insert(m)).error);
}

export async function deleteFarmModel(id: string) {
  fail((await supabase().from('farm_models').delete().eq('id', id)).error);
}

/** Points a farm at another county (its records are matched by county). */
export async function moveFarm(id: string, fips: string) {
  fail((await supabase().from('farms').update({ fips, lat: null, lon: null }).eq('id', id)).error);
}

/** Every saved model across the farmer's farms. */
export async function listAllFarmModels(): Promise<SavedFarmModel[]> {
  const { data, error } = await supabase().from('farm_models').select('id, farm_id, crop, kind, params, scores, predictions, created_at')
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as SavedFarmModel[];
}
