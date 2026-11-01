// Draws the hero (and his marks on the ground) into the MapGL context, after the terrain pass.
//
// Input : hero { x, y, yaw, pose (from model.pose), torch, water }, view { cam, zoom (device px / world unit), W, H, lt (lighting) },
//         marks { prints: [{x,y,ang,side,t0,mud}], rings: [{x,y,t0}] }, time (s)
// Process: 1) footprints (multiply blend)  2) water rings  3) sun shadow = model flattened along the light, stencil → one darkening
//          4) lit model (depth test; oblique 3/4 view: screen y = y·KY − z·KZ)  5) torch flame + glow (additive)
// Output : pixels; returns the torch tip in world coords (for the terrain light) or null
import { buildMeshes, BONES, M4 } from './model.js';

export const KY = .55, KZ = .92;      // oblique view of the model: ground-forward squashed, height almost full

const VS_BODY = `
attribute vec3 aP, aN, aC;
uniform mat4 uM;
uniform vec2 uOrigin, uRes;
uniform float uZoom, uMode;
uniform vec3 uLight;
varying vec3 vN, vC, vW;
void main(){
  vec4 w = uM * vec4(aP, 1.);
  vW = w.xyz; vN = (uM * vec4(aN, 0.)).xyz; vC = aC;
  vec2 s; float z;
  if (uMode > .5) { s = w.xy - uLight.xy / max(uLight.z, .3) * max(w.z, 0.); z = 0.; }       // shadow on the ground
  else { s = vec2(w.x, w.y * ${KY} - w.z * ${KZ}); z = -(w.y * .6 + w.z * .8) / 120.; }
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
  c += vC * vec3(1., .6, .3) * uTorchI * max(dot(n, tl / td) * .8 + .2, 0.) * clamp(1. - td / 70., 0., 1.);
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
  } else {                                              // glow / flame (additive)
    float a = pow(max(0., 1. - r), 2.) * vC.a;
    gl_FragColor = vec4(vC.rgb * a, 1.);
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

export class HeroGL {
  constructor(gl) {
    this.gl = gl;
    this.pb = program(gl, VS_BODY, FS_BODY); this.pf = program(gl, VS_FLAT, FS_FLAT);
    const U = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
    this.ub = U(this.pb, ['uM', 'uOrigin', 'uRes', 'uZoom', 'uMode', 'uLight', 'uShadowA', 'uWater', 'uTorchI', 'uLightCol', 'uAmb', 'uTorchP']);
    this.uf = U(this.pf, ['uRes', 'uKind']);
    this.ab = ['aP', 'aN', 'aC'].map(n => gl.getAttribLocation(this.pb, n));
    this.af = ['aP', 'aUV', 'aC'].map(n => gl.getAttribLocation(this.pf, n));
    // one interleaved buffer per bone: pos(3) nrm(3) col(3)
    this.parts = buildMeshes().map(m => {
      const n = m.pos.length / 3, data = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) data.set([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2], m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]], i * 9);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { b, n };
    });
    this.flatBuf = gl.createBuffer();
  }

  /** quads in device px: list of [cx, cy, halfW, halfH, angle, r, g, b, a] */
  flat(kind, quads, blend) {
    if (!quads.length) return;
    const gl = this.gl, d = new Float32Array(quads.length * 6 * 8);
    let o = 0;
    for (const [cx, cy, hw, hh, a, r, g, b, al] of quads) {
      const c = Math.cos(a), s = Math.sin(a);
      const P = (u, v) => [cx + (u * hw) * c - (v * hh) * s, cy + (u * hw) * s + (v * hh) * c];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { d.set([...P(u, v), u, v, r, g, b, al], o); o += 8; }
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

  draw(hero, view, marks, time) {
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
      const age = (time - r.t0) / 1.3, [x, y] = toPx(r.x, r.y), s = (3 + age * 13) * zoom;
      return [x, y, s, s * .62, 0, .9, .97, 1, (1 - age) * .55];
    }).filter(q => q[8] > .01);
    this.flat(1, rings, () => gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA));

    // 3 + 4. shadow then body
    const pr = this.pb, ub = this.ub, Y = yawMatrix(hero.yaw), [ox, oy] = toPx(hero.x, hero.y);
    gl.useProgram(pr);
    gl.uniform2f(ub.uOrigin, ox, oy); gl.uniform2f(ub.uRes, W, H); gl.uniform1f(ub.uZoom, zoom);
    gl.uniform3fv(ub.uLight, lt.L); gl.uniform3fv(ub.uLightCol, lt.lightCol); gl.uniform3fv(ub.uAmb, lt.amb);
    gl.uniform1f(ub.uWater, hero.water > 0 ? hero.water : -99);
    const tipM = hero.torch ? M4.apply(Y, ...hero.pose.tip) : null;
    gl.uniform3fv(ub.uTorchP, tipM || [0, 0, -999]); gl.uniform1f(ub.uTorchI, hero.torch ? hero.torchI : 0);
    const [aP, aN, aC] = this.ab;
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN); gl.enableVertexAttribArray(aC);
    const parts = this.parts.map((p, i) => ({ ...p, M: M4.mul(Y, hero.pose.W[i]), skip: BONES[i][0] === 'torch' && !hero.torch }));
    const drawParts = () => {
      for (const p of parts) {
        if (p.skip) continue;
        gl.uniformMatrix4fv(ub.uM, false, p.M);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.b);
        gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 36, 24);
        gl.drawArrays(gl.TRIANGLES, 0, p.n);
      }
    };
    // shadow: flatten along the light; stencil makes overlapping parts darken only once
    const shadowA = (.34 * lt.day + .1 * (1 - lt.day)) * (hero.water > 6 ? .4 : 1);
    gl.uniform1f(ub.uMode, 1); gl.uniform1f(ub.uShadowA, shadowA);
    gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawParts();
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
    // body
    gl.uniform1f(ub.uMode, 0);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    drawParts();
    gl.disable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(aN); gl.disableVertexAttribArray(aC);

    // 5. flame
    if (tipM) {
      const fx = ox + tipM[0] * zoom, fy = oy + (tipM[1] * KY - tipM[2] * KZ) * zoom, fl = .85 + .15 * Math.sin(time * 23) * Math.sin(time * 7.3);
      const q = [
        [fx, fy - 1.5 * zoom, 22 * zoom, 22 * zoom, 0, 1, .55, .2, .22 * fl * hero.torchI],              // halo
        [fx, fy - 2.2 * zoom, 3.2 * zoom * fl, 5.5 * zoom * fl, Math.sin(time * 9) * .15, 1, .45, .1, .95],
        [fx, fy - 1.6 * zoom, 2.2 * zoom, 3.8 * zoom * fl, Math.sin(time * 11) * .2, 1, .8, .35, .9],
        [fx, fy - .8 * zoom, 1.2 * zoom, 1.8 * zoom, 0, 1, .95, .75, .9],
      ];
      this.flat(2, q, () => gl.blendFunc(gl.ONE, gl.ONE));
    }
    gl.disable(gl.BLEND);
    return tipM ? [hero.x + tipM[0], hero.y + tipM[1]] : null;
  }
}
