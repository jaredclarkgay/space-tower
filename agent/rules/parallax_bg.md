# Rule: Godot 2D Parallax Background Patterns

Updated 2026-03-26 after failed ParallaxBackground attempt. Manual approach is correct.

---

## DO NOT use ParallaxBackground for interior-through-windows

ParallaxBackground has three fatal problems for this use case:
1. Zoom changes recalculate offsets, causing buildings to jump
2. motion_scale is camera-relative, not world-anchored — buildings drift from ground
3. Cannot confine to window regions — bleeds through all areas at same z_index

## Use manual Node2D offsets instead

Each background layer is a plain Node2D child of an ExteriorBG container. Position is updated every frame in `_process()`.

### Parallax Math

```gdscript
# depth_factor: 0.0 = pinned to screen (sky), 1.0 = foreground (no parallax)
# layer.position.y = base_y + cam_y * (1.0 - depth_factor)

var cam_y := camera.position.y

# Sky (factor 0.0) — pinned to screen
_sky_rect.position.y = sky_base_y + cam_y * 1.0

# Far city (factor 0.15)
_far_city.position.y = cam_y * 0.85

# Mid city (factor 0.30)
_mid_city.position.y = cam_y * 0.70

# Near city (factor 0.50)
_near_city.position.y = cam_y * 0.50
```

At cam_y = 0 (ground floor), all layers align. As camera goes up (negative), slower layers lag behind. **Zoom does not affect this math** because everything is in world coordinates.

### Scene Structure

```
Sim (Node2D)
  ExteriorBG (Node2D, z_index = -10)
    SkyRect (ColorRect, z_index = -100)    # shader-driven
    StarsRect (ColorRect, z_index = -90)   # shader-driven
    FarCity (Node2D, z_index = -80)        # _draw() buildings + own ground
    MidCity (Node2D, z_index = -60)        # _draw() buildings + own ground
    NearCity (Node2D, z_index = -50)       # _draw() buildings + own ground
  Floor0..9 (StaticBody2D, z_index = 0)    # opaque, blocks parallax
  Walls (z_index = 0)
  Player (z_index = 10)
```

## Floor backgrounds must skip window columns

The parallax only shows through transparent gaps. Non-window blocks get opaque background segments. Window columns (3, 7, 11) are left transparent with a light tint overlay.

```gdscript
# Split bg into segments that skip window columns
var seg_start := 0
for bi in range(13):
    if bi == 12 or _is_win_block(bi):
        if seg_start < bi:
            # draw opaque bg from seg_start to bi
        seg_start = bi + 1
```

## Each city layer draws its own ground

Without per-layer ground, buildings appear to float when viewed from upper floors. Each city_layer.gd `_draw()` starts with a ground rect at y=4 extending downward.

## Camera limits replace thick walls

Use `camera.limit_left/right/top/bottom` to keep the view inside the tower. Don't make walls hundreds of pixels wide.

## Altitude-aware shaders

Sky and stars use canvas_item shaders with a `camera_y` uniform passed from `_process()`. No `SCREEN_TEXTURE`, no `return` in fragment functions (GL Compatibility doesn't allow it).
