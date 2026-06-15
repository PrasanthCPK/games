# 🐍 Snake — Retro Arcade

A polished, browser-based Snake game inspired by the classic Nokia/mobile
snake. Built with **only HTML, CSS, and vanilla JavaScript** — no libraries,
no build step, no backend. Just open `index.html` and play.

## ▶️ Play

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## 🎮 Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys or `W` `A` `S` `D` |
| Pause / Resume | `Space` |
| Start / Restart | `Enter` |
| Mobile | On-screen D-pad **or** swipe on the board |

## ✨ Features

- Continuous grid-based movement with **smooth interpolated animation**
- Snake grows on eating; random food generation
- Game over on wall / self collision
- **Score** + **high score** persisted via `localStorage`
- Pause/resume, start screen, pause overlay, and game-over screen
- **Web Audio API** sound effects (generated, no assets)
- Difficulty ramps up — the snake speeds up as you score
- Responsive layout for desktop and mobile, with large touch controls
- **Three themes**: Neon, Classic (Game Boy), Dark
- **Power-up** food (golden star) for bonus points
- **Particle burst** when food is eaten
- **Achievements** at 10 / 25 / 50 foods
- **Fullscreen** mode and a **sound toggle**

## 📁 Files

- `index.html` — markup and UI structure
- `style.css` — theming, layout, responsive design
- `script.js` — game engine (classes: `SoundFX`, `Particle`, `SnakeGame`)
