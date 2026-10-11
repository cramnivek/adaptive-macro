import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { myProfile } from './api';
import { supabase } from './client';
import type { Profile } from './types';

/**
 * Who is signed in, and their profile, for the screens that care.
 *
 * `undefined` means "not known yet" for both, so a screen can show a spinner
 * rather than briefly claiming someone is signed out or has no username.
 */

interface SocialState {
  configured: boolean;
  session: Session | null | undefined;
  profile: Profile | null | undefined;
  refreshProfile: () => Promise<Profile | null>;
}

const SocialContext = createContext<SocialState | null>(null);

export const SocialProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null | undefined>(supabase === null ? null : undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  const refreshProfile = useCallback(async () => {
    const next = await myProfile();
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    if (supabase === null) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Nothing else is called from inside this callback: supabase-js holds a
    // lock while it runs, and a call back into it from here can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  // Keyed on the user, not the session object, which a token refresh replaces.
  const known = session !== undefined;
  useEffect(() => {
    if (userId === null) {
      setProfile(known ? null : undefined);
      return;
    }
    setProfile(undefined);
    // A failed load leaves the profile unknown, not missing: offline is not
    // the same as never having chosen a username.
    refreshProfile().catch(() => setProfile(undefined));
  }, [userId, known, refreshProfile]);

  return (
    <SocialContext.Provider value={{ configured: supabase !== null, session, profile, refreshProfile }}>
      {children}
    </SocialContext.Provider>
  );
};

export const useSocial = (): SocialState => {
  const state = useContext(SocialContext);
  if (state === null) throw new Error('useSocial is used outside SocialProvider.');
  return state;
};
