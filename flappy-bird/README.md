# Flappy Bird

A complete browser-based Flappy Bird clone built with **plain HTML, CSS, and JavaScript** — no frameworks, no build tools, no external assets. Just open `index.html` in any modern browser and play.

---

## Functional Overview

### How to Play
- **Goal:** Keep the bird airborne and fly through the gaps between pipes. Each pipe you clear scores a point.
- **Flap:** Press `Space`, `Arrow Up`, or **click / tap** the screen to make the bird flap upward.
- **Avoid:** Pipes, the ground, and the ceiling. Touching a pipe or the ground ends the game instantly.
- **Pause / Resume:** Press `P` at any time during play.
- **Restart:** Click **Play Again** on the game-over screen — no page refresh needed.

### Controls
| Action | Input |
|--------|-------|
| Flap / Start | `Space`, `Arrow Up`, mouse click, or touch tap |
| Pause / Resume | `P` |
| Restart | **Play Again** button |

### Features
- **Classic mechanics** — continuous gravity, flap-to-rise physics.
- **Procedural pipes** — randomized gap positions for endless, varied play.
- **Scoring** — current score shown in-game; **best score persisted** across sessions via `localStorage`.
- **Gradual difficulty** — pipe speed increases, gaps shrink, and pipes spawn more frequently as your score climbs.
- **Day/night cycle** — the sky smoothly transitions between day and night with a crossing sun and moon.
- **Parallax background** — multi-layer scrolling clouds and hills for depth.
- **Juice** — particle bursts on each flap and a screen-shake effect on collision.
- **Synthesized audio** — flap, score, and collision sound effects generated at runtime (no audio files).
- **Responsive** — adapts to desktop and mobile screens with unified mouse/touch input.

### Screens
- **Start screen** — title, instructions, start button, and current best score.
- **Game Over screen** — final score, best score, a "New Best!" badge, and a restart button.
- **Pause overlay** — shown when paused.

---

## Technical Overview

### Tech Stack
- **HTML5** — structure and overlay UI.
- **CSS3** — responsive layout, gradients, backdrop blur, and animations.
- **Vanilla JavaScript (ES6+)** — all game logic; no dependencies.
- **Canvas API** — all gameplay rendering.
- **Web Audio API** — runtime-synthesized sound effects.
- **localStorage** — high-score persistence.

### Project Structure
```
flappy-bird/
├── index.html   # Markup: canvas, HUD, and start/game-over/pause overlays
├── style.css    # Responsive styling, overlays, and UI animations
└── script.js    # All game logic, organized into ES6 classes
```

### Architecture
All logic lives in `script.js`, wrapped in an IIFE to **avoid global variables**. It is organized into focused classes:

| Class | Responsibility |
|-------|----------------|
| `Game` | Central controller — state machine, game loop, input handling, rendering, difficulty scaling, and UI updates. |
| `Bird` | Player entity — gravity/velocity physics, velocity-based rotation, and sine-wave wing-flap animation. |
| `Pipe` | A single top/bottom obstacle pair — movement, gap geometry, drawing, and circle-vs-rectangle collision. |
| `ParticleSystem` | Lightweight particle emitter for flap bursts. |
| `SoundManager` | Web Audio oscillator-based flap / score / collision sound effects. |

### Key Implementation Details
- **Fixed logical resolution** (`480 × 800`) — gameplay is rendered at a fixed internal size and CSS-scaled to fit the container, so the experience is identical across devices.
- **Fixed-timestep game loop** — `requestAnimationFrame` drives the loop, but updates run on a `1000/60` ms accumulator. Physics stay consistent regardless of display refresh rate, and a delta clamp prevents a "spiral of death" after the tab is backgrounded.
- **Collision detection** — the bird is treated as a circle tested against pipe rectangles and the ground/ceiling bounds.
- **Difficulty scaling** — `pipeSpeed`, `gapSize`, and `spawnInterval` are derived from the current score via getters, so difficulty ramps smoothly.
- **Audio autoplay compliance** — the `AudioContext` is created/resumed only after the first user gesture, satisfying browser autoplay policies.
- **State machine** — the game transitions between `start`, `playing`, `paused`, and `gameover` states, with the loop animating menus (bobbing bird, scrolling sky) even when not playing.

### Running Locally
No server or build step is required:

```
# Option 1 — just open the file
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows

# Option 2 — serve it (optional, e.g. for stricter browser settings)
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Browser Support
Works in any modern browser supporting the Canvas API, Web Audio API, and ES6+ (Chrome, Firefox, Safari, Edge).
