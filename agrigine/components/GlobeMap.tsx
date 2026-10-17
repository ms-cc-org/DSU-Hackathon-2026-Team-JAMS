'use client';
import { AmbientLight, COORDINATE_SYSTEM, FlyToInterpolator, LightingEffect, MapView, _CameraLight as CameraLight, _GlobeView as GlobeView, type Color, type PickingInfo } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, GeoJsonLayer, PathLayer, PolygonLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import type { Feature } from 'geojson';
import { useMemo, useState } from 'react';
import { MAP, rgb } from '@/lib/colors';
import type { MapStyle, Ring } from '@/lib/compute';
import { CROP_NAME, STATES, STATE_BY_FIPS, STATE_CODES, STATE_VIEW } from '@/lib/constants';
import type { Outlines } from '@/lib/data';
import { num } from '@/lib/format';
import { formatDay } from '@/lib/daily';
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
export const IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const IMAGERY_CREDIT = 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const MATERIAL = { ambient: 0.62, diffuse: 0.5, shininess: 10, specularColor: [30, 30, 30] as [number, number, number] };
const CONTROLLER = { scrollZoom: { speed: 0.01, smooth: true }, dragRotate: true, touchRotate: true, doubleClickZoom: true, inertia: true };
const TOOLTIP_STYLE = {
  background: '#FFFFFF', color: '#14201A', borderRadius: '10px', padding: '8px 10px',
  boxShadow: '0 2px 12px rgba(11,21,32,.3)', fontFamily: 'inherit', fontSize: '12px', maxWidth: '260px',
};
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
}

export default function GlobeMap({ style, rings, outlines, camera, reduced, onView }: Props) {
  const { s, i, t, byFips, dispatch, selectCounty, selectState } = useExplorer();
  const [failed, setFailed] = useState(false);
  const [elevation, setElevation] = useState(() => elevationFor(camera.zoom));
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
      sat && new TileLayer<ImageBitmap>({
        id: 'imagery', data: IMAGERY_URL, minZoom: 0, maxZoom: 17, tileSize: 256, maxRequests: 12,
        renderSubLayers: props => {
          const [[west, south], [east, north]] = props.tile.boundingBox;
          // Tiles are Web Mercator images; this lets the globe bend them correctly.
          return new BitmapLayer({ id: props.id, image: props.data, bounds: [west, south, east, north], _imageCoordinateSystem: COORDINATE_SYSTEM.CARTESIAN });
        },
      }),
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
      labels.length > 0 && new TextLayer<Label>({
        id: 'labels', data: labels, getPosition: d => d.position as [number, number, number], getText: d => d.text, getSize: d => d.size, sizeUnits: 'pixels',
        getColor: sat ? [255, 255, 255, 245] : withAlpha(MAP.ink, 235), fontFamily: font, fontWeight: 700, characterSet: 'auto',
        fontSettings: { sdf: true }, outlineWidth: 4, outlineColor: sat ? [11, 21, 32, 220] : [255, 255, 255, 230], billboard: true,
        // Labels always draw over the counties instead of fighting them for depth.
        parameters: { depthCompare: 'always', depthWriteEnabled: false },
        getTextAnchor: 'middle', getAlignmentBaseline: 'center', updateTriggers: { getPosition: `${selZ}|${lift}`, getColor: sat },
      }),
    ];
  }, [s.mode, s.metric, s.height, s.crop, s.day, s.hidden, s.states, s.reportedOnly, s.refs, s.county, style, rings, outlines, elevation, font, byFips, reduced]);

  const getTooltip = ({ object, layer }: PickingInfo) => {
    if (!object || !layer) return null;
    if (layer.id === 'us-states') {
      const f = object as Feature;
      if (STATE_BY_FIPS[String(f.id)]) return null;
      return {
        html: `<b style="font-size:13px">${esc(String(f.properties?.name ?? ''))}</b><div style="color:#66716A">Not in the hackathon data. Agrigine covers California, Delaware, Iowa and Nebraska.</div>`,
        style: TOOLTIP_STYLE,
      };
    }
    if (layer.id !== 'counties') return null;
    const c = byFips.get((object as Ring).f);
    const st = c && style.byFips.get(c.f);
    if (!c || !st) return null;
    const m = metric(s.metric), h = height(s.height);
    const when = m.kind === 'daily' ? formatDay(s.day) : m.fixed ? 'Soil' : `${s.year} ${CROP_NAME[s.crop]} season`;
    let html = `<b style="font-size:13px">${esc(c.n)} County, ${c.s}</b><div style="color:#66716A">${when}</div>`;
    html += `<div style="margin-top:4px;display:flex;gap:6px;align-items:center"><i style="width:10px;height:10px;border-radius:2px;background:${st.color ?? '#F1EFE6'};box-shadow:inset 0 0 0 1px rgba(20,32,26,.25)"></i>${esc(m.name)}: <b>${esc(st.value != null ? m.format(st.value) : whyMissing(c, s.metric, s.crop, i))}</b></div>`;
    const hv = h.get?.(c, s.crop, i, t);
    if (hv != null) html += `<div>Height: ${esc(h.name)}, ${num(hv, hv % 1 && hv < 10 ? 1 : 0)}</div>`;
    html += '<div style="color:#66716A;margin-top:4px">Click for the full profile</div>';
    return { html, style: TOOLTIP_STYLE };
  };

  const onClick = ({ object, layer }: PickingInfo) => {
    if (!object || !layer) return;
    if (layer.id === 'counties') selectCounty((object as Ring).f);
    else if (layer.id === 'us-states') {
      const f = object as Feature;
      const code = STATE_BY_FIPS[String(f.id)];
      if (code) selectState(code);
      else dispatch({ type: 'outside', name: String(f.properties?.name ?? 'This place') });
    }
  };

  if (failed) return <div className="map-fallback">This browser blocked WebGL, so the globe can&apos;t draw. Search still opens every profile.</div>;

  return (
    <div className="map">
      <DeckGL
        views={s.mode === 'globe' ? views.globe : views.map}
        initialViewState={initialViewState}
        controller={CONTROLLER}
        effects={effects}
        layers={layers}
        getTooltip={getTooltip}
        onClick={onClick}
        onError={() => setFailed(true)}
        onViewStateChange={({ viewState }) => {
          const v = viewState as ViewSnapshot;
          onView({ longitude: v.longitude, latitude: v.latitude, zoom: v.zoom, pitch: v.pitch ?? 0, bearing: v.bearing ?? 0 });
          const next = elevationFor(v.zoom);
          setElevation(prev => (Math.abs(next - prev) / prev > 0.06 ? next : prev));
        }}
        getCursor={({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
      />
    </div>
  );
}
