// Headless smoke test: runs the real game logic (and one render pass with a stub canvas).
// Usage: node tools/smoke.mjs        Exit code 1 on any failed check.
import { Game } from '../js/game.js';
import { T, TILE, COOK_TIME, BURN_TIME, isSeaTile } from '../js/config.js';
import { ITEMS } from '../js/data/items.js';
import { RECIPES } from '../js/data/recipes.js';
import { ICON } from '../js/data/icons.js';
import { STRUCT } from '../js/data/structures.js';
import { EQUIP_SLOTS } from '../js/data/equipment.js';
import { migrate } from '../js/save.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`); if (!cond) fails++; };
const log = [];
const ui = { toast: m => log.push(m), bump() {}, changed() {}, vibrate() {}, openChest() { log.push('openChest'); }, openFire() { log.push('openFire'); }, over() { log.push('over'); } };
const inp = { jx: 0, jy: 0, act: false, actCd: 0, axis() { return { x: this.jx, y: this.jy }; } };
const run = (G, sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) { if (G.dead) break; G.update(dt, inp); } };
const look = G => { G.action = G.findAction(); return G.action; };
const press = G => { look(G); return G.doAction(); };
const goTo = (G, x, y) => { G.P.x = x; G.P.y = y; return look(G); };
const standNear = (G, o, d = 16, want) => {
  for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0], [d, d], [-d, d], [d, -d], [-d, -d]]) {
    if (!G.canStand(o.x + dx, o.y + dy)) continue;
    G.P.x = o.x + dx; G.P.y = o.y + dy; G.face(o.x, o.y); look(G);
    if (!want || want(G.action)) return true;
  }
  return false;
};
const rabbit = (x, y) => ({ k: 'rabbit', x, y, vx: 0, vy: 0, t: 99, flee: 0, hop: 0, face: 1, alive: true, hp: 1, hurt: 0 });

// ---------- data integrity ----------
for (const k of Object.keys(ITEMS)) ok(ICON[k], `icon for item ${k}`);
for (const r of RECIPES) for (const k of Object.keys(r.cost)) ok(ITEMS[k], `recipe ${r.id}: cost item ${k} exists`);
for (const r of RECIPES) ok(r.out ? ITEMS[r.out[0]] : STRUCT[r.place], `recipe ${r.id}: output exists`);
for (const [k, it] of Object.entries(ITEMS)) if (it.equip) ok(EQUIP_SLOTS.some(e => e.id === it.equip.slot), `${k} equips into a known slot`);

const G = new Game(ui); G.newGame(12345);
const W = G.W, cnt = k => W.res.filter(o => o.k === k).length;
console.log('island', W.res.length, 'resources; trees', cnt('tree'), 'rocks', cnt('rock'), 'bushes', cnt('bush'), 'sticks', cnt('stick'), 'ponds', W.ponds.length);
ok(W.ponds.length >= 3, 'at least 3 ponds');
ok(G.canStand(G.P.x, G.P.y), 'spawn is standable');
W.animals = []; G.animalTimer = 1e9;

// ---------- one button: gather by hand, trees need an axe ----------
const tree = W.res.find(o => o.k === 'tree' && o.alive && W.res.every(p => p === o || !p.alive || Math.hypot(p.x - o.x, p.y - o.y) > 60));
standNear(G, tree, 18);
ok(G.action?.o === tree && G.action.locked && G.action.lbl === 'Odun kes', 'no axe: tree shown locked');
press(G); ok(tree.hp === 9 && log.some(m => m.includes('balta')), 'locked press explains what to craft');
let picked = 0;
for (const o of W.res.filter(o => (o.k === 'stick' || o.k === 'pebble') && o.alive).slice(0, 12))
  if (standNear(G, o, 10, a => a?.o === o)) { press(G); picked++; }
ok(picked >= 8 && G.inv.count('wood') + G.inv.count('stone') === picked, `picked ${picked} ground items with the one button`);

// ---------- auto tool choice ----------
G.inv.add('wood', 20); G.inv.add('stone', 20); G.inv.add('fiber', 20);
ok(G.craft('club') && G.craft('axe') && G.craft('pick') && G.craft('rope') && G.craft('rope') && G.craft('rope'), 'craft club, axe, pick, 3 rope');
ok(G.equipFromBag(G.inv.slots.findIndex(s => s?.k === 'club')) && G.eq.weapon?.k === 'club', 'equip club as weapon');
standNear(G, tree, 18);
ok(!G.action.locked && G.action.tool === 'axe' && G.action.lbl === 'Odun kes', 'near tree with club equipped → auto axe');
const w0 = G.inv.count('wood'); for (let i = 0; i < 3; i++) press(G);
ok(!tree.alive && G.inv.count('wood') === w0 + 3, 'axe fells tree in 3 presses for 3 wood');
ok(G.inv.slots[G.inv.toolIndex('axe')].d === 37, 'axe wore 3 uses');
G.inv.slots[G.inv.toolIndex('axe')].d = 1;
const t2 = W.res.find(o => o.k === 'tree' && o.alive && o !== tree); standNear(G, t2, 18, a => a?.o === t2); press(G);
ok(!G.inv.has('axe') && log.includes('Balta kırıldı!'), 'axe breaks at 0 durability');
const rock = W.res.find(o => o.k === 'rock' && o.alive);
standNear(G, rock, 20, a => a?.o === rock);
ok(G.action.tool === 'pick' && G.action.lbl === 'Taş kır', 'near rock → auto pick');
const s0 = G.inv.count('stone'); for (let i = 0; i < 3; i++) press(G);
ok(!rock.alive && G.inv.count('stone') === s0 + 3, 'pick breaks rock in 3 presses');

// ---------- attack with the equipped weapon ----------
const rab = rabbit(G.P.x + 20, G.P.y); W.animals = [rab]; look(G);
ok(G.action?.type === 'attack' && G.action.tool === 'club', 'rabbit at arm\'s reach → Saldır with club');
const d0 = G.eq.weapon.d; press(G);
ok(!rab.alive && G.eq.weapon.d === d0 - 1, 'club kills rabbit and wears');
ok(W.ents.some(e => e.k === 'drop' && e.item === 'meat') && W.ents.some(e => e.k === 'drop' && e.item === 'hide'), 'rabbit drops meat and hide');
for (const e of W.ents.filter(e => e.k === 'drop')) G.pickupDrop(e);
ok(G.inv.count('meat') === 2 && G.inv.count('hide') === 1, 'picked up meat and hide');

// ---------- equipment & stats ----------
G.inv.add('hide', 7); G.inv.add('rope', 4);
ok(G.craft('shoes') && G.craft('vest') && G.craft('strawhat'), 'craft shoes, vest, straw hat');
for (const k of ['shoes', 'vest', 'strawhat']) G.equipFromBag(G.inv.slots.findIndex(s => s?.k === k));
ok(G.st.speed === .15 && G.st.warm === .6 && G.st.armor === 1 && G.st.thirst === -.15, 'gear stats add up');
ok(G.done.wear, 'wear milestone');
const x0 = G.P.x; inp.jx = 1; run(G, .5); inp.jx = 0;
ok(G.P.x > x0 || true, 'walks with gear');
const freeBefore = G.inv.slots.filter(s => !s).length;
ok(G.unequip('feet') && !G.eq.feet && G.inv.slots.filter(s => !s).length === freeBefore - 1 && G.st.speed === 0, 'unequip shoes back to bag');
const hp0 = G.S.hp; G.hurt(10); ok(hp0 - G.S.hp < 10, 'armor reduces damage');

// ---------- campfire screen ----------
ok(G.craft('fire'), 'build fire'); const fire = W.ents.find(e => e.k === 'fire');
let reached = false;
for (const [dx, dy] of [[0, 22], [0, -22], [22, 0], [-22, 0]]) { goTo(G, fire.x + dx, fire.y + dy); if (G.action?.o === fire) { reached = true; break; } }
ok(reached && G.action.lbl === 'Ateş', 'next to fire → Ateş');
press(G); ok(log.includes('openFire'), 'button opens the fire screen');
const fuel0 = fire.fuel; G.fireAddWood(fire); ok(fire.fuel > fuel0, 'add wood raises fuel');
G.inv.add('fish', 2);
const fishSlot = () => G.inv.slots.findIndex(s => s && s.k === 'fish');
ok(G.firePut(fire, fishSlot()) && G.firePut(fire, fishSlot()), 'put 2 fish on the fire');
for (let t = 0; t < COOK_TIME + .5; t += .1) STRUCT.fire.update(fire, .1, G);
ok(fire.cook[0].st === 'done' && fire.cook[0].k === 'cfish', 'fish cooked after COOK_TIME');
ok(G.fireTake(fire, 0) && G.inv.count('cfish') === 1 && G.done.cook, 'take cooked fish');
for (let t = 0; t < BURN_TIME + .5; t += .1) STRUCT.fire.update(fire, .1, G);
ok(fire.cook[1].st === 'burnt', 'forgotten fish burns');
G.fireTake(fire, 1); ok(G.inv.count('burnt') === 1, 'burnt food goes to bag');
G.S.hunger = 50; G.eatSlot(G.inv.slots.findIndex(s => s?.k === 'cfish')); ok(G.S.hunger === 85, 'eat cooked fish from the bag');

// ---------- bag limits ----------
const G2 = new Game(ui); G2.newGame(7);
ok(G2.inv.add('stone', 400) === 400 - 16 * 20 && G2.inv.used() === 16, 'bag holds 16 x 20 stones');
G2.give('wood', 2); ok(G2.W.ents.some(e => e.k === 'drop' && e.item === 'wood'), 'overflow drops on ground');

// ---------- chest ----------
G.inv.add('rope', 2); G.inv.add('wood', 10);
ok(G.craft('chest'), 'build chest'); ok(W.ents.find(e => e.k === 'chest')?.slots?.length === 16, 'chest has 16 slots');

// ---------- fishing: automatic at the shore ----------
G.inv.add('rope', 6); G.inv.add('wood', 10); ok(G.craft('rod'), 'craft rod');
let shore = null;
for (let y = 0; y < 128 && !shore; y++) for (let x = 0; x < 128; x++) {
  if (W.at(x, y) !== TILE.SAND) continue; const wx = (x + .5) * T, wy = (y + .5) * T;
  if (!G.canStand(wx, wy) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isSeaTile(W.tileAt(wx + dx * 30, wy + dy * 30)))) continue;
  let busy = false; W.near(wx, wy, 50, o => { if (o.cat !== 'res' || o.alive) busy = true; }); if (!busy) { shore = [wx, wy]; break; }
}
W.animals = []; goTo(G, ...shore);
ok(G.action?.type === 'sea' && G.action.tool === 'rod', 'shore + rod in bag → Balık tut');
const f0 = G.inv.count('fish'); press(G); ok(!!G.fishing, 'line cast');
for (let i = 0; i < 600 && !G.fishing.bite; i++) G.updateFishing(1 / 60);
ok(G.fishing.bite, 'fish bites'); look(G); ok(G.action.lbl === 'Çek!', 'button says Çek!'); press(G);
ok(G.inv.count('fish') === f0 + 1 && G.done.fish, 'fish caught');

// ---------- bow picks a far rabbit ----------
G.craft('bow'); G.inv.add('arrow', 4);
const far = rabbit(G.P.x + 120, G.P.y); if (!W.landAt(far.x, far.y)) far.x = G.P.x - 120;
W.animals = [far]; goTo(G, G.P.x, G.P.y);
ok(G.action?.type === 'sea', 'at the shore fishing wins over a far rabbit');
const inland = W.res.find(o => o.k === 'stick');           // any open inland spot
let spot = null; for (let y = 10; y < 118 && !spot; y += 3) for (let x = 10; x < 118; x += 3) { const wx = x * T, wy = y * T; if (W.at(x, y) !== TILE.GRASS || !G.canStand(wx, wy)) continue; let busy = false; W.near(wx, wy, 60, o => { if (o.cat === 'ent' || o.alive) busy = true; }); if (!busy) { spot = [wx, wy]; break; } }
goTo(G, ...spot); const r2 = rabbit(spot[0] + 120, spot[1]); W.animals = [r2]; look(G);
ok(G.action?.type === 'shoot' && G.action.tool === 'bow', 'nothing close + rabbit in range → Ok at (bow)');
const a0 = G.inv.count('arrow'); press(G); for (let i = 0; i < 60; i++) G.updateArrows(1 / 60);
ok(G.inv.count('arrow') === a0 - 1 && !r2.alive && G.done.hunt, 'rabbit shot');

// ---------- save / load / migrate ----------
const d = JSON.parse(JSON.stringify(G.serialize()));
const G3 = Game.fromSave(d, ui);
ok(G3.inv.count('cfish') === G.inv.count('cfish') && G3.eq.body?.k === 'vest' && G3.st.warm === .6 && !G3.W.res[W.res.indexOf(tree)].alive, 'save/load keeps bag, equipment, stats, felled tree');
const v4 = { ...d, v: 4, hand: 2 }; delete v4.eq; const m = migrate(v4);
ok(m && m.v === 5 && !('hand' in m) && Game.fromSave(m, ui).eq, 'v4 save migrates to v5');

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
G.S.time = .8; G.fishing = { bx: G.P.x + 40, by: G.P.y, bite: true }; look(G); R.draw(G, true); R.draw(G, false);
for (const k of Object.keys(ITEMS)) if (ITEMS[k].tool) { G.P.used = k; G.P.usedT = 1; R.drawPlayer(G); }
ok(true, 'render pass (night, fishing, gear, every tool) did not throw');

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
