extends Node2D

## NPC sprite — procedural _draw() rendering for suit/builder NPCs

func _physics_process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	var npc: CharacterBody2D = get_meta("npc") if has_meta("npc") else null
	if not npc:
		return

	var facing := -1.0 if npc.patrol_dir < 0 else 1.0
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(facing, 1.0))

	if npc.is_gene:
		_draw_gene(npc)
	elif npc.faction == npc.Faction.BUILDER:
		_draw_builder(npc)
	else:
		_draw_suit(npc)

	draw_set_transform(Vector2.ZERO)


func _draw_builder(npc: CharacterBody2D) -> void:
	var C_SKIN: Color = npc.C_SKIN
	var C_VEST: Color = npc.C_BUILDER_VEST
	var C_PANTS: Color = npc.C_BUILDER_PANTS
	var C_HAT: Color = npc.C_BUILDER_HAT
	var C_SHOES: Color = npc.C_SHOES
	var C_EYES: Color = npc.C_EYES

	# Arms
	draw_rect(Rect2(-10, -28, 3, 9), C_SKIN)
	draw_rect(Rect2(7, -28, 3, 9), C_SKIN)
	# Legs
	var walk: int = npc._walk_frame
	if walk == 1:
		draw_rect(Rect2(-5, -16, 5, 10), C_PANTS)
		draw_rect(Rect2(1, -16, 5, 8), C_PANTS)
	elif walk == 3:
		draw_rect(Rect2(-5, -16, 5, 8), C_PANTS)
		draw_rect(Rect2(1, -16, 5, 10), C_PANTS)
	else:
		draw_rect(Rect2(-5, -16, 5, 10), C_PANTS)
		draw_rect(Rect2(1, -16, 5, 10), C_PANTS)
	# Boots
	draw_rect(Rect2(-5, -6, 5, 6), C_SHOES)
	draw_rect(Rect2(1, -6, 5, 6), C_SHOES)
	# Torso (vest)
	draw_rect(Rect2(-7, -30, 14, 14), C_VEST)
	draw_rect(Rect2(-7, -25, 14, 2), Color(0.85, 0.85, 0.8))  # stripe
	# Neck + head
	draw_rect(Rect2(-2, -32, 5, 2), C_SKIN)
	draw_rect(Rect2(-4, -38, 9, 6), C_SKIN)
	draw_rect(Rect2(1, -36, 2, 2), C_EYES)
	# Hard hat
	draw_rect(Rect2(-5, -41, 11, 3), C_HAT)
	draw_rect(Rect2(-6, -39, 13, 1), Color(0.8, 0.65, 0.0))


func _draw_suit(npc: CharacterBody2D) -> void:
	var C_SKIN: Color = npc.C_SKIN
	var C_JACKET: Color = npc.C_SUIT_JACKET
	var C_PANTS: Color = npc.C_SUIT_PANTS
	var C_TIE: Color = npc.C_SUIT_TIE
	var C_SHOES: Color = npc.C_SHOES
	var C_EYES: Color = npc.C_EYES
	var C_HAIR: Color = npc.C_HAIR

	# Arms (suit sleeves)
	draw_rect(Rect2(-10, -28, 3, 9), C_JACKET)
	draw_rect(Rect2(7, -28, 3, 9), C_JACKET)
	# Legs
	var walk: int = npc._walk_frame
	if walk == 1:
		draw_rect(Rect2(-5, -16, 5, 10), C_PANTS)
		draw_rect(Rect2(1, -16, 5, 8), C_PANTS)
	elif walk == 3:
		draw_rect(Rect2(-5, -16, 5, 8), C_PANTS)
		draw_rect(Rect2(1, -16, 5, 10), C_PANTS)
	else:
		draw_rect(Rect2(-5, -16, 5, 10), C_PANTS)
		draw_rect(Rect2(1, -16, 5, 10), C_PANTS)
	# Shoes
	draw_rect(Rect2(-5, -6, 5, 6), C_SHOES)
	draw_rect(Rect2(1, -6, 5, 6), C_SHOES)
	# Torso (jacket)
	draw_rect(Rect2(-7, -30, 14, 14), C_JACKET)
	# Shirt collar + tie
	draw_rect(Rect2(-2, -30, 5, 3), Color(0.85, 0.85, 0.85))
	draw_rect(Rect2(0, -28, 2, 8), C_TIE)
	# Neck + head
	draw_rect(Rect2(-2, -32, 5, 2), C_SKIN)
	draw_rect(Rect2(-4, -38, 9, 6), C_SKIN)
	draw_rect(Rect2(1, -36, 2, 2), C_EYES)
	# Hair (no hat)
	draw_rect(Rect2(-4, -40, 9, 3), C_HAIR)


func _draw_gene(npc: CharacterBody2D) -> void:
	var C_SKIN: Color = npc.C_SKIN
	var C_EYES: Color = npc.C_EYES

	# Gene looks like a forgettable suit — slightly purple jacket, gold tie
	# Arms
	draw_rect(Rect2(-10, -28, 3, 9), npc.C_GENE_SUIT)
	draw_rect(Rect2(7, -28, 3, 9), npc.C_GENE_SUIT)
	# Legs
	draw_rect(Rect2(-5, -16, 5, 10), Color(0.28, 0.25, 0.35))
	draw_rect(Rect2(1, -16, 5, 10), Color(0.28, 0.25, 0.35))
	# Shoes
	draw_rect(Rect2(-5, -6, 5, 6), npc.C_SHOES)
	draw_rect(Rect2(1, -6, 5, 6), npc.C_SHOES)
	# Torso
	draw_rect(Rect2(-7, -30, 14, 14), npc.C_GENE_SUIT)
	draw_rect(Rect2(-2, -30, 5, 3), Color(0.85, 0.85, 0.85))
	draw_rect(Rect2(0, -28, 2, 8), npc.C_GENE_TIE)
	# Neck + head
	draw_rect(Rect2(-2, -32, 5, 2), C_SKIN)
	draw_rect(Rect2(-4, -38, 9, 6), C_SKIN)
	draw_rect(Rect2(1, -36, 2, 2), C_EYES)
	# Thinning hair
	draw_rect(Rect2(-3, -40, 7, 2), Color(0.35, 0.3, 0.25))
