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
}

/** The `profiles` columns a person can edit. */
export interface ProfileFields {
  username: string;
  display_name: string;
  instagram: string | null;
}

export const normaliseProfile = (input: ProfileInput): ProfileFields => ({
  username: input.username.trim().replace(/^@/, '').toLowerCase(),
  display_name: input.displayName.trim(),
  instagram: input.instagram.trim().replace(/^@/, '') || null,
});

export const profileProblem = (fields: ProfileFields): string | null => {
  if (!USERNAME.test(fields.username)) return 'A username is 3 to 20 lower-case letters, numbers, _ or .';
  if (fields.display_name.length < 1 || fields.display_name.length > 40) return 'A name is 1 to 40 characters.';
  if (fields.instagram !== null && !INSTAGRAM.test(fields.instagram)) {
    return 'That is not an Instagram handle: up to 30 letters, numbers, _ or .';
  }
  return null;
};
