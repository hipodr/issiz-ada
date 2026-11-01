// Map viewer page (map.html): an empty island to review the terrain before anything is placed on it.
// Input: touch / mouse (drag = pan, pinch / wheel = zoom, double tap = zoom in), buttons, time slider
// Output: MapGL draws every frame (water animates); ?seed=N shows a given island, ?debug shows fps.
import { generateTerrain, packTerrain, TSIZE } from './terrain.js';
import { MapGL } from './gl.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), q = new URLSearchParams(location.search);
let gl;
try { gl = new MapGL(cv); } catch (e) { $('err').style.display = 'grid'; $('err').textContent += ' (' + e.message + ')'; throw e; }

const cam = { x: TSIZE / 2, y: TSIZE / 2, zoom: .2 };
let terrain = null, seed = +q.get('seed') || (Date.now() % 1e9), fly = null, scale = 1;
const minZoom = () => Math.min(innerWidth, innerHeight) / TSIZE * .95, MAXZ = 4;

let quality = 1;                       // drops automatically on slow phones
function resize() {
  // keep the shaded pixel count reasonable on phones (≈1.3 M px), times the adaptive quality factor
  const dpr = Math.min(devicePixelRatio || 1, 2), px = innerWidth * innerHeight * dpr * dpr;
  scale = dpr * Math.min(1, Math.sqrt(1.3e6 / px)) * quality;
  cv.width = Math.round(innerWidth * scale); cv.height = Math.round(innerHeight * scale);
}
addEventListener('resize', resize); resize();

function build(s) {
  $('busy').style.display = 'block';
  setTimeout(() => {
    seed = s >>> 0; terrain = generateTerrain(seed); gl.setTerrain(packTerrain(terrain), terrain);
    $('seedLbl').textContent = 'Ada #' + seed; $('busy').style.display = 'none';
    history.replaceState(null, '', '?seed=' + seed + (q.has('debug') ? '&debug' : ''));
    fit(false);
  }, 30);
}
function clampCam() {
  cam.zoom = Math.max(minZoom(), Math.min(MAXZ, cam.zoom));
  cam.x = Math.max(0, Math.min(TSIZE, cam.x)); cam.y = Math.max(0, Math.min(TSIZE, cam.y));
}
function flyTo(x, y, zoom, anim = true) {
  if (!anim) { Object.assign(cam, { x, y, zoom }); clampCam(); return; }
  fly = { from: { ...cam }, to: { x, y, zoom }, t: 0 };
}
function fit(anim = true) { flyTo(TSIZE / 2, TSIZE / 2, minZoom(), anim); }
$('fitBtn').onclick = () => fit();
$('newBtn').onclick = () => build(Math.floor(Math.random() * 1e9));
$('caveBtn').onclick = () => terrain?.cave && flyTo(terrain.cave.x, terrain.cave.y, 2.4);
$('riverBtn').onclick = () => { const r = terrain?.river; if (r?.length) { const k = Math.max(0, r.length - 30); flyTo(r[k][0], r[k][1], 1.3); } };
$('beachBtn').onclick = () => terrain?.spawn && flyTo(terrain.spawn.x, terrain.spawn.y, 1.6);

// ---- time of day ----
const tod = $('tod');
const todName = m => m < 300 ? 'Gece' : m < 450 ? 'Şafak' : m < 660 ? 'Sabah' : m < 900 ? 'Öğle' : m < 1080 ? 'İkindi' : m < 1230 ? 'Akşam' : 'Gece';
const showTod = () => { const m = +tod.value; $('tlbl').textContent = `${todName(m)} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
tod.oninput = showTod; showTod();

// ---- touch / mouse ----
const ptrs = new Map(); let pinch = null, lastTap = 0;
const toWorld = (sx, sy) => [cam.x + (sx - innerWidth / 2) / cam.zoom, cam.y + (sy - innerHeight / 2) / cam.zoom];
function zoomAt(sx, sy, z) {
  const [wx, wy] = toWorld(sx, sy);
  cam.zoom = Math.max(minZoom(), Math.min(MAXZ, z));
  cam.x = wx - (sx - innerWidth / 2) / cam.zoom; cam.y = wy - (sy - innerHeight / 2) / cam.zoom; clampCam();
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); fly = null;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zoom }; }
  else if (ptrs.size === 1) {
    const now = performance.now();
    if (now - lastTap < 300) { const [wx, wy] = toWorld(e.clientX, e.clientY); flyTo(wx, wy, Math.min(MAXZ, cam.zoom * 2.2)); }
    lastTap = now;
  }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size === 1) { cam.x -= (e.clientX - p.x) / cam.zoom; cam.y -= (e.clientY - p.y) / cam.zoom; clampCam(); }
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * d / pinch.d);
  }
});
const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.zoom * Math.exp(-e.deltaY * .0015)); }, { passive: false });

// ---- loop ----
let last = performance.now(), frames = 0, fpsT = 0, slowT = 0;
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / .7); const k = ease(fly.t);
    // zoom interpolates in log space so it feels even
    cam.zoom = Math.exp(Math.log(fly.from.zoom) + (Math.log(Math.max(minZoom(), fly.to.zoom)) - Math.log(fly.from.zoom)) * k);
    cam.x = fly.from.x + (fly.to.x - fly.from.x) * k; cam.y = fly.from.y + (fly.to.y - fly.from.y) * k;
    if (fly.t >= 1) fly = null;
  }
  if (terrain) gl.draw(cam, scale, now / 1000, +tod.value / 1440);
  // adaptive resolution: if a phone can't hold ~30 fps, shade fewer pixels (the canvas is stretched to the screen)
  slowT = dt > 1 / 28 ? slowT + dt : Math.max(0, slowT - dt * .5);
  if (slowT > 1.2 && quality > .5 && !q.has('debug')) { quality *= .82; resize(); slowT = 0; }
  if (q.has('debug')) { frames++; fpsT += dt; if (fpsT > .5) { $('fps').hidden = false; $('fps').textContent = Math.round(frames / fpsT) + ' fps · ' + cv.width + '×' + cv.height; frames = 0; fpsT = 0; } }
  requestAnimationFrame(frame);
}
build(seed);
requestAnimationFrame(frame);
window.__MAP = { cam, flyTo, get terrain() { return terrain; }, tod, build };
