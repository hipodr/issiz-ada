// GPU terrain renderer (WebGL1). Every screen pixel is shaded from the terrain textures + a noise texture.
//
// Input  : packed terrain textures A/B/C (terrain.js packTerrain), camera {x, y, zoom}, time (s), day time 0..1
// Process: fragment shader → material blend (sand / grass / forest floor / dirt trail / mud / rock / reef)
//          + normal-mapped sun/moon light, animated sea (depth colour, caustics, waves, shore foam) and river (flows downhill), cave mouth
// Output : one full-screen triangle drawn into the canvas
import { TSIZE, TN } from './terrain.js';
import { mulberry32 } from '../util.js';

const VS = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

const FS = `
precision highp float;
uniform sampler2D uA, uB, uC, uNoise;
uniform vec2 uRes, uCam;
uniform float uZoom, uTime, uWorld, uDay, uCaveOn;
uniform vec3 uLight, uLightCol, uAmb, uCave;
uniform vec4 uTorch;                                   // x, y (world), radius, intensity — the hero's torch at night

// smooth value noise from the random texture (bilinear + smoothstep trick)
float n1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return texture2D(uNoise, (i + f + .5) / 256.).r; }
vec4  n4(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return texture2D(uNoise, (i + f + .5) / 256.); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * n1(p); p = p * 2.03 + vec2(13.7, 7.1); a *= .5; } return s * 1.0667; }
vec4  cell(vec2 i){ return texture2D(uNoise, (i + .5) / 256.); }      // per-cell random (exact texel)

// cellular noise → x: distance to nearest seed, y: gap to 2nd nearest (0 on cracks), zw: cell ids; o = vector pixel → seed
vec4 vor(vec2 p, out vec2 o){
  vec2 i = floor(p), f = fract(p); float d1 = 9., d2 = 9.; vec2 id = vec2(0.); o = vec2(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec4 r = cell(i + g); vec2 v = g + .1 + r.xy * .8 - f; float d = dot(v, v);
    if (d < d1) { d2 = d1; d1 = d; id = r.zw; o = v; } else if (d < d2) d2 = d;
  }
  d1 = sqrt(d1); return vec4(d1, sqrt(d2) - d1, id);
}

// bicubic B-spline lookup of a 256² terrain texture: smooth, no grid creases
vec4 tex3(sampler2D s, vec2 uv){
  vec2 st = uv * 256. - .5, i = floor(st), f = fract(st);
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1. - 3. * f + 3. * f2 - f3) / 6., w1 = (4. - 6. * f2 + 3. * f3) / 6., w2 = (1. + 3. * f + 3. * f2 - 3. * f3) / 6., w3 = f3 / 6.;
  vec2 g0 = w0 + w1, g1 = w2 + w3, h0 = (i - .5 + w1 / g0) / 256., h1 = (i + 1.5 + w3 / g1) / 256.;
  return g0.y * (g0.x * texture2D(s, h0) + g1.x * texture2D(s, vec2(h1.x, h0.y))) + g1.y * (g0.x * texture2D(s, vec2(h0.x, h1.y)) + g1.x * texture2D(s, h1));
}

vec3 torchL(vec3 N, vec2 p){
  if (uTorch.w <= 0.) return vec3(0.);
  vec2 d = uTorch.xy - p; float f = 1. - length(d) / uTorch.z; if (f <= 0.) return vec3(0.);
  vec3 L = normalize(vec3(d, 24.));
  return vec3(1., .6, .28) * f * f * uTorch.w * max(dot(N, L) * .75 + .25, 0.);
}
vec3 shade(vec3 alb, vec3 N, float ao, vec2 p){
  float d = dot(N, uLight);
  return alb * (uAmb * ao + uLightCol * max(d * .85 + .15, 0.) + torchL(N, p));
}

void main(){
  vec2 p = uCam + vec2(gl_FragCoord.x - .5 * uRes.x, .5 * uRes.y - gl_FragCoord.y) / uZoom;   // world units, y = south
  vec2 uv = p / uWorld;
  float inside = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
  vec4 A = tex3(uA, uv), B = tex3(uB, uv), C = texture2D(uC, uv);
  float e = A.r * 2. - 1., h = mix(-1., sign(e) * e * e, inside);
  float moist = A.g, riv = A.b * inside, trail = A.a * inside;
  float feat = B.b * inside, rock = B.a * inside, dSea = C.r * 32., dRiv = mix(32., C.g * 32., inside);
  vec3 N0 = vec3((B.r * 2. - 1.) * inside, (B.g * 2. - 1.) * inside, 0.); N0.z = sqrt(max(.04, 1. - dot(N0.xy, N0.xy)));
  float slope = 1. - N0.z, t = uTime;

  // detail fades out when zoomed far out (no shimmer); zoom = device px per world unit
  float fine = smoothstep(.9, 2.2, uZoom), mid = smoothstep(.25, .9, uZoom);
  float g1 = fbm(p * .010), g2 = fbm(p * .045 + 17.), g3 = n1(p * .25 + 5.);
  float hd = h + (g1 - .5) * .016 + (g3 - .5) * .004 * mid;
  float day = uDay;

  // ---------------- materials ----------------
  // grass: clumps (cellular), blades (stretched noise), large soft patches
  vec4 gv = vec4(.5, .3, .5, .5); vec2 go = vec2(0.);
  if (fine > 0.) gv = vor(p / 4.2 + (n4(p * .09).rg - .5) * .9, go);                                  // tufts (only computed when close enough to see)
  float clump = 1. - smoothstep(.0, .85, gv.x);
  float gap = smoothstep(.0, .14, gv.y);
  float blade = n1(vec2(p.x * 2.2, p.y * .6) + gv.zw * 9.);
  vec3 dry = vec3(.60, .58, .31), lush = vec3(.34, .52, .20), deep = vec3(.19, .33, .13);
  vec3 grassC = mix(dry, lush, smoothstep(.2, .56, moist));
  grassC = mix(grassC, deep, smoothstep(.6, .86, moist + (g1 - .5) * .3));
  grassC *= .9 + .14 * g2;
  grassC *= mix(vec3(1.), mix(vec3(1.04, 1.03, .82), vec3(.9, 1., 1.06), gv.z), fine);                   // per-tuft hue
  grassC *= mix(1., (.74 + .36 * clump) * (.9 + .1 * gap) * (.8 + .3 * blade) * (.9 + .2 * n1(p * 1.7 + 3.)), fine);
  grassC = mix(grassC, grassC * vec3(1.1, 1.05, .8), smoothstep(.55, .75, g3) * .3);                // sun-bleached tips
  float leaf = step(.82, gv.w) * smoothstep(.6, .85, moist) * fine;                                     // forest floor litter
  grassC = mix(grassC, vec3(.45, .33, .17) * (.8 + .4 * gv.z), leaf * .55);
  vec4 fv = vec4(1.); vec2 fo;
  if (fine > 0. && moist > .25 && moist < .82) fv = vor(p / 2.1 + 40., fo);
  float flower = (1. - smoothstep(.12, .2, fv.x)) * step(.9, fv.z) * smoothstep(.28, .5, moist) * (1. - smoothstep(.65, .8, moist)) * (.35 + feat) * fine;
  grassC = mix(grassC, mix(vec3(.98, .92, .45), mix(vec3(.97, .97, .95), vec3(.92, .45, .55), step(.5, fv.w)), step(.4, fv.w)), clamp(flower, 0., 1.));
  grassC = mix(grassC, vec3(.52, .66, .30) * (.82 + .3 * clump), feat * .55 * step(0., hd));             // clearings: short bright grass

  // sand: fine grain + wind ripples + scattered shells/pebbles
  float grain = n1(p * 2.3) * fine;
  vec3 sandC = mix(vec3(.85, .76, .55), vec3(.94, .87, .69), g2) * (.95 + .08 * grain);
  sandC *= 1. + .045 * sin(dot(p, vec2(.42, .27)) + g1 * 16. + g3 * 3.) * mid;
  vec4 pv = vec4(1.); vec2 po = vec2(0.);
  if (fine > 0. && (trail > .2 || dSea < 10.)) pv = vor(p / 1.8 + 7., po);
  float peb = (1. - smoothstep(.16, .26, pv.x)) * step(.86, pv.z) * fine;

  // dirt trail: packed earth, ruts, pebbles
  vec3 dirtC = vec3(.55, .43, .29) * (.82 + .2 * g2 + .1 * grain);
  dirtC *= .92 + .08 * sin(p.x * .9 + p.y * .4 + g3 * 6.) * fine;
  dirtC = mix(dirtC, vec3(.62, .60, .55) * (.8 + .3 * pv.w), peb);

  // rock: plates with cracks (cellular), strata, moss in the damp
  vec4 rv = vec4(.5, .5, .5, .5); vec2 ro = vec2(0.);
  if (mid > 0. && (rock > .1 || slope > .25 || h > .5 || uCaveOn > .5 && length(p - uCave.xy) < 70.))
    rv = vor(p / 13. + (n4(p * .035).rg - .5) * 1.6, ro);                                            // warped cells → irregular boulders / slabs
  float crack = smoothstep(.0, .045, rv.y);
  vec3 rockC = mix(vec3(.47, .46, .43), vec3(.62, .60, .56), rv.z) * (.86 + .2 * g2) * (.93 + .1 * g3);
  rockC *= .92 + .08 * sin(h * 240. + g1 * 9.);
  rockC *= mix(1., (.62 + .38 * crack) * (.86 + .22 * n1(p * .9 + 21.)), mid);                        // cracks + rough grain
  rockC = mix(rockC, vec3(.33, .43, .22), smoothstep(.55, .8, n1(p * .06 + 60.) + moist * .3) * .4);
  vec3 mudC = vec3(.33, .29, .20) * (.86 + .2 * grain + .1 * g3);

  // blend weights
  float beachW = (1. - smoothstep(4., 9., dSea + (g1 - .5) * 6.)) * (1. - smoothstep(.03, .065, hd));
  float rocky = max(smoothstep(.3, .65, rock + (g2 - .5) * .3), smoothstep(.34, .55, slope + (g2 - .5) * .12));
  rocky = max(rocky, smoothstep(.6, .78, h + (g1 - .5) * .2) * .9);                                      // bare summits
  float bank = (1. - smoothstep(.6, 2.6, dRiv + (g3 - .5) * 1.4)) * (1. - smoothstep(.4, .55, riv));
  float path = smoothstep(.38, .62, trail + (g3 - .5) * .3 + (grain - .5) * .1);

  // cave: forced rock around the mouth
  vec2 cl = vec2(0.); float ce = 9.;
  if (uCaveOn > .5) {
    vec2 q = p - uCave.xy; float cs = cos(uCave.z), sn = sin(uCave.z);
    cl = vec2(dot(q, vec2(cs, sn)), dot(q, vec2(-sn, cs)));                                            // x = downhill, y = across
    ce = length(vec2((cl.x + 5.) / 12., cl.y / 19.)) + (n1(p * .22) - .5) * .14;
    rocky = max(rocky, 1. - smoothstep(1.3, 2.8, ce));
    path *= smoothstep(.9, 1.2, ce);
  }

  vec3 alb = grassC;
  alb = mix(alb, mudC, bank * .8);
  alb = mix(alb, dirtC, path);
  alb = mix(alb, rockC, clamp(rocky, 0., 1.) * (1. - path * .7));
  alb = mix(alb, mix(sandC, sandC * .8 + vec3(.06), peb), beachW * (1. - rocky * .75));
  float wetLine = 1. - smoothstep(0., .014, hd);
  alb *= 1. - .32 * wetLine * beachW;

  // normal: terrain + material relief
  vec2 bump = vec2(0.);
  bump += (n4(p * .22).gb - .5) * .35 * rocky * mid;
  bump += (n4(p * .9 + 11.).ra - .5) * .12 * fine;
  bump += -go * .22 * clump * fine * (1. - rocky) * (1. - beachW);                                        // tufts are little domes
  bump += (-ro * .35 + (rv.zw - .5) * .7) * rocky * mid;                                                  // slabs: dome + random tilt per slab
  bump += -po * 1.2 * peb;
  vec3 N = normalize(vec3(N0.xy + bump, N0.z));
  float ao = .8 + .2 * smoothstep(.2, .8, g2);
  ao *= mix(1., .55 + .45 * crack, rocky * mid);
  vec3 col = shade(alb, N, ao, p);

  // ---------------- river ----------------
  float rivW = smoothstep(.42, .6, riv + (g3 - .5) * .08);
  float isSea = (1. - smoothstep(-.0015, .0012, hd)) * (1. - rivW * smoothstep(-.012, -.002, h));       // a river bed is never "sea"
  float isRiv = rivW * (1. - isSea);
  if (isRiv > 0.) {
    vec2 fdir = normalize(N0.xy + vec2(1e-4));
    vec2 q = p - fdir * t * 26.;
    float deepR = smoothstep(.6, 1., riv);
    vec3 rc = mix(vec3(.24, .46, .42), vec3(.12, .32, .38), deepR);
    rc = mix(rc, mudC * .9, (1. - deepR) * .35);                                                       // shallow edges show the bed
    vec3 wn = normalize(vec3((n4(q * .07).rg - .5) * .35 + (n4(q * .19 + 9.).ba - .5) * .15 * mid, 1.));
    float spec = pow(max(dot(reflect(-uLight, wn), vec3(0., 0., 1.)), 0.), 70.) * day;
    vec3 rcol = rc * (uAmb + uLightCol * (.6 + .4 * max(dot(wn, uLight), 0.))) + uLightCol * spec * .35;
    float rap = smoothstep(.7, .9, n1(q * .2 + 3.)) * smoothstep(.08, .3, slope);                     // white water on steep stretches
    float edgeF = (1. - smoothstep(.45, .58, riv)) * .6 * (.5 + .5 * n1(q * .4));
    rcol = mix(rcol, vec3(.9, .94, .94) * (uAmb + uLightCol * .8), clamp(rap * .8 + edgeF * .35, 0., .85));
    rcol += rc * torchL(wn, p) * .9;
    col = mix(col, rcol, isRiv);
  }

  // ---------------- sea ----------------
  if (isSea > 0.) {
    float depth = max(-hd, 0.);
    vec3 wc = mix(vec3(.33, .80, .76), vec3(.09, .55, .66), smoothstep(0., .06, depth));
    wc = mix(wc, vec3(.04, .27, .47), smoothstep(.05, .25, depth));
    wc = mix(wc, vec3(.02, .13, .30), smoothstep(.25, .7, depth));
    vec2 co; vec4 cv = vor(p / 6. + 3., co);
    vec3 coral = mix(vec3(.78, .46, .40), vec3(.58, .52, .38), cv.z) * (.65 + .5 * (1. - smoothstep(.2, .7, cv.x)));
    vec3 bottom = mix(sandC * .95, coral, smoothstep(.25, .6, feat));
    float clearW = exp(-depth * 38.);
    wc = mix(wc, bottom * vec3(.7, .93, .93), clearW * .75);
    float ca = abs(n1(p * .06 + vec2(t * .22, t * .16)) - n1(p * .06 - vec2(t * .18, -t * .2) + 50.));
    wc += pow(1. - ca, 12.) * clearW * .3 * day * mid;                                                   // caustics
    vec3 wn = normalize(vec3((n4(p * .03 + t * vec2(.25, .1)).rg - .5) * .25 + (n4(p * .08 - t * vec2(.15, .28)).ba - .5) * .12 * mid, 1.));
    float spec = pow(max(dot(reflect(-uLight, wn), vec3(0., 0., 1.)), 0.), 90.) * day;
    float sky = .1 * (1. - wn.z) * 20.;                                                               // tilted facets reflect sky
    vec3 scol = wc * (uAmb + uLightCol * (.6 + .4 * max(dot(wn, uLight), 0.))) + uLightCol * spec * .3 + vec3(.5, .6, .7) * sky * .1 * (uAmb + uLightCol);
    float edge = 1. - smoothstep(0., .008, depth);
    float waves = smoothstep(.8, .97, sin(depth * 230. - t * 1.6 + g1 * 10.) * .5 + .5) * (1. - smoothstep(.003, .03, depth));
    float surf = smoothstep(.35, .7, feat) * smoothstep(.6, .9, n1(p * .1 + vec2(t * .4, t * .1)));
    float foam = clamp(edge * (.5 + .5 * n1(p * .5 + t * .3)) + waves * (.4 + .6 * n1(p * .18 + t)) + surf * .6, 0., 1.);
    scol = mix(scol, vec3(.94, .97, .98) * (uAmb + uLightCol * .85), foam * .85);
    scol += wc * torchL(wn, p) * .8;
    col = mix(col, scol, isSea);
  }

  // ---------------- cave mouth ----------------
  if (ce < 2.) {
    float mouth = 1. - smoothstep(.86, 1., ce);
    float inner = smoothstep(1., .15, length(vec2((cl.x + 9.) / 10., cl.y / 15.)));                // deepest part, uphill
    vec3 dark = mix(vec3(.05, .045, .04), vec3(.006, .006, .008), inner);
    col = mix(col, dark * (1. + uAmb * .3), mouth);
    float lip = smoothstep(.8, 1., ce) * (1. - smoothstep(1., 1.22, ce));
    float lit = smoothstep(-6., 8., cl.x);                                                           // downhill rim catches light, uphill rim is in shadow
    col = mix(col, rockC * (uAmb + uLightCol * 1.1), lip * lit * .9);
    col = mix(col, rockC * uAmb * .5, lip * (1. - lit) * .8);
  }

  // haze far out at sea, gentle tone map
  col = mix(col, uAmb * .9 + uLightCol * .12, smoothstep(.45, 1., -h) * .22);
  col = col / (1. + col * .18) * 1.12;
  gl_FragColor = vec4(col, 1.);
}`;

function shader(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Sun/moon light for a time of day (0 = midnight, sunrise ≈ 05:30, noon ≈ 12:30, sunset ≈ 19:30). */
export function lighting(tod) {
  const D0 = .23, D1 = .81, dayLen = D1 - D0;
  const a = tod >= D0 && tod <= D1 ? (tod - D0) / dayLen * Math.PI : Math.PI + ((tod - D1 + 1) % 1) / (1 - dayLen) * Math.PI;
  const el = Math.sin(a);                                                                              // >0 day, <0 night
  const day = sstep(-.14, .22, el), low = 1 - sstep(.05, .5, el);
  const sun = [Math.cos(Math.min(a, Math.PI)) * .7, -.6, .22 + .42 * Math.max(0, el)];                                   // from the north side, never overhead: hills read as relief
  const moon = [-.35, -.55, .76], L = mix3(moon, sun, day), l = Math.hypot(...L);
  const sunCol = mix3([1, .96, .88], [1.05, .58, .32], low * day).map(v => v * day * .95);
  const lightCol = sunCol.map((v, i) => v + [.17, .22, .36][i] * (1 - day));
  const amb = mix3([.05, .07, .14], mix3([.40, .45, .54], [.40, .32, .34], low * .6), day);
  return { L: L.map(v => v / l), lightCol, amb, day };
}

export class MapGL {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, stencil: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL yok');
    this.gl = gl; this.cv = canvas;
    const pr = gl.createProgram();
    gl.attachShader(pr, shader(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(pr, shader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr); this.pr = pr;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.buf = buf; this.loc = loc; this.torch = [0, 0, 0, 0];
    this.u = {};
    for (const n of ['uA', 'uB', 'uC', 'uNoise', 'uRes', 'uCam', 'uZoom', 'uTime', 'uWorld', 'uDay', 'uCaveOn', 'uLight', 'uLightCol', 'uAmb', 'uCave', 'uTorch']) this.u[n] = gl.getUniformLocation(pr, n);
    // random noise texture (repeats; the shader smooths it into value noise)
    const r = mulberry32(1234), nz = new Uint8Array(256 * 256 * 4); for (let i = 0; i < nz.length; i++) nz[i] = (r() * 256) | 0;
    this.tex = [this.texture(256, nz, true), null, null, null];
    gl.uniform1i(this.u.uNoise, 0); gl.uniform1i(this.u.uA, 1); gl.uniform1i(this.u.uB, 2); gl.uniform1i(this.u.uC, 3);
    gl.uniform1f(this.u.uWorld, TSIZE);
  }
  texture(size, data, repeat) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    return t;
  }
  /** packed = packTerrain(t); terrain = generateTerrain(seed) (for the cave). */
  setTerrain(packed, terrain) {
    const gl = this.gl;
    for (let k = 1; k <= 3; k++) if (this.tex[k]) gl.deleteTexture(this.tex[k]);
    this.tex[1] = this.texture(TN, packed.A); this.tex[2] = this.texture(TN, packed.B); this.tex[3] = this.texture(TN, packed.C);
    const c = terrain.cave;
    gl.uniform1f(this.u.uCaveOn, c ? 1 : 0); if (c) gl.uniform3f(this.u.uCave, c.x, c.y, c.ang);
  }
  /** cam: {x, y, zoom (css px per world unit)}, scale: device px per css px, time: seconds, tod: 0..1 */
  draw(cam, scale, time, tod) {
    const gl = this.gl, W = this.cv.width, H = this.cv.height, lt = lighting(tod);
    gl.viewport(0, 0, W, H); gl.useProgram(this.pr);                       // other renderers share this context
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(this.loc); gl.vertexAttribPointer(this.loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(this.u.uTorch, this.torch);
    for (let k = 0; k < 4; k++) { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, this.tex[k]); }
    gl.uniform2f(this.u.uRes, W, H); gl.uniform2f(this.u.uCam, cam.x, cam.y); gl.uniform1f(this.u.uZoom, cam.zoom * scale);
    gl.uniform1f(this.u.uTime, time % 1000); gl.uniform1f(this.u.uDay, lt.day);
    gl.uniform3fv(this.u.uLight, lt.L); gl.uniform3fv(this.u.uLightCol, lt.lightCol); gl.uniform3fv(this.u.uAmb, lt.amb);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return lt;
  }
}
