# Rule: Early-Return After State Transitions in _physics_process

## Pattern

When `_physics_process()` contains multiple sections that read or write `state`, any mid-frame state change must be followed by an immediate `return`. Otherwise, code later in the same frame will overwrite the new state.

## Example (the bug)

```gdscript
func _physics_process(delta):
    # Section A: interact
    if Input.is_action_just_pressed("interact"):
        _try_start_claim()        # sets state = CLAIMING
        # BUG: no return here

    # Section B: movement (runs on same frame!)
    if direction == 0.0 and on_floor:
        state = IDLE              # overwrites CLAIMING
```

## Fix

```gdscript
    if Input.is_action_just_pressed("interact"):
        _try_start_claim()
        if state == PlayerState.CLAIMING:
            move_and_slide()
            return                # exit immediately
```

## When This Applies

- Any time you set `state` to a new value inside `_physics_process`
- Any time you add a new state to an existing state machine that has movement/idle logic later in the function body
- Particularly dangerous when the new state requires the player to be stationary (velocity.x == 0 + on_floor → IDLE overwrite)

## General Rule

State transitions in `_physics_process` should either:
1. Be handled at the top of the function with early return (like the CLAIMING check), OR
2. Be followed by an immediate `return` after the transition, OR
3. Use `elif` chains so later sections can't execute after a state change

Option 1 is preferred — check for modal states at the top and return before any other logic runs.
