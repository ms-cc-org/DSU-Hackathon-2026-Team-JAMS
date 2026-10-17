'use client';
import { CROPS, CROP_NAME, CROP_TITLE, STATES, STATE_CODES } from '@/lib/constants';
import type { MapStyle } from '@/lib/compute';
import { CATEGORIES, CATEGORY_IDS, HEIGHTS, HEIGHT_IDS, METRIC_IDS, metric, scopeOf, type HeightId } from '@/lib/metrics';
import { formatDay } from '@/lib/daily';
import type { ConditionId, RefLayer } from '@/lib/state';
import { useExplorer } from './explorer-context';
import { CategoryIcon, ChevronLeftIcon, LayersIcon } from './icons';

const CONDITIONS: { id: ConditionId; label: string }[] = [
  { id: 'drought', label: 'Severe drought this season (4+ weeks in D2+)' },
  { id: 'storms', label: 'Hit by damaging storms this season' },
  { id: 'longRecord', label: 'Long yield record (15+ reported seasons)' },
];

const REFS: { id: RefLayer; label: string }[] = [
  { id: 'imagery', label: 'Satellite imagery' },
  { id: 'cities', label: 'City and town names' },
  { id: 'borders', label: 'Country borders and coastlines' },
  { id: 'states', label: 'State borders' },
  { id: 'counties', label: 'County lines' },
  { id: 'labels', label: 'Labels' },
];

function Categories() {
  const { s, dispatch } = useExplorer();
  const active = metric(s.metric).cat;
  return (
    <div>
      {CATEGORY_IDS.map(cat => {
        const open = s.openCategory === cat;
        return (
          <div key={cat} className={`cat${open ? ' open' : ''}`} style={{ ['--cc' as string]: CATEGORIES[cat].color }}>
            <button className="cat-head" aria-expanded={open} onClick={() => dispatch({ type: 'category', id: cat })}>
              <span className="cat-ic"><CategoryIcon id={cat} /></span>
              <span>{CATEGORIES[cat].name}</span>
              {active === cat && <span className="cat-on">On map</span>}
              <span className="chev" />
            </button>
            {open && (
              <div className="cat-items">
                {METRIC_IDS.filter(id => metric(id).cat === cat).map((id, n, ids) => (
                  <div key={id}>
                  {(n === 0 || scopeOf(metric(ids[n - 1])) !== scopeOf(metric(id))) && <p className="mscope">{scopeOf(metric(id))}</p>}
                  <button className="mrow" aria-pressed={s.metric === id} onClick={() => dispatch({ type: 'metric', id })}>
                    <span className="radio" />
                    <span className="mname">{metric(id).name}</span>
                    <span className="mramp">{metric(id).bins(s.crop).map((b, j) => <i key={j} style={{ background: b.color }} />)}</span>
                  </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The key doubles as a filter: each band shows its county count, and clicking a band hides or shows those counties. */
function Key({ style }: { style: MapStyle }) {
  const { s, dispatch } = useExplorer();
  const m = metric(s.metric);
  const max = Math.max(1, ...style.counts, style.noData);
  const when = m.kind === 'daily' ? formatDay(s.day) : m.fixed ? 'does not change by season' : `${s.year} ${CROP_NAME[s.crop]} season${m.kind === 'satellite' ? ' (county-wide, all vegetation)' : ''}`;
  const row = (key: number | 'nodata', color: string | null, label: string, n: number) => {
    const on = !s.hidden.includes(key);
    return (
      <button key={String(key)} className="krow" aria-pressed={on} title={`${on ? 'Hide' : 'Show'} these counties`} onClick={() => dispatch({ type: 'toggleBin', bin: key })}>
        <span className={`ksw${color ? '' : ' hollow'}`} style={color ? { background: color } : undefined} />
        <span className="kl">{label}</span>
        <span className="kn">{n}</span>
        <span className="kbar"><i style={{ width: `${(n / max) * 100}%`, background: color ?? 'var(--line-2)' }} /></span>
      </button>
    );
  };
  return (
    <div className="key">
      <div className="key-head" style={{ ['--cc' as string]: CATEGORIES[m.cat].color }}>
        <span className="cat-ic"><CategoryIcon id={m.cat} /></span>
        <b>{m.name}</b>
      </div>
      <p className="key-sub">{m.unit} · {when}</p>
      {style.bins.map((b, j) => row(j, b.color, b.label, style.counts[j]))}
      {row('nodata', null, 'No data', style.noData)}
      <div className="key-foot">
        <span>{style.shown} of {style.total} counties shown</span>
        {s.hidden.length > 0 && <button className="linkbtn" onClick={() => dispatch({ type: 'showAllBins' })}>Show all</button>}
      </div>
      <p className="hint">Click a color to hide or show those counties.</p>
    </div>
  );
}

export default function LayersPanel({ style, onHeight }: { style: MapStyle; onHeight: (id: HeightId) => void }) {
  const { s, bundle, dispatch } = useExplorer();
  if (!s.layersOpen) {
    const m = metric(s.metric);
    return (
      <button className="layers-pill" onClick={() => dispatch({ type: 'layers', open: true })}>
        <LayersIcon />Layers <i style={{ background: CATEGORIES[m.cat].color }} />{m.name}
      </button>
    );
  }
  const raised = s.height !== 'none';
  return (
    <aside className="float layers" aria-label="Layers">
      <div className="lp-head">
        <h2>Layers</h2>
        <button className="icon-btn" onClick={() => dispatch({ type: 'layers', open: false })} aria-label="Hide layers panel"><ChevronLeftIcon /></button>
      </div>
      <div className="lp-scroll">
        <div className="lp-sec"><h3>Color the map by</h3><Categories /></div>
        <div className="lp-sec"><h3>Key</h3><Key style={style} /></div>
        <div className="lp-sec">
          <h3>Height (3D)</h3>
          <select value={s.height} onChange={e => onHeight(e.target.value as HeightId)} aria-label="Raise counties by">
            {HEIGHT_IDS.map(id => <option key={id} value={id}>{HEIGHTS[id].name}</option>)}
          </select>
          <p className="hint">
            {raised
              ? `Taller counties have more ${HEIGHTS[s.height].name.toLowerCase()}. ${s.mode === 'globe' ? 'Switch to Map to tilt and see the height.' : 'Right-drag to tilt.'}`
              : 'Raise counties by a second layer to compare two layers at once.'}
          </p>
        </div>
        <div className="lp-sec">
          <h3>Filters</h3>
          <div className="chips" role="group" aria-label="States">
            {STATE_CODES.map(code => (
              <button key={code} className="chip" aria-pressed={s.states.includes(code)} onClick={() => dispatch({ type: 'toggleState', code })}>
                {STATES[code]} <small>{bundle.counties.filter(c => c.s === code).length}</small>
              </button>
            ))}
          </div>
          <div className="seg wide" role="group" aria-label="Crop">
            {CROPS.map(k => (
              <button key={k} aria-pressed={s.crop === k} onClick={() => dispatch({ type: 'crop', crop: k })}>{CROP_TITLE[k].replace('Winter ', '')}</button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={s.reportedOnly} onChange={e => dispatch({ type: 'reportedOnly', on: e.target.checked })} /> Only counties with a reported yield
          </label>
          <p className="hint">Show only counties with:</p>
          {CONDITIONS.map(f => (
            <label key={f.id} className="check">
              <input type="checkbox" checked={s.conditions.includes(f.id)} onChange={() => dispatch({ type: 'condition', id: f.id })} /> {f.label}
            </label>
          ))}
        </div>
        <div className="lp-sec">
          <h3>Map details</h3>
          {REFS.map(r => (
            <label key={r.id} className="check">
              <input type="checkbox" checked={s.refs[r.id]} onChange={e => dispatch({ type: 'ref', layer: r.id, on: e.target.checked })} /> {r.label}
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}
