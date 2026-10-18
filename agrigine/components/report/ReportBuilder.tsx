'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { deleteReport, endShare, listMyReports, listShares, saveReport, shareReport, sharedWithMe, type AccountReport, type Share, type SharedReport } from '@/lib/account';
import { CROPS, CROP_TITLE } from '@/lib/constants';
import { loadBundle } from '@/lib/data';
import { LAST_OBSERVED_YEAR, isPredictedYear, loadDailyYear } from '@/lib/daily';
import { download, slug, toCsv, type Row } from '@/lib/report/csv';
import { placeOptions, resolvePlaces } from '@/lib/report/places';
import {
  BLOCK_TYPES, FIRST_YEAR, LAST_YEAR, MAX_PLACES, TEMPLATES, newId, newReport, parseSpec,
  type BlockSpec, type BlockType, type ReportScope, type ReportSpec,
} from '@/lib/report/spec';
import { browserStore } from '@/lib/report/store';
import { useAuth } from '@/lib/supabase';
import type { Bundle, CropKey } from '@/lib/types';
import { BLOCKS, type ReportCtx } from './blocks';

const ALL_YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, j) => FIRST_YEAR + j);
const yearOption = (y: number) => (isPredictedYear(y) ? `${y} · predicted` : String(y));
const defaultsOf = (t: BlockType) => BLOCKS[t].defaults();
const SHARE_DAYS = [7, 30, 90];
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** A new or saved report from the address: ?id= opens a saved one; ?place=&crop=&year= starts a season recap. */
function fromQuery(q: URLSearchParams, isPlace: (ref: string) => boolean): ReportSpec | null {
  const id = q.get('id');
  if (id) return browserStore.list().find(r => r.id === id) ?? null;
  const places = (q.get('place') ?? '').split(',').filter(isPlace);
  const template = q.get('template');
  if (!places.length && !template) return null;
  const scope: Partial<ReportScope> = {};
  if (places.length) scope.places = places.slice(0, MAX_PLACES);
  const crop = q.get('crop') as CropKey;
  if (CROPS.includes(crop)) scope.crop = crop;
  const year = Number(q.get('year'));
  if (ALL_YEARS.includes(year)) scope.year = year;
  return newReport(template ?? 'season', scope, defaultsOf);
}

export default function ReportBuilderLoader() {
  const bundle = use(useMemo(() => loadBundle(), []));
  return <ReportBuilder bundle={bundle} />;
}

function ReportBuilder({ bundle }: { bundle: Bundle }) {
  const byFips = useMemo(() => new Map(bundle.counties.map(c => [c.f, c])), [bundle]);
  const order = useMemo(() => new Map(bundle.counties.map((c, j) => [c.f, j])), [bundle]);
  const options = useMemo(() => placeOptions(bundle), [bundle]);
  const isPlace = (ref: string) => options.some(o => o.ref === ref);

  const params = useSearchParams();
  const query = params.toString();
  const [spec, setSpec] = useState<ReportSpec>(() => fromQuery(params, isPlace) ?? newReport('season', {}, defaultsOf));
  const [handled, setHandled] = useState(query);
  const [saved, setSaved] = useState(() => browserStore.list());
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [placeText, setPlaceText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // Phones show one pane at a time; wider screens show both and hide the switch.
  const [pane, setPane] = useState<'settings' | 'report'>('report');
  const fileRef = useRef<HTMLInputElement>(null);

  // ---------- The account: reports saved there, reports shared with me, and this report's shares ----------
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [acct, setAcct] = useState<{ uid: string; reports: AccountReport[]; shared: SharedReport[] } | null>(null);
  const [acctReload, setAcctReload] = useState(0);
  const [sharedFrom, setSharedFrom] = useState<{ from: string; expiresAt: string } | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareDays, setShareDays] = useState(30);
  const [shares, setShares] = useState<{ rowId: string; list: Share[] } | null>(null);
  const [sharesReload, setSharesReload] = useState(0);
  // A ?id= link to a report kept in the account rather than this browser opens once the account list arrives.
  const [wantedId, setWantedId] = useState(() => (params.get('id') && !browserStore.list().some(r => r.id === params.get('id')) ? params.get('id') : null));
  useEffect(() => {
    if (!uid) return;
    let live = true;
    Promise.all([listMyReports(uid), sharedWithMe()])
      .then(([reports, shared]) => live && setAcct({ uid, reports, shared }))
      .catch(e => live && setNote(`Couldn’t load your account’s reports: ${(e as Error).message}`));
    return () => { live = false; };
  }, [uid, acctReload]);
  const account = acct && acct.uid === uid ? acct : null;
  const inAccount = account?.reports.find(r => r.spec.id === spec.id) ?? null;
  useEffect(() => {
    if (!inAccount) return;
    let live = true;
    listShares(inAccount.rowId).then(list => live && setShares({ rowId: inAccount.rowId, list })).catch(() => undefined);
    return () => { live = false; };
  }, [inAccount?.rowId, sharesReload]); // eslint-disable-line react-hooks/exhaustive-deps
  const shareList = inAccount && shares?.rowId === inAccount.rowId ? shares.list : [];
  if (wantedId && account) {
    setWantedId(null);
    const hit = account.reports.find(r => r.spec.id === wantedId);
    if (hit) { setSpec(hit.spec); setDirty(false); }
  }

  // Arriving again with a new address (for example "Build a report" from another county) starts that report.
  if (handled !== query) {
    setHandled(query);
    const next = fromQuery(params, isPlace);
    if (next && next.id !== spec.id) { setSpec(next); setDirty(false); }
  }

  const edit = (fn: (s: ReportSpec) => ReportSpec) => { setSpec(s => ({ ...fn(s), updatedAt: new Date().toISOString() })); setDirty(true); setNote(null); };
  const editScope = (patch: Partial<ReportScope>) => edit(s => {
    const sc = { ...s.scope, ...patch };
    sc.to = Math.max(sc.from, sc.to);
    sc.year = Math.min(sc.to, Math.max(sc.from, sc.year));
    return { ...s, scope: sc };
  });
  const editBlock = (id: string, fn: (b: BlockSpec) => BlockSpec | null) =>
    edit(s => ({ ...s, blocks: s.blocks.flatMap(b => (b.id === id ? (fn(b) ?? []) : [b])) }));
  const moveBlock = (id: string, by: number) => edit(s => {
    const j = s.blocks.findIndex(b => b.id === id), to = j + by;
    if (to < 0 || to >= s.blocks.length) return s;
    const blocks = [...s.blocks];
    [blocks[j], blocks[to]] = [blocks[to], blocks[j]];
    return { ...s, blocks };
  });
  const addBlock = (type: BlockType) => {
    const id = newId();
    edit(s => ({ ...s, blocks: [...s.blocks, { id, type, options: defaultsOf(type) }] }));
    setOpen(id);
  };

  const confirmDiscard = () => !dirty || window.confirm('Discard the unsaved changes to this report?');
  const start = (templateId: string) => {
    if (!confirmDiscard()) return;
    setSpec(newReport(templateId, { places: spec.scope.places, crop: spec.scope.crop, from: spec.scope.from, to: spec.scope.to, year: spec.scope.year }, defaultsOf));
    setDirty(false);
    setNote(null);
    setSharedFrom(null);
  };
  const openSaved = (r: ReportSpec) => {
    if (!confirmDiscard()) return;
    setSpec(r);
    setDirty(false);
    setNote(null);
    setSharedFrom(null);
    window.history.replaceState(null, '', `/reports?id=${r.id}`);
  };
  /** A shared report opens as a copy: the owner's version stays theirs, and saving keeps your own. */
  const openShared = (r: SharedReport) => {
    if (!confirmDiscard()) return;
    setSpec({ ...r.spec, id: newId(), owner: null, sharedWith: [] });
    setDirty(true);
    setNote(null);
    setSharedFrom({ from: r.from, expiresAt: r.expiresAt });
  };
  const save = async () => {
    if (uid) {
      try {
        const saved = await saveReport(spec, uid);
        setSpec(saved);
        setDirty(false);
        setSharedFrom(null);
        setNote('Saved to your account.');
        setAcctReload(n => n + 1);
        window.history.replaceState(null, '', `/reports?id=${spec.id}`);
      } catch (e) {
        setNote(`Couldn’t save to your account: ${(e as Error).message}`);
      }
      return;
    }
    try {
      browserStore.save(spec);
      setSaved(browserStore.list());
      setDirty(false);
      setNote('Saved in this browser.');
      window.history.replaceState(null, '', `/reports?id=${spec.id}`);
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const remove = (r: ReportSpec) => {
    if (!window.confirm(`Delete "${r.title}" from this browser? Its settings file, if you downloaded one, still works.`)) return;
    browserStore.remove(r.id);
    setSaved(browserStore.list());
  };
  const moveToAccount = async (r: ReportSpec) => {
    if (!uid) return;
    try {
      await saveReport(r, uid);
      browserStore.remove(r.id);
      setSaved(browserStore.list());
      setAcctReload(n => n + 1);
    } catch (e) {
      setNote(`Couldn’t move it: ${(e as Error).message}`);
    }
  };
  const removeFromAccount = async (r: AccountReport) => {
    if (!window.confirm(`Delete "${r.spec.title}" from your account? Anyone it's shared with loses access too.`)) return;
    await deleteReport(r.rowId).catch(e => setNote((e as Error).message));
    setAcctReload(n => n + 1);
  };
  const share = async () => {
    if (!inAccount || !shareEmail.trim()) return;
    try {
      const until = await shareReport(inAccount.rowId, shareEmail, shareDays);
      setNote(`Shared with ${shareEmail.trim()} until ${shortDate(until)}.`);
      setShareEmail('');
      setSharesReload(n => n + 1);
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const stopSharing = async (s: Share) => {
    await endShare(s.id).catch(e => setNote((e as Error).message));
    setSharesReload(n => n + 1);
  };

  const places = useMemo(() => resolvePlaces(spec.scope.places, bundle, byFips), [spec.scope.places, bundle, byFips]);
  const { crop: k, from, to, year } = spec.scope;
  const ctx: ReportCtx = useMemo(() => ({
    bundle, order, places, k, from, to, year, years: ALL_YEARS.filter(y => y >= from && y <= to),
  }), [bundle, order, places, k, from, to, year]);

  const addPlace = (text: string) => {
    setPlaceText(text);
    const hit = options.find(o => o.label.toLowerCase() === text.trim().toLowerCase());
    if (!hit) return;
    setPlaceText('');
    if (spec.scope.places.includes(hit.ref) || spec.scope.places.length >= MAX_PLACES) return;
    editScope({ places: [...spec.scope.places, hit.ref] });
  };

  const exportCsv = async () => {
    const daily = spec.blocks.some(b => BLOCKS[b.type].daily) ? await loadDailyYear(year) : undefined;
    const rows: Row[] = spec.blocks.flatMap(b => BLOCKS[b.type].rows(b.options, ctx, daily));
    download(`${slug(spec.title)}.csv`, toCsv(rows), 'text/csv');
  };
  const exportSettings = () => download(`${slug(spec.title)}.agrigine-report.json`, JSON.stringify(spec, null, 2), 'application/json');
  const importSettings = async (file: File | undefined) => {
    if (!file) return;
    let parsed: ReportSpec | string;
    try {
      parsed = parseSpec(JSON.parse(await file.text()), isPlace);
    } catch {
      parsed = 'This file is not valid JSON.';
    }
    if (typeof parsed === 'string') { setNote(parsed); return; }
    if (!confirmDiscard()) return;
    // An opened file becomes this browser's own copy, so it never overwrites a saved report by accident.
    setSpec({ ...parsed, id: newId() });
    setDirty(true);
    setNote(`Opened "${parsed.title}". Save it to keep it in this browser.`);
  };

  const sources = [...new Set(spec.blocks.flatMap(b => BLOCKS[b.type].sources(b.options)))];
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="rb" data-pane={pane}>
      <div className="seg wide rb-switch" role="group" aria-label="Show">
        <button type="button" aria-pressed={pane === 'settings'} onClick={() => setPane('settings')}>Settings</button>
        <button type="button" aria-pressed={pane === 'report'} onClick={() => setPane('report')}>Report</button>
      </div>
      <aside className="rb-side" aria-label="Report settings">
        <section className="rb-sec">
          <h2>Start from</h2>
          <div className="rb-templates">
            {TEMPLATES.map(t => (
              <button key={t.id} type="button" onClick={() => start(t.id)} title={t.blurb}>
                <b>{t.name}</b><span>{t.who}</span>
              </button>
            ))}
          </div>
          {account && account.reports.length > 0 && (
            <>
              <h3>In your account</h3>
              <ul className="rb-saved">
                {account.reports.map(r => (
                  <li key={r.rowId} aria-current={r.spec.id === spec.id ? 'true' : undefined}>
                    <button type="button" className="rb-open" onClick={() => openSaved(r.spec)}><b>{r.spec.title}</b><span>Saved {stamp(r.updatedAt)}</span></button>
                    <button type="button" className="rb-x" onClick={() => removeFromAccount(r)} aria-label={`Delete ${r.spec.title}`}>×</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {account && account.shared.length > 0 && (
            <>
              <h3>Shared with you</h3>
              <ul className="rb-saved">
                {account.shared.map(r => (
                  <li key={r.rowId}>
                    <button type="button" className="rb-open" onClick={() => openShared(r)}><b>{r.spec.title}</b><span>From {r.from} · until {shortDate(r.expiresAt)}</span></button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {saved.length > 0 && (
            <>
              <h3>Saved in this browser</h3>
              <ul className="rb-saved">
                {saved.map(r => (
                  <li key={r.id} aria-current={r.id === spec.id ? 'true' : undefined}>
                    <button type="button" className="rb-open" onClick={() => openSaved(r)}><b>{r.title}</b><span>Saved {stamp(r.updatedAt)}</span></button>
                    {uid && <button type="button" className="rb-x" onClick={() => moveToAccount(r)} aria-label={`Move ${r.title} to your account`} title="Move to your account">↑</button>}
                    <button type="button" className="rb-x" onClick={() => remove(r)} aria-label={`Delete ${r.title}`}>×</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!uid && <p className="hint"><Link href="/account?next=/reports">Sign in</Link> to keep reports in your account on every device and share them.</p>}
        </section>

        <section className="rb-sec">
          <h2>Report</h2>
          <label className="rb-field"><span>Title</span><input value={spec.title} maxLength={120} onChange={e => edit(s => ({ ...s, title: e.target.value }))} /></label>
          <label className="rb-field"><span>Prepared by</span><input value={spec.author} maxLength={80} placeholder="Your name or farm" onChange={e => edit(s => ({ ...s, author: e.target.value }))} /></label>
        </section>

        <section className="rb-sec">
          <h2>Share</h2>
          {!uid ? (
            <p className="hint"><Link href="/account?next=/reports">Sign in</Link> to share reports with other Agrigine accounts.</p>
          ) : !inAccount ? (
            <p className="hint">Save this report to your account, then share it with other accounts here.</p>
          ) : (
            <>
              <div className="rb-share">
                <label className="rb-field"><span>Their email</span><input type="email" value={shareEmail} placeholder="name@example.com" onChange={e => setShareEmail(e.target.value)} /></label>
                <label className="rb-field"><span>For</span>
                  <select value={shareDays} onChange={e => setShareDays(Number(e.target.value))}>{SHARE_DAYS.map(d => <option key={d} value={d}>{d} days</option>)}</select>
                </label>
                <button type="button" className="btn" disabled={!shareEmail.trim()} onClick={share}>Share</button>
              </div>
              {shareList.length > 0 && (
                <ul className="rb-saved">
                  {shareList.map(s => (
                    <li key={s.id}>
                      <span className="rb-open static"><b>{s.email}</b><span>{new Date(s.expiresAt) > new Date() ? `Until ${shortDate(s.expiresAt)}` : 'Expired'}</span></span>
                      <button type="button" className="rb-x" onClick={() => stopSharing(s)} aria-label={`Stop sharing with ${s.email}`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint">They can open and copy the last saved version until the share ends. Your saved settings stay in your account.</p>
            </>
          )}
        </section>

        <section className="rb-sec">
          <h2>Places <span className="rb-count">{places.length} of {MAX_PLACES}</span></h2>
          <ul className="rb-places">
            {places.map(p => (
              <li key={p.ref}>
                <i style={{ background: p.color }} />{p.label}
                <button type="button" className="rb-x" aria-label={`Remove ${p.label}`} onClick={() => editScope({ places: spec.scope.places.filter(r => r !== p.ref) })}>×</button>
              </li>
            ))}
          </ul>
          {places.length < MAX_PLACES && (
            <label className="rb-field">
              <span>Add a county or state</span>
              <input list="rb-place-list" value={placeText} placeholder="e.g. Story County, Iowa" onChange={e => addPlace(e.target.value)} />
              <datalist id="rb-place-list">{options.map(o => <option key={o.ref} value={o.label} />)}</datalist>
            </label>
          )}
        </section>

        <section className="rb-sec">
          <h2>Crop and years</h2>
          <div className="seg wide" role="group" aria-label="Crop">
            {CROPS.map(c => <button key={c} type="button" aria-pressed={c === k} onClick={() => editScope({ crop: c })}>{CROP_TITLE[c]}</button>)}
          </div>
          <div className="rb-row">
            <label className="rb-field"><span>From</span>
              <select value={from} onChange={e => editScope({ from: Number(e.target.value) })}>{ALL_YEARS.filter(y => y <= to).map(y => <option key={y} value={y}>{yearOption(y)}</option>)}</select>
            </label>
            <label className="rb-field"><span>To</span>
              <select value={to} onChange={e => editScope({ to: Number(e.target.value) })}>{ALL_YEARS.filter(y => y >= from).map(y => <option key={y} value={y}>{yearOption(y)}</option>)}</select>
            </label>
            <label className="rb-field"><span>Focus season</span>
              <select value={year} onChange={e => editScope({ year: Number(e.target.value) })}>{ctx.years.map(y => <option key={y} value={y}>{yearOption(y)}</option>)}</select>
            </label>
          </div>
          {to > LAST_OBSERVED_YEAR && <p className="hint">{LAST_OBSERVED_YEAR + 1}–{LAST_YEAR} are predicted seasons. Charts hatch them and the CSV marks them.</p>}
        </section>

        <section className="rb-sec">
          <h2>Blocks <span className="rb-count">{spec.blocks.length}</span></h2>
          <ol className="rb-blocks">
            {spec.blocks.map((b, j) => {
              const def = BLOCKS[b.type], Editor = def.Editor, isOpen = open === b.id;
              return (
                <li key={b.id} className="rb-block">
                  <div className="rb-block-head">
                    <button type="button" className="rb-block-name" aria-expanded={Editor ? isOpen : undefined} disabled={!Editor} onClick={() => setOpen(isOpen ? null : b.id)}>
                      {def.name}{Editor && <span aria-hidden>{isOpen ? '▾' : '▸'}</span>}
                    </button>
                    <button type="button" className="rb-x" disabled={j === 0} onClick={() => moveBlock(b.id, -1)} aria-label={`Move ${def.name} up`}>↑</button>
                    <button type="button" className="rb-x" disabled={j === spec.blocks.length - 1} onClick={() => moveBlock(b.id, 1)} aria-label={`Move ${def.name} down`}>↓</button>
                    <button type="button" className="rb-x" onClick={() => editBlock(b.id, () => null)} aria-label={`Remove ${def.name}`}>×</button>
                  </div>
                  {Editor && isOpen && <div className="rb-block-body"><Editor o={b.options} set={patch => editBlock(b.id, x => ({ ...x, options: { ...x.options, ...patch } }))} /></div>}
                </li>
              );
            })}
          </ol>
          <h3>Add a block</h3>
          <div className="rb-add">
            {BLOCK_TYPES.map(t => (
              <button key={t} type="button" onClick={() => addBlock(t)}><b>+ {BLOCKS[t].name}</b><span>{BLOCKS[t].blurb}</span></button>
            ))}
          </div>
        </section>
      </aside>

      <main className="rb-main">
        <div className="rb-actions">
          <span className="rb-status" role="status">
            {note ?? (sharedFrom ? `Shared by ${sharedFrom.from} until ${shortDate(sharedFrom.expiresAt)}. Save to keep your own copy.`
              : dirty ? 'Unsaved changes' : inAccount ? 'Saved to your account' : saved.some(r => r.id === spec.id) ? 'Saved in this browser' : 'Not saved yet')}
          </span>
          <button type="button" className="btn primary" onClick={save}>{uid ? 'Save to account' : 'Save'}</button>
          <button type="button" className="btn" onClick={() => window.print()}>Print or save PDF</button>
          <button type="button" className="btn" onClick={exportCsv} disabled={!places.length || !spec.blocks.length}>Download data (CSV)</button>
          <button type="button" className="btn" onClick={exportSettings} title="A small file that rebuilds this exact report">Download settings</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Open settings file</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { importSettings(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <article className="rdoc" aria-label="Report preview">
          <header className="rdoc-head">
            <p className="rdoc-eyebrow">Agrigine report · {CROP_TITLE[k]} · {from === to ? from : `${from}–${to}`} · focus on {year}</p>
            <h1>{spec.title || 'Untitled report'}</h1>
            <p className="rdoc-meta">{spec.author ? `Prepared by ${spec.author} · ` : ''}{generated}</p>
            {places.length > 0 && <ul className="rdoc-places">{places.map(p => <li key={p.ref}><i style={{ background: p.color }} />{p.label}</li>)}</ul>}
          </header>
          {!places.length ? (
            <p className="r-empty">Add a county or state on the left to fill in the report.</p>
          ) : !spec.blocks.length ? (
            <p className="r-empty">Add blocks on the left: a season summary, charts, tables, a map or your own notes.</p>
          ) : spec.blocks.map(b => {
            const def = BLOCKS[b.type], View = def.View;
            const blank = b.type === 'notes' && !String(b.options.text ?? '').trim();
            return (
              <section key={b.id} className={`rsec${blank ? ' r-placeholder' : ''}`}>
                <h2>{def.title(b.options, ctx)}</h2>
                <View o={b.options} ctx={ctx} />
              </section>
            );
          })}
          <footer className="rdoc-foot">
            {sources.length > 0 && <p><b>Sources.</b> {sources.join('; ')}.</p>}
            {places.some(p => p.isState) && <p><b>State rows</b> combine the state&apos;s counties: totals for dollars and counts, the worst for drought level, and the county median for everything else.</p>}
            <p>Made with Agrigine from public data for {FIRST_YEAR}–{LAST_OBSERVED_YEAR}.{to > LAST_OBSERVED_YEAR || spec.blocks.some(b => b.options.cover === 'predicted' || b.type === 'farm') ? ` Seasons ${LAST_OBSERVED_YEAR + 1}–${LAST_YEAR} are Agrigine predictions made from data through December 31, ${LAST_OBSERVED_YEAR}, not records.` : ''} To rebuild this exact report, open its settings file in Agrigine&apos;s report builder. Report {spec.id}, settings version {spec.schema}.</p>
          </footer>
        </article>
      </main>
    </div>
  );
}
