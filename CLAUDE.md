# CLAUDE.md — Space Tower (Sim)

## What This Is

Space Tower is a tower-building game where you ARE the builder — a physically strong human in a hardhat constructing a space elevator by hand. The game has four surfaces: the Exterior (third-person climbing/building on the tower's outside), the Sim (cross-section management view — this repo), the Restaurant (hunger refill + RGB threshold on floor 5), and the RGB (first-person LLM-powered immersive experience). All four are views of the same tower, experienced by the same character.

This repo is **the Sim** — the resource management and tower interior layer.

The first 10-floor segment is called "Goodbye Earth" and explores departure and loss. It has a three-act narrative structure: Build (floors 1–4), Discover (floors 5–8 with two set-piece events), Prove (floors 9–10 with The Keeper).

---

## The Four Surfaces

1. **The Exterior** (`space-tower-exterior`): Third-person, Three.js. Climb the tower's outside, place structural elements. Title screen zoom lands here.
2. **The Sim** (`space-tower`, this repo): Side-on cross-section. Canvas 2D. Manage interior — modules, resources, NPCs.
3. **The Restaurant**: Floor 5. Player goes here because they're hungry. Transitions to first-person 3D. RGB threshold.
4. **The RGB** (`space-tower-rgb`): First-person, LLM-powered. Self-contained space the player crosses into. Does NOT bleed back into the sim.

**The RGB boundary is sacred.** The sim stays handcrafted and deterministic. The RGB is a separate world you enter through doors. The only exception: each segment's mayor (top floor) is LLM-powered inside the sim — a rare, special character who feels fundamentally different from every scripted NPC around them.

---

## Segment 1: Three-Act Structure

### Act 1: Build (Floors 1–4)
Learn the game. Place modules, manage resources, talk to static NPCs. No LLM. The world is deterministic.

### Act 2: Discover (Floors 5–8)
**Floor 5 — The Restaurant.** Hunger pulls the player here. BYOK moment — connect your LLM. First RGB experience. The world is alive.

**Floor 8 — The Reckoning.** Builders vs. Suits mini-game. Who really runs the tower? The player is a builder — they fight alongside their people. Outcome affects political power and The Keeper's disposition. Designed to be delightful and replayable.

### Act 3: Prove (Floors 9–10)
**Floor 10 — The Keeper.** The first mayor. LLM-powered, lives on Command floor. Knows everything about your tower. Gates passage to Segment 2 via a conversation/puzzle/debate. Difficulty scales inversely with tower health — thriving tower = near-instant concession, struggling tower = genuine battle of ideas. All players can win.

---

## Tech Stack

**Vanilla JS + Canvas 2D.** No framework. No React (in package.json but unused — legacy from Vite scaffolding, safe to remove). Vite is dev server/bundler only.

```
npm run dev    → starts Vite dev server
npm run build  → production bundle
```

---

## File Structure

```
src/
  state.js        (36 lines)  — Global state object S, zoom, resource engine
  constants.js    (31 lines)  — Dimensions, physics, seeded RNG, color lerp
  floors.js       (84 lines)  — 10 floor definitions, modules, themes, object/NPC data
  npcs.js         (95 lines)  — Name pools, appearance palettes, dialogue trees
  world.js        (49 lines)  — World generation (floors, stairs, objects, NPCs, suits, cranes)
  main.js        (154 lines)  — Game loop, player physics, elevator state machine, NPC AI
  render.js      (567 lines)  — THE BIG ONE. Sky, parallax, tower, characters, modules, prompts
  panel.js        (95 lines)  — Build panel (desktop + mobile), module placement/selling
  input.js        (27 lines)  — Keyboard + touch input, zoom slider
  save.js         (32 lines)  — localStorage save/load (key: spacetower_v9c)
  sound.js        (73 lines)  — Web Audio API synth, procedural SFX, ambient drone
  compendium.js  (205 lines)  — Character collection UI, mini-sprite renderer, dialogue log
index.html       (149 lines)  — All CSS (inline <style>), DOM structure, UI layout
```

Total: ~1450 lines JS + 149 lines HTML.

---

## Architecture

### State
Single mutable object `S` from `state.js`. No immutability, no reducers. Everything reads/writes directly.

Key paths:
- `S.player` — position, velocity, state, appearance, hunger, political power
- `S.floors[]` — floor collision data
- `S.modules[floor][block]` — placed buildables (null = empty)
- `S.npcs[]` / `S.workers[]` — NPCs and rooftop workers
- `S.res` — `{energy, credits, population}`
- `S.sat` — satisfaction (0–100)
- `S.cam` — camera position + target
- `S.litFloors` — Set of unlocked floor indices
- `S.compendium.entries` — discovered character data

### Game Loop
`requestAnimationFrame` → `update()` → `draw()` → `renderPanel()`

### World Generation
`genWorld()` in world.js. Seeded RNG (`sr()`, `ri()`, `pk()`). Same seed = same layout.

### Rendering
Canvas 2D. No sprites. Procedural drawing. Parallax via camera transform nesting:
- City skyline: 0.35x
- Treeline: 0.6x
- Tower + characters: 1x

### UI Split
Canvas (top 58%) for game world. DOM (bottom 42%) for build panel, elevator, compendium, HUD. Mobile: touch controls + tabbed panel.

---

## Player-Level Resources

### Hunger
- 0–100, starts full. Decays ~1 per 15 seconds.
- Refills at Floor 5 restaurant.
- < 30: movement slows, screen dims. = 0: significant penalties.
- Never kills. Pulls player toward Floor 5 (RGB threshold).

### Political Power
Composite stat. How much the tower trusts you. Multiplier, not spendable.

**Inputs:** hunger, satisfaction, NPC conversations, module choices, restaurant visit recency, Floor 8 outcome.

**Outputs (MVP):** credit income multiplier (0.5x–1.5x), The Keeper's disposition.

**Post-MVP:** NPC dialogue depth, funding costs, ambient behavior.

---

## Key Systems

### The Block System
12 blocks per floor. `PG=300`. Blocks 3/7/11 = windows (`isWinBlock`). Block 6 = elevator (`isElevBlock`). 9 buildable per floor.

### Module System
`FD[]` in floors.js. Each module: `{id, nm, ic, col, cost, prod, sat, sell, desc, eff?}`. Stored in `S.modules[fi][bi]`. `recalc()` updates totals. Credit income modified by political power multiplier.

### Floor 5: The Restaurant
RGB threshold. In the sim: normal floor with modules/NPCs. Special zone triggers transition to 3D restaurant interior (page navigation, state via localStorage).

### Floor 8: The Reckoning
Builders vs. Suits mini-game. Triggers when Floor 8 is funded. Outcome feeds political power and Keeper context. Designed to be replayable and delightful. Exact mechanics TBD — principles: physical, clear outcome, identity-driven (not good vs. bad).

### Floor 10: The Keeper
The only LLM-powered character in the sim. Mayor of Segment 1. Corporate Merlin — suit with a too-long beard, walking stick that could be a staff, stars on his tie. Way too poetic about leaving Earth. Gates Segment 2 via conversation/debate. Difficulty scales with tower health. Fed full game context via BYOK connection.

### NPC Types
| Type | Code | Renderer | Features |
|------|------|----------|----------|
| Casual human | `c` | `drawCasual()` | genAppearance(), skin/hair/clothing, male/female |
| Business | `b` | `drawBiz()` | Suit palette, springy walk |
| Construction worker | `w` | `drawWorker()` | Orange vest, hardhat |
| Alien | `a` | `drawBlob()` | Single eye, antenna, bright colors |

All have `convo` (3 dialogue functions) and `ci` (conversation index). Sequential: greeting → context → the real thing. The Keeper breaks this pattern — he has infinite dialogue via LLM.

### Character Drawing
- Characters: flat color fills. No gradients. Deliberate.
- Modules: detailed, animated. Smoke, charge, growing plants.
- The contrast is intentional.

### Elevator
State machine: `idle` → `closing` → `traveling` (30 frames) → `opening` → `idle`.

### Satisfaction Decay
Every 180 frames. Rate = `0.3 + litFloors * 0.15`. Feeds political power.

### Save System
localStorage `spacetower_v9c`. Modules, lit floors, credits, satisfaction, compendium. Needs hunger/PP/Floor 8 outcome once implemented. Auto-saves every ~60 seconds. Also read by other surfaces via localStorage.

### Sound
Web Audio oscillator synth. Procedural SFX + altitude-aware ambient drone.

### Compendium
Character collection. Mini canvas sprites, dialogue history, type filters. 36 discoverable names.

---

## Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `TW` | 3600 | Tower width |
| `FH` | 160 | Floor height |
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
| `PH` | 0.42 | Panel height fraction |

---

## Conventions

### Code Style
Terse constants (`S`, `X`, `TW`), descriptive functions (`drawCasual`, `canAfford`). Semicolons. Single quotes. Dense formatting. ES modules, named exports, `'use strict'`.

### Adding a Module
1. Add to `FD[floor].mods` (floors.js)
2. Add drawing case in `drawMod()` (render.js)
3. Done. `recalc()`, panel, save/load work automatically.

### Adding an NPC Type
1. Name pool + dialogue in npcs.js
2. Spawn logic in `genWorld()` (world.js)
3. Draw function in render.js
4. Add to render sorting (render.js ~534-546)
5. Sprite in `_drawSprite()` (compendium.js)

### Adding Player Resources
1. Add to `S.player` (state.js)
2. Decay/update in `update()` (main.js)
3. Display in index.html + panel.js/render.js
4. Save/load in save.js (bump version key)
5. Wire multipliers into `recalc()` or income tick

---

## What Not to Break

- `S` object structure — everything reads it
- `isWinBlock()` / `isElevBlock()` — guard all placement
- Camera save/restore nesting in `draw()` — parallax depends on it
- `recalc()` after module changes
- Seeded RNG sequence — changing order changes every world
- Save key `spacetower_v9c` — bump for new fields
- Floor 5 as RESTAURANT — RGB threshold
- Floor 8 as STORAGE — Reckoning event floor
- Floor 10 as COMMAND — The Keeper's floor

---

## Design Principles

- **Discovery over instruction.** No tutorials. If it needs explaining, redesign it.
- **Character dignity.** Every NPC is a person. Three-line reveals: greeting → context → the real thing.
- **The RGB boundary is sacred.** The sim is handcrafted. The RGB is a place you enter. They don't contaminate each other. The Keeper is the rare exception — one living thing in a museum.
- **Hunger as rhythm.** Mechanical need becomes narrative gateway.
- **Political power as felt leadership.** Your choices shape how the tower responds.
- **The player is the builder.** Hardhat. Strong. Gets hungry. Has standing. Built this thing by hand.
- **Floor 8 is about identity.** Builders vs. suits. Who are you?
- **The Keeper is about readiness.** Can you lead people higher? He calibrates to your answer.
- **BYOK as culmination.** You earn the right to bring your own mind into the world.
