// DOM side: HUD, hotbar, two action buttons, bag / craft / chest / fire sheets, tooltips, toasts.
// Implements the `ui` interface Game calls: toast, bump, changed, vibrate, openChest, openFire, over.
import { BAG_SLOTS, HOTBAR, FIRE_MAX, COOK_TIME, BURN_TIME } from './config.js';
import { ITEMS } from './data/items.js';
import { RECIPES } from './data/recipes.js';
import { STRUCT } from './data/structures.js';
import { ICON, ico } from './data/icons.js';
import { Inventory, moveSlot, swapSlots } from './inventory.js';

const $ = id => document.getElementById(id);
const SHEETS = ['bag', 'craft', 'chest', 'fire'];
export const PAUSING = new Set(['bag', 'craft', 'chest']);   // the fire sheet keeps time running so food cooks

export class UI {
  constructor({ onOver }) {
    this.G = null; this.sheet = null; this.sel = -1; this.moving = false; this.ent = null;
    this.dirty = true; this.hudT = 0; this.onOver = onOver; this.last = {};
    $('bagBtn').onclick = () => this.open('bag');
    $('craftBtn').onclick = () => this.open('craft');
    for (const id of SHEETS) $(id + 'Close').onclick = () => this.close();
    $('scrim').onclick = () => this.close();
    $('woodBtn').onclick = () => { if (this.ent) this.G.fireAddWood(this.ent); };
    document.addEventListener('pointerdown', e => { if (!$('tip').hidden && !e.target.closest('#tip,[data-tip]')) this.hideTip(); }, true);
  }
  attach(G) { this.G = G; this.close(); this.dirty = true; this.last = {}; }
  get paused() { return PAUSING.has(this.sheet); }

  // ---- interface used by Game ----
  toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 1900);
  }
  bump() { const b = $('bagBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  changed() { this.dirty = true; }
  vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
  openChest(e) { this.ent = e; this.open('chest', true); }
  openFire(e) { this.ent = e; this.open('fire', true); }
  over() { this.close(); this.onOver(); }

  // ---- sheets ----
  open(name, keepEnt) {
    if (!this.G || this.G.dead) return;
    const ent = keepEnt ? this.ent : null;
    this.close(); this.ent = ent; this.sheet = name; this.sel = -1; this.moving = false;
    this.input?.release();
    $(name).hidden = false; $('scrim').hidden = !PAUSING.has(name); this.renderSheet();
  }
  close() {
    this.sheet = null; this.ent = null; this.moving = false; this.hideTip();
    for (const id of [...SHEETS, 'scrim']) $(id).hidden = true;
  }
  renderSheet() {
    if (this.sheet === 'bag') this.renderBag();
    else if (this.sheet === 'craft') this.renderCraft();
    else if (this.sheet === 'chest') this.renderChest();
    else if (this.sheet === 'fire') this.renderFire();
  }

  // ---- tooltips ----
  tipHTML(k) {
    const it = ITEMS[k]; if (!it) return '';
    const f = it.food;
    const stats = f ? `<p>+${f.hu} tokluk${f.th ? ` · +${f.th} su` : ''}${f.sick ? ` · %${Math.round(f.sick * 100)} hastalık riski` : ''}</p>` : '';
    const tool = it.tool ? `<p>${it.tool} kullanımda kırılır</p>` : '';
    return `<div class="th">${ico(k)}<b>${it.n}</b></div>${it.d ? `<p>${it.d}</p>` : ''}${stats}${tool}${it.src ? `<p class="src">Nereden: ${it.src}</p>` : ''}`;
  }
  showTip(k, el) {
    const tip = $('tip'); tip.innerHTML = this.tipHTML(k); tip.hidden = false;
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const x = Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width / 2 - w / 2));
    const y = r.top - h - 8 > 10 ? r.top - h - 8 : r.bottom + 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    clearTimeout(this._tipT); this._tipT = setTimeout(() => this.hideTip(), 4000);
  }
  hideTip() { $('tip').hidden = true; }

  // ---- slot element shared by hotbar / bag / chest / fire ----
  slotEl(s, i, { selected = false, compact = false, hot = false, onTap } = {}) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'slot' + (s ? '' : ' empty') + (selected ? ' sel' : '') + (compact ? ' compact' : '') + (hot ? ' hot' : '');
    if (s) {
      const it = ITEMS[s.k];
      let extra = '';
      if (it.tool) extra = `<span class="dur"><i style="width:${(s.d / it.tool * 100).toFixed(0)}%;background:${s.d / it.tool < .25 ? '#e8505b' : '#8fd16a'}"></i></span>`;
      else if (it.canteen) extra = `<span class="pips">${[...Array(it.canteen)].map((_, j) => `<i class="${j < s.d ? 'on' : ''}"></i>`).join('')}</span>`;
      el.innerHTML = `${ico(s.k)}${s.n > 1 ? `<span class="cnt">${s.n}</span>` : ''}${extra}`;
      el.setAttribute('aria-label', `${it.n} ${s.n}`);
    } else el.setAttribute('aria-label', 'Boş');
    if (onTap) el.onclick = () => onTap(i, el);
    return el;
  }

  renderHotbar() {
    const G = this.G, box = $('hotbar'); box.textContent = '';
    for (let i = 0; i < HOTBAR; i++) box.appendChild(this.slotEl(G.inv.slots[i], i, { selected: i === G.hand, onTap: j => G.setHand(j) }));
  }

  renderBag() {
    const G = this.G, inv = G.inv;
    $('bagCap').textContent = `${inv.used()} / ${BAG_SLOTS}`;
    const box = $('bagSlots'); box.textContent = '';
    inv.slots.forEach((s, i) => box.appendChild(this.slotEl(s, i, {
      selected: i === this.sel, hot: i < HOTBAR,
      onTap: j => {
        if (this.moving && this.sel >= 0) { swapSlots(inv, this.sel, j); if (G.hand === this.sel) G.hand = j; else if (G.hand === j) G.hand = this.sel; this.moving = false; this.sel = j; G.fishing = null; G.ui.changed(); }
        else this.sel = (this.sel === j || !inv.slots[j]) ? -1 : j;
        this.renderBag();
      },
    })));
    const det = $('bagDetail'); det.textContent = '';
    const s = inv.slots[this.sel];
    if (!s) { det.innerHTML = '<p class="muted">Üst satır hızlı erişim çubuğun. Bir eşyaya dokun: açıklamasını gör, ye, iç, ele al ya da taşı.</p>'; return; }
    if (this.moving) { det.innerHTML = '<p class="muted">Şimdi gitmesini istediğin slota dokun.</p>'; return; }
    det.innerHTML = this.tipHTML(s.k).replace('<div class="th">', '<div class="th lg">') + '<div class="dbtns"></div>';
    if (ITEMS[s.k].tool) det.querySelector('.th').insertAdjacentHTML('beforeend', `<small>Dayanıklılık ${s.d}/${ITEMS[s.k].tool}</small>`);
    if (ITEMS[s.k].canteen) det.querySelector('.th').insertAdjacentHTML('beforeend', `<small>Su ${s.d}/${ITEMS[s.k].canteen} yudum</small>`);
    const btns = det.querySelector('.dbtns'), it = ITEMS[s.k];
    const add = (txt, fn, primary) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (primary ? ' pri' : ''); b.textContent = txt; b.onclick = fn; btns.appendChild(b); };
    if (it.food) add('Ye', () => { G.eatSlot(this.sel); if (!inv.slots[this.sel]) this.sel = -1; this.renderBag(); }, true);
    if (it.canteen && s.d > 0) add('İç', () => { G.drinkSlot(this.sel); this.renderBag(); }, true);
    if (this.sel !== G.hand) add('Ele al', () => {
      if (this.sel < HOTBAR) G.setHand(this.sel);
      else { swapSlots(inv, this.sel, G.hand); this.sel = G.hand; G.fishing = null; G.ui.changed(); }
      this.renderBag();
    }, !it.food && !it.canteen);
    add('Taşı', () => { this.moving = true; this.renderBag(); });
    add('Yere bırak', () => { G.dropSlot(this.sel); this.sel = -1; this.renderBag(); });
  }

  renderCraft() {
    const G = this.G, box = $('recs'); box.textContent = '';
    for (const r of RECIPES) {
      const outK = r.out?.[0], name = r.place ? STRUCT[r.place].n : ITEMS[outK].n + (r.out[1] > 1 ? ` ×${r.out[1]}` : '');
      const el = document.createElement('div'); el.className = 'rec';
      const costs = Object.entries(r.cost).map(([k, v]) => { const have = G.inv.count(k); return `<button type="button" data-tip="${k}" class="${have >= v ? '' : 'no'}">${ico(k)}<span>${ITEMS[k].n}</span> ${have}/${v}</button>`; }).join('');
      el.innerHTML = `<div class="nm"${outK ? ` data-tip="${outK}"` : ''}>${ICON[r.id] ? ico(r.id) : ico(outK)}${name}</div><div class="ds">${r.d}</div><div class="cost">${costs}</div>`;
      el.querySelectorAll('[data-tip]').forEach(b => b.onclick = () => this.showTip(b.dataset.tip, b));
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mk'; b.textContent = r.place ? 'Kur' : 'Yap';
      b.disabled = !G.inv.canAfford(r.cost);
      b.onclick = () => { if (G.craft(r.id) && r.place) this.close(); else this.renderCraft(); };
      el.appendChild(b); box.appendChild(el);
    }
  }

  renderChest() {
    const G = this.G, e = this.ent; if (!e) return this.close();
    const chestInv = new Inventory(e.slots.length, e.slots);
    const fill = (boxId, inv, other) => {
      const box = $(boxId); box.textContent = '';
      inv.slots.forEach((s, i) => box.appendChild(this.slotEl(s, i, { compact: true, onTap: j => {
        if (!moveSlot(inv, j, other) && inv.slots[j]) this.toast('Yer yok');
        G.ui.changed(); this.renderChest();
      } })));
    };
    fill('chestSlots', chestInv, G.inv);
    fill('chestBagSlots', G.inv, chestInv);
  }

  renderFire() {
    const G = this.G, e = this.ent; if (!e) return this.close();
    $('woodBtn').textContent = `Odun at · +60 sn (${G.inv.count('wood')} odun)`;
    $('woodBtn').disabled = !G.inv.count('wood') || e.fuel >= FIRE_MAX - 5;
    const cs = $('cookSlots'); cs.textContent = '';
    this.cookBars = [];
    e.cook.forEach((c, i) => {
      const el = this.slotEl(c ? { k: c.k, n: 1 } : null, i, { onTap: j => { if (e.cook[j]) G.fireTake(e, j); this.renderFire(); } });
      el.classList.add('cook');
      if (c) el.insertAdjacentHTML('beforeend', `<span class="state ${c.st}"></span><span class="prog"><i></i></span>`);
      this.cookBars.push(el); cs.appendChild(el);
    });
    const raw = $('rawSlots'); raw.textContent = '';
    const list = G.inv.slots.map((s, i) => [s, i]).filter(([s]) => s && ITEMS[s.k].cook);
    if (!list.length) raw.innerHTML = '<p class="muted">Çantanda çiğ yiyecek yok. Balık tut ya da tavşan avla.</p>';
    for (const [s, i] of list) raw.appendChild(this.slotEl(s, i, { onTap: j => { G.firePut(e, j); this.renderFire(); } }));
    this.tickFire();
  }
  tickFire() {
    const e = this.ent; if (!e || this.sheet !== 'fire') return;
    const m = Math.floor(e.fuel / 60), sec = Math.floor(e.fuel % 60);
    $('fuelBar').style.width = (e.fuel / FIRE_MAX * 100).toFixed(1) + '%';
    $('fuelTxt').textContent = e.fuel > 0 ? `Yakıt ${m}:${String(sec).padStart(2, '0')}` : 'Ateş sönmüş, odun at';
    e.cook.forEach((c, i) => {
      const el = this.cookBars?.[i]; if (!c || !el) return;
      const bar = el.querySelector('.prog i'), st = el.querySelector('.state'); if (!bar) return;
      if (c.st === 'raw') { bar.style.width = (c.t / COOK_TIME * 100) + '%'; bar.style.background = '#ffb347'; st.textContent = e.fuel > 0 ? 'Pişiyor' : 'Ateş yok'; }
      else if (c.st === 'done') { bar.style.width = (100 - c.t / BURN_TIME * 100) + '%'; bar.style.background = '#8fd16a'; st.textContent = 'Al!'; }
      else { bar.style.width = '0'; st.textContent = 'Yandı'; }
    });
  }

  // ---- per-frame HUD ----
  tick(dt) {
    const G = this.G; if (!G) return;
    this.hudT += dt; if (this.hudT < .1 && !this.dirty) return; this.hudT = 0;
    const S = G.S;
    const set = (b, n, s, v) => { $(b).style.width = v.toFixed(1) + '%'; $(n).textContent = Math.ceil(v); $(s).classList.toggle('low', v < 25); };
    set('bHp', 'nHp', 'sHp', S.hp); set('bHu', 'nHu', 'sHu', S.hunger); set('bTh', 'nTh', 'sTh', S.thirst);
    $('sickTag').hidden = !(S.sick > 0);
    $('dayLbl').textContent = S.day + '. gün'; $('todLbl').textContent = G.timeOfDay();
    const goal = G.goal(); if (goal !== this.last.goal) { this.last.goal = goal; $('goalLbl').textContent = goal; }

    const u = G.useT, ul = u ? u.lbl : '—', heldK = G.held()?.k || '';
    if (ul !== this.last.use || heldK !== this.last.held) { this.last.use = ul; this.last.held = heldK; $('useLbl').textContent = ul; $('useIco').innerHTML = heldK ? ico(heldK) : ''; }
    $('useBtn').classList.toggle('off', !u || !!u.locked);
    $('useBtn').classList.toggle('alert', !!(G.fishing && G.fishing.bite));
    const g = G.grabT, gl = g ? g.lbl : '—';
    if (gl !== this.last.grab) { this.last.grab = gl; $('grabLbl').textContent = gl; }
    $('grabBtn').classList.toggle('off', !g);

    this.tickFire();
    if (this.dirty) {
      this.dirty = false;
      $("bagCount").textContent = G.inv.used();
      this.renderHotbar();
      if (this.sheet) this.renderSheet();
    }
  }
}
