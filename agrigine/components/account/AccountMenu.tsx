'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase';
import type { PageId } from '../NavSwitch';

/** The top bar's profile button: "Sign in", or the signed-in person's initial, which opens their profile. */
export default function AccountMenu({ active }: { active: PageId }) {
  const { session, ready } = useAuth();
  const current = active === 'account' || active === 'data' ? 'page' : undefined;
  if (!ready) return <span className="acct-btn" aria-hidden />;
  if (!session) return <Link href="/account" className="acct-btn signin" aria-current={current}>Sign in</Link>;
  const email = session.user.email ?? '', name = String(session.user.user_metadata?.display_name ?? '').trim();
  return (
    <Link href="/account" className="acct-btn" aria-current={current} aria-label={`Your profile (${name || email})`} title={`Your profile · ${name || email}`}>
      <span className="acct-dot" aria-hidden>{(name || email).charAt(0).toUpperCase() || '?'}</span>
    </Link>
  );
}
