extends Node

const SAVE_PATH = "user://spacetower_save.json"
const SAVE_VERSION = 1

@onready var _gs: Node = get_node("/root/GameState")
@onready var _c: Node = get_node("/root/Constants")

func save_game() -> void:
	var data := {
		"version": SAVE_VERSION,
		"ts": Time.get_unix_time_from_system(),
		"credits": _gs.credits,
		"satisfaction": _gs.satisfaction,
		"lit_floors": _gs.lit_floors,
		"modules": _gs.modules,
		"buildout": _gs.buildout,
		"compendium": _gs.compendium,
		"reckoning_outcome": _gs.reckoning_outcome,
		"builder_color": _gs.builder_color.to_html(),
		"player": {
			"hunger": _gs.player.hunger,
			"political_power": _gs.player.political_power,
		},
	}
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(data))

func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	var data = JSON.parse_string(file.get_as_text())
	if not data:
		return false
	_migrate(data)
	_apply(data)
	return true

func _migrate(_data: Dictionary) -> void:
	# Future migrations go here
	pass

func _apply(data: Dictionary) -> void:
	_gs.credits = data.get("credits", 500)
	_gs.satisfaction = data.get("satisfaction", 50.0)
	_gs.reckoning_outcome = data.get("reckoning_outcome", "")
	var color_str: String = data.get("builder_color", "ffffff")
	_gs.builder_color = Color.from_string(color_str, Color.WHITE)

	var saved_player: Dictionary = data.get("player", {})
	_gs.player.hunger = saved_player.get("hunger", 100.0)
	_gs.player.political_power = saved_player.get("political_power", 0.0)

	var saved_lit: Array = data.get("lit_floors", [])
	for i in range(_c.NUM_FLOORS):
		if i < saved_lit.size():
			_gs.lit_floors[i] = saved_lit[i]

	var saved_modules: Array = data.get("modules", [])
	for i in range(_c.NUM_FLOORS):
		if i < saved_modules.size():
			_gs.modules[i] = saved_modules[i]

	var saved_buildout: Array = data.get("buildout", [])
	for i in range(_c.NUM_FLOORS):
		if i < saved_buildout.size():
			_gs.buildout[i] = saved_buildout[i]

	_gs.compendium = data.get("compendium", {"entries": {}})
