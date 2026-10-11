import { describe, expect, it } from 'vitest';
import {
  detectCardio,
  detectCardioMode,
  displayDistance,
  displaySpeed,
  durationToInputMinutes,
  formatCardioEffort,
  formatDurationDisplay,
  parseDistance,
  parseDurationSeconds,
  parseIncline,
  parseSpeed,
} from '../cardio';

describe('detectCardio', () => {
  it('detects common cardiovascular activities', () => {
    expect(detectCardio('Walking')).toBe(true);
    expect(detectCardio('walking')).toBe(true);
    expect(detectCardio('Morning Walk')).toBe(true);
    expect(detectCardio('Power Walk')).toBe(true);
    expect(detectCardio('Jogging')).toBe(true);
    expect(detectCardio('jog')).toBe(true);
    expect(detectCardio('Running')).toBe(true);
    expect(detectCardio('Treadmill Run')).toBe(true);
    expect(detectCardio('5k Run')).toBe(true);
    expect(detectCardio('Sprinting')).toBe(true);
    expect(detectCardio('Biking')).toBe(true);
    expect(detectCardio('Cycling')).toBe(true);
    expect(detectCardio('Stationary Bike')).toBe(true);
    expect(detectCardio('Treadmill')).toBe(true);
    expect(detectCardio('Elliptical')).toBe(true);
    expect(detectCardio('Rowing')).toBe(true);
    expect(detectCardio('Indoor Rower')).toBe(true);
    expect(detectCardio('Stair Climber')).toBe(true);
    expect(detectCardio('Stairmaster')).toBe(true);
    expect(detectCardio('Hiking')).toBe(true);
    expect(detectCardio('Swimming')).toBe(true);
    expect(detectCardio('Jump Rope')).toBe(true);
    expect(detectCardio('Skipping')).toBe(true);
  });

  it('rejects strength and resistance movements that contain similar words', () => {
    expect(detectCardio("Farmer's Walk")).toBe(false);
    expect(detectCardio('Suitcase Walk')).toBe(false);
    expect(detectCardio('Barbell Row')).toBe(false);
    expect(detectCardio('Dumbbell Row')).toBe(false);
    expect(detectCardio('Cable Row')).toBe(false);
    expect(detectCardio('Pendlay Row')).toBe(false);
    expect(detectCardio('T-Bar Row')).toBe(false);
    expect(detectCardio('Chest Supported Row')).toBe(false);
    expect(detectCardio('Bench Press')).toBe(false);
    expect(detectCardio('Back Squat')).toBe(false);
    expect(detectCardio('Deadlift')).toBe(false);
    expect(detectCardio('Overhead Press')).toBe(false);
    expect(detectCardio('Pull Up')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(detectCardio('')).toBe(false);
    expect(detectCardio('   ')).toBe(false);
  });
});

describe('detectCardioMode', () => {
  it('detects outdoor activities', () => {
    expect(detectCardioMode('Walking Outside')).toBe('outside');
    expect(detectCardioMode('Outdoor Run')).toBe('outside');
    expect(detectCardioMode('Trail Running')).toBe('outside');
    expect(detectCardioMode('Road Cycling')).toBe('outside');
    expect(detectCardioMode('Park Jog')).toBe('outside');
  });

  it('detects treadmill and indoor machine activities', () => {
    expect(detectCardioMode('Treadmill Walk')).toBe('treadmill');
    expect(detectCardioMode('Indoor Cycling')).toBe('treadmill');
    expect(detectCardioMode('Stationary Bike')).toBe('treadmill');
  });

  it('defaults to treadmill for general gym activities', () => {
    expect(detectCardioMode('Walking')).toBe('treadmill');
    expect(detectCardioMode('Running')).toBe('treadmill');
  });
});

describe('speed conversion', () => {
  it('converts km/h to mph in imperial mode', () => {
    expect(displaySpeed(10, 'metric')).toBe(10);
    expect(displaySpeed(10, 'imperial')).toBeCloseTo(6.21371, 3);
  });

  it('parses user input speed to canonical km/h', () => {
    expect(parseSpeed('10', 'metric')).toBe(10);
    expect(parseSpeed('6.21', 'imperial')).toBeCloseTo(10, 0);
    expect(parseSpeed('invalid', 'metric')).toBeNull();
    expect(parseSpeed('-5', 'metric')).toBeNull();
  });
});

describe('distance conversion', () => {
  it('converts km to miles in imperial mode', () => {
    expect(displayDistance(5, 'metric')).toBe(5);
    expect(displayDistance(5, 'imperial')).toBeCloseTo(3.10685, 3);
  });

  it('parses user input distance to canonical km', () => {
    expect(parseDistance('5', 'metric')).toBe(5);
    expect(parseDistance('3.1', 'imperial')).toBeCloseTo(4.989, 1);
    expect(parseDistance('abc', 'metric')).toBeNull();
    expect(parseDistance('0', 'metric')).toBeNull();
  });
});

describe('parseIncline', () => {
  it('parses incline percentage', () => {
    expect(parseIncline('2')).toBe(2);
    expect(parseIncline('2.5')).toBe(2.5);
    expect(parseIncline('0')).toBe(0);
    expect(parseIncline('-1')).toBeNull();
    expect(parseIncline('abc')).toBeNull();
  });
});

describe('duration helpers', () => {
  it('parses minutes string to seconds', () => {
    expect(parseDurationSeconds('30')).toBe(1800);
    expect(parseDurationSeconds('30.5')).toBe(1830);
    expect(parseDurationSeconds('0.5')).toBe(30);
  });

  it('parses mm:ss string to seconds', () => {
    expect(parseDurationSeconds('15:30')).toBe(930);
    expect(parseDurationSeconds('1:00:00')).toBe(3600);
  });

  it('formats seconds for display', () => {
    expect(formatDurationDisplay(1800)).toBe('30m');
    expect(formatDurationDisplay(1830)).toBe('30m 30s');
    expect(formatDurationDisplay(3600)).toBe('1h');
    expect(formatDurationDisplay(4500)).toBe('1h 15m');
    expect(formatDurationDisplay(45)).toBe('45s');
    expect(formatDurationDisplay(null)).toBe('');
  });

  it('converts seconds to input minutes', () => {
    expect(durationToInputMinutes(1800)).toBe('30');
    expect(durationToInputMinutes(1830)).toBe('30.5');
    expect(durationToInputMinutes(null)).toBe('');
  });
});

describe('formatCardioEffort', () => {
  it('formats treadmill effort', () => {
    const formatted = formatCardioEffort(
      {
        cardioMode: 'treadmill',
        speedKph: 6.0,
        inclinePct: 2.0,
        durationSeconds: 1800,
      },
      'metric',
    );
    expect(formatted).toBe('6.0 km/h · 2.0% · 30m');
  });

  it('formats outside effort', () => {
    const formatted = formatCardioEffort(
      {
        cardioMode: 'outside',
        distanceKm: 5.0,
        durationSeconds: 1800,
      },
      'metric',
    );
    expect(formatted).toBe('5.0 km · 30m');
  });
});
