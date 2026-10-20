/**
 * Card images, served only to someone allowed to see the post they belong to.
 *
 * They used to sit in a public bucket at addresses made from the author and
 * the session, and the bucket could be listed: anyone could fetch every card,
 * and the rules that decide who sees a post (blocks, private accounts, posts
 * hidden by reports, deleted posts) did not reach the picture at all.
 *
 * The bucket is private now, and the rule is not written a second time here.
 * Before an image is read, the post is asked for from Supabase *as the viewer*,
 * with their own token, so row-level security answers exactly as it does for
 * the feed: the row comes back only if `private.can_see` lets it. No row, no
 * image. "Not allowed" and "no such image" are the same 404, so this cannot be
 * used to ask whether someone has blocked you.
 */

const BUCKET = 'adaptive-macro-card-images';

/**
 * The Supabase publishable key. Public by design, it is in every copy of the
 * app; the row-level security behind it is what protects data, not the key.
 */
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xarT6wsIQODZNugSUcneuw_0dP9GghP';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What the app's session ids are made of (`Date.now()` and a random suffix). */
const SESSION = /^[A-Za-z0-9_-]{1,64}$/;

export const isAuthorId = (value: string | null): value is string => value !== null && UUID.test(value);
export const isSessionId = (value: string | null): value is string => value !== null && SESSION.test(value);

/** Where one card lives: in its author's folder, so nobody can write over another's. */
export const objectName = (authorId: string, sessionId: string): string => `${authorId}/${sessionId}.jpg`;

export interface CardStore {
  /** Whether the post is visible to the holder of `authorization`, by the database's own rules. */
  visible(authorId: string, sessionId: string, authorization: string): Promise<boolean>;
  /** The image's bytes and type, or null when there is none. */
  read(name: string): Promise<{ body: ArrayBuffer; contentType: string } | null>;
  /** Removes one object; true when it is gone, including when it never existed. */
  remove(name: string): Promise<boolean>;
  /** Removes every object under a folder; the count removed, or null on failure. */
  removeFolder(prefix: string): Promise<number | null>;
}

export const createCardStore = (opts: {
  supabaseUrl: string;
  gcsToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  publishableKey?: string;
}): CardStore => {
  const http = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const key = opts.publishableKey ?? SUPABASE_PUBLISHABLE_KEY;
  const objects = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;

  const withToken = async (): Promise<Record<string, string> | null> => {
    const token = await opts.gcsToken();
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const remove = async (name: string): Promise<boolean> => {
    const auth = await withToken();
    if (!auth) return false;
    const res = await http(`${objects}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: auth });
    return res.ok || res.status === 404;
  };

  return {
    async visible(authorId, sessionId, authorization) {
      const query = new URLSearchParams({
        select: 'id',
        author_id: `eq.${authorId}`,
        session_id: `eq.${sessionId}`,
        limit: '1',
      });
      const res = await http(`${opts.supabaseUrl}/rest/v1/posts?${query}`, {
        headers: { apikey: key, Authorization: authorization, Accept: 'application/json' },
      });
      if (!res.ok) return false;
      const rows = (await res.json().catch(() => [])) as unknown;
      return Array.isArray(rows) && rows.length > 0;
    },

    async read(name) {
      const auth = await withToken();
      if (!auth) return null;
      const res = await http(`${objects}/${encodeURIComponent(name)}?alt=media`, { headers: auth });
      if (!res.ok) return null;
      return { body: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'image/jpeg' };
    },

    remove,

    async removeFolder(prefix) {
      const auth = await withToken();
      if (!auth) return null;
      let removed = 0;
      let pageToken: string | undefined;
      // A person has one card per workout posted, so this is a page or two.
      do {
        const query = new URLSearchParams({ prefix, fields: 'items(name),nextPageToken' });
        if (pageToken) query.set('pageToken', pageToken);
        const res = await http(`${objects}?${query}`, { headers: auth });
        if (!res.ok) return null;
        const page = (await res.json()) as { items?: { name: string }[]; nextPageToken?: string };
        for (const item of page.items ?? []) {
          if (!(await remove(item.name))) return null;
          removed++;
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return removed;
    },
  };
};
