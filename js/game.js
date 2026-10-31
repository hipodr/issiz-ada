// Game rules and simulation. No DOM: talks to the screen only through `this.ui`
// (toast, bump, changed, vibrate, openChest, over), so it can be tested headless.
import { T, MAP, DAY, SPEED, BAG_SLOTS, FIRE_MAX, TILE, RATE, SICK_TIME, SAVE_VERSION, isSeaTile } from './config.js';
import { clamp, smooth, DIRS8 } from './util.js';
import { World } from './world.js';
import { Inventory } from './inventory.js';
import { ITEMS } from './data/items.js';
import { RECIPES } from './data/recipes.js';
import { RES } from './data/resources.js';
import { STRUCT } from './data/structures.js';
import { ANIMALS } from './data/animals.js';
import { EQUIP_SLOTS, sumStats } from './data/equipment.js';

const NOOP_UI = { toast() {}, bump() {}, changed() {}, vibrate() {}, openChest() {}, openFire() {}, over() {} };

// Tutorial chain shown in the "Hedef" card; after the last one the game is open-ended.
export const MILESTONES = [
  { id: 'axe',  t: 'Yerden dal ve çakıl topla, balta yap' },
  { id: 'pick', t: 'Kazma yap' },
  { id: 'fire', t: 'Kamp ateşi yak' },
  { id: 'rope', t: 'Liflerden ip yap' },
  { id: 'fish', t: 'Olta yap, kıyıda balık tut' },
  { id: 'cook', t: 'Balığı ateşte pişir (Ateş → koy, bekle, al)' },
  { id: 'hunt', t: 'Yay ve ok yap, tavşan avla' },
  { id: 'wear', t: 'Postlardan giysi yap ve giy (Çanta)' },
];

export class Game {
  constructor(ui = NOOP_UI) { this.ui = ui; this.clock = 0; this.parts = []; this.floats = []; this.best = 0; }

  // ================= lifecycle =================
  newGame(seed = (Math.random() * 2 ** 31) | 0) {
    this.W = new World(seed);
    const [sx, sy] = this.W.spawn;
    this.P = { x: (sx + .5) * T, y: (sy + .5) * T, vx: 0, vy: 0, r: 8, fx: 0, fy: 1, walk: 0, moving: false, swing: 0 };
    this.S = { hp: 100, hunger: 100, thirst: 100, sick: 0, time: .06, day: 1, coldWarned: false, lastWarn: -99, lockMsg: -99 };
    this.inv = new Inventory(BAG_SLOTS);
    this.eq = {};             // equipment: slot id → stack (see data/equipment.js)
    this.st = sumStats(this.eq);
    this.done = {};
    this.fishing = null; this.action = null; this.parts = []; this.floats = []; this.dead = false;
    this.cam = { x: this.P.x, y: this.P.y };
    this.animalTimer = 0;
    this.spawnAnimals(true);
  }

  serialize() {
    const W = this.W, P = this.P, S = this.S;
    return {
      v: SAVE_VERSION, seed: W.seed, p: [P.x, P.y],
      s: { hp: S.hp, hunger: S.hunger, thirst: S.thirst, sick: S.sick, time: S.time, day: S.day },
      inv: this.inv.slots, eq: this.eq, done: this.done, nextId: W.nextId,
      res: W.res.map(o => o.alive ? 0 : [o.hp, Math.round(o.rg)]),
      ents: W.ents.map(({ _gi, cat, ...e }) => e),
    };
  }

  static fromSave(d, ui) {
    const g = new Game(ui);
    g.newGame(d.seed);
    const W = g.W;
    g.P.x = d.p[0]; g.P.y = d.p[1]; g.cam.x = g.P.x; g.cam.y = g.P.y;
    Object.assign(g.S, d.s);
    g.inv.slots = d.inv; g.eq = d.eq || {}; g.st = sumStats(g.eq); g.done = d.done || {};
    d.res.forEach((st, i) => { const o = W.res[i]; if (!o || !st) return; o.alive = 0; o.hp = st[0]; W.scheduleRegrow(o, Math.max(1, st[1])); });
    for (const e of d.ents) { const n = W.addEnt(e.k, e.x, e.y, { ...e, __loaded: true }); STRUCT[n.k].fix?.(n); }
    W.nextId = Math.max(W.nextId, d.nextId || 1);
    g.spawnAnimals(true);
    return g;
  }

  // ================= queries =================
  darkness(t = this.S.time) {
    if (t < .56) return 0;
    if (t < .68) return smooth((t - .56) / .12) * .86;
    if (t < .91) return .86;
    return (1 - smooth((t - .91) / .09)) * .86;
  }
  timeOfDay(t = this.S.time) { return t < .12 ? 'Sabah' : t < .45 ? 'Öğle' : t < .6 ? 'Akşamüstü' : t < .68 ? 'Akşam' : t < .92 ? 'Gece' : 'Şafak'; }
  warmAt(x, y) { return this.W.ents.some(e => { const w = STRUCT[e.k].warm; return w && (e.x - x) ** 2 + (e.y - y) ** 2 < w(e) ** 2; }); }
  nearLitFire(r = 60) { return this.W.ents.some(e => e.k === 'fire' && e.fuel > 0 && Math.hypot(e.x - this.P.x, e.y - this.P.y) < r); }
  /** The weapon used for attacks: equipped one, else the strongest in the bag. Returns { s, slot } or null. */
  weapon() {
    if (this.eq.weapon) return { s: this.eq.weapon, slot: 'eq' };
    let best = -1;
    this.inv.slots.forEach((s, i) => { if (s && ITEMS[s.k].melee && (best < 0 || ITEMS[s.k].melee > ITEMS[this.inv.slots[best].k].melee)) best = i; });
    return best < 0 ? null : { s: this.inv.slots[best], slot: best };
  }

  // ---- equipment ----
  equipFromBag(i) {
    const s = this.inv.slots[i], slot = s && ITEMS[s.k].equip?.slot; if (!slot) return false;
    this.inv.slots[i] = this.eq[slot] || null; this.eq[slot] = s; this.done.wear = true;
    this.st = sumStats(this.eq); this.ui.changed(); return true;
  }
  unequip(slot, toIndex) {
    const s = this.eq[slot]; if (!s) return false;
    let i = toIndex;
    if (i === undefined || this.inv.slots[i]) {
      const other = i !== undefined ? this.inv.slots[i] : null;
      if (other && ITEMS[other.k].equip?.slot === slot) { this.inv.slots[i] = s; this.eq[slot] = other; this.st = sumStats(this.eq); this.ui.changed(); return true; }
      i = this.inv.slots.indexOf(null);
    }
    if (i < 0) { this.ui.toast('Çanta dolu'); return false; }
    this.inv.slots[i] = s; delete this.eq[slot];
    this.st = sumStats(this.eq); this.ui.changed(); return true;
  }
  /** Damage dealt to the player (future hostile animals). Armor reduces it. */
  hurt(n) {
    const dmg = n * Math.max(.25, 1 - this.st.armor * .15);
    this.S.hp = Math.max(0, this.S.hp - dmg); this.ui.vibrate(60);
    for (const k of ['shield', 'body']) { const s = this.eq[k]; if (s && s.d !== undefined && --s.d <= 0) { delete this.eq[k]; this.st = sumStats(this.eq); this.ui.toast(`${ITEMS[s.k].n} parçalandı`); } }
    return dmg;
  }
  canStand(x, y) {
    const W = this.W, r = this.P.r * .75;
    if (!W.landAt(x - r, y - r) || !W.landAt(x + r, y - r) || !W.landAt(x - r, y + r) || !W.landAt(x + r, y + r)) return false;
    return !W.blocked(x, y, this.P.r);
  }
  goal() {
    const m = MILESTONES.find(m => !this.done[m.id]);
    return m ? m.t : `Hayatta kal. Rekor: ${Math.max(this.best, this.S.day)} gün`;
  }

  // ================= main update =================
  update(dt, inp) {
    this.clock += dt;
    const P = this.P, S = this.S, W = this.W;

    // movement
    const { x: ix, y: iy } = inp.axis();
    const im = Math.hypot(ix, iy);
    if (this.fishing && im > .25) this.fishing = null;
    const a = Math.min(1, dt * 12);
    const spd = SPEED * (1 + this.st.speed);
    P.vx += (ix * spd - P.vx) * a; P.vy += (iy * spd - P.vy) * a;
    const sp = Math.hypot(P.vx, P.vy); P.moving = sp > 14;
    if (im > .15) { P.fx = ix / im; P.fy = iy / im; }
    if (P.moving) P.walk += dt * sp * .09;
    const nx = P.x + P.vx * dt; if (this.canStand(nx, P.y)) P.x = nx; else P.vx *= .3;
    const ny = P.y + P.vy * dt; if (this.canStand(P.x, ny)) P.y = ny; else P.vy *= .3;

    // clock
    S.time += dt / DAY;
    if (S.time >= 1) { S.time -= 1; S.day++; S.coldWarned = false; this.ui.toast(`${S.day}. gün başladı`); this.ui.changed(); }

    for (const e of [...W.ents]) STRUCT[e.k].update?.(e, dt, this);

    // survival
    S.hunger = Math.max(0, S.hunger - dt * RATE.hunger * (S.sick > 0 ? RATE.sickHungerMul : 1));
    S.thirst = Math.max(0, S.thirst - dt * RATE.thirst * (1 + this.st.thirst));
    if (S.sick > 0) { S.sick = Math.max(0, S.sick - dt); if (S.sick === 0) this.ui.toast('Kendini daha iyi hissediyorsun'); }
    const cold = this.darkness() > .4 && !this.warmAt(P.x, P.y);
    if (cold && !S.coldWarned) { S.coldWarned = true; this.ui.toast(W.ents.some(e => e.k === 'fire') ? 'Gece soğuk. Ateşin yanına git!' : 'Gece soğuk. Kamp ateşi yak!'); }
    let dh = 0;
    if (S.hunger <= 0) dh -= RATE.starve;
    if (S.thirst <= 0) dh -= RATE.dehydrate;
    if (cold) dh -= RATE.cold * (1 - Math.min(.9, this.st.warm));
    if (S.sick > 0) dh -= RATE.sick;
    if (dh === 0 && S.hunger > 35 && S.thirst > 35) dh = RATE.regen;
    S.hp = clamp(S.hp + dh * dt, 0, 100);
    if (this.clock - S.lastWarn > 25) {
      if (S.thirst < 20) { this.ui.toast('Susadın. Göl bul ya da matarandan iç.'); S.lastWarn = this.clock; }
      else if (S.hunger < 20) { this.ui.toast('Acıktın. Çantadan bir şey ye.'); S.lastWarn = this.clock; }
    }
    if (S.hp <= 0) { this.dead = true; this.ui.over(); return; }

    W.tickRegrow(dt, P);
    for (const r of W.res) if (r.hit > 0) r.hit -= dt;   // cheap: only a float decrement
    this.updateAnimals(dt);
    this.updateArrows(dt);
    this.updateFishing(dt);

    this.action = this.findAction();
    inp.actCd -= dt;
    if (inp.act && inp.actCd <= 0) { const r = this.doAction(); inp.actCd = .3; if (r === 'once') inp.act = false; }
    P.swing = Math.max(0, P.swing - dt); if (P.usedT > 0) P.usedT -= dt;

    this.stepFx(dt);
    const c = 1 - Math.exp(-dt * 7); this.cam.x += (P.x - this.cam.x) * c; this.cam.y += (P.y - this.cam.y) * c;
  }

  idle(dt, menu) {
    this.clock += dt;
    if (menu) {
      const [sx, sy] = this.W.spawn;
      this.cam.x = (sx + .5) * T + Math.sin(this.clock * .07) * 300; this.cam.y = (sy + .5) * T + Math.cos(this.clock * .05) * 240;
      for (const r of this.W.res) if (r.hit > 0) r.hit -= dt;
    }
    this.stepFx(dt);
  }

  // ================= the one smart action button =================
  // findAction() looks around and picks what the button will do, choosing the right tool from the bag:
  //   1. animal at arm's reach + a weapon        → Saldır   (weapon)
  //   2. the nearest thing in reach               → Odun kes (axe) / Taş kır (pick) / Topla / Al / Aç / Ateş / Su iç
  //   3. standing at the shore with a rod          → Balık tut (rod)
  //   4. an animal in bow range with bow + arrows  → Ok at    (bow)
  // A target that needs a missing tool is shown locked (and explains what to craft) only if nothing else is possible.
  scoreOf(o, reach) {
    const P = this.P, dist = Math.hypot(o.x - P.x, o.y - P.y), r = this.W.radius(o) || 4, dd = dist - r;
    if (dd > reach) return null;
    return dd - (dist > 0 ? ((o.x - P.x) * P.fx + (o.y - P.y) * P.fy) / dist : 1) * 6;
  }
  nearestAnimal(maxD) {
    let ba = null, bd = maxD;
    for (const a of this.W.animals) { if (!a.alive) continue; const d = Math.hypot(a.x - this.P.x, a.y - this.P.y); if (d < bd) { bd = d; ba = a; } }
    return ba;
  }
  findAction() {
    const P = this.P, W = this.W;
    if (this.fishing) return { type: 'fishing', tool: 'rod', x: this.fishing.bx, y: this.fishing.by, r: 0, lbl: this.fishing.bite ? 'Çek!' : 'Bekle…' };

    const wpn = this.weapon(), close = wpn && this.nearestAnimal(44);
    if (close) return { type: 'attack', a: close, tool: wpn.s.k, x: close.x, y: close.y, r: 10, lbl: 'Saldır' };

    let best = null, bs = 1e9, locked = null, ls = 1e9;
    W.near(P.x, P.y, 48, o => {
      if (o.cat === 'res' && !o.alive) return;
      const sc = this.scoreOf(o, o.cat === 'res' ? 22 : 24); if (sc === null) return;
      let t;
      if (o.cat === 'ent') t = { type: 'ent', o, lbl: STRUCT[o.k].label(o, this), r: STRUCT[o.k].r || 6 };
      else {
        const d = RES[o.k];
        if (d.gather) t = { type: 'gather', o, lbl: d.label, r: d.r };
        else {
          const ti = this.inv.toolFor(d.mat);
          t = ti >= 0 ? { type: 'hit', o, tool: this.inv.slots[ti].k, slot: ti, dmg: ITEMS[this.inv.slots[ti].k].dmg[d.mat], lbl: d.label, r: d.r }
                      : { type: 'hit', o, locked: true, lbl: d.label, msg: d.hint, r: d.r };
        }
      }
      t.x = o.x; t.y = o.y;
      if (t.locked) { if (sc < ls) { ls = sc; locked = t; } }
      else if (sc < bs) { bs = sc; best = t; }
    });
    if (best) return best;
    for (const [dx, dy] of DIRS8) {
      const px = P.x + dx * 22, py = P.y + dy * 22;
      if (W.tileAt(px, py) === TILE.POND) return { type: 'pond', x: px, y: py, r: 12, lbl: 'Su iç' };
    }
    if (this.inv.has('rod')) for (const [dx, dy] of [[P.fx, P.fy], ...DIRS8]) {
      const px = P.x + dx * 30, py = P.y + dy * 30;
      if (!isSeaTile(W.tileAt(px, py))) continue;
      let bx = P.x + dx * 58, by = P.y + dy * 58;
      if (!isSeaTile(W.tileAt(bx, by))) { bx = px; by = py; }
      return { type: 'sea', tool: 'rod', bx, by, x: bx, y: by, r: 10, lbl: 'Balık tut' };
    }
    if (this.inv.has('bow')) {
      const a = this.nearestAnimal(210);
      if (a) {
        const ok = this.inv.count('arrow') > 0;
        if (ok || !locked) return { type: 'shoot', a, tool: 'bow', x: a.x, y: a.y, r: 10, locked: !ok, lbl: 'Ok at', msg: 'Ok kalmadı. Üret → Ok' };
      }
    }
    return locked;
  }

  doAction() {
    const t = this.action; if (!t) return;
    if (t.locked) {
      if (this.clock - this.S.lockMsg > 1.4) { this.S.lockMsg = this.clock; this.ui.toast(t.msg || 'Bunun için bir alet lazım'); }
      return;
    }
    if (t.x !== undefined) this.face(t.x, t.y);
    this.P.swing = .22; this.P.used = t.tool || null; this.P.usedT = .5; this.ui.vibrate(12);
    switch (t.type) {
      case 'gather': this.gather(t.o); return;
      case 'hit': return this.hit(t.o, t.slot, t.dmg);
      case 'ent': return STRUCT[t.o.k].interact(t.o, this);
      case 'pond': return this.drinkPond(t);
      case 'sea': return this.castLine(t);
      case 'fishing': return this.reel();
      case 'shoot': return this.shoot(t.a);
      case 'attack': {
        const w = this.weapon(); if (!w) return;
        this.wearStack(w); return this.damage(t.a, ITEMS[w.s.k].melee || 1);
      }
    }
  }

  face(x, y) { const dx = x - this.P.x, dy = y - this.P.y, m = Math.hypot(dx, dy); if (m > 0) { this.P.fx = dx / m; this.P.fy = dy / m; } }

  gather(o) {
    const d = RES[o.k];
    o.hit = .2; this.burst(o.x, o.y - (d.fxY || 4), d.fx, 6);
    this.harvestDone(o);
  }
  hit(o, slot, dmg) {
    const d = RES[o.k];
    o.hit = .2; this.burst(o.x, o.y - (d.fxY || 4), d.fx);
    this.wear(this.inv.slots[slot].k, slot);
    o.hp -= dmg;
    if (o.hp <= 0) this.harvestDone(o);
  }
  harvestDone(o) {
    const d = RES[o.k];
    o.alive = 0; o.hp = 0;
    for (const [k, n] of d.yields) this.give(k, n);
    this.W.scheduleRegrow(o, d.regrow * DAY);
  }

  /** Wear the weapon returned by weapon() (equipped or in the bag). */
  wearStack(w) {
    if (w.slot !== 'eq') return this.wear(w.s.k, w.slot);
    if (--w.s.d <= 0) { delete this.eq.weapon; this.st = sumStats(this.eq); this.ui.toast(`${ITEMS[w.s.k].n} kırıldı!`); this.ui.vibrate(60); }
    this.ui.changed();
  }
  wear(k, slot) {
    const r = this.inv.wear(k, slot);
    if (r === 'broke') { this.ui.toast(`${ITEMS[k].n} kırıldı!`); this.ui.vibrate(60); }
    if (r) this.ui.changed();
  }

  give(k, n) {
    const left = this.inv.add(k, n), got = n - left;
    if (got) { this.floatText(this.P.x, this.P.y - 30, `+${got} ${ITEMS[k].n}`, '#fff6dc'); this.ui.bump(); }
    if (left) { this.dropItem(k, left, this.P.x, this.P.y + 10); this.ui.toast('Çanta dolu, yere bırakıldı'); }
    this.ui.changed();
  }

  dropItem(k, n, x, y, d) {
    const e = this.W.addEnt('drop', x + (Math.random() - .5) * 10, y + (Math.random() - .5) * 6, { item: k, n });
    if (d !== undefined) e.d = d;
    return e;
  }
  pickupDrop(e) {
    const st = { k: e.item, n: e.n }; if (e.d !== undefined) st.d = e.d;
    const left = this.inv.addStack(st);
    if (left === e.n) { this.ui.toast('Çanta dolu'); return; }
    this.floatText(this.P.x, this.P.y - 30, `+${e.n - left} ${ITEMS[e.item].n}`, '#fff6dc'); this.ui.bump();
    if (left > 0) e.n = left; else this.W.removeEnt(e);
    this.ui.changed();
  }

  // ---- bag actions (slot index) ----
  eatSlot(i) {
    const s = this.inv.slots[i]; if (!s) return; const f = ITEMS[s.k].food; if (!f) return;
    this.inv.takeOne(i);
    this.S.hunger = Math.min(100, this.S.hunger + (f.hu || 0)); this.S.thirst = Math.min(100, this.S.thirst + (f.th || 0));
    this.floatText(this.P.x, this.P.y - 30, `+${f.hu} Tokluk`, '#ffd9a0'); this.burst(this.P.x, this.P.y - 12, [ITEMS[s.k].c, '#fff1c9'], 6);
    if (f.sick && Math.random() < f.sick) { this.S.sick = SICK_TIME; this.ui.toast('Midene dokundu! Biraz hastasın'); this.ui.vibrate(80); }
    if (f.leaves) this.give(f.leaves, 1);
    this.ui.changed();
  }
  drinkSlot(i) {
    const s = this.inv.slots[i]; if (!s || !ITEMS[s.k].canteen || s.d <= 0) return;
    s.d--; this.S.thirst = Math.min(100, this.S.thirst + 30);
    this.floatText(this.P.x, this.P.y - 30, '+30 Su', '#bfe8ff'); this.ui.changed();
  }
  dropSlot(i) {
    const s = this.inv.slots[i]; if (!s) return;
    this.inv.slots[i] = null; this.dropItem(s.k, s.n, this.P.x + this.P.fx * 14, this.P.y + this.P.fy * 14 + 6, s.d);
    this.ui.changed();
  }

  drinkPond(t) {
    this.S.thirst = Math.min(100, this.S.thirst + 35);
    this.burst(t.x, t.y, ['#bfe8ff', '#7fd0f5']); this.floatText(this.P.x, this.P.y - 30, '+35 Su', '#bfe8ff');
    let filled = false;
    for (const s of this.inv.slots) if (s && ITEMS[s.k].canteen && s.d < ITEMS[s.k].canteen) { s.d = ITEMS[s.k].canteen; filled = true; }
    if (filled) { this.ui.toast('Matara doldu'); this.ui.changed(); }
  }

  // ---- campfire (called from the fire sheet) ----
  fireAddWood(e) {
    if (!this.inv.count('wood')) { this.ui.toast('Çantanda odun yok'); return false; }
    if (e.fuel >= FIRE_MAX - 5) { this.ui.toast('Ateş zaten dolu'); return false; }
    this.inv.remove('wood', 1); e.fuel = Math.min(FIRE_MAX, e.fuel + 60);
    this.burst(e.x, e.y - 6, ['#ffb347', '#ffd27a', '#ff7a2f']); this.ui.changed(); return true;
  }
  firePut(e, slot) {
    const s = this.inv.slots[slot]; if (!s || !ITEMS[s.k].cook) return false;
    const i = e.cook.indexOf(null); if (i < 0) { this.ui.toast('Ateşte yer yok'); return false; }
    e.cook[i] = { k: s.k, t: 0, st: 'raw' }; this.inv.takeOne(slot); this.ui.changed(); return true;
  }
  fireTake(e, i) {
    const c = e.cook[i]; if (!c) return false;
    if (this.inv.add(c.k, 1)) { this.ui.toast('Çanta dolu'); return false; }
    if (c.st === 'done') this.done.cook = true;
    e.cook[i] = null; this.ui.bump(); this.ui.changed(); return true;
  }

  // ---- fishing ----
  castLine(t) { this.fishing = { bx: t.bx, by: t.by, wait: 2 + Math.random() * 4, bite: false, biteT: 0 }; return 'once'; }
  updateFishing(dt) {
    const f = this.fishing; if (!f) return;
    if (!f.bite) {
      f.wait -= dt;
      if (f.wait <= 0) { f.bite = true; f.biteT = 1.1; this.ui.vibrate(50); this.floatText(f.bx, f.by - 12, '!', '#ffffff'); }
    } else {
      f.biteT -= dt;
      if (f.biteT <= 0) { this.fishing = null; this.ui.toast('Balık kaçtı'); this.wear('rod'); }
    }
  }
  reel() {
    const f = this.fishing; this.fishing = null;
    if (f && f.bite) { this.give('fish', 1); this.done.fish = true; this.wear('rod'); this.burst(f.bx, f.by, ['#bfe8ff', '#8fb4c8'], 10); }
    return 'once';
  }

  // ---- hunting ----
  shoot(a) {
    const P = this.P, sp = 430, ox = P.x, oy = P.y - 8;
    const d = Math.hypot(a.x - ox, a.y - 4 - oy), tt = d / sp;
    const tx = a.x + a.vx * tt, ty = a.y - 4 + a.vy * tt, m = Math.hypot(tx - ox, ty - oy) || 1;
    this.W.arrows.push({ x: ox, y: oy, vx: (tx - ox) / m * sp, vy: (ty - oy) / m * sp, dist: 0, max: Math.min(280, d + 70) });
    this.inv.remove('arrow', 1); this.wear('bow'); this.ui.changed();
  }
  updateArrows(dt) {
    const W = this.W;
    for (let i = W.arrows.length - 1; i >= 0; i--) {
      const ar = W.arrows[i]; ar.x += ar.vx * dt; ar.y += ar.vy * dt; ar.dist += Math.hypot(ar.vx, ar.vy) * dt;
      let hit = null;
      for (const a of W.animals) if (a.alive && (a.x - ar.x) ** 2 + (a.y - 4 - ar.y) ** 2 < ANIMALS[a.k].hitR ** 2) { hit = a; break; }
      if (hit) { this.damage(hit, 2); W.arrows.splice(i, 1); if (Math.random() < .5) this.dropItem('arrow', 1, hit.x, hit.y + 6); continue; }
      if (ar.dist >= ar.max) { W.arrows.splice(i, 1); if (Math.random() < .5 && W.landAt(ar.x, ar.y + 8)) this.dropItem('arrow', 1, ar.x, ar.y + 8); }
    }
  }
  damage(a, n) {
    a.hp = (a.hp ?? ANIMALS[a.k].hp) - n; a.hurt = .25;
    this.burst(a.x, a.y - 6, ['#d9707a', '#ffffff'], 5);
    if (a.hp <= 0) this.kill(a);
  }
  kill(a) {
    a.alive = false;
    for (const [k, n] of ANIMALS[a.k].drops) this.dropItem(k, n, a.x, a.y);
    this.burst(a.x, a.y - 4, ['#d9707a', '#cdbda5'], 12);
    this.done.hunt = true; this.ui.toast(`${ANIMALS[a.k].n} avlandı! Eti yerden al`); this.ui.vibrate(40);
  }

  // ---- animals ----
  spawnAnimals(fill) {
    const W = this.W;
    W.animals = W.animals.filter(a => a.alive);
    for (const [k, def] of Object.entries(ANIMALS)) {
      let have = W.animals.filter(a => a.k === k).length;
      for (let tries = 0; tries < 4000 && have < def.count; tries++) {
        const x = Math.random() * MAP | 0, y = Math.random() * MAP | 0;
        if (!def.tiles.includes(W.at(x, y))) continue;
        const wx = (x + .5) * T, wy = (y + .5) * T;
        if (Math.hypot(wx - this.P.x, wy - this.P.y) < (fill ? 200 : 420)) continue;
        W.animals.push({ k, x: wx, y: wy, vx: 0, vy: 0, t: Math.random() * 2, flee: 0, hop: 0, face: 1, alive: true, hp: def.hp, hurt: 0 });
        have++;
        if (!fill) break;
      }
    }
  }
  updateAnimals(dt) {
    const P = this.P, W = this.W;
    for (const a of W.animals) {
      if (!a.alive) continue;
      const def = ANIMALS[a.k];
      if (a.hurt > 0) a.hurt -= dt;
      if (def.ai === 'flee') {
        const dx = a.x - P.x, dy = a.y - P.y, d = Math.hypot(dx, dy) || 1;
        if (d < def.fleeDist) { a.flee = 1.3; a.vx = dx / d * def.fleeSpeed; a.vy = dy / d * def.fleeSpeed; }
        else if (a.flee > 0) a.flee -= dt;
        else if ((a.t -= dt) <= 0) {
          a.t = 1 + Math.random() * 2.5;
          if (Math.random() < .4) a.vx = a.vy = 0;
          else { const ang = Math.random() * Math.PI * 2; a.vx = Math.cos(ang) * def.speed; a.vy = Math.sin(ang) * def.speed; }
        }
      }
      const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
      if (W.landAt(nx, a.y)) a.x = nx; else a.vx *= -1;
      if (W.landAt(a.x, ny)) a.y = ny; else a.vy *= -1;
      if (Math.hypot(a.vx, a.vy) > 5) a.hop += dt * 11; else a.hop = 0;
      if (Math.abs(a.vx) > 2) a.face = Math.sign(a.vx);
    }
    if ((this.animalTimer -= dt) <= 0) { this.animalTimer = 15; this.spawnAnimals(false); }
  }

  // ================= crafting & building =================
  craft(id) {
    const r = RECIPES.find(x => x.id === id); if (!r) return false;
    if (!this.inv.canAfford(r.cost)) return false;
    if (r.place) {
      const spot = this.findBuildSpot(STRUCT[r.place].r || 8);
      if (!spot) { this.ui.toast('Burası uygun değil, açık bir yere geç'); return false; }
      this.inv.pay(r.cost);
      const e = this.W.addEnt(r.place, spot[0], spot[1]);
      this.burst(e.x, e.y - 6, ['#ffd27a', '#c7a46a', '#fff1c9'], 12);
      this.ui.toast(`${STRUCT[r.place].n} kuruldu`);
    } else {
      this.inv.pay(r.cost);
      this.give(r.out[0], r.out[1]);
      this.ui.toast(`${ITEMS[r.out[0]].n} hazır`);
    }
    this.done[id] = true;
    this.ui.vibrate(25); this.ui.changed();
    return true;
  }
  findBuildSpot(rad) {
    const P = this.P, W = this.W;
    const d1 = rad + P.r + 6, cands = [[P.fx * d1, P.fy * d1], ...DIRS8.map(([x, y]) => [x * d1, y * d1]), ...DIRS8.map(([x, y]) => [x * (d1 + 14), y * (d1 + 14)])];
    for (const [dx, dy] of cands) {
      const x = P.x + dx, y = P.y + dy;
      if (!W.landAt(x, y) || !W.landAt(x - rad, y) || !W.landAt(x + rad, y)) continue;
      if ((x - P.x) ** 2 + (y - P.y) ** 2 < (rad + P.r + 1) ** 2) continue;
      let clear = true;
      W.near(x, y, 40, o => { if (W.solid(o) && Math.hypot(o.x - x, o.y - y) < W.radius(o) + rad + 4) clear = false; });
      if (clear) return [x, y];
    }
    return null;
  }

  // ================= effects =================
  burst(x, y, cols, n = 9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 70;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0, max: .45 + Math.random() * .35, c: cols[i % cols.length], s: 2 + Math.random() * 2 });
    }
  }
  floatText(x, y, txt, c = '#fff') { this.floats.push({ x, y, txt, c, life: 0 }); }
  stepFx(dt) {
    for (const p of this.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.vx *= Math.exp(-dt * 3); }
    this.parts = this.parts.filter(p => p.life < p.max);
    for (const f of this.floats) f.life += dt;
    this.floats = this.floats.filter(f => f.life < 1.1);
    for (const e of this.W.ents) if (STRUCT[e.k].sparks && e.fuel > 0 && Math.random() < dt * 18)
      this.parts.push({ x: e.x + (Math.random() - .5) * 8, y: e.y - 12, vx: (Math.random() - .5) * 10, vy: -40 - Math.random() * 30, life: 0, max: .6, c: '#ffcf6a', s: 1.6 });
  }
}
