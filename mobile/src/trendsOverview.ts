import { addDays, diffDays } from '@adaptive-macros/engine';

/** Navigation stays inside the history fetched by Trends, with no future pages. */
export const periodWindow = (today: string, days: number, requestedOffset: number, historyDays = 365) => {
  const maxOffset = Math.max(0, Math.floor((historyDays - days) / days));
  const offset = Math.max(0, Math.min(maxOffset, requestedOffset));
  const to = addDays(today, -offset * days);
  return { from: addDays(to, 1 - days), to, offset, maxOffset };
};

export interface PeriodMapBucket {
  from: string;
  to: string;
  days: number;
  food: number;
  leftOutFood: number;
  weight: number;
  training: number;
}

/** A recorded day is a fact, not a score. Repeated meals or sets add no extra days. */
export const buildPeriodMap = ({
  from, to, foodDates, leftOutFoodDates, weightDates, trainingDates, maxColumns = 7,
}: {
  from: string;
  to: string;
  foodDates: readonly string[];
  leftOutFoodDates: readonly string[];
  weightDates: readonly string[];
  trainingDates: readonly string[];
  maxColumns?: number;
}): PeriodMapBucket[] => {
  const days = diffDays(from, to) + 1;
  const columns = Math.min(days, maxColumns);
  const dates = [foodDates, leftOutFoodDates, weightDates, trainingDates].map((values) => new Set(values));
  return Array.from({ length: columns }, (_, index) => {
    const start = Math.floor(index * days / columns);
    const end = Math.floor((index + 1) * days / columns) - 1;
    const counts = dates.map((values) => {
      let count = 0;
      for (let day = start; day <= end; day++) if (values.has(addDays(from, day))) count++;
      return count;
    });
    return {
      from: addDays(from, start), to: addDays(from, end), days: end - start + 1,
      food: counts[0], leftOutFood: counts[1], weight: counts[2], training: counts[3],
    };
  });
};
