// Headless checks for the hero on the new map.  node tools/herotest.mjs
import { generateTerrain, TCELL } from '../js/map/terrain.js';
import { surfaceAt, walkable } from '../js/map/sample.js';
import { createHero, stepHero } from '../js/play/hero.js';
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
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall hero checks passed');
process.exit(fails ? 1 : 0);
