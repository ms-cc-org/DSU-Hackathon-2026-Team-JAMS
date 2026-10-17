# Meteorology data to add

What the hackathon dataset leaves out, where to get it, and what it would add to Agrigine. This is a plan; nothing here is built yet.

## What we already have

The hackathon data has daily rainfall, high and low temperature (NOAA ACIS), and weekly Drought Monitor maps. From those it derives season rainfall, average temperature, days at 35 °C or hotter, and growing degree days.

What it doesn't have is everything else that drives crop stress: how dry the air is, how much water the soil holds right now, how much water crops are losing, sunlight, wind and storms, and the large-scale climate patterns that make seasonal forecasts possible.

## Recommended additions

### 1. gridMET (start here)

One source covers most of the gaps. It is daily, about 4 km, for the lower 48, from 1979 to today. It's free with no key, through the Climatology Lab's THREDDS server or Google Earth Engine (`IDAHO_EPSCOR/GRIDMET`, `GRIDMET/DROUGHT`).

| Variable | Why it matters for crops |
|---|---|
| Vapor pressure deficit (VPD) | How hard the air pulls water from the plant. One of the strongest predictors of corn and soybean yield loss, often stronger than temperature alone |
| Reference evapotranspiration (ET₀) | How much water a crop would use. Rain minus ET₀ is the real water balance |
| Solar radiation | Energy for growth; cloudy seasons limit yield |
| Humidity (min and max) | Heat stress and disease risk |
| Wind speed | Lodging, drying, storm damage |
| PDSI, SPI, SPEI | Standard drought indices at 1 to 12 month time scales. SPEI includes heat, not just rain |
| EDDI | Evaporative Demand Drought Index: an early warning for flash drought, often weeks ahead of the Drought Monitor |

### 2. NOAA Storm Events Database

Hail, thunderstorm wind and derechos, tornadoes, floods and freezes, from 1950 to today. Free CSV downloads from NOAA NCEI, no key. Each event has a date, a county or forecast zone, and a damage estimate, including a **crop damage** dollar field.

Why: drought data can't explain losses from storms. The August 2020 derecho that flattened Iowa corn is invisible in the current data.

Note: some events are filed by forecast zone instead of county, so those need mapping to counties.

### 3. Soil moisture

- **NASA SMAP:** root-zone soil moisture at about 9 km, 2015 to today, through Google Earth Engine.
- **NOAA CPC soil moisture:** monthly, coarser, 1948 to today. Useful for the long history SMAP lacks.

Why: soil moisture is what the crop actually draws on. It links rainfall, soil type (already in our data) and drought.

### 4. Forecast inputs

These make the "rough" weather forecasts in the app real.

| Source | What it gives | Access |
|---|---|---|
| NOAA CPC outlooks | Chance of above- or below-normal temperature and rainfall for the next 1 and 3 months, archived since 1995 | Free GIS downloads |
| Open-Meteo | 16-day weather forecasts and seasonal forecasts by point, plus historical reanalysis back to 1940, including soil moisture, ET₀, VPD, radiation and gusts | Free for non-commercial use, no key, credit required |
| ENSO index (ONI) | El Niño or La Niña state, one value per month since 1950. A known driver of Corn Belt seasons | Free from NOAA CPC |

Open-Meteo is also the simplest way to fetch **live 2026** conditions for every county centroid, which fits the Experimental live-data plan.

### 5. Free from data we already have

The daily weather file already supports measures the master table never computed:

| Measure | Why |
|---|---|
| Hot nights (low of 22 °C or higher) | Warm nights cut corn yield even when days are normal |
| Heat during pollination (mid-July) | The most sensitive two weeks for corn |
| Longest dry spell | Consecutive days without meaningful rain |
| Heavy rain days (25 mm or more) | Flooding, nutrient loss, prevented planting |
| Last spring freeze and first fall freeze | Season length and frost risk |
| Wet spring | Rain in April and May delays planting |

## How it shows up in the app

| Where | Addition |
|---|---|
| Weather group | VPD, solar radiation, humidity, wind, hot nights, pollination heat, dry spells, heavy rain days, freeze dates |
| Drought group | Soil moisture, ET₀ and water balance, SPI, SPEI, PDSI, EDDI |
| **New group: Storms** | Hail, damaging wind, tornadoes, floods, freezes, reported crop damage |
| Timeline | ENSO state per season, alongside the drought strip |
| Forecast zone | CPC outlooks and Open-Meteo forecasts feed the weather forecasts; EDDI and soil moisture feed the drought forecast |
| County profile | New rows and charts in the Weather and Drought tabs; a new Storms tab or section listing events by date |

## Coverage to keep in mind

| Source | Years | Note |
|---|---|---|
| gridMET | 1979 → today | Covers all of 2000–2025 |
| Storm Events | 1950 → today | Reporting quality varies by year and county |
| SMAP | 2015 → today | Only 11 of our 26 seasons |
| CPC soil moisture | 1948 → today | Coarse, about 50 km |
| CPC outlooks | 1995 → today | Probabilities, not amounts |
| Open-Meteo | 1940 → today plus forecasts | Point data, sampled at county centroids |

## Suggested order

1. Derived measures from the daily file. No new download.
2. gridMET VPD, ET₀ and SPEI.
3. Storm Events.
4. CPC outlooks and Open-Meteo for the forecast zone and live 2026.
5. Soil moisture.

Each new source needs a credit line on the map and the Plan page.
