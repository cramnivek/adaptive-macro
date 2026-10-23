import type { ISODate, LogEntry, Meal } from '@adaptive-macros/engine';
import { addDays } from '@adaptive-macros/engine';

export interface UsualFood {
  entry: LogEntry;
  days: number;
  latestDate: ISODate;
}

export const defaultMealForHour = (hour: number): Meal =>
  hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'snack';

const foodKey = (entry: LogEntry): string =>
  entry.foodId.startsWith('ai:')
    ? `ai:${entry.foodName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()}`
    : `id:${entry.foodId}`;

/** Ranks the user's own recently logged foods for one meal and day. */
export const usualFoods = (
  history: LogEntry[],
  destinationDate: ISODate,
  meal: Meal,
  destinationEntries: LogEntry[] = [],
): UsualFood[] => {
  const start = addDays(destinationDate, -28);
  const alreadyLogged = new Set(
    destinationEntries
      .filter((entry) => entry.date === destinationDate && entry.meal === meal)
      .map(foodKey),
  );
  const grouped = new Map<string, { entry: LogEntry; days: Set<ISODate>; latestDate: ISODate }>();

  for (const entry of history) {
    if (entry.meal !== meal || entry.date < start || entry.date >= destinationDate) continue;
    const key = foodKey(entry);
    if (alreadyLogged.has(key)) continue;

    const group = grouped.get(key);
    if (group) {
      group.days.add(entry.date);
      if (entry.date >= group.latestDate) {
        group.entry = entry;
        group.latestDate = entry.date;
      }
    } else {
      grouped.set(key, { entry, days: new Set([entry.date]), latestDate: entry.date });
    }
  }

  return [...grouped.values()]
    .map(({ entry, days, latestDate }) => ({ entry, days: days.size, latestDate }))
    .sort((a, b) => {
      if (a.days !== b.days) return b.days - a.days;
      if (a.latestDate !== b.latestDate) return b.latestDate.localeCompare(a.latestDate);
      const aName = a.entry.foodName.normalize('NFKC').trim().toLowerCase();
      const bName = b.entry.foodName.normalize('NFKC').trim().toLowerCase();
      if (aName !== bName) return aName < bName ? -1 : 1;
      return a.entry.foodId < b.entry.foodId ? -1 : a.entry.foodId > b.entry.foodId ? 1 : 0;
    })
    .slice(0, 3);
};
