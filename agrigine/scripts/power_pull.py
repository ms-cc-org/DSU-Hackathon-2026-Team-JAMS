"""Pull extra daily weather and soil moisture from NASA POWER for every county (1999-11-01 to 2025-12-31).

NASA POWER (power.larc.nasa.gov) serves daily weather from the MERRA-2 reanalysis (about 0.5 degree) and
satellite sunlight (about 1 degree), with no key. One request per county, at the county's center point.

Writes data/processed/power/daily/<year>.parquet (daily data is parquet, as decided), columns:
    fips, date, vpd_kpa, et0_mm, srad_wm2, wind_ms, rh_pct, soil_wetness_pct
  vpd_kpa           vapor pressure deficit: how hard dry air pulls water from plants
  et0_mm            FAO-56 Penman-Monteith reference evapotranspiration: crop water demand
  srad_wm2          incoming sunlight, daily mean
  wind_ms           wind speed at 2 m
  rh_pct            relative humidity at 2 m, daily mean
  soil_wetness_pct  root-zone soil wetness, 0 (dry) to 100 (saturated)

Responses are cached in data/raw/power/<fips>.csv, so a re-run only fetches what's missing.
Run from the agrigine folder: python3 scripts/power_pull.py
"""
import io
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
RAW = DATA / "raw" / "power"
OUT = DATA / "processed" / "power" / "daily"
PARAMS = "T2M,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN,GWETROOT"
URL = "https://power.larc.nasa.gov/api/temporal/daily/point?parameters={p}&community=AG&longitude={lon}&latitude={lat}&start=19991101&end=20251231&format=CSV"


def fetch(fips, lon, lat):
    path = RAW / f"{fips}.csv"
    if path.exists() and path.stat().st_size > 10000:
        return path
    for attempt in range(4):
        try:
            body = urllib.request.urlopen(URL.format(p=PARAMS, lon=lon, lat=lat), timeout=120).read()
            path.write_bytes(body)
            return path
        except Exception:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"NASA POWER failed for {fips}")


def sat_vp(t):
    """Saturation vapor pressure, kPa, at temperature t in C (FAO-56 eq. 11)."""
    return 0.6108 * np.exp(17.27 * t / (t + 237.3))


def et0_fao56(tmax, tmin, rh, u2, rs, lat_deg, doy, elev):
    """Daily FAO-56 Penman-Monteith reference evapotranspiration, mm/day."""
    tmean = (tmax + tmin) / 2
    es = (sat_vp(tmax) + sat_vp(tmin)) / 2
    ea = rh / 100 * es
    delta = 4098 * sat_vp(tmean) / (tmean + 237.3) ** 2
    gamma = 0.000665 * 101.3 * ((293 - 0.0065 * elev) / 293) ** 5.26
    phi = np.radians(lat_deg)
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    dec = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(dec), -1, 1))
    ra = 24 * 60 / np.pi * 0.0820 * dr * (ws * np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.sin(ws))
    rso = (0.75 + 2e-5 * elev) * ra
    rnl = 4.903e-9 * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 * (0.34 - 0.14 * np.sqrt(ea)) * (1.35 * np.clip(rs / rso, 0, 1) - 0.35)
    rn = 0.77 * rs - rnl
    return np.maximum(0, (0.408 * delta * rn + gamma * 900 / (tmean + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2)))


def parse(path, fips, lat):
    text = path.read_text()
    head, _, body = text.partition("-END HEADER-")
    elev = float(m.group(1)) if (m := re.search(r"=\s*([-\d.]+)\s*meters", head)) else 300.0
    df = pd.read_csv(io.StringIO(body.strip())).replace(-999, np.nan)
    date = pd.to_datetime(df.YEAR.astype(str), format="%Y") + pd.to_timedelta(df.DOY - 1, unit="D")
    es = (sat_vp(df.T2M_MAX) + sat_vp(df.T2M_MIN)) / 2
    return pd.DataFrame({
        "fips": fips, "date": date,
        "vpd_kpa": (es - df.RH2M / 100 * es).round(2),
        "et0_mm": et0_fao56(df.T2M_MAX, df.T2M_MIN, df.RH2M, df.WS2M, df.ALLSKY_SFC_SW_DWN, lat, df.DOY, elev).round(1),
        "srad_wm2": (df.ALLSKY_SFC_SW_DWN * 11.574).round(0),
        "wind_ms": df.WS2M.round(1),
        "rh_pct": df.RH2M.round(0),
        "soil_wetness_pct": (df.GWETROOT * 100).round(0),
    })


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    bundle = json.loads((APP / "public" / "data" / "agrigine.json").read_text())
    centers = [(c["f"], c["c"][0], c["c"][1]) for c in bundle["counties"]]
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda x: fetch(*x), centers))
    daily = pd.concat([parse(RAW / f"{f}.csv", f, lat) for f, _, lat in centers], ignore_index=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for year, part in daily.groupby(daily.date.dt.year):
        part.to_parquet(OUT / f"{year}.parquet", index=False)
    print(f"Wrote {OUT.relative_to(DATA.parent)}: {daily.fips.nunique()} counties, {len(daily):,} days")
    print(daily[(daily.fips == "19153") & (daily.date == "2012-07-10")].to_string(index=False))


if __name__ == "__main__":
    main()
