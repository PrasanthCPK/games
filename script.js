/* =========================================================
   Retro Games Hub — script.js
   Data-driven game tiles. Add a new game by appending an
   object to the `games` array below — the grid rebuilds itself.
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   Game data
   Each entry:
     name        {string}  Display name
     icon        {string}  Image source (SVG data-URI here, but a
                           path/URL to a PNG/SVG file works too)
     description {string}  Short tagline
     url         {string}  Where the Play button / tile links to
     tags        {string[]} Optional categories for future filtering
   --------------------------------------------------------- */
const games = [
  {
    name: "Bounce",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
        <defs>
          <radialGradient id="ball" cx="38%" cy="34%" r="70%">
            <stop offset="0%" stop-color="#ff8a8a"/>
            <stop offset="45%" stop-color="#ff2e2e"/>
            <stop offset="100%" stop-color="#a80000"/>
          </radialGradient>
        </defs>
        <ellipse cx="48" cy="82" rx="26" ry="6" fill="#000" opacity="0.35"/>
        <circle cx="48" cy="44" r="28" fill="url(#ball)"/>
        <circle cx="39" cy="35" r="7" fill="#fff" opacity="0.55"/>
      </svg>`),
    description: "Classic Nokia-inspired bouncing ball adventure.",
    url: "/games/bounce",
    tags: ["Arcade"],
  },
  {
    name: "Snake",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
        <g fill="#39ff14">
          <rect x="18" y="24" width="12" height="12"/>
          <rect x="30" y="24" width="12" height="12"/>
          <rect x="42" y="24" width="12" height="12"/>
          <rect x="42" y="36" width="12" height="12"/>
          <rect x="42" y="48" width="12" height="12"/>
          <rect x="54" y="48" width="12" height="12"/>
          <rect x="66" y="48" width="12" height="12"/>
        </g>
        <rect x="68" y="50" width="4" height="4" fill="#04130a"/>
        <rect x="24" y="66" width="10" height="10" rx="2" fill="#ff2e88"/>
      </svg>`),
    description: "Eat food, grow longer, and avoid collisions.",
    url: "/games/snake",
    tags: ["Arcade"],
  },
  {
    name: "Flappy Bird",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
        <g fill="#2ecc71">
          <rect x="10" y="0" width="16" height="34"/>
          <rect x="6" y="30" width="24" height="8"/>
          <rect x="70" y="62" width="16" height="34"/>
          <rect x="66" y="58" width="24" height="8"/>
        </g>
        <g>
          <ellipse cx="48" cy="50" rx="18" ry="15" fill="#ffd23f"/>
          <ellipse cx="40" cy="56" rx="9" ry="7" fill="#ffe98a"/>
          <circle cx="56" cy="44" r="5" fill="#fff"/>
          <circle cx="58" cy="44" r="2.4" fill="#1a1a1a"/>
          <polygon points="64,50 78,46 64,42" fill="#ff7a1a"/>
        </g>
      </svg>`),
    description: "Tap to fly and dodge obstacles.",
    url: "/games/flappy-bird",
    tags: ["Arcade"],
  },
  {
    name: "Circus Charlie",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
        <defs>
          <linearGradient id="tent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff5d73"/>
            <stop offset="100%" stop-color="#c81d4e"/>
          </linearGradient>
        </defs>
        <ellipse cx="48" cy="84" rx="30" ry="5" fill="#000" opacity="0.35"/>
        <polygon points="48,12 16,40 80,40" fill="url(#tent)"/>
        <rect x="16" y="40" width="64" height="40" fill="#fff5e1"/>
        <g fill="url(#tent)">
          <rect x="20" y="40" width="9" height="40"/>
          <rect x="38" y="40" width="9" height="40"/>
          <rect x="56" y="40" width="9" height="40"/>
          <rect x="74" y="40" width="6" height="40"/>
        </g>
        <path d="M40 80 q8 -22 16 0 z" fill="#ffd23f"/>
        <circle cx="48" cy="8" r="4" fill="#ffd23f"/>
      </svg>`),
    description:
      "Jump through hoops, ride animals, and survive the circus challenges.",
    url: "/games/circus-charlie",
    tags: ["Arcade", "Classic"],
  },
  {
    name: "Minesweeper",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
        <g fill="#2a2a40">
          <rect x="14" y="14" width="20" height="20"/>
          <rect x="38" y="14" width="20" height="20"/>
          <rect x="62" y="38" width="20" height="20"/>
          <rect x="14" y="62" width="20" height="20"/>
        </g>
        <g fill="none" shape-rendering="geometricPrecision">
          <circle cx="58" cy="60" r="14" fill="#11111a"/>
          <rect x="56" y="38" width="4" height="44" fill="#11111a"/>
          <rect x="36" y="58" width="44" height="4" fill="#11111a"/>
          <circle cx="53" cy="55" r="3" fill="#fff" opacity="0.8"/>
        </g>
        <rect x="64" y="40" width="6" height="6" fill="#ff2e88"/>
        <text x="24" y="30" font-size="16" font-family="monospace" fill="#00f0ff">1</text>
        <text x="48" y="30" font-size="16" font-family="monospace" fill="#39ff14">2</text>
        <text x="24" y="78" font-size="16" font-family="monospace" fill="#ff2e88">3</text>
      </svg>`),
    description: "Clear the board using logic without triggering hidden mines.",
    url: "/games/minesweeper",
    tags: ["Puzzle", "Strategy"],
  },
  {
    name: "Pong",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
        <g fill="#2a2a40">
          <rect x="46" y="8" width="4" height="10"/>
          <rect x="46" y="26" width="4" height="10"/>
          <rect x="46" y="44" width="4" height="10"/>
          <rect x="46" y="62" width="4" height="10"/>
          <rect x="46" y="80" width="4" height="8"/>
        </g>
        <rect x="14" y="30" width="8" height="30" rx="2" fill="#00f0ff"/>
        <rect x="74" y="40" width="8" height="30" rx="2" fill="#ff2e88"/>
        <rect x="44" y="50" width="9" height="9" fill="#f3f3fb"/>
      </svg>`),
    description: "The legendary table-tennis arcade game that started it all.",
    url: "/games/pong",
    tags: ["Arcade", "Sports"],
  },
  {
    name: "Prince of Persia",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
        <defs>
          <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffd23f"/>
            <stop offset="100%" stop-color="#ff7a1a"/>
          </linearGradient>
        </defs>
        <path d="M6 78 h84" stroke="#2a2a40" stroke-width="4" stroke-linecap="round"/>
        <g fill="none" stroke="#2a2a40" stroke-width="3" opacity="0.6">
          <path d="M70 78 V46 a8 8 0 0 1 16 0 V78"/>
        </g>
        <g fill="url(#sand)">
          <path d="M40 22 a6 6 0 1 1 0.1 0 z"/>
          <path d="M30 44 l10 -10 l8 6 l10 -4 l4 8 l-12 6 l-8 -4 l-4 14 l8 16 l-8 2 l-10 -18 z"/>
          <path d="M48 36 l14 8 l-4 8 l-12 -8 z"/>
        </g>
      </svg>`),
    description:
      "Navigate traps, perform acrobatic jumps, and rescue the princess.",
    url: "/games/prince-of-persia",
    tags: ["Adventure", "Platformer"],
  },
  {
    name: "Tetris",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
        <g>
          <rect x="20" y="12" width="16" height="16" fill="#00f0ff"/>
          <rect x="36" y="12" width="16" height="16" fill="#00f0ff"/>
          <rect x="52" y="12" width="16" height="16" fill="#00f0ff"/>
          <rect x="52" y="28" width="16" height="16" fill="#00f0ff"/>
          <rect x="20" y="44" width="16" height="16" fill="#9d4dff"/>
          <rect x="36" y="44" width="16" height="16" fill="#9d4dff"/>
          <rect x="36" y="60" width="16" height="16" fill="#9d4dff"/>
          <rect x="36" y="76" width="16" height="16" fill="#9d4dff"/>
          <rect x="52" y="60" width="16" height="16" fill="#ffd23f"/>
          <rect x="68" y="60" width="16" height="16" fill="#ffd23f"/>
          <rect x="52" y="76" width="16" height="16" fill="#ffd23f"/>
          <rect x="68" y="76" width="16" height="16" fill="#ffd23f"/>
        </g>
      </svg>`),
    description:
      "Arrange falling blocks to complete lines and achieve high scores.",
    url: "/games/tetris",
    tags: ["Puzzle", "Classic"],
  },

  /* ---------------------------------------------------------
     HOW TO ADD A NEW GAME
     Copy the template below, fill in the fields, and the tile
     appears automatically — no other code changes required.

  {
    name: "Tetris",
    icon: "/games/tetris/icon.svg",   // path, URL, or SVG data-URI
    description: "Stack falling blocks and clear lines.",
    url: "/games/tetris",
    tags: ["Puzzle"],                 // optional
  },
  --------------------------------------------------------- */
];

/* ---------------------------------------------------------
   Coming soon data
   Placeholder titles rendered as disabled cards below the grid.
   Add a new upcoming title by appending an object here.
   --------------------------------------------------------- */
const comingSoon = [
  {
    name: "Pac-Man",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
        <path d="M48 48 L86 30 A42 42 0 1 0 86 66 Z" fill="#ffd23f"/>
        <circle cx="60" cy="30" r="5" fill="#11111a"/>
      </svg>`),
    description: "Munch dots and dodge ghosts through the maze.",
    tags: ["Arcade", "Classic"],
  },
  {
    name: "Space Invaders",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
        <g fill="#39ff14">
          <rect x="36" y="20" width="24" height="8"/>
          <rect x="28" y="28" width="40" height="8"/>
          <rect x="20" y="36" width="56" height="16"/>
          <rect x="28" y="52" width="8" height="8"/>
          <rect x="60" y="52" width="8" height="8"/>
        </g>
        <rect x="32" y="36" width="8" height="8" fill="#11111a"/>
        <rect x="56" y="36" width="8" height="8" fill="#11111a"/>
      </svg>`),
    description: "Blast waves of descending alien invaders.",
    tags: ["Arcade", "Shooter"],
  },
  {
    name: "Breakout",
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">
        <g>
          <rect x="14" y="14" width="20" height="10" fill="#ff2e88"/>
          <rect x="38" y="14" width="20" height="10" fill="#ffd23f"/>
          <rect x="62" y="14" width="20" height="10" fill="#00f0ff"/>
          <rect x="14" y="26" width="20" height="10" fill="#9d4dff"/>
          <rect x="38" y="26" width="20" height="10" fill="#39ff14"/>
          <rect x="62" y="26" width="20" height="10" fill="#ff2e88"/>
        </g>
        <circle cx="48" cy="60" r="6" fill="#f3f3fb"/>
        <rect x="34" y="78" width="28" height="8" rx="3" fill="#00f0ff"/>
      </svg>`),
    description: "Smash every brick with a bouncing ball and paddle.",
    tags: ["Arcade", "Classic"],
  },
];

/* ---------------------------------------------------------
   DOM references
   --------------------------------------------------------- */
const grid = document.getElementById("games-grid");
const searchInput = document.getElementById("search");
const countEl = document.getElementById("game-count");
const emptyState = document.getElementById("empty-state");
const comingSoonGrid = document.getElementById("coming-soon-grid");

/* ---------------------------------------------------------
   Build a single game card (semantic <li><a>…)
   --------------------------------------------------------- */
function createCard(game) {
  const li = document.createElement("li");

  const card = document.createElement("a");
  card.className = "game-card";
  card.href = game.url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute(
    "aria-label",
    `Play ${game.name} — ${game.description} (opens in a new tab)`
  );

  // Icon
  const iconWrap = document.createElement("div");
  iconWrap.className = "game-icon-wrap";

  const img = document.createElement("img");
  img.className = "game-icon";
  img.src = game.icon;
  img.alt = `${game.name} icon`;
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 96;
  img.height = 96;
  iconWrap.appendChild(img);

  // Body
  const body = document.createElement("div");
  body.className = "game-body";

  const name = document.createElement("h2");
  name.className = "game-name";
  name.textContent = game.name;
  body.appendChild(name);

  if (Array.isArray(game.tags) && game.tags.length) {
    const tagList = document.createElement("ul");
    tagList.className = "game-tags";
    game.tags.forEach((tag) => {
      const tagItem = document.createElement("li");
      tagItem.className = "game-tag";
      tagItem.textContent = tag;
      tagList.appendChild(tagItem);
    });
    body.appendChild(tagList);
  }

  const desc = document.createElement("p");
  desc.className = "game-description";
  desc.textContent = game.description;
  body.appendChild(desc);

  const play = document.createElement("span");
  play.className = "play-button";
  play.textContent = "Play";
  body.appendChild(play);

  card.append(iconWrap, body);
  li.appendChild(card);
  return li;
}

/* ---------------------------------------------------------
   Build a single "coming soon" card (non-interactive)
   --------------------------------------------------------- */
function createComingSoonCard(game) {
  const li = document.createElement("li");

  const card = document.createElement("div");
  card.className = "game-card game-card--soon";
  card.setAttribute("aria-disabled", "true");
  card.setAttribute("aria-label", `${game.name} — coming soon`);

  const iconWrap = document.createElement("div");
  iconWrap.className = "game-icon-wrap";

  const img = document.createElement("img");
  img.className = "game-icon";
  img.src = game.icon;
  img.alt = `${game.name} icon`;
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 96;
  img.height = 96;
  iconWrap.appendChild(img);

  const badge = document.createElement("span");
  badge.className = "soon-badge";
  badge.textContent = "Coming Soon";
  iconWrap.appendChild(badge);

  const body = document.createElement("div");
  body.className = "game-body";

  const name = document.createElement("h3");
  name.className = "game-name";
  name.textContent = game.name;
  body.appendChild(name);

  if (Array.isArray(game.tags) && game.tags.length) {
    const tagList = document.createElement("ul");
    tagList.className = "game-tags";
    game.tags.forEach((tag) => {
      const tagItem = document.createElement("li");
      tagItem.className = "game-tag";
      tagItem.textContent = tag;
      tagList.appendChild(tagItem);
    });
    body.appendChild(tagList);
  }

  const desc = document.createElement("p");
  desc.className = "game-description";
  desc.textContent = game.description;
  body.appendChild(desc);

  card.append(iconWrap, body);
  li.appendChild(card);
  return li;
}

/* ---------------------------------------------------------
   Render a list of games into the grid
   --------------------------------------------------------- */
function render(list) {
  grid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  list.forEach((game) => fragment.appendChild(createCard(game)));
  grid.appendChild(fragment);

  emptyState.hidden = list.length !== 0;
  updateCount(list.length);
}

/* ---------------------------------------------------------
   Game count display
   --------------------------------------------------------- */
function updateCount(shown) {
  const total = games.length;
  countEl.textContent =
    shown === total
      ? `${total} ${total === 1 ? "game" : "games"}`
      : `${shown} of ${total} games`;
}

/* ---------------------------------------------------------
   Search / filter by name, description, and tags
   --------------------------------------------------------- */
function filterGames(query) {
  const q = query.trim().toLowerCase();
  if (!q) return games;
  return games.filter((game) => {
    const haystack = [game.name, game.description, ...(game.tags || [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

searchInput.addEventListener("input", (event) => {
  render(filterGames(event.target.value));
});

/* ---------------------------------------------------------
   Render the coming soon grid (once, on load)
   --------------------------------------------------------- */
function renderComingSoon() {
  if (!comingSoonGrid) return;
  const fragment = document.createDocumentFragment();
  comingSoon.forEach((game) =>
    fragment.appendChild(createComingSoonCard(game))
  );
  comingSoonGrid.appendChild(fragment);
}

/* ---------------------------------------------------------
   Initial render
   --------------------------------------------------------- */
render(games);
renderComingSoon();
