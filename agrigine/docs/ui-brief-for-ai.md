# Agrigine UI brief

Paste this whole file into an AI design or coding tool. It describes everything the Agrigine interface has to handle. It is self-contained and assumes no other context.

---

## 1. What you are designing

**Agrigine** is a web app for exploring U.S. county farm data on a 3D globe, like Google Earth for crop risk. A user picks a layer (for example "yield vs trend" or "weeks in severe drought"), sees every county colored by it, scrubs through seasons from 2000 to 2025, and clicks a county to see everything known about it.

It covers 253 counties in four states (California, Delaware, Iowa, Nebraska), four crops (corn, soybeans, winter wheat, sorghum), and 26 seasons. It is being built for a 24-hour university hackathon judged on usefulness to a real user, use of evidence, and a live demo.

**Primary user:** a state drought program coordinator deciding which counties get drought help first. **Other users:** crop insurers, extension agents, grain buyers.

**The one question the UI must make easy to answer:** *Where is crop risk highest this season, why, and how sure are we?*

## 2. Your task

Redesign the whole interface. Keep every capability listed in this brief working. Visual style, layout and component design are yours to decide, within the rules in section 11.

Deliver:
1. A design direction: color tokens for light and dark, type scale, spacing, and component style.
2. Designs for every screen and state in sections 4 to 10, including empty, loading, error and missing-data states.
3. If you write code, follow the technical constraints in section 13.

## 3. Status tags

- **[Built]**: exists today; keep it working.
- **[New]**: forecast features; design them now.
- **[Planned data]**: new weather and storm data; design for it now.
- **[Experimental]**: live 2026 data. Must carry a visible "Experimental" label everywhere it appears.

---

## 4. Layout and navigation

- **[Built]** Two pages: **Explore** (the map, the main app) and **Plan** (a text page describing the project).
- **[Built]** The top bar holds the app name and logo, search, a **Globe / Map** view switch, and **Explore / Plan** navigation.
- **[Built]** Explore is full-window. The map fills it, with:
  - a **Layers panel** (choose what to show, plus the key)
  - a **Profile panel** (details for whatever was clicked)
  - **map controls** (zoom in, zoom out, back to the four states)
  - a **timeline** along the bottom
- **[Built]** Panels float over the map. The map must stay visible and usable around them. On laptop screens (1280 × 720) panels must not run off-screen; long content scrolls inside the panel.
- **[Built]** Every view has a shareable URL with this format:
  `/?county=19153&year=2012&crop=C&layer=anom&height=wk&tab=drought&view=map`. **[New]** Add forecast mode and the "as of" date to it.
- **[Built]** Narrow screens (960 px and below): the Layers panel becomes a drawer opened by a button; the Profile becomes a bottom sheet over about 58% of the screen; search moves to its own row; Globe and Map become icon-only buttons.
- **[Built]** A trackpad pinch must zoom the map, never the whole page.

## 5. The map

- **[Built]** **Globe view:** a 3D Earth with satellite imagery, country borders and coastlines, state borders and county lines. Opens in space and flies in to the four states. The starting zoom fits the screen.
- **[Built]** **Flat map view:** the same layers; can tilt to show 3D height.
- **[Built]** **Satellite imagery** can be switched off for a plain map (useful on slow Wi-Fi).
- **[Built]** **County fills.** Four states that must always look different:
  - **Colored:** has a value; the color comes from the key.
  - **Hollow:** no data (not reported, not grown, no value). The ground shows through.
  - **Gray:** a real "none" or "within normal" value.
  - **Ghost:** filtered out by the user. Dimmed or veiled.
- **[Built]** **3D height:** a second layer can raise counties. Taller always means "more of the named thing". Heights are capped so they never spike off the globe when zoomed out.
- **[Built]** **Selected county:** a clear outline. Its name should show on the map. The name labels currently don't render, so the redesign should fix this.
- **[Built]** **Hover tooltip** on a county: county and state, season and crop, the colored layer's value (or why it's missing), the height layer's value, and "click for full profile".
- **[Built]** **Hover on a state with no data:** "Not in the hackathon data. Agrigine covers California, Delaware, Iowa and Nebraska."
- **[Built]** **Clicks:**
  - a county opens its profile
  - an empty part of one of the four states opens the state profile
  - anywhere else opens an "outside the data" message
- **[Built]** **Map detail toggles:** satellite imagery, country borders, state borders, county lines, labels.
- **[Built]** **Fly-to:** selecting a place moves the camera so the place sits in the uncovered part of the map, not under a panel.
- **[New]** **Forecast look:** counties showing predictions must be told apart from observed data at a glance.
- **[Experimental]** **Live 2026 look:** marked Experimental on the map.

## 6. Layers panel and key

- **[Built]** **Collapse and expand.** When collapsed, a pill shows the current layer and its group color.
- **[Built]** **Layer groups.** Each has its own color and icon, always shown with its name. Today there are five: **Crops, Drought, Weather, Land & water, Satellite**. **[Planned data]** A sixth, **Storms**, is coming; plan the group color system for six.
- **[Built]** **Layer rows.** Name, a small preview of its color scale, and selected state. Only one layer colors the map at a time.
- **[Built]** **Key.** Shows the layer name, unit, and which season or "doesn't change by season". It has one row per color band: band label, county count, and a small bar for the count. A **No data** row comes last. It also shows "X of Y counties shown".
- **[Built]** **The key is also a filter.** Click a band to hide or show those counties, with "Show all" to reset. This is a signature feature; keep it obvious.
- **[Built]** **Height picker.** None, or one of: weeks in severe drought, yield loss below trend, drought intensity, rain deficit, days at 35 °C or hotter, yield, production, drought-prone soil, greenness drop. A hint explains what taller means and how to tilt.
- **[Built]** **Filters:**
  - the four states, with county counts (at least one stays on)
  - crop (Corn, Soybeans, Wheat, Sorghum)
  - "Only counties with a reported yield"
- **[New]** In the forecast zone, the key says it shows predictions and gives the "as of" date. Layers that can't be forecast say so instead of showing an empty map.

### Layer catalog

| Group | Layer | Unit | Forecast |
|---|---|---|---|
| Crops | Yield vs trend | % vs county trend (diverging: loss, normal, gain) | Yes |
| Crops | Yield | bushels per acre | Yes |
| Crops | Harvested acres | acres | No |
| Crops | Production | million bushels | Yes |
| Crops | **[New]** Chance of a big loss | % chance of a 15%+ loss | Forecast only |
| Drought | Worst drought level | Drought Monitor categories None, D0–D4 | Yes |
| Drought | Weeks in severe drought | weeks in D2 or worse | Yes |
| Drought | Drought intensity | DSCI, 0–500 | Yes |
| Drought | **[Planned data]** Soil moisture | % of normal | Yes |
| Drought | **[Planned data]** Water balance (rain minus crop water demand) | mm | Yes |
| Drought | **[Planned data]** SPI, SPEI, PDSI | standard drought indices | Yes |
| Drought | **[Planned data]** EDDI (flash drought warning) | percentile | Yes |
| Weather | Rainfall | mm in the growing season | Rough |
| Weather | Rainfall vs normal | % (diverging: dry, normal, wet) | Rough |
| Weather | Days at 35 °C or hotter | days | Rough |
| Weather | Average temperature | °C | Rough |
| Weather | Growing degree days | heat units | Rough |
| Weather | **[Planned data]** Vapor pressure deficit (dry air) | kPa | Yes |
| Weather | **[Planned data]** Solar radiation | MJ/m² | Rough |
| Weather | **[Planned data]** Humidity | % | Rough |
| Weather | **[Planned data]** Wind and gusts | m/s | Short-range only |
| Weather | **[Planned data]** Hot nights | nights with a low of 22 °C+ | Rough |
| Weather | **[Planned data]** Heat during pollination | days ≥ 35 °C in mid-July | Rough |
| Weather | **[Planned data]** Longest dry spell | days | Rough |
| Weather | **[Planned data]** Heavy rain days | days with 25 mm+ | Rough |
| Weather | **[Planned data]** Last spring and first fall freeze | date | Yes |
| Weather | **[New]** Frost-safe planting date | date | Forecast only |
| Storms | **[Planned data]** Hail, damaging wind, tornado, flood, freeze events | count per season | No |
| Storms | **[Planned data]** Reported crop damage | dollars | No |
| Land & water | Soil water storage | mm (fixed, no seasons) | No |
| Land & water | Drought-prone soil | % of county (fixed) | No |
| Land & water | Soil productivity | 0–1 index (fixed) | No |
| Land & water | Irrigated share | % of acres (mostly Nebraska, 2000–2018) | No |
| Satellite | Peak greenness | NDVI 0–1 | No |
| Satellite | Greenness vs normal | % (diverging) | No |
| Satellite | Peak greenness date | date | No |
| (decision) | **[New]** Priority rank | rank within the state | Yes |

"Rough" means the forecast leans on normal weather for the rest of the season. Present it as weaker than the yield and drought forecasts.

## 7. Timeline

- **[Built]** Play and pause (steps one season per second), a large year display, the crop season label, and a slider from 2000 to 2025.
- **[Built]** A **drought strip** above the slider: one bar per season for the share of counties with 4+ weeks of severe drought, with the selected season highlighted. Drought years such as 2002, 2012 and 2022 should jump out.
- **[Built]** Off for fixed layers (soil), with the reason.
- **[Planned data]** ENSO state per season (El Niño, La Niña, neutral) alongside the drought strip.
- **[New]** **Forecast zone** after 2025 ("2026 forecast"). It must read as predicted, not observed.
- **[New]** **"As of" date:** the day the forecast is made (May 1, Jun 1, Jul 1, Aug 1, or today in 2026). Changing it changes every prediction.
- **[New]** **Replay a past season:** pick a past season and an "as of" date to see what Agrigine would have predicted next to what actually happened. This is the main evidence for judges, so give it a prominent place.

## 8. Profile panel

### County profile **[Built]**

- **Header:**
  - state and 5-digit FIPS code, county name, coordinates, and the crops the county grows
  - "Showing the 2012 corn season (May–Sep)"
  - Zoom to county and Close buttons
- **Six summary tiles:** yield, vs trend, worst drought, rain vs normal, days ≥ 35 °C, greenness vs normal.
  - Each has its group's color, a value and a short line under it.
  - Clicking a tile colors the whole map by that layer.
  - A missing value shows the reason instead.
- **Tabs, in group colors:** Overview, Crops, Weather, Drought, Land & water, Satellite.
  - **[Planned data]** Storms.
  - **[New]** Outlook.
- **Overview tab:**
  - a one-paragraph plain-language summary of the season
  - yield vs trend bars for 2000–2025, with severe-drought seasons highlighted
  - "Compared with other [state] counties": six rows, each showing every county as a tick, this county as a dot, and its rank
  - data coverage per crop (seasons reported out of 26)
- **Crops tab:**
  - a harvest table for each crop grown this season: yield, vs trend, planted, harvested, production. Clicking a row switches crop.
  - a yield history sparkline per crop
  - irrigated vs dryland yields where published
- **Weather tab:**
  - season rainfall, average temperature, hot days and GDD
  - rainfall by month against the 2000–2025 average
  - average daily high by month against the average
  - season rainfall vs normal for 2000–2025
  - **[Planned data]** VPD, radiation, humidity, wind, hot nights, dry spells and freeze dates
- **Drought tab:**
  - season worst level, weeks in D2+ and drought intensity
  - **week-by-week drought** for the year (bar height is intensity, color is the Drought Monitor level, the growing season shaded)
  - a drought report card: severe seasons, typical yield change in them vs other seasons, worst season
  - weeks in severe drought by season
  - **[Planned data]** soil moisture and EDDI
- **Land & water tab:**
  - soil water storage, drought-prone share and productivity, each compared with the state
  - irrigated share history
  - a Nebraska note that low-storage soils are often heavily irrigated
- **Satellite tab:**
  - peak and average greenness, EVI, greenness vs normal, and the greenest day
  - greenness vs normal for 2000–2025
  - a note that the satellite sees all vegetation over the calendar year
- **[Planned data] Storms tab:** storm events by date for the season (type, crop damage) and a count per season.
- **[New] Outlook tab:**
  - the forecast for each predictable measure, with its range
  - the top reasons in plain words ("13 weeks of severe drought so far", "rain 40% below normal")
  - similar past seasons
  - how accurate the model was on years it wasn't built on
- **Charts:**
  - every chart has a hover value
  - clicking a season's bar jumps the whole app to that season
  - **[New]** charts extend with a visibly different forecast season

### Missing-data states the profile must handle

- The county doesn't grow the selected crop (the other tabs still work).
- The crop was planted but no grain was harvested.
- No yield was reported that season.
- A thin record (under 15 reported seasons): show a warning.
- The county has no crops at all (23 counties); weather, drought and soil still show.
- No satellite record.
- Iowa has no irrigation series because it is rainfed.
- Winter wheat's season starts the September before.
- **[New]** No forecast exists for this measure.
- **[Experimental]** Live data is unavailable, so the forecast uses history only.

### State profile **[Built]**

- **Header:** state name, county count and the season shown.
- **Tiles:** counties growing the crop, median vs trend, share in severe drought, and median rain vs normal.
- **History:** median yield vs trend for 2000–2025, with drought seasons marked.
- **Hardest-hit list:** the top eight counties on the current layer; clicking one opens it.
- **Coverage:** reported counties per crop.
- **[New]** State totals for the forecast season.

### Outside the data **[Built]**

The place's name, a sentence on what Agrigine covers, and buttons for the four states.

## 9. Search **[Built]**

- Search counties ("Polk County, Iowa") and states, with suggestions as you type.
- Enter or picking a suggestion opens the place.
- Typing a partial name must not jump early ("Iowa" on its way to "Iowa County").
- When nothing matches, say what Agrigine covers.
- The box shows the open place.

## 10. Forecasts, uncertainty and live data

### Forecasts **[New]**

- Label every prediction as a forecast on the map, key, tooltip, tiles, charts and shared links.
- Each forecast layer has a predicted value, a low-to-high range, and an accuracy score from years the model wasn't trained on (for example "average error 6 points on 2016–2025"). The accuracy score must be easy to find.
- Show the top drivers of each county's forecast in plain words.
- Caveat: county averages only; estimates, not guarantees.

### Uncertainty **[Your decision]**

Choose how to show the range and accuracy in each place:

- map fill
- map height
- the key, including whether users can hide low-confidence counties
- tooltip
- tiles
- charts
- the Outlook tab
- the state profile

### Live 2026 data **[Experimental]**

- **Sources:** 2026 weather and drought fetched live (NOAA ACIS, U.S. Drought Monitor, Open-Meteo).
- **Label:** "Experimental" everywhere it appears.
- **Freshness:** show a "data through" date.
- **States:** loading; unavailable (fall back to history-only forecasts and say so); partial (some counties or weeks missing).
- **No 2026 yields** exist yet, so 2026 yield appears only as a forecast.

## 11. Rules the design must follow

- **Drought colors** use the U.S. Drought Monitor's official palette: None gray, D0 #FFFF00, D1 #FCD37F, D2 #FFAA00, D3 #E60000, D4 #730000. Drought officers read these on sight.
- **No data is not zero.** Hollow (missing) and gray (none) stay visibly different everywhere.
- **Color never stands alone.** Group colors come with names and icons; map colors come with the key; values are readable as text in the profile.
- **Colorblind-safe scales.** Sequential scales use one hue from light to dark. Diverging scales use two opposite hues with a gray middle. Check every palette with a colorblind simulator.
- **Taller means more.** In 3D, height always means more of the named thing.
- **Thin data is flagged:** California, Delaware, sorghum and Iowa wheat have few reported yields.
- **Seasons differ by crop:** corn May–Sep, soybeans May–Oct, sorghum Jun–Oct, winter wheat Sep–Jun across two calendar years.
- **Credits stay visible:** USDA NASS, U.S. Drought Monitor, NOAA ACIS, NRCS SSURGO, NASA MODIS, U.S. Census, Natural Earth, Esri imagery, plus each **[Planned data]** source.
- **Accessibility:**
  - every control works by keyboard and has a visible focus state
  - charts have text equivalents
  - reduced-motion turns off fly animations and growing columns
  - text contrast meets WCAG AA
- **Themes:** support light and dark. Decide whether the map stays the same in both.

## 12. Copy

- Plain words, sentence case, active voice. Say exactly what a control does: "Show all", not "Reset filter state".
- Use the data's real terms with a short explanation the first time: D2 (severe drought), DSCI (drought intensity, 0–500), NDVI (greenness), NCCPI (soil productivity, 0–1), VPD (how dry the air is).
- Missing data always says why: "No reported yield", "Planted, no grain harvested", "No corn grown here".
- Errors say what happened and what to do.

## 13. Technical constraints

- **Stack:** Next.js 16 (App Router), React 19, TypeScript, plain CSS (`app/globals.css`). The map is deck.gl 9.4 with `_GlobeView` and `MapView`; satellite tiles come from Esri World Imagery; outlines from the `world-atlas` and `us-atlas` packages.
- **No backend.** Data is a static file, `public/data/agrigine.json`, built by `scripts/build_data.py`. The explorer renders client-side only because of WebGL.
- **Keep these data and logic files** and change them only if a feature needs it:
  - `lib/metrics.ts`: every layer's reader, color bins and labels
  - `lib/compute.ts`: colors, heights and key counts per view
  - `lib/state.ts`: state, actions and the URL format
  - `lib/data.ts`, `lib/types.ts`
- **The UI lives in** `components/` and `app/`; redesign freely.
- **Data shape per county:** FIPS, name, state, outline, centroid, soil values, and per crop 26-season arrays (yield, vs trend, status, acres, rainfall, temperature, hot days, GDD, drought level, weeks in D2+, DSCI). Optional extras: irrigation arrays, satellite arrays, monthly rainfall and highs (26 × 12), and a weekly drought string.
- **Run it** with `cd agrigine && npm install && npm run dev`.

## 14. Open questions for you to decide

1. How uncertainty looks (section 10).
2. How the forecast zone and the Experimental label look.
3. A six-color group palette that stays colorblind-safe with the Storms group added.
4. Whether the map changes in dark mode.
5. The phone layout: a drawer and bottom sheet, or something better.
6. How to fit about 37 layers into the Layers panel without it becoming a wall of options.
