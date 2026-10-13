import { describe, expect, it } from 'vitest';
import {
  calculateCardioSteps,
  calculateTreadmillMetrics,
  detectCardio,
  detectCardioMode,
  displayDistance,
  displaySpeed,
  distanceUnit,
  durationToInputMinutes,
  estimateSteps,
  formatCardioEffort,
  formatDurationDisplay,
  formatLiveCardioEstimate,
  formatStepEstimate,
  parseDistance,
  parseDurationSeconds,
  parseIncline,
  parseSpeed,
  speedUnit,
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
    expect(detectCardioMode('Biking')).toBe('outside');
    expect(detectCardioMode('Cycling')).toBe('outside');
    expect(detectCardioMode('Hiking')).toBe('outside');
  });

  it('detects treadmill and indoor machine activities', () => {
    expect(detectCardioMode('Treadmill Walk')).toBe('treadmill');
    expect(detectCardioMode('Indoor Cycling')).toBe('treadmill');
    expect(detectCardioMode('Stationary Bike')).toBe('treadmill');
    expect(detectCardioMode('Spinning')).toBe('treadmill');
    expect(detectCardioMode('Elliptical')).toBe('treadmill');
    expect(detectCardioMode('Rowing Machine')).toBe('treadmill');
    expect(detectCardioMode('Stair Climber')).toBe('treadmill');
  });

  it('respects historyMode if provided', () => {
    expect(detectCardioMode('Walking', 'outside')).toBe('outside');
    expect(detectCardioMode('Biking', 'treadmill')).toBe('treadmill');
  });

  it('defaults to treadmill/machine for walking and running', () => {
    expect(detectCardioMode('Walking')).toBe('treadmill');
    expect(detectCardioMode('Running')).toBe('treadmill');
  });
});

describe('speed conversion', () => {
  it('converts km/h to mph in imperial mode or mph SpeedUnit', () => {
    expect(displaySpeed(10, 'metric')).toBe(10);
    expect(displaySpeed(10, 'kph')).toBe(10);
    expect(displaySpeed(10, 'imperial')).toBeCloseTo(6.21371, 3);
    expect(displaySpeed(10, 'mph')).toBeCloseTo(6.21371, 3);
    expect(speedUnit('kph')).toBe('kph');
    expect(speedUnit('mph')).toBe('mph');
  });

  it('parses user input speed to canonical km/h', () => {
    expect(parseSpeed('10', 'metric')).toBe(10);
    expect(parseSpeed('10', 'kph')).toBe(10);
    expect(parseSpeed('6.21', 'imperial')).toBeCloseTo(10, 0);
    expect(parseSpeed('6.21', 'mph')).toBeCloseTo(10, 0);
    expect(parseSpeed('invalid', 'metric')).toBeNull();
    expect(parseSpeed('-5', 'metric')).toBeNull();
  });
});

describe('distance conversion', () => {
  it('keeps outside distance strictly in km', () => {
    expect(displayDistance(5)).toBe(5);
    expect(displayDistance(5, 'metric')).toBe(5);
    expect(displayDistance(5, 'imperial')).toBe(5);
    expect(displayDistance(5, 'mph')).toBe(5);
    expect(distanceUnit()).toBe('km');
  });

  it('parses user input distance directly as km', () => {
    expect(parseDistance('5')).toBe(5);
    expect(parseDistance('3.1')).toBe(3.1);
    expect(parseDistance('abc')).toBeNull();
    expect(parseDistance('0')).toBeNull();
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
    expect(formatted).toContain('6.0 kph · 2.0% · 30m');
    expect(formatted).toContain('steps');
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
    expect(formatted).toContain('5.0 km');
    expect(formatted).toContain('steps');
    expect(formatted).toContain('30m');
  });
});

describe('estimateSteps', () => {
  it('estimates steps based on distance and speed', () => {
    // 5 km walk at 5 km/h -> ~1250 steps/km -> 6250 steps
    const walking = estimateSteps(5, 5);
    expect(walking).toBe(6250);

    // 5 km run at 10 km/h -> ~980 steps/km -> 4900 steps
    const running = estimateSteps(5, 10);
    expect(running).toBe(4900);

    // Baseline when speed is omitted: 1300 steps/km -> 6500 steps
    const baseline = estimateSteps(5);
    expect(baseline).toBe(6500);
  });

  it('adjusts for steep treadmill incline', () => {
    const flat = estimateSteps(3, 5, 0);
    const steep = estimateSteps(3, 5, 12);
    expect(steep).toBeGreaterThan(flat!);
  });

  it('returns null for empty or non-positive distance', () => {
    expect(estimateSteps(null)).toBeNull();
    expect(estimateSteps(0)).toBeNull();
    expect(estimateSteps(-2)).toBeNull();
  });
});

describe('calculateTreadmillMetrics', () => {
  it('calculates distance, estimated steps, and elevation gain', () => {
    // 30 min at 6.0 km/h with 5% incline
    const metrics = calculateTreadmillMetrics(6.0, 5.0, 1800);
    expect(metrics.distanceKm).toBe(3.0);
    expect(metrics.estimatedSteps).toBeGreaterThan(3500);
    expect(metrics.elevationGainMeters).toBe(150); // 3000m * 0.05
  });

  it('handles flat treadmill', () => {
    const metrics = calculateTreadmillMetrics(5.0, 0, 1800);
    expect(metrics.distanceKm).toBe(2.5);
    expect(metrics.elevationGainMeters).toBeNull();
  });
});

describe('formatLiveCardioEstimate', () => {
  it('formats live preview for treadmill', () => {
    const preview = formatLiveCardioEstimate(
      {
        mode: 'treadmill',
        speedKph: 6.0,
        inclinePct: 4.0,
        durationSeconds: 1800,
      },
      'metric',
    );
    expect(preview).toContain('3.00 km');
    expect(preview).toContain('steps');
    expect(preview).toContain('+120m elev');
  });

  it('formats live preview for outside distance with pace', () => {
    const preview = formatLiveCardioEstimate(
      {
        mode: 'outside',
        distanceKm: 5.0,
        durationSeconds: 1500, // 25 mins -> 5:00/km
      },
      'metric',
    );
    expect(preview).toContain('steps');
    expect(preview).toContain('5:00 /km');
  });
});

describe('formatStepEstimate', () => {
  it('formats step count nicely', () => {
    expect(formatStepEstimate(3200)).toBe('~3,200 steps');
    expect(formatStepEstimate(null)).toBe('');
    expect(formatStepEstimate(0)).toBe('');
  });
});

describe('calculateCardioSteps', () => {
  it('calculates steps for outside cardio by distance', () => {
    const steps = calculateCardioSteps({
      mode: 'outside',
      distanceKm: 2.0,
      durationSeconds: 1200,
    });
    expect(steps).toBeGreaterThan(2000);
  });

  it('calculates steps for treadmill cardio by speed and time', () => {
    const steps = calculateCardioSteps({
      mode: 'treadmill',
      speedKph: 6.0,
      durationSeconds: 1800,
      inclinePct: 0,
    });
    expect(steps).toBeGreaterThan(3000);
  });

  it('calculates fallback steps for duration-only entries', () => {
    const steps = calculateCardioSteps({
      mode: 'outside',
      durationSeconds: 1800, // 30 mins * 105 steps/min = 3150
    });
    expect(steps).toBe(3150);
  });

  it('returns 0 for empty entries', () => {
    expect(calculateCardioSteps({ mode: 'outside' })).toBe(0);
    expect(calculateCardioSteps({ mode: 'treadmill' })).toBe(0);
  });
});
