// Every carryable thing. Add a new item = add an entry here (+ an icon in icons.js).
//  n       display name
//  c       colour for particles / dropped-bag marker
//  food    { hu: hunger+, th: thirst+, sick: chance 0..1, leaves: item left after eating }
//  cook    item it turns into when cooked at a fire
//  tool    max durability (uses). Tools stack 1 and wear on each use.
//  canteen water capacity (sips). Stacks 1, keeps its fill level in slot.d
//  stack   override max per slot (default STACK)
//  d       short description shown in the bag
import { STACK } from '../config.js';

export const ITEMS = {
  wood:    { n: 'Odun',  c: '#9a6436' },
  stone:   { n: 'Taş',   c: '#a3a6a0' },
  fiber:   { n: 'Lif',   c: '#9ccc5a' },
  rope:    { n: 'İp',    c: '#c7a46a', d: 'Olta, yay ve sandık için' },
  shell:   { n: 'Kabuk', c: '#7a4f2a', d: 'Matara yapılır' },
  arrow:   { n: 'Ok',    c: '#8a5a32', d: 'Yay ile atılır' },

  berry:   { n: 'Meyve',        c: '#d93a4c', food: { hu: 10, th: 3 } },
  coconut: { n: 'Kokos',        c: '#7a4f2a', food: { hu: 15, th: 20, leaves: 'shell' } },
  fish:    { n: 'Çiğ balık',    c: '#8fb4c8', food: { hu: 10, sick: .3 }, cook: 'cfish' },
  cfish:   { n: 'Pişmiş balık', c: '#c9853f', food: { hu: 35, th: 2 } },
  meat:    { n: 'Çiğ et',       c: '#d9707a', food: { hu: 12, sick: .4 }, cook: 'cmeat' },
  cmeat:   { n: 'Pişmiş et',    c: '#a8582c', food: { hu: 45 } },

  axe:     { n: 'Balta',  c: '#c9ccd1', tool: 40, d: 'Ağaç keser' },
  pick:    { n: 'Kazma',  c: '#c9ccd1', tool: 40, d: 'Kaya kırar' },
  rod:     { n: 'Olta',   c: '#c9ccd1', tool: 25, d: 'Kıyıda balık tutar' },
  bow:     { n: 'Yay',    c: '#c9ccd1', tool: 30, d: 'Ok atar, ok gerekir' },
  canteen: { n: 'Matara', c: '#7a4f2a', canteen: 3, d: 'Gölde dolar, yanında su taşırsın' },
};

export const maxStack = k => (ITEMS[k].tool || ITEMS[k].canteen) ? 1 : (ITEMS[k].stack || STACK);
