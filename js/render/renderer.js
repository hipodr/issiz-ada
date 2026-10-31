// Canvas renderer: reads game state, never changes it.
import { T, MAP, TILE } from '../config.js';
import { hash2, clamp } from '../util.js';
import { RES } from '../data/resources.js';
import { STRUCT } from '../data/structures.js';
import { ANIMALS } from '../data/animals.js';
import { ITEMS } from '../data/items.js';
import { shadow, circle } from './shapes.js';
const { DEEP, SHAL, SAND, POND } = TILE;

const WATER = [];
WATER[DEEP] = [...Array(8)].map((_, i) => `hsl(201,52%,${(25 + i * .7).toFixed(1)}%)`);
WATER[SHAL] = [...Array(8)].map((_, i) => `hsl(186,52%,${(42 + i * 1.1).toFixed(1)}%)`);
WATER[POND] = [...Array(8)].map((_, i) => `hsl(196,62%,${(46 + i * 1.2).toFixed(1)}%)`);
const TILES_ACROSS = 11;   // how many tiles fit across the short side of the screen

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
    const z = zoom * dpr;
    ctx.setTransform(z, 0, 0, z, Math.round((VW / 2 - cam.x * zoom) * dpr), Math.round((VH / 2 - cam.y * zoom) * dpr));
    const hw = VW / 2 / zoom, hh = VH / 2 / zoom;
    const x0 = Math.floor((cam.x - hw) / T) - 1, x1 = Math.floor((cam.x + hw) / T) + 1;
    const y0 = Math.floor((cam.y - hh) / T) - 1, y1 = Math.floor((cam.y + hh) / T) + 2;
    const cx0 = Math.max(0, x0), cx1 = Math.min(MAP - 1, x1), cy0 = Math.max(0, y0), cy1 = Math.min(MAP - 1, y1);

    // ground & water
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const inside = x >= 0 && y >= 0 && x < MAP && y < MAP, i = y * MAP + x, t = inside ? W.tiles[i] : DEEP;
      if (t === DEEP || t === SHAL || t === POND) {
        ctx.fillStyle = WATER[t][((Math.sin(tm * 1.4 + x * .8 + y * .5) + Math.sin(tm * .9 - x * .3 + y * .9) + 2) / 4 * 7.99) | 0];
      } else ctx.fillStyle = W.col[i];
      ctx.fillRect(x * T, y * T, T + .6, T + .6);
    }
    const fw = 3 + Math.sin(tm * 1.5) * 1.5;
    ctx.fillStyle = `rgba(255,255,255,${(.28 + Math.sin(tm * 2) * .12).toFixed(3)})`;
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      const m = W.foam[y * MAP + x]; if (!m) continue;
      if (m & 1) ctx.fillRect(x * T, y * T, T, fw);
      if (m & 2) ctx.fillRect(x * T + T - fw, y * T, fw, T);
      if (m & 4) ctx.fillRect(x * T, y * T + T - fw, T, fw);
      if (m & 8) ctx.fillRect(x * T, y * T, fw, T);
    }
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      const t = W.tiles[y * MAP + x]; if (t < SAND || t === POND) continue;
      ctx.fillRect(x * T + hash2(x, y, 7) * 28, y * T + hash2(x, y, 8) * 28, 3, 2);
      ctx.fillRect(x * T + hash2(x, y, 9) * 28, y * T + hash2(x, y, 10) * 28, 2, 2);
    }

    // target rings: white = El (grab), orange = Kullan (use)
    const ring = (tg, col) => {
      if (!tg || tg.x === undefined || tg.type === 'fishing' || tg.type === 'none') return;
      const r = (tg.r || 8) + 6, p = 1 + Math.sin(tm * 6) * .06;
      ctx.save(); ctx.strokeStyle = tg.locked ? 'rgba(255,150,150,.7)' : col; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -tm * 10;
      ctx.beginPath(); ctx.ellipse(tg.x, tg.y + 3, r * p, r * .55 * p, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    };
    if (playing) { ring(G.grabT, 'rgba(255,255,255,.8)'); ring(G.useT, 'rgba(255,165,70,.95)'); }

    // y-sorted world objects
    const list = [];
    for (let y = cy0; y <= Math.min(MAP - 1, y1 + 1); y++) for (let x = cx0; x <= cx1; x++) { const b = W.grid[y * MAP + x]; if (b) for (const o of b) list.push(o); }
    for (const a of W.animals) if (a.alive && a.x > (x0 - 1) * T && a.x < (x1 + 1) * T && a.y > (y0 - 1) * T && a.y < (y1 + 1) * T) list.push(a);
    if (playing) list.push(G.P);
    list.sort((a, b) => a.y - b.y);
    for (const o of list) {
      if (o === G.P) this.drawPlayer(G);
      else if (o.cat === 'res') RES[o.k].draw(ctx, o, tm);
      else if (o.cat === 'ent') STRUCT[o.k].draw(ctx, o, tm);
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

  heldTool(G) { const h = G.held(); return h ? h.k : null; }

  drawPlayer(G) {
    const { ctx } = this, P = G.P, x = P.x, y = P.y, tm = G.clock;
    const bob = P.moving ? Math.abs(Math.sin(P.walk)) * -1.6 : Math.sin(tm * 2) * .4, step = P.moving ? Math.sin(P.walk) * 2.5 : 0;
    shadow(ctx, x, y + 7, 8, 3.2);
    ctx.fillStyle = '#4a3a2c'; ctx.fillRect(x - 4, y + 1 + step * .3, 3, 6 - step * .4); ctx.fillRect(x + 1, y + 1 - step * .3, 3, 6 + step * .4);
    const tool = this.heldTool(G);
    if (tool) {
      const sw = P.swing > 0 ? Math.sin((1 - P.swing / .22) * Math.PI) * 1.4 : 0;
      const ang = Math.atan2(P.fy, P.fx) - .9 + sw * 1.6, hx = x + P.fx * 5, hy = y - 5 + bob;
      const len = tool === 'rod' ? 22 : 12, ex = hx + Math.cos(ang) * len, ey = hy + Math.sin(ang) * len;
      if (ITEMS[tool].food || ITEMS[tool].canteen || !ITEMS[tool].tool) {
        circle(ctx, hx + P.fx * 4, hy + 3, 3.2, ITEMS[tool].c);
      } else if (tool === 'bow') {
        const a = Math.atan2(P.fy, P.fx);
        ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(hx + P.fx * 4, hy + P.fy * 4, 9, a - 1.2, a + 1.2); ctx.stroke();
      } else {
        ctx.strokeStyle = '#7a5532'; ctx.lineWidth = tool === 'rod' ? 1.6 : tool === 'club' ? 3.6 : 2.2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
        if (tool === 'axe') circle(ctx, ex, ey, 3, '#c9ccd1');
        if (tool === 'pick') { ctx.strokeStyle = '#c9ccd1'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(ex - Math.sin(ang) * 5, ey + Math.cos(ang) * 5); ctx.lineTo(ex + Math.sin(ang) * 5, ey - Math.cos(ang) * 5); ctx.stroke(); }
      }
    }
    circle(ctx, x, y - 5 + bob, 7, G.S.sick > 0 ? '#9bbf5a' : '#e86a3a');
    ctx.fillStyle = G.S.sick > 0 ? '#7da046' : '#c4532a'; ctx.fillRect(x - 7, y - 3 + bob, 14, 2);
    circle(ctx, x, y - 14 + bob, 5.6, '#f0c49a');
    ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.arc(x, y - 15 + bob, 5.8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    if (P.fy > -.4) { ctx.fillStyle = '#2a1d14'; const ex = P.fx * 2.2; ctx.fillRect(x - 2.6 + ex, y - 14 + bob, 1.6, 1.8); ctx.fillRect(x + 1 + ex, y - 14 + bob, 1.6, 1.8); }
  }
}
