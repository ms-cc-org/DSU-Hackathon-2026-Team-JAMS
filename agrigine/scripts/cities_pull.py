"""Cities and towns in California, Delaware, Iowa and Nebraska, from the U.S. Census Bureau.

Locations come from the 2024 Gazetteer place file; populations from the Vintage 2024 population estimates
(incorporated places). Each place is assigned to the county that contains its interior point.

Writes data/processed/cities/cities.csv:
    geoid, name, state, fips, lat, lon, population, kind
Raw downloads are cached in data/raw/cities/.

Run from the agrigine folder: python3 scripts/cities_pull.py
"""
import io
import json
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from matplotlib.path import Path as Polygon

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
RAW = DATA / "raw" / "cities"
OUT = DATA / "processed" / "cities" / "cities.csv"
GAZETTEER = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip"
POPULATION = "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv"
STATES = {"CA": "06", "DE": "10", "IA": "19", "NE": "31"}


def cached(url):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / url.rsplit("/", 1)[-1]
    if not path.exists():
        urllib.request.urlretrieve(url, path)
    return path


def main():
    with zipfile.ZipFile(cached(GAZETTEER)) as z:
        gaz = pd.read_csv(io.BytesIO(z.read(z.namelist()[0])), sep="\t", dtype={"GEOID": str}, encoding="latin-1")
    gaz.columns = [c.strip() for c in gaz.columns]
    gaz = gaz[gaz.USPS.isin(STATES)]

    pop = pd.read_csv(cached(POPULATION), dtype={"STATE": str, "PLACE": str}, encoding="latin-1")
    pop = pop[pop.SUMLEV == 162]
    pop["GEOID"] = pop.STATE.str.zfill(2) + pop.PLACE.str.zfill(5)
    places = gaz.merge(pop[["GEOID", "POPESTIMATE2024"]], on="GEOID", how="inner")

    # County of each place: the county outline that contains its interior point
    geo = json.loads((DATA / "counties.geojson").read_text())
    points = places[["INTPTLONG", "INTPTLAT"]].to_numpy()
    fips = np.full(len(places), "", dtype=object)
    for feat in geo["features"]:
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            inside = Polygon(np.array(poly[0])).contains_points(points)
            fips[inside & (fips == "")] = feat["id"]

    kind = places.NAME.str.extract(r"\b(city|town|village|CDP)$", expand=False).fillna("place")
    name = places.NAME.str.replace(r"\s+(city|town|village|CDP)$", "", regex=True)
    out = pd.DataFrame({
        "geoid": places.GEOID, "name": name, "state": places.USPS, "fips": fips,
        "lat": places.INTPTLAT.round(4), "lon": places.INTPTLONG.round(4),
        "population": places.POPESTIMATE2024.astype(int), "kind": kind,
    })
    out = out[out.fips != ""].sort_values("population", ascending=False)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    print(f"Wrote {OUT.relative_to(DATA.parent)}: {len(out):,} places")
    print(out.groupby("state").size().to_string())
    print(out.head(8).to_string(index=False))


if __name__ == "__main__":
    main()
