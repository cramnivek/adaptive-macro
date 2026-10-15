import { Platform } from 'react-native';
import { type ChimeChoice, chimeWav } from './chimeSound';

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

const audioCache = new Map<ChimeChoice, HTMLAudioElement>();
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

/** Synthesizes alert sound via Web Audio when HTMLAudioElement cannot play. */
const playWebAudioFallback = (choice: ChimeChoice): void => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const t = ctx.currentTime;

    if (choice === 'bell') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.7);
    } else if (choice === 'rising') {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((hz, idx) => {
        const noteT = t + idx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(hz, noteT);
        gain.gain.setValueAtTime(0.001, noteT);
        gain.gain.exponentialRampToValueAtTime(0.28, noteT + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, noteT + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteT);
        osc.stop(noteT + 0.4);
      });
    } else if (choice === 'gong') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(261.63, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.9);
    } else if (choice === 'chime') {
      const notes = [
        { hz: 659.25, start: 0, dur: 0.35 },
        { hz: 987.77, start: 0.18, dur: 0.5 },
      ];
      notes.forEach((note) => {
        const noteT = t + note.start;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(note.hz, noteT);
        gain.gain.setValueAtTime(0.001, noteT);
        gain.gain.exponentialRampToValueAtTime(0.3, noteT + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, noteT + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteT);
        osc.stop(noteT + note.dur);
      });
    } else {
      // 'beeps'
      const beepsHz = [1046.5, 1046.5, 1046.5, 1046.5, 1318.5];
      const beepsSec = [0.09, 0.09, 0.09, 0.09, 0.14];
      const gapSec = 0.06;
      let curr = t;

      for (let i = 0; i < beepsHz.length; i += 1) {
        const hz = beepsHz[i];
        const dur = beepsSec[i];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(hz, curr);
        gain.gain.setValueAtTime(0.001, curr);
        gain.gain.exponentialRampToValueAtTime(0.25, curr + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, curr + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(curr);
        osc.stop(curr + dur);
        curr += dur + gapSec;
      }
    }
  } catch {
    // Ignore audio errors silently
  }
};

const audio = (choice: ChimeChoice): HTMLAudioElement | null => {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return null;
  let element = audioCache.get(choice);
  if (!element) {
    try {
      const url = URL.createObjectURL(new Blob([chimeWav(choice).buffer as ArrayBuffer], { type: 'audio/wav' }));
      element = new Audio(url);
      element.preload = 'auto';
      audioCache.set(choice, element);
    } catch {
      return null;
    }
  }
  return element;
};

/** Call from a tap. Plays the chime silently so the browser will allow it later. */
export const primeChime = (choice: ChimeChoice = 'chime'): void => {
  const a = audio(choice);
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
export const playChime = (choice: ChimeChoice = 'chime'): void => {
  const a = audio(choice);
  if (a !== null) {
    a.muted = false;
    a.currentTime = 0;
    const playPromise = a.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        playWebAudioFallback(choice);
      });
      return;
    }
  }
  playWebAudioFallback(choice);
};
