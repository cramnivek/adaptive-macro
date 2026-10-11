import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Real Postgres for the database tests, without Docker or a Supabase project.
 *
 * The migrations run unchanged. What they lean on from Supabase — the `auth`
 * schema's users and `auth.uid()`, the `anon` and `authenticated` roles, and
 * Supabase's habit of granting every new table and function to both roles — is
 * recreated here and nothing more. The grants matter most: on Supabase a table
 * is readable by `anon` until row-level security says otherwise, so the tests
 * must start from the same open door or they prove nothing about the lock.
 */

const MIGRATIONS = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));

const SUPABASE_STAND_IN = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create role anon nologin;
  create role authenticated nologin;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';
/** Signed up, but has not chosen a username yet. */
export const USER_C = '00000000-0000-4000-8000-00000000000c';

export const freshDatabase = async (): Promise<PGlite> => {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  await db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${USER_C}')`);
  return db;
};

/** One statement as a signed-in user, or as nobody (`null`), the way PostgREST runs it. */
export const as = async <T = Record<string, unknown>>(
  db: PGlite,
  user: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  await db.exec(`set role ${user === null ? 'anon' : 'authenticated'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
};
