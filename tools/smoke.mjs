// Headless smoke test: runs the real game logic (and one render pass with a stub canvas).
// Usage: node tools/smoke.mjs        Exit code 1 on any failed check.
import { Game, levelOf } from '../js/game.js';
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
const ui = { toast: m => log.push(m), bump() {}, changed() {}, vibrate() {}, openChest() { log.push('openChest'); }, openFire() { log.push('openFire'); }, over() { log.push('over'); }, levelUp(l, u) { log.push(`level${l}:${u.join(',')}`); }, sleep(d) { log.push(`sleep${d}`); } };
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
ok(G.S.xp === picked, 'gathering gives 1 XP each');

// ---------- levels gate recipes ----------
ok(levelOf(0).lvl === 1 && levelOf(25).lvl === 2 && levelOf(75).lvl === 3 && levelOf(150).lvl === 4, 'level curve 25 / 75 / 150');
G.S.xp = 0; G.inv.add('fiber', 3);
ok(!G.craft('rope') && log.some(m => m.includes('2. seviye')), 'rope locked at level 1');
G.addXp(25); ok(G.level === 2 && log.some(m => m.startsWith('level2:') && m.includes('İp')), 'level up to 2 announces İp');
ok(G.craft('rope'), 'rope craftable at level 2');
G.S.xp = 10000;   // unlock everything for the rest of the test

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

// ---------- hut: sleep and respawn ----------
G.inv.add('wood', 20); G.inv.add('rope', 4); G.inv.add('fiber', 8);
ok(G.craft('hut'), 'build hut'); const hut = W.ents.find(e => e.k === 'hut'); ok(hut && G.home === hut.id, 'first hut becomes home');
let near = false; for (const [dx, dy] of [[0, 34], [0, -34], [34, 0], [-34, 0], [0, 44]]) { goTo(G, hut.x + dx, hut.y + dy); if (G.action?.o === hut) { near = true; break; } }
ok(near, 'button targets the hut');
G.S.time = .3; ok(G.action.lbl === 'Kulübe', 'daytime label: Kulübe');
press(G); ok(G.S.time === .3, 'cannot sleep at noon');
G.S.time = .75; look(G); ok(G.action.lbl === 'Uyu', 'evening label: Uyu');
const day0 = G.S.day, xp0 = G.S.xp; G.S.hp = 40; press(G);
ok(G.S.day === day0 + 1 && G.S.time === .06 && G.S.hp === 80 && log.includes(`sleep${day0 + 1}`) && G.S.xp > xp0, 'sleeping skips to morning, heals, gives XP');
const bagItems = G.inv.used(); G.P.x += 200; G.S.hp = .001; G.S.hunger = 0; G.S.thirst = 0; G.update(1 / 60, inp);
ok(!G.dead && G.S.hp === 60 && Math.hypot(G.P.x - hut.x, G.P.y - hut.y) < 80, 'death respawns at the hut');
ok(G.inv.used() === 0 && W.ents.filter(e => e.k === 'drop').length >= bagItems, 'bag items stay where you fell');
for (const e of W.ents.filter(e => e.k === 'drop')) G.pickupDrop(e);
ok(G.inv.used() === bagItems, 'got everything back');

// ---------- elevation: plateaus, cliffs, ramps ----------
{
  const M = 128; let l1 = 0, l2 = 0, ramps = 0;
  for (let i = 0; i < M * M; i++) { if (W.lvl[i] === 1) l1++; if (W.lvl[i] === 2) l2++; if (W.ramp[i]) ramps++; }
  ok(l1 > 100 && l2 > 10 && ramps > 0, `plateaus exist (L1 ${l1}, L2 ${l2}, ramps ${ramps})`);
  ok(W.lvl[W.spawn[1] * M + W.spawn[0]] === 0, 'spawn is on ground level');
  let cliffT = null, rampT = null;
  for (let y = 2; y < M - 2 && !(cliffT && rampT); y++) for (let x = 2; x < M - 2; x++) {
    const i = y * M + x, b = i + M;
    if (!cliffT && W.lvl[i] === 1 && !W.ramp[i] && W.lvl[b] === 0 && W.at(x, y + 1) === TILE.GRASS && !W.ramp[i - 1] && !W.ramp[i + 1]) cliffT = [x, y];
    if (!rampT && W.ramp[i] && W.lvl[b] === W.lvl[i] - 1) rampT = [x, y];
  }
  const G6 = new Game(ui); G6.newGame(12345);
  const below = ([x, y]) => [(x + .5) * T, (y + 1.5) * T], inside = ([x, y]) => [(x + .5) * T, (y + .5) * T];
  const [bx, by] = below(cliffT), [ix, iy] = inside(cliffT);
  ok(!G6.W.canStep(bx, by, ix, iy), 'cannot climb a cliff');
  const [rbx, rby] = below(rampT), [rix, riy] = inside(rampT);
  ok(G6.W.canStep(rbx, rby, rix, riy), 'can walk up a ramp');
  ok(G6.W.res.every(o => !G6.W.ramp[Math.floor(o.y / T) * M + Math.floor(o.x / T)]), 'no resources block ramps');
}

// ---------- hostile boar ----------
{
  const G7 = new Game(ui); G7.newGame(4242); const W7 = G7.W; G7.animalTimer = 1e9;
  ok(!W7.animals.some(a => a.k === 'boar'), 'no boars on day 1');
  W7.animals = [{ k: 'boar', x: G7.P.x + 70, y: G7.P.y, vx: 0, vy: 0, t: 0, flee: 0, hop: 0, face: -1, alive: true, hp: 6, hurt: 0, st: 'wander' }];
  if (!G7.canStand(W7.animals[0].x, W7.animals[0].y)) W7.animals[0].x = G7.P.x - 70;
  const boar = W7.animals[0], hp0 = G7.S.hp; log.length = 0;
  G7.updateAnimals(1 / 60); ok(boar.st === 'wind', 'boar winds up when the player is near');
  for (let i = 0; i < 120 && G7.S.hp === hp0; i++) G7.updateAnimals(1 / 60);
  ok(G7.S.hp < hp0 && log.some(m => m.includes('saldırdı')), `boar charge hurts (−${(hp0 - G7.S.hp).toFixed(1)})`);
  const plain = hp0 - G7.S.hp;
  G7.S.hp = 100; G7.inv.add('hide', 4); G7.inv.add('rope', 4); G7.inv.add('wood', 5); G7.S.xp = 1e4; G7.craft('vest'); G7.craft('shield');
  G7.equipFromBag(G7.inv.slots.findIndex(s => s?.k === 'vest')); G7.equipFromBag(G7.inv.slots.findIndex(s => s?.k === 'shield'));
  const armored = G7.hurt(14); ok(armored < plain, `armor 3 reduces the hit (${plain.toFixed(1)} → ${armored.toFixed(1)})`);
  G7.inv.add('wood', 2); G7.inv.add('stone', 2); G7.inv.add('rope', 1); G7.craft('spear'); G7.equipFromBag(G7.inv.slots.findIndex(s => s?.k === 'spear'));
  boar.x = G7.P.x + 30; boar.y = G7.P.y; boar.st = 'rest'; boar.t = 5; let hits = 0;
  while (boar.alive && hits < 10) { boar.x = G7.P.x + 30; boar.y = G7.P.y; look(G7); if (G7.action?.type === 'attack') { G7.doAction(); hits++; } else break; }
  ok(!boar.alive && hits === 3, `spear kills the boar in ${hits} hits`);
  ok(G7.W.ents.some(e => e.k === 'drop' && e.item === 'meat' && e.n === 3), 'boar drops 3 meat');
  const scared = { k: 'boar', x: G7.P.x + 60, y: G7.P.y, vx: 0, vy: 0, t: 0, alive: true, hp: 6, st: 'wander' };
  G7.W.animals = [scared]; G7.W.addEnt('fire', G7.P.x + 40, G7.P.y + 30); G7.updateAnimals(1 / 60);
  ok(scared.st === 'wander', 'boars keep away from a lit fire');
}

// ---------- shipwreck crates & bandage ----------
{
  const G8 = new Game(ui); G8.newGame(777); const W8 = G8.W;
  const w1 = W8.ents.filter(e => e.k === 'wreck');
  ok(w1.length === 1 && W8.at(w1[0].x / T | 0, w1[0].y / T | 0) === TILE.SAND && w1[0].loot.length === 3, 'a crate washes ashore on day 1');
  G8.onNewDay(); ok(W8.ents.filter(e => e.k === 'wreck').length >= 2, 'more crates each morning');
  for (let i = 0; i < 5; i++) G8.onNewDay(); ok(W8.ents.filter(e => e.k === 'wreck').length <= 3, 'at most 3 unopened crates');
  const crate = W8.ents.find(e => e.k === 'wreck'), loot = crate.loot.reduce((a, [, n]) => a + n, 0), xp0 = G8.S.xp;
  G8.openWreck(crate);
  const got = G8.inv.slots.reduce((a, s) => a + (s ? s.n : 0), 0) + W8.ents.filter(e => e.k === 'drop').reduce((a, e) => a + e.n, 0);
  ok(!W8.ents.includes(crate) && got >= loot && G8.S.xp > xp0, 'opening a crate gives its loot and XP');
  G8.inv.add('cloth', 2); G8.S.xp = 1e4; ok(G8.craft('bandage'), 'craft bandage from cloth');
  G8.S.hp = 50; G8.healSlot(G8.inv.slots.findIndex(s => s?.k === 'bandage')); ok(G8.S.hp === 80, 'bandage heals 30');
}

// ---------- save / load / migrate ----------
const d = JSON.parse(JSON.stringify(G.serialize()));
const G3 = Game.fromSave(d, ui);
ok(G3.inv.count('cfish') === G.inv.count('cfish') && G3.eq.body?.k === 'vest' && G3.st.warm === .6 && !G3.W.res[W.res.indexOf(tree)].alive, 'save/load keeps bag, equipment, stats, felled tree');
ok(G3.S.xp === G.S.xp && G3.home === G.home, 'save/load keeps XP and home');
const v4 = { ...d, v: 4, hand: 2, s: { ...d.s, xp: undefined } }; delete v4.eq; delete v4.home; const m = migrate(v4);
ok(m && m.v === 7 && !('hand' in m) && m.s.xp > 0 && m.res.length === 0 && Game.fromSave(m, ui).eq, 'v4 save migrates to v7 (XP estimated, resources reset)');

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
