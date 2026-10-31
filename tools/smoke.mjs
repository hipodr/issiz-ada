// Headless smoke test: runs the real game logic (and one render pass with a stub canvas).
// Usage: node tools/smoke.mjs        Exit code 1 on any failed check.
import { Game } from '../js/game.js';
import { T, TILE, HOTBAR, COOK_TIME, BURN_TIME, isSeaTile } from '../js/config.js';
import { ITEMS } from '../js/data/items.js';
import { RECIPES } from '../js/data/recipes.js';
import { ICON } from '../js/data/icons.js';
import { STRUCT } from '../js/data/structures.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`); if (!cond) fails++; };
const log = [];
const ui = { toast: m => log.push(m), bump() {}, changed() {}, vibrate() {}, openChest() { log.push('openChest'); }, openFire(e) { log.push('openFire'); }, over() { log.push('over'); } };
const inp = { jx: 0, jy: 0, use: false, useCd: 0, grab: false, grabCd: 0, axis() { return { x: this.jx, y: this.jy }; } };
const run = (G, sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) { if (G.dead) break; G.update(dt, inp); } };
const refresh = G => { G.grabT = G.findGrab(); G.useT = G.findUse(); };
const goTo = (G, x, y) => { G.P.x = x; G.P.y = y; refresh(G); };
const standNear = (G, o, d = 16) => {
  for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0], [d, d], [-d, d]]) if (G.canStand(o.x + dx, o.y + dy)) { G.P.x = o.x + dx; G.P.y = o.y + dy; G.face(o.x, o.y); refresh(G); return true; }
  return false;
};
const hold = (G, k) => { const i = G.inv.slots.findIndex(s => s && s.k === k); if (i < 0) return false; if (i >= HOTBAR) { const t = G.inv.slots[0]; G.inv.slots[0] = G.inv.slots[i]; G.inv.slots[i] = t; G.hand = 0; } else G.hand = i; refresh(G); return true; };

// ---------- data integrity ----------
for (const k of Object.keys(ITEMS)) ok(ICON[k], `icon for item ${k}`);
for (const r of RECIPES) for (const k of Object.keys(r.cost)) ok(ITEMS[k], `recipe ${r.id}: cost item ${k} exists`);
for (const r of RECIPES) ok(r.out ? ITEMS[r.out[0]] : STRUCT[r.place], `recipe ${r.id}: output exists`);

const G = new Game(ui); G.newGame(12345);
const W = G.W, cnt = k => W.res.filter(o => o.k === k).length;
console.log('island', W.res.length, 'resources; trees', cnt('tree'), 'rocks', cnt('rock'), 'sticks', cnt('stick'), 'ponds', W.ponds.length, 'rabbits', W.animals.length);
ok(W.ponds.length >= 3, 'at least 3 ponds');
ok(G.canStand(G.P.x, G.P.y), 'spawn is standable');

// ---------- El button: gather by hand ----------
const tree = W.res.find(o => o.k === 'tree' && o.alive);
standNear(G, tree, 22);
ok(G.grabT?.o !== tree, 'tree is not a grab target');
ok(G.useT?.o === tree && G.useT.locked && G.useT.lbl === 'Alet seç', 'empty hand: tree locked on Kullan');
G.doUse(); ok(tree.hp === 9, 'tree untouched without axe');
let picked = 0;
for (const o of W.res.filter(o => (o.k === 'stick' || o.k === 'pebble') && o.alive).slice(0, 12)) { if (standNear(G, o, 10) && G.grabT?.o === o) { G.doGrab(); picked++; } }
ok(picked >= 8 && G.inv.count('wood') + G.inv.count('stone') === picked, `picked ${picked} ground items with El`);
ok(G.inv.slots.slice(0, HOTBAR).every(s => !s), 'materials avoid the hotbar');

// ---------- crafting, club is a weapon, axe cuts ----------
G.inv.add('wood', 20); G.inv.add('stone', 20); G.inv.add('fiber', 20);
ok(G.craft('club') && G.craft('axe') && G.craft('pick') && G.craft('rope') && G.craft('rope') && G.craft('rope'), 'craft club, axe, pick, 3 rope');
ok(G.inv.slots.slice(0, HOTBAR).filter(Boolean).length === 3, 'tools land in the hotbar');
W.animals = []; G.animalTimer = 999; hold(G, 'club'); standNear(G, tree, 22);
ok(G.useT?.locked, 'club does not cut trees');
hold(G, 'axe'); standNear(G, tree, 22);
ok(!G.useT.locked && G.useT.lbl === 'Kes', 'axe in hand → Kes');
const w0 = G.inv.count('wood'); for (let i = 0; i < 3; i++) { refresh(G); G.doUse(); }
ok(!tree.alive && G.inv.count('wood') === w0 + 3, 'axe fells tree in 3 hits for 3 wood');
ok(G.held().d === 37, 'axe wore 3 uses');
G.held().d = 1; const t2 = W.res.find(o => o.k === 'tree' && o.alive); standNear(G, t2, 22); G.doUse();
ok(!G.inv.has('axe') && log.includes('Balta kırıldı!'), 'axe breaks at 0 durability');
const rock = W.res.find(o => o.k === 'rock' && o.alive); hold(G, 'pick'); standNear(G, rock, 24);
const s0 = G.inv.count('stone'); for (let i = 0; i < 3; i++) { refresh(G); G.doUse(); }
ok(!rock.alive && G.inv.count('stone') === s0 + 3, 'pick breaks rock in 3 hits');

// ---------- club attack ----------
hold(G, 'club');
const rab = { k: 'rabbit', x: G.P.x + 20, y: G.P.y, vx: 0, vy: 0, t: 99, flee: 0, hop: 0, face: 1, alive: true, hp: 1, hurt: 0 };
W.animals = [rab]; refresh(G);
ok(G.useT?.type === 'attack', 'club + rabbit at arm\'s reach → Saldır');
G.doUse(); ok(!rab.alive && W.ents.some(e => e.k === 'drop' && e.item === 'meat'), 'club kills rabbit, meat dropped');

// ---------- campfire screen: wood + timed cooking + burning ----------
ok(G.craft('fire'), 'build fire'); const fire = W.ents.find(e => e.k === 'fire');
for (const e of W.ents.filter(e => e.k === 'drop')) G.pickupDrop(e);
ok(G.inv.count('meat') === 2, 'picked up the meat');
for (const [dx, dy] of [[0, 22], [0, -22], [22, 0], [-22, 0]]) { goTo(G, fire.x + dx, fire.y + dy); if (G.grabT?.o === fire) break; }
ok(G.grabT?.type === 'ent' && G.grabT.lbl === 'Ateş', 'El next to fire → Ateş');
G.doGrab(); ok(log.includes('openFire'), 'El opens the fire screen');
const fuel0 = fire.fuel; G.fireAddWood(fire); ok(fire.fuel > fuel0, 'add wood raises fuel');
G.inv.add('fish', 2);
const fishSlot = () => G.inv.slots.findIndex(s => s && s.k === 'fish');
ok(G.firePut(fire, fishSlot()) && G.firePut(fire, fishSlot()), 'put 2 fish on the fire');
ok(G.inv.count('fish') === 0 && fire.cook.filter(Boolean).length === 2, 'fish moved from bag to fire');
for (let t = 0; t < COOK_TIME + .5; t += .1) STRUCT.fire.update(fire, .1, G);
ok(fire.cook[0].st === 'done' && fire.cook[0].k === 'cfish', 'fish cooked after COOK_TIME');
ok(G.fireTake(fire, 0) && G.inv.count('cfish') === 1 && G.done.cook, 'take cooked fish');
for (let t = 0; t < BURN_TIME + .5; t += .1) STRUCT.fire.update(fire, .1, G);
ok(fire.cook[1].st === 'burnt', 'forgotten fish burns');
G.fireTake(fire, 1); ok(G.inv.count('burnt') === 1, 'burnt food goes to bag');
const out = { ...fire, fuel: 0, cook: [{ k: 'meat', t: 0, st: 'raw' }, null, null] };
STRUCT.fire.update(out, 20, G); ok(out.cook[0].st === 'raw', 'no cooking without fuel');

// ---------- eat from hand ----------
hold(G, 'cfish'); ok(G.useT?.type === 'eat', 'food in hand → Ye');
G.S.hunger = 50; G.doUse(); ok(G.S.hunger === 85, 'eating cooked fish +35');

// ---------- bag limits ----------
const G2 = new Game(ui); G2.newGame(7);
const left = G2.inv.add('stone', 400);
ok(left === 400 - 16 * 20 && G2.inv.used() === 16, 'bag holds 16 x 20 stones');
G2.give('wood', 2); ok(G2.W.ents.some(e => e.k === 'drop' && e.item === 'wood'), 'overflow drops on ground');

// ---------- chest ----------
G.inv.add('rope', 2); G.inv.add('wood', 10);
ok(G.craft('chest'), 'build chest'); const chest = W.ents.find(e => e.k === 'chest'); ok(chest?.slots?.length === 16, 'chest has 16 slots');

// ---------- fishing with rod in hand ----------
G.inv.add('rope', 6); G.inv.add('wood', 10); ok(G.craft('rod'), 'craft rod'); hold(G, 'rod');
let shore = null;
for (let y = 0; y < 128 && !shore; y++) for (let x = 0; x < 128; x++) {
  if (W.at(x, y) !== TILE.SAND) continue; const wx = (x + .5) * T, wy = (y + .5) * T;
  if (G.canStand(wx, wy) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isSeaTile(W.tileAt(wx + dx * 30, wy + dy * 30)))) { shore = [wx, wy]; break; }
}
W.animals = []; G.animalTimer = 999; goTo(G, ...shore);
ok(G.useT?.type === 'sea', 'rod in hand at shore → Balık tut');
const f0 = G.inv.count('fish'); G.doUse(); ok(!!G.fishing, 'line cast');
for (let i = 0; i < 600 && !G.fishing.bite; i++) G.updateFishing(1 / 60);
ok(G.fishing.bite, 'fish bites'); refresh(G); ok(G.useT.lbl === 'Çek!', 'button says Çek!'); G.doUse();
ok(G.inv.count('fish') === f0 + 1 && G.done.fish, 'fish caught');

// ---------- bow ----------
G.craft('bow'); G.craft('arrow'); hold(G, 'bow');
W.animals = [{ k: 'rabbit', x: G.P.x + 100, y: G.P.y, vx: 0, vy: 0, t: 99, flee: 0, hop: 0, face: 1, alive: true, hp: 1, hurt: 0 }];
if (!W.landAt(W.animals[0].x, W.animals[0].y)) W.animals[0].x = G.P.x - 100;
refresh(G); ok(G.useT?.type === 'animal' && G.useT.lbl === 'Ok at', 'bow in hand + rabbit → Ok at');
const a0 = G.inv.count('arrow'); G.doUse(); for (let i = 0; i < 60; i++) G.updateArrows(1 / 60);
ok(G.inv.count('arrow') === a0 - 1 && !W.animals[0].alive && G.done.hunt, 'rabbit shot');

// ---------- coconut → shell → canteen ----------
G.inv.add('coconut', 1); G.eatSlot(G.inv.slots.findIndex(s => s && s.k === 'coconut')); ok(G.inv.count('shell') === 1, 'coconut leaves a shell');
ok(G.craft('canteen'), 'craft canteen');

// ---------- save / load ----------
const d = JSON.parse(JSON.stringify(G.serialize()));
const G3 = Game.fromSave(d, ui);
ok(G3.inv.count('cfish') === G.inv.count('cfish') && G3.hand === G.hand && G3.W.ents.length === G.W.ents.length && !G3.W.res[W.res.indexOf(tree)].alive, 'save/load keeps bag, hand, structures, felled tree');
ok(G3.W.ents.find(e => e.k === 'fire').cook.length === 3, 'fire cook slots survive save');
const old = { ...d, v: 3 }; delete old.hand; old.ents = old.ents.map(e => e.k === 'fire' ? (({ cook, ...r }) => r)(e) : e);
const { MIGRATIONS_FOR_TEST } = await import('../js/save.js').then(m => ({ MIGRATIONS_FOR_TEST: m.migrate }));
const mig = MIGRATIONS_FOR_TEST(old); const G5 = Game.fromSave(mig, ui);
ok(mig.v === 4 && G5.hand === 0 && G5.W.ents.find(e => e.k === 'fire').cook.length === 3, 'v3 save migrates to v4');

// ---------- long run: day/night, starvation → death ----------
const G4 = new Game(ui); G4.newGame(99); log.length = 0;
run(G4, 500); ok(G4.S.day >= 2, `time advances (day ${G4.S.day})`);
G4.S.hunger = 0; G4.S.thirst = 0; run(G4, 200); ok(G4.dead && log.includes('over'), 'starvation ends the game');

// ---------- render pass with stub canvas ----------
const stub = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : (t[k] ??= stub()), apply: () => stub(), set: (t, k, v) => (t[k] = v, true) });
globalThis.window = { innerWidth: 400, innerHeight: 820, devicePixelRatio: 3 };
globalThis.document = { createElement: () => ({ getContext: () => stub() }) };
const { Renderer } = await import('../js/render/renderer.js');
const R = new Renderer({ getContext: () => stub() });
G.S.time = .8; G.fishing = { bx: G.P.x + 40, by: G.P.y, bite: true }; refresh(G); R.draw(G, true); R.draw(G, false);
for (const k of Object.keys(ITEMS)) { G.inv.slots[0] = { k, n: 1, d: 1 }; G.hand = 0; R.drawPlayer(G); }
ok(true, 'render pass (night, fishing, every held item) did not throw');

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
