import { isPersonalityV2Enabled } from '../flags';
import type { AppPersonality } from '../state/settings';

export type CopyContext =
  | 'routine'
  | 'achievement'
  | 'social'
  | 'coach'
  | 'sensitive'
  | 'system';

export interface CopyEventOptions {
  personality?: AppPersonality;
  context?: CopyContext;
  facts?: Record<string, string | number>;
  seed?: string | number;
}

/**
 * Deterministic hash for stable variant rotation without re-render flicker.
 */
const hashSeed = (seed?: string | number): number => {
  if (seed === undefined || seed === null) return 0;
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/**
 * Interpolates `{placeholder}` tokens from the provided facts map.
 */
const interpolate = (template: string, facts?: Record<string, string | number>): string => {
  if (!facts) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return facts[key] !== undefined ? String(facts[key]) : match;
  });
};

type EventVariantMap = Record<AppPersonality, string[]>;

/**
 * Curated variant bank across Classic, Ascend (default), and Gymrat (opt-in).
 */
const EVENT_VARIANTS: Record<string, { context: CopyContext; variants: EventVariantMap }> = {
  // --- ACHIEVEMENTS ---
  'workout.completed': {
    context: 'achievement',
    variants: {
      classic: ['Workout complete.'],
      ascend: ['YOU PUT IN WORK.', 'Workout done. Nice work.', 'Another session in the books.'],
      gymrat: ['YOU COOKED. THE GYM IS YOURS. 🗣️', 'WORK PUT IN. ACTUALLY UNSTOPPABLE. 🔥', 'ANOTHER DAY, ANOTHER W. 💀🔥'],
    },
  },
  'workout.pr_verified': {
    context: 'achievement',
    variants: {
      classic: ['New personal record!'],
      ascend: ['NEW PR. You earned that. 🔥', 'NEW PR. Okay, you are getting strong.', 'That is a new best. Big moves.'],
      gymrat: ['NAHHH YOU ACTUALLY HIT THAT?! 💀🔥', 'NEW PR UNLOCKED. WE ARE SO BACK.', 'ALL-TIME PR. BRO WENT BEAST MODE. 🗣️🔥'],
    },
  },
  'workout.pr_banner_tag': {
    context: 'achievement',
    variants: {
      classic: ['⚡ PERSONAL RECORD ⚡'],
      ascend: ['⚡ ALL-TIME PR ⚡', '⚡ NEW PR UNLOCKED ⚡'],
      gymrat: ['⚡ NEW ALL-TIME PR 💀🔥 ⚡', '⚡ MAXIMUM PR UNLOCKED ⚡'],
    },
  },
  'workout.pr_baseline_pill': {
    context: 'achievement',
    variants: {
      classic: ['⭐ BASELINE 1RM · {e1rm} {unit}'],
      ascend: ['⭐ BASELINE SET · {e1rm} {unit} EST. 1RM'],
      gymrat: ['⭐ DAY 1 BENCHMARK · {e1rm} {unit} EST. 1RM 🔥'],
    },
  },
  'workout.pr_delta_pill': {
    context: 'achievement',
    variants: {
      classic: ['🔥 {e1rm} {unit} EST. 1RM (+{delta} {unit})'],
      ascend: ['🔥 {e1rm} {unit} EST. 1RM (+{delta} {unit})', '🔥 +{delta} {unit} · Getting stronger'],
      gymrat: ['🔥 +{delta} {unit} PR UNLOCKED · {e1rm} {unit} 💀🔥', '🔥 {e1rm} {unit} EST. 1RM · WE ARE SO BACK 🗣️'],
    },
  },

  // --- ROUTINE & WORKOUT ACTIONS ---
  'workout.finish_btn': {
    context: 'routine',
    variants: {
      classic: ['FINISH WORKOUT'],
      ascend: ['FINISH WORKOUT'],
      gymrat: ['LOCK IN WORKOUT'],
    },
  },
  'workout.start_title': {
    context: 'routine',
    variants: {
      classic: ['Log a workout'],
      ascend: ['Ready to train?', 'Time to train.'],
      gymrat: ['WHAT ARE WE HITTING TODAY?', 'TIME TO COOK.'],
    },
  },
  'workout.resume_btn': {
    context: 'routine',
    variants: {
      classic: ['Resume workout'],
      ascend: ['Resume workout', 'Pick up where you left off'],
      gymrat: ['STILL IN THE LAB · RESUME', 'RESUME SESSION'],
    },
  },

  // --- COACH & TRENDS ---
  'trends.weekly_recap_tag': {
    context: 'coach',
    variants: {
      classic: ['WEEKLY SUMMARY'],
      ascend: ['WEEKLY COACH', 'WEEKLY RECAP'],
      gymrat: ['WEEKLY GYM ARC', 'THE GYM ARC RECAP'],
    },
  },
  'trends.weekly_recap_ready': {
    context: 'coach',
    variants: {
      classic: ['Your weekly recap is ready.'],
      ascend: ['Your week in gains just dropped.', 'Your 7-day coaching check-in is ready.'],
      gymrat: ['THE WEEKLY GYM ARC RECAP JUST DROPPED.', '7-DAY RECAP READY. LET’S SEE WHAT YOU COOKED. 👀'],
    },
  },
  'trends.weekly_recap_action': {
    context: 'coach',
    variants: {
      classic: ['VIEW REVIEW'],
      ascend: ['CHECK IN WITH COACH', 'CHECK IN'],
      gymrat: ['OPEN RECAP 👀', 'SEE WHAT YOU COOKED'],
    },
  },

  // --- SOCIAL & SHARING ---
  'social.share_btn': {
    context: 'social',
    variants: {
      classic: ['SHARE CARD'],
      ascend: ['SHARE CARD'],
      gymrat: ['DROP THE CARD 🔥'],
    },
  },
  'social.caption_placeholder': {
    context: 'social',
    variants: {
      classic: ['Add a caption... (optional)'],
      ascend: ['Say something about today\'s session... (optional)'],
      gymrat: ['The group chat needs to see this... (optional)'],
    },
  },
  'social.feed_empty_title': {
    context: 'social',
    variants: {
      classic: ['No friend workouts yet'],
      ascend: ['Feed is quiet', 'Feed\'s quiet today.'],
      gymrat: ['FEED\'S DRY. GET THE SQUAD IN HERE.', 'NO POSTS YET. WHERE IS THE SQUAD AT?'],
    },
  },
  'social.explore_empty_title': {
    context: 'social',
    variants: {
      classic: ['No public workouts yet'],
      ascend: ['The floor is open', 'Be the first to share today.'],
      gymrat: ['THE FLOOR IS YOURS. DROP A WORKOUT.', 'ZERO PUBLIC POSTS. SET THE STANDARD. 🔥'],
    },
  },
  'social.squad_empty_headline': {
    context: 'social',
    variants: {
      classic: ['Train together. Hit your goals.'],
      ascend: ['Train together. Stay consistent.'],
      gymrat: ['SQUAD ARC: NO MISSED SESSIONS.', 'TRAIN TOGETHER. HIT NEW PRS. 🔥'],
    },
  },

  // --- SENSITIVE & SYSTEM (Strictly Factual Across All Personalities) ---
  'sensitive.calorie_adj_title': {
    context: 'sensitive',
    variants: {
      classic: ['Review calorie target change'],
      ascend: ['Review calorie target change'],
      gymrat: ['Review calorie target change'],
    },
  },
  'system.upload_failed': {
    context: 'system',
    variants: {
      classic: ['Upload didn\'t go through. Your card is saved on this device.'],
      ascend: ['Upload didn\'t go through. Your card is saved on this device.'],
      gymrat: ['Upload didn\'t go through. Your card is saved on this device.'],
    },
  },
  'system.save_failed': {
    context: 'system',
    variants: {
      classic: ['Couldn\'t save your workout. Your entries are still here. Retry.'],
      ascend: ['Couldn\'t save your workout. Your entries are still here. Retry.'],
      gymrat: ['Couldn\'t save your workout. Your entries are still here. Retry.'],
    },
  },
};

/**
 * Resolves an event copy string based on the developer feature flag,
 * user's personality preference, context guardrails, and deterministic seed.
 */
export const getEventCopy = (
  eventId: string,
  options: CopyEventOptions = {},
): string => {
  const entry = EVENT_VARIANTS[eventId];
  if (!entry) return '';

  // 1. If rollout flag is OFF, always return Classic (legacy neutral)
  if (!isPersonalityV2Enabled()) {
    const classicList = entry.variants.classic;
    return interpolate(classicList[0] ?? '', options.facts);
  }

  // 2. Sensitive and System messages are strictly neutral regardless of user preference
  const context = options.context ?? entry.context;
  if (context === 'sensitive' || context === 'system') {
    const list = entry.variants.classic;
    return interpolate(list[0] ?? '', options.facts);
  }

  // 3. User personality (classic, ascend, or gymrat). Fallback to 'ascend'
  const personality: AppPersonality =
    options.personality === 'classic' || options.personality === 'ascend' || options.personality === 'gymrat'
      ? options.personality
      : 'ascend';

  const variants = entry.variants[personality] ?? entry.variants.ascend ?? entry.variants.classic;
  if (!variants || variants.length === 0) return '';

  // 4. Deterministic variant selection using hash of seed
  const index = hashSeed(options.seed) % variants.length;
  const template = variants[index] ?? variants[0];

  return interpolate(template, options.facts);
};
