// The captain on the island map: animated model (captain.glb = user's Avaturn avatar with Quaternius clips retargeted) + movement.
// Input : loader, stick input {x, y} (−1..1, screen axes), dt, island.walkable
// Process: speed from stick length (walk / run), turn smoothly towards the stick direction, slide along blocked tiles,
//          cross-fade Idle ↔ Walk ↔ Run with the speed
// Output: hero.obj (THREE.Group at the feet), hero.update(input, dt, walkable)
import * as THREE from 'three';

export const WALK = 1.6, RUN = 3.5;                // m/s

export async function loadHero(loader, url = 'assets/hero/captain.glb', height = 1.78) {
  const gl = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const model = gl.scene;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  const box = new THREE.Box3().setFromObject(model), h = box.max.y - box.min.y;
  model.scale.setScalar(height / h); model.position.y = -box.min.y * height / h;
  const obj = new THREE.Group(); obj.add(model);
  const mixer = new THREE.AnimationMixer(model), clip = n => gl.animations.find(a => a.name.endsWith('|' + n) || a.name === n);
  const act = {};
  for (const n of ['Idle', 'Walk', 'Run', 'Wave']) { const c = clip(n); if (c) { act[n] = mixer.clipAction(c); act[n].play(); act[n].setEffectiveWeight(n === 'Idle' ? 1 : 0); } }
  let yaw = 0, speed = 0;
  const hero = {
    obj, get speed() { return speed; }, anims: gl.animations.map(a => a.name.split('|').pop()),
    update(input, dt, walkable) {
      const m = Math.min(1, Math.hypot(input.x, input.y));
      const target = m < .12 ? 0 : m < .8 ? WALK * Math.min(1, (m - .12) / .5 + .3) : RUN;
      speed += Math.max(-14 * dt, Math.min(10 * dt, target - speed));
      if (m >= .12) {
        const want = Math.atan2(input.x, input.y);                                    // model faces +z; screen down = +z
        let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 12);
      }
      if (speed > .05) {
        const dx = Math.sin(yaw) * speed * dt, dz = Math.cos(yaw) * speed * dt, p = obj.position, ok = (x, z) => walkable(x, z) && walkable(x + Math.sin(yaw) * .45, z + Math.cos(yaw) * .45);
        if (ok(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
        else if (ok(p.x + dx, p.z)) p.x += dx;
        else if (ok(p.x, p.z + dz)) p.z += dz;
        else speed *= .4;
      }
      obj.rotation.y = yaw;
      // blend weights: idle → walk → run
      const w = Math.min(1, speed / WALK), r = Math.max(0, Math.min(1, (speed - WALK) / (RUN - WALK)));
      if (act.Idle) act.Idle.setEffectiveWeight(1 - w);
      if (act.Walk) { act.Walk.setEffectiveWeight(w * (1 - r)); act.Walk.timeScale = Math.max(.6, Math.min(1.3, speed / WALK)); }
      if (act.Run) { act.Run.setEffectiveWeight(r); act.Run.timeScale = Math.max(.8, speed / RUN); }
      mixer.update(dt);
    },
  };
  return hero;
}
