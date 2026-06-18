# 🐍 Snakes & Ladders 🪜

A complete, polished browser-based Snakes and Ladders game built with **vanilla
HTML, CSS, and JavaScript** — no backend, framework, build tools, or external
dependencies. Just open `index.html` in any modern desktop or mobile browser.

## ✨ Features

- **2–4 players** — humans, AI, or any mix
- **Game modes**
  - Single Player (vs 1–3 AI) with Easy / Medium / Hard difficulty
  - Local Multiplayer (2–4 humans on one device)
  - Custom Match (name each player and pick Human or AI)
- **Animated dice** with rolling effect and synthesized sound
- **Smooth movement** — tokens hop square-by-square, then climb ladders / slide down snakes
- **Classic rules** — exact roll needed to land on 100, bonus turn on a 6
- **5 themes** — Classic, Jungle, Fantasy, Pirate, Space
- **Visual effects** — token bounce, ladder climbs, snake slides, victory confetti, animated background
- **Audio** — synthesized sound effects + background music, with mute toggle and volume control (Web Audio, no files)
- **UI** — current player, dice result, live positions, turn indicator, move history, pause/restart/new game
- **Victory screen** — winner, final rankings, total turns, play again
- **Persistent statistics** (localStorage) — games played, wins, win %, fastest victory, total rolls, longest ladder, biggest snake
- **Fully responsive** — phones, tablets, desktop; portrait & landscape; scroll/zoom prevented during play

## 🚀 Run it

Open `index.html` in your browser. That's it — no server or install required.

## 🏗️ Architecture (`game.js`)

ES6 classes, HTML5 Canvas rendering, and `requestAnimationFrame` animation loop:

| Class | Responsibility |
|-------|----------------|
| `Game` | Orchestrates screens, turns, and state |
| `Board` | Board geometry + canvas drawing (squares, snakes, ladders, tokens) |
| `Dice` | Dice value + roll animation |
| `Player` / `AIPlayer` | Player state; AI pacing by difficulty |
| `AnimationManager` | Render loop and movement/climb/slide tweens |
| `AudioManager` | Synthesized sound effects & music |
| `StatisticsManager` | Persistent stats via `localStorage` |

## Files

- `index.html` — markup and screens
- `styles.css` — theming, layout, responsive design, animations
- `game.js` — all game logic
