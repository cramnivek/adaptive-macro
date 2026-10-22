/**
 * Profile fields checked on the phone before they are sent.
 *
 * The database enforces the same rules and is the one that counts; these exist
 * so that a mistake is explained in a sentence, not as a constraint name. The
 * patterns must stay identical to the checks in the migration.
 */

const USERNAME = /^[a-z0-9_.]{3,20}$/;
const INSTAGRAM = /^[A-Za-z0-9_.]{1,30}$/;

export interface ProfileInput {
  username: string;
  displayName: string;
  instagram: string;
  avatarUrl?: string | null;
  bio?: string;
  trainingFocus?: string;
  prHighlight?: string;
}

/** The `profiles` columns a person can edit. */
export interface ProfileFields {
  username: string;
  display_name: string;
  instagram: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  training_focus?: string | null;
  pr_highlight?: string | null;
}

export const normaliseProfile = (input: ProfileInput): ProfileFields => ({
  username: input.username.trim().replace(/^@/, '').toLowerCase(),
  display_name: input.displayName.trim(),
  instagram: input.instagram.trim().replace(/^@/, '') || null,
  avatar_url: input.avatarUrl?.trim() || null,
  bio: input.bio?.trim() || null,
  training_focus: input.trainingFocus?.trim() || null,
  pr_highlight: input.prHighlight?.trim() || null,
});

export const profileProblem = (fields: ProfileFields): string | null => {
  if (!USERNAME.test(fields.username)) return 'A username is 3 to 20 lower-case letters, numbers, _ or .';
  if (fields.display_name.length < 1 || fields.display_name.length > 40) return 'A name is 1 to 40 characters.';
  if (fields.instagram !== null && !INSTAGRAM.test(fields.instagram)) {
    return 'That is not an Instagram handle: up to 30 letters, numbers, _ or .';
  }
  if (fields.bio && fields.bio.length > 240) {
    return 'A bio must be 240 characters or less.';
  }
  if (fields.training_focus && fields.training_focus.length > 60) {
    return 'Training focus must be 60 characters or less.';
  }
  if (fields.pr_highlight && fields.pr_highlight.length > 80) {
    return 'PR highlight must be 80 characters or less.';
  }
  return null;
};

type ExtraFields = {
  avatar_url?: string | null;
  bio?: string | null;
  training_focus?: string | null;
  pr_highlight?: string | null;
};

/**
 * The profile fields this device kept that the server never received.
 *
 * Saving used to cache these before the server accepted them, so a save that
 * failed went unnoticed on the device that made it — its own copy filled the
 * gap — while every other device showed a profile with no avatar. Sending them
 * once closes that gap. A field the server already has is never replaced: the
 * server is the newer word on anything it holds.
 */
export const missingOnServer = (server: ExtraFields, cached: ExtraFields | null): ExtraFields | null => {
  if (cached === null) return null;
  const patch: ExtraFields = {};
  for (const key of ['avatar_url', 'bio', 'training_focus', 'pr_highlight'] as const) {
    if (!server[key] && cached[key]) patch[key] = cached[key];
  }
  return Object.keys(patch).length > 0 ? patch : null;
};
