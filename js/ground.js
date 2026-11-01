// Realistic ground material: 9 photo-scanned ambientCG textures blended per vertex (splat weights),
// with a hex-grid overlay drawn on top (the hexes stay as game logic, the ground looks continuous).
//
// Input : weights per vertex as attributes w0, w1 (vec4) + w2 (float) = 9 layer weights (sum 1)
//         layers: 0 grass · 1 grass-dirt · 2 sand · 3 rocky dirt · 4 paving · 5 orange rock · 6 dark rock · 7 blue rock · 8 pebbles
// Process: texture arrays (colour 1024² ×9, normal 512² ×9) sampled in world XZ, two scales mixed against tiling,
//          low-frequency brightness variation, blended normal maps; hex lines from the pointy-top lattice (tile width 2 m)
// Output: MeshStandardMaterial (material.grid(v) sets hex-line strength 0..1)
import * as THREE from 'three';

export const LAYERS = 9;
const TILE = [3, 4, 4.5, 4, 3, 6, 6, 7, 2];                   // metres per texture repeat, per layer

async function loadArray(suffix, size) {
  const data = new Uint8Array(size * size * 4 * LAYERS), cv = document.createElement('canvas');
  cv.width = cv.height = size; const g = cv.getContext('2d', { willReadFrequently: true });
  await Promise.all([...Array(LAYERS).keys()].map(async i => {
    const img = new Image(); img.src = `assets/ground/${i}_${suffix}.jpg`; await img.decode();
    return img;
  })).then(imgs => imgs.forEach((img, i) => { g.drawImage(img, 0, 0, size, size); data.set(g.getImageData(0, 0, size, size).data, i * size * size * 4); }));
  const t = new THREE.DataArrayTexture(data, size, size, LAYERS);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export async function makeGroundMaterial(lite) {
  const [tC, tN] = await Promise.all([loadArray('c', lite ? 512 : 1024), loadArray('n', lite ? 256 : 512)]);
  tC.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ roughness: .95, metalness: 0 });
  const U = { tC: { value: tC }, tN: { value: tN }, uGrid: { value: .8 } };
  mat.grid = v => { U.uGrid.value = v; };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 w0; attribute vec4 w1; attribute float w2;
varying vec4 vW0; varying vec4 vW1; varying float vW2; varying vec3 vWP; varying vec3 vWN;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vW0 = w0; vW1 = w1; vW2 = w2; vWP = (modelMatrix * vec4(transformed, 1.)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray tC; uniform highp sampler2DArray tN; uniform float uGrid;
varying vec4 vW0; varying vec4 vW1; varying float vW2; varying vec3 vWP; varying vec3 vWN;
const float TILE[9] = float[9](${TILE.map(v => v.toFixed(2)).join(',')});
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
float hexLine(vec2 p){
  const float S = 2.; vec2 r = vec2(S, S * 1.7320508), h = r * .5;
  vec2 a = mod(p, r) - h, b = mod(p - h, r) - h, q = abs(dot(a, a) < dot(b, b) ? a : b);
  float e = S * .5 - max(q.x, dot(q, vec2(.5, .8660254)));
  float fw = fwidth(e); return 1. - smoothstep(.01, .01 + fw * 1.2, e);
}
vec3 gN;`)
      .replace('#include <map_fragment>', `
float ws[9]; ws[0]=vW0.x; ws[1]=vW0.y; ws[2]=vW0.z; ws[3]=vW0.w; ws[4]=vW1.x; ws[5]=vW1.y; ws[6]=vW1.z; ws[7]=vW1.w; ws[8]=vW2;
float mac = vn(vWP.xz * .045) * .6 + vn(vWP.xz * .21) * .4;
vec3 col = vec3(0.); vec3 nrm = vec3(0.); float wsum = 0.;
for (int i = 0; i < 9; i++) {
  float w = ws[i]; if (w < .02) continue;
  vec2 uv = vWP.xz / TILE[i];
  vec3 c1 = texture(tC, vec3(uv, float(i))).rgb;
  vec3 c2 = texture(tC, vec3(mat2(.8, -.6, .6, .8) * uv * .37 + .21, float(i))).rgb;
  col += mix(c1, c2, .25 + .35 * mac) * w;
  nrm += (texture(tN, vec3(uv, float(i))).xyz * 2. - 1.) * w; wsum += w;
}
col /= max(wsum, .001); nrm /= max(wsum, .001);
col *= .82 + .36 * mac;
float land = smoothstep(.35, .7, vWP.y);
col = mix(col, vec3(.92, .9, .8), hexLine(vWP.xz) * uGrid * land * .28);
diffuseColor.rgb *= col;
gN = nrm;`)
      .replace('#include <normal_fragment_maps>', `
{ vec3 nW = normalize(vWN), T = normalize(vec3(1., 0., 0.) - nW * nW.x), B = cross(nW, T);
  vec3 p = normalize(T * gN.x + B * gN.y + nW * max(gN.z, .2));
  normal = normalize((viewMatrix * vec4(p, 0.)).xyz); }`);
  };
  return mat;
}
