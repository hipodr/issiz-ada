// Ada 1 demo: walk the captain around a hex-tile island.
// Input : touch (left side = floating joystick, two fingers = zoom), keyboard (WASD/arrows, Shift = run)
// Output: three.js scene rendered every frame; ?debug shows fps; window.__DEMO for tests
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildIsland, TOP } from './island.js';
import { makeWater } from './water.js';
import { loadHero } from './hero.js';
import { makeInput } from './input.js';

const $ = id => document.getElementById(id), q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ canvas: $('cv'), antialias: true, powerPreference: 'high-performance' });
let quality = q.has('lite') ? .5 : 1;                                             // ?lite: software-GL test runs
const resize = () => { renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * quality); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9ccbe0); scene.background = SKY; scene.fog = new THREE.Fog(SKY, 60, 150);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x4a5a3a, .9));
const sunDir = new THREE.Vector3(-.55, 1, .45).normalize();
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.castShadow = true; sun.shadow.mapSize.setScalar(q.has('lite') ? 1024 : 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(42, 1, .1, 400);
addEventListener('resize', resize); resize();

const loader = new GLTFLoader();
const island = await buildIsland(loader, +q.get('seed') || 11);
scene.add(island.group);
const water = makeWater(island.mask, island.span, sunDir); scene.add(water);

// ship anchored in the bay + the barracks of our first camp
const loadModel = url => new Promise((res, rej) => loader.load(url, g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); res(g.scene); }, undefined, rej));
const ship = await loadModel('assets/hex/unit-ship-large.glb'); ship.scale.setScalar(22); ship.position.copy(island.shipPos); ship.position.y = -.3; ship.rotation.y = 1.25; scene.add(ship);
const barracks = await loadModel('assets/buildings/barracks.glb'); barracks.scale.setScalar(6.5); barracks.position.copy(island.camp); barracks.rotation.y = .25; scene.add(barracks);
island.block(island.camp.x, island.camp.z, 3.6);

const hero = await loadHero(loader); hero.obj.position.copy(island.spawn); scene.add(hero.obj);
const input = makeInput($('cv'), $('stick'), $('knob'));
let dist = 15;
input.onPinch = f => { dist = Math.max(7, Math.min(40, dist / f)); };
$('busy').hidden = true;

const camTarget = hero.obj.position.clone();
let last = performance.now(), frames = 0, fpsT = 0, slowT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  hero.update(input.get(), dt, island.walkable);
  const p = hero.obj.position;
  camTarget.lerp(p, 1 - Math.exp(-dt * 6));
  camera.position.set(camTarget.x, camTarget.y + dist * .82, camTarget.z + dist * .62);
  camera.lookAt(camTarget.x, camTarget.y + .6, camTarget.z);
  sun.position.copy(camTarget).addScaledVector(sunDir, 60); sun.target.position.copy(camTarget);   // shadows follow the hero
  water.update(t);
  renderer.render(scene, camera);
  slowT = dt > 1 / 28 ? slowT + dt : Math.max(0, slowT - dt * .5);
  if (slowT > 1.5 && quality > .55 && !q.has('debug')) { quality *= .8; resize(); slowT = 0; }
  if (q.has('debug')) { frames++; fpsT += dt; if (fpsT > .5) { $('fps').textContent = Math.round(frames / fpsT) + ' fps'; frames = 0; fpsT = 0; } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__DEMO = { hero, island, camera, setDist: d => { dist = d; }, input };
