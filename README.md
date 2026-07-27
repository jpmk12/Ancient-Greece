# 🏛 Aegis of Athens

A tap-to-gather **simulation & strategy game** set during the Peloponnesian War
(431 BC). You play an Athenian scholar-steward — the city's last hope against
starvation and the Spartan siege. Gather grapes, olives and fish, turn them into
wine, oil and food, sell your goods for drachmas, and pour that wealth into the
walls and soldiers that hold Sparta back.

Inspired by tap-collection mobile strategy games (e.g. *Last Asylum: Plague*),
built to be played **on an iPad in a web browser** — but it runs on any modern
browser, desktop or mobile.

> ### 🎮 Two versions
> - **[`v2/`](v2/) — the isometric, character-driven remake (actively developed).**
>   You walk an Athenian around an isometric world with a virtual joystick: out
>   through any of the four **city gates** to gather, back to the workshops to
>   process (goods **stack up** for collection), to the Agora to sell and the
>   Acropolis to feed your army, then hire porters and soldiers and **hold the
>   walls** — slain Spartans drop coins to scoop up. Open `v2/` to play it.
> - **This page (`index.html`)** — the original **tap-to-gather** game (a fixed
>   side-view board you tap to collect and defend), kept as a reference.
>
> ![Aegis of Athens v2 — isometric city of temples](v2/hero.png)

## How to play

1. **Tap** the glowing dashed rings around olive groves 🫒, vineyards 🍇 and
   fishing docks 🐟 to gather raw resources. Nodes refill over time.
2. Your **Olive Press, Winery and Granary** automatically convert those raw
   resources into **olive oil, wine and food**.
3. **Sell** oil and wine at the **Agora** (tap it, or use *Sell Goods*) for
   **drachmas** — or leave *Auto-Sell* on.
4. Spend drachmas in **Build & Hire**:
   - upgrade **harvest tools**, hire **auto-gatherers**, and speed up production;
   - reinforce and **repair the City Walls**;
   - hire **Hoplites ⚔** (melee) and **Archers 🏹** (ranged) to defend.
5. Every ~45s the **Spartans assault the walls**. Archers pick them off as they
   march; hoplites hold the line; anything that gets through batters the wall.
6. Keep **food** stocked — a hungry army deserts!
7. **Survive 12 waves** to save the polis. If the walls fall, Athens is lost.

Your progress **auto-saves** to the browser (and you can Save manually).

## Run it

It's a static site — no build step, no dependencies.

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

Or just open `index.html` via any static file server. (ES modules require
`http://`, so opening the file directly with `file://` won't work.)

## Project structure

```
index.html      # page shell + HUD / modal markup
styles.css      # warm parchment-and-gold cartoon UI, touch-first
js/
  config.js     # all balance constants, map layout, upgrade tables
  game.js       # game state, systems, wave/combat sim, save/load
  render.js     # canvas renderer (all art drawn with primitives — zero assets)
  input.js      # pointer/touch → world-space tap handling (multi-touch)
  ui.js         # HTML HUD, shop panel, toasts, modals
  main.js       # bootstrap: responsive canvas scaling + game loop
```

## Design notes

- **No image assets** — every sprite (trees, vines, docks, temples, soldiers,
  Spartans) is drawn with canvas primitives, so the game is fully self-contained
  and works offline.
- **Touch-first**: fixed 1024×768 logical world scaled to fit any viewport,
  with true multi-touch tapping for fast harvesting on iPad.
- All game balance lives in `js/config.js` — tune resource yields, prices,
  production rates, wave difficulty and upgrade costs in one place.
