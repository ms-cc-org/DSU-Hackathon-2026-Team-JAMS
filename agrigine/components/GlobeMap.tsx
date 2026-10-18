'use client';
import { AmbientLight, COORDINATE_SYSTEM, FlyToInterpolator, LightingEffect, MapView, _CameraLight as CameraLight, _GlobeView as GlobeView, type Color, type PickingInfo } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, GeoJsonLayer, PathLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import type { Feature } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { City } from '@/lib/types';
import { MAP, rgb } from '@/lib/colors';
import type { MapStyle, Ring } from '@/lib/compute';
import { CROP_NAME, STATES, STATE_BY_FIPS, STATE_CODES, STATE_VIEW } from '@/lib/constants';
import type { Outlines } from '@/lib/data';
import { num } from '@/lib/format';
import { formatDay, isoDay } from '@/lib/daily';
import { height, metric, whyMissing } from '@/lib/metrics';
import { useExplorer } from './explorer-context';

/** Where the camera should go. A new `nonce` makes the map fly there even if it's the same place as before. */
export interface Camera {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  duration: number;
  nonce: number;
}
export type ViewSnapshot = Pick<Camera, 'longitude' | 'latitude' | 'zoom' | 'pitch' | 'bearing'>;

interface Label {
  position: number[];
  text: string;
  size: number;
}

const OCEAN: [number, number][][] = [[[-180, 90], [0, 90], [180, 90], [180, -90], [0, -90], [-180, -90]]];
/** Esri World Imagery: no key needed, credited in the explorer's attribution line. */
// NASA GIBS imagery: free, public domain, no key. Blue Marble is a cloud-free mosaic for the zoomed-out globe;
// Landsat WELD is a 30 m cloud-free composite for county and field detail; MODIS Terra is the photo of a given day.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const BLUE_MARBLE_URL = `${GIBS}/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg`;
const LANDSAT_URL = `${GIBS}/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/2000-12-01/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpg`;
const dayPhotoUrl = (date: string) => `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
export const IMAGERY_CREDIT = 'Imagery: NASA Blue Marble, Landsat WELD and MODIS via NASA GIBS';

/** One tiled imagery layer. Tiles are Web Mercator images; _imageCoordinateSystem lets the globe bend them. */
const imagery = (id: string, data: string, minZoom: number, maxZoom: number) => new TileLayer<ImageBitmap>({
  id, data, minZoom, maxZoom, tileSize: 256, maxRequests: 12,
  renderSubLayers: props => {
    const [[west, south], [east, north]] = props.tile.boundingBox;
    return new BitmapLayer({ id: props.id, image: props.data, bounds: [west, south, east, north], _imageCoordinateSystem: COORDINATE_SYSTEM.CARTESIAN });
  },
});
const MATERIAL = { ambient: 0.62, diffuse: 0.5, shininess: 10, specularColor: [30, 30, 30] as [number, number, number] };
// Drag spins the globe with momentum; right-drag or Shift-drag tilts and rotates; scroll zooms toward the pointer.
// The keyboard is handled by the explorer so it works the same in globe and map views.
const CONTROLLER = { scrollZoom: { speed: 0.02, smooth: true }, dragPan: true, dragRotate: true, touchZoom: true, touchRotate: true, doubleClickZoom: true, keyboard: false, inertia: 450 };
/** Height in meters for a full-height county: about 28 px on screen up close, capped at 150 km so it never spikes off the globe. */
export const elevationFor = (zoom: number) => Math.min(3.2e6 / 2 ** zoom, 1.5e5);
/** Satellite tiles stop at 85° north and south; these caps fill the gap in a color that blends with the polar water. */
const POLES: [number, number][][] = [
  [[-180, 85.05], [0, 85.05], [180, 85.05], [180, 90], [0, 90], [-180, 90]],
  [[-180, -90], [0, -90], [180, -90], [180, -85.05], [0, -85.05], [-180, -85.05]],
];
const withAlpha = (c: [number, number, number], a: number): Color => [c[0], c[1], c[2], a];
/** A county outline raised to height z, so the selection ring sits on top of a 3D county. */
const lifted = (r: Ring, z: number) => r.ring.map(p => [p[0], p[1], z] as [number, number, number]);
const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

interface Props {
  style: MapStyle;
  rings: Ring[];
  outlines: Outlines | null;
  camera: Camera;
  reduced: boolean;
  onView: (v: ViewSnapshot) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export default function GlobeMap({ style, rings, outlines, camera, reduced, onView, onKeyDown }: Props) {
  const { s, i, t, bundle, byFips, dispatch, selectCounty, selectState, selectCity } = useExplorer();
  const [failed, setFailed] = useState(false);
  const [elevation, setElevation] = useState(() => elevationFor(camera.zoom));
  const [zoom, setZoom] = useState(camera.zoom);
  // The day's satellite photo follows the dial once it rests, so dragging doesn't fetch a new image per day.
  const [photoDate, setPhotoDate] = useState(() => isoDay(s.day));
  useEffect(() => {
    if (!s.refs.dayphoto) return;
    const timer = setTimeout(() => setPhotoDate(isoDay(s.day)), 600);
    return () => clearTimeout(timer);
  }, [s.day, s.refs.dayphoto]);
  // Camera moves made in code (search, fly-to, reset) can land without a view-state event, so follow them here too.
  const [seenCamera, setSeenCamera] = useState(camera);
  if (seenCamera !== camera) {
    setSeenCamera(camera);
    setZoom(camera.zoom);
    setElevation(elevationFor(camera.zoom));
  }
  // Bigger places first: cities over 500,000 from far out, every town once you're close.
  const minPopulation = zoom < 4 ? 500000 : zoom < 5 ? 150000 : zoom < 6 ? 40000 : zoom < 7 ? 10000 : zoom < 8 ? 2500 : 0;
  const cities = useMemo(
    () => (bundle.cities ?? []).filter(c => c[5] >= minPopulation && s.states.includes(c[1])),
    [bundle, minPopulation, s.states],
  );
  // deck.gl draws text into its own atlas, so it needs the resolved font name rather than the CSS variable.
  const [font] = useState(() => getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif');

  const views = useMemo(() => ({ globe: new GlobeView({ id: 'globe', resolution: 4 }), map: new MapView({ id: 'map', repeat: false }) }), []);
  const effects = useMemo(
    () => [new LightingEffect({ ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1 }), camera: new CameraLight({ color: [255, 255, 255], intensity: 0.55 }) })],
    [],
  );
  const initialViewState = useMemo(
    () => ({
      longitude: camera.longitude, latitude: camera.latitude, zoom: camera.zoom, pitch: camera.pitch, bearing: camera.bearing,
      minZoom: 0.4, maxZoom: 12, maxPitch: 70,
      transitionDuration: reduced ? 0 : camera.duration,
      transitionInterpolator: camera.duration && !reduced ? new FlyToInterpolator() : undefined,
      nonce: camera.nonce,
    }),
    [camera, reduced],
  );

  const layers = useMemo(() => {
    const raised = s.height !== 'none';
    const sat = s.refs.imagery;
    const key = `${s.metric}|${s.height}|${s.crop}|${s.day}|${style.byFips.size}|${s.hidden.join()}|${s.states.join()}|${s.reportedOnly}|${sat}`;
    const selected = s.county ? byFips.get(s.county) : undefined;
    const selZ = (s.county ? style.byFips.get(s.county)?.height ?? 0 : 0) * elevation + 300;
    const selRings = selected ? rings.filter(r => r.f === selected.f) : [];
    const lift = raised ? elevation * 1.05 : 2000;
    const labels: Label[] = !s.refs.labels ? [] : [
      ...STATE_CODES.filter(code => s.states.includes(code)).map(code => ({
        position: [STATE_VIEW[code][0], STATE_VIEW[code][1] + (code === 'DE' ? 0.9 : 0), lift], text: STATES[code].toUpperCase(), size: 12,
      })),
      ...(selected ? [{ position: [selected.c[0], selected.c[1], selZ + 300], text: selected.n, size: 14 }] : []),
    ];
    return [
      // Under the imagery this is the deep-blue backdrop that shows while tiles load.
      s.mode === 'globe' && new SolidPolygonLayer({
        id: 'ocean', data: OCEAN, getPolygon: d => d, getFillColor: sat ? [16, 34, 52] : MAP.ocean, material: false, updateTriggers: { getFillColor: sat },
        // Under imagery the backdrop must never hide a tile, so it doesn't claim depth.
        parameters: sat ? { depthWriteEnabled: false } : {},
      }),
      sat && imagery('imagery', BLUE_MARBLE_URL, 0, 8),
      // Landsat takes over once a few states fill the screen; below zoom 6 it loads nothing.
      sat && imagery('imagery-landsat', LANDSAT_URL, 6, 12),
      sat && s.refs.dayphoto && imagery('imagery-day', dayPhotoUrl(photoDate), 0, 9),
      sat && s.mode === 'globe' && new SolidPolygonLayer({ id: 'poles', data: POLES, getPolygon: d => d, getFillColor: [22, 46, 70], material: false, parameters: { depthWriteEnabled: false } }),
      !sat && outlines && new GeoJsonLayer({ id: 'land', data: outlines.land, filled: true, stroked: false, getFillColor: MAP.land, material: false }),
      // Nearly invisible, but pickable: clicking a state says whether Agrigine covers it.
      outlines && new GeoJsonLayer({ id: 'us-states', data: outlines.usStates, filled: true, stroked: false, getFillColor: withAlpha(MAP.land, 2), pickable: true, material: false }),
      // Filtered-out counties: a dark veil over imagery, a flat gray on the plain map.
      new PolygonLayer<Ring>({
        id: 'ghost', data: style.ghost, getPolygon: r => r.ring, getFillColor: sat ? [8, 14, 20, 150] : MAP.ghost, stroked: false, material: false, updateTriggers: { getFillColor: sat },
      }),
      new PolygonLayer<Ring>({
        id: 'counties', data: style.active, getPolygon: r => r.ring, stroked: false, filled: true,
        extruded: raised, wireframe: false, elevationScale: elevation,
        getElevation: r => style.byFips.get(r.f)!.height,
        getFillColor: r => {
          const c = style.byFips.get(r.f)!.color;
          // No data stays hollow so the ground shows through.
          if (!c) return sat ? [255, 255, 255, 14] : withAlpha(MAP.land, 40);
          return withAlpha(rgb(c), sat ? 220 : 245);
        },
        material: raised ? MATERIAL : false, pickable: true, autoHighlight: true, highlightColor: [...MAP.ink, 70],
        updateTriggers: { getFillColor: key, getElevation: key },
        transitions: reduced ? {} : { getElevation: 650 },
      }),
      s.refs.counties && new PathLayer<Ring>({
        id: 'county-lines', data: rings, getPath: r => r.ring, getColor: sat ? [255, 255, 255, 70] : withAlpha(MAP.ink, 60), getWidth: 0.6, widthUnits: 'pixels', widthMinPixels: 0.4,
        updateTriggers: { getColor: sat },
      }),
      s.refs.states && outlines && new GeoJsonLayer({
        id: 'state-lines', data: outlines.stateLines, stroked: true, filled: false, getLineColor: sat ? [255, 255, 255, 200] : [60, 72, 64, 210], lineWidthUnits: 'pixels', getLineWidth: 1.2,
        updateTriggers: { getLineColor: sat },
      }),
      s.refs.borders && outlines && new GeoJsonLayer({
        id: 'world-lines', data: outlines.worldLines, stroked: true, filled: false, getLineColor: sat ? [255, 255, 255, 140] : [86, 98, 92, 190], lineWidthUnits: 'pixels', getLineWidth: 0.9,
        updateTriggers: { getLineColor: sat },
      }),
      selRings.length > 0 && new PathLayer<Ring>({
        id: 'selection-halo', data: selRings, getPath: r => lifted(r, selZ), getColor: [255, 255, 255, 240],
        getWidth: 7, widthUnits: 'pixels', jointRounded: true, updateTriggers: { getPath: selZ },
      }),
      selRings.length > 0 && new PathLayer<Ring>({
        id: 'selection', data: selRings, getPath: r => lifted(r, selZ), getColor: withAlpha(MAP.ink, 255),
        getWidth: 3, widthUnits: 'pixels', jointRounded: true, updateTriggers: { getPath: selZ },
      }),
      s.refs.cities && cities.length > 0 && new ScatterplotLayer<City>({
        id: 'city-dots', data: cities, getPosition: d => [d[3], d[4], lift], getRadius: d => (d[5] >= 100000 ? 4.5 : 3), radiusUnits: 'pixels',
        getFillColor: sat ? [255, 255, 255, 240] : [20, 32, 26, 235], stroked: true, getLineColor: sat ? [20, 32, 26, 220] : [255, 255, 255, 230],
        lineWidthUnits: 'pixels', getLineWidth: 1.2, pickable: true, parameters: { depthCompare: 'always', depthWriteEnabled: false },
        updateTriggers: { getFillColor: sat, getLineColor: sat, getPosition: lift },
      }),
      s.refs.cities && cities.length > 0 && new TextLayer<City>({
        id: 'city-names', data: cities, getPosition: d => [d[3], d[4], lift], getText: d => d[0],
        getSize: d => (d[5] >= 100000 ? 14 : d[5] >= 20000 ? 12.5 : 11), sizeUnits: 'pixels', getPixelOffset: [7, 0],
        getTextAnchor: 'start', getAlignmentBaseline: 'center', fontFamily: font, fontWeight: 600, characterSet: 'auto',
        fontSettings: { sdf: true }, outlineWidth: 3, outlineColor: sat ? [11, 21, 32, 230] : [255, 255, 255, 235],
        getColor: sat ? [255, 255, 255, 245] : [20, 32, 26, 240], parameters: { depthCompare: 'always', depthWriteEnabled: false },
        updateTriggers: { getColor: sat, getPosition: lift },
      }),
      labels.length > 0 && new TextLayer<Label>({
        id: 'labels', data: labels, getPosition: d => d.position as [number, number, number], getText: d => d.text, getSize: d => d.size, sizeUnits: 'pixels',
        getColor: sat ? [255, 255, 255, 245] : withAlpha(MAP.ink, 235), fontFamily: font, fontWeight: 700, characterSet: 'auto',
        fontSettings: { sdf: true }, outlineWidth: 4, outlineColor: sat ? [11, 21, 32, 220] : [255, 255, 255, 230], billboard: true,
        // Labels always draw over the counties instead of fighting them for depth.
        parameters: { depthCompare: 'always', depthWriteEnabled: false },
        getTextAnchor: 'middle', getAlignmentBaseline: 'center', updateTriggers: { getPosition: `${selZ}|${lift}`, getColor: sat },
      }),
    ];
  }, [photoDate, cities, s.mode, s.metric, s.height, s.crop, s.day, s.hidden, s.states, s.reportedOnly, s.refs, s.county, style, rings, outlines, elevation, font, byFips, reduced]);

  /** The hover card's HTML for whatever is under the pointer, or null. */
  const tooltipHtml = ({ object, layer }: PickingInfo): string | null => {
    if (!object || !layer) return null;
    if (layer.id === 'us-states') {
      const f = object as Feature;
      if (STATE_BY_FIPS[String(f.id)]) return null;
      return `<b>${esc(String(f.properties?.name ?? ''))}</b><div class="dim">Not in the hackathon data. Agrigine covers California, Delaware, Iowa and Nebraska.</div>`;
    }
    if (layer.id === 'city-dots') {
      const city = object as City, home = byFips.get(city[2]);
      return `<b>${esc(city[0])}, ${STATES[city[1]]}</b><div>${num(city[5])} people (2024 estimate)</div><div class="dim">${home ? esc(home.n) + ' County · ' : ''}click to open the county</div>`;
    }
    if (layer.id !== 'counties') return null;
    const c = byFips.get((object as Ring).f);
    const st = c && style.byFips.get(c.f);
    if (!c || !st) return null;
    const m = metric(s.metric), h = height(s.height);
    const when = m.kind === 'daily' ? formatDay(s.day) : m.fixed ? 'Soil' : `${s.year} ${CROP_NAME[s.crop]} season`;
    let html = `<b>${esc(c.n)} County, ${c.s}</b><div class="dim">${when}</div>`;
    html += `<div style="margin-top:4px;display:flex;gap:6px;align-items:center"><i style="width:10px;height:10px;border-radius:2px;background:${st.color ?? '#F1EFE6'};box-shadow:inset 0 0 0 1px rgba(20,32,26,.25)"></i>${esc(m.name)}: <b>${esc(st.value != null ? m.format(st.value) : whyMissing(c, s.metric, s.crop, i))}</b></div>`;
    const hv = h.get?.(c, s.crop, i, t);
    if (hv != null) html += `<div>Height: ${esc(h.name)}, ${num(hv, hv % 1 && hv < 10 ? 1 : 0)}</div>`;
    html += '<div class="dim" style="margin-top:4px">Click for the full profile</div>';
    return html;
  };

  // Our own hover card, placed right beside the pointer and flipped to stay inside the map.
  const tipRef = useRef<HTMLDivElement>(null);
  const hideTip = () => { if (tipRef.current) tipRef.current.hidden = true; };
  const onHover = (info: PickingInfo) => {
    const el = tipRef.current;
    const html = el && tooltipHtml(info);
    if (!el || !html) return hideTip();
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    el.hidden = false;
    const box = el.parentElement!.getBoundingClientRect(), gap = 14;
    const x = info.x + gap + el.offsetWidth > box.width - 8 ? info.x - gap - el.offsetWidth : info.x + gap;
    const y = info.y + gap + el.offsetHeight > box.height - 8 ? info.y - gap - el.offsetHeight : info.y + gap;
    el.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  };

  const onClick = ({ object, layer }: PickingInfo) => {
    if (!object || !layer) return;
    if (layer.id === 'counties') selectCounty((object as Ring).f);
    else if (layer.id === 'city-dots') selectCity(object as City);
    else if (layer.id === 'us-states') {
      const f = object as Feature;
      const code = STATE_BY_FIPS[String(f.id)];
      if (code) selectState(code);
      else dispatch({ type: 'outside', name: String(f.properties?.name ?? 'This place') });
    }
  };

  if (failed) return <div className="map-fallback">This browser blocked WebGL, so the globe can&apos;t draw. Search still opens every profile.</div>;

  return (
    <div
      className="map"
      tabIndex={0}
      aria-label="Map. Drag to spin, right-drag to tilt and rotate, scroll to zoom. Arrow keys move, Shift and arrows rotate and tilt."
      onKeyDown={onKeyDown}
      onPointerDown={e => e.currentTarget.focus({ preventScroll: true })}
      onContextMenu={e => e.preventDefault()}
      onPointerLeave={hideTip}
    >
      <DeckGL
        views={s.mode === 'globe' ? views.globe : views.map}
        initialViewState={initialViewState}
        controller={CONTROLLER}
        effects={effects}
        layers={layers}
        onHover={onHover}
        onClick={onClick}
        onError={() => setFailed(true)}
        onViewStateChange={({ viewState }) => {
          const v = viewState as ViewSnapshot;
          hideTip();
          onView({ longitude: v.longitude, latitude: v.latitude, zoom: v.zoom, pitch: v.pitch ?? 0, bearing: v.bearing ?? 0 });
          const next = elevationFor(v.zoom);
          setElevation(prev => (Math.abs(next - prev) / prev > 0.06 ? next : prev));
          setZoom(prev => (Math.abs(prev - v.zoom) > 0.2 ? v.zoom : prev));
        }}
        getCursor={({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
      />
      <div ref={tipRef} className="maptip" hidden role="tooltip" />
    </div>
  );
}
