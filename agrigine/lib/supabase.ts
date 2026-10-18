// Sign-in and the account database (Supabase). The project URL and publishable key are public by design:
// row-level security in the database decides what each signed-in person can read and change.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

const SUPABASE_URL = 'https://bjmpplomtvwcisbnijox.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8I-9dg-BPs95RQNyL2vdUw_77AVfIur';

export interface AuthState {
  session: Session | null;
  /** False until the saved session has been read, so pages don't flash "Sign in" for signed-in people. */
  ready: boolean;
  /** True after arriving from a password-reset link, until a new password is set. */
  recovering: boolean;
}

const SIGNED_OUT: AuthState = { session: null, ready: false, recovering: false };
let state: AuthState = SIGNED_OUT;
let client: SupabaseClient | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<AuthState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };

/** The browser's one Supabase client, created on first use. */
export function supabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((event, session) => {
      set({ session, ready: true, recovering: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : state.recovering });
    });
  }
  return client;
}

const subscribe = (l: () => void) => {
  supabase();
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** The signed-in session, kept current as people sign in and out (in this tab or another). */
export const useAuth = () => useSyncExternalStore(subscribe, () => state, () => SIGNED_OUT);
export const finishRecovery = () => set({ recovering: false });
