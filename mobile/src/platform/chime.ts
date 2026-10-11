import { Platform } from 'react-native';
import { chimeWav } from './chimeSound';

/**
 * The rest-is-up chime, on the web build.
 *
 * Browsers, iOS Safari above all, refuse to play sound that no tap asked for.
 * So the chime is primed on a tap — ticking a set, which is what starts the
 * rest — by playing it silently once, and from then on that same element may
 * play when the rest ends, with no tap in sight. An element, not Web Audio:
 * iOS mutes Web Audio with the ring/silent switch, and a chime that a switch
 * nobody remembers flipping turns off is the bug this is meant to fix.
 *
 * Native builds have real haptics and no use for this yet; it does nothing
 * there.
 */

let element: HTMLAudioElement | null = null;

const audio = (): HTMLAudioElement | null => {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return null;
  if (element === null) {
    const url = URL.createObjectURL(new Blob([chimeWav().buffer as ArrayBuffer], { type: 'audio/wav' }));
    element = new Audio(url);
    element.preload = 'auto';
  }
  return element;
};

/** Call from a tap. Plays the chime silently so the browser will allow it later. */
export const primeChime = (): void => {
  const a = audio();
  if (a === null) return;
  a.muted = true;
  void a
    .play()
    .then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    })
    .catch(() => {
      a.muted = false;
    });
};

/** Plays the chime, if a tap has primed it. Quietly nothing if the browser still says no. */
export const playChime = (): void => {
  const a = audio();
  if (a === null) return;
  a.muted = false;
  a.currentTime = 0;
  void a.play().catch(() => undefined);
};
