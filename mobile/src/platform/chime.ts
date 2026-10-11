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
let audioCtx: any = null;

const getAudioContext = (): any => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  return audioCtx;
};

/** Synthesizes the 5-beep alert sequence via Web Audio when HTMLAudioElement cannot play. */
const playWebAudioFallback = (): void => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const beepsHz = [1046.5, 1046.5, 1046.5, 1046.5, 1318.5];
    const beepsSec = [0.09, 0.09, 0.09, 0.09, 0.14];
    const gapSec = 0.06;
    let t = ctx.currentTime;

    for (let i = 0; i < beepsHz.length; i += 1) {
      const hz = beepsHz[i];
      const dur = beepsSec[i];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(hz, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur + gapSec;
    }
  } catch {
    // Ignore audio errors silently
  }
};

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
  if (a !== null) {
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
  }
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
};

/** Plays the chime, if a tap has primed it. Quietly nothing if the browser still says no. */
export const playChime = (): void => {
  const a = audio();
  if (a !== null) {
    a.muted = false;
    a.currentTime = 0;
    const playPromise = a.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        playWebAudioFallback();
      });
      return;
    }
  }
  playWebAudioFallback();
};
