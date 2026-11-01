// Headless checks for the hero on the new map.  node tools/herotest.mjs
import { generateTerrain, TCELL } from '../js/map/terrain.js';
import { surfaceAt, walkable } from '../js/map/sample.js';
import { createHero, createFx, stepHero, equip, use, actionLabel } from '../js/play/hero.js';
import { TOOLS, TOOL_IDS, buildToolMesh } from '../js/hero/tools.js';
import { createWorld2, counts, tick, near, KIND, suitability, blocked } from '../js/world2/objects.js';
import { buildModels } from '../js/world2/models.js';
import { pose, buildMeshes, BONE, M4, WALK, RUN } from '../js/hero/model.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
const finite = a => a.every(Number.isFinite);

// --- model ---
const meshes = buildMeshes();
ok(meshes.every(m => m.pos.length === m.nrm.length && m.pos.length === m.col.length && finite(m.pos) && finite(m.nrm)), `meshes valid (${meshes.reduce((a, m) => a + m.pos.length / 9, 0)} triangles)`);
for (const st of [{ speed: 0, time: 3 }, { speed: WALK, phase: 1 }, { speed: RUN, phase: 2.2 }, { speed: 0, torch: true }, { speed: WALK, phase: .4, wade: 6 }]) {
  const p = pose(st), top = M4.apply(p.W[BONE.head], 0, 0, 6)[2];
  const soles = p.feet.map(f => f[2]);
  ok(p.W.every(finite) && Math.abs(Math.min(...soles)) < 1 && top > 28 && top < 36, `pose ${JSON.stringify(st)}: grounded, height ${top.toFixed(1)}`);
}
{ const p = pose({ torch: true }); ok(p.tip[2] > 20, `torch held up (tip z ${p.tip[2].toFixed(1)})`); }

// --- walking on several islands ---
for (const seed of [1, 42, 777, 20261101]) {
  const t = generateTerrain(seed), h = createHero(t.spawn.x, t.spawn.y), marks = { prints: [], rings: [] };
  ok(walkable(t, h.x, h.y), `seed ${seed}: spawn is walkable (${surfaceAt(t, h.x, h.y).kind})`);
  // walk straight out to sea from the beach: must stop before deep water, leave prints, make rings when wading
  const c = { x: t.mountain.x, y: t.mountain.y }, ax = h.x - c.x, ay = h.y - c.y, l = Math.hypot(ax, ay), dir = { x: ax / l * .7, y: ay / l * .7 };
  let time = 0, wet = false;
  for (let i = 0; i < 240; i++) { time += 1 / 60; stepHero(h, { x: -dir.y, y: dir.x }, 1 / 60, t, marks, time); }   // along the shore first
  const printsOnBeach = marks.prints.length;
  for (let i = 0; i < 600; i++) { time += 1 / 60; stepHero(h, dir, 1 / 60, t, marks, time); if (h.water > 1) wet = true; }
  const s = surfaceAt(t, h.x, h.y);
  ok(!s.deep, `seed ${seed}: walking seaward stops before deep water (${s.kind}, water ${s.water.toFixed(1)})`);
  ok(printsOnBeach >= 2, `seed ${seed}: footprints on the beach (${printsOnBeach})`);
  ok(wet && marks.rings.length > 0, `seed ${seed}: wading in shallow water makes rings (${marks.rings.length})`);
  // walk towards the cave along the trail polyline: should get close
  const trail = t.trails[0];
  if (trail) {
    const h2 = createHero(t.spawn.x, t.spawn.y); let k = 0;
    for (let i = 0; i < 60 * 120 && k < trail.length; i++) {
      const [cx, cy] = trail[k], tx = (cx + .5) * TCELL, ty = (cy + .5) * TCELL, dx = tx - h2.x, dy = ty - h2.y, d = Math.hypot(dx, dy);
      if (d < 10) { k++; continue; }
      stepHero(h2, { x: dx / d * .7, y: dy / d * .7 }, 1 / 60, t, marks, i / 60);
    }
    const dc = Math.hypot(h2.x - t.cave.x, h2.y - t.cave.y);
    ok(dc < 90, `seed ${seed}: hero can walk the trail to the cave (ends ${dc.toFixed(0)} units away)`);
  }
}

// --- speeds: running is faster than walking; uphill slower ---
{
  const t = generateTerrain(1), h1 = createHero(t.spawn.x, t.spawn.y), h2 = createHero(t.spawn.x, t.spawn.y), mk = { prints: [], rings: [] };
  const ax = t.mountain.x - h1.x, ay = t.mountain.y - h1.y, l = Math.hypot(ax, ay);                            // inland
  for (let i = 0; i < 60; i++) { stepHero(h1, { x: ax / l * .5, y: ay / l * .5 }, 1 / 60, t, mk, i); stepHero(h2, { x: ax / l, y: ay / l }, 1 / 60, t, mk, i); }
  ok(h2.speed > h1.speed * 1.4, `running (${h2.speed.toFixed(0)}) faster than walking (${h1.speed.toFixed(0)})`);
}
// --- tools ---
{
  const t = generateTerrain(1);
  for (const id of TOOL_IDS) {
    if (TOOLS[id].hand) { const m = buildToolMesh(id); ok(m.pos.length > 0 && finite(m.pos) && finite(m.nrm), `${id}: mesh (${m.pos.length / 9} tris)`); }
    const h = createHero(t.spawn.x, t.spawn.y), mk = { prints: [], rings: [] }, fx = createFx();
    ok(equip(h, id) && h.tool === id, `${id}: equip`);
    let time = 0, bad = false, maxTip = -1e9;
    use(h);
    ok(!equip(h, 'club') || id === 'club', `${id}: cannot switch mid-action`);
    for (let i = 0; i < 60 * 3; i++) {
      time += 1 / 60; stepHero(h, { x: 0, y: 0 }, 1 / 60, t, mk, time, fx);
      if (!h.pose.W.every(finite)) bad = true;
      maxTip = Math.max(maxTip, h.pose.pts.tip[2]);
    }
    ok(!bad && h.actT == null, `${id}: action plays to the end (${TOOLS[id].act.dur}s), pose stays finite`);
    if (id === 'bow') for (const at of [.3, .55, .6]) {                                  // the nocked arrow points where he faces
      const p = pose({ tool: 'bow', act: at }), g = p.pts.bowGrip, r = p.pts.handR, off = Math.atan2(g[0] - r[0], g[1] - r[1]) * 180 / Math.PI;
      ok(Math.abs(off) < 5, `bow at ${at}: arrow ${off.toFixed(1)}° off the facing direction`);
    }
    if (TOOLS[id].shoots) ok(fx.projectiles.length === 1 && fx.projectiles[0].stuck, `${id}: ${TOOLS[id].shoots} flies and sticks in the ground`);
    if (['axe', 'pick'].includes(id)) ok(maxTip > 30, `${id}: raised overhead during the swing (tip z ${maxTip.toFixed(0)})`);
    if (id === 'rod') {
      ok(!!h.line && h.line.state === 'float' && actionLabel(h) === 'Çek', 'rod: bobber lands and the button turns into Çek');
      use(h); for (let i = 0; i < 60 * 3; i++) { time += 1 / 60; stepHero(h, { x: 0, y: 0 }, 1 / 60, t, mk, time, fx); }
      ok(!h.line && actionLabel(h) === 'Olta at', 'rod: second press reels the line in');
    }
  }
}
// --- island objects ---
{
  const ms = buildModels(); ok(Object.values(ms).every(m => m.pos.length && finite(m.pos) && finite(m.nrm)), `object models (${Object.keys(ms).length})`);
  for (const seed of [1, 42]) {
    const t = generateTerrain(seed), W = createWorld2(t, seed), c = counts(W);
    ok(c.tree > 80 && c.palm > 20 && c.rock > 30 && c.saz > 30 && c.bush > 20, `seed ${seed}: objects placed ${JSON.stringify(c)}`);
    const bad = W.list.filter(o => suitability(t, o.k, o.x, o.y) <= 0);
    ok(bad.length === 0, `seed ${seed}: every object stands where its kind belongs (${bad.length} misplaced)`);
    ok(!near(W, t.spawn.x, t.spawn.y, 50).some(o => Math.hypot(o.x - t.spawn.x, o.y - t.spawn.y) < 50), `seed ${seed}: landing beach left free`);
  }
  const t = generateTerrain(1), W = createWorld2(t, 1), far = { x0: -9999, y0: -9999, x1: -9000, y1: -9000 }, here = o => ({ x0: o.x - 50, x1: o.x + 50, y0: o.y - 50, y1: o.y + 50 });
  const act = (h, tool, o, n = 1) => {          // stand next to o facing it, use the tool n times
    const a = Math.atan2(h.y - o.y, h.x - o.x); h.x = o.x + Math.cos(a) * ((KIND[o.k].r || 0) * o.s + 9); h.y = o.y + Math.sin(a) * ((KIND[o.k].r || 0) * o.s + 9); h.yaw = a + Math.PI;
    equip(h, tool); let time = 0;
    for (let i = 0; i < n; i++) { use(h); for (let f = 0; f < 70; f++) { time += 1 / 60; stepHero(h, { x: 0, y: 0 }, 1 / 60, t, { prints: [], rings: [] }, time, createFx()); } }
    return time;
  };
  const h = createHero(0, 0); h.world = W;
  const tree = W.list.find(o => o.k === 'tree');
  act(h, 'hand', tree, 2); ok(tree.stage === 'full' && !h.inv.wood, 'bare hands do not fell a tree');
  act(h, 'axe', tree, 6); ok(tree.stage === 'fall' && h.inv.wood === 4, `6 axe blows fell a tree (+${h.inv.wood} wood)`);
  tick(W, 0, far, 100); ok(tree.stage === 'stump', 'leaves a stump');
  tick(W, 7, here(tree), 100); ok(tree.stage === 'stump', 'stump does not sprout while you watch');
  tick(W, 7.1, far, 100); ok(tree.stage === 'sapling', 'sprouts later, out of view');
  tick(W, 11, far, 100); ok(tree.stage === 'full' && tree.hp === KIND.tree.hp, 'grows back into a tree');
  const rock = W.list.find(o => o.k === 'rock');
  act(h, 'axe', rock, 2); ok(rock.stage === 'full', 'an axe does not break rock');
  act(h, 'pick', rock, 5); ok(rock.stage === 'gone' && h.inv.stone === 3, 'pick breaks a rock (+3 stone)');
  tick(W, 20, far, 100); ok(rock.stage === 'gone', 'rocks take long to come back');
  tick(W, 24, far, 100); ok(rock.stage === 'full', 'rock returns after ~12 days, out of view');
  const bush = W.list.find(o => o.k === 'bush');
  act(h, 'hand', bush); ok(h.inv.berry === 3 && !bush.ripe, 'picking berries by hand (crouch)');
  tick(W, 25, far, 100); ok(!bush.ripe, 'berries need time'); tick(W, 27, far, 100); ok(bush.ripe, 'berries grow back in ~2.5 days');
  const saz = W.list.find(o => o.k === 'saz');
  act(h, 'hand', saz); ok(h.inv.fiber === 2 && !saz.ripe, 'fiber comes from reeds (saz)');
  const palm = W.list.find(o => o.k === 'palm'); palm.fruit = 2;
  const nBefore = W.list.filter(o => o.k === 'coconut').length;
  act(h, 'club', palm); ok(palm.fruit === 1 && W.list.filter(o => o.k === 'coconut').length === nBefore + 1, 'shaking a palm drops a coconut');
  const nut = W.list.filter(o => o.k === 'coconut').pop(); act(h, 'hand', nut); ok(h.inv.coconut === 1, 'pick up the coconut');
  const sticks = W.list.filter(o => o.k === 'stick').length;
  W.list.filter(o => o.k === 'stick').slice(0, 20).forEach(o => { W.list.splice(W.list.indexOf(o), 1); });
  tick(W, 28.5, far, 100); tick(W, 29.3, far, 100);
  ok(W.list.filter(o => o.k === 'stick').length > sticks - 20, 'new sticks appear in the morning');
  ok(blocked(W, tree.x + 2, tree.y, 5) && !blocked(W, saz.x, saz.y, 5), 'tree trunks block, reeds do not');
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall hero checks passed');
process.exit(fails ? 1 : 0);
