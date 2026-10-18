'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/supabase';

/**
 * Shows a page only to signed-in people. Report and Predict save to the account (reports, shares, farms, models),
 * so signed-out visitors get a card saying what the page does and a button that brings them back after signing in.
 */
export default function RequireSignIn({ page, title, why, children }: { page: string; title: string; why: string; children: ReactNode }) {
  const { session, ready } = useAuth();
  if (!ready) return <main className="acct"><p className="acct-note">Checking your sign-in…</p></main>;
  if (session) return <>{children}</>;
  return (
    <main className="acct">
      <div className="acct-card">
        <h1>{title}</h1>
        <p className="acct-lede">{why}</p>
        <Link className="btn primary" href={`/account?next=${page}`}>Sign in to continue</Link>
        <p className="acct-note">No account yet? Signing in creates one with your email and a password. Explore stays open to everyone.</p>
      </div>
    </main>
  );
}
