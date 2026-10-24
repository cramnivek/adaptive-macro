import { describe, expect, it, vi } from 'vitest';
import { createMotionPreference } from '../motionPreference';

const fixture = () => {
  let resolve!: (value: boolean) => void;
  const read = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
  let changed!: (value: boolean) => void;
  const stop = vi.fn();
  const listen = vi.fn((onChange: (value: boolean) => void) => { changed = onChange; return stop; });
  return { store: createMotionPreference(read, listen), read, listen, stop, resolve: (value: boolean) => resolve(value), change: (value: boolean) => changed(value) };
};

describe('shared reduced-motion preference', () => {
  it('starts conservatively and shares a single platform subscription', async () => {
    const f = fixture();
    expect(f.store.getSnapshot()).toBe(true);
    const a = vi.fn(), b = vi.fn();
    const unsubscribeA = f.store.subscribe(a), unsubscribeB = f.store.subscribe(b);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.listen).toHaveBeenCalledTimes(1);
    f.resolve(false);
    await Promise.resolve();
    expect(f.store.getSnapshot()).toBe(false);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubscribeA();
    expect(f.stop).not.toHaveBeenCalled();
    unsubscribeB();
    expect(f.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps a live setting change ahead of a stale initial read', async () => {
    const f = fixture();
    const unsubscribe = f.store.subscribe(vi.fn());
    f.change(false);
    f.change(true);
    f.resolve(false);
    await Promise.resolve();
    expect(f.store.getSnapshot()).toBe(true);
    unsubscribe();
  });

  it('does not update a stopped subscription from a late query', async () => {
    const f = fixture(), onChange = vi.fn();
    const unsubscribe = f.store.subscribe(onChange);
    unsubscribe();
    f.resolve(false);
    f.change(false);
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
    expect(f.store.getSnapshot()).toBe(true);
  });

  it('reads the current setting again when the first subscriber returns', () => {
    const f = fixture();
    const unsubscribe = f.store.subscribe(vi.fn());
    f.change(false);
    unsubscribe();
    const again = f.store.subscribe(vi.fn());
    expect(f.store.getSnapshot()).toBe(false);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.listen).toHaveBeenCalledTimes(2);
    again();
  });

  it('notifies only when the preference actually changes', () => {
    const f = fixture(), onChange = vi.fn();
    const unsubscribe = f.store.subscribe(onChange);
    f.change(true);
    f.change(false);
    f.change(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
