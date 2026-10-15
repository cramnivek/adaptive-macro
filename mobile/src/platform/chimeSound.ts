/**
 * The rest-is-up chime, as WAV audio made in code.
 *
 * Built rather than bundled: there is no asset to ship or license, and a sound
 * this simple is a few lines of arithmetic. Kept apart from the player so it can
 * be tested under node.
 */

export type ChimeChoice = 'chime' | 'bell' | 'rising' | 'gong' | 'beeps';

export interface ChimeOption {
  id: ChimeChoice;
  name: string;
  description: string;
  tag: string;
}

export const CHIME_OPTIONS: ChimeOption[] = [
  {
    id: 'chime',
    name: 'DOUBLE CHIME',
    description: 'Bright, melodic ascending bells (E5 → B5)',
    tag: 'RECOMMENDED',
  },
  {
    id: 'bell',
    name: 'BOXING BELL',
    description: 'Crisp metallic gym round bell with harmonic ring',
    tag: 'PUNCHY',
  },
  {
    id: 'rising',
    name: 'ASCENDING TRIAD',
    description: 'Three uplifting harmonic tones (C5 → E5 → G5)',
    tag: 'UPLIFTING',
  },
  {
    id: 'gong',
    name: 'DEEP GONG',
    description: 'Warm, low resonant singing bowl tone',
    tag: 'CALM',
  },
  {
    id: 'beeps',
    name: 'DIGITAL TIMER',
    description: 'Classic 5-pulse digital watch beeper',
    tag: 'RETRO',
  },
];

const SAMPLE_RATE = 22050;

/** 16-bit mono PCM samples for the classic 5-beep alert sequence. */
const createBeepsSamples = (): Int16Array => {
  const BEEP_HZ = [1046.5, 1046.5, 1046.5, 1046.5, 1318.5];
  const BEEP_SECONDS = [0.09, 0.09, 0.09, 0.09, 0.14];
  const GAP_SECONDS = 0.06;
  const FADE_SECONDS = 0.01;

  const beeps = BEEP_HZ.map((hz, i) => ({
    hz,
    length: Math.round(BEEP_SECONDS[i] * SAMPLE_RATE),
    gap: i < BEEP_HZ.length - 1 ? Math.round(GAP_SECONDS * SAMPLE_RATE) : 0,
  }));

  const totalSamples = beeps.reduce((sum, b) => sum + b.length + b.gap, 0);
  const samples = new Int16Array(totalSamples);
  const fade = Math.round(FADE_SECONDS * SAMPLE_RATE);

  let offset = 0;
  for (const beep of beeps) {
    for (let i = 0; i < beep.length; i += 1) {
      const envelope = Math.min(1, i / fade, (beep.length - 1 - i) / fade);
      const value = Math.sin((2 * Math.PI * beep.hz * i) / SAMPLE_RATE) * envelope * 0.6;
      samples[offset + i] = Math.round(value * 32767);
    }
    offset += beep.length + beep.gap;
  }
  return samples;
};

/** Two warm, musical chime notes (E5 and B5). */
const createChimeSamples = (): Int16Array => {
  const totalSamples = Math.round(0.72 * SAMPLE_RATE);
  const samples = new Int16Array(totalSamples);
  const note1Samples = Math.round(0.24 * SAMPLE_RATE);
  const note2Start = Math.round(0.18 * SAMPLE_RATE);

  for (let i = 0; i < totalSamples; i += 1) {
    let val = 0;
    // Note 1: E5
    if (i < note1Samples) {
      const t = i / SAMPLE_RATE;
      const env = Math.min(1, i / (0.01 * SAMPLE_RATE)) * Math.exp(-9 * t);
      val += (Math.sin(2 * Math.PI * 659.25 * t) + 0.25 * Math.sin(2 * Math.PI * 1318.5 * t)) * env * 0.5;
    }
    // Note 2: B5
    if (i >= note2Start) {
      const t = (i - note2Start) / SAMPLE_RATE;
      const env = Math.min(1, (i - note2Start) / (0.01 * SAMPLE_RATE)) * Math.exp(-5.5 * t);
      val += (Math.sin(2 * Math.PI * 987.77 * t) + 0.22 * Math.sin(2 * Math.PI * 1975.54 * t)) * env * 0.55;
    }
    const endFade = i > totalSamples - 100 ? (totalSamples - 1 - i) / 100 : 1;
    samples[i] = Math.round(Math.max(-1, Math.min(1, val * endFade)) * 32767);
  }
  return samples;
};

/** Single metallic boxing/gym round bell strike. */
const createBellSamples = (): Int16Array => {
  const totalSamples = Math.round(0.75 * SAMPLE_RATE);
  const samples = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, i / (0.005 * SAMPLE_RATE));
    const decay = Math.exp(-4.8 * t);
    const env = attack * decay;
    const val =
      (Math.sin(2 * Math.PI * 880 * t) * 0.45 +
        Math.sin(2 * Math.PI * 1760 * t) * 0.25 +
        Math.sin(2 * Math.PI * 2640 * t) * 0.15 +
        Math.sin(2 * Math.PI * 587.33 * t) * 0.15) *
      env;
    const endFade = i > totalSamples - 100 ? (totalSamples - 1 - i) / 100 : 1;
    samples[i] = Math.round(Math.max(-1, Math.min(1, val * endFade)) * 32767);
  }
  return samples;
};

/** Ascending 3-tone triad: C5 (523Hz), E5 (659Hz), G5 (784Hz). */
const createRisingSamples = (): Int16Array => {
  const totalSamples = Math.round(0.75 * SAMPLE_RATE);
  const samples = new Int16Array(totalSamples);
  const notes = [
    { hz: 523.25, start: 0 },
    { hz: 659.25, start: Math.round(0.12 * SAMPLE_RATE) },
    { hz: 783.99, start: Math.round(0.24 * SAMPLE_RATE) },
  ];
  for (let i = 0; i < totalSamples; i += 1) {
    let val = 0;
    for (const note of notes) {
      if (i >= note.start) {
        const t = (i - note.start) / SAMPLE_RATE;
        const attack = Math.min(1, (i - note.start) / (0.008 * SAMPLE_RATE));
        const decay = Math.exp(-6 * t);
        val +=
          (Math.sin(2 * Math.PI * note.hz * t) + 0.18 * Math.sin(2 * Math.PI * note.hz * 2 * t)) *
          attack *
          decay *
          0.48;
      }
    }
    const endFade = i > totalSamples - 100 ? (totalSamples - 1 - i) / 100 : 1;
    samples[i] = Math.round(Math.max(-1, Math.min(1, val * endFade)) * 32767);
  }
  return samples;
};

/** Warm, deep singing bowl / meditation gong. */
const createGongSamples = (): Int16Array => {
  const totalSamples = Math.round(0.95 * SAMPLE_RATE);
  const samples = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, i / (0.03 * SAMPLE_RATE));
    const decay = Math.exp(-2.8 * t);
    const env = attack * decay;
    const val =
      (Math.sin(2 * Math.PI * 261.63 * t) * 0.5 +
        Math.sin(2 * Math.PI * 392.0 * t) * 0.28 +
        Math.sin(2 * Math.PI * 523.25 * t) * 0.15 +
        Math.sin(2 * Math.PI * 65.41 * t) * 0.07) *
      env;
    const endFade = i > totalSamples - 100 ? (totalSamples - 1 - i) / 100 : 1;
    samples[i] = Math.round(Math.max(-1, Math.min(1, val * endFade)) * 32767);
  }
  return samples;
};

/**
 * 16-bit mono PCM samples for the requested chime choice.
 * Defaults to 'beeps' when called without arguments to preserve tests.
 */
export const chimeSamples = (choice: ChimeChoice = 'beeps'): Int16Array => {
  switch (choice) {
    case 'chime':
      return createChimeSamples();
    case 'bell':
      return createBellSamples();
    case 'rising':
      return createRisingSamples();
    case 'gong':
      return createGongSamples();
    case 'beeps':
    default:
      return createBeepsSamples();
  }
};

/** The samples wrapped in a WAV header: a file any audio element can play. */
export const chimeWav = (choice: ChimeChoice = 'beeps'): Uint8Array => {
  const samples = chimeSamples(choice);
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(at + i, value.charCodeAt(i));
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return new Uint8Array(buffer);
};
