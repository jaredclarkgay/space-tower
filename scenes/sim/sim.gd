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

const BG_MARGIN := 300.0

# Zoom levels
const ZOOM_LEVELS := [1.0, 1.5, 2.0, 2.5, 3.0]
var _zoom_index := 2  # start at 2.0x

@onready var player: CharacterBody2D = $Player2D
@onready var camera: Camera2D = $Camera2D
@onready var zoom_slider: HSlider = $UI/ZoomSlider
@onready var zoom_label: Label = $UI/ZoomLabel

var _sky_mat: ShaderMaterial
var _stars_mat: ShaderMaterial
var _far_city: Node2D
var _mid_city: Node2D
var _near_city: Node2D

func _ready() -> void:
	_build_parallax_bg()
	_build_tower()
	_build_walls()
	# Camera limits — keep view inside the tower
	camera.limit_left = -20
	camera.limit_right = FLOOR_WIDTH + 20
	camera.limit_bottom = 100
	camera.limit_top = -TOWER_HEIGHT - 100
	# Connect zoom slider
	zoom_slider.value_changed.connect(_on_zoom_changed)

func _unhandled_input(event: InputEvent) -> void:
	# Zoom with scroll wheel or +/- keys
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed:
			if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
				_zoom_in()
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				_zoom_out()
	elif event is InputEventKey:
		var kb := event as InputEventKey
		if kb.pressed:
			if kb.keycode == KEY_EQUAL or kb.keycode == KEY_KP_ADD:
				_zoom_in()
			elif kb.keycode == KEY_MINUS or kb.keycode == KEY_KP_SUBTRACT:
				_zoom_out()

func _zoom_in() -> void:
	_zoom_index = mini(_zoom_index + 1, ZOOM_LEVELS.size() - 1)
	_apply_zoom()

func _zoom_out() -> void:
	_zoom_index = maxi(_zoom_index - 1, 0)
	_apply_zoom()

func _apply_zoom() -> void:
	var z: float = ZOOM_LEVELS[_zoom_index]
	zoom_slider.set_value_no_signal(z)
	zoom_label.text = "%.1fx" % z
	var tween := create_tween()
	tween.tween_property(camera, "zoom", Vector2(z, z), 0.15)

func _on_zoom_changed(value: float) -> void:
	camera.zoom = Vector2(value, value)
	zoom_label.text = "%.1fx" % value
	# Sync the index for +/- keys
	var closest := 0
	for i in range(ZOOM_LEVELS.size()):
		if absf(ZOOM_LEVELS[i] - value) < absf(ZOOM_LEVELS[closest] - value):
			closest = i
	_zoom_index = closest

func _process(delta: float) -> void:
	# Smooth camera follow with look-ahead
	var look_ahead := CAM_LOOK_AHEAD if player.facing_right else -CAM_LOOK_AHEAD
	var target_x := player.position.x + look_ahead
	var target_y := player.position.y - 48.0
	camera.position.x = lerpf(camera.position.x, target_x, CAM_LERP * delta)
	camera.position.y = lerpf(camera.position.y, target_y, CAM_LERP * delta)

	# Update shader uniforms with camera altitude
	var cam_y := camera.position.y
	if _sky_mat:
		_sky_mat.set_shader_parameter("camera_y", cam_y)
	if _stars_mat:
		_stars_mat.set_shader_parameter("camera_y", cam_y)
		_stars_mat.set_shader_parameter("time_val", Time.get_ticks_msec() / 1000.0)

	# Fade city layers at altitude
	var alt := clampf(-cam_y / float(TOWER_HEIGHT), 0.0, 1.0)
	if _far_city:
		_far_city.modulate.a = 1.0 - _smoothstep(0.55, 0.75, alt)
	if _mid_city:
		_mid_city.modulate.a = 1.0 - _smoothstep(0.45, 0.65, alt)
	if _near_city:
		_near_city.modulate.a = 1.0 - _smoothstep(0.35, 0.55, alt)

func _smoothstep(edge0: float, edge1: float, x: float) -> float:
	var t := clampf((x - edge0) / (edge1 - edge0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

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

	# Collision — floor 0 is solid (no falling through), rest are one-way
	var shape := RectangleShape2D.new()
	shape.size = Vector2(FLOOR_WIDTH, SLAB_HEIGHT)
	var col := CollisionShape2D.new()
	col.position = Vector2(FLOOR_WIDTH / 2.0, SLAB_HEIGHT / 2.0)
	col.shape = shape
	if index > 0:
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
	var wall_h := float(TOWER_HEIGHT) + 400.0
	var wall_top := -float(TOWER_HEIGHT) - 150.0

	# Left wall
	var left_wall := StaticBody2D.new()
	left_wall.name = "WallLeft"
	left_wall.collision_layer = 4
	left_wall.collision_mask = 0
	var left_shape := RectangleShape2D.new()
	left_shape.size = Vector2(WALL_THICKNESS, wall_h)
	var left_col := CollisionShape2D.new()
	left_col.position = Vector2(-WALL_THICKNESS / 2.0, wall_top + wall_h / 2.0)
	left_col.shape = left_shape
	left_wall.add_child(left_col)
	var left_rect := ColorRect.new()
	left_rect.position = Vector2(-WALL_THICKNESS, wall_top)
	left_rect.size = Vector2(WALL_THICKNESS, wall_h)
	left_rect.color = C_WALL
	left_wall.add_child(left_rect)
	add_child(left_wall)

	# Right wall
	var right_wall := StaticBody2D.new()
	right_wall.name = "WallRight"
	right_wall.collision_layer = 4
	right_wall.collision_mask = 0
	var right_shape := RectangleShape2D.new()
	right_shape.size = Vector2(WALL_THICKNESS, wall_h)
	var right_col := CollisionShape2D.new()
	right_col.position = Vector2(FLOOR_WIDTH + WALL_THICKNESS / 2.0, wall_top + wall_h / 2.0)
	right_col.shape = right_shape
	right_wall.add_child(right_col)
	var right_rect := ColorRect.new()
	right_rect.position = Vector2(FLOOR_WIDTH, wall_top)
	right_rect.size = Vector2(WALL_THICKNESS, wall_h)
	right_rect.color = C_WALL
	right_wall.add_child(right_rect)
	add_child(right_wall)

func _build_parallax_bg() -> void:
	var pbg := ParallaxBackground.new()
	pbg.name = "ExteriorBG"
	add_child(pbg)
	# Move to front of child list so it's behind everything
	move_child(pbg, 0)

	var full_w := FLOOR_WIDTH + BG_MARGIN * 2.0
	var full_h := float(TOWER_HEIGHT) + 800.0
	var origin_x := -BG_MARGIN
	var origin_y := -float(TOWER_HEIGHT) - 400.0

	# --- Sky layer (fixed, shader-driven) ---
	var sky_layer := ParallaxLayer.new()
	sky_layer.motion_scale = Vector2.ZERO
	pbg.add_child(sky_layer)

	var sky_rect := ColorRect.new()
	sky_rect.z_index = -100
	sky_rect.position = Vector2(origin_x, origin_y)
	sky_rect.size = Vector2(full_w, full_h)
	var sky_shader: Shader = load("res://assets/shaders/sky_gradient.gdshader")
	if sky_shader:
		_sky_mat = ShaderMaterial.new()
		_sky_mat.shader = sky_shader
		sky_rect.material = _sky_mat
	else:
		sky_rect.color = Color(0.04, 0.06, 0.15)
	sky_layer.add_child(sky_rect)

	# --- Stars layer (nearly fixed, shader-driven) ---
	var stars_layer := ParallaxLayer.new()
	stars_layer.motion_scale = Vector2(0.0, 0.05)
	pbg.add_child(stars_layer)

	var stars_rect := ColorRect.new()
	stars_rect.z_index = -90
	stars_rect.position = Vector2(origin_x, origin_y)
	stars_rect.size = Vector2(full_w, full_h)
	var stars_shader: Shader = load("res://assets/shaders/star_field.gdshader")
	if stars_shader:
		_stars_mat = ShaderMaterial.new()
		_stars_mat.shader = stars_shader
		stars_rect.material = _stars_mat
	else:
		stars_rect.color = Color(0, 0, 0, 0)
	stars_layer.add_child(stars_rect)

	# --- Far city layer ---
	var far_layer := ParallaxLayer.new()
	far_layer.motion_scale = Vector2(0.0, 0.15)
	pbg.add_child(far_layer)

	var city_layer_script: GDScript = load("res://scenes/sim/city_layer.gd")

	_far_city = Node2D.new()
	_far_city.z_index = -80
	_far_city.set_script(city_layer_script)
	far_layer.add_child(_far_city)
	_far_city.configure("far", 100)

	# --- Fog layer ---
	var fog_layer := ParallaxLayer.new()
	fog_layer.motion_scale = Vector2(0.0, 0.25)
	pbg.add_child(fog_layer)

	var fog_rect := ColorRect.new()
	fog_rect.z_index = -70
	fog_rect.position = Vector2(origin_x, -80)
	fog_rect.size = Vector2(full_w, 160)
	fog_rect.color = Color(0.1, 0.08, 0.06, 0.12)
	fog_layer.add_child(fog_rect)

	# --- Mid city layer ---
	var mid_layer := ParallaxLayer.new()
	mid_layer.motion_scale = Vector2(0.0, 0.3)
	pbg.add_child(mid_layer)

	_mid_city = Node2D.new()
	_mid_city.z_index = -60
	_mid_city.set_script(city_layer_script)
	mid_layer.add_child(_mid_city)
	_mid_city.configure("mid", 200)

	# --- Near city layer ---
	var near_layer := ParallaxLayer.new()
	near_layer.motion_scale = Vector2(0.0, 0.5)
	pbg.add_child(near_layer)

	_near_city = Node2D.new()
	_near_city.z_index = -50
	_near_city.set_script(city_layer_script)
	near_layer.add_child(_near_city)
	_near_city.configure("near", 300)

	# --- Ground plane (fixed, below floor 0) ---
	var ground_layer := ParallaxLayer.new()
	ground_layer.motion_scale = Vector2.ZERO
	pbg.add_child(ground_layer)

	var ground := ColorRect.new()
	ground.z_index = -55
	ground.position = Vector2(origin_x, 4)  # starts at floor 0 slab
	ground.size = Vector2(full_w, 400)
	ground.color = Color(0.08, 0.10, 0.06)
	ground_layer.add_child(ground)

func _is_win_block(bi: int) -> bool:
	return bi in [3, 7, 11]

func _is_elev_block(bi: int) -> bool:
	return bi == 6
