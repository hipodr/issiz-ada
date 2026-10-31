// Pure helpers: math, seeded RNG, value noise. No DOM.
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const smooth = t => t * t * (3 - 2 * t);
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, s) {
  return vnoise(x, y, s) * .55 + vnoise(x * 2, y * 2, s + 7) * .3 + vnoise(x * 4, y * 4, s + 13) * .15;
}

// 8 compass directions, unit vectors
export const DIRS8 = [...Array(8)].map((_, i) => [Math.cos(i / 8 * Math.PI * 2), Math.sin(i / 8 * Math.PI * 2)]);
