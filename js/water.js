// Animated sea around the island.
// Input : the island's land mask (canvas, blurred white = land) and its world span, the sun direction
// Process: one large plane; colour from depth (distance to shore read from the blurred mask), two scrolling wave normals,
//          sun glint, sky reflection by angle, foam lines that roll towards the beach
// Output: THREE.Mesh (update(t) every frame)
import * as THREE from 'three';

export function makeWater(mask, span, sunDir) {
  const tex = new THREE.CanvasTexture(mask); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uSpan: { value: span }, uSun: { value: sunDir.clone().normalize() } }]),
    vertexShader: `
      varying vec3 vW;
      ${THREE.ShaderChunk.fog_pars_vertex}
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        ${THREE.ShaderChunk.fog_vertex}
      }`,
    fragmentShader: `
      uniform sampler2D uMask; uniform float uT, uSpan; uniform vec3 uSun; varying vec3 vW;
${THREE.ShaderChunk.fog_pars_fragment}
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      vec2 grad(vec2 p){ float e = .05; return vec2(n(p + vec2(e,0)) - n(p - vec2(e,0)), n(p + vec2(0,e)) - n(p - vec2(0,e))) / (2.*e); }
      void main(){
        vec2 uv = vW.xz / uSpan + .5;
        float land = (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) ? 0. : texture2D(uMask, uv).r;
        vec2 g = grad(vW.xz * .35 + vec2(uT * .25, uT * .12)) * .5 + grad(vW.xz * .9 - vec2(uT * .2, -uT * .3)) * .25;
        vec3 N = normalize(vec3(-g.x * .35, 1., -g.y * .35));
        vec3 deep = vec3(.03, .22, .38), mid = vec3(.05, .42, .55), shallow = vec3(.2, .68, .68);
        vec3 col = mix(deep, mid, smoothstep(.02, .3, land)); col = mix(col, shallow, smoothstep(.3, .75, land));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1. - max(dot(N, V), 0.), 4.);
        col = mix(col, vec3(.62, .8, .9), fres * .5);
        float spec = pow(max(dot(reflect(-uSun, N), V), 0.), 120.);
        col += vec3(1., .95, .85) * spec * 1.4;
        float waves = smoothstep(.75, .95, sin(land * 32. - uT * 1.6 + n(vW.xz * .4) * 3.) * .5 + .5) * smoothstep(.35, .7, land);
        float edge = smoothstep(.78, .92, land);
        col = mix(col, vec3(.95, .98, 1.), clamp(waves * .7 + edge * (.6 + .4 * n(vW.xz * 2. + uT)), 0., 1.));
        gl_FragColor = vec4(col, 1.);
        ${THREE.ShaderChunk.fog_fragment}
      }
`,
  });
  mat.uniforms.uMask = { value: tex };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span * 4, span * 4, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = .28; mesh.receiveShadow = false;
  mesh.update = t => { mat.uniforms.uT.value = t; };
  return mesh;
}
