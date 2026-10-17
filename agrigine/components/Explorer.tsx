'use client';
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react';
import { computeStyle, ringsOf } from '@/lib/compute';
import { STATE_VIEW } from '@/lib/constants';
import { useAgData, type Outlines } from '@/lib/data';
import type { HeightId } from '@/lib/metrics';
import { initialState, reducer, toSearch, type MapMode } from '@/lib/state';
import type { Bundle, StateCode } from '@/lib/types';
import { ExplorerContext, NARROW_QUERY, useNarrow, useReducedMotion, type ExplorerApi } from './explorer-context';
import GlobeMap, { IMAGERY_CREDIT, type Camera, type ViewSnapshot } from './GlobeMap';
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
        {error}. Build it with <code>../.venv/bin/python scripts/build_data.py</code> from the agrigine folder, then reload.
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
  const style = useMemo(
    () => computeStyle(bundle.counties, rings, { metric: s.metric, height: s.height, crop: s.crop, yearIndex: i, states: s.states, reportedOnly: s.reportedOnly, hidden: s.hidden }),
    [bundle, rings, s.metric, s.height, s.crop, i, s.states, s.reportedOnly, s.hidden],
  );
  const profileOpen = !!(s.county || s.state || s.outside);

  // Camera: the map reports where it is; the explorer asks it to fly somewhere new.
  const view = useRef<ViewSnapshot>(SPACE);
  const nonce = useRef(0);
  const [camera, setCamera] = useState<Camera>(() => ({ ...SPACE, duration: 0, nonce: 0 }));

  // Space the floating panels take up: side panels on wide screens, the bottom sheet on phones.
  const covered = (layersOpen: boolean, profile: boolean) => ({
    left: !narrow && layersOpen ? 282 : 0,
    right: !narrow && profile ? 386 : 0,
    // The sheet is 58% of the map area, which is the window minus the top bar and timeline.
    bottom: narrow && profile ? (window.innerHeight - 170) * 0.58 : 0,
  });
  /** Moves the camera so a place sits in the middle of the uncovered part of the map. */
  const flyTo = (lon: number, lat: number, zoom: number, o: { profile: boolean; layersOpen: boolean; mode?: MapMode; height?: HeightId; duration?: number }) => {
    const tilt = (o.mode ?? s.mode) === 'map' && (o.height ?? s.height) !== 'none';
    const c = covered(o.layersOpen, o.profile), degPerPx = 360 / (512 * 2 ** zoom);
    setCamera({
      longitude: lon + ((c.right - c.left) / 2) * degPerPx,
      // A degree of latitude spans more pixels than a degree of longitude away from the equator.
      latitude: lat - (c.bottom / 2) * degPerPx * Math.cos((lat * Math.PI) / 180) - (tilt ? 0.5 : 0),
      zoom, pitch: tilt ? 45 : 0, bearing: 0, duration: o.duration ?? 900, nonce: ++nonce.current,
    });
  };
  const flyHome = (duration = 900) => {
    const c = covered(s.layersOpen, profileOpen);
    // 170 px is the top bar plus the timeline.
    const zoom = homeZoom(s.mode, window.innerWidth - c.left - c.right, window.innerHeight - 170 - c.bottom);
    flyTo(HOME.longitude, HOME.latitude, zoom, { profile: profileOpen, layersOpen: s.layersOpen, duration });
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
    setCamera({ ...v, zoom: v.zoom + (mode === 'map' ? 0.45 : -0.45), pitch: mode === 'map' && s.height !== 'none' ? 42 : 0, bearing: 0, duration: 0, nonce: ++nonce.current });
  };
  const setHeight = (id: HeightId) => {
    dispatch({ type: 'height', id });
    if (s.mode === 'map') setCamera({ ...view.current, pitch: id !== 'none' ? 42 : 0, duration: 600, nonce: ++nonce.current });
  };

  // Fly in from space once. A ref survives the explorer being hidden while the Plan page is open.
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
    const t = setTimeout(flyIn, reduced ? 0 : 350);
    return () => clearTimeout(t);
  }, [reduced]);

  // Keep the address bar in step so any view can be shared or bookmarked.
  useEffect(() => {
    const q = toSearch(s);
    if (window.location.search.slice(1) !== q) window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
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
    const t = setInterval(() => dispatch({ type: 'step' }), 1100);
    return () => clearInterval(t);
  }, [s.playing]);

  const api: ExplorerApi = { bundle, byFips, s, i, dispatch, selectCounty, selectState, zoomToCounty };

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
            <GlobeMap style={style} rings={rings} outlines={outlines} camera={camera} reduced={reduced} onView={v => { view.current = v; }} />
            <LayersPanel style={style} onHeight={setHeight} />
            <ProfilePanel />
            <div className="mapctl">
              <button onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
              <button onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
              <button onClick={() => flyHome()} aria-label="Back to the four states"><ResetIcon /></button>
            </div>
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
