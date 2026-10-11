import type { Milestone } from '@adaptive-macros/engine';
import type { LoggedSet } from './db';
import { postPayload, postView } from './social/postPayload';
import type { UnitSystem } from './state/settings';

/**
 * What a finished workout says about itself when it is shared.
 *
 * The figures someone would actually post: how long, how many sets, how much
 * was moved, and the best set of each lift. It is a post's view at story size —
 * six lifts rather than three — so the picture and the post are worked out by
 * the same code. Kept free of drawing so the canvas only has to put it where
 * it goes.
 */
export interface ShareSummary {
  title: string;
  date: string;
  duration: string;
  sets: number;
  volume: string | null;
  exercises: { name: string; sets: number; best: string }[];
  /** How many more lifts there were than the card has room for. */
  more: number;
  highlight: { label: string; figure: string } | null;
}

/** Lifts beyond this are summed into "+ 2 more": a story card is not a log. */
const MAX_EXERCISES = 6;

export const shareSummary = (input: {
  title: string;
  date: string;
  startedAt: string;
  finishedAt: Date;
  sets: LoggedSet[];
  units: UnitSystem;
  milestone: Milestone | null;
}): ShareSummary => postView(postPayload({ ...input, sessionId: '' }, null), input.units, MAX_EXERCISES);
