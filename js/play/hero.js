// Hero simulation on the new map (no DOM, no GL → node-testable).
//
// Input : hero, input { x, y } (stick vector, length 0..1; >0.8 = run), dt (s), terrain, marks, time (s), fx
// Process: target speed from the stick × surface factor (sand, mud, water, slope) → smooth accel/turn
//          → move with collision (deep sea, cliffs) sliding along the blocked axis → gait phase
//          → footprints on sand/mud at each heel strike, ripple rings while in water
//          → tool action (use()): keyframed swing / thrust / shot / cast; at the action's hit time: dust, arrow/bolt, fishing line
//          → projectiles fly with gravity and stick in the ground; the bobber flies, floats and is reeled in
// Output : hero updated in place (x, y, yaw, speed, phase, water, surface, pose, act, line, nock, loaded); fx lists updated
import { WALK, RUN, advance, pose } from '../hero/model.js';
import { TOOLS } from '../hero/tools.js';
import { surfaceAt, walkable, speedFactor } from '../map/sample.js';
import { targetFor, harvest, blocked } from '../world2/objects.js';

export const MAX_PRINTS = 260, MAX_RINGS = 40, MAX_PROJ = 24;

export function createHero(x, y) {
  return { x, y, yaw: Math.PI / 2, speed: 0, phase: 0, time: 0, water: 0, surface: 'grass', light: null, lightI: 0, ringT: 0, pose: null,
    tool: 'hand', actT: null, actKind: null, line: null, nock: false, loaded: true, world: null, inv: {}, got: null };
}
export const createFx = () => ({ projectiles: [], dust: [] });

const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
/** model-space point → world (x, y, z) for this hero */
export const toWorld = (h, p) => { const fx = Math.cos(h.yaw), fy = Math.sin(h.yaw); return [h.x - fy * p[0] + fx * p[1], h.y + fx * p[0] + fy * p[1], p[2]]; };

/** Equip a tool (any id from TOOLS). Reels the line in when switching away from the rod. */
export function equip(h, id) { if (!TOOLS[id] || h.actT != null) return false; h.tool = id; h.line = null; h.nock = false; h.loaded = true; return true; }

/** What the action would hit right now (needs h.world). */
export const target = h => h.world ? targetFor(h.world, h.x, h.y, h.yaw, h.tool) : null;

/** The action button. Bare hands next to something to pick → crouch and gather. Returns what started, or null. */
export function use(h) {
  if (h.actT != null) return null;
  if (h.tool === 'rod' && h.line) { if (h.line.state !== 'reel') h.line.state = 'reel'; return 'reel'; }
  const tg = target(h);
  h.actKind = h.tool === 'hand' && tg && tg.verb === 'pick' ? 'gather' : null;
  h.actT = 0; h.fired = false;
  return h.actKind || h.tool;
}
/** Label for the action button right now. */
export function actionLabel(h) {
  const T = TOOLS[h.tool]; if (h.tool === 'rod' && h.line) return T.label2;
  const tg = target(h); return tg ? tg.label : T.label;
}

export function stepHero(h, input, dt, t, marks, time, fx = createFx()) {
  h.time += dt;
  const T = TOOLS[h.actKind || h.tool] || TOOLS.hand, A = T.act;
  const acting = h.actT != null, slow = acting ? A.move : h.line ? .6 : 1;
  const m = Math.min(1, Math.hypot(input.x, input.y));
  const dx = m > 0 ? input.x / Math.hypot(input.x, input.y) : Math.cos(h.yaw), dy = m > 0 ? input.y / Math.hypot(input.x, input.y) : Math.sin(h.yaw);
  let target = m < .12 ? 0 : m < .8 ? WALK * Math.min(1, (m - .12) / .55 + .25) : WALK + (RUN - WALK) * Math.min(1, (m - .8) / .15);
  target *= speedFactor(t, h.x, h.y, dx, dy) * slow;
  h.speed += Math.max(-520 * dt, Math.min(420 * dt, target - h.speed));
  if (m >= .12) h.yaw += angDiff(h.yaw, Math.atan2(dy, dx)) * Math.min(1, dt * (acting ? 5 : 12));

  // move along the stick direction; slide when blocked
  let dist = 0;
  if (h.speed > .5) {
    const step = h.speed * dt, nx = h.x + dx * step, ny = h.y + dy * step;
    const ok = (x, y) => walkable(t, x, y) && walkable(t, x + dx * 6, y + dy * 6) && !(h.world && blocked(h.world, x, y, 5) && !blocked(h.world, h.x, h.y, 4.5));
    if (ok(nx, ny)) { h.x = nx; h.y = ny; dist = step; }
    else if (ok(nx, h.y)) { h.x = nx; dist = Math.abs(dx * step); }
    else if (ok(h.x, ny)) { h.y = ny; dist = Math.abs(dy * step); }
    else h.speed *= .5;
  }

  // action timeline
  let at = null;
  if (acting) {
    h.actT += dt; at = h.actT / A.dur;
    if (!h.fired && at >= A.hit) { h.fired = true; onHit(h, t, marks, time, fx); }
    if (at >= 1) { h.actT = null; at = null; h.actKind = null; }
  }
  h.nock = h.tool === 'bow' && at != null && at > .18 && at < A.hit;
  if (h.tool === 'crossbow') h.loaded = !(at != null && at >= A.hit && at < .85);

  // gait + pose + footprints at heel strikes (phase = π/2 + kπ; even k = left foot)
  const k0 = Math.floor((h.phase - Math.PI / 2) / Math.PI);
  advance(h, dist);
  const k1 = Math.floor((h.phase - Math.PI / 2) / Math.PI);
  const s = surfaceAt(t, h.x, h.y);
  h.water = s.water; h.surface = s.kind;
  h.pose = pose({ speed: h.speed, phase: h.phase, time: h.time, light: h.light, wade: h.water, tool: h.tool, actKind: h.actKind, act: at, fishing: !!h.line });
  if (k1 !== k0 && (s.kind === 'sand' || s.kind === 'mud')) {
    const left = ((k1 % 2) + 2) % 2 === 0, [x, y] = toWorld(h, h.pose.feet[left ? 0 : 1]);
    marks.prints.push({ x, y, ang: h.yaw, side: left ? 1 : -1, t0: time, mud: s.kind === 'mud' });
    if (marks.prints.length > MAX_PRINTS) marks.prints.shift();
  }
  // rings while standing / walking in water
  h.ringT -= dt;
  if (h.water > .5 && h.ringT <= 0) {
    marks.rings.push({ x: h.x + Math.cos(h.yaw) * 2, y: h.y + Math.sin(h.yaw) * 2, t0: time });
    h.ringT = h.speed > 5 ? .28 : 1.1;
  }
  stepFx(h, t, marks, time, dt, fx);
  if (marks.rings.length > MAX_RINGS) marks.rings.splice(0, marks.rings.length - MAX_RINGS);
  marks.rings = marks.rings.filter(r => time - r.t0 < 1.3);
  return h;
}

function puff(fx, x, y, z, n, c, time, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (o.v || 22) * (.4 + Math.random() * .6);
    fx.dust.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6, vz: (o.up || 18) * (.5 + Math.random()), t0: time, life: (o.life || .6) * (.7 + Math.random() * .6), s: o.s || 1.5, g: o.g || 5, c, a: o.a || .55 });
  }
}

/** The moment of impact / release. */
function onHit(h, t, marks, time, fx) {
  const T = TOOLS[h.tool], fxv = Math.cos(h.yaw), fyv = Math.sin(h.yaw);
  if (T.shoots) {
    const p = h.tool === 'bow' ? h.pose.pts.bowGrip : h.pose.pts.xbFront, [x, y, z] = toWorld(h, p);
    const sp = h.tool === 'bow' ? 520 : 680, up = h.tool === 'bow' ? 55 : 30;
    fx.projectiles.push({ kind: T.shoots, x, y, z, vx: fxv * sp, vy: fyv * sp, vz: up, dx: fxv, dy: fyv, dz: up / sp, stuck: null, t0: time });
    if (fx.projectiles.length > MAX_PROJ) fx.projectiles.shift();
    return;
  }
  if (h.tool === 'rod') {
    const [x, y, z] = toWorld(h, h.pose.pts.tip), d = 95;
    h.line = { state: 'fly', t: 0, fx: x, fy: y, fz: z, tx: h.x + fxv * d, ty: h.y + fyv * d, x, y, z };
    return;
  }
  // world objects: chop / mine / shake / pick
  const tg = target(h);
  if (tg) {
    const { got } = harvest(h.world, tg, time, h.yaw), o = tg.o;
    for (const k in got) h.inv[k] = (h.inv[k] || 0) + got[k];
    if (Object.keys(got).length) h.got = { got, time };
    const hx = o.x - fxv * 4, hy = o.y - fyv * 4;
    if (tg.verb === 'chop') puff(fx, hx, hy, 10 + Math.random() * 8, 6, [.78, .62, .4], time, { up: 26, v: 30, s: .9, life: .5, g: 2 });
    else if (tg.verb === 'mine') puff(fx, hx, hy, 6, 7, [.72, .71, .68], time, { up: 34, v: 34, s: .9, life: .45, g: 2 });
    else if (tg.verb === 'shake') puff(fx, o.x, o.y, 60, 5, [.45, .62, .25], time, { up: -10, v: 18, s: 1.2, life: .9, g: 2 });
    else if (o.k === 'saz' || o.k === 'bush') puff(fx, o.x, o.y, 8, 4, [.5, .65, .3], time, { up: 15, v: 14, s: 1, life: .5, g: 2 });
    return;
  }
  // melee into nothing: dust, sand or spray where the blow lands
  const r = T.reach || 14, x = h.x + fxv * r, y = h.y + fyv * r, s = surfaceAt(t, x, y);
  if (s.water > 0) { puff(fx, x, y, 2, 7, [.85, .93, .97], time, { up: 40, v: 20, life: .5 }); marks.rings.push({ x, y, t0: time, s: 1.3 }); }
  else if (s.kind === 'sand') puff(fx, x, y, 1, 6, [.86, .78, .6], time);
  else if (s.kind === 'rock') puff(fx, x, y, 3, 5, [.75, .74, .7], time, { up: 30, v: 30, s: .9, life: .4 });
  else if (h.tool !== 'hand') puff(fx, x, y, 1, 5, [.55, .45, .32], time, { a: .4 });
}

function stepFx(h, t, marks, time, dt, fx) {
  for (const p of fx.projectiles) {
    if (p.stuck) continue;
    p.vz -= 240 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const sp = Math.hypot(p.vx, p.vy, p.vz); p.dx = p.vx / sp; p.dy = p.vy / sp; p.dz = p.vz / sp;
    if (p.z <= .6) {
      const s = surfaceAt(t, p.x, p.y);
      if (s.water > .5) { marks.rings.push({ x: p.x, y: p.y, t0: time }); puff(fx, p.x, p.y, 1, 4, [.85, .93, .97], time, { up: 30 }); p.gone = true; }
      else { p.z = .6 + (p.kind === 'arrow' ? 4 : 2.5) * Math.max(0, -p.dz); p.stuck = time; puff(fx, p.x, p.y, 0, 3, s.kind === 'sand' ? [.86, .78, .6] : [.5, .42, .3], time, { a: .4, s: 1 }); }
    }
  }
  fx.projectiles = fx.projectiles.filter(p => !p.gone && !(p.stuck && time - p.stuck > 10) && time - p.t0 < 20);
  for (const d of fx.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.z = Math.max(0, d.z + d.vz * dt); d.vz -= 60 * dt; d.vx *= .94; d.vy *= .94; }
  fx.dust = fx.dust.filter(d => time - d.t0 < d.life);

  const L = h.line; if (!L) return;
  const [rx, ry, rz] = toWorld(h, h.pose.pts.tip);
  if (L.state === 'fly') {
    L.t = Math.min(1, L.t + dt / .7);
    const u = L.t; L.x = L.fx + (L.tx - L.fx) * u; L.y = L.fy + (L.ty - L.fy) * u; L.z = L.fz * (1 - u) + Math.sin(u * Math.PI) * 26;
    if (L.t >= 1) {
      const s = surfaceAt(t, L.x, L.y); L.wet = s.water > .5 || s.kind === 'river'; L.state = 'float'; L.z = 0; L.ringT = 0;
      if (L.wet) { marks.rings.push({ x: L.x, y: L.y, t0: time, s: 1.2 }); puff(fx, L.x, L.y, 1, 5, [.85, .93, .97], time, { up: 28, v: 14 }); }
    }
  } else if (L.state === 'float') {
    L.z = L.wet ? Math.sin(time * 2.4) * .35 - .4 : 0;
    if (L.wet && (L.ringT -= dt) <= 0) { marks.rings.push({ x: L.x, y: L.y, t0: time, s: .7 }); L.ringT = 1.6; }
    if (Math.hypot(L.x - h.x, L.y - h.y) > 170) L.state = 'reel';                     // walked too far away
  } else if (L.state === 'reel') {
    const ddx = rx - L.x, ddy = ry - L.y, d = Math.hypot(ddx, ddy), st = 260 * dt;
    if (d < st + 4) { h.line = null; return; }
    L.x += ddx / d * st; L.y += ddy / d * st; L.z = L.wet ? 0 : Math.min(rz, L.z + 30 * dt);
    if (L.wet && surfaceAt(t, L.x, L.y).water > .5 && Math.random() < dt * 8) marks.rings.push({ x: L.x, y: L.y, t0: time, s: .5 });
  }
}
