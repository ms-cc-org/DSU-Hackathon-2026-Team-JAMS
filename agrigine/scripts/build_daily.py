"""Write the app's day-by-day weather files: agrigine/public/data/daily/<year>.bin, normals.bin and index.json.

The source is data/processed/acis/weather_daily.parquet (daily high, low and rain per county, 1999-2025). The app
loads one small file per year as the date dial reaches it, so phones never download all 26 years at once.

<year>.bin   int16, little-endian, laid out [channel][county][day of year]; missing = -32768
             channels: tmax (0.1 C), tmin (0.1 C), pcpn (0.1 mm), rain7 (0.1 mm, last 7 days),
                       rain30 (mm, last 30 days), dry (days since a day with 2.5 mm or more of rain)
normals.bin  int16, [channel][county][calendar day 0-365, Feb 29 included]
             channels: rain30 (mm, 2000-2025 average), tmax (0.1 C, 2000-2025 average smoothed over 15 days)
County order matches public/data/agrigine.json, which follows data/counties.geojson.

Run from the agrigine folder: python3 scripts/build_daily.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
OUT = APP / "public" / "data" / "daily"
YEARS = range(2000, 2026)
MISSING = -32768
CHANNELS = ["tmax", "tmin", "pcpn", "rain7", "rain30", "dry"]
SCALE = [10, 10, 10, 10, 1, 1]


def main():
    order = [f["id"] for f in json.loads((DATA / "counties.geojson").read_text())["features"]]
    wx = pd.read_parquet(DATA / "processed" / "acis" / "weather_daily.parquet")
    wx["fips"] = wx.fips.astype(str)
    dates = pd.date_range("1999-01-01", "2025-12-31", freq="D")
    wide = {col: wx.pivot(index="date", columns="fips", values=col).reindex(index=dates, columns=order)
            for col in ["tmax_c", "tmin_c", "pcpn_mm"]}
    rain = wide["pcpn_mm"]
    rain7 = rain.rolling(7, min_periods=7).sum()
    rain30 = rain.rolling(30, min_periods=30).sum()
    steps = pd.DataFrame(np.arange(len(dates))[:, None].repeat(len(order), 1), index=dates, columns=order)
    last_wet = steps.where(rain >= 2.5).ffill()
    dry = (steps - last_wet).clip(upper=365).where(rain.notna())
    channels = [wide["tmax_c"], wide["tmin_c"], rain, rain7, rain30, dry]

    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for year in YEARS:
        rows = dates.year == year
        stack = np.stack([(ch[rows].to_numpy().T * s) for ch, s in zip(channels, SCALE)])  # [channel][county][day]
        out = np.where(np.isnan(stack), MISSING, np.round(stack)).astype("<i2")
        path = OUT / f"{year}.bin"
        out.tofile(path)
        total += path.stat().st_size

    # Normals by calendar day, on a leap-year calendar so Feb 29 has a slot
    recent = dates.year >= 2000
    slot = pd.Index((dates[recent].map(lambda d: pd.Timestamp(2000, d.month, d.day)) - pd.Timestamp(2000, 1, 1)).days)
    r30 = rain30[recent].groupby(slot).mean()
    tmax = wide["tmax_c"][recent].groupby(slot).mean()
    tmax = pd.concat([tmax.iloc[-7:], tmax, tmax.iloc[:7]]).rolling(15, center=True).mean().iloc[7:-7]
    normals = np.stack([r30.to_numpy().T * 1, tmax.to_numpy().T * 10])
    np.where(np.isnan(normals), MISSING, np.round(normals)).astype("<i2").tofile(OUT / "normals.bin")

    (OUT / "index.json").write_text(json.dumps({
        "years": list(YEARS), "channels": CHANNELS, "scale": SCALE, "missing": MISSING, "counties": len(order),
        "normals": {"channels": ["rain30", "tmax"], "scale": [1, 10], "days": 366},
    }))
    print(f"Wrote {len(YEARS)} yearly files ({total / 1e6:.1f} MB) and normals.bin for {len(order)} counties")
    i, d = order.index("19153"), (pd.Timestamp("2012-07-15") - pd.Timestamp("2012-01-01")).days
    arr = np.fromfile(OUT / "2012.bin", dtype="<i2").reshape(len(CHANNELS), len(order), -1)
    print("Polk County, IA on 2012-07-15:", {c: arr[k, i, d] / s for k, (c, s) in enumerate(zip(CHANNELS, SCALE))})


if __name__ == "__main__":
    main()
