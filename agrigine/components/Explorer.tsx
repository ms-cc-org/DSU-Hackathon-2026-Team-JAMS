'use client';
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { computeStyle, ringsOf } from '@/lib/compute';
import { STATE_VIEW } from '@/lib/constants';
import { dayContext, useDaily, yearOf } from '@/lib/daily';
import { usePredict } from '@/lib/predict';
import { useMyFarms } from '@/lib/farms';
import { useAgData, type Outlines } from '@/lib/data';
import { initialState, reducer, toSearch, type MapMode } from '@/lib/state';
import type { Bundle, City, StateCode } from '@/lib/types';
import { ExplorerContext, NARROW_QUERY, useNarrow, useReducedMotion, type ExplorerApi } from './explorer-context';
import GlobeMap, { IMAGERY_CREDIT, type Camera, type ViewSnapshot } from './GlobeMap';
import { LAST_VIEW_KEY } from './NavSwitch';
import { GlobeIcon, MapIcon, ResetIcon } from './icons';
import LayersPanel from './LayersPanel';
import LoadingShell from './LoadingShell';
import ProfilePanel from './profile/ProfilePanel';
import SearchBox from './SearchBox';
import Timeline from './Timeline';
import TopBar from './TopBar';

const HOME = { longitude: -99, latitude: 39.5 };
/** Zoom that fits the globe (or the lower 48 on the flat map) into the visible map area, so phones aren't zoomed in. */
const homeZoom = (mode: MapMode, visibleWidth: number, visibleHeight: number) => {
  const fit = Math.log2(Math.max(240, Math.min(visibleWidth, visibleHeight)) / 860);
  return Math.max(1, Math.min(mode === 'globe' ? 2.6 : 3.8, (mode === 'globe' ? 2.35 : 3.55) + fit));
};
const SPACE: ViewSnapshot = { longitude: -40, latitude: 18, zoom: 0.6, pitch: 0, bearing: 0 };

export default function Explorer() {
  const { bundle, outlines, error } = useAgData();
  if (error) {
    return (
      <LoadingShell title="Agrigine couldn't load its data">
        {error}. Build it with <code>python3 scripts/build_data.py</code> from the agrigine folder, then reload.
      </LoadingShell>
    );
  }
  if (!bundle) return <LoadingShell />;
  return <ExplorerReady bundle={bundle} outlines={outlines} />;
}

function ExplorerReady({ bundle, outlines }: { bundle: Bundle; outlines: Outlines | null }) {
  const narrow = useNarrow();
  const reduced = useReducedMotion();
  const [s, dispatch] = useReducer(reducer, null, () => initialState(bundle, window.location.search, window.matchMedia(NARROW_QUERY).matches));
  const byFips = useMemo(() => new Map(bundle.counties.map(c => [c.f, c])), [bundle]);
  const rings = useMemo(() => ringsOf(bundle.counties), [bundle]);
  const i = s.year - bundle.years[0];
  // The selected date: that year's daily weather (loaded on demand) plus the weekly drought map in effect.
  const order = useMemo(() => new Map(bundle.counties.map((c, j) => [c.f, j])), [bundle]);
  const daily = useDaily(yearOf(s.day));
  const predict = usePredict(yearOf(s.day));
  const t = useMemo(() => dayContext(s.day, order, daily.data, daily.normals, predict),
    [s.day, order, daily.data, daily.normals, predict.year, predict.statics, predict.index]); // eslint-disable-line react-hooks/exhaustive-deps
  const myFarms = useMyFarms();
  const farmFips = useMemo(() => new Set(myFarms?.farms.map(f => f.fips) ?? []), [myFarms]);
  const style = useMemo(
    () => computeStyle(bundle.counties, rings, { metric: s.metric, raised: s.raised, crop: s.crop, yearIndex: i, states: s.states, reportedOnly: s.reportedOnly, conditions: s.conditions, hidden: s.hidden, t, farmFips }),
    [bundle, rings, s.metric, s.raised, s.crop, i, s.states, s.reportedOnly, s.conditions, s.hidden, t, farmFips],
  );
  const profileOpen = !!(s.county || s.state || s.outside);

  // Camera: the map reports where it is; the explorer asks it to fly somewhere new.
  const view = useRef<ViewSnapshot>(SPACE);
  const nonce = useRef(0);
  const [camera, setCamera] = useState<Camera>(() => ({ ...SPACE, duration: 0, nonce: 0 }));
  // Rounded heading and tilt, for the compass and the 2D/3D button.
  const [heading, setHeading] = useState({ bearing: 0, pitch: 0 });
  const [help, setHelp] = useState(false);

  // Space the floating panels take up: side panels on wide screens, the bottom sheet on phones.
  const covered = (layersOpen: boolean, profile: boolean) => ({
    left: !narrow && layersOpen ? 282 : 0,
    right: !narrow && profile ? 386 : 0,
    // The sheet is 58% of the map area, which is the window minus the top bar and timeline.
    bottom: narrow && profile ? (window.innerHeight - 170) * 0.58 : 0,
  });
  /** Camera center that puts a point `sx` px right and `sy` px down of where it is, whichever way the map is turned. */
  const offset = (lon: number, lat: number, zoom: number, bearing: number, sx: number, sy: number) => {
    const deg = 360 / (512 * 2 ** zoom), b = (bearing * Math.PI) / 180;
    const east = sx * Math.cos(b) - sy * Math.sin(b), north = -sx * Math.sin(b) - sy * Math.cos(b);
    // A degree of latitude spans more pixels than a degree of longitude away from the equator.
    return { longitude: lon + east * deg, latitude: Math.max(-85, Math.min(85, lat + north * deg * Math.cos((lat * Math.PI) / 180))) };
  };
  /** Flies so a place sits in the middle of the uncovered part of the map, keeping the user's tilt and heading. */
  const flyTo = (lon: number, lat: number, zoom: number, o: { profile: boolean; layersOpen: boolean; duration?: number; pitch?: number; bearing?: number }) => {
    const pitch = o.pitch ?? view.current.pitch, bearing = o.bearing ?? view.current.bearing;
    const c = covered(o.layersOpen, o.profile);
    setCamera({ ...offset(lon, lat, zoom, bearing, (c.right - c.left) / 2, c.bottom / 2), zoom, pitch, bearing, duration: o.duration ?? 900, nonce: ++nonce.current });
  };
  const flyHome = (duration = 900) => {
    const c = covered(s.layersOpen, profileOpen);
    // 170 px is the top bar plus the timeline.
    const zoom = homeZoom(s.mode, window.innerWidth - c.left - c.right, window.innerHeight - 170 - c.bottom);
    flyTo(HOME.longitude, HOME.latitude, zoom, { profile: profileOpen, layersOpen: s.layersOpen, duration, pitch: 0, bearing: 0 });
  };
  // Small camera moves for the 3D controls and the keyboard.
  const nudge = (change: Partial<ViewSnapshot>, duration = 400) => setCamera({ ...view.current, ...change, duration, nonce: ++nonce.current });
  const turn = (by: number) => nudge({ bearing: view.current.bearing + by });
  const tilt = (pitch: number) => nudge({ pitch: Math.max(0, Math.min(70, pitch)) }, 500);
  const faceNorth = () => nudge({ bearing: 0 }, 500);
  const move = (sx: number, sy: number) => { const v = view.current; nudge(offset(v.longitude, v.latitude, v.zoom, v.bearing, sx, sy), 200); };
  /** Click the map, then: arrows move, Shift+arrows rotate and tilt, + and - zoom, N faces north. */
  const onMapKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = e.shiftKey
      ? { ArrowLeft: () => turn(-15), ArrowRight: () => turn(15), ArrowUp: () => tilt(view.current.pitch + 10), ArrowDown: () => tilt(view.current.pitch - 10) }
      : { ArrowLeft: () => move(-120, 0), ArrowRight: () => move(120, 0), ArrowUp: () => move(0, -120), ArrowDown: () => move(0, 120) };
    const other: Record<string, () => void> = { '+': () => zoomBy(0.5), '=': () => zoomBy(0.5), '-': () => zoomBy(-0.5), _: () => zoomBy(-0.5), n: faceNorth, N: faceNorth, Home: () => flyHome() };
    const run = keys[e.key] ?? other[e.key];
    if (run) { e.preventDefault(); run(); }
  };

  /** Close enough to see the county and its neighbors; a step further out on phones. */
  const countyZoom = () => (s.mode === 'globe' ? 6.2 : 6.6) - (narrow ? 0.8 : 0);
  const selectCounty = (fips: string) => {
    const c = byFips.get(fips);
    if (!c) return;
    dispatch({ type: 'county', fips });
    if (narrow) dispatch({ type: 'layers', open: false });
    flyTo(c.c[0], c.c[1], countyZoom(), { profile: true, layersOpen: narrow ? false : s.layersOpen });
  };
  /** Opens the county a city is in and flies close to the city itself. */
  const selectCity = (city: City) => {
    dispatch({ type: 'county', fips: city[2] });
    if (narrow) dispatch({ type: 'layers', open: false });
    flyTo(city[3], city[4], Math.max(countyZoom() + 1.2, 7.4), { profile: true, layersOpen: narrow ? false : s.layersOpen });
  };
  const selectState = (code: StateCode) => {
    dispatch({ type: 'state', code });
    const [lon, lat, zoom] = STATE_VIEW[code];
    flyTo(lon, lat, zoom - (s.mode === 'globe' ? 0.3 : 0), { profile: true, layersOpen: s.layersOpen });
  };
  const zoomToCounty = () => {
    const c = s.county ? byFips.get(s.county) : undefined;
    if (c) flyTo(c.c[0], c.c[1], countyZoom() + 1, { profile: true, layersOpen: s.layersOpen });
  };
  const zoomBy = (d: number) => setCamera({ ...view.current, zoom: Math.max(0.5, Math.min(11, view.current.zoom + d)), duration: 400, nonce: ++nonce.current });
  const setMode = (mode: MapMode) => {
    if (mode === s.mode) return;
    dispatch({ type: 'mode', mode });
    const v = view.current;
    setCamera({ ...v, zoom: v.zoom + (mode === 'map' ? 0.45 : -0.45), duration: 0, nonce: ++nonce.current });
  };
  /** 3D on raises the counties by the layer on the map and tilts so the heights show; 3D off lays it flat. */
  const set3d = (on: boolean) => {
    dispatch({ type: 'raised', on });
    if (on && view.current.pitch < 35) tilt(50);
    if (!on && view.current.pitch > 0) tilt(0);
  };

  // Fly in from space once. A ref survives the explorer being hidden while another page is open.
  const flewIn = useRef(false);
  const flyIn = useEffectEvent(() => {
    flewIn.current = true;
    const c = s.county ? byFips.get(s.county) : undefined;
    const fromUrl = new URLSearchParams(window.location.search);
    if (c && fromUrl.has('county')) flyTo(c.c[0], c.c[1], countyZoom(), { profile: true, layersOpen: s.layersOpen, duration: 2600 });
    else if (s.state) selectState(s.state);
    else flyHome(2600);
  });
  useEffect(() => {
    if (flewIn.current) return;
    const timer = setTimeout(flyIn, reduced ? 0 : 350);
    return () => clearTimeout(timer);
  }, [reduced]);

  // Keep the address bar in step so any view can be shared or bookmarked; waits for the dial to rest.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = toSearch(s);
      if (window.location.search.slice(1) !== q) window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
      try { sessionStorage.setItem(LAST_VIEW_KEY, `?${q}`); } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [s]);

  // A trackpad pinch should zoom the map, never the whole page (Chrome sends ctrl+wheel, Safari sends gestures).
  useEffect(() => {
    const stopWheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    const stopGesture = (e: Event) => e.preventDefault();
    window.addEventListener('wheel', stopWheel, { passive: false });
    document.addEventListener('gesturestart', stopGesture);
    document.addEventListener('gesturechange', stopGesture);
    return () => {
      window.removeEventListener('wheel', stopWheel);
      document.removeEventListener('gesturestart', stopGesture);
      document.removeEventListener('gesturechange', stopGesture);
    };
  }, []);

  useEffect(() => {
    if (!s.playing) return;
    // About a month per second: two days every 60 ms.
    const timer = setInterval(() => dispatch({ type: 'tick', by: 2 }), 60);
    return () => clearInterval(timer);
  }, [s.playing]);

  const api: ExplorerApi = { bundle, byFips, s, i, t, dispatch, selectCounty, selectState, selectCity, zoomToCounty, myFarms };
  // The profile follows a step behind the dial, so dragging stays smooth on phones.
  const lagging = useDeferredValue(api);

  return (
    <ExplorerContext.Provider value={api}>
      <div className="shell">
        <TopBar
          active="explore"
          search={<SearchBox />}
          controls={
            <div className="seg" role="group" aria-label="Map style">
              <button aria-pressed={s.mode === 'globe'} aria-label="Globe" onClick={() => setMode('globe')}><GlobeIcon /><span className="seg-label">Globe</span></button>
              <button aria-pressed={s.mode === 'map'} aria-label="Map" onClick={() => setMode('map')}><MapIcon /><span className="seg-label">Map</span></button>
            </div>
          }
        />
        <main className="views">
          <section className={`explore${s.mode === 'map' ? ' flat' : ''}${s.refs.imagery ? ' sat' : ''}${profileOpen ? ' has-profile' : ''}`} aria-label="Agrigine explorer">
            <GlobeMap
              style={style} rings={rings} outlines={outlines} camera={camera} reduced={reduced} onKeyDown={onMapKey}
              onView={v => {
                view.current = v;
                const bearing = Math.round(v.bearing), pitch = Math.round(v.pitch);
                setHeading(h => (h.bearing === bearing && h.pitch === pitch ? h : { bearing, pitch }));
              }}
            />
            <LayersPanel style={style} on3d={set3d} />
            <ExplorerContext.Provider value={lagging}><ProfilePanel /></ExplorerContext.Provider>
            <div className="mapctl" role="group" aria-label="Map controls">
              <button className="compass" onClick={faceNorth} title="Face north" aria-label={`Face north. Heading ${heading.bearing} degrees`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${-heading.bearing}deg)` }}>
                  <path d="M12 3l3.2 9h-6.4z" fill="#E34948" />
                  <path d="M12 21l-3.2-9h6.4z" fill="#9AA39C" />
                </svg>
              </button>
              <button className="tilt" onClick={() => set3d(!s.raised)} aria-pressed={s.raised} title={s.raised ? 'Flatten the map' : 'Raise counties by this layer and tilt'}>
                {s.raised ? '2D' : '3D'}
              </button>
              <button className="rot" onClick={() => turn(-30)} aria-label="Rotate left" title="Rotate left">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5H2.8v-2.7M3 3.4A6 6 0 1 1 2 8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button className="rot" onClick={() => turn(30)} aria-label="Rotate right" title="Rotate right">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3.5h2.7v-2.7M13 3.4A6 6 0 1 0 14 8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button onClick={() => zoomBy(1)} aria-label="Zoom in" title="Zoom in">+</button>
              <button onClick={() => zoomBy(-1)} aria-label="Zoom out" title="Zoom out">−</button>
              <button onClick={() => flyHome()} aria-label="Back to the four states" title="Back to the four states"><ResetIcon /></button>
              <button className="help" onClick={() => setHelp(h => !h)} aria-expanded={help} aria-label="How to move the map" title="How to move the map">?</button>
            </div>
            {help && (
              <div className="maphelp" role="note">
                <b>Moving around</b>
                <ul>
                  <li><b>Drag</b> to spin the globe</li>
                  <li><b>Right-drag</b> or <b>Shift-drag</b> to tilt and rotate</li>
                  <li><b>Scroll</b> or <b>pinch</b> to zoom toward the pointer</li>
                  <li><b>Double-click</b> to zoom in, <b>Shift</b> double-click to zoom out</li>
                  <li>Click the map, then <b>arrows</b> move, <b>Shift+arrows</b> rotate and tilt, <b>+</b> and <b>−</b> zoom, <b>N</b> faces north</li>
                </ul>
              </div>
            )}
            <div className="attrib">
              USDA NASS · U.S. Drought Monitor · NOAA ACIS · NRCS SSURGO · NASA MODIS · U.S. Census · Natural Earth{s.refs.imagery && ` · ${IMAGERY_CREDIT}`}
            </div>
          </section>
        </main>
        <Timeline />
      </div>
    </ExplorerContext.Provider>
  );
}
