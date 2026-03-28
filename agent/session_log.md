# Builder Agent — Session Log

Append-only log. Each Claude Code session adds an entry. The agent documents what it attempted, what worked, what didn't, and what it proposes to update about itself.

---

## Session Template

```
### Session [DATE] — [TASK]

**Attempted:** What the agent tried to do
**Outcome:** Success / partial / failed
**Decisions made:** Key choices and why
**Uncertainties:** What the agent wasn't sure about
**Proposed updates:**
- competency_map: [changes]
- failure_log: [new entries]
- request_queue: [new requests]
- rules/: [new or updated files]
**Jared's review:** [filled in by Jared after reviewing]
```

---

### Session 2026-03-24 — Project scaffold + sim interior + player character

**Attempted:** Set up full Godot project scaffold (folders, autoloads, input map), build the sim interior with 10 floors, create a playable 2D character with _draw() construction worker visuals, add camera follow.

**Outcome:** Partial success. All systems functional but required significant iteration:
- Scaffold: clean, one-shot
- Autoloads: hit parse-time cross-reference error, fixed with get_node()
- Player visuals: 3 failed flip approaches before landing on child Node2D scale.x
- Walk animation: sin-wave interpolation rejected by user, replaced with discrete frames
- Physics: jump height insufficient, platforms blocked upward movement, movement felt floaty
- Floor grid: worked but player rendered behind backgrounds (z_index fix)

**Decisions made:**
- Split player into CharacterBody2D (physics) + child Node2D (visuals) — clean separation
- Camera2D as sibling to player, not child — avoids transform inheritance
- 4-frame discrete walk cycle over continuous interpolation — matches pixel art style
- Collision layers: 1=player, 2=floors (toggleable), 4=walls (always solid)
- One-way collision on all floors for jump-through behavior
- Instant velocity.x=0 on key release instead of move_toward() deceleration
- 2x camera zoom (tried 3x, too close; 1x, too far)

**Uncertainties:**
- Physics values are rough estimates, not rigorously ported from browser. User expressed frustration: "not anchored in physics", "losing optimism in Godot"
- Character art detail hard to evaluate without seeing browser version side-by-side
- Floor background colors are guesses — no visual reference from browser version
- Walk animation knee bend is minimal — user noted improvement but didn't confirm satisfaction

**Proposed updates:**
- competency_map: Updated 6 domains with evidence, failure patterns, and rules learned
- failure_log: 6 new entries (f001–f006) covering autoload parsing, flip approaches, animation style, platformer physics
- request_queue: R001 moved to in_progress, R003 updated with user quotes, added R005 for physics value approval
- rules/: Created godot_2d_character.md with 8 pattern sections

**Jared's review:** [pending]

---

### Session 2026-03-26 — Sprint, charged mechanics, somersault, parallax exterior

**Attempted:** Add sprint, charged jump/drop, somersault animation, zoom slider, parallax exterior through windows, direction flip fix.

**Outcome:** Mixed. Mechanics work well. Exterior required 3 iterations.

**What worked:**
- Sprint (Shift key), charged jump (hold Space), charged drop (hold S)
- 8-frame somersault rotation while airborne
- Power bar above head while charging
- On-screen zoom slider (1x-4x)
- Sky gradient shader (daytime→sunset→space by altitude)
- Star field shader with twinkle + altitude fade-in
- Manual parallax on plain Node2Ds (after dropping broken ParallaxBackground)
- Split floor backgrounds to leave window columns transparent

**What failed:**
- ParallaxBackground node: zoom interaction bugs, buildings drifting, wrong positioning. Scrapped entirely.
- Character direction flip via scale.x: landing squash tween kept resetting it. Fixed with draw_set_transform().
- "Flip" terminology mismatch: user meant somersault animation, not directional facing. Multiple iterations wasted.
- City buildings had no ground plane, looked like floating shapes. Fixed by drawing ground per city layer.
- Walls made too thick (500px) trying to block parallax bleed. Fixed with camera limits instead.

**Key learnings:**
- ParallaxBackground is wrong for "interior looking through windows" — use manual Node2D offsets
- Floor backgrounds must be segmented (skip window columns) so exterior shows through
- Each parallax city layer needs its own ground plane
- draw_set_transform() for flip is cleanly decoupled from scale tweens
- Camera limits are better than thick walls for constraining the view
- Always clarify terminology with user before iterating ("flip" = somersault, not direction)

**Decisions made:**
- Manual parallax formula: layer.y = cam_y * (1.0 - depth_factor)
- Depth factors: sky=0.0, stars=0.05, far_city=0.15, mid_city=0.30, near_city=0.50
- Window tint at 0.3 alpha with 1px frame edges
- Zoom levels: 1.0, 1.5, 2.0, 2.5, 3.0 (default 2.0)

**Jared's review:** [pending]

---

### Session 2026-03-26 — Agent system bootstrap + retrospective

**Attempted:** Read all agent files, assess competency state against actual session outcomes, write first round of updates to all agent files.

**Outcome:** Success. All agent files updated with learnings from 2026-03-24 session.

**Decisions made:**
- Kept confidence levels conservative — "low-medium" rather than "medium" for domains where user expressed dissatisfaction
- Wrote a comprehensive rule file rather than multiple small ones — all patterns are related to 2D character implementation
- Added R005 to request queue for physics value approval since current values are rough estimates
- Logged 6 failure entries covering the full range of issues encountered

**Uncertainties:**
- Are the failure entries at the right granularity? Some (like f005 jump height) might be too obvious to log.
- Should competency_map track sub-domains? e.g. "physics_feel" covers both movement and camera, which have different confidence levels.

**Proposed updates:**
- All files updated in this session (competency_map, failure_log, request_queue, rules/godot_2d_character.md, session_log.md)

**Jared's review:** [pending]

---

### Session 2026-03-27 — Hammer claim mechanic, block interaction layer, horizontal parallax

**Attempted:** Implement the core building verb for the 2D sim interior — player hammers blocks to claim them. Also added horizontal parallax and an (E) Engage interaction prompt.

**Outcome:** Success after one critical bug fix. User iterated on animation style and approved final result.

**What worked:**
- block.gd: per-block interactive node with claim state, border Line2Ds, Area2D interaction, particles
- 8-strike rapid kneeling hammer animation (user preference over original 4-directional poses)
- Border perimeter growth across all 8 strikes — user said "love it"
- Horizontal parallax on city/sky layers using same cam_dx * factor pattern
- Screen shake + flash + fill on block completion
- GameState persistence of claim progress (block_claims, block_claim_owners)

**What failed:**
- State machine overwrite bug (f012): _try_start_claim() set state=CLAIMING, but movement code later in same _physics_process frame reset it to IDLE. Player snapped to block but nothing happened. Fixed with early return.
- (E) Engage prompt initially invisible — font too small (8px), no shadow, no explicit size/z_index. Fixed by bumping to 10px with shadow and z_index=20.
- First hammer pose iteration had arm/hammer overlapping torso — user asked for more overhead wind-up and extended downswing. Second iteration approved.

**Decisions made:**
- 8 rapid strikes at 0.075s each (user asked to double speed from 0.15s) vs original design brief's 4 strikes at 0.45s
- Kneeling pose with alternating up/down instead of 4 directional poses — user preference
- Sparks emit from single ground contact point (not 4 different edges)
- Default builder color: vest orange Color(0.95, 0.45, 0.05) until post-Reckoning color pick

**Uncertainties:**
- (E) Engage prompt may still not be showing — user reported it missing, fixes applied but not yet confirmed
- Claim state not yet wired to save_manager.gd — block_claims persist in memory but not to disk
- Suit tape animation (dashed borders, APPROVED stamp) deferred to Reckoning brief

**Proposed updates:**
- competency_map: gdscript_logic→medium-high, visual_style→medium, parallax→medium-high, new block_interaction domain
- failure_log: f012 (state machine overwrite)
- rules/: new godot_state_machine.md

**Jared's review:** [pending]

---

### Session 2026-03-27 (continued) — Segment 1 two-movement system, tower overhaul

**Attempted:** Implement full Segment 1 architecture: breaker panel activation system, NPC population with factions, tower widening, stairs, physics tuning, pixel art rendering fixes, dialogue overhaul.

**Outcome:** All systems functional. Multiple iteration rounds on parallax (removed), physics, visuals.

**What worked:**
- Breaker panels: industrial look, lever animation, ceiling lights sequencing, sparks
- NPC system: builders/suits with patrol, speech bubbles, faction-weighted placement, Gene
- Tower widened to 2160px, blocks 2:1 ratio
- Zigzag stairs with landings, railings, floor numbers
- Sub-pixel jitter fix (position.round())
- Dialogue rewrite with personality and humor
- Player neon-yellow vest for visual distinction
- Reckoning trigger via Floor 8 cascade stutter → blackout
- Block claiming_enabled gate for two-movement structure

**What failed:**
- Parallax: 4 tuning iterations, always "odd" — removed entirely (f017)
- Type inference := on Variant (f013), call_deferred timing (f014)
- NPC spawn outside slab bounds (f016)
- Jump tuned through 3 values: -300 → -470 → -425
- Walk 4-frame cycle caused vibrating — simplified to 2-frame

**Proposed updates:**
- competency_map v1.4: new domains (npc_system, floor_activation, tower_architecture)
- failure_log: f013-f017
- rules/: new godot_pixel_art.md
- request_queue: r001 resolved, r006 needs complete rethink

**Jared's review:** [pending]
