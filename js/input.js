// Touch joystick (anywhere on the canvas), action button, keyboard (WASD / arrows, Space/E, B bag, C craft).
export class Input {
  constructor({ canvas, joy, knob, actBtn, onFirstMove, canMove, onKey }) {
    this.jx = 0; this.jy = 0; this.keys = new Set(); this.act = false; this.actCd = 0;
    let id = null, ox = 0, oy = 0;
    canvas.addEventListener('pointerdown', e => {
      if (!canMove() || id !== null) return;
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      try { canvas.setPointerCapture(id); } catch {}
      joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; joy.hidden = false; knob.style.transform = '';
      onFirstMove?.();
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy), R = 46;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      this.jx = dx / R; this.jy = dy / R;
      if (Math.hypot(this.jx, this.jy) < .12) this.jx = this.jy = 0;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const end = e => { if (e.pointerId !== id) return; id = null; this.jx = this.jy = 0; joy.hidden = true; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    this.release = () => { id = null; this.jx = this.jy = 0; this.act = false; joy.hidden = true; actBtn.classList.remove('down'); };

    actBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.act = true; this.actCd = 0; actBtn.classList.add('down'); });
    const up = () => { this.act = false; actBtn.classList.remove('down'); };
    actBtn.addEventListener('pointerup', up); actBtn.addEventListener('pointercancel', up); actBtn.addEventListener('pointerleave', up);

    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'e') { if (!e.repeat) { this.act = true; this.actCd = 0; } e.preventDefault(); return; }
      if (onKey?.(k)) return;
      this.keys.add(k);
    });
    window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === ' ' || k === 'e') this.act = false; this.keys.delete(k); });
  }

  axis() {
    let x = this.jx, y = this.jy; const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1; if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1; if (k.has('s') || k.has('arrowdown')) y += 1;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
}
