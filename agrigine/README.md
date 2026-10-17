# Agrigine

A globe of county crop, drought, weather, soil and satellite data for California, Delaware, Iowa and Nebraska, 2000–2025. Front end only: the data is a static file in `public/data/`, and there is no backend yet.

## Run it

You need Node.js 20.9 or newer.

```bash
cd agrigine
npm install
npm run dev
```

Open http://localhost:3000. The plan is at http://localhost:3000/plan.

For a production build: `npm run build && npm start`.

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

Each script also runs on its own from the `agrigine` folder, for example `python3 scripts/rma_pull.py`.

## Where things are

| Path | What it does |
|---|---|
| `app/page.tsx`, `app/plan/page.tsx` | The explorer and the plan page |
| `components/Explorer.tsx` | State, camera and layout for the explorer |
| `components/GlobeMap.tsx` | The deck.gl globe and flat map |
| `components/LayersPanel.tsx` | Layer picker, filtering key, height, filters |
| `components/profile/` | The county, state and outside-the-data profiles |
| `lib/metrics.ts` | Every layer: how it reads the data, its color bins and labels |
| `lib/compute.ts` | Colors, heights and key counts for the current view |
| `lib/state.ts` | Explorer state and the shareable URL format |
| `scripts/build_data.py` | Builds the data bundle from `../data` |

Any view can be shared by its URL, for example `/?county=19007&year=2012&crop=C&layer=anom&height=wk&tab=drought`.
