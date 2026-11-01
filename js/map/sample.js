// CPU-side terrain queries for gameplay (the GPU only draws; rules live here). Pure → node-testable.
//
// Input : terrain from generateTerrain(), world position (x, y) in world units
// Output: field values (bilinear), surface kind, water depth for wading, walkability and speed factor
import { TN, TCELL, TSIZE } from './terrain.js';

export const WADE_MAX = .03;          // sea deeper than this (in height units) blocks walking
export const Z_PER_H = 260;           // height units → world units for wading visuals (0.03 → ~8 units ≈ knee deep)

/** Bilinear sample of a TN×TN field at world (x, y). */
export function field(F, x, y) {
  const fx = x / TCELL - .5, fy = y / TCELL - .5;
  const x0 = Math.max(0, Math.min(TN - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(TN - 2, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - x0)), v = Math.max(0, Math.min(1, fy - y0)), i = y0 * TN + x0;
  return (F[i] * (1 - u) + F[i + 1] * u) * (1 - v) + (F[i + TN] * (1 - u) + F[i + TN + 1] * u) * v;
}

/** Height gradient (per world unit). */
export function grad(t, x, y) {
  const e = TCELL * .5;
  return [(field(t.H, x + e, y) - field(t.H, x - e, y)) / (2 * e), (field(t.H, x, y + e) - field(t.H, x, y - e)) / (2 * e)];
}

/**
 * What the feet are on.  kind: 'sea' | 'river' | 'sand' | 'mud' | 'rock' | 'trail' | 'grass'
 * water: water depth at the feet in world units (0 on dry land), deep: true when too deep to wade.
 */
export function surfaceAt(t, x, y) {
  if (x < 0 || y < 0 || x > TSIZE || y > TSIZE) return { kind: 'sea', water: 99, deep: true, h: -1 };
  const h = field(t.H, x, y), r = field(t.R, x, y), k = field(t.K, x, y);
  if (h < 0 && r < .5) return { kind: 'sea', water: -h * Z_PER_H, deep: h < -WADE_MAX, h };
  if (r > .5) return { kind: 'river', water: 3 + (r - .5) * 8, deep: false, h };
  const ds = field(t.dSea, x, y), dr = field(t.dRiver, x, y);
  const [gx, gy] = grad(t, x, y), slope = Math.hypot(gx, gy) * TCELL * 34;       // same scale as the normal map
  if (k > .5 || slope > 1.1) return { kind: 'rock', water: 0, deep: false, h, slope, cliff: k > .55 && slope > .7 };
  if (ds < 7 && h < .05) return { kind: 'sand', water: 0, deep: false, h };
  if (dr < 2.2) return { kind: 'mud', water: 0, deep: false, h };
  if (field(t.P, x, y) > .5) return { kind: 'trail', water: 0, deep: false, h };
  return { kind: 'grass', water: 0, deep: false, h, slope };
}

/** Can the hero stand here? (deep sea and steep cliff faces block) */
export function walkable(t, x, y) {
  const s = surfaceAt(t, x, y);
  return !s.deep && !s.cliff;
}

/** Speed multiplier for moving from (x,y) in direction (dx,dy) (unit vector). */
export function speedFactor(t, x, y, dx, dy) {
  const s = surfaceAt(t, x, y);
  let f = s.kind === 'sea' ? 1 - Math.min(.5, s.water / 16) : s.kind === 'river' ? .55 : s.kind === 'sand' ? .9 : s.kind === 'mud' ? .8 : s.kind === 'trail' ? 1.08 : s.kind === 'rock' ? .85 : 1;
  const [gx, gy] = grad(t, x, y), climb = (gx * dx + gy * dy) * TCELL * 34;   // >0 uphill
  f *= Math.max(.55, Math.min(1.12, 1 - climb * .45));
  return f;
}
