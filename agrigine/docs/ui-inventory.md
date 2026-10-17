# Agrigine UI inventory

Everything the interface has to account for, for the redesign. The visual design is open. What's listed here is what must still exist and work afterwards.

**Tags:** **[Built]** is in the current app. **[New]** is forecast work not built yet. **[Experimental]** is live 2026 data, which must be labeled Experimental wherever it appears.

**Decisions so far:**
- Forecasts live in a forecast zone at the end of the timeline.
- Every layer that can be predicted gets a forecast.
- How to show uncertainty is the UI team's call (section 9).
- Live 2026 data comes in, marked Experimental.

---

## 1. App shell and pages

| Item | Status | Must cover |
|---|---|---|
| Pages | Built | Explore (`/`) and Plan (`/plan`) |
| Top bar | Built | Logo and name "Agrigine", search, Globe/Map switch, Explore/Plan navigation |
| Main area | Built | The map with floating panels: Layers on the left, profile on the right, map controls |
| Timeline bar | Built | Along the bottom of Explore |
| Shareable links | Built | The address bar always holds the view: county, state, season, crop, layer, height, globe or map, profile tab. **New:** forecast mode and "as of" date |
| Loading | Built | While the 2.6 MB data file loads |
| Data failed to load | Built | Says what failed and how to rebuild the data |
| Map can't draw (no WebGL) | Built | Map area explains; search and profiles still work |
| Light and dark theme | Built | Panels follow the system theme. The map stays light in both, to keep data colors accurate. Redesign may revisit |
| Narrow screens (≤ 960 px) | Built | Layers becomes a drawer; the profile becomes a bottom sheet; search moves to its own row |
| Reduced motion | Built | No fly animations or growing columns |
| Keyboard | Built | Every control, tab, key band and chart bar is reachable and has a visible focus state |
| Data credits | Built | A credit line on the map and full credits on Plan. Required by the data sources |

## 2. Map

| Item | Status | Must cover |
|---|---|---|
| Globe view | Built | Space background, ocean, land, country borders and coastlines, state borders, county lines |
| Flat map view | Built | Same layers. Can tilt to show height |
| Opening animation | Built | Flies in from space to the four states |
| Fly to a selection | Built | Centers the place in the gap between the floating panels |
| County fill states | Built | **Colored** (has a value) · **Hollow** (no data: not reported, not grown) · **Gray** (a real "none" or within the neutral band) · **Ghost** (filtered out). Hollow and gray must never look alike |
| 3D height | Built | A second layer raises counties; taller always means more of the named thing |
| Selected county | Built | Outline and name label |
| Labels | Built | Names of the four states; selected county name |
| Hover tooltip, county | Built | County, season, colored layer value or why it's missing, height value, "click for full profile" |
| Hover tooltip, outside states | Built | "Not in the hackathon data" for the other 46 states |
| Click a county | Built | Opens the county profile |
| Click a covered state's empty area | Built | Opens the state profile |
| Click anywhere else | Built | "Outside the data" message with buttons to the four states |
| Map controls | Built | Zoom in, zoom out, back to the four states |
| Map details toggles | Built | Country borders, state borders, county lines, labels |
| Forecast look | **New** | Counties showing predictions must be told apart from observed ones at a glance (see section 8) |

## 3. Layers panel

| Item | Status | Must cover |
|---|---|---|
| Open and collapse | Built | Collapsed shows a pill with the current layer's name and group color |
| Five layer groups | Built | Each has its own color and icon, always shown with its name: Crops, Drought, Weather, Land & water, Satellite |
| Layer list | Built | Each layer shows its name, a small preview of its colors, and whether it's on |
| "On map" marker | Built | Which group the current layer belongs to |
| Key | Built | Layer name, unit, which season it describes, one row per color band with a label, county count and count bar, plus a No data row |
| Key as a filter | Built | Click a band to hide or show those counties. "X of Y counties shown" and Show all |
| Height picker | Built | Ten options including Flat. Hint explains what taller means and how to tilt |
| State filter | Built | Four states with county counts. At least one stays on |
| Crop picker | Built | Corn, Soybeans, Wheat, Sorghum |
| Reported-yield filter | Built | Show only counties with a reported yield |
| Forecast in the key | **New** | Says when the key shows predictions, and for which season and "as of" date |
| Layers with no forecast | **New** | When the timeline is in the forecast zone, soil, satellite and irrigation layers have no prediction. The UI must say so rather than show an empty map |

### All layers

| Group | Layer | Unit | Forecast? |
|---|---|---|---|
| Crops | Yield vs trend | % vs the county's trend | Yes |
| Crops | Yield | bushels per acre | Yes |
| Crops | Harvested acres | acres | No: needs NASS acreage reports |
| Crops | Production | million bushels | Yes |
| Crops | **Chance of a big loss** | % chance of losing 15%+ | **New layer**, forecast only |
| Drought | Worst drought level | D0–D4, Drought Monitor colors | Yes |
| Drought | Weeks in severe drought | weeks in D2+ | Yes |
| Drought | Drought intensity | DSCI, 0–500 | Yes |
| Weather | Rainfall | mm in the season | Rough: season so far plus normal |
| Weather | Rainfall vs normal | % | Rough |
| Weather | Days at 35 °C or hotter | days | Rough |
| Weather | Average temperature | °C | Rough |
| Weather | Growing degree days | heat units | Rough |
| Weather | **Frost-safe planting date** | date | **New layer** |
| Land & water | Soil water storage | mm | No: doesn't change |
| Land & water | Drought-prone soil | % of county | No: doesn't change |
| Land & water | Soil productivity | NCCPI, 0–1 | No: doesn't change |
| Land & water | Irrigated share | % of acres | No: data ends 2018 |
| Satellite | Peak greenness | NDVI | No: after-the-fact data |
| Satellite | Greenness vs normal | % | No |
| Satellite | Peak greenness date | date | No |
| (anchor) | **Priority rank** | rank among state counties | **New layer** for the judged decision |

"Rough" forecasts lean on normal weather for the rest of the season, so the UI should present them as weaker than the yield and drought forecasts.

## 4. Timeline

| Item | Status | Must cover |
|---|---|---|
| Play and pause | Built | Steps through seasons |
| Season display | Built | The year and "Corn season" (etc.) |
| Slider | Built | 2000–2025 with tick years |
| Drought strip | Built | Bars per season for the share of counties with 4+ weeks of severe drought; the selected season stands out |
| Off for fixed layers | Built | Soil layers turn the slider off with a reason |
| Forecast zone | **New** | After 2025, a 2026 forecast zone that clearly reads as "predicted, not observed" |
| "As of" date | **New** | The day the forecast is made (for example May 1, Jun 1, Jul 1, Aug 1, or today in 2026). Changing it changes every prediction |
| Replay a past season | **New** | Pick a past season and an "as of" date to see what Agrigine would have predicted then, next to what actually happened. This is the evidence judges ask for |

## 5. County profile

| Item | Status | Must cover |
|---|---|---|
| Header | Built | State, FIPS code, county name, coordinates, crops grown, the season and crop being shown, Zoom to county, Close |
| Six summary tiles | Built | Yield, vs trend, worst drought, rain vs normal, days ≥ 35 °C, greenness. Clicking one colors the map by it. A missing value shows its reason |
| Tabs | Built | Overview, Crops, Weather, Drought, Land & water, Satellite, each in its group color. **New:** a 7th tab, Outlook |
| Overview | Built | Plain-language summary of the season; yield vs trend for 2000–2025 with severe-drought seasons marked; where the county ranks in its state on six measures; data coverage per crop |
| Crops | Built | Harvest table for every crop grown (yield, vs trend, planted, harvested, production); yield history per crop; irrigated vs dryland where published |
| Weather | Built | Season rainfall, temperature, hot days, GDD; rainfall by month vs average; daily highs by month vs average; season rainfall vs normal for 2000–2025 |
| Drought | Built | Season drought level, weeks, intensity; week-by-week drought for the year; drought report card (severe seasons, typical loss in them, worst season); weeks in severe drought by season |
| Land & water | Built | Soil storage, drought-prone share, productivity per crop, each against the state; irrigated share history; Nebraska irrigation note |
| Satellite | Built | Greenness measures for the year; greenness vs normal for 2000–2025; note that it's county-wide and after the fact |
| Chart interactions | Built | Hover shows the value; clicking a season's bar jumps the whole app to that season |
| Outlook tab | **New** | The forecast for each predictable measure; its range; what drives it ("13 weeks of severe drought so far", "rain 40% below normal"); similar past seasons; how accurate the model was on years it wasn't built on |
| Forecast in tiles and charts | **New** | Tiles show the forecast in the forecast zone; history charts extend with a forecast season that is visibly different |

### Missing-data states the profile must handle

| Case | Message today |
|---|---|
| County doesn't grow the crop | "No corn grown here" and the other tabs still work |
| Crop planted, no grain harvested | "Planted, no grain harvested" |
| No yield reported that season | "No reported yield" |
| Under 15 reported seasons | Warning: thin record, read with care |
| County has no crops at all (23 counties) | Weather, drought and soil still shown |
| No satellite record | Says the extension covers the 230 crop counties |
| Iowa irrigation | "Iowa is rainfed: no irrigation series" |
| Winter wheat | Note that its season starts the September before |
| **New:** no forecast for this measure | Says which measures can be forecast |
| **Experimental:** live data unavailable | Says the forecast falls back to history only |

## 6. State profile and outside the data

| Item | Status | Must cover |
|---|---|---|
| State header | Built | State name, number of counties, season shown, Close |
| State tiles | Built | Counties growing the crop, median vs trend, share in severe drought, median rain vs normal |
| State history | Built | Median yield vs trend for 2000–2025, drought seasons marked |
| Hardest-hit list | Built | Top eight counties on the current layer; click opens the county |
| Coverage | Built | Reported counties per crop for the season |
| Outside the data | Built | The place's name, what Agrigine covers, buttons to the four states |
| State forecast | **New** | State totals and share of counties at risk for the forecast season |

## 7. Search

| Item | Status | Must cover |
|---|---|---|
| Search counties and states | Built | Suggestions while typing; Enter or picking a suggestion opens it |
| No match | Built | Explains what's covered |
| Shows the open place | Built | The box shows the county or state that's open |

## 8. Forecasts **[New]**

| Item | Must cover |
|---|---|
| Labeling | Every prediction is labeled as a forecast on the map, key, tooltip, tiles, charts, and in shared links |
| Forecast season | 2026 for now. The design should allow later seasons |
| "As of" date | Always visible when looking at a forecast |
| What the data provides | A predicted value, a low-to-high range, and the model's accuracy on held-out years, for every forecast layer |
| Accuracy ("how we know") | Per layer: which years it was tested on and how it scored (for example "average error 6 points on 2016–2025"). Must be easy to find. The judges score this |
| Replay | Past season plus "as of" date shows prediction vs what happened (see Timeline) |
| Drivers | The top reasons behind a county's forecast, in plain words |
| Caveat | County averages only; estimates, not guarantees |

## 9. Uncertainty **[UI team decides]**

Each forecast comes with a range and an accuracy score. The redesign decides how to show them in each place:

- Map fill (are unsure counties faded, patterned, separate?)
- Map height
- Key and its filter (can users hide low-confidence counties?)
- Tooltip
- Profile tiles
- Charts' forecast season
- Outlook tab
- State profile

## 10. Live 2026 data **[Experimental]**

| Item | Must cover |
|---|---|
| What it is | 2026 daily weather (NOAA ACIS) and weekly drought (U.S. Drought Monitor), fetched live, no key |
| Experimental label | Wherever 2026 live data appears: timeline zone, map, key, tooltip, profile, Outlook |
| Data through date | "Data through Oct 14, 2026" or similar |
| Loading | While it fetches |
| Unavailable | Offline or source down: falls back to history-only forecasts and says so |
| Partial | Some counties or weeks missing |
| No 2026 yields | NASS hasn't published 2026 county yields, so 2026 yield appears only as a forecast |

## 11. Rules the redesign must keep

- **Drought colors** are the Drought Monitor's official D0–D4 colors. Drought officers read them on sight.
- **No data is not zero.** Hollow (missing) and gray (none) stay visibly different.
- **Color is never alone.** Group colors come with names and icons; map colors come with a key and table-like counts.
- **Thin data is flagged.** California, Delaware, sorghum and Iowa wheat have few reported yields.
- **Nebraska soil needs the irrigation note.** Low-storage soil there is often heavily irrigated.
- **Seasons differ by crop:** corn May–Sep, soybeans May–Oct, sorghum Jun–Oct, winter wheat Sep–Jun across two years.
- **Credits stay visible.** The data sources require attribution.

## 12. Open questions for the UI team

1. How uncertainty looks (section 9).
2. How the forecast zone and Experimental label look.
3. Whether the map stays light in dark mode.
4. Phone layout: drawer and bottom sheet, or something else.
5. Whether Plan stays in the app or moves to the repo README.
