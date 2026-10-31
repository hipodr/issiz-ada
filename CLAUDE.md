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

## Controls (owner's design — keep it this way)
- ONE smart action button. `Game.findAction()` decides by context and picks the tool from the bag automatically:
  animal at arm's reach + weapon → Saldır · nearest thing in reach → Odun kes (best `dmg.wood` tool) / Taş kır /
  Topla / Al / Aç / Ateş / Su iç · shore + rod → Balık tut · animal in bow range → Ok at.
  A target needing a missing tool shows locked and its `hint` toast says what to craft. The button shows the tool icon.
- No hotbar, no tool selection. Equipment ("paper doll") lives in the bag sheet: slots in `data/equipment.js`
  (head/body/feet/weapon/shield), item `equip: { slot, stats }`, totals in `G.st` (speed, armor, warm, thirst, melee).
  Weapon used for attacks = equipped one, else strongest `melee` item in the bag.
- Bag button is top-right; the bag sheet has tabs Çanta (doll + 16 slots + details) and Üretim (recipes grouped by `cat`).
  Drag & drop: bag↔bag (swap/merge) and bag↔equipment. Tap = details (Ye / İç / Kuşan / Çıkar / Yere bırak).
- Sopa/Mızrak are weapons only. Campfire opens its own sheet (wood, 3 timed cook slots, burning). Fire sheet doesn't pause.
- `G.hurt(n)` applies armor; ready for hostile animals.

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
2. ✅ Fishing (bite mini-game), bow + arrows + rabbits, timed cooking, raw-food sickness, canteen
2b. ✅ Fire screen, tooltips
2c. ✅ One smart button with auto-tool, equipment doll + stats + drag & drop, gear (hat, vest, shoes, shield, spear), fewer resources
3. Shelter: prefab hut → upgradeable house; energy bar + sleep (skip night)
4. Few dangerous animals (boar, `ai: 'hostile'`), weather (rain/storm puts out fires), farming, sounds, minimap
Goal is endless survival with a day record (no escape ending).
