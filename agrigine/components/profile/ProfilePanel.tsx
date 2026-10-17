'use client';
import type { ReactNode } from 'react';
import { binOf } from '@/lib/bins';
import { SEVERITY_SHORT, SEVERITY_WORD } from '@/lib/colors';
import { CROPS, CROP_NAME, CROP_TITLE, SEASON_LABEL, SEVERE_WEEKS, STATES, STATE_CODES } from '@/lib/constants';
import { dayOfYear, median, num, pct, plural, present } from '@/lib/format';
import { CATEGORIES, metric, season, whyMissing, type MetricId } from '@/lib/metrics';
import { TAB_IDS, type TabId } from '@/lib/state';
import type { County, StateCode } from '@/lib/types';
import { YearBars } from '../charts';
import { useExplorer } from '../explorer-context';
import { CategoryIcon, CloseIcon } from '../icons';
import { CropsTab, DroughtTab, LandTab, OverviewTab, SatelliteTab, WeatherTab } from './tabs';

const TABS: Record<TabId, { name: string; color: string; icon: 'overview' | 'crops' | 'weather' | 'drought' | 'land' | 'sat'; Body: (p: { c: County }) => ReactNode }> = {
  overview: { name: 'Overview', color: 'var(--ink)', icon: 'overview', Body: OverviewTab },
  crops: { name: 'Crops', color: CATEGORIES.crops.color, icon: 'crops', Body: CropsTab },
  weather: { name: 'Weather', color: CATEGORIES.weather.color, icon: 'weather', Body: WeatherTab },
  drought: { name: 'Drought', color: CATEGORIES.drought.color, icon: 'drought', Body: DroughtTab },
  land: { name: 'Land & water', color: CATEGORIES.land.color, icon: 'land', Body: LandTab },
  sat: { name: 'Satellite', color: CATEGORIES.sat.color, icon: 'sat', Body: SatelliteTab },
};

function CloseButton() {
  const { dispatch } = useExplorer();
  return (
    <button className="icon-btn" onClick={() => dispatch({ type: 'close' })} aria-label="Close profile">
      <CloseIcon />
    </button>
  );
}

/** A summary tile. Clicking it colors the whole map by that layer. */
function Tile({ id, c, label, value, sub }: { id: MetricId; c: County; label: string; value: (v: number) => string; sub: (v: number) => string }) {
  const { s, i, dispatch } = useExplorer();
  const m = metric(id), v = m.get(c, s.crop, i);
  const tone = id === 'anom' && v != null ? (v < -5 ? ' loss' : v > 5 ? ' gain' : '') : '';
  return (
    <button className="tile" aria-pressed={s.metric === id} title={`Color the map by ${m.name.toLowerCase()}`} onClick={() => dispatch({ type: 'metric', id })}>
      <span className="tile-l"><i style={{ background: CATEGORIES[m.cat].color }} />{label}</span>
      <span className={`tile-v${tone}`}>{v == null ? '—' : value(v)}</span>
      <span className="tile-s">{v == null ? whyMissing(c, id, s.crop, i) : sub(v)}</span>
    </button>
  );
}

function CountyProfile({ c }: { c: County }) {
  const { s, i, dispatch, zoomToCounty } = useExplorer();
  const k = s.crop;
  const grown = CROPS.filter(x => c.d[x]).map(x => CROP_NAME[x]);
  const Body = TABS[s.tab].Body;
  return (
    <>
      <div className="p-head">
        <div className="p-top"><p className="eyebrow">{STATES[c.s]} · FIPS {c.f}</p><CloseButton /></div>
        <h2 className="p-name">{c.n} County</h2>
        <p className="p-sub">
          {Math.abs(c.c[1]).toFixed(2)}° N, {Math.abs(c.c[0]).toFixed(2)}° W · {grown.length ? `Grows ${grown.length > 1 ? grown.slice(0, -1).join(', ') + ' and ' + grown[grown.length - 1] : grown[0]}` : 'No NASS crop records'}
        </p>
        <div className="p-ctx">
          <span>Showing the <b>{s.year} {CROP_NAME[k]}</b> season ({SEASON_LABEL[k]})</span>
          <button className="linkbtn" onClick={zoomToCounty}>Zoom to county</button>
        </div>
      </div>
      <div className="tiles">
        <Tile id="yield" c={c} label="Yield" value={v => `${num(v, 1)} bu/ac`} sub={() => `${CROP_TITLE[k]}, ${s.year}`} />
        <Tile id="anom" c={c} label="Vs trend" value={v => pct(v, 1)} sub={v => `${v < 0 ? 'Below' : 'Above'} the county trend`} />
        <Tile id="sev" c={c} label="Worst drought" value={v => `${SEVERITY_SHORT[v]}${v ? ' ' + SEVERITY_WORD[v] : ''}`} sub={() => `${plural(season(c, k, i, 'wk') ?? 0, 'week')} in D2+`} />
        <Tile id="rainAnom" c={c} label="Rain vs normal" value={v => pct(v)} sub={() => `${num(season(c, k, i, 'pr') ?? 0)} mm, ${SEASON_LABEL[k]}`} />
        <Tile id="heat" c={c} label="Days ≥ 35 °C" value={v => num(v)} sub={() => `Average ${num(season(c, k, i, 'tv') ?? 0, 1)} °C`} />
        <Tile id="ndviAnom" c={c} label="Greenness" value={v => pct(v, 1)} sub={() => (c.md?.pk[i] != null ? `Peak on ${dayOfYear(c.md.pk[i]!)}` : 'vs normal')} />
      </div>
      <div className="tabs" role="tablist" aria-label="Profile sections">
        {TAB_IDS.map(id => (
          <button key={id} className="tab" role="tab" aria-selected={s.tab === id} style={{ ['--tc' as string]: TABS[id].color }} onClick={() => dispatch({ type: 'tab', tab: id })}>
            <CategoryIcon id={TABS[id].icon} />{TABS[id].name}
          </button>
        ))}
      </div>
      <div className="p-body" role="tabpanel"><Body c={c} /></div>
    </>
  );
}

function StateProfile({ code }: { code: StateCode }) {
  const { s, i, bundle, selectCounty } = useExplorer();
  const k = s.crop, years = bundle.years;
  const all = bundle.counties.filter(c => c.s === code);
  const grow = all.filter(c => c.d[k]);
  const reported = grow.filter(c => c.d[k]!.st[i] === 'r');
  const medAnom = median(present(reported.map(c => c.d[k]!.a[i])));
  const medRain = median(present(grow.map(c => c.d[k]!.pa[i])));
  const severe = grow.filter(c => (c.d[k]!.wk[i] ?? 0) >= SEVERE_WEEKS).length;
  const yearly = years.map((_, j) => {
    const a = present(grow.filter(c => c.d[k]!.st[j] === 'r').map(c => c.d[k]!.a[j]));
    return { med: a.length >= 3 ? median(a) : null, share: grow.length ? grow.filter(c => (c.d[k]!.wk[j] ?? 0) >= SEVERE_WEEKS).length / grow.length : 0 };
  });
  const m = metric(s.metric);
  const ranked = all.map(c => ({ c, v: m.get(c, k, i) })).filter((r): r is { c: County; v: number } => r.v != null);
  ranked.sort((a, b) => (m.worse === 'low' ? a.v - b.v : b.v - a.v));
  const bins = m.bins(k);
  return (
    <>
      <div className="p-head">
        <div className="p-top"><p className="eyebrow">State · {all.length} counties in Agrigine</p><CloseButton /></div>
        <h2 className="p-name">{STATES[code]}</h2>
        <div className="p-ctx"><span>Showing the <b>{s.year} {CROP_NAME[k]}</b> season</span></div>
      </div>
      <div className="tiles">
        <div className="tile"><span className="tile-l"><i style={{ background: 'var(--cat-crops)' }} />Grow {CROP_NAME[k]}</span><span className="tile-v">{grow.length}</span><span className="tile-s">{reported.length} reported in {s.year}</span></div>
        <div className="tile"><span className="tile-l"><i style={{ background: 'var(--cat-crops)' }} />Median vs trend</span><span className={`tile-v${medAnom != null && medAnom < -5 ? ' loss' : ''}`}>{medAnom == null ? '—' : pct(medAnom, 1)}</span><span className="tile-s">Reported counties</span></div>
        <div className="tile"><span className="tile-l"><i style={{ background: 'var(--cat-drought)' }} />Severe drought</span><span className="tile-v">{grow.length ? `${Math.round((severe / grow.length) * 100)}%` : '—'}</span><span className="tile-s">Counties with 4+ weeks in D2+</span></div>
        <div className="tile"><span className="tile-l"><i style={{ background: 'var(--cat-weather)' }} />Median rain</span><span className="tile-v">{medRain == null ? '—' : pct(medRain)}</span><span className="tile-s">vs normal</span></div>
      </div>
      <div className="p-body">
        {grow.length > 0 && (
          <div className="blk">
            <h4>Median yield vs trend, 2000–2025</h4>
            <YearBars
              label={`${STATES[code]} median yield versus trend by season`} centered unit="%"
              values={yearly.map(y => y.med)}
              color={(_v, j) => (yearly[j].share >= 0.25 ? 'var(--bar-drought)' : 'var(--bar-rest)')}
              tip={j => `${years[j]}: ${yearly[j].med == null ? 'too few reports' : pct(yearly[j].med!, 1)}, ${Math.round(yearly[j].share * 100)}% of counties in severe drought`}
            />
            <div className="legend">
              <span><i style={{ background: 'var(--bar-drought)' }} />A quarter or more of counties in severe drought</span>
              <span><i style={{ background: 'var(--bar-rest)' }} />Other seasons</span>
            </div>
          </div>
        )}
        <div className="blk">
          <h4>{m.worse ? 'Hardest hit' : 'Highest'} by {m.name.toLowerCase()}</h4>
          {ranked.length ? (
            <ol className="rlist">
              {ranked.slice(0, 8).map((r, n) => (
                <li key={r.c.f}>
                  <button onClick={() => selectCounty(r.c.f)}>
                    <span className="n">{n + 1}</span><span>{r.c.n}</span>
                    <span className="v"><i style={{ background: binOf(bins, r.v).color }} />{m.short(r.v)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="hint">No values for this layer and season.</p>}
        </div>
        <div className="blk">
          <h4>Coverage, {s.year}</h4>
          {CROPS.map(x => {
            const g = all.filter(c => c.d[x]);
            if (!g.length) return null;
            const r = g.filter(c => c.d[x]!.st[i] === 'r').length;
            return (
              <div className="cov" key={x}>
                <span>{CROP_TITLE[x]}</span>
                <span className="meter"><i style={{ width: `${(r / g.length) * 100}%` }} /></span>
                <span>{r} of {g.length} reported</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function OutsideProfile({ name }: { name: string }) {
  const { selectState } = useExplorer();
  return (
    <>
      <div className="p-head">
        <div className="p-top"><p className="eyebrow">Outside the data</p><CloseButton /></div>
        <h2 className="p-name">{name}</h2>
      </div>
      <div className="p-body">
        <p className="lead">Agrigine has county data for California, Delaware, Iowa and Nebraska only, the four states in the hackathon dataset.</p>
        <div className="chips">
          {STATE_CODES.map(code => <button key={code} className="chip" onClick={() => selectState(code)}>{STATES[code]}</button>)}
        </div>
      </div>
    </>
  );
}

export default function ProfilePanel() {
  const { s, byFips } = useExplorer();
  const county = s.county ? byFips.get(s.county) : undefined;
  if (!county && !s.state && !s.outside) return null;
  return (
    // Keyed by the selection so a new place opens scrolled to the top.
    <aside className="float profile" aria-label="Location profile" key={s.county ?? s.state ?? s.outside ?? ''}>
      {county ? <CountyProfile c={county} /> : s.state ? <StateProfile code={s.state} /> : <OutsideProfile name={s.outside!} />}
    </aside>
  );
}
