// Equipment ("paper doll") slots and the stats gear can give.
// Add a slot   = add an entry to EQUIP_SLOTS (+ a cell in the bag sheet layout: `side` and `row`).
// Add a stat   = add an entry to STATS and read it in game.js through G.st.<id>.
// Make an item wearable: in items.js give it  equip: { slot: '<slot id>', stats: { <stat>: value } }.
import { ITEMS } from './items.js';

export const EQUIP_SLOTS = [
  { id: 'head',   n: 'Şapka',    side: 'left',  row: 1 },
  { id: 'body',   n: 'Gövde',    side: 'left',  row: 2 },
  { id: 'feet',   n: 'Ayakkabı', side: 'left',  row: 3 },
  { id: 'weapon', n: 'Silah',    side: 'right', row: 1 },
  { id: 'shield', n: 'Kalkan',   side: 'right', row: 2 },
];

export const STATS = {
  melee:  { n: 'Saldırı',          fmt: v => `${v}` },
  armor:  { n: 'Zırh',             fmt: v => `${v}` },
  speed:  { n: 'Hız',              fmt: v => `+%${Math.round(v * 100)}` },
  warm:   { n: 'Soğuğa direnç',    fmt: v => `%${Math.round(v * 100)}` },
  thirst: { n: 'Daha az susama',   fmt: v => `%${Math.round(-v * 100)}` },
};

/** Total stats from everything equipped. Weapons add their `melee` value. */
export function sumStats(eq) {
  const s = Object.fromEntries(Object.keys(STATS).map(k => [k, 0]));
  for (const st of Object.values(eq)) {
    if (!st) continue;
    const it = ITEMS[st.k];
    for (const [k, v] of Object.entries(it.equip?.stats || {})) s[k] = (s[k] || 0) + v;
    if (it.melee && it.equip?.slot === 'weapon') s.melee += it.melee;
  }
  return s;
}
