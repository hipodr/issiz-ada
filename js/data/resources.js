// Harvestable world resources, generated from the island seed.
//  r        collision / interaction radius (world units)
//  block    true → player can't walk through it while it stands
//  keep     true → stays on the map (and still blocks if block) after harvest, e.g. palm without coconuts
//  hp       health; each Use-button hit removes the held tool's dmg[mat]
//  mat      material ('wood' | 'stone'): hit with a tool whose dmg has this key (Kullan button)
//  gather   true → picked by hand with the El button (no tool)
//  yields   [[itemId, count], ...] given when hp reaches 0
//  regrow   days until it comes back
//  label    button text;  hint = toast when the player holds the wrong thing
//  spawn    { tileType: probability per tile } (checked in object order, so keep the order stable)
//  min      guaranteed minimum count on the island
//  fx       particle colours on hit
//  draw(ctx, o, t)  o = { x, y, alive, hp, hit, v (0..1 random) }, t = clock seconds
import { TILE } from '../config.js';
import { hash2 } from '../util.js';
import { shadow, circle, ellipse } from '../render/shapes.js';
const { SAND, GRASS, FOREST } = TILE;

export const RES = {
  tree: {
    r: 7, block: true, hp: 9, mat: 'wood', yields: [['wood', 3]], regrow: 2,
    label: 'Odun kes', hint: 'Ağaç kesmek için balta lazım (Üret)',
    spawn: { [FOREST]: .13, [GRASS]: .03 }, min: 0, fx: ['#7a5532', '#3f7d36', '#5a9a44'], fxY: 14,
    draw(ctx, o) {
      const s = .9 + o.v * .28, w = o.hit > 0 ? Math.sin(o.hit * 70) * 2.2 : 0;
      if (!o.alive) { shadow(ctx, o.x, o.y + 2, 8, 3.5); circle(ctx, o.x, o.y, 6, '#6b4a2b'); circle(ctx, o.x, o.y - 1, 4.2, '#b88a5a'); return; }
      shadow(ctx, o.x + 4, o.y + 4, 15 * s, 6 * s);
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(o.x - 3, o.y - 12 * s, 6, 13 * s);
      const cx = o.x + w, cy = o.y - 22 * s;
      circle(ctx, cx, cy + 2, 15 * s, '#2c632d');
      circle(ctx, cx - 8 * s, cy + 5, 10 * s, '#347335'); circle(ctx, cx + 8 * s, cy + 6, 10 * s, '#2f6a30');
      circle(ctx, cx - 2, cy - 3, 10 * s, '#3f8a3c'); circle(ctx, cx - 5 * s, cy - 7 * s, 5 * s, '#57a64c');
      if (o.hp < 9) { ctx.fillStyle = '#e8c79a'; ctx.fillRect(o.x - 3, o.y - 6, 6, 2); if (o.hp <= 4) ctx.fillRect(o.x - 3, o.y - 9, 4, 2); }
    },
  },

  palm: {
    r: 7, block: true, keep: true, hp: 1, gather: true, yields: [['coconut', 1]], regrow: 1.1,
    label: 'Topla', spawn: { [SAND]: .05 }, min: 30, fx: ['#7a4f2a', '#5a3a1e'], fxY: 30,
    draw(ctx, o, t) {
      const s = .95 + o.v * .2, sway = Math.sin(t * 1.3 + o.v * 9) * 1.5 + (o.hit > 0 ? Math.sin(o.hit * 70) * 2 : 0);
      const tx = o.x + (o.v - .5) * 16 + sway, ty = o.y - 34 * s;
      shadow(ctx, o.x + 6, o.y + 3, 14, 5);
      ctx.strokeStyle = '#8a6a43'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(o.x + (o.v - .5) * 4, o.y - 18 * s, tx, ty); ctx.stroke();
      ctx.lineCap = 'butt';
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + o.v * 3 + Math.sin(t * 1.1 + i) * .05;
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(a); ellipse(ctx, 11, 0, 13, 3.6, 0, i % 2 ? '#3f8f3a' : '#4fa244'); ctx.restore();
      }
      if (o.alive) { circle(ctx, tx - 3, ty + 3, 3, '#6a4423'); circle(ctx, tx + 3, ty + 3, 3, '#7a4f2a'); circle(ctx, tx, ty + 6, 3, '#5e3c1f'); }
    },
  },

  rock: {
    r: 11, block: true, hp: 9, mat: 'stone', yields: [['stone', 3]], regrow: 3,
    label: 'Taş kır', hint: 'Kaya kırmak için kazma lazım (Üret)',
    spawn: { [GRASS]: .02, [SAND]: .02 }, min: 60, fx: ['#9a9c97', '#c9cbc5', '#6f716c'], fxY: 4,
    draw(ctx, o) {
      if (!o.alive) return;
      const s = .85 + o.v * .3, wob = o.hit > 0 ? Math.sin(o.hit * 80) * 1.5 : 0, x = o.x + wob, y = o.y - 3;
      shadow(ctx, o.x + 2, o.y + 4, 13 * s, 5 * s);
      ctx.fillStyle = '#80837e'; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = (10 + hash2(i, o.v * 1e4, 3) * 4) * s; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * .78); }
      ctx.closePath(); ctx.fill();
      ellipse(ctx, x - 2, y - 3, 7 * s, 4.5 * s, -.3, '#a6a9a3');
      if (o.hp < 9) {
        ctx.strokeStyle = '#4c4e4a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 2, y - 7); ctx.lineTo(x + 1, y - 1);
        if (o.hp <= 3) { ctx.lineTo(x - 3, y + 4); ctx.moveTo(x + 1, y - 1); ctx.lineTo(x + 6, y + 1); }
        ctx.stroke();
      }
    },
  },

  bush: {
    r: 6, block: false, keep: true, hp: 1, gather: true, yields: [['berry', 2]], regrow: 1,
    label: 'Topla', spawn: { [FOREST]: .035, [GRASS]: .03 }, min: 60, fx: ['#d93a4c', '#4a9443'], fxY: 6,
    draw(ctx, o) {
      const s = .9 + o.v * .25, w = o.hit > 0 ? Math.sin(o.hit * 70) * 1.5 : 0, x = o.x + w, y = o.y - 5;
      shadow(ctx, o.x, o.y + 3, 11 * s, 4 * s);
      circle(ctx, x - 5 * s, y + 1, 7 * s, '#3b7e38'); circle(ctx, x + 5 * s, y + 1, 7 * s, '#367535'); circle(ctx, x, y - 3, 8 * s, '#4a9443');
      if (o.alive) for (let i = 0; i < 5; i++) circle(ctx, x + (hash2(i, o.v * 1e4, 1) - .5) * 14 * s, y + (hash2(i, o.v * 1e4, 2) - .6) * 10 * s, 2.1, '#d93a4c');
    },
  },

  grass: {
    r: 5, block: false, keep: true, hp: 1, gather: true, yields: [['fiber', 1]], regrow: .8,
    label: 'Topla', spawn: { [FOREST]: .035, [GRASS]: .05 }, min: 80, fx: ['#9ccc5a', '#c6e48a'], fxY: 6,
    draw(ctx, o, t) {
      const x = o.x, y = o.y + 2;
      if (!o.alive) { ctx.fillStyle = '#7fa54a'; for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 3, y - 3, 1.5, 3); return; }
      ctx.strokeStyle = '#8fc456'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const bx = x + (i - 3) * 2.4, h = 11 + hash2(i, o.v * 1e4, 4) * 7, sw = Math.sin(t * 2.2 + o.v * 7 + i * .6) * 2.5 + (o.hit > 0 ? 3 : 0);
        ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + sw * .4, y - h * .6, bx + sw, y - h);
      }
      ctx.stroke();
    },
  },

  stick: {
    r: 4, block: false, hp: 1, gather: true, yields: [['wood', 1]], regrow: 1.5,
    label: 'Al', spawn: { [FOREST]: .04, [GRASS]: .02 }, min: 120, fx: ['#8a5a32', '#b07d45'], fxY: 0,
    draw(ctx, o) {
      if (!o.alive) return;
      const a = (o.v - .5) * 2.4, c = Math.cos(a), s = Math.sin(a);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.x - c * 9, o.y - s * 4 + 2); ctx.lineTo(o.x + c * 9, o.y + s * 4 + 2); ctx.stroke();
      ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 2.6; ctx.beginPath();
      ctx.moveTo(o.x - c * 9, o.y - s * 4); ctx.lineTo(o.x + c * 9, o.y + s * 4);
      ctx.moveTo(o.x + c * 2, o.y + s); ctx.lineTo(o.x + c * 5 - s * 5, o.y + s * 3 - 4); ctx.stroke();
      ctx.lineCap = 'butt';
    },
  },

  pebble: {
    r: 4, block: false, hp: 1, gather: true, yields: [['stone', 1]], regrow: 1.5,
    label: 'Al', spawn: { [GRASS]: .015, [SAND]: .02 }, min: 90, fx: ['#9a9c97', '#c9cbc5'], fxY: 0,
    draw(ctx, o) {
      if (!o.alive) return;
      const j = (o.v - .5) * 6;
      shadow(ctx, o.x, o.y + 2, 8, 3);
      ellipse(ctx, o.x - 3 + j * .3, o.y, 4.2, 3, .3, '#8d908b');
      ellipse(ctx, o.x + 3, o.y + 1 + j * .2, 3.4, 2.5, -.2, '#a9aca6');
      ellipse(ctx, o.x - 4 + j * .3, o.y - 1, 1.6, 1, .3, '#c9ccc5');
    },
  },
};

export const resSolid = o => RES[o.k].block && (o.alive || RES[o.k].keep);
