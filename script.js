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
   DOM references
   --------------------------------------------------------- */
const grid = document.getElementById("games-grid");
const searchInput = document.getElementById("search");
const countEl = document.getElementById("game-count");
const emptyState = document.getElementById("empty-state");

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
   Search / filter by name (and tags)
   --------------------------------------------------------- */
function filterGames(query) {
  const q = query.trim().toLowerCase();
  if (!q) return games;
  return games.filter((game) => {
    const haystack = [game.name, ...(game.tags || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

searchInput.addEventListener("input", (event) => {
  render(filterGames(event.target.value));
});

/* ---------------------------------------------------------
   Initial render
   --------------------------------------------------------- */
render(games);
