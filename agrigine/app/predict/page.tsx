import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import PredictDateNote from '@/components/PredictDateNote';
import FarmPredictLoader from '@/components/predict/FarmPredictLoader';
import RequireSignIn from '@/components/account/RequireSignIn';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = { title: 'Predict' };

// What's predicted, how, and how it scored on years it never saw (notebooks/Agrigine_*.ipynb).
const LIVE = [
  { name: 'Season yield, day by day', status: 'Live', q: 'What yield is the season this day belongs to expected to end with? Updated every day of the season from conditions so far.',
    how: 'Gradient boosting on season-to-date weather, water balance, soil moisture and drought', score: 'Soybeans: 11% closer than the trend at harvest. Corn, wheat and sorghum don’t beat the trend yet (experimental)' },
  { name: 'Chance of severe drought', status: 'Live', q: 'How likely is D2 or worse here within 4 and 8 weeks? Every day of the year.',
    how: 'Gradient boosting classifier on current drought, rain, water balance and soil moisture', score: '87% better than the county’s usual rate (4 weeks); ranks counties that turn dry at 0.93' },
  { name: 'Frost risk and safe planting', status: 'Live', q: 'What’s the chance of another freeze after this date, or one by it in fall?',
    how: 'Each county’s 26 years of freeze dates', score: 'Safe dates set on 2000–2018 saw a later frost in 9.7% of 2019–2025 springs (goal: 10% or less)' },
  { name: 'Every layer, 2026–2028', status: 'Live', q: 'What will each county look like for the next three years? Every layer, every day.',
    how: 'Yields and greenness from the winning models; drought and soil moisture fade from Dec 31, 2025 to normal; everything else the county’s typical season', score: 'Starting from Dec 31 beats starting from normal for soil moisture by 69% in the first month' },
];

export default function PredictPage() {
  return (
    <div className="page">
      <TopBar active="predict" />
      <RequireSignIn page="/predict" title="Predict" why="Set your farm's location, build simple models from your own yields, and save them to your account to see their predictions in Explore and in reports. Farms and models live in your account, so sign in first.">
      <main className="predict">
        <header className="predict-head">
          <p className="eyebrow">Experimental · tested on years the models never saw</p>
          <h1>Predict</h1>
          <Suspense fallback={null}><PredictDateNote /></Suspense>
          <p className="predict-lede">Every layer is predicted through 2028. Drag the date dial past 2025 in <Link href="/?date=2026-07-15">Explore</Link> and everything you see is a prediction, marked Predicted. These are the predictions behind it and how each one scored.</p>
        </header>

        <FarmPredictLoader />

        <h2 className="predict-sub">What Agrigine predicts for every county</h2>
        <section className="predict-grid" aria-label="Predictions">
          {LIVE.map(p => (
            <article key={p.name} className="predict-card">
              <span className="predict-tag live">{p.status}</span>
              <h2>{p.name}</h2>
              <p className="predict-q">{p.q}</p>
              <dl>
                <div><dt>How</dt><dd>{p.how}</dd></div>
                <div><dt>Tested on 2016–2025</dt><dd>{p.score}</dd></div>
              </dl>
            </article>
          ))}
        </section>

        <section className="predict-how">
          <h2>How the predictions are made and checked</h2>
          <ul>
            <li><b>Tested on unseen years.</b> Each of 2016–2025 was predicted using only earlier seasons; the scores above come from that.</li>
            <li><b>The simplest method that works.</b> A model is used only where it beat the county’s own average. Weather years ahead can’t be known, so those layers show the county’s typical season.</li>
            <li><b>Pre-run, not live.</b> Every prediction starts from the last day of data (Dec 31, 2025), so they are computed once and served as files: instant, and free. They re-run when new data arrives.</li>
          </ul>
          <p>The notebooks behind every number are in the repo: <code>notebooks/Agrigine_Forecasts.ipynb</code>, <code>Agrigine_Daily_Predictions.ipynb</code> and <code>Agrigine_2026_2028.ipynb</code>.</p>
        </section>

        <p className="predict-credits">
          Data: USDA NASS (this product uses the NASS API but is not endorsed or certified by NASS), U.S. Drought Monitor (National Drought Mitigation Center, USDA and NOAA), NOAA ACIS and Storm Events, NASA POWER, MODIS and GIBS imagery, USDA NRCS SSURGO, USDA RMA Cause of Loss, and the U.S. Census Bureau.
        </p>
      </main>
      </RequireSignIn>
    </div>
  );
}
