extends Node2D

## Breaker panel — wall-mounted lever that activates a floor

var floor_index: int = -1
var activated: bool = false
var is_player_nearby: bool = false

## Timing
const LEVER_PULL_DURATION := 0.35
const CASCADE_DELAY := 0.05
const RECKONING_STUTTER_POINT := 0.5
const BLACKOUT_DELAY := 0.8

## Colors
const C_BOX := Color(0.18, 0.18, 0.22)
const C_BOX_FACE := Color(0.22, 0.22, 0.26)
const C_BOX_BORDER := Color(0.35, 0.35, 0.40)
const C_BOX_INNER := Color(0.12, 0.12, 0.15)
const C_LEVER_OFF := Color(0.55, 0.18, 0.12)
const C_LEVER_ON := Color(0.3, 0.65, 0.25)
const C_LIGHT_OFF := Color(0.5, 0.12, 0.08)
const C_LIGHT_ON := Color(0.15, 0.8, 0.15)
const C_HAZARD_STRIPE := Color(0.9, 0.7, 0.0)
const C_CEILING_LIGHT_OFF := Color(0.15, 0.15, 0.18)
const C_CEILING_LIGHT_ON := Color(0.9, 0.85, 0.6, 0.7)

## Per-floor activated tint colors (warmer/brighter versions of bg)
const FLOOR_ACTIVE_TINTS := [
	Color(0.16, 0.15, 0.12, 0.15),  # LOBBY — warm overhead
	Color(0.15, 0.14, 0.10, 0.15),  # QUARTERS — homey amber
	Color(0.08, 0.18, 0.06, 0.12),  # GARDEN — green glow
	Color(0.06, 0.10, 0.20, 0.12),  # RESEARCH — blue monitor
	Color(0.18, 0.14, 0.06, 0.15),  # RESTAURANT — warm pendant
	Color(0.16, 0.13, 0.06, 0.12),  # LOUNGE — soft amber
	Color(0.10, 0.14, 0.20, 0.12),  # OBSERVATION — cool blue-white
	Color(0.18, 0.18, 0.18, 0.15),  # STORAGE — harsh fluorescent
	Color(0.14, 0.18, 0.14, 0.12),  # MEDICAL — clinical white-green
	Color(0.18, 0.16, 0.08, 0.15),  # COMMAND — gold glow
]

## Per-floor particle configurations: [color, direction_y, count]
const FLOOR_PARTICLES := [
	[Color(0.9, 0.8, 0.5, 0.4), -0.5, 5],   # LOBBY — warm motes
	[Color(0.9, 0.7, 0.3, 0.4), -0.3, 5],   # QUARTERS — amber
	[Color(0.3, 0.8, 0.3, 0.3), -1.0, 8],   # GARDEN — green mist rising
	[Color(0.3, 0.5, 0.9, 0.3), -0.2, 6],   # RESEARCH — blue data motes
	[Color(0.9, 0.7, 0.3, 0.3), -0.3, 5],   # RESTAURANT — warm light
	[Color(0.8, 0.65, 0.3, 0.3), -0.2, 4],  # LOUNGE — soft amber
	[Color(0.6, 0.8, 1.0, 0.3), -0.3, 6],   # OBSERVATION — cool motes
	[Color(0.9, 0.9, 0.9, 0.2), -0.1, 3],   # STORAGE — dust
	[Color(0.7, 0.9, 0.7, 0.3), -0.2, 5],   # MEDICAL — green-white
	[Color(1.0, 0.85, 0.3, 0.4), -0.5, 7],  # COMMAND — gold particles
]

var _lever_progress: float = 0.0  # 0.0 = down (off), 1.0 = up (on)
var _interaction_area: Area2D
var _ambient_particles: GPUParticles2D
var _lever_sparks: GPUParticles2D
var _ceiling_lights: Array[ColorRect] = []

signal panel_activated(floor_idx)


func initialize(fi: int) -> void:
	floor_index = fi
	_build_interaction_area()
	_build_ambient_particles()
	_build_lever_sparks()
	queue_redraw()


func _ready() -> void:
	# Defer ceiling lights — parent floor is still adding children during _ready
	call_deferred("_build_ceiling_lights")
	# Check if already activated from saved state (now safely in tree)
	var gs: Node = get_node("/root/GameState")
	if floor_index >= 0 and floor_index < gs.activated_floors.size() and gs.activated_floors[floor_index]:
		activated = true
		_lever_progress = 1.0
		_ambient_particles.emitting = true
		for light in _ceiling_lights:
			light.color = C_CEILING_LIGHT_ON
		queue_redraw()


func _draw() -> void:
	# --- Industrial breaker panel ---
	# Outer casing
	draw_rect(Rect2(-2, -2, 28, 36), C_BOX_BORDER)
	draw_rect(Rect2(0, 0, 24, 32), C_BOX)

	# Inner recess
	draw_rect(Rect2(2, 2, 20, 28), C_BOX_INNER)

	# Hazard stripe (diagonal yellow/black) at top
	draw_rect(Rect2(2, 2, 20, 4), C_HAZARD_STRIPE)
	for i in range(5):
		draw_rect(Rect2(2 + i * 8, 2, 4, 4), Color(0.15, 0.15, 0.15))

	# Status light — larger, with glow
	var light_color := C_LIGHT_ON if activated else C_LIGHT_OFF
	draw_circle(Vector2(12, 10), 3.5, light_color)
	if activated:
		draw_circle(Vector2(12, 10), 6.0, Color(light_color, 0.2))  # glow

	# Label text
	draw_string(ThemeDB.fallback_font, Vector2(4, 30), "PWR", HORIZONTAL_ALIGNMENT_LEFT, -1, 6, Color(0.5, 0.5, 0.55, 0.6))

	# Lever — pivots from center of panel
	# OFF = lever hangs down, ON = lever points up
	var lever_color := C_LEVER_ON if activated else C_LEVER_OFF
	var pivot := Vector2(12, 20)
	# Down = +60deg (off), Up = -60deg (on)
	var angle := lerpf(1.05, -1.05, _lever_progress)
	var lever_end := pivot + Vector2(cos(angle), sin(angle)) * 12.0
	draw_line(pivot, lever_end, lever_color, 2.5)
	draw_circle(lever_end, 3.0, lever_color)
	# Pivot bolt
	draw_circle(pivot, 2.0, Color(0.4, 0.4, 0.45))


func _build_interaction_area() -> void:
	_interaction_area = Area2D.new()
	_interaction_area.collision_layer = 0
	_interaction_area.collision_mask = 1
	var col_shape := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(40, 48)
	col_shape.shape = shape
	col_shape.position = Vector2(10, 14)
	_interaction_area.add_child(col_shape)
	add_child(_interaction_area)
	_interaction_area.body_entered.connect(_on_player_enter)
	_interaction_area.body_exited.connect(_on_player_exit)


func _build_ambient_particles() -> void:
	_ambient_particles = GPUParticles2D.new()
	_ambient_particles.emitting = false
	_ambient_particles.amount = FLOOR_PARTICLES[floor_index][2] if floor_index >= 0 and floor_index < FLOOR_PARTICLES.size() else 5
	_ambient_particles.lifetime = 3.0
	_ambient_particles.z_index = 3
	# Spread across the floor width — position at floor center
	_ambient_particles.position = Vector2(1080, -46)  # center of floor area

	var mat := ParticleProcessMaterial.new()
	var p_color: Color = FLOOR_PARTICLES[floor_index][0] if floor_index >= 0 and floor_index < FLOOR_PARTICLES.size() else Color(0.8, 0.8, 0.8, 0.3)
	var p_dir_y: float = FLOOR_PARTICLES[floor_index][1] if floor_index >= 0 and floor_index < FLOOR_PARTICLES.size() else -0.3
	mat.direction = Vector3(0, p_dir_y, 0)
	mat.spread = 180.0
	mat.initial_velocity_min = 5.0
	mat.initial_velocity_max = 15.0
	mat.gravity = Vector3(0, 0, 0)
	mat.scale_min = 1.0
	mat.scale_max = 2.0
	mat.color = p_color
	# Emission box across the floor
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(1000, 40, 0)
	_ambient_particles.process_material = mat
	add_child(_ambient_particles)


func _build_lever_sparks() -> void:
	_lever_sparks = GPUParticles2D.new()
	_lever_sparks.emitting = false
	_lever_sparks.one_shot = true
	_lever_sparks.amount = 15
	_lever_sparks.lifetime = 0.4
	_lever_sparks.explosiveness = 0.95
	_lever_sparks.z_index = 6
	_lever_sparks.position = Vector2(12, 16)
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, -1, 0)
	mat.spread = 60.0
	mat.initial_velocity_min = 40.0
	mat.initial_velocity_max = 100.0
	mat.gravity = Vector3(0, 120, 0)
	mat.scale_min = 1.0
	mat.scale_max = 2.5
	mat.color = Color(1.0, 0.8, 0.2)
	_lever_sparks.process_material = mat
	add_child(_lever_sparks)


func _build_ceiling_lights() -> void:
	# Called after the breaker is in the tree — adds lights to the floor node
	var floor_node: Node = get_parent()
	if not floor_node:
		return
	var block_top := -96 + 4  # -FLOOR_HEIGHT + SLAB_HEIGHT
	# One light per ~2 blocks across the floor
	for i in range(6):
		var lx := 180.0 + i * 360.0  # spread across 2160px floor
		var light := ColorRect.new()
		light.position = Vector2(lx - 8, block_top + 2)
		light.size = Vector2(16, 3)
		light.color = C_CEILING_LIGHT_OFF
		light.z_index = 2
		floor_node.add_child(light)
		_ceiling_lights.append(light)


func _on_player_enter(body: Node2D) -> void:
	if body is CharacterBody2D:
		is_player_nearby = true


func _on_player_exit(body: Node2D) -> void:
	if body is CharacterBody2D:
		is_player_nearby = false


func can_activate() -> bool:
	return not activated and is_player_nearby


## Called by player_2d when E is pressed near this panel
## Returns the duration of the full activation sequence
func activate() -> float:
	if activated:
		return 0.0
	activated = true

	# Update GameState
	var gs: Node = get_node("/root/GameState")
	gs.activated_floors[floor_index] = true
	gs.floors_activated_count += 1

	# Lever pull tween + sparks
	var tween := create_tween()
	tween.tween_property(self, "_lever_progress", 1.0, LEVER_PULL_DURATION)
	tween.tween_callback(func():
		_lever_sparks.restart()
		_lever_sparks.emitting = true
		queue_redraw()
	)

	# Check if this is Floor 8 (STORAGE, index 7) — Reckoning trigger
	var is_reckoning := (floor_index == 7)

	# Ceiling lights sequence — one by one after lever pull
	for i in range(_ceiling_lights.size()):
		var delay := LEVER_PULL_DURATION + 0.15 + i * 0.08
		var light: ColorRect = _ceiling_lights[i]
		get_tree().create_timer(delay).timeout.connect(func():
			var lt := create_tween()
			lt.tween_property(light, "color", C_CEILING_LIGHT_ON, 0.1)
		)

	# Power cascade — delayed start after lever pull
	var cascade_start := LEVER_PULL_DURATION + 0.1
	_start_cascade(cascade_start, is_reckoning)

	# Emit signal after lever pull
	tween.tween_callback(func(): panel_activated.emit(floor_index))

	if is_reckoning:
		return cascade_start + 6 * CASCADE_DELAY + BLACKOUT_DELAY + 0.5
	else:
		return cascade_start + 12 * CASCADE_DELAY + 0.5


func _start_cascade(delay: float, is_reckoning: bool) -> void:
	var floor_node: Node = get_parent()
	if not floor_node:
		return

	# Gather block background ColorRects and Block nodes for the cascade
	var cascade_targets: Array[Node] = []
	for child in floor_node.get_children():
		if child is ColorRect and child.size.y > 10 and child.position.y < 0:
			# Floor bg segment or block bg — include in cascade
			cascade_targets.append(child)
		elif child.has_method("can_claim"):
			# Block node — include its background
			cascade_targets.append(child)

	# Sort by x position for left-to-right sweep
	cascade_targets.sort_custom(func(a: Node, b: Node) -> bool: return a.position.x < b.position.x)

	var tint_color: Color = FLOOR_ACTIVE_TINTS[floor_index] if floor_index >= 0 and floor_index < FLOOR_ACTIVE_TINTS.size() else Color(0.15, 0.15, 0.10, 0.12)

	var stutter_index := int(cascade_targets.size() * RECKONING_STUTTER_POINT) if is_reckoning else -1

	for i in range(cascade_targets.size()):
		var target: Node = cascade_targets[i]
		var t := delay + i * CASCADE_DELAY

		if is_reckoning and i == stutter_index:
			# Stutter — cascade pauses, then blackout
			get_tree().create_timer(t).timeout.connect(func():
				_reckoning_stutter()
			)
			return  # Don't continue cascade past stutter point

		get_tree().create_timer(t).timeout.connect(func():
			_brighten_target(target, tint_color)
		)

	# After cascade completes, start ambient particles
	var total_time := delay + cascade_targets.size() * CASCADE_DELAY + 0.2
	get_tree().create_timer(total_time).timeout.connect(func():
		_ambient_particles.emitting = true
		# Brighten floor label
		var floor_node2: Node = get_parent()
		if floor_node2:
			for child in floor_node2.get_children():
				if child is Label:
					child.add_theme_color_override("font_color", Color(0.6, 0.65, 0.6, 0.9))
	)


func _brighten_target(target: Node, tint_color: Color) -> void:
	if target.has_method("can_claim"):
		# Block node — add tint overlay to its background
		var block_bg: ColorRect = target._bg
		if block_bg:
			var orig := block_bg.color
			var tween := create_tween()
			tween.tween_property(block_bg, "color", orig + tint_color, 0.1)
	elif target is ColorRect:
		var orig: Color = target.color
		var tween := create_tween()
		tween.tween_property(target, "color", orig + tint_color, 0.1)


func _reckoning_stutter() -> void:
	# Flicker the already-brightened blocks
	var floor_node: Node = get_parent()
	if not floor_node:
		return

	# Quick flicker (3 rapid on/off)
	var tween := create_tween()
	for i in range(3):
		tween.tween_property(floor_node, "modulate", Color(0.3, 0.3, 0.3), 0.06)
		tween.tween_property(floor_node, "modulate", Color.WHITE, 0.06)

	# Then blackout after delay
	tween.tween_interval(BLACKOUT_DELAY)
	tween.tween_callback(_trigger_blackout)


func _trigger_blackout() -> void:
	var gs: Node = get_node("/root/GameState")
	gs.reckoning_started = true

	# Blackout ALL floors
	var sim: Node = get_parent().get_parent()  # Floor -> Sim
	if not sim:
		return

	for fi in range(10):
		var fn: Node = sim.get_node_or_null("Floor%d" % fi)
		if fn:
			fn.modulate = Color(0.15, 0.15, 0.15)

	# After 1 second of darkness, restore floors and enable claiming
	get_tree().create_timer(1.0).timeout.connect(func():
		_restore_and_enable_claiming(sim)
	)


func _restore_and_enable_claiming(sim: Node) -> void:
	var gs: Node = get_node("/root/GameState")

	# Restore floor visuals
	for fi in range(10):
		var fn: Node = sim.get_node_or_null("Floor%d" % fi)
		if not fn:
			continue
		var tween := create_tween()
		tween.tween_property(fn, "modulate", Color.WHITE, 0.3)

	# Enable claiming + auto-claim non-contested floors
	for fi in range(10):
		var fn: Node = sim.get_node_or_null("Floor%d" % fi)
		if not fn:
			continue
		var is_contested: bool = fi in gs.CONTESTED_FLOORS
		for child in fn.get_children():
			if not child.has_method("can_claim"):
				continue
			if is_contested:
				child.claiming_enabled = true
			else:
				child.auto_claim("player")


func _process(_delta: float) -> void:
	if _lever_progress > 0.0 and _lever_progress < 1.0:
		queue_redraw()
