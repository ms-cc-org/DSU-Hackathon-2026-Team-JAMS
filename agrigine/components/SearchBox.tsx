'use client';
import { useState } from 'react';
import { STATES, STATE_CODES } from '@/lib/constants';
import type { County } from '@/lib/types';
import { useExplorer } from './explorer-context';
import { SearchIcon } from './icons';

const labelOf = (c: County) => `${c.n} County, ${STATES[c.s]}`;

/** Type a county or state. Matches exact names first, then the start of a county name. */
export default function SearchBox() {
  const { s, bundle, byFips, selectCounty, selectState } = useExplorer();
  const [message, setMessage] = useState<string | null>(null);
  const options = [...bundle.counties].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  const current = s.county ? byFips.get(s.county) : undefined;

  const run = (raw: string) => {
    const q = raw.trim().toLowerCase();
    if (!q) { setMessage(null); return; }
    const state = STATE_CODES.find(code => STATES[code].toLowerCase() === q || code.toLowerCase() === q);
    if (state) { setMessage(null); selectState(state); return; }
    const base = q.replace(/\s+county\b/, '').split(',')[0].trim();
    const hit = bundle.counties.find(c => labelOf(c).toLowerCase() === q)
      ?? bundle.counties.find(c => c.n.toLowerCase() === base)
      ?? bundle.counties.find(c => c.n.toLowerCase().startsWith(base));
    if (!hit) {
      setMessage(`No county or state matches "${raw.trim()}". Agrigine covers counties in California, Delaware, Iowa and Nebraska.`);
      return;
    }
    setMessage(null);
    selectCounty(hit.f);
  };

  return (
    <div className="search">
      <div className="search-box">
        <SearchIcon />
        <input
          // Re-keyed on selection so the box shows the place that is open.
          key={current ? current.f : s.state ?? 'none'}
          defaultValue={current ? labelOf(current) : s.state ? STATES[s.state] : ''}
          list="places" autoComplete="off" aria-label="Search a county or state"
          placeholder="Search a county or state, e.g. Polk County, Iowa"
          onChange={e => {
            // Picking a suggestion replaces the whole text; typing doesn't, so "Iowa" mid-way through "Iowa County" stays put.
            const kind = (e.nativeEvent as InputEvent).inputType;
            if (kind && kind !== 'insertReplacementText') return;
            const v = e.target.value;
            if (options.some(c => labelOf(c) === v) || STATE_CODES.some(code => STATES[code] === v)) run(v);
          }}
          onKeyDown={e => { if (e.key === 'Enter') run(e.currentTarget.value); }}
        />
        <datalist id="places">
          {STATE_CODES.map(code => <option key={code} value={STATES[code]} />)}
          {options.map(c => <option key={c.f} value={labelOf(c)} />)}
        </datalist>
      </div>
      {message && <div className="search-msg" role="status">{message}</div>}
    </div>
  );
}
