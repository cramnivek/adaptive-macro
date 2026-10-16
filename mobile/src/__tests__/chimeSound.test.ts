import { describe, expect, it } from 'vitest';
import { chimeSamples, chimeWav } from '../platform/chimeSound';

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
