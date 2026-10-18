# Agrigine

An open-source research tool for county farm data that farmers can use too. Agrigine puts 26 years (2000–2025) of crop, weather, drought, soil, satellite, storm and crop-insurance data for every county in California, Delaware, Iowa and Nebraska on a 3D globe. Click a county to see its full profile, or build a report to print or export.

Built for the DSU *Data to Harvest* hackathon, October 17–18, 2026.

<details>
<summary><b>Codebase structure</b> (click to expand)</summary>

```text
DSU-Hackathon/
├── README.md                         # this file
├── data/                             # every data table; see "How the data is stored"
│   ├── master_dataset.csv / .parquet # hackathon master table: county × crop × year
│   ├── counties.geojson              # county outlines, feature id = fips
│   ├── data_dictionary.md            # every master field explained
│   ├── processed/                    # clean tables, one folder per source
│   │   ├── nass/  acis/  drought/  soil/  modis/  irrigation/    # hackathon base data
│   │   ├── derived/  storms/  power/daily/  insurance/  cities/  # added by Agrigine
│   │   └── master_build_log.json     # checks run when the master was built
│   └── raw/                          # download caches (gitignored, about 500 MB)
├── agrigine/                         # the web app (Next.js) and its data pipeline
│   ├── app/                          # pages
│   │   ├── layout.tsx                # fonts and page metadata
│   │   ├── globals.css               # all styles: light/dark color tokens, print styles
│   │   ├── page.tsx                  # /         Explore: the globe
│   │   ├── reports/page.tsx          # /reports  report builder
│   │   └── plan/page.tsx             # /plan     team plan
│   ├── components/
│   │   ├── Explorer.tsx              # Explore page: state, camera, keyboard, URL sync
│   │   ├── GlobeMap.tsx              # deck.gl globe/map, county layers, city dots, hover card
│   │   ├── LayersPanel.tsx           # layer picker, filtering key, reference layers
│   │   ├── Timeline.tsx              # the horizontal date dial
│   │   ├── SearchBox.tsx             # city, county and state search
│   │   ├── TopBar.tsx                # header with the Explore / Reports / Plan switch
│   │   ├── charts.tsx                # SVG charts used in profiles
│   │   ├── profile/                  # ProfilePanel.tsx + tabs.tsx: county and state profiles
│   │   └── report/                   # report builder
│   │       ├── ReportBuilder.tsx     # settings panel, live preview, save/print/CSV
│   │       ├── blocks.tsx            # block registry: the 10 report block types
│   │       └── ReportCharts.tsx      # print-friendly SVG charts
│   ├── lib/
│   │   ├── metrics.ts                # every map layer: how to read it, color it, format it
│   │   ├── state.ts                  # Explore state (reducer) and URL parsing
│   │   ├── daily.ts                  # dates, and the reader for the daily weather files
│   │   ├── data.ts                   # loads the data bundle and map outlines
│   │   ├── compute.ts, bins.ts, colors.ts   # turning values into map colors
│   │   ├── insurance.ts, storms.ts          # insurance and storm summaries
│   │   ├── constants.ts, format.ts, types.ts
│   │   └── report/                   # report settings format, saving, places, CSV export
│   ├── public/data/                  # files the browser downloads
│   │   ├── agrigine.json             # season-level data for every county
│   │   ├── daily/                    # 2000.bin … 2025.bin, normals.bin, index.json
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

Both files are built from layer 2 and checked in.

- **`agrigine/public/data/agrigine.json`** (about 6 MB, built by `build_data.py`) holds every county's outline and all its season-level numbers. That includes the master fields, irrigation, MODIS, monthly weather, weekly drought, derived weather, storms, insurance and cities.
- **`agrigine/public/data/daily/`** (built by `build_daily.py`) holds the day-by-day weather.
  - There is one file per year (`2000.bin` to `2025.bin`) of 16-bit integers, laid out as `[measure][county][day]`.
  - There are 13 measures: high, low, rain, 7- and 30-day rain, days since rain, VPD, ET0, sunlight, wind, humidity, 30-day water balance and soil moisture.
  - `normals.bin` holds the 2000–2025 average for each calendar day, and `index.json` describes the layout.
  - The app downloads only the year the date dial is on.

## Predictive modeling

## Tech stack

### Backend

**There is no database yet, and everything runs on free tiers.**

- **Hosting: Cloudflare Pages.** The app is built as a static site (`npm run build` writes `agrigine/out/`), and Pages serves it with the data files at <https://agrigine.pages.dev>.
- **MCP server: a Cloudflare Worker** (`agrigine/worker/`) at <https://agrigine-mcp.agrigine-mcp.workers.dev/mcp>.
  - AI assistants such as Claude connect to it and call five read-only tools: `find_places`, `get_county_season`, `get_county_history`, `get_daily_weather` and `rank_counties`.
  - It speaks MCP over plain HTTP (JSON-RPC, stateless) and reads small JSON files from the Pages site, which Cloudflare caches.
  - The free tier allows 100,000 requests a day and 10 ms of CPU per request. That limit is why the data is split into small files.
- **Data pipeline: Python** (`agrigine/scripts/`) pulls each source and writes every file described above.

**Planned, not built yet:**

- **accounts and farmer-owned data**, likely Postgres with PostGIS and OAuth sign-in
- write tools on the MCP server once accounts exist

### Frontend

A Next.js app in `agrigine/` with three pages:

- **Explore (`/`):** a 3D globe (or flat map) over satellite imagery. Counties are colored by any of about 60 layers. Click a county for its full profile, and use the date dial at the bottom to move day by day.
  - **Layers:** each layer is one entry in `lib/metrics.ts`, which says how to read its value, color it and format it.
  - **Shareable views:** the current view lives in the URL, so any view can be shared as a link.
- **Reports (`/reports`):** build a report from blocks, preview it live, then print it to PDF or download its data as CSV.
  - **Blocks:** each block type is one entry in `components/report/blocks.tsx`, with its options, its view and its CSV rows.
  - **Saving:** report settings are saved in the browser and can be downloaded as a file that rebuilds the same report. They are ready to move to accounts later.
- **Plan (`/plan`):** the team's plan.

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
