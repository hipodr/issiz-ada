// Ada 1 demo: walk the captain around a hex-tile island.
// Input : touch (left side = floating joystick, two fingers = zoom), keyboard (WASD/arrows, Shift = run)
// Output: three.js scene rendered every frame; ?debug shows fps; window.__DEMO for tests
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildIsland } from './island.js';
import { makeWater } from './water.js';
import { buildNature } from './nature.js';
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
const island = await buildIsland(loader, +q.get('seed') || 11, q.has('lite'));
scene.add(island.group);
const water = makeWater(island.mask, island.span, sunDir); scene.add(water);
const nature = await buildNature(loader, island, 7, q.has('lite')); scene.add(nature.group);

// ship anchored in the bay + the barracks of our first camp
const loadModel = url => new Promise((res, rej) => loader.load(url, g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); res(g.scene); }, undefined, rej));
const ship = await loadModel('assets/hex/unit-ship-large.glb'); ship.scale.setScalar(22); ship.position.copy(island.shipPos); ship.position.y = -.3; ship.rotation.y = 1.25; scene.add(ship);
const barracks = await loadModel('assets/buildings/barracks.glb'); barracks.scale.setScalar(6.5); barracks.position.copy(island.camp); barracks.position.y -= .15; barracks.rotation.y = .25; scene.add(barracks);
island.block(island.camp.x, island.camp.z, 3.6);

const hero = await loadHero(loader, q.get('hero') === 'adv' ? 'assets/hero/adventurer.glb' : 'assets/hero/captain.glb'); hero.obj.position.copy(island.spawn); scene.add(hero.obj);
// captain silhouette: parts hidden behind trees / buildings are drawn again as a soft gold shape (layer 1 pass)
hero.obj.traverse(o => o.layers.set(1)); sun.shadow.camera.layers.enable(1);
scene.traverse(o => { if (o.isLight) o.layers.enable(1); });   // captain lives on layer 1 only (still casts a shadow)
const ghost = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .45, depthFunc: THREE.GreaterDepth, depthWrite: false });
const input = makeInput($('cv'), $('stick'), $('knob'));
let grid = false; $('grid').classList.add('off'); $('grid').onclick = () => { grid = !grid; island.material.grid(grid ? .8 : 0); $('grid').classList.toggle('off', !grid); };
// camera: dist 2.2 m (face to face, almost level) … 22 m (overview, ~47° down); right-side drag turns it around the captain
let dist = 14, camYaw = 0, idleT = 0;
input.onPinch = f => { dist = Math.max(2.2, Math.min(22, dist / f)); };
input.onOrbit = dx => { camYaw -= dx * 4; };
// animation test panel
const ANIMS = [['Selam', 'Wave'], ['Al', 'Interact'], ['Kılıç', 'Sword_Slash'], ['Ateş', 'Gun_Shoot'], ['Nişan', 'Idle_Gun'], ['Takla', 'Roll'], ['Darbe', 'HitRecieve'], ['Ölüm', 'Death'], ['Avaturn', 'Avaturn_avaturn_animation']];
$('anims').innerHTML = ANIMS.filter(([, n]) => hero.anims.includes(n)).map(([l, n]) => `<button data-a="${n}">${l}</button>`).join('');
$('anims').onclick = e => { const n = e.target.dataset?.a; if (n) hero.play(n, n === 'Death'); };
$('animBtn').onclick = () => { $('anims').hidden = !$('anims').hidden; };
$('busy').hidden = true;

const camTarget = hero.obj.position.clone();
let last = performance.now(), frames = 0, fpsT = 0, slowT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  const iv = input.get(), cs = Math.cos(camYaw), sn = Math.sin(camYaw);             // stick is screen-relative → rotate by camera yaw
  idleT = Math.hypot(iv.x, iv.y) < .12 ? idleT + dt : 0;
  const face = dist < 5 && idleT > .8 ? camYaw : undefined;                           // close-up and idle: look at the camera
  hero.update({ x: iv.x * cs + iv.y * sn, y: -iv.x * sn + iv.y * cs, face }, dt, island.walkable);
  const p = hero.obj.position; p.y += (island.heightAt(p.x, p.z) - p.y) * Math.min(1, dt * 20);
  camTarget.lerp(p, 1 - Math.exp(-dt * 6));
  const k = THREE.MathUtils.smoothstep(dist, 2.2, 14), pitch = THREE.MathUtils.lerp(.12, .82, k), lookY = THREE.MathUtils.lerp(1.55, .6, k);
  const hd = dist * Math.cos(pitch);
  camera.position.set(camTarget.x + Math.sin(camYaw) * hd, camTarget.y + lookY + dist * Math.sin(pitch), camTarget.z + Math.cos(camYaw) * hd);
  camera.lookAt(camTarget.x, camTarget.y + lookY, camTarget.z);
  sun.position.copy(camTarget).addScaledVector(sunDir, 60); sun.target.position.copy(camTarget);   // shadows follow the hero
  water.update(t); nature.update(camTarget);
  // 1) world without the captain, 2) his hidden parts as a gold ghost, 3) the captain himself
  renderer.render(scene, camera);
  renderer.autoClear = false; renderer.shadowMap.autoUpdate = false; camera.layers.set(1); const bg = scene.background; scene.background = null;
  scene.overrideMaterial = ghost; renderer.render(scene, camera); scene.overrideMaterial = null; renderer.render(scene, camera);
  scene.background = bg; camera.layers.set(0); renderer.autoClear = true; renderer.shadowMap.autoUpdate = true;
  slowT = dt > 1 / 28 ? slowT + dt : Math.max(0, slowT - dt * .5);
  if (slowT > 1.5 && quality > .55 && !q.has('debug')) { quality *= .8; resize(); slowT = 0; }
  if (q.has('debug')) { frames++; fpsT += dt; if (fpsT > .5) { $('fps').textContent = Math.round(frames / fpsT) + ' fps'; frames = 0; fpsT = 0; } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__DEMO = { setYaw: v => { camYaw = v; }, camTarget, nature, hero, island, camera, setDist: d => { dist = d; }, input };
