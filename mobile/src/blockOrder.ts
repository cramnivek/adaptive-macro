/**
 * Moving one exercise in a workout without pulling a superset apart.
 *
 * The reorder sheet lifted one exercise out and dropped it at the new place,
 * which was right for single exercises and wrong for supersets: moving one
 * half left its partner behind, and dropping an exercise between two halves
 * split them. A superset is done as one unit, so it moves as one.
 *
 * - An exercise in a superset brings every member of it, in their order. Members
 *   are linked by letter and can sit apart, so this also puts them together.
 * - Moving within its own superset reorders the superset and nothing else.
 * - A drop onto another superset lands beside it, never inside it: after it
 *   when moving down, before it when moving up.
 */
export const moveKeepingSupersets = <T extends { supersetGroup?: string | null }>(
  items: T[],
  from: number,
  to: number,
): T[] => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const group = items[from].supersetGroup ?? null;
  const target = items[to];
  const targetGroup = target.supersetGroup ?? null;

  if (group === null ? targetGroup === null : targetGroup === group) {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  const moving = group === null ? [items[from]] : items.filter((item) => item.supersetGroup === group);
  const rest = items.filter((item) => !moving.includes(item));
  const landing = rest
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (targetGroup === null ? item === target : item.supersetGroup === targetGroup))
    .map(({ index }) => index);
  const at = to > from ? Math.max(...landing) + 1 : Math.min(...landing);
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
};
