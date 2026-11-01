// 3D meshes for world objects (object space: base at the origin, z up, units = world units; hero ≈ 33 tall).
// Input : nothing (fixed seeds per variant) · Output: MODELS[name] = { pos, nrm, col } Float32Arrays
// Names: tree0..2, treeTop0..2 (canopy only, for fading), palm0..1, palmFruit, bush0..1, berries0..1, saz, sazCut,
//        rock0..2, stump, sapling, stick, pebble, coconut
import { ellipsoid, cyl } from '../hero/geom.js';
import { mulberry32 } from '../util.js';

const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BARK = hex('#6e5139'), BARK_D = hex('#4f3a28'), LEAF = hex('#4c7a2c'), LEAF_L = hex('#6f9a3c'), LEAF_D = hex('#2f5420');
const PALM_BARK = hex('#8f7556'), FROND = hex('#5f8f34'), FROND_D = hex('#3f6a24'), NUT = hex('#6b4a2a');
const BUSH = hex('#3e6a2a'), BERRY = hex('#c4283c'), REED = hex('#7f9a45'), REED_TIP = hex('#c4b26a'), CATTAIL = hex('#5a3a22');
const ROCK = hex('#8a8a86'), ROCK_D = hex('#6a6a66'), MOSS = hex('#5f7a3a'), WOOD_IN = hex('#c9a46b');

const mesh = () => ({ pos: [], nrm: [], col: [] });
const fin = m => ({ pos: new Float32Array(m.pos), nrm: new Float32Array(m.nrm), col: new Float32Array(m.col) });

/** Faceted rock: displaced sphere with flat normals (low-poly stone look). */
function rock(m, cx, cy, cz, rx, ry, rz, seed, col = ROCK, seg = 9, ring = 6) {
  const r = mulberry32(seed), N = [];
  for (let j = 0; j <= ring; j++) { const row = []; for (let i = 0; i < seg; i++) row.push(.78 + r() * .4); N.push(row); }
  const P = (i, j) => {
    const th = (i % seg) / seg * Math.PI * 2, ph = j / ring * Math.PI * .62;               // lower part is buried
    const k = N[j][i % seg]; return [cx + Math.sin(ph) * Math.cos(th) * rx * k, cy + Math.sin(ph) * Math.sin(th) * ry * k, cz + Math.cos(ph) * rz * k];
  };
  const tri = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    if (n[2] < -.2) n = n.map(x => -x);
    const shade = mix(col, ROCK_D, r() * .45), c2 = n[2] > .75 && r() < .35 ? mix(shade, MOSS, .5) : shade;
    for (const p of [a, b, c]) { m.pos.push(...p); m.nrm.push(...n); m.col.push(...c2); }
  };
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); tri(a, b, c); tri(a, c, d); }
}

function tree(v) {
  const r = mulberry32(100 + v), m = mesh(), top = mesh();
  const H = 58 + v * 6, lean = [(r() - .5) * 6, (r() - .5) * 6];
  cyl(m, [0, 0, -1], [lean[0] * .5, lean[1] * .5, H * .45], 3.6, 2.6, BARK, 9);
  cyl(m, [lean[0] * .5, lean[1] * .5, H * .45], [lean[0], lean[1], H * .72], 2.6, 1.6, BARK, 8);
  for (let i = 0; i < 4; i++) { const a = r() * 6.28, b = [Math.cos(a) * 3, Math.sin(a) * 3, H * (.15 + r() * .2)]; cyl(m, [0, 0, -.5], b.map((x, k) => k < 2 ? x * 1.8 : 0), 1.6, .3, BARK_D, 5); }   // roots
  for (let i = 0; i < 3; i++) { const a = r() * 6.28, z = H * (.42 + r() * .15); cyl(m, [lean[0] * .4, lean[1] * .4, z], [Math.cos(a) * 12 + lean[0], Math.sin(a) * 12 + lean[1], z + 10], 1.4, .6, BARK, 5); }
  const cz = H * .7, blobs = 7 + v;
  ellipsoid(top, [lean[0], lean[1], cz], [20, 20, 15], (u, w, z) => mix(LEAF, LEAF_D, Math.max(0, -z) * .6 + .1), { seg: 12, ring: 8 });
  for (let i = 0; i < blobs; i++) {
    const a = i / blobs * 6.28 + r(), d = 10 + r() * 8, z = cz + (r() - .45) * 12, R = 10 + r() * 6;
    const base = r() < .5 ? LEAF : LEAF_L;
    ellipsoid(top, [Math.cos(a) * d + lean[0], Math.sin(a) * d + lean[1], z], [R, R, R * .8], (u, w, zz) => mix(base, LEAF_D, Math.max(0, -zz) * .7), { seg: 9, ring: 6 });
  }
  return [fin(m), fin(top)];
}

function palm(v) {
  const r = mulberry32(200 + v), m = mesh(), H = 66 + v * 8, bend = 12 + v * 5;
  const pt = t => [bend * t * t, 0, H * t];
  for (let i = 0; i < 9; i++) {
    const a = pt(i / 9), b = pt((i + 1) / 9), rr = 2.6 - i * .12;
    cyl(m, a, b, rr + .35, rr, i % 2 ? PALM_BARK : mix(PALM_BARK, BARK_D, .35), 8);
  }
  const t = pt(1);
  ellipsoid(m, t, [3.2, 3.2, 2.6], FROND_D, { seg: 8, ring: 5 });
  // fronds: a drooping midrib with thin leaflets on both sides (feather-like)
  for (let f = 0; f < 10; f++) {
    const a = f / 10 * 6.28 + r() * .3, droop = .55 + r() * .5, L = 28 + r() * 6, ca = Math.cos(a), sa = Math.sin(a);
    let p = t;
    for (let s = 1; s <= 7; s++) {
      const u = s / 7, q = [t[0] + ca * L * u, t[1] + sa * L * u, t[2] + 7 * u - droop * 26 * u * u];
      cyl(m, p, q, .55 * (1 - u * .6), .45 * (1 - u * .6), FROND_D, 4);
      const w = 8 * Math.sin(u * Math.PI * .85 + .15);                                    // leaflet length along the frond
      for (const side of [-1, 1]) for (const k of [.3, .75]) {
        const b = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
        const e = [b[0] - sa * side * w + ca * w * .35, b[1] + ca * side * w + sa * w * .35, b[2] - w * .45];
        cyl(m, b, e, .7, .08, (s + side) % 3 ? FROND : mix(FROND, FROND_D, .45), 3);
      }
      p = q;
    }
  }
  return fin(m);
}
function palmFruit() { const m = mesh(); for (let i = 0; i < 3; i++) { const a = i * 2.1; ellipsoid(m, [Math.cos(a) * 2.6, Math.sin(a) * 2.6, -2.4], [2.1, 2.1, 2.3], NUT, { seg: 7, ring: 5 }); } return fin(m); }

function bush(v) {
  const r = mulberry32(300 + v), m = mesh();
  for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = r() * 6, R = 6 + r() * 3; ellipsoid(m, [Math.cos(a) * d, Math.sin(a) * d, 6 + r() * 4], [R, R, R * .85], (u, w, z) => mix(BUSH, LEAF_D, Math.max(0, -z) * .7 + r() * .1), { seg: 8, ring: 6 }); }
  return fin(m);
}
function berries(v) { const r = mulberry32(400 + v), m = mesh(); for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = 5 + r() * 5, z = 8 + r() * 6; ellipsoid(m, [Math.cos(a) * d, Math.sin(a) * d, z], [1.4, 1.4, 1.4], BERRY, { seg: 6, ring: 4 }); } return fin(m); }

function saz(cut) {
  const r = mulberry32(cut ? 501 : 500), m = mesh();
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.28, d = r() * 4, L = cut ? 3 + r() * 3 : 16 + r() * 12, out = cut ? .5 : 3 + r() * 4;
    const b = [Math.cos(a) * d, Math.sin(a) * d, 0], tip = [b[0] + Math.cos(a) * out, b[1] + Math.sin(a) * out, L];
    cyl(m, b, tip, .55, .06, (i % 3 ? REED : mix(REED, REED_TIP, .35)), 4);
    if (!cut && i % 4 === 0) cyl(m, [tip[0] * .85, tip[1] * .85, L * .72], [tip[0] * .92, tip[1] * .92, L * .86], .95, .9, CATTAIL, 6);
  }
  return fin(m);
}

function stump() { const m = mesh(); cyl(m, [0, 0, -1], [0, 0, 5], 3.8, 3.4, BARK, 9); ellipsoid(m, [0, 0, 5], [3.3, 3.3, .5], WOOD_IN, { seg: 9, ring: 3 }); return fin(m); }
function sapling() { const m = mesh(); cyl(m, [0, 0, 0], [0, 0, 16], .7, .35, BARK, 5); for (let i = 0; i < 4; i++) { const a = i * 1.6; ellipsoid(m, [Math.cos(a) * 3, Math.sin(a) * 3, 12 + i * 1.3], [3, 3, 2], LEAF_L, { seg: 6, ring: 4 }); } return fin(m); }
function stick() { const m = mesh(); cyl(m, [-6, 0, .7], [6, .5, .7], .65, .5, BARK, 5); cyl(m, [1, .3, .7], [4, 3, .7], .4, .2, BARK, 4); return fin(m); }
function pebble() { const m = mesh(); rock(m, 0, 0, 0, 2.2, 1.8, 1.4, 61, ROCK, 6, 4); rock(m, 3, 1.5, 0, 1.5, 1.4, 1, 62, mix(ROCK, [.8, .75, .65], .4), 6, 4); return fin(m); }
function coconut() { const m = mesh(); ellipsoid(m, [0, 0, 2], [2.3, 2.3, 2.2], NUT, { seg: 8, ring: 6 }); return fin(m); }

export function buildModels() {
  const M = {};
  for (let v = 0; v < 3; v++) { const [a, b] = tree(v); M['tree' + v] = a; M['treeTop' + v] = b; }
  for (let v = 0; v < 2; v++) { M['palm' + v] = palm(v); M['bush' + v] = bush(v); M['berries' + v] = berries(v); }
  M.palmFruit = palmFruit();
  for (let v = 0; v < 3; v++) { const m = mesh(); rock(m, 0, 0, 0, 11, 9, 9 + v * 2, 70 + v); if (v === 2) rock(m, 8, 5, 0, 5, 4, 4, 80); M['rock' + v] = fin(m); }
  M.saz = saz(false); M.sazCut = saz(true);
  M.stump = stump(); M.sapling = sapling(); M.stick = stick(); M.pebble = pebble(); M.coconut = coconut();
  return M;
}
/** Height of the palm top (for the coconut cluster) for variant v. */
export const palmTop = v => [12 + v * 5, 0, 66 + v * 8];
