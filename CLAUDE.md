# CLAUDE.md — Space Tower (Godot)

## What This Is

Space Tower is a tower-building game where you ARE the builder — a physically strong human in a hardhat constructing a space elevator by hand. You build the tower on the outside (launching crates, climbing, driving machines) and explore what you've created on the inside (platforming through floors, discovering NPCs and story).

This is the Godot 4 port, targeting Steam distribution and visual quality. The original browser prototype (vanilla JS, Canvas 2D, Three.js) is preserved as a reference implementation — mechanics were designed and playtested there first. This repo rebuilds them in Godot's native systems.

The first 10-floor segment is called "Goodbye Earth" and explores departure and loss. Three-act structure: Build (floors 1–4), Discover (floors 5–8 with The Reckoning), Prove (floors 9–10 with The Keeper).

---

## Tech Stack

**Godot 4.x** with GDScript. No C#, no GDExtension, no plugins unless explicitly added.

```
# Run from terminal
godot --path . --editor        # open editor
godot --path . --debug         # run game
godot --path . --export-all    # build all export presets
```

GitHub for version control. All `.tscn`, `.gd`, `.tres` files are text-based and git-friendly.

---

## Project Structure

```
space-tower/
├── project.godot                 # Project settings, autoloads, input map
├── CLAUDE.md                     # This file
│
├── agent/                        # Builder Agent — self-improving knowledge base
│   ├── project_knowledge.json    # What the agent knows about the game
│   ├── competency_map.json       # What the agent knows about its own capabilities
│   ├── failure_log.json          # Categorized learning journal
│   ├── request_queue.json        # Prioritized asks for Jared
│   ├── session_log.md            # Append-only work session log
│   └── rules/                    # Self-authored skill files (accumulate over time)
│
├── autoloads/
│   ├── game_state.gd             # Global state singleton (replaces S object)
│   ├── constants.gd              # Dimensions, physics values, enums
│   ├── save_manager.gd           # Save/load to user://
│   └── audio_manager.gd          # Music + SFX bus routing
│
├── data/
│   ├── floors.tres               # Floor definitions: names, modules, flanks, stages
│   ├── npcs.tres                 # Name pools, palettes, dialogue trees
│   ├── building_lore.json        # Title screen building names/lore (80 entries)
│   └── gene.tres                 # Gene's appearance, floor appearances, dialogue
│
├── scenes/
│   ├── main.tscn                 # Entry point — routes to title or game
│   │
│   ├── title/
│   │   ├── title_screen.tscn     # 3D city skyline, menu, transitions
│   │   ├── title_camera.gd       # Orbital camera with spring physics
│   │   ├── city_builder.gd       # Procedural building generation
│   │   └── sky_manager.gd        # Day/night transition, stars, atmosphere
│   │
│   ├── exterior/
│   │   ├── exterior.tscn         # 3D gameplay — tower climbing, seesaw, crane, bulldozer
│   │   ├── player_3d.tscn        # Third-person character controller
│   │   ├── scaffolding.gd        # Seesaw crate launch game
│   │   ├── crane.tscn            # Playable crane with pendulum physics
│   │   └── bulldozer.tscn        # Driveable bulldozer with terrain deformation
│   │
│   ├── sim/
│   │   ├── sim.tscn              # 2D cross-section — the tower interior
│   │   ├── player_2d.tscn        # Side-on platformer character
│   │   ├── floor_scene.tscn      # Reusable floor template (12 blocks)
│   │   ├── npc.tscn              # Base NPC scene (all types)
│   │   ├── module_renderer.gd    # Per-module animated art
│   │   ├── elevator.gd           # Elevator state machine
│   │   ├── parallax_bg.tscn      # City skyline (0.35x) + treeline (0.6x)
│   │   └── camera_2d.gd          # Follow camera with altitude-aware behavior
│   │
│   ├── control_room/
│   │   ├── control_room.tscn     # Basement console room
│   │   └── console_screen.gd     # Wireframe tower display, quips, buttons
│   │
│   ├── reckoning/
│   │   ├── reckoning.tscn        # Floor 8 builders vs. suits event
│   │   ├── reckoning_ai.gd       # Builder/suit squad AI
│   │   └── reckoning_ui.gd       # Score, timer, color pick
│   │
│   ├── keeper/
│   │   ├── keeper.tscn           # Floor 10 Gene encounter
│   │   ├── keeper_llm.gd         # HTTP calls to OpenRouter / Anthropic API
│   │   ├── keeper_scripted.gd    # Fallback dialogue without API key
│   │   └── keeper_ui.tscn        # Chat overlay
│   │
│   └── rgb/
│       └── rgb_boundary.gd       # RGB entry point — context payload builder
│
├── ui/
│   ├── build_panel.tscn          # Module placement panel
│   ├── compendium.tscn           # Character collection
│   ├── elevator_panel.tscn       # Floor selector
│   ├── hud.tscn                  # Credits, satisfaction, hunger display
│   ├── radio.tscn                # Music player widget
│   └── theme.tres                # Global UI theme (terminal green aesthetic)
│
├── assets/
│   ├── sprites/                  # Character sprite sheets (Aseprite exports)
│   ├── audio/                    # Music (MIDI or OGG) + SFX
│   └── shaders/                  # Stylized rendering shaders
│
└── export_presets.cfg            # Steam (Windows/Mac/Linux), Web (WASM), itch.io
```

---

## Architecture

### State — `GameState` autoload (replaces `S` object)

Single global autoload. Everything reads/writes directly, same pattern as the JS version.

```gdscript
# autoloads/game_state.gd
extends Node

# Player
var player := {
    "x": 0.0, "y": 0.0, "vx": 0.0, "vy": 0.0,
    "hunger": 100.0, "political_power": 0.0,
    "facing_right": true, "state": "idle"
}

# Tower
var lit_floors: Array[bool] = []      # which floors are activated
var modules: Array[Array] = []         # modules[floor][block] — null or module dict
var buildout: Array[Dictionary] = []   # per-floor {stage: 0-3}

# Economy
var credits: int = 500
var satisfaction: float = 50.0
var food_chain_complete: bool = false
var builder_happiness: float = 0.0

# NPCs
var npcs: Array[Dictionary] = []
var compendium: Dictionary = {"entries": {}}

# Reckoning
var reckoning_outcome: String = ""     # "", "builders", "suits"
var builder_color: Color = Color.WHITE

# Flags
var panel_floor: int = 0
var panel_dirty: bool = true
```

### Scene Transitions

The browser version uses localStorage + page reloads to switch between exterior and sim. Godot uses `SceneTree.change_scene_to_packed()` or additive scene loading. State persists in the `GameState` autoload across transitions.

```
Title Screen → (forward transition) → Exterior
Exterior ↔ Sim (Tab key or walk through door)
Sim → Control Room (elevator to floor -1)
Sim → Keeper (proximity trigger on floor 10)
Sim → RGB (Floor 5 door — future)
```

### Input Map

Define in `project.godot` under `[input]`:

```
move_left:  A, Left, Gamepad Left
move_right: D, Right, Gamepad Right
jump:       Space, W, Up, Gamepad A
interact:   E, Gamepad X
sprint:     Shift, Gamepad L2
drop:       S, Down, Gamepad B
tab_toggle: Tab                        # switch exterior ↔ sim
escape:     Escape
```

### Seeded RNG

Godot has `RandomNumberGenerator` with `seed` property. Replaces the JS `sr()` pattern:

```gdscript
var rng := RandomNumberGenerator.new()
rng.seed = 42

# Equivalent to sr() — returns 0.0 to 1.0
func sr() -> float:
    return rng.randf()

# Equivalent to ri(arr) — pick from array
func ri(arr: Array) -> Variant:
    return arr[rng.randi() % arr.size()]
```

**Critical:** Same seed must produce same world. Use a dedicated RNG instance for world generation, never the global one.

---

## Key Systems — Godot Equivalents

### Player (2D Sim)

`CharacterBody2D` with `move_and_slide()`. Replaces hand-rolled collision in main.js.

```gdscript
# Core movement values (from browser version)
const GRAVITY = 0.5        # per frame → convert to per-second for Godot
const JUMP_VEL = -12.0     # charged jump is stronger
const MOVE_SPEED = 4.0
const WALL_SLIDE_SPEED = 2.0
```

Features to implement:
- Charged jump (hold jump → stronger launch)
- Wall slide (against tower edges, slow fall)
- Wall jump (push off wall)
- Charged drop (hold down to fall through multiple floors)
- Sprint (Shift key, faster horizontal)

### Floor System

Each floor is a scene instance with 12 block slots. Block types:

| Blocks | Type | Notes |
|--------|------|-------|
| 0, 1, 2, 4, 8, 9, 10 | Buildable | Can place modules |
| 3, 7, 11 | Window | `is_win_block()` — not buildable |
| 6 | Elevator | `is_elev_block()` — not buildable |
| 5, 7 | Flanks | Fixed identity per floor (corner store, diner, etc.) |

### NPCs

Each NPC is an instance of `npc.tscn` with configuration:

```gdscript
@export var npc_type: String = "casual"  # casual, business, worker, alien
@export var npc_name: String = ""
@export var dialogue: Array[String] = []
@export var floor_index: int = 0
@export var is_gene: bool = false
```

NPC AI: simple state machine (`idle`, `walking`, `talking`). Patrol within floor bounds. 3-line sequential dialogue on interaction.

### Modules

Resource-based. Each module is a dictionary from `floors.tres`:

```gdscript
{
    "id": "generator",
    "name": "Generator",
    "icon": "⚡",
    "color": Color("#5a6a3a"),
    "cost": 80,
    "satisfaction": 1,
    "sell_price": 40,
    "description": "Diesel backup. Rumbles."
}
```

Module art: animated `Sprite2D` or custom `_draw()` per module type. The browser version uses per-module draw cases in render.js — same pattern, Godot's `_draw()` method.

### The Keeper — LLM Integration

```gdscript
# keeper_llm.gd
func call_llm(messages: Array) -> String:
    var connection = _load_connection()  # from user:// storage
    if not connection:
        return ""  # fall back to scripted

    var http = HTTPRequest.new()
    add_child(http)

    var headers = []
    var body = {}

    if connection.provider == "openrouter":
        headers = ["Content-Type: application/json",
                   "Authorization: Bearer " + connection.api_key]
        body = {
            "model": connection.model or "anthropic/claude-sonnet-4-20250514",
            "messages": messages,
            "max_tokens": 300
        }
        http.request("https://openrouter.ai/api/v1/chat/completions",
                     headers, HTTPClient.METHOD_POST, JSON.stringify(body))

    elif connection.provider == "anthropic":
        headers = ["Content-Type: application/json",
                   "x-api-key: " + connection.api_key,
                   "anthropic-version: 2023-06-01"]
        body = {
            "model": connection.model or "claude-sonnet-4-20250514",
            "messages": messages,
            "max_tokens": 300
        }
        http.request("https://api.anthropic.com/v1/messages",
                     headers, HTTPClient.METHOD_POST, JSON.stringify(body))

    var result = await http.request_completed
    http.queue_free()
    return _parse_response(result, connection.provider)
```

System prompt built by `build_keeper_context()` — same logic as browser version, reads from `GameState`.

### Save System

```gdscript
# save_manager.gd
const SAVE_PATH = "user://spacetower_save.json"
const SAVE_VERSION = 1

func save_game():
    var data = {
        "version": SAVE_VERSION,
        "ts": Time.get_unix_time_from_system(),
        "credits": GameState.credits,
        "satisfaction": GameState.satisfaction,
        "lit_floors": GameState.lit_floors,
        "modules": GameState.modules,
        "buildout": GameState.buildout,
        "compendium": GameState.compendium,
        "reckoning_outcome": GameState.reckoning_outcome,
        "builder_color": GameState.builder_color.to_html(),
    }
    var file = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
    file.store_string(JSON.stringify(data))

func load_game() -> bool:
    if not FileAccess.file_exists(SAVE_PATH):
        return false
    var file = FileAccess.open(SAVE_PATH, FileAccess.READ)
    var data = JSON.parse_string(file.get_as_text())
    if not data:
        return false
    _migrate(data)
    _apply(data)
    return true
```

Save location: `user://` maps to platform-appropriate directories. On Steam, integrates with Steam Cloud via export settings.

---

## Floor Definitions

Ported directly from `floors.js`. 10 floors, fixed identities:

| Floor | Name | Left Flank | Right Flank | Key Feature |
|-------|------|-----------|-------------|-------------|
| 0 | LOBBY | lobby-desk | lobby-desk | Entry point |
| 1 | QUARTERS | corner-store | diner | Food chain start |
| 2 | GARDEN | seed-bank | tool-shed | Planters, food production |
| 3 | RESEARCH | supply-closet | whiteboard-room | Workstations, servers |
| 4 | RESTAURANT | host-stand | bar | **RGB threshold (Floor 5 in 1-indexed)** |
| 5 | LOUNGE | reading-room | music-room | Reading nooks, chess |
| 6 | OBSERVATION | telescope-alcove | records-room | Panoramic views |
| 7 | STORAGE | loading-dock | inventory-room | **Reckoning trigger** |
| 8 | MEDICAL | pharmacy | waiting-room | First aid, care |
| 9 | COMMAND | comms-closet | records-room | **The Keeper / Gene** |

**Important:** Code uses 0-indexed floors. Player-facing text uses 1-indexed ("Floor 1" = index 0).

---

## Faction Rules

Two factions, one linguistic rule:
- **Suits** always say **"the work"** when referring to tower activity.
- **Builders** always say **"the job"** when referring to tower activity.

This is sacred. Never cross them. It's the tell the player eventually notices.

---

## Key Characters

### Gene / The Keeper
- Recurring: appears as `is_gene` business NPC on floors 1, 3, 5, 7 (0-indexed)
- Dialogue: forgettable bureaucrat. Designed to be overlooked, devastating in hindsight.
- Hidden during Reckoning.
- Floor 10 (index 9): revealed as The Keeper. Deep purple suit, gold star tie, too-long beard.
- LLM-powered conversation. Difficulty scales inversely with tower health.
- Health score: floors 40%, satisfaction 30%, modules 15%, NPCs met 15%.

### Floor Leaders (Reckoning)
Rodriguez (F1), Kim (F2), Paz (F3), Murphy (F4), Okafor (F6), Tanaka (F7).

---

## Constants

Port from browser version. Godot uses real units (pixels for 2D, meters for 3D), so values will differ but relationships stay the same.

```gdscript
# constants.gd — extend or adjust as needed
const NUM_FLOORS := 10
const BLOCKS_PER_FLOOR := 12
const BLOCK_WIDTH := 64          # pixels in 2D sim (was 300 in browser)
const FLOOR_HEIGHT := 96         # pixels in 2D sim (was 160 in browser)
const FLOOR_SLAB := 4            # pixels (was 12 in browser)

# Window and elevator block indices
func is_win_block(bi: int) -> bool:
    return bi in [3, 7, 11]

func is_elev_block(bi: int) -> bool:
    return bi == 6
```

Exact pixel values should be tuned to Godot's coordinate system and target resolution (1920×1080 recommended).

---

## Conventions

### Code Style
GDScript standard: `snake_case` for functions and variables, `PascalCase` for classes and nodes, `UPPER_CASE` for constants. Type hints on all function signatures. Signals for decoupled communication.

### Adding a Module
1. Add entry to `data/floors.tres` under the appropriate floor
2. Add animated draw case in `module_renderer.gd`
3. Done — build panel, save/load, economy recalc work automatically

### Adding an NPC Type
1. Name pool + dialogue in `data/npcs.tres`
2. Add visual variant in `npc.tscn` (sprite sheet or draw override)
3. Spawn logic in world generation
4. Compendium sprite

### Adding Player Resources
1. Add to `GameState` autoload
2. Decay/update in sim's `_process()` or `_physics_process()`
3. Display in `hud.tscn`
4. Add to `save_manager.gd` (bump version)
5. Wire into `recalc()` if it affects economy

---

## What Not to Break

- `GameState` structure — everything reads it
- `is_win_block()` / `is_elev_block()` — guard all module placement
- Seeded RNG sequence — same seed must produce same world
- Save version — bump when adding new fields, include migration
- Floor 5 (index 4) as RESTAURANT — RGB threshold
- Floor 8 (index 7) as STORAGE — Reckoning trigger
- Floor 10 (index 9) as COMMAND — The Keeper's floor
- Faction vocabulary — suits say "the work", builders say "the job"
- Gene's floor appearances: indices 1, 3, 5, 7

---

## Design Principles

- **Discovery over instruction.** No tutorials. If it needs explaining, redesign it.
- **Character dignity.** Every NPC is a person. Three-line reveals: greeting → context → the real thing.
- **The RGB boundary is sacred.** The sim is handcrafted and deterministic. The RGB is alive. The Keeper is the rare exception.
- **Advancement through gameplay.** Players progress through physical action, not menus.
- **Fixed identity over catalog.** Every buildable block has a fixed identity and a direct causal consequence.
- **Exterior builds, interior rewards.** Physical construction happens outside. The sim interior is what you unlock.
- **The player is the builder.** Hardhat. Strong. Gets hungry. Built this thing by hand.
- **Floor 8 is about identity.** Builders vs. suits. Who are you?
- **The Keeper is about readiness.** Can you lead people higher?
- **BYOK as culmination.** Earn the right to bring your own mind into the world.

---

## Export Targets

### Steam (primary)
Windows, macOS, Linux. Native binaries. Steam SDK integration for:
- Achievements (future)
- Cloud saves (maps to `user://` automatically)
- Wishlists, community hub, store page

### Web / WASM (secondary)
Godot exports to HTML5 via Emscripten. Playable in browser. Host on itch.io for the free demo. Performance is good but not native — acceptable for a 2D sim, may need optimization for 3D exterior.

### itch.io
Both web (embedded) and desktop (downloadable) builds. Free demo of Segment 1.

---

## Builder Agent

The `agent/` directory contains a self-improving knowledge base. Before starting work, read these files:

- **`competency_map.json`** — Check confidence levels for the task's domain. If confidence is `low` or `blocked`, check `request_queue.json` for unresolved asks before proceeding.
- **`request_queue.json`** — Pending questions for Jared, prioritized by transfer value. If the top request is relevant to your current task and still pending, flag it.
- **`rules/`** — Self-authored skill files. Check for any rules relevant to the current task domain.

**After completing work**, propose updates:
- **`competency_map.json`** — Raise or lower confidence based on what happened. Add new `rules_learned` or `failure_patterns`.
- **`failure_log.json`** — Log any failures with root cause, resolution type (rule or request), and transfer value.
- **`request_queue.json`** — Add new requests if you identified gaps you can't close on your own. Prioritize by how many future tasks the answer would unblock.
- **`session_log.md`** — Append a session entry: what you attempted, outcome, decisions, uncertainties, proposed updates.
- **`rules/`** — If a failure pattern is self-correctable, write a rule file.

All proposed updates to agent files require Jared's approval. Never self-modify `project_knowledge.json`.

---

## Development Workflow

- **Claude Chat (this project):** Architecture, design, creative direction, briefs
- **Claude Code:** Implementation in GDScript, scene creation, shader writing. Reads this CLAUDE.md + the `agent/` directory.
- **Browser prototype:** Mechanics are explored in the JS version first when iteration speed matters, then ported to Godot via design brief.
- **Two-file handoff:** Design brief + reference file (often the working JS implementation) as paired context for Claude Code.
- **Godot editor:** Open for visual scene editing, running the game, and inspecting the scene tree. Claude Code edits files on disk; the editor auto-reloads.

### Session Boundaries

- **Starting a session:** When Jared says "starting a session" — read all `agent/` files (competency_map, request_queue, rules/, failure_log). Flag anything relevant to the current task: low-confidence domains, pending requests, applicable rules. Give a brief status summary.
- **Ending a session:** When Jared says "wrapping up" — propose updates to all agent files (competency changes, new failure entries, session log entry, new rules if patterns emerged). Commit and push the agent updates along with any pending code changes.

### Agent Self-Improvement Loop

Before starting work, check `agent/competency_map.json` for confidence levels and `agent/request_queue.json` for blocking requests. After finishing, propose updates to:
- `agent/competency_map.json` — confidence changes, new rules learned, new failure patterns
- `agent/failure_log.json` — anything that went wrong and why
- `agent/request_queue.json` — new asks for Jared, prioritized by transfer value
- `agent/rules/` — new skill files extracted from patterns
- `agent/session_log.md` — append a session entry

Jared approves, modifies, or rejects proposed updates. The agent never self-modifies `agent/project_knowledge.json` without approval.
