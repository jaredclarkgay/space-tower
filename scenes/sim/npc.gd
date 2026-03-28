extends CharacterBody2D

## Simple NPC — faction-colored character that patrols and talks

enum Faction { BUILDER, SUIT }
enum NPCState { IDLE, WALKING, ENTERING }

var faction: Faction = Faction.BUILDER
var floor_index: int = 0
var npc_name: String = ""
var is_gene: bool = false

## State
var npc_state: NPCState = NPCState.ENTERING
var patrol_dir: float = 1.0
var _entering_from_left: bool = true
const ENTER_SPEED := 60.0
const STAIR_X := 2040.0       # x position of stairwell (FLOOR_WIDTH - STAIR_WIDTH)
var _idle_timer: float = 0.0
var _walk_timer: float = 0.0
var _walk_frame: int = 0
var is_player_nearby: bool = false

## Dialogue
var dialogue_lines: Array[String] = []
var _dialogue_index: int = 0
var _dialogue_label: Label = null
var _dialogue_timer: float = 0.0
var _showing_dialogue: bool = false

## Constants
const PATROL_SPEED := 30.0
const IDLE_MIN := 2.0
const IDLE_MAX := 5.0
const FLOOR_LEFT_BOUND := 40.0
const FLOOR_RIGHT_BOUND := 2120.0
const NPC_INTERACTION_RANGE := 40.0

## Faction colors
const C_BUILDER_VEST := Color(0.95, 0.55, 0.15)
const C_BUILDER_PANTS := Color(0.3, 0.25, 0.15)
const C_BUILDER_HAT := Color(0.9, 0.72, 0.0)
const C_SUIT_JACKET := Color(0.12, 0.12, 0.14)
const C_SUIT_PANTS := Color(0.10, 0.10, 0.12)
const C_SUIT_TIE := Color(0.5, 0.12, 0.12)
const C_SKIN := Color(0.831, 0.647, 0.455)
const C_EYES := Color(0.12, 0.12, 0.12)
const C_SHOES := Color(0.2, 0.15, 0.1)
const C_HAIR := Color(0.25, 0.2, 0.15)

## Gene colors
const C_GENE_SUIT := Color(0.35, 0.28, 0.45)
const C_GENE_TIE := Color(0.5, 0.45, 0.2)

## Dialogue pools
const BUILDER_EARLY := [
	"Poured the lobby slab myself. Cried a little.",
	"You pull that breaker yourself? Respect.",
	"The job's honest. The job's good.",
	"I eat lunch on floor two. Don't tell anyone about the view.",
	"My kid drew me a picture of the tower. Got the floors wrong. Still cried.",
	"Somebody left a sandwich in the elevator shaft. It's been three days.",
	"I named my hammer. Her name is Brenda.",
	"Eleven floors, no crane. My back has opinions.",
	"The diner's not open yet but I can smell it. I can SMELL it.",
	"If this tower falls over I'm blaming gravity.",
]

const BUILDER_MID := [
	"Someone put a suggestion box on six. It's already full.",
	"They want to 'reimagine' the garden. It's PLANTS.",
	"I liked it when we could hear ourselves think.",
	"Had a suit explain my own floor to me yesterday.",
	"Used to know everyone by name. Now I know everyone by lanyard.",
	"The observation deck had a nice echo. They carpeted it.",
	"Saw a memo about 'optimizing vertical transit.' It's called STAIRS.",
	"The job was better when we didn't have a mission statement.",
	"Someone scheduled a meeting about the meeting schedule.",
	"I don't go above seven anymore. Vibes are off.",
]

const SUIT_EARLY := [
	"Good progress on the work. Very on-brand.",
	"The lobby's taking shape. We should monetize that.",
	"We've pre-allocated floors three and four. Tentatively.",
	"Efficient. Very efficient. I'm noting this.",
	"The board is pleased. I am also pleased, separately.",
	"Have you seen my lanyard? It's the blue one. No, the OTHER blue.",
	"I'll draft a status report on the status reports.",
	"This elevator could really use a 'close door' button that works.",
]

const SUIT_MID := [
	"We need a conference room. Or five.",
	"The work is expanding. The work ALWAYS expands.",
	"Has anyone done a space audit? I love space audits.",
	"The observation deck should have a booking system. And a dress code.",
	"I've drafted a proposal. It's mostly pie charts.",
	"We should synergize the vertical workflow. That means something.",
	"Some of these floors could be better utilized. By us. Specifically.",
	"I'm scheduling a review of the last review's action items.",
	"The lounge doesn't have WiFi. I consider this a crisis.",
	"Who approved the garden? Gardens don't have KPIs.",
]

## Gene — deliberately forgettable, designed to be overlooked
const GENE_LINES := [
	"Oh. Hello. I'm just... don't worry about it.",
	"Routine inspection. Completely routine.",
	"Everything seems to be in order. Mostly.",
	"I'll be on my way. Busy busy.",
	"These forms won't file themselves. Trust me, I've asked.",
	"Have we met? No? That's fine. That's normal.",
	"I'm from... well. Doesn't matter.",
	"You're doing good work here. Or is it 'the job'? I forget.",
]

var _sprite: Node2D
var _interaction_area: Area2D
var _dialogue_bubble: PanelContainer = null


func initialize(f: Faction, fi: int, gene: bool = false) -> void:
	faction = f
	floor_index = fi
	is_gene = gene

	# Pick dialogue
	if is_gene:
		dialogue_lines.assign(GENE_LINES.duplicate())
	else:
		_pick_dialogue()

	# Random start state
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	_idle_timer = rng.randf_range(IDLE_MIN, IDLE_MAX)
	patrol_dir = 1.0 if rng.randf() > 0.5 else -1.0

	# Build visual + interaction
	_build_sprite()
	_build_interaction_area()
	_build_dialogue_label()

	collision_layer = 0
	collision_mask = 2  # stand on floors

	# Physics body shape
	var body_shape := CollisionShape2D.new()
	var body_rect := RectangleShape2D.new()
	body_rect.size = Vector2(14, 40)
	body_shape.shape = body_rect
	body_shape.position = Vector2(0, -20)
	add_child(body_shape)


func _pick_dialogue() -> void:
	var gs: Node = get_node("/root/GameState")
	var count: int = gs.floors_activated_count
	var pool: Array
	if faction == Faction.BUILDER:
		pool = BUILDER_MID.duplicate() if count >= 5 else BUILDER_EARLY.duplicate()
	else:
		pool = SUIT_MID.duplicate() if count >= 5 else SUIT_EARLY.duplicate()
	# Pick 3 random lines
	pool.shuffle()
	dialogue_lines.assign([pool[0], pool[1 % pool.size()], pool[2 % pool.size()]])


func _build_sprite() -> void:
	_sprite = Node2D.new()
	_sprite.z_index = 8
	_sprite.set_script(load("res://scenes/sim/npc_sprite.gd"))
	_sprite.set_meta("npc", self)
	add_child(_sprite)


func _build_interaction_area() -> void:
	_interaction_area = Area2D.new()
	_interaction_area.collision_layer = 0
	_interaction_area.collision_mask = 1
	var col_shape := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(NPC_INTERACTION_RANGE, 48)
	col_shape.shape = shape
	col_shape.position = Vector2(0, -24)
	_interaction_area.add_child(col_shape)
	add_child(_interaction_area)
	_interaction_area.body_entered.connect(func(_b: Node2D): is_player_nearby = true)
	_interaction_area.body_exited.connect(func(_b: Node2D): is_player_nearby = false)


func _build_dialogue_label() -> void:
	# Speech bubble: white panel with dark text
	_dialogue_bubble = PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.95, 0.95, 0.92, 0.95)
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_left = 4
	style.corner_radius_bottom_right = 4
	style.content_margin_left = 6
	style.content_margin_right = 6
	style.content_margin_top = 3
	style.content_margin_bottom = 3
	style.border_width_left = 1
	style.border_width_right = 1
	style.border_width_top = 1
	style.border_width_bottom = 1
	style.border_color = Color(0.6, 0.6, 0.55, 0.8)
	_dialogue_bubble.add_theme_stylebox_override("panel", style)
	_dialogue_bubble.position = Vector2(-70, -62)
	_dialogue_bubble.size = Vector2(140, 24)
	_dialogue_bubble.visible = false
	_dialogue_bubble.z_index = 25

	_dialogue_label = Label.new()
	_dialogue_label.add_theme_font_size_override("font_size", 9)
	_dialogue_label.add_theme_color_override("font_color", Color(0.15, 0.15, 0.15))
	_dialogue_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dialogue_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	_dialogue_bubble.add_child(_dialogue_label)
	add_child(_dialogue_bubble)


func show_dialogue() -> void:
	if dialogue_lines.is_empty():
		return
	_dialogue_label.text = dialogue_lines[_dialogue_index % dialogue_lines.size()]
	_dialogue_bubble.visible = true
	_showing_dialogue = true
	_dialogue_timer = 2.5
	_dialogue_index += 1


func _physics_process(delta: float) -> void:
	# Dialogue timer
	if _showing_dialogue:
		_dialogue_timer -= delta
		if _dialogue_timer <= 0.0:
			_dialogue_bubble.visible = false
			_showing_dialogue = false

	# Gravity
	if not is_on_floor():
		velocity.y += 900.0 * delta
		move_and_slide()
		return

	match npc_state:
		NPCState.ENTERING:
			# Walk toward stairwell from building entrance
			if _entering_from_left:
				velocity.x = ENTER_SPEED
				patrol_dir = 1.0
			else:
				velocity.x = -ENTER_SPEED
				patrol_dir = -1.0
			_walk_frame = (int(Time.get_ticks_msec() / 166.0)) % 4

			# Reached stairwell — teleport to target floor
			if (_entering_from_left and position.x >= STAIR_X) or (not _entering_from_left and position.x <= FLOOR_LEFT_BOUND + 40):
				_arrive_at_floor()
		NPCState.IDLE:
			velocity.x = 0.0
			_idle_timer -= delta
			if _idle_timer <= 0.0:
				npc_state = NPCState.WALKING
				_walk_timer = randf_range(1.5, 4.0)
		NPCState.WALKING:
			velocity.x = patrol_dir * PATROL_SPEED
			_walk_timer -= delta
			_walk_frame = (int(_walk_timer * 6.0)) % 4

			# Turn at floor bounds
			if position.x < FLOOR_LEFT_BOUND:
				patrol_dir = 1.0
			elif position.x > FLOOR_RIGHT_BOUND:
				patrol_dir = -1.0

			if _walk_timer <= 0.0:
				npc_state = NPCState.IDLE
				_idle_timer = randf_range(IDLE_MIN, IDLE_MAX)
				_walk_frame = 0

	move_and_slide()


func _arrive_at_floor() -> void:
	# Reparent from ground floor to target floor
	if floor_index == 0:
		# Already on correct floor
		npc_state = NPCState.IDLE
		_idle_timer = randf_range(IDLE_MIN, IDLE_MAX)
		position.x = randf_range(200.0, STAIR_X - 100.0)
		return

	var current_parent: Node = get_parent()
	var sim: Node = current_parent.get_parent()
	var target_floor_node: Node = sim.get_node_or_null("Floor%d" % floor_index)
	if not target_floor_node:
		npc_state = NPCState.IDLE
		return

	# Reparent to target floor
	current_parent.remove_child(self)
	target_floor_node.add_child(self)
	position = Vector2(randf_range(200.0, STAIR_X - 100.0), -2.0)
	npc_state = NPCState.IDLE
	_idle_timer = randf_range(IDLE_MIN, IDLE_MAX)
