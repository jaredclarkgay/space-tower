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

# Collision layers: 1 = player, 2 = floors, 4 = walls
const FLOOR_LAYER := 2

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

@onready var sprite: Node2D = $Sprite

func _physics_process(delta: float) -> void:
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
	else:
		flip_frame = 0
		_flip_timer = 0.0

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
		else:
			velocity.x = 0.0
			walk_frame = 0
			_walk_timer = 0.0
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
		set_collision_mask_value(FLOOR_LAYER, true)

func _land_squash() -> void:
	sprite.scale = Vector2(1.15, 0.85)
	var tween := create_tween()
	tween.tween_property(sprite, "scale", Vector2(1.0, 1.0), 0.1)
