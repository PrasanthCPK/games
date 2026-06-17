# Prince of Persia — Browser Homage

A complete browser-based 2D platformer inspired by the classic **Prince of Persia (1989)**,
built with **only HTML5 Canvas, CSS, and vanilla JavaScript** — no frameworks, no game engine,
and no build step. All pixel-art is drawn procedurally on the canvas and all sound is
synthesized with the Web Audio API, so the game is completely self-contained (no binary assets).

---

## Quick start

### Option A — just open it
Double-click **`index.html`**. The game loads its levels from an embedded JS fallback
(`js/embedded-levels.js`), so it runs straight from `file://`.

### Option B — local web server (recommended)
Running from a server enables loading levels from the real JSON files in `levels/` and avoids
any browser `file://` restrictions:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, the VS Code Live Server
extension, etc.). No dependencies to install.

> Audio starts on your first click/keypress (browser autoplay policy).

---

## Controls

### Desktop
| Action               | Keys                                                |
|----------------------|-----------------------------------------------------|
| Move / run           | ← → or A D                                          |
| Up / climb / hang-up | ↑ or W                                              |
| Down / crouch / drop | ↓ or S                                              |
| Careful walk         | hold **Shift** + a direction (won't fall off edges) |
| Jump                 | **Space**                                           |
| Action / interact    | **Shift** (tap — reveal secrets)                    |
| Draw / swing sword   | **Ctrl**                                            |
| Block                | **B**                                               |
| Pause                | **Esc**                                             |
| Debug overlay        | **`** (backtick)                                    |

The sword is **auto-drawn** when a guard is near (as in the original). Step toward/away while
in the sword stance to manage spacing; tap **Ctrl** to attack and hold **B** to block.

### Mobile / touch
On touch devices an on-screen **D-pad** plus **JUMP / GRAB / SWORD / BLOCK** buttons and a
pause button appear automatically. The canvas scales responsively to the viewport.

---

## Gameplay

- **Movement** with momentum & gravity: run, careful-walk near ledges, jump gaps, grab and hang
  from ledges, climb up, drop down safely, and **roll** after a high landing.
- **Hazards & traps:** emerging floor spikes, crushing/sliding **gates**, **pressure plates**,
  collapsing **loose floors**, **moving platforms**, and deadly pits.
- **Combat:** sword duels against guard AI that patrols, chases, blocks, counters and retreats —
  culminating in a **boss** (Jaffar) guarding the final exit.
- **Three levels** of increasing difficulty: *The Dungeons → The Palace Halls → The Tower of Jaffar*.
- **Extras:** collectible **potions** (heal / max-HP up), **secret passages** (tap action next to
  a cracked wall), **localStorage** save/continue, a **Challenge Mode** with a local
  **leaderboard** of best completion times, a life-segment health bar, and a level timer.

---

## Project structure

```
index.html              Entry point: canvas, menu overlays, touch controls, script tags
style.css               Retro Persian theme, responsive scaling, menus, touch controls
js/
  utils.js              Math/collision/storage helpers + a tiny event bus
  tiles.js              Tile ids, JSON legend, per-tile metadata, global tunables (K)
  input.js              Keyboard + touch input, edge-triggered actions
  animation.js          Frame-based Animation + AnimationController (with frame events)
  sprites.js            Procedural pixel-art: posable character rig + tile drawing
  physics.js            Gravity/momentum + axis-separated tile collision; edge/ledge/drop queries
  level.js              Level + rooms: parse JSON, dynamic traps/gates, solidity, rendering
  camera.js             Room-locked camera with smooth screen-to-screen transitions
  particles.js          Dust/blood/spark particles + torch lighting overlay
  audio.js              AudioManager: synthesized SFX + ambient music + volume control
  ui.js                 Canvas HUD: life segments, timer, boss bar, banners, toasts
  player.js             Player state machine (move/climb/hang/roll/combat/death)
  enemy.js              Guard AI state machine + Boss subclass
  embedded-levels.js    Level data as a global (file:// fallback)
  game.js               Main loop, global state machine, combat, progression, save, DOM menus
  main.js               Bootstrap
levels/
  level1.json           The Dungeons
  level2.json           The Palace Halls
  level3.json           The Tower of Jaffar (boss)
```

### Architecture notes
- **Fixed-timestep** simulation (1/60 s) with an accumulator and a frame-delta clamp for stable,
  frame-rate-independent physics, rendered at up to 60 FPS via `requestAnimationFrame`.
- **Object-oriented**, one responsibility per file: `Player`, `Guard`/`Boss`, `Level`, `Physics`,
  `Animation`, `AudioManager`, `UI`, `Camera`, plus the `Game` controller and `Input`.
- Scripts are plain globals (no ES modules) so the page works from `file://` as well as a server.
- The game renders at a fixed **320×256** logical resolution and is scaled up with
  `image-rendering: pixelated` for crisp pixel art.

---

## Level format

Levels are JSON with a string-row tilemap. Tile legend:

| Char | Meaning            | Char | Meaning              |
|------|--------------------|------|----------------------|
| `.`  | air                | `G`  | gate                 |
| `#`  | solid floor / wall | `P`  | pressure plate       |
| `=`  | ledge (grab/climb) | `T`  | torch                |
| `^`  | floor spikes       | `+`  | potion marker        |
| `L`  | loose floor        | `:`  | secret wall          |
| `S`  | spawn              | `E`  | exit                 |

Objects (gates, plates, movers) and entities (guards, boss), potions and secrets are listed
alongside the tilemap. Example:

```json
{
  "id": "level1",
  "name": "The Dungeons",
  "timeLimit": 90,
  "tiles": ["##########", "#S......E#", "##########"],
  "spawn": { "x": 1, "y": 1 },
  "entities": [{ "type": "guard", "x": 5, "y": 1, "hp": 3, "patrol": [3, 7] }],
  "potions":  [{ "x": 4, "y": 1, "effect": "heal" }],
  "objects":  [
    { "type": "gate", "id": "g1", "x": 6, "y": 1, "state": "closed" },
    { "type": "plate", "x": 2, "y": 1, "targets": ["g1"], "mode": "latch" },
    { "type": "mover", "x": 8, "y": 1, "speed": 2, "path": [[8,1],[10,1]] }
  ],
  "secrets": [{ "x": 4, "y": 0, "reveals": "potion" }]
}
```

### Adding a level
1. Add a `levels/levelN.json` file and a matching entry in `js/embedded-levels.js`
   (the embedded copy is the `file://` fallback — keep them in sync).
2. Append `'levelN'` to the `LEVELS` array in `js/game.js`.
3. Reaching the exit advances to the next level; the last level ends in the boss fight and the
   **victory** screen.

Coordinates are in tile units; world pixels = `tile × 32`. Each on-screen "room" is `10 × 8`
tiles and the camera pans between rooms automatically when you cross a screen edge.

---

## Tuning

Gameplay constants (gravity, speeds, jump impulse, fall thresholds, sword range, etc.) live in
the frozen `K` object at the top of `js/tiles.js` — a single place to tune the feel.

---

## License

Provided as-is for educational/demo purposes. "Prince of Persia" is a trademark of its
respective owner; this is an original, asset-free homage built from scratch.
