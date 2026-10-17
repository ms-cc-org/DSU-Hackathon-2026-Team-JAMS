import type { Metadata } from 'next';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = { title: 'Plan' };

export default function PlanPage() {
  return (
    <div className="plan-page">
      <TopBar active="plan" />
      <main className="plan">
        <div className="plan-in">
          <section>
            <p className="eyebrow">Team plan · DSU Data to Harvest · Oct 17–18, 2026</p>
            <h1>Agrigine</h1>
            <p className="lede">A globe you can click. Every county in the hackathon data, colored by any layer, with a full profile one click away.</p>
          </section>

          <section>
            <h2>What the explorer does</h2>
            <ul>
              <li><b>Globe and map.</b> Agrigine opens on a 3D globe with country, state and county outlines, then flies to the four states. Switch to a flat map at any time and tilt it to see height.</li>
              <li><b>Layers by color group.</b> Five groups, each with its own color and icon: Crops (green), Drought (amber), Weather (blue), Land and water (aqua), Satellite (red, after false-color infrared). Pick any of 19 layers to color the map.</li>
              <li><b>A key that filters.</b> The key counts the counties in each color band. Click a band to hide or show those counties.</li>
              <li><b>Two layers at once.</b> Color shows one layer and height shows another, for example yield vs trend in color with weeks of severe drought as height.</li>
              <li><b>Click anything.</b> A county opens a full profile in six tabs: Overview, Crops, Weather, Drought, Land and water, Satellite. A state opens a state summary. Anywhere else says what Agrigine covers.</li>
              <li><b>Time.</b> The season slider runs 2000 to 2025, with Play, and a strip that shows which seasons were drought seasons.</li>
              <li><b>Shareable views.</b> The address bar always holds the current view, so a link opens the same county, season and layers.</li>
            </ul>
          </section>

          <section>
            <h2>How it is built</h2>
            <div className="ptable">
              <table>
                <thead><tr><th>Part</th><th>Build</th><th>Note</th></tr></thead>
                <tbody>
                  <tr><td>Data bundle</td><td><code>scripts/build_data.py</code> reads the repo&apos;s <code>data/</code> files and writes <code>public/data/agrigine.json</code></td><td>2.6 MB for all 253 counties, with monthly weather and weekly drought</td></tr>
                  <tr><td>Globe and map</td><td>deck.gl in a Next.js client component</td><td>The same engine as Streamlit&apos;s <code>st.pydeck_chart</code></td></tr>
                  <tr><td>Outlines</td><td>The world-atlas and us-atlas packages</td><td>Natural Earth and U.S. Census boundaries</td></tr>
                  <tr><td>Backend</td><td>None yet</td><td>Everything is static files. The Phase 2 evidence step adds its results to the bundle</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>What the judges still need</h2>
            <div className="callout">
              <p>The explorer is the tool. The minimum deliverable still asks for <b>one named user, one decision, and one piece of evidence checked on years it wasn&apos;t built on</b>, and those two rubric items are 40% of the score.</p>
              <p>Recommended: a <b>state drought program coordinator</b> deciding <b>which counties get drought help first</b>. The county profile already shows their report card (drought history, losses in severe-drought seasons, soil). Phase 2 adds a Priority layer: counties ranked on 2000–2015 and scored on 2016–2025 against random rankings and a drought-frequency baseline.</p>
            </div>
          </section>

          <section>
            <h2>Phases</h2>
            <div className="ptable">
              <table>
                <thead><tr><th>Phase</th><th>When</th><th>Done when</th></tr></thead>
                <tbody>
                  <tr><td>1. Explorer</td><td>Now → Checkpoint 2, Saturday evening</td><td>Globe, layers, filtering key, search and the county profile run from the static bundle</td></tr>
                  <tr><td>2. Evidence</td><td>Saturday evening → Sunday 6 AM</td><td>The Priority layer and its held-out score appear on the map and in each profile, whatever the result</td></tr>
                  <tr><td>3. Polish</td><td>Sunday 6–9 AM</td><td>Demo path rehearsed on the real build, rough edges fixed, nothing new added</td></tr>
                  <tr><td>Freeze</td><td>Sunday 9 AM → noon</td><td>README run steps and AI disclosure written, pitch rehearsed twice, form submitted with the 40-character SHA</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>Five-minute demo path</h2>
            <ol>
              <li>Open on the globe and fly in. Name the user and the decision.</li>
              <li>Color by yield vs trend with drought weeks as height, press Play, and stop on 2012.</li>
              <li>Click the key to show only counties 30% or more below trend.</li>
              <li>Click one and walk through its profile: weekly drought, monthly rain, soil, irrigation.</li>
              <li>Show the Priority layer and its 2016–2025 score. Close on limits and the open-source roadmap.</li>
            </ol>
          </section>

          <p className="credits">
            Data: U.S. Drought Monitor, jointly produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln, the United States Department of Agriculture, and the National Oceanic and Atmospheric Administration. This product uses the NASS API but is not endorsed or certified by NASS. Weather from the Applied Climate Information System (ACIS), NOAA Regional Climate Centers. Soil: Soil Survey Staff, NRCS, USDA, SSURGO. MODIS MOD13Q1 v061, NASA LP DAAC. County boundaries: U.S. Census Bureau via plotly/datasets. World and state outlines: Natural Earth via world-atlas and us-atlas.
          </p>
        </div>
      </main>
    </div>
  );
}
