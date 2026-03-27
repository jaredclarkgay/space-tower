extends CharacterBody2D

const SPEED := 200.0
const SPRINT_SPEED := 340.0
const GRAVITY := 900.0

# Charged jump — hold longer for higher launch
const JUMP_MIN := -300.0
const JUMP_MAX := -650.0
const JUMP_CHARGE_TIME := 0.4

# Charged drop — hold longer to fall through more floors
const DROP_MIN_TIME := 0.2
const DROP_MAX_TIME := 0.8
const DROP_CHARGE_TIME := 0.3
const DROP_VELOCITY := 100.0
const DROP_MAX_VELOCITY := 400.0

# Claiming — 8 fast strikes while kneeling
const STRIKE_DURATION := 0.075
const STRIKE_PAUSE := 0.01

# Collision layers: 1 = player, 2 = floors, 4 = walls
const FLOOR_LAYER := 2

enum PlayerState { IDLE, MOVING, JUMPING, CLAIMING }
var state: PlayerState = PlayerState.IDLE

var facing_right := true
var walk_frame := 0
var charge_jump := 0.0
var charge_drop := 0.0
var charging_jump := false
var charging_drop := false
var sprinting := false
var flip_frame := 0  # 0-7 somersault frames while airborne
var _flip_timer := 0.0

var _walk_timer := 0.0
var _was_on_floor := true
var _drop_timer := 0.0
var _dropping := false

# Claiming state
var _claim_target: Node2D = null
var _claim_strike: int = 0        # which strike in sequence (0-3)
var _claim_timer: float = 0.0
var _claim_paused: bool = false   # brief pause between strikes
var _claim_pause_timer: float = 0.0

@onready var sprite: Node2D = $Sprite
var _interact_label: Label = null

func _ready() -> void:
	_interact_label = Label.new()
	_interact_label.text = "(E) Engage"
	_interact_label.add_theme_font_size_override("font_size", 10)
	_interact_label.add_theme_color_override("font_color", Color(0.85, 0.9, 0.85, 0.9))
	_interact_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	_interact_label.add_theme_constant_override("shadow_offset_x", 1)
	_interact_label.add_theme_constant_override("shadow_offset_y", 1)
	_interact_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_interact_label.position = Vector2(-32, -64)
	_interact_label.size = Vector2(64, 14)
	_interact_label.visible = false
	_interact_label.z_index = 20
	add_child(_interact_label)

func _process(_delta: float) -> void:
	# Show/hide interact prompt
	if state == PlayerState.CLAIMING or not is_on_floor() or absf(velocity.x) > 5.0:
		_interact_label.visible = false
		return
	var sim: Node2D = get_parent()
	if sim.has_method("find_nearest_claimable_block"):
		var block: Node2D = sim.find_nearest_claimable_block(global_position, "player")
		_interact_label.visible = block != null
	else:
		_interact_label.visible = false

func _physics_process(delta: float) -> void:
	# --- Claiming state ---
	if state == PlayerState.CLAIMING:
		_process_claiming(delta)
		move_and_slide()
		return

	var on_floor := is_on_floor()

	# Landing squash
	if on_floor and not _was_on_floor:
		_land_squash()
	_was_on_floor = on_floor

	# Drop-through timer
	if _dropping:
		_drop_timer -= delta
		if _drop_timer <= 0.0:
			_dropping = false
			set_collision_mask_value(FLOOR_LAYER, true)

	# Gravity + flip animation
	if not on_floor:
		velocity.y += GRAVITY * delta
		_flip_timer += delta
		if _flip_timer > 0.06:  # ~16 fps flip animation
			_flip_timer = 0.0
			flip_frame = (flip_frame + 1) % 8
		state = PlayerState.JUMPING
	else:
		flip_frame = 0
		_flip_timer = 0.0

	# --- Interact: start claiming ---
	if on_floor and Input.is_action_just_pressed("interact"):
		_try_start_claim()
		if state == PlayerState.CLAIMING:
			move_and_slide()
			return

	# --- Charged jump ---
	if on_floor and Input.is_action_pressed("jump"):
		if not charging_jump:
			charging_jump = true
			charge_jump = 0.0
		charge_jump = minf(charge_jump + delta, JUMP_CHARGE_TIME)
	elif charging_jump:
		var t := charge_jump / JUMP_CHARGE_TIME
		velocity.y = lerpf(JUMP_MIN, JUMP_MAX, t)
		charging_jump = false
		charge_jump = 0.0

	# --- Charged drop ---
	if on_floor and Input.is_action_pressed("drop") and not _dropping:
		if not charging_drop:
			charging_drop = true
			charge_drop = 0.0
		charge_drop = minf(charge_drop + delta, DROP_CHARGE_TIME)
	elif charging_drop:
		var t := charge_drop / DROP_CHARGE_TIME
		_dropping = true
		_drop_timer = lerpf(DROP_MIN_TIME, DROP_MAX_TIME, t)
		set_collision_mask_value(FLOOR_LAYER, false)
		velocity.y = lerpf(DROP_VELOCITY, DROP_MAX_VELOCITY, t)
		charging_drop = false
		charge_drop = 0.0

	# Sprint
	sprinting = Input.is_action_pressed("sprint")

	# Horizontal movement (disabled while charging)
	if not charging_jump and not charging_drop:
		var direction := Input.get_axis("move_left", "move_right")
		if direction != 0.0:
			var spd := SPRINT_SPEED if sprinting else SPEED
			velocity.x = direction * spd
			facing_right = direction > 0.0
			var frame_rate := 0.08 if sprinting else 0.12
			_walk_timer += delta
			if _walk_timer > frame_rate:
				_walk_timer = 0.0
				walk_frame = (walk_frame + 1) % 4
			state = PlayerState.MOVING
		else:
			velocity.x = 0.0
			walk_frame = 0
			_walk_timer = 0.0
			if on_floor:
				state = PlayerState.IDLE
	else:
		velocity.x = 0.0
		walk_frame = 0
		_walk_timer = 0.0

	move_and_slide()

	# Safety net — if player falls below the tower, teleport to floor 0
	if position.y > 200.0:
		position = Vector2(384.0, -10.0)
		velocity = Vector2.ZERO
		_dropping = false
		state = PlayerState.IDLE
		set_collision_mask_value(FLOOR_LAYER, true)


func _try_start_claim() -> void:
	var sim: Node2D = get_parent()
	var block: Node2D = sim.find_nearest_claimable_block(global_position, "player")
	if not block:
		return
	_claim_target = block
	_claim_strike = block.current_strike
	_claim_timer = STRIKE_DURATION
	_claim_paused = false
	state = PlayerState.CLAIMING
	velocity = Vector2.ZERO
	walk_frame = 0
	# Snap to block center x (in world space)
	var block_center_x: float = block.global_position.x + block.block_width / 2.0
	position.x = block_center_x


func _process_claiming(delta: float) -> void:
	# Jump cancels between strikes
	if _claim_paused and Input.is_action_just_pressed("jump"):
		_cancel_claim()
		return

	if _claim_paused:
		_claim_pause_timer -= delta
		if _claim_pause_timer <= 0.0:
			_claim_paused = false
			_claim_timer = STRIKE_DURATION
		return

	_claim_timer -= delta
	if _claim_timer <= 0.0:
		# Strike complete
		_claim_target.apply_strike(_claim_strike, "player")
		# Save to GameState
		var gs: Node = get_node("/root/GameState")
		var key := "claim_%d_%d" % [_claim_target.floor_index, _claim_target.block_index]
		gs.block_claims[key] = _claim_target.claim_progress
		gs.block_claim_owners[key] = "player"

		_claim_strike += 1
		if _claim_strike >= 8:
			# Block complete
			state = PlayerState.IDLE
			_claim_target = null
			return
		# Pause before next strike
		_claim_paused = true
		_claim_pause_timer = STRIKE_PAUSE


func _cancel_claim() -> void:
	state = PlayerState.IDLE
	_claim_target = null
	_claim_paused = false

func _land_squash() -> void:
	sprite.scale = Vector2(1.15, 0.85)
	var tween := create_tween()
	tween.tween_property(sprite, "scale", Vector2(1.0, 1.0), 0.1)
