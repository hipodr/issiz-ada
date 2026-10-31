// Every carryable thing. Add a new item = add an entry here (+ an icon in icons.js).
//  n       display name
//  c       colour for particles / dropped-bag marker
//  food    { hu: hunger+, th: thirst+, sick: chance 0..1, leaves: item left after eating }
//  cook    item it turns into when cooked at a fire
//  tool    max durability (uses). Tools stack 1 and wear on each use.
//  canteen water capacity (sips). Stacks 1, keeps its fill level in slot.d
//  dmg     { material: damage per hit } for tools that hit resources (see resources.js mat)
//  melee   damage dealt to animals at arm's reach (weapons)
//  equip   { slot: 'head'|'body'|'feet'|'weapon'|'shield', stats: {...} }  see equipment.js
//  use     'shoot' | 'fish' for tools with a special Use action
//  stack   override max per slot (default STACK)
//  d       short description;  src  where to get it (shown in tooltips)
import { STACK } from '../config.js';

export const ITEMS = {
  wood:    { n: 'Odun',  c: '#9a6436', d: 'Temel yapı malzemesi', src: 'Yerdeki dallar; ağaç kesmek' },
  stone:   { n: 'Taş',   c: '#a3a6a0', d: 'Alet ve ateş için', src: 'Yerdeki çakıllar; kazma ile kaya kırmak' },
  fiber:   { n: 'Lif',   c: '#9ccc5a', d: 'İp ve ok için', src: 'Uzun otlar (El tuşu)' },
  rope:    { n: 'İp',    c: '#c7a46a', d: 'Olta, yay ve sandık için', src: 'Üret: 3 lif' },
  shell:   { n: 'Kabuk', c: '#7a4f2a', d: 'Matara yapılır', src: 'Kokos yiyince kalır' },
  arrow:   { n: 'Ok',    c: '#8a5a32', d: 'Yay ile atılır', src: 'Üret: odun + taş + lif' },
  hide:    { n: 'Post',  c: '#b99a72', d: 'Giysi ve ayakkabı için', src: 'Tavşan avla' },
  burnt:   { n: 'Yanık yemek', c: '#2b231e', food: { hu: 3 }, d: 'Ateşte unutulmuş', src: 'Pişen yemeği ateşte bırakırsan' },

  berry:   { n: 'Meyve',        c: '#d93a4c', food: { hu: 10, th: 3 }, src: 'Kırmızı meyveli çalılar' },
  coconut: { n: 'Kokos',        c: '#7a4f2a', food: { hu: 15, th: 20, leaves: 'shell' }, src: 'Kumsaldaki palmiyeler' },
  fish:    { n: 'Çiğ balık',    c: '#8fb4c8', food: { hu: 10, sick: .3 }, cook: 'cfish', src: 'Olta ile kıyıda' },
  cfish:   { n: 'Pişmiş balık', c: '#c9853f', food: { hu: 35, th: 2 }, src: 'Çiğ balığı ateşte pişir' },
  meat:    { n: 'Çiğ et',       c: '#d9707a', food: { hu: 12, sick: .4 }, cook: 'cmeat', src: 'Yay ile tavşan avla' },
  cmeat:   { n: 'Pişmiş et',    c: '#a8582c', food: { hu: 45 }, src: 'Çiğ eti ateşte pişir' },

  club:    { n: 'Sopa',   c: '#8a5a32', tool: 25, melee: 1, equip: { slot: 'weapon' }, d: 'Basit silah', src: 'Üret: 1 odun' },
  spear:   { n: 'Mızrak', c: '#c9ccd1', tool: 40, melee: 2, equip: { slot: 'weapon' }, d: 'Güçlü silah', src: 'Üret: 2 odun + 2 taş + 1 ip' },
  strawhat:{ n: 'Hasır şapka',  c: '#e2c26b', equip: { slot: 'head', stats: { thirst: -.15 } }, d: 'Güneşten korur', src: 'Üret: 6 lif' },
  vest:    { n: 'Post yelek',   c: '#9a7a52', equip: { slot: 'body', stats: { warm: .6, armor: 1 } }, d: 'Gece soğuğuna karşı', src: 'Üret: 4 post + 2 ip' },
  shoes:   { n: 'Post ayakkabı', c: '#7a5634', equip: { slot: 'feet', stats: { speed: .15 } }, d: 'Daha hızlı yürürsün', src: 'Üret: 2 post + 1 ip' },
  shield:  { n: 'Ahşap kalkan', c: '#9a6436', equip: { slot: 'shield', stats: { armor: 2 } }, d: 'Alınan hasarı azaltır', src: 'Üret: 5 odun + 2 ip' },
  axe:     { n: 'Balta',  c: '#c9ccd1', tool: 40, dmg: { wood: 3 }, d: 'Ağaç keser', src: 'Üret: 3 odun + 2 taş' },
  pick:    { n: 'Kazma',  c: '#c9ccd1', tool: 40, dmg: { stone: 3 }, d: 'Kaya kırar', src: 'Üret: 3 odun + 3 taş' },
  rod:     { n: 'Olta',   c: '#c9ccd1', tool: 25, use: 'fish', d: 'Kıyıda balık tutar', src: 'Üret: 2 odun + 2 ip' },
  bow:     { n: 'Yay',    c: '#c9ccd1', tool: 30, use: 'shoot', d: 'Ok atar, ok gerekir', src: 'Üret: 3 odun + 2 ip' },
  canteen: { n: 'Matara', c: '#7a4f2a', canteen: 3, d: 'Gölde dolar, yanında su taşırsın', src: 'Üret: kabuk + ip' },
};

export const maxStack = k => (ITEMS[k].tool || ITEMS[k].canteen || ITEMS[k].equip) ? 1 : (ITEMS[k].stack || STACK);
