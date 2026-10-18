'use client';
import dynamic from 'next/dynamic';

// Reads the data bundle and the signed-in session, so it renders in the browser only.
const FarmPredict = dynamic(() => import('./FarmPredict'), { ssr: false, loading: () => <p className="acct-note">Loading…</p> });

export default function FarmPredictLoader() {
  return <FarmPredict />;
}
