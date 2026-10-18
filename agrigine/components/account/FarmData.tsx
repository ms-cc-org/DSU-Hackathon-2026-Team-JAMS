'use client';
import Link from 'next/link';
import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import { deleteAllFarmData, deleteUpload, importRecords, listFarmRecords, listUploads, type FarmRecord, type FarmUpload } from '@/lib/account';
import { STATES } from '@/lib/constants';
import { loadBundle } from '@/lib/data';
import { CROP_KEY, CROP_LABEL, MAX_ROWS, TEMPLATE, checkCsv, recordsToCsv, type Checked } from '@/lib/farmcsv';
import { num, signed } from '@/lib/format';
import { download } from '@/lib/report/csv';
import { useAuth } from '@/lib/supabase';
import type { Bundle } from '@/lib/types';

export default function FarmData() {
  return <Suspense fallback={<p className="acct-note">Loading…</p>}><FarmDataReady /></Suspense>;
}

function FarmDataReady() {
  const bundle = use(useMemo(() => loadBundle(), []));
  const { session, ready } = useAuth();
  if (!ready) return <p className="acct-note">Checking your sign-in…</p>;
  if (!session) {
    return (
      <div className="acct-card">
        <h1>My farm data</h1>
        <p className="acct-lede">Add your own field records (yields, acres, planting and harvest dates) and see them next to the county numbers. Only you can see them.</p>
        <Link className="btn primary" href="/account?next=/data">Sign in to add your data</Link>
      </div>
    );
  }
  return <Records bundle={bundle} userId={session.user.id} />;
}

interface Loaded { userId: string; records: FarmRecord[]; uploads: FarmUpload[] }

function Records({ bundle, userId }: { bundle: Bundle; userId: string }) {
  const byFips = useMemo(() => new Map(bundle.counties.map(c => [c.f, c])), [bundle]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [checked, setChecked] = useState<(Checked & { fileName: string }) | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all([listFarmRecords(), listUploads()])
      .then(([records, uploads]) => live && setLoaded({ userId, records, uploads }))
      .catch(e => live && setMsg({ tone: 'error', text: `Couldn’t load your records: ${(e as Error).message}` }));
    return () => { live = false; };
  }, [userId, reload]);
  const data = loaded?.userId === userId ? loaded : null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    if (file.size > 2e6) return setMsg({ tone: 'error', text: 'That file is over 2 MB. Split it into smaller files.' });
    const out = checkCsv(await file.text(), bundle.counties);
    if (typeof out === 'string') return setMsg({ tone: 'error', text: out });
    setChecked({ ...out, fileName: file.name });
  };
  const save = async () => {
    if (!checked?.records.length) return;
    setBusy(true);
    try {
      await importRecords(checked.fileName, checked.records);
      setMsg({ tone: 'ok', text: `Added ${checked.records.length.toLocaleString()} records from ${checked.fileName}.` });
      setChecked(null);
      setReload(n => n + 1);
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const removeUpload = async (u: FarmUpload) => {
    if (!window.confirm(`Delete ${u.file_name} and its ${u.row_count} records?`)) return;
    await deleteUpload(u.id).catch(e => setMsg({ tone: 'error', text: (e as Error).message }));
    setReload(n => n + 1);
  };
  const removeAll = async () => {
    if (!window.confirm('Delete all of your farm records? This can’t be undone. Download them first if you want a copy.')) return;
    await deleteAllFarmData(userId).catch(e => setMsg({ tone: 'error', text: (e as Error).message }));
    setReload(n => n + 1);
  };

  /** The county's NASS yield for the same crop and year, when one was reported. */
  const countyYield = (r: FarmRecord) => {
    const d = byFips.get(r.fips)?.d[CROP_KEY[r.crop]], i = r.year - bundle.years[0];
    return d && i >= 0 && i < d.y.length && d.st[i] === 'r' ? d.y[i] : null;
  };
  const place = (fips: string) => { const c = byFips.get(fips); return c ? `${c.n} County, ${c.s}` : fips; };

  return (
    <>
      <header className="acct-head">
        <h1>My farm data</h1>
        <p className="acct-lede">Your own field records, next to the county’s numbers. Only you can see them; they are never part of a report you share.</p>
      </header>

      <section className="acct-sec">
        <h2>Add records</h2>
        <p>Upload a CSV with one row per field and season. Required columns: <code>field</code>, <code>county</code> (“Polk County, Iowa” or a FIPS code), <code>crop</code> and <code>year</code>. Optional: <code>yield_bu_per_acre</code>, <code>acres</code>, <code>planted_on</code>, <code>harvested_on</code>, <code>irrigated</code>, <code>notes</code>. Up to {MAX_ROWS.toLocaleString()} rows per file. To try it out, the sample farm is three fields in Story County, Iowa, 2008–2025.</p>
        <div className="acct-actions">
          <button type="button" className="btn primary" onClick={() => fileRef.current?.click()}>Choose a CSV file</button>
          <button type="button" className="btn" onClick={() => download('agrigine-farm-records-template.csv', TEMPLATE, 'text/csv')}>Download the template</button>
          <a className="btn" href="/data/samples/sample-farm-story-county-iowa.csv" download>Download a sample farm</a>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {msg && <p className={msg.tone === 'error' ? 'acct-error' : 'acct-ok'} role={msg.tone === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
        {checked && (
          <div className="acct-check">
            <p><b>{checked.fileName}</b>: {checked.records.length.toLocaleString()} of {checked.total.toLocaleString()} rows are ready{checked.problems.length ? `; ${checked.problems.length.toLocaleString()} can’t be used yet` : ''}.</p>
            {checked.problems.length > 0 && (
              <ul className="acct-problems">
                {checked.problems.slice(0, 12).map(p => <li key={p.row}>Row {p.row}: {p.message}.</li>)}
                {checked.problems.length > 12 && <li>And {checked.problems.length - 12} more rows. Fix them in the file and upload it again.</li>}
              </ul>
            )}
            <div className="acct-actions">
              <button type="button" className="btn primary" disabled={!checked.records.length || busy} onClick={save}>
                {busy ? 'Saving…' : `Save ${checked.records.length.toLocaleString()} records`}
              </button>
              <button type="button" className="btn" onClick={() => setChecked(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="acct-sec">
        <h2>Your records {data && <span className="rb-count">{data.records.length.toLocaleString()}</span>}</h2>
        {!data ? <p className="acct-note">Loading your records…</p> : !data.records.length ? (
          <p className="acct-note">No records yet. Upload a CSV above, starting from the template.</p>
        ) : (
          <div className="tablewrap">
            <table className="ctable">
              <thead><tr><th>Field</th><th>County</th><th>Crop</th><th>Year</th><th>Your yield</th><th>County yield</th><th>You vs county</th><th>Acres</th><th>Irrigated</th></tr></thead>
              <tbody>
                {data.records.map(r => {
                  const cy = countyYield(r), you = r.yield_bu_per_acre;
                  return (
                    <tr key={r.id} className="static">
                      <td>{r.field}</td><td>{place(r.fips)}</td><td>{CROP_LABEL[r.crop]}</td><td>{r.year}</td>
                      <td>{you == null ? '—' : `${num(you, 1)} bu/ac`}</td>
                      <td>{cy == null ? '—' : `${num(cy, 1)} bu/ac`}</td>
                      <td>{you == null || cy == null ? '—' : `${signed(((you - cy) / cy) * 100)}%`}</td>
                      <td>{r.acres == null ? '—' : num(r.acres)}</td>
                      <td>{r.irrigated == null ? '—' : r.irrigated ? 'Yes' : 'No'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="cap">County yields are USDA NASS county averages, published only for some county, crop and year combinations. Agrigine covers {Object.values(STATES).join(', ')}.</p>
      </section>

      {data && data.uploads.length > 0 && (
        <section className="acct-sec">
          <h2>Uploads</h2>
          <ul className="acct-uploads">
            {data.uploads.map(u => (
              <li key={u.id}>
                <span><b>{u.file_name}</b> · {u.row_count.toLocaleString()} records · {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <button type="button" className="btn" onClick={() => removeUpload(u)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="acct-sec">
        <h2>Your data, your call</h2>
        <p>Take a copy any time, or remove everything you’ve added.</p>
        <div className="acct-actions">
          <button type="button" className="btn" disabled={!data?.records.length} onClick={() => data && download('my-farm-records.csv', recordsToCsv(data.records), 'text/csv')}>Download all my records</button>
          <button type="button" className="btn danger" disabled={!data?.records.length} onClick={removeAll}>Delete all my records</button>
        </div>
      </section>
    </>
  );
}
