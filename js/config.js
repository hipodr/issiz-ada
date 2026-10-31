// Global tuning knobs. Change balance here, not inside systems.
export const T = 32;              // world units per tile
export const MAP = 128;           // island size in tiles (square)
export const DAY = 240;           // real seconds per in-game day
export const SPEED = 120;         // player walk speed, world units / s
export const BAG_SLOTS = 16;
export const CHEST_SLOTS = 16;
export const STACK = 20;          // default max items per slot
export const FIRE_MAX = 300;      // seconds of fuel a fire can hold

export const SAVE_KEY = 'issizada.save';
export const SAVE_VERSION = 3;    // bump when the save shape changes; add a migration in save.js
export const BEST_KEY = 'issizada.best';

export const TILE = Object.freeze({ DEEP: 0, SHAL: 1, SAND: 2, GRASS: 3, FOREST: 4, POND: 5 });
export const isLandTile = t => t === TILE.SAND || t === TILE.GRASS || t === TILE.FOREST;
export const isSeaTile = t => t === TILE.DEEP || t === TILE.SHAL;

// Survival rates (per real second)
export const RATE = Object.freeze({
  hunger: 100 / 320,   // hunger bar drain
  thirst: 100 / 230,   // thirst bar drain
  starve: 1.4,         // hp loss when hunger = 0
  dehydrate: 1.9,      // hp loss when thirst = 0
  cold: 0.55,          // hp loss at night away from warmth
  sick: 0.5,           // hp loss while sick
  regen: 0.45,         // hp gain when fed and watered
  sickHungerMul: 1.3,  // hunger drains faster while sick
});
export const SICK_TIME = 45;      // seconds of sickness after bad food
