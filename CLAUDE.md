# Elli Ada — developer notes

Mobile-first 3D web game (three.js 0.170, vendored in `vendor/three`, no build step). Live: GitHub Pages from `main`.
Design doc: Claude Docs "Elli Ada — Oyun Tasarım Özeti". User speaks Turkish, plays on an Android phone.

## Layout
- `index.html` — canvas, HUD, importmap; bump `main.js?v=N` on every change (cache).
- `js/main.js` — renderer, lights, camera follow, loop, `?debug` (fps), `?lite` (half res, for software-GL tests), `window.__DEMO` test hook.
- `js/island.js` — continuous terrain (grid 0.5 m): coast field → height → 9 splat weights per vertex; trees; `heightAt`, `walkable`, `block`; land mask for the water shader (canvas row 0 = +z, CanvasTexture flips Y). Hex grid (pointy-top, tile 2 m) is game logic (`hexAt`, `hexCenter`).
- `js/ground.js` — ground material: MeshStandardMaterial + onBeforeCompile, DataArrayTexture colour 1024²×9 / normal 512²×9, anti-tiling, hex-line overlay (`material.grid(v)`, HUD button).
- `js/water.js` — sea ShaderMaterial (depth from blurred land mask, foam). Fog chunks must sit on their own lines.
- `js/hero.js` — Quaternius Adventurer, 1.75 m, Idle/Walk/Run blend.
- `js/input.js` — floating joystick (left 60 %), pinch zoom, WASD + Shift.

## Assets (all downloaded, not modelled in code)
- `assets/ground/` ambientCG (CC0) textures, layer index = file number, see SOURCES.txt.
- `assets/hex/` Kenney Hexagon Kit (CC0); only unit-tree and the ship are used now. `Textures/colormap.png` is recoloured: teal greens → natural green.
- `assets/hero/adventurer.glb`, `assets/buildings/barracks.glb` — Quaternius (CC0).

## Testing
Playwright + `/usr/bin/google-chrome --use-angle=swiftshader --enable-unsafe-swiftshader`, open `?debug&lite`, long timeouts (swiftshader is slow). Drive the hero via `__DEMO.input.auto = {x, y}`.
