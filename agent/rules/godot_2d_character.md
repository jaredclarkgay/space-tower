# Rule: Godot 2D Character Patterns

Extracted from session 2026-03-24. Applies to all 2D character implementation in this project.

---

## Scene Structure

```
CharacterBody2D (physics, collision_layer/mask, script with movement)
├── Sprite (Node2D, z_index=10, script with _draw(), handles scale.x flip)
└── CollisionShape2D (position offset so origin = feet)
```

Camera2D must be a **sibling** of the player, not a child. Camera as child gets affected by sprite transforms (flip, rotation, scale).

## Flipping Direction

**DO:** Set `scale.x = -1` on the child Sprite (Node2D).
**DON'T:** Scale the CharacterBody2D, use draw_set_transform(), or use negative-width draw_rect().

The Sprite node handles all visual mirroring. Collision and camera are unaffected.

## Walk Animation

Use **discrete keyframe poses**, not continuous interpolation.

- 4 frames: idle → step_a → idle → step_b
- Timer-based frame advance (~0.12s per frame)
- Each frame is a separate function with hand-placed draw_rect() calls
- Draw order: back arm → legs → torso/head → front arm

**Never** use sin waves or lerp to animate individual body part positions. It looks floaty and disconnected for pixel art.

## Physics Constants

Always calculate peak jump height before committing values:

```
peak_height = jump_velocity² / (2 × gravity)
```

Peak must exceed FLOOR_HEIGHT (96px) for the player to reach the next floor.

Current values (px/s):
- SPEED = 200
- JUMP_VELOCITY = -500 (peak = 139px)
- GRAVITY = 900

Use `velocity.x = 0` on key release for snappy stops. `move_toward()` feels floaty.

## Platformer Floors

- `one_way_collision = true` on all floor CollisionShape2Ds
- Floors on collision layer 2, walls on layer 4
- Player mask includes both (mask = 6)
- Drop-through: temporarily disable layer 2 in mask for 0.2s

## Z-Ordering

Dynamically-added nodes (floors generated in `_ready()`) render after scene-tree nodes by default. Set `z_index = 10` on the player's Sprite to guarantee it renders above floor backgrounds.

## Autoload References

GDScript can't resolve autoload names at parse time. In any script that references another autoload:

```gdscript
# DON'T
GameState.credits

# DO (in functions, not at class level)
var gs: Node = get_node("/root/GameState")
gs.credits

# OR use @onready
@onready var _gs: Node = get_node("/root/GameState")
```

## Landing Juice

Tween the sprite scale on landing for a squash effect:

```gdscript
sprite.scale = Vector2(1.15, 0.85)
var tween := create_tween()
tween.tween_property(sprite, "scale", Vector2(1.0, 1.0), 0.1)
```

Track `_was_on_floor` to detect the landing frame.
