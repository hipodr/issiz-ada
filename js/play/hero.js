// Hero simulation on the new map (no DOM, no GL → node-testable).
//
// Input : hero, input { x, y } (stick vector, length 0..1; >0.8 = run), dt (s), terrain, marks, time (s)
// Process: target speed from the stick × surface factor (sand, mud, water, slope) → smooth accel/turn
//          → move with collision (deep sea, cliffs) sliding along the blocked axis → gait phase
//          → footprints on sand/mud at each heel strike, ripple rings while in water
// Output : hero updated in place (x, y, yaw, speed, phase, water, surface, pose)
import { WALK, RUN, advance, pose } from '../hero/model.js';
import { surfaceAt, walkable, speedFactor } from '../map/sample.js';

export const MAX_PRINTS = 260, MAX_RINGS = 40;

export function createHero(x, y) {
  return { x, y, yaw: Math.PI / 2, speed: 0, phase: 0, time: 0, water: 0, surface: 'grass', torch: false, torchI: 0, ringT: 0, pose: null };
}

const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export function stepHero(h, input, dt, t, marks, time) {
  h.time += dt;
  const m = Math.min(1, Math.hypot(input.x, input.y));
  const dx = m > 0 ? input.x / Math.hypot(input.x, input.y) : Math.cos(h.yaw), dy = m > 0 ? input.y / Math.hypot(input.x, input.y) : Math.sin(h.yaw);
  let target = m < .12 ? 0 : m < .8 ? WALK * Math.min(1, (m - .12) / .55 + .25) : WALK + (RUN - WALK) * Math.min(1, (m - .8) / .15);
  target *= speedFactor(t, h.x, h.y, dx, dy);
  h.speed += Math.max(-520 * dt, Math.min(420 * dt, target - h.speed));
  if (m >= .12) h.yaw += angDiff(h.yaw, Math.atan2(dy, dx)) * Math.min(1, dt * 12);

  // move along the stick direction; slide when blocked
  let dist = 0;
  if (h.speed > .5) {
    const step = h.speed * dt, nx = h.x + dx * step, ny = h.y + dy * step;
    const ok = (x, y) => walkable(t, x, y) && walkable(t, x + dx * 6, y + dy * 6);
    if (ok(nx, ny)) { h.x = nx; h.y = ny; dist = step; }
    else if (ok(nx, h.y)) { h.x = nx; dist = Math.abs(dx * step); }
    else if (ok(h.x, ny)) { h.y = ny; dist = Math.abs(dy * step); }
    else h.speed *= .5;
  }

  // gait + footprints at heel strikes (phase = π/2 + kπ; even k = left foot)
  const k0 = Math.floor((h.phase - Math.PI / 2) / Math.PI);
  advance(h, dist);
  const k1 = Math.floor((h.phase - Math.PI / 2) / Math.PI);
  const s = surfaceAt(t, h.x, h.y);
  h.water = s.water; h.surface = s.kind;
  h.pose = pose({ speed: h.speed, phase: h.phase, time: h.time, torch: h.torch, wade: h.water });
  if (k1 !== k0 && (s.kind === 'sand' || s.kind === 'mud')) {
    const left = ((k1 % 2) + 2) % 2 === 0, f = h.pose.feet[left ? 0 : 1];
    const fx = Math.cos(h.yaw), fy = Math.sin(h.yaw);
    marks.prints.push({ x: h.x - fy * f[0] + fx * f[1], y: h.y + fx * f[0] + fy * f[1], ang: h.yaw, side: left ? 1 : -1, t0: time, mud: s.kind === 'mud' });
    if (marks.prints.length > MAX_PRINTS) marks.prints.shift();
  }
  // rings while standing / walking in water
  h.ringT -= dt;
  if (h.water > .5 && h.ringT <= 0) {
    marks.rings.push({ x: h.x + Math.cos(h.yaw) * 2, y: h.y + Math.sin(h.yaw) * 2, t0: time });
    if (marks.rings.length > MAX_RINGS) marks.rings.shift();
    h.ringT = h.speed > 5 ? .28 : 1.1;
  }
  marks.rings = marks.rings.filter(r => time - r.t0 < 1.3);
  return h;
}
