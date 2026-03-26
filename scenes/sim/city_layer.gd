extends Node2D

## Procedural city skyline layer drawn with _draw().
## Call configure() before adding to the scene tree.

const TOWER_LEFT := 0.0
const TOWER_RIGHT := 768.0  # FLOOR_WIDTH
const SPREAD := 200.0       # buildings extend slightly beyond tower for parallax travel

var _buildings: Array[Dictionary] = []
var _layer_type: String = "far"

func configure(layer_type: String, seed_val: int) -> void:
	_layer_type = layer_type
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_val
	_buildings.clear()
	match _layer_type:
		"far":
			_gen(rng, 25, 15.0, 45.0, 30.0, 140.0, 0.06, 0.10, 0)
		"mid":
			_gen(rng, 18, 25.0, 60.0, 50.0, 220.0, 0.08, 0.14, 5)
		"near":
			_gen(rng, 12, 35.0, 80.0, 80.0, 280.0, 0.10, 0.18, 10)
	queue_redraw()

func _gen(rng: RandomNumberGenerator, count: int,
		min_w: float, max_w: float, min_h: float, max_h: float,
		min_bright: float, max_bright: float, max_windows: int) -> void:
	for i in range(count):
		# Place buildings across the tower width + some spread for parallax
		var bx := rng.randf_range(TOWER_LEFT - SPREAD, TOWER_RIGHT + SPREAD)
		var bw := rng.randf_range(min_w, max_w)
		var bh := rng.randf_range(min_h, max_h)
		var brightness := rng.randf_range(min_bright, max_bright)
		var building: Dictionary = {
			"x": bx, "w": bw, "h": bh,
			"color": Color(brightness, brightness, brightness + 0.02),
			"windows": [] as Array[Dictionary]
		}
		if max_windows > 0:
			var win_count := rng.randi_range(2, max_windows)
			for _w in range(win_count):
				building.windows.append({
					"x": rng.randf_range(3.0, maxf(bw - 5.0, 4.0)),
					"y": rng.randf_range(4.0, maxf(bh - 8.0, 5.0)),
					"a": rng.randf_range(0.2, 0.6)
				})
		_buildings.append(building)

func _draw() -> void:
	# Buildings grow upward from ground (y=4 is floor 0 slab top)
	var ground_y := 4.0
	for b: Dictionary in _buildings:
		draw_rect(Rect2(b.x, ground_y - b.h, b.w, b.h), b.color)
		for w: Dictionary in b.windows:
			draw_rect(Rect2(b.x + w.x, ground_y - b.h + w.y, 3.0, 3.0),
				Color(0.95, 0.85, 0.4, w.a))
		# Antenna on tall near buildings
		if _layer_type == "near" and b.h > 200.0:
			var ax: float = b.x + b.w * 0.5
			draw_line(Vector2(ax, ground_y - b.h),
				Vector2(ax, ground_y - b.h - 20.0),
				Color(0.15, 0.15, 0.17), 1.0)
			draw_rect(Rect2(ax - 1.0, ground_y - b.h - 21.0, 2.0, 2.0),
				Color(0.9, 0.15, 0.1, 0.8))
