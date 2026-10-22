import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

/**
 * The app's sounds on a phone build.
 *
 * They were web-only: chime.ts plays them through browser audio elements and
 * returned early everywhere else, so the Android app had no rest chime and no
 * PR sting. The sounds are synthesised, not shipped as files (chimeSound.ts),
 * so each is written out once as a WAV in the cache and played from there.
 *
 * Mixed with whatever else is playing rather than pausing it: someone training
 * has music on, and a two-second sting should sit over it, not stop it.
 */

const players = new Map<string, AudioPlayer>();
let modeSet: Promise<void> | null = null;

const player = (key: string, wav: () => Uint8Array): AudioPlayer => {
  let existing = players.get(key);
  if (!existing) {
    const file = new File(Paths.cache, `ascend-sound-${key}.wav`);
    file.write(wav());
    existing = createAudioPlayer(file.uri);
    players.set(key, existing);
  }
  return existing;
};

/** Plays a sound, from the start; a sound that cannot play is silently nothing. */
export const playNativeSound = (key: string, wav: () => Uint8Array): void => {
  try {
    modeSet ??= setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      () => undefined,
    );
    const sound = player(key, wav);
    void sound.seekTo(0).then(() => sound.play()).catch(() => undefined);
  } catch {
    // A sound that cannot play is not worth an error.
  }
};
