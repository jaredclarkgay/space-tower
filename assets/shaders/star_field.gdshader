shader_type canvas_item;

uniform float camera_y : hint_range(-1200.0, 200.0) = 0.0;
uniform float time_val : hint_range(0.0, 10000.0) = 0.0;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void fragment() {
    float alt = clamp(-camera_y / 960.0, 0.0, 1.0);
    float star_alpha = smoothstep(0.25, 0.6, alt);

    vec2 uv = UV * vec2(120.0, 80.0);
    vec2 cell = floor(uv);
    float r = hash(cell);

    vec2 star_pos = vec2(hash(cell + vec2(0.1, 0.0)), hash(cell + vec2(0.0, 0.2)));
    float dist = length(fract(uv) - star_pos);
    float star_size = mix(0.03, 0.08, hash(cell + vec2(0.3, 0.0)));
    float brightness = smoothstep(star_size, star_size * 0.3, dist);

    float twinkle = sin(time_val * mix(0.5, 2.0, hash(cell + vec2(0.4, 0.0))) + hash(cell + vec2(0.5, 0.0)) * 6.28);
    twinkle = 0.7 + 0.3 * twinkle;

    float temp = hash(cell + vec2(0.6, 0.0));
    vec3 star_color = mix(vec3(0.9, 0.85, 0.7), vec3(0.7, 0.8, 1.0), temp);

    // Hide if no star in this cell, below altitude threshold, or too far from star center
    float visible = step(0.01, star_alpha) * step(r, 0.15) * brightness;

    COLOR = vec4(star_color * twinkle * visible * star_alpha, visible * star_alpha);
}
