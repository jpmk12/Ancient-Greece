# Aegis of Athens — v2 (isometric, character-driven)

A ground-up reimagining of the game as a **third-person, character-driven**
experience: you walk an Athenian around an isometric world, out through the
city gate to gather resources in the countryside, back inside to the workshops
to process them, and to the Agora to sell — the *Last Asylum* "go out, gather,
haul it home" loop.

This is being built in **phases**; the root game (`../index.html`) remains the
current playable version until v2 reaches feature parity.

## Status

- **Phase 1 — Isometric engine + traversal ✅**
  - Isometric projection, diamond tile ground (grass / city stone / sea)
  - Camera that follows the character and clamps to the map
  - Floating **virtual joystick** (touch) + WASD/arrow keys (desktop)
  - Player movement with wall/building **collision** and slide
  - A walled city with a working **gate** you pass through
  - Depth-sorted rendering (walls, buildings, trees, character)
  - Inside/outside-the-walls awareness
- **Phase 2 — Gather & carry ✅**
  - Countryside **harvest nodes** — olive groves, vineyards, fishing docks —
    with regenerating stock; walk up to auto-gather
  - **Backpack** with capacity: per-resource counts, a carry bubble over the
    character's head, a HUD meter, and a "full — take it home" prompt
  - **Deposit** raw resources by standing at the matching workshop
    (olives→Press, grapes→Winery, fish→Granary); buffers shown on each building
  - The sea is now impassable — you fish from the shore
- **Phase 3 — Make & sell on foot ✅ (this build)**
  - Workshops **process** their input buffer into finished goods over time
    (olives→oil, grapes→wine, fish→food); each shows `input ▸ output`
  - **Pick up** finished goods by standing at the workshop — the backpack now
    holds raw resources *and* goods (two-row HUD)
  - **Sell** oil, wine & food at the **Agora** for **drachmas**, shown in a
    top-right coin purse with `+₪` floaters
  - Completes the full loop: gather → haul → process → haul → sell
- Phase 4 — Siege reworked (Spartans, wall defence, personal danger)
- Phase 5 — Progression & polish (porters/donkey, minimap, day/night, SFX)

## Run it

```bash
python3 -m http.server 8000   # from the repo root
# then open http://localhost:8000/v2/
```

**Controls:** drag anywhere to walk (a joystick appears under your thumb), or
use **W A S D** / arrow keys. Head south through the gate to reach the
countryside.

## Files

```
v2/
  index.html        # full-viewport canvas
  style.css
  js/
    config.js       # map layout, walls, gate, buildings, player tuning
    world.js        # iso projection, camera, tile map, collision, draw helpers
    player.js       # character entity: movement, collision, facing
    input.js        # virtual joystick + keyboard
    render.js       # isometric renderer (depth-sorted, zero image assets)
    main.js         # canvas sizing + game loop
```
