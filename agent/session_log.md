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
