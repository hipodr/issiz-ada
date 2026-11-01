// The castaway: a small procedural 3D model (smooth ellipsoids on a skeleton) + procedural animation. No DOM/GL → testable.
//
// Model space: x = right, y = forward, z = up, units = world units (hero ≈ 32 tall).
// Input : pose(state) with state = { phase (rad), speed (world u/s), time (s), wade (water depth, units),
//         light ('torch' | 'lantern' | null), tool (id in tools.js), act (action time 0..1 or null), fishing (line out) }
// Output: one 4×4 matrix per bone (bone space → model space), grounded so the lower foot touches z = 0,
//         + light position (torch flame / lantern), feet, and tool points (hands, tool tip, bow & crossbow string ends).
//
// Meshes: buildMeshes() → per bone { pos: Float32Array, nrm, col } triangles in bone space.

// ---------- tiny column-major mat4 ----------
export const M4 = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  T: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  RX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },   // + swings "down" to "forward"
  RY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },   // roll
  RZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },   // twist
  apply(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
};
const chain = (...ms) => ms.reduce((a, b) => M4.mul(a, b));

import { ellipsoid, cyl, box } from './geom.js';
import { toolPose, TOOLS } from './tools.js';

// ---------- palette ----------
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const COL = {
  skin: hex('#d9a27a'), skinD: hex('#b98262'), shirt: hex('#d7693f'), shirtD: hex('#b4532f'), pants: hex('#566c8a'), pantsD: hex('#46597a'),
  rope: hex('#7d6643'), hair: hex('#3b2618'), beard: hex('#4a3020'), eye: hex('#1d1410'), lip: hex('#a45c48'),
  stick: hex('#6b4a2c'), wrap: hex('#9a8a6a'),
};

// ---------- skeleton ----------
// name, parent, joint offset in parent space
export const BONES = [
  ['pelvis', -1, [0, 0, 17]],
  ['spine', 0, [0, 0, .6]],
  ['neck', 1, [0, .1, 8.4]],
  ['head', 2, [0, .25, 1.4]],
  ['armL', 1, [-4.6, 0, 7.3]], ['foreL', 4, [0, 0, -5.9]],
  ['armR', 1, [4.6, 0, 7.3]], ['foreR', 6, [0, 0, -5.9]],
  ['legL', 0, [-2.15, 0, -.5]], ['shinL', 8, [0, 0, -7.7]], ['footL', 9, [0, 0, -7.3]],
  ['legR', 0, [2.15, 0, -.5]], ['shinR', 11, [0, 0, -7.7]], ['footR', 12, [0, 0, -7.3]],
  ['torch', 5, [0, .4, -5.7]],                    // left hand (night)
  ['tool', 7, [0, .35, -5.9]],                    // right-hand grip
  ['toolL', 5, [0, .35, -5.9]],                   // left-hand grip (bow)
  ['lantern', 0, [-4.4, .9, .6]],                 // hangs on the belt when both hands are busy
];
export const BONE = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// ---------- meshes ----------
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function buildMeshes() {
  const M = BONES.map(() => ({ pos: [], nrm: [], col: [] }));
  const E = (bone, c, r, col, o) => ellipsoid(M[BONE[bone]], c, r, col, o);
  const shirtShade = (u, v, w) => mixc(COL.shirt, COL.shirtD, Math.max(0, -w) * .5 + Math.max(0, -v) * .25);
  // pelvis: trousers seat + rope belt
  E('pelvis', [0, -.1, -.4], [4.1, 2.7, 2.7], COL.pants);
  E('pelvis', [0, 0, 1.1], [4.25, 2.85, .65], COL.rope, { seg: 14, ring: 6 });
  // torso: chest + belly, open collar
  E('spine', [0, 0, 4.6], [4.5, 2.65, 4.6], shirtShade, { seg: 14, ring: 10 });
  E('spine', [0, .35, 2.2], [4.0, 2.5, 2.6], shirtShade);
  E('spine', [0, 1.55, 7.2], [1.5, 1.2, 1.4], COL.skinD, { seg: 8, ring: 6 });                       // chest skin at the collar
  E('spine', [-3.6, 0, 7.2], [1.9, 2.1, 1.6], shirtShade, { seg: 10, ring: 6 });                       // shoulders
  E('spine', [3.6, 0, 7.2], [1.9, 2.1, 1.6], shirtShade, { seg: 10, ring: 6 });
  // neck + head (skin, hair cap, beard, eyes, nose, ears)
  E('neck', [0, 0, .7], [1.35, 1.35, 1.5], COL.skinD, { seg: 8, ring: 5 });
  E('head', [0, .15, 2.6], [2.65, 2.95, 3.25], (u, v, w) => mixc(COL.skin, COL.skinD, Math.max(0, -w) * .4), { seg: 14, ring: 10 });
  E('head', [0, -.15, 3.0], [2.9, 3.15, 3.35], (u, v, w) => mixc(COL.hair, [.3, .2, .13], Math.max(0, w) * .3),
    { seg: 14, ring: 10, keep: (u, v, w) => w > .05 - Math.max(0, -v) * 1.4 && !(v > .55 && w < .45) });   // top + back of the head, open face
  E('head', [0, .75, 1.35], [2.35, 2.45, 1.75], COL.beard, { seg: 12, ring: 8, keep: (u, v, w) => v > .1 && w < .35 });   // short beard
  E('head', [-1.0, 2.75, 3.05], [.42, .3, .38], COL.eye, { seg: 6, ring: 4 });
  E('head', [1.0, 2.75, 3.05], [.42, .3, .38], COL.eye, { seg: 6, ring: 4 });
  E('head', [0, 3.05, 2.4], [.5, .6, .75], COL.skinD, { seg: 6, ring: 4 });
  E('head', [-2.65, .1, 2.5], [.4, .8, 1.0], COL.skinD, { seg: 6, ring: 4 });
  E('head', [2.65, .1, 2.5], [.4, .8, 1.0], COL.skinD, { seg: 6, ring: 4 });
  // arms: short sleeve, bare forearm, hand
  for (const s of ['L', 'R']) {
    E('arm' + s, [0, 0, -1.7], [1.75, 1.75, 2.2], shirtShade, { seg: 10, ring: 6 });
    E('arm' + s, [0, 0, -3.6], [1.25, 1.25, 3.0], COL.skin, { seg: 10, ring: 6 });
    E('fore' + s, [0, 0, -2.7], [1.12, 1.12, 3.0], COL.skin, { seg: 10, ring: 6 });
    E('fore' + s, [0, .25, -5.9], [1.15, 1.35, 1.45], COL.skinD, { seg: 8, ring: 6 });
    // legs: rolled trousers to mid-shin, bare shins and feet
    E('leg' + s, [0, 0, -3.8], [1.95, 2.05, 4.3], COL.pants, { seg: 10, ring: 8 });
    E('shin' + s, [0, 0, -1.5], [1.75, 1.85, 2.0], COL.pantsD, { seg: 10, ring: 6 });
    E('shin' + s, [0, 0, -1.0], [1.85, 1.95, .7], mixc(COL.pants, [1, 1, 1], .18), { seg: 10, ring: 4 });   // rolled cuff
    E('shin' + s, [0, 0, -4.6], [1.2, 1.25, 3.0], COL.skin, { seg: 10, ring: 6 });
    E('foot' + s, [0, .95, -.75], [1.3, 2.6, .85], COL.skinD, { seg: 10, ring: 6 });
  }
  // torch (only drawn at night)
  E('torch', [0, 0, 2.5], [.55, .55, 4.6], COL.stick, { seg: 8, ring: 6 });
  E('torch', [0, 0, 6.3], [.95, .95, 1.4], COL.wrap, { seg: 8, ring: 6 });
  const L = M[BONE.lantern];
  cyl(L, [0, 0, 0], [0, 0, -1.2], .25, .25, COL.rope, 4);                                            // hook
  box(L, [0, 0, -2.0], [1.1, 1.1, .3], [.22, .2, .18]); box(L, [0, 0, -5.2], [1.25, 1.25, .35], [.22, .2, .18]);
  ellipsoid(L, [0, 0, -3.6], [1.0, 1.0, 1.4], [1.0, .86, .5], { seg: 8, ring: 6 });                   // glowing glass
  return M.map(m => ({ pos: new Float32Array(m.pos), nrm: new Float32Array(m.nrm), col: new Float32Array(m.col) }));
}

// ---------- animation ----------
export const WALK = 62, RUN = 125;            // world units per second
export const STEP_WALK = 21, STEP_RUN = 33;   // distance per step

/** Advance the gait phase by the distance moved; returns how many steps were completed (for footprints). */
export function advance(state, dist) {
  const run = Math.max(0, Math.min(1, (state.speed - WALK) / (RUN - WALK)));
  const step = STEP_WALK + (STEP_RUN - STEP_WALK) * run, before = Math.floor(state.phase / Math.PI);
  state.phase += dist / step * Math.PI;
  return Math.floor(state.phase / Math.PI) - before;
}

/** Bone matrices (bone → model space) for the given state. */
export function pose(st) {
  const sp = st.speed || 0, t = st.time || 0, ph = st.phase || 0;
  const walk = Math.min(1, sp / WALK), run = Math.max(0, Math.min(1, (sp - WALK) / (RUN - WALK))), idle = 1 - walk;
  const S = Math.sin(ph), C = Math.cos(ph);
  const wade = Math.min(1, (st.wade || 0) / 8);
  const thighA = (.42 + .38 * run) * walk * (1 - wade * .3), kneeA = (.55 + .75 * run) * walk, armA = (.42 + .35 * run) * walk;
  const R = {};
  // legs: thigh swing, knee bends while the leg swings forward, foot stays roughly flat
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    const th = S * sg * thighA + run * .12 * walk;
    const kn = -kneeA * Math.max(0, C * sg) - .08 * walk - .04 * idle;
    R['leg' + s] = M4.mul(M4.RX(th), M4.RY(sg * -.03));
    R['shin' + s] = M4.RX(kn);
    R['foot' + s] = M4.RX(-(th + kn) * .7);
  }
  // pelvis / spine: lean when running, counter-twist, breathing when idle
  const lean = .05 * walk + .22 * run, breathe = Math.sin(t * 1.7) * .025 * idle;
  R.pelvis = M4.mul(M4.RZ(S * .1 * walk), M4.RY(Math.sin(t * .6) * .02 * idle));
  R.spine = M4.mul(M4.RX(lean + breathe), M4.RZ(-S * .16 * walk));
  R.neck = M4.RX(-lean * .6);
  R.head = M4.mul(M4.RX(-lean * .4 + Math.sin(t * .5) * .03 * idle), M4.RZ(Math.sin(t * .37) * .12 * idle + S * .08 * walk));
  // arms: swing opposite to the legs, elbows bend more when running
  const arm = (pitch, out, sg) => M4.mul(M4.RX(pitch), M4.RY(sg * out));
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    const sw = -S * sg * armA;
    R['arm' + s] = arm(sw + .05, .1 + .04 * idle + .05 * run, sg);
    R['fore' + s] = M4.RX(.25 + .25 * walk + 1.05 * run + Math.max(0, sw) * .5);
  }
  // tool: carry pose or action keyframes override the arms that hold it; a little walk swing stays
  const tp = toolPose(st.tool || 'hand', st.act, st.fishing), P = tp.p, acting = st.act != null;
  const swR = acting ? 0 : S * armA * .3, swL = acting ? 0 : -S * armA * .3;
  if (tp.armR) { R.armR = arm(P.sR[0] + swR, P.sR[1], -1); R.foreR = M4.RX(P.eR); }
  if (tp.armL) { R.armL = arm(P.sL[0] + swL, P.sL[1], 1); R.foreL = M4.RX(P.eL); }
  const grip = w => M4.mul(M4.mul(M4.mul(M4.RX(-Math.PI / 2), M4.RX(w[0])), M4.RY(w[1])), M4.RZ(w[2]));
  R.tool = grip(P.wR); R.toolL = grip(P.wL);
  R.spine = M4.mul(M4.RX(lean + breathe + P.ln), M4.RZ(-S * .16 * walk + P.tw));
  R.head = M4.mul(R.head, M4.RZ(-P.tw * .5));
  // light: torch in the free left hand, else a lantern on the belt
  if (st.light === 'torch' && !tp.armL) {
    const sw = S * .08 * walk;
    R.armL = arm(.55 + sw, .55, 1); R.foreL = M4.RX(1.05);
    R.torch = M4.mul(M4.RY(-.55 * .6), M4.RX(-(.55 + sw + 1.05) + .15));   // stick roughly upright
  }
  R.lantern = M4.mul(M4.RX(S * .25 * walk), M4.RY(Math.sin(t * 1.3) * .05));      // swings a little

  const W = new Array(BONES.length);
  BONES.forEach(([name, parent, j], i) => {
    const local = M4.mul(M4.T(...j), R[name] || M4.id());
    W[i] = parent < 0 ? local : M4.mul(W[parent], local);
  });
  // grounding: lower the whole body so the lower foot's sole sits on z = 0
  const sole = f => Math.min(M4.apply(W[f], 0, 2.6, -1.4)[2], M4.apply(W[f], 0, -.8, -1.4)[2], M4.apply(W[f], 0, .9, -1.6)[2]);
  const dz = -Math.min(sole(BONE.footL), sole(BONE.footR));
  const G = M4.T(0, 0, dz);
  for (let i = 0; i < W.length; i++) W[i] = M4.mul(G, W[i]);
  const light = st.light === 'lantern' ? M4.apply(W[BONE.lantern], 0, 0, -3.6) : M4.apply(W[BONE.torch], 0, 0, 7.6);
  const feet = [M4.apply(W[BONE.footL], 0, .9, -1.5), M4.apply(W[BONE.footR], 0, .9, -1.5)];
  const T = W[BONE.tool], TL = W[BONE.toolL], at = (m, x, y, z) => M4.apply(m, x, y, z);
  const pts = {
    handR: at(W[BONE.foreR], 0, .3, -5.9), handL: at(W[BONE.foreL], 0, .3, -5.9),
    tip: at(T, 0, 0, { rod: 40, spear: 27.5, club: 17, axe: 16, pick: 17, knife: 8.8 }[st.tool] || 0),
    bowTop: at(TL, 0, -5.35, 15.6), bowBot: at(TL, 0, -5.35, -15.6), bowRest: at(TL, 0, -5.35, 0), bowGrip: at(TL, 0, .4, 0),
    xbL: at(T, -9, -.8, 9.1), xbR: at(T, 9, -.8, 9.1), xbNut: at(T, 0, -.8, 2.6), xbFront: at(T, 0, -1.3, 13), xbBack: at(T, 0, -1.3, 1),
  };
  return { W, tip: light, feet, pts, tool: st.tool };
}
