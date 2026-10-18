"""Write the small JSON files the Agrigine MCP server (agrigine/worker/) reads: public/data/api/.

The MCP server runs on the Cloudflare Workers free tier, which allows 10 ms of CPU per request: too little to parse
the 6 MB bundle. So the bundle is split into files small enough to read in a millisecond or two:

    index.json               every county (name, state, position in the daily files, crops grown), every city,
                             and the layout of the daily weather files
    county/<fips>.json       one county's full record from agrigine.json, without its outline
    season/<ST>-<crop>.json  per state and crop, the season numbers the ranking tool compares

Run from the agrigine folder after build_data.py and build_daily.py: python3 scripts/build_api.py
"""
import json
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
DATA = APP / "public" / "data"
OUT = DATA / "api"
CROP_INDEX = {"C": 0, "S": 1, "W": 2, "G": 3}


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")))


def main():
    bundle = json.loads((DATA / "agrigine.json").read_text())
    daily = json.loads((DATA / "daily" / "index.json").read_text())
    years = bundle["years"]
    if OUT.exists():
        shutil.rmtree(OUT)

    dump(OUT / "index.json", {
        "years": years,
        "weekStart": bundle["weekStart"],
        "daily": daily,
        "counties": [{"f": c["f"], "n": c["n"], "s": c["s"], "i": j, "c": c["c"], "crops": sorted(c["d"])}
                     for j, c in enumerate(bundle["counties"])],
        "cities": bundle.get("cities", []),
    })

    seasons = {}
    for c in bundle["counties"]:
        dump(OUT / "county" / f"{c['f']}.json", {k: v for k, v in c.items() if k != "p"})
        for k, d in c["d"].items():
            paid = [0] * len(years)
            for yi, crop_i, _group, usd in c.get("ins", []):
                if crop_i == CROP_INDEX[k]:
                    paid[yi] += usd
            seasons.setdefault(f"{c['s']}-{k}", {})[c["f"]] = {
                "n": c["n"], "y": d["y"], "a": d["a"], "st": d["st"], "ap": d["ap"], "sv": d["sv"], "wk": d["wk"],
                "pa": d["pa"], "ht": d["ht"], "ins": paid,
            }
    for key, rows in seasons.items():
        dump(OUT / "season" / f"{key}.json", rows)

    size = sum(p.stat().st_size for p in OUT.rglob("*.json"))
    print(f"Wrote {OUT.relative_to(APP)}: {len(bundle['counties'])} county files, {len(seasons)} season files, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
