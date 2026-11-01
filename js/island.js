// Ada 1 (demo): an island built from small hexagon tiles (Kenney Hexagon Kit), drawn with instancing.
//
// Input : THREE, a GLTF loader, seed
// Process: hex grid (pointy-top, width S) → island mask (noisy radius + a landing bay in the south)
//          → tile type per cell (sand coast, grass, forest, hills, stone, mountain) + hand-placed spots (dock, camp, mine, village)
//          → one InstancedMesh per tile model, trees scattered as separate instances
// Output: { group, walkable(x, z), groundY, landMask(canvas), spawn, shipPos, bounds }
import * as THREE from 'three';

export const S = 2;                       // hex width in metres (pointy-top: depth = S·2/√3)
const ROW = S * Math.sqrt(3) / 2;         // row spacing
export const TOP = .2 * S;                // tile top surface (the tiles are 0.2 thick at width 1)

const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function noise1(a, seed) { let v = 0; for (let k = 1; k <= 4; k++) v += Math.sin(a * (k * 2 + 1) + seed * (k + .37) * 7.1) / k; return v; }

export const hexCenter = (col, row) => [(col + (row & 1) * .5) * S, row * ROW];
export function hexAt(x, z) {
  const r0 = Math.round(z / ROW); let best = null, bd = 1e9;
  for (let row = r0 - 1; row <= r0 + 1; row++) {
    const c0 = Math.round(x / S - (row & 1) * .5);
    for (let col = c0 - 1; col <= c0 + 1; col++) { const [cx, cz] = hexCenter(col, row), d = (cx - x) ** 2 + (cz - z) ** 2; if (d < bd) { bd = d; best = [col, row]; } }
  }
  return best;
}

// what each tile type uses: base model, vertical scale, walkable
const TYPES = {
  sand: { m: 'sand', walk: true }, sandRocks: { m: 'sand-rocks', walk: true },
  grass: { m: 'grass', walk: true }, forest: { m: 'grass', walk: true, trees: 3 },
  hill: { m: 'grass-hill', y: 2.2, walk: false }, stone: { m: 'stone', walk: true }, rocks: { m: 'stone-rocks', walk: true },
  stoneHill: { m: 'stone-hill', y: 2.2, walk: false }, mountain: { m: 'stone-mountain', y: 4.5, walk: false },
  dirt: { m: 'dirt', walk: true }, lumber: { m: 'dirt-lumber', walk: true },
  dock: { m: 'building-dock', walk: true, rot: 0 }, mine: { m: 'building-mine', y: 2, walk: false, rot: 0 },
  village: { m: 'building-village', y: 2, walk: false }, house: { m: 'building-house', y: 2, walk: false }, tower: { m: 'building-tower', y: 2, walk: false },
  cabin: { m: 'building-cabin', y: 2, walk: false },
};

export async function buildIsland(loader, seed = 11) {
  const R = rng(seed), group = new THREE.Group();
  const get = n => new Promise((res, rej) => loader.load(`assets/hex/${n}.glb`, g => { let mesh; g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; }); res(mesh); }, undefined, rej));

  // ---- 1. which cells are land ----
  const RAD = 25, cells = new Map(), key = (c, r) => c + ',' + r;
  for (let row = -RAD - 4; row <= RAD + 4; row++) for (let col = -RAD - 4; col <= RAD + 4; col++) {
    const [x, z] = hexCenter(col, row), a = Math.atan2(z, x), d = Math.hypot(x, z) / S;
    let rad = RAD * (.86 + .1 * noise1(a, seed) * .5 + .05 * Math.sin(a * 9 + seed));
    const bay = Math.exp(-((a - Math.PI / 2) ** 2) / .05);                    // landing bay, south (+z)
    rad -= bay * 7;
    if (d < rad) cells.set(key(col, row), { col, row, x, z, edge: rad - d });
  }
  // ---- 2. tile types ----
  const mtn = [10, -12], forest = [-11, -4], village = [-2, -19];
  for (const c of cells.values()) {
    const tx = c.x / S, tz = c.z / S;
    let t = 'grass';
    if (c.edge < 1.6) t = R() < .12 ? 'sandRocks' : 'sand';
    else {
      const dm = Math.hypot(tx - mtn[0], tz - mtn[1]) + noise1(Math.atan2(tz - mtn[1], tx - mtn[0]) * 2, seed + 3) * .8;
      const df = Math.hypot(tx - forest[0], tz - forest[1]) + noise1(Math.atan2(tz - forest[1], tx - forest[0]) * 2, seed + 5);
      if (dm < 2.2) t = 'mountain';
      else if (dm < 4.2) t = R() < .45 ? 'stoneHill' : 'rocks';
      else if (dm < 6.5) t = R() < .5 ? 'stone' : 'rocks';
      else if (df < 7.5) t = R() < .85 ? 'forest' : 'grass';
      else if (R() < .06) t = 'forest';
      else if (R() < .025) t = 'hill';
    }
    c.t = t;
  }
  // hand-placed spots (relative to the bay / centre)
  const at = (col, row, t) => { const c = cells.get(key(col, row)); if (c) c.t = t; return c; };
  // landing: the southernmost land cells of the bay become the beach + a dock reaching into the water
  let beach = null; for (const c of cells.values()) if (Math.abs(c.x) < S * 2 && (!beach || c.z > beach.z)) beach = c;
  const dockCell = at(beach.col, beach.row, 'dock');
  for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [1, 0], [-2, 0], [2, 0]]) { const c = cells.get(key(beach.col + dc, beach.row + dr)); if (c && c.t !== 'dock') c.t = 'sand'; }
  at(mtn[0] - 3, mtn[1] + 3, 'mine');
  for (const [dc, dr] of [[-1, 1], [0, 2], [-2, 2]]) at(mtn[0] - 3 + dc, mtn[1] + 3 + dr, 'dirt');
  at(forest[0] + 5, forest[1] + 3, 'lumber');
  at(village[0], village[1], 'village'); at(village[0] + 2, village[1] + 1, 'house'); at(village[0] - 2, village[1] + 1, 'house');
  at(village[0] + 1, village[1] - 2, 'tower'); at(village[0] - 1, village[1] + 3, 'cabin');
  for (const [dc, dr] of [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, 2]]) { const c = cells.get(key(village[0] + dc, village[1] + dr)); if (c && c.t === 'grass' || c && c.t === 'forest') c.t = 'dirt'; }

  // ---- 3. instanced meshes ----
  const byModel = new Map();
  const place = (m, x, y, z, rotY, sx, sy) => { if (!byModel.has(m)) byModel.set(m, []); byModel.get(m).push([x, y, z, rotY, sx, sy]); };
  for (const c of cells.values()) {
    const T = TYPES[c.t];
    place(T.m, c.x, 0, c.z, T.rot !== undefined ? T.rot : Math.floor(R() * 6) * Math.PI / 3, S, S * (T.y || 1));
    if (T.trees) for (let i = 0; i < T.trees; i++) {
      const a = R() * 6.28, d = R() * .55 * S * .5;
      place('unit-tree', c.x + Math.cos(a) * d, TOP, c.z + Math.sin(a) * d, R() * 6.28, S * (1.8 + R() * 1.0), S * (3 + R() * 2.2));
    }
  }
  for (let i = 0; i < 26; i++) {                                              // rocks in the shallows
    const a = R() * 6.28, d = (RAD * .95 + R() * 5) * S;
    const [col, row] = hexAt(Math.cos(a) * d, Math.sin(a) * d);
    if (!cells.has(key(col, row))) { const [x, z] = hexCenter(col, row); place('water-rocks', x, -.15, z, R() * 6.28, S, S); }
  }
  const dummy = new THREE.Object3D();
  for (const [m, list] of byModel) {
    const src = await get(m);
    const inst = new THREE.InstancedMesh(src.geometry, src.material, list.length);
    list.forEach(([x, y, z, ry, sxz, sy], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sxz, sy, sxz); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
    inst.castShadow = true; inst.receiveShadow = true;
    group.add(inst);
  }

  // ---- 4. walkability + a land mask for the water shader ----
  const blocked = new Set();
  const walkable = (x, z) => {
    const [col, row] = hexAt(x, z), c = cells.get(key(col, row));
    return !!c && TYPES[c.t].walk && !blocked.has(key(col, row));
  };
  const block = (x, z, r) => { for (const c of cells.values()) if (Math.hypot(c.x - x, c.z - z) < r) blocked.add(key(c.col, c.row)); };
  const W = 512, span = (RAD + 14) * S * 2, mask = document.createElement('canvas'); mask.width = mask.height = W;
  const g = mask.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, W); g.filter = 'blur(7px)'; g.fillStyle = '#fff';
  for (const c of cells.values()) { g.beginPath(); g.arc((c.x / span + .5) * W, (c.z / span + .5) * W, S / span * W * .62, 0, 7); g.fill(); }

  const shipPos = new THREE.Vector3(dockCell.x + S * .5, 0, dockCell.z + S * 6.5);
  const spawn = new THREE.Vector3(beach.x, TOP, beach.z - S * 2.2);
  const camp = new THREE.Vector3(beach.x - S * 4, TOP, beach.z - S * 6);
  return { group, walkable, block, mask, span, spawn, shipPos, dockCell, camp, cells, RAD };
}
