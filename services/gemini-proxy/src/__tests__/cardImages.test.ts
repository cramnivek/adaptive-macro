import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CardStore, createCardStore, isAuthorId, isSessionId, objectName } from '../cardImages';
import { createRouter } from '../router';
import { SUPABASE_URL, createTestKeys, supabaseClaims, type TestKeys } from './tokenFixtures';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const SESSION = '1791808734904-6ynhpt3j';

describe('ids', () => {
  it('accepts only what the app and Supabase produce', () => {
    expect(isAuthorId(ALICE)).toBe(true);
    expect(isAuthorId('alice')).toBe(false);
    expect(isAuthorId(null)).toBe(false);
    expect(isSessionId(SESSION)).toBe(true);
    expect(isSessionId('../other/x')).toBe(false);
    expect(isSessionId('a'.repeat(65))).toBe(false);
    expect(objectName(ALICE, SESSION)).toBe(`${ALICE}/${SESSION}.jpg`);
  });
});

describe('createCardStore', () => {
  const store = (fetchImpl: typeof fetch) =>
    createCardStore({ supabaseUrl: SUPABASE_URL, gcsToken: async () => 'gcs-token', fetchImpl, publishableKey: 'pub' });

  it('asks for the post as the viewer, with their token and the publishable key', async () => {
    const fetchImpl = vi.fn(async () => Response.json([{ id: 'p1' }]));
    expect(await store(fetchImpl as unknown as typeof fetch).visible(ALICE, SESSION, 'Bearer viewer')).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const query = new URL(url).searchParams;
    expect(url.startsWith(`${SUPABASE_URL}/rest/v1/posts?`)).toBe(true);
    expect(query.get('author_id')).toBe(`eq.${ALICE}`);
    expect(query.get('session_id')).toBe(`eq.${SESSION}`);
    expect(init.headers).toMatchObject({ apikey: 'pub', Authorization: 'Bearer viewer' });
  });

  it('treats no row, or a refused query, as not visible', async () => {
    expect(await store((async () => Response.json([])) as unknown as typeof fetch).visible(ALICE, SESSION, 'b')).toBe(false);
    expect(await store((async () => new Response('', { status: 401 })) as unknown as typeof fetch).visible(ALICE, SESSION, 'b')).toBe(false);
  });

  it('reads an object with the service account, and returns null when it is missing', async () => {
    const found = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }));
    const image = await store(found as unknown as typeof fetch).read(objectName(ALICE, SESSION));
    expect(new Uint8Array(image!.body)).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = found.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(encodeURIComponent(`${ALICE}/${SESSION}.jpg`));
    expect(url).toContain('alt=media');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer gcs-token' });

    expect(await store((async () => new Response('', { status: 404 })) as unknown as typeof fetch).read('x')).toBeNull();
  });

  it('empties a folder across pages, and counts an already-missing object as removed', async () => {
    const deleted: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleted.push(decodeURIComponent(url.split('/o/')[1]));
        return new Response(null, { status: deleted.length === 2 ? 404 : 204 });
      }
      const page = new URL(url).searchParams.get('pageToken');
      return Response.json(
        page
          ? { items: [{ name: `${ALICE}/c.jpg` }] }
          : { items: [{ name: `${ALICE}/a.jpg` }, { name: `${ALICE}/b.jpg` }], nextPageToken: 'next' },
      );
    });
    expect(await store(fetchImpl as unknown as typeof fetch).removeFolder(`${ALICE}/`)).toBe(3);
    expect(deleted).toEqual([`${ALICE}/a.jpg`, `${ALICE}/b.jpg`, `${ALICE}/c.jpg`]);
  });

  it('does nothing without a service-account token', async () => {
    const fetchImpl = vi.fn();
    const blind = createCardStore({ supabaseUrl: SUPABASE_URL, gcsToken: async () => null, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await blind.read('x')).toBeNull();
    expect(await blind.remove('x')).toBe(false);
    expect(await blind.removeFolder('x/')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('/api/card and /api/cards', () => {
  const NOW = Date.UTC(2026, 9, 20, 12);
  let keys: TestKeys;

  beforeAll(async () => {
    keys = await createTestKeys();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('jwks.json') ? Response.json(keys.jwks) : new Response('unexpected', { status: 500 }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const tokenFor = (sub: string) => keys.sign(supabaseClaims(NOW, { sub, exp: Math.floor(NOW / 1000) + 3600 }));

  const fakeStore = (visible: boolean) => {
    const store = {
      visible: vi.fn(async () => visible),
      read: vi.fn(async () => ({ body: new Uint8Array([9, 9]).buffer, contentType: 'image/jpeg' })),
      remove: vi.fn(async () => true),
      removeFolder: vi.fn(async () => 2),
    };
    return store satisfies CardStore;
  };

  const route = (store: CardStore) =>
    createRouter({ env: { geminiApiKey: 'k', proxyToken: 't', supabaseUrl: SUPABASE_URL }, webRoot: '/nonexistent', cardStoreImpl: store });

  const request = (path: string, token: string | null, method = 'GET') =>
    new Request(`https://x.test${path}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it('refuses a signed-out caller before looking anything up', async () => {
    const store = fakeStore(true);
    const res = await route(store)(request(`/api/card?author=${ALICE}&session=${SESSION}`, null));
    expect(res.status).toBe(401);
    expect(store.visible).not.toHaveBeenCalled();
  });

  it('serves the image, privately, when the database says the viewer may see the post', async () => {
    const store = fakeStore(true);
    const token = await tokenFor(BOB);
    const res = await route(store)(request(`/api/card?author=${ALICE}&session=${SESSION}`, token));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
    expect(store.visible).toHaveBeenCalledWith(ALICE, SESSION, `Bearer ${token}`);
    expect(store.read).toHaveBeenCalledWith(`${ALICE}/${SESSION}.jpg`);
  });

  it('answers a post the viewer may not see exactly as a missing one, without reading it', async () => {
    const store = fakeStore(false);
    const res = await route(store)(request(`/api/card?author=${ALICE}&session=${SESSION}`, await tokenFor(BOB)));
    expect(res.status).toBe(404);
    expect(store.read).not.toHaveBeenCalled();
  });

  it('rejects ids the app never makes, which keeps paths out of other folders', async () => {
    const store = fakeStore(true);
    const token = await tokenFor(BOB);
    expect((await route(store)(request(`/api/card?author=${ALICE}&session=..%2Fx`, token))).status).toBe(404);
    expect((await route(store)(request(`/api/card?author=nobody&session=${SESSION}`, token))).status).toBe(404);
    expect(store.visible).not.toHaveBeenCalled();
  });

  it('removes only the caller’s own card, whatever author is asked for', async () => {
    const store = fakeStore(true);
    const res = await route(store)(request(`/api/card?author=${ALICE}&session=${SESSION}`, await tokenFor(BOB), 'DELETE'));
    expect(res.status).toBe(204);
    expect(store.remove).toHaveBeenCalledWith(`${BOB}/${SESSION}.jpg`);
  });

  it('empties only the caller’s own folder', async () => {
    const store = fakeStore(true);
    const res = await route(store)(request('/api/cards', await tokenFor(BOB), 'DELETE'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: 2 });
    expect(store.removeFolder).toHaveBeenCalledWith(`${BOB}/`);
  });
});
