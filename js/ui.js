// DOM side: HUD, bag / craft / chest sheets, toasts. Implements the `ui` interface Game calls.
import { BAG_SLOTS } from './config.js';
import { ITEMS } from './data/items.js';
import { RECIPES } from './data/recipes.js';
import { STRUCT } from './data/structures.js';
import { ICON, ico } from './data/icons.js';
import { Inventory, moveSlot } from './inventory.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor({ onOver }) {
    this.G = null; this.sheet = null; this.sel = -1; this.chest = null; this.dirty = true; this.hudT = 0;
    this.lastAct = ''; this.lastGoal = ''; this.onOver = onOver;
    $('bagBtn').onclick = () => this.open('bag');
    $('craftBtn').onclick = () => this.open('craft');
    for (const id of ['bag', 'craft', 'chest']) $(id + 'Close').onclick = () => this.close();
    $('scrim').onclick = () => this.close();
  }
  attach(G) { this.G = G; this.close(); this.dirty = true; this.lastGoal = ''; }

  // ---- interface used by Game ----
  toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 1900);
  }
  bump() { const b = $('bagBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  changed() { this.dirty = true; }
  vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
  openChest(e) { this.chest = e; this.open('chest'); }
  over() { this.close(); this.onOver(); }

  // ---- sheets ----
  open(name) {
    if (!this.G || this.G.dead) return;
    this.close(); this.sheet = name; this.sel = -1;
    this.input?.release();
    $(name).hidden = false; $('scrim').hidden = false; this.renderSheet();
  }
  close() {
    this.sheet = null; this.chest = null;
    for (const id of ['bag', 'craft', 'chest', 'scrim']) $(id).hidden = true;
  }
  renderSheet() {
    if (this.sheet === 'bag') this.renderBag();
    else if (this.sheet === 'craft') this.renderCraft();
    else if (this.sheet === 'chest') this.renderChest();
  }

  slotEl(s, i, { selected = false, compact = false, onTap } = {}) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'slot' + (s ? '' : ' empty') + (selected ? ' sel' : '') + (compact ? ' compact' : '');
    if (s) {
      const it = ITEMS[s.k];
      let extra = '';
      if (it.tool) extra = `<span class="dur"><i style="width:${(s.d / it.tool * 100).toFixed(0)}%;background:${s.d / it.tool < .25 ? '#e8505b' : '#8fd16a'}"></i></span>`;
      else if (it.canteen) extra = `<span class="pips">${[...Array(it.canteen)].map((_, j) => `<i class="${j < s.d ? 'on' : ''}"></i>`).join('')}</span>`;
      el.innerHTML = `${ico(s.k)}${s.n > 1 ? `<span class="cnt">${s.n}</span>` : ''}${extra}`;
      el.setAttribute('aria-label', `${it.n} ${s.n}`);
    } else el.setAttribute('aria-label', 'Boş');
    if (onTap) el.onclick = () => onTap(i);
    return el;
  }

  renderBag() {
    const G = this.G, inv = G.inv;
    $('bagCap').textContent = `${inv.used()} / ${BAG_SLOTS}`;
    const box = $('bagSlots'); box.textContent = '';
    inv.slots.forEach((s, i) => box.appendChild(this.slotEl(s, i, { selected: i === this.sel, onTap: j => { this.sel = (this.sel === j || !inv.slots[j]) ? -1 : j; this.renderBag(); } })));
    const det = $('bagDetail'); det.textContent = '';
    const s = inv.slots[this.sel];
    if (!s) { det.innerHTML = '<p class="muted">Bir eşyaya dokun: ne işe yaradığını gör, ye, iç ya da bırak.</p>'; return; }
    const it = ITEMS[s.k];
    let info = it.d || '';
    if (it.food) info = `+${it.food.hu} tokluk${it.food.th ? `, +${it.food.th} su` : ''}${it.food.sick ? ` · Çiğ: %${Math.round(it.food.sick * 100)} hastalık riski` : ''}`;
    if (it.tool) info = `${it.d} · Dayanıklılık ${s.d}/${it.tool}`;
    if (it.canteen) info = `Su: ${s.d}/${it.canteen} yudum · Gölde dolar`;
    det.innerHTML = `<div class="dhead">${ico(s.k)}<div><b>${it.n}${s.n > 1 ? ` ×${s.n}` : ''}</b><small>${info}</small></div></div><div class="dbtns"></div>`;
    const btns = det.querySelector('.dbtns');
    const add = (txt, fn, primary) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (primary ? ' pri' : ''); b.textContent = txt; b.onclick = fn; btns.appendChild(b); };
    if (it.cook && G.nearLitFire(70)) add('Pişir', () => { G.cookSlot(this.sel); this.sel = -1; this.renderBag(); }, true);
    if (it.food) add('Ye', () => { G.eatSlot(this.sel); if (!inv.slots[this.sel]) this.sel = -1; this.renderBag(); }, !it.cook);
    if (it.canteen && s.d > 0) add('İç', () => { G.drinkSlot(this.sel); this.renderBag(); }, true);
    add('Yere bırak', () => { G.dropSlot(this.sel); this.sel = -1; this.renderBag(); });
  }

  renderCraft() {
    const G = this.G, box = $('recs'); box.textContent = '';
    for (const r of RECIPES) {
      const name = r.place ? STRUCT[r.place].n : ITEMS[r.out[0]].n + (r.out[1] > 1 ? ` ×${r.out[1]}` : '');
      const el = document.createElement('div'); el.className = 'rec';
      const costs = Object.entries(r.cost).map(([k, v]) => { const have = G.inv.count(k); return `<span class="${have >= v ? '' : 'no'}">${ico(k)}${have}/${v}</span>`; }).join('');
      el.innerHTML = `<div class="nm">${ICON[r.id] ? ico(r.id) : ico(r.out?.[0] || r.id)}${name}</div><div class="ds">${r.d}</div><div class="cost">${costs}</div>`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mk'; b.textContent = r.place ? 'Kur' : 'Yap';
      b.disabled = !G.inv.canAfford(r.cost);
      b.onclick = () => { if (G.craft(r.id) && r.place) this.close(); else this.renderCraft(); };
      el.appendChild(b); box.appendChild(el);
    }
  }

  renderChest() {
    const G = this.G, e = this.chest; if (!e) return this.close();
    const chestInv = new Inventory(e.slots.length, e.slots);
    const fill = (boxId, inv, other) => {
      const box = $(boxId); box.textContent = '';
      inv.slots.forEach((s, i) => box.appendChild(this.slotEl(s, i, { compact: true, onTap: j => {
        if (!moveSlot(inv, j, other)) { if (inv.slots[j]) this.toast('Yer yok'); }
        G.ui.changed(); this.renderChest();
      } })));
    };
    fill('chestSlots', chestInv, G.inv);
    fill('chestBagSlots', G.inv, chestInv);
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
    const goal = G.goal(); if (goal !== this.lastGoal) { this.lastGoal = goal; $('goalLbl').textContent = goal; }
    const tg = G.target, lbl = tg ? tg.lbl : '—';
    if (lbl !== this.lastAct) { this.lastAct = lbl; $('actLbl').textContent = lbl; }
    $('actBtn').classList.toggle('off', !tg || !!tg.locked);
    $('actBtn').classList.toggle('alert', !!(G.fishing && G.fishing.bite));
    if (this.dirty) { this.dirty = false; $('bagCount').textContent = `${G.inv.used()}/${BAG_SLOTS}`; if (this.sheet) this.renderSheet(); }
  }
}
