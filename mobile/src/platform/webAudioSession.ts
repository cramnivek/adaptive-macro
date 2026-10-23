/** Alerts should mix with the listener's music instead of claiming exclusive playback. */
export const configureWebAudioSession = (): void => {
  if (typeof navigator === 'undefined') return;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'ambient') session.type = 'ambient';
  } catch {
    // Older browsers may expose a partial API; sound must remain optional there.
  }
};
