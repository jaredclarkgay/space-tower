# Space Tower — State of the Build (March 2026)

## What This Is
A tower-building game where you ARE the builder — hardhat, physically strong, constructing a space elevator by hand. Two playable surfaces exist today: the **Exterior** (Three.js third-person) and the **Sim** (Canvas 2D cross-section management). Both are views of the same tower.

Segment 1 is called "Goodbye Earth" — floors 1–10, three-act structure: Build (1–4), Discover (5–8), Prove (9–10).

**The repo is live at**: [space-tower on GitHub Pages]
**Stack**: Vanilla JS, no framework. Vite for dev/build. ~5,000 lines total.

---

## What's Built and Working

### Exterior (Three.js, ~3,500 lines)
- **Player**: WASD movement, Shift sprint, charge-jump with 1/2/3 mid-air flips, ladder climbing (4 ladders on tower faces), material carrying
- **Tower**: Procedural scaffold — perimeter beams, 4 corner columns, open center shaft. Height scales with sim progress (built-height system via localStorage)
- **City**: 240 procedural buildings at two radii, ring roads + 4 spoke roads, animated building windows, satellite orbits, constellation system
- **Vehicles**: 8 business people with cars that drive along roads (spoke → inner ring → parking), 2 static semi trucks with workers. All vehicles are solid — player can land on them
- **NPCs**: 4 rooftop construction workers with height-aware dialogue (10 levels × 3 lines each, distinct personalities: Rodriguez/family legacy, Kim/physics nerd, Murphy/pragmatist, Okafor/philosopher). 4 semi truck workers. 8 business people (talkable when on foot)
- **Collision**: 7-system framework — tower walls, beams (one-way platforms), roof plate, foundation, columns, site objects, vehicles
- **Camera**: Orbital for title screen, Mario Kart-style follow during gameplay, smooth transitions between modes
- **Transitions**: Cinematic title→exterior flow with tower dissolve, night→day sky, UI fades. Reverse transition back to menu
- **Construction site**: Porta-potty, generator, toolbox, lumber, cones, rope. Crane on rooftop with animated cable

### Sim Interior (Canvas 2D, ~1,450 lines)
- **10 floors fully defined**: Lobby, Quarters, Garden, Research, Restaurant, Lounge, Observation, Storage, Observatory, Command. Each has 4 placeable modules, unique theme colors, static objects, NPC configs
- **5-stage buildout per floor**: Power On → Structure → Systems → Furnish → Activate. Left-to-right cascade animation with sequential element reveals (lights appear dark at Structure, light up at Systems)
- **Module system**: 40 modules total, all with animated procedural rendering (growing plants, blinking servers, dripping irrigation, steam from kitchen burners, floating music notes, etc.)
- **Characters**: 4 NPC types (casual, business, worker, alien), procedurally varied appearances, 3-line sequential dialogue (greeting → context → the real thing). ~36 discoverable names
- **NPC arrival system**: Queue-based state machine — NPCs walk through door, ride elevator, walk to their spot when a floor completes
- **Elevator**: Full state machine (idle → closing → traveling → opening). Panel with all 10 floors, keyboard navigation
- **Player always enters through elevator doors** — natural entry point, doors animate open on approach
- **Physics**: Gravity, charge-jump with flip, stair climbing, floor drop-through mechanic
- **Floor activation events**: Each floor has a unique visual celebration at stage 5 (particles, shakes, flashes, cascading LEDs on Command floor)
- **Compendium**: Character collection UI (Tab to open), mini sprites, dialogue log, type filters, X/36 counter
- **Persistence**: Auto-save every 60s. Saves buildout progress, modules, credits, satisfaction, compendium entries. Save key: `spacetower_v12`
- **Audio**: Web Audio synth — procedural SFX for building, talking, walking, elevator, warnings, plus altitude-aware ambient drone. MIDI radio system wired but playback unclear
- **Sprint**: Shift doubles walk speed in both exterior and sim
- **UI**: Dark theme, gold accents, monospace font. Split canvas (68% game) / DOM panel (32% build UI). Mobile touch controls. Radio widget. Location toggle (IN/OUT between exterior and sim)

### Set Pieces (Newly Implemented)
- **Floor 8: The Reckoning** — Builders vs. Suits territory-claiming mini-game. State machine (IDLE→INTRO→COUNTDOWN→PLAYING→RESULT→DONE). 2 AI suit NPCs with independent cooldowns walk to empty blocks and claim them. Player claims blocks with E. 60-second timer. 4 builder modules (orange/construction) vs 4 suit modules (navy/corporate). Outcome saved. Rematch bell for cosmetic replays.
- **Floor 10: The Keeper** — Scripted NPC encounter. Proximity-triggered camera zoom to 2x. Typewriter dialogue system with 5 exchanges responding to tower state (floors built, satisfaction, Floor 8 outcome). Purple suit, gold stars, long beard, walking stick. Vignette overlay with gold-bordered dialogue box. Return visits get a single dismissive line.
- **Floor 5: RGB Door** — Visual tease. Glowing door at block 2 with center crack light, warm floor glow, floating particles. 5 cycling poetic proximity texts ("The warmth is real. The door is not ready." etc). Ambient 80Hz hum when near. Not yet enterable.

### Integration Between Surfaces
- Sim buildout data flows to exterior via localStorage (built height determines accessible tower height, ladder reach, roof position)
- Tab key or location toggle switches between sim and exterior (page reload with localStorage flag)
- Walking through front door in either direction transitions between surfaces
- Grace periods prevent key bleed-through during transitions

---

## What's NOT Built Yet

### Systems
- **Hunger** (0–100, decays over time, refills at Floor 5 restaurant) — not implemented
- **Political Power** (composite stat from choices, affects credit multiplier and Keeper disposition) — not implemented
- **Satisfaction decay** (should erode over time, rate scales with tower size) — satisfaction exists but is frozen at 50
- **Credit income** — no automatic generation, only manual module buy/sell
- **Energy & Population** — mentioned in design doc, not tracked

### Remaining Set Piece Work
- **Floor 5: RGB interior** — Door is visible and atmospheric but not enterable. No 3D restaurant, no BYOK, no LLM integration yet.
- **Floor 10: Keeper LLM** — Currently scripted dialogue only. Needs BYOK integration for the real encounter where difficulty scales with tower health.

### Polish Gaps
- No footstep/impact/ladder SFX in exterior
- Exterior building doesn't feed back to sim (one-way data flow only)
- No persistent exterior state (player position resets on reload)
- Suit pickup exists but doesn't affect gameplay beyond visual toggle
- Music MIDI loading may not be fully working

---

## Design Direction: Speed-Run Build Loop

The current build loop is a clicker: walk to a build marker, press E, watch a sweep animation, repeat. Five stages per floor, ten floors — 50 identical interactions with zero skill expression. The traversal between build points is more interesting than the building itself. We're considering reframing building as a speed-run.

### The Core Shift: Building = Presence, Not Clicking

Instead of pressing E at a build marker, a floor's stage advances while the player stands on (or near) the build point. A radial fill or progress ring charges up over ~2 seconds. Leave early and progress resets. This means:

- Building requires you to GET somewhere and STAY there briefly
- The skill is in the routing — how fast can you reach each build point?
- No E-mashing. The interaction is spatial, not button-driven.
- Each stage's build point could be in a different location on the floor (requiring horizontal traversal too, not just vertical)

### The Tower as Vertical Obstacle Course

The player's route through the tower is the core gameplay loop. First playthrough: fumbling with the elevator, walking up stairs, cautious jumps. By the third run: chaining charged jumps floor-to-floor, dropping through slabs to skip sections, never touching the elevator. Mastery is legible — you can see yourself getting faster.

The elevator becomes a trap for new players. It works, it's safe, and it's painfully slow. Skilled players learn to jump past it entirely. This is a natural teaching curve with no tutorial needed.

### Timer and Pacing

A subtle timer in the corner. No leaderboard, no ranking — just a number. Seeing "4:32" makes you wonder if you could do "4:00." The timer pauses during narrative events (Floor 5, Floor 8, Floor 10) so speed-running and story don't compete.

Personal best is stored. On replay, a ghost of your previous run could appear (or just the time to beat). The tower remembers how fast you've built it before.

### Narrative Contrast

The three-act structure benefits from speed-run pacing:

**Act 1 (Floors 1-4): Build.** Pure speed. Learn the movement. Get faster. The tower rises and you feel like you're earning it with your hands and your legs, not with button presses.

**Act 2 (Floors 5-8): Discover.** The speed-run STOPS. Floor 5 pulls you in with hunger — you have to eat. Floor 8 throws a mini-game at you. These interruptions hit harder because you were in flow. The contrast between frantic vertical traversal and sudden stillness is the feeling.

**Act 3 (Floors 9-10): Prove.** You're almost done. The last two floors might be the hardest to reach (build points in awkward positions, requiring precise jumps). Then The Keeper stops you entirely. You were moving so fast, and now you have to sit and talk. The pacing whiplash is intentional.

### Segment 2 Payoff

If players speedrun Segment 1, replaying it becomes a hook. "Goodbye Earth" means something different when you're flying through it in 90 seconds vs. the first time at 8 minutes. The story beats are the same but the player's relationship to the tower has changed — it's no longer unknown, it's YOUR tower, and you know every inch of it.

### What Would Change in Code

Relatively surgical changes to the existing codebase:

1. **Build point behavior**: Replace E-press trigger with proximity timer. Player stands near build point → radial progress fills → stage advances. Leaving resets progress. The `inter.t === 'build'` handler in game-init.js becomes a proximity check instead of a keypress.

2. **Build point placement**: Each stage's build point should be at a different horizontal position on the floor. Currently they're all at the same scaffold location. Spread them across the floor's buildable blocks so the player has to traverse horizontally too.

3. **Timer system**: Add a run timer to state (`S.run.time`, `S.run.pb`, `S.run.paused`). Display in render.js. Pause during narrative events. Save PB to localStorage.

4. **Stage sweep**: The existing reveal animation (left-to-right block sweep) stays — it's satisfying and gives visual feedback that building happened. It just triggers from proximity completion instead of E-press.

5. **Movement tuning possibilities**:
   - Wall-jumps off tower edges (interior walls at TL/TR)
   - Momentum preservation on landing (currently velocity zeroes on floor contact)
   - Coyote time (brief window to jump after walking off a ledge)

6. **Elevator reframing**: No mechanical change needed. It's already slow (~30 frames travel time). Speed-runners will naturally discover that jumping is faster.

### Open Questions

- **Should build points be visible from a distance?** A beacon or particle effect drawing your eye to the next target would help routing.
- **Multiple build points per stage?** If each stage required building at 2-3 points on the same floor, it adds variety but might slow pace.
- **Danger/failure?** Currently no penalty for falling. A time penalty (not progress loss) could add stakes.
- **Sound design for speed**: Escalating audio — tempo or intensity that rises with consecutive fast builds.

---

## Architecture Quick Reference

```
src/
  state.js        — Global state object S, zoom, resource engine
  constants.js    — Dimensions, physics, seeded RNG
  floors.js       — 10 floor definitions, modules, themes, buildout stages
  npcs.js         — Name pools, appearance palettes, dialogue trees
  world.js        — World generation (floors, stairs, objects, NPCs)
  game-init.js    — Game loop, elevator, NPC arrivals, build interaction
  render.js       — THE BIG ONE. Sky, parallax, tower, characters, modules
  panel.js        — Build panel UI (desktop + mobile)
  input.js        — Keyboard + touch input
  save.js         — localStorage save/load
  sound.js        — Web Audio synth, procedural SFX
  compendium.js   — Character collection UI
  music.js        — MIDI radio system
  radio-ui.js     — Radio widget DOM wiring
  floor8-game.js  — Floor 8 mini-game state machine, AI, modules
  keeper.js       — Floor 10 Keeper encounter, zoom, dialogue

  title/
    title-main.js       — 3D scene, camera, render loop
    title-city.js       — City geometry, tower, vehicles, buildings
    title-exterior.js   — Player, collision, ladders, interaction, NPCs
    title-transition.js — Cinematic title↔exterior transitions
    title-ui.js         — DOM overlays, radio, hints, menus
```

### Key Constants
| Constant | Value | Meaning |
|----------|-------|---------|
| TW | 3600 | Tower width (sim) |
| FH | 160 | Floor height (sim) |
| NF | 10 | Number of floors |
| BPF | 12 | Blocks per floor |
| PG | 300 | Block width |
| ELEV_X | 150 | Elevator center |
| TC.width | 75 | Tower width (exterior) |
| TC.floorH | 3.333 | Floor height (exterior) |
| OUTER_EDGE | 37.75 | Tower wall collision edge |

### Design Principles (Sacred)
- **Discovery over instruction** — no tutorials
- **Character dignity** — every NPC is a person with a 3-line reveal
- **The RGB boundary is sacred** — sim is handcrafted, RGB is a separate world you enter through doors
- **The player is the builder** — hardhat, strong, gets hungry, has standing
- **BYOK as culmination** — you earn the right to bring your own mind into the world
- **The Keeper is the only LLM character in the sim** — rare, special, fundamentally different from every scripted NPC
