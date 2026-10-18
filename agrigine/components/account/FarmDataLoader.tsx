'use client';
import dynamic from 'next/dynamic';

// The page reads the data bundle and the signed-in session, so it renders in the browser only.
const FarmData = dynamic(() => import('./FarmData'), { ssr: false, loading: () => <p className="acct-note">Loading…</p> });

export default function FarmDataLoader() {
  return <FarmData />;
}
