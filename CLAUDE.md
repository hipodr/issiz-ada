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
  structures.js       placed things saved in full (fire, chest, hut, wreck, drop) + draw()/interact(); HOME levels
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
map.html              NEW MAP (step 1 of the rebuild): empty island viewer, linked from the menu
js/map/terrain.js     island generator v2 (256² cells × 16 units): beaches/cliffs, mountain, river+delta, reef/lagoon,
                      clearings, cave, A* trail, moisture → packTerrain() = 3 RGBA textures
js/map/gl.js          WebGL1 ground shader (materials, sun/moon, sea, river, cave) + lighting(tod)
js/map/viewer.js      pan/pinch/wheel, fly-to buttons, time slider, adaptive resolution; window.__MAP for tests
tools/maptest.mjs     headless checks of the generator (+ --ppm preview)
```

## Controls (owner's design — keep it this way)
- ONE smart action button. `Game.findAction()` decides by context and picks the tool from the bag automatically:
  animal at arm's reach + weapon → Saldır · nearest thing in reach → Odun kes (best `dmg.wood` tool) / Taş kır /
  Topla / Al / Aç / Ateş / Su iç · shore + rod → Balık tut · animal in bow range → Ok at.
  A target needing a missing tool shows locked and its `hint` toast says what to craft. The button shows the tool icon.
- No hotbar, no tool selection. Equipment ("paper doll") lives in the bag sheet: slots in `data/equipment.js`
  (head/body/feet/weapon/shield), item `equip: { slot, stats }`, totals in `G.st` (speed, armor, warm, thirst, melee).
  Weapon used for attacks = equipped one, else strongest `melee` item in the bag.
- Bag button is top-right; the bag sheet shows the doll + 16 slots + details.
  Drag & drop: bag↔bag (swap/merge) and bag↔equipment. Tap = details (Ye / İç / Kuşan / Çıkar / Yere bırak).
- Sopa/Mızrak are weapons only. Campfire opens its own sheet (wood, 3 timed cook slots, burning). Fire sheet doesn't pause.
- `G.hurt(n)` applies armor; ready for hostile animals.
- Craft is its own sheet behind the hammer button (top-right, left of the bag): a compact 4-column ICON GRID (icon + name),
  ordered by `SORTED_RECIPES` (level, then file order → Kazma, Balta, Sopa, Kamp ateşi first). Tap a tile → `#craftDetail`
  (desc, cost chips, Yap). Locked tiles show "Sv N", affordable ones a green dot.
- XP: amounts in `config.js XP`, curve `levelOf(xp)` in game.js (XP_STEP × level). `G.addXp(n)` → `ui.levelUp(lvl, unlockedNames)`.
- Hut (`structures.js hut`, recipe lvl 3): Uyu at evening/night skips to morning (`G.sleep`); `G.home` = the hut's id.
  Daytime press → `ui.openHome(e)` (home sheet: sleep button, upgrade box, storage). Levels live in `HOME` (structures.js):
  1 Kulübe → 2 Baraka (player lvl 5, wood 25 / nail 12 / stone 8 / rope 4): bigger r, +70 sleep heal, 12-slot store, lantern light.
  `G.upgradeHome(e)` bumps `e.lvl`; r/warm/light/sleepHp are read from HOME[e.lvl-1]. Add a level = append to HOME + draw branch.
  Dying with a home → `G.respawn()` at the hut, bag dropped where you fell (equipment kept). No home → game over.
- Elevation (owner: "smooth hills, only a few impassable rocky spots"): `W.elev` Float32 0..1 per tile, `W.elevAt(x,y)` bilinear.
  Hills are walkable everywhere; walking uphill is slower (`P.slope`). `W.crag` = rare impassable boulder fields on the
  highest ground (~1% of land, small clusters); `W.canStep` only rejects crags. No resources/spawn/builds on or next to crags.
  Mountain tops: more rocks, stony ground, fewer plants. Generated in `World.genElevation` (coast fade + blur keeps slopes gentle).
- Ground render: pixel texture at CELL=2 world units (16×16 px per tile), built lazily per CHUNK=8 tiles (`buildChunk`),
  noise-jittered borders, NW hillshade from `elev`. Water pixels are transparent; animated water is drawn underneath.
- Hero (`renderer.drawPlayer`): 3/4 view, 3 poses (front/back/side, side mirrored via `dir`), walk cycle from `P.walk`,
  arms swing; the tool arm reaches the hand point used by tool drawing. Gear (hat/vest/shoes/shield) is drawn per pose.
- Boar (`animals.js`, `ai: 'hostile'`, from day 2): winds up ("!"), charges, `G.hurt(dmg, x, y)` (armor, knockback, shake),
  rests (vulnerable), staggers when hit, avoids lit fires (150 units). XP per kill from `def.xp`.
- Shipwreck crates (`structures.js wreck`, loot in `data/loot.js`): 1 at start, 1–2 each morning (`G.onNewDay`), max 3,
  edge-of-screen arrows point to them. Loot adds cloth, nails (future house upgrade), bandages (`heal`).

## Rules of the codebase
- `game.js` never touches the DOM. It talks to the screen only via `this.ui` (toast, bump, changed, vibrate, openChest, openFire, openHome, levelUp, sleep, over).
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

## New map (in progress — owner wants to go step by step: map first, then characters, then objects)
- Owner chose GPU rendering. The old game still uses world.js + the canvas renderer; the new map is separate until approved.
- Terrain fields are smooth (bicubic lookup in the shader); detail comes from noise + cellular layers (grass tufts, rock slabs,
  pebbles, flowers, coral) that only run when zoomed in (`fine`/`mid` factors) — keep it that way for phone GPUs.
- Height is stored sign·√|h| so the water line has fine precision; a river bed is never "sea" (rivW mask).
- Cave: `terrain.cave {x, y, ang}` (ang = downhill/opening direction). Future: underground map behind it.
- Light: `lighting(tod)` sunrise ≈05:30, sunset ≈19:30, sun from the north side and never overhead (relief reads well).
- Test: `node tools/maptest.mjs`; screenshots need Chrome with `--use-angle=swiftshader --enable-unsafe-swiftshader`
  (software GL is ~15 fps; set the camera with `__MAP.flyTo(x, y, zoom, false)`).

## Roadmap (agreed with the owner)
1. ✅ Bag 16 slots × 20, tool durability, rope, chest
2. ✅ Fishing (bite mini-game), bow + arrows + rabbits, timed cooking, raw-food sickness, canteen
2b. ✅ Fire screen, tooltips
2c. ✅ One smart button with auto-tool, equipment doll + stats + drag & drop, gear (hat, vest, shoes, shield, spear), fewer resources
3. ✅ Hut + sleep + respawn, XP/levels with recipe gating, separate craft sheet
4. ✅ Boars, shipwreck crates, bandage
5. ✅ v8: smooth hills + few crags (replaced plateaus/ramps — owner found them wall-like), detailed pixel ground,
   craft icon grid by level, home sheet + Kulübe → Baraka upgrade
6. IN PROGRESS: new realistic map (map.html) → then characters → then move objects/gameplay onto it
7. Later ideas: underground map behind the cave, 3rd home level (Ev), iron/ore on mountain tops, energy bar, weather (rain/storm puts out fires), farming, sounds, minimap
Goal is endless survival with a day record (no escape ending).
