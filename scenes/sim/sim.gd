extends Node2D

const FLOOR_NAMES := [
	"LOBBY", "QUARTERS", "GARDEN", "RESEARCH", "RESTAURANT",
	"LOUNGE", "OBSERVATION", "STORAGE", "MEDICAL", "COMMAND"
]

const FLOOR_WIDTH := 768    # 12 blocks × 64px
const BLOCK_WIDTH := 64
const FLOOR_HEIGHT := 96
const SLAB_HEIGHT := 4
const NUM_FLOORS := 10
const WALL_THICKNESS := 8

# Tower total height
const TOWER_HEIGHT := NUM_FLOORS * FLOOR_HEIGHT

# Muted per-floor background fills
const FLOOR_BG_COLORS := [
	Color(0.10, 0.10, 0.14),  # Lobby
	Color(0.09, 0.10, 0.14),  # Quarters
	Color(0.08, 0.12, 0.09),  # Garden
	Color(0.09, 0.09, 0.14),  # Research
	Color(0.13, 0.09, 0.08),  # Restaurant
	Color(0.10, 0.09, 0.13),  # Lounge
	Color(0.08, 0.10, 0.14),  # Observation
	Color(0.10, 0.09, 0.09),  # Storage
	Color(0.12, 0.09, 0.10),  # Medical
	Color(0.12, 0.11, 0.08),  # Command
]

const FLOOR_SLAB_COLORS := [
	Color(0.45, 0.45, 0.50),  # Lobby
	Color(0.40, 0.45, 0.50),  # Quarters
	Color(0.35, 0.48, 0.35),  # Garden
	Color(0.38, 0.40, 0.52),  # Research
	Color(0.50, 0.38, 0.32),  # Restaurant
	Color(0.45, 0.40, 0.50),  # Lounge
	Color(0.35, 0.45, 0.52),  # Observation
	Color(0.42, 0.40, 0.38),  # Storage
	Color(0.50, 0.42, 0.42),  # Medical
	Color(0.48, 0.45, 0.32),  # Command
]

const C_WALL := Color(0.22, 0.22, 0.26)
const C_WINDOW := Color(0.15, 0.20, 0.30, 0.6)
const C_ELEVATOR := Color(0.18, 0.18, 0.22)
const C_BLOCK_LINE := Color(1, 1, 1, 0.04)
const C_LABEL := Color(0.6, 0.65, 0.6, 0.5)

# Camera
const CAM_LERP := 8.0
const CAM_LOOK_AHEAD := 40.0

@onready var player: CharacterBody2D = $Player2D
@onready var camera: Camera2D = $Camera2D

func _ready() -> void:
	_build_tower()
	_build_walls()

func _process(delta: float) -> void:
	# Smooth camera follow with look-ahead
	var look_ahead := CAM_LOOK_AHEAD if player.facing_right else -CAM_LOOK_AHEAD
	var target_x := player.position.x + look_ahead
	var target_y := player.position.y - 48.0
	camera.position.x = lerpf(camera.position.x, target_x, CAM_LERP * delta)
	camera.position.y = lerpf(camera.position.y, target_y, CAM_LERP * delta)

func _build_tower() -> void:
	for i in range(NUM_FLOORS):
		var floor_y := -i * FLOOR_HEIGHT
		_build_floor(i, floor_y)

func _build_floor(index: int, y: float) -> void:
	var floor_node := StaticBody2D.new()
	floor_node.name = "Floor%d" % index
	floor_node.position = Vector2(0, y)
	floor_node.collision_layer = 2
	floor_node.collision_mask = 0

	# Floor background fill (between this slab and the one above)
	var bg := ColorRect.new()
	bg.position = Vector2(0, -FLOOR_HEIGHT + SLAB_HEIGHT)
	bg.size = Vector2(FLOOR_WIDTH, FLOOR_HEIGHT - SLAB_HEIGHT)
	bg.color = FLOOR_BG_COLORS[index]
	floor_node.add_child(bg)

	# Block grid
	for bi in range(12):
		var bx := bi * BLOCK_WIDTH
		var block_top := -FLOOR_HEIGHT + SLAB_HEIGHT

		if _is_win_block(bi):
			# Window blocks — lighter, translucent
			var win := ColorRect.new()
			win.position = Vector2(bx, block_top)
			win.size = Vector2(BLOCK_WIDTH, FLOOR_HEIGHT - SLAB_HEIGHT)
			win.color = C_WINDOW
			floor_node.add_child(win)
		elif _is_elev_block(bi):
			# Elevator shaft — dark column
			var shaft := ColorRect.new()
			shaft.position = Vector2(bx, block_top)
			shaft.size = Vector2(BLOCK_WIDTH, FLOOR_HEIGHT - SLAB_HEIGHT)
			shaft.color = C_ELEVATOR
			floor_node.add_child(shaft)
			# Elevator door lines
			var door_line := ColorRect.new()
			door_line.position = Vector2(bx + BLOCK_WIDTH / 2.0 - 1, block_top + 10)
			door_line.size = Vector2(2, FLOOR_HEIGHT - SLAB_HEIGHT - 14)
			door_line.color = Color(0.3, 0.3, 0.35, 0.5)
			floor_node.add_child(door_line)

		# Subtle grid lines between blocks
		if bi > 0:
			var grid_line := ColorRect.new()
			grid_line.position = Vector2(bx, block_top)
			grid_line.size = Vector2(1, FLOOR_HEIGHT - SLAB_HEIGHT)
			grid_line.color = C_BLOCK_LINE
			floor_node.add_child(grid_line)

	# Slab
	var slab := ColorRect.new()
	slab.position = Vector2(0, 0)
	slab.size = Vector2(FLOOR_WIDTH, SLAB_HEIGHT)
	slab.color = FLOOR_SLAB_COLORS[index]
	floor_node.add_child(slab)

	# Collision (one-way — can jump through from below)
	var shape := RectangleShape2D.new()
	shape.size = Vector2(FLOOR_WIDTH, SLAB_HEIGHT)
	var col := CollisionShape2D.new()
	col.position = Vector2(FLOOR_WIDTH / 2.0, SLAB_HEIGHT / 2.0)
	col.shape = shape
	col.one_way_collision = true
	floor_node.add_child(col)

	# Floor label — bottom-left of the room area
	var label := Label.new()
	label.text = "F%d  %s" % [index + 1, FLOOR_NAMES[index]]
	label.position = Vector2(6, -FLOOR_HEIGHT + SLAB_HEIGHT + 2)
	label.add_theme_font_size_override("font_size", 8)
	label.add_theme_color_override("font_color", C_LABEL)
	floor_node.add_child(label)

	add_child(floor_node)

func _build_walls() -> void:
	# Left wall — solid, runs full tower height plus some margin
	var left_wall := StaticBody2D.new()
	left_wall.name = "WallLeft"
	left_wall.collision_layer = 4  # wall layer — always solid
	left_wall.collision_mask = 0
	var left_shape := RectangleShape2D.new()
	left_shape.size = Vector2(WALL_THICKNESS, TOWER_HEIGHT + 200)
	var left_col := CollisionShape2D.new()
	left_col.position = Vector2(-WALL_THICKNESS / 2.0, -(TOWER_HEIGHT / 2.0) + 50)
	left_col.shape = left_shape
	left_wall.add_child(left_col)
	# Visual
	var left_rect := ColorRect.new()
	left_rect.position = Vector2(-WALL_THICKNESS, -(TOWER_HEIGHT) - 50)
	left_rect.size = Vector2(WALL_THICKNESS, TOWER_HEIGHT + 200)
	left_rect.color = C_WALL
	left_wall.add_child(left_rect)
	add_child(left_wall)

	# Right wall
	var right_wall := StaticBody2D.new()
	right_wall.name = "WallRight"
	right_wall.collision_layer = 4
	right_wall.collision_mask = 0
	var right_shape := RectangleShape2D.new()
	right_shape.size = Vector2(WALL_THICKNESS, TOWER_HEIGHT + 200)
	var right_col := CollisionShape2D.new()
	right_col.position = Vector2(FLOOR_WIDTH + WALL_THICKNESS / 2.0, -(TOWER_HEIGHT / 2.0) + 50)
	right_col.shape = right_shape
	right_wall.add_child(right_col)
	# Visual
	var right_rect := ColorRect.new()
	right_rect.position = Vector2(FLOOR_WIDTH, -(TOWER_HEIGHT) - 50)
	right_rect.size = Vector2(WALL_THICKNESS, TOWER_HEIGHT + 200)
	right_rect.color = C_WALL
	right_wall.add_child(right_rect)
	add_child(right_wall)

func _is_win_block(bi: int) -> bool:
	return bi in [3, 7, 11]

func _is_elev_block(bi: int) -> bool:
	return bi == 6
