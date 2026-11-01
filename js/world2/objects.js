// Things standing on the new island: trees, palms, berry bushes, reeds (saz), rocks, sticks, pebbles, coconuts.
// Pure logic (no DOM/GL) → node-testable.
//
// Input : terrain (generateTerrain), seed, game time in days (float), the camera's world rectangle (for "out of view")
// Process: placement by terrain rules (each kind only where it belongs, sparse, min spacing) → spatial grid
//          → harvesting (hit / pick) → regrowth: small things refill in place, big things come back slowly and only out of view,
//            fresh sticks / pebbles appear each morning up to a cap
// Output : world2 = { list, grid, ... } + functions below
import { mulberry32, vnoise } from '../util.js';
import { field, surfaceAt } from '../map/sample.js';
import { TSIZE, TCELL } from '../map/terrain.js';

// r: collision radius at scale 1 (0 = walk through) · hp: hits to fell / break · tool: needed to harvest
// drop: what you get · pick: gathered by hand (+ refill days) · back: days until a felled / broken one returns (out of view)
export const KIND = {
  tree:    { name: 'Ağaç', r: 5, hp: 6, tool: 'axe', drop: { wood: 4 }, stumpDays: 6, growDays: 3, cap: 170, gap: 50 },
  palm:    { name: 'Hurma', r: 4, hp: 5, tool: 'axe', drop: { wood: 3 }, stumpDays: 6, growDays: 3, fruit: 3, fruitDays: 1.5, cap: 70, gap: 40 },
  bush:    { name: 'Meyve çalısı', r: 0, pick: { berry: 3 }, refill: 2.5, cap: 60, gap: 50 },
  saz:     { name: 'Saz', r: 0, pick: { fiber: 2 }, refill: 1.5, cap: 110, gap: 18 },
  rock:    { name: 'Kaya', r: 8, hp: 5, tool: 'pick', drop: { stone: 3 }, back: 12, cap: 85, gap: 46 },
  stick:   { name: 'Dal', r: 0, pick: { wood: 1 }, once: true, cap: 55, daily: 8 },
  pebble:  { name: 'Çakıl', r: 0, pick: { stone: 1 }, once: true, cap: 55, daily: 6 },
  coconut: { name: 'Hindistancevizi', r: 0, pick: { coconut: 1 }, once: true },
};
export const ITEM_NAMES = { wood: 'Odun', stone: 'Taş', fiber: 'Lif', berry: 'Meyve', coconut: 'Hindistancevizi' };   // dal → odun, çakıl → taş; lif only from reeds

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const CELLS = 64, GN = Math.ceil(TSIZE / CELLS);

/** Where may a kind stand? Returns a probability weight 0..1 for this spot. */
export function suitability(t, k, x, y) {
  const s = surfaceAt(t, x, y);
  if (s.water > 0 || s.kind === 'river' || s.deep) return 0;
  const h = s.h, m = field(t.M, x, y), ds = field(t.dSea, x, y), dr = field(t.dRiver, x, y), P = field(t.P, x, y), F = field(t.F, x, y), K = field(t.K, x, y);
  if (P > .3 && k !== 'stick' && k !== 'pebble') return 0;                                     // trails stay clear
  const steep = s.kind === 'rock' && !(k === 'rock');
  if (steep) return 0;
  switch (k) {
    case 'tree': return h > .02 && ds > 5 && F < .3 && dr > 1.5 && h < t.maxH * .72 ? ss(.48, .78, m) : 0;   // damp ground, forest
    case 'palm': return ds > 2.2 && ds < 11 && h < .13 && K < .3 ? 1 - ss(7, 11, ds) * .7 : 0;                  // near the shore
    case 'bush': return ds > 6 && F < .7 && h < t.maxH * .55 ? ss(.36, .5, m) * (1 - ss(.72, .85, m)) * (.4 + F) : 0;   // forest edges, clearings
    case 'saz': return dr < 3.2 && dr > .4 ? 1 - ss(1.5, 3.2, dr) : (m > .8 && h < .07 && ds > 4 ? .4 : 0);      // river banks, delta, wet hollows
    case 'rock': return (h > t.maxH * .42 ? ss(t.maxH * .42, t.maxH * .6, h) : 0) + (K > .3 && ds < 5 ? .5 : 0);  // mountain, rocky shore
    case 'stick': return h > .02 && ds > 4 ? ss(.45, .75, m) : 0;
    case 'pebble': return (dr < 2.5 ? .8 : 0) + (ds < 4 && h < .04 ? .6 : 0);
  }
  return 0;
}

export function createWorld2(t, seed) {
  const W = { t, list: [], grid: Array.from({ length: GN * GN }, () => []), nextId: 1, day: 0, rnd: mulberry32((seed ^ 0x9e3779b9) >>> 0) };
  const rnd = W.rnd, sp = t.spawn || { x: TSIZE / 2, y: TSIZE / 2 };
  const order = ['rock', 'tree', 'palm', 'bush', 'saz', 'stick', 'pebble'];
  for (const k of order) {
    const K = KIND[k], gap = K.gap || 40, cands = [];
    for (let y = gap / 2; y < TSIZE; y += gap) for (let x = gap / 2; x < TSIZE; x += gap) {
      const px = x + (rnd() - .5) * gap * .9, py = y + (rnd() - .5) * gap * .9;
      if (Math.hypot(px - sp.x, py - sp.y) < 55) continue;                                       // keep the landing beach free
      const w = suitability(t, k, px, py) * (.55 + .9 * vnoise(px / 160, py / 160, seed + order.indexOf(k) * 31));   // groves / clumps
      if (w > .05) cands.push([w * rnd(), px, py]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    let n = 0;
    for (const [, x, y] of cands) {
      if (n >= K.cap) break;
      if (near(W, x, y, (KIND[k].r || 3) + 8).some(o => KIND[o.k].r && Math.hypot(o.x - x, o.y - y) < (KIND[o.k].r * o.s + (K.r || 3) + 6))) continue;
      add(W, k, x, y); n++;
    }
  }
  return W;
}

export function add(W, k, x, y, extra = {}) {
  const r = W.rnd, s = k === 'tree' ? .8 + r() * .5 : k === 'palm' ? .85 + r() * .35 : k === 'rock' ? .6 + r() * .9 : k === 'bush' ? .8 + r() * .4 : k === 'saz' ? .8 + r() * .5 : 1;
  const o = { id: W.nextId++, k, x, y, s, rot: r() * Math.PI * 2, v: Math.floor(r() * 3), hp: KIND[k].hp || 0, stage: 'full', ripe: true, fruit: KIND[k].fruit || 0, t: 0, g: 1, shake: 0, ...extra };
  W.list.push(o); gridAt(W, x, y).push(o);
  return o;
}
export function remove(W, o) {
  const c = gridAt(W, o.x, o.y), i = c.indexOf(o); if (i >= 0) c.splice(i, 1);
  const j = W.list.indexOf(o); if (j >= 0) W.list.splice(j, 1);
}
function gridAt(W, x, y) { const gx = Math.max(0, Math.min(GN - 1, Math.floor(x / CELLS))), gy = Math.max(0, Math.min(GN - 1, Math.floor(y / CELLS))); return W.grid[gy * GN + gx]; }
export function near(W, x, y, r) {
  const out = [], x0 = Math.floor((x - r) / CELLS), x1 = Math.floor((x + r) / CELLS), y0 = Math.floor((y - r) / CELLS), y1 = Math.floor((y + r) / CELLS);
  for (let gy = Math.max(0, y0); gy <= Math.min(GN - 1, y1); gy++) for (let gx = Math.max(0, x0); gx <= Math.min(GN - 1, x1); gx++) for (const o of W.grid[gy * GN + gx]) out.push(o);
  return out;
}

/** Collision radius right now (0 = can walk through). */
export function radius(o) {
  if (o.stage === 'gone' || o.stage === 'fall') return 0;
  if (o.stage === 'stump') return 4 * o.s;
  if (o.stage === 'sapling') return o.g > .6 ? KIND[o.k].r * o.s * o.g : 0;
  return (KIND[o.k].r || 0) * o.s;
}
export function blocked(W, x, y, r = 5) {
  for (const o of near(W, x, y, r + 20)) { const R = radius(o); if (R && (o.x - x) ** 2 + (o.y - y) ** 2 < (R + r) ** 2) return true; }
  return false;
}

/** What could this hero do with this tool on what's in front of him? → { o, verb, label } or null */
export function targetFor(W, x, y, yaw, tool) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  let best = null, bd = 1e9;
  for (const o of near(W, x, y, 60)) {
    const K = KIND[o.k], dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy), ahead = (dx * fx + dy * fy) / (d || 1);
    const reach = radius(o) + (tool === 'hand' || tool === 'gather' ? 16 : 26);
    if (d > reach || (d > 8 && ahead < .35)) continue;
    let verb = null;
    if (o.stage === 'full' && (o.k === 'tree' || o.k === 'palm')) verb = tool === 'axe' ? 'chop' : o.k === 'palm' && o.fruit > 0 && (tool === 'hand' || tool === 'club') ? 'shake' : null;
    else if (o.k === 'rock' && o.stage === 'full') verb = tool === 'pick' ? 'mine' : null;
    else if (tool === 'hand' || tool === 'knife') {
      if (o.k === 'bush' && o.ripe) verb = 'pick';
      else if (o.k === 'saz' && o.ripe) verb = 'pick';
      else if (K.once) verb = 'pick';
    }
    if (!verb) continue;
    const score = d - (verb === 'pick' ? 10 : 0);
    if (score < bd) { bd = score; best = { o, verb }; }
  }
  if (!best) return null;
  best.label = { chop: 'Kes', mine: 'Kaz', shake: 'Salla', pick: KIND[best.o.k].once ? 'Al' : 'Topla' }[best.verb];
  return best;
}

/** Apply a hit / pick to the target. Returns { got: {item: n}, msg } — got is empty while a tree is still standing. */
export function harvest(W, tg, time, yaw) {
  const o = tg.o, K = KIND[o.k], got = {};
  const give = d => { for (const k in d) got[k] = (got[k] || 0) + d[k]; };
  if (tg.verb === 'chop' || tg.verb === 'mine') {
    o.hp--; o.shake = 1;
    if (o.hp <= 0) {
      if (o.k === 'rock') { o.stage = 'gone'; o.t = W.day + K.back; give(K.drop); }
      else { o.stage = 'fall'; o.fallT0 = time; o.fallDir = yaw; o.t = W.day + K.stumpDays; give(K.drop); if (o.k === 'palm') { for (let i = 0; i < o.fruit; i++) dropCoconut(W, o); o.fruit = 0; } }
    }
  } else if (tg.verb === 'shake') { o.shake = 1; if (o.fruit > 0) { o.fruit--; dropCoconut(W, o); o.t = Math.max(o.t, W.day + K.fruitDays); } }
  else if (tg.verb === 'pick') {
    give(K.pick);
    if (K.once) remove(W, o); else { o.ripe = false; o.t = W.day + K.refill; }
  }
  return { got };
}
function dropCoconut(W, o) {
  const a = W.rnd() * Math.PI * 2, d = 10 + W.rnd() * 10;
  add(W, 'coconut', o.x + Math.cos(a) * d, o.y + Math.sin(a) * d);
}

/** Advance the world clock (days). view = {x0,y0,x1,y1} world rect: big things only come back where you are not looking. */
export function tick(W, day, view, time) {
  const prevDay = Math.floor(W.day + .75), newMorning = Math.floor(day + .75) > prevDay;      // mornings start at 06:00 (.25)
  W.day = day;
  const seen = o => view && o.x > view.x0 - 60 && o.x < view.x1 + 60 && o.y > view.y0 - 140 && o.y < view.y1 + 60;
  for (const o of W.list) {
    const K = KIND[o.k];
    if (o.stage === 'fall' && time - o.fallT0 > 1.3) o.stage = 'stump';
    if (o.shake > 0) o.shake = Math.max(0, o.shake - .04);
    if (K.refill && !o.ripe && day >= o.t) o.ripe = true;                                        // berries / reeds grow back in place
    if (K.fruit && o.stage === 'full' && o.fruit < K.fruit && day >= o.t) { o.fruit++; o.t = day + K.fruitDays; }
    if (o.stage === 'stump' && day >= o.t && !seen(o)) { o.stage = 'sapling'; o.g = .15; o.t = day; }
    if (o.stage === 'sapling') { o.g = Math.min(1, .15 + (day - o.t) / K.growDays * .85); if (o.g >= 1) { o.stage = 'full'; o.hp = K.hp; o.fruit = 0; o.t = day + (K.fruitDays || 0); } }
    if (o.stage === 'gone' && day >= o.t && !seen(o)) { o.stage = 'full'; o.hp = K.hp; o.v = Math.floor(W.rnd() * 3); }
  }
  if (newMorning) dailySpawn(W, seen);
}

/** Each morning: a few fallen sticks under trees and pebbles on beaches / river beds, up to a cap, never in view. */
export function dailySpawn(W, seen = () => false) {
  for (const k of ['stick', 'pebble']) {
    const K = KIND[k]; let have = W.list.filter(o => o.k === k).length, made = 0;
    for (let tries = 0; tries < 400 && have < K.cap && made < K.daily; tries++) {
      const x = W.rnd() * TSIZE, y = W.rnd() * TSIZE;
      if (suitability(W.t, k, x, y) * W.rnd() < .25 || seen({ x, y })) continue;
      if (k === 'stick' && !near(W, x, y, 50).some(o => o.k === 'tree' && o.stage === 'full')) continue;
      if (blocked(W, x, y, 4)) continue;
      add(W, k, x, y); have++; made++;
    }
  }
}

export function counts(W) { const c = {}; for (const o of W.list) if (o.stage !== 'gone') c[o.k] = (c[o.k] || 0) + 1; return c; }
export { TCELL };
