"""Checks for each hackathon direction, from the starter data, with the split each direction asks for.

Run: python3 notebooks/directions_check.py   (writes notebooks/directions_check.md and prints it)
"""
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

REPO = Path(__file__).resolve().parent.parent
m = pd.read_parquet(REPO / 'data/master_dataset.parquet')
m['fips'] = m.fips.astype(str)
m['y'] = m.yield_per_acre.where(m.yield_status.eq('reported'))
m['a'] = m.yield_anomaly_pct.where(m.yield_status.eq('reported'))
w = pd.read_parquet(REPO / 'data/processed/drought/drought_weekly.parquet')
w['fips'] = w.fips.astype(str); w['map_date'] = pd.to_datetime(w.map_date); w['year'] = w.map_date.dt.year
w['d2plus'] = w[['D2', 'D3', 'D4']].sum(axis=1)
out = []
P = out.append
LOSS = -10          # a real loss: yield 10% or more below the county's normal
rng = np.random.default_rng(0)

# ---------- 1. Crop Loss Early Warning ----------
P('## 1. Crop Loss Early Warning: the D2+ watch list on August 1, 2000–2025\n')
P('List = counties with severe drought (D2+) on more than 1% of the county on the last weekly map before August 1. Hit = that county\'s corn or soybean yield ended 10% or more below normal. Iowa and Nebraska.\n')
last = w[w.map_date.dt.month * 100 + w.map_date.dt.day <= 731].sort_values('map_date').groupby(['fips', 'year']).tail(1)
listed = last[last.d2plus > 1][['fips', 'year']].assign(listed=True)
rows = []
for crop in ('CORN', 'SOYBEANS'):
    s = m[m.crop.eq(crop) & m.state_alpha.isin(['IA', 'NE']) & m.a.notna()].merge(listed, on=['fips', 'year'], how='left').fillna({'listed': False})
    loss = s.a <= LOSS
    rows.append({'Crop': crop.title(), 'County-years': len(s), 'Listed': int(s.listed.sum()), 'Real losses': int(loss.sum()),
                 'Losses on the list (catch rate)': f"{int((s.listed & loss).sum())} ({(s.listed & loss).sum() / loss.sum():.0%})",
                 'Listed counties that lost (precision)': f"{(s.listed & loss).sum() / s.listed.sum():.0%}",
                 'Loss rate off the list': f"{(~s.listed & loss).sum() / (~s.listed).sum():.0%}"})
P(pd.DataFrame(rows).to_markdown(index=False)); P('')
P('The model list (Agrigine_Daily_Predictions.ipynb, same length, 2016–2025 held out) catches 36% of corn and 43% of soybean losses against 33% and 40% for this list: see BENCHMARKS.md §2.\n')

# ---------- 2. Drought Assistance Targeting ----------
P('## 2. Drought Assistance Targeting: a 2000–2015 ranking checked on 2016–2025\n')
P('Rank counties by how often their growing season had severe drought in 2000–2015 (mean weeks in D2+); check whether the ranking predicts 2016–2025 drought weeks and drought-year corn losses. Chance = Spearman ρ of 0.\n')
cw = m[m.crop.eq('CORN')].groupby(['fips', 'year']).weeks_in_d2_plus.first().reset_index()
early = cw[cw.year <= 2015].groupby('fips').weeks_in_d2_plus.mean()
late = cw[cw.year >= 2016].groupby('fips').weeks_in_d2_plus.mean()
loss_late = m[m.crop.eq('CORN') & (m.year >= 2016) & (m.max_drought_severity >= 3)].groupby('fips').a.mean()
j = pd.concat([early.rename('early'), late.rename('late'), loss_late.rename('loss')], axis=1).dropna(subset=['early', 'late'])
r1 = spearmanr(j.early, j.late); jj = j.dropna()
r2 = spearmanr(jj.early, jj.loss)
P(f'- 2000–2015 drought weeks vs 2016–2025 drought weeks: Spearman ρ = **{r1.statistic:.2f}** (p = {r1.pvalue:.1e}, {len(j)} counties). The ranking holds.')
P(f'- 2000–2015 drought weeks vs 2016–2025 corn loss in drought seasons: ρ = **{r2.statistic:.2f}** (p = {r2.pvalue:.2f}, {len(jj)} counties): drought-prone counties are not the ones that lose most when drought comes (irrigation and soil matter more), so help should be triggered by current conditions, not history.')
P('- The county report card is the county profile in the app and the "Drought report card" report template; the trigger is the 4- and 8-week severe-drought chance (BENCHMARKS.md §3).\n')

# ---------- 3. Heat-Stress Advisory ----------
P('## 3. Heat-Stress Advisory: a heat rule chosen on 2000–2018, checked on 2019–2025\n')
P('Warn when the rule fires; a warning is right if the county\'s corn or soybean yield ended 10% or more below normal (Iowa and Nebraska). The baseline rule is the master\'s `extreme_heat_days` at the threshold that works best on 2000–2018; the alternative adds drought (weeks in D2+), since heat without dry soil rarely hurts.\n')
s = m[m.crop.isin(['CORN', 'SOYBEANS']) & m.state_alpha.isin(['IA', 'NE']) & m.a.notna()].copy()
s['loss'] = s.a <= LOSS
tr, te = s[s.year <= 2018], s[s.year >= 2019]
def rates(d, fire):
    hit = (fire & d.loss).sum() / d.loss.sum(); fa = (fire & ~d.loss).sum() / (~d.loss).sum()
    return hit, fa
def best(d, rule):
    cands = [(k, *rates(d, rule(d, k))) for k in range(1, 31)]
    return max(cands, key=lambda c: c[1] - c[2])          # Youden: hit rate minus false-alarm rate
heat_rule = lambda d, k: d.extreme_heat_days >= k
combo_rule = lambda d, k: (d.extreme_heat_days >= k) & (d.weeks_in_d2_plus >= 2)
rows = []
for name, rule in (('Days at 35 °C or hotter ≥ k', heat_rule), ('Days at 35 °C or hotter ≥ k AND ≥ 2 weeks in D2+', combo_rule)):
    k, h, f = best(tr, rule); h2, f2 = rates(te, rule(te, k))
    rows.append({'Rule': name, 'k chosen on 2000–2018': k, 'Hit rate 2000–2018': f'{h:.0%}', 'False alarms 2000–2018': f'{f:.0%}',
                 'Hit rate 2019–2025': f'{h2:.0%}', 'False alarms 2019–2025': f'{f2:.0%}', 'Hits minus false alarms 2019–2025': f'{h2 - f2:+.0%}'})
P(pd.DataFrame(rows).to_markdown(index=False)); P('')
P('Adding drought to the heat rule catches more losses on the unseen years at the cost of more false alarms; net, the two rules tie. Heat days alone are not a sufficient warning (38% of losses missed), and heat plus drought is a wider net. The app warns on both, day by day.')
P(f'{int(te.loss.sum())} losses in {len(te)} county-seasons, 2019–2025. The app\'s in-season yield model uses heat, hot nights and drought together with monotonic constraints (BENCHMARKS.md §2).\n')

# ---------- 4. Soil and Crop Resilience ----------
P('## 4. Soil and Crop Resilience: does soil water storage cut drought losses?\n')
P('Corn in Iowa and Nebraska, seasons with the worst drought level at D2 or worse. Compare the mean yield anomaly of counties in the top third of soil water storage (AWS, top 100 cm) with the bottom third; range from 2,000 bootstrap resamples of county-seasons.\n')
c = m[m.crop.eq('CORN') & m.state_alpha.isin(['IA', 'NE']) & m.a.notna() & (m.max_drought_severity >= 3)].copy()
lo, hi = c.aws_100cm_mm.quantile([1 / 3, 2 / 3])
c['tier'] = np.where(c.aws_100cm_mm <= lo, 'low', np.where(c.aws_100cm_mm >= hi, 'high', 'mid'))
def effect(d):
    return d[d.tier.eq('high')].a.mean() - d[d.tier.eq('low')].a.mean()
boot = np.array([effect(c.sample(len(c), replace=True, random_state=int(rng.integers(1e9)))) for _ in range(2000)])
P(f'- Drought seasons: {len(c)} county-seasons ({c.year.min()}–{c.year.max()}); AWS terciles at {lo:.0f} and {hi:.0f} mm.')
P(f'- Mean yield anomaly, high-storage counties: **{c[c.tier.eq("high")].a.mean():+.1f}%**; low-storage: **{c[c.tier.eq("low")].a.mean():+.1f}%**.')
q5, q95 = np.quantile(boot, .05), np.quantile(boot, .95)
verdict = ('Counties with more soil water storage did **not** lose less; they lost slightly more. Storage does not separate drought losses at county level once irrigation (Nebraska) and the 2012 drought (Iowa) are in the mix, so soil programs cannot be targeted by this field alone.' if q95 < 0
           else 'High-storage counties lost less, a clear effect.' if q5 > 0 else 'No clear effect: the range includes zero.')
P(f'- Soil effect (high minus low): **{effect(c):+.1f} points**, 90% range {q5:+.1f} to {q95:+.1f}. {verdict}')
by_state = c.groupby(['state_alpha', 'tier']).a.mean().unstack()[['low', 'mid', 'high']].round(1)
P(''); P(by_state.to_markdown()); P('')
P('The priority map is the *Soil water storage* and *Drought-prone soil* layers in the app, with the Soil and land report block.\n')

# ---------- 5. Grain Supply Outlook ----------
P('## 5. Grain Supply Outlook: Iowa corn production, trend-only estimate with a range\n')
P('Counties that report corn every year 2000–2025. Production = yield × harvested acres. Each year 2016–2025 is estimated by a straight line through the previous 10 years of state production; the range is the 10th–90th percentile of the trend\'s errors on the years before.\n')
ia = m[m.crop.eq('CORN') & m.state_alpha.eq('IA') & m.y.notna() & m.acres_harvested.notna()]
full = ia.groupby('fips').year.nunique(); keep = full[full == 26].index
prod = ia[ia.fips.isin(keep)].assign(p=lambda d: d.y * d.acres_harvested).groupby('year').p.sum() / 1e6
def trend_est(y):
    past = prod[(prod.index < y) & (prod.index >= y - 10)]
    b, a0 = np.polyfit(past.index, past.values, 1); return b * y + a0
errs = {y: prod[y] - trend_est(y) for y in range(2010, 2026)}
rows, inside = [], 0
for y in range(2016, 2026):
    e = np.array([errs[k] for k in errs if k < y]); est = trend_est(y); lo_, hi_ = est + np.quantile(e, .1), est + np.quantile(e, .9)
    ok = lo_ <= prod[y] <= hi_; inside += ok
    rows.append({'Year': y, 'Estimate (M bu)': f'{est:,.0f}', 'Range': f'{lo_:,.0f}–{hi_:,.0f}', 'Actual': f'{prod[y]:,.0f}', 'Inside': 'yes' if ok else 'no'})
P(pd.DataFrame(rows).to_markdown(index=False)); P('')
P(f'{len(keep)} counties; the real value fell inside the 80% range in **{inside} of 10** held-out years. The app\'s 1–3 year county forecasts add weather, drought and soil as candidates; for corn the trend still wins (BENCHMARKS.md §1), which is why this trend-only estimate is what the app serves.\n')

# ---------- 6. Frost ----------
P('## 6. Frost-Safe Planting Calendar\n')
P('Done in Agrigine_Daily_Predictions.ipynb §4: safe dates built on 2000–2018 saw a later frost in 9.7% of 2019–2025 springs (goal ≤ 10%) on 251 counties; 89% of counties within 1 in 7. The map is the *Frost risk* layer, and the risk curve for every date is the safety-margin trade-off: a lower risk means a later date (BENCHMARKS.md §4).\n')

# ---------- 7. Drought Category Reality Check ----------
P('## 7. Drought Category Reality Check: does D3 mean the same in Iowa and Nebraska?\n')
P('Mean yield anomaly by worst drought level in the season, state and crop, from 2000–2012; used to predict the 2013–2025 means. Error = |predicted − actual| in points; the direction asks for about 4 points.\n')
d = m[m.crop.isin(['CORN', 'SOYBEANS']) & m.state_alpha.isin(['IA', 'NE']) & m.a.notna()]
early = d[d.year <= 2012].groupby(['state_alpha', 'crop', 'max_drought_severity']).a.agg(['mean', 'size'])
late = d[d.year >= 2013].groupby(['state_alpha', 'crop', 'max_drought_severity']).a.agg(['mean', 'size'])
t = early.join(late, lsuffix='_2000_2012', rsuffix='_2013_2025').dropna()
t['error'] = (t['mean_2000_2012'] - t['mean_2013_2025']).abs()
t = t.reset_index().rename(columns={'state_alpha': 'State', 'crop': 'Crop', 'max_drought_severity': 'Worst level (4 = D3)', 'mean_2000_2012': 'Mean anomaly 2000–2012', 'size_2000_2012': 'n', 'mean_2013_2025': 'Actual 2013–2025', 'size_2013_2025': 'n ', 'error': 'Error (points)'})
t['Crop'] = t.Crop.str.title()
P(t.round(1).to_markdown(index=False)); P('')
weighted = np.average(t['Error (points)'], weights=t['n '])
P(f'Weighted mean error **{weighted:.1f} points** across cells (cells with ≥ 20 seasons on both sides: {np.average(t[(t.n >= 20) & (t["n "] >= 20)]["Error (points)"], weights=t[(t.n >= 20) & (t["n "] >= 20)]["n "]):.1f}).')
worst = t.sort_values('Error (points)', ascending=False).iloc[0]
ne_max = t[t.State == 'NE']['Error (points)'].max()
P(f'Recommendation: Nebraska\'s table transfers (every cell within {ne_max:.1f} points), Iowa\'s does not: its D3 and D4 cells miss by {t[(t.State == "IA") & (t["Worst level (4 = D3)"] >= 4)]["Error (points)"].min():.0f}–{t[(t.State == "IA") & (t["Worst level (4 = D3)"] >= 4)]["Error (points)"].max():.0f} points because 2012 dominates 2000–2012 ({worst.State} {worst.Crop}, level {int(worst["Worst level (4 = D3)"])}: {worst["Mean anomaly 2000–2012"]:+.0f}% then, {worst["Actual 2013–2025"]:+.0f}% since). A drought level should not mean the same thing in both states or across periods: in Iowa, pair it with weeks in D2+ and timing (the app\'s drought layers) rather than the level alone.\n')

# ---------- 8. AgriAdvisor ----------
P('## 8. AgriAdvisor\n')
P('The MCP server (`agrigine/worker/`) exposes five functions an AI assistant calls: `find_places`, `get_county_season`, `get_county_history`, `get_daily_weather`, `rank_counties`; each returns the rows behind the answer. Hand-checked questions and answers are in the table in README.md under *Directions covered*, including ones the data cannot answer.\n')

text = '# Direction checks\n\nGenerated by `notebooks/directions_check.py` from `data/`. Loss = yield 10% or more below the county normal (`yield_anomaly_pct ≤ −10`), reported yields only.\n\n' + '\n'.join(out)
(REPO / 'notebooks/directions_check.md').write_text(text)
print(text)
