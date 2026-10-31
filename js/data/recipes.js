// Crafting recipes, shown in this order in the "Üret" sheet.
//  out    [itemId, count]  → goes into the bag
//  place  structure id     → built on the ground in front of the player (see structures.js)
//  cost   { itemId: count }
//  d      one-line description
//  cat    group heading in the craft sheet (see CATS)
//  lvl    player level needed to craft it
export const CATS = ['Malzeme', 'Alet', 'Silah', 'Giysi', 'Yapı'];

export const RECIPES = [
  { id: 'rope',     lvl: 2, cat: 'Malzeme', out: ['rope', 1],     cost: { fiber: 3 },                          d: 'Liflerden örülür.' },
  { id: 'arrow',    lvl: 4, cat: 'Malzeme', out: ['arrow', 4],    cost: { wood: 1, stone: 1, fiber: 1 },       d: '4 ok yapar.' },
  { id: 'axe',      lvl: 1, cat: 'Alet',    out: ['axe', 1],      cost: { wood: 3, stone: 2 },                 d: 'Ağaç keser. 40 kullanım.' },
  { id: 'pick',     lvl: 1, cat: 'Alet',    out: ['pick', 1],     cost: { wood: 3, stone: 3 },                 d: 'Kaya kırar. 40 kullanım.' },
  { id: 'rod',      lvl: 3, cat: 'Alet',    out: ['rod', 1],      cost: { wood: 2, rope: 2 },                  d: 'Kıyıda balık tut. 25 kullanım.' },
  { id: 'canteen',  lvl: 2, cat: 'Alet',    out: ['canteen', 1],  cost: { shell: 1, rope: 1 },                 d: 'Gölden doldur, 3 yudum su taşı.' },
  { id: 'club',     lvl: 1, cat: 'Silah',   out: ['club', 1],     cost: { wood: 1 },                           d: 'Saldırı 1. 25 kullanım.' },
  { id: 'spear',    lvl: 5, cat: 'Silah',   out: ['spear', 1],    cost: { wood: 2, stone: 2, rope: 1 },        d: 'Saldırı 2. 40 kullanım.' },
  { id: 'bow',      lvl: 4, cat: 'Silah',   out: ['bow', 1],      cost: { wood: 3, rope: 2 },                  d: 'Uzaktaki hayvana ok atar. 30 atış.' },
  { id: 'strawhat', lvl: 2, cat: 'Giysi',   out: ['strawhat', 1], cost: { fiber: 6 },                          d: 'Susuzluk %15 daha yavaş.' },
  { id: 'shoes',    lvl: 4, cat: 'Giysi',   out: ['shoes', 1],    cost: { hide: 2, rope: 1 },                  d: '%15 daha hızlı yürü.' },
  { id: 'vest',     lvl: 5, cat: 'Giysi',   out: ['vest', 1],     cost: { hide: 4, rope: 2 },                  d: 'Gece soğuğu %60 az, zırh +1.' },
  { id: 'shield',   lvl: 5, cat: 'Giysi',   out: ['shield', 1],   cost: { wood: 5, rope: 2 },                  d: 'Zırh +2.' },
  { id: 'fire',     lvl: 1, cat: 'Yapı',    place: 'fire',        cost: { wood: 4, stone: 3 },                 d: 'Isıtır, aydınlatır, yemek pişirir.' },
  { id: 'hut',      lvl: 3, cat: 'Yapı',    place: 'hut',         cost: { wood: 20, rope: 4, fiber: 8 },        d: 'Gece uyu, sabaha atla. Ölürsen burada uyanırsın.' },
  { id: 'chest',    lvl: 3, cat: 'Yapı',    place: 'chest',       cost: { wood: 10, rope: 2 },                 d: '16 slotluk depo.' },
];
