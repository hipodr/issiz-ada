// Wild animals. Add a species = add an entry; AI behaviours live in game.js (updateAnimals).
//  ai         'flee' (runs from the player). Planned: 'hostile' (charges and bites).
//  count      how many the island keeps alive (respawns far from the player)
//  tiles      tile types it spawns on
//  speed      wander speed; fleeSpeed / fleeDist for 'flee'
//  hitR       arrow hit radius; drops [[itemId, n]] when killed
import { TILE } from '../config.js';
import { shadow, circle, ellipse } from '../render/shapes.js';

export const ANIMALS = {
  rabbit: {
    n: 'Tavşan', ai: 'flee', count: 22, tiles: [TILE.GRASS, TILE.FOREST],
    speed: 35, fleeSpeed: 150, fleeDist: 95, hitR: 11, drops: [['meat', 2]],
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
