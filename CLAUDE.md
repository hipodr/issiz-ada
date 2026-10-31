# Issız Ada — developer notes

2D top-down island survival game for phones. Plain ES modules, no build step, hosted on GitHub Pages
(https://hipodr.github.io/issiz-ada/). UI text is Turkish. The owner tests on an Android phone only.

## Layout
```
index.html            DOM skeleton (HUD, sheets, menus) + <script type=module src=js/main.js>
css/style.css         all styles
js/config.js          tuning knobs: map size, day length, rates, bag size, save version
js/util.js            pure math, seeded RNG, noise
js/data/              DATA-DRIVEN CONTENT — most new features start here
  items.js            carryable items (food, tools w/ durability, canteen…)
  recipes.js          crafting list (out → bag, place → structure)
  resources.js        harvestable world objects + their draw()
  structures.js       placed things saved in full (fire, chest, drop) + draw()/interact()
  animals.js          species + draw(); AI lives in game.js updateAnimals()
  icons.js            inline SVG per item/recipe id
js/world.js           island generation + spatial grid (near/blocked/addEnt)
js/inventory.js       slot container (bag + chests), tool wear, moveSlot
js/game.js            ALL rules: movement, survival, targeting, actions, crafting, fishing, hunting, save shape
js/render/            renderer.js (canvas) + shapes.js helpers
js/ui.js              HUD + bag/craft/chest sheets; implements the ui interface Game calls
js/input.js           touch joystick, action button, keyboard
js/save.js            localStorage save with version + MIGRATIONS
js/main.js            boot, loop, menu/play/over state
tools/smoke.mjs       headless test of the real game logic + one render pass
```

## Rules of the codebase
- `game.js` never touches the DOM. It talks to the screen only via `this.ui` (toast, bump, changed, vibrate, openChest, over).
- Renderer only reads state.
- Resources are regenerated from the seed on load; only their state is saved (index-stable → don't reorder spawn tables casually).
  Structures/drops are saved in full.
- Changing the save shape: bump `SAVE_VERSION` in config.js and add a `MIGRATIONS[old]` in save.js.
- Every item needs an icon in icons.js (smoke test checks this).

## How to add…
- **Item**: entry in `data/items.js` + icon in `data/icons.js`.
- **Recipe**: entry in `data/recipes.js` (`out` or `place`).
- **Buildable** (hut, bed…): entry in `data/structures.js` with init/label/interact/draw (+ light/warm if needed) and a recipe with `place`.
- **Resource**: entry in `data/resources.js` (spawn table, tool, yields, regrow, draw). Append at the END of RES to keep old saves valid.
- **Animal**: entry in `data/animals.js`; new behaviour → new `ai` branch in `Game.updateAnimals`.

## Testing
- `node tools/smoke.mjs` — must print "all checks passed". Extend it with every new mechanic.
- Browser: serve the folder (`python3 -m http.server`) and open `index.html?debug`; `window.__G()` returns `{ G, ui, start, Game }`.
  Headless Chrome via Python Playwright works in the dev sandbox (`/usr/bin/google-chrome`), viewport 400×820.

## Roadmap (agreed with the owner)
1. ✅ Bag 16 slots × 20, tool durability, rope, chest
2. ✅ Fishing (bite mini-game), bow + arrows + rabbits, cooking, raw-food sickness, canteen
3. Shelter: prefab hut → upgradeable house; energy bar + sleep (skip night)
4. Few dangerous animals (boar, `ai: 'hostile'`), weather (rain/storm puts out fires), farming, sounds, minimap
Goal is endless survival with a day record (no escape ending).
