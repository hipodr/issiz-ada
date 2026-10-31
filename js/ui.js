// DOM side: HUD, the single action button, bag sheet (equipment doll + bag grid + craft tab),
// chest and fire sheets, drag & drop, tooltips, toasts.
// Implements the `ui` interface Game calls: toast, bump, changed, vibrate, openChest, openFire, over.
import { BAG_SLOTS, FIRE_MAX, COOK_TIME, BURN_TIME } from './config.js';
import { ITEMS } from './data/items.js';
import { RECIPES, CATS } from './data/recipes.js';
import { STRUCT } from './data/structures.js';
import { EQUIP_SLOTS, STATS } from './data/equipment.js';
import { ICON, ico } from './data/icons.js';
import { Inventory, moveSlot, swapSlots } from './inventory.js';
import { levelOf } from './game.js';
import { maxStack } from './data/items.js';

const $ = id => document.getElementById(id);
const SHEETS = ['bag', 'craft', 'chest', 'fire'];
export const PAUSING = new Set(['bag', 'craft', 'chest']);   // the fire sheet keeps time running so food cooks

export class UI {
  constructor({ onOver }) {
    this.G = null; this.sheet = null; this.sel = null; this.ent = null; this.drag = null;
    this.dirty = true; this.hudT = 0; this.onOver = onOver; this.last = {};
    $('bagBtn').onclick = () => this.open('bag');
    $('craftBtn').onclick = () => this.open('craft');
    for (const id of SHEETS) $(id + 'Close').onclick = () => this.close();
    $('scrim').onclick = () => this.close();
    $('woodBtn').onclick = () => { if (this.ent) this.G.fireAddWood(this.ent); };
    document.addEventListener('pointerdown', e => { if (!$('tip').hidden && !e.target.closest('#tip,[data-tip]')) this.hideTip(); }, true);
    this.setupDrag();
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
  levelUp(lvl, unlocked) {
    const b = $('banner');
    b.innerHTML = `<b>Seviye ${lvl}!</b>${unlocked.length ? `<span>Yeni: ${unlocked.join(', ')}</span>` : ''}`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), 3200);
    this.vibrate([40, 60, 40]);
  }
  sleep(day) {
    const f = $('fade'); f.hidden = false; f.textContent = `${day}. gün`; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    clearTimeout(this._ft); this._ft = setTimeout(() => { f.hidden = true; }, 2200);
  }

  // ---- sheets ----
  open(name, keepEnt) {
    if (!this.G || this.G.dead) return;
    const ent = keepEnt ? this.ent : null;
    this.close(); this.ent = ent; this.sheet = name; this.sel = null;
    this.input?.release();
    $(name).hidden = false; $('scrim').hidden = !PAUSING.has(name); this.renderSheet();
  }
  close() {
    this.sheet = null; this.ent = null; this.sel = null; this.hideTip(); this.endDrag();
    for (const id of [...SHEETS, 'scrim']) $(id).hidden = true;
  }
  renderSheet() {
    if (this.drag) return;               // never rebuild under a finger
    if (this.sheet === 'bag') this.renderInv();
    else if (this.sheet === 'craft') this.renderCraft();
    else if (this.sheet === 'chest') this.renderChest();
    else if (this.sheet === 'fire') this.renderFire();
  }

  // ---- tooltips ----
  tipHTML(k) {
    const it = ITEMS[k]; if (!it) return '';
    const f = it.food, lines = [];
    if (it.d) lines.push(it.d);
    if (f) lines.push(`+${f.hu} tokluk${f.th ? ` · +${f.th} su` : ''}${f.sick ? ` · %${Math.round(f.sick * 100)} hastalık riski` : ''}`);
    if (it.melee) lines.push(`Saldırı ${it.melee}`);
    for (const [s, v] of Object.entries(it.equip?.stats || {})) lines.push(`${STATS[s].n} ${STATS[s].fmt(v)}`);
    if (it.equip) lines.push(`Takılır: ${EQUIP_SLOTS.find(e => e.id === it.equip.slot).n}`);
    if (it.tool) lines.push(`${it.tool} kullanımda kırılır`);
    if (it.heal) lines.push(`+${it.heal} sağlık`);
    return `<div class="th">${ico(k)}<b>${it.n}</b></div>${lines.map(l => `<p>${l}</p>`).join('')}${it.src ? `<p class="src">Nereden: ${it.src}</p>` : ''}`;
  }
  showTip(k, el) {
    const tip = $('tip'); tip.innerHTML = this.tipHTML(k); tip.hidden = false;
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = (r.top - h - 8 > 10 ? r.top - h - 8 : r.bottom + 8) + 'px';
    clearTimeout(this._tipT); this._tipT = setTimeout(() => this.hideTip(), 4000);
  }
  hideTip() { $('tip').hidden = true; }

  // ---- slot element shared by every grid ----
  slotEl(s, { src, i, selected = false, compact = false, label = '', onTap } = {}) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'slot' + (s ? '' : ' empty') + (selected ? ' sel' : '') + (compact ? ' compact' : '');
    if (src) { el.dataset.src = src; el.dataset.i = i; }
    if (s) {
      const it = ITEMS[s.k];
      let extra = '';
      if (it.tool) extra = `<span class="dur"><i style="width:${(s.d / it.tool * 100).toFixed(0)}%;background:${s.d / it.tool < .25 ? '#e8505b' : '#8fd16a'}"></i></span>`;
      else if (it.canteen) extra = `<span class="pips">${[...Array(it.canteen)].map((_, j) => `<i class="${j < s.d ? 'on' : ''}"></i>`).join('')}</span>`;
      el.innerHTML = `${ico(s.k)}${s.n > 1 ? `<span class="cnt">${s.n}</span>` : ''}${extra}`;
      el.setAttribute('aria-label', `${it.n} ${s.n}`);
    } else {
      if (label) el.innerHTML = `<span class="lbl">${label}</span>`;
      el.setAttribute('aria-label', label || 'Boş');
    }
    if (onTap) el.onclick = () => { if (this.justDragged) return; onTap(i, el); };
    return el;
  }

  // ---- bag tab: equipment doll + bag grid + details ----
  heroSVG() {
    const eq = this.G.eq, on = k => !!eq[k];
    return `<svg viewBox="0 0 80 120" aria-hidden="true">
      <ellipse cx="40" cy="114" rx="22" ry="4" fill="rgba(0,0,0,.25)"/>
      <rect x="31" y="78" width="7" height="30" rx="3" fill="${on('feet') ? '#5a3e24' : '#4a3a2c'}"/><rect x="42" y="78" width="7" height="30" rx="3" fill="${on('feet') ? '#5a3e24' : '#4a3a2c'}"/>
      ${on('feet') ? '<rect x="28" y="102" width="12" height="8" rx="3" fill="#7a5634"/><rect x="40" y="102" width="12" height="8" rx="3" fill="#7a5634"/>' : ''}
      <rect x="26" y="44" width="28" height="38" rx="12" fill="#e86a3a"/>
      ${on('body') ? '<path d="M27 50h10v32h-6a5 5 0 0 1-4-5zM43 50h10v27a5 5 0 0 1-4 5h-6z" fill="#9a7a52"/>' : ''}
      <rect x="18" y="48" width="8" height="26" rx="4" fill="#f0c49a"/><rect x="54" y="48" width="8" height="26" rx="4" fill="#f0c49a"/>
      <circle cx="40" cy="30" r="14" fill="#f0c49a"/><path d="M26 28a14 14 0 0 1 28 0c-4-4-9-6-14-6s-10 2-14 6z" fill="#3a2a1e"/>
      <circle cx="35" cy="31" r="1.6" fill="#2a1d14"/><circle cx="45" cy="31" r="1.6" fill="#2a1d14"/>
      ${on('head') ? '<ellipse cx="40" cy="20" rx="22" ry="5" fill="#e2c26b"/><path d="M29 20c0-8 5-12 11-12s11 4 11 12z" fill="#ecd38a"/><path d="M29.5 17h21" stroke="#c0503a" stroke-width="2.4"/>' : ''}
      ${on('weapon') ? `<g transform="translate(6 40) scale(1.1)">${ICON[eq.weapon.k]}</g>` : ''}
      ${on('shield') ? '<g transform="translate(52 52) scale(1.05)">' + ICON.shield + '</g>' : ''}
    </svg>`;
  }

  renderInv() {
    const G = this.G, inv = G.inv;
    for (const side of ['left', 'right']) {
      const col = $(side === 'left' ? 'eqLeft' : 'eqRight'); col.textContent = '';
      for (const es of EQUIP_SLOTS.filter(e => e.side === side)) {
        const el = this.slotEl(G.eq[es.id], { src: 'eq', i: es.id, label: es.n, selected: this.sel?.src === 'eq' && this.sel.i === es.id,
          onTap: id => { this.sel = G.eq[id] && !(this.sel?.src === 'eq' && this.sel.i === id) ? { src: 'eq', i: id } : null; this.renderInv(); } });
        el.classList.add('eqslot'); col.appendChild(el);
      }
    }
    $('hero').innerHTML = this.heroSVG();
    const st = G.st;
    $('statLine').innerHTML = Object.entries(STATS).filter(([k]) => st[k]).map(([k, d]) => `<span>${d.n} <b>${d.fmt(st[k])}</b></span>`).join('') || '<span>Ekipman yok</span>';
    $('bagCap').textContent = `${inv.used()} / ${BAG_SLOTS}`;
    const box = $('bagSlots'); box.textContent = '';
    inv.slots.forEach((s, i) => box.appendChild(this.slotEl(s, { src: 'bag', i, selected: this.sel?.src === 'bag' && this.sel.i === i,
      onTap: j => { this.sel = inv.slots[j] && !(this.sel?.src === 'bag' && this.sel.i === j) ? { src: 'bag', i: j } : null; this.renderInv(); } })));
    this.renderDetail();
  }

  renderDetail() {
    const G = this.G, det = $('bagDetail'); det.textContent = '';
    const s = this.sel && (this.sel.src === 'eq' ? G.eq[this.sel.i] : G.inv.slots[this.sel.i]);
    if (!s) { det.innerHTML = '<p class="muted">Bir eşyaya dokun: açıklamasını gör. Basılı tutup sürükle: taşı ya da kahramana tak.</p>'; return; }
    const it = ITEMS[s.k];
    det.innerHTML = this.tipHTML(s.k).replace('<div class="th">', '<div class="th lg">') + '<div class="dbtns"></div>';
    const th = det.querySelector('.th');
    if (it.tool) th.insertAdjacentHTML('beforeend', `<small>Dayanıklılık ${s.d}/${it.tool}</small>`);
    if (it.canteen) th.insertAdjacentHTML('beforeend', `<small>Su ${s.d}/${it.canteen} yudum</small>`);
    const btns = det.querySelector('.dbtns');
    const add = (txt, fn, primary) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (primary ? ' pri' : ''); b.textContent = txt; b.onclick = () => { fn(); this.renderInv(); }; btns.appendChild(b); };
    if (this.sel.src === 'eq') { add('Çıkar', () => { G.unequip(this.sel.i); this.sel = null; }, true); return; }
    const i = this.sel.i;
    if (it.food) add('Ye', () => { G.eatSlot(i); if (!G.inv.slots[i]) this.sel = null; }, true);
    if (it.canteen && s.d > 0) add('İç', () => G.drinkSlot(i), true);
    if (it.heal) add('Kullan', () => { G.healSlot(i); if (!G.inv.slots[i]) this.sel = null; }, true);
    if (it.equip) add('Kuşan', () => { G.equipFromBag(i); this.sel = { src: 'eq', i: it.equip.slot }; }, true);
    add('Yere bırak', () => { G.dropSlot(i); this.sel = null; });
  }

  // ---- drag & drop (bag ↔ bag, bag ↔ equipment) ----
  setupDrag() {
    const root = $('tabInv');
    root.addEventListener('pointerdown', e => {
      const el = e.target.closest('.slot[data-src]'); if (!el || el.classList.contains('empty')) return;
      this.drag = { el, src: el.dataset.src, i: el.dataset.src === 'bag' ? +el.dataset.i : el.dataset.i, x0: e.clientX, y0: e.clientY, on: false, id: e.pointerId };
    });
    window.addEventListener('pointermove', e => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
        d.on = true; this.hideTip();
        const g = $('ghost'); g.innerHTML = d.el.querySelector('.ico')?.outerHTML || ''; g.hidden = false;
        d.el.classList.add('dragging');
      }
      e.preventDefault();
      const g = $('ghost'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px';
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot[data-src]');
      document.querySelectorAll('.slot.drop').forEach(x => x.classList.remove('drop'));
      if (over && over !== d.el && this.canDrop(d, over)) over.classList.add('drop');
    }, { passive: false });
    const finish = e => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      if (d.on) {
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot[data-src]');
        if (over && over !== d.el && this.canDrop(d, over)) this.doDrop(d, over);
        this.justDragged = true; setTimeout(() => { this.justDragged = false; }, 50);
      }
      this.endDrag(); if (d.on) this.renderInv();
    };
    window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  }
  endDrag() {
    if (this.drag?.el) this.drag.el.classList.remove('dragging');
    this.drag = null; $('ghost').hidden = true;
    document.querySelectorAll('.slot.drop').forEach(x => x.classList.remove('drop'));
  }
  stackOf(src, i) { return src === 'eq' ? this.G.eq[i] : this.G.inv.slots[i]; }
  canDrop(d, over) {
    const s = this.stackOf(d.src, d.i), to = over.dataset.src, ti = to === 'bag' ? +over.dataset.i : over.dataset.i;
    if (!s) return false;
    if (to === 'eq') return d.src === 'bag' && ITEMS[s.k].equip?.slot === ti;
    if (d.src === 'eq') { const o = this.G.inv.slots[ti]; return !o || ITEMS[o.k].equip?.slot === d.i; }
    return true;
  }
  doDrop(d, over) {
    const G = this.G, to = over.dataset.src, ti = to === 'bag' ? +over.dataset.i : over.dataset.i;
    if (to === 'eq') { G.equipFromBag(d.i); this.sel = { src: 'eq', i: ti }; }
    else if (d.src === 'eq') { G.unequip(d.i, ti); this.sel = { src: 'bag', i: ti }; }
    else {
      const a = G.inv.slots[d.i], b = G.inv.slots[ti];
      if (b && a.k === b.k && maxStack(a.k) > 1) { const mv = Math.min(a.n, maxStack(a.k) - b.n); b.n += mv; a.n -= mv; if (a.n <= 0) G.inv.slots[d.i] = null; }
      else swapSlots(G.inv, d.i, ti);
      this.sel = { src: 'bag', i: ti };
    }
    G.ui.changed(); this.vibrate(15);
  }

  // ---- craft sheet ----
  renderCraft() {
    const G = this.G, box = $('recs'); box.textContent = '';
    const L = levelOf(G.S.xp);
    $('craftLvl').innerHTML = `<b>Seviye ${L.lvl}</b><span class="bar xp"><i style="width:${(L.cur / L.need * 100).toFixed(1)}%"></i></span><small>${L.need - L.cur} XP sonra seviye ${L.lvl + 1}</small>`;
    for (const cat of CATS) {
      const list = RECIPES.filter(r => r.cat === cat); if (!list.length) continue;
      box.insertAdjacentHTML('beforeend', `<div class="sec">${cat}</div>`);
      for (const r of list) {
        const outK = r.out?.[0], name = r.place ? STRUCT[r.place].n : ITEMS[outK].n + (r.out[1] > 1 ? ` ×${r.out[1]}` : '');
        const lockedLvl = (r.lvl || 1) > L.lvl;
        const el = document.createElement('div'); el.className = 'rec' + (lockedLvl ? ' locked' : '');
        const costs = Object.entries(r.cost).map(([k, v]) => { const have = G.inv.count(k); return `<button type="button" data-tip="${k}" class="${have >= v ? '' : 'no'}">${ico(k)}<span>${ITEMS[k].n}</span> ${have}/${v}</button>`; }).join('');
        el.innerHTML = `<div class="nm"${outK ? ` data-tip="${outK}"` : ''}>${ICON[r.id] ? ico(r.id) : ico(outK)}${name}</div><div class="ds">${r.d}</div><div class="cost">${costs}</div>`;
        el.querySelectorAll('[data-tip]').forEach(b => b.onclick = () => this.showTip(b.dataset.tip, b));
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mk'; b.textContent = lockedLvl ? `Sv ${r.lvl}` : r.place ? 'Kur' : 'Yap';
        b.disabled = lockedLvl || !G.inv.canAfford(r.cost);
        b.onclick = () => { if (G.craft(r.id) && r.place) this.close(); else this.renderCraft(); };
        el.appendChild(b); box.appendChild(el);
      }
    }
  }

  // ---- chest ----
  renderChest() {
    const G = this.G, e = this.ent; if (!e) return this.close();
    const chestInv = new Inventory(e.slots.length, e.slots);
    const fill = (boxId, inv, other) => {
      const box = $(boxId); box.textContent = '';
      inv.slots.forEach((s, i) => box.appendChild(this.slotEl(s, { i, compact: true, onTap: j => {
        if (!moveSlot(inv, j, other) && inv.slots[j]) this.toast('Yer yok');
        G.ui.changed(); this.renderChest();
      } })));
    };
    fill('chestSlots', chestInv, G.inv);
    fill('chestBagSlots', G.inv, chestInv);
  }

  // ---- campfire ----
  renderFire() {
    const G = this.G, e = this.ent; if (!e) return this.close();
    $('woodBtn').textContent = `Odun at · +60 sn (${G.inv.count('wood')} odun)`;
    $('woodBtn').disabled = !G.inv.count('wood') || e.fuel >= FIRE_MAX - 5;
    const cs = $('cookSlots'); cs.textContent = '';
    this.cookBars = [];
    e.cook.forEach((c, i) => {
      const el = this.slotEl(c ? { k: c.k, n: 1 } : null, { i, onTap: j => { if (e.cook[j]) G.fireTake(e, j); this.renderFire(); } });
      el.classList.add('cook');
      if (c) el.insertAdjacentHTML('beforeend', `<span class="state ${c.st}"></span><span class="prog"><i></i></span>`);
      this.cookBars.push(el); cs.appendChild(el);
    });
    const raw = $('rawSlots'); raw.textContent = '';
    const list = G.inv.slots.map((s, i) => [s, i]).filter(([s]) => s && ITEMS[s.k].cook);
    if (!list.length) raw.innerHTML = '<p class="muted">Çantanda çiğ yiyecek yok. Balık tut ya da tavşan avla.</p>';
    for (const [s, i] of list) raw.appendChild(this.slotEl(s, { i, onTap: j => { G.firePut(e, j); this.renderFire(); } }));
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
    const L = levelOf(S.xp); $('lvLbl').textContent = `Sv ${L.lvl}`; $('bXp').style.width = (L.cur / L.need * 100).toFixed(1) + '%';
    $('dayLbl').textContent = S.day + '. gün'; $('todLbl').textContent = G.timeOfDay();
    const goal = G.goal(); if (goal !== this.last.goal) { this.last.goal = goal; $('goalLbl').textContent = goal; }

    const a = G.action, lbl = a ? a.lbl : '', icon = a?.tool || (a ? ({ gather: 'hand', ent: ICON[a.o?.k] ? a.o.k : 'hand', pond: 'canteen' })[a.type] || '' : '');
    if (lbl !== this.last.lbl || icon !== this.last.icon) {
      this.last.lbl = lbl; this.last.icon = icon;
      $('actLbl').textContent = lbl || 'Keşfet';
      $('actIco').innerHTML = icon ? ico(icon) : '';
    }
    $('actBtn').classList.toggle('off', !a || !!a.locked);
    $('actBtn').classList.toggle('alert', !!(G.fishing && G.fishing.bite));

    this.tickFire();
    if (this.dirty) {
      this.dirty = false;
      $('bagCount').textContent = G.inv.used();
      if (this.sheet) this.renderSheet();
    }
  }
}
