extends Node2D

# Colors — browser version palette
const C_SKIN := Color(0.831, 0.647, 0.455)
const C_VEST := Color(0.95, 0.45, 0.05)
const C_STRIPE := Color(0.9, 0.9, 0.85)
const C_PANTS := Color(0.2, 0.2, 0.25)
const C_BOOTS := Color(0.35, 0.22, 0.1)
const C_HAT := Color(1.0, 0.82, 0.0)
const C_HAT_DARK := Color(0.85, 0.68, 0.0)
const C_HAT_BRIM := Color(0.9, 0.72, 0.0)
const C_EYES := Color(0.12, 0.12, 0.12)
const C_BELT := Color(0.25, 0.18, 0.08)

var _last_facing := true
var _last_frame := -1
var _last_on_floor := true

func _process(_delta: float) -> void:
	var player: CharacterBody2D = get_parent()
	var facing: bool = player.facing_right
	var frame: int = player.walk_frame
	var on_floor: bool = player.is_on_floor()

	# Flip the visual node — collision and camera are siblings, unaffected
	if facing != _last_facing:
		scale.x = 1.0 if facing else -1.0
		_last_facing = facing

	# Redraw only when state changes
	if frame != _last_frame or on_floor != _last_on_floor:
		_last_frame = frame
		_last_on_floor = on_floor
		queue_redraw()

func _draw() -> void:
	var player: CharacterBody2D = get_parent()

	if not player.is_on_floor():
		_draw_jump_pose()
	elif player.walk_frame == 1:
		_draw_step_a()
	elif player.walk_frame == 3:
		_draw_step_b()
	else:
		_draw_idle()

# --- Upper body (shared by all poses) ---
func _draw_body_upper() -> void:
	# Torso / vest
	draw_rect(Rect2(-9, -34, 18, 13), C_VEST)
	draw_rect(Rect2(-9, -29, 18, 2), C_STRIPE)
	draw_rect(Rect2(-9, -25, 18, 2), C_STRIPE)
	# Tool belt
	draw_rect(Rect2(-9, -21, 18, 2), C_BELT)
	# Neck
	draw_rect(Rect2(-3, -36, 6, 2), C_SKIN)
	# Head
	draw_rect(Rect2(-6, -44, 12, 8), C_SKIN)
	# Eyes (drawn on right side — scale.x flip handles mirroring)
	draw_rect(Rect2(1, -42, 2, 2), C_EYES)
	draw_rect(Rect2(4, -42, 2, 2), C_EYES)
	# Hard hat dome
	draw_rect(Rect2(-4, -49, 8, 1), C_HAT)
	draw_rect(Rect2(-6, -48, 12, 1), C_HAT)
	draw_rect(Rect2(-7, -47, 14, 3), C_HAT)
	draw_rect(Rect2(-7, -45, 14, 1), C_HAT_DARK)
	# Brim
	draw_rect(Rect2(-9, -44, 20, 2), C_HAT_BRIM)

# --- Idle / passing ---
func _draw_idle() -> void:
	draw_rect(Rect2(-12, -33, 3, 11), C_SKIN)       # back arm
	draw_rect(Rect2(-7, -19, 6, 12), C_PANTS)        # left leg
	draw_rect(Rect2(1, -19, 6, 12), C_PANTS)         # right leg
	draw_rect(Rect2(-7, -7, 6, 7), C_BOOTS)          # left boot
	draw_rect(Rect2(1, -7, 6, 7), C_BOOTS)           # right boot
	_draw_body_upper()
	draw_rect(Rect2(9, -33, 3, 11), C_SKIN)          # front arm

# --- Walk frame: front leg forward ---
func _draw_step_a() -> void:
	draw_rect(Rect2(-12, -35, 3, 11), C_SKIN)        # back arm forward
	# Back leg — knee bent
	draw_rect(Rect2(-5, -19, 6, 7), C_PANTS)         # thigh
	draw_rect(Rect2(-3, -12, 6, 5), C_PANTS)         # shin up
	draw_rect(Rect2(-3, -7, 6, 4), C_BOOTS)          # boot raised
	# Front leg — straight
	draw_rect(Rect2(3, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(3, -7, 6, 7), C_BOOTS)
	_draw_body_upper()
	draw_rect(Rect2(9, -31, 3, 11), C_SKIN)          # front arm back

# --- Walk frame: back leg forward ---
func _draw_step_b() -> void:
	draw_rect(Rect2(-12, -31, 3, 11), C_SKIN)        # back arm back
	# Front leg — straight
	draw_rect(Rect2(-9, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(-9, -7, 6, 7), C_BOOTS)
	# Back leg — knee bent
	draw_rect(Rect2(-1, -19, 6, 7), C_PANTS)
	draw_rect(Rect2(1, -12, 6, 5), C_PANTS)
	draw_rect(Rect2(1, -7, 6, 4), C_BOOTS)
	_draw_body_upper()
	draw_rect(Rect2(9, -35, 3, 11), C_SKIN)          # front arm forward

# --- Jump pose ---
func _draw_jump_pose() -> void:
	draw_rect(Rect2(-13, -35, 3, 10), C_SKIN)        # arm out
	draw_rect(Rect2(-7, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(1, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(-7, -7, 6, 7), C_BOOTS)
	draw_rect(Rect2(1, -7, 6, 7), C_BOOTS)
	_draw_body_upper()
	draw_rect(Rect2(10, -35, 3, 10), C_SKIN)         # arm out
