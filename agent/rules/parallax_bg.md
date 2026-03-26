# Rule: Godot 2D Parallax Background Patterns

Extracted from research session 2026-03-26. Applies to the sim interior exterior background.

---

## Node Structure

```
Sim (Node2D)
└── ExteriorBG (ParallaxBackground)     # direct child of scene root
    ├── SkyLayer (ParallaxLayer)         # motion_scale (0, 0)
    │   └── SkyRect (ColorRect)          # shader: sky_gradient.gdshader
    ├── StarsLayer (ParallaxLayer)       # motion_scale (0, 0.05)
    │   └── StarsRect (ColorRect)        # shader: star_field.gdshader
    ├── FarCityLayer (ParallaxLayer)     # motion_scale (0, 0.15)
    │   └── FarCity (Node2D)             # _draw(): small dark silhouettes
    ├── FogLayer (ParallaxLayer)         # motion_scale (0, 0.25)
    │   └── FogRect (ColorRect)          # translucent haze band
    ├── MidCityLayer (ParallaxLayer)     # motion_scale (0, 0.3)
    │   └── MidCity (Node2D)             # _draw(): medium buildings + dim windows
    └── NearCityLayer (ParallaxLayer)    # motion_scale (0, 0.5)
        └── NearCity (Node2D)            # _draw(): large buildings + bright windows
```

## Key Rules

1. **ParallaxBackground is always a direct child of the scene root**, never nested under floors or player.

2. **motion_scale.x = 0 on all layers.** Camera only scrolls vertically. Horizontal look-ahead must not cause parallax drift.

3. **motion_mirroring = Vector2.ZERO.** Content is altitude-specific, not tileable.

4. **Shader uniforms for altitude awareness.** Pass `camera_y` from GDScript `_process()` to shader uniforms. Never use `SCREEN_TEXTURE` in GL Compatibility canvas_item shaders.

5. **Seeded RNG for procedural city content.** Fixed seeds (far=100, mid=200, near=300) so the skyline is deterministic across sessions.

6. **`_draw()` for city silhouettes**, ColorRect+shader for sky/stars/fog. Multiple `draw_rect()` calls on the same Node2D are batched into a single draw call.

7. **City layers fade with altitude** via `modulate.a` driven from script `_process()`. Stars fade in via shader uniform.

8. **Z-index range: -100 to -50 for background layers.** Floor content at -10 to 0. Player at 10.

9. **Window blocks are translucent** (`Color(0.15, 0.20, 0.30, 0.6)`). Background shows through because it's at lower z_index. No masking needed.

## Altitude Color Palette

| Altitude | Sky Top | Horizon | City | Stars |
|----------|---------|---------|------|-------|
| Ground (F0-F2) | #0A0F28 deep navy | #2D1B12 warm amber | Full visibility, yellow windows | Hidden |
| Mid (F3-F5) | #060A1E darker | #1A1218 fading purple | Far visible, near fading | Appearing (0.0→0.3) |
| High (F6-F7) | #030618 near black | #0E0818 deep purple | Far barely visible | Bright (0.5→0.8) |
| Space (F8-F9) | #020410 void | Thin blue line | Gone | Full brightness |

## Performance Notes

- 6 layers is safe for GL Compatibility renderer
- `canvas_item` shaders are fully supported, avoid `hint_screen_texture`
- `_draw()` batches multiple rects per Node2D into one draw call
- Target: under 20 draw calls for full background, 60fps on integrated GPU
