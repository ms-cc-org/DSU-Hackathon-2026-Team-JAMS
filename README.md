# Agrigine

An open-source research tool for county farm data that farmers can use too. Agrigine puts 26 years (2000–2025) of crop, weather, drought, soil, satellite, storm and crop-insurance data for every county in California, Delaware, Iowa and Nebraska on a 3D globe, with every layer predicted day by day through 2028. Click a county to see its full profile, or build a report to print or export.

Built for the DSU *Data to Harvest* hackathon, October 17–18, 2026.

<details>
<summary><b>Codebase structure</b> (click to expand)</summary>

```text
DSU-Hackathon/
├── README.md                         # this file
├── ARCHITECTURE.md                   # why the app is shaped this way: frontend, globe, backend, models, hosting
├── BENCHMARKS.md                     # every model's held-out test scores
├── data/                             # every data table; see "How the data is stored"
│   ├── master_dataset.csv / .parquet # hackathon master table: county × crop × year
│   ├── counties.geojson              # county outlines, feature id = fips
│   ├── data_dictionary.md            # every master field explained
│   ├── processed/                    # clean tables, one folder per source
│   │   ├── nass/  acis/  drought/  soil/  modis/  irrigation/    # hackathon base data
│   │   ├── derived/  storms/  power/daily/  insurance/  cities/  # added by Agrigine
│   │   └── master_build_log.json     # checks run when the master was built
│   └── raw/                          # download caches (gitignored, about 500 MB)
├── notebooks/                        # predictive modeling; see "Predictive modeling"
│   ├── Agrigine_Forecasts.ipynb      # 2026–2028 season forecasts: 4 candidate models, tested on 2016–2025
│   ├── Agrigine_Daily_Predictions.ipynb  # day by day: season yield, drought chance, frost risk, typical weather
│   ├── Agrigine_2026_2028.ipynb      # every layer for every day of 2026–2028, pre-run into app files
│   ├── Predictive_Model.ipynb        # the team's original Colab notebook, kept for reference
│   ├── forecasts/                    # model outputs: forecasts CSV, test scores, saved models (.joblib)
│   └── .venv/                        # Python with the pinned versions (gitignored)
├── agrigine/                         # the web app (Next.js) and its data pipeline
│   ├── app/                          # pages
│   │   ├── layout.tsx                # fonts and page metadata
│   │   ├── globals.css               # all styles: light/dark color tokens, print styles
│   │   ├── page.tsx                  # /         Explore: the globe
│   │   ├── reports/page.tsx          # /reports  report builder
│   │   ├── account/page.tsx          # /account  sign in, create account, reset password
│   │   ├── data/page.tsx             # /data     my farm data: upload, compare, download, delete
│   │   └── predict/page.tsx          # /predict  your farm's models, and what's predicted for every county
│   ├── components/
│   │   ├── Explorer.tsx              # Explore page: state, camera, keyboard, URL sync
│   │   ├── GlobeMap.tsx              # deck.gl globe/map, county layers, city dots, hover card
│   │   ├── LayersPanel.tsx           # layer picker, filtering key, reference layers
│   │   ├── Timeline.tsx              # the horizontal date dial
│   │   ├── SearchBox.tsx             # city, county and state search
│   │   ├── TopBar.tsx, NavSwitch.tsx # header with the Explore / Report / Predict switch and profile button
│   │   ├── PredictDateNote.tsx       # on Predict: the date someone typed past the predictions
│   │   ├── charts.tsx                # SVG charts used in profiles
│   │   ├── profile/                  # ProfilePanel.tsx + tabs.tsx: county and state profiles
│   │   ├── account/                  # sign-in forms, account button, farm data page
│   │   ├── predict/                  # FarmPredict.tsx: set your farm's location, build and save its models
│   │   └── report/                   # report builder
│   │       ├── ReportBuilder.tsx     # settings panel, live preview, save/print/CSV
│   │       ├── blocks.tsx            # block registry: the 10 report block types
│   │       └── ReportCharts.tsx      # print-friendly SVG charts
│   ├── lib/
│   │   ├── metrics.ts                # every map layer: how to read it, color it, format it
│   │   ├── state.ts                  # Explore state (reducer) and URL parsing
│   │   ├── daily.ts                  # dates (records to 2025, predictions to 2028), the daily weather reader
│   │   ├── predict.ts                # reader for the prediction files: season yield, drought chance, frost
│   │   ├── data.ts                   # loads the data bundle, merges in the 2026–2028 predictions, map outlines
│   │   ├── compute.ts, bins.ts, colors.ts   # turning values into map colors
│   │   ├── insurance.ts, storms.ts          # insurance and storm summaries
│   │   ├── constants.ts, format.ts, types.ts
│   │   ├── supabase.ts, account.ts   # sign-in session, and saved reports, shares and farm records
│   │   ├── farmcsv.ts                # reads and checks farmers' CSV uploads
│   │   ├── farmmodel.ts              # the farm models, fitted in the browser, and county-from-location
│   │   └── report/                   # report settings format, saving, places, CSV export
│   ├── public/data/                  # files the browser downloads
│   │   ├── agrigine.json             # season-level data for every county, 2000–2025
│   │   ├── daily/                    # 2000.bin … 2025.bin recorded, 2026.bin … 2028.bin predicted,
│   │   │                             # normals.bin, index.json
│   │   ├── predict/                  # written by the notebooks
│   │   │   ├── 2000.bin … 2028.bin   # day by day: each season's expected yield, chance of severe drought
│   │   │   ├── static.bin            # by calendar date: frost risk, typical high and 30-day rain
│   │   │   ├── future.json           # every season-level value for 2026–2028
│   │   │   └── index.json            # layout, trend yields, test scores
│   │   └── api/                      # small per-county files the MCP server reads
│   ├── worker/                       # MCP server on Cloudflare Workers (own package.json)
│   │   ├── src/index.ts              # MCP protocol: JSON-RPC over HTTP at /mcp
│   │   ├── src/tools.ts              # the 5 read-only tools
│   │   ├── src/data.ts               # reads and caches the site's /data files
│   │   └── wrangler.jsonc            # Worker name and the data URL
│   ├── scripts/                      # Python data pipeline
│   │   ├── pull_all.py               # runs every step below, in order
│   │   ├── storm_events_pull.py  power_pull.py  rma_pull.py  cities_pull.py
│   │   ├── derive_weather.py         # season weather measures from the daily weather
│   │   ├── build_data.py             # writes public/data/agrigine.json
│   │   ├── build_daily.py            # writes public/data/daily/
│   │   ├── build_api.py              # writes public/data/api/ for the MCP server
│   │   └── requirements.txt
│   ├── docs/                         # UI brief for AI, UI inventory, meteorology data plan
│   ├── README.md                     # app run and rebuild steps
│   ├── AGENTS.md                     # Next.js notes for AI coding agents
│   └── package.json  next.config.ts  tsconfig.json  eslint.config.mjs
├── docs/                             # hackathon brief, dataset specification, briefings
└── archive/                          # original hackathon README, license, starter code and
                                      # pull scripts (gitignored, local only)
```

</details>

## How the data is stored

There is no database. All data is files in this repo, in three layers:

1. **`data/raw/`** holds what the scripts downloaded. It is a cache, gitignored, and rebuilt on demand.
2. **`data/` and `data/processed/`** hold clean tables, one folder per source. Large daily tables are Parquet; the rest are CSV. This is the layer to use for analysis.
3. **`agrigine/public/data/`** holds compact copies of layer 2 that the web app downloads.

A few rules hold everywhere:

- **Every table joins on `fips`**, the 5-digit county code. Always read it as text, or California's `06001` turns into `6001` and joins fail silently.
- **Coverage:** 253 counties, 2000–2025. Corn, soybeans, winter wheat and grain sorghum.
- **Season windows:** season totals use fixed windows: corn May–Sep, soybeans May–Oct, sorghum Jun–Oct, winter wheat Sep–Jun. Wheat's year is its harvest year, so wheat 2012 runs from Sep 2011 to Jun 2012.

### Hackathon base data

The organizers built these files; the repo ships them as-is. Their pull scripts are in `archive/src/build/`, which is local only. Re-pulling needs a free NASS API key, and MODIS needs a Google Earth Engine account. `data/data_dictionary.md` documents every field.

| File | One row is | Source | Built by |
|---|---|---|---|
| `data/master_dataset.csv` (+ `.parquet`) | A county × crop × year (17,056 rows, 21 fields): yield and trend, acres, season rain and heat, drought, soil | Joins the four panels below | `build_master.py` |
| `processed/nass/nass_raw.parquet` | One published NASS number: yield, acres harvested or acres planted | USDA NASS Quick Stats API | `NASS_data_pull.py` |
| `processed/acis/weather_daily.parquet` | A county × day, 1999–2025: high, low, rain (2.5M rows) | NOAA ACIS GridData, gridded and averaged over each county | `ACIS_data_pull.py` |
| `processed/drought/drought_weekly.parquet` | A county × week: % of area in each drought level D0–D4, and the drought intensity score (DSCI) | U.S. Drought Monitor API | `USDM_data_pull.py` |
| `processed/soil/soil_county.parquet` | A county: water the soil holds, % drought-prone soil, crop productivity index (NCCPI) | USDA NRCS Soil Data Access (SSURGO) | `SSURGO_data_pull.py` |
| `processed/modis/modis_ndvi_county.csv` (+ `.parquet`) | A county × year: satellite greenness (NDVI, EVI) and its peak date | NASA MODIS MOD13Q1 via Google Earth Engine | `MODIS_gee_pull.py` |
| `processed/irrigation/nass_irrigation.parquet` | A county × crop × year: irrigated share, irrigated and dryland yields (mostly Nebraska) | USDA NASS Quick Stats API | `NASS_irrigation_pull.py` |
| `data/counties.geojson` | A county outline | U.S. Census county boundaries | supplied |

The `*_failures.json` files list requests that failed during each pull.

### Data Agrigine adds

Each script below downloads into `data/raw/<source>/`, keeps only the four states and four crops, and writes one clean table. `python3 agrigine/scripts/pull_all.py` runs them all in order and skips any step whose output already exists.

| File | One row is | Source | Script |
|---|---|---|---|
| `processed/derived/weather_season.csv` | A county × crop × season: hot nights (low ≥ 22 °C), heat days at flowering, longest dry spell, heavy-rain days | Computed from the ACIS daily weather; no download | `derive_weather.py` |
| `processed/derived/freeze_dates.csv` | A county × year: last spring and first fall freeze, frost-free days, spring rain | Computed from the ACIS daily weather | `derive_weather.py` |
| `processed/storms/storm_events.csv` | One storm report (82,278 rows): date, type, size, crop and property damage | NOAA NCEI Storm Events yearly files | `storm_events_pull.py` |
| `processed/power/daily/<year>.parquet` | A county × day, 1999–2025: air dryness (VPD), crop water demand (ET0), sunlight, wind, humidity, root-zone soil wetness | NASA POWER API, read at each county's center | `power_pull.py` |
| `processed/insurance/cause_of_loss.csv` | A county × crop × crop year × cause × month of loss (201,556 rows): payouts and policies paid | USDA Risk Management Agency, Cause of Loss files | `rma_pull.py` |
| `processed/cities/cities.csv` | One city or town (1,999 rows): location, county, 2024 population | U.S. Census 2024 Gazetteer and 2024 population estimates | `cities_pull.py` |

How some of these values are made:

- **Crop water demand (ET0)** uses the standard FAO-56 Penman–Monteith formula, from NASA POWER temperature, humidity, wind and sunlight.
- **Air dryness (VPD)** is calculated from temperature and humidity.
- **Insurance causes** are folded from RMA's many cause names into eight groups: drought, heat, too wet, hail, wind, freeze, price decline and other. Price decline is a market loss, not crop damage.
- **Storm reports** are only the ones NOAA files by county (hail, wind, tornadoes, floods). Drought and heat reports are filed by forecast zone and are not included.
- **Each city's county** is found by testing which county outline contains the city's point.

### What the web app loads

All of these are checked in. The first two are built from layer 2; the predictions come from the notebooks.

- **`agrigine/public/data/agrigine.json`** (about 6 MB, built by `build_data.py`) holds every county's outline and all its season-level numbers. That includes the master fields, irrigation, MODIS, monthly weather, weekly drought, derived weather, storms, insurance and cities.
- **`agrigine/public/data/daily/`** (built by `build_daily.py`) holds the day-by-day weather.
  - There is one file per year of 16-bit integers, laid out as `[measure][county][day]`: `2000.bin` to `2025.bin` are records, and `2026.bin` to `2028.bin` are predictions in the same layout.
  - There are 13 measures: high, low, rain, 7- and 30-day rain, days since rain, VPD, ET0, sunlight, wind, humidity, 30-day water balance and soil moisture.
  - `normals.bin` holds the 2000–2025 average for each calendar day, and `index.json` describes the layout.
  - The app downloads only the year the date dial is on.
- **`agrigine/public/data/predict/`** holds the predictions; see "Predictive modeling".

## Predictive modeling

Every layer in the app is predicted, for every county and every day, through December 31, 2028. Drag the date dial past 2025 and everything on screen is a prediction, marked **Predicted**. The work is in three notebooks in `notebooks/`, which write their results into the app's own file formats.

### What's predicted, and how

The rule: use a model only where it beats a simple baseline on years it never saw; otherwise say what's typical. Each of 2016–2025 was predicted using only earlier seasons, and the scores below come from that test.

| What | Method | How it tested |
|---|---|---|
| **Yields, 1–3 seasons ahead** | Four candidates per crop and horizon (county average, county trend, gradient boosting, neural network); the winner must cut the county average's error by 5% | Corn 41% and soybeans 46% better than the county average (county trend wins); sorghum 21–31% (gradient boosting, neural network); wheat 8% |
| **A season's yield, day by day** | Gradient boosting on season-to-date rain, heat, water balance, soil moisture and drought; centered on the trend, with rules that more heat or drought can only lower it | Soybeans 11% closer than the trend at harvest. Corn, wheat and sorghum don't beat the trend yet, so they're labeled experimental. On August 1 its inspection list catches 36% of corn losses (drought list: 33%) and 43% of soybean losses (40%) |
| **Chance of severe drought in 4 and 8 weeks** | Gradient boosting classifier on current drought, recent rain, water balance and soil moisture | 87% better than each county's usual rate at 4 weeks (78% at 8); 15% better than assuming nothing changes; ranks counties that turn dry at 0.93 |
| **Frost risk by date, safe planting date** | Each county's 26 years of freeze dates | Safe dates set from 2000–2018 saw a later frost in 9.7% of 2019–2025 springs (goal: 10% or less) |
| **Satellite greenness** | Gradient boosting | 16–18% better than the county average one season ahead |
| **Daily weather, soil moisture, water balance, drought map (2026–2028)** | The normal for each date, starting from the Dec 31, 2025 conditions and fading at the rate the data shows | Soil moisture 69% better than plain normals in the first month, 39% in months 2–3; 30-day rain and water balance about 30% in the first month; single-day weather gains nothing, so it's just the normal |
| **Season weather, freeze dates, storms, insurance payouts (2026–2028)** | The county's typical season (insurance: 2016–2025 average) | Nothing beat the county average years ahead; the weather can't be known that far out |
| **Acres, irrigated share / soil** | Latest values / unchanged | These change slowly or not at all |

Crop numbers are **seasonal**: every day carries the expected yield of the season it belongs to, as known on that day. Before planting that's the trend; during the season it's that day's prediction; after harvest it's the final prediction. It never means "this much is harvested today".

### Pre-run, not hosted

Every prediction starts from the same point, the last day of data (December 31, 2025), so each one comes out the same no matter who asks. They're computed once and served as files, like the daily weather. That makes them instant and free, with no model server to keep awake. When new data arrives (the 2026 season), the notebooks re-run and the files are republished. A hosted model would only be needed for predictions personalized to a farmer's own uploaded data.

### How a forecast gets into the app

1. **Data.** `python3 agrigine/scripts/pull_all.py` refreshes everything in `data/` and the app's recorded files (see "Data Agrigine adds").
2. **Notebooks**, in this order, using the kernel *Agrigine model (sklearn 1.6.1)* from `notebooks/.venv`. Each runs in a few minutes or less on an Apple Silicon Mac, training on all cores at once.
   1. `Agrigine_Forecasts.ipynb` tests the candidate models and writes 2026–2028 season forecasts to `notebooks/forecasts/`.
   2. `Agrigine_Daily_Predictions.ipynb` writes the day-by-day predictions for 2000–2025 to `agrigine/public/data/predict/`. Each year comes from a model that never saw it, so the past shows what the model would have said at the time.
   3. `Agrigine_2026_2028.ipynb` reads both and writes every layer for 2026–2028: `daily/2026.bin` to `2028.bin`, `predict/2026.bin` to `2028.bin`, and `predict/future.json`.
3. **The app reads them.**
   - `lib/data.ts` appends `future.json` to each county's series as it loads, so every season layer, chart and profile reads 2026–2028 like any other year. Predicted yields carry the status `p`.
   - `lib/daily.ts` loads the predicted daily files exactly like recorded ones. `lib/predict.ts` reads the prediction channels.
   - Layers built on predictions are entries in `lib/metrics.ts` marked `predicted: true`.
   - Any date after 2025 is labeled Predicted on the dial, in the key, in tooltips and in profiles.
4. **Publish.** `cd agrigine && npm run deploy`.

**To add a new forecast:**
1. **Build and test it** in a notebook against a simple baseline (the county average or the trend).
2. **Write it out:** as a new channel in `predict/<year>.bin` (add it to `CHANNELS` in `Agrigine_Daily_Predictions.ipynb`), or as season values in `future.json` (`Agrigine_2026_2028.ipynb`).
3. **Add a layer** in `lib/metrics.ts` with `predicted: true` that reads it with `predicted(t, '<channel>', c)`.
4. **Optionally show it** in the county profile (`components/profile/tabs.tsx`). Then rebuild and deploy.

### Training details

Everything needed to reproduce the models. Scores for all of them are in [BENCHMARKS.md](BENCHMARKS.md).

**Environment.** Apple M2 (8 cores, 16 GB), macOS 15.3.2. Python 3.11 in `notebooks/.venv` with NumPy 2.2.6 (on Apple Accelerate), scikit-learn 1.6.1, pandas 2.2.3, pyarrow, joblib, threadpoolctl, matplotlib. Kernel name *Agrigine model (sklearn 1.6.1)*. No GPU: the models are small, so moving data to the GPU costs more than it saves. Every fit runs in its own process (`joblib.Parallel`, `n_jobs = os.cpu_count()` = 8) held to one BLAS thread (`threadpool_limits(1)`), and large arrays are passed as arguments so joblib memory-maps them instead of copying. All random seeds are `random_state=0`, so a re-run gives the same numbers.

**Data.** 253 counties in California, Delaware, Iowa and Nebraska, 2000–2025, from the repo's `data/` folder. Yields: USDA NASS county yields, only rows with status *reported* (230 counties have any). Weather: NOAA ACIS daily. Soil moisture, air dryness, crop water demand: NASA POWER daily. Drought: U.S. Drought Monitor weekly maps (the map in effect each day). Greenness: NASA MODIS. Soil: NRCS SSURGO (available water storage to 100 cm, drought-prone share, crop productivity index). Missing values stay missing; no value is invented.

**Test protocol, shared by every model.** Rolling-origin backtest: each of the test years 2016–2025 is predicted by a model trained only on data that had finished before it. Scores are pooled over the ten years. A model is kept only where it beats a plain baseline; otherwise the baseline is what the app shows, and says so. The baseline is always the thing a user would otherwise rely on: the place's own average, the trend, the usual rate, or the normal.

**Data splits at a glance.**

| Model | Training set | Test set | Folds | What stops leakage |
|---|---|---|---|---|
| Season forecasts (h = 1, 2, 3) | Rows whose answer year ≤ Y − h, with an answer; fold skipped under 50 rows | Rows with answer year = Y, Y ∈ 2016…2025; skipped under 5 rows | 10 per target × horizon (390; 1,536 fits) | Inputs are values at origin T ≤ Y − h only; the expanding mean is through T |
| Day-by-day yield | Every 7th day of every season < Y, all counties with a target | Every day of season Y, Y ∈ 2016…2025 | 40 | The trailing trend uses only seasons before Y; normals for anomalies are 2000–2025 means (a known, minor leak, shared by all folds) |
| Drought chance (4, 8 wk) | Every 7th day from 2000-01-18 to Dec 31 of Y−1 minus the horizon (28 / 56 days) | Every day of Y, Y ∈ 2016…2025 | 20 | No training label window reaches into Y; the usual-rate baseline is computed from 2000–2015 only |
| Frost | Freeze dates 2000–2018 | Springs 2019–2025 | 1 | Fixed split |
| Fade | Normals and fade curves from 2000–2025 | 365 days after Dec 31 of 2015…2024 | 10 | Fade curves are pooled over the whole record (shared by all origins) |
| Farm models | The farm's other seasons | Each season in turn | n seasons | Leave-one-season-out |

**Every threshold, in one place.** Model kept over the place average only if skill ≥ 5% (`MIN_GAIN = 0.05`). Fold needs ≥ 50 training and ≥ 5 test rows. Trailing trend needs ≥ 6 reported seasons within the last 15. Forecast needs ≥ 5 past values. Heat day: Tmax ≥ 35 °C; hot night: Tmin ≥ 22 °C; freeze: Tmin ≤ 0 °C; GDD base 10 °C, cap 30 °C. Severe drought: D2+ on > 1% of the county. Drought label horizons 28 and 56 days. Safe planting: spring frost risk ≤ 10%. Loss (inspection-list test): yield ≤ −10% vs trend. Fade curve cut to 0 once autocorrelation < 0.05; lags to 400 days (160 weeks for DSCI). Normals smoothed ±7 days. Insurance causes under $1 dropped. Farm models need 3 / 5 / 8 seasons (ratio / trend / weather); ranges are q10–q90 (season forecasts) or ±1.28 × RMSE (farm models).

#### Season forecasts, 1–3 years ahead (`Agrigine_Forecasts.ipynb`)

| | |
|---|---|
| Targets | 13: corn, soybean, winter wheat and sorghum yield (bu/ac); May–Sep rain, average temperature, days at 35 °C+, growing degree days (base 10 °C, cap 30 °C); May–Sep mean DSCI and weeks with D2+ on more than 1% of the county; May–Sep root-zone soil moisture; peak NDVI; mean EVI. County-wide measures use one fixed May–September window for every county. |
| Rows | One per place (county, or county × crop) and origin year T, with the answer at T + h. Corn one year ahead: 4,661 rows with an answer. 39 training tables (13 targets × 3 horizons). |
| Inputs (21 for a crop target) | The target's last three values (T, T−1, T−2); six drivers at T and T−1 (May–Sep rain, temperature, heat days, DSCI, soil moisture, peak NDVI); the place's average of the target through T and how many years it rests on; the origin year; soil water storage and drought-prone share; crop productivity index (crop targets only); state as a category. Stored as float32. |
| Horizons | h = 1, 2, 3 (2026, 2027, 2028 from origin 2025). |
| Train / test split | For test year Y and horizon h, train on rows whose answer year ≤ Y − h (so no training answer is later than what the forecaster could know), test on rows with answer year = Y. A fold runs only with ≥ 50 training rows and ≥ 5 test rows. 1,536 fits in total, 67 s on 8 cores. |
| Candidate 1: place average | The place's expanding mean of the target through T (falls back to the training mean). The baseline. |
| Candidate 2: county trend | `Ridge(alpha=10)` on the answer year plus a one-hot of the county: one shared slope, one level per county. |
| Candidate 3: gradient boosting | `HistGradientBoostingRegressor(max_iter=250, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=30, l2_regularization=1.0, random_state=0)`; numeric inputs passed through unchanged (trees handle gaps natively); state ordinal-encoded and declared categorical. |
| Candidate 4: neural network | Numeric inputs: median imputation with missing-indicator columns, then standardized; state one-hot. `MLPRegressor(hidden_layer_sizes=(32, 16), alpha=2.0, max_iter=600, early_stopping=True, n_iter_no_change=20, random_state=0)` (ReLU, Adam, 10% of training rows held out internally for early stopping). The target is standardized too (`TransformedTargetRegressor`). |
| Score | MAE pooled over the ten test years. Skill = 1 − MAE / MAE(place average). |
| Selection | Per target and horizon, the lowest MAE among models with skill ≥ 5% (`MIN_GAIN = 0.05`); if none, the place average. |
| Range | The winner's 10th and 90th percentile test errors, added to the forecast (an 80% range). |
| Final fit | The winner is refit on every season through 2025 and run from origin 2025. Places with fewer than five past values get no forecast. |
| Output | `notebooks/forecasts/forecasts_2026_2028.csv`, `backtest_scores.csv`, `forecasts.json`, `forecast_models.joblib`. |

#### Season yield, day by day (`Agrigine_Daily_Predictions.ipynb`, section 2)

| | |
|---|---|
| Target | The season's NASS yield as a percentage above or below the county's **trailing trend**: a straight line through up to 15 earlier reported seasons (at least 6), so the trend is known before the season starts. County-seasons with a yield and a trend: corn 3,591, soybeans 3,152, winter wheat 1,074, sorghum 264. |
| Seasons | Corn May 1–Sep 30; soybeans May 1–Oct 31; sorghum Jun 1–Oct 31; winter wheat Sep 1 (year before) – Jun 30. |
| Inputs (23), on day d of the season | How far into the season d is; season-to-date rain, growing degree days, days at 35 °C+ and nights at 22 °C+, with rain and GDD also against their own 2000–2025 normal for that day of the season; last-30-day mean high and its departure from normal; 30-day rain departure; 30-day water balance and its departure; 30-day air dryness; soil moisture now, its departure, and its season-to-date mean; DSCI now and season-to-date mean; season-to-date weeks of D2+; soil water storage; drought-prone share; crop productivity index; state (categorical). Built as arrays `[feature, season, day, county]` (481 MB for the four crops). |
| Model | `HistGradientBoostingRegressor(loss='absolute_error', max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=200, l2_regularization=2.0, random_state=0)` with **monotonic constraints**: season-to-date heat days, hot nights, 30-day high departure, air dryness, DSCI now, season-to-date DSCI and weeks of D2+ may only lower the prediction (`monotonic_cst = −1`), all other inputs unconstrained. Kept deliberately simple because all counties share one year's weather, so 26 seasons are only about 20 independent examples. |
| Centering | The model is trained on each season's distance from the training seasons' mean anomaly, so an ordinary season predicts the trend (0%) rather than whatever the training years happened to average. |
| Training sample | Every 7th day of each training season (days 7, 14, …), every county with a target. Testing uses every day. |
| Train / test split | Test year Y trained on seasons before Y: 40 folds (4 crops × 10 years), 10 s. The app's files use leave-one-year-out over all of 2000–2025 (each year by a model that never saw it), so dragging the dial through a past season shows what the model would have said at the time. |
| Baseline | The trend alone (a 0% anomaly). Skill = 1 − MAE(model) / MAE(trend), by day of season. |
| Also scored | The August 1 inspection list: the model's list (counties furthest below trend on Aug 1) versus the drought list (counties in D2+ on the last map before Aug 1), same length, judged by real losses caught (final yield ≥ 10% below trend). |
| Final models | One per crop, trained on all 26 seasons, saved to `notebooks/forecasts/daily/daily_models.joblib` with the input list. |

#### Chance of severe drought within 4 and 8 weeks (`Agrigine_Daily_Predictions.ipynb`, section 3)

| | |
|---|---|
| Target | 1 if any Drought Monitor map in the next 28 (or 56) days, starting the next day, shows D2 or worse on more than 1% of the county. |
| Inputs (15), on day d | DSCI now; D2+ share now; DSCI change over the last 28 days; 30-day rain departure from normal; 30-day water balance and its departure; soil moisture now and its departure; 30-day high departure; 30-day air dryness; sine and cosine of the day of year; soil water storage; drought-prone share; state (categorical). 9,862 days × 253 counties × 15 inputs (150 MB). |
| Model | `HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, max_leaf_nodes=31, min_samples_leaf=200, l2_regularization=1.0, random_state=0)`; probabilities from `predict_proba`. |
| Training sample | Every 7th day from January 18, 2000 (two weeks of maps behind every row) up to the last day whose whole label window ends before the test year. |
| Train / test split | 20 folds (2 horizons × 10 test years), 25 s. For the app's files, leave-one-year-out with the weeks whose label window reaches into the held-out year also left out. |
| Baselines | The county's usual rate for that calendar month, computed from 2000–2015 only; and "same as now" (probability 1 if in D2+ today, else 0). |
| Score | Brier score (mean squared error of the probability), skill = 1 − Brier(model) / Brier(usual rate), and AUC; reported for all days and for days not yet in severe drought (the onsets). |
| Final models | One per horizon, trained on all years, saved in `daily_models.joblib`. |

#### Frost risk and typical weather (`Agrigine_Daily_Predictions.ipynb`, sections 4–5)

No fitted model. Spring risk on day d = share of 2000–2025 years whose last spring freeze (daily low ≤ 0 °C) fell on or after d (a spring with no freeze counts as no risk); fall risk = share whose first fall freeze fell on or before d. Safe planting date = first day at ≤ 10% spring risk. Tested by building the safe dates from 2000–2018 and counting 2019–2025 springs with a frost after them, on the 251 counties that freeze in most springs. Typical weather = 10th, 50th and 90th percentiles of the daily high and of 30-day rain for each county and calendar day, pooling the week either side.

#### Every layer for 2026–2028 (`Agrigine_2026_2028.ipynb`)

| Layer group | Rule |
|---|---|
| Daily measures (13 channels) | Normal for each county and calendar day = the 2000–2025 mean for that day, smoothed over ±7 days. Fade factor for lag L = correlation between a departure and the departure L days later, pooled over counties, forced non-increasing and cut to 0 once below 0.05 (lags up to 400). Predicted value = normal + (Dec 31, 2025 departure) × fade(L). Tested with origins Dec 31 of 2015–2024 over the following 365 days against the normal alone. |
| Weekly Drought Monitor map | DSCI fades from the Dec 30, 2025 value to the county's normal for that week of the year with the same method (lags to 160 weeks; half-life 30 weeks). The level shown is the level most often seen historically at that DSCI (10-point bins). 156 predicted weekly maps. |
| Chance of severe drought | Fades from the last 2025 prediction toward the county's usual rate for the month, at the rate measured from the label series. |
| Season yields | The Section 1 winners. When the winner is the county trend, the season is on trend (anomaly 0%) and the forecast is its trend; otherwise the anomaly is the forecast against the county's trailing trend. Status `p`. |
| Greenness | Peak NDVI and mean EVI from the Section 1 winners; other satellite fields the county mean / median. |
| Season weather, drought, freeze dates | County mean (median for drought level) over 2000–2025. |
| Storms | County mean count by type and mean crop damage per crop season, 2000–2025. |
| Insurance | Mean payout by cause and by month of loss over the 2016–2025 crop years; causes under $1 dropped. |
| Acres, irrigation, soil | Acres: mean of the last three reported seasons. Irrigated share and irrigated/non-irrigated yields: last value. Soil: unchanged. |
| Output | `agrigine/public/data/daily/2026–2028.bin`, `predict/2026–2028.bin`, `predict/future.json` (0.97 MB). |

#### Farm models (`agrigine/lib/farmmodel.ts`, in the browser)

| | |
|---|---|
| Season value | The farm's acre-weighted mean yield per crop and year from its uploaded records. |
| Models | *Follow the county*: ratio of the farm's yields to the county's over the same seasons (needs ≥ 3). *Your own trend*: least squares line on year (≥ 5). *Weather-adjusted*: least squares on year, season rain anomaly ÷ 10 and weeks of D2+, with ridge shrinkage 1.0 on the non-intercept terms (≥ 8). |
| Test | Leave-one-season-out: each season predicted by the model fitted to the farm's other seasons. Baseline: the mean of the other seasons. Skill = 1 − MAE / MAE(baseline). |
| Range | Prediction ± 1.28 × RMSE of the leave-one-out errors (80%). |
| Prediction | 2026–2028 from the county's forecast yield, rain anomaly (0, on normal) and drought weeks (county mean). |

### Limits

- **The 2026–2028 daily values are expected values, not weather forecasts.** Weather can't be known years ahead, and a predicted day's rain is that date's average, not a storm.
- **Day-by-day yields for corn, wheat and sorghum don't yet beat the trend line in testing.** All counties share one year's weather, so 26 seasons are only about 20 independent examples. Adding irrigation as an input is the next step.
- **Storms and insurance payouts for future seasons are averages.** Single storms can't be predicted.

## Tech stack

### Hosting

**Everything runs on free tiers, so hosting costs nothing.** There's no app server. The site is plain files, and the few moving parts are managed services.

- **The site: Cloudflare Pages.**
  - `next.config.ts` sets `output: "export"`, so `npm run build` pre-renders every page to plain HTML, JS and CSS in `agrigine/out/`. It also copies in the data files from `public/data/` (about 115 MB in 330 files).
  - `npm run deploy` builds the site and uploads `out/` to the Pages project `agrigine` with `wrangler pages deploy`.
  - Deploys are direct uploads. Pushing to GitHub doesn't deploy anything; to publish a change, run the deploy command.
  - Cloudflare serves and caches the files from its edge network. Requests and bandwidth for static files are free and unlimited.
  - The free plan allows up to 20,000 files per deploy and 25 MiB per file. The largest file today is `agrigine.json`, at 6.6 MB.
  - There are no Pages Functions and no server rendering. Pages that need account data, such as Profile and My farm data, load it in the browser after the page opens.
- **The MCP server: a Cloudflare Worker** (`agrigine/worker/`, deployed with `npm run deploy:mcp`).
  - AI assistants such as Claude connect to it and call five read-only tools: `find_places`, `get_county_season`, `get_county_history`, `get_daily_weather` and `rank_counties`.
  - It stores no data of its own. It fetches small JSON files from the Pages site's `/data/api/` folder, which Cloudflare caches. The `DATA_BASE_URL` variable in `worker/wrangler.jsonc` says which site to read from.
  - It speaks MCP over plain HTTP (JSON-RPC, stateless), so it needs no sessions or storage.
  - The free tier allows 100,000 requests a day and 10 ms of CPU per request. That limit is why the data is split into small files.
- **Accounts: Supabase's hosted free tier**, with Postgres and Auth in the us-east-1 region.
  - The browser talks to Supabase directly, using the project URL and publishable key in `agrigine/lib/supabase.ts`. Both are public by design, because row-level security decides what each account can read and change.
  - Confirmation and password-reset emails link back to the site. Those return addresses are set in the Supabase dashboard under Authentication → URL Configuration, so update them there if the site moves.
  - Free projects pause after a week with no activity. Restore a paused project from the Supabase dashboard.
- **Satellite imagery: NASA GIBS.** The browser loads map tiles straight from NASA's servers, with no key and no cost. None of that traffic goes through our hosting.
- **Updating data or predictions:** re-run `agrigine/scripts/` or the notebooks (both write into `public/data/`), then run `npm run deploy` again. Nothing needs restarting.

### Backend

- **Accounts: Supabase** (Postgres + Auth). People sign in with email and password, and the browser talks to Supabase directly.
  - Row-level security means each account reaches only its own rows.
  - Tables:
    - `reports`: saved report settings
    - `report_shares`: read access for another account, with an end date the database enforces
    - `farm_records` and `farm_uploads`: a farmer's own field records, visible only to them
    - `farms` and `farm_models`: each farm's location and the models built for it, visible only to the owner
  - Sharing goes through three database functions that look up accounts by email.
  - The browser code is in `agrigine/lib/supabase.ts` and `agrigine/lib/account.ts`.
- **Data pipeline: Python** (`agrigine/scripts/`) pulls each source and writes every file described above.
- **Predictions: Jupyter notebooks** (`notebooks/`) with scikit-learn, pre-run into files the app serves. No model runs in the browser or on a server.

**Planned, not built yet:** MCP tools that read a signed-in farmer's own records.

### Frontend

A Next.js app in `agrigine/`. The top bar switches between Explore, Report and Predict; the profile button opens the account pages. Explore is open to everyone; Report and Predict ask you to sign in first, because what they make (reports, shares, farms and models) is saved to the account.

- **Explore (`/`):** a 3D globe (or flat map) over satellite imagery. Counties are colored by any of about 60 layers. Click a county for its full profile, and use the date dial at the bottom to move day by day.
  - **Layers:** each layer is one entry in `lib/metrics.ts`, which says how to read its value, color it and format it.
  - **Shareable views:** the current view lives in the URL, so any view can be shared as a link.
- **Reports (`/reports`):** build a report from blocks, preview it live, then print it to PDF or download its data as CSV.
  - **Blocks:** each block type is one entry in `components/report/blocks.tsx`, with its options, its view and its CSV rows.
  - **Saving:** report settings are saved to your account when signed in (or in the browser), shared with other accounts for a set number of days, and downloadable as a file that rebuilds the same report.
- **Predict (`/predict`):** farmers set their farm's location (a county, or their phone's location) and build a simple model from their own yields: *follow the county*, *your own trend*, or *weather-adjusted* (drought weeks and rain). Each is tested by leaving out one season at a time against just using their average, then predicts their farm's yield for 2026–2028 from the county forecasts. The models are tiny, so they're fitted in the browser; only the results are saved. Below that, what's predicted for every county and how each prediction tested.
- **Profile (`/account`)** and **My farm data (`/data`):** sign in, saved and shared reports, and the farmer's own records.

Satellite imagery is NASA's, through GIBS, and free with no key: Blue Marble when zoomed out, Landsat 30 m composites up close, and an optional MODIS photo of the date on the dial. Charts are hand-written SVG, with no chart library. All styles live in one CSS file with color tokens for light and dark mode, and chart colors are checked for colorblind safety.

To run it:

```bash
cd agrigine && npm install && npm run dev     # local development
npm run deploy                                # publish to Cloudflare Pages (after npx wrangler login)
```

### Frameworks and libraries

| Name | Used for |
|---|---|
| **Next.js 16** (App Router) | Pages, routing and serving files. Each page keeps its state when you switch tabs. |
| **React 19** | UI components |
| **TypeScript 5** | Type-checked front-end code |
| **deck.gl 9.4** | The WebGL globe and map: county shapes, 3D heights, satellite tiles, labels |
| **NASA GIBS** | Satellite map tiles: Blue Marble, Landsat WELD, MODIS daily true color |
| **Cloudflare Pages** and **Workers** | Free hosting for the site and the MCP server; deployed with `wrangler` |
| **topojson-client**, **world-atlas**, **us-atlas** | Country and state outlines |
| **Google Fonts** via `next/font` | Big Shoulders for titles, Public Sans for text |
| **ESLint 9** | Code checks |
| **Python 3.11+** with **pandas**, **numpy**, **pyarrow**, **matplotlib** | The data pipeline: reading and writing tables, the math for derived measures, and point-in-polygon for cities |
| **scikit-learn 1.6.1**, **joblib**, **Jupyter** | The prediction notebooks: gradient boosting, the neural network and trend models, trained in parallel on all cores |
| **Supabase** | Sign-in and the account database (saved reports, shares, farm records) |
