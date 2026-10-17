"""Download USDA Risk Management Agency (RMA) crop insurance Cause of Loss data, 2000-2025.

Keeps corn, soybeans, wheat and grain sorghum in California, Delaware, Iowa and Nebraska, and writes
data/processed/insurance/cause_of_loss.csv, one row per county x crop x crop year x cause x month of loss:
    year, fips, crop, cause, cause_group, loss_year, loss_month, policies_indemnified, indemnity_usd

cause_group folds RMA's causes into: drought, heat, wet, hail, wind, freeze, price, other.
RMA reports all wheat together (winter and spring); in these four states nearly all of it is winter wheat.
Yearly zip files are cached in data/raw/rma/.

Run from the agrigine folder: python3 scripts/rma_pull.py
"""
import io
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
RAW = DATA / "raw" / "rma"
OUT = DATA / "processed" / "insurance" / "cause_of_loss.csv"
BASE = "https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/cause_of_loss/"
YEARS = range(2000, 2026)
STATES = {"CA", "DE", "IA", "NE"}
CROPS = {"CORN": "CORN", "SOYBEANS": "SOYBEANS", "WHEAT": "WHEAT", "GRAIN SORGHUM": "SORGHUM"}
FIELDS = ["year", "state_code", "state", "county_code", "county", "commodity_code", "commodity", "plan_code", "plan",
          "coverage", "stage", "cause_code", "cause", "month_code", "month_name", "loss_year", "policies_earning",
          "policies_indemnified", "planted_qty", "endorsed_acres", "liability", "premium", "producer_premium", "subsidy",
          "state_subsidy", "additional_subsidy", "efa_discount", "determined_qty", "indemnity", "loss_ratio"]
GROUPS = [  # first match wins
    ("drought", ["drought"]),
    ("heat", ["heat", "hot wind"]),
    ("wet", ["moisture", "precip", "rain", "flood", "cold wet"]),
    ("hail", ["hail"]),
    ("wind", ["wind", "tornado", "hurricane", "cyclone"]),
    ("freeze", ["freeze", "frost", "cold winter", "winterkill"]),
    ("price", ["price", "revenue"]),
]


def group(cause):
    c = cause.lower()
    for name, words in GROUPS:
        if any(w in c for w in words):
            return name
    return "other"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    frames = []
    for year in YEARS:
        path = RAW / f"colsom_{year}.zip"
        if not path.exists():
            urllib.request.urlretrieve(f"{BASE}colsom_{year}.zip", path)
        with zipfile.ZipFile(path) as z:
            text = z.read(z.namelist()[0]).decode("latin-1")
        df = pd.read_csv(io.StringIO(text), sep="|", header=None, names=FIELDS, dtype=str, usecols=range(30))
        df = df.apply(lambda s: s.str.strip())
        df["commodity"] = df.commodity.str.upper()  # RMA switched to title case in 2014
        df = df[df.state.isin(STATES) & df.commodity.isin(CROPS)]
        frames.append(df)
        print(f"{year}: {len(df):,} rows", flush=True)
    rma = pd.concat(frames, ignore_index=True)
    out = pd.DataFrame({
        "year": rma.year.astype(int),
        "fips": rma.state_code.str.zfill(2) + rma.county_code.str.zfill(3),
        "crop": rma.commodity.map(CROPS),
        "cause": rma.cause,
        "cause_group": rma.cause.fillna("").map(group),
        "loss_year": pd.to_numeric(rma.loss_year, errors="coerce").astype("Int64"),
        "loss_month": pd.to_numeric(rma.month_code, errors="coerce").astype("Int64"),
        "policies_indemnified": pd.to_numeric(rma.policies_indemnified, errors="coerce").fillna(0).astype(int),
        "indemnity_usd": pd.to_numeric(rma.indemnity, errors="coerce").fillna(0).round().astype(int),
    })
    keys = ["year", "fips", "crop", "cause", "cause_group", "loss_year", "loss_month"]
    out = out.groupby(keys, dropna=False, as_index=False)[["policies_indemnified", "indemnity_usd"]].sum()
    out = out[out.indemnity_usd > 0].sort_values(keys)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    print(f"Wrote {OUT.relative_to(DATA.parent)}: {len(out):,} rows, {out.fips.nunique()} counties, ${out.indemnity_usd.sum() / 1e9:.1f}B in payouts")
    print(out.groupby("cause_group").indemnity_usd.sum().sort_values(ascending=False).map(lambda v: f"${v / 1e6:,.0f}M").to_string())


if __name__ == "__main__":
    main()
