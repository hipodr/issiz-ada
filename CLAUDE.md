# Elli Ada — developer notes

Mobile-first 3D web game (three.js 0.170, vendored in `vendor/three`, no build step). Live: GitHub Pages from `main`.
Design doc: Claude Docs "Elli Ada — Oyun Tasarım Özeti". User speaks Turkish, plays on an Android phone.

## Layout
- `index.html` — canvas, HUD, importmap; bump `main.js?v=N` on every change (cache).
- `js/main.js` — renderer, lights, camera follow, loop, `?debug` (fps), `?lite` (half res, for software-GL tests), `window.__DEMO` test hook.
- `js/island.js` — continuous terrain (grid 0.5 m): coast field → height → 9 splat weights per vertex; trees; `heightAt`, `walkable`, `block`; land mask for the water shader (canvas row 0 = +z, CanvasTexture flips Y). Hex grid (pointy-top, tile 2 m) is game logic (`hexAt`, `hexCenter`).
- `js/ground.js` — ground material: MeshStandardMaterial + onBeforeCompile, DataArrayTexture colour 1024²×9 / normal 512²×9, anti-tiling, hex-line overlay (`material.grid(v)`, HUD button).
- `js/nature.js` — vegetation/rocks/path stones from `assets/nature/nature.glb` (Quaternius Stylized Nature MegaKit, merged+deduped+512 webp+quantized with gltf-transform; leaf textures colour-bled). Rule-based scatter, InstancedMesh per 24 m chunk × model part; small props hidden beyond 45 m. Geometry is quantized: keep each node's matrix (`part.base`), never bake it (int16 clamps). Leaves: transparent + alphaTest .3 + depthWrite.
- `js/water.js` — sea ShaderMaterial (depth from blurred land mask, foam). Fog chunks must sit on their own lines.
- `js/hero.js` — captain (see assets), 1.78 m, Idle/Walk/Run blend, walk 1.6 m/s, run 3.5 m/s; `play(clip, hold)` one-shots over locomotion (🎬 test panel in index.html); idle close-up (dist < 5) turns to face the camera. Rendered on layer 1 only: main.js draws world, then a gold ghost (GreaterDepth) for hidden parts, then the captain; lights and the shadow camera have layer 1 enabled.
- Camera (main.js): dist 2.2–22 m, pitch/look height blend from eye level to ~47° overview; right-side drag orbits (`camYaw`), stick input is rotated by camYaw.
- `js/input.js` — floating joystick (left 60 %), pinch zoom, WASD + Shift.

## Assets (all downloaded, not modelled in code)
- `assets/ground/` ambientCG (CC0) textures, layer index = file number, see SOURCES.txt.
- `assets/hex/` Kenney Hexagon Kit (CC0); only unit-tree and the ship are used now. `Textures/colormap.png` is recoloured: teal greens → natural green.
- `assets/hero/adventurer.glb`, `assets/buildings/barracks.glb` — Quaternius (CC0).
- `assets/hero/captain.glb` — the user's own Avaturn avatar (v2: separate head/eyes; face blendshapes stripped to save 9 MB) (Mixamo-style rig: Hips, Spine, LeftArm…) with Adventurer clips retargeted offline (world-space rotation deltas against BIND poses from inverse bind matrices; GLTFLoader strips dots from names: `UpperArm.L` → `UpperArmL`), exported with GLTFExporter, textures 1024 webp. `?hero=adv` loads the Adventurer instead.

## Testing
Playwright + `/usr/bin/google-chrome --use-angle=swiftshader --enable-unsafe-swiftshader`, open `?debug&lite`, long timeouts (swiftshader is slow). Drive the hero via `__DEMO.input.auto = {x, y}`; teleport with `__DEMO.hero.obj.position.set()` + `__DEMO.camTarget.set()` (the camera lerp is slow under swiftshader).
