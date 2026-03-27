extends Node

# Player
var player := {
	"x": 0.0, "y": 0.0, "vx": 0.0, "vy": 0.0,
	"hunger": 100.0, "political_power": 0.0,
	"facing_right": true, "state": "idle"
}

# Tower
var lit_floors: Array[bool] = []
var modules: Array[Array] = []
var buildout: Array[Dictionary] = []

# Economy
var credits: int = 500
var satisfaction: float = 50.0
var food_chain_complete: bool = false
var builder_happiness: float = 0.0

# NPCs
var npcs: Array[Dictionary] = []
var compendium: Dictionary = {"entries": {}}

# Reckoning
var reckoning_outcome: String = ""
var builder_color: Color = Color.WHITE

# Block claims — keyed by "claim_{floor}_{block}" → progress float (0.0–1.0)
var block_claims: Dictionary = {}
# Block claim owners — keyed by "claim_{floor}_{block}" → owner string
var block_claim_owners: Dictionary = {}

# Flags
var panel_floor: int = 0
var panel_dirty: bool = true

# Seeded RNG — dedicated instance for world generation
var world_rng := RandomNumberGenerator.new()

func _ready() -> void:
	world_rng.seed = 42
	_init_tower()

func _init_tower() -> void:
	var c: Node = get_node("/root/Constants")
	lit_floors.clear()
	modules.clear()
	buildout.clear()
	for i in range(c.NUM_FLOORS):
		lit_floors.append(false)
		modules.append([])
		for j in range(c.BLOCKS_PER_FLOOR):
			modules[i].append(null)
		buildout.append({"stage": 0})

## Seeded random float 0.0–1.0 (replaces JS sr())
func sr() -> float:
	return world_rng.randf()

## Seeded random pick from array (replaces JS ri())
func ri(arr: Array) -> Variant:
	return arr[world_rng.randi() % arr.size()]
