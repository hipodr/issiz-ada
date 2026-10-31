// Touch joystick (anywhere on the canvas), two action buttons, keyboard.
// Keyboard: WASD / arrows move, Space = Kullan, E = El, 1-4 = hotbar, B bag, C craft, Esc close.
export class Input {
  constructor({ canvas, joy, knob, useBtn, grabBtn, onFirstMove, canMove, onKey }) {
    this.jx = 0; this.jy = 0; this.keys = new Set();
    this.use = false; this.useCd = 0; this.grab = false; this.grabCd = 0;
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

    const hold = (btn, flag) => {
      btn.addEventListener('pointerdown', e => { e.preventDefault(); this[flag] = true; this[flag + 'Cd'] = 0; btn.classList.add('down'); });
      const up = () => { this[flag] = false; btn.classList.remove('down'); };
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
    };
    hold(useBtn, 'use'); hold(grabBtn, 'grab');
    this.release = () => {
      id = null; this.jx = this.jy = 0; this.use = this.grab = false; joy.hidden = true;
      useBtn.classList.remove('down'); grabBtn.classList.remove('down');
    };

    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === ' ') { if (!e.repeat) { this.use = true; this.useCd = 0; } e.preventDefault(); return; }
      if (k === 'e') { if (!e.repeat) { this.grab = true; this.grabCd = 0; } return; }
      if (onKey?.(k)) return;
      this.keys.add(k);
    });
    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      if (k === ' ') this.use = false; if (k === 'e') this.grab = false;
      this.keys.delete(k);
    });
  }

  axis() {
    let x = this.jx, y = this.jy; const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1; if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1; if (k.has('s') || k.has('arrowdown')) y += 1;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
}
