extends CharacterBody2D

const SPEED := 200.0
const JUMP_VELOCITY := -500.0
const GRAVITY := 900.0
const DROP_DISABLE_TIME := 0.2

# Collision layers: 1 = player, 2 = floors
const FLOOR_LAYER := 2

var facing_right := true
var walk_frame := 0

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

	# Gravity
	if not on_floor:
		velocity.y += GRAVITY * delta

	# Jump
	if Input.is_action_just_pressed("jump") and on_floor:
		velocity.y = JUMP_VELOCITY

	# Drop through floor
	if Input.is_action_just_pressed("drop") and on_floor and not _dropping:
		_dropping = true
		_drop_timer = DROP_DISABLE_TIME
		set_collision_mask_value(FLOOR_LAYER, false)
		velocity.y = 50.0  # small nudge downward

	# Horizontal movement
	var direction := Input.get_axis("move_left", "move_right")
	if direction != 0.0:
		velocity.x = direction * SPEED
		facing_right = direction > 0.0
		_walk_timer += delta
		if _walk_timer > 0.12:
			_walk_timer = 0.0
			walk_frame = (walk_frame + 1) % 4
	else:
		velocity.x = 0.0
		walk_frame = 0
		_walk_timer = 0.0

	move_and_slide()

func _land_squash() -> void:
	sprite.scale = Vector2(1.15, 0.85)
	var tween := create_tween()
	tween.tween_property(sprite, "scale", Vector2(1.0, 1.0), 0.1)
