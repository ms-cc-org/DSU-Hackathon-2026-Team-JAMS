'use client';
import { createContext, useContext, useSyncExternalStore, type Dispatch } from 'react';
import type { Action, ExplorerState } from '@/lib/state';
import type { DayContext } from '@/lib/daily';
import type { Bundle, County, StateCode } from '@/lib/types';

export interface ExplorerApi {
  bundle: Bundle;
  byFips: Map<string, County>;
  s: ExplorerState;
  /** Index of the selected season in every 26-value series. */
  i: number;
  /** The selected date, for day-by-day values. */
  t: DayContext;
  dispatch: Dispatch<Action>;
  selectCounty: (fips: string) => void;
  selectState: (code: StateCode) => void;
  zoomToCounty: () => void;
}

export const ExplorerContext = createContext<ExplorerApi | null>(null);

export function useExplorer(): ExplorerApi {
  const api = useContext(ExplorerContext);
  if (!api) throw new Error('useExplorer must be used inside the explorer');
  return api;
}

function useMedia(query: string) {
  return useSyncExternalStore(
    notify => {
      const m = window.matchMedia(query);
      m.addEventListener('change', notify);
      return () => m.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const NARROW_QUERY = '(max-width: 960px)';
export const useNarrow = () => useMedia(NARROW_QUERY);
export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');
