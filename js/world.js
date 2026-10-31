// Island generation + spatial queries. No DOM, no game rules.
// Entities in the spatial grid:
//   resources (cat 'res')  : generated from the seed; only their state (alive/hp/regrow) is saved
//   entities  (cat 'ent')  : structures and drops; saved in full
import { T, MAP, TILE, isLandTile } from './config.js';
import { mulberry32, hash2, fbm, vnoise } from './util.js';
import { RES, resSolid } from './data/resources.js';
import { STRUCT } from './data/structures.js';
const { DEEP, SHAL, SAND, GRASS, FOREST, POND } = TILE;

export class World {
  constructor(seed) {
    this.seed = seed;
    this.tiles = new Uint8Array(MAP * MAP);
    this.elev = new Float32Array(MAP * MAP);  // smooth terrain height 0..1 (hills, mountains)
    this.crag = new Uint8Array(MAP * MAP);    // 1 = impassable rocky outcrop (rare, on mountain tops)
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
  /** Terrain height at a world point, bilinear between tile centres. */
  elevAt(wx, wy) {
    const fx = wx / T - .5, fy = wy / T - .5, x = Math.floor(fx), y = Math.floor(fy), u = fx - x, v = fy - y;
    const e = (a, b) => (a < 0 || b < 0 || a >= MAP || b >= MAP) ? 0 : this.elev[b * MAP + a];
    return (e(x, y) * (1 - u) + e(x + 1, y) * u) * (1 - v) + (e(x, y + 1) * (1 - u) + e(x + 1, y + 1) * u) * v;
  }
  cragAt(wx, wy) { const x = Math.floor(wx / T), y = Math.floor(wy / T); return (x < 0 || y < 0 || x >= MAP || y >= MAP) ? 0 : this.crag[y * MAP + x]; }
  /** Can something step onto (bx,by)? Hills are walkable everywhere; only rocky crags block. */
  canStep(ax, ay, bx, by) { return !this.cragAt(bx, by); }

  // ---------- spatial grid ----------
  _gi(o) { return Math.floor(o.y / T) * MAP + Math.floor(o.x / T); }
  _insert(o) { const gi = this._gi(o); o._gi = gi; (this.grid[gi] || (this.grid[gi] = [])).push(o); }
  _remove(o) { const b = this.grid[o._gi]; if (b) { const i = b.indexOf(o); if (i >= 0) b.splice(i, 1); } }
  bucket(tx, ty) { return (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) ? null : this.grid[ty * MAP + tx]; }
  near(x, y, r, cb) {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T), y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const b = this.bucket(tx, ty); if (b) for (const o of b) cb(o); }
  }
  radius(o) { if (o.cat === 'res') return RES[o.k].r; const r = STRUCT[o.k].r; return (typeof r === 'function' ? r(o) : r) || 0; }
  solid(o) { return o.cat === 'res' ? resSolid(o) : this.radius(o) > 0; }
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

  // ---------- elevation: smooth hills + a few rocky crags ----------
  genElevation(s) {
    const tiles = this.tiles, E = this.elev, N = MAP * MAP;
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const i = y * MAP + x, t = tiles[i];
      if (!isLandTile(t)) { E[i] = 0; continue; }
      const nx = (x + .5) / MAP * 2 - 1, ny = (y + .5) / MAP * 2 - 1, island = 1 - Math.hypot(nx, ny) * 1.3;
      const hills = fbm(x / 18 + 300, y / 18 + 300, s + 11);
      const ridge = 1 - Math.abs(fbm(x / 11 + 500, y / 11 + 500, s + 19) * 2 - 1);
      E[i] = Math.max(0, Math.min(1, (island - .1) * .85 + (hills - .45) * 1.2 + ridge * .22));
    }
    // fade to sea level near the coast and into hollows around ponds, then soften so slopes stay gentle
    const dist = new Float32Array(N).fill(6);
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const i = y * MAP + x; if (!isLandTile(tiles[i])) continue;
      if (tiles[i] === SAND) { E[i] = 0; continue; }
      for (let r = 1; r <= 6 && dist[i] === 6; r++)
        for (let k = 0; k < 8 * r; k++) { const a = k / (8 * r) * Math.PI * 2, q = this.at(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r)); if (!isLandTile(q) || q === SAND) { dist[i] = r - 1; break; } }
      E[i] *= Math.min(1, dist[i] / 6);
    }
    for (let pass = 0; pass < 4; pass++) {
      const c = E.slice();
      for (let y = 1; y < MAP - 1; y++) for (let x = 1; x < MAP - 1; x++) {
        const i = y * MAP + x; if (!isLandTile(tiles[i])) continue;
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * MAP + dx; sum += isLandTile(tiles[j]) ? c[j] : 0; n++; }
        E[i] = sum / n;
      }
    }
    for (let i = 0; i < N; i++) if (tiles[i] === SAND) E[i] = Math.min(E[i], .06);

    // crags: a few rocky outcrops on the highest ground only
    const land = []; for (let i = 0; i < N; i++) if (tiles[i] === GRASS || tiles[i] === FOREST) land.push(E[i]);
    if (land.length < 50) return;
    land.sort((a, b) => a - b);
    const top = land[Math.floor(land.length * .97)];
    for (let y = 2; y < MAP - 2; y++) for (let x = 2; x < MAP - 2; x++) {
      const i = y * MAP + x;
      if ((tiles[i] === GRASS || tiles[i] === FOREST) && E[i] >= top && vnoise(x / 1.8, y / 1.8, s + 41) > .55) this.crag[i] = 1;
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
    this.genElevation(s);

    // spawn point: low land near the centre, not touching a pond, far from crags
    let sp = [MAP >> 1, MAP >> 1], best = 1e9;
    for (let y = 1; y < MAP - 1; y++) for (let x = 1; x < MAP - 1; x++) {
      if (!isLandTile(at(x, y)) || this.crag[y * MAP + x]) continue;
      let wet = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === POND) wet = true;
      if (wet) continue;
      let rocky = false;                                    // keep crags well away so the start is never boxed in
      for (let dy = -6; dy <= 6 && !rocky; dy++) for (let dx = -6; dx <= 6; dx++) if (this.crag[(y + dy) * MAP + x + dx]) { rocky = true; break; }
      if (rocky) continue;
      const d = (x - MAP / 2) ** 2 + (y - MAP / 2) ** 2 + this.elev[y * MAP + x] * 500;   // central, but not on a summit
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
      const ii = y * MAP + x;
      if (Math.hypot(x - sp[0], y - sp[1]) < 2.5 || this.crag[ii]) continue;
      const high = this.elev[ii] > .78 && hash2(x, y, s + 5) < .7;   // bare mountain tops: few plants
      let acc = 0;
      for (const k of kinds) { const p = RES[k].spawn[t]; if (!p) continue; acc += p; if (r < acc) { if (!(high && k !== 'rock' && k !== 'pebble')) add(k, x, y); break; } }
    }
    for (const k of kinds) {
      const d = RES[k]; let n = this.res.filter(o => o.k === k).length;
      const types = Object.keys(d.spawn).map(Number);
      for (let i = 0; i < 20000 && n < d.min; i++) {
        const x = Math.floor(rnd() * MAP), y = Math.floor(rnd() * MAP);
        if (!types.includes(at(x, y)) || occupied[y * MAP + x] || this.crag[y * MAP + x] || Math.hypot(x - sp[0], y - sp[1]) < 2.5) continue;
        add(k, x, y); n++;
      }
    }
    // mountains are rocky
    for (let y = 1; y < MAP - 1; y++) for (let x = 1; x < MAP - 1; x++) {
      const i = y * MAP + x, e = this.elev[i];
      if (e < .6 || this.crag[i] || occupied[i] || !isLandTile(tiles[i])) continue;
      if (rnd() < (e - .6) * .3) add('rock', x, y);
    }
    // starter cache of sticks and pebbles a few steps from the spawn
    for (const [k, n] of [['stick', 5], ['pebble', 4]]) {
      let placed = 0;
      for (let i = 0; i < 800 && placed < n; i++) {
        const a = rnd() * Math.PI * 2, d = 3 + rnd() * 4, x = Math.round(sp[0] + Math.cos(a) * d), y = Math.round(sp[1] + Math.sin(a) * d);
        if (!isLandTile(at(x, y)) || occupied[y * MAP + x] || this.crag[y * MAP + x]) continue;
        add(k, x, y); placed++;
      }
    }

    // baked ground colours + shoreline foam masks for the renderer
    this.col = new Array(MAP * MAP); this.foam = new Uint8Array(MAP * MAP);
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const i = y * MAP + x, t = tiles[i], sh = hash2(x, y, s + 31), L = this.elev[i] * 8;
      if (this.crag[i]) this.col[i] = `hsl(30,6%,${(44 + sh * 6).toFixed(1)}%)`;
      else if (t === SAND) this.col[i] = `hsl(42,${(55 + sh * 6) | 0}%,${(70 + sh * 5).toFixed(1)}%)`;
      else if (t === GRASS) this.col[i] = `hsl(${(96 + sh * 10 - L) | 0},${(36 + sh * 6 - L) | 0}%,${(41 + L + sh * 5).toFixed(1)}%)`;
      else if (t === FOREST) this.col[i] = `hsl(${(112 + sh * 8 - L) | 0},38%,${(30 + L + sh * 4).toFixed(1)}%)`;
      if (t === SHAL) {
        const land = (a, b) => isLandTile(at(a, b));
        this.foam[i] = (land(x, y - 1) ? 1 : 0) | (land(x + 1, y) ? 2 : 0) | (land(x, y + 1) ? 4 : 0) | (land(x - 1, y) ? 8 : 0);
      }
    }
  }
}
