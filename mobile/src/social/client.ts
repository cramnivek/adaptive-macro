import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { withTimeout } from './timeoutFetch';

/**
 * The connection to Supabase, or null in a build without its address and key.
 *
 * The key is the publishable one, made to ship inside apps; row-level security
 * in the database is what keeps one person's posts from another, not the key.
 * Null rather than a throw, so a build without social keeps every other feature.
 */

/** Long enough for a slow phone network, short enough that a hung post lets the sheet close. */
const REQUEST_TIMEOUT_MS = 20_000;

const isTest = process.env.NODE_ENV === 'test';
const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  (!isTest ? 'https://eigtmrtavtpzzjzfcskc.supabase.co' : undefined);
const key =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  (!isTest ? 'sb_publishable_xarT6wsIQODZNugSUcneuw_0dP9GghP' : undefined);

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          // The web build keeps the session in localStorage, supabase-js's default.
          ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
        global: { fetch: withTimeout((input, init) => fetch(input, init), REQUEST_TIMEOUT_MS) },
      })
    : null;

// A backgrounded app's timers do not run, so a native build refreshes its
// token only while in front — Supabase's own advice for React Native.
if (supabase !== null && Platform.OS !== 'web' && typeof AppState?.addEventListener === 'function') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
