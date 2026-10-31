// Things that exist on the ground and are saved in full: built structures and dropped items.
// Add a new buildable (hut, bed, workbench…) = add an entry here + a recipe with place: '<id>'.
//  n          display name
//  r          collision radius (0 = walk-through)
//  init(e)    set default fields on a new entity
//  label(e,G) action-button text when the player stands next to it
//  interact(e,G)  what the action button does; return 'once' to require a fresh tap
//  update(e,dt,G) optional per-frame logic
//  light(e)   light radius at night (0 = none);  warm(e) radius that protects from cold
//  draw(ctx,e,t)
import { FIRE_MAX, CHEST_SLOTS } from '../config.js';
import { ITEMS } from './items.js';
import { shadow, circle } from '../render/shapes.js';

export const STRUCT = {
  fire: {
    n: 'Kamp ateşi', r: 10,
    init(e) { e.fuel = 150; },
    label(e, G) { return G.fireWillCook(e) ? 'Pişir' : e.fuel > 0 ? 'Odun at' : 'Yak'; },
    interact(e, G) {
      if (G.fireWillCook(e)) return G.cookSlot(G.inv.firstCookable());
      if (!G.inv.count('wood')) { G.ui.toast('Odun yok'); return; }
      G.inv.remove('wood', 1); e.fuel = Math.min(FIRE_MAX, e.fuel + 60);
      G.burst(e.x, e.y - 6, ['#ffb347', '#ffd27a', '#ff7a2f']); G.floatText(e.x, e.y - 30, '+60 sn ateş', '#ffd27a'); G.ui.changed();
    },
    update(e, dt, G) {
      if (e.fuel <= 0) return;
      e.fuel = Math.max(0, e.fuel - dt);
      if (e.fuel === 0 && Math.hypot(e.x - G.P.x, e.y - G.P.y) < 320) G.ui.toast('Ateş söndü');
    },
    light: e => e.fuel > 0 ? 175 * Math.min(1, .55 + e.fuel / 120) : 0,
    warm: e => e.fuel > 0 ? 130 : 0,
    draw(ctx, e, t) {
      const { x, y } = e;
      shadow(ctx, x, y + 3, 13, 5);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; circle(ctx, x + Math.cos(a) * 10, y + Math.sin(a) * 6, 3.2, i % 2 ? '#8d908a' : '#a7aaa4'); }
      ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 3.5; ctx.beginPath();
      ctx.moveTo(x - 7, y + 3); ctx.lineTo(x + 7, y - 3); ctx.moveTo(x - 7, y - 3); ctx.lineTo(x + 7, y + 3); ctx.stroke();
      if (e.fuel <= 0) { circle(ctx, x, y, 3, '#3a2a20'); return; }
      const k = Math.min(1, .5 + e.fuel / 120);
      const flame = (dx, h, w, c, ph) => {
        const hh = h * k * (1 + Math.sin(t * 14 + ph) * .12);
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + dx - w, y);
        ctx.quadraticCurveTo(x + dx - w * .8, y - hh * .6, x + dx + Math.sin(t * 9 + ph) * 1.5, y - hh);
        ctx.quadraticCurveTo(x + dx + w * .8, y - hh * .6, x + dx + w, y); ctx.closePath(); ctx.fill();
      };
      flame(0, 20, 7, '#ff6a2a', 0); flame(-3, 14, 4.5, '#ff9a3c', 1.7); flame(3, 15, 4.5, '#ff9a3c', 3.1); flame(0, 10, 3.5, '#ffe08a', 2.2);
    },
    sparks: true,
  },

  chest: {
    n: 'Sandık', r: 11,
    init(e) { e.slots = Array(CHEST_SLOTS).fill(null); },
    label: () => 'Aç',
    interact(e, G) { G.ui.openChest(e); return 'once'; },
    draw(ctx, e) {
      const { x, y } = e;
      shadow(ctx, x, y + 3, 13, 4.5);
      ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 11, y - 12, 22, 14);
      ctx.fillStyle = '#a8703c'; ctx.fillRect(x - 11, y - 16, 22, 6);
      ctx.fillStyle = '#6b4424'; ctx.fillRect(x - 11, y - 10, 22, 1.5);
      ctx.fillStyle = '#e2c26b'; ctx.fillRect(x - 2, y - 11, 4, 5);
    },
  },

  drop: {
    n: 'Eşya', r: 0,
    init() {},
    label: () => 'Al',
    interact(e, G) { G.pickupDrop(e); },
    draw(ctx, e, t) {
      const b = Math.sin(t * 3 + e.x) * 1;
      shadow(ctx, e.x, e.y + 3, 7, 2.5);
      circle(ctx, e.x, e.y - 3 + b, 6, '#b48a5a');
      ctx.fillStyle = '#8a6438'; ctx.fillRect(e.x - 3, e.y - 9 + b, 6, 2);
      circle(ctx, e.x, e.y - 3 + b, 2.8, (ITEMS[e.item] || {}).c || '#fff');
    },
  },
};
