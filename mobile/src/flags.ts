/**
 * Application feature flags.
 *
 * Developer rollout flags control release gates independently of user preferences.
 * A client-side flag is a presentation/rollout tool, not a security boundary.
 */

/**
 * Rollout flag for the v2 Personality System (Classic / Ascend / Gymrat).
 *
 * - When enabled (default): The central personality engine resolves copy variants
 *   and exposes the "App Personality" selector in Settings.
 * - When disabled: Instantly rolls back to legacy copy everywhere without wiping
 *   the user's stored preference.
 */
export const isPersonalityV2Enabled = (): boolean => {
  // In development, test, or production, enabled by default unless explicitly disabled via env.
  return process.env.EXPO_PUBLIC_PERSONALITY_V2 !== 'false';
};
