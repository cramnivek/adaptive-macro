import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (key: string, val: string) => {
      mockStore.set(key, val);
    }),
    getItem: vi.fn(async (key: string) => mockStore.get(key) ?? null),
  },
}));

import { LEGACY_DATABASE, SIGNED_OUT, claimDevice, hasLog, signedOutDatabase } from '../accountDatabase';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

describe('claimDevice', () => {
  beforeEach(() => mockStore.clear());

  it('gives the existing database to the first owner to open the app', async () => {
    expect(await claimDevice(ALICE)).toEqual({ database: LEGACY_DATABASE, ownerChanged: false });
  });

  it('keeps giving it to that owner on every later open', async () => {
    await claimDevice(ALICE);
    await claimDevice(BOB);
    expect(await claimDevice(ALICE)).toEqual({ database: LEGACY_DATABASE, ownerChanged: true });
  });

  it('gives any other account a database of its own', async () => {
    await claimDevice(ALICE);
    expect((await claimDevice(BOB)).database).toBe(`adaptive-macros-${BOB}.db`);
  });

  it('keeps an account out of the log kept without one, and the other way round', async () => {
    await claimDevice(SIGNED_OUT);
    expect((await claimDevice(ALICE)).database).toBe(`adaptive-macros-${ALICE}.db`);
    expect((await claimDevice(SIGNED_OUT)).database).toBe(LEGACY_DATABASE);

    mockStore.clear();
    await claimDevice(ALICE);
    expect((await claimDevice(SIGNED_OUT)).database).toBe(`adaptive-macros-${SIGNED_OUT}.db`);
  });

  it('reports a change of owner only when someone else opened the app last', async () => {
    await claimDevice(ALICE);
    expect((await claimDevice(ALICE)).ownerChanged).toBe(false);
    expect((await claimDevice(SIGNED_OUT)).ownerChanged).toBe(true);
    expect((await claimDevice(SIGNED_OUT)).ownerChanged).toBe(false);
  });
});

describe('signedOutDatabase', () => {
  beforeEach(() => mockStore.clear());

  it('is the original file when going without an account claimed it first', async () => {
    await claimDevice(SIGNED_OUT);
    await claimDevice(ALICE);
    expect(await signedOutDatabase()).toBe(LEGACY_DATABASE);
  });

  it('is a file of its own when an account claimed the original', async () => {
    await claimDevice(ALICE);
    expect(await signedOutDatabase()).toBe(`adaptive-macros-${SIGNED_OUT}.db`);
  });
});

describe('hasLog', () => {
  it('counts weigh-ins, food, workouts and body measurements, not settings alone', () => {
    expect(hasLog({ weights: 0, entries: 0, sessions: 0, measurements: 0 })).toBe(false);
    expect(hasLog({ weights: 0, entries: 0, sessions: 0, measurements: 1 })).toBe(true);
    expect(hasLog({ weights: 10, entries: 0, sessions: 0, measurements: 0 })).toBe(true);
  });
});
