// Mesh primitives for the 3D hero and his tools. Each appends triangles to out = { pos: [], nrm: [], col: [] }.

/** Ellipsoid triangles. keep(nx,ny,nz) filters by unit-sphere direction (for caps); color can be a function of it. */
export function ellipsoid(out, [cx, cy, cz], [rx, ry, rz], color, { seg = 12, ring = 8, keep = null } = {}) {
  const P = (i, j) => { const th = i / seg * Math.PI * 2, ph = j / ring * Math.PI; return [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)]; };
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
    const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    if (keep) { const m = q.reduce((a, v) => [a[0] + v[0] / 4, a[1] + v[1] / 4, a[2] + v[2] / 4], [0, 0, 0]); if (!keep(...m)) continue; }
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [ux, uy, uz] = q[k];
      out.pos.push(cx + ux * rx, cy + uy * ry, cz + uz * rz);
      const nx = ux / rx, ny = uy / ry, nz = uz / rz, l = Math.hypot(nx, ny, nz) || 1;
      out.nrm.push(nx / l, ny / l, nz / l);
      const c = typeof color === 'function' ? color(ux, uy, uz) : color; out.col.push(...c);
    }
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrmz = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };

/** Cylinder / cone from point a (radius r0) to b (radius r1), with end caps. */
export function cyl(out, a, b, r0, r1, color, seg = 8) {
  const d = nrmz(sub(b, a)), ref = Math.abs(d[2]) < .9 ? [0, 0, 1] : [1, 0, 0], u = nrmz(crs(d, ref)), v = crs(d, u);
  const ring = (c, r, k) => { const th = k / seg * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th); return [[c[0] + (u[0] * cs + v[0] * sn) * r, c[1] + (u[1] * cs + v[1] * sn) * r, c[2] + (u[2] * cs + v[2] * sn) * r], [u[0] * cs + v[0] * sn, u[1] * cs + v[1] * sn, u[2] * cs + v[2] * sn]]; };
  const push = (p, n) => { out.pos.push(...p); out.nrm.push(...n); out.col.push(...color); };
  for (let k = 0; k < seg; k++) {
    const [a0, n0] = ring(a, r0, k), [a1, n1] = ring(a, r0, k + 1), [b0] = ring(b, r1, k), [b1] = ring(b, r1, k + 1);
    push(a0, n0); push(a1, n1); push(b1, n1); push(a0, n0); push(b1, n1); push(b0, n0);
    const nd = d.map(x => -x); push(a, nd); push(a1, nd); push(a0, nd);                     // caps
    push(b, d); push(b0, d); push(b1, d);
  }
}

/** Axis-aligned box: center c, half sizes h. */
export function box(out, c, h, color) {
  const F = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  for (const [n, a, b] of F) {
    const P = (s, t) => [0, 1, 2].map(i => c[i] + (n[i] + a[i] * s + b[i] * t) * h[i]);
    for (const [s1, t1] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { out.pos.push(...P(s1, t1)); out.nrm.push(...n); out.col.push(...color); }
  }
}
