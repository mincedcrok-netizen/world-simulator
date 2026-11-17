# WORLD SIMULATOR

A 2D civilization and world simulation sandbox for the browser.
**Current state: Phase 2 (procedural world generation) on top of the Phase 1 foundation.** Worlds are generated from a seed with oceans, continents, islands, lakes, rivers, mountain ranges, a climate model, biomes and natural resources. Civilizations, population, settlements, economy, diplomacy, technology and warfare are deliberately **not** implemented yet.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0` (Vite 7 requirement) and npm
- A modern browser (Chrome, Edge, Firefox, Safari). WebGL is used when available; Phaser falls back to Canvas otherwise.

## Install and run

```bash
npm install
npm run dev
```

Then open the address Vite prints (normally http://localhost:5173).

Other commands:

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build locally
npm test          # headless tests (Node's built-in test runner, no extra dependencies)
```

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Move the camera (hold Shift to move faster) |
| Mouse wheel | Zoom toward the cursor |
| Middle mouse button + drag | Drag the map |
| Space | Pause / resume the simulation |
| 1, 2, 3, 4 | Speed 1x, 2x, 5x, 10x |
| F3 | Toggle the debug panel (includes a live readout of the tile under the cursor) |
| Esc | Go back from the Load World / New World screens, close dialogs |

## Implemented features

### Phase 2: procedural world generation

- **Deterministic generation** (`src/world/generation/`): the same seed and settings always give the identical world (the world name does not matter); different seeds give clearly different worlds. It has no Phaser or DOM dependency and runs headlessly.
- **Geography**: oceans, continents, islands, coastlines, a shallow coastal shelf (always at least two tiles wide next to land), beaches, and inland lakes. The outer ring of the map is always open ocean.
- **Elevation**: every tile has an elevation (0 to 1, sea level exactly 0.5). Mountain ranges are generated as long wandering ridges with spurs, so they form connected chains. Hills come from foothills and broad uplands; peaks above the snow line are snow-capped.
- **Terrain types (14)**: deep ocean, shallow ocean, beach, plains, grassland, forest, dense forest, hills, mountains, desert, tundra, snow, swamp, lake.
- **Climate**: temperature from latitude and an elevation lapse rate; rainfall from wind belts carrying ocean moisture over land with orographic rain and rain shadows; moisture = rainfall minus evaporation plus humidity near water.
- **Biomes (12)**: ocean, lake, ice cap, tundra, taiga, temperate grassland, temperate forest, tropical rainforest, savanna, desert, swamp, alpine. Hot and dry gives desert, warm and humid gives rainforest, cold gives tundra and ice, high ground gives mountains.
- **Rivers and lakes**: lake basins are carved into low inland ground, the map is "flooded" from the sea so every tile gets a drainage path, and rain-weighted catchments decide where rivers run. Rivers therefore flow strictly downhill, start in high ground (or leave a lake), grow wider downstream and always end in the ocean or a lake.
- **Resources** (data only, nothing can be mined or harvested yet): stone, wood, iron ore, copper ore, gold, fertile soil, freshwater and coal, stored as per-tile richness maps (0 to 255). Ores form clustered veins that favour hills and mountains; the clusters are also listed as discrete deposits (`world.deposits`).
- **Settings really matter**: Small/Medium/Large change map size; Islands/Balanced/Continents change how many landmasses there are and how large; Low/Normal/High water changes land coverage (about 45% / 34% / 24% land for Balanced; Islands and Continents shift this by roughly -6 / +6 points); Low/Normal/High terrain variety changes roughness, hills, ridge height and how patchy climate and biomes are.
- **Rendering**: the terrain is painted once into two textures (a detailed one for zooming in, a 1-texel-per-tile overview for zooming out) with smooth biome blending, organic coastlines, hill shading, forest canopy texture and anti-aliased rivers. Two images are drawn, never one object per tile.
- **Debug panel**: new World section (generation time, lakes) and a "Tile under cursor" section showing terrain, biome, elevation, temperature, rainfall, moisture, river and resources.

### Phase 1 foundation (unchanged)

- **Main menu** (HTML/CSS): New World, Load World, Settings, Exit.
  - Load World opens a screen saying that saving and loading arrive in a later phase (no saves exist yet).
  - Exit asks for confirmation, tries `window.close()`, and otherwise shows an exit screen (browsers do not allow a page to close its own tab).
- **World creation**: name (random default), size (Small 128², Medium 256², Large 512² tiles), numeric or text seed with Randomize, landmass distribution, water coverage, terrain variety. All input is validated with inline error messages.
- **Camera**: WASD and arrow keys, wheel zoom toward the cursor, middle-button drag, boundaries, smoothing (can be switched off in Settings).
- **HUD**: top bar (world name, year, status), collapsible side panel (world info, placeholder civilization and population counts, World settings, Main menu), bottom controls (Pause, Play, 1x/2x/5x/10x). All controls work.
- **Simulation clock**: starts at Year 1; one year = 10 real seconds at 1x by default (configurable in Settings, 1 to 60 s); driven by real elapsed time on its own timer, not by frames or by Phaser.
- **EventBus**: on / once / off / emit, with unsubscribe functions; used between the simulation, HUD, scenes and settings.
- **Debug panel (F3)**: FPS, renderer, simulation year / speed / status, camera X / Y, zoom, map size.
- **Settings** (saved to LocalStorage): seconds per year, camera speed, smooth camera, show debug panel on launch. Malformed saved data falls back to defaults with a console warning.
- **Error handling**: failures show a dialog with a clear message instead of a frozen screen (world creation errors return to the menu; fatal start-up errors offer a reload). Global `error` and `unhandledrejection` handlers log to the console and show the dialog. Errors are never swallowed silently.

## Architecture

```
src/
  main.js                  Bootstraps services and starts Phaser
  config/
    settings.js            Constants, setting definitions, SettingsStore (LocalStorage)
    worldOptions.js        World-creation options and validation
  systems/
    EventBus.js            Publish / subscribe
    Events.js              Event name constants
  simulation/              NO Phaser, NO DOM (runs headlessly, see tests/)
    Simulation.js          Owns clock, world state and terrain; commands in, events out
    SimulationClock.js     Real-time -> simulated years, pause, speed
    WorldState.js          Serialisable world data
  world/
    World.js               Generated world data (typed arrays) and query helpers
    generation/            Procedural generation (no Phaser, no DOM) - see below
    terrain.js biomes.js resources.js worldConstants.js grid.js   Shared tables and helpers
    TerrainPainter.js      Paints a World into an RGBA buffer (pure JS, testable)
    WorldRenderer.js       Phaser: uploads two painted textures, level-of-detail switching
    TestMapGenerator.js    LEGACY Phase 1 generator, no longer used by the game (kept with its tests)
    CameraController.js    Phaser camera input and movement
  game/
    Game.js                Phaser configuration
    scenes/                BootScene, MenuScene, WorldScene
  ui/                      HTML/CSS interface (MainMenu, WorldCreationScreen, WorldHUD,
                           SettingsDialog, DebugPanel, ErrorOverlay, LoadingOverlay, styles/)
  utils/                   Random (seeded), Noise, WorldNames
tests/                     Unit tests for everything that does not need a browser
```

### World generation architecture

```
generateWorld(config)                      src/world/generation/WorldGenerator.js
  validates config -> WorldGenerationError on bad input
  GenerationParams      settings -> numbers (water target, noise strength, range count ...)
  HeightMapGenerator    landmass circles -> warped coastlines -> mountain ridges + hills -> sea level
  RiverGenerator        carve lake basins -> priority-flood from the ocean (drainage + lakes)
  ClimateGenerator      temperature, rainfall (wind-advected moisture)
  RiverGenerator        rivers from rainfall accumulated down the drainage tree
  ClimateGenerator      moisture (rainfall - evaporation + water humidity)
  BiomeGenerator        biome and terrain per tile
  ResourceGenerator     resource richness maps and ore deposits
  -> World              typed arrays: tiles, biomes, elevation, temperature, rainfall, moisture,
                        riverDir, riverSize, lakeId (+ lakes), flowAccumulation, resources, deposits
```

Every stage draws from its own seed derived from the world seed (`stageSeed`), so stages stay independent and reproducible. All per-tile data lives in compact typed arrays (Uint8/Int8/Float32), so a Large (512x512) world is about 12 MB. The renderer only reads this data; nothing in `generation/` knows Phaser exists.

Reading a world from game code:

```js
const world = simulation.world;
world.getTile(x, y);          // terrain id (TERRAIN)
world.getBiome(x, y);         // biome id (BIOME)
world.getElevation(x, y);     // 0..1, sea level 0.5
world.isRiver(x, y);  world.getRiverTarget(x, y);
world.getResourcesAt(x, y);   // [{ key, name, amount }]
world.describeTile(x, y);     // everything at once
```

Key rules that keep the foundation extensible:

1. **The simulation never imports Phaser or touches the DOM.** It reads time from an injectable time source, so it is testable and could run in a worker or on a server later.
2. **UI and simulation only talk through the EventBus.** The HUD sends `cmd:sim:*` commands and renders `sim:*` notifications; it never holds the Simulation object.
3. **Performance:** the map is baked once into a single texture (one draw call; the Large map is a 512x512 texture). The camera only updates in frames where something changed. Simulation ticks run at 20 Hz and the HUD only writes to the DOM when a value changes. No per-frame allocations in the camera or tick paths.

### Simulation time details

- The driver wakes every 50 ms and measures real elapsed time with `performance.now()`.
- A single tick can consume at most 2 s of real time (`SIMULATION.MAX_STEP_MS`). If the browser heavily throttles a background tab, the simulation slows down instead of jumping far ahead when you return.
- Pausing, resuming and changing speed first credit the time that has already passed, so no time is lost or double counted.
- When several years elapse in one tick (high speed, short years), one `sim:yearChanged` event is emitted with `yearsElapsed`. Later phases that must process every year individually should loop over `yearsElapsed`.

## Known limitations

- Worlds cannot be saved or loaded yet (Load World is an informational screen).
- Worlds are flat maps with latitude bands from pole to pole; there is no wrapping and no ocean currents.
- The climate model is deliberately simple (one advection pass per row, no seasons). Biome borders are tile-aligned and soften only visually.
- Mountain ranges are generated as ridges, not by simulated tectonics; erosion is not simulated. Rivers follow tile centres at 8 directions, so they look slightly angular when zoomed in.
- Generation runs on the main thread: about 0.1 s for Medium and 0.4 s for Large in Node on the development machine, plus roughly 1 to 2 s to paint the textures and start the scene for a Large world in headless Chromium; expect longer on an i5-8250U (not measured). A loading screen is shown meanwhile; a Web Worker would remove the pause entirely.
- Resource values are placement data only; they are not shown on the map yet (use the F3 tile readout to inspect them).
- Civilization, population and every other simulated system are placeholders (counts show 0).
- The world starts running at 1x immediately after creation.
- The Phaser canvas renders at CSS-pixel resolution (not device-pixel ratio), a deliberate choice for low-end GPUs; on high-DPI screens the map looks slightly soft when zoomed in, UI text stays sharp.
- When the world view opens, the top of the map frame sits partly under the top bar until you pan or zoom.
- Zoomed in to the maximum the detailed texture is bilinearly smoothed (soft), not pixel-sharp.
- Exit cannot close the browser tab by itself (browser security rule).
- Touch input is not supported yet (mouse and keyboard only).
- Not tested on real Intel UHD 620 hardware; see testing notes.

## Testing performed

`npm test` runs 104 tests: the 57 Phase 1 tests (unchanged apart from one import so the legacy generator is still exercised directly) plus 47 Phase 2 tests covering determinism, different seeds, dimensions, land/water distribution, every world-generation setting, elevation validity, terrain/biome consistency, mountain connectivity, climate, rivers (direction, never uphill, always reach water, sources in high ground), lakes, resources, the painter and invalid configurations. The final report delivered with this project lists the exact results, including what was and was not tested.
