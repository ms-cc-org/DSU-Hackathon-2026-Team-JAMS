# Agrigine model benchmarks

Held-out scores for every model in the app, with the exact split, parameters and thresholds that produced each one. Nothing here was scored on data the model trained on.

**Metrics.** *MAE* is mean absolute error on the held-out years, pooled over all test years (not averaged per year). *Skill* = `1 − MAE(model) / MAE(baseline)`: +40% means errors 40% smaller than the baseline's, 0% no better, negative worse. For probabilities, *Brier* = mean of `(p − y)²` and *AUC* is the ROC area. The baseline in every table is the thing a user would otherwise rely on, named in the protocol block.

**Environment.** Apple M2 (8 cores, 16 GB), macOS 15.3.2; Python 3.11, NumPy 2.2.6 on Apple Accelerate, scikit-learn 1.6.1, pandas 2.2.3. `joblib.Parallel(n_jobs=8)`, one BLAS thread per fit (`threadpool_limits(1)`), arrays memory-mapped to workers. `random_state=0` everywhere; re-runs are bit-for-bit repeatable.

## Splits at a glance

| Model | Unit of data | Training rows | Test design | Folds | Baseline | Keep-the-model threshold |
|---|---|---|---|---|---|---|
| Season forecasts, 1–3 yr | county × crop × origin year | 13 targets × 3 horizons; corn +1 yr: 4,661 rows with an answer | Rolling origin: test year Y ∈ 2016…2025, train on rows whose answer year ≤ Y − h | 10 per target × horizon = 390 (× 4 models = 1,536 fits; folds with < 50 train or < 5 test rows skipped) | Place average (expanding mean through T) | Skill ≥ 5% else baseline |
| Season yield, day by day | county × season × day | Corn 3,591 / soybeans 3,152 / wheat 1,074 / sorghum 264 county-seasons with yield + trend; every 7th day of each training season | Rolling origin: test season Y ∈ 2016…2025, train on seasons < Y; app files: leave-one-year-out over 2000–2025 | 40 (4 crops × 10 years) | Trailing trend alone (0% anomaly) | None (shown, labeled experimental where skill ≤ 0) |
| Drought chance, 4 / 8 wk | county × day | Every 7th day from 2000-01-18 to (Dec 31 of Y−1) − horizon, × 253 counties: ≈ 210k rows for Y = 2016 up to ≈ 330k for Y = 2025 | Rolling origin by year; app files: leave-one-year-out minus label windows that touch Y | 20 (2 horizons × 10 years) | County × month usual rate from 2000–2015 only; also "same as now" | None (used as is) |
| Frost risk | county × year freeze dates | 2000–2018 (19 years) | Fixed split: test 2019–2025 (7 years), 251 counties | 1 | — | Safe date = first day with risk ≤ 10% |
| Fade for daily layers | county × day, 13 channels | Normals and fade curves from all of 2000–2025 | 10 origins: Dec 31 of 2015…2024, next 365 days each | 10 | Normal alone | Fade used for every channel (zero gain = equals baseline) |
| Farm models (browser) | farm × crop × season | A farm's own seasons (≥ 3 / 5 / 8 by model) | Leave-one-season-out | n seasons | Farm's mean of the other seasons | Shown with its skill; none hidden |

---

## 1. Season forecasts, 1–3 years ahead

**Protocol** (`Agrigine_Forecasts.ipynb`)

- **Data.** 253 counties (CA, DE, IA, NE), 2000–2025. Yields: USDA NASS, `yield_status == 'reported'` only (230 counties). County-wide measures use one fixed window, **May 1 – Sep 30**, for every county. GDD base 10 °C, cap 30 °C; heat day = Tmax ≥ 35 °C; D2+ week = severe drought on > 1% of the county.
- **Row.** One per place and origin year T, answer at T + h. **Inputs (21 for a crop target, float32):** target at T, T−1, T−2; six drivers (May–Sep rain, Tavg, heat days, DSCI, soil moisture, peak NDVI) at T and T−1; expanding mean of the target through T and its count; origin year; soil AWS (100 cm) and drought-prone %; NCCPI (crop targets); state (categorical). Missing values left missing.
- **Split.** For test year Y ∈ {2016, …, 2025} and horizon h ∈ {1, 2, 3}: `train = rows[target_year ≤ Y − h]`, `test = rows[target_year == Y]`, both restricted to rows with an answer. Fold skipped if `len(train) < 50` or `len(test) < 5`. No shuffling; no tuning on the test years (hyperparameters below were fixed before the backtest).
- **Models.**
  - `place_average`: `test.clim` (fallback: train mean).
  - `county_trend`: `Ridge(alpha=10.0)` on `[target_year, OneHot(fips)]`.
  - `gradient_boosting`: `HistGradientBoostingRegressor(max_iter=250, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=30, l2_regularization=1.0, categorical_features=[state], random_state=0)`, numeric passthrough, state `OrdinalEncoder(unknown=-1)`.
  - `neural_net`: numeric → `SimpleImputer(median, add_indicator=True)` → `StandardScaler`; state → `OneHotEncoder`; `MLPRegressor(hidden_layer_sizes=(32, 16), alpha=2.0, max_iter=600, early_stopping=True, n_iter_no_change=20, random_state=0)` (ReLU, Adam, `validation_fraction=0.1`); target standardized via `TransformedTargetRegressor`.
- **Score.** MAE pooled over the 10 test years (n = pooled county-seasons). Skill vs `place_average`.
- **Selection.** `MIN_GAIN = 0.05`: winner = lowest MAE among models with skill ≥ 0.05; otherwise `place_average`.
- **Range.** Winner's residual quantiles q10 and q90 over the pooled test residuals, added to the point forecast (80% interval).
- **Final fit.** Winner refit on all rows with `target_year ≤ 2025`, predicted from origin 2025; places with `n_obs < 5` get no forecast.
- **Run.** 1,536 fits in 67 s.

### Crop yields (MAE, bu/ac)

| Target | h | Place average | County trend | Gradient boosting | Neural network | n | Winner | Skill |
|---|---|---|---|---|---|---|---|---|
| Corn | 1 | 28.01 | **16.55** | 17.09 | 18.17 | 1,632 | County trend | **+41%** |
| Corn | 2 | 29.09 | **17.66** | 18.74 | 23.38 | 1,632 | County trend | **+39%** |
| Corn | 3 | 30.22 | **20.28** | 20.70 | 27.99 | 1,632 | County trend | **+33%** |
| Soybeans | 1 | 8.82 | **4.74** | 5.22 | 5.59 | 1,424 | County trend | **+46%** |
| Soybeans | 2 | 9.15 | **4.98** | 6.62 | 6.74 | 1,424 | County trend | **+46%** |
| Soybeans | 3 | 9.49 | **5.20** | 6.07 | 5.86 | 1,424 | County trend | **+45%** |
| Winter wheat | 1 | 12.01 | **11.07** | 13.56 | 13.37 | 394 | County trend | +8% |
| Winter wheat | 2 | 12.09 | **10.98** | 12.72 | 12.10 | 394 | County trend | +9% |
| Winter wheat | 3 | 12.26 | **11.50** | 11.61 | 12.94 | 394 | County trend | +6% |
| Sorghum | 1 | 21.29 | 19.35 | **16.86** | 17.16 | 65 | Gradient boosting | **+21%** |
| Sorghum | 2 | 21.67 | 23.88 | 16.78 | **16.25** | 65 | Neural network | **+25%** |
| Sorghum | 3 | 21.82 | 20.52 | 17.44 | **15.08** | 65 | Neural network | **+31%** |

For corn and soybeans the trend carries the signal years ahead; the ML models can learn it too but add variance. Sorghum's n = 65 (6–7 county-seasons per test year) makes its ML wins the least certain numbers in this file.

### Satellite greenness (MAE, index units)

| Target | h | Place average | County trend | Gradient boosting | Neural network | n | Winner | Skill |
|---|---|---|---|---|---|---|---|---|
| Peak NDVI | 1 | 0.0243 | 0.0388 | **0.0205** | 0.0210 | 2,300 | Gradient boosting | **+16%** |
| Peak NDVI | 2 | 0.0250 | 0.0408 | **0.0227** | 0.0228 | 2,300 | Gradient boosting | +9% |
| Peak NDVI | 3 | 0.0255 | 0.0458 | 0.0221 | **0.0204** | 2,300 | Neural network | **+20%** |
| Mean EVI | 1 | 0.0126 | 0.0160 | **0.0104** | 0.0107 | 2,300 | Gradient boosting | **+18%** |
| Mean EVI | 2 | 0.0129 | 0.0172 | 0.0127 | 0.0128 | 2,300 | Place average | 0% (GB +2%, under the 5% bar) |
| Mean EVI | 3 | 0.0132 | 0.0184 | 0.0127 | 0.0142 | 2,300 | Place average | 0% (GB +4%, under the 5% bar) |

### Season weather, drought and soil moisture, May–Sep (MAE)

Nothing cleared the 5% bar except GDD at h = 2 (+6%), which flips sign at the other horizons; the app shows the county's typical season for all of these.

| Target (unit) | Place average h1 / h2 / h3 | County trend | Gradient boosting | Neural network | n | Used |
|---|---|---|---|---|---|---|
| Rain (mm) | **95.9 / 97.1 / 97.4** | 128.1 / 137.6 / 139.2 | 112.9 / 121.9 / 120.1 | 146.6 / 173.0 / 149.7 | 2,530 | Place average |
| Tavg (°C) | **0.566** / 0.575 / 0.584 | 0.591 / 0.600 / 0.593 | 0.653 / **0.565** / **0.579** | 0.640 / 0.669 / 0.667 | 2,530 | Place average (best gain +2%) |
| Days ≥ 35 °C | **4.51 / 4.61 / 4.71** | 5.42 / 5.75 / 6.51 | 5.36 / 5.11 / 5.34 | 6.07 / 7.77 / 5.90 | 2,530 | Place average |
| GDD | **61.7** / 62.6 / 63.5 | 66.0 / 66.9 / 65.9 | 72.7 / **58.8** / **60.7** | 70.3 / 70.3 / 71.8 | 2,530 | Place average h1, h3; GB at h2 (+6%) |
| DSCI (0–500) | **90.0 / 91.6 / 91.8** | 95.9 / 100.4 / 106.1 | 97.3 / 118.3 / 119.3 | 104.4 / 160.8 / 124.6 | 2,530 | Place average |
| Weeks in D2+ | 5.91 / **5.99** / 5.98 | 6.43 / 6.68 / 7.00 | **5.63** / 7.66 / 7.06 | 6.31 / 8.69 / **5.77** | 2,530 | Place average (best +5%, +4%) |
| Soil moisture (% wet) | **3.55 / 3.62 / 3.61** | 4.89 / 5.22 / 5.20 | 4.26 / 5.06 / 4.82 | 4.83 / 6.57 / 6.27 | 2,530 | Place average |

Every candidate at every horizon: `notebooks/forecasts/backtest_scores.csv` (columns `tid, h, model, mae, n, skill`).

---

## 2. Season yield, predicted every day of the season

**Protocol** (`Agrigine_Daily_Predictions.ipynb` §2)

- **Target.** `anom = (yield / trend − 1) × 100`, where `trend` for season Y is `np.polyfit(deg=1)` through the county's reported yields in `[Y−15, Y−1]`, requiring ≥ 6 points. Seasons without a yield or a trend are excluded. Counts: corn 3,591, soybeans 3,152, winter wheat 1,074, sorghum 264 county-seasons. Median |anomaly|: 7.4%, 6.9%, 14.7%, 12.4%.
- **Season windows.** Corn May 1–Sep 30; soybeans May 1–Oct 31; sorghum Jun 1–Oct 31; winter wheat Sep 1 (Y−1)–Jun 30 (Y).
- **Inputs (23), day d of the season.** `frac` (d / season length); season-to-date `rain_std`, `gdd_std` (base 10, cap 30), `heat_std` (Tmax ≥ 35 °C days), `hotnight_std` (Tmin ≥ 22 °C nights); `rain_std_anom`, `gdd_std_anom` (minus the 2000–2025 mean at the same day of season); `tmax30`, `tmax30_anom`; `rain30_anom`; `wb30`, `wb30_anom`; `vpd30`; `soil_now`, `soil_anom`, `soil_std` (season-to-date mean); `dsci_now`, `dsci_std`; `d2_weeks_std`; `aws`; `droughty`; `nccpi`; `state` (categorical). Anomalies are against the county's 2000–2025 mean for that calendar slot.
- **Model.** `HistGradientBoostingRegressor(loss='absolute_error', max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=200, l2_regularization=2.0, categorical_features=[state], random_state=0, monotonic_cst=…)` with `−1` (may only decrease the prediction) on `{heat_std, hotnight_std, tmax30_anom, vpd30, dsci_now, dsci_std, d2_weeks_std}`, `0` elsewhere.
- **Centering.** Fit on `y − mean(y_train)`, so a neutral input predicts 0% (the trend), not the training years' mean anomaly (which ran −3.4% in some folds).
- **Sampling.** Training rows: every 7th day of season (days 7, 14, …) × every training season × every county with a finite target. Test: every day of the test season.
- **Split.** Backtest: test season Y ∈ 2016…2025, train on seasons < Y (40 folds, 10 s). App hindcast files: leave-one-year-out over 2000–2025. Final models: all 26 seasons.
- **Score.** MAE in percentage points of yield, by day of season, pooled over counties and test years; skill vs the trend alone (`|anom|`).
- **Inspection list.** On Aug 1 of each test year: drought list = counties with D2+ share > 1% on the last map ≤ Jul 31 (n per year); model list = the n counties with the lowest predicted anomaly on that day; loss = final `anom ≤ −10`. Catch rate = hits / losses summed over 2016–2025.

### Error through the season (percentage points of yield)

| Crop | Trend-only MAE | Model MAE at ¼ season | ½ | ¾ | End of season | Skill at end | Skill at mid-season |
|---|---|---|---|---|---|---|---|
| Corn | 8.7 | 10.3 | 9.0 | 9.0 | 9.6 | −10% | −3% |
| Soybeans | 8.5 | 9.1 | 8.6 | 7.6 | 7.6 | **+11%** | −1% |
| Winter wheat | 21.1 | 23.7 | 23.6 | 23.3 | 27.9 | −14% | −12% |
| Sorghum | 16.8 | 17.2 | 16.7 | 17.4 | 17.7 | −5% | 0% |

Only soybeans beat the trend at season's end; the others are labeled *experimental* in the app. Effective sample size is the limit: all counties share each year's weather, so 26 seasons ≈ 20 independent weather draws. The predictions are still shown because the ranking they give (which counties are sliding below trend, and when that became visible) is what the inspection-list test measures.

### The August 1 inspection list, 2016–2025

| Crop | Listed | Real losses (≤ −10% vs trend) | Caught by drought list | Caught by model list |
|---|---|---|---|---|
| Corn | 245 | 211 | 69 (**33%**) | 76 (**36%**) |
| Soybeans | 212 | 190 | 76 (**40%**) | 81 (**43%**) |

---

## 3. Chance of severe drought within 4 and 8 weeks

**Protocol** (`Agrigine_Daily_Predictions.ipynb` §3)

- **Label.** `1` if any Drought Monitor map in days `d+1 … d+28` (4 wk) or `d+1 … d+56` (8 wk) has D2+ on > 1% of the county, else `0`. Daily maps = the weekly map in effect that day.
- **Inputs (15).** `dsci_now`, `d2_now` (share), `dsci_change` (DSCI(d) − DSCI(d−28)), `rain30_anom`, `wb30`, `wb30_anom`, `soil_now`, `soil_anom`, `tmax30_anom`, `vpd30`, `doy_sin`, `doy_cos` (period 366), `aws`, `droughty`, `state` (categorical). Matrix 9,862 days × 253 counties × 15.
- **Model.** `HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, max_leaf_nodes=31, min_samples_leaf=200, l2_regularization=1.0, categorical_features=[state], random_state=0)`; output = `predict_proba[:, 1]`.
- **Sampling / split.** Training days: `range(2000-01-18, (Y−1)-12-31 − horizon, step 7)` (so every training label window closes before test year Y); rows with a finite label and DSCI. Test: every day of Y. 20 folds, 25 s. App hindcast: leave-one-year-out with windows touching Y removed. Final: all days.
- **Baselines.** *Usual rate*: `mean(label)` per county × calendar month over 2000–2015 only. *Same as now*: `D2FLAG(d)` as a 0/1 probability.
- **Score.** Brier, skill = `1 − Brier(model) / Brier(usual rate)`, AUC; test days truncated so the label window stays within data. Reported for all days and for days with `D2FLAG(d) = 0` (onsets).

| Horizon | Days scored | Rows | Base rate | Brier model | Brier usual rate | Brier same-as-now | Skill vs usual rate | Skill vs same-as-now | AUC |
|---|---|---|---|---|---|---|---|---|---|
| 4 wk | All | 917,125 | 25% | **0.0245** | 0.1888 | 0.0289 | **+87%** | +15% | 0.992 |
| 4 wk | Not in D2+ yet | 710,707 | 4% | **0.0301** | 0.0906 | 0.0359 | **+67%** | +16% | 0.931 |
| 8 wk | All | 910,041 | 28% | **0.0450** | 0.2027 | 0.0553 | **+78%** | +19% | 0.977 |
| 8 wk | Not in D2+ yet | 703,732 | 7% | **0.0566** | 0.1179 | 0.0703 | **+52%** | +19% | 0.886 |

"All days" is dominated by persistence, which is why same-as-now is already strong. The onset rows are the honest test: 4% base rate, model Brier 0.030 vs 0.091 for the usual rate, AUC 0.93.

---

## 4. Frost risk and the safe planting date

**Protocol** (`Agrigine_Daily_Predictions.ipynb` §4)

- **Definition.** Freeze = daily Tmin ≤ 0 °C. `spring_risk[d]` = share of years whose last spring freeze DOY ≥ d (no-freeze spring → contributes 0). `fall_risk[d]` = share whose first fall freeze DOY ≤ d. Safe planting date = `argmax(spring_risk ≤ 0.10) + 1`.
- **Split.** Risk curves from 2000–2018 (19 years); tested on 2019–2025 (7 years). Counties included if a spring freeze occurred in > 50% of training years (251 of 253).
- **Metric.** Share of test springs with a freeze on or after the safe date (target ≤ 10%); share of counties with that share ≤ 1/7.

| Counties | Late-frost share, 2019–2025 | Target | Counties with ≤ 1 late spring in 7 |
|---|---|---|---|
| 251 | **9.7%** | ≤ 10% | 89% |

---

## 5. Daily layers for 2026–2028: fade versus normals

**Protocol** (`Agrigine_2026_2028.ipynb` §1)

- **Normal.** Per channel, county and calendar slot (366): mean over 2000–2025, then a 15-day centered moving mean around the year.
- **Fade curve.** `ANOM = X − NORMAL`; `r[L] = mean(ANOM_t · ANOM_{t+L}) / var(ANOM)` pooled over counties, L = 0…399; clipped to [0, 1], forced non-increasing, set to 0 from the first L with r < 0.05.
- **Prediction.** `NORMAL[slot] + ANOM(2025-12-31) × r[L]`.
- **Test.** Origins Dec 31 of 2015…2024; leads 1–365 days; MAE of truth vs faded and vs normal alone, averaged over the 10 origins; skill = `1 − MAE(faded) / MAE(normal)` per lead band.

| Channel | Half-life (first L with r < 0.5) | Days 1–30 | Days 31–90 | Days 91–365 |
|---|---|---|---|---|
| `soil` root-zone soil moisture | 107 d | **+69%** | **+39%** | +8% |
| `wb30` 30-day water balance | 19 d | **+30%** | 0% | 0% |
| `rain30` 30-day rain | 17 d | **+28%** | 0% | 0% |
| `dry` days since rain | 17 d | **+23%** | +1% | 0% |
| `rain7` 7-day rain | 4 d | +6% | 0% | 0% |
| `vpd` | 3 d | +6% | +1% | 0% |
| `rh` | 2 d | +4% | +1% | 0% |
| `et0` | 2 d | +3% | 0% | 0% |
| `tmin` | 2 d | +2% | 0% | 0% |
| `tmax` | 2 d | +1% | 0% | 0% |
| `pcpn`, `srad`, `wind` | 1 d | 0% | 0% | 0% |

Weekly DSCI uses the same method on the weekly series (lags to 160, half-life 30 weeks); the drought level drawn is the modal USDM category per 10-point DSCI bin over 2000–2025.

---

## 6. Farm models (browser, `agrigine/lib/farmmodel.ts`)

**Protocol**

- **Season value.** Acre-weighted mean of the farm's field yields per crop and year (unweighted when acres missing).
- **Models.** `county_ratio`: `Σ y_farm / Σ y_county` over shared seasons (≥ 3 seasons). `own_trend`: OLS on year (≥ 5). `weather`: OLS on `[1, year−2000, rain_anom/10, d2_weeks]` with ridge 1.0 on non-intercept terms (≥ 8).
- **Split.** Leave-one-season-out; baseline = mean of the other seasons. Skill = `1 − MAE / MAE(baseline)`. Range = `±1.28 × RMSE(LOO residuals)`.
- **Future inputs.** County forecast yield; `rain_anom = 0`; `d2_weeks` = county 2000–2025 mean.

Sample farm (Story County, IA, 3 fields, 2008–2025, 18 seasons per crop), LOO MAE in bu/ac:

| Crop | Farm mean (baseline) | Follow the county | Your own trend | Weather-adjusted |
|---|---|---|---|---|
| Corn | 23.8 | **15.2 (+36%)** | 17.7 (+26%) | 20.4 (+14%) |
| Soybeans | 6.7 | **1.8 (+74%)** | 4.5 (+34%) | 4.0 (+41%) |

---

## Not benchmarked, by design

- **Storms and insurance for 2026–2028**: county means (storms: 2000–2025 per crop season; insurance: 2016–2025 by cause and month, causes < $1 dropped). No skill claimed.
- **Acres** (mean of last 3 reported seasons), **irrigated share and irrigated yields** (last value), **soil** (constant).
- **2026–2028 season yields** are the Section 1 forecasts with the Section 1 ranges; the 2026 season is their first live test.
