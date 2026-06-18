# Road Fighter

A complete browser-based arcade racing game inspired by the classic NES/arcade
**Road Fighter**, built with plain **HTML, CSS, and JavaScript** — no backend,
frameworks, or build tools.

## Play

Open `index.html` in any modern desktop or mobile browser. That's it.

## Features

- **Top-down arcade racing** with smooth scrolling road and momentum-based handling.
- **5 themed stages** — Countryside, Desert, Coastal Highway, Mountain Road, Night City — each with unique visuals and rising difficulty.
- **Traffic system** with compacts, sedans, sports cars, trucks, and buses (different speeds, sizes, and lane-changing behavior).
- **Fuel mechanic** — fuel constantly drains; grab roadside fuel cans to survive.
- **Checkpoints** that extend the timer, award bonuses, and advance stages.
- **Collision system** with crash/spin animation, particle explosions, and penalties.
- **Scoring** for distance, overtakes, speed, fuel, and stage completion. High score saved via `localStorage`.
- **Effects**: tire skids, dust, explosions, speed lines, motion-blur vignette, night headlights.
- **Synthesized retro audio** (WebAudio) — engine, SFX, looping music, victory jingle — with volume and mute controls.
- **Three modes**: Modern, Classic, and Endless.
- **Full mobile support** — touch buttons, swipe steering, optional tilt controls, responsive landscape layout.

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Steer  | ← → / A D | On-screen buttons / swipe / tilt |
| Accelerate | ↑ / W | GAS button |
| Brake | ↓ / S | BRAKE button |
| Pause | P | Pause button |
| Mute | M | ♪ button |

## Architecture

`game.js` is organized into ES6 classes: `Game`, `PlayerCar`, `TrafficVehicle`,
`RoadManager`, `FuelManager`, `CheckpointManager`, `ParticleSystem`,
`AudioManager`, and `UIManager`. Rendering uses HTML5 Canvas with
`requestAnimationFrame` targeting 60 FPS.

## Files

- `index.html` — markup, HUD, and screens
- `styles.css` — styling and responsive layout
- `game.js` — all game logic
