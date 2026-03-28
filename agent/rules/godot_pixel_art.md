# Rule: Pixel Art Rendering in Godot

## Sub-Pixel Jitter Fix

Any `CharacterBody2D` (player, NPCs) must snap to integer positions after movement:

```gdscript
move_and_slide()
position = position.round()
```

This prevents pixel art from shimmering between screen pixels at integer zoom levels.

## Camera Snap

Camera position must also be rounded to prevent the entire scene from vibrating:

```gdscript
camera.position.x = roundf(lerpf(camera.position.x, target_x, CAM_LERP * delta))
camera.position.y = roundf(lerpf(camera.position.y, target_y, CAM_LERP * delta))
```

## Sprite Redraw Timing

Use `_physics_process` for `queue_redraw()`, not `_process`:

```gdscript
# WRONG — causes desync between physics position and visual
func _process(_delta):
    queue_redraw()

# RIGHT — visual updates match physics tick
func _physics_process(_delta):
    queue_redraw()
```

## Walk Cycles

Use 2 distinct frames (step_a, step_b) at 0.18s intervals. Do NOT mix idle frames into the walk cycle — it creates a stuttering effect:

```gdscript
# WRONG — frames 0,2 are idle, creates flicker
walk_frame = (walk_frame + 1) % 4  # 0=idle, 1=step_a, 2=idle, 3=step_b

# RIGHT — only distinct poses while moving
walk_frame = (walk_frame + 1) % 2  # 0=step_a, 1=step_b
```

Only draw walk frames when actually moving:
```gdscript
if player.walk_frame == 0 and absf(player.velocity.x) > 10.0:
    _draw_step_a()
elif player.walk_frame == 1 and absf(player.velocity.x) > 10.0:
    _draw_step_b()
else:
    _draw_idle()
```

## Font Sizes

At 2x camera zoom, font_size 8 renders at effective 4px — unreadable.
- World labels (floor names): 11+
- Interaction prompts: 12+
- NPC dialogue: 9+
- Always add font_shadow for readability against varied backgrounds
