# Elli Ada — developer notes

Mobile-first 3D web game (three.js 0.170, vendored in `vendor/three`, no build step). Live: GitHub Pages from `main`.
Design doc: Claude Docs "Elli Ada — Oyun Tasarım Özeti". User speaks Turkish, plays on an Android phone.

## Layout
- `index.html` — canvas, HUD, importmap; bump `main.js?v=N` on every change (cache).
- `js/main.js` — renderer, lights, camera follow, loop, `?debug` (fps), `?lite` (half res, for software-GL tests), `window.__DEMO` test hook.
- `js/island.js` — pointy-top hex grid (tile 2 m), island generation from Kenney hex tiles (InstancedMesh per model), `walkable(x,z)`, land mask for the water shader.
- `js/water.js` — sea ShaderMaterial (depth from blurred land mask, foam). Fog chunks must sit on their own lines.
- `js/hero.js` — Quaternius Adventurer, 1.75 m, Idle/Walk/Run blend.
- `js/input.js` — floating joystick (left 60 %), pinch zoom, WASD + Shift.

## Assets (all downloaded, not modelled in code)
- `assets/hex/` Kenney Hexagon Kit (CC0). `Textures/colormap.png` is recoloured: teal greens → natural green.
- `assets/hero/adventurer.glb`, `assets/buildings/barracks.glb` — Quaternius (CC0).

## Testing
Playwright + `/usr/bin/google-chrome --use-angle=swiftshader --enable-unsafe-swiftshader`, open `?debug&lite`, long timeouts (swiftshader is slow). Drive the hero via `__DEMO.input.auto = {x, y}`.
