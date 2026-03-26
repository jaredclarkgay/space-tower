shader_type canvas_item;

uniform float camera_y : hint_range(-1200.0, 200.0) = 0.0;

void fragment() {
    float alt = clamp(-camera_y / 960.0, 0.0, 1.0);
    float v = UV.y;
    float horiz_factor = pow(v, 2.5);

    // Ground level: bright daytime sky
    vec3 day_top     = vec3(0.30, 0.55, 0.85);   // bright blue sky
    vec3 day_horiz   = vec3(0.75, 0.70, 0.55);   // warm hazy horizon

    // Mid altitude: sunset/dusk
    vec3 dusk_top    = vec3(0.12, 0.15, 0.35);   // deepening blue
    vec3 dusk_horiz  = vec3(0.55, 0.25, 0.15);   // orange sunset

    // High altitude: twilight
    vec3 twi_top     = vec3(0.04, 0.06, 0.18);   // dark blue
    vec3 twi_horiz   = vec3(0.15, 0.08, 0.12);   // dim purple

    // Space: near black
    vec3 space_col   = vec3(0.008, 0.016, 0.06);

    // Blend sky top
    vec3 sky_top = mix(day_top, dusk_top, smoothstep(0.0, 0.35, alt));
    sky_top = mix(sky_top, twi_top, smoothstep(0.35, 0.65, alt));
    sky_top = mix(sky_top, space_col, smoothstep(0.65, 1.0, alt));

    // Blend horizon
    vec3 sky_horiz = mix(day_horiz, dusk_horiz, smoothstep(0.0, 0.35, alt));
    sky_horiz = mix(sky_horiz, twi_horiz, smoothstep(0.35, 0.65, alt));
    sky_horiz = mix(sky_horiz, space_col, smoothstep(0.65, 1.0, alt));

    // Horizon band thins at altitude
    float horiz_strength = mix(1.0, 0.05, smoothstep(0.3, 1.0, alt));

    vec3 col = mix(sky_top, sky_horiz, horiz_factor * horiz_strength);
    COLOR = vec4(col, 1.0);
}
