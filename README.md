# WORLD SIMULATOR

A 2D civilization and world simulation sandbox for the browser.
**This is Phase 1: Project Foundation.** It contains the architecture, menus, world creation, a temporary test map, camera, HUD and an independent simulation clock. Civilizations, population, economy, diplomacy, technology and warfare are deliberately **not** implemented yet.

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
npm test          # headless unit tests (Node's built-in test runner, no extra dependencies)
```

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Move the camera (hold Shift to move faster) |
| Mouse wheel | Zoom toward the cursor |
| Middle mouse button + drag | Drag the map |
| Space | Pause / resume the simulation |
| 1, 2, 3, 4 | Speed 1x, 2x, 5x, 10x |
| F3 | Toggle the debug panel |
| Esc | Go back from the Load World / New World screens, close dialogs |

## Implemented features

- **Main menu** (HTML/CSS): New World, Load World, Settings, Exit.
  - Load World opens a screen saying that saving and loading arrive in a later phase (no saves exist yet).
  - Exit asks for confirmation, tries `window.close()`, and otherwise shows an exit screen (browsers do not allow a page to close its own tab).
- **World creation**: name (random default), size (Small 128², Medium 256², Large 512² tiles), numeric or text seed with Randomize, landmass distribution, water coverage, terrain variety. All input is validated with inline error messages.
- **Temporary test map**: land and water regions, six terrain types, a gold boundary frame. It honours the seed and the creation options coarsely so the options pipeline can be verified. It is replaced by the real generator in Phase 2.
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
    World.js               Terrain grid (pure data)
    TestMapGenerator.js    Temporary Phase 1 map (replace in Phase 2)
    terrain.js             Terrain types and colours
    WorldRenderer.js       Phaser: bakes the map into one texture
    CameraController.js    Phaser camera input and movement
  game/
    Game.js                Phaser configuration
    scenes/                BootScene, MenuScene, WorldScene
  ui/                      HTML/CSS interface (MainMenu, WorldCreationScreen, WorldHUD,
                           SettingsDialog, DebugPanel, ErrorOverlay, LoadingOverlay, styles/)
  utils/                   Random (seeded), Noise, WorldNames
tests/                     Unit tests for everything that does not need a browser
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
- The map is a temporary placeholder; terrain generation, biomes and rivers arrive in Phase 2.
- Civilization, population and every other simulated system are placeholders (counts show 0).
- The world starts running at 1x immediately after creation.
- The Phaser canvas renders at CSS-pixel resolution (not device-pixel ratio), a deliberate choice for low-end GPUs; on high-DPI screens the map looks slightly soft when zoomed in, UI text stays sharp.
- When the world view opens, the top of the map frame sits partly under the top bar until you pan or zoom.
- Exit cannot close the browser tab by itself (browser security rule).
- Touch input is not supported yet (mouse and keyboard only).
- Not tested on real Intel UHD 620 hardware; see testing notes.

## Testing performed

See the final report delivered with this project for the exact results, including what was and was not tested.
