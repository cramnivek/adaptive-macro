import { describe, expect, it } from 'vitest';
import { moveKeepingSupersets } from '../blockOrder';

type B = { name: string; supersetGroup?: string | null };
const names = (items: B[]) => items.map((i) => i.name).join(' ');
const plan = (spec: string): B[] =>
  // "a b:A c:A d" → a, b and c in superset A, d
  spec.split(' ').map((token) => {
    const [name, group] = token.split(':');
    return { name, supersetGroup: group ?? null };
  });

describe('moveKeepingSupersets', () => {
  it('moves a single exercise as before', () => {
    expect(names(moveKeepingSupersets(plan('a b c d'), 3, 0))).toBe('d a b c');
    expect(names(moveKeepingSupersets(plan('a b c d'), 0, 2))).toBe('b c a d');
  });

  it('brings the whole superset along', () => {
    expect(names(moveKeepingSupersets(plan('a b:A c:A d'), 1, 0))).toBe('b c a d');
    expect(names(moveKeepingSupersets(plan('a b:A c:A d'), 2, 3))).toBe('a d b c');
  });

  it('gathers members that had drifted apart', () => {
    expect(names(moveKeepingSupersets(plan('a:A b c:A d'), 0, 3))).toBe('b d a c');
  });

  it('reorders inside a superset without touching anything else', () => {
    expect(names(moveKeepingSupersets(plan('a b:A c:A d'), 2, 1))).toBe('a c b d');
  });

  it('lands beside another superset, not inside it', () => {
    // Moving d up onto c, the second half of B, puts d before the whole of B.
    expect(names(moveKeepingSupersets(plan('a b:B c:B d'), 3, 2))).toBe('a d b c');
    // Moving a down onto b, the first half of B, puts a after the whole of B.
    expect(names(moveKeepingSupersets(plan('a b:B c:B d'), 0, 1))).toBe('b c a d');
  });

  it('moves one superset past another as two units', () => {
    expect(names(moveKeepingSupersets(plan('a:A b:A c:B d:B'), 0, 2))).toBe('c d a b');
  });

  it('ignores a move to the same place or out of range', () => {
    const items = plan('a b c');
    expect(moveKeepingSupersets(items, 1, 1)).toBe(items);
    expect(moveKeepingSupersets(items, 0, 5)).toBe(items);
  });
});
