// Ada 1 (demo): one continuous terrain with photo textures; the hex grid (tile width S) lives on top as game logic.
//
// Input : GLTF loader, seed, lite flag
// Process: coast field e(x,z) [m, >0 = land] from a noisy radius + landing bay in the south (+z)
//          → height h(x,z) [m]: beach slope, rolling ground, a mountain (NE), a few hills, flattened village + camp
//          → splat weights per vertex (9 layers, see ground.js) from coast distance, slope, height, regions, noise
//          → terrain mesh (grid step 0.5 m); vegetation and rocks are scattered by nature.js
// Output: { group, heightAt(x,z), walkable(x,z), block(x,z,r), mask(canvas), span, spawn, shipPos, camp, material, RAD }
import * as THREE from 'three';
import { makeGroundMaterial, LAYERS } from './ground.js';

export const S = 2;                       // hex width [m] (pointy-top)
const ROW = S * Math.sqrt(3) / 2;
export const WATER = .28;                 // sea level [m]

const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function noise1(a, seed) { let v = 0; for (let k = 1; k <= 4; k++) v += Math.sin(a * (k * 2 + 1) + seed * (k + .37) * 7.1) / k; return v; }
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const fbm = (x, z) => vnoise(x, z) * .5 + vnoise(x * 2.1 + 5.3, z * 2.1 - 1.7) * .3 + vnoise(x * 4.3 - 2.1, z * 4.3 + 3.1) * .2;   // 0..1
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const hexCenter = (col, row) => [(col + (row & 1) * .5) * S, row * ROW];
export function hexAt(x, z) {
  const r0 = Math.round(z / ROW); let best = null, bd = 1e9;
  for (let row = r0 - 1; row <= r0 + 1; row++) {
    const c0 = Math.round(x / S - (row & 1) * .5);
    for (let col = c0 - 1; col <= c0 + 1; col++) { const [cx, cz] = hexCenter(col, row), d = (cx - x) ** 2 + (cz - z) ** 2; if (d < bd) { bd = d; best = [col, row]; } }
  }
  return best;
}

export async function buildIsland(loader, seed = 11, lite = false) {
  const R = rng(seed), group = new THREE.Group(), RAD = 25;

  // ---- 1. coast field (metres from the shore, + inland) ----
  const coast = (x, z) => {
    const a = Math.atan2(z, x), d = Math.hypot(x, z) / S;
    let rad = RAD * (.86 + .1 * noise1(a, seed) * .5 + .05 * Math.sin(a * 9 + seed));
    rad -= Math.exp(-((a - Math.PI / 2) ** 2) / .05) * 7;                       // landing bay
    return (rad - d) * S + (fbm(x * .08, z * .08) - .5) * 3;
  };
  // regions [m]
  const MTN = [20, -24], FOREST = [-22, -8], VILLAGE = [-4, -38];
  let beachZ = 0; for (let z = 0; z < 80; z += .25) if (coast(0, z) > 0) beachZ = z;
  const CAMP = [-8, beachZ - 12];
  const hills = []; for (let i = 0; i < 7; i++) { const a = R() * 6.28, d = 12 + R() * 26, p = [Math.cos(a) * d, Math.sin(a) * d]; if (coast(...p) > 10 && Math.hypot(p[0] - CAMP[0], p[1] - CAMP[1]) > 14) hills.push(p); }

  // dirt path: landing beach → camp → village (Catmull-Rom through control points, ~1 m steps)
  const ctrl = [[0, beachZ - 1], [-1, beachZ - 8], [-1.5, CAMP[1] - 2], [2, CAMP[1] - 12], [-2, -12], [-5, -26], [VILLAGE[0], VILLAGE[1] + 5]], path = [];
  for (let k = 0; k < ctrl.length - 1; k++) {
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)], n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    for (let i = 0; i < n; i++) { const t = i / n, t2 = t * t, t3 = t2 * t, c = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); path.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]); }
  }
  path.push(ctrl[ctrl.length - 1]);
  const pathDist = (x, z) => { let d = 1e9; for (let i = 0; i < path.length - 1; i++) { const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return d; };

  const rawH = (x, z) => {
    const e = coast(x, z);
    let h = e < 0 ? Math.max(-4, e * .7) + .22 : .22 + .5 * sstep(0, 6, e);
    const inland = sstep(3, 14, e);
    h += (fbm(x * .05, z * .05) - .4) * 2.2 * inland;
    const dm = Math.hypot(x - MTN[0], z - MTN[1]);
    h += (14 * Math.exp(-((dm / 11) ** 2)) + 4 * (fbm(x * .15, z * .15) - .3) * Math.exp(-((dm / 14) ** 2))) * inland;
    for (const [hx, hz] of hills) h += 2.6 * Math.exp(-(((x - hx) ** 2 + (z - hz) ** 2) / 20)) * inland;
    return e < 0 ? h : Math.max(h, .22 + .5 * sstep(0, 6, e));                // no inland puddles
  };
  const flats = [[...VILLAGE, 7], [...CAMP, 6]].map(([x, z, r]) => [x, z, r, rawH(x, z)]);
  const height = (x, z) => {
    let h = rawH(x, z);
    for (const [fx, fz, r, fh] of flats) h += (Math.max(fh, .7) - h) * sstep(r * 1.6, r, Math.hypot(x - fx, z - fz));
    return h;
  };

  // ---- 2. terrain grid ----
  const STEP = lite ? .8 : .5, HALF = Math.ceil((RAD * S + 14) / STEP) * STEP, N = Math.round(HALF * 2 / STEP) + 1;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = height(-HALF + i * STEP, -HALF + j * STEP);
  const heightAt = (x, z) => {
    const fi = Math.max(0, Math.min(N - 1.001, (x + HALF) / STEP)), fj = Math.max(0, Math.min(N - 1.001, (z + HALF) / STEP));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * N + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N] * (1 - u) + H[k + N + 1] * u) * v;
  };
  const slopeAt = (x, z) => Math.hypot(heightAt(x + .5, z) - heightAt(x - .5, z), heightAt(x, z + .5) - heightAt(x, z - .5));

  const forestAt0 = (x, z) => Math.hypot(x - FOREST[0], z - FOREST[1]) + (fbm(x * .1, z * .1) - .5) * 10;
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N - 1, N - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, w0 = new Float32Array(N * N * 4), w1 = new Float32Array(N * N * 4), w2 = new Float32Array(N * N);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v), i = Math.round((x + HALF) / STEP), j = Math.round((z + HALF) / STEP), h = H[j * N + i];
    pos.setY(v, h);
    const e = coast(x, z), sl = slopeAt(x, z), n1 = fbm(x * .12 + 7, z * .12), n2 = fbm(x * .3 - 3, z * .3 + 9);
    const W = new Float32Array(LAYERS); W[0] = 1;
    const over = (k, a) => { a = Math.max(0, Math.min(1, a)); for (let q = 0; q < LAYERS; q++) W[q] *= 1 - a; W[k] += a; };
    over(1, sstep(.55, .75, n1) + sstep(24, 12, forestAt0(x, z)) * .85);             // grass-dirt patches + forest floor
    over(3, sstep(.18, .4, sl) + sstep(26, 14, Math.hypot(x - MTN[0], z - MTN[1])) * .7);   // rocky dirt on slopes / foothills
    const pd = pathDist(x, z) + (n2 - .5) * .8;
    over(1, sstep(2.6, 1.2, pd)); over(3, sstep(1.5, .5, pd) * .6);               // worn path
    over(n2 > .5 ? 5 : 6, sstep(.45, .8, sl));                                      // rock faces
    over(7, sstep(8, 11, h) * sstep(.25, .5, sl));                                  // high rock
    over(2, 1 - sstep(3.5, 8, e + (n2 - .5) * 4));                                // beach sand
    over(8, Math.exp(-(((e + .3) / 1.1) ** 2)) * sstep(.42, .6, n1));               // pebbles at the waterline
    over(4, sstep(5.5, 3.5, Math.hypot(x - VILLAGE[0], z - VILLAGE[1]) + (n2 - .5) * 2));   // village paving
    w0.set(W.subarray(0, 4), v * 4); w1.set(W.subarray(4, 8), v * 4); w2[v] = W[8];
  }
  geo.setAttribute('w0', new THREE.BufferAttribute(w0, 4)); geo.setAttribute('w1', new THREE.BufferAttribute(w1, 4)); geo.setAttribute('w2', new THREE.BufferAttribute(w2, 1));
  geo.computeVertexNormals();
  const material = await makeGroundMaterial(lite);
  const terrain = new THREE.Mesh(geo, material); terrain.receiveShadow = true; terrain.castShadow = true;
  group.add(terrain);

  const forestAt = forestAt0;

  // ---- 4. walkability (per hex for blocks, per point for terrain) + land mask for the water shader ----
  const blocked = new Set(), key = (c, r) => c + ',' + r;
  const solid = new Set(), sk = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);          // 0.5 m cells blocked by trunks / rocks
  const addSolid = (x, z, r) => { for (let a = -r; a <= r; a += .5) for (let b = -r; b <= r; b += .5) if (a * a + b * b <= r * r) solid.add(sk(x + a, z + b)); };
  const walkable = (x, z) => heightAt(x, z) > WATER + .08 && slopeAt(x, z) < .6 && !blocked.has(key(...hexAt(x, z))) && !solid.has(sk(x, z));
  const block = (x, z, r) => { for (let row = Math.floor((z - r) / ROW) - 1; row <= (z + r) / ROW + 1; row++) for (let col = Math.floor((x - r) / S) - 1; col <= (x + r) / S + 1; col++) { const [cx, cz] = hexCenter(col, row); if (Math.hypot(cx - x, cz - z) < r) blocked.add(key(col, row)); } };
  const MW = 512, span = (RAD + 14) * S * 2, mask = document.createElement('canvas'); mask.width = mask.height = MW;
  const g = mask.getContext('2d'), img = g.createImageData(MW, MW);
  for (let py = 0; py < MW; py++) for (let px = 0; px < MW; px++) {
    const x = (px / MW - .5) * span, z = (.5 - py / MW) * span, h = heightAt(x, z);
    const v = Math.round(255 * .95 * Math.max(0, Math.min(1, (h + 4) / (4 + WATER))) ** 2), o = (py * MW + px) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);

  const shipPos = new THREE.Vector3(3, 0, beachZ + 15);
  const spawn = new THREE.Vector3(0, 0, beachZ - 4); spawn.y = heightAt(spawn.x, spawn.z);
  const camp = new THREE.Vector3(CAMP[0], 0, CAMP[1]); camp.y = heightAt(camp.x, camp.z);
  return { group, heightAt, slopeAt, coast, forestAt, pathDist, path, walkable, block, addSolid, mask, span, spawn, shipPos, camp, material, RAD, MTN, VILLAGE, CAMP, beachZ };
}
