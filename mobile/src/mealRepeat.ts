import { diffDays, type ISODate } from '@adaptive-macros/engine';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The words on a meal's repeat chip: "Same as yesterday", "Same as Thursday".
 *
 * Within a week a weekday is unambiguous and reads as a person would say it;
 * a date would make you count back.
 */
export const sameAsLabel = (from: ISODate, to: ISODate): string =>
  diffDays(from, to) === 1
    ? 'Same as yesterday'
    : `Same as ${WEEKDAYS[new Date(`${from}T00:00:00Z`).getUTCDay()]}`;
