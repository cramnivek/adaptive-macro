import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * The connection to Supabase, or null in a build without its address and key.
 *
 * The key is the publishable one, made to ship inside apps; row-level security
 * in the database is what keeps one person's posts from another, not the key.
 * Null rather than a throw, so a build without social keeps every other feature.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
      })
    : null;

// A backgrounded app's timers do not run, so a native build refreshes its
// token only while in front — Supabase's own advice for React Native.
if (supabase !== null && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
