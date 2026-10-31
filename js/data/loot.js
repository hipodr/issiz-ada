// What shipwreck crates can contain. weight = how often, [min, max] = how many.
export const WRECK_LOOT = [
  { k: 'wood',    n: [3, 6], w: 5 },
  { k: 'rope',    n: [1, 3], w: 4 },
  { k: 'cloth',   n: [1, 3], w: 4 },
  { k: 'nail',    n: [2, 5], w: 3 },
  { k: 'bandage', n: [1, 2], w: 3 },
  { k: 'berry',   n: [2, 4], w: 2 },
  { k: 'cfish',   n: [1, 2], w: 2 },
  { k: 'arrow',   n: [3, 6], w: 2 },
  { k: 'canteen', n: [1, 1], w: 1 },
  { k: 'strawhat',n: [1, 1], w: 1 },
];
export const WRECK_ROLLS = 3;        // item stacks per crate
export const WRECK_MAX = 3;          // unopened crates on the island at once

export function rollLoot(rnd = Math.random) {
  const total = WRECK_LOOT.reduce((a, e) => a + e.w, 0), out = [];
  for (let i = 0; i < WRECK_ROLLS; i++) {
    let r = rnd() * total;
    const e = WRECK_LOOT.find(e => (r -= e.w) < 0) || WRECK_LOOT[0];
    out.push([e.k, e.n[0] + Math.floor(rnd() * (e.n[1] - e.n[0] + 1))]);
  }
  return out;
}
