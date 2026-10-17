'use client';
import type { ReactNode } from 'react';
import { RAMP, SEVERITY, SEVERITY_SHORT, USDM } from '@/lib/colors';
import { CROPS, CROP_NAME, CROP_TITLE, SEASON_LABEL, SEVERE_WEEKS, STATES } from '@/lib/constants';
import { dayOfYear, median, num, pct, plural, present, signed, thousands } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { STORM_TYPES, eventDate, magnitude, money, seasonEvents, stormSeason } from '@/lib/storms';
import { dayValue, droughtOn, formatDay, normalValue, seasonProgress, seasonToDate } from '@/lib/daily';
import { LOSS_COLOR, LOSS_LABEL, insuranceSeason, mainCause } from '@/lib/insurance';
import type { County, CropKey, CropSeries } from '@/lib/types';
import { CropSpark, DailyYear, DroughtSeasonKey, MonthlyHigh, MonthlyRain, PeerStrip, WeeklyDrought, YearBars, severeColor } from '../charts';
import { useExplorer } from '../explorer-context';

const reportedCount = (d: CropSeries) => [...d.st].filter(x => x === 'r').length;
const FLOWERING_MONTH: Record<CropKey, string> = { C: 'July', S: 'August', G: 'August', W: 'May' };
const Fact = ({ term, value, sub }: { term: string; value: ReactNode; sub?: ReactNode }) => (
  <div>
    <dt>{term}</dt>
    <dd>{value}</dd>
    {sub && <span className="sub">{sub}</span>}
  </div>
);
const orDash = (v: number | null | undefined, f: (v: number) => string) => (v == null ? '—' : f(v));

function Summary({ c, k }: { c: County; k: CropKey }) {
  const { s, i } = useExplorer();
  const d = c.d[k];
  if (!d) {
    return <p className="lead">{c.n} County has no NASS {CROP_NAME[k]} record from 2000 to 2025. Pick another crop, or read its weather, soil and satellite data in the other tabs.</p>;
  }
  const st = d.st[i], y = d.y[i], a = d.a[i], sv = d.sv[i], wk = d.wk[i], pa = d.pa[i], ht = d.ht[i];
  const bits: ReactNode[] = [];
  if (sv != null) bits.push(sv ? <>drought reached <b>{SEVERITY[sv]}</b>{wk ? ` with ${plural(wk, 'week')} in D2 or worse` : ''}</> : 'there was no drought');
  if (pa != null) bits.push(`rain was ${Math.abs(pa)}% ${pa < 0 ? 'below' : 'above'} normal`);
  if (ht != null) bits.push(`${plural(ht, 'day')} reached 35 °C`);
  return (
    <p className="lead">
      {st === 'r' && y != null ? (
        <>In {s.year}, {c.n} County harvested <b>{num(y, 1)} bushels of {CROP_NAME[k]} per acre</b>{a != null && <>, <b>{Math.abs(a).toFixed(1)}% {a < 0 ? 'below' : 'above'}</b> its long-run trend</>}.</>
      ) : st === 's' ? (
        <>In {s.year}, {CROP_NAME[k]} was planted in {c.n} County but no grain was harvested.</>
      ) : (
        <>NASS published no {CROP_NAME[k]} yield for {c.n} County in {s.year}.</>
      )}
      {bits.length > 0 && (
        <> Over the {SEASON_LABEL[k]} season, {bits.map((b, j) => <span key={j}>{j > 0 && (j === bits.length - 1 ? ' and ' : ', ')}{b}</span>)}.</>
      )}
    </p>
  );
}

/** The county on the selected date: the day's weather, the drought map in effect, recent storms, and the season so far. */
function ThisDay({ c, k }: { c: County; k: CropKey }) {
  const { s, t } = useExplorer();
  const hi = dayValue(t, 'tmax', c), lo = dayValue(t, 'tmin', c), hiNormal = normalValue(t, 'tmax', c);
  const rain = dayValue(t, 'pcpn', c), r7 = dayValue(t, 'rain7', c), r30 = dayValue(t, 'rain30', c), r30Normal = normalValue(t, 'rain30', c);
  const dry = dayValue(t, 'dry', c), drought = droughtOn(c, s.day), storms = METRICS.dStorms7.get(c, k, 0, t);
  const gdd = seasonToDate(t, c, k, 'gdd'), hot = seasonToDate(t, c, k, 'hot');
  const vpd = dayValue(t, 'vpd', c), et0 = dayValue(t, 'et0', c), soil = dayValue(t, 'soil', c), soilNormal = normalValue(t, 'soil', c);
  const wb = dayValue(t, 'wb30', c), wbNormal = normalValue(t, 'wb30', c);
  return (
    <div className="blk">
      <h4>{formatDay(s.day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h4>
      <p className="cap">{CROP_TITLE[k]}: {seasonProgress(s.day, k).label.toLowerCase()}</p>
      {!t.data ? <p className="hint">Loading daily weather…</p> : (
        <dl className="facts">
          <Fact term="High and low" value={hi == null ? '—' : `${num(hi, 1)} / ${lo == null ? '—' : num(lo, 1)} °C`}
            sub={hi != null && hiNormal != null ? `The high is ${signed(hi - hiNormal, 1)} °C from normal for this date` : undefined} />
          <Fact term="Rain that day" value={rain == null ? '—' : rain < 0.3 ? 'None' : `${num(rain, 1)} mm`} />
          <Fact term="Rain, last 7 and 30 days" value={`${r7 == null ? '—' : num(r7)} / ${r30 == null ? '—' : num(r30)} mm`}
            sub={r30 != null && r30Normal != null && r30Normal >= 5 ? `30-day rain is ${pct(((r30 - r30Normal) / r30Normal) * 100)} vs normal` : undefined} />
          <Fact term="Days since rain" value={dry == null ? '—' : num(dry)} sub="Since the last day with 2.5 mm or more" />
          <Fact term="Root-zone soil moisture" value={soil == null ? '—' : `${num(soil)}% wet`}
            sub={soil != null && soilNormal != null ? `${signed(soil - soilNormal)} points vs normal for this date` : undefined} />
          <Fact term="Water balance, last 30 days" value={wb == null ? '—' : `${signed(wb)} mm`}
            sub={wb != null && wbNormal != null ? `Rain minus crop water demand. Normal for this date: ${signed(wbNormal)} mm` : 'Rain minus crop water demand'} />
          <Fact term="Crop water demand" value={et0 == null ? '—' : `${num(et0, 1)} mm/day`} sub="Reference evapotranspiration (FAO-56)" />
          <Fact term="Air dryness (VPD)" value={vpd == null ? '—' : `${num(vpd, 2)} kPa`} sub={vpd == null ? undefined : vpd >= 2 ? 'High: crops lose water fast' : vpd >= 1.2 ? 'Moderate' : 'Low'} />
          <Fact term="Drought this week" value={drought ? SEVERITY[drought.cat] : '—'} sub={drought ? `Drought Monitor map in effect, DSCI ${drought.dsci}` : undefined} />
          <Fact term="Storms, last 7 days" value={storms == null ? '—' : num(storms)} sub="Hail, wind, tornado and flood reports" />
          {k !== 'W' && <Fact term="Season so far" value={gdd == null ? 'Not started' : `${num(gdd)} GDD`} sub={hot == null ? undefined : `${plural(hot, 'day')} at 35 °C or hotter`} />}
        </dl>
      )}
    </div>
  );
}

function AnomalyHistory({ d, k }: { d: CropSeries; k: CropKey }) {
  const { bundle } = useExplorer();
  return (
    <div className="blk">
      <h4>Yield vs trend, 2000–2025</h4>
      <YearBars
        label="Yield versus trend by season"
        centered unit="%"
        values={d.a.map((v, j) => (d.st[j] === 'r' ? v : null))}
        color={severeColor(d)}
        tip={j => (d.st[j] === 'r' && d.a[j] != null
          ? `${bundle.years[j]}: ${pct(d.a[j]!, 1)} vs trend, ${plural(d.wk[j] ?? 0, 'week')} in D2+`
          : `${bundle.years[j]}: ${d.st[j] === 's' ? 'planted, no grain harvested' : 'no reported yield'}`)}
      />
      <DroughtSeasonKey crop={k} />
      <p className="cap">Click a bar to jump to that season.</p>
    </div>
  );
}

/** Census places in the county, largest first. */
function Places({ c }: { c: County }) {
  const { bundle, selectCity } = useExplorer();
  const places = (bundle.cities ?? []).filter(p => p[2] === c.f).sort((a, b) => b[5] - a[5]);
  if (!places.length) return null;
  const people = places.reduce((sum, p) => sum + p[5], 0);
  return (
    <div className="blk">
      <h4>Cities and towns</h4>
      <p className="cap">{plural(places.length, 'incorporated place')}, home to {thousands(people)} people (2024 Census estimate).</p>
      <div className="places">
        {places.slice(0, 8).map(p => (
          <button key={p[0]} type="button" onClick={() => selectCity(p)}>
            <span>{p[0]}</span><span>{thousands(p[5])}</span>
          </button>
        ))}
      </div>
      {places.length > 8 && <p className="cap">And {plural(places.length - 8, 'smaller place')}. Zoom in to see them on the map.</p>}
    </div>
  );
}

export function OverviewTab({ c }: { c: County }) {
  const { s } = useExplorer();
  const k = s.crop, d = c.d[k];
  const grown = CROPS.filter(x => c.d[x]);
  return (
    <>
      <ThisDay c={c} k={k} />
      <div className="blk"><h4>The {s.year} season</h4><Summary c={c} k={k} /></div>
      {d && <AnomalyHistory d={d} k={k} />}
      <Places c={c} />
      <div className="blk">
        <h4>Compared with other {STATES[c.s]} counties</h4>
        <p className="cap">{s.year} {CROP_NAME[k]} season. Each tick is a county; the dot is {c.n}.</p>
        {(['anom', 'wk', 'rainAnom', 'heat', 'aws', 'ndviAnom'] as const).map(id => <PeerStrip key={id} id={id} county={c} />)}
      </div>
      <div className="blk">
        <h4>Data coverage</h4>
        {grown.length ? grown.map(x => {
          const n = reportedCount(c.d[x]!);
          return (
            <div className="cov" key={x}>
              <span>{CROP_TITLE[x]}</span>
              <span className="meter"><i style={{ width: `${(n / 26) * 100}%` }} /></span>
              <span>{n} of 26 seasons</span>
            </div>
          );
        }) : <p className="hint">No crop records for this county.</p>}
        {d && reportedCount(d) < 15 && <p className="flag">Thin record for {CROP_NAME[k]}. Read these numbers with care.</p>}
      </div>
    </>
  );
}

/** USDA RMA crop insurance payouts for one crop: this season by cause, and per acre for every season. */
function Insurance({ c, k }: { c: County; k: CropKey }) {
  const { s, i, bundle } = useExplorer();
  const season = insuranceSeason(c, k, i);
  if (!season) return null;
  const ap = c.d[k]!.ap[i], cause = mainCause(season);
  const perAcre = bundle.years.map((_, j) => {
    const t = insuranceSeason(c, k, j), a = c.d[k]!.ap[j];
    return t == null || !a ? null : t.total / a;
  });
  const causes = season.byGroup.map((v, g) => [g, v] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div className="blk">
      <h4>Crop insurance payouts, {s.year} {CROP_NAME[k]}</h4>
      <dl className="facts">
        <Fact term="Paid to farmers" value={season.total ? money(season.total) : 'None'} sub="Federal crop insurance indemnities for this crop year" />
        <Fact term="Per planted acre" value={season.total && ap ? `$${num(season.total / ap)}` : '—'} sub={ap ? `${thousands(ap)} acres planted` : 'No planted acres reported'} />
        <Fact term="Main cause" value={cause == null || cause < 0 ? '—' : LOSS_LABEL[cause]} />
      </dl>
      {causes.length > 0 && (
        <div className="causes">
          {causes.map(([g, v]) => (
            <div className="cov" key={g}>
              <span><i className="sw" style={{ background: LOSS_COLOR[g] }} />{LOSS_LABEL[g]}</span>
              <span className="meter"><i style={{ width: `${(v / season.total) * 100}%`, background: LOSS_COLOR[g] }} /></span>
              <span>{money(v)}</span>
            </div>
          ))}
        </div>
      )}
      <h4 className="sub-h">Payouts per planted acre, 2000–2025</h4>
      <YearBars
        label={`${CROP_TITLE[k]} insurance payouts per planted acre by season`} values={perAcre}
        color={(_, j) => { const m = mainCause(insuranceSeason(c, k, j)); return m == null || m < 0 ? 'var(--muted)' : LOSS_COLOR[m]; }}
        tip={j => perAcre[j] == null ? `${bundle.years[j]}: no planted acres reported`
          : `${bundle.years[j]}: $${num(perAcre[j]!)} per acre${perAcre[j]! > 0 ? `, mostly ${LOSS_LABEL[mainCause(insuranceSeason(c, k, j))!].toLowerCase()}` : ''}`}
      />
      <p className="cap">Bars are colored by the main cause that season. Price decline is a market loss on revenue policies, not crop damage.{k === 'W' ? ' Wheat combines winter and spring wheat.' : ''} Source: USDA Risk Management Agency, Cause of Loss.</p>
    </div>
  );
}

export function CropsTab({ c }: { c: County }) {
  const { s, i, dispatch } = useExplorer();
  const grown = CROPS.filter(x => c.d[x]);
  if (!grown.length) return <p className="note">NASS has no corn, soybean, wheat or sorghum record for {c.n} County from 2000 to 2025.</p>;
  const irrigated = grown.filter(x => c.ir?.[x]);
  return (
    <>
      <Insurance c={c} k={c.d[s.crop] ? s.crop : grown[0]} />
      <div className="blk">
        <h4>{s.year} harvest by crop</h4>
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Crop</th><th>Yield</th><th>Vs trend</th><th>Planted</th><th>Harvested</th><th>Production</th></tr></thead>
            <tbody>
              {grown.map(x => {
                const d = c.d[x]!, st = d.st[i], prod = METRICS.prod.get(c, x, i);
                return (
                  <tr key={x} aria-selected={x === s.crop} onClick={() => dispatch({ type: 'crop', crop: x })}>
                    <td>{CROP_TITLE[x]}</td>
                    <td>{st === 'r' && d.y[i] != null ? num(d.y[i]!, 1) : st === 's' ? 'No grain' : '—'}</td>
                    <td>{st === 'r' && d.a[i] != null ? pct(d.a[i]!, 1) : '—'}</td>
                    <td>{orDash(d.ap[i], thousands)}</td>
                    <td>{orDash(d.ah[i], thousands)}</td>
                    <td>{prod == null ? '—' : `${METRICS.prod.short(prod)}M bu`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="cap">Yield in bushels per acre. Click a row to switch the map and profile to that crop. Planted acres include silage and grazing, so planted minus harvested is not crop loss.</p>
      </div>
      <div className="blk">
        <h4>Yield history, 2000–2025</h4>
        <div className="multi">
          {grown.map(x => (
            <div className="mini" key={x}>
              <b>{CROP_TITLE[x]}</b>
              <span>{reportedCount(c.d[x]!)} reported seasons</span>
              <CropSpark series={c.d[x]!} title={`${CROP_TITLE[x]} yield, 2000 to 2025`} />
            </div>
          ))}
        </div>
        <p className="cap">The dark dot marks {s.year}. Gaps are seasons without a reported yield.</p>
      </div>
      {irrigated.length > 0 && (
        <div className="blk">
          <h4>Irrigated vs dryland, {s.year}</h4>
          <dl className="facts">
            {irrigated.map(x => {
              const r = c.ir![x]!, sh = r.sh[i], yi = r.yi[i], yn = r.yn[i];
              const parts = [yi != null && `Irrigated ${num(yi, 1)} bu/ac`, yn != null && `dryland ${num(yn, 1)} bu/ac`].filter(Boolean);
              return (
                <Fact key={x} term={CROP_TITLE[x]} value={sh != null ? `${Math.round(sh * 100)}% irrigated` : 'No split this season'}
                  sub={parts.length ? parts.join(' · ') : 'NASS published the split mostly for Nebraska, 2000–2018'} />
              );
            })}
          </dl>
        </div>
      )}
    </>
  );
}

export function WeatherTab({ c }: { c: County }) {
  const { s, i, bundle } = useExplorer();
  const k = s.crop, d = c.d[k];
  return (
    <>
      {d ? (
        <div className="blk">
          <h4>{s.year} {CROP_NAME[k]} season, {SEASON_LABEL[k]}</h4>
          <dl className="facts">
            <Fact term="Rainfall" value={orDash(d.pr[i], v => `${num(v)} mm`)} sub={d.pa[i] != null ? `${pct(d.pa[i]!)} vs the 2000–2025 average` : undefined} />
            <Fact term="Average temperature" value={orDash(d.tv[i], v => `${num(v, 1)} °C`)} />
            <Fact term="Days at 35 °C or hotter" value={orDash(d.ht[i], v => num(v))} />
            <Fact term="Growing degree days" value={orDash(d.gd[i], v => num(v))} sub={`Heat units the crop can use, base ${k === 'W' ? 0 : 10} °C`} />
          </dl>
        </div>
      ) : (
        <p className="note">Season weather is computed for crops grown here, and {c.n} County has no {CROP_NAME[k]} record. The monthly charts below cover every county.</p>
      )}
      {c.sw?.[k] && (
        <div className="blk">
          <h4>Crop stress, {s.year} {CROP_NAME[k]} season</h4>
          <dl className="facts">
            <Fact term="Hot nights" value={orDash(c.sw[k]!.hn[i], v => num(v))} sub="Nights with a low of 22 °C or warmer. Warm nights cut yield even when days are normal" />
            <Fact term="Heat at flowering" value={orDash(c.sw[k]!.fh[i], v => `${num(v)} days`)} sub={`Days at 32 °C or hotter in ${FLOWERING_MONTH[k]}, when ${CROP_NAME[k]} flowers`} />
            <Fact term="Longest dry spell" value={orDash(c.sw[k]!.dry[i], v => `${num(v)} days`)} sub="Days in a row with under 1 mm of rain" />
            <Fact term="Heavy rain days" value={orDash(c.sw[k]!.hr[i], v => num(v))} sub="Days with 25 mm of rain or more" />
          </dl>
        </div>
      )}
      {c.fz && (
        <div className="blk">
          <h4>Freeze and planting, {s.year}</h4>
          <dl className="facts">
            <Fact term="Last spring freeze" value={c.fz.ls[i] == null ? 'None' : dayOfYear(c.fz.ls[i]!)} sub="Last night at 0 °C or colder before August" />
            <Fact term="First fall freeze" value={c.fz.ff[i] == null ? 'None' : dayOfYear(c.fz.ff[i]!)} sub="First night at 0 °C or colder from August on" />
            <Fact term="Frost-free days" value={c.fz.ls[i] != null && c.fz.ff[i] != null ? num(c.fz.ff[i]! - c.fz.ls[i]!) : '—'} />
            <Fact term="Spring rain" value={orDash(c.fz.sr[i], v => `${num(v)} mm`)} sub="April and May. A wet spring delays planting" />
          </dl>
        </div>
      )}
      <div className="blk">
        <h4>Day by day, {formatDay(s.day, { year: 'numeric' })}</h4>
        <DailyYear county={c} kind="rain" />
        <div className="legend"><span><i style={{ background: RAMP.blue[1] }} />Daily rain</span><span><i style={{ background: 'var(--sel-band)' }} />{CROP_TITLE[k]} season</span><span><i className="ln" style={{ background: 'var(--ink)' }} />Selected day</span></div>
        <DailyYear county={c} kind="high" />
        <div className="legend"><span><i className="ln" style={{ background: RAMP.red[2] }} />Daily high</span><span><i className="ln" style={{ background: 'var(--bar-rest)' }} />Normal high</span></div>
        <p className="cap">Click a day to jump to it.</p>
      </div>
      {c.mp && (
        <div className="blk">
          <h4>Rainfall by month, {s.year}</h4>
          <MonthlyRain county={c} />
          <div className="legend">
            <span><i style={{ background: RAMP.blue[1] }} />{s.year}</span>
            <span><i className="ln" style={{ background: 'var(--ink)' }} />2000–2025 average</span>
            <span><i style={{ background: 'var(--sel-band)' }} />{CROP_TITLE[k]} season</span>
          </div>
        </div>
      )}
      {c.mx && (
        <div className="blk">
          <h4>Average daily high by month, {s.year}</h4>
          <MonthlyHigh county={c} />
          <div className="legend">
            <span><i className="ln" style={{ background: RAMP.red[2] }} />{s.year}</span>
            <span><i className="ln" style={{ background: 'var(--bar-rest)' }} />2000–2025 average</span>
          </div>
        </div>
      )}
      {d && (
        <div className="blk">
          <h4>Season rainfall vs normal, 2000–2025</h4>
          <YearBars
            label="Season rainfall versus normal by season" centered unit="%"
            values={d.pa} color={v => (v < 0 ? RAMP.divDry[1] : RAMP.divWet[1])}
            tip={j => (d.pa[j] != null ? `${bundle.years[j]}: ${pct(d.pa[j]!)} vs normal (${num(d.pr[j] ?? 0)} mm)` : `${bundle.years[j]}: no value`)}
          />
          <div className="legend">
            <span><i style={{ background: RAMP.divDry[1] }} />Drier than normal</span>
            <span><i style={{ background: RAMP.divWet[1] }} />Wetter than normal</span>
          </div>
        </div>
      )}
      {k === 'W' && <p className="note">Winter wheat&apos;s season runs from September of the year before through June, so the shaded months show only the January–June part.</p>}
    </>
  );
}

export function DroughtTab({ c }: { c: County }) {
  const { s, i, bundle } = useExplorer();
  const k = s.crop, d = c.d[k];
  let card: ReactNode = null;
  if (d) {
    let seasons = 0, severe = 0, worst: { a: number; y: number } | null = null;
    const inDrought: number[] = [], other: number[] = [];
    d.wk.forEach((w, j) => {
      if (w != null) seasons++;
      const isSevere = w != null && w >= SEVERE_WEEKS;
      if (isSevere) severe++;
      const a = d.a[j];
      if (d.st[j] === 'r' && a != null) {
        (isSevere ? inDrought : other).push(a);
        if (!worst || a < worst.a) worst = { a, y: bundle.years[j] };
      }
    });
    const mi = median(inDrought), mo = median(other);
    const w = worst as { a: number; y: number } | null;
    card = (
      <div className="blk">
        <h4>Drought report card, {CROP_NAME[k]}</h4>
        <dl className="facts">
          <Fact term="Severe-drought seasons" value={`${severe} of ${seasons}`} sub="Seasons with 4 or more weeks in D2 or worse" />
          <Fact term="Typical yield change in those seasons" value={mi == null ? 'n/a' : pct(mi, 1)}
            sub={mi == null ? 'No severe-drought season with a reported yield' : `Median of ${inDrought.length} seasons, vs ${mo == null ? 'n/a' : pct(mo, 1)} in other seasons`} />
          {w && <Fact term="Worst season" value={`${w.y} · ${pct(w.a, 1)}`} />}
        </dl>
        <p className="cap">Uses the dataset&apos;s all-years trend, so it describes the past. A held-out test must refit trends on its training years.</p>
      </div>
    );
  }
  return (
    <>
      {d && (
        <div className="blk">
          <h4>{s.year} {CROP_NAME[k]} season, {SEASON_LABEL[k]}</h4>
          <dl className="facts">
            <Fact term="Worst drought level" value={orDash(d.sv[i], v => SEVERITY[v])} />
            <Fact term="Weeks in severe drought (D2+)" value={orDash(d.wk[i], v => num(v))} />
            <Fact term="Mean drought intensity" value={orDash(d.ds[i], v => `DSCI ${num(v)}`)} sub="0 means no drought all season; 500 means all of the county in D4 every week" />
          </dl>
        </div>
      )}
      {c.wkc && (
        <div className="blk">
          <h4>Drought week by week, {s.year}</h4>
          <WeeklyDrought county={c} />
          <div className="legend">
            {USDM.map((col, n) => <span key={n}><i style={{ background: col }} />{SEVERITY_SHORT[n]}</span>)}
          </div>
          <p className="cap">Bar height is the week&apos;s drought intensity (DSCI). Color is the worst level covering at least 1% of the county. Shaded weeks are the {CROP_NAME[k]} season.</p>
        </div>
      )}
      {card}
      {d && (
        <div className="blk">
          <h4>Weeks in severe drought by season</h4>
          <YearBars
            label="Weeks in severe drought by season"
            values={d.wk} color={() => RAMP.orange[1]}
            tip={j => `${bundle.years[j]}: ${d.wk[j] != null ? plural(d.wk[j]!, 'week') : 'no value'}`}
          />
        </div>
      )}
      {!d && !c.wkc && <p className="note">No drought record for this county.</p>}
    </>
  );
}

export function StormsTab({ c }: { c: County }) {
  const { s, bundle } = useExplorer();
  const k = s.crop;
  const season = stormSeason(c, k, s.year);
  const events = seasonEvents(c, k, s.year);
  const yearly = bundle.years.map(y => stormSeason(c, k, y).damaging);
  const day = (e: (typeof events)[number]) => eventDate(e).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <>
      <div className="blk">
        <h4>{s.year} {CROP_NAME[k]} season, {SEASON_LABEL[k]}</h4>
        <dl className="facts">
          <Fact term="Hail" value={num(season.byType[0])} />
          <Fact term="Damaging wind" value={num(season.byType[1])} sub="Thunderstorm and high-wind reports, including derechos" />
          <Fact term="Tornadoes" value={num(season.byType[2])} />
          <Fact term="Floods" value={num(season.byType[3])} sub="Flood and flash-flood reports" />
          <Fact term="Reported crop damage" value={season.cropDamage ? money(season.cropDamage) : 'None reported'} />
        </dl>
      </div>
      <div className="blk">
        <h4>Reports this season</h4>
        {events.length ? (
          <div className="tablewrap">
            <table className="ctable">
              <thead><tr><th>Date</th><th>Type</th><th>Size</th><th>Crop damage</th></tr></thead>
              <tbody>
                {events.map((e, j) => (
                  <tr key={j} className="static">
                    <td>{day(e)}</td><td>{STORM_TYPES[e[1]]}</td><td>{magnitude(e) || '—'}</td><td>{e[3] ? money(e[3]) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">No storms were reported here during the {SEASON_LABEL[k]} season.</p>
        )}
      </div>
      <div className="blk">
        <h4>Damaging storm reports by season</h4>
        <YearBars
          label="Damaging storm reports by season" values={yearly} color={() => RAMP.purple[1]}
          tip={j => `${bundle.years[j]}: ${plural(yearly[j], 'damaging storm report')}`}
        />
      </div>
      <p className="note">Storms reported to NOAA by county. Reports depend on spotters, so quiet rural areas can be undercounted. Drought, heat and freeze events are filed by forecast zone and aren&apos;t included yet.</p>
    </>
  );
}

export function LandTab({ c }: { c: County }) {
  const { s, bundle } = useExplorer();
  const k = s.crop;
  const peers = bundle.counties.filter(p => p.s === c.s);
  const awsMedian = median(present(peers.map(p => p.aws)));
  const drMedian = median(present(peers.map(p => p.dr)));
  const r = c.ir?.[k];
  return (
    <>
      <div className="blk">
        <h4>Soil</h4>
        <dl className="facts">
          <Fact term="Water storage, top 100 cm" value={orDash(c.aws, v => `${num(v)} mm`)}
            sub={`${STATES[c.s]} median ${num(awsMedian ?? 0)} mm. More storage carries a rainfed crop further between rains`} />
          <Fact term="Drought-prone soil" value={orDash(c.dr, v => `${num(v, 1)}%`)}
            sub={`Share of the county with 152 mm of storage or less. ${STATES[c.s]} median ${num(drMedian ?? 0, 1)}%`} />
          {CROPS.filter(x => c.d[x] && c.nc[x] != null).map(x => (
            <Fact key={x} term={`Productivity for ${CROP_NAME[x]}`} value={c.nc[x]!.toFixed(2)}
              sub={`NCCPI, where 1.0 is the most productive U.S. soil${x === 'G' ? '. Sorghum uses the corn model' : ''}`} />
          ))}
        </dl>
      </div>
      <div className="blk">
        <PeerStrip id="aws" county={c} />
        <PeerStrip id="droughty" county={c} />
      </div>
      {r ? (
        <div className="blk">
          <h4>Irrigated share of {CROP_NAME[k]}, 2000–2025</h4>
          <YearBars
            label={`Irrigated share of ${CROP_NAME[k]} by season`} unit="%"
            values={r.sh.map(v => (v == null ? null : v * 100))} color={() => RAMP.teal[1]}
            tip={j => `${bundle.years[j]}: ${r.sh[j] != null ? `${Math.round(r.sh[j]! * 100)}% irrigated` : 'no split published'}`}
          />
          <p className="cap">NASS stopped publishing the split after 2018. A county&apos;s corn and soybean share changes little year to year.</p>
        </div>
      ) : (
        <p className="note">{c.s === 'IA' ? 'Iowa is rainfed. NASS publishes no irrigation series for Iowa.' : `NASS published no irrigation split for ${CROP_NAME[k]} here.`}</p>
      )}
      {c.s === 'NE' && <p className="flag">In Nebraska, the lowest-storage soils are often the most irrigated, so low storage can look harmless. Read soil and irrigation together.</p>}
    </>
  );
}

export function SatelliteTab({ c }: { c: County }) {
  const { s, i, bundle } = useExplorer();
  const md = c.md;
  if (!md) return <p className="note">There is no satellite record for {c.n} County in the extension data, which covers the 230 counties with NASS crops.</p>;
  return (
    <>
      <div className="blk">
        <h4>{s.year} from orbit</h4>
        <dl className="facts">
          <Fact term="Peak greenness (NDVI)" value={orDash(md.nx[i], v => v.toFixed(2))} sub="Greenest 16 days of the year, 0 to 1" />
          <Fact term="Average greenness (NDVI)" value={orDash(md.nm[i], v => v.toFixed(2))} />
          <Fact term="Average EVI" value={orDash(md.em[i], v => v.toFixed(2))} sub="Like NDVI, but saturates less over dense crops" />
          <Fact term="Greenness vs normal" value={orDash(md.na[i], v => pct(v, 1))} />
          <Fact term="Greenest day" value={orDash(md.pk[i], dayOfYear)} />
        </dl>
      </div>
      <div className="blk">
        <h4>Greenness vs normal, 2000–2025</h4>
        <YearBars
          label="Greenness versus normal by year" centered unit="%"
          values={md.na} color={v => (v < 0 ? RAMP.divDry[1] : RAMP.divGreen[1])}
          tip={j => `${bundle.years[j]}: ${md.na[j] != null ? pct(md.na[j]!, 1) : 'no value'}`}
        />
        <div className="legend">
          <span><i style={{ background: RAMP.divDry[1] }} />Browner than normal</span>
          <span><i style={{ background: RAMP.divGreen[1] }} />Greener than normal</span>
        </div>
      </div>
      <p className="note">MODIS sees all vegetation in the county (crops, grass, trees and towns) over the whole calendar year. It explains a season after the fact but can&apos;t forecast it.</p>
    </>
  );
}
