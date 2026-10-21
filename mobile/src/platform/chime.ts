import { Platform } from 'react-native';
import { chimeWav, finishSamples, prStingSamples, tickSamples, wavFromSamples } from './chimeSound';
import type { ChimeChoice } from './chimeSound';

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
let currentPlaying: HTMLAudioElement | null = null;
let primingToken = 0;
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
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.4);
    } else if (choice === 'rising') {
      const notes = [
        { hz: 523.25, start: 0, dur: 1.3 },
        { hz: 659.25, start: 0.12, dur: 1.18 },
        { hz: 783.99, start: 0.24, dur: 1.06 },
      ];
      notes.forEach((note) => {
        const noteT = t + note.start;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(note.hz, noteT);
        gain.gain.setValueAtTime(0.001, noteT);
        gain.gain.exponentialRampToValueAtTime(0.28, noteT + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, noteT + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteT);
        osc.stop(noteT + note.dur);
      });
    } else if (choice === 'gong') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(261.63, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.9);
    } else if (choice === 'chime') {
      const notes = [
        { hz: 659.25, start: 0, dur: 0.35 },
        { hz: 987.77, start: 0.18, dur: 1.07 },
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
    const token = ++primingToken;
    a.muted = true;
    void a
      .play()
      .then(() => {
        // If a real play request came in while priming, do not pause!
        if (primingToken === token) {
          a.pause();
          a.currentTime = 0;
        }
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
  // Invalidate any in-flight prime pause callback
  primingToken++;

  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }

  const a = audio(choice);
  if (a !== null) {
    if (currentPlaying && currentPlaying !== a) {
      try {
        currentPlaying.pause();
        currentPlaying.currentTime = 0;
      } catch {
        // Ignore
      }
    }
    currentPlaying = a;
    a.muted = false;
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      // Ignore
    }
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

/**
 * Short sounds for moments rather than alarms: so far, the new-PR sting.
 *
 * The same element-not-Web-Audio rule as the chime, for the same reason (the
 * iOS silent switch mutes Web Audio), and the same priming: the sting plays
 * a moment after the Finish tap, once the session is saved, so it is primed
 * on that tap.
 */
/** The sounds behind the "Sounds for big moments" switch, beside the rest chimes. */
export type SoundEffect = 'pr' | 'tick' | 'finish';

const EFFECT_SAMPLES: Record<SoundEffect, () => Int16Array> = {
  pr: prStingSamples,
  tick: tickSamples,
  finish: finishSamples,
};

const effects = new Map<SoundEffect, HTMLAudioElement>();
/**
 * Effects asked to play since they were last primed. Priming plays muted and
 * pauses once that play has started, and a set written quickly can ask for the
 * sting before then; without this the late pause cut the sting off.
 */
const wanted = new Set<SoundEffect>();

const effectAudio = (effect: SoundEffect): HTMLAudioElement | null => {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return null;
  let element = effects.get(effect);
  if (!element) {
    try {
      const samples = EFFECT_SAMPLES[effect]();
      const url = URL.createObjectURL(new Blob([wavFromSamples(samples).buffer as ArrayBuffer], { type: 'audio/wav' }));
      element = new Audio(url);
      element.preload = 'auto';
      effects.set(effect, element);
    } catch {
      return null;
    }
  }
  return element;
};

/** Call from a tap, so the effect may play shortly after it. */
export const primeEffect = (effect: SoundEffect): void => {
  const a = effectAudio(effect);
  if (a === null) return;
  wanted.delete(effect);
  a.muted = true;
  void a
    .play()
    .then(() => {
      if (wanted.has(effect)) return;
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    })
    .catch(() => {
      a.muted = false;
    });
};

/** Plays the effect if the browser allows it; silently nothing if not. */
export const playEffect = (effect: SoundEffect): void => {
  const a = effectAudio(effect);
  if (a === null) return;
  try {
    wanted.add(effect);
    a.muted = false;
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    // A sound that cannot play is not worth an error.
  }
};
