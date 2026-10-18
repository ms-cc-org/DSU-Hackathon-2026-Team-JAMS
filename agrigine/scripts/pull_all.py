"""Pull every dataset Agrigine adds and rebuild the app's data files, in order, so a fresh clone ends up with
the same data/ folder we use.

The hackathon's base data ships with the repo (data/master_dataset.*, data/counties.geojson and
data/processed/{nass,acis,drought,soil,irrigation,modis}). This script adds everything on top of it:

    step       source                                       writes
    storms     NOAA Storm Events                            data/processed/storms/storm_events.csv
    derived    hackathon daily weather (no download)        data/processed/derived/*.csv
    power      NASA POWER daily weather and soil moisture   data/processed/power/daily/<year>.parquet
    insurance  USDA RMA crop insurance Cause of Loss        data/processed/insurance/cause_of_loss.csv
    cities     Census places and 2024 populations           data/processed/cities/cities.csv
    bundle     all of the above                             agrigine/public/data/agrigine.json
    daily      daily weather and NASA POWER                 agrigine/public/data/daily/*.bin
    api        the bundle, split for the MCP server         agrigine/public/data/api/

Downloads are cached in data/raw/<source>/, so a re-run only fetches what's missing. A step whose output already
exists is skipped unless you pass --force; the two app files are rebuilt whenever a step before them ran.
A full first run downloads about 500 MB and takes roughly 10 to 20 minutes.

Run from anywhere (Python 3.11+, packages in scripts/requirements.txt):

    python3 agrigine/scripts/pull_all.py                      # everything that's missing
    python3 agrigine/scripts/pull_all.py --force              # redo every step
    python3 agrigine/scripts/pull_all.py --only power,daily   # just these steps
"""
import argparse
import importlib.util
import subprocess
import sys
import time
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
DATA = APP.parent / "data"
BUNDLE = APP / "public" / "data" / "agrigine.json"

# name, script, output that marks the step done, whether it builds app files from earlier steps
STEPS = [
    ("storms", "storm_events_pull.py", DATA / "processed/storms/storm_events.csv", False),
    ("derived", "derive_weather.py", DATA / "processed/derived/weather_season.csv", False),
    ("power", "power_pull.py", DATA / "processed/power/daily/2025.parquet", False),
    ("insurance", "rma_pull.py", DATA / "processed/insurance/cause_of_loss.csv", False),
    ("cities", "cities_pull.py", DATA / "processed/cities/cities.csv", False),
    ("bundle", "build_data.py", BUNDLE, True),
    ("daily", "build_daily.py", APP / "public/data/daily/normals.bin", True),
    ("api", "build_api.py", APP / "public/data/api/index.json", True),
]
BASE = ["master_dataset.parquet", "counties.geojson", "processed/acis/weather_daily.parquet",
        "processed/drought/drought_weekly.parquet", "processed/soil/soil_county.parquet",
        "processed/irrigation/nass_irrigation.parquet", "processed/modis/modis_ndvi_county.parquet"]
PACKAGES = ["pandas", "pyarrow", "numpy", "matplotlib"]


def run(name, script):
    print(f"\n=== {name}: scripts/{script}", flush=True)
    start = time.time()
    result = subprocess.run([sys.executable, str(APP / "scripts" / script)], cwd=APP)
    if result.returncode:
        sys.exit(f"\n{name} failed (exit {result.returncode}). Fix the error above, then re-run; finished steps are skipped.")
    return time.time() - start


def main():
    names = [s[0] for s in STEPS]
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="re-run steps even if their output exists")
    parser.add_argument("--only", help=f"comma-separated steps to run: {','.join(names)}")
    args = parser.parse_args()
    only = set(args.only.split(",")) if args.only else None
    if only and (unknown := only - set(names)):
        sys.exit(f"Unknown step(s): {', '.join(sorted(unknown))}. Steps: {', '.join(names)}")

    if sys.version_info < (3, 11):
        sys.exit(f"Python 3.11 or newer is needed (this is {sys.version.split()[0]}).")
    if missing := [p for p in PACKAGES if importlib.util.find_spec(p) is None]:
        sys.exit(f"Missing packages: {', '.join(missing)}. Install them with:\n"
                 f"    {sys.executable} -m pip install -r {APP / 'scripts' / 'requirements.txt'}")
    if missing := [p for p in BASE if not (DATA / p).exists()]:
        sys.exit("The hackathon base data is missing from data/: " + ", ".join(missing) +
                 "\nIt ships with the repo; check out the full repository (git pull) and try again.")

    done, changed = [], False
    for name, script, output, builds in STEPS:
        if only and name not in only:
            continue
        # The NASA POWER pull reads county centers from the bundle, so build it first on a clean checkout.
        if name == "power" and not BUNDLE.exists():
            done.append(("bundle (for county centers)", run("bundle", "build_data.py")))
        if output.exists() and not args.force and not (builds and changed):
            print(f"--- {name}: already there, skipping ({output.relative_to(APP.parent)})")
            continue
        done.append((name, run(name, script)))
        changed = True

    print("\nDone." if done else "\nNothing to do: every output exists. Use --force to rebuild.")
    for name, seconds in done:
        print(f"  {name:<12} {seconds:6.0f} s")


if __name__ == "__main__":
    main()
