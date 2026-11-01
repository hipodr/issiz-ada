// Touch / keyboard input. Left 60 % of the screen: a floating joystick appears where the thumb lands.
// Two fingers: pinch zoom (onPinch(factor)). Keyboard: WASD / arrows, Shift = run.
// Output: get() → { x, y } in −1..1 (screen axes: x right, y down); __auto overrides it for tests.
export function makeInput(cv, stick, knob) {
  const R = 60, v = { x: 0, y: 0 }, touches = new Map(), keys = new Set();
  let joy = null, pinch = null;
  const api = { onPinch: null, auto: null, get() { return api.auto || keyVec() || v; } };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { joy = null; stick.style.display = 'none'; v.x = v.y = 0; const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); return; }
    if (!joy && e.clientX < innerWidth * .6) { joy = { id: e.pointerId, x: e.clientX, y: e.clientY }; Object.assign(stick.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px' }); knob.style.transform = ''; }
  });
  cv.addEventListener('pointermove', e => {
    const p = touches.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (pinch && touches.size === 2) { const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y); api.onPinch?.(d / pinch); pinch = d; return; }
    if (joy && e.pointerId === joy.id) {
      let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy);
      if (l > R) { joy.x += dx * (1 - R / l); joy.y += dy * (1 - R / l); dx = e.clientX - joy.x; dy = e.clientY - joy.y; stick.style.left = joy.x + 'px'; stick.style.top = joy.y + 'px'; }
      v.x = dx / R; v.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; stick.classList.toggle('run', Math.hypot(v.x, v.y) > .8);
    }
  });
  const up = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (joy && e.pointerId === joy.id) { joy = null; v.x = v.y = 0; stick.style.display = 'none'; stick.classList.remove('run'); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); api.onPinch?.(Math.exp(-e.deltaY * .0015)); }, { passive: false });
  addEventListener('keydown', e => keys.add(e.key.toLowerCase())); addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  function keyVec() {
    const x = (keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft')), y = (keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup'));
    if (!x && !y) return null; const l = Math.hypot(x, y), m = keys.has('shift') ? 1 : .7; return { x: x / l * m, y: y / l * m };
  }
  return api;
}
