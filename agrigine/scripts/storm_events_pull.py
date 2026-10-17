"""Download NOAA Storm Events (2000-2025) and keep county-filed events in California, Delaware, Iowa and Nebraska.

Writes data/processed/storms/storm_events.csv, one row per event:
    event_id,fips,date,type,magnitude,magnitude_type,crop_damage_usd,property_damage_usd,lat,lon

Yearly source files are cached in data/raw/storms/, so a re-run only downloads what's missing.
Only events filed by county are kept (hail, thunderstorm wind, tornadoes, floods and similar). Events filed by NWS
forecast zone (drought, heat, freeze, winter storms) need a zone-to-county map and are left out for now.

Run from the agrigine folder: python3 scripts/storm_events_pull.py
"""
import re
import urllib.request
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
RAW = DATA / "raw" / "storms"
OUT = DATA / "processed" / "storms" / "storm_events.csv"
BASE = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/"
YEARS = range(2000, 2026)
STATE_FIPS = {6, 10, 19, 31}
COLUMNS = ["EVENT_ID", "STATE_FIPS", "CZ_TYPE", "CZ_FIPS", "EVENT_TYPE", "BEGIN_YEARMONTH", "BEGIN_DAY",
           "MAGNITUDE", "MAGNITUDE_TYPE", "DAMAGE_CROPS", "DAMAGE_PROPERTY", "BEGIN_LAT", "BEGIN_LON"]


def dollars(v):
    """NOAA writes damage as text like '25.00K', '1.5M' or '0.00K'."""
    if not isinstance(v, str) or not v.strip():
        return None
    v = v.strip().upper()
    scale = {"K": 1e3, "M": 1e6, "B": 1e9, "H": 1e2}.get(v[-1], 1)
    try:
        return round(float(v[:-1] if v[-1] in "KMBH" else v) * scale)
    except ValueError:
        return None


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    listing = urllib.request.urlopen(BASE, timeout=60).read().decode()
    frames = []
    for year in YEARS:
        names = sorted(set(re.findall(rf"StormEvents_details-ftp_v1\.0_d{year}_c\d+\.csv\.gz", listing)))
        if not names:
            print(f"{year}: no file listed, skipped")
            continue
        path = RAW / names[-1]
        if not path.exists():
            urllib.request.urlretrieve(BASE + names[-1], path)
        df = pd.read_csv(path, usecols=COLUMNS, dtype={"CZ_TYPE": str, "DAMAGE_CROPS": str, "DAMAGE_PROPERTY": str}, low_memory=False)
        df = df[df.STATE_FIPS.isin(STATE_FIPS) & (df.CZ_TYPE == "C")]
        frames.append(df)
        print(f"{year}: {len(df):,} county events")
    ev = pd.concat(frames, ignore_index=True)
    ym = ev.BEGIN_YEARMONTH.astype(int)
    out = pd.DataFrame({
        "event_id": ev.EVENT_ID.astype(int),
        "fips": ev.STATE_FIPS.astype(int).map("{:02d}".format) + ev.CZ_FIPS.astype(int).map("{:03d}".format),
        "date": pd.to_datetime(dict(year=ym // 100, month=ym % 100, day=ev.BEGIN_DAY.astype(int))).dt.strftime("%Y-%m-%d"),
        "type": ev.EVENT_TYPE,
        "magnitude": ev.MAGNITUDE,
        "magnitude_type": ev.MAGNITUDE_TYPE,
        "crop_damage_usd": ev.DAMAGE_CROPS.map(dollars),
        "property_damage_usd": ev.DAMAGE_PROPERTY.map(dollars),
        "lat": ev.BEGIN_LAT,
        "lon": ev.BEGIN_LON,
    }).sort_values(["fips", "date", "event_id"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    print(f"Wrote {OUT.relative_to(DATA.parent)}: {len(out):,} events, {out.fips.nunique()} counties")
    print(out.type.value_counts().head(12).to_string())


if __name__ == "__main__":
    main()
