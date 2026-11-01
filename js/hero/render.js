// Draws the hero, his tool, projectiles and his marks on the ground into the MapGL context, after the terrain pass.
//
// Input : hero { x, y, yaw, pose, tool, light, lightI, water, line, nock, loaded }, fx { projectiles, dust },
//         view { cam, zoom (device px / world unit), W, H, lt (lighting) }, marks { prints, rings }, time (s)
// Process: 1) footprints (multiply)  2) water rings  3) sun shadows of hero + objects (stencil: darken once)
//          4) lit meshes, depth-tested (oblique 3/4 view: screen y = y·KY − z·KZ)  5) strings / fishing line  6) dust  7) flame, lantern glow
// Output : pixels; returns the light position in world coords (for the terrain light) or null
import { buildMeshes, BONES, BONE, M4 } from './model.js';
import { buildToolMesh, TOOLS } from './tools.js';

export const KY = .55, KZ = .92;      // oblique view of the model: ground-forward squashed, height almost full

const VS_BODY = `
attribute vec3 aP, aN, aC;
uniform mat4 uM;
uniform vec2 uOrigin, uRes;
uniform float uZoom, uMode, uYOff;
uniform vec3 uLight;
varying vec3 vN, vC, vW;
void main(){
  vec4 w = uM * vec4(aP, 1.);
  vW = w.xyz; vN = (uM * vec4(aN, 0.)).xyz; vC = aC;
  vec2 s; float z;
  if (uMode > .5) { s = w.xy - uLight.xy / max(uLight.z, .3) * max(w.z, 0.); z = 0.; }       // shadow on the ground
  else { s = vec2(w.x, w.y * ${KY} - w.z * ${KZ}); z = clamp(-((w.y + uYOff) * .6 + w.z * .8) / 160., -.99, .99); }
  vec2 px = uOrigin + s * uZoom;
  gl_Position = vec4(px.x / uRes.x * 2. - 1., 1. - px.y / uRes.y * 2., z, 1.);
}`;
const FS_BODY = `
precision highp float;                 // uniforms shared with the vertex shader must match its (high) precision
uniform float uMode, uShadowA, uWater, uTorchI;
uniform vec3 uLight, uLightCol, uAmb, uTorchP;
varying vec3 vN, vC, vW;
void main(){
  if (uMode > .5) { gl_FragColor = vec4(0., 0., 0., uShadowA); return; }
  vec3 n = normalize(vN);
  float d = dot(n, uLight);
  vec3 sky = mix(uAmb * .7, uAmb * 1.2, n.z * .5 + .5);                                       // hemisphere ambient
  vec3 c = vC * (sky + uLightCol * max(d * .8 + .2, 0.) * .95);
  vec3 tl = uTorchP - vW; float td = length(tl);
  c += vC * vec3(1., .6, .3) * uTorchI * max(dot(n, tl / max(td, .01)) * .8 + .2, 0.) * clamp(1. - td / 70., 0., 1.);
  c += uLightCol * .07 * pow(1. - abs(n.z), 3.);                                                 // soft rim
  if (vW.z < uWater) c = mix(c, vec3(.12, .36, .42) * (uAmb + uLightCol * .6), .6);              // legs under water
  if (abs(vW.z - uWater) < .45 && uWater > 0.) c = mix(c, vec3(.9, .95, .95) * (uAmb + uLightCol), .5);   // waterline
  gl_FragColor = vec4(c, 1.);
}`;

const VS_FLAT = `
attribute vec2 aP, aUV; attribute vec4 aC;
uniform vec2 uRes;
varying vec2 vUV; varying vec4 vC;
void main(){ vUV = aUV; vC = aC; gl_Position = vec4(aP.x / uRes.x * 2. - 1., 1. - aP.y / uRes.y * 2., 0., 1.); }`;
const FS_FLAT = `
precision mediump float;
uniform float uKind;
varying vec2 vUV; varying vec4 vC;
void main(){
  vec2 u = vUV; float r = length(u);
  if (uKind < .5) {                                     // footprint: heel + sole + toes, multiply-darkens the ground
    float heel = 1. - smoothstep(.28, .38, length((u - vec2(0., -.52)) / vec2(.85, 1.)));
    float sole = 1. - smoothstep(.36, .46, length((u - vec2(.05, .12)) / vec2(.9, 1.25)));
    float toes = 0.;
    for (int i = 0; i < 4; i++) { float fi = float(i); toes = max(toes, 1. - smoothstep(.06, .1, length(u - vec2(-.24 + fi * .16, .74 - abs(fi - 1.2) * .05)))); }
    float a = max(max(heel, sole), toes * .8) * vC.a;
    gl_FragColor = vec4(mix(vec3(1.), vC.rgb, a), 1.);
  } else if (uKind < 1.5) {                             // ripple ring
    float a = smoothstep(.72, .86, r) * (1. - smoothstep(.88, 1., r)) * vC.a;
    gl_FragColor = vec4(vC.rgb, a);
  } else if (uKind < 2.5) {                             // glow / flame (additive)
    float a = pow(max(0., 1. - r), 2.) * vC.a;
    gl_FragColor = vec4(vC.rgb * a, 1.);
  } else if (uKind < 3.5) {                             // line segment (string, fishing line)
    gl_FragColor = vec4(vC.rgb, vC.a * (1. - smoothstep(.4, 1., abs(u.y))));
  } else {                                              // soft puff (dust, spray)
    gl_FragColor = vec4(vC.rgb, vC.a * (1. - smoothstep(.2, 1., r)));
  }
}`;

function program(gl, vs, fs) {
  const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/** Model (bone space) → world-relative (x right, y south, z up) with the hero facing `yaw`. Mirrors handedness (no culling used). */
export function yawMatrix(yaw) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  return [-fy, fx, 0, 0, fx, fy, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
/** Matrix whose +z axis points along dir, placed at p (any roll). */
export function alongMatrix(p, dir) {
  const l = Math.hypot(...dir) || 1, z = dir.map(v => v / l), ref = Math.abs(z[2]) < .95 ? [0, 0, 1] : [1, 0, 0];
  let x = [ref[1] * z[2] - ref[2] * z[1], ref[2] * z[0] - ref[0] * z[2], ref[0] * z[1] - ref[1] * z[0]]; const lx = Math.hypot(...x); x = x.map(v => v / lx);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [...x, 0, ...y, 0, ...z, 0, p[0], p[1], p[2], 1];
}

const upload = (gl, m) => {
  const n = m.pos.length / 3, data = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) data.set([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2], m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]], i * 9);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { b, n };
};

export class HeroGL {
  constructor(gl) {
    this.gl = gl;
    this.pb = program(gl, VS_BODY, FS_BODY); this.pf = program(gl, VS_FLAT, FS_FLAT);
    const U = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
    this.ub = U(this.pb, ['uM', 'uOrigin', 'uRes', 'uZoom', 'uMode', 'uYOff', 'uLight', 'uShadowA', 'uWater', 'uTorchI', 'uLightCol', 'uAmb', 'uTorchP']);
    this.uf = U(this.pf, ['uRes', 'uKind']);
    this.ab = ['aP', 'aN', 'aC'].map(n => gl.getAttribLocation(this.pb, n));
    this.af = ['aP', 'aUV', 'aC'].map(n => gl.getAttribLocation(this.pf, n));
    this.parts = buildMeshes().map(m => upload(gl, m));
    this.tools = {};
    for (const id of [...Object.keys(TOOLS).filter(k => k !== 'hand'), 'arrow', 'bolt', 'bobber']) this.tools[id] = upload(gl, buildToolMesh(id));
    this.flatBuf = gl.createBuffer();
  }

  /** quads in device px: list of [cx, cy, halfW, halfH, angle, r, g, b, a] */
  flat(kind, quads, blend) {
    if (!quads.length) return;
    const gl = this.gl, d = new Float32Array(quads.length * 6 * 8);
    let o = 0;
    for (const [cx, cy, hw, hh, a, r, g, b, al] of quads) {
      const c = Math.cos(a), s = Math.sin(a);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { d.set([cx + u * hw * c - v * hh * s, cy + u * hw * s + v * hh * c, u, v, r, g, b, al], o); o += 8; }
    }
    gl.useProgram(this.pf); gl.uniform1f(this.uf.uKind, kind);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flatBuf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    const [ap, auv, ac] = this.af;
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(auv); gl.vertexAttribPointer(auv, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(ac); gl.vertexAttribPointer(ac, 4, gl.FLOAT, false, 32, 16);
    gl.enable(gl.BLEND); blend();
    gl.drawArrays(gl.TRIANGLES, 0, quads.length * 6);
    gl.disableVertexAttribArray(auv); gl.disableVertexAttribArray(ac);
  }

  draw(hero, fx, view, marks, time) {
    const gl = this.gl, { cam, zoom, W, H, lt } = view;
    const toPx = (x, y) => [(x - cam.x) * zoom + W / 2, (y - cam.y) * zoom + H / 2];
    gl.useProgram(this.pf); gl.uniform2f(this.uf.uRes, W, H);

    // 1. footprints
    const prints = marks.prints.map(p => {
      const age = time - p.t0, a = Math.max(0, 1 - age / 50) * (p.mud ? .55 : .42);
      const [x, y] = toPx(p.x, p.y), col = p.mud ? [.45, .38, .3] : [.62, .52, .4];
      return [x, y, 1.45 * zoom * (p.side || 1), 2.7 * zoom, p.ang - Math.PI / 2, ...col, a];   // side −1 mirrors the right foot
    }).filter(q => q[8] > .01);
    this.flat(0, prints, () => gl.blendFunc(gl.DST_COLOR, gl.ZERO));
    // 2. water rings
    const rings = marks.rings.map(r => {
      const age = (time - r.t0) / 1.3, [x, y] = toPx(r.x, r.y), s = (3 + age * 13) * zoom * (r.s || 1);
      return [x, y, s, s * .62, 0, .9, .97, 1, (1 - age) * .55];
    }).filter(q => q[8] > .01);
    this.flat(1, rings, () => gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA));

    // ---- what to draw: hero bones + tool + extra objects ----
    const Y = yawMatrix(hero.yaw), [ox, oy] = toPx(hero.x, hero.y), P = hero.pose, def = TOOLS[hero.tool] || TOOLS.hand;
    const items = [];
    this.parts.forEach((p, i) => {
      const nm = BONES[i][0];
      if (!p.n || (nm === 'torch' && hero.light !== 'torch') || (nm === 'lantern' && hero.light !== 'lantern')) return;
      items.push({ ...p, M: M4.mul(Y, P.W[i]), ox, oy, yo: 0 });
    });
    if (def.hand) items.push({ ...this.tools[hero.tool], M: M4.mul(Y, P.W[def.hand === 'L' ? BONE.toolL : BONE.tool]), ox, oy, yo: 0 });
    if (hero.nock) {                                                                   // arrow on the string while drawing the bow
      const a = P.pts.handR, b = P.pts.bowGrip, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1;
      items.push({ ...this.tools.arrow, M: M4.mul(Y, alongMatrix([a[0] + d[0] / l * 11, a[1] + d[1] / l * 11, a[2] + d[2] / l * 11], d)), ox, oy, yo: 0 });
    }
    if (hero.tool === 'crossbow' && hero.loaded) items.push({ ...this.tools.bolt, M: M4.mul(Y, M4.mul(P.W[BONE.tool], M4.T(0, -1.3, 6.5))), ox, oy, yo: 0 });
    for (const pr of fx.projectiles) {
      const [px, py] = toPx(pr.x, pr.y);
      items.push({ ...this.tools[pr.kind], M: alongMatrix([0, 0, pr.z], [pr.dx, pr.dy, pr.dz]), ox: px, oy: py, yo: pr.y - hero.y });
    }
    if (hero.line && hero.line.state !== 'none') {
      const L = hero.line, [px, py] = toPx(L.x, L.y);
      items.push({ ...this.tools.bobber, M: M4.mul(M4.T(0, 0, L.z), M4.RX(Math.sin(time * 3) * .15)), ox: px, oy: py, yo: L.y - hero.y });
    }

    // 3 + 4. shadows then lit meshes
    const ub = this.ub;
    gl.useProgram(this.pb);
    gl.uniform2f(ub.uRes, W, H); gl.uniform1f(ub.uZoom, zoom);
    gl.uniform3fv(ub.uLight, lt.L); gl.uniform3fv(ub.uLightCol, lt.lightCol); gl.uniform3fv(ub.uAmb, lt.amb);
    gl.uniform1f(ub.uWater, hero.water > 0 ? hero.water : -99);
    const lightM = hero.light ? M4.apply(Y, ...P.tip) : null;
    gl.uniform3fv(ub.uTorchP, lightM || [0, 0, -999]); gl.uniform1f(ub.uTorchI, hero.light ? hero.lightI * (hero.light === 'lantern' ? .8 : 1) : 0);
    const [aP, aN, aC] = this.ab;
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN); gl.enableVertexAttribArray(aC);
    const drawItems = () => {
      for (const p of items) {
        gl.uniformMatrix4fv(ub.uM, false, p.M); gl.uniform2f(ub.uOrigin, p.ox, p.oy); gl.uniform1f(ub.uYOff, p.yo);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.b);
        gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 36, 24);
        gl.drawArrays(gl.TRIANGLES, 0, p.n);
      }
    };
    const shadowA = (.34 * lt.day + .1 * (1 - lt.day)) * (hero.water > 6 ? .4 : 1);
    gl.uniform1f(ub.uMode, 1); gl.uniform1f(ub.uShadowA, shadowA);
    gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawItems();
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
    gl.uniform1f(ub.uMode, 0);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    drawItems();
    gl.disable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(aN); gl.disableVertexAttribArray(aC);

    // 5. strings and the fishing line (thin quads between projected points)
    const proj = p => { const w = M4.apply(Y, ...p); return [ox + w[0] * zoom, oy + (w[1] * KY - w[2] * KZ) * zoom]; };
    const lit = lt.lightCol.map((v, i) => Math.min(1, v * .6 + lt.amb[i] * 1.2));
    const seg = [], line = (a, b, w, c, al) => { const dx = b[0] - a[0], dy = b[1] - a[1]; seg.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(dx, dy) / 2 + .5, w, Math.atan2(dy, dx), ...c, al]); };
    const strCol = [.82, .78, .68].map((v, i) => v * lit[i]);
    if (hero.tool === 'bow') {
      const t = proj(P.pts.bowTop), b = proj(P.pts.bowBot), m = hero.nock ? proj(P.pts.handR) : proj(P.pts.bowRest);
      line(t, m, .3 * zoom, strCol, .9); line(m, b, .3 * zoom, strCol, .9);
    }
    if (hero.tool === 'crossbow') {
      const l = proj(P.pts.xbL), r = proj(P.pts.xbR), n = proj(hero.loaded ? P.pts.xbNut : P.pts.xbFront);
      line(l, n, .35 * zoom, strCol, .9); line(n, r, .35 * zoom, strCol, .9);
    }
    if (hero.tool === 'rod' && hero.line && hero.line.state !== 'none') {
      const a = proj(P.pts.tip), L = hero.line, [bx, by] = toPx(L.x, L.y), b = [bx, by - (L.z + 2.6) * KZ * zoom];
      const sag = L.state === 'fly' ? 4 : 14, pts = [];
      for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI) * sag * zoom * .3]); }
      for (let i = 0; i < 14; i++) line(pts[i], pts[i + 1], .22 * zoom + .4, strCol, .75);
    }
    this.flat(3, seg, () => gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA));
    // 6. dust / spray puffs
    const puffs = fx.dust.map(d => {
      const age = (time - d.t0) / d.life, [x, y] = toPx(d.x, d.y), s = (d.s + age * d.g) * zoom;
      return [x, y - d.z * KZ * zoom, s, s * .8, 0, ...d.c.map((v, i) => v * lit[i] * 1.3), (1 - age) * d.a];
    }).filter(q => q[8] > .01);
    this.flat(4, puffs, () => gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA));

    // 7. flame / lantern glow
    if (lightM) {
      const fxp = ox + lightM[0] * zoom, fyp = oy + (lightM[1] * KY - lightM[2] * KZ) * zoom, fl = .85 + .15 * Math.sin(time * 23) * Math.sin(time * 7.3);
      const q = hero.light === 'torch' ? [
        [fxp, fyp - 1.5 * zoom, 22 * zoom, 22 * zoom, 0, 1, .55, .2, .22 * fl * hero.lightI],
        [fxp, fyp - 2.2 * zoom, 3.2 * zoom * fl, 5.5 * zoom * fl, Math.sin(time * 9) * .15, 1, .45, .1, .95],
        [fxp, fyp - 1.6 * zoom, 2.2 * zoom, 3.8 * zoom * fl, Math.sin(time * 11) * .2, 1, .8, .35, .9],
        [fxp, fyp - .8 * zoom, 1.2 * zoom, 1.8 * zoom, 0, 1, .95, .75, .9],
      ] : [
        [fxp, fyp, 16 * zoom, 16 * zoom, 0, 1, .7, .3, .2 * hero.lightI],
        [fxp, fyp, 2.6 * zoom, 3.2 * zoom, 0, 1, .85, .5, .8 * fl],
      ];
      this.flat(2, q, () => gl.blendFunc(gl.ONE, gl.ONE));
    }
    gl.disable(gl.BLEND);
    return lightM ? [hero.x + lightM[0], hero.y + lightM[1]] : null;
  }
}
