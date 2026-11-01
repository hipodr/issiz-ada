// New play page (ada.html), step 2 of the rebuild: the hero walking on the GPU map. Nothing else on the island yet.
// Input : touch joystick (left part of the screen), pinch zoom, keyboard (WASD / arrows, Shift = run), time slider
// Output: terrain + hero drawn every frame; ?seed=N picks the island, ?debug shows fps; window.__ADA for tests
import { generateTerrain, packTerrain, TSIZE } from '../map/terrain.js';
import { MapGL } from '../map/gl.js';
import { HeroGL } from '../hero/render.js';
import { createHero, createFx, stepHero, equip, use, actionLabel } from './hero.js';
import { TOOLS, TOOL_IDS } from '../hero/tools.js';
import { ICON } from '../data/icons.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), q = new URLSearchParams(location.search);
let mapgl, herogl;
try { mapgl = new MapGL(cv); herogl = new HeroGL(mapgl.gl); }
catch (e) { $('err').style.display = 'grid'; $('err').textContent += ' (' + e.message + ')'; throw e; }

let terrain = null, hero = null, seed = +q.get('seed') || (Date.now() % 1e9), quality = 1, scale = 1;
const marks = { prints: [], rings: [] };
let fx = createFx();
const cam = { x: TSIZE / 2, y: TSIZE / 2, zoom: 1.6 };
const zoomBase = () => Math.min(innerWidth, innerHeight) / 250;          // ≈ 250 world units across the short side

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2), px = innerWidth * innerHeight * dpr * dpr;
  scale = dpr * Math.min(1, Math.sqrt(1.3e6 / px)) * quality;
  cv.width = Math.round(innerWidth * scale); cv.height = Math.round(innerHeight * scale);
}
addEventListener('resize', resize); resize();

function build(s) {
  $('busy').style.display = 'block';
  setTimeout(() => {
    seed = s >>> 0; terrain = generateTerrain(seed); mapgl.setTerrain(packTerrain(terrain), terrain);
    const sp = terrain.spawn || { x: TSIZE / 2, y: TSIZE / 2 };
    hero = createHero(sp.x, sp.y); marks.prints.length = 0; marks.rings.length = 0; fx = createFx(); refreshTools();
    cam.x = hero.x; cam.y = hero.y; cam.zoom = zoomBase();
    $('seedLbl').textContent = 'deneme · ada #' + seed; $('busy').style.display = 'none';
    history.replaceState(null, '', '?seed=' + seed + (q.has('debug') ? '&debug' : ''));
  }, 30);
}
$('newBtn').onclick = () => build(Math.floor(Math.random() * 1e9));

// ---- time of day (test control) ----
const tod = $('tod'), hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const showTod = () => { const m = +tod.value; $('tlbl').textContent = hhmm(m); $('timeBtn').textContent = 'Saat ' + hhmm(m); };
tod.oninput = showTod; showTod();
$('timeBtn').onclick = () => { $('timeBox').hidden = !$('timeBox').hidden; };

// ---- input: floating joystick on the left 60 % of the screen, pinch zoom with two fingers ----
const R = 60, stick = $('stick'), knob = $('knob'), input = { x: 0, y: 0 };
let joy = null; const touches = new Map(); let pinch = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { joy = null; stick.style.display = 'none'; input.x = input.y = 0; const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zoom }; return; }
  if (!joy && e.clientX < innerWidth * .6) {
    joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = '';
    $('hint').style.opacity = 0;
  }
});
cv.addEventListener('pointermove', e => {
  const p = touches.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    cam.zoom = Math.max(zoomBase() * .45, Math.min(zoomBase() * 2.4, pinch.z * d / pinch.d)); return;
  }
  if (joy && e.pointerId === joy.id) {
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy);
    if (l > R) { joy.x += dx * (1 - R / l); joy.y += dy * (1 - R / l); dx = e.clientX - joy.x; dy = e.clientY - joy.y; stick.style.left = joy.x + 'px'; stick.style.top = joy.y + 'px'; }  // base follows the thumb
    input.x = dx / R; input.y = dy / R;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    stick.classList.toggle('run', Math.hypot(input.x, input.y) > .8);
  }
});
const up = e => {
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
  if (joy && e.pointerId === joy.id) { joy = null; input.x = input.y = 0; stick.style.display = 'none'; stick.classList.remove('run'); }
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = Math.max(zoomBase() * .45, Math.min(zoomBase() * 2.4, cam.zoom * Math.exp(-e.deltaY * .0015))); }, { passive: false });
const keys = new Set();
addEventListener('keydown', e => keys.add(e.key.toLowerCase())); addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function keyInput() {
  const x = (keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft')), y = (keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup'));
  if (!x && !y) return null; const l = Math.hypot(x, y), m = keys.has('shift') ? 1 : .7;
  return { x: x / l * m, y: y / l * m };
}

// ---- tools (test bar) + action button ----
const svg = id => `<svg viewBox="0 0 24 24">${ICON[id] || ''}</svg>`;
function refreshTools() {
  $('tools').innerHTML = TOOL_IDS.map((id, i) => `<button type="button" data-t="${id}" class="${hero && hero.tool === id ? 'on' : ''}" aria-label="${TOOLS[id].name}" title="${i + 1} · ${TOOLS[id].name}">${svg(id)}</button>`).join('');
  $('tools').querySelectorAll('button').forEach(b => b.onclick = () => { if (hero && equip(hero, b.dataset.t)) refreshTools(); });
  lastAct = '';
}
let lastAct = '';
function showAct() {
  const lbl = actionLabel(hero), key = hero.tool + lbl; if (key === lastAct) return; lastAct = key;
  $('actIco').innerHTML = svg(hero.tool); $('actLbl').textContent = lbl;
}
const act = $('act');
act.addEventListener('pointerdown', e => { e.preventDefault(); act.classList.add('down'); if (hero) use(hero); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) act.addEventListener(ev, () => act.classList.remove('down'));
addEventListener('keydown', e => {
  if (!hero) return;
  if (e.key === ' ' || e.key.toLowerCase() === 'e') { e.preventDefault(); use(hero); }
  const n = +e.key; if (n >= 1 && n <= TOOL_IDS.length && equip(hero, TOOL_IDS[n - 1])) refreshTools();
});

// ---- loop ----
const SURF = { sea: 'Sığ su', river: 'Dere', sand: 'Kum', mud: 'Çamur', rock: 'Kaya', trail: 'Patika', grass: 'Çimen' };
let last = performance.now(), slowT = 0, frames = 0, fpsT = 0, auto = null, hold = null;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const time = now / 1000;
  if (terrain && hero) {
    const minute = +tod.value, lt0 = minute / 1440;
    const dark = minute < 345 || minute > 1155;                                        // dark enough → a light
    hero.light = dark ? (TOOLS[hero.tool].two ? 'lantern' : 'torch') : null;              // both hands busy → lantern on the belt
    hero.lightI = dark ? .95 + .1 * Math.sin(time * 17) * Math.sin(time * 5.3) : 0;
    if (hold != null && TOOLS[hero.tool].act) { hero.actT = Math.max(0, hold * TOOLS[hero.tool].act.dur - dt); hero.fired = true; }   // test hook: freeze a frame of the action
    stepHero(hero, auto || keyInput() || input, dt, terrain, marks, time, fx);
    showAct();
    // camera: follow with a little look-ahead
    const lx = hero.x + Math.cos(hero.yaw) * hero.speed * .25, ly = hero.y + Math.sin(hero.yaw) * hero.speed * .25 - 10;
    const k = 1 - Math.exp(-dt * 5); cam.x += (lx - cam.x) * k; cam.y += (ly - cam.y) * k;
    const W = cv.width, H = cv.height, zoom = cam.zoom * scale;
    // the torch light on the ground uses last frame's tip (one frame of lag is invisible)
    mapgl.torch = hero.light && hero.tipW ? [hero.tipW[0], hero.tipW[1] + 6, hero.light === 'torch' ? 150 : 115, hero.lightI] : [0, 0, 0, 0];
    const lt = mapgl.draw(cam, scale, time, lt0);
    hero.tipW = herogl.draw(hero, fx, { cam, zoom, W, H, lt }, marks, time);
    $('surf').textContent = SURF[hero.surface] || '';
  }
  slowT = dt > 1 / 28 ? slowT + dt : Math.max(0, slowT - dt * .5);
  if (slowT > 1.2 && quality > .5 && !q.has('debug')) { quality *= .82; resize(); slowT = 0; }
  if (q.has('debug')) { frames++; fpsT += dt; if (fpsT > .5) { $('surf').textContent += ` · ${Math.round(frames / fpsT)} fps`; frames = 0; fpsT = 0; } }
  requestAnimationFrame(frame);
}
build(seed);
requestAnimationFrame(frame);
window.__ADA = { cam, marks, tod, build, equip: id => { equip(hero, id); refreshTools(); }, use: () => use(hero), get fx() { return fx; }, get hero() { return hero; }, get terrain() { return terrain; }, setAuto(v) { auto = v; }, setHold(v) { hold = v; } };
