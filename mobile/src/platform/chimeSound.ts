/**
 * The rest-is-up chime, as a WAV file made in code.
 *
 * Two rising notes, 120 ms each, faded in and out so neither clicks. Built
 * rather than bundled: there is no asset to ship or license, and a sound this
 * simple is a few lines of arithmetic. Kept apart from the player so it can be
 * tested under node.
 */

const SAMPLE_RATE = 22050;
const NOTES_HZ = [880, 1320];
const NOTE_SECONDS = 0.12;
const GAP_SECONDS = 0.04;
const FADE_SECONDS = 0.012;

/** 16-bit mono PCM samples for the two notes and the gap between them. */
export const chimeSamples = (): Int16Array => {
  const noteLength = Math.round(NOTE_SECONDS * SAMPLE_RATE);
  const gapLength = Math.round(GAP_SECONDS * SAMPLE_RATE);
  const fade = Math.round(FADE_SECONDS * SAMPLE_RATE);
  const samples = new Int16Array(NOTES_HZ.length * noteLength + gapLength);

  NOTES_HZ.forEach((hz, note) => {
    const offset = note * (noteLength + gapLength);
    for (let i = 0; i < noteLength; i += 1) {
      const envelope = Math.min(1, i / fade, (noteLength - 1 - i) / fade);
      const value = Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE) * envelope * 0.6;
      samples[offset + i] = Math.round(value * 32767);
    }
  });
  return samples;
};

/** The samples wrapped in a WAV header: a file any audio element can play. */
export const chimeWav = (): Uint8Array => {
  const samples = chimeSamples();
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
