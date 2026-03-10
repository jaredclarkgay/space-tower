# CLAUDE.md — Space Tower

## What This Is

Space Tower is a tower-building game where you ARE the builder — a physically strong human in a hardhat constructing a space elevator by hand. The game runs as a single-page web app with multiple interconnected modes: a 3D title screen and exterior (Three.js), a 2D side-on sim interior (Canvas 2D), a basement Control Room, and eventual connection to the RGB (LLM-powered immersive experience). One tower, one character, multiple cameras.

This repo contains **everything** — the title/exterior, the sim, and the control room all live here. The RGB is a separate repo (`space-tower-rgb`).

The first 10-floor segment is called "Goodbye Earth" and explores departure and loss. Three-act structure: Build (floors 1–4), Discover (floors 5–8 with The Reckoning), Prove (floors 9–10 with The Keeper).

---

## Modes & Transitions

1. **Title Screen** — Three.js. Night city, orbital Earth view, constellation clicking. Mouse-orbit camera. "New Game" / "Continue" enter the transition.
2. **Exterior** — Third-person. Three.js. **The primary construction layer.** Player physically builds the tower: launching crates via the scaffolding seesaw, climbing the structure, driving the bulldozer. This is where floors get built. Tab key or walking through the door enters the sim.
3. **Sim** — Side-on cross-section. Canvas 2D. **The interior you unlock by building outside.** Explore floors you constructed, discover what your building created — NPCs, economy, story. The platforming and traversal are a strength (charged jump, wall slide, drop-through-floors). Tab key or walking out the door returns to exterior.
4. **Control Room** — Basement (Floor -1). Canvas 2D. Perspective room with console screen showing tower status, log quips, interactive buttons. Reached via elevator.
5. **The RGB** (separate repo) — First-person LLM-powered experience. Not yet wired to this repo.

Transitions between modes use `localStorage` flags + `location.reload()`. The title screen manages exterior activation via `skipToExterior()`. Sim ↔ Exterior use `spacetower_gotoExterior`. Dev navigation uses `spacetower_devGoto` with values: `interior`, `exterior`, `dozer`, `control-room`.

---

## Tech Stack

**Vanilla JS + Canvas 2D + Three.js.** Vite for dev/build. Tone.js + @tonejs/midi for music. Three.js for all 3D (title, exterior, crane, bulldozer, scaffolding).

```
npm run dev    → starts Vite dev server
npm run build  → production bundle
```

---

## File Structure

```
src/
  state.js            (103 lines)  — Global state S, zoom, buildout engine, module utilities
  constants.js         (44 lines)  — Dimensions, physics, seeded RNG, color lerp, reckoning constants
  floors.js           (179 lines)  — 10 floor definitions, 3 buildout stages each, visual themes, objects
  npcs.js             (117 lines)  — Name pools, palettes, dialogue trees (6 types), Gene, floor leaders
  world.js             (62 lines)  — World gen: floors, stairs, objects, NPCs (per-floor config), Gene, aliens
  game-init.js        (718 lines)  — THE BIG ONE. Game loop, player physics, economy, bulldozer/crane driving,
                                      elevator, NPC AI, arrivals, activations, wall slide/jump, all input handling
  render.js          (2330 lines)  — Canvas rendering. Sky, parallax, tower, characters, modules, reckoning HUD,
                                      keeper overlay, particles, buildout reveal, bulldozer, terrain, RGB door
  panel.js            (185 lines)  — Build panel (desktop + mobile), module placement/selling, HUD
  input.js             (22 lines)  — Keyboard + touch input, zoom slider
  save.js             (103 lines)  — localStorage save/load (key: spacetower_v14), migration from older saves
  sound.js            (161 lines)  — Web Audio synth, 30+ procedural SFX, ambient drone, bulldozer/door hum
  music.js            (566 lines)  — Tone.js MIDI playback, playlist from /public/midi/, shuffle, volume, radio state
  radio-ui.js         (198 lines)  — Radio widget: volume knob, track name, play/pause, scrub bar
  compendium.js       (205 lines)  — Character collection UI, mini-sprite renderer, dialogue log
  reckoning.js        (633 lines)  — Floor 8 Builders vs Suits mini-game, all phases, AI, scoring, color pick
  keeper.js           (566 lines)  — Floor 10 Keeper: LLM + scripted paths, zoom state machine, chat UI, BYOK
  control-room.js    (1100 lines)  — Basement: perspective room, console screen, tower status, quips, buttons, jumping

  title/
    title-main.js      (569 lines)  — Title entry point: renderer, scene, camera, orbit, input, transitions
    title-city.js     (1350 lines)  — Procedural city: buildings, tower mesh, stars, hover, Earth, moon, sky
    title-exterior.js (1701 lines)  — Player character, WASD, climbing, ladders, beams, collision, NPC workers
    title-ui.js        (311 lines)  — Title screen DOM: menus, buttons, dev nav, camera slider, arrival text
    title-transition.js(293 lines)  — Forward/reverse transition between title orbit and exterior gameplay
    title-constellation.js(162 lines) — Star constellation clicking system
    third-person-camera.js(159 lines) — Critically-damped spring camera, orbit, collision raycasting
    playable-crane.js  (760 lines)  — Tower crane: cab, boom, trolley, winch, pendulum physics, launch mechanic
    playable-bulldozer.js(607 lines) — Driveable bulldozer: terrain deformation, blade physics, dust particles
    scaffolding-game.js(915 lines)  — Seesaw launch mini-game: crate physics, bullseye targets, floor building

index.html          (210 lines)  — All CSS (inline <style>), DOM structure, UI layout, keeper chat DOM
```

Total: ~14,600 lines JS + 210 lines HTML.

---

## Architecture

### State
Single mutable object `S` from `state.js`. No framework.

Key paths:
- `S.player` — position, velocity, state, appearance, wallSlide, crane, charging
- `S.floors[]` — floor collision data (sorted by Y)
- `S.modules[fi][bi]` — placed buildables (null = empty, or `{id, nm, cost, ...}`)
- `S.buildout[fi]` — `{stage: 0–5, revealT}` per floor
- `S.npcs[]` / `S.workers[]` — NPCs (with arrival state machine) and rooftop workers
- `S.credits` / `S.sat` / `S.food` / `S.builderHappiness` — economy
- `S.foodChainComplete` / `S.cornerStoreUpgraded` / `S.bulldozer` — progression flags
- `S.cam` — camera position + target
- `S.litFloors` — Set of unlocked floor indices
- `S.reckoning` — full reckoning state (phase, map, scores, builders, suits, color)
- `S.keeper` — keeper encounter state (active, zoom, LLM mode, history, resolved)
- `S.cr` — control room state (phase, position, screen, fullscreen, jumping)
- `S.fx` — screen effects (shake, flash, tint)
- `S.particles[]` — particle system
- `S.terrain` — Float32Array(800) heightmap for exterior ground
- `S.compendium.entries` — discovered character data

### Game Loop
`requestAnimationFrame` → `update()` → `draw()` → `renderPanel()`

Control room has its own update path inside `update()` — when `S.cr.active`, the sim loop is skipped entirely.

### World Generation
`genWorld()` in world.js. Seeded RNG (`sr()`, `ri()`, `pk()`). Same seed = same layout. Per-floor NPC config controls spawn types and counts.

### Rendering (Sim)
Canvas 2D. No sprites. Procedural drawing. Parallax via camera transform nesting:
- City skyline: 0.35x
- Treeline: 0.6x
- Tower + characters: 1x

### Rendering (Title/Exterior)
Three.js. Vertex-colored merged geometries (no textures except crate labels). Fog + skybox transitions. Third-person camera with spring physics. All 3D objects are procedurally built in JS.

### UI Split
Canvas (top ~68%) for game world. DOM (bottom ~32%) for build panel, elevator, compendium, HUD. Mobile: touch controls + tabbed panel.

---

## Economy System

### Food Chain
- Floor 1 diner (right flank) produces food at stage 4+
- Floor 2 planters grow through 4 stages (~30s each), produce food at stage 4
- Corner store upgradeable for +1 food
- Bunks on floor 1 consume food
- Surplus → happiness, deficit → happiness drain
- `foodChainComplete` triggers when diner active + 2 mature planters

### Builder Happiness
- Rises from: food surplus, residential placement, floor activations, corner store upgrade
- Falls from: food deficit, residential demolition, mature planter removal
- Threshold (20) + foodChainComplete → bulldozer unlock

### Bulldozer
- Unlocked by happiness + food chain
- Drives outside tower, terrain deformation via Float32Array heightmap
- Blade-down digs at current position, piles ahead
- Bounce off tower walls, dust particles

---

## Key Systems

### The Block System
12 blocks per floor. `PG=300`. Blocks 3, 11 = windows (`isWinBlock`). Block 6 = elevator (`isElevBlock`). Blocks 5, 7 = flank blocks (`isFlankBlock`) — fixed identity (corner store, diner, etc.). 7 buildable per floor.

### Buildout System
**Exterior builds floors. Interior reveals them.** Floors are physically constructed on the exterior (scaffolding seesaw launches crates onto the roof, which builds the 3D structure). When a floor is built outside, its interior becomes explorable in the sim.

Each floor has 3 interior stages (STAGES array in floors.js). These are discovery moments — the player walks through and sees what changed. Stages: Power On → Structure → Activate. Stage 3 triggers activation effects (per-floor particles, sounds, NPC arrivals). The interior platforming (charged jump, wall slide, drop-through-floors) is a core strength — traversing the tower should feel athletic and fun, not like walking to waypoints.

**Note: The codebase currently has 5 stages. Reducing to 3 is a planned change — see MVP spec.**

### Floor Flanks
Each floor has named left/right flanks (blocks 5 and 7): lobby-desk, corner-store, diner, seed-bank, host-stand, pharmacy, armory, gift-shop, comms-closet, etc. These are fixed identities drawn as part of the floor.

### Elevator
State machine: `idle` → `closing` → `traveling` (30 frames) → `opening` → `idle`. Includes Control Room (B) as basement destination.

### NPC Arrival System
NPCs don't exist on a floor until it reaches stage 5. Then they queue, walk through the lobby door, ride the elevator, and walk to their destination. State machine: `queue` → `entering` → `riding` → `arriving` → `done`.

### The Reckoning (Floor 8)
Builders vs. Suits. Triggers when Floor 8 (Storage) hits stage 5 and all floors have stage ≥ 1. Contested floors: 6 (Observation), 7 (Storage), 8 (Observatory). Phases: INTRO → COUNTDOWN → ACTIVE → FLOOD → RESULT → COLOR_PICK → DONE.

- Player claims blocks by standing on them (150 frames)
- 12 builder AI, 18 suit AI (6 squads of 3)
- Suits are wave-locked (bottom to top), faster claim time (45 frames)
- Builders are slower (210 frames) but can go anywhere
- FLOOD phase spawns 30 civilian NPCs (population explosion)
- Post-reckoning: color picker (8 colors), rematch bell, color wheel station
- Gene is hidden during reckoning, returns after with injected dialogue

### The Keeper (Floor 10)
LLM-powered or scripted fallback. Proximity auto-trigger with zoom state machine (idle → zooming_in → zoomed → zooming_out). Camera locks to desk area.

- **LLM path**: Reads BYOK credentials from `localStorage('rgb_llm_connection')`. Supports OpenRouter (OpenAI-compatible) and direct Anthropic API. Builds system prompt with tower context (health score, floors, satisfaction, reckoning outcome). Chat UI overlaid on canvas. Resolves when model outputs `[RESOLVED]` token.
- **Scripted path**: 5 lines of dialogue adapting to tower state. Typewriter effect. Auto-zoom-out on return visits.

### Control Room (Basement)
4-phase entry: black → elevator doors open → walk toward screen → interactive. Canvas-rendered perspective room with:
- Wireframe tower diagram (clickable floors)
- Stats: population, satisfaction, credits
- "Next Step" panel showing current build task
- Full-screen monitor toggle (F key) with pannable artboard
- Log quips (contextual + generic, rotating)
- Red button (fake alarm), gold button (+1 credit, once per visit)
- Jump-on-console gag (glitch + quip)
- SAT-responsive heartbeat line, low-SAT screen flicker, zero-credit glitch
- Floor LEDs on side racks track buildout stage

### Music System
Tone.js + @tonejs/midi. MIDI files in `/public/midi/`. Filtered by `skip.txt`. Artist metadata embedded. Shuffle mode. Volume control. State persists across mode transitions via `localStorage('spacetower_music')`.

### Radio Widget
Lower-right corner. Volume knob (click-drag), track name + artist, play/pause, scrub bar. Mountable to different DOM containers (`#ext-radio` for exterior, default for sim).

### Exterior Systems
- **Player**: WASD movement, charged jump, wall slide + wall jump, ladder climbing, sprint
- **Tower**: 4-corner structural columns, perimeter beams as one-way platforms, windows, roof plate
- **Crane**: Full playable tower crane. Boom rotation, trolley extension, winch, pendulum physics, charge-and-launch mechanic, 20-projectile pool
- **Bulldozer**: Driveable. W/S forward/reverse, A/D turn, F blade toggle, terrain deformation
- **Scaffolding Game**: Seesaw launch. Jump on one end to fling crate toward bullseye on roof. 3-beat camera. 2 crates per floor (early), 4 per floor (late). Builds floors in the 3D tower.
- **NPCs**: Semi-circular patrol workers on ground, business people on sidewalk
- **Construction site**: Fence, porta-potties, material piles, scaffolding

---

## Player Movement

### Sim (2D)
- WASD/arrows: walk, climb stairs, enter elevator
- Space/W: charged jump (hold to charge, release to jump). Zoom pulls back during charge.
- S: charged drop (hold to charge, release to drop through floors)
- Wall slide: stick to tower walls when descending. Cap fall speed to 1.5.
- Wall jump: jump away from wall with horizontal impulse
- Jump flip: cosmetic flip animation on jumps exceeding 50% max height
- Sprint: Shift key doubles speed
- E: interact (build stages, NPCs, objects, elevator, crane, bulldozer, door)
- F: toggle suit pickup
- Tab: switch to exterior

### Exterior (3D)
- WASD: third-person movement relative to camera
- Space: charged jump (hold → higher)
- Shift: sprint (2.5x speed)
- Ladders: walk into tower face to grab, W/S to climb, A/D to shimmy, Space to dismount
- Beams: one-way platforms (jump through from below)
- E: interact (crane cab, bulldozer, door)
- Tab: switch to sim

---

## Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `TW` | 3600 | Tower width (sim) |
| `FH` | 160 | Floor height (sim) |
| `FT` | 12 | Floor slab thickness |
| `NF` | 10 | Number of floors |
| `PG` | 300 | Block width |
| `BPF` | 12 | Blocks per floor |
| `GY` / `TB` | 2400 | Ground / tower bottom |
| `TT` / `ROOF_Y` | 800 | Tower top / rooftop |
| `UW` | 1400 | Explorable area beyond tower |
| `TL` / `TR` | -1800 / 1800 | Tower edges |
| `ELEV_X` | 150 | Elevator center |
| `GRAV` | 0.5 | Gravity per frame |
| `PH` | 0.32 | Panel height fraction |
| `TERRAIN_RES` | 800 | Terrain heightmap resolution |
| `RK_ACTIVE_T` | 5400 | Reckoning active phase (90 seconds) |

---

## Save System

localStorage `spacetower_v14`. Migrates from v11–v13. Saves: buildout stages, modules (with growStage), credits, satisfaction, food, builderHappiness, foodChainComplete, cornerStoreUpgraded, terrain heightmap, bulldozer state, reckoning (played, outcome, map, color), keeper (spoken, exchange, resolved), compendium, panelFloor. Auto-saves every 60 seconds.

The exterior syncs buildout to the sim save via `_syncBuildoutToSave()`.

---

## NPC Types

| Type | Code | Features |
|------|------|----------|
| Casual human | `c` | genAppearance(), skin/hair/clothing, male/female |
| Business | `b` | Suit palette, springy walk, periodic jumps |
| Construction worker | `w` | Orange vest, hardhat (rooftop + indoor variants) |
| Alien | `a` | Single eye, antenna, bright colors (3 max, converted from casuals) |
| Gene | `b` (isGene) | Recurring on floors 1,3,5,7. Hidden during reckoning. Keeper foreshadowing. |

All have `convo` (3 dialogue functions) and `ci` (conversation index). Sequential: greeting → context → the real thing.

---

## Conventions

### Code Style
Terse constants (`S`, `X`, `TW`), descriptive functions (`drawCasual`, `canAfford`). Semicolons. Single quotes. Dense formatting. ES modules, named exports, `'use strict'`.

### Adding a Floor Stage
1. Define in `STAGES[floor]` (floors.js)
2. Activation effects in `triggerActivation()` (game-init.js)
3. Done. Build interaction, save/load, reveal animation work automatically.

### Adding an NPC Type
1. Name pool + dialogue in npcs.js
2. Spawn logic in `FLOOR_NPCS` config + `genWorld()` (world.js)
3. Draw function in render.js
4. Sprite in `_drawSprite()` (compendium.js)

---

## What Not to Break

- `S` object structure — everything reads it
- `isWinBlock()` / `isElevBlock()` / `isFlankBlock()` — guard all placement
- Camera save/restore nesting in `draw()` — parallax depends on it
- Seeded RNG sequence — changing order changes every world
- Save key `spacetower_v14` — bump for new fields
- Floor 4 as RESTAURANT — RGB threshold (index 4 in code, Floor 5 to player)
- Floor 7 as STORAGE — Reckoning trigger (index 7, Floor 8 to player)
- Floor 9 as COMMAND — Keeper's floor (index 9, Floor 10 to player)
- `localStorage` flags for mode transitions (`spacetower_gotoExterior`, `spacetower_devGoto`)
- BYOK credential path: `rgb_llm_connection` in localStorage

---

## Design Principles

- **The player's body is the tool.** You climb, you jump, you swing, you drive, you launch. The game is best when the player physically does the thing, not when they press E on a waypoint.
- **Exterior builds, interior rewards.** Physical construction happens outside. The interior is the living consequence of that work — populated, alive, reactive. You enter a floor you built with your hands and find it breathing.
- **The interior is for traversal and discovery.** The sim's platforming (charged jump, wall slide, drop-through-floors) is a strength. Interior progression should feel like exploring what you created, not activating scripted checkpoints.
- **Discovery over instruction.** No tutorials. If it needs explaining, redesign it.
- **Character dignity.** Every NPC is a person. Three-line reveals: greeting → context → the real thing.
- **The RGB boundary is sacred.** The sim is handcrafted. The RGB is a place you enter. They don't contaminate each other. The Keeper is the rare exception — one living thing in a museum.
- **Meaningful consequence over choice.** Fixed block identities with direct causal consequences beat a shopping-list system.
- **Unlocks should be fun or gate something fun.** The bulldozer is inherently enjoyable to drive AND unlocks terrain shaping.
- **Floor 8 is about identity.** Builders vs. suits. Who are you?
- **The Keeper is about readiness.** Can you lead people higher? He calibrates to your answer.
- **BYOK as culmination.** You earn the right to bring your own mind into the world.
