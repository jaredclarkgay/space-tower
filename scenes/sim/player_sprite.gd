extends Node2D

# Colors — browser version palette
const C_SKIN := Color(0.831, 0.647, 0.455)
const C_VEST := Color(0.85, 0.95, 0.05)
const C_STRIPE := Color(0.9, 0.9, 0.85)
const C_PANTS := Color(0.2, 0.2, 0.25)
const C_BOOTS := Color(0.35, 0.22, 0.1)
const C_HAT := Color(1.0, 0.82, 0.0)
const C_HAT_DARK := Color(0.85, 0.68, 0.0)
const C_HAT_BRIM := Color(0.9, 0.72, 0.0)
const C_EYES := Color(0.12, 0.12, 0.12)
const C_BELT := Color(0.25, 0.18, 0.08)

# Hammer colors
const C_HANDLE := Color(0.45, 0.30, 0.15)
const C_HAMMER_HEAD := Color(0.55, 0.55, 0.60)

# Power bar colors
const C_BAR_BG := Color(0.15, 0.15, 0.2, 0.7)
const C_BAR_JUMP := Color(0.3, 0.9, 0.4)
const C_BAR_DROP := Color(1.0, 0.4, 0.2)

func _physics_process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	var player: CharacterBody2D = get_parent()

	# Direction flip via draw transform — decoupled from scale/tweens
	var flip_x := -1.0 if not player.facing_right else 1.0

	# Activating — lever pull pose (facing left toward wall)
	if player.state == player.PlayerState.ACTIVATING:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(flip_x, 1.0))
		_draw_lever_pull()
		draw_set_transform(Vector2.ZERO)
		return

	# Claiming — kneeling hammer, alternates up/down each strike
	if player.state == player.PlayerState.CLAIMING:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(flip_x, 1.0))
		if player._claim_strike % 2 == 0:
			_draw_kneel_hammer_up()
		else:
			_draw_kneel_hammer_down()
		draw_set_transform(Vector2.ZERO)
		return

	if player.charging_jump:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(flip_x, 1.0))
		var t: float = float(player.charge_jump) / float(player.JUMP_CHARGE_TIME)
		_draw_charge_crouch(t)
		_draw_power_bar(t, C_BAR_JUMP)
	elif player.charging_drop:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(flip_x, 1.0))
		var t: float = float(player.charge_drop) / float(player.DROP_CHARGE_TIME)
		_draw_charge_crouch(t)
		_draw_power_bar(t, C_BAR_DROP)
	elif not player.is_on_floor():
		# Somersault — rotate the whole character around its center
		var angle: float = float(player.flip_frame) * TAU / 8.0
		if not player.facing_right:
			angle = -angle
		var center := Vector2(0, -24)  # center of 48px tall character
		var rotated_offset := center - center.rotated(angle)
		draw_set_transform(rotated_offset, angle, Vector2(flip_x, 1.0))
		_draw_jump_pose()
	else:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(flip_x, 1.0))
		if player.walk_frame == 0 and absf(player.velocity.x) > 10.0:
			_draw_step_a()
		elif player.walk_frame == 1 and absf(player.velocity.x) > 10.0:
			_draw_step_b()
		else:
			_draw_idle()

	# Reset transform
	draw_set_transform(Vector2.ZERO)

# --- Power bar above head ---
func _draw_power_bar(t: float, color: Color) -> void:
	var bar_w := 24.0
	var bar_h := 3.0
	var bar_x := -bar_w / 2.0
	var bar_y := -56.0
	draw_rect(Rect2(bar_x, bar_y, bar_w, bar_h), C_BAR_BG)
	draw_rect(Rect2(bar_x, bar_y, bar_w * t, bar_h), color)

# --- Upper body (shared by all poses) ---
func _draw_body_upper() -> void:
	# Torso / vest
	draw_rect(Rect2(-9, -34, 18, 13), C_VEST)
	draw_rect(Rect2(-9, -29, 18, 2), C_STRIPE)
	draw_rect(Rect2(-9, -25, 18, 2), C_STRIPE)
	# Belt with hammer on front hip (asymmetric — makes flip visible)
	draw_rect(Rect2(-9, -21, 18, 2), C_BELT)
	draw_rect(Rect2(5, -23, 3, 6), Color(0.4, 0.35, 0.3))  # hammer handle
	draw_rect(Rect2(4, -24, 5, 3), Color(0.5, 0.5, 0.55))  # hammer head
	# Neck
	draw_rect(Rect2(-3, -36, 6, 2), C_SKIN)
	# Head — shifted slightly forward (asymmetric)
	draw_rect(Rect2(-5, -44, 12, 8), C_SKIN)
	# Eyes — on the front side
	draw_rect(Rect2(2, -42, 2, 2), C_EYES)
	draw_rect(Rect2(5, -42, 2, 2), C_EYES)
	# Hard hat — brim extends further forward
	draw_rect(Rect2(-3, -49, 8, 1), C_HAT)
	draw_rect(Rect2(-5, -48, 12, 1), C_HAT)
	draw_rect(Rect2(-6, -47, 14, 3), C_HAT)
	draw_rect(Rect2(-6, -45, 14, 1), C_HAT_DARK)
	# Brim — longer on front side (asymmetric)
	draw_rect(Rect2(-7, -44, 20, 2), C_HAT_BRIM)

# --- Idle / passing ---
func _draw_idle() -> void:
	draw_rect(Rect2(-12, -33, 3, 11), C_SKIN)
	draw_rect(Rect2(-7, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(1, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(-7, -7, 6, 7), C_BOOTS)
	draw_rect(Rect2(1, -7, 6, 7), C_BOOTS)
	_draw_body_upper()
	draw_rect(Rect2(9, -33, 3, 11), C_SKIN)

# --- Walk frame: front leg forward ---
func _draw_step_a() -> void:
	draw_rect(Rect2(-12, -35, 3, 11), C_SKIN)
	draw_rect(Rect2(-5, -19, 6, 7), C_PANTS)
	draw_rect(Rect2(-3, -12, 6, 5), C_PANTS)
	draw_rect(Rect2(-3, -7, 6, 4), C_BOOTS)
	draw_rect(Rect2(3, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(3, -7, 6, 7), C_BOOTS)
	_draw_body_upper()
	draw_rect(Rect2(9, -31, 3, 11), C_SKIN)

# --- Walk frame: back leg forward ---
func _draw_step_b() -> void:
	draw_rect(Rect2(-12, -31, 3, 11), C_SKIN)
	draw_rect(Rect2(-9, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(-9, -7, 6, 7), C_BOOTS)
	draw_rect(Rect2(-1, -19, 6, 7), C_PANTS)
	draw_rect(Rect2(1, -12, 6, 5), C_PANTS)
	draw_rect(Rect2(1, -7, 6, 4), C_BOOTS)
	_draw_body_upper()
	draw_rect(Rect2(9, -35, 3, 11), C_SKIN)

# --- Jump / airborne ---
func _draw_jump_pose() -> void:
	draw_rect(Rect2(-13, -35, 3, 10), C_SKIN)
	draw_rect(Rect2(-7, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(1, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(-7, -7, 6, 7), C_BOOTS)
	draw_rect(Rect2(1, -7, 6, 7), C_BOOTS)
	_draw_body_upper()
	draw_rect(Rect2(10, -35, 3, 10), C_SKIN)

# --- Charging (crouch — used for both jump and drop) ---
func _draw_charge_crouch(t: float) -> void:
	var squash := t * 8.0
	# Arms lower with body
	draw_rect(Rect2(-12, -33 + squash, 3, 11), C_SKIN)
	# Legs compress, boots stay grounded
	draw_rect(Rect2(-7, -19 + squash, 6, 12 - squash), C_PANTS)
	draw_rect(Rect2(1, -19 + squash, 6, 12 - squash), C_PANTS)
	draw_rect(Rect2(-7, -7, 6, 7), C_BOOTS)
	draw_rect(Rect2(1, -7, 6, 7), C_BOOTS)
	# Upper body shifts down — save/restore the flip transform
	var player: CharacterBody2D = get_parent()
	var fx := -1.0 if not player.facing_right else 1.0
	draw_set_transform(Vector2(0, squash), 0.0, Vector2(fx, 1.0))
	_draw_body_upper()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(fx, 1.0))
	# Front arm
	draw_rect(Rect2(9, -33 + squash, 3, 11), C_SKIN)

# --- Hammer poses (claiming) — kneeling, rapid hammering ---

## Kneeling with hammer raised high overhead (wind-up)
func _draw_kneel_hammer_up() -> void:
	# Back arm bracing on knee
	draw_rect(Rect2(-10, -20, 3, 8), C_SKIN)
	# Kneeling legs — one knee down, one foot planted
	draw_rect(Rect2(-7, -12, 6, 6), C_PANTS)    # back thigh
	draw_rect(Rect2(-7, -6, 6, 6), C_BOOTS)     # back knee on ground
	draw_rect(Rect2(1, -16, 6, 10), C_PANTS)    # front leg bent
	draw_rect(Rect2(1, -6, 6, 6), C_BOOTS)      # front foot planted
	# Torso shifted down for kneel
	var player: CharacterBody2D = get_parent()
	var fx := -1.0 if not player.facing_right else 1.0
	draw_set_transform(Vector2(0, 8), 0.0, Vector2(fx, 1.0))
	_draw_body_upper()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(fx, 1.0))
	# Front arm raised high — hammer well overhead and out from body
	draw_rect(Rect2(10, -32, 3, 6), C_SKIN)     # upper arm angled out
	draw_rect(Rect2(12, -40, 3, 8), C_SKIN)     # forearm reaching up
	draw_rect(Rect2(11, -50, 3, 10), C_HANDLE)  # handle high up
	draw_rect(Rect2(9, -55, 7, 5), C_HAMMER_HEAD) # head way up top

## Lever pull — facing wall, arm reaching up/pulling down
func _draw_lever_pull() -> void:
	# Back arm at side
	draw_rect(Rect2(9, -33, 3, 11), C_SKIN)
	# Legs: standing
	draw_rect(Rect2(-7, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(1, -19, 6, 12), C_PANTS)
	draw_rect(Rect2(-7, -7, 6, 7), C_BOOTS)
	draw_rect(Rect2(1, -7, 6, 7), C_BOOTS)
	_draw_body_upper()
	# Front arm reaching up toward lever — extended forward and up
	draw_rect(Rect2(-12, -38, 3, 8), C_SKIN)   # upper arm reaching up
	draw_rect(Rect2(-14, -44, 3, 6), C_SKIN)   # forearm up to lever height

## Kneeling with hammer striking down — arm extended out from body
func _draw_kneel_hammer_down() -> void:
	# Back arm bracing on knee
	draw_rect(Rect2(-10, -20, 3, 8), C_SKIN)
	# Kneeling legs — same as up pose
	draw_rect(Rect2(-7, -12, 6, 6), C_PANTS)
	draw_rect(Rect2(-7, -6, 6, 6), C_BOOTS)
	draw_rect(Rect2(1, -16, 6, 10), C_PANTS)
	draw_rect(Rect2(1, -6, 6, 6), C_BOOTS)
	# Torso shifted down + slight forward lean into the strike
	var player: CharacterBody2D = get_parent()
	var fx := -1.0 if not player.facing_right else 1.0
	draw_set_transform(Vector2(2, 10), 0.0, Vector2(fx, 1.0))
	_draw_body_upper()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(fx, 1.0))
	# Front arm extended well out — hammer hits ground away from body
	draw_rect(Rect2(10, -22, 3, 8), C_SKIN)     # upper arm out
	draw_rect(Rect2(13, -14, 3, 10), C_SKIN)    # forearm reaching down and out
	draw_rect(Rect2(14, -4, 3, 7), C_HANDLE)    # handle angled to ground
	draw_rect(Rect2(12, 2, 7, 4), C_HAMMER_HEAD) # head strikes ground, well clear of body
