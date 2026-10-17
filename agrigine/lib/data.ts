'use client';
// Loads the static data the explorer needs. There is no backend: the county bundle is a file in public/data
// and the outlines come from the world-atlas and us-atlas packages.
import type { FeatureCollection, MultiLineString } from 'geojson';
import { useEffect, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Bundle } from './types';

export interface Outlines {
  land: FeatureCollection;
  worldLines: MultiLineString;
  usStates: FeatureCollection;
  stateLines: MultiLineString;
}

type World = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
type Usa = Topology<{ states: GeometryCollection<{ name: string }>; nation: GeometryCollection }>;

export const DATA_URL = '/data/agrigine.json';

async function loadBundle(): Promise<Bundle> {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`${DATA_URL} returned ${res.status}`);
  return res.json();
}

async function loadOutlines(): Promise<Outlines> {
  const [w, u] = await Promise.all([import('world-atlas/countries-110m.json'), import('us-atlas/states-10m.json')]);
  const world = w.default as unknown as World;
  const usa = u.default as unknown as Usa;
  return {
    land: feature(world, world.objects.land) as unknown as FeatureCollection,
    worldLines: mesh(world, world.objects.countries),
    usStates: feature(usa, usa.objects.states) as unknown as FeatureCollection,
    stateLines: mesh(usa, usa.objects.states, (a, b) => a !== b),
  };
}

export function useAgData() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadBundle().then(b => live && setBundle(b), e => live && setError(String(e.message || e)));
    // Outlines are optional: without them the counties still draw.
    loadOutlines().then(o => live && setOutlines(o), () => undefined);
    return () => {
      live = false;
    };
  }, []);
  return { bundle, outlines, error };
}
