// Turns world objects into draw items for HeroGL (culling, transforms, wind, falling trees, canopy fade).
// Input : world2, hero, view rect {x0,y0,x1,y1} (world units), time (s) · Output: [{ name, x, y, M, wind, fade }]
import { M4 } from '../hero/model.js';
import { palmTop } from './models.js';

const S = s => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
/** rotation by angle a around the horizontal axis (ax, ay, 0) */
function axisRot(ax, ay, a) {
  const l = Math.hypot(ax, ay) || 1, x = ax / l, y = ay / l, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y, -s * y, 0, t * x * y, t * y * y + c, s * x, 0, s * y, -s * x, c, 0, 0, 0, 0, 1];
}

export function sceneItems(W, hero, view, time) {
  const out = [], { x0, y0, x1, y1 } = view;
  for (const o of W.list) {
    if (o.x < x0 - 60 || o.x > x1 + 60 || o.y < y0 - 20 || o.y > y1 + 150) continue;     // tall things reach up the screen
    if (o.stage === 'gone') continue;
    const base = M4.mul(M4.RZ(o.rot), S(o.s)), wind = [(o.shake || 0) * 5 + (o.k === 'tree' || o.k === 'palm' ? 1.1 : o.k === 'saz' ? 1.6 : .4), o.id * 1.37];
    const push = (name, M, extra = {}) => out.push({ name, x: o.x, y: o.y, M, wind, ...extra });
    if (o.k === 'tree' || o.k === 'palm') {
      if (o.stage === 'stump') { push('stump', base, { wind: null }); continue; }
      let M = base, s = o.s;
      if (o.stage === 'sapling') {
        if (o.g < .45) { push('sapling', M4.mul(M4.RZ(o.rot), S(o.s * (.6 + o.g))), {}); continue; }
        s = o.s * o.g; M = M4.mul(M4.RZ(o.rot), S(s));
      }
      if (o.stage === 'fall') {
        const u = Math.min(1, (time - o.fallT0) / 1.2), a = u * u * Math.PI / 2 * 1.02;
        M = M4.mul(axisRot(-Math.sin(o.fallDir), Math.cos(o.fallDir), a), M);
        push('stump', base, { wind: null });
      }
      // canopy fade: the hero walks north of the tree, inside the area its crown covers on screen
      const dy = o.y - hero.y, behind = dy > -4 && dy < 80 * s && Math.abs(hero.x - o.x) < 26 * s;
      if (o.k === 'tree') { push('tree' + o.v, M); push('treeTop' + o.v, M, { fade: behind && o.stage !== 'fall' ? .55 : 0 }); }
      else {
        const v = o.v % 2; push('palm' + v, M, { fade: behind && o.stage !== 'fall' ? .5 : 0 });
        if (o.fruit > 0 && o.stage === 'full') push('palmFruit', M4.mul(M, M4.T(...palmTop(v))));
      }
      continue;
    }
    if (o.k === 'bush') { const v = o.v % 2; push('bush' + v, base); if (o.ripe) push('berries' + v, base); continue; }
    if (o.k === 'saz') { push(o.ripe ? 'saz' : 'sazCut', base); continue; }
    if (o.k === 'rock') { push('rock' + o.v, base, { wind: null }); continue; }
    push(o.k, M4.RZ(o.rot), { wind: null });
  }
  return out;
}
