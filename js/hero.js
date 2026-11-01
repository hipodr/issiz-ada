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
  for (const n of ['Idle', 'Walk', 'Run']) { const c = clip(n); if (c) { act[n] = mixer.clipAction(c); act[n].play(); act[n].setEffectiveWeight(n === 'Idle' ? 1 : 0); } }
  // one-shot clip over the locomotion, weight managed by hand (no mixer fades): shot = { a: action, w: 0..1, hold, out }
  let yaw = 0, speed = 0, shot = null;
  // face: blink every few seconds (blendshapes kept in captain.glb: eyeBlinkLeft/Right, smile, jaw…)
  const faces = []; model.traverse(o => { if (o.morphTargetDictionary && o.morphTargetInfluences) faces.push(o); });
  let blinkT = 2, blink = 0;
  const setMorph = (name, v) => { for (const f of faces) { const i = f.morphTargetDictionary[name]; if (i !== undefined) f.morphTargetInfluences[i] = v; } };
  const hero = {
    obj, get speed() { return speed; }, anims: gl.animations.map(a => a.name.split('|').pop()),
    debug: () => ({ speed: +speed.toFixed(2), acts: mixer._actions.filter(a => a.isRunning() && a.getEffectiveWeight() > .01).map(a => a.getClip().name + ':' + a.getEffectiveWeight().toFixed(2)) }),
    // play a clip over the locomotion: once (hold = stay on the last frame, e.g. death) or looping (sitting, idles) until the stick moves
    play(name, hold = false, loop = false) {
      const c = clip(name); if (!c) return false;
      const w = shot ? shot.w : 0; if (shot) shot.a.stop();
      const a = mixer.clipAction(c); a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.setEffectiveWeight(w); a.play();
      shot = { a, w, hold, out: false };
      return true;
    },
    update(input, dt, walkable) {
      const m = Math.min(1, Math.hypot(input.x, input.y));
      if (shot) {
        const done = shot.a.loop === THREE.LoopOnce && shot.a.time >= shot.a.getClip().duration - .02;
        if (m >= .12 || (done && !shot.hold)) shot.out = true;                       // moving or finished → blend back to walking
        shot.w = Math.max(0, Math.min(1, shot.w + (shot.out ? -dt * 4 : dt * 6)));
        shot.a.setEffectiveWeight(shot.w);
        if (shot.out && shot.w <= 0) { shot.a.stop(); shot = null; }
      }
      const lw = shot ? 1 - shot.w : 1;
      const target = m < .12 ? 0 : m < .8 ? WALK * Math.min(1, (m - .12) / .5 + .3) : RUN;
      speed += Math.max(-14 * dt, Math.min(10 * dt, target - speed));
      if (m >= .12 || input.face !== undefined) {
        const want = m >= .12 ? Math.atan2(input.x, input.y) : input.face;               // face: idle close-up turns to the camera                                    // model faces +z; screen down = +z
        let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * (m >= .12 ? 12 : 3));
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
      if (act.Idle) act.Idle.setEffectiveWeight((1 - w) * lw);
      if (act.Walk) { act.Walk.setEffectiveWeight(w * (1 - r) * lw); act.Walk.timeScale = Math.max(.6, Math.min(1.3, speed / WALK)); }
      if (act.Run) { act.Run.setEffectiveWeight(r * lw); act.Run.timeScale = Math.max(.8, speed / RUN); }
      mixer.update(dt);
      if (!(shot && shot.a.getClip().name.startsWith('Avaturn'))) {                    // the Avaturn clip animates the face itself
        blinkT -= dt; if (blinkT < 0) { blink = .16; blinkT = 2 + Math.random() * 3.5; }
        blink = Math.max(0, blink - dt); const b = blink > 0 ? Math.sin((1 - blink / .16) * Math.PI) : 0;
        setMorph('eyeBlinkLeft', b); setMorph('eyeBlinkRight', b);
      }
    },
  };
  return hero;
}
