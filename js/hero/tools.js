// Hand tools & weapons for the 3D hero: meshes + how they are held + their use animation. No DOM/GL → testable.
//
// Tool space: grip (the fist) at the origin, the tool's long axis = +z (head / tip / muzzle at +z).
// Attached to the hand with RX(-π/2)·RX(w0)·RY(w1)·RZ(w2): w = [0,0,0] makes +z follow the forearm's "forward" axis,
// w0 = -π/2 makes it continue straight out of the fist (along the forearm).
//
// Pose keys (all optional, missing → the tool's carry pose):  sR/sL = [pitch, out]  shoulder (pitch + forward/up,
// out + raises the arm sideways), eR/eL = elbow bend, wR/wL = [x, y, z] grip rotation, tw = torso twist (+ turns left), ln = lean,
// by = whole-body turn (+ left; an archer stands side-on while the aim stays on the facing direction).
// Action: { dur (s), keys: [[t 0..1, pose]...], hit: t of the impact / release, move: speed factor while acting, label }
import { ellipsoid, cyl, box } from './geom.js';

const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const WOOD = hex('#8a5a32'), WOOD_L = hex('#a8743f'), WOOD_D = hex('#6b4426'), STONE = hex('#8d8f8c'), METAL = hex('#b9bec4'),
  METAL_D = hex('#7e848b'), CORD = hex('#c9b48a'), RED = hex('#d8473f'), WHITE = hex('#efece4'), FEATHER = hex('#e8e2d0');

// ---------- meshes (tool space) ----------
const MESH = {
  club(o) {
    cyl(o, [0, 0, -3], [0, 0, 10], .75, 1.1, WOOD, 8);
    cyl(o, [0, 0, 10], [0, 0, 15.5], 1.1, 1.85, WOOD_L, 8);
    ellipsoid(o, [0, 0, 15.6], [1.9, 1.9, 1.6], WOOD_L, { seg: 8, ring: 6 });
    ellipsoid(o, [.9, .5, 12.5], [.7, .6, .8], WOOD_D, { seg: 6, ring: 4 });       // knots
    ellipsoid(o, [-.8, -.6, 14], [.6, .7, .7], WOOD_D, { seg: 6, ring: 4 });
    cyl(o, [0, 0, -1.5], [0, 0, 1.5], .95, .95, CORD, 8);                           // grip wrap
  },
  spear(o) {
    cyl(o, [0, 0, -15], [0, 0, 22], .55, .5, WOOD, 7);
    cyl(o, [0, 0, 20.5], [0, 0, 22.8], .8, .8, CORD, 7);
    cyl(o, [0, 0, 22], [0, 0, 27.5], 1.1, .05, STONE, 6);                            // knapped stone point
    box(o, [0, 0, 23.6], [1.15, .35, 1.6], STONE);
  },
  knife(o) {
    cyl(o, [0, 0, -1.6], [0, 0, 2.2], .6, .65, WOOD_D, 7);
    box(o, [0, .15, 2.5], [.9, .55, .35], METAL_D);                                   // guard
    cyl(o, [0, .2, 2.6], [0, .45, 8.8], .85, .05, METAL, 4);                           // blade (flattened by the 4-gon)
  },
  axe(o) {
    cyl(o, [0, 0, -2], [0, 0, 17.5], .6, .62, WOOD, 7);
    box(o, [0, 2.3, 15.2], [.45, 2.0, 1.5], METAL_D);                                  // cheek
    box(o, [0, 4.6, 15.2], [.3, .9, 2.6], METAL);                                      // bit (edge forward = +y)
    box(o, [0, -1.0, 15.2], [.7, .8, 1.2], METAL_D);                                   // poll
    cyl(o, [0, 0, -1], [0, 0, 2], .78, .78, CORD, 7);
  },
  pick(o) {
    cyl(o, [0, 0, -2], [0, 0, 18], .6, .62, WOOD, 7);
    box(o, [0, 0, 16.8], [.85, .9, 1.4], METAL_D);
    cyl(o, [0, .5, 16.9], [0, 7.8, 14.6], 1.0, .1, METAL, 6);                          // pick
    cyl(o, [0, -.5, 16.9], [0, -6.2, 15.6], .95, .3, METAL, 6);                         // adze
  },
  rod(o) {
    cyl(o, [0, 0, -5], [0, 0, 6], .6, .48, WOOD_D, 7);
    cyl(o, [0, 0, 6], [0, 0, 40], .45, .14, WOOD_L, 6);
    cyl(o, [-1.4, 0, 1.2], [1.4, 0, 1.2], 1.25, 1.25, CORD, 10);                      // reel
    for (const z of [14, 24, 33]) ellipsoid(o, [0, -.5, z], [.35, .35, .35], METAL_D, { seg: 5, ring: 3 });
  },
  bow(o) {                                                                              // held in the left hand; limbs curve back towards the archer (−y)
    const pts = []; for (let i = -6; i <= 6; i++) { const z = i * 2.6; pts.push([0, -.022 * z * z, z]); }
    for (let i = 0; i < pts.length - 1; i++) { const r = .5 + .35 * (1 - Math.abs(i - 5.5) / 6); cyl(o, pts[i], pts[i + 1], r, r, WOOD, 6); }
    cyl(o, [0, 0, -2.2], [0, 0, 2.2], .85, .85, CORD, 7);
  },
  crossbow(o) {                                                                         // points along +z, its top is −y
    box(o, [0, .2, 3], [.9, 1.1, 10.5], WOOD);                                         // stock
    box(o, [0, 1.6, -5.5], [.85, 2.2, 2.6], WOOD_D);                                  // butt
    box(o, [0, -1.0, 6], [.35, .15, 7.5], WOOD_D);                                    // rail
    box(o, [0, 1.4, 1], [.35, 1.6, .4], METAL_D);                                     // trigger
    const arm = s => { const p = []; for (let i = 0; i <= 5; i++) { const x = s * i * 1.8; p.push([x, -.8, 13.5 - .045 * x * x * 1.2]); } return p; };
    for (const s of [-1, 1]) { const p = arm(s); for (let i = 0; i < p.length - 1; i++) cyl(o, p[i], p[i + 1], .55, .45, WOOD_L, 6); }
    box(o, [0, -.8, 13.4], [1.2, .6, .7], METAL_D);
  },
  arrow(o) {                                                                            // projectile, along +z, tip at +z
    cyl(o, [0, 0, -12], [0, 0, 10], .26, .26, WOOD_L, 5);
    cyl(o, [0, 0, 10], [0, 0, 13], .55, .03, STONE, 4);
    for (const a of [0, 2.1, 4.2]) box(o, [Math.cos(a) * .5, Math.sin(a) * .5, -10], [Math.abs(Math.cos(a)) * .5 + .1, Math.abs(Math.sin(a)) * .5 + .1, 1.6], FEATHER);
  },
  bolt(o) {
    cyl(o, [0, 0, -6], [0, 0, 6], .32, .32, WOOD, 5);
    cyl(o, [0, 0, 6], [0, 0, 8], .55, .03, METAL, 4);
    box(o, [0, 0, -5], [.12, .7, 1.1], RED);
  },
  bobber(o) {
    ellipsoid(o, [0, 0, .8], [1.2, 1.2, 1.1], RED, { seg: 8, ring: 6, keep: (u, v, w) => w > -.1 });
    ellipsoid(o, [0, 0, .8], [1.2, 1.2, 1.1], WHITE, { seg: 8, ring: 6, keep: (u, v, w) => w <= -.1 });
    cyl(o, [0, 0, 1.8], [0, 0, 3.2], .2, .1, RED, 4);
  },
};

export function buildToolMesh(id) {
  const o = { pos: [], nrm: [], col: [] }; MESH[id](o);
  return { pos: new Float32Array(o.pos), nrm: new Float32Array(o.nrm), col: new Float32Array(o.col) };
}

// ---------- holding + actions ----------
const H = Math.PI / 2;
export const TOOLS = {
  hand: { name: 'Eller', hand: null, label: 'Yumruk',
    carry: {},
    act: { dur: .42, hit: .45, move: .6, keys: [[0, {}], [.3, { sR: [.35, .15], eR: 2.0, tw: -.3 }], [.45, { sR: [1.45, .05], eR: .1, tw: .35, ln: .1 }], [.65, { sR: [1.3, .05], eR: .3, tw: .25 }], [1, {}]] } },
  club: { name: 'Sopa', hand: 'R', label: 'Vur', reach: 22,
    carry: { sR: [.15, .12], eR: .55, wR: [0.1, 0.06, 0] },
    act: { dur: .62, hit: .55, move: .5, keys: [[0, {}], [.32, { sR: [.45, 1.25], eR: 1.25, wR: [-2.58, 1.22, 0], tw: -.55 }],
      [.55, { sR: [1.35, .35], eR: .25, wR: [0, -1.35, 0], tw: .1, ln: .08 }], [.75, { sR: [1.2, -.35], eR: .45, wR: [0, -1.3, 0], tw: .5 }], [1, {}]] } },
  spear: { name: 'Mızrak', hand: 'R', two: true, label: 'Sapla', reach: 34,
    carry: { sR: [.12, .1], eR: .95, wR: [0.46, 0.06, 0] },
    act: { dur: .75, hit: .45, move: .5, keys: [[0, {}], [.25, { sR: [-.15, .3], eR: 1.75, wR: [-1.46, -0.22, 0], sL: [.8, -.2], eL: 1.0, tw: -.3 }],
      [.45, { sR: [1.2, .12], eR: .25, wR: [-1.62, 0.06, 0], sL: [1.15, -.4], eL: .35, tw: .2, ln: .18 }],
      [.7, { sR: [1.0, .15], eR: .5, wR: [-1.7, -0.02, 0], sL: [.95, -.4], eL: .55, tw: .1, ln: .1 }], [1, {}]] } },
  knife: { name: 'Bıçak', hand: 'R', label: 'Bıçakla', reach: 16,
    carry: { sR: [.08, .12], eR: .6, wR: [-1.78, -0.1, 0] },
    act: { dur: .36, hit: .45, move: .7, keys: [[0, {}], [.25, { sR: [.35, .25], eR: 1.7, wR: [-1.1, -0.02, 0], tw: -.25 }],
      [.45, { sR: [1.4, .08], eR: .1, wR: [-1.7, 0.18, 0], tw: .3, ln: .1 }], [.7, { sR: [1.2, .1], eR: .4, wR: [-1.94, 0.06, 0], tw: .2 }], [1, {}]] } },
  axe: { name: 'Balta', hand: 'R', label: 'Kes', reach: 22,
    carry: { sR: [.1, .14], eR: .35, wR: [0.66, 0.1, 0] },
    act: { dur: .7, hit: .6, move: .3, keys: [[0, {}], [.38, { sR: [2.55, .35], eR: 1.45, wR: [-1.9, 0.1, 0], tw: -.25, ln: -.08 }],
      [.6, { sR: [1.05, .15], eR: .15, wR: [-2.18, -0.02, 0], tw: .15, ln: .25 }], [.78, { sR: [.75, .15], eR: .3, wR: [-2.26, -0.1, 0], tw: .1, ln: .18 }], [1, {}]] } },
  pick: { name: 'Kazma', hand: 'R', label: 'Kaz', reach: 22,
    carry: { sR: [.1, .14], eR: .35, wR: [0.66, 0.1, 0] },
    act: { dur: .78, hit: .62, move: .3, keys: [[0, {}], [.4, { sR: [2.85, .2], eR: 1.25, wR: [-1.98, -0.1, 0], ln: -.12 }],
      [.62, { sR: [.85, .1], eR: .1, wR: [-2.18, -0.06, 0], ln: .32 }], [.8, { sR: [.7, .1], eR: .25, wR: [-2.38, -0.06, 0], ln: .22 }], [1, {}]] } },
  bow: { name: 'Yay', hand: 'L', two: true, label: 'Ok at', shoots: 'arrow',
    carry: { sL: [.1, .12], eL: .35, wL: [1.02, -0.1, 0] },
    // solved so the arrow (right hand → bow grip) stays parallel to the facing direction: it flies where he looks
    act: { dur: 1.1, hit: .62, move: .35, keys: [[0, {}],
      [.22, { by: -.4, tw: -.27, sL: [1.51, .35], eL: .3, wL: [-0.26, -0.02, 0], sR: [1.5, -.98], eR: .3 }],
      [.55, { by: -.18, tw: -.35, sL: [1.56, -.13], eL: .3, wL: [-0.3, 0.02, 0], sR: [1.85, -1.0], eR: 2.7 }],
      [.62, { by: -.38, tw: -.35, sL: [1.6, .22], eL: .3, wL: [-0.34, 0.02, 0], sR: [2.0, -1.0], eR: 2.61 }],
      [.8, { by: -.99, tw: -.18, sL: [1.32, .73], eL: 0, wL: [0.02, -0.22, 0], sR: [.91, -1.0], eR: .3 }], [1, {}]] } },
  crossbow: { name: 'Arbalet', hand: 'R', two: true, label: 'Ateş', shoots: 'bolt',
    carry: { sR: [.12, .08], eR: .95, wR: [-1.98, -0.06, 0], sL: [.35, -.15], eL: 1.05 },
    act: { dur: 1.5, hit: .2, move: .35, keys: [[0, {}], [.14, { sR: [1.3, .05], eR: .25, wR: [-1.54, 0.02, 0], sL: [1.35, -.3], eL: .45, tw: .1 }],
      [.2, { sR: [1.3, .05], eR: .25, wR: [-1.54, 0.02, 0], sL: [1.35, -.3], eL: .45, tw: .1 }],
      [.27, { sR: [1.55, .05], eR: .2, wR: [-1.54, 0.02, 0], sL: [1.5, -.3], eL: .35, tw: .1, ln: -.06 }],
      [.45, { sR: [.55, .1], eR: 1.05, wR: [-2.98, -0.06, 0], sL: [.85, -.2], eL: 1.5, ln: .15 }],
      [.65, { sR: [.55, .1], eR: 1.05, wR: [-2.98, -0.06, 0], sL: [.35, -.15], eL: 1.95, ln: .2 }],
      [.85, { sR: [.55, .1], eR: 1.05, wR: [-2.98, -0.06, 0], sL: [.6, -.2], eL: 1.2, ln: .1 }], [1, {}]] } },
  rod: { name: 'Olta', hand: 'R', two: true, label: 'Olta at', label2: 'Çek',
    carry: { sR: [.15, .12], eR: .9, wR: [-0.02, 0.06, 0] },
    fish: { sR: [.85, .12], eR: .35, wR: [-0.74, -0.02, 0], sL: [.65, -.15], eL: 1.1 },          // holding while the line is out
    act: { dur: .95, hit: .58, move: 0, keys: [[0, {}], [.4, { sR: [2.5, .15], eR: .55, wR: [-0.62, 0.14, 0], tw: -.2, ln: -.1 }],
      [.58, { sR: [1.25, .12], eR: .2, wR: [-0.94, 0.02, 0], tw: .1, ln: .12 }], [.78, { sR: [.85, .12], eR: .35, wR: [-.7, 0, 0], sL: [.65, -.15], eL: 1.1 }], [1, { fish: 1 }]] } },
};
export const TOOL_IDS = Object.keys(TOOLS);

const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const POSE_KEYS = { sR: [.08, .1], eR: .3, wR: [0, 0, 0], sL: [.08, .1], eL: .3, wL: [0, 0, 0], tw: 0, ln: 0, by: 0 };
const fill = (p, base) => { const o = {}; for (const k in POSE_KEYS) o[k] = p[k] !== undefined ? p[k] : base[k] !== undefined ? base[k] : POSE_KEYS[k]; return o; };
const mixPose = (a, b, t) => { const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], t)) : lerp(a[k], b[k], t); return o; };

/** Arm/torso angles for a tool at action time t (0..1, or null = just carrying). `armed` = which arms the tool controls. */
export function toolPose(id, t, fishing) {
  const T = TOOLS[id] || TOOLS.hand, carry = fishing && T.fish ? { ...T.carry, ...T.fish } : T.carry;
  if (t == null || !T.act) return { p: fill(carry, {}), armR: T.hand === 'R' || !!carry.sR, armL: T.hand === 'L' || !!carry.sL || !!T.two };
  const K = T.act.keys; let i = 0; while (i < K.length - 2 && K[i + 1][0] <= t) i++;
  const [t0, p0] = K[i], [t1, p1] = K[i + 1], f = ease(Math.max(0, Math.min(1, (t - t0) / ((t1 - t0) || 1))));
  const endCarry = p1.fish && T.fish ? { ...T.carry, ...T.fish } : carry;
  const a = fill(p0, carry), b = fill(p1, endCarry);
  const usesL = K.some(k => k[1].sL) || T.hand === 'L' || !!carry.sL, usesR = K.some(k => k[1].sR) || T.hand === 'R';
  return { p: mixPose(a, b, f), armR: usesR, armL: usesL };
}
