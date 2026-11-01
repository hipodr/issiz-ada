// Headless checks for the map generator (js/map/terrain.js).  node tools/maptest.mjs [--ppm out.ppm]
import { generateTerrain, packTerrain, TN, TCELL } from '../js/map/terrain.js';
import { writeFileSync } from 'node:fs';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
const seeds = [1, 2, 3, 7, 42, 777, 20261101, 123456];

for (const seed of seeds) {
  const t0 = Date.now(), t = generateTerrain(seed), ms = Date.now() - t0, N = TN;
  console.log(`seed ${seed}: ${ms} ms`);
  let land = 0, beach = 0, high = 0, reef = 0, river = 0, trail = 0, trailWet = 0, cliff = 0;
  for (let i = 0; i < N * N; i++) {
    if (t.H[i] > 0) { land++; if (t.H[i] < .03 && !t.K[i]) beach++; if (t.H[i] > t.maxH * .6) high++; if (t.K[i] > .5) cliff++; }
    if (t.H[i] <= 0 && t.F[i] > .3) reef++;
    if (t.R[i] > .5 && t.H[i] > 0) river++;
    if (t.P[i] > .5) { trail++; if (t.H[i] <= 0 || t.R[i] > .6) trailWet++; }
  }
  const frac = land / (N * N);
  ok(frac > .28 && frac < .6, `island covers ${(frac * 100).toFixed(0)}% of the map`);
  ok(beach > land * .03, `beaches (${beach} cells)`);
  ok(cliff > 10, `some rocky coast / cliffs (${cliff})`);
  ok(t.maxH > .6 && high > 200, `a mountain (peak ${t.maxH.toFixed(2)}, ${high} high cells)`);
  ok(t.river.length > 60, `river polyline (${t.river.length} pts)`);
  if (t.river.length) {
    const [sx, sy] = t.river[0], [ex, ey] = t.river[t.river.length - 1];
    const h0 = t.H[Math.floor(sy / TCELL) * N + Math.floor(sx / TCELL)], h1 = t.H[Math.floor(ey / TCELL) * N + Math.floor(ex / TCELL)];
    ok(h0 > t.maxH * .2 && h1 < 0, `river runs from the mountain (${h0.toFixed(2)}) to the sea (${h1.toFixed(2)})`);
  }
  ok(river > 60, `river water on land (${river} cells)`);
  ok(!!t.cave, 'cave found');
  if (t.cave) { const h = t.H[Math.floor(t.cave.y / TCELL) * N + Math.floor(t.cave.x / TCELL)]; ok(h > t.maxH * .3, `cave is on the mountain side (h ${h.toFixed(2)})`); }
  ok(!!t.spawn && t.trails.length >= 1, `trail from the beach to the cave (${t.trails.map(l => l.length).join('+')} cells)`);
  ok(trail > 40 && trailWet < trail * .1, `trail painted on dry land (${trail} cells, ${trailWet} wet)`);
  ok(t.clearings.length >= 2, `clearings (${t.clearings.length})`);
  console.log(`  reef cells: ${reef}`);
  const { A, B, C } = packTerrain(t);
  ok([A, B, C].every(x => x.length === N * N * 4), 'packed three RGBA textures');
}

const out = process.argv.indexOf('--ppm');
if (out > 0) {   // quick false-colour preview of the first seed (no GPU needed)
  const t = generateTerrain(seeds[0]), N = TN, px = Buffer.alloc(N * N * 3);
  for (let i = 0; i < N * N; i++) {
    const h = t.H[i]; let c;
    if (h <= 0) c = t.F[i] > .3 ? [230, 120, 110] : [20, 80 + 120 * Math.exp(h * 12), 160 + 60 * Math.exp(h * 12)];
    else if (t.R[i] > .5) c = [40, 120, 220];
    else if (t.P[i] > .5) c = [150, 110, 70];
    else if (t.K[i] > .5) c = [90, 90, 90];
    else if (h < .03 && t.dSea[i] < 7) c = [225, 205, 150];
    else { const g = 1 - h / t.maxH; c = [60 + 120 * (1 - g), 90 + 90 * g * (1 - t.M[i] * .4), 50 + 40 * (1 - g)]; }
    if (t.F[i] > .5 && h > 0) c = [c[0] + 30, c[1] + 40, c[2]];
    px.set(c.map(v => Math.max(0, Math.min(255, v | 0))), i * 3);
  }
  if (t.cave) { const cx = Math.floor(t.cave.x / TCELL), cy = Math.floor(t.cave.y / TCELL); for (let d = -2; d <= 2; d++) for (let e = -2; e <= 2; e++) px.set([0, 0, 0], ((cy + d) * N + cx + e) * 3); }
  writeFileSync(process.argv[out + 1], Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), px]));
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall map checks passed');
process.exit(fails ? 1 : 0);
