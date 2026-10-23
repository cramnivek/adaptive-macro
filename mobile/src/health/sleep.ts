import type { ISODate } from '@adaptive-macros/engine';

type Interval = [number, number];
export interface SleepInput {
  startTime: string;
  endTime: string;
  endZoneOffset?: { totalSeconds: number } | null;
  metadata?: { id?: string; dataOrigin?: string };
  stages?: { startTime: string; endTime: string; stage: number }[];
}

export interface SleepSession {
  id: string;
  date: ISODate;
  source: string;
  start: number;
  end: number;
  /** Null means the source supplied no usable stages, not zero sleep. */
  asleep: Interval[] | null;
  /** Known awake and sleep intervals; absent in older imports. */
  observed?: Interval[] | null;
}

export interface SleepSummary {
  date: ISODate;
  start: number;
  end: number;
  sessionMinutes: number;
  sleepMinutes: number | null;
  observedMinutes: number | null;
  fullyObserved: boolean;
  sources: string[];
}

export const normalizeSleep = (records: SleepInput[]): SleepSession[] => {
  const sessions = new Map<string, SleepSession>();
  for (const record of records) {
    const start = Date.parse(record.startTime);
    const end = Date.parse(record.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const source = record.metadata?.dataOrigin ?? 'Health Connect';
    const id = `${source}:${record.metadata?.id ?? `${start}:${end}`}`;
    // Keep the waking date at the recorded offset after travel to another zone.
    const offset = record.endZoneOffset?.totalSeconds;
    const date = offset != null
      ? new Date(end + offset * 1000).toISOString().slice(0, 10)
      : /[+-]\d\d:\d\d$/.test(record.endTime) ? record.endTime.slice(0, 10) : localDay(end);
    const stages = (record.stages ?? []).filter((s) => s.stage >= 1 && s.stage <= 6 &&
      Math.min(end, Date.parse(s.endTime)) > Math.max(start, Date.parse(s.startTime)));
    const observed: Interval[] | null = stages.length === 0 ? null : stages
      .map((s): Interval => [Math.max(start, Date.parse(s.startTime)), Math.min(end, Date.parse(s.endTime))]);
    const asleep: Interval[] | null = stages.length === 0 ? null : stages
      .filter((s) => [2, 4, 5, 6].includes(s.stage))
      .map((s): Interval => [Math.max(start, Date.parse(s.startTime)), Math.min(end, Date.parse(s.endTime))])
      .filter(([a, b]) => b > a);
    sessions.set(id, { id, date: date as ISODate, source, start, end, asleep, observed });
  }
  return [...sessions.values()];
};

const localDay = (time: number): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** Sum the union, because watches and source apps can publish the same night twice. */
const unionMilliseconds = (intervals: Interval[]): number => {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let end = -Infinity;
  let milliseconds = 0;
  for (const [a, b] of sorted) {
    milliseconds += Math.max(0, b - Math.max(a, end));
    end = Math.max(end, b);
  }
  return milliseconds;
};

export const summarizeSleep = (sessions: SleepSession[]): SleepSummary[] => {
  const nights = new Map<ISODate, SleepSession[]>();
  for (const session of sessions) nights.set(session.date, [...(nights.get(session.date) ?? []), session]);
  return [...nights].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const sessionTime = unionMilliseconds(rows.map((s) => [s.start, s.end]));
    const observedTime = rows.every((s) => s.observed == null) ? null : unionMilliseconds(rows.flatMap((s) => s.observed ?? []));
    return {
      date,
      start: Math.min(...rows.map((s) => s.start)),
      end: Math.max(...rows.map((s) => s.end)),
      sessionMinutes: Math.round(sessionTime / 60000),
      sleepMinutes: rows.every((s) => s.asleep === null) ? null : Math.round(unionMilliseconds(rows.flatMap((s) => s.asleep ?? [])) / 60000),
      observedMinutes: observedTime === null ? null : Math.round(observedTime / 60000),
      fullyObserved: observedTime !== null && observedTime === sessionTime,
      sources: [...new Set(rows.map((s) => s.source))],
    };
  });
};
