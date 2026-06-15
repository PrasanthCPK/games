# Retro Games Hub

A modern, responsive, single-page static landing portal for browser-based retro games.

## Features

- **Data-driven tiles** — games are defined in a single `games` array in `script.js`; the grid renders itself.
- **Responsive grid** — looks great on desktop, tablet, and mobile.
- **Retro neon dark theme** with smooth hover animations, card elevation, and rounded corners.
- **Search box** to filter games by name (and tags).
- **Game count** display.
- **Tag/category** support for future games.
- **Accessible** — semantic HTML, keyboard navigation, skip link, focus styles, `prefers-reduced-motion` support.
- **Lazy-loaded** images and an inline retro game-controller favicon.
- **Zero dependencies** — no frameworks, no backend, no build step.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and markup |
| `styles.css` | Theme, layout, and animations |
| `script.js` | Game data + dynamic tile rendering and search |

## Run it

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Add a new game

Append an object to the `games` array in `script.js`:

```js
{
  name: "Tetris",
  icon: "/games/tetris/icon.svg",   // path, URL, or SVG data-URI
  description: "Stack falling blocks and clear lines.",
  url: "/games/tetris",
  tags: ["Puzzle"],                 // optional
}
```

The tile appears automatically — no other changes required.
