# Bounce

A cross-platform, production-quality recreation of the classic Nokia *Bounce*
(2001) / *Bounce Tales* arcade experience, built as a responsive web app.
The red ball hops endlessly, you steer it to collect every ring, dodge the
spikes, float through water and reach the glowing goal — all rendered
programmatically on an HTML5 Canvas with **no external image, font or audio
assets** (so nothing copyrighted is used, and it works fully offline).

It runs on **desktop and mobile browsers** — Chrome, Edge, Firefox, Safari,
Samsung Internet — on Windows, macOS, Linux, Android and iOS, with **no
plugins, downloads or extensions** required. It is also an installable PWA.

---

## Running it

ES modules and the service worker require the files to be served over HTTP
(opening `index.html` via `file://` will not work). Any static server is fine:

```bash
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npx serve .
```

There is **no build step** and there are **no dependencies** — it is plain
HTML/CSS/ES modules. Deploy by copying the folder to any static host
(GitHub Pages, Netlify, S3, …).

---

## Controls

| Action        | Keyboard                         | Touch              | Gamepad            |
|---------------|----------------------------------|--------------------|--------------------|
| Move left     | `←` / `A`                        | ◄ button           | D-pad / left stick |
| Move right    | `→` / `D`                        | ► button           | D-pad / left stick |
| Jump          | `↑` / `W` / `Space`              | ▲ button           | A / B / X / Y      |
| Pause         | `P`                              | ❚❚ button (top-right) | Start           |
| Restart level | `R`                              | (pause menu)       | Select / Back      |

The ball auto-bounces; **holding jump** as it lands turns the next hop into a
high jump. Multi-touch is supported, so you can move and jump at the same time.

---

## Gameplay (faithful to the original)

- **Always-bouncing ball physics** with squash-and-stretch and rolling spin.
- **Ring collection** — collect every ring to open the level's goal hoop.
- **Hazards** — spikes cost a life; you respawn at the last checkpoint.
- **Water** is buoyant: the ball floats gently upward, just like the big ball
  in the original.
- **Checkpoints**, **lives**, **per-level best-time** tracking and a
  **level-select** screen with progressive unlocks.

---

## Architecture

| File | Responsibility |
|------|----------------|
| `js/main.js` | Bootstrap, high-DPI canvas sizing, fixed-timestep loop, PWA registration, gesture/scroll prevention, tab-visibility pausing. |
| `js/input.js` | **Input abstraction layer** — logical actions fed by keyboard, pointer (touch/mouse/pen) and gamepad sources. Game logic never reads a device directly. |
| `js/physics.js` | Ball physics & swept per-axis AABB tile collision. Fixed-timestep, allocation-free. |
| `js/levels.js` | ASCII tile-map level data + parser. |
| `js/level.js` | Level runtime: rings, checkpoints, hazards, goal logic. |
| `js/renderer.js` | All canvas drawing — ball, rings, tiles, water, spikes, parallax sky, HUD. Pure programmatic art. |
| `js/game.js` | State machine, camera, lives, scoring, progression, particles. |
| `js/ui.js` | DOM overlay menus (menu, pause, results, level select). |
| `js/storage.js` | `localStorage` save/load (progress, best times, settings). |
| `js/audio.js` | Procedural Web Audio sound effects. |
| `service-worker.js` | Offline app-shell caching for the PWA. |
| `icons/generate_icons.py` | Regenerates the PNG app icons (stdlib only). |

### Performance

- **Fixed 120 Hz simulation** decoupled from rendering, with interpolation, for
  stable physics and smooth motion up to and beyond 60 FPS.
- **`requestAnimationFrame`** rendering; simulation **pauses when the tab is
  hidden**.
- Only on-screen tiles are drawn; collision and particle updates are
  allocation-light to minimise GC pauses.
- Canvas is sized to `devicePixelRatio` (capped at 3) for crisp Retina output.

---

## Testing

See [`TESTING.md`](TESTING.md) for the full cross-platform / responsive /
PWA testing checklist.
