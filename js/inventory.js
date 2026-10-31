// Slot-based container used by the bag and by chests. No DOM.
// A slot is null or { k: itemId, n: count, d?: durability-or-water }
import { ITEMS, maxStack } from './data/items.js';

export class Inventory {
  constructor(size, slots = null) { this.slots = slots || Array(size).fill(null); }
  emptyOrder() { return [...this.slots.keys()]; }

  static stack(k, n = 1) {
    const it = ITEMS[k], s = { k, n };
    if (it.tool) s.d = it.tool;
    if (it.canteen) s.d = 0;
    return s;
  }

  count(k) { let c = 0; for (const s of this.slots) if (s && s.k === k) c += s.n; return c; }
  has(k) { return this.slots.some(s => s && s.k === k); }
  used() { return this.slots.filter(Boolean).length; }

  /** Add n of item k. Returns how many did NOT fit. */
  add(k, n) {
    const m = maxStack(k);
    for (const s of this.slots) if (n > 0 && s && s.k === k && s.n < m) { const a = Math.min(n, m - s.n); s.n += a; n -= a; }
    for (const i of this.emptyOrder(k)) { if (n <= 0) break; if (!this.slots[i]) { const a = Math.min(n, m); this.slots[i] = Inventory.stack(k, a); n -= a; } }
    return n;
  }

  /** Put an existing stack (keeps durability / water). Returns how many did NOT fit. */
  addStack(s) {
    if (maxStack(s.k) === 1) { const i = this.emptyOrder(s.k).find(j => !this.slots[j]); if (i === undefined) return s.n; this.slots[i] = s; return 0; }
    return this.add(s.k, s.n);
  }

  remove(k, n) {
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i]; if (!s || s.k !== k) continue;
      const a = Math.min(n, s.n); s.n -= a; n -= a; if (s.n <= 0) this.slots[i] = null;
    }
  }
  takeOne(i) { const s = this.slots[i]; if (!s) return; s.n--; if (s.n <= 0) this.slots[i] = null; }

  canAfford(cost) { return Object.entries(cost).every(([k, v]) => this.count(k) >= v); }
  pay(cost) { for (const [k, v] of Object.entries(cost)) this.remove(k, v); }

  /** Index of the best tool whose dmg[mat] > 0 (highest damage, then most worn), -1 if none. */
  toolFor(mat) {
    let best = -1, bd = 0;
    this.slots.forEach((s, i) => { const d = s && ITEMS[s.k].dmg?.[mat] || 0; if (d > bd || (d && d === bd && s.d < this.slots[best].d)) { best = i; bd = d; } });
    return best;
  }
  /** Index of the most worn tool of type k, -1 if none. */
  toolIndex(k) {
    let best = -1;
    this.slots.forEach((s, i) => { if (s && s.k === k && (best < 0 || s.d < this.slots[best].d)) best = i; });
    return best;
  }
  /** Use a tool once (the one in `slot` if given). Returns 'broke', 'ok' or null (no tool). */
  wear(k, slot) {
    const i = (slot !== undefined && this.slots[slot]?.k === k) ? slot : this.toolIndex(k); if (i < 0) return null;
    const s = this.slots[i]; s.d--;
    if (s.d <= 0) { this.slots[i] = null; return 'broke'; }
    return 'ok';
  }

  firstCookable() { return this.slots.findIndex(s => s && ITEMS[s.k].cook); }
}

/** Move slot i of `from` into `to`. Returns true if anything moved. */
export function moveSlot(from, i, to) {
  const s = from.slots[i]; if (!s) return false;
  if (maxStack(s.k) === 1) { if (to.addStack(s) === 0) { from.slots[i] = null; return true; } return false; }
  const left = to.add(s.k, s.n);
  const moved = left < s.n;
  if (left <= 0) from.slots[i] = null; else s.n = left;
  return moved;
}

/** Swap two slots inside one container. */
export function swapSlots(inv, a, b) { const t = inv.slots[a]; inv.slots[a] = inv.slots[b]; inv.slots[b] = t; }
