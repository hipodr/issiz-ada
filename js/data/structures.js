// Things that exist on the ground and are saved in full: built structures and dropped items.
// Add a new buildable (hut, bed, workbench…) = add an entry here + a recipe with place: '<id>'.
//  n          display name
//  r          collision radius (0 = walk-through)
//  init(e)    set default fields on a new entity;  fix(e) patch entities loaded from older saves
//  label(e,G) El-button text when the player stands next to it
//  interact(e,G)  what the El button does; return 'once' to require a fresh tap
//  update(e,dt,G) optional per-frame logic
//  light(e)   light radius at night (0 = none);  warm(e) radius that protects from cold
//  draw(ctx,e,t)
import { FIRE_MAX, CHEST_SLOTS, COOK_SLOTS, COOK_TIME, BURN_TIME } from '../config.js';
import { ITEMS } from './items.js';
import { shadow, circle } from '../render/shapes.js';

// Home upgrade path (the hut entity's e.lvl). Add a level = add an entry; its `cost` / `need` (player level)
// is what upgrading TO it requires.
export const HOME = [
  { n: 'Kulübe', r: 18, warm: 70, light: 0, sleepHp: 40, slots: 0, d: 'Gece uyursun, ölürsen burada uyanırsın.' },
  { n: 'Baraka', r: 26, warm: 120, light: 95, sleepHp: 70, slots: 12, need: 5, cost: { wood: 25, nail: 12, stone: 8, rope: 4 },
    d: 'Daha iyi uyku (+70 sağlık), 12 slot depo, geniş sıcak alan ve gece fener ışığı.' },
];

export const STRUCT = {
  fire: {
    n: 'Kamp ateşi', r: 10,
    init(e) { e.fuel = 150; e.cook = Array(COOK_SLOTS).fill(null); },
    fix(e) { if (!e.cook) e.cook = Array(COOK_SLOTS).fill(null); },
    label: () => 'Ateş',
    interact(e, G) { G.ui.openFire(e); return 'once'; },
    // cooking slots: { k: itemId, t: seconds in current stage, st: 'raw' | 'done' | 'burnt' }
    update(e, dt, G) {
      if (e.fuel <= 0) return;
      e.fuel = Math.max(0, e.fuel - dt);
      const near = Math.hypot(e.x - G.P.x, e.y - G.P.y) < 320;
      if (e.fuel === 0 && near) G.ui.toast('Ateş söndü');
      for (const c of e.cook) {
        if (!c || c.st === 'burnt') continue;
        c.t += dt;
        if (c.st === 'raw' && c.t >= COOK_TIME) { c.k = ITEMS[c.k].cook; c.st = 'done'; c.t = 0; G.ui.changed(); if (near) { G.ui.toast(`${ITEMS[c.k].n} pişti!`); G.ui.vibrate(30); } }
        else if (c.st === 'done' && c.t >= BURN_TIME) { c.k = 'burnt'; c.st = 'burnt'; c.t = 0; G.ui.changed(); if (near) G.ui.toast('Yemek yandı!'); }
      }
    },
    light: e => e.fuel > 0 ? 175 * Math.min(1, .55 + e.fuel / 120) : 0,
    warm: e => e.fuel > 0 ? 130 : 0,
    draw(ctx, e, t) {
      const { x, y } = e;
      shadow(ctx, x, y + 3, 13, 5);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; circle(ctx, x + Math.cos(a) * 10, y + Math.sin(a) * 6, 3.2, i % 2 ? '#8d908a' : '#a7aaa4'); }
      ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 3.5; ctx.beginPath();
      ctx.moveTo(x - 7, y + 3); ctx.lineTo(x + 7, y - 3); ctx.moveTo(x - 7, y - 3); ctx.lineTo(x + 7, y + 3); ctx.stroke();
      (e.cook || []).forEach((c, i) => { if (c) circle(ctx, x - 7 + i * 7, y - 4, 2.8, ITEMS[c.k].c); });
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

  hut: {
    n: 'Kulübe', r: e => HOME[(e.lvl || 1) - 1].r,
    init(e) { e.lvl = 1; },
    fix(e) { e.lvl = e.lvl || 1; const h = HOME[e.lvl - 1]; if (h.slots && !e.slots) e.slots = Array(h.slots).fill(null); },
    label: (e, G) => G.canSleep() ? 'Uyu' : HOME[(e.lvl || 1) - 1].n,
    interact(e, G) { if (G.canSleep()) G.sleep(e); else G.ui.openHome(e); return 'once'; },
    warm: e => HOME[(e.lvl || 1) - 1].warm,
    light: e => HOME[(e.lvl || 1) - 1].light,
    draw(ctx, e, t, G) {
      const { x, y } = e;
      if ((e.lvl || 1) === 1) {
        shadow(ctx, x + 3, y + 4, 30, 9);
        ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 24, y - 26, 48, 28);
        ctx.fillStyle = '#6b4424'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 24, y - 20 + i * 6, 48, 1.4);
        ctx.fillStyle = '#3a2414'; ctx.fillRect(x - 6, y - 16, 12, 18);
        ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.moveTo(x - 31, y - 22); ctx.lineTo(x, y - 50); ctx.lineTo(x + 31, y - 22); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#a8822f'; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = -3; i <= 3; i++) { ctx.moveTo(x + i * 7, y - 22); ctx.lineTo(x + i * 2.2, y - 44); }
        ctx.stroke();
        ctx.fillStyle = '#e0c06a'; ctx.fillRect(x - 31, y - 24, 62, 3);
        return;
      }
      // Baraka: wider plank shack with a plank roof, window, chimney and a lantern by the door
      const night = G && G.darkness() > .3;
      shadow(ctx, x + 4, y + 5, 40, 11);
      ctx.fillStyle = '#7a5130'; ctx.fillRect(x - 34, y - 34, 68, 36);
      ctx.fillStyle = '#5e3d22'; for (let i = 0; i < 6; i++) ctx.fillRect(x - 34, y - 29 + i * 6, 68, 1.4);
      ctx.fillStyle = '#4a2f1a'; for (const px of [-34, -12, 12, 32]) ctx.fillRect(x + px, y - 34, 2.4, 36);
      ctx.fillStyle = '#2e1c0e'; ctx.fillRect(x - 7, y - 22, 14, 24);
      ctx.fillStyle = night ? '#ffd27a' : '#9cc3d6'; ctx.fillRect(x + 14, y - 26, 12, 9);
      ctx.fillStyle = '#4a2f1a'; ctx.fillRect(x + 19.4, y - 26, 1.4, 9); ctx.fillRect(x + 14, y - 22, 12, 1.2);
      ctx.fillStyle = '#6f6a63'; ctx.fillRect(x + 18, y - 66, 8, 18);                                  // chimney
      ctx.fillStyle = '#5a3a24'; ctx.beginPath(); ctx.moveTo(x - 42, y - 30); ctx.lineTo(x, y - 62); ctx.lineTo(x + 42, y - 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#3f2716'; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let i = 1; i < 6; i++) { const k = i / 6; ctx.moveTo(x - 42 + k * 42, y - 30 - k * 32); ctx.lineTo(x + 42 - k * 42, y - 30 - k * 32); }
      ctx.stroke();
      ctx.fillStyle = '#7a5130'; ctx.fillRect(x - 43, y - 32, 86, 3);
      ctx.fillStyle = '#c9ccd1'; ctx.fillRect(x - 15, y - 20, 4, 6); ctx.fillStyle = night ? '#ffe08a' : '#8a8f96'; ctx.fillRect(x - 14.4, y - 19, 2.8, 4);   // lantern
      if (t !== undefined && Math.random() < .04) { /* chimney smoke is drawn by the renderer's particles */ }
    },
  },

  wreck: {
    n: 'Enkaz sandığı', r: 11,
    init(e) { e.loot = e.loot || []; },
    label: () => 'Aç',
    interact(e, G) { G.openWreck(e); return 'once'; },
    draw(ctx, e, t) {
      const { x, y } = e, b = Math.sin(t * 2 + x) * .6;
      shadow(ctx, x, y + 3, 14, 5);
      ctx.save(); ctx.translate(x, y + b); ctx.rotate(-.12);
      ctx.fillStyle = '#7a5634'; ctx.fillRect(-12, -14, 24, 15);
      ctx.fillStyle = '#5e3f24'; ctx.fillRect(-12, -9, 24, 1.6); ctx.fillRect(-12, -4, 24, 1.6); ctx.fillRect(-4, -14, 2, 15); ctx.fillRect(5, -14, 2, 15);
      ctx.strokeStyle = '#3f8f3a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.quadraticCurveTo(-6, -6, -2, -1); ctx.moveTo(4, 0); ctx.quadraticCurveTo(8, -5, 12, -2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,224,138,' + (.5 + Math.sin(t * 4) * .3).toFixed(2) + ')'; ctx.fillRect(x - 1, y - 30, 2, 8); ctx.fillRect(x - 1, y - 20, 2, 2);
    },
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
