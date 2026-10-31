// Island generation + spatial queries. No DOM, no game rules.
// Entities in the spatial grid:
//   resources (cat 'res')  : generated from the seed; only their state (alive/hp/regrow) is saved
//   entities  (cat 'ent')  : structures and drops; saved in full
import { T, MAP, TILE, isLandTile } from './config.js';
import { mulberry32, hash2, fbm } from './util.js';
import { RES, resSolid } from './data/resources.js';
import { STRUCT } from './data/structures.js';
const { DEEP, SHAL, SAND, GRASS, FOREST, POND } = TILE;

export class World {
  constructor(seed) {
    this.seed = seed;
    this.tiles = new Uint8Array(MAP * MAP);
    this.grid = new Array(MAP * MAP).fill(null);  // per-tile buckets of res + ents
    this.res = [];          // resources, index-stable for saving
    this.ents = [];         // structures + drops
    this.animals = [];
    this.arrows = [];
    this.regrowing = [];    // resources waiting to come back
    this.nextId = 1;
    this.generate();
  }

  // ---------- tiles ----------
  at(tx, ty) { return (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) ? DEEP : this.tiles[ty * MAP + tx]; }
  tileAt(wx, wy) { return this.at(Math.floor(wx / T), Math.floor(wy / T)); }
  landAt(wx, wy) { return isLandTile(this.tileAt(wx, wy)); }

  // ---------- spatial grid ----------
  _gi(o) { return Math.floor(o.y / T) * MAP + Math.floor(o.x / T); }
  _insert(o) { const gi = this._gi(o); o._gi = gi; (this.grid[gi] || (this.grid[gi] = [])).push(o); }
  _remove(o) { const b = this.grid[o._gi]; if (b) { const i = b.indexOf(o); if (i >= 0) b.splice(i, 1); } }
  bucket(tx, ty) { return (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) ? null : this.grid[ty * MAP + tx]; }
  near(x, y, r, cb) {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T), y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const b = this.bucket(tx, ty); if (b) for (const o of b) cb(o); }
  }
  solid(o) { return o.cat === 'res' ? resSolid(o) : (STRUCT[o.k].r || 0) > 0; }
  radius(o) { return o.cat === 'res' ? RES[o.k].r : (STRUCT[o.k].r || 0); }
  blocked(x, y, r) {
    let hit = false;
    this.near(x, y, r + 16, o => { if (!hit && this.solid(o)) { const R = this.radius(o) + r; if ((o.x - x) ** 2 + (o.y - y) ** 2 < R * R) hit = true; } });
    return hit;
  }

  // ---------- dynamic entities ----------
  addEnt(k, x, y, extra = {}) {
    const e = { cat: 'ent', id: this.nextId++, k, x, y, ...extra };
    if (!extra.__loaded) STRUCT[k].init(e);
    delete e.__loaded;
    this.ents.push(e); this._insert(e); return e;
  }
  removeEnt(e) { const i = this.ents.indexOf(e); if (i >= 0) this.ents.splice(i, 1); this._remove(e); }

  // ---------- resource regrowth ----------
  scheduleRegrow(o, seconds) { o.rg = seconds; this.regrowing.push(o); }
  tickRegrow(dt, player) {
    for (let i = this.regrowing.length - 1; i >= 0; i--) {
      const o = this.regrowing[i]; o.rg -= dt;
      if (o.rg > 0) continue;
      const d = RES[o.k];
      if (d.block && !d.keep) { const R = d.r + player.r + 6; if ((o.x - player.x) ** 2 + (o.y - player.y) ** 2 < R * R) { o.rg = 4; continue; } }
      o.alive = 1; o.hp = d.hp; o.rg = 0; this.regrowing.splice(i, 1);
    }
  }

  // ---------- generation ----------
  generate() {
    const rnd = mulberry32(this.seed), s = this.seed % 9973, tiles = this.tiles;
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const nx = (x + .5) / MAP * 2 - 1, ny = (y + .5) / MAP * 2 - 1, d = Math.hypot(nx, ny);
      const h = 1 - d * 1.3 + (fbm(x / 17, y / 17, s) - .5) * .75;
      let t = h < 0 ? DEEP : h < .08 ? SHAL : h < .17 ? SAND : GRASS;
      if (t === GRASS && fbm(x / 9 + 40, y / 9 + 40, s + 5) > .54) t = FOREST;
      tiles[y * MAP + x] = t;
    }
    const at = (x, y) => this.at(x, y);

    // freshwater ponds, inland and spread apart
    const ponds = [];
    for (const margin of [4, 2]) {
      for (let k = 0; k < 3000 && ponds.length < 6; k++) {
        const x = 4 + Math.floor(rnd() * (MAP - 8)), y = 4 + Math.floor(rnd() * (MAP - 8));
        if (ponds.some(([px, py]) => Math.hypot(px - x, py - y) < 16)) continue;
        let ok = true;
        for (let dy = -margin; dy <= margin && ok; dy++) for (let dx = -margin; dx <= margin; dx++) if (at(x + dx, y + dy) < GRASS) { ok = false; break; }
        if (!ok) continue;
        const r = 1.4 + rnd() * 1.1;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= r * r) tiles[(y + dy) * MAP + x + dx] = POND;
        ponds.push([x, y]);
      }
      if (ponds.length >= 3) break;
    }
    this.ponds = ponds;

    // spawn point: land tile nearest the centre, not touching a pond
    let sp = [MAP >> 1, MAP >> 1], best = 1e9;
    for (let y = 1; y < MAP - 1; y++) for (let x = 1; x < MAP - 1; x++) {
      if (!isLandTile(at(x, y))) continue;
      let wet = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === POND) wet = true;
      if (wet) continue;
      const d = (x - MAP / 2) ** 2 + (y - MAP / 2) ** 2;
      if (d < best) { best = d; sp = [x, y]; }
    }
    this.spawn = sp;

    // resources from the spawn table
    const kinds = Object.keys(RES), occupied = new Uint8Array(MAP * MAP);
    const add = (k, tx, ty) => {
      const d = RES[k];
      const o = { cat: 'res', k, x: (tx + .5 + (rnd() - .5) * .5) * T, y: (ty + .5 + (rnd() - .5) * .5) * T, alive: 1, hp: d.hp, rg: 0, hit: 0, v: rnd() };
      this.res.push(o); this._insert(o); occupied[ty * MAP + tx] = 1;
    };
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const t = at(x, y), r = rnd();
      if (Math.hypot(x - sp[0], y - sp[1]) < 2.5) continue;
      let acc = 0;
      for (const k of kinds) { const p = RES[k].spawn[t]; if (!p) continue; acc += p; if (r < acc) { add(k, x, y); break; } }
    }
    for (const k of kinds) {
      const d = RES[k]; let n = this.res.filter(o => o.k === k).length;
      const types = Object.keys(d.spawn).map(Number);
      for (let i = 0; i < 20000 && n < d.min; i++) {
        const x = Math.floor(rnd() * MAP), y = Math.floor(rnd() * MAP);
        if (!types.includes(at(x, y)) || occupied[y * MAP + x] || Math.hypot(x - sp[0], y - sp[1]) < 2.5) continue;
        add(k, x, y); n++;
      }
    }
    // starter cache of sticks and pebbles a few steps from the spawn
    for (const [k, n] of [['stick', 5], ['pebble', 4]]) {
      let placed = 0;
      for (let i = 0; i < 800 && placed < n; i++) {
        const a = rnd() * Math.PI * 2, d = 3 + rnd() * 4, x = Math.round(sp[0] + Math.cos(a) * d), y = Math.round(sp[1] + Math.sin(a) * d);
        if (!isLandTile(at(x, y)) || occupied[y * MAP + x]) continue;
        add(k, x, y); placed++;
      }
    }

    // baked ground colours + shoreline foam masks for the renderer
    this.col = new Array(MAP * MAP); this.foam = new Uint8Array(MAP * MAP);
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const i = y * MAP + x, t = tiles[i], sh = hash2(x, y, s + 31);
      if (t === SAND) this.col[i] = `hsl(42,${(55 + sh * 6) | 0}%,${(70 + sh * 5).toFixed(1)}%)`;
      else if (t === GRASS) this.col[i] = `hsl(${(96 + sh * 10) | 0},${(36 + sh * 6) | 0}%,${(41 + sh * 5).toFixed(1)}%)`;
      else if (t === FOREST) this.col[i] = `hsl(${(112 + sh * 8) | 0},38%,${(30 + sh * 4).toFixed(1)}%)`;
      if (t === SHAL) {
        const land = (a, b) => isLandTile(at(a, b));
        this.foam[i] = (land(x, y - 1) ? 1 : 0) | (land(x + 1, y) ? 2 : 0) | (land(x, y + 1) ? 4 : 0) | (land(x - 1, y) ? 8 : 0);
      }
    }
  }
}
