'use client';
import { CROP_NAME, CROP_TITLE, SEVERE_WEEKS } from '@/lib/constants';
import { metric } from '@/lib/metrics';
import { FIRST_YEAR, LAST_YEAR } from '@/lib/state';
import { useExplorer } from './explorer-context';
import { PauseIcon, PlayIcon } from './icons';

/** Season slider with Play. The bars above it show how much of the crop was in severe drought each season. */
export default function Timeline() {
  const { s, bundle, dispatch } = useExplorer();
  const fixed = !!metric(s.metric).fixed;
  const grow = bundle.counties.filter(c => c.d[s.crop] && s.states.includes(c.s));
  const n = bundle.years.length, w = 1000, pad = 8, step = (w - 2 * pad) / (n - 1), bw = Math.min(26, step * 0.7);
  return (
    <footer className="timeline">
      <div className="tl-in">
        <button className="play" disabled={fixed} onClick={() => dispatch({ type: 'play', on: !s.playing })} aria-label={s.playing ? 'Pause' : `Play seasons ${FIRST_YEAR} to ${LAST_YEAR}`}>
          {s.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="tl-year">
          <output htmlFor="season">{fixed ? 'All years' : s.year}</output>
          <span>{fixed ? 'Soil does not change' : `${CROP_TITLE[s.crop]} season`}</span>
        </div>
        <div className="tl-track">
          <svg viewBox={`0 0 ${w} 26`} preserveAspectRatio="none" aria-hidden="true">
            {bundle.years.map((year, j) => {
              const share = grow.length ? grow.filter(c => (c.d[s.crop]!.wk[j] ?? 0) >= SEVERE_WEEKS).length / grow.length : 0;
              const h = Math.max(1, share * 24), cur = year === s.year;
              return (
                <rect key={year} x={pad + j * step - bw / 2} y={25 - h} width={bw} height={h} rx={2} fill={cur ? 'var(--ink)' : 'var(--bar-drought)'} opacity={cur ? 1 : 0.8}>
                  <title>{`${year}: ${Math.round(share * 100)}% of ${CROP_NAME[s.crop]} counties had 4+ weeks of severe drought`}</title>
                </rect>
              );
            })}
          </svg>
          <input id="season" type="range" min={FIRST_YEAR} max={LAST_YEAR} step={1} value={s.year} disabled={fixed} aria-label="Season"
            onChange={e => dispatch({ type: 'year', year: Number(e.target.value) })} />
          <div className="ticks">{[2000, 2005, 2010, 2015, 2020, 2025].map(y => <span key={y}>{y}</span>)}</div>
        </div>
        <div className="tl-note"><i />Share of counties with 4+ weeks of severe drought</div>
      </div>
    </footer>
  );
}
