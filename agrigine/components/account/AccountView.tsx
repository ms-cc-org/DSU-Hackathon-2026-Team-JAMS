'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { farmSummary, listMyReports, setDisplayName, sharedWithMe, type AccountReport, type FarmSummary, type SharedReport } from '@/lib/account';
import { finishRecovery, supabase, useAuth } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'reset';
interface Message { tone: 'error' | 'ok'; text: string }

/** Supabase's messages, in plain words where we know them. */
function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match an account.';
  if (/already registered|already been registered/i.test(m)) return 'An account already uses that email. Sign in instead.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you.';
  if (/rate limit/i.test(m)) return 'Too many emails sent in the last hour. Try again later.';
  return m;
}

const Note = ({ m }: { m: Message | null }) => (m ? <p className={m.tone === 'error' ? 'acct-error' : 'acct-ok'} role={m.tone === 'error' ? 'alert' : 'status'}>{m.text}</p> : null);

export default function AccountView() {
  const { session, ready, recovering } = useAuth();
  if (!ready) return <p className="acct-note">Checking your sign-in…</p>;
  if (recovering) return <NewPassword />;
  if (session) return <Profile user={session.user} />;
  return <SignInForms />;
}

function SignInForms() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Message | null>(null);

  // After signing in, go back to the page that sent people here (?next=/reports), if any.
  const goNext = () => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) router.push(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const auth = supabase().auth;
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
        goNext();
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/account` } });
        if (error) throw error;
        if (data.session) goNext();
        else setMsg({ tone: 'ok', text: `Almost done: open the link we sent to ${email} to confirm your account, then sign in.` });
      } else {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account` });
        if (error) throw error;
        setMsg({ tone: 'ok', text: `If ${email} has an account, a link to set a new password is on its way.` });
      }
    } catch (err) {
      setMsg({ tone: 'error', text: friendly(err) });
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => { setMode(m); setMsg(null); };
  return (
    <div className="acct-card">
      <h1>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password'}</h1>
      <p className="acct-lede">
        {mode === 'reset'
          ? 'Enter your email and we’ll send a link to set a new password.'
          : 'An account keeps your reports on every device, lets you share them, and holds your own farm records. Only you can see your records.'}
      </p>
      <form onSubmit={submit} className="acct-form">
        <label className="rb-field"><span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        {mode !== 'reset' && (
          <label className="rb-field"><span>Password{mode === 'signup' ? ' (8 characters or more)' : ''}</span>
            <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} />
          </label>
        )}
        <Note m={msg} />
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>
      <p className="acct-switch">
        {mode === 'signin' ? (
          <>New here? <button type="button" className="linkbtn" onClick={() => switchTo('signup')}>Create an account</button> · <button type="button" className="linkbtn" onClick={() => switchTo('reset')}>Forgot your password?</button></>
        ) : (
          <>Have an account? <button type="button" className="linkbtn" onClick={() => switchTo('signin')}>Sign in</button></>
        )}
      </p>
    </div>
  );
}

interface ProfileData { uid: string; reports: AccountReport[]; shared: SharedReport[]; farm: FarmSummary }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/** The signed-in person's profile: who they are, what they've saved and shared, their farm data, and settings. */
function Profile({ user }: { user: User }) {
  const email = user.email ?? '';
  const name = String(user.user_metadata?.display_name ?? '').trim();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([listMyReports(user.id), sharedWithMe(), farmSummary()])
      .then(([reports, shared, farm]) => live && setData({ uid: user.id, reports, shared, farm }))
      .catch(e => live && setError((e as Error).message));
    return () => { live = false; };
  }, [user.id]);
  const d = data?.uid === user.id ? data : null;
  const count = (n: number | undefined) => (d ? String(n) : '…');

  return (
    <div className="prof">
      <header className="prof-head">
        <span className="prof-avatar" aria-hidden>{(name || email).charAt(0).toUpperCase() || '?'}</span>
        <div className="prof-who">
          <p className="eyebrow">Your profile</p>
          <h1>{name || email}</h1>
          <p className="prof-meta">{name ? `${email} · ` : ''}Member since {day(user.created_at)}</p>
        </div>
      </header>

      <div className="prof-stats">
        <Link href="/reports" className="prof-stat"><b>{count(d?.reports.length)}</b><span>saved reports</span></Link>
        <Link href="/reports" className="prof-stat"><b>{count(d?.shared.length)}</b><span>shared with you</span></Link>
        <Link href="/data" className="prof-stat"><b>{count(d?.farm.records)}</b><span>farm records{d && d.farm.counties ? ` in ${d.farm.counties} ${d.farm.counties === 1 ? 'county' : 'counties'}` : ''}</span></Link>
      </div>
      {error && <p className="acct-error" role="alert">Couldn’t load your profile: {error}</p>}

      <section className="prof-sec">
        <div className="prof-sec-head"><h2>Your reports</h2><Link href="/reports" className="linkbtn">Open Report</Link></div>
        {!d ? <p className="acct-note">Loading…</p> : !d.reports.length ? (
          <p className="acct-note">No saved reports yet. Build one in <Link href="/reports">Report</Link> and press Save to account.</p>
        ) : (
          <ul className="prof-list">
            {d.reports.slice(0, 5).map(r => (
              <li key={r.rowId}><Link href={`/reports?id=${r.spec.id}`}><b>{r.spec.title}</b><span>Saved {day(r.updatedAt)}</span></Link></li>
            ))}
          </ul>
        )}
      </section>

      {d && d.shared.length > 0 && (
        <section className="prof-sec">
          <h2>Shared with you</h2>
          <ul className="prof-list">
            {d.shared.map(r => (
              <li key={r.rowId}><Link href="/reports"><b>{r.spec.title}</b><span>From {r.from} · until {day(r.expiresAt)}</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="prof-sec">
        <div className="prof-sec-head"><h2>Your farm data</h2><Link href="/data" className="linkbtn">Manage</Link></div>
        <p className="acct-note">
          {!d ? 'Loading…' : d.farm.records
            ? `${d.farm.records.toLocaleString()} records across ${d.farm.counties} ${d.farm.counties === 1 ? 'county' : 'counties'}, ${d.farm.from === d.farm.to ? d.farm.from : `${d.farm.from}–${d.farm.to}`}. Only you can see them.`
            : 'No records yet. Upload your field records to compare them with the county.'}
        </p>
      </section>

      <Settings name={name} />
    </div>
  );
}

function Settings({ name }: { name: string }) {
  const [display, setDisplay] = useState(name);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<Message | null>(null);
  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    try { await setDisplayName(display); setMsg({ tone: 'ok', text: 'Name saved.' }); } catch (err) { setMsg({ tone: 'error', text: friendly(err) }); }
  };
  const change = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase().auth.updateUser({ password });
    setMsg(error ? { tone: 'error', text: friendly(error) } : { tone: 'ok', text: 'Password changed.' });
    if (!error) setPassword('');
  };
  return (
    <section className="prof-sec">
      <h2>Settings</h2>
      <div className="prof-settings">
        <form onSubmit={saveName} className="acct-form">
          <label className="rb-field"><span>Display name</span><input value={display} maxLength={60} placeholder="Your name or farm" onChange={e => setDisplay(e.target.value)} /></label>
          <button type="submit" className="btn">Save name</button>
        </form>
        <form onSubmit={change} className="acct-form">
          <label className="rb-field"><span>New password (8 characters or more)</span>
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="btn">Change password</button>
        </form>
      </div>
      <Note m={msg} />
      <button type="button" className="btn prof-signout" onClick={() => supabase().auth.signOut()}>Sign out</button>
    </section>
  );
}

function NewPassword() {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<Message | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase().auth.updateUser({ password });
    if (error) return setMsg({ tone: 'error', text: friendly(error) });
    finishRecovery();
  };
  return (
    <div className="acct-card">
      <h1>Set a new password</h1>
      <form onSubmit={save} className="acct-form">
        <label className="rb-field"><span>New password (8 characters or more)</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <Note m={msg} />
        <button type="submit" className="btn primary">Save password</button>
      </form>
    </div>
  );
}
