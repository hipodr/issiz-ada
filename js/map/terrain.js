// Island terrain for the GPU map (v10 "Harita"). Pure data, no DOM → testable in node.
//
// Input  : seed (uint32)
// Process: shape → coast distances → heights (beaches / rocky cliffs / mountain / hills / sea floor, reef + lagoon)
//          → river (priority-flood drainage from a mountain spring) + delta → clearings → cave → trail → moisture → normals
// Output : fields of TN×TN cells (TCELL world units each), world size TSIZE×TSIZE:
//          H  height  (-1 deep sea … 0 water line … ~1 summit)      M    moisture 0..1
//          R  river water 0..1 (1 = channel)                         P    trail 0..1
//          F  feature 0..1 (clearing on land, coral reef at sea)     K    rock 0..1 (cliff coast, cave outcrop)
//          + river polyline, cave {x,y,ang}, spawn {x,y} in world units, and pack() → two RGBA8 textures.
import { mulberry32, vnoise, fbm, clamp } from '../util.js';

export const TN = 256;            // cells per side
export const TCELL = 16;          // world units per cell (old tile = 32 → 2×2 cells)
export const TSIZE = TN * TCELL;  // 4096 world units, same as the old 128×32 map
const NN = TN * TN;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];

class Heap {                       // min-heap of (key, value)
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/** Chamfer distance (in cells) from every cell to the nearest cell where src(i) is true. */
function distance(src) {
  const D = new Float32Array(NN).fill(1e9), N = TN, S2 = Math.SQRT2;
  for (let i = 0; i < NN; i++) if (src(i)) D[i] = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; let d = D[i];
    if (x > 0) d = Math.min(d, D[i - 1] + 1);
    if (y > 0) { d = Math.min(d, D[i - N] + 1); if (x > 0) d = Math.min(d, D[i - N - 1] + S2); if (x < N - 1) d = Math.min(d, D[i - N + 1] + S2); }
    D[i] = d;
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x; let d = D[i];
    if (x < N - 1) d = Math.min(d, D[i + 1] + 1);
    if (y < N - 1) { d = Math.min(d, D[i + N] + 1); if (x < N - 1) d = Math.min(d, D[i + N + 1] + S2); if (x > 0) d = Math.min(d, D[i + N - 1] + S2); }
    D[i] = d;
  }
  return D;
}

/** Chaikin corner cutting → smooth polyline. */
function smoothLine(pts, iters = 3) {
  for (let k = 0; k < iters; k++) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      out.push([ax * .75 + bx * .25, ay * .75 + by * .25], [ax * .25 + bx * .75, ay * .25 + by * .75]);
    }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts;
}

export function generateTerrain(seed) {
  seed = seed >>> 0;
  const N = TN, rnd = mulberry32(seed), s = seed % 9973;
  const H = new Float32Array(NN), M = new Float32Array(NN), R = new Float32Array(NN), P = new Float32Array(NN);
  const F = new Float32Array(NN), K = new Float32Array(NN);
  const at = (A, x, y) => A[clamp(Math.round(y), 0, N - 1) * N + clamp(Math.round(x), 0, N - 1)];

  // ---- 1. island shape: warped radial falloff + noisy coast; keep one island, fill inland water ----
  const S = new Float32Array(NN);
  const cx = N * (.5 + (rnd() - .5) * .06), cy = N * (.5 + (rnd() - .5) * .06);
  // peninsulas (lobes) and bays (bites) make the outline less round
  const lobes = [...Array(2 + Math.floor(rnd() * 2))].map(() => { const a = rnd() * 6.283; return [Math.cos(a) * .42, Math.sin(a) * .42, .2 + rnd() * .1]; });
  const bays = [...Array(2 + Math.floor(rnd() * 2))].map(() => { const a = rnd() * 6.283; return [Math.cos(a) * .7, Math.sin(a) * .7, .14 + rnd() * .1]; });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, nx = (x - cx) / (N * .5), ny = (y - cy) / (N * .5);
    const wx = nx + (fbm(x / 60, y / 60, s + 1) - .5) * .75, wy = ny + (fbm(x / 60 + 40, y / 60 + 40, s + 2) - .5) * .75;
    let v = .7 - Math.hypot(wx, wy);
    for (const [lx, ly, lr] of lobes) v = Math.max(v, (lr - Math.hypot(wx - lx, wy - ly)) * 1.1);
    for (const [bx, by, br] of bays) v = Math.min(v, (Math.hypot(wx - bx, wy - by) - br) * 1.2);
    S[i] = v + (fbm(x / 20, y / 20, s + 3) - .5) * .24 + (vnoise(x / 7, y / 7, s + 4) - .5) * .05;
    if (x < 6 || y < 6 || x >= N - 6 || y >= N - 6) S[i] = -1;
  }
  const land = new Uint8Array(NN);
  { // largest land component
    const comp = new Int32Array(NN).fill(-1); let best = -1, bestN = 0, id = 0;
    for (let i = 0; i < NN; i++) if (S[i] > 0 && comp[i] < 0) {
      const st = [i]; comp[i] = id; let n = 0;
      while (st.length) { const j = st.pop(); n++; const x = j % N, y = (j / N) | 0;
        for (const [dx, dy] of D8.slice(0, 4)) { const k = (y + dy) * N + x + dx; if (S[k] > 0 && comp[k] < 0) { comp[k] = id; st.push(k); } } }
      if (n > bestN) { bestN = n; best = id; } id++;
    }
    for (let i = 0; i < NN; i++) land[i] = comp[i] === best ? 1 : 0;
    // water not connected to the open sea becomes land (rivers make the only fresh water)
    const sea = new Uint8Array(NN), st = [0]; sea[0] = 1;
    while (st.length) { const j = st.pop(), x = j % N, y = (j / N) | 0;
      for (const [dx, dy] of D8.slice(0, 4)) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; const k = yy * N + xx; if (!land[k] && !sea[k]) { sea[k] = 1; st.push(k); } } }
    for (let i = 0; i < NN; i++) if (!sea[i]) land[i] = 1;
  }
  const dSea = distance(i => !land[i]), dLand = distance(i => land[i]);

  // ---- 2. heights ----
  const a0 = rnd() * Math.PI * 2, Mx = cx + Math.cos(a0) * N * .14, My = cy + Math.sin(a0) * N * .14, rM = N * .2;
  const a1 = a0 + Math.PI * (.7 + rnd() * .6), Hx = cx + Math.cos(a1) * N * .2, Hy = cy + Math.sin(a1) * N * .2, rH = N * .1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const rocky = ss(.56, .66, vnoise(x / 26, y / 26, s + 5));                // 0..1: cliff coast instead of beach
    if (land[i]) {
      const ds = dSea[i], dm = Math.hypot(x - Mx, y - My) / rM, dh = Math.hypot(x - Hx, y - Hy) / rH;
      const ridge = 1 - Math.abs(2 * vnoise(x / 14, y / 14, s + 6) - 1);
      const mount = Math.max(0, 1 - dm) ** 1.5 * (.62 + .38 * ridge), hill2 = Math.max(0, 1 - dh) ** 2 * (.7 + .3 * ridge);
      const inland = ss(0, 30, ds);
      let h = .03 + inland * (.1 + (fbm(x / 22, y / 22, s + 7) - .35) * .14) + mount * .85 * ss(3, 22, ds) + hill2 * .3 * ss(2, 12, ds);
      const b = ss(1.5, 8, ds), beachH = (.004 + ds * .005) * (1 - b) + h * b;
      const f = rocky * ss(9, 3, ds), cliffH = Math.max(h, .09 + ss(0, 3, ds) * .05 + vnoise(x / 3, y / 3, s + 11) * .03);
      h = beachH * (1 - rocky) + h * rocky; h += (cliffH - h) * f;              // cliffs only along the shore, fading inland
      K[i] = rocky * ss(3.5, 1.5, ds);
      H[i] = h;
    } else {
      const dl = dLand[i];
      let h = -.012 - dl * .011 - Math.max(0, dl - 6) * .02 + (vnoise(x / 9, y / 9, s + 12) - .5) * .012;
      h -= .04 * rocky * ss(4, 0, dl);
      // coral reef ring + sandy lagoon on some stretches of coast
      const z = ss(.55, .66, vnoise(x / 40, y / 40, s + 8)) * (1 - rocky);
      if (z > 0 && dl < 15) {
        const lagoon = -.028 - (vnoise(x / 5, y / 5, s + 13)) * .012, reef = -.006 + (vnoise(x / 2.5, y / 2.5, s + 14) - .5) * .012;
        const inner = ss(1, 2.5, dl) * ss(10, 8.5, dl), ring = ss(8, 9.5, dl) * ss(13, 11.5, dl);
        h = h * (1 - z * Math.max(inner, ring)) + z * (inner * lagoon + ring * reef);
        F[i] = Math.max(F[i], z * ring * ss(.3, .55, vnoise(x / 3, y / 3, s + 15)));
      }
      H[i] = Math.max(-1, h);
    }
  }

  // ---- 3. river: drainage via priority flood (parents point downhill to the sea) ----
  const parent = new Int32Array(NN).fill(-1), done = new Uint8Array(NN), Fill = new Float32Array(NN), hp = new Heap();
  for (let i = 0; i < NN; i++) if (!land[i]) { done[i] = 1; Fill[i] = H[i]; if (dLand[i] < 1.5) hp.push(H[i], i); }
  while (hp.size) {
    const i = hp.pop(), x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of D8.slice(0, 4)) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const j = yy * N + xx; if (done[j]) continue; done[j] = 1;
      const hr = H[j] + (vnoise(xx / 6, yy / 6, s + 9) - .5) * .03;            // wobble → meanders
      Fill[j] = Math.max(hr, Fill[i] + 1e-5); parent[j] = i; hp.push(Fill[j], j);
    }
  }
  let maxH = 0; for (let i = 0; i < NN; i++) if (H[i] > maxH) maxH = H[i];
  let route = null;
  for (let tries = 0; tries < 60; tries++) {
    const a = rnd() * Math.PI * 2, r = rM * (.2 + rnd() * .35), x = Math.round(Mx + Math.cos(a) * r), y = Math.round(My + Math.sin(a) * r);
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const i0 = y * N + x; if (!land[i0] || H[i0] < maxH * .45) continue;
    const pts = []; let i = i0;
    while (i >= 0 && land[i]) { pts.push(i); i = parent[i]; }
    if (i >= 0) pts.push(i);
    if (!route || pts.length > route.length) route = pts;
    if (route.length > 70 && tries > 10) break;
  }
  const riverPts = [];
  if (route) {
    let pts = route.map(i => [i % N, (i / N) | 0]);
    { // run on a few cells into the sea so the mouth opens cleanly
      const [ax, ay] = pts[Math.max(0, pts.length - 4)], [bx, by] = pts[pts.length - 1], l = Math.hypot(bx - ax, by - ay) || 1;
      for (let k = 1; k <= 4; k++) pts.push([bx + (bx - ax) / l * k, by + (by - ay) / l * k]);
    }
    { // meander: push the drainage line sideways with smooth noise (fades out at both ends)
      const n = pts.length, out = [];
      for (let k = 0; k < n; k++) {
        const a = pts[Math.max(0, k - 2)], b = pts[Math.min(n - 1, k + 2)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const w = (vnoise(k / 9, 3.3, s + 20) - .5) * 5 * ss(0, 12, k) * ss(n - 1, n - 14, k);
        const x = pts[k][0] - dy / l * w, y = pts[k][1] + dx / l * w;
        out.push(land[clamp(Math.round(y), 0, N - 1) * N + clamp(Math.round(x), 0, N - 1)] || k > n - 6 ? [x, y] : pts[k]);
      }
      pts = out;
    }
    pts = smoothLine(pts, 3);
    // arc length
    const L = [0]; for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    let mouthK = pts.findIndex(([x, y]) => at(H, x, y) < 0); if (mouthK < 0) mouthK = pts.length - 1;
    const [mx, my] = pts[mouthK];
    // delta plain: flatten the low ground around the mouth
    for (let y = Math.max(0, Math.floor(my - 18)); y <= Math.min(N - 1, my + 18); y++) for (let x = Math.max(0, Math.floor(mx - 18)); x <= Math.min(N - 1, mx + 18); x++) {
      const i = y * N + x; if (!land[i] || H[i] > .14 || K[i] > .5) continue;
      const f = ss(17, 6, Math.hypot(x - mx, y - my)) * .85;
      H[i] = H[i] * (1 - f) + (.006 + vnoise(x / 4, y / 4, s + 16) * .006) * f;
    }
    const H0 = Float32Array.from(H);                                           // pre-carve heights (bank depth limit)
    const carve = (line, w0, w1, lvl0) => {
      let level = lvl0;
      const L2 = [0]; for (let k = 1; k < line.length; k++) L2.push(L2[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
      const tot = L2[L2.length - 1] || 1;
      for (let k = 0; k < line.length; k++) {
        const [px, py] = line[k], t = L2[k] / tot, w = w0 + (w1 - w0) * t, ground = at(H, px, py);
        level = Math.min(level, ground) - .0003; const water = Math.max(level, .002);
        const r = Math.ceil(w + 3);
        for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(N - 1, py + r); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(N - 1, px + r); x++) {
          const i = y * N + x, d = Math.hypot(x - px, y - py);
          R[i] = Math.max(R[i], ss(w + .7, w - .5, d));
          if (!land[i]) continue;
          if (d < w + .3) H[i] = Math.min(H[i], Math.max(.0015, water - .004 - .008 * ss(w + .3, 0, d)));   // bed stays ≥ 0: it is river, not sea
          else H[i] = Math.min(H[i], Math.max(H0[i] - .05, water + (d - w) * .035));   // banks: a valley, never a deep canyon
          K[i] *= ss(w + 1, w + 2.5, d);
        }
      }
    };
    carve(pts, .7, 2.6, at(H, pts[0][0], pts[0][1]));
    // delta: two side branches leave the main channel ~20 cells before the sea
    let k0 = mouthK; while (k0 > 0 && L[mouthK] - L[k0] < 20) k0--;
    const [px, py] = pts[k0], dl = Math.hypot(mx - px, my - py) || 1, ux = (mx - px) / dl, uy = (my - py) / dl;
    for (const sg of [-1, 1]) {
      let ang = Math.atan2(uy, ux) + sg * (.55 + rnd() * .25), x = px, y = py; const br = [[x, y]];
      for (let st = 0; st < 90; st++) {
        ang += (vnoise(st / 6, sg * 9, s + 17) - .5) * .25;
        x += Math.cos(ang) * .6; y += Math.sin(ang) * .6; br.push([x, y]);
        if (at(H, x, y) < -.01) { for (let e = 0; e < 4; e++) { x += Math.cos(ang) * .6; y += Math.sin(ang) * .6; br.push([x, y]); } break; }
      }
      carve(smoothLine(br, 2), .9, 1.4, at(H, px, py));
    }
    for (const [x, y] of pts) riverPts.push([(x + .5) * TCELL, (y + .5) * TCELL]);
  }
  const dRiver = distance(i => R[i] > .5);

  // ---- 4. cave: a steep, rocky spot on the mountain side, opening downhill ----
  const gx = i => (H[i + 1] - H[i - 1]) / 2, gy = i => (H[i + N] - H[i - N]) / 2;
  let cave = null, bestScore = -1;
  for (let y = 4; y < N - 4; y++) for (let x = 4; x < N - 4; x++) {
    const i = y * N + x; if (!land[i] || H[i] < maxH * .35 || H[i] > maxH * .8 || dRiver[i] < 8 || dSea[i] < 10) continue;
    const g = Math.hypot(gx(i), gy(i)), score = g * (.8 + .4 * hash01(x, y, s));
    if (score > bestScore) { bestScore = score; cave = { cx: x, cy: y }; }
  }
  if (cave) {
    const i = cave.cy * N + cave.cx, ang = Math.atan2(-gy(i), -gx(i));     // downhill direction
    const ox = Math.cos(ang), oy = Math.sin(ang);
    for (let y = cave.cy - 6; y <= cave.cy + 6; y++) for (let x = cave.cx - 6; x <= cave.cx + 6; x++) {
      const j = y * N + x, dx = x - cave.cx, dy = y - cave.cy, d = Math.hypot(dx, dy), up = -(dx * ox + dy * oy);
      K[j] = Math.max(K[j], ss(5.5, 2.5, d));
      if (up > -1) H[j] += .05 * ss(5, 1, d) * ss(-1, 1.5, up);                  // rock face behind the opening
      else H[j] = H[j] * (1 - ss(4, 1.5, d) * .5) + (H[i] - .03) * ss(4, 1.5, d) * .5;   // small apron in front
    }
    cave = { x: (cave.cx + .5) * TCELL, y: (cave.cy + .5) * TCELL, ang, fx: cave.cx + ox * 3, fy: cave.cy + oy * 3 };
  }

  // ---- 5. clearings ----
  const clearings = [];
  for (let tries = 0; tries < 200 && clearings.length < 5; tries++) {
    const x = 8 + Math.floor(rnd() * (N - 16)), y = 8 + Math.floor(rnd() * (N - 16)), i = y * N + x;
    if (!land[i] || dSea[i] < 10 || H[i] > maxH * .45 || dRiver[i] < 6 || clearings.some(c => Math.hypot(c[0] - x, c[1] - y) < 30)) continue;
    const r = 4 + rnd() * 4; clearings.push([x, y, r]);
    for (let yy = Math.floor(y - r - 2); yy <= y + r + 2; yy++) for (let xx = Math.floor(x - r - 2); xx <= x + r + 2; xx++) {
      const j = yy * N + xx, d = Math.hypot(xx - x, yy - y) / r * (1 + (vnoise(xx / 3, yy / 3, s + 18) - .5) * .5);
      if (land[j]) F[j] = Math.max(F[j], ss(1, .6, d));
    }
  }

  // ---- 6. trail: from a beach (future spawn) to the cave, A* that avoids slopes, rivers and rock ----
  let spawn = null;
  {
    const tx = cx - Math.cos(a0) * N * .4, ty = cy - Math.sin(a0) * N * .4; let bd = 1e9, si = -1;
    for (let i = 0; i < NN; i++) {
      if (!land[i] || dSea[i] < 2 || dSea[i] > 4 || K[i] > .1 || dRiver[i] < 8) continue;
      const d = Math.hypot(i % N - tx, ((i / N) | 0) - ty); if (d < bd) { bd = d; si = i; }
    }
    if (si >= 0) spawn = { cx: si % N, cy: (si / N) | 0 };
  }
  const trails = [];
  const astar = (sx, sy, ex, ey) => {
    const g = new Float64Array(NN).fill(1e18), from = new Int32Array(NN).fill(-1), closed = new Uint8Array(NN), h = new Heap(), s0 = sy * N + sx, e0 = ey * N + ex;
    g[s0] = 0; h.push(0, s0);
    while (h.size) {
      const i = h.pop(); if (i === e0) break;
      if (closed[i]) continue; closed[i] = 1;                                   // skip stale heap entries
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy, c] of D8) {
        const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= N - 1 || yy >= N - 1) continue;
        const j = yy * N + xx; if (closed[j] || !land[j] || H[j] < .001) continue;
        const cost = c * (1 + Math.abs(H[j] - H[i]) * 160 + (R[j] > .3 ? 7 : 0) + K[j] * 25 + (F[j] > .5 ? -.3 : 0));
        const ng = g[i] + cost; if (ng < g[j]) { g[j] = ng; from[j] = i; h.push(ng + Math.hypot(xx - ex, yy - ey), j); }
      }
    }
    if (from[e0] < 0) return null;
    const out = []; for (let i = e0; i >= 0; i = from[i]) out.push([i % N, (i / N) | 0]);
    return out.reverse();
  };
  const paint = line => {
    for (const [px, py] of line) for (let y = Math.floor(py - 2); y <= py + 2; y++) for (let x = Math.floor(px - 2); x <= px + 2; x++) {
      const j = y * N + x, d = Math.hypot(x - px, y - py) * (1 + (vnoise(x / 2, y / 2, s + 19) - .5) * .5);
      if (land[j]) P[j] = Math.max(P[j], ss(1.35, .55, d));
    }
  };
  if (spawn && cave) {
    const main = astar(spawn.cx, spawn.cy, Math.round(cave.fx), Math.round(cave.fy));
    if (main) {
      trails.push(main); paint(smoothLine(main, 3));
      const mid = main[Math.floor(main.length * .45)];                         // side trail to the nearest clearing
      const c = clearings.slice().sort((a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1]))[0];
      if (c) { const side = astar(mid[0], mid[1], c[0], c[1]); if (side) { trails.push(side); paint(smoothLine(side, 3)); } }
    }
  }

  // ---- 7. moisture ----
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    M[i] = clamp(.42 + (fbm(x / 30, y / 30, s + 10) - .5) * .8 + .45 * Math.exp(-dRiver[i] / 7) - Math.max(0, H[i] - maxH * .45) * .9 - (dSea[i] < 4 ? .12 : 0), 0, 1);
  }

  return {
    seed, N, H, M, R, P, F, K, land, maxH, dSea, dRiver,
    river: riverPts, cave, clearings: clearings.map(([x, y, r]) => ({ x: (x + .5) * TCELL, y: (y + .5) * TCELL, r: r * TCELL })),
    spawn: spawn && { x: (spawn.cx + .5) * TCELL, y: (spawn.cy + .5) * TCELL },
    mountain: { x: Mx * TCELL, y: My * TCELL }, trails,
  };
}

function hash01(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/** Pack fields into three RGBA8 textures (row 0 = north).
 *  A: height (stored as sign·sqrt|h|: fine steps near sea level), moisture, river, trail · B: normal.x, normal.y, feature, rock · C: coast distance /32, river distance /32, -, -. */
export function packTerrain(t, NK = 34) {
  const N = TN, A = new Uint8Array(NN * 4), B = new Uint8Array(NN * 4), C = new Uint8Array(NN * 4), b = v => Math.round(clamp(v, 0, 1) * 255);
  const G = new Float32Array(NN);                                                // lightly blurred heights → smooth normals
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let sum = 0, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = clamp(x + dx, 0, N - 1), yy = clamp(y + dy, 0, N - 1), k = (dx || dy) ? (dx && dy ? .5 : 1) : 2; sum += t.H[yy * N + xx] * k; w += k; }
    G[y * N + x] = sum / w;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    const hx = (G[y * N + Math.min(N - 1, x + 1)] - G[y * N + Math.max(0, x - 1)]) / 2;
    const hy = (G[Math.min(N - 1, y + 1) * N + x] - G[Math.max(0, y - 1) * N + x]) / 2;
    let nx = -hx * NK, ny = -hy * NK; const l = Math.hypot(nx, ny, 1); nx /= l; ny /= l;
    const h = t.H[i], e = Math.sign(h) * Math.sqrt(Math.abs(h));                   // sqrt encoding: fine steps near the water line
    A[o] = b(e * .5 + .5); A[o + 1] = b(t.M[i]); A[o + 2] = b(t.R[i]); A[o + 3] = b(t.P[i]);
    B[o] = b(nx * .5 + .5); B[o + 1] = b(ny * .5 + .5); B[o + 2] = b(t.F[i]); B[o + 3] = b(t.K[i]);
    C[o] = b((t.H[i] > 0 ? t.dSea[i] : 0) / 32); C[o + 1] = b(t.dRiver[i] / 32); C[o + 3] = 255;
  }
  return { A, B, C };
}
