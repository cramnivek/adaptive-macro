/**
 * The catalogue's SQL, as values rather than literals buried in functions.
 *
 * Every SQL bug this project has shipped has been in these queries: a picker
 * that logged the canonical name and forked an exercise's history, a block
 * header whose glyph was blank, a how-to that was unavailable until after your
 * first set of a movement. All three reached a real device, because the data
 * layer could not be tested — `vitest` runs under `environment: 'node'`, which
 * cannot load expo-sqlite, so 1,700 lines of queries had no coverage at all.
 *
 * Pulled out here they can be run against a real SQLite built from the real
 * migrations, in Node, with no mocking and no new dependency. The tests
 * execute these exact strings, so a test passing means the query the app runs
 * is the query that was checked.
 */

/** Everything a `CatalogueRow` needs from `exercise_catalogue`. */
export const CATALOGUE_COLUMNS = `c.id, c.canonical_name, c.movement_pattern, c.primary_muscle,
         c.equipment, c.bodyweight_based, c.instructions, c.primary_region,
         c.secondary_regions, c.instruction_steps`;

/**
 * The entry behind a name, via the link a logged set created.
 *
 * Authoritative when it matches, because a recorded name can differ from the
 * canonical one — "Pull Up" against "Pull-Up" — and only the link knows that.
 */
export const CATALOGUE_BY_LINKED_NAME = `
  SELECT ${CATALOGUE_COLUMNS}, e.name AS recorded_name
    FROM exercises e JOIN exercise_catalogue c ON c.id = e.catalogue_id
   WHERE e.name = ?`;

/**
 * The same entry, found without a link.
 *
 * The `exercises` row is only written when a *set* is, so an exercise added to
 * a session but not yet lifted has no link to follow. Falling back to the
 * canonical name is what makes the how-to available before your first set
 * rather than after it.
 */
export const CATALOGUE_BY_CANONICAL_NAME = `
  SELECT ${CATALOGUE_COLUMNS}, NULL AS recorded_name
    FROM exercise_catalogue c
   WHERE c.canonical_name = ?`;

/**
 * Catalogue search, with the name this user actually records each entry under.
 *
 * `recorded_name` is the most-logged name linked to the entry, not the
 * canonical one. Adding an exercise under the canonical name when history is
 * filed under another splits that history in two and blanks both halves.
 */
export const SEARCH_CATALOGUE = `
  SELECT ${CATALOGUE_COLUMNS},
         (SELECT e.name
            FROM exercises e LEFT JOIN sets s ON s.exercise_id = e.id
           WHERE e.catalogue_id = c.id
           GROUP BY e.id
           ORDER BY COUNT(s.id) DESC, e.name
           LIMIT 1) AS recorded_name
    FROM exercise_catalogue c
   WHERE c.canonical_name LIKE ?
   ORDER BY c.canonical_name
   LIMIT ?`;

/** Movement patterns for everything in the catalogue, by canonical name. */
export const PATTERNS_BY_CANONICAL_NAME = `
  SELECT c.canonical_name AS name, c.movement_pattern FROM exercise_catalogue c`;

/** Movement patterns for everything that has been lifted, by recorded name. */
export const PATTERNS_BY_LINKED_NAME = `
  SELECT e.name, c.movement_pattern
    FROM exercises e JOIN exercise_catalogue c ON c.id = e.catalogue_id`;

/**
 * Muscle regions for every linked exercise.
 *
 * Only rows that have regions: an entry catalogued before the columns existed
 * has none, and lighting a body map from nothing would be a lie rather than a
 * blank.
 */
export const REGIONS_BY_LINKED_NAME = `
  SELECT e.name, c.primary_region, c.secondary_regions
    FROM exercises e JOIN exercise_catalogue c ON c.id = e.catalogue_id
   WHERE c.primary_region IS NOT NULL`;
