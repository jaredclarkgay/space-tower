extends Node

const NUM_FLOORS := 10
const BLOCKS_PER_FLOOR := 12
const BLOCK_WIDTH := 64
const FLOOR_HEIGHT := 96
const FLOOR_SLAB := 4

# Gravity and movement (2D sim)
const GRAVITY := 0.5
const JUMP_VEL := -12.0
const MOVE_SPEED := 4.0
const WALL_SLIDE_SPEED := 2.0

## Window blocks — not buildable
func is_win_block(bi: int) -> bool:
	return bi in [3, 7, 11]

## Elevator block — not buildable
func is_elev_block(bi: int) -> bool:
	return bi == 6

## Whether a block can have a module placed on it
func is_buildable(bi: int) -> bool:
	return not is_win_block(bi) and not is_elev_block(bi)
