'use client';
// "Your farm" on the Predict page: a farmer sets where their farm is and builds a simple model from their own
// yields. The models are tiny, so they're fitted right here in the browser; only the results are saved.
import Link from 'next/link';
import { Suspense, use, useEffect, useMemo, useState } from 'react';
import {
  FARM_CROPS, addFarm, deleteFarm, deleteFarmModel, listFarmModels, listFarmRecords, listFarms, moveFarm, saveFarmModel,
  type Farm, type FarmCrop, type FarmRecord, type SavedFarmModel,
} from '@/lib/account';
import { STATES } from '@/lib/constants';
import { loadBundle } from '@/lib/data';
import { LAST_OBSERVED_YEAR } from '@/lib/daily';
import { CROP_KEY, CROP_LABEL } from '@/lib/farmcsv';
import { MODEL_INFO, countyAt, farmSeasons, fitModel, type FitResult, type ModelKind } from '@/lib/farmmodel';
import { refreshMyFarms } from '@/lib/farms';
import { num } from '@/lib/format';
import { useAuth } from '@/lib/supabase';
import type { Bundle } from '@/lib/types';

const KINDS = Object.keys(MODEL_INFO) as ModelKind[];
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function FarmPredict() {
  return <Suspense fallback={<p className="acct-note">Loading…</p>}><Ready /></Suspense>;
}

function Ready() {
  const bundle = use(useMemo(() => loadBundle(), []));
  const { session, ready } = useAuth();
  return (
    <section className="farm" aria-labelledby="farm-title">
      <div className="farm-head">
        <h2 id="farm-title">Your farm</h2>
        <p>Set where your farm is, then build a simple model from your own yields: how your fields compare with the county, your own trend, or how drought and rain move your yield. You get your farm&apos;s predicted yield for {LAST_OBSERVED_YEAR + 1}–{bundle.years[bundle.years.length - 1]}, and how well the model did on your past seasons.</p>
      </div>
      {!ready ? <p className="acct-note">Checking your sign-in…</p>
        : !session ? <p className="farm-cta"><Link className="btn primary" href="/account?next=/predict">Sign in to model your farm</Link> Your farm and your records are visible only to you.</p>
        : <Farms bundle={bundle} userId={session.user.id} />}
    </section>
  );
}

function Farms({ bundle, userId }: { bundle: Bundle; userId: string }) {
  const byFips = useMemo(() => new Map(bundle.counties.map(c => [c.f, c])), [bundle]);
  const options = useMemo(() => bundle.counties.map(c => ({ fips: c.f, label: `${c.n} County, ${STATES[c.s]}` })).sort((a, b) => a.label.localeCompare(b.label)), [bundle]);
  const [farms, setFarms] = useState<{ uid: string; list: Farm[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listFarms().then(list => live && setFarms({ uid: userId, list })).catch(e => live && setMsg((e as Error).message));
    if (reload) refreshMyFarms(userId).catch(() => undefined);   // keep Explore and Report in step
    return () => { live = false; };
  }, [userId, reload]);
  const list = farms?.uid === userId ? farms.list : null;
  const farm = list?.find(f => f.id === selected) ?? list?.[0] ?? null;

  if (!list) return <p className="acct-note">Loading your farms…</p>;
  return (
    <div className="farm-body">
      <div className="farm-tabs" role="tablist" aria-label="Your farms">
        {list.map(f => (
          <button key={f.id} role="tab" aria-selected={!adding && farm?.id === f.id} className="chip" onClick={() => { setSelected(f.id); setAdding(false); }}>{f.name}</button>
        ))}
        <button className="chip" aria-pressed={adding || !list.length} onClick={() => setAdding(true)}>+ Add a farm</button>
      </div>
      {msg && <p className="acct-error" role="alert">{msg}</p>}
      {adding || !list.length ? (
        <AddFarm bundle={bundle} options={options} onDone={f => { setAdding(false); if (f) { setSelected(f.id); setReload(n => n + 1); } }} canCancel={list.length > 0} />
      ) : farm && byFips.get(farm.fips) ? (
        <FarmModel key={farm.id} farm={farm} bundle={bundle} onChanged={gone => { if (gone) setSelected(null); setReload(n => n + 1); }}
          onModelsChanged={() => refreshMyFarms(userId).catch(() => undefined)} />
      ) : null}
    </div>
  );
}

function AddFarm({ bundle, options, onDone, canCancel }: { bundle: Bundle; options: { fips: string; label: string }[]; onDone: (f: Farm | null) => void; canCancel: boolean }) {
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fips = options.find(o => o.label.toLowerCase() === place.trim().toLowerCase())?.fips ?? null;

  const locate = () => {
    if (!navigator.geolocation) return setMsg('This browser can’t share its location. Pick your county instead.');
    setMsg('Finding your location…');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords, c = countyAt(bundle.counties, lon, lat);
      if (!c) return setMsg('That location isn’t in California, Delaware, Iowa or Nebraska. Pick the county your farm is in.');
      setCoords({ lat: +lat.toFixed(4), lon: +lon.toFixed(4) });
      setPlace(`${c.n} County, ${STATES[c.s]}`);
      setMsg(null);
    }, () => setMsg('Location wasn’t shared. Pick your county instead.'), { timeout: 10000 });
  };
  const save = async () => {
    if (!fips) return setMsg('Pick your county from the list.');
    setBusy(true);
    try { onDone(await addFarm({ name: name.trim() || 'My farm', fips, lat: coords?.lat ?? null, lon: coords?.lon ?? null })); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="farm-card">
      <h3>Add a farm</h3>
      <div className="farm-form">
        <label className="rb-field"><span>Farm name</span><input value={name} maxLength={80} placeholder="e.g. Home place" onChange={e => setName(e.target.value)} /></label>
        <label className="rb-field"><span>County it&apos;s in</span>
          <input list="farm-counties" value={place} placeholder="e.g. Story County, Iowa" onChange={e => { setPlace(e.target.value); setCoords(null); }} />
          <datalist id="farm-counties">{options.map(o => <option key={o.fips} value={o.label} />)}</datalist>
        </label>
      </div>
      <div className="acct-actions">
        <button type="button" className="btn" onClick={locate}>Use my location</button>
        <button type="button" className="btn primary" disabled={!fips || busy} onClick={save}>Save farm</button>
        {canCancel && <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>}
      </div>
      {coords && <p className="cap">Located at {coords.lat}, {coords.lon}.</p>}
      {msg && <p className="acct-error" role="status">{msg}</p>}
    </div>
  );
}

function FarmModel({ farm, bundle, onChanged, onModelsChanged }: { farm: Farm; bundle: Bundle; onChanged: (gone: boolean) => void; onModelsChanged: () => void }) {
  const county = bundle.counties.find(c => c.f === farm.fips)!;
  const futureYears = bundle.years.filter(y => y > LAST_OBSERVED_YEAR);
  const [allRecords, setAllRecords] = useState<FarmRecord[] | null>(null);
  const [saved, setSaved] = useState<SavedFarmModel[]>([]);
  const [reload, setReload] = useState(0);
  const [crop, setCrop] = useState<FarmCrop | null>(null);
  const [kind, setKind] = useState<ModelKind>('county_ratio');
  const [result, setResult] = useState<FitResult | string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([listFarmRecords(), listFarmModels(farm.id)])
      .then(([r, m]) => { if (live) { setAllRecords(r); setSaved(m); } })
      .catch(e => live && setNote((e as Error).message));
    return () => { live = false; };
  }, [farm.fips, farm.id, reload]);

  // A farm's data is the farmer's records in the farm's county; records elsewhere are offered as a one-click move.
  const records = useMemo(() => allRecords?.filter(r => r.fips === farm.fips) ?? null, [allRecords, farm.fips]);
  const elsewhere = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of allRecords ?? []) if (r.fips !== farm.fips && r.yield_bu_per_acre != null) n.set(r.fips, (n.get(r.fips) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([fips, count]) => ({ c: bundle.counties.find(x => x.f === fips), count })).filter(x => x.c);
  }, [allRecords, farm.fips, bundle]);
  const seasonsBy = useMemo(() => Object.fromEntries(FARM_CROPS.map(c => [c, farmSeasons(records ?? [], c)])), [records]);
  const crops = FARM_CROPS.filter(c => seasonsBy[c].length && county.d[CROP_KEY[c]]);
  const k = crop && crops.includes(crop) ? crop : crops[0] ?? null;
  const seasons = k ? seasonsBy[k] : [];

  const build = () => { if (k) { setResult(fitModel(kind, seasons, county, CROP_KEY[k], bundle.years, futureYears)); setNote(null); } };
  const keep = async (r: FitResult) => {
    try {
      await saveFarmModel({ farm_id: farm.id, crop: k!, kind: r.kind, params: r.params, scores: { ...r.scores, n: r.n }, predictions: r.predictions });
      setNote('Model saved. It now shows in Explore (My farms) and can go in a report.');
      setReload(n => n + 1);
      onModelsChanged();
    } catch (e) { setNote((e as Error).message); }
  };
  const removeFarm = async () => {
    if (!window.confirm(`Delete ${farm.name} and its saved models? Your farm records stay in My farm data.`)) return;
    await deleteFarm(farm.id).catch(e => setNote((e as Error).message));
    onChanged(true);
  };
  const move = async (fips: string) => {
    await moveFarm(farm.id, fips).catch(e => setNote((e as Error).message));
    setResult(null);
    onChanged(false);
  };
  const totals = FARM_CROPS.filter(c => seasonsBy[c].length).map(c => `${CROP_LABEL[c].toLowerCase()}: ${seasonsBy[c].length} seasons`);

  return (
    <div className="farm-card">
      <div className="farm-title">
        <div>
          <h3>{farm.name}</h3>
          <p className="cap">{county.n} County, {STATES[county.s]}{farm.lat != null ? ` · ${farm.lat}, ${farm.lon}` : ''}</p>
        </div>
        <button type="button" className="linkbtn danger" onClick={removeFarm}>Delete farm</button>
      </div>

      <ol className="farm-steps">
        <li>
          <h4>Location</h4>
          <p>{county.n} County, {STATES[county.s]}. Your records from this county are this farm&apos;s data.</p>
        </li>
        <li>
          <h4>Your data</h4>
          {!records ? <p className="acct-note">Loading your records…</p> : crops.length ? (
            <p>{records.length} of your records here ({totals.join(', ')}). <Link href="/data">Manage them in My farm data</Link>.</p>
          ) : (
            <>
              <p>No yields of yours in {county.n} County yet.</p>
              {elsewhere.length > 0 ? (
                <div className="farm-move">
                  <p>Your records are in {elsewhere.map(e => `${e.c!.n} County, ${STATES[e.c!.s]} (${e.count})`).join('; ')}. Move this farm there to use them:</p>
                  <div className="acct-actions">
                    {elsewhere.map(e => <button key={e.c!.f} type="button" className="btn primary" onClick={() => move(e.c!.f)}>Move this farm to {e.c!.n} County, {STATES[e.c!.s]}</button>)}
                  </div>
                </div>
              ) : (
                <p><Link href="/data">Add your field records</Link>: a CSV with field, county, crop, year and yield. There&apos;s a sample farm to try on that page.</p>
              )}
            </>
          )}
        </li>
        <li>
          <h4>Build a model and predict</h4>
          {!crops.length ? <p className="acct-note">Once this farm has yields, pick a crop and a model here to predict its {futureYears[0]}–{futureYears[futureYears.length - 1]} yields.</p> : (
            <>
              <div className="farm-step">
                <span className="farm-label">Crop</span>
                <div className="seg" role="group" aria-label="Crop">
                  {crops.map(c => <button key={c} type="button" aria-pressed={c === k} onClick={() => { setCrop(c); setResult(null); }}>{CROP_LABEL[c]} <small>{seasonsBy[c].length}</small></button>)}
                </div>
              </div>
              <div className="farm-step">
                <span className="farm-label">Model</span>
                <div className="farm-kinds" role="radiogroup" aria-label="Model">
                  {KINDS.map(m => {
                    const info = MODEL_INFO[m], short = seasons.length < info.minSeasons;
                    return (
                      <label key={m} className={`farm-kind${kind === m ? ' on' : ''}${short ? ' short' : ''}`}>
                        <input type="radio" name="kind" checked={kind === m} onChange={() => { setKind(m); setResult(null); }} />
                        <b>{info.name}</b><span>{info.blurb}</span>
                        <small>{short ? `Needs ${info.minSeasons} seasons; you have ${seasons.length}` : `Needs ${info.minSeasons}+ seasons`}</small>
                      </label>
                    );
                  })}
                </div>
              </div>
              <button type="button" className="btn primary" onClick={build}>Build model and predict {futureYears[0]}–{futureYears[futureYears.length - 1]}</button>
              {typeof result === 'string' && <p className="acct-error" role="alert">{result}</p>}
              {result && typeof result !== 'string' && <ModelResult r={result} unit="bu/ac" onSave={() => keep(result)} />}
            </>
          )}
        </li>
      </ol>
      {note && <p className="acct-ok" role="status">{note}</p>}

      {saved.length > 0 && (
        <div className="farm-saved">
          <h4>Saved models</h4>
          <ul>
            {saved.map(m => (
              <li key={m.id}>
                <span><b>{CROP_LABEL[m.crop]} · {MODEL_INFO[m.kind as ModelKind]?.name ?? m.kind}</b>
                  {' '}· {m.predictions.map(p => `${p.year}: ${num(p.value)}`).join(', ')} bu/ac
                  {' '}· {m.scores.skill >= 0 ? `${Math.round(m.scores.skill * 100)}% better than your average` : 'worse than your average'} · {day(m.created_at)}</span>
                <button type="button" className="rb-x" aria-label="Delete this model" onClick={async () => { await deleteFarmModel(m.id); setReload(n => n + 1); onModelsChanged(); }}>×</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ModelResult({ r, unit, onSave }: { r: FitResult; unit: string; onSave: () => void }) {
  const good = r.scores.skill > 0.05;
  return (
    <div className="farm-result">
      <ul className="farm-explain">{r.explain.map(e => <li key={e}>{e}</li>)}</ul>
      <p className={good ? 'acct-ok' : 'acct-error'}>
        Tested by leaving out each of your {r.n} seasons in turn: it missed by {num(r.scores.mae, 1)} {unit} on average, against {num(r.scores.baselineMae, 1)} {unit} for simply using your average
        {good ? ` (${Math.round(r.scores.skill * 100)}% better).` : '. It isn’t better than your average, so don’t lean on it yet; more seasons will help.'}
      </p>
      <FarmChart r={r} />
      <table className="ctable">
        <thead><tr><th>Season</th><th>Predicted yield</th><th>Likely range (8 in 10)</th></tr></thead>
        <tbody>
          {r.predictions.map(p => (
            <tr key={p.year} className="static"><td>{p.year}</td><td><b>{num(p.value, 1)} {unit}</b></td><td>{num(Math.max(0, p.low))}–{num(p.high)} {unit}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="cap">Predicted seasons use Agrigine&apos;s county forecasts as inputs: the county&apos;s expected yield, and a typical season&apos;s rain and drought.</p>
      <button type="button" className="btn" onClick={onSave}>Save model</button>
    </div>
  );
}

/** Your seasons, the model's fit, and the predicted seasons with their range. */
function FarmChart({ r }: { r: FitResult }) {
  const W = 640, H = 220, L = 46, R = 12, T = 12, B = 26;
  const pts = [...r.fitted.map(f => f.year), ...r.predictions.map(p => p.year)];
  const x0 = Math.min(...pts), x1 = Math.max(...pts);
  const vals = [...r.fitted.flatMap(f => [f.actual, f.fit]), ...r.predictions.flatMap(p => [p.low, p.high])].filter(Number.isFinite);
  const lo = Math.floor(Math.min(...vals) / 10) * 10, hi = Math.ceil(Math.max(...vals) / 10) * 10;
  const x = (year: number) => L + ((year - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const y = (v: number) => H - B - ((v - lo) / Math.max(1, hi - lo)) * (H - B - T);
  const line = (p: { year: number; v: number }[]) => p.map((q, j) => `${j ? 'L' : 'M'}${x(q.year).toFixed(1)},${y(q.v).toFixed(1)}`).join('');
  const last = r.fitted[r.fitted.length - 1];
  const band = r.predictions.length ? `M${r.predictions.map(p => `${x(p.year)},${y(p.high)}`).join('L')}L${[...r.predictions].reverse().map(p => `${x(p.year)},${y(Math.max(lo, p.low))}`).join('L')}Z` : '';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart farm-chart" role="img" aria-label="Your yields, the model's fit and the predicted seasons">
      {[lo, (lo + hi) / 2, hi].map(v => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{num(v)}</text></g>
      ))}
      {[x0, x1, ...(x1 - x0 > 8 ? [Math.round((x0 + x1) / 2)] : [])].map(yr => <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{yr}</text>)}
      {band && <path d={band} fill="var(--cat-storms)" opacity={0.15} />}
      <path d={line(r.fitted.map(f => ({ year: f.year, v: f.fit })))} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3" />
      {r.predictions.length > 0 && <path d={line([{ year: last.year, v: last.fit }, ...r.predictions.map(p => ({ year: p.year, v: p.value }))])} fill="none" stroke="var(--cat-storms)" strokeWidth={2} />}
      {r.fitted.map(f => <circle key={f.year} cx={x(f.year)} cy={y(f.actual)} r={3.5} fill="var(--cat-weather)"><title>{`${f.year}: yours ${num(f.actual, 1)}, model ${num(f.fit, 1)}`}</title></circle>)}
      {r.predictions.map(p => <circle key={p.year} cx={x(p.year)} cy={y(p.value)} r={3.5} fill="var(--cat-storms)"><title>{`${p.year} predicted: ${num(p.value, 1)}`}</title></circle>)}
    </svg>
  );
}
