// Crafting recipes, shown in this order in the "Üret" sheet.
//  out    [itemId, count]  → goes into the bag
//  place  structure id     → built on the ground in front of the player (see structures.js)
//  cost   { itemId: count }
//  d      one-line description
//  cat    group heading in the craft sheet (see CATS)
//  lvl    player level needed to craft it
export const CATS = ['Malzeme', 'Alet', 'Silah', 'Giysi', 'Yapı'];

export const RECIPES = [
  { id: 'pick',     lvl: 1, cat: 'Alet',    out: ['pick', 1],     cost: { wood: 3, stone: 3 },                 d: 'Kaya kırar. 40 kullanım.' },
  { id: 'axe',      lvl: 1, cat: 'Alet',    out: ['axe', 1],      cost: { wood: 3, stone: 2 },                 d: 'Ağaç keser. 40 kullanım.' },
  { id: 'club',     lvl: 1, cat: 'Silah',   out: ['club', 1],     cost: { wood: 1 },                           d: 'Saldırı 1. 25 kullanım.' },
  { id: 'fire',     lvl: 1, cat: 'Yapı',    place: 'fire',        cost: { wood: 4, stone: 3 },                 d: 'Isıtır, aydınlatır, yemek pişirir.' },
  { id: 'rope',     lvl: 2, cat: 'Malzeme', out: ['rope', 1],     cost: { fiber: 3 },                          d: 'Liflerden örülür.' },
  { id: 'bandage',  lvl: 2, cat: 'Malzeme', out: ['bandage', 1],  cost: { cloth: 2 },                          d: 'Kullanınca +30 sağlık.' },
  { id: 'canteen',  lvl: 2, cat: 'Alet',    out: ['canteen', 1],  cost: { shell: 1, rope: 1 },                 d: 'Gölden doldur, 3 yudum su taşı.' },
  { id: 'strawhat', lvl: 2, cat: 'Giysi',   out: ['strawhat', 1], cost: { fiber: 6 },                          d: 'Susuzluk %15 daha yavaş.' },
  { id: 'rod',      lvl: 3, cat: 'Alet',    out: ['rod', 1],      cost: { wood: 2, rope: 2 },                  d: 'Kıyıda balık tut. 25 kullanım.' },
  { id: 'hut',      lvl: 3, cat: 'Yapı',    place: 'hut',         cost: { wood: 20, rope: 4, fiber: 8 },        d: 'Gece uyu, sabaha atla. Ölürsen burada uyanırsın. Barakaya yükseltilir.' },
  { id: 'chest',    lvl: 3, cat: 'Yapı',    place: 'chest',       cost: { wood: 10, rope: 2 },                 d: '16 slotluk depo.' },
  { id: 'bow',      lvl: 4, cat: 'Silah',   out: ['bow', 1],      cost: { wood: 3, rope: 2 },                  d: 'Uzaktaki hayvana ok atar. 30 atış.' },
  { id: 'arrow',    lvl: 4, cat: 'Malzeme', out: ['arrow', 4],    cost: { wood: 1, stone: 1, fiber: 1 },       d: '4 ok yapar.' },
  { id: 'shoes',    lvl: 4, cat: 'Giysi',   out: ['shoes', 1],    cost: { hide: 2, rope: 1 },                  d: '%15 daha hızlı yürü.' },
  { id: 'spear',    lvl: 5, cat: 'Silah',   out: ['spear', 1],    cost: { wood: 2, stone: 2, rope: 1 },        d: 'Saldırı 2. 40 kullanım.' },
  { id: 'vest',     lvl: 5, cat: 'Giysi',   out: ['vest', 1],     cost: { hide: 4, rope: 2 },                  d: 'Gece soğuğu %60 az, zırh +1.' },
  { id: 'shield',   lvl: 5, cat: 'Giysi',   out: ['shield', 1],   cost: { wood: 5, rope: 2 },                  d: 'Zırh +2.' },
];

/** Recipes in the order the craft grid shows them: by level, then by the order above. */
export const SORTED_RECIPES = RECIPES.map((r, i) => [r, i]).sort((a, b) => (a[0].lvl - b[0].lvl) || (a[1] - b[1])).map(([r]) => r);
