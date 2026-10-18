'use client';
// The signed-in farmer's farms and saved farm models, shared by Explore, Report and Predict. Loaded once per
// sign-in and refreshed whenever Predict changes them.
import { useEffect, useSyncExternalStore } from 'react';
import { listAllFarmModels, listFarms, type Farm, type SavedFarmModel } from './account';
import { MODEL_INFO, type ModelKind } from './farmmodel';
import { useAuth } from './supabase';

export interface MyFarms { uid: string; farms: Farm[]; models: SavedFarmModel[] }

let state: MyFarms | null = null;
let loading: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export async function refreshMyFarms(uid: string) {
  loading = uid;
  try {
    const [farms, models] = await Promise.all([listFarms(), listAllFarmModels()]);
    state = { uid, farms, models };
    emit();
  } finally {
    loading = null;
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The farmer's farms and models, or null when signed out or still loading. */
export function useMyFarms(): MyFarms | null {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const snap = useSyncExternalStore(subscribe, () => state, () => null);
  useEffect(() => {
    if (uid && state?.uid !== uid && loading !== uid) refreshMyFarms(uid).catch(() => undefined);
  }, [uid]);
  return uid && snap?.uid === uid ? snap : null;
}

/** The last loaded farms, for code outside components (report CSV rows). */
export const cachedFarms = () => state;

export const modelName = (kind: string) => MODEL_INFO[kind as ModelKind]?.name ?? kind;
