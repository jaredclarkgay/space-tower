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
const TOWER_HEIGHT := NUM_FLOORS * FLOOR_HEIGHT
const BG_MARGIN := 300.0

# Per-floor background fills (opaque — blocks parallax in non-window areas)
const FLOOR_BG_COLORS := [
	Color(0.10, 0.10, 0.14), Color(0.09, 0.10, 0.14),
	Color(0.08, 0.12, 0.09), Color(0.09, 0.09, 0.14),
	Color(0.13, 0.09, 0.08), Color(0.10, 0.09, 0.13),
	Color(0.08, 0.10, 0.14), Color(0.10, 0.09, 0.09),
	Color(0.12, 0.09, 0.10), Color(0.12, 0.11, 0.08),
]

const FLOOR_SLAB_COLORS := [
	Color(0.45, 0.45, 0.50), Color(0.40, 0.45, 0.50),
	Color(0.35, 0.48, 0.35), Color(0.38, 0.40, 0.52),
	Color(0.50, 0.38, 0.32), Color(0.45, 0.40, 0.50),
	Color(0.35, 0.45, 0.52), Color(0.42, 0.40, 0.38),
	Color(0.50, 0.42, 0.42), Color(0.48, 0.45, 0.32),
]

const C_WALL := Color(0.22, 0.22, 0.26)
const C_WINDOW := Color(0.12, 0.18, 0.28, 0.3)  # light tint, mostly transparent
const C_WIN_FRAME := Color(0.25, 0.25, 0.30, 0.5)
const C_ELEVATOR := Color(0.18, 0.18, 0.22)
const C_BLOCK_LINE := Color(1, 1, 1, 0.04)
const C_LABEL := Color(0.6, 0.65, 0.6, 0.5)

const SCREEN_SHAKE_PX := 2.0
const SCREEN_SHAKE_DURATION := 0.1

const BlockScript: GDScript = preload("res://scenes/sim/block.gd")

# Camera
const CAM_LERP := 8.0
const CAM_LOOK_AHEAD := 40.0

# Zoom
const ZOOM_LEVELS := [1.0, 1.5, 2.0, 2.5, 3.0]
var _zoom_index := 2

@onready var player: CharacterBody2D = $Player2D
@onready var camera: Camera2D = $Camera2D
@onready var zoom_slider: HSlider = $UI/ZoomSlider
@onready var zoom_label: Label = $UI/ZoomLabel

# Exterior layers (plain Node2Ds — manual parallax)
var _sky_rect: ColorRect
var _stars_rect: ColorRect
var _sky_mat: ShaderMaterial
var _stars_mat: ShaderMaterial
var _far_city: Node2D
var _mid_city: Node2D
var _near_city: Node2D

func _ready() -> void:
	_build_exterior_bg()
	_build_tower()
	_build_walls()
	camera.limit_left = -20
	camera.limit_right = FLOOR_WIDTH + 20
	camera.limit_bottom = 100
	camera.limit_top = -TOWER_HEIGHT - 100
	zoom_slider.value_changed.connect(_on_zoom_changed)

func _unhandled_input(event: InputEvent) -> void:
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
	var closest := 0
	for i in range(ZOOM_LEVELS.size()):
		if absf(ZOOM_LEVELS[i] - value) < absf(ZOOM_LEVELS[closest] - value):
			closest = i
	_zoom_index = closest

func _process(delta: float) -> void:
	# Camera follow
	var look_ahead := CAM_LOOK_AHEAD if player.facing_right else -CAM_LOOK_AHEAD
	var target_x := player.position.x + look_ahead
	var target_y := player.position.y - 48.0
	camera.position.x = lerpf(camera.position.x, target_x, CAM_LERP * delta)
	camera.position.y = lerpf(camera.position.y, target_y, CAM_LERP * delta)

	# --- Manual parallax ---
	# Each layer is a world-space Node2D. To create parallax depth:
	# layer.position.y = base_y + cam_y * (1.0 - depth_factor)
	# depth_factor: 0.0 = pinned to screen (sky), 1.0 = foreground (no parallax)
	var cam_y := camera.position.y
	var sky_base_y := -float(TOWER_HEIGHT) - 400.0

	# Sky — pinned to screen
	if _sky_rect:
		_sky_rect.position.y = sky_base_y + cam_y * 1.0
	if _sky_mat:
		_sky_mat.set_shader_parameter("camera_y", cam_y)

	# Stars — nearly pinned
	if _stars_rect:
		_stars_rect.position.y = sky_base_y + cam_y * 0.975
	if _stars_mat:
		_stars_mat.set_shader_parameter("camera_y", cam_y)
		_stars_mat.set_shader_parameter("time_val", Time.get_ticks_msec() / 1000.0)

	# City layers — halved vertical parallax
	if _far_city:
		_far_city.position.y = cam_y * 0.925   # was 0.85
	if _mid_city:
		_mid_city.position.y = cam_y * 0.85    # was 0.70
	if _near_city:
		_near_city.position.y = cam_y * 0.75   # was 0.50

	# Fade city at altitude
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

# ── Exterior background (plain Node2Ds, no ParallaxBackground) ──

func _build_exterior_bg() -> void:
	var ext := Node2D.new()
	ext.name = "ExteriorBG"
	ext.z_index = -10
	add_child(ext)
	move_child(ext, 0)

	var full_w := FLOOR_WIDTH + BG_MARGIN * 2.0
	var full_h := float(TOWER_HEIGHT) + 800.0
	var ox := -BG_MARGIN
	var oy := -float(TOWER_HEIGHT) - 400.0

	# Sky
	_sky_rect = ColorRect.new()
	_sky_rect.z_index = -100
	_sky_rect.position = Vector2(ox, oy)
	_sky_rect.size = Vector2(full_w, full_h)
	var sky_shader: Shader = load("res://assets/shaders/sky_gradient.gdshader")
	if sky_shader:
		_sky_mat = ShaderMaterial.new()
		_sky_mat.shader = sky_shader
		_sky_rect.material = _sky_mat
	ext.add_child(_sky_rect)

	# Stars
	_stars_rect = ColorRect.new()
	_stars_rect.z_index = -90
	_stars_rect.position = Vector2(ox, oy)
	_stars_rect.size = Vector2(full_w, full_h)
	var stars_shader: Shader = load("res://assets/shaders/star_field.gdshader")
	if stars_shader:
		_stars_mat = ShaderMaterial.new()
		_stars_mat.shader = stars_shader
		_stars_rect.material = _stars_mat
	ext.add_child(_stars_rect)

	# City layers
	var city_script: GDScript = load("res://scenes/sim/city_layer.gd")

	_far_city = Node2D.new()
	_far_city.z_index = -80
	_far_city.set_script(city_script)
	ext.add_child(_far_city)
	_far_city.configure("far", 100)

	# Fog
	var fog := ColorRect.new()
	fog.z_index = -70
	fog.position = Vector2(ox, -80)
	fog.size = Vector2(full_w, 160)
	fog.color = Color(0.1, 0.08, 0.06, 0.12)
	ext.add_child(fog)

	_mid_city = Node2D.new()
	_mid_city.z_index = -60
	_mid_city.set_script(city_script)
	ext.add_child(_mid_city)
	_mid_city.configure("mid", 200)

	_near_city = Node2D.new()
	_near_city.z_index = -50
	_near_city.set_script(city_script)
	ext.add_child(_near_city)
	_near_city.configure("near", 300)

	# Ground — in front of all city layers, anchors everything visually
	var ground := ColorRect.new()
	ground.name = "Ground"
	ground.z_index = -45  # in front of all city layers (-50 to -80)
	ground.position = Vector2(ox, 4)  # starts at floor 0 slab
	ground.size = Vector2(full_w, 500)
	ground.color = Color(0.12, 0.14, 0.08)
	ext.add_child(ground)

	# Grass/dirt line at ground level for definition
	var grass := ColorRect.new()
	grass.z_index = -44
	grass.position = Vector2(ox, 2)
	grass.size = Vector2(full_w, 4)
	grass.color = Color(0.18, 0.22, 0.10)
	ext.add_child(grass)

	# Sidewalk/pavement strip right at tower base
	var pavement := ColorRect.new()
	pavement.z_index = -44
	pavement.position = Vector2(ox, 4)
	pavement.size = Vector2(full_w, 12)
	pavement.color = Color(0.18, 0.18, 0.20)
	ext.add_child(pavement)

# ── Tower floors ──

func _build_tower() -> void:
	for i in range(NUM_FLOORS):
		_build_floor(i, -i * FLOOR_HEIGHT)

func _build_floor(index: int, y: float) -> void:
	var floor_node := StaticBody2D.new()
	floor_node.name = "Floor%d" % index
	floor_node.position = Vector2(0, y)
	floor_node.z_index = 0  # in front of exterior
	floor_node.collision_layer = 2
	floor_node.collision_mask = 0

	var block_top := -FLOOR_HEIGHT + SLAB_HEIGHT

	# Floor background — segmented, SKIPPING window columns so parallax shows through
	var seg_start := 0
	for bi in range(13):  # 0-12 (12 = past end, to close final segment)
		if bi == 12 or _is_win_block(bi):
			if seg_start < bi:
				var bg := ColorRect.new()
				bg.position = Vector2(seg_start * BLOCK_WIDTH, block_top)
				bg.size = Vector2((bi - seg_start) * BLOCK_WIDTH, FLOOR_HEIGHT - SLAB_HEIGHT)
				bg.color = FLOOR_BG_COLORS[index]
				floor_node.add_child(bg)
			seg_start = bi + 1

	# Block details
	for bi in range(12):
		var bx := bi * BLOCK_WIDTH

		if _is_win_block(bi):
			# Window — light tint over transparent gap (parallax shows through)
			var win := ColorRect.new()
			win.position = Vector2(bx, block_top)
			win.size = Vector2(BLOCK_WIDTH, FLOOR_HEIGHT - SLAB_HEIGHT)
			win.color = C_WINDOW
			floor_node.add_child(win)
			# Window frame edges
			var fl := ColorRect.new()
			fl.position = Vector2(bx, block_top)
			fl.size = Vector2(1, FLOOR_HEIGHT - SLAB_HEIGHT)
			fl.color = C_WIN_FRAME
			floor_node.add_child(fl)
			var fr := ColorRect.new()
			fr.position = Vector2(bx + BLOCK_WIDTH - 1, block_top)
			fr.size = Vector2(1, FLOOR_HEIGHT - SLAB_HEIGHT)
			fr.color = C_WIN_FRAME
			floor_node.add_child(fr)
		elif _is_elev_block(bi):
			var shaft := ColorRect.new()
			shaft.position = Vector2(bx, block_top)
			shaft.size = Vector2(BLOCK_WIDTH, FLOOR_HEIGHT - SLAB_HEIGHT)
			shaft.color = C_ELEVATOR
			floor_node.add_child(shaft)
			var door_line := ColorRect.new()
			door_line.position = Vector2(bx + BLOCK_WIDTH / 2.0 - 1, block_top + 10)
			door_line.size = Vector2(2, FLOOR_HEIGHT - SLAB_HEIGHT - 14)
			door_line.color = Color(0.3, 0.3, 0.35, 0.5)
			floor_node.add_child(door_line)
		else:
			# Buildable block — interactive Block node
			var block := Node2D.new()
			block.set_script(BlockScript)
			block.name = "Block_%d_%d" % [index, bi]
			block.position = Vector2(bx, block_top)
			block.block_index = bi
			block.floor_index = index
			block.initialize(BLOCK_WIDTH, FLOOR_HEIGHT - SLAB_HEIGHT, FLOOR_BG_COLORS[index])
			block.claim_completed.connect(_on_block_claimed)
			# Restore any saved claim state
			var gs: Node = get_node("/root/GameState")
			var key := "claim_%d_%d" % [index, bi]
			var saved_progress: float = gs.block_claims.get(key, 0.0)
			if saved_progress > 0.0:
				var saved_owner: String = gs.block_claim_owners.get(key, "player")
				block.claim_owner = saved_owner
				block.owner_color = block._get_color_for_owner(saved_owner)
				block.claim_progress = saved_progress
				block.current_strike = int(saved_progress / 0.25)
				block._update_borders()
				if saved_progress >= 1.0:
					block.claim_locked = true
					block._fill.visible = true
					block._fill.color = Color(block.owner_color, block.FILL_ALPHA)
			floor_node.add_child(block)

		if bi > 0:
			var grid_line := ColorRect.new()
			grid_line.position = Vector2(bx, block_top)
			grid_line.size = Vector2(1, FLOOR_HEIGHT - SLAB_HEIGHT)
			grid_line.color = C_BLOCK_LINE
			floor_node.add_child(grid_line)

	# Slab — fully opaque
	var slab := ColorRect.new()
	slab.position = Vector2(0, 0)
	slab.size = Vector2(FLOOR_WIDTH, SLAB_HEIGHT)
	slab.color = FLOOR_SLAB_COLORS[index]
	floor_node.add_child(slab)

	# Collision
	var shape := RectangleShape2D.new()
	shape.size = Vector2(FLOOR_WIDTH, SLAB_HEIGHT)
	var col := CollisionShape2D.new()
	col.position = Vector2(FLOOR_WIDTH / 2.0, SLAB_HEIGHT / 2.0)
	col.shape = shape
	if index > 0:
		col.one_way_collision = true
	floor_node.add_child(col)

	# Label
	var label := Label.new()
	label.text = "F%d  %s" % [index + 1, FLOOR_NAMES[index]]
	label.position = Vector2(6, block_top + 2)
	label.add_theme_font_size_override("font_size", 8)
	label.add_theme_color_override("font_color", C_LABEL)
	floor_node.add_child(label)

	add_child(floor_node)

# ── Walls ──

func _build_walls() -> void:
	var wall_h := float(TOWER_HEIGHT) + 400.0
	var wall_top := -float(TOWER_HEIGHT) - 150.0

	for side in ["left", "right"]:
		var wall := StaticBody2D.new()
		wall.name = "Wall" + side.capitalize()
		wall.collision_layer = 4
		wall.collision_mask = 0
		wall.z_index = 0

		var shape := RectangleShape2D.new()
		shape.size = Vector2(WALL_THICKNESS, wall_h)
		var col := CollisionShape2D.new()
		col.shape = shape

		var rect := ColorRect.new()
		rect.size = Vector2(WALL_THICKNESS, wall_h)
		rect.color = C_WALL

		if side == "left":
			col.position = Vector2(-WALL_THICKNESS / 2.0, wall_top + wall_h / 2.0)
			rect.position = Vector2(-WALL_THICKNESS, wall_top)
		else:
			col.position = Vector2(FLOOR_WIDTH + WALL_THICKNESS / 2.0, wall_top + wall_h / 2.0)
			rect.position = Vector2(FLOOR_WIDTH, wall_top)

		wall.add_child(col)
		wall.add_child(rect)
		add_child(wall)

func _is_win_block(bi: int) -> bool:
	return bi in [3, 7, 11]

func _is_elev_block(bi: int) -> bool:
	return bi == 6

func _on_block_claimed(_floor_idx: int, _block_idx: int) -> void:
	screen_shake()

func screen_shake(magnitude: float = SCREEN_SHAKE_PX, duration: float = SCREEN_SHAKE_DURATION) -> void:
	var original := camera.offset
	var tween := create_tween()
	tween.tween_property(camera, "offset", original + Vector2(magnitude, -magnitude), duration * 0.25)
	tween.tween_property(camera, "offset", original + Vector2(-magnitude, magnitude), duration * 0.25)
	tween.tween_property(camera, "offset", original, duration * 0.5)

## Find the nearest claimable Block node to a world position
func find_nearest_claimable_block(world_pos: Vector2, who: String) -> Node2D:
	var best: Node2D = null
	var best_dist := INF
	for fi in range(NUM_FLOORS):
		var floor_node := get_node_or_null("Floor%d" % fi)
		if not floor_node:
			continue
		for child in floor_node.get_children():
			if not child.has_method("can_claim"):
				continue
			if not child.is_player_nearby:
				continue
			if not child.can_claim(who):
				continue
			var block_center: Vector2 = child.global_position + Vector2(child.block_width / 2.0, child.block_height / 2.0)
			var dist := world_pos.distance_to(block_center)
			if dist < best_dist:
				best_dist = dist
				best = child
	return best
