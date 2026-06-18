/* ============================================================================
   NEON PAC-MAN
   A complete browser Pac-Man built with HTML5 Canvas + ES6 classes.
   Classes: AudioManager, Maze, Pellet, Entity, PacMan, Ghost, Game
   ============================================================================ */
(() => {
"use strict";

/* ------------------------------------------------------------------ *
 *  Constants & helpers
 * ------------------------------------------------------------------ */
const COLS = 28;
const ROWS = 30;
const CELL = 20;                 // pixels per maze tile (canvas = 560 x 620)
const TUNNEL_ROW = 14;           // row where the side tunnels wrap
const STEP = 1 / 60;             // fixed timestep (seconds)

const DIR = {
  up:    { x:  0, y: -1, name: "up" },
  down:  { x:  0, y:  1, name: "down" },
  left:  { x: -1, y:  0, name: "left" },
  right: { x:  1, y:  0, name: "right" },
  none:  { x:  0, y:  0, name: "none" },
};
const opposite = (d) =>
  d === DIR.up ? DIR.down : d === DIR.down ? DIR.up :
  d === DIR.left ? DIR.right : d === DIR.right ? DIR.left : DIR.none;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; };

/* Classic-style maze.
   #  wall      .  pellet      o  power pellet
   -  ghost door (ghosts pass, Pac-Man cannot)
   (space) empty path / ghost house      P  Pac-Man start                       */
const MAZE_LAYOUT = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.#####.##.#####.######",
  "     #.#####.##.#####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #      # ##.######",
  "..........#      #..........",
  "######.## #      # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......P .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

/* ------------------------------------------------------------------ *
 *  AudioManager — synthesises all sound effects with the Web Audio API
 * ------------------------------------------------------------------ */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }
  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
  }
  resume() { this._ensure(); if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }

  // Generic short tone
  _tone(freq, dur, type = "square", vol = 1, slideTo = null) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  pellet()  { this._tone(660, 0.06, "square", 0.6); this._waka = !this._waka; }
  power()   { this._tone(180, 0.25, "sawtooth", 0.7, 90); }
  ghost()   { this._tone(440, 0.18, "square", 0.8, 1200); }
  fruit()   { this._tone(880, 0.12, "triangle", 0.7, 1320); }
  death() {
    if (this.muted || !this.ctx) return;
    let f = 700;
    for (let i = 0; i < 8; i++) {
      setTimeout(() => this._tone(f, 0.12, "sawtooth", 0.6, f * 0.6), i * 90);
      f *= 0.85;
    }
  }
  levelComplete() {
    if (this.muted || !this.ctx) return;
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.16, "square", 0.6), i * 130));
  }
  start() {
    if (this.muted || !this.ctx) return;
    const notes = [392, 523, 659, 880];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.12, "triangle", 0.6), i * 90));
  }
  toggleMute() { this.muted = !this.muted; return this.muted; }
}

/* ------------------------------------------------------------------ *
 *  Pellet — a dot or power pellet on the maze
 * ------------------------------------------------------------------ */
class Pellet {
  constructor(col, row, power) {
    this.col = col; this.row = row;
    this.power = power;
    this.eaten = false;
    this.x = col * CELL + CELL / 2;
    this.y = row * CELL + CELL / 2;
  }
  draw(ctx, pulse) {
    if (this.eaten) return;
    ctx.save();
    if (this.power) {
      const r = 5 + Math.sin(pulse * 6) * 1.6;
      ctx.fillStyle = "#ffd9f6";
      ctx.shadowColor = "#ff8cf0";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#ffd9a0";
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 *  Maze — holds the grid, builds pellets, handles wall queries & BFS
 * ------------------------------------------------------------------ */
class Maze {
  constructor(layout) {
    this.grid = layout.map((row) => row.padEnd(COLS, " ").split(""));
    this.wallCanvas = null;
  }

  tile(col, row) {
    if (row < 0 || row >= ROWS) return "#";
    if (col < 0 || col >= COLS) return " ";
    return this.grid[row][col];
  }

  // Wall test. forGhost lets ghosts pass the house door '-'.
  isWall(col, row, forGhost = false) {
    if (row === TUNNEL_ROW && (col < 0 || col >= COLS)) return false; // open tunnel
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    const t = this.grid[row][col];
    if (t === "#") return true;
    if (t === "-") return !forGhost;
    return false;
  }

  buildPellets() {
    const pellets = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r][c];
        if (t === ".") pellets.push(new Pellet(c, r, false));
        else if (t === "o") pellets.push(new Pellet(c, r, true));
      }
    }
    return pellets;
  }

  // Find first Pac-Man start, fallback to a sane default
  pacStart() {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (this.grid[r][c] === "P") return { col: c, row: r };
    return { col: 13, row: 22 };
  }

  /* BFS that returns the next direction from `from` tile toward `to` tile.
     Used by "eaten" ghost eyes to find their way home. */
  bfsNextDir(fromCol, fromRow, toCol, toRow) {
    if (fromCol === toCol && fromRow === toRow) return null;
    const key = (c, r) => r * COLS + c;
    const visited = new Set([key(fromCol, fromRow)]);
    const queue = [{ c: fromCol, r: fromRow, first: null }];
    const dirs = [DIR.up, DIR.down, DIR.left, DIR.right];
    while (queue.length) {
      const cur = queue.shift();
      for (const d of dirs) {
        let nc = cur.c + d.x, nr = cur.r + d.y;
        // tunnel wrap
        if (nr === TUNNEL_ROW) { if (nc < 0) nc = COLS - 1; else if (nc >= COLS) nc = 0; }
        if (this.isWall(nc, nr, true)) continue;
        const k = key(nc, nr);
        if (visited.has(k)) continue;
        visited.add(k);
        const first = cur.first || d;
        if (nc === toCol && nr === toRow) return first;
        queue.push({ c: nc, r: nr, first });
      }
    }
    return null;
  }

  /* Pre-render the neon walls onto an offscreen canvas (perf). */
  buildWallCanvas() {
    const cv = document.createElement("canvas");
    cv.width = COLS * CELL;
    cv.height = ROWS * CELL;
    const g = cv.getContext("2d");
    g.lineWidth = 2.5;
    g.strokeStyle = "#2a2aff";
    g.shadowColor = "#4a4aff";
    g.shadowBlur = 6;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r][c];
        const x = c * CELL, y = r * CELL;
        if (t === "#") {
          // Draw a rounded neon block edge only where it borders a path,
          // giving the classic "line maze" look.
          g.strokeStyle = "#2c2cff";
          this._roundRect(g, x + 2, y + 2, CELL - 4, CELL - 4, 5);
          g.stroke();
        } else if (t === "-") {
          // ghost door
          g.save();
          g.strokeStyle = "#ff7bd8";
          g.shadowColor = "#ff7bd8";
          g.beginPath();
          g.moveTo(x, y + CELL / 2);
          g.lineTo(x + CELL, y + CELL / 2);
          g.stroke();
          g.restore();
        }
      }
    }
    this.wallCanvas = cv;
  }

  _roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}

/* ------------------------------------------------------------------ *
 *  Entity — shared grid-aligned smooth movement
 * ------------------------------------------------------------------ */
class Entity {
  constructor(game, col, row) {
    this.game = game;
    this.maze = game.maze;
    this.startCol = col;
    this.startRow = row;
    this.reset();
  }
  reset() {
    this.x = this.startCol * CELL + CELL / 2;
    this.y = this.startRow * CELL + CELL / 2;
    this.dir = DIR.none;
    this.lastTile = -1;
  }
  get col() { return Math.floor(this.x / CELL); }
  get row() { return Math.floor(this.y / CELL); }
  centerX(col = this.col) { return col * CELL + CELL / 2; }
  centerY(row = this.row) { return row * CELL + CELL / 2; }
  distToCenter() { return Math.hypot(this.x - this.centerX(), this.y - this.centerY()); }

  wrapTunnel() {
    if (this.x < -CELL / 2) this.x = COLS * CELL + CELL / 2 - 1;
    else if (this.x > COLS * CELL + CELL / 2) this.x = -CELL / 2 + 1;
  }

  advance(speed) {
    this.x += this.dir.x * speed;
    this.y += this.dir.y * speed;
    this.wrapTunnel();
  }
}

/* ------------------------------------------------------------------ *
 *  PacMan
 * ------------------------------------------------------------------ */
class PacMan extends Entity {
  reset() {
    super.reset();
    this.desired = DIR.none;
    this.dir = DIR.left;
    this.facing = DIR.left;
    this.mouth = 0;          // mouth animation phase
    this.dying = false;
    this.deathT = 0;         // 0..1 progress of death animation
    this.invuln = 0;         // seconds of invulnerability remaining
  }

  setDesired(d) { this.desired = d; }

  update(speed) {
    if (this.dying) return;
    if (this.invuln > 0) this.invuln -= STEP;

    const col = this.col, row = this.row;
    const cx = this.centerX(col), cy = this.centerY(row);
    const near = this.distToCenter() <= speed;

    // Instant reverse is always allowed.
    if (this.desired !== DIR.none && this.desired === opposite(this.dir)) {
      this.dir = this.desired;
    }

    if (near) {
      this.x = cx; this.y = cy;                    // snap to tile centre
      // Apply a queued turn if the path is clear.
      if (this.desired !== DIR.none &&
          !this.maze.isWall(col + this.desired.x, row + this.desired.y)) {
        this.dir = this.desired;
      }
      // Stop if a wall is directly ahead.
      if (this.dir !== DIR.none &&
          this.maze.isWall(col + this.dir.x, row + this.dir.y)) {
        this.dir = DIR.none;
      }
    }

    if (this.dir !== DIR.none) {
      this.facing = this.dir;
      this.advance(speed);
      this.mouth += 0.25;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const ang = { up: -Math.PI/2, down: Math.PI/2, left: Math.PI, right: 0, none: 0 }[this.facing.name];
    ctx.rotate(ang);

    if (this.dying) {
      // Mouth opens fully until Pac-Man vanishes.
      const open = this.deathT * Math.PI;
      ctx.fillStyle = "#ffe600";
      ctx.shadowColor = "#ffe600"; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, CELL/2 - 1, open, Math.PI * 2 - open);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    // Blink while invulnerable.
    if (this.invuln > 0 && Math.floor(this.invuln * 10) % 2 === 0) { ctx.restore(); return; }

    const m = (Math.sin(this.mouth) * 0.5 + 0.5) * 0.32 * Math.PI;
    ctx.fillStyle = "#ffe600";
    ctx.shadowColor = "#ffd000"; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, CELL/2 - 1, m, Math.PI * 2 - m);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 *  Ghost
 * ------------------------------------------------------------------ */
class Ghost extends Entity {
  constructor(game, type, col, row, color, scatterCorner, releaseDelay, startsHome) {
    super(game, col, row);
    this.type = type;                 // 'blinky' | 'pinky' | 'inky' | 'clyde'
    this.color = color;
    this.scatterCorner = scatterCorner;
    this.releaseDelay = releaseDelay;
    this.startsHome = startsHome;
    this.resetGhost();
  }
  resetGhost() {
    super.reset();
    this.dir = DIR.up;
    this.state = this.startsHome ? "house" : "normal";
    this.releaseTimer = this.releaseDelay;
    this.frightFlash = false;
  }

  get frightened() { return this.state === "frightened"; }

  setFrightened() {
    if (this.state === "eaten" || this.state === "house") return;
    this.state = "frightened";
    this.dir = opposite(this.dir);   // classic reverse on power pellet
    this.lastTile = -1;
  }
  endFright() { if (this.state === "frightened") this.state = "normal"; }

  /* Target tile (in grid coords) depending on personality and mode. */
  getTarget() {
    const pac = this.game.pacman;
    const pc = pac.col, pr = pac.row;
    if (this.game.scatterMode && this.state === "normal") return this.scatterCorner;

    switch (this.type) {
      case "blinky":            // aggressive direct chase
        return { col: pc, row: pr };
      case "pinky":             // ambush four tiles ahead
        return { col: pc + pac.facing.x * 4, row: pr + pac.facing.y * 4 };
      case "inky":              // semi-random, loosely toward Pac-Man
        return { col: pc, row: pr };
      case "clyde": {           // chase when far, scatter when close
        const d = Math.hypot(pc - this.col, pr - this.row);
        return d > 8 ? { col: pc, row: pr } : this.scatterCorner;
      }
      default: return { col: pc, row: pr };
    }
  }

  decide() {
    const c = this.col, r = this.row;
    const dirs = [DIR.up, DIR.left, DIR.down, DIR.right];
    const options = [];
    for (const d of dirs) {
      if (d === opposite(this.dir)) continue;          // ghosts never reverse freely
      let nc = c + d.x, nr = r + d.y;
      if (nr === TUNNEL_ROW) { if (nc < 0) nc = COLS - 1; else if (nc >= COLS) nc = 0; }
      // forGhost=false keeps the house door one-way: live ghosts can't re-enter.
      if (!this.maze.isWall(nc, nr, false)) options.push(d);
    }
    if (options.length === 0) { this.dir = opposite(this.dir); return; }

    if (this.frightened) { this.dir = options[(Math.random() * options.length) | 0]; return; }
    if (this.type === "inky" && Math.random() < 0.35) {
      this.dir = options[(Math.random() * options.length) | 0]; return;   // semi-random
    }

    const t = this.getTarget();
    let best = options[0], bestD = Infinity;
    for (const d of options) {
      const nd = dist2(c + d.x, r + d.y, t.col, t.row);
      if (nd < bestD) { bestD = nd; best = d; }
    }
    this.dir = best;
  }

  // Scripted exit from the ghost house.
  updateHouse(speed) {
    if (this.releaseTimer > 0) {
      this.releaseTimer -= STEP;
      // gentle bob in place
      this.y = this.centerY(this.startRow) + Math.sin(performance.now() / 200) * 3;
      return;
    }
    const doorX = 13 * CELL + CELL / 2;
    if (Math.abs(this.x - doorX) > speed) {
      this.dir = this.x < doorX ? DIR.right : DIR.left;
      this.x += this.dir.x * speed;
    } else {
      this.x = doorX;
      this.dir = DIR.up;
      this.y -= speed;
      if (this.row <= 11) {           // emerged into the lobby
        this.state = "normal";
        this.lastTile = -1;
      }
    }
  }

  // Eaten eyes travel home via BFS, then revive.
  updateEaten(speed) {
    const homeCol = 13, homeRow = 11;
    if (Math.abs(this.col - homeCol) <= 0 && this.row <= homeRow + 1 &&
        this.distToCenter() <= speed) {
      this.x = this.centerX(homeCol); this.y = this.centerY(homeRow);
      this.state = this.game.powerActive ? "frightened" : "normal";
      this.dir = DIR.down; this.lastTile = -1;
      return;
    }
    if (this.distToCenter() <= speed) {
      this.x = this.centerX(); this.y = this.centerY();
      const nd = this.maze.bfsNextDir(this.col, this.row, homeCol, homeRow);
      if (nd) this.dir = nd;
    }
    this.advance(speed);
  }

  update(speedNormal, speedFright, speedEaten) {
    if (this.state === "house") { this.updateHouse(speedNormal * 0.6); return; }
    if (this.state === "eaten") { this.updateEaten(speedEaten); return; }

    const speed = this.frightened ? speedFright : speedNormal;
    if (this.distToCenter() <= speed && this.lastTile !== this.row * COLS + this.col) {
      this.x = this.centerX(); this.y = this.centerY();
      this.lastTile = this.row * COLS + this.col;
      this.decide();
    }
    this.advance(speed);
  }

  draw(ctx) {
    const x = this.x, y = this.y, r = CELL / 2 - 1;

    if (this.state === "eaten") { this._drawEyes(ctx, x, y); return; }

    // Body colour: frightened blue (flashing white near the end).
    let body = this.color;
    if (this.frightened) {
      body = this.frightFlash && Math.floor(performance.now() / 200) % 2 === 0 ? "#ffffff" : "#2121ff";
    }

    ctx.save();
    ctx.fillStyle = body;
    ctx.shadowColor = body; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y - 1, r, Math.PI, 0);            // domed head
    ctx.lineTo(x + r, y + r);
    // scalloped skirt
    const feet = 3, fw = (2 * r) / feet;
    for (let i = 0; i < feet; i++) {
      const fx = x + r - i * fw;
      ctx.lineTo(fx - fw / 2, y + r - 4);
      ctx.lineTo(fx - fw, y + r);
    }
    ctx.lineTo(x - r, y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (this.frightened) {
      // simple scared face
      ctx.fillStyle = this.frightFlash && Math.floor(performance.now() / 200) % 2 === 0 ? "#ff0000" : "#ffd9f6";
      ctx.fillRect(x - 4, y - 3, 2, 2);
      ctx.fillRect(x + 2, y - 3, 2, 2);
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 4);
      for (let i = -4; i <= 4; i += 2) ctx.lineTo(x + i, y + (i % 4 === 0 ? 4 : 2));
      ctx.stroke();
    } else {
      this._drawEyes(ctx, x, y);
    }
  }

  _drawEyes(ctx, x, y) {
    const dx = this.dir.x, dy = this.dir.y;
    for (const ex of [-4, 4]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(x + ex, y - 2, 3, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1414ff";
      ctx.beginPath();
      ctx.arc(x + ex + dx * 1.6, y - 2 + dy * 1.8, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Game — orchestrates everything
 * ------------------------------------------------------------------ */
class Game {
  constructor() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.audio = new AudioManager();

    this.maze = new Maze(MAZE_LAYOUT);
    this.maze.buildWallCanvas();

    this.score = 0;
    this.highScore = parseInt(localStorage.getItem("pacman-highscore") || "0", 10);
    this.level = 1;
    this.lives = 3;
    this.state = "start";          // start | playing | paused | dying | levelcomplete | gameover
    this.pulse = 0;

    this.powerActive = false;
    this.powerTimer = 0;
    this.ghostCombo = 0;
    this.scatterMode = false;
    this.modeTimer = 7;            // start in scatter
    this.fruit = null;
    this.acc = 0;
    this.lastTime = 0;

    this._cacheDom();
    this._bindUI();
    this._bindInput();
    this.setupLevel(true);
    this.updateHUD();
    requestAnimationFrame((t) => this.loop(t));
  }

  _cacheDom() {
    this.el = {
      score: document.getElementById("score"),
      high: document.getElementById("highScore"),
      level: document.getElementById("level"),
      lives: document.getElementById("lives"),
      overlay: document.getElementById("overlay"),
      screens: {
        start: document.getElementById("screen-start"),
        pause: document.getElementById("screen-pause"),
        level: document.getElementById("screen-level"),
        over: document.getElementById("screen-over"),
      },
      finalScore: document.getElementById("finalScore"),
      newHigh: document.getElementById("newHigh"),
      levelMsg: document.getElementById("levelMsg"),
      app: document.getElementById("app"),
    };
  }

  /* ----- level / entity setup ----- */
  setupLevel(fullReset) {
    this.pellets = this.maze.buildPellets();
    this.pelletsEaten = 0;
    this.totalPellets = this.pellets.length;

    const p = this.maze.pacStart();
    if (fullReset || !this.pacman) this.pacman = new PacMan(this, p.col, p.row);
    else { this.pacman.startCol = p.col; this.pacman.startRow = p.row; }
    this.pacman.reset();
    this.pacman.invuln = 2;

    // Four ghosts: Blinky waits in the lobby, the rest exit the house.
    this.ghosts = [
      new Ghost(this, "blinky", 13, 11, "#ff0000", { col: COLS - 2, row: 0 }, 0, false),
      new Ghost(this, "pinky",  13, 14, "#ffb8ff", { col: 1, row: 0 }, 2, true),
      new Ghost(this, "inky",   11, 14, "#00e5ff", { col: COLS - 1, row: ROWS - 1 }, 5, true),
      new Ghost(this, "clyde",  16, 14, "#ffb852", { col: 0, row: ROWS - 1 }, 8, true),
    ];

    this.powerActive = false;
    this.powerTimer = 0;
    this.scatterMode = true;
    this.modeTimer = 7;
    this.fruit = null;
  }

  /* ----- difficulty scaling ----- */
  get pacSpeed()   { return clamp(2.3 + (this.level - 1) * 0.06, 2.3, 3.1); }
  get ghostSpeed() { return clamp(1.9 + (this.level - 1) * 0.13, 1.9, 3.2); }
  get frightSpeed(){ return 1.3; }
  get eatenSpeed() { return 4.2; }
  get powerDuration() { return clamp(7 - (this.level - 1) * 0.6, 3, 7); }

  /* ----- main loop with fixed timestep ----- */
  loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000 || 0, 0.1);
    this.lastTime = time;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.update();
      this.acc -= STEP;
    }
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update() {
    this.pulse += STEP;
    this.pollGamepad();

    if (this.state === "playing") {
      this.updatePlaying();
    } else if (this.state === "dying") {
      this.pacman.deathT += STEP / 1.4;
      if (this.pacman.deathT >= 1) this.afterDeath();
    }
  }

  updatePlaying() {
    // Pac-Man
    this.pacman.update(this.pacSpeed);

    // Mode (scatter/chase) cycling
    this.modeTimer -= STEP;
    if (this.modeTimer <= 0 && !this.powerActive) {
      this.scatterMode = !this.scatterMode;
      this.modeTimer = this.scatterMode ? 7 : 20;
      // reverse live ghosts on mode flip
      for (const g of this.ghosts)
        if (g.state === "normal") { g.dir = opposite(g.dir); g.lastTile = -1; }
    }

    // Power pellet timer
    if (this.powerActive) {
      this.powerTimer -= STEP;
      const flash = this.powerTimer < 2;
      for (const g of this.ghosts) g.frightFlash = flash;
      if (this.powerTimer <= 0) {
        this.powerActive = false;
        for (const g of this.ghosts) g.endFright();
      }
    }

    // Ghosts
    for (const g of this.ghosts) g.update(this.ghostSpeed, this.frightSpeed, this.eatenSpeed);

    this.checkPellets();
    this.checkFruit();
    this.checkGhostCollisions();
  }

  checkPellets() {
    const pc = this.pacman.col, pr = this.pacman.row;
    for (const p of this.pellets) {
      if (p.eaten || p.col !== pc || p.row !== pr) continue;
      p.eaten = true;
      this.pelletsEaten++;
      if (p.power) {
        this.addScore(50);
        this.audio.power();
        this.activatePower();
      } else {
        this.addScore(10);
        this.audio.pellet();
      }
      // Fruit appears at pellet milestones.
      if ((this.pelletsEaten === 70 || this.pelletsEaten === 170) && !this.fruit)
        this.spawnFruit();
      if (this.pelletsEaten >= this.totalPellets) this.levelComplete();
      break;
    }
  }

  activatePower() {
    this.powerActive = true;
    this.powerTimer = this.powerDuration;
    this.ghostCombo = 0;
    for (const g of this.ghosts) g.setFrightened();
  }

  spawnFruit() {
    const p = this.maze.pacStart();
    this.fruit = { col: p.col, row: p.row - 3, timer: 9, points: 100 * this.level };
  }
  checkFruit() {
    if (!this.fruit) return;
    this.fruit.timer -= STEP;
    if (this.fruit.timer <= 0) { this.fruit = null; return; }
    if (this.pacman.col === this.fruit.col && this.pacman.row === this.fruit.row) {
      this.addScore(this.fruit.points);
      this.audio.fruit();
      this.fruit = null;
    }
  }

  checkGhostCollisions() {
    const pac = this.pacman;
    if (pac.dying) return;
    for (const g of this.ghosts) {
      if (g.state === "eaten" || g.state === "house") continue;
      if (dist2(pac.x, pac.y, g.x, g.y) > (CELL * 0.55) ** 2) continue;
      if (g.frightened) {
        // eat the ghost
        this.ghostCombo = Math.min(this.ghostCombo + 1, 4);
        this.addScore(200 * Math.pow(2, this.ghostCombo - 1));
        this.audio.ghost();
        g.state = "eaten";
        g.lastTile = -1;
      } else if (pac.invuln <= 0) {
        this.loseLife();
        return;
      }
    }
  }

  loseLife() {
    this.lives--;
    this.pacman.dying = true;
    this.pacman.deathT = 0;
    this.state = "dying";
    this.audio.death();
    this.updateHUD();
  }

  afterDeath() {
    if (this.lives <= 0) { this.gameOver(); return; }
    // Respawn Pac-Man & reset ghosts to the house.
    const p = this.maze.pacStart();
    this.pacman.startCol = p.col; this.pacman.startRow = p.row;
    this.pacman.reset();
    this.pacman.invuln = 2.5;
    for (const g of this.ghosts) g.resetGhost();
    this.powerActive = false;
    this.scatterMode = true;
    this.modeTimer = 7;
    this.state = "playing";
  }

  levelComplete() {
    this.state = "levelcomplete";
    this.audio.levelComplete();
    this.el.levelMsg.textContent = `Level ${this.level} cleared — faster ghosts ahead!`;
    this.showScreen("level");
  }

  nextLevel() {
    this.level++;
    this.setupLevel(false);
    this.pacman.invuln = 2;
    this.hideScreens();
    this.state = "playing";
    this.updateHUD();
  }

  gameOver() {
    this.state = "gameover";
    let isNew = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("pacman-highscore", String(this.highScore));
      isNew = true;
    }
    this.el.finalScore.textContent = this.score;
    this.el.newHigh.style.display = isNew ? "block" : "none";
    this.updateHUD();
    this.showScreen("over");
  }

  addScore(n) {
    this.score += n;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("pacman-highscore", String(this.highScore));
    }
    this.updateHUD();
  }

  /* ----- start / pause / restart ----- */
  startGame() {
    this.score = 0;
    this.level = 1;
    this.lives = 3;
    this.setupLevel(true);
    this.hideScreens();
    this.state = "playing";
    this.audio.resume();
    this.audio.start();
    this.updateHUD();
  }
  restart() { this.startGame(); }

  togglePause() {
    if (this.state === "playing") { this.state = "paused"; this.showScreen("pause"); }
    else if (this.state === "paused") { this.hideScreens(); this.state = "playing"; }
  }

  /* ----- rendering ----- */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // walls (cached)
    ctx.drawImage(this.maze.wallCanvas, 0, 0);

    // pellets
    for (const p of this.pellets) p.draw(ctx, this.pulse);

    // fruit
    if (this.fruit) this.drawFruit(ctx);

    // ghosts behind/with Pac-Man
    for (const g of this.ghosts) g.draw(ctx);

    // Pac-Man
    if (this.state !== "start") this.pacman.draw(ctx);

    // ready / power flash banner
    if (this.powerActive && this.state === "playing") {
      ctx.save();
      ctx.fillStyle = "rgba(33,33,255,0.04)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }

  drawFruit(ctx) {
    const x = this.fruit.col * CELL + CELL / 2;
    const y = this.fruit.row * CELL + CELL / 2;
    ctx.save();
    ctx.fillStyle = "#ff2d2d";
    ctx.shadowColor = "#ff2d2d"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x - 3, y + 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3, y + 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#7CFC00"; ctx.lineWidth = 1.5; ctx.shadowColor = "#7CFC00";
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y - 7); ctx.stroke();
    ctx.restore();
  }

  /* ----- HUD & screens ----- */
  updateHUD() {
    this.el.score.textContent = this.score;
    this.el.high.textContent = this.highScore;
    this.el.level.textContent = this.level;
    this.el.lives.textContent = "●".repeat(Math.max(0, this.lives)) || "—";
  }
  showScreen(name) {
    Object.values(this.el.screens).forEach((s) => s.classList.remove("active"));
    if (this.el.screens[name]) this.el.screens[name].classList.add("active");
  }
  hideScreens() {
    Object.values(this.el.screens).forEach((s) => s.classList.remove("active"));
  }

  /* ----- input ----- */
  _bindInput() {
    const keyDir = {
      ArrowUp: DIR.up, ArrowDown: DIR.down, ArrowLeft: DIR.left, ArrowRight: DIR.right,
      w: DIR.up, s: DIR.down, a: DIR.left, d: DIR.right,
      W: DIR.up, S: DIR.down, A: DIR.left, D: DIR.right,
    };
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "p" || e.key === "P") {
        if (this.state === "playing" || this.state === "paused") { e.preventDefault(); this.togglePause(); }
        return;
      }
      if (e.key === "Enter" && (this.state === "start" || this.state === "gameover")) { this.startGame(); return; }
      const d = keyDir[e.key];
      if (d) { e.preventDefault(); this.pacman.setDesired(d); this.audio.resume(); }
    });

    // Swipe on canvas
    let sx = 0, sy = 0;
    const stage = document.getElementById("stage");
    stage.addEventListener("touchstart", (e) => {
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; this.audio.resume();
    }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) this.pacman.setDesired(dx > 0 ? DIR.right : DIR.left);
      else this.pacman.setDesired(dy > 0 ? DIR.down : DIR.up);
    }, { passive: true });

    // D-pad
    document.querySelectorAll(".dpad").forEach((btn) => {
      const dir = DIR[btn.dataset.dir];
      const fire = (e) => { e.preventDefault(); this.pacman.setDesired(dir); this.audio.resume(); };
      btn.addEventListener("touchstart", fire, { passive: false });
      btn.addEventListener("mousedown", fire);
    });
  }

  _bindUI() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        switch (btn.dataset.action) {
          case "start": this.startGame(); break;
          case "resume": this.togglePause(); break;
          case "restart": this.restart(); break;
          case "next": this.nextLevel(); break;
        }
      });
    });

    document.getElementById("btnPause").onclick = () => this.togglePause();
    document.getElementById("btnRestart").onclick = () => this.restart();
    document.getElementById("btnMute").onclick = (e) => {
      this.audio.resume();
      const muted = this.audio.toggleMute();
      e.currentTarget.textContent = muted ? "🔇" : "🔊";
      e.currentTarget.classList.toggle("active", !muted);
    };
    const crtBtn = document.getElementById("btnCrt");
    crtBtn.onclick = (e) => {
      this.el.app.classList.toggle("crt");
      e.currentTarget.classList.toggle("active", this.el.app.classList.contains("crt"));
    };
    document.getElementById("btnFull").onclick = () => {
      if (!document.fullscreenElement) this.el.app.requestFullscreen?.();
      else document.exitFullscreen?.();
    };
  }

  /* ----- optional gamepad support ----- */
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp) return;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dl = gp.buttons[14]?.pressed, dr = gp.buttons[15]?.pressed;
    const du = gp.buttons[12]?.pressed, dd = gp.buttons[13]?.pressed;
    if (du || ay < -0.5) this.pacman.setDesired(DIR.up);
    else if (dd || ay > 0.5) this.pacman.setDesired(DIR.down);
    else if (dl || ax < -0.5) this.pacman.setDesired(DIR.left);
    else if (dr || ax > 0.5) this.pacman.setDesired(DIR.right);
    if (gp.buttons[9]?.pressed) this.togglePause();
  }
}

/* ------------------------------------------------------------------ *
 *  Boot
 * ------------------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => { window.game = new Game(); });

})();
