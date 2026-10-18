# Agrigine architecture

## Why the app is shaped like this

Agrigine answers one question for a farmer, insurer or researcher: *what is happening to crops in this county, on this day, and what is likely next?* Three choices follow from that and explain most of the design.

1. **The data is small enough to ship whole.** About 300 counties × 26 years × 60 layers, plus daily weather, fits in ~115 MB of compact files. So there is no database query path and no API server for the data: the browser downloads what it needs and computes every layer, chart and profile itself. That makes every interaction instant, works offline once loaded, and costs nothing to serve.
2. **Predictions are pre-run, not hosted.** Every forecast starts from the same fixed point (the last day of data) and is the same for everyone, so it is computed once in notebooks and served as files, exactly like the historical data. No model server, no cold starts, no GPU bill.
3. **Only the personal parts need a backend.** Accounts, saved reports, shares and a farmer's own field records are the only state that differs per person. That goes to a managed Postgres (Supabase) with row-level security, reached directly from the browser. Farm models are tiny (a handful of coefficients), so even those are fitted in the browser and only their results are saved.

The result is a static site plus two free managed services, with the heavy work (data pulls, model training) done offline in Python.

```
                 offline, when data changes                      at run time
┌──────────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────────┐
│ scripts/  (Python pipeline)  │──▶│ public/data/ (static     │──▶│ Browser: Next.js static site │
│ notebooks/ (model training)  │   │ files on Cloudflare Pages)│   │  computes layers, charts,    │
└──────────────────────────────┘   └─────────────┬────────────┘   │  profiles, farm models       │
                                                 │                └──────┬────────────────┬──────┘
                                   ┌─────────────▼────────────┐          │                │
                                   │ Cloudflare Worker (MCP)  │   ┌──────▼──────┐  ┌──────▼──────┐
                                   │ for AI assistants        │   │ Supabase    │  │ NASA GIBS   │
                                   └──────────────────────────┘   │ auth + DB   │  │ map tiles   │
                                                                  └─────────────┘  └─────────────┘
```

---

## Frontend

### Structure

A Next.js 16 app in `agrigine/`, exported as static files (`output: "export"`). There is no server rendering of data: pages are shells that load everything in the browser.

| Folder | What lives there |
|---|---|
| `app/` | One route per page: `/` Explore, `/reports`, `/predict`, `/account`, `/data`. Each is a thin server component that renders the top bar and a client loader. `globals.css` holds every style, as design tokens (colors, type, spacing) with light and dark mode. |
| `components/` | Explore: `Explorer`, `GlobeMap`, `LayersPanel`, `Timeline`, `SearchBox`, `profile/` (county profile tabs). `report/`: the builder, the block registry and the print charts. `predict/`: the farm-model builder. `account/`: sign-in, profile, farm data upload, and the `RequireSignIn` gate. |
| `lib/` | Everything that is not UI. `data.ts` loads the bundle; `daily.ts` the day files; `metrics.ts` is the catalog of ~60 layers (how to read, bin, color and format each); `compute.ts` derived values; `state.ts` the Explore state and its URL encoding; `predict.ts`, `farmmodel.ts`, `farms.ts` prediction readers and farm models; `account.ts`, `supabase.ts` the backend client; `report/` the report spec, places, CSV and storage. |
| `public/data/` | The data the browser downloads (see Backend). |

**How a layer works.** Every layer is one entry in `lib/metrics.ts`: a `get(county, crop, yearIndex, dayContext)` function, a `bins(crop)` function that returns the key (cut points and colors), and `format`/`short` for labels. The globe, the key, the hover card, the profile charts, the report blocks and the MCP server all read the same entry, so adding a layer is adding one object. Layers marked `predicted: true` read prediction channels instead of records.

**How state works.** Explore's state (layer, crop, date, filters, camera, 3D, shown farm models) lives in one reducer in `lib/state.ts` and is mirrored into the URL, so any view is a shareable link and the back button works. The three pages are kept mounted when switching tabs, so coming back to Explore doesn't reload the globe.

### Libraries

| Library | Role |
|---|---|
| **Next.js 16** (App Router), **React 19**, **TypeScript 5** | Routing, components, types. Static export only. |
| **deck.gl 9.4** (`core`, `layers`, `geo-layers`, `react`) | The WebGL globe and map (see the next section). |
| **@supabase/supabase-js** | Sign-in and the account database, called straight from the browser. |
| **topojson-client**, **world-atlas**, **us-atlas** | Country and state outlines for the globe. |
| **Google Fonts** via `next/font` | Big Shoulders (titles), Public Sans (text). |
| No chart library, no CSS framework, no state library | Charts are hand-written SVG so they print cleanly and stay under 10 KB; styles are one CSS file; state is a reducer plus the URL. |

### Features

- **Explore:** ~60 county layers (crops, drought, weather, storms, land and water, satellite) over a 3D globe or flat map; a date dial that moves day by day from 2000 through 2028; a filtering key (click bands to show only matching counties); typed dates; county search; a hover card; the county profile with tabs (season, this day, drought, weather, storms, insurance, land, records, farm models); farm pins with the shown model's value; every view encoded in the URL.
- **Report:** build a report from blocks (season at a glance, side by side, over the years, day by day, drought history, insurance, storms, soil and land, map, my farm models, notes); each block has chart choices (table, strip, line, bars, pie) and runs through the predicted seasons with those marked; live preview; print to PDF; CSV export with a status column; settings file that rebuilds the report; save to the account; share with another account for 7, 30 or 90 days.
- **Predict:** set a farm's location (county or device location), upload field records as CSV, build a model from the farm's own yields, see how it tested, save it, and then see its predictions in Explore and in reports. Below that, what is predicted for every county and how each prediction scored.
- **Account:** email and password sign-in, profile, saved and shared reports, farm data upload with validation against a template, download or delete everything.

---

## The globe

The map is the part people compare to Google Earth. It is built from deck.gl primitives, with no map SDK and no key.

**Projection and views.** `GlobeView` renders the earth as a true sphere in WebGL; zooming in past the point where curvature stops mattering, the same layers are drawn in a flat `MapView` (Web Mercator). Both views take the same layer list, so there is one rendering path. The camera (longitude, latitude, zoom, pitch, bearing) is part of the URL state and animates between views with deck.gl's transition interpolator.

**Imagery.** Satellite tiles come from NASA's Global Imagery Browse Services (GIBS), which are public domain and need no key, through a `TileLayer` that hands each tile to a `BitmapLayer`:

- **Blue Marble Next Generation** when zoomed out: a cloud-free composite, so the globe looks like the familiar "marble".
- **Landsat WELD** annual true-color composites up close (30 m), which show fields and towns.
- **MODIS Terra true color for the exact date on the dial**, as an optional layer. This is a real photo of that day, clouds included, so a drought summer or a flood is visible as it was.

GIBS serves tiles in the Google Maps–compatible tiling scheme, which is why zoom levels and `{z}/{y}/{x}` URLs line up with deck.gl's tile layer without conversion.

**Counties.** County shapes are polygons in the data bundle (simplified to ~25 KB per state). They are drawn as a `SolidPolygonLayer` colored by the current layer's key, and in 3D mode as an extruded `PolygonLayer` whose height follows the same key bands, so color and height always agree. Outlines (`GeoJsonLayer`, `PathLayer`) come from the TopoJSON atlases. Cities are a `ScatterplotLayer` plus a `TextLayer`; farm pins are the same with labels. A `LightingEffect` (ambient plus a camera-attached light) shades the extrusions so heights read at any angle.

**Interaction.** deck.gl's picking gives the county under the cursor on every frame; the hover card is a plain DOM element positioned next to the cursor, so it styles like the rest of the app and prints nothing. Clicking a county opens its profile. Reduced-motion preferences turn transitions off.

**Why deck.gl and not Google Maps / Mapbox / Cesium.** No key, no per-load pricing, no vendor styles; the globe view ships in the core library; and because layers are plain data arrays, re-coloring 300 counties for a new date is a buffer update, not a re-render, which is what makes dragging the date dial smooth.

---

## Backend

There is no application server. "Backend" here means the data pipeline, the files it produces, and the two managed services.

### Structure

| Part | Where | What it does |
|---|---|---|
| **Data pipeline** | `agrigine/scripts/` (Python) | `pull_all.py` fetches every source and writes the raw tables in `data/` and the app's files in `agrigine/public/data/`. One script per source. |
| **Static data** | `agrigine/public/data/` | `agrigine.json`: the bundle (counties, geometry, every season and fixed layer, 2000–2025). `daily/<year>.bin`: int16 `[channel][county][day]` arrays of daily weather and derived measures, one file per year. `predict/`: the same layout for prediction channels, plus `future.json` with the 2026–2028 season values that the app appends to the bundle at load. `api/`: small per-county and per-season JSON files for the MCP server. `samples/`: a sample farm CSV. |
| **MCP server** | `agrigine/worker/` (TypeScript on Cloudflare Workers) | Lets AI assistants query the data over the Model Context Protocol: `find_places`, `get_county_season`, `get_county_history`, `get_daily_weather`, `rank_counties`. Stateless JSON-RPC over HTTP; reads the `api/` files from the site and caches them at the edge. |
| **Accounts** | Supabase (Postgres + Auth), client in `agrigine/lib/account.ts` and `lib/supabase.ts` | Tables `reports`, `report_shares`, `farm_records`, `farm_uploads`, `farms`, `farm_models`. Row-level security limits every table to its owner; sharing goes through three `SECURITY DEFINER` functions that look up an account by email and enforce the share's end date. |

### Libraries

| Library | Role |
|---|---|
| **Python 3.11+**, **pandas**, **numpy**, **pyarrow** | The pipeline: reading APIs and CSVs, joins, derived measures (growing degree days, water balance, drought weeks), writing JSON and binary files. |
| **scikit-learn 1.6.1**, **joblib**, **Jupyter** | Model training and evaluation (see Predictive modeling). |
| **Cloudflare Workers runtime** + **wrangler** | The MCP server and deployment of both the Worker and the Pages site. |
| **Supabase** (Postgres, GoTrue auth, PostgREST) | Accounts and per-user data, with SQL policies as the authorization layer. |

### Features

- Reproducible data: one command rebuilds every file from public sources, and the built files are committed so a clone works without pulling.
- Compact formats: daily data as int16 with a per-channel scale, so a year of 300 counties × 30 channels is ~2.4 MB and loads in one request.
- Authorization in the database, not in app code: a browser can only ever read and write its own rows, whatever the client does.
- An AI-readable interface: the same data, served to assistants through MCP without any extra infrastructure.

---

## Predictive modeling

### The techniques, and where each is used

Agrigine uses machine learning where it measurably beats a simple baseline, and plain statistics everywhere else. Every candidate was tested the same way: predict each of 2016–2025 using only earlier seasons (a rolling-origin backtest), and keep a model only if it cuts the baseline's error on those unseen years. The work is in three notebooks in `notebooks/`.

| Technique | Is it ML? | Where it is used | Why here |
|---|---|---|---|
| **Gradient-boosted decision trees** (scikit-learn `HistGradientBoostingRegressor` / `Classifier`) | Yes | Day-by-day season yield; chance of severe drought in 4 and 8 weeks; satellite greenness a season ahead; a yield candidate for sorghum | Handles mixed inputs and nonlinear thresholds (yield falls off a cliff past a certain heat or drought level) with little tuning. The yield model predicts the *departure from the county trend*, not the yield itself, and uses **monotonic constraints** so that more heat or more drought can only lower the prediction. |
| **Neural network** (scikit-learn `MLPRegressor`, two hidden layers of 32 and 16 units, early stopping) | Yes | A candidate for multi-year forecasts of yields and greenness; it wins for sorghum two and three years ahead and for peak greenness three years ahead | Included to check whether a nonlinear model adds anything over the trend years ahead. For corn and soybeans it does not, so it is not used there. |
| **Linear trend / ridge regression** | Statistics | County yield trend 1–3 seasons ahead (the winner for corn and soybeans); the baseline the ML models must beat; the farm models (below) | Yields rise steadily with genetics and practice; a line through 26 seasons captures most of it, and 26 points are too few for anything complex to beat it reliably. |
| **Climatology** (the normal for each date and county) | Statistics | Single-day weather, storms, insurance payouts and season weather for 2026–2028; the fallback whenever a model didn't win | Weather years ahead is unknowable; the honest prediction is the typical value. |
| **Damped persistence ("fade")** | Statistics | Soil moisture, drought, water balance and recent rain for 2026–2028 | A departure from normal on December 31, 2025 fades toward normal at a rate measured from the data (the correlation between today's departure and the departure *n* days later). This beat plain normals by 69% in the first month for soil moisture. |
| **Empirical probability** | Statistics | Frost risk by date and the safe planting date | Each county's 26 years of first and last freeze dates give the chance of a freeze after any date directly. |
| **Least squares fitted in the browser** | Statistics | Farm models on Predict: *follow the county* (a ratio), *your own trend* (a line), *weather-adjusted* (trend plus drought weeks and rain, with light ridge shrinkage) | A farm has 5–20 seasons of data, so only tiny models are defensible. They are scored by leave-one-season-out against "just use your average", and run in milliseconds in the browser. |

There is no deep learning and no model is served at run time. Every score is in `BENCHMARKS.md`; the full parameter tables are in the README's *Predictive modeling → Training details*. The specifications, in short:

### Model specifications

```
SEASON FORECASTS, 1–3 YEARS AHEAD            notebooks/Agrigine_Forecasts.ipynb
  rows        county (× crop) × origin year T, answer at T+h, h ∈ {1,2,3}; 13 targets
  inputs      21 (crop targets): target at T,T−1,T−2; 6 drivers at T,T−1; expanding mean + count;
              origin year; AWS; drought-prone %; NCCPI; state (categorical)
  split       rolling origin: test Y ∈ 2016..2025; train = answer year ≤ Y−h; skip if <50 train or <5 test rows
  candidates  place_average | Ridge(alpha=10) on [year, onehot(fips)]
              | HistGradientBoostingRegressor(max_iter=250, lr=0.05, max_leaf_nodes=15,
                  min_samples_leaf=30, l2=1.0, categorical=[state], random_state=0)
              | MLPRegressor((32,16), alpha=2.0, max_iter=600, early_stopping, n_iter_no_change=20)
                  on median-imputed+indicator, standardized inputs; standardized target
  metric      MAE pooled over test years; skill = 1 − MAE/MAE(place_average)
  selection   lowest MAE with skill ≥ 0.05, else place_average
  interval    q10 / q90 of the winner's test residuals (80%)
  final       refit on answers ≤ 2025; no forecast with < 5 past values

SEASON YIELD, DAY BY DAY                     notebooks/Agrigine_Daily_Predictions.ipynb §2
  target      (yield / trailing_trend − 1) × 100; trend = OLS line on reported yields in [Y−15, Y−1], ≥ 6 points
  inputs      23 on day d: frac; season-to-date rain, GDD(10/30), days ≥35 °C, nights ≥22 °C (+ rain/GDD anomalies);
              30-day Tmax (+anom), rain30 anom, wb30 (+anom), vpd30; soil now/anom/season mean;
              DSCI now/season mean; D2+ weeks to date; AWS; drought-prone %; NCCPI; state
  model       HistGradientBoostingRegressor(loss='absolute_error', max_iter=200, lr=0.05, max_leaf_nodes=15,
                min_samples_leaf=200, l2=2.0, categorical=[state], random_state=0,
                monotonic_cst = −1 on {heat, hot nights, tmax30 anom, vpd30, dsci now, dsci mean, d2 weeks})
  centering   fit on y − mean(y_train) so neutral inputs → 0% (the trend)
  sampling    train: every 7th day of season × training seasons × counties; test: every day
  split       backtest: test season Y ∈ 2016..2025, train seasons < Y (40 folds);
              app files: leave-one-year-out 2000..2025; final: all 26 seasons
  metric      MAE (pct points) by day of season; skill vs trend-only (0% anomaly)

DROUGHT CHANCE, 4 / 8 WEEKS                  notebooks/Agrigine_Daily_Predictions.ipynb §3
  label       1 if any USDM map in d+1..d+28 (or d+56) has D2+ on > 1% of the county
  inputs      15: dsci now, d2 share, dsci 28-day change, rain30 anom, wb30 (+anom), soil now (+anom),
              tmax30 anom, vpd30, doy sin/cos, AWS, drought-prone %, state
  model       HistGradientBoostingClassifier(max_iter=250, lr=0.08, max_leaf_nodes=31, min_samples_leaf=200,
                l2=1.0, categorical=[state], random_state=0)
  sampling    train: every 7th day from 2000-01-18 to (Y−1)-12-31 − horizon (≈210k–330k rows); test: every day of Y
  split       rolling origin, Y ∈ 2016..2025 (20 folds); app files: leave-one-year-out minus windows touching Y
  baselines   county × month usual rate from 2000–2015 only; "same as now"
  metric      Brier (skill vs usual rate), AUC; reported for all days and for onsets (not in D2+ on day d)

FROST RISK                                   §4 — empirical: share of years with last spring freeze (Tmin ≤ 0 °C) ≥ d
  split       curves from 2000–2018; tested on 2019–2025; safe date = first d with risk ≤ 10%

FADE, 2026–2028 DAILY LAYERS                 notebooks/Agrigine_2026_2028.ipynb §1
  normal      2000–2025 mean per county × calendar slot, 15-day smoothed
  fade r[L]   lag-L autocorrelation of departures, L ≤ 399, pooled over counties, monotone, 0 once r < 0.05
  predict     normal + departure(2025-12-31) × r[L]
  test        origins Dec 31 of 2015..2024, leads 1–365; skill vs normal alone per lead band

FARM MODELS (browser)                        agrigine/lib/farmmodel.ts
  county_ratio (≥3 seasons) | own_trend OLS on year (≥5) | weather OLS on [year, rain_anom/10, d2_weeks], ridge 1.0 (≥8)
  split       leave-one-season-out; baseline = mean of other seasons; interval ±1.28 × RMSE(LOO residuals)
``` Training runs on all CPU cores with joblib (memory-mapped arrays, so workers share data instead of copying it) and takes minutes on an Apple Silicon laptop.

**How a prediction becomes a file.** `Agrigine_Forecasts.ipynb` tests the candidates and writes 2026–2028 season forecasts. `Agrigine_Daily_Predictions.ipynb` writes day-by-day predictions for 2000–2025, each year from a model that never saw it, so the past shows what the model would have said at the time. `Agrigine_2026_2028.ipynb` combines them into every layer for 2026–2028 in the app's own formats. The app appends `future.json` to the bundle at load and reads the daily prediction files exactly like recorded ones, so every feature below works on predictions without special code.

### Features that use predictive modeling

- **The date dial past 2025.** Every layer on the globe, the key, the hover card and the profile show predicted values for 2026–2028, labeled *Predicted*, with the timeline tinted from the first predicted day.
- **Predicted layers for any date.** *Expected season yield*, *chance of severe drought in 4 / 8 weeks* and *frost risk* are layers in their own right, available on past dates too (as the model would have said then), so a user can see how early a bad season was visible.
- **Crop values are seasonal.** Each day carries the expected end-of-season yield for the season it belongs to, as known on that day: the trend before planting, the day's prediction during the season, the final prediction after harvest. The UI says so wherever a crop number appears.
- **The county profile's "Predictions for this date"** section, with the score each prediction earned in testing.
- **Farm models on Predict**, built from the farmer's records, tested season by season, saved to the account, and toggled on in Explore (farm pin labels, the profile) and in reports.
- **Reports through 2028.** Every chart hatches the predicted seasons and dashes or lightens them; pies can add up only the predicted seasons; titles and the CSV mark predicted values.
- **The Predict page** lists what is predicted for every county, how, and how it tested, so the limits (for example, in-season corn yield not yet beating the trend) are stated next to the numbers.

---

## Hosting

The site is a static export on **Cloudflare Pages** (direct upload with `wrangler`), the MCP server is a **Cloudflare Worker**, accounts are on **Supabase's** hosted free tier, and map tiles come straight from **NASA GIBS**. The whole stack runs on free tiers.

### Advantages

- **Zero cost at any realistic scale.** Static files on Cloudflare have no request or bandwidth charges; Workers allow 100,000 requests a day; Supabase's free tier covers a hackathon's worth of accounts.
- **Fast everywhere.** Files are cached at Cloudflare's edge; the first load pulls the 6.6 MB bundle once, then everything is local. No server round-trip per interaction.
- **Nothing to keep alive.** No app server to crash, patch, scale or wake up. A deploy is a file upload, and a rollback is re-uploading the previous build.
- **Simple to reason about.** The browser's only writes go to Supabase, which enforces permissions in SQL. There is no middle tier where an authorization bug could hide.
- **Reproducible.** Because data and predictions are files in the repo, anyone can rebuild the exact site from a clone.

### Disadvantages

- **No server-side logic.** Anything that must stay secret (a paid API key, a private model) cannot ship, since all code runs in the browser or a tiny Worker. Personalized predictions on a farmer's private data must either be small enough to fit in the browser (the current approach) or wait for a hosted model.
- **Data updates are redeploys.** New seasons mean re-running the pipeline and notebooks and uploading again; there is no live feed. Fine for data that updates weekly or seasonally, wrong for anything real-time.
- **The bundle grows with coverage.** Covering every U.S. county, or many more layers, would push the single JSON past what a first load should carry, and the design would need to split it by state or layer and load on demand.
- **Free-tier limits and behavior.** Supabase pauses idle free projects after a week and must be restored by hand; Workers are capped at 10 ms of CPU per request, which is why the MCP server only serves pre-cut small files; Pages limits one file to 25 MiB.
- **Direct-upload deploys are manual.** Pushing to Git does not deploy; someone has to run the deploy command, and there is no preview environment per branch unless one is set up.
- **Public data URLs.** Every data file is a public URL by design. That is right for public data, but per-user data must never be put in `public/`, which is why farm records live only in Supabase.
