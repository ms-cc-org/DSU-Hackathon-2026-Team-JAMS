"""Derive crop-relevant weather measures from the daily weather file the hackathon ships (no download needed).

Writes two CSVs to data/processed/derived/, following the hackathon conventions (FIPS as text, harvest year):

weather_season.csv, one row per county x crop x season, over each crop's growing season:
    fips,year,crop,hot_nights,flowering_heat_days,longest_dry_spell_days,heavy_rain_days
  hot_nights              nights with a low of 22 C or warmer
  flowering_heat_days     days at 32 C or hotter in the flowering month (corn Jul, soybeans and sorghum Aug, wheat May)
  longest_dry_spell_days  longest run of days with under 1 mm of rain
  heavy_rain_days         days with 25 mm of rain or more

freeze_dates.csv, one row per county x calendar year:
    fips,year,last_spring_freeze_doy,first_fall_freeze_doy,frost_free_days,spring_rain_mm
  A freeze is a daily low of 0 C or colder. Blank when no freeze happened in that half of the year.

Run from the agrigine folder: python3 scripts/derive_weather.py
"""
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
OUT = DATA / "processed" / "derived"
YEARS = range(2000, 2026)
# (start month, start day), (end month, end day), whether the season starts the year before harvest
SEASONS = {"CORN": ((5, 1), (9, 30), False), "SOYBEANS": ((5, 1), (10, 31), False),
           "SORGHUM": ((6, 1), (10, 31), False), "WHEAT": ((9, 1), (6, 30), True)}
FLOWERING_MONTH = {"CORN": 7, "SOYBEANS": 8, "SORGHUM": 8, "WHEAT": 5}


def season_rows(wx, crop):
    (sm, sd), (em, ed), crosses = SEASONS[crop]
    md = wx.date.dt.month * 100 + wx.date.dt.day
    if crosses:
        late = md >= sm * 100 + sd
        early = md <= em * 100 + ed
        rows = wx[late | early].copy()
        rows["season"] = rows.date.dt.year + late[late | early].astype(int)
    else:
        inside = (md >= sm * 100 + sd) & (md <= em * 100 + ed)
        rows = wx[inside].copy()
        rows["season"] = rows.date.dt.year
    return rows[rows.season.isin(YEARS)]


def longest_dry_spell(rows):
    rows = rows.sort_values(["fips", "season", "date"])
    dry = rows.pcpn_mm < 1
    key = rows.fips + rows.season.astype(str)
    new_run = (~dry) | (key != key.shift())
    run = dry.astype(int).groupby(new_run.cumsum()).cumsum()
    return run.groupby([rows.fips, rows.season]).max()


def main():
    wx = pd.read_parquet(DATA / "processed" / "acis" / "weather_daily.parquet")
    wx["fips"] = wx.fips.astype(str)

    parts = []
    for crop in SEASONS:
        rows = season_rows(wx, crop)
        g = rows.groupby(["fips", "season"])
        flower = rows[rows.date.dt.month == FLOWERING_MONTH[crop]]
        table = pd.DataFrame({
            "hot_nights": g.tmin_c.apply(lambda s: int((s >= 22).sum())),
            "flowering_heat_days": (flower.tmax_c >= 32).groupby([flower.fips, flower.season]).sum(),
            "longest_dry_spell_days": longest_dry_spell(rows),
            "heavy_rain_days": g.pcpn_mm.apply(lambda s: int((s >= 25).sum())),
        }).fillna(0).astype(int).reset_index().rename(columns={"season": "year"})
        table.insert(2, "crop", crop)
        parts.append(table)
    season = pd.concat(parts).sort_values(["fips", "year", "crop"])

    wx["year"] = wx.date.dt.year
    wx["doy"] = wx.date.dt.dayofyear
    frost = wx[wx.tmin_c <= 0]
    spring = frost[frost.date.dt.month <= 7].groupby(["fips", "year"]).doy.max().rename("last_spring_freeze_doy")
    fall = frost[frost.date.dt.month >= 8].groupby(["fips", "year"]).doy.min().rename("first_fall_freeze_doy")
    rain = wx[wx.date.dt.month.isin([4, 5])].groupby(["fips", "year"]).pcpn_mm.sum().round().rename("spring_rain_mm")
    grid = pd.MultiIndex.from_product([sorted(wx.fips.unique()), YEARS], names=["fips", "year"])
    freeze = pd.concat([spring, fall, rain], axis=1).reindex(grid)
    freeze.insert(2, "frost_free_days", freeze.first_fall_freeze_doy - freeze.last_spring_freeze_doy)
    freeze = freeze.reset_index().astype({"last_spring_freeze_doy": "Int64", "first_fall_freeze_doy": "Int64", "frost_free_days": "Int64", "spring_rain_mm": "Int64"})

    OUT.mkdir(parents=True, exist_ok=True)
    season.to_csv(OUT / "weather_season.csv", index=False)
    freeze.to_csv(OUT / "freeze_dates.csv", index=False)
    print(f"weather_season.csv: {len(season):,} rows; freeze_dates.csv: {len(freeze):,} rows")
    print(season[(season.fips == "19153") & (season.year == 2012)].to_string(index=False))
    print(freeze[(freeze.fips == "19153") & (freeze.year == 2012)].to_string(index=False))


if __name__ == "__main__":
    main()
