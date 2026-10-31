// Canvas renderer: reads game state, never changes it.
import { T, MAP, TILE } from '../config.js';
import { hash2, clamp, vnoise } from '../util.js';
import { RES } from '../data/resources.js';
import { STRUCT } from '../data/structures.js';
import { ANIMALS } from '../data/animals.js';
import { ITEMS } from '../data/items.js';
import { shadow, circle } from './shapes.js';
const { DEEP, SHAL, SAND, FOREST, POND } = TILE;

const WATER = [];
WATER[DEEP] = [...Array(8)].map((_, i) => `hsl(201,52%,${(25 + i * .7).toFixed(1)}%)`);
WATER[SHAL] = [...Array(8)].map((_, i) => `hsl(186,52%,${(42 + i * 1.1).toFixed(1)}%)`);
WATER[POND] = [...Array(8)].map((_, i) => `hsl(196,62%,${(46 + i * 1.2).toFixed(1)}%)`);
const TILES_ACROSS = 11;   // how many tiles fit across the short side of the screen
const CELL = 2;            // ground texture: world units per pixel (16×16 pixels per tile)
const CHUNK = 8;           // ground is built lazily in CHUNK×CHUNK-tile pieces

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.lc = document.createElement('canvas'); this.lctx = this.lc.getContext('2d');
    this.resize();
  }
  resize() {
    this.VW = window.innerWidth; this.VH = window.innerHeight; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(this.VW * this.dpr); this.cv.height = Math.round(this.VH * this.dpr);
    this.zoom = clamp(Math.min(this.VW, this.VH) / (TILES_ACROSS * T), .8, 2.4);
    this.lc.width = Math.ceil(this.VW / 2); this.lc.height = Math.ceil(this.VH / 2);
  }

  draw(G, playing) {
    const { ctx, VW, VH, dpr, zoom } = this, W = G.W, cam = G.cam, tm = G.clock;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = WATER[DEEP][3]; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    const z = zoom * dpr, sh = G.shake > 0 ? G.shake * 18 : 0, sx = (Math.random() - .5) * sh, sy = (Math.random() - .5) * sh;
    ctx.setTransform(z, 0, 0, z, Math.round((VW / 2 - cam.x * zoom + sx) * dpr), Math.round((VH / 2 - cam.y * zoom + sy) * dpr));
    const hw = VW / 2 / zoom, hh = VH / 2 / zoom;
    const x0 = Math.floor((cam.x - hw) / T) - 1, x1 = Math.floor((cam.x + hw) / T) + 1;
    const y0 = Math.floor((cam.y - hh) / T) - 1, y1 = Math.floor((cam.y + hh) / T) + 2;
    const cx0 = Math.max(0, x0), cx1 = Math.min(MAP - 1, x1), cy0 = Math.max(0, y0), cy1 = Math.min(MAP - 1, y1);

    // water underneath (animated per tile), then the detailed ground image on top
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const inside = x >= 0 && y >= 0 && x < MAP && y < MAP, i = y * MAP + x;
      const t = inside ? (this.under ? this.under[i] : W.tiles[i]) : DEEP;
      if (t === 255) continue;                                   // solid land, image covers it
      if (t === DEEP || t === SHAL || t === POND) ctx.fillStyle = WATER[t][((Math.sin(tm * 1.4 + x * .8 + y * .5) + Math.sin(tm * .9 - x * .3 + y * .9) + 2) / 4 * 7.99) | 0];
      else ctx.fillStyle = W.col[i];
      ctx.fillRect(x * T, y * T, T + .6, T + .6);
    }
    if (this.groundFor !== W) this.prepareGround(W);
    if (this.chunks) {
      ctx.imageSmoothingEnabled = false;
      let built = this.chunks.size ? 0 : -99;           // first frame: build everything visible at once
      for (let ky = Math.max(0, Math.floor(y0 / CHUNK)); ky <= Math.min(MAP / CHUNK - 1, Math.floor(y1 / CHUNK)); ky++)
        for (let kx = Math.max(0, Math.floor(x0 / CHUNK)); kx <= Math.min(MAP / CHUNK - 1, Math.floor(x1 / CHUNK)); kx++) {
          const key = ky * 64 + kx;
          let c = this.chunks.get(key);
          if (!c && built < 1) { c = this.buildChunk(W, kx, ky); this.chunks.set(key, c); built++; }
          if (c) ctx.drawImage(c, kx * CHUNK * T, ky * CHUNK * T, CHUNK * T + .6, CHUNK * T + .6);
          else for (let y = ky * CHUNK; y < (ky + 1) * CHUNK; y++) for (let x = kx * CHUNK; x < (kx + 1) * CHUNK; x++) {
            const t = W.tiles[y * MAP + x]; if (t === DEEP || t === SHAL || t === POND) continue;
            ctx.fillStyle = W.col[y * MAP + x]; ctx.fillRect(x * T, y * T, T + .6, T + .6);
          }
        }
      // gentle surf: a pulsing light band on the water side of the shore
      ctx.fillStyle = `rgba(255,255,255,${(.12 + Math.sin(tm * 2) * .07).toFixed(3)})`;
      const fw = 2 + Math.sin(tm * 1.5) * 1.5;
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
        const m = W.foam[y * MAP + x]; if (!m) continue;
        if (m & 1) ctx.fillRect(x * T, y * T + 4, T, fw);
        if (m & 2) ctx.fillRect(x * T + T - 4 - fw, y * T, fw, T);
        if (m & 4) ctx.fillRect(x * T, y * T + T - 4 - fw, T, fw);
        if (m & 8) ctx.fillRect(x * T + 4, y * T, fw, T);
      }
    }

    // target rings: white = El (grab), orange = Kullan (use)
    const ring = (tg, col) => {
      if (!tg || tg.x === undefined || tg.type === 'fishing' || tg.type === 'none') return;
      const r = (tg.r || 8) + 6, p = 1 + Math.sin(tm * 6) * .06;
      ctx.save(); ctx.strokeStyle = tg.locked ? 'rgba(255,150,150,.7)' : col; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -tm * 10;
      ctx.beginPath(); ctx.ellipse(tg.x, tg.y + 3, r * p, r * .55 * p, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    };
    if (playing) ring(G.action, 'rgba(255,165,70,.95)');

    // y-sorted world objects
    const list = [];
    for (let y = cy0; y <= Math.min(MAP - 1, y1 + 1); y++) for (let x = cx0; x <= cx1; x++) { const b = W.grid[y * MAP + x]; if (b) for (const o of b) list.push(o); }
    for (const a of W.animals) if (a.alive && a.x > (x0 - 1) * T && a.x < (x1 + 1) * T && a.y > (y0 - 1) * T && a.y < (y1 + 1) * T) list.push(a);
    if (playing) list.push(G.P);
    list.sort((a, b) => a.y - b.y);
    for (const o of list) {
      if (o === G.P) this.drawPlayer(G);
      else if (o.cat === 'res') RES[o.k].draw(ctx, o, tm);
      else if (o.cat === 'ent') STRUCT[o.k].draw(ctx, o, tm, G);
      else ANIMALS[o.k].draw(ctx, o, tm);
    }

    // arrows in flight
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1.8;
    for (const a of W.arrows) { const m = Math.hypot(a.vx, a.vy) || 1; ctx.beginPath(); ctx.moveTo(a.x - a.vx / m * 10, a.y - a.vy / m * 10); ctx.lineTo(a.x, a.y); ctx.stroke(); }

    // fishing line + bobber
    if (playing && G.fishing) {
      const f = G.fishing, P = G.P, hx = P.x + P.fx * 10, hy = P.y - 22;
      const dip = f.bite ? 3 + Math.sin(tm * 30) * 1.5 : Math.sin(tm * 3) * 1;
      ctx.strokeStyle = 'rgba(240,240,230,.8)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + f.bx) / 2, Math.max(hy, f.by) + 6, f.bx, f.by + dip); ctx.stroke();
      if (f.bite) { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(f.bx, f.by + 3, 8 + Math.sin(tm * 12) * 2, 4, 0, 0, Math.PI * 2); ctx.stroke(); }
      circle(ctx, f.bx, f.by + dip, 3, '#e8505b'); circle(ctx, f.bx, f.by - 2 + dip, 2, '#ffffff');
    }

    // particles + floating text
    for (const p of G.parts) { ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    ctx.globalAlpha = 1;
    ctx.font = '700 11px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const f of G.floats) {
      const a = f.life < .8 ? 1 : 1 - (f.life - .8) / .3, yy = f.y - f.life * 22;
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(f.txt, f.x + .8, yy + .8); ctx.fillStyle = f.c; ctx.fillText(f.txt, f.x, yy);
    }
    ctx.globalAlpha = 1;

    this.drawLight(G, playing);
    if (playing) this.drawMarkers(G);
  }

  // arrows at the screen edge pointing to off-screen shipwreck crates
  drawMarkers(G) {
    const { ctx, VW, VH, dpr, zoom } = this, cam = G.cam;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const e of G.W.ents) {
      if (e.k !== 'wreck') continue;
      const sx = (e.x - cam.x) * zoom + VW / 2, sy = (e.y - cam.y) * zoom + VH / 2;
      if (sx > 0 && sx < VW && sy > 0 && sy < VH) continue;
      const dist = Math.hypot(e.x - G.P.x, e.y - G.P.y); if (dist > 2200) continue;
      const ang = Math.atan2(sy - VH / 2, sx - VW / 2), m = 26;
      const k = Math.min((VW / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (VH / 2 - m - 60) / Math.abs(Math.sin(ang) || 1e-6));
      const ax = VW / 2 + Math.cos(ang) * k, ay = VH / 2 + Math.sin(ang) * k;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(15,37,48,.8)'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, -6); ctx.lineTo(2, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9a6436'; ctx.fillRect(-7, -4, 8, 8);
      ctx.restore();
    }
  }

  drawLight(G, playing) {
    const { ctx, lctx, lc, VW, VH, dpr, zoom } = this, cam = G.cam, tm = G.clock, t = G.S.time;
    const dark = G.darkness();
    const warm = Math.max(0, 1 - Math.abs(t - .6) / .07) * .16;
    if (warm > .01) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(255,120,50,${warm.toFixed(3)})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    if (dark <= .01) return;
    const L = .5, toS = (wx, wy) => [((wx - cam.x) * zoom + VW / 2) * L, ((wy - cam.y) * zoom + VH / 2) * L];
    lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.fillStyle = `rgba(6,12,32,${dark.toFixed(3)})`; lctx.fillRect(0, 0, lc.width, lc.height);
    lctx.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, R) => {
      const [sx, sy] = toS(wx, wy), r = R * zoom * L;
      const g = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g; lctx.beginPath(); lctx.arc(sx, sy, r, 0, Math.PI * 2); lctx.fill();
    };
    if (playing) hole(G.P.x, G.P.y - 8, 78);
    const lights = [];
    for (const e of G.W.ents) { const l = STRUCT[e.k].light; const R = l ? l(e) : 0; if (R > 0) { lights.push(e); hole(e.x, e.y - 6, R + Math.sin(tm * 13 + e.x) * 6); } }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lc, 0, 0, this.cv.width, this.cv.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const e of lights) {
      const sx = ((e.x - cam.x) * zoom + VW / 2) * dpr, sy = ((e.y - 6 - cam.y) * zoom + VH / 2) * dpr, r = 120 * zoom * dpr;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(255,140,50,${(.28 * dark).toFixed(3)})`); g.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- detailed ground: one image for the whole island, CELL world units per pixel ----------
  // Organic borders (tile type sampled with a little noise jitter), grass / sand / forest texture,
  // hill shading from W.elev (light from the north-west), rocky mountain tops and crags.
  // Water pixels stay transparent so the animated water drawn underneath shows through.
  prepareGround(W) {
    this.groundFor = W; this.chunks = null; this.under = null;
    if (typeof ImageData === 'undefined' || typeof document === 'undefined') return;   // headless tests
    this.chunks = new Map();
    // what to paint under each tile: 255 = solid land (skip); water tiles and land tiles touching water get a water colour
    const under = new Uint8Array(MAP * MAP).fill(255);
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const i = y * MAP + x, t = W.tiles[i];
      if (t === DEEP || t === SHAL || t === POND) { under[i] = t; continue; }
      let w = 255;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = W.at(x + dx, y + dy); if (q === POND) w = POND; else if ((q === SHAL || q === DEEP) && w !== POND) w = SHAL; }
      under[i] = w;
    }
    this.under = under;
  }
  buildChunk(W, kx, ky) {
    const per = T / CELL, S = CHUNK * per, px = new Uint8ClampedArray(S * S * 4), s = W.seed % 9973;
    const tileAt = (fx, fy) => { const x = Math.floor(fx), y = Math.floor(fy); return (x < 0 || y < 0 || x >= MAP || y >= MAP) ? DEEP : W.tiles[y * MAP + x]; };
    const E = (fx, fy) => W.elevAt(fx * T, fy * T);
    const mix = (a, b, t) => a + (b - a) * t;
    for (let ly = 0; ly < S; ly++) for (let lx = 0; lx < S; lx++) {
      const cx = kx * S + lx, cy = ky * S + ly;
      const fx = (cx + .5) / per, fy = (cy + .5) / per;
      const jx = (vnoise(cx / 10, cy / 10, s + 91) - .5) * .7 + (vnoise(cx / 3, cy / 3, s + 93) - .5) * .15;
      const jy = (vnoise(cx / 10 + 50, cy / 10 + 50, s + 92) - .5) * .7 + (vnoise(cx / 3 + 50, cy / 3 + 50, s + 94) - .5) * .15;
      const t = tileAt(fx + jx, fy + jy), o = (ly * S + lx) * 4;
      if (t === DEEP || t === SHAL || t === POND) continue;               // transparent → water below
      const gx = Math.floor(fx + jx * .8), gy = Math.floor(fy + jy * .8), crag = gx >= 0 && gy >= 0 && gx < MAP && gy < MAP && W.crag[gy * MAP + gx];
      const n1 = vnoise(cx / 14, cy / 14, s + 3), n2 = vnoise(cx / 4.4, cy / 4.4, s + 4), grain = hash2(cx, cy, s + 5);
      const e = E(fx, fy);
      let r, g, b;
      if (t === SAND) {
        const wet = [[.35, 0], [-.35, 0], [0, .35], [0, -.35]].some(([dx, dy]) => { const q = tileAt(fx + dx, fy + dy); return q === SHAL || q === DEEP; });
        r = 222 + n1 * 14; g = 201 + n1 * 12; b = 146 + n1 * 10;
        if (wet) { r -= 30; g -= 30; b -= 26; }
        if (grain < .04) { r -= 25; g -= 25; b -= 20; }                    // pebbles / shells
      } else if (crag) {
        // boulder field: rounded rock lumps with lit tops and dark seams
        const lump = vnoise(cx / 7, cy / 7, s + 6), seam = Math.abs(lump - .5) < .03;
        const top = vnoise((cx - 1.5) / 7, (cy - 1.5) / 7, s + 6) - lump;
        r = 116 + n1 * 18 + top * 260; g = 110 + n1 * 16 + top * 250; b = 102 + n1 * 14 + top * 240;
        if (seam) { r *= .55; g *= .55; b *= .55; }
      } else {
        const forest = t === FOREST;
        r = forest ? 54 + n1 * 16 : 92 + n1 * 22; g = forest ? 98 + n1 * 18 : 138 + n1 * 18; b = forest ? 48 + n1 * 10 : 70 + n1 * 12;
        if (n2 > .64) { r += 8; g += 10; b += 4; } else if (n2 < .32) { r -= 6; g -= 6; b -= 3; }   // tufts and hollows
        if (forest && grain < .035) { r = 96; g = 76; b = 46; }               // leaf litter
        else if (!forest && grain < .0025) { r = 232; g = 216; b = 120; }    // tiny flowers
        else if (!forest && grain > .9975) { r = 236; g = 236; b = 230; }
        const rocky = Math.max(0, Math.min(1, (e - .68) / .22));           // mountain meadow → stony ground
        if (rocky > 0) { const k = rocky * (.35 + n2 * .35); r = mix(r, 124 + n2 * 18, k); g = mix(g, 120 + n2 * 16, k); b = mix(b, 100 + n2 * 14, k); }
      }
      // hill shading: compare height up-left vs down-right (light from the north-west)
      const d = .5, shade = (E(fx - d, fy - d) - E(fx + d, fy + d)) * 9;
      const lit = 1 + Math.max(-.38, Math.min(.38, shade)) + e * .06 + (grain - .5) * .05;
      px[o] = r * lit; px[o + 1] = g * lit; px[o + 2] = b * lit; px[o + 3] = 255;
    }
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    cv.getContext('2d').putImageData(new ImageData(px, S, S), 0, 0);
    return cv;
  }

  // what the hero holds: the tool for the current action, else the weapon
  heldTool(G) { return (G.P.usedT > 0 && G.P.used) || G.action?.tool || G.weapon()?.s.k || null; }

  // Castaway hero, 3/4 top-down view: 3 poses (front / back / side, side mirrored for left),
  // walk cycle with swinging arms, shaded clothes, stubble, messy hair. Local units: feet ≈ y+7, head top ≈ y-22.
  drawPlayer(G) {
    const { ctx } = this, P = G.P, tm = G.clock, eq = G.eq || {};
    const side = Math.abs(P.fx) > Math.abs(P.fy) * 1.15, back = !side && P.fy < 0, dir = side && P.fx < 0 ? -1 : 1;
    const s = P.moving ? Math.sin(P.walk) : 0, bob = P.moving ? -Math.abs(Math.cos(P.walk)) * 1.3 : Math.sin(tm * 2) * .35;
    const hurt = P.hurtT > 0, sick = G.S.sick > 0;
    const SKIN = sick ? '#c2c48c' : '#e8b48a', SKIN_D = sick ? '#9da068' : '#c48660';
    const SHIRT = hurt ? '#ff5a4a' : '#d9653b', SHIRT_D = hurt ? '#c23a2e' : '#a8462a', SHIRT_L = hurt ? '#ff8a7a' : '#ec8a5c';
    const PANTS = '#566985', PANTS_D = '#3d4b63', HAIR = '#3a2416', HAIR_L = '#5a3a22';
    const X = v => P.x + v * dir, Y = v => P.y + v;                       // local → world (mirrored when facing left)
    const limb = (ax, ay, bx, by, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx), Y(by)); ctx.stroke(); };
    const blob = (lx, ly, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X(lx), Y(ly), rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    const K = 1.3;                                                        // hero scale (bigger than the old blob so limbs read on a phone)
    ctx.save(); ctx.translate(P.x, P.y + 7); ctx.scale(K, K); ctx.translate(-P.x, -P.y - 7);
    shadow(ctx, P.x, P.y + 7, 7.5, 2.8);
    const OUT = 'rgba(45,25,15,.55)';

    // ---- legs ----
    const foot = (fx, fy, far) => {
      if (eq.feet) blob(fx + (side ? .8 : 0), fy + .4, side ? 2.6 : 2, 1.5, far ? '#5a3c24' : '#6e4a2c');
      else blob(fx + (side ? .6 : 0), fy + .4, side ? 2 : 1.6, 1.2, far ? SKIN_D : SKIN);
    };
    const leg = (ax, ay, bx, by, w, c) => { limb(ax, ay, bx, by, w + 1, OUT); limb(ax, ay, bx, by, w, c); };
    if (side) {
      const fa = [-s * 3.4, 6.4 - Math.max(0, -s) * 1.2], na = [s * 3.4, 6.4 - Math.max(0, s) * 1.2];
      leg(0, -1 + bob, fa[0], fa[1] - 1.4, 3.4, PANTS_D); foot(fa[0], fa[1], true);
      leg(0, -1 + bob, na[0], na[1] - 1.4, 3.6, PANTS); foot(na[0], na[1], false);
    } else {
      const l = 6.4 - Math.max(0, s) * 1.8, r = 6.4 - Math.max(0, -s) * 1.8;
      leg(-2.3, -1 + bob, -2.5, l - 1.4, 3.6, PANTS); leg(2.3, -1 + bob, 2.5, r - 1.4, 3.6, PANTS_D);
      // rolled-up cuffs
      limb(-2.5, l - 2.2, -2.5, l - 1.6, 3.9, '#7d8fa8'); limb(2.5, r - 2.2, 2.5, r - 1.6, 3.9, '#6b7d96');
      foot(-2.5, l, false); foot(2.5, r, true);
    }

    // ---- tool / hand target ----
    const tool = this.heldTool(G);
    const sw = P.swing > 0 ? Math.sin((1 - P.swing / .22) * Math.PI) * 1.4 : 0;
    const handW = [P.x + P.fx * 5, P.y - 5 + bob];                        // world hand position when holding something
    const toLocal = ([wx, wy]) => [(wx - P.x) * dir, wy - P.y];
    const drawTool = () => {
      if (!tool) return;
      const ang = Math.atan2(P.fy, P.fx) - .9 + sw * 1.6, [hx, hy] = handW;
      const len = tool === 'rod' ? 22 : tool === 'spear' ? 18 : 12, ex = hx + Math.cos(ang) * len, ey = hy + Math.sin(ang) * len;
      if (ITEMS[tool].food || ITEMS[tool].canteen || !ITEMS[tool].tool) {
        circle(ctx, hx + P.fx * 2, hy + 1, 3, ITEMS[tool].c);
      } else if (tool === 'bow') {
        const a = Math.atan2(P.fy, P.fx);
        ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(hx + P.fx * 4, hy + P.fy * 4, 9, a - 1.2, a + 1.2); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,235,220,.8)'; ctx.lineWidth = .6; ctx.beginPath();
        ctx.moveTo(hx + P.fx * 4 + Math.cos(a - 1.2) * 9, hy + P.fy * 4 + Math.sin(a - 1.2) * 9); ctx.lineTo(hx + P.fx * 4 + Math.cos(a + 1.2) * 9, hy + P.fy * 4 + Math.sin(a + 1.2) * 9); ctx.stroke();
      } else {
        ctx.lineCap = 'round'; ctx.strokeStyle = '#7a5532'; ctx.lineWidth = tool === 'rod' ? 1.4 : tool === 'club' ? 3.4 : 2;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
        if (tool === 'axe') {                                     // blade on one side of the handle, curved edge
          const c = Math.cos(ang), n = Math.sin(ang), bx = -n * dir, by = c * dir;
          ctx.fillStyle = '#c9ccd1'; ctx.beginPath(); ctx.moveTo(ex - c * 4.5, ey - n * 4.5); ctx.lineTo(ex, ey);
          ctx.lineTo(ex + bx * 5 + c * 1.5, ey + by * 5 + n * 1.5); ctx.quadraticCurveTo(ex + bx * 6.5 - c * 2.5, ey + by * 6.5 - n * 2.5, ex + bx * 4.5 - c * 6, ey + by * 4.5 - n * 6); ctx.fill();
          ctx.fillStyle = '#eef0f2'; ctx.fillRect(ex + bx * 5 - c * 2.4 - .5, ey + by * 5 - n * 2.4 - .5, 1, 1);
        }
        if (tool === 'spear') { ctx.fillStyle = '#cfd3d8'; ctx.beginPath(); ctx.moveTo(ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6); ctx.lineTo(ex - Math.sin(ang) * 2.5, ey + Math.cos(ang) * 2.5); ctx.lineTo(ex + Math.sin(ang) * 2.5, ey - Math.cos(ang) * 2.5); ctx.fill(); }
        if (tool === 'pick') { ctx.strokeStyle = '#c9ccd1'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ex - Math.sin(ang) * 5, ey + Math.cos(ang) * 5); ctx.quadraticCurveTo(ex + Math.cos(ang) * 1.5, ey + Math.sin(ang) * 1.5, ex + Math.sin(ang) * 5, ey - Math.cos(ang) * 5); ctx.stroke(); }
      }
    };
    // arm: shoulder → elbow → hand, sleeve on the upper half
    const arm = (sx, sy, hx, hy, far) => {
      const ex = (sx + hx) / 2 + (side ? -.8 : sx > 0 ? .9 : sx < 0 ? -.9 : 0), ey = (sy + hy) / 2;   // elbow bends outward
      const cx = sx + (ex - sx) * .55, cy = sy + (ey - sy) * .55;          // short sleeve ends here
      limb(sx, sy, ex, ey, 4, OUT); limb(ex, ey, hx, hy, 3.3, OUT); blob(hx, hy, 2.2, 2.2, OUT);   // outline
      limb(cx, cy, ex, ey, 2.5, far ? SKIN_D : SKIN); limb(ex, ey, hx, hy, 2.3, far ? SKIN_D : SKIN);
      limb(sx, sy, cx, cy, 3, far ? SHIRT_D : SHIRT_L);
      blob(hx, hy, 1.7, 1.7, far ? SKIN_D : SKIN);
    };
    const holdArm = tool ? toLocal(handW) : null;
    const shY = -10.5 + bob;

    // ---- torso ----
    const torso = () => {
      const w = side ? 3.6 : 5.4, hw = side ? 3.2 : 4.4, top = -12 + bob, hip = -.6 + bob;
      const g = ctx.createLinearGradient(X(-w), 0, X(w), 0); g.addColorStop(0, SHIRT_L); g.addColorStop(.55, SHIRT); g.addColorStop(1, SHIRT_D);
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(X(-w), Y(top + .8)); ctx.quadraticCurveTo(X(-w - .8), Y(top + 6), X(-hw), Y(hip));
      ctx.lineTo(X(hw), Y(hip)); ctx.quadraticCurveTo(X(w + .8), Y(top + 6), X(w), Y(top + .8));
      ctx.quadraticCurveTo(X(0), Y(top - 1), X(-w), Y(top + .8)); ctx.closePath(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke(); ctx.fill();
      // ragged hem
      ctx.fillStyle = SHIRT_D; for (let i = -hw; i < hw - .5; i += 2) { ctx.beginPath(); ctx.moveTo(X(i), Y(hip)); ctx.lineTo(X(i + 1), Y(hip + 1.1 + (i * 7 % 3) * .2)); ctx.lineTo(X(i + 2), Y(hip)); ctx.fill(); }
      // belt / rope
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(Math.min(X(-hw - .2), X(hw + .2)), Y(hip - 2.4), (hw + .2) * 2, 1.3);
      if (!side && !back) { ctx.fillStyle = SKIN_D; ctx.beginPath(); ctx.moveTo(X(-1.6), Y(top)); ctx.lineTo(X(0), Y(top + 3)); ctx.lineTo(X(1.6), Y(top)); ctx.fill(); }   // open collar
      if (!side) { ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(X(1.8), Y(top + 3)); ctx.quadraticCurveTo(X(2.4), Y(top + 7), X(1.4), Y(hip - 3)); ctx.stroke(); }   // fold
      if (eq.body) {                                                       // leather vest
        ctx.fillStyle = '#8a6a44';
        if (back) { ctx.beginPath(); ctx.moveTo(X(-w + .4), Y(top + 1)); ctx.lineTo(X(-hw + .3), Y(hip - .3)); ctx.lineTo(X(hw - .3), Y(hip - .3)); ctx.lineTo(X(w - .4), Y(top + 1)); ctx.fill(); }
        else if (side) { ctx.beginPath(); ctx.moveTo(X(-w + .3), Y(top + 1)); ctx.lineTo(X(-hw + .2), Y(hip - .3)); ctx.lineTo(X(1.2), Y(hip - .3)); ctx.lineTo(X(.6), Y(top + .4)); ctx.fill(); }
        else for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(sg * w * .95), Y(top + 1)); ctx.lineTo(X(sg * hw * .95), Y(hip - .3)); ctx.lineTo(X(sg * 1.3), Y(hip - .3)); ctx.lineTo(X(sg * 1.7), Y(top + .3)); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(Math.min(X(-w + .6), X(-w + 1.4)), Y(top + 2), .8, 7);
      }
    };

    // ---- head ----
    const head = () => {
      const hy = -17.2 + bob;
      limb(0, -13 + bob, 0, -12 + bob, 2.8, SKIN_D);                       // neck
      const g = ctx.createRadialGradient(X(-1.5), Y(hy - 1.5), .5, X(0), Y(hy), 5.6); g.addColorStop(0, SKIN); g.addColorStop(1, SKIN_D);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X(side ? .3 : 0), Y(hy), side ? 4.6 : 4.8, 5.2, 0, 0, Math.PI * 2); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke(); ctx.fill();
      ctx.fillStyle = HAIR;
      if (back) {
        ctx.beginPath(); ctx.ellipse(X(0), Y(hy - .4), 5.1, 5.1, 0, 0, Math.PI * 2); ctx.fill();
        blob(-4.9, hy + .6, 1, 1.4, SKIN_D); blob(4.9, hy + .6, 1, 1.4, SKIN_D);
        ctx.strokeStyle = HAIR_L; ctx.lineWidth = .7; ctx.beginPath(); for (const k of [-2.4, 0, 2.2]) { ctx.moveTo(X(k), Y(hy - 4.5)); ctx.quadraticCurveTo(X(k + .8), Y(hy), X(k - .3), Y(hy + 4.2)); } ctx.stroke();
      } else if (side) {
        ctx.beginPath(); ctx.moveTo(X(4.4), Y(hy - 2.6)); ctx.quadraticCurveTo(X(3), Y(hy - 6.4), X(-1), Y(hy - 5.6));
        ctx.quadraticCurveTo(X(-5.2), Y(hy - 4.4), X(-4.6), Y(hy + 2.8)); ctx.lineTo(X(-2.4), Y(hy + 3.6)); ctx.lineTo(X(-1.2), Y(hy - 1));
        ctx.lineTo(X(1.4), Y(hy - 2.4)); ctx.lineTo(X(2.6), Y(hy - 1.6)); ctx.closePath(); ctx.fill();
        blob(-.8, hy + .4, 1, 1.3, SKIN_D);                                // ear
        blob(2.8, hy - .2, .65, .8, '#2a1a10');                            // eye
        ctx.fillStyle = SKIN; ctx.beginPath(); ctx.moveTo(X(4.6), Y(hy - .4)); ctx.lineTo(X(5.6), Y(hy + 1.2)); ctx.lineTo(X(4.5), Y(hy + 1.6)); ctx.fill();   // nose
        ctx.fillStyle = 'rgba(70,45,30,.35)'; ctx.beginPath(); ctx.ellipse(X(1.8), Y(hy + 3.2), 2.8, 1.6, 0, 0, Math.PI * 2); ctx.fill();   // stubble
      } else {
        blob(-4.8, hy + .3, 1, 1.4, SKIN_D); blob(4.8, hy + .3, 1, 1.4, SKIN_D);   // ears
        ctx.fillStyle = HAIR; ctx.beginPath(); ctx.moveTo(X(-5.2), Y(hy + 1)); ctx.quadraticCurveTo(X(-5.6), Y(hy - 6.2), X(0), Y(hy - 5.8));
        ctx.quadraticCurveTo(X(5.6), Y(hy - 6.2), X(5.2), Y(hy + 1)); ctx.lineTo(X(4.2), Y(hy - 1.8));
        ctx.lineTo(X(2.6), Y(hy - 2.6)); ctx.lineTo(X(1.2), Y(hy - 1.8)); ctx.lineTo(X(-.4), Y(hy - 2.9)); ctx.lineTo(X(-2), Y(hy - 2)); ctx.lineTo(X(-3.4), Y(hy - 2.7)); ctx.lineTo(X(-4.3), Y(hy - 1.6)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = HAIR_L; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(X(-3), Y(hy - 5)); ctx.quadraticCurveTo(X(-1), Y(hy - 6), X(2), Y(hy - 4.6)); ctx.stroke();
        const lx = P.fx * .6;
        ctx.fillStyle = 'rgba(40,25,15,.8)'; ctx.fillRect(X(-2.9 + lx), Y(hy - 1.4), 2, .6); ctx.fillRect(X(.9 + lx), Y(hy - 1.4), 2, .6);   // brows
        blob(-1.8 + lx, hy, .65, .8, '#2a1a10'); blob(1.8 + lx, hy, .65, .8, '#2a1a10');                                             // eyes
        ctx.fillStyle = SKIN_D; ctx.fillRect(X(-.4 + lx), Y(hy + .8), .8, 1.2);                                                      // nose
        ctx.fillStyle = 'rgba(70,45,30,.32)'; ctx.beginPath(); ctx.ellipse(X(lx * .5), Y(hy + 3), 3.4, 1.9, 0, 0, Math.PI); ctx.fill();   // stubble
        ctx.fillStyle = 'rgba(110,50,40,.7)'; ctx.fillRect(X(-1 + lx * .5), Y(hy + 2.6), 2, .5);                                    // mouth
      }
      if (eq.head) {                                                        // straw hat
        const t = hy - 3.6;
        ctx.fillStyle = '#d9b862'; ctx.beginPath(); ctx.ellipse(X(0), Y(t), 8.6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9cf84'; ctx.beginPath(); ctx.ellipse(X(0), Y(t - 1.4), 4.6, 3.6, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(Math.min(X(-4.6), X(4.6)), Y(t - 1.6), 9.2, 1.6);
        ctx.fillStyle = '#b84a34'; ctx.fillRect(Math.min(X(-4.6), X(4.6)), Y(t - 1.2), 9.2, 1.2);
      }
    };
    const shield = () => {
      if (!eq.shield) return;
      if (back) { blob(0, -6 + bob, 4.8, 5.4, '#7e5230'); blob(0, -6 + bob, 4, 4.6, '#9a6436'); blob(0, -6 + bob, 1.3, 1.3, '#c9ccd1'); }
      else if (side) { blob(-2.6, -5.6 + bob, 2.2, 5.4, '#7e5230'); blob(-2.2, -5.6 + bob, 1.4, 4.6, '#9a6436'); }
      else { blob(-7, -5.6 + bob, 4.6, 5, '#7e5230'); blob(-7, -5.6 + bob, 3.8, 4.2, '#9a6436'); blob(-7, -5.6 + bob, 1.2, 1.2, '#c9ccd1'); }
    };

    // ---- assemble back to front ----
    if (side) {
      const far = [-s * 4 - .5, -2.8 + bob], near = holdArm || [s * 4 + .8, -2.8 + bob];
      arm(-.6, shY, far[0], far[1], true);
      if (eq.shield) shield();
      torso(); head();
      arm(.4, shY, near[0], near[1], false); drawTool();
    } else if (back) {
      drawTool();
      const l = holdArm && P.fx * dir <= 0 ? holdArm : [-7.2, -2.6 + s * 1.4 + bob], r = holdArm && P.fx * dir > 0 ? holdArm : [7.2, -2.6 - s * 1.4 + bob];
      arm(-5.6, shY, l[0], l[1], false); arm(5.6, shY, r[0], r[1], true);
      torso(); head(); shield();
    } else {
      const r = holdArm || [7.2, -2.6 - s * 1.4 + bob], l = [-7.2, -2.6 + s * 1.4 + bob];
      torso();
      arm(-5.6, shY, l[0], l[1], false); arm(5.6, shY, r[0], r[1], true);
      shield(); head(); drawTool();
    }
    ctx.restore();
  }
}
