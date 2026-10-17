"""Build agrigine/public/data/agrigine.json, the static data bundle the Agrigine front end loads.

Reads the hackathon files in ../data and writes one compact JSON file: every county's outline, every
county x crop x season from the master table, irrigation, MODIS, monthly weather and weekly drought.

Run from the agrigine folder with the repo's Python environment (needs pandas and pyarrow):

    ../.venv/bin/python scripts/build_data.py
"""
import json
import math
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
OUT = APP / "public" / "data" / "agrigine.json"

YEARS = list(range(2000, 2026))
CROPS = {"CORN": "C", "SOYBEANS": "S", "WHEAT": "W", "SORGHUM": "G"}
STATUS = {"reported": "r", "not_reported": "n", "suppressed": "s"}
B62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def num(v, nd=1):
    if v is None or v is pd.NA or (isinstance(v, float) and math.isnan(v)):
        return None
    return int(round(float(v))) if nd == 0 else round(float(v), nd)


def arr(series, nd):
    return [num(v, nd) for v in series]


def read(path):
    df = pd.read_parquet(DATA / path)
    if "fips" in df:
        df["fips"] = df["fips"].astype(str)
    return df


def read_optional_csv(path):
    """Add-on CSVs (scripts/derive_weather.py, scripts/storm_events_pull.py). Missing ones are skipped."""
    p = DATA / path
    if not p.exists():
        print(f"  (skipped {path}: not built yet)")
        return None
    return pd.read_csv(p, dtype={"fips": str})


# Storm event types the app groups; anything else is "other".
STORM_TYPE = {"Hail": 0, "Thunderstorm Wind": 1, "High Wind": 1, "Strong Wind": 1, "Tornado": 2, "Flash Flood": 3, "Flood": 3}
DAY0 = pd.Timestamp("2000-01-01")


def main():
    master = read("master_dataset.parquet")
    master[["extreme_heat_days", "max_drought_severity", "weeks_in_d2_plus"]] = master[
        ["extreme_heat_days", "max_drought_severity", "weeks_in_d2_plus"]
    ].astype("float64")
    soil = read("processed/soil/soil_county.parquet").set_index("fips")
    irr = read("processed/irrigation/nass_irrigation.parquet")
    modis = read("processed/modis/modis_ndvi_county.parquet")
    geo = json.loads((DATA / "counties.geojson").read_text())

    # Monthly rainfall totals and mean daily highs, 2000-2025
    wx = read("processed/acis/weather_daily.parquet")
    wx = wx[wx.date.dt.year >= 2000]
    monthly = (
        wx.assign(y=wx.date.dt.year, m=wx.date.dt.month)
        .groupby(["fips", "y", "m"])
        .agg(p=("pcpn_mm", "sum"), x=("tmax_c", "mean"))
    )

    # Weekly drought: two characters per week, the worst category covering over 1% of the county and the DSCI
    dr = read("processed/drought/drought_weekly.parquet").sort_values(["fips", "map_date"])
    weeks = sorted(dr.map_date.unique())
    if any((weeks[i + 1] - weeks[i]).days != 7 for i in range(len(weeks) - 1)):
        raise SystemExit("Drought Monitor weeks are not evenly spaced; the week encoding assumes they are.")
    worst = pd.Series(0, index=dr.index)
    for k in range(5):
        worst = worst.where(~(dr[[f"D{j}" for j in range(k, 5)]].sum(axis=1) > 1), k + 1)
    dr["code"] = worst.astype(int).astype(str) + dr.dsci.clip(0, 500).map(lambda v: B62[int(round(v / 500 * 61))])
    weekly = dr.groupby("fips").code.apply("".join)

    # Add-on data: derived season weather, freeze dates and NOAA storm events
    season_wx = read_optional_csv("processed/derived/weather_season.csv")
    season_wx = None if season_wx is None else dict(tuple(season_wx.groupby("fips")))
    freeze = read_optional_csv("processed/derived/freeze_dates.csv")
    freeze = None if freeze is None else dict(tuple(freeze.groupby("fips")))
    storms = read_optional_csv("processed/storms/storm_events.csv")
    if storms is not None:
        storms["day"] = (pd.to_datetime(storms.date) - DAY0).dt.days
        storms = storms[(storms.day >= 0) & (pd.to_datetime(storms.date).dt.year <= 2025)]
        storms = dict(tuple(storms.groupby("fips")))

    counties = []
    for feat in geo["features"]:
        fips, props, g = feat["id"], feat["properties"], feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        rings = []
        for poly in polys:
            ring, last = [], None
            for lon, lat in poly[0]:
                pt = [round(lon, 3), round(lat, 3)]
                if pt != last:
                    ring.append(pt)
                last = pt
            rings.append(ring)
        pts = [p for r in rings for p in r]
        s = soil.loc[fips] if fips in soil.index else None
        rec = {
            "f": fips,
            "n": props["county_name"].replace(" County", ""),
            "s": props["state_alpha"],
            "p": rings,
            "c": [round(sum(p[0] for p in pts) / len(pts), 3), round(sum(p[1] for p in pts) / len(pts), 3)],
            "aws": None if s is None else num(s.aws_100cm_mm, 0),
            "dr": None if s is None else num(s.droughty_pct, 1),
            "nc": {},
            "d": {},
            "ir": {},
        }
        nccpi = {} if s is None else {"C": s.nccpi_corn, "S": s.nccpi_soy, "W": s.nccpi_sg, "G": s.nccpi_corn}
        rows = master[master.fips == fips]
        for crop, k in CROPS.items():
            sub = rows[rows.crop == crop].set_index("year")
            if sub.empty:
                continue
            rec["nc"][k] = num(nccpi.get(k), 2)
            sub = sub.reindex(YEARS)
            rec["d"][k] = {
                "y": arr(sub.yield_per_acre, 1),
                "a": arr(sub.yield_anomaly_pct, 1),
                "st": "".join(STATUS.get(v, "-") for v in sub.yield_status),
                "ap": arr(sub.acres_planted, 0),
                "ah": arr(sub.acres_harvested, 0),
                "pr": arr(sub.precip_mm, 0),
                "pa": arr(sub.precip_anomaly_pct, 0),
                "tv": arr(sub.tavg_c, 1),
                "ht": arr(sub.extreme_heat_days, 0),
                "gd": arr(sub.gdd, 0),
                "sv": arr(sub.max_drought_severity, 0),
                "wk": arr(sub.weeks_in_d2_plus, 0),
                "ds": arr(sub.mean_dsci, 0),
            }
            ir = irr[(irr.fips == fips) & (irr.crop == crop)].set_index("year").reindex(YEARS)
            if ir.irrigated_share.notna().any() or ir.yield_irrigated.notna().any():
                rec["ir"][k] = {
                    "sh": arr(ir.irrigated_share, 2),
                    "yi": arr(ir.yield_irrigated, 1),
                    "yn": arr(ir.yield_non_irrigated, 1),
                }
        md = modis[modis.fips == fips].set_index("year").reindex(YEARS)
        rec["md"] = None if md.ndvi_mean.isna().all() else {
            "nm": arr(md.ndvi_mean, 3),
            "nx": arr(md.ndvi_max, 3),
            "em": arr(md.evi_mean, 3),
            "na": arr(md.ndvi_anomaly_pct, 1),
            "pk": arr(md.peak_ndvi_doy, 0),
        }
        if fips in monthly.index.get_level_values(0):
            mm = monthly.loc[fips].reindex(pd.MultiIndex.from_product([YEARS, range(1, 13)]))
            rec["mp"] = arr(mm.p, 0)
            rec["mx"] = arr(mm.x, 1)
        rec["wkc"] = weekly.get(fips)
        if not rec["ir"]:
            del rec["ir"]
        if season_wx is not None and fips in season_wx:
            sw = season_wx[fips]
            rec["sw"] = {}
            for crop, k in CROPS.items():
                s = sw[sw.crop == crop].set_index("year").reindex(YEARS)
                if s.hot_nights.notna().any():
                    rec["sw"][k] = {"hn": arr(s.hot_nights, 0), "fh": arr(s.flowering_heat_days, 0),
                                    "dry": arr(s.longest_dry_spell_days, 0), "hr": arr(s.heavy_rain_days, 0)}
        if freeze is not None and fips in freeze:
            f = freeze[fips].set_index("year").reindex(YEARS)
            rec["fz"] = {"ls": arr(f.last_spring_freeze_doy, 0), "ff": arr(f.first_fall_freeze_doy, 0), "sr": arr(f.spring_rain_mm, 0)}
        if storms is not None and fips in storms:
            # [days since 2000-01-01, type code, magnitude, crop damage in USD]
            rec["ev"] = [[int(e.day), STORM_TYPE.get(e.type, 4), num(e.magnitude, 2), int(e.crop_damage_usd) if pd.notna(e.crop_damage_usd) else 0]
                         for e in storms[fips].itertuples()]
        counties.append(rec)

    bundle = {"years": YEARS, "weekStart": str(pd.Timestamp(weeks[0]).date()), "nWeeks": len(weeks), "counties": counties}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, separators=(",", ":")))
    print(f"Wrote {OUT.relative_to(APP)}: {len(counties)} counties, {len(weeks)} drought weeks, {OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
