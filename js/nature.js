// Vegetation, rocks and the path stones, from the Quaternius Stylized Nature MegaKit (packed into assets/nature/nature.glb).
//
// Input : GLTF loader, island (heightAt, slopeAt, coast, forestAt, pathDist, path, regions, addSolid), seed, lite flag
// Process: rule-based scatter per kind (forest / meadow / foothills / beach / path), minimum spacing on a hash grid
//          → instances grouped in 24 m chunks (one InstancedMesh per chunk × model part) so the camera frustum culls them;
//          small props (grass, flowers, pebbles) are also hidden beyond FAR metres from the camera target
// Output: { group, update(target) }
import * as THREE from 'three';

const CHUNK = 24, FAR = 45;
// model units ≈ metres; trees are scaled down so the top-down camera still sees the captain
const KINDS = {
  tree:   { m: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'], s: [.65, .9], solid: .45, shadow: true },
  pine:   { m: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'], s: [.7, .95], solid: .4, shadow: true },
  dead:   { m: ['DeadTree_1', 'DeadTree_2'], s: [.3, .42], solid: .35, shadow: true },
  twist:  { m: ['TwistedTree_5'], s: [.42, .5], solid: .7, shadow: true },
  bush:   { m: ['Bush_Common', 'Bush_Common_Flowers'], s: [.55, .85], shadow: true },
  grass:  { m: ['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall'], s: [.35, .55], small: true },
  fern:   { m: ['Fern_1'], s: [.16, .24], small: true },
  plant:  { m: ['Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big', 'Clover_1', 'Clover_2'], s: [.3, .5], small: true },
  flower: { m: ['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single', 'Flower_4_Single'], s: [.22, .32], small: true },
  mush:   { m: ['Mushroom_Common', 'Mushroom_Laetiporus'], s: [.4, .6], small: true },
  rock:   { m: ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], s: [.35, 1.1], solidRock: true, shadow: true },
  pebble: { m: ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5', 'Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3', 'Pebble_Square_4', 'Pebble_Square_5', 'Pebble_Square_6'], s: [1, 1.8], small: true },
  stone:  { m: ['RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Small_3', 'RockPath_Round_Thin', 'RockPath_Round_Wide'], s: [.55, .75], small: true, flat: true },
};

export async function buildNature(loader, island, seed = 7, lite = false) {
  const gl = await new Promise((res, rej) => loader.load('assets/nature/nature.glb', res, undefined, rej));
  gl.scene.updateMatrixWorld(true);
  const parts = {};                                                                   // model name → [{ geometry, material }]
  gl.scene.traverse(o => {
    if (!o.isMesh) return;
    let n = o; while (n.parent && !KINDS_NAMES.has(n.name)) n = n.parent;
    if (!KINDS_NAMES.has(n.name)) return;
    const m = o.material;
    if (m.transparent || /Leaves|Leaf|Flowers/.test(m.name)) { m.transparent = true; m.depthWrite = true; m.alphaTest = .3; m.side = THREE.DoubleSide; }   // soft blended leaves; alphaTest also shapes the shadows
    if (/Grass/.test(m.name)) m.side = THREE.DoubleSide;
    (parts[n.name] ||= []).push({ geometry: o.geometry, material: m, base: o.matrixWorld.clone() });   // geometry is quantized: keep the node transform, don't bake it
  });

  // ---- scatter ----
  let sd = seed; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const taken = new Map();                                                            // spacing grid (1 m cells) → radius used
  const free = (x, z, r) => { for (let a = Math.floor(x - r); a <= x + r; a++) for (let b = Math.floor(z - r); b <= z + r; b++) { const t = taken.get(a + ',' + b); if (t && Math.hypot(a + .5 - x, b + .5 - z) < (r + t) / 2) return false; } return true; };
  const take = (x, z, r) => taken.set(Math.floor(x) + ',' + Math.floor(z), Math.max(r, taken.get(Math.floor(x) + ',' + Math.floor(z)) || 0));
  const placed = Object.fromEntries(Object.keys(KINDS).map(k => [k, []]));
  const { heightAt, slopeAt, coast, forestAt, pathDist, MTN, VILLAGE, CAMP } = island, L = island.RAD * 2 + 4;
  const near = (x, z, p, r) => Math.hypot(x - p[0], z - p[1]) < r;
  const put = (k, x, z, space, extra = {}) => {
    if (!free(x, z, space)) return false;
    const K = KINDS[k], s = K.s[0] + R() * (K.s[1] - K.s[0]);
    placed[k].push({ m: K.m[Math.floor(R() * K.m.length)], x, y: heightAt(x, z), z, r: R() * 6.283, s, ...extra });
    if (!K.small) take(x, z, space);
    if (K.solid) island.addSolid(x, z, K.solid * (s / K.s[1]) + .1);
    if (K.solidRock && s > .6) island.addSolid(x, z, s * .9);
    return true;
  };
  const dens = lite ? .55 : 1;
  for (let i = 0; i < 26000 * dens; i++) {
    const x = (R() * 2 - 1) * L, z = (R() * 2 - 1) * L, e = coast(x, z);
    if (e < -1) continue;
    const h = heightAt(x, z), sl = slopeAt(x, z), f = forestAt(x, z), pd = pathDist(x, z), dm = Math.hypot(x - MTN[0], z - MTN[1]);
    const open = !near(x, z, CAMP, 9) && !near(x, z, VILLAGE, 8);
    const u = R();
    if (e < 3.5) {                                                                     // beach
      if (u < .05) put('pebble', x, z, .3); else if (u < .058 && e > .5) put('rock', x, z, 1.5); else if (u < .0605 && e > 1.5 && open) put('dead', x, z, 3);
      continue;
    }
    if (pd < 1.6 || sl > .75) { if (sl > .5 && u < .02) put('rock', x, z, 1.4); continue; }
    if (dm < 26 && h > 2) {                                                            // mountain foothills
      if (h < 9 && sl < .5 && u < .08) put('pine', x, z, 2.6);
      else if (u < .12) put('rock', x, z, 1.4);
      else if (u < .14 && h < 6) put('dead', x, z, 3);
      else if (u < .2) put('grass', x, z, .5);
      continue;
    }
    if (f < 17 && open) {                                                              // forest
      if (u < .2) put(R() < .78 ? 'tree' : 'pine', x, z, 2.8);
      else if (u < .3) put('fern', x, z, .9);
      else if (u < .36) put('bush', x, z, 1.2);
      else if (u < .45) put('plant', x, z, .6);
      else if (u < .48) put('mush', x, z, .4);
      else if (u < .62) put('grass', x, z, .4);
      continue;
    }
    // meadow
    if (!open) { if (u < .04) put('grass', x, z, .5); else if (u < .05) put('flower', x, z, .5); continue; }
    if (u < .012) put('tree', x, z, 3);
    else if (u < .016) put('pine', x, z, 3);
    else if (u < .026) put('bush', x, z, 1.4);
    else if (u < .19) put('grass', x, z, .45);
    else if (u < .23) put('flower', x, z, .5);
    else if (u < .25) put('plant', x, z, .5);
    else if (u < .256) put('rock', x, z, 1.5);
  }
  // landmarks: two old twisted trees, at the camp and halfway to the village
  for (const [x, z] of [[CAMP[0] - 7, CAMP[1] - 3], [VILLAGE[0] + 9, VILLAGE[1] + 10]]) put('twist', x, z, 1);
  // path stones
  island.path.forEach(([x, z], i) => { if (i % 2 === 0 && coast(x, z) > 1.5) put('stone', x + (R() - .5) * .5, z + (R() - .5) * .5, 0); });

  // ---- instancing by chunk ----
  const group = new THREE.Group(), smalls = [], dummy = new THREE.Object3D();
  for (const [k, list] of Object.entries(placed)) {
    const K = KINDS[k], byChunk = new Map();
    for (const p of list) { const c = Math.floor(p.x / CHUNK) + ',' + Math.floor(p.z / CHUNK) + ',' + p.m; (byChunk.get(c) || byChunk.set(c, []).get(c)).push(p); }
    for (const [c, ps] of byChunk) {
      const model = ps[0].m;
      for (const part of parts[model] || []) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, ps.length);
        ps.forEach((p, i) => { dummy.position.set(p.x, p.y - (K.flat ? .02 : .08 * p.s), p.z); dummy.rotation.set(0, p.r, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix.multiply(part.base)); });
        inst.castShadow = !!K.shadow; inst.receiveShadow = true;
        inst.computeBoundingSphere();
        group.add(inst);
        if (K.small) { const [cx, cz] = c.split(',').map(Number); smalls.push({ inst, x: (cx + .5) * CHUNK, z: (cz + .5) * CHUNK }); }
      }
    }
  }
  const counts = Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, v.length]));
  return { group, counts, update(t) { for (const s of smalls) s.inst.visible = Math.hypot(s.x - t.x, s.z - t.z) < FAR; } };
}
const KINDS_NAMES = new Set(Object.values(KINDS).flatMap(k => k.m));
