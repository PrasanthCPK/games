/* =========================================================================
 * Minesweeper — script.js
 *
 * Architecture
 * ------------
 *   MinesweeperGame  → pure game logic / state machine. Knows nothing about
 *                      the DOM. Fully unit-testable in isolation.
 *   SoundManager     → tiny WebAudio beeper, no audio files needed.
 *   UI               → renders the game state to the DOM and translates user
 *                      input (mouse, touch, keyboard) into game actions.
 *
 * The two layers communicate through a small set of methods and a callback
 * (game.onWin / game.onLose) so logic and rendering stay decoupled.
 * ========================================================================= */

"use strict";

/* ----- Difficulty presets ------------------------------------------------ */
const DIFFICULTIES = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, label: "Beginner" },
  intermediate: { rows: 16, cols: 16, mines: 40, label: "Intermediate" },
  expert:       { rows: 16, cols: 30, mines: 99, label: "Expert" },
};

const GAME_STATE = Object.freeze({
  READY: "ready",     // board built, first click not yet made
  PLAYING: "playing", // mines placed, timer running
  WON: "won",
  LOST: "lost",
});

/* =========================================================================
 * MinesweeperGame — the logic layer.
 * ========================================================================= */
class MinesweeperGame {
  /**
   * @param {{rows:number, cols:number, mines:number}} config
   */
  constructor({ rows, cols, mines }) {
    this.rows = rows;
    this.cols = cols;
    // Never allow more mines than (cells - 1); the first click must stay safe.
    this.mines = Math.min(mines, rows * cols - 1);
    this.reset();
  }

  /** Rebuild a clean board in the READY state. */
  reset() {
    this.state = GAME_STATE.READY;
    this.flagsPlaced = 0;
    this.revealedCount = 0;
    this.firstClick = true;

    // Each cell is a plain object describing its current status.
    this.grid = Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => ({
        row: r,
        col: c,
        mine: false,
        revealed: false,
        flagged: false,
        adjacent: 0, // number of neighbouring mines
      }))
    );
  }

  inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  /** Yield the (up to 8) neighbours of a cell. */
  *neighbors(r, c) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (this.inBounds(nr, nc)) yield this.grid[nr][nc];
      }
    }
  }

  /**
   * Place mines randomly, guaranteeing that the first-clicked cell AND its
   * neighbours are mine-free (so the opening click always flood-fills a bit).
   * Uses partial Fisher–Yates over the eligible cell indices for an even,
   * unbiased distribution that scales to large boards.
   */
  _placeMines(safeR, safeC) {
    const safeZone = new Set();
    safeZone.add(safeR * this.cols + safeC);
    for (const n of this.neighbors(safeR, safeC)) {
      safeZone.add(n.row * this.cols + n.col);
    }

    // Build the pool of indices we are allowed to mine.
    const pool = [];
    for (let i = 0; i < this.rows * this.cols; i++) {
      if (!safeZone.has(i)) pool.push(i);
    }

    // Fisher–Yates shuffle, but only as far as we need mines.
    const mineCount = Math.min(this.mines, pool.length);
    for (let i = 0; i < mineCount; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      const idx = pool[i];
      const cell = this.grid[Math.floor(idx / this.cols)][idx % this.cols];
      cell.mine = true;
    }
    this.mines = mineCount;

    // Pre-compute adjacency counts once; cheaper than recomputing on reveal.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.mine) continue;
        let count = 0;
        for (const n of this.neighbors(r, c)) if (n.mine) count++;
        cell.adjacent = count;
      }
    }
  }

  /**
   * Reveal a cell. Returns the list of cells whose visual state changed so
   * the UI can update only what's necessary (important for big boards).
   * @returns {{changed:Array, hitMine:object|null}}
   */
  reveal(r, c) {
    if (this.state === GAME_STATE.WON || this.state === GAME_STATE.LOST) {
      return { changed: [], hitMine: null };
    }
    const cell = this.grid[r][c];
    if (cell.revealed || cell.flagged) return { changed: [], hitMine: null };

    // First click: lay the mines now, around a guaranteed-safe spot.
    if (this.firstClick) {
      this._placeMines(r, c);
      this.firstClick = false;
      this.state = GAME_STATE.PLAYING;
    }

    // Stepped on a mine → game over.
    if (cell.mine) {
      cell.revealed = true;
      this.state = GAME_STATE.LOST;
      return { changed: this._allMineCells(), hitMine: cell };
    }

    // Otherwise flood-fill from this cell.
    const changed = this._floodReveal(r, c);

    if (this._checkWin()) {
      this.state = GAME_STATE.WON;
    }
    return { changed, hitMine: null };
  }

  /**
   * Iterative flood-fill (stack based, not recursive) so deep empty regions
   * on large boards never blow the call stack.
   */
  _floodReveal(startR, startC) {
    const changed = [];
    const stack = [[startR, startC]];

    while (stack.length) {
      const [r, c] = stack.pop();
      const cell = this.grid[r][c];
      if (cell.revealed || cell.flagged || cell.mine) continue;

      cell.revealed = true;
      this.revealedCount++;
      changed.push(cell);

      // Empty cell (no adjacent mines) → spill into all neighbours.
      if (cell.adjacent === 0) {
        for (const n of this.neighbors(r, c)) {
          if (!n.revealed && !n.flagged && !n.mine) stack.push([n.row, n.col]);
        }
      }
    }
    return changed;
  }

  /**
   * "Chord" action: on a revealed number whose adjacent flag count matches
   * its value, reveal all remaining covered neighbours at once. A classic
   * speed-play convenience triggered by clicking an already-open number.
   */
  chord(r, c) {
    const cell = this.grid[r][c];
    if (!cell.revealed || cell.adjacent === 0) return { changed: [], hitMine: null };

    let flagged = 0;
    for (const n of this.neighbors(r, c)) if (n.flagged) flagged++;
    if (flagged !== cell.adjacent) return { changed: [], hitMine: null };

    let allChanged = [];
    let hitMine = null;
    for (const n of this.neighbors(r, c)) {
      if (!n.revealed && !n.flagged) {
        const result = this.reveal(n.row, n.col);
        allChanged = allChanged.concat(result.changed);
        if (result.hitMine) hitMine = result.hitMine;
      }
    }
    return { changed: allChanged, hitMine };
  }

  /** Toggle a flag. Returns the cell if it changed, else null. */
  toggleFlag(r, c) {
    if (this.state !== GAME_STATE.PLAYING && this.state !== GAME_STATE.READY) {
      return null;
    }
    const cell = this.grid[r][c];
    if (cell.revealed) return null;

    cell.flagged = !cell.flagged;
    this.flagsPlaced += cell.flagged ? 1 : -1;
    return cell;
  }

  /** All mine cells plus any wrongly-flagged cells, for the lose reveal. */
  _allMineCells() {
    const cells = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.mine || cell.flagged) cells.push(cell);
      }
    }
    return cells;
  }

  /** Win when every non-mine cell has been revealed. */
  _checkWin() {
    return this.revealedCount === this.rows * this.cols - this.mines;
  }

  /** Mines minus flags placed (can go negative if over-flagged). */
  get minesRemaining() {
    return this.mines - this.flagsPlaced;
  }
}

/* =========================================================================
 * SoundManager — synthesised blips via the Web Audio API (no asset files).
 * ========================================================================= */
class SoundManager {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    return this.ctx;
  }

  /** Play a short tone. @param {number} freq @param {number} dur seconds */
  _tone(freq, dur, type = "square", gain = 0.06) {
    if (!this.enabled) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);

    const now = ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }

  reveal() { this._tone(440, 0.05); }
  flag()   { this._tone(660, 0.06, "triangle"); }
  win()    { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, "triangle", 0.08), i * 120)); }
  lose()   { [220, 180, 140, 90].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, "sawtooth", 0.08), i * 110)); }
}

/* =========================================================================
 * UI — renders the game and wires up all input.
 * ========================================================================= */
class UI {
  constructor() {
    // Cache DOM references.
    this.boardEl     = document.getElementById("board");
    this.mineCounter = document.getElementById("mine-counter");
    this.timerEl     = document.getElementById("timer");
    this.statusFace  = document.getElementById("status-face");
    this.statusMsg   = document.getElementById("status-message");
    this.difficultyEl = document.getElementById("difficulty");
    this.customSettings = document.getElementById("custom-settings");
    this.newGameBtn  = document.getElementById("new-game");
    this.themeToggle = document.getElementById("theme-toggle");
    this.soundToggle = document.getElementById("sound-toggle");
    this.scoresBody  = document.getElementById("scores-body");
    this.clearScores = document.getElementById("clear-scores");
    this.overlay     = document.getElementById("overlay");

    this.sound = new SoundManager();

    // Runtime state.
    this.cellEls = [];        // 2D array mirroring grid for O(1) DOM access
    this.timerId = null;
    this.elapsed = 0;
    this.cursor = { r: 0, c: 0 }; // keyboard focus position
    this.currentDifficulty = "beginner";

    this._loadPreferences();
    this._bindControls();
    this.newGame();
  }

  /* ----- Persistence (Local Storage) ----------------------------------- */
  _loadPreferences() {
    // Theme.
    const theme = localStorage.getItem("ms-theme") || "light";
    document.documentElement.setAttribute("data-theme", theme);
    this._syncThemeButton(theme);

    // Sound.
    const muted = localStorage.getItem("ms-muted") === "true";
    this.sound.enabled = !muted;
    this._syncSoundButton();

    this.renderScores();
  }

  _bestTimes() {
    try {
      return JSON.parse(localStorage.getItem("ms-best") || "{}");
    } catch {
      return {};
    }
  }

  _saveBestTime(difficulty, seconds) {
    // Only standard presets get leaderboard entries.
    if (!DIFFICULTIES[difficulty]) return false;
    const best = this._bestTimes();
    if (best[difficulty] == null || seconds < best[difficulty]) {
      best[difficulty] = seconds;
      localStorage.setItem("ms-best", JSON.stringify(best));
      return true;
    }
    return false;
  }

  renderScores() {
    const best = this._bestTimes();
    this.scoresBody.innerHTML = "";
    for (const key of ["beginner", "intermediate", "expert"]) {
      const tr = document.createElement("tr");
      const time = best[key] != null ? `${best[key]}s` : "—";
      tr.innerHTML = `<td>${DIFFICULTIES[key].label}</td><td>${time}</td>`;
      this.scoresBody.appendChild(tr);
    }
  }

  /* ----- Control wiring -------------------------------------------------- */
  _bindControls() {
    this.newGameBtn.addEventListener("click", () => this.newGame());
    this.statusFace.addEventListener("click", () => this.newGame());

    this.difficultyEl.addEventListener("change", () => {
      const val = this.difficultyEl.value;
      this.customSettings.hidden = val !== "custom";
      if (val !== "custom") {
        this.currentDifficulty = val;
        this.newGame();
      }
    });

    document.getElementById("custom-apply").addEventListener("click", () => {
      this.currentDifficulty = "custom";
      this.newGame();
    });

    this.themeToggle.addEventListener("click", () => this._toggleTheme());
    this.soundToggle.addEventListener("click", () => this._toggleSound());

    this.clearScores.addEventListener("click", () => {
      localStorage.removeItem("ms-best");
      this.renderScores();
    });

    document.getElementById("overlay-btn").addEventListener("click", () => {
      this.hideOverlay();
      this.newGame();
    });

    // Block the context menu over the board so right-click can flag.
    this.boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

    // Keyboard navigation while the board is focused.
    this.boardEl.addEventListener("keydown", (e) => this._handleKey(e));
  }

  _toggleTheme() {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ms-theme", next);
    this._syncThemeButton(next);
  }

  _syncThemeButton(theme) {
    const dark = theme === "dark";
    this.themeToggle.setAttribute("aria-pressed", String(dark));
    this.themeToggle.querySelector(".icon-btn__icon").textContent = dark ? "☀️" : "🌙";
  }

  _toggleSound() {
    this.sound.enabled = !this.sound.enabled;
    localStorage.setItem("ms-muted", String(!this.sound.enabled));
    this._syncSoundButton();
  }

  _syncSoundButton() {
    this.soundToggle.setAttribute("aria-pressed", String(this.sound.enabled));
    this.soundToggle.querySelector(".icon-btn__icon").textContent =
      this.sound.enabled ? "🔊" : "🔇";
  }

  /* ----- Config resolution ---------------------------------------------- */
  _resolveConfig() {
    if (this.currentDifficulty === "custom") {
      const clamp = (v, lo, hi, d) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
      };
      const rows = clamp(document.getElementById("custom-rows").value, 5, 40, 12);
      const cols = clamp(document.getElementById("custom-cols").value, 5, 50, 12);
      const maxMines = rows * cols - 1;
      const mines = clamp(document.getElementById("custom-mines").value, 1, maxMines, 20);
      return { rows, cols, mines };
    }
    return DIFFICULTIES[this.currentDifficulty];
  }

  /* ----- New game ------------------------------------------------------- */
  newGame() {
    this._stopTimer();
    this.elapsed = 0;
    this.updateTimer();

    const config = this._resolveConfig();
    this.game = new MinesweeperGame(config);

    this.cursor = { r: 0, c: 0 };
    this.statusFace.textContent = "🙂";
    this.statusMsg.textContent = "Click any cell to start. First click is always safe.";
    this.hideOverlay();
    this._renderBoard();
    this.updateMineCounter();
  }

  /* ----- Board rendering ------------------------------------------------- */
  _renderBoard() {
    const { rows, cols } = this.game;
    this.boardEl.innerHTML = "";
    this.boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
    this.boardEl.setAttribute("aria-rowcount", rows);
    this.boardEl.setAttribute("aria-colcount", cols);

    // Use a fragment for a single reflow even on a 30×16 expert board.
    const frag = document.createDocumentFragment();
    this.cellEls = Array.from({ length: rows }, () => new Array(cols));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "cell";
        el.dataset.row = r;
        el.dataset.col = c;
        el.setAttribute("role", "gridcell");
        el.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}, hidden`);
        el.tabIndex = -1;
        this._attachCellEvents(el, r, c);
        this.cellEls[r][c] = el;
        frag.appendChild(el);
      }
    }
    this.boardEl.appendChild(frag);
  }

  /**
   * Attach pointer + touch handlers to a single cell.
   * Mouse: left = reveal/chord, right = flag.
   * Touch: tap = reveal, long-press = flag.
   */
  _attachCellEvents(el, r, c) {
    // --- Mouse ---
    el.addEventListener("click", (e) => {
      // Ignore the synthetic click that follows a touch interaction.
      if (this._touchHandled) { this._touchHandled = false; return; }
      this._onReveal(r, c);
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._onFlag(r, c);
    });

    // --- Touch (long-press to flag) ---
    let pressTimer = null;
    let longPressed = false;

    el.addEventListener("touchstart", (e) => {
      // Prevent the page from scrolling/zooming on board touches.
      e.preventDefault();
      longPressed = false;
      pressTimer = setTimeout(() => {
        longPressed = true;
        this._onFlag(r, c);
        if (navigator.vibrate) navigator.vibrate(15);
      }, 400);
    }, { passive: false });

    const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };

    el.addEventListener("touchend", (e) => {
      e.preventDefault();
      cancel();
      this._touchHandled = true; // suppress the trailing mouse click
      if (!longPressed) this._onReveal(r, c);
    }, { passive: false });

    el.addEventListener("touchmove", cancel, { passive: true });
    el.addEventListener("touchcancel", cancel);
  }

  /* ----- Input → game actions ------------------------------------------- */
  _onReveal(r, c) {
    if (this.game.state === GAME_STATE.WON || this.game.state === GAME_STATE.LOST) return;
    this._moveCursor(r, c);

    const cell = this.game.grid[r][c];
    // Clicking an open number performs a chord; otherwise a normal reveal.
    const result = cell.revealed
      ? this.game.chord(r, c)
      : this.game.reveal(r, c);

    if (result.changed.length === 0 && !result.hitMine) return;

    // Start the timer on the very first effective reveal.
    if (this.game.state === GAME_STATE.PLAYING && !this.timerId) this._startTimer();

    result.changed.forEach((cl) => this._paintCell(cl));

    if (result.hitMine) {
      this._paintCell(result.hitMine);
      result.hitMine.dom = this.cellEls[result.hitMine.row][result.hitMine.col];
      this.cellEls[result.hitMine.row][result.hitMine.col].classList.add("mine-hit");
      this._endGame(false);
    } else {
      this.sound.reveal();
      if (this.game.state === GAME_STATE.WON) this._endGame(true);
    }
  }

  _onFlag(r, c) {
    if (this.game.state === GAME_STATE.WON || this.game.state === GAME_STATE.LOST) return;
    this._moveCursor(r, c);
    const cell = this.game.toggleFlag(r, c);
    if (!cell) return;
    this._paintCell(cell);
    this.updateMineCounter();
    this.sound.flag();
  }

  /** Update a single cell's DOM to match its logical state. */
  _paintCell(cell) {
    const el = this.cellEls[cell.row][cell.col];
    el.classList.toggle("flagged", cell.flagged && !cell.revealed);

    if (cell.flagged && !cell.revealed) {
      el.textContent = "🚩";
      el.setAttribute("aria-label", `Row ${cell.row + 1}, column ${cell.col + 1}, flagged`);
      return;
    }

    if (!cell.revealed) {
      el.textContent = "";
      el.setAttribute("aria-label", `Row ${cell.row + 1}, column ${cell.col + 1}, hidden`);
      return;
    }

    el.classList.add("revealed");
    if (cell.mine) {
      el.classList.add("mine");
      el.textContent = "💣";
      el.setAttribute("aria-label", "Mine");
    } else if (cell.adjacent > 0) {
      el.textContent = cell.adjacent;
      el.dataset.count = cell.adjacent;
      el.setAttribute("aria-label", `${cell.adjacent} adjacent mines`);
    } else {
      el.textContent = "";
      el.setAttribute("aria-label", "Empty");
    }
  }

  /* ----- HUD ------------------------------------------------------------- */
  updateMineCounter() {
    this.mineCounter.textContent = this._pad(this.game.minesRemaining);
  }

  updateTimer() {
    this.timerEl.textContent = this._pad(this.elapsed);
  }

  _pad(n) {
    // Classic 3-digit padded counter (handles negatives gracefully).
    const sign = n < 0 ? "-" : "";
    return sign + String(Math.abs(n)).padStart(3, "0");
  }

  _startTimer() {
    this._stopTimer();
    this.timerId = setInterval(() => {
      this.elapsed = Math.min(this.elapsed + 1, 999);
      this.updateTimer();
    }, 1000);
  }

  _stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /* ----- End of game ----------------------------------------------------- */
  _endGame(won) {
    this._stopTimer();

    if (won) {
      this.statusFace.textContent = "😎";
      // Auto-flag any remaining mines for a tidy finished board.
      for (let r = 0; r < this.game.rows; r++) {
        for (let c = 0; c < this.game.cols; c++) {
          const cell = this.game.grid[r][c];
          if (cell.mine && !cell.flagged) {
            cell.flagged = true;
            this._paintCell(cell);
          }
        }
      }
      this.game.flagsPlaced = this.game.mines;
      this.updateMineCounter();

      const isRecord = this._saveBestTime(this.currentDifficulty, this.elapsed);
      this.renderScores();
      this.sound.win();
      this.statusMsg.textContent = `You cleared it in ${this.elapsed}s!`;
      this.showOverlay(
        "🎉", "You Win!",
        isRecord ? `New best time: ${this.elapsed}s! 🏆` : `Cleared in ${this.elapsed}s.`
      );
    } else {
      this.statusFace.textContent = "😵";
      this._revealAllMines();
      this.sound.lose();
      this.statusMsg.textContent = "Boom! You hit a mine.";
      this.showOverlay("💥", "Game Over", "You hit a mine. Better luck next time!");
    }
  }

  /** On a loss, paint every mine and mark wrongly-flagged cells. */
  _revealAllMines() {
    for (let r = 0; r < this.game.rows; r++) {
      for (let c = 0; c < this.game.cols; c++) {
        const cell = this.game.grid[r][c];
        const el = this.cellEls[r][c];
        if (cell.mine && !cell.flagged) {
          cell.revealed = true;
          this._paintCell(cell);
        } else if (cell.flagged && !cell.mine) {
          // A flag in the wrong place.
          el.classList.add("revealed");
          el.textContent = "❌";
        }
      }
    }
  }

  /* ----- Overlay -------------------------------------------------------- */
  showOverlay(emoji, title, text) {
    document.getElementById("overlay-emoji").textContent = emoji;
    document.getElementById("overlay-title").textContent = title;
    document.getElementById("overlay-text").textContent = text;
    // Brief delay so the final cell animation is visible first.
    setTimeout(() => { this.overlay.hidden = false; }, 350);
  }

  hideOverlay() {
    this.overlay.hidden = true;
  }

  /* ----- Keyboard navigation -------------------------------------------- */
  _handleKey(e) {
    const { rows, cols } = this.game;
    let { r, c } = this.cursor;
    let handled = true;

    switch (e.key) {
      case "ArrowUp":    r = Math.max(0, r - 1); break;
      case "ArrowDown":  r = Math.min(rows - 1, r + 1); break;
      case "ArrowLeft":  c = Math.max(0, c - 1); break;
      case "ArrowRight": c = Math.min(cols - 1, c + 1); break;
      case "Enter":
      case " ":          this._onReveal(r, c); break;
      case "f":
      case "F":          this._onFlag(r, c); break;
      case "n":
      case "N":          this.newGame(); break;
      default: handled = false;
    }

    if (handled) {
      e.preventDefault();
      this._moveCursor(r, c);
    }
  }

  /** Move the visible keyboard cursor highlight. */
  _moveCursor(r, c) {
    const prev = this.cellEls[this.cursor.r]?.[this.cursor.c];
    if (prev) prev.classList.remove("keyboard-focus");
    this.cursor = { r, c };
    const next = this.cellEls[r]?.[c];
    if (next) next.classList.add("keyboard-focus");
  }
}

/* ----- Boot ------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Expose for debugging/tests; harmless in production.
  window.minesweeper = new UI();
});
