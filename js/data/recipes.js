// Crafting recipes, shown in this order in the "Üret" sheet.
//  out    [itemId, count]  → goes into the bag
//  place  structure id     → built on the ground in front of the player (see structures.js)
//  cost   { itemId: count }
//  d      one-line description
export const RECIPES = [
  { id: 'rope',    out: ['rope', 1],    cost: { fiber: 3 },                     d: 'Liflerden örülür.' },
  { id: 'axe',     out: ['axe', 1],     cost: { wood: 3, stone: 2 },            d: 'Ağaç keser. 40 kullanım.' },
  { id: 'pick',    out: ['pick', 1],    cost: { wood: 3, stone: 3 },            d: 'Kaya kırar. 40 kullanım.' },
  { id: 'fire',    place: 'fire',       cost: { wood: 4, stone: 3 },            d: 'Isıtır, aydınlatır, yemek pişirir.' },
  { id: 'rod',     out: ['rod', 1],     cost: { wood: 2, rope: 2 },             d: 'Kıyıda balık tut. 25 kullanım.' },
  { id: 'bow',     out: ['bow', 1],     cost: { wood: 3, rope: 2 },             d: 'Tavşan avla. 30 atış.' },
  { id: 'arrow',   out: ['arrow', 4],   cost: { wood: 1, stone: 1, fiber: 1 },  d: '4 ok yapar.' },
  { id: 'club',    out: ['club', 1],    cost: { wood: 1 },                      d: 'Saldırı silahı. Yakındaki hayvana vurur. 25 kullanım.' },
  { id: 'canteen', out: ['canteen', 1], cost: { shell: 1, rope: 1 },            d: 'Gölden doldur, 3 yudum su taşı.' },
  { id: 'chest',   place: 'chest',      cost: { wood: 10, rope: 2 },            d: '16 slotluk depo, yere kurulur.' },
];
