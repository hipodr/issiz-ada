// Headless smoke test: runs the real game logic (and one render pass with a stub canvas).
// Usage: node tools/smoke.mjs        Exit code 1 on any failed check.
import { Game } from '../js/game.js';
import { T, TILE, isSeaTile } from '../js/config.js';
import { ITEMS } from '../js/data/items.js';
import { RECIPES } from '../js/data/recipes.js';
import { ICON } from '../js/data/icons.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`); if (!cond) fails++; };
const log = [];
const ui = { toast: m => log.push(m), bump() {}, changed() {}, vibrate() {}, openChest() { log.push('openChest'); }, over() { log.push('over'); } };
const inp = { jx: 0, jy: 0, act: false, actCd: 0, axis() { return { x: this.jx, y: this.jy }; } };
const run = (G, sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) { if (G.dead) break; G.update(dt, inp); } };
const goTo = (G, x, y) => { G.P.x = x; G.P.y = y; G.target = G.findTarget(); };
const standNear = (G, o, d = 16) => { for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0], [d, d], [-d, d]]) if (G.canStand(o.x + dx, o.y + dy)) { goTo(G, o.x + dx, o.y + dy); G.face(o.x, o.y); G.target = G.findTarget(); return true; } return false; };

// data integrity
for (const k of Object.keys(ITEMS)) ok(ICON[k], `icon for item ${k}`);
for (const r of RECIPES) for (const k of Object.keys(r.cost)) ok(ITEMS[k], `recipe ${r.id} cost item ${k} exists`);

const G = new Game(ui); G.newGame(12345);
const W = G.W, cnt = k => W.res.filter(o => o.k === k).length;
console.log('island', W.res.length, 'resources; trees', cnt('tree'), 'rocks', cnt('rock'), 'sticks', cnt('stick'), 'ponds', W.ponds.length, 'rabbits', W.animals.length);
ok(W.ponds.length >= 3, 'at least 3 ponds');
ok(G.canStand(G.P.x, G.P.y), 'spawn is standable');

// bare hands: tree locked
const tree = W.res.find(o => o.k === 'tree' && o.alive);
standNear(G, tree, 22); ok(G.target?.o === tree && G.target.locked, 'tree locked without axe');
G.act(); ok(tree.hp === 3, 'tree untouched without axe');

// pick up ground items
let picked = 0;
for (const o of W.res.filter(o => (o.k === 'stick' || o.k === 'pebble') && o.alive).slice(0, 12)) { if (standNear(G, o, 10) && G.target?.o === o) { G.act(); picked++; } }
ok(picked >= 8 && G.inv.count('wood') + G.inv.count('stone') === picked, `picked ${picked} ground items`);

// crafting & tools
G.inv.add('wood', 20); G.inv.add('stone', 20); G.inv.add('fiber', 20);
ok(G.craft('axe') && G.craft('pick') && G.craft('rope') && G.craft('rope') && G.craft('rope'), 'craft axe, pick, 3 rope');
standNear(G, tree, 22); ok(!G.target.locked && G.target.lbl === 'Kes', 'tree unlocked with axe');
const w0 = G.inv.count('wood'); for (let i = 0; i < 3; i++) G.act();
ok(!tree.alive && G.inv.count('wood') === w0 + 3, 'tree felled for 3 wood');
ok(G.inv.slots[G.inv.toolIndex('axe')].d === 37, 'axe wore 3 uses');
G.inv.slots[G.inv.toolIndex('axe')].d = 1; const t2 = W.res.find(o => o.k === 'tree' && o.alive); standNear(G, t2, 22); G.act();
ok(!G.inv.has('axe') && log.includes('Balta kırıldı!'), 'axe breaks at 0 durability');

// fire + cooking
ok(G.craft('fire'), 'build fire'); const fire = W.ents.find(e => e.k === 'fire');
ok(!!fire, 'fire exists');
G.inv.add('fish', 3); goTo(G, fire.x, fire.y + 22); G.target = G.findTarget();
ok(G.target?.lbl === 'Pişir', 'fire offers cooking when raw food in bag');
G.act(); ok(G.inv.count('cfish') === 3 && !G.inv.count('fish'), 'cooked 3 fish');

// bag limits: 16 slots x 20
const G2 = new Game(ui); G2.newGame(7);
const left = G2.inv.add('stone', 400);
ok(left === 400 - 16 * 20 && G2.inv.used() === 16, 'bag holds 16 x 20 stones');
log.length = 0; G2.give('wood', 2); ok(W !== G2.W && G2.W.ents.some(e => e.k === 'drop' && e.item === 'wood'), 'overflow drops on ground');

// chest
ok(G.craft('chest'), 'build chest'); const chest = W.ents.find(e => e.k === 'chest'); ok(chest?.slots?.length === 16, 'chest has 16 slots');

// fishing at the shore
G.inv.add('rope', 6); G.inv.add('wood', 10); ok(G.craft('rod'), 'craft rod');
let shore = null;
for (let y = 0; y < 128 && !shore; y++) for (let x = 0; x < 128; x++) {
  if (W.at(x, y) !== TILE.SAND) continue; const wx = (x + .5) * T, wy = (y + .5) * T;
  if (G.canStand(wx, wy) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isSeaTile(W.tileAt(wx + dx * 30, wy + dy * 30)))) { shore = [wx, wy]; break; }
}
goTo(G, ...shore); G.animalTimer = 999; W.animals = [];
ok(G.target?.type === 'sea', 'rod + shore → fishing target');
const f0 = G.inv.count('fish'); G.act(); ok(!!G.fishing, 'line cast');
for (let i = 0; i < 600 && !G.fishing.bite; i++) G.updateFishing(1 / 60);
ok(G.fishing.bite, 'fish bites'); G.target = G.findTarget(); G.act();
ok(G.inv.count('fish') === f0 + 1 && G.done.fish, 'fish caught');

// hunting
G.craft('bow'); G.craft('arrow');
W.animals = [{ k: 'rabbit', x: G.P.x + 100, y: G.P.y, vx: 0, vy: 0, t: 99, flee: 0, hop: 0, face: 1, alive: true }];
if (!W.landAt(W.animals[0].x, W.animals[0].y)) W.animals[0].x = G.P.x - 100;
G.target = G.findTarget(); ok(G.target?.type === 'animal' && G.target.lbl === 'Ok at', 'bow + rabbit → shoot target');
const a0 = G.inv.count('arrow'); G.act(); for (let i = 0; i < 60; i++) G.updateArrows(1 / 60);
ok(G.inv.count('arrow') === a0 - 1 && !W.animals[0].alive && W.ents.some(e => e.k === 'drop' && e.item === 'meat'), 'rabbit shot, meat dropped');

// eating raw can make sick; coconut leaves a shell
G.inv.add('coconut', 1); G.eatSlot(G.inv.slots.findIndex(s => s && s.k === 'coconut')); ok(G.inv.count('shell') === 1, 'coconut leaves a shell');
ok(G.craft('canteen'), 'craft canteen');

// save / load round trip
const d = JSON.parse(JSON.stringify(G.serialize()));
const G3 = Game.fromSave(d, ui);
ok(G3.inv.count('cfish') === G.inv.count('cfish') && G3.W.ents.length === G.W.ents.length && !G3.W.res[W.res.indexOf(tree)].alive, 'save/load keeps bag, structures, felled tree');

// long run: day/night, starvation → death
const G4 = new Game(ui); G4.newGame(99); log.length = 0;
run(G4, 400); ok(G4.S.day >= 2, `time advances (day ${G4.S.day})`);
G4.S.hunger = 0; G4.S.thirst = 0; run(G4, 200); ok(G4.dead && log.includes('over'), 'starvation ends the game');

// render pass with stub canvas
const stub = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : (t[k] ??= stub()), apply: () => stub(), set: (t, k, v) => (t[k] = v, true) });
globalThis.window = { innerWidth: 400, innerHeight: 820, devicePixelRatio: 3 };
globalThis.document = { createElement: () => ({ getContext: () => stub() }) };
const { Renderer } = await import('../js/render/renderer.js');
const R = new Renderer({ getContext: () => stub() });
G.S.time = .8; G.fishing = { bx: G.P.x + 40, by: G.P.y, bite: true }; R.draw(G, true); R.draw(G, false);
ok(true, 'render pass (night, fishing) did not throw');

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
