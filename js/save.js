// Local save / load with versioning. Add a migration when SAVE_VERSION changes:
//   MIGRATIONS[oldVersion] = data => newShapeData
import { SAVE_KEY, SAVE_VERSION, BEST_KEY } from './config.js';

const MIGRATIONS = {
  3: d => ({ ...d, v: 4, hand: 0 }),   // v4: hotbar hand index; fires get cook slots via STRUCT.fire.fix
  4: d => { const { hand, ...r } = d; return { ...r, v: 5, eq: {} }; },   // v5: no hotbar, equipment slots
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
