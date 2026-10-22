import { describe, expect, it } from 'vitest';
import { normalizeSleep, summarizeSleep } from '../sleep';

const session = {
  startTime: '2026-10-20T22:00:00+08:00', endTime: '2026-10-21T06:00:00+08:00',
  metadata: { id: 'night', dataOrigin: 'com.garmin.android.apps.connectmobile' },
};

describe('sleep records', () => {
  it('assigns overnight sleep to the waking date at the recorded offset', () => {
    expect(normalizeSleep([session])[0].date).toBe('2026-10-21');
    expect(normalizeSleep([{ ...session, endTime: '2026-10-20T22:00:00Z', endZoneOffset: { totalSeconds: 28800 } }])[0].date).toBe('2026-10-21');
  });

  it('does not call a stage-less session measured sleep', () => {
    const summary = summarizeSleep(normalizeSleep([session]))[0];
    expect(summary.sessionMinutes).toBe(480);
    expect(summary.start).toBe(Date.parse(session.startTime));
    expect(summary.end).toBe(Date.parse(session.endTime));
    expect(summary.sleepMinutes).toBeNull();
    expect(summary.sources).toEqual(['com.garmin.android.apps.connectmobile']);
  });

  it('unions duplicate and overlapping sessions and sleep stages', () => {
    const staged = { ...session, stages: [
      { startTime: session.startTime, endTime: '2026-10-21T02:00:00+08:00', stage: 4 },
      { startTime: '2026-10-21T01:00:00+08:00', endTime: session.endTime, stage: 6 },
    ] };
    const rows = normalizeSleep([staged, staged, { ...staged, metadata: { ...session.metadata, id: 'copy' } }]);
    expect(rows).toHaveLength(2);
    expect(summarizeSleep(rows)[0]).toMatchObject({ sessionMinutes: 480, sleepMinutes: 480 });
  });

  it('excludes awake and unknown stages and clips sleep to its session', () => {
    const rows = normalizeSleep([{ ...session, stages: [
      { startTime: '2026-10-20T20:00:00+08:00', endTime: '2026-10-20T23:00:00+08:00', stage: 2 },
      { startTime: '2026-10-20T23:00:00+08:00', endTime: session.endTime, stage: 1 },
    ] }]);
    expect(summarizeSleep(rows)[0].sleepMinutes).toBe(60);
  });

  it('keeps an all-awake staged session as zero recorded sleep', () => {
    expect(summarizeSleep(normalizeSleep([{ ...session, stages: [{ ...session, stage: 1 }] }]))[0].sleepMinutes).toBe(0);
  });

  it('ignores invalid and reversed intervals', () => {
    expect(normalizeSleep([{ ...session, startTime: 'bad' }, { ...session, endTime: session.startTime }])).toEqual([]);
  });
});
