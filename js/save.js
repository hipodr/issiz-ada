// Local save / load with versioning. Add a migration when SAVE_VERSION changes:
//   MIGRATIONS[oldVersion] = data => newShapeData
import { SAVE_KEY, SAVE_VERSION, BEST_KEY } from './config.js';

const MIGRATIONS = {
  3: d => ({ ...d, v: 4, hand: 0 }),   // v4: hotbar hand index; fires get cook slots via STRUCT.fire.fix
  4: d => { const { hand, ...r } = d; return { ...r, v: 5, eq: {} }; },   // v5: no hotbar, equipment slots
  7: d => ({ ...d, v: 8, res: [] }),   // v8: smooth hills replace plateaus; resource layout changed again
  8: d => ({ ...d, v: 9, res: [] }),   // v9: spawn moved off the summits → resource indices shifted
  6: d => ({ ...d, v: 7, res: [] }),   // v7: island has plateaus now; resource layout changed, so resource state resets
  5: d => ({ ...d, v: 6, home: null, s: { ...d.s, xp: Object.keys(d.done || {}).length * 20 + (d.s.day - 1) * 15 } }),   // v6: XP (estimated from progress), hut home
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export function writeSave(G) { store.set(SAVE_KEY, JSON.stringify(G.serialize())); }
export function readSave() {
  let d; try { d = JSON.parse(store.get(SAVE_KEY) || 'null'); } catch { return null; }
  return migrate(d);
}
export function migrate(d) {
  if (!d || typeof d.v !== 'number') return null;
  while (d.v < SAVE_VERSION) { const m = MIGRATIONS[d.v]; if (!m) return null; d = m(d); }
  return d.v === SAVE_VERSION ? d : null;
}
export const hasSave = () => !!readSave();
export const clearSave = () => store.del(SAVE_KEY);
export const getBest = () => +(store.get(BEST_KEY) || 0);
export const setBest = n => { if (n > getBest()) store.set(BEST_KEY, String(n)); };
