# Agrigine

A globe of county crop, drought, weather, soil and satellite data for California, Delaware, Iowa and Nebraska, 2000–2025. Front end only: the data is a static file in `public/data/`, and there is no backend yet.

## Run it

You need Node.js 20.9 or newer.

```bash
cd agrigine
npm install
npm run dev
```

Open http://localhost:3000. The other pages are /reports, /predict, /account (profile) and /data (my farm data).

For a production build: `npm run build && npm start`.

## Deploy

The site is a static export hosted free on **Cloudflare Pages** at <https://agrigine.pages.dev>. The MCP server is a **Cloudflare Worker** (free tier) at <https://agrigine-mcp.agrigine-mcp.workers.dev/mcp>; it reads the site's `/data/api/` files.

```bash
npx wrangler login        # once, opens a browser
npm run deploy            # build to out/ and upload it to Pages
npm run deploy:mcp        # deploy worker/ (the MCP server)
npm start                 # serve out/ locally on port 3123, the same files Pages serves
```

Connect an AI assistant to the MCP server with its URL, `https://agrigine-mcp.agrigine-mcp.workers.dev/mcp` (Streamable HTTP). In Claude Code: `claude mcp add --transport http agrigine https://agrigine-mcp.agrigine-mcp.workers.dev/mcp`.

## Rebuild the data

All the data is checked in: the hackathon base data, every processed dataset in `data/processed/` and the app's files in `public/data/`. A fresh clone has everything; only the raw download caches (`data/raw/`, about 500 MB) are left out. To refresh the data or pull it all again from the sources, run one script (Python 3.11+):

```bash
python3 -m pip install -r agrigine/scripts/requirements.txt
python3 agrigine/scripts/pull_all.py              # everything that's missing
python3 agrigine/scripts/pull_all.py --force      # redo every step
python3 agrigine/scripts/pull_all.py --only power,daily
```

The script caches downloads in `data/raw/<source>/` and writes to `data/processed/`. On a clone it skips every step, since the outputs are already there; use `--force` to pull everything again (about 500 MB of downloads, 10 to 20 minutes). In order, it runs:

| Step | Script | Source | Writes |
|---|---|---|---|
| storms | `storm_events_pull.py` | NOAA Storm Events | `data/processed/storms/` |
| derived | `derive_weather.py` | Hackathon daily weather (no download) | `data/processed/derived/` |
| power | `power_pull.py` | NASA POWER: VPD, crop water demand, sunlight, wind, humidity, soil moisture | `data/processed/power/daily/` |
| insurance | `rma_pull.py` | USDA RMA crop insurance Cause of Loss | `data/processed/insurance/` |
| cities | `cities_pull.py` | Census Gazetteer and 2024 population estimates | `data/processed/cities/` |
| bundle | `build_data.py` | All of the above | `public/data/agrigine.json` |
| daily | `build_daily.py` | Daily weather and NASA POWER | `public/data/daily/` |
| api | `build_api.py` | The bundle, split into small files for the MCP server | `public/data/api/` |

Each script also runs on its own from the `agrigine` folder, for example `python3 scripts/rma_pull.py`.

### Predictions

Three notebooks in `../notebooks/` make every prediction; run them in this order after the data steps (kernel: `notebooks/.venv`, scikit-learn 1.6.1):

1. `Agrigine_Forecasts.ipynb`: 2026–2028 season forecasts, four candidate models per measure, tested on 2016–2025 → `notebooks/forecasts/`.
2. `Agrigine_Daily_Predictions.ipynb`: day-by-day predictions (each season's expected yield, chance of severe drought, frost risk, typical weather), each year by a model that never saw it → `public/data/predict/`.
3. `Agrigine_2026_2028.ipynb`: every layer for every day of 2026–2028, pre-run from Dec 31, 2025 → `public/data/daily/2026–2028.bin`, `public/data/predict/`.

The app reads these as files, the same way as the daily weather; nothing runs a model in the browser.

## Where things are

| Path | What it does |
|---|---|
| `app/page.tsx`, `app/reports/`, `app/predict/`, `app/account/`, `app/data/` | Explore, Report, Predict, the profile and my farm data |
| `components/Explorer.tsx` | State, camera and layout for the explorer |
| `components/GlobeMap.tsx` | The deck.gl globe and flat map |
| `components/LayersPanel.tsx` | Layer picker, filtering key, 3D heights switch, filters |
| `components/profile/` | The county, state and outside-the-data profiles |
| `lib/metrics.ts` | Every layer: how it reads the data, its color bins and labels |
| `lib/compute.ts` | Colors, heights (from the key's bands) and key counts for the current view |
| `lib/state.ts` | Explorer state and the shareable URL format |
| `scripts/build_data.py` | Builds the data bundle from `../data` |

Any view can be shared by its URL, for example `/?county=19007&date=2012-07-15&crop=C&layer=anom&3d=1&tab=drought`.
