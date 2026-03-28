extends Node2D

## Block claim and buildout state
var block_index: int = -1
var floor_index: int = -1

## Claim state
var claim_progress: float = 0.0
var claim_owner: String = ""         # "player", "builder_ai", "suit", or ""
var claim_locked: bool = false       # true when 1.0 reached
var current_strike: int = 0          # 0-7, which strike we're on

## Visual state
var owner_color: Color = Color(0.95, 0.45, 0.05)  # default vest orange
var is_player_nearby: bool = false

## Gating — false during Movement 1, true after Reckoning starts
var claiming_enabled: bool = false

## Dimensions (set by initialize())
var block_width: float = 64.0
var block_height: float = 92.0

## Constants
const STRIKES_TOTAL := 8
const PROGRESS_PER_STRIKE := 0.125
const BORDER_WIDTH := 2.0
const FILL_ALPHA := 0.3
const SPARK_COUNT := 10
const COMPLETION_SPARK_COUNT := 25

## Child nodes
var _bg: ColorRect
var _border_left: Line2D
var _border_bottom: Line2D
var _border_right: Line2D
var _border_top: Line2D
var _fill: ColorRect
var _interaction_area: Area2D
var _spark_particles: GPUParticles2D
var _completion_particles: GPUParticles2D

signal claim_completed(floor_idx, block_idx)


func initialize(w: float, h: float, bg_color: Color) -> void:
	block_width = w
	block_height = h
	_build_background(bg_color)
	_build_borders()
	_build_fill()
	_build_interaction_area()
	_build_spark_particles()
	_build_completion_particles()


func _build_background(bg_color: Color) -> void:
	_bg = ColorRect.new()
	_bg.position = Vector2.ZERO
	_bg.size = Vector2(block_width, block_height)
	_bg.color = bg_color
	add_child(_bg)


func _build_borders() -> void:
	_border_left = _make_border()
	_border_bottom = _make_border()
	_border_right = _make_border()
	_border_top = _make_border()
	add_child(_border_left)
	add_child(_border_bottom)
	add_child(_border_right)
	add_child(_border_top)


func _make_border() -> Line2D:
	var line := Line2D.new()
	line.width = BORDER_WIDTH
	line.visible = false
	line.z_index = 2
	return line


func _build_fill() -> void:
	_fill = ColorRect.new()
	_fill.position = Vector2.ZERO
	_fill.size = Vector2(block_width, block_height)
	_fill.color = Color.TRANSPARENT
	_fill.visible = false
	_fill.z_index = 1
	add_child(_fill)


func _build_interaction_area() -> void:
	_interaction_area = Area2D.new()
	_interaction_area.collision_layer = 0
	_interaction_area.collision_mask = 1  # detect player (layer 1)
	var col_shape := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(block_width + 16, block_height + 16)
	col_shape.shape = shape
	col_shape.position = Vector2(block_width / 2.0, block_height / 2.0)
	_interaction_area.add_child(col_shape)
	add_child(_interaction_area)

	_interaction_area.body_entered.connect(_on_player_enter)
	_interaction_area.body_exited.connect(_on_player_exit)


func _build_spark_particles() -> void:
	_spark_particles = GPUParticles2D.new()
	_spark_particles.emitting = false
	_spark_particles.one_shot = true
	_spark_particles.amount = SPARK_COUNT
	_spark_particles.lifetime = 0.3
	_spark_particles.explosiveness = 0.9
	_spark_particles.z_index = 5

	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, -1, 0)
	mat.spread = 45.0
	mat.initial_velocity_min = 80.0
	mat.initial_velocity_max = 120.0
	mat.gravity = Vector3(0, 200, 0)
	mat.scale_min = 1.5
	mat.scale_max = 2.0
	# Bright owner color
	var spark_color := owner_color
	spark_color.v = 1.0  # max brightness
	mat.color = spark_color
	_spark_particles.process_material = mat
	add_child(_spark_particles)


func _build_completion_particles() -> void:
	_completion_particles = GPUParticles2D.new()
	_completion_particles.emitting = false
	_completion_particles.one_shot = true
	_completion_particles.amount = COMPLETION_SPARK_COUNT
	_completion_particles.lifetime = 0.5
	_completion_particles.explosiveness = 0.9
	_completion_particles.z_index = 5

	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, -1, 0)
	mat.spread = 80.0
	mat.initial_velocity_min = 60.0
	mat.initial_velocity_max = 140.0
	mat.gravity = Vector3(0, 150, 0)
	mat.scale_min = 1.0
	mat.scale_max = 2.5
	mat.color = owner_color
	_completion_particles.process_material = mat
	_completion_particles.position = Vector2(block_width / 2.0, block_height / 2.0)
	add_child(_completion_particles)


func _on_player_enter(body: Node2D) -> void:
	if body is CharacterBody2D:
		is_player_nearby = true


func _on_player_exit(body: Node2D) -> void:
	if body is CharacterBody2D:
		is_player_nearby = false


## Called by the player when a strike completes
func apply_strike(strike_index: int, who: String) -> void:
	if claim_locked:
		return

	# First strike sets ownership
	if claim_progress == 0.0:
		claim_owner = who
		owner_color = _get_color_for_owner(who)

	current_strike = strike_index + 1
	claim_progress = float(current_strike) * PROGRESS_PER_STRIKE
	_update_borders()
	_emit_sparks(strike_index)

	if claim_progress >= 1.0:
		_on_claim_complete()


func _get_color_for_owner(who: String) -> Color:
	if who == "player":
		var gs: Node = get_node("/root/GameState")
		if gs.builder_color != Color.WHITE:
			return gs.builder_color
		return Color(0.95, 0.45, 0.05)  # default vest orange
	elif who == "suit":
		return Color(0.15, 0.15, 0.18)
	else:
		return Color(0.95, 0.45, 0.05)


func can_claim(who: String) -> bool:
	if not claiming_enabled:
		return false
	if claim_locked:
		return false
	if claim_owner == "" or claim_owner == who:
		return true
	return false

## Auto-claim this block fully for an owner (used for non-contested floors on Reckoning start)
func auto_claim(who: String) -> void:
	claiming_enabled = true
	claim_owner = who
	owner_color = _get_color_for_owner(who)
	claim_progress = 1.0
	current_strike = STRIKES_TOTAL
	claim_locked = true
	_update_borders()
	_fill.visible = true
	_fill.color = Color(owner_color, FILL_ALPHA)


## Update the four border Line2Ds based on claim_progress
## Borders fill the full perimeter smoothly across all 8 strikes
func _update_borders() -> void:
	var w := block_width
	var h := block_height
	# Perimeter fills: left (0–0.25), bottom (0.25–0.5), right (0.5–0.75), top (0.75–1.0)
	var left_frac := clampf(claim_progress / 0.25, 0.0, 1.0)
	_set_edge(_border_left, Vector2(0, h), Vector2(0, h - h * left_frac), left_frac)

	var bottom_frac := clampf((claim_progress - 0.25) / 0.25, 0.0, 1.0)
	_set_edge(_border_bottom, Vector2(0, h), Vector2(w * bottom_frac, h), bottom_frac)

	var right_frac := clampf((claim_progress - 0.50) / 0.25, 0.0, 1.0)
	_set_edge(_border_right, Vector2(w, h), Vector2(w, h - h * right_frac), right_frac)

	var top_frac := clampf((claim_progress - 0.75) / 0.25, 0.0, 1.0)
	_set_edge(_border_top, Vector2(w, 0), Vector2(w - w * top_frac, 0), top_frac)


func _set_edge(line: Line2D, from: Vector2, to: Vector2, frac: float) -> void:
	if frac <= 0.0:
		line.visible = false
		return
	line.visible = true
	line.clear_points()
	line.add_point(from)
	line.add_point(to)
	line.default_color = owner_color
	line.width = BORDER_WIDTH


func _emit_sparks(_strike_index: int) -> void:
	# Sparks fly from the hammer contact point (bottom center of block)
	_spark_particles.position = Vector2(block_width * 0.5, block_height * 0.85)
	var mat: ParticleProcessMaterial = _spark_particles.process_material
	mat.direction = Vector3(0, -1, 0)
	var spark_color := owner_color
	spark_color.v = 1.0
	mat.color = spark_color
	_spark_particles.restart()
	_spark_particles.emitting = true


func _on_claim_complete() -> void:
	claim_locked = true
	_flash_borders()
	_flood_fill()
	_completion_particles.restart()
	_completion_particles.emitting = true
	claim_completed.emit(floor_index, block_index)

	# Update GameState buildout
	var gs: Node = get_node("/root/GameState")
	var claimed_count := _count_claimed_blocks_on_floor()
	var new_stage := 0
	if claimed_count >= 7:
		new_stage = 3
	elif claimed_count >= 4:
		new_stage = 2
	elif claimed_count >= 2:
		new_stage = 1
	var current_stage: int = gs.buildout[floor_index].get("stage", 0)
	if new_stage > current_stage:
		gs.buildout[floor_index]["stage"] = new_stage


func _count_claimed_blocks_on_floor() -> int:
	var gs: Node = get_node("/root/GameState")
	var count := 0
	for bi in range(12):
		var key := "claim_%d_%d" % [floor_index, bi]
		if gs.block_claims.get(key, 0.0) >= 1.0:
			count += 1
	return count


func _flash_borders() -> void:
	for border in [_border_left, _border_bottom, _border_right, _border_top]:
		border.default_color = Color.WHITE
	var tween := create_tween()
	tween.set_parallel(true)
	for border in [_border_left, _border_bottom, _border_right, _border_top]:
		tween.tween_property(border, "default_color", owner_color, 0.2)


func _flood_fill() -> void:
	_fill.visible = true
	_fill.color = Color(owner_color, 0.0)
	var tween := create_tween()
	tween.tween_property(_fill, "color", Color(owner_color, FILL_ALPHA), 0.15)
