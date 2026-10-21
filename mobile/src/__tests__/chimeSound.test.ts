import { describe, expect, it } from 'vitest';
import { chimeSamples, chimeWav, finishSamples, prStingSamples, tickSamples, wavFromSamples } from '../platform/chimeSound';

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.slice(at, at + length));

describe('chimeWav', () => {
  it('is a valid 16-bit mono PCM WAV file', () => {
    const wav = chimeWav();
    const view = new DataView(wav.buffer);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(view.getUint32(40, true)).toBe(wav.length - 44);
  });

  it('lasts under one second, repeating 5 beeper pulses so the alert is unmistakable', () => {
    const seconds = chimeSamples().length / 22050;
    expect(seconds).toBeGreaterThan(0.6);
    expect(seconds).toBeLessThan(0.9);
  });

  it('starts and ends each note in silence, so it does not click', () => {
    const samples = chimeSamples();
    expect(samples[0]).toBe(0);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(200);
  });

  it('stays well under full scale', () => {
    const peak = chimeSamples().reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    expect(peak).toBeGreaterThan(15000);
    expect(peak).toBeLessThan(21000);
  });

  it('generates valid, click-free audio for all chime choices', () => {
    const choices = ['chime', 'bell', 'rising', 'gong', 'beeps'] as const;
    for (const choice of choices) {
      const samples = chimeSamples(choice);
      const wav = chimeWav(choice);
      const view = new DataView(wav.buffer);

      expect(ascii(wav, 0, 4)).toBe('RIFF');
      expect(ascii(wav, 8, 4)).toBe('WAVE');
      expect(view.getUint16(20, true)).toBe(1);
      expect(view.getUint16(22, true)).toBe(1);
      expect(samples[0]).toBe(0);
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(200);

      const duration = samples.length / 22050;
      expect(duration).toBeGreaterThan(0.5);
      expect(duration).toBeLessThan(2.5);

      const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
      expect(peak).toBeGreaterThan(10000);
      expect(peak).toBeLessThan(32000);
    }
  });
});

describe('prStingSamples', () => {
  it('is short, starts silent, ends without a click, and never clips', () => {
    const samples = prStingSamples();
    const seconds = samples.length / 22050;
    expect(seconds).toBeGreaterThan(0.9);
    expect(seconds).toBeLessThan(1.3);
    expect(samples[0]).toBe(0);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(200);
    const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    expect(peak).toBeGreaterThan(10000);
    expect(peak).toBeLessThan(32767);
    expect(ascii(wavFromSamples(samples), 0, 4)).toBe('RIFF');
  });
});

describe('the set tick and the finish chord', () => {
  const shape = (samples: Int16Array) => ({
    seconds: samples.length / 22050,
    first: samples[0],
    last: Math.abs(samples[samples.length - 1]),
    peak: samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0),
  });

  it('keeps the tick short and quieter than the PR sting, since it is heard most', () => {
    const tick = shape(tickSamples());
    expect(tick.seconds).toBeLessThan(0.1);
    expect(tick.first).toBe(0);
    expect(tick.last).toBeLessThan(200);
    expect(tick.peak).toBeLessThan(shape(prStingSamples()).peak);
    expect(tick.peak).toBeGreaterThan(3000);
  });

  it('lets the finish chord ring without clipping or clicking', () => {
    const finish = shape(finishSamples());
    expect(finish.seconds).toBeGreaterThan(1);
    expect(finish.seconds).toBeLessThan(1.5);
    expect(finish.first).toBe(0);
    expect(finish.last).toBeLessThan(200);
    expect(finish.peak).toBeLessThan(32767);
  });
});
