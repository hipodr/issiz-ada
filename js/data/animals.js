// Wild animals. Add a species = add an entry; AI behaviours live in game.js (updateAnimals).
//  ai         'flee' (runs from the player) | 'hostile' (winds up, charges, gores; afraid of lit fires)
//  minDay     first day it appears;  xp  experience for killing it
//  count      how many the island keeps alive (respawns far from the player)
//  tiles      tile types it spawns on
//  speed      wander speed; fleeSpeed / fleeDist for 'flee'
//  hp         health (arrow = 2 dmg, weapons use their melee value)
//  hitR       arrow hit radius; drops [[itemId, n]] when killed
import { TILE } from '../config.js';
import { shadow, circle, ellipse } from '../render/shapes.js';

export const ANIMALS = {
  boar: {
    n: 'Yaban domuzu', ai: 'hostile', count: 7, minDay: 2, tiles: [TILE.FOREST, TILE.GRASS], xp: 20,
    hp: 6, speed: 28, aggro: 120, windup: .7, dash: .75, chargeSpeed: 210, rest: 1.4, dmg: 14, hitR: 15,
    drops: [['meat', 3], ['hide', 2]],
    draw(ctx, a, t) {
      const f = a.face || 1, shake = a.st === 'wind' ? Math.sin(t * 60) * 1.2 : 0, x = a.x + shake, y = a.y, run = a.st === 'dash' ? Math.sin(t * 30) * 1.5 : 0;
      shadow(ctx, a.x, a.y + 3, 14, 4.5);
      ctx.fillStyle = '#3d2a1e';
      for (const lx of [-8, -3, 4, 9]) ctx.fillRect(x + lx * f - 1, y - 2 + (lx % 2 ? run : -run), 3, 5);
      ellipse(ctx, x, y - 8, 14, 8, 0, a.hurt > 0 ? '#a0503a' : '#5a3d2b');
      ellipse(ctx, x - 2 * f, y - 13, 9, 3, 0, '#3d2a1e');                  // bristly back
      ellipse(ctx, x + 13 * f, y - 7, 6, 5, 0, '#5a3d2b');                   // head
      ellipse(ctx, x + 18 * f, y - 6, 2.6, 2.2, 0, '#c99b8a');               // snout
      ctx.strokeStyle = '#f2ead8'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 16 * f, y - 4); ctx.lineTo(x + 19 * f, y - 9); ctx.stroke();
      circle(ctx, x + 12 * f, y - 10, 1, '#1a1008');
      if (a.st === 'wind') { ctx.fillStyle = '#e8505b'; ctx.font = '800 14px Rubik, system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', a.x, a.y - 24); }
      if (a.hp < 6) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(a.x - 12, a.y - 28, 24, 3); ctx.fillStyle = '#e8505b'; ctx.fillRect(a.x - 12, a.y - 28, 24 * Math.max(0, a.hp) / 6, 3); }
    },
  },
  rabbit: {
    n: 'Tavşan', ai: 'flee', count: 22, tiles: [TILE.GRASS, TILE.FOREST],
    hp: 1, speed: 35, fleeSpeed: 150, fleeDist: 95, hitR: 11, drops: [['meat', 2], ['hide', 1]],
    draw(ctx, a) {
      const hop = Math.abs(Math.sin(a.hop)) * 4, f = a.face || 1, x = a.x, y = a.y - hop;
      shadow(ctx, a.x, a.y + 2, 6, 2.4);
      ellipse(ctx, x, y - 4, 7, 5, 0, '#cdbda5');
      ellipse(ctx, x + 4 * f, y - 14, 1.6, 4.6, -.25 * f, '#d8c9b2');
      ellipse(ctx, x + 6.5 * f, y - 14, 1.6, 4.6, .25 * f, '#d8c9b2');
      circle(ctx, x + 5 * f, y - 8, 3.8, '#d8c9b2');
      circle(ctx, x - 6 * f, y - 5, 2.2, '#fbf7ef');
      circle(ctx, x + 6.6 * f, y - 9, .9, '#2a1d14');
    },
  },
};
