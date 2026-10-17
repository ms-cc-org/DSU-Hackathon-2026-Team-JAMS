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

`public/data/agrigine.json` is checked in, so you only need this after the files in `../data` change. It uses the repo's Python environment (pandas and pyarrow):

```bash
cd agrigine
../.venv/bin/python scripts/build_data.py
```

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
