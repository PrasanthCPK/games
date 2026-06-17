/* ===========================================================================
   NEON TETRIS — vanilla JS implementation
   ---------------------------------------------------------------------------
   Modules (ES6 classes), no globals leaking beyond the IIFE:
     - Piece          : tetromino definitions, rotation states, SRS kicks
     - Bag            : 7-bag randomizer
     - Board          : grid state, collision, line clearing
     - Renderer       : all canvas drawing (board, ghost, next, hold, particles)
     - SoundManager   : WebAudio sound effects + background music, mute toggle
     - InputHandler   : keyboard + touch controls
     - Game           : orchestration, gravity loop, scoring, levels, state
   =========================================================================== */
(() => {
  'use strict';

  // ---- Constants ----------------------------------------------------------
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;            // logical pixel size of one cell on the main board
  const NEXT_COUNT = 3;       // upcoming pieces shown
  const LOCK_DELAY = 500;     // ms a piece can rest before locking

  // Tetromino colors (distinct, neon-friendly, accessible contrast).
  const COLORS = {
    I: '#00f0ff',
    O: '#ffe138',
    T: '#b14cff',
    S: '#3cff5e',
    Z: '#ff3b54',
    J: '#3b6dff',
    L: '#ff9f1c',
  };

  // Each shape defined by its 4 rotation states (matrix of 0/1).
  // States ordered 0,R,2,L per SRS convention.
  const SHAPES = {
    I: [
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
      [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
    ],
    O: [
      [[1,1],[1,1]],
      [[1,1],[1,1]],
      [[1,1],[1,1]],
      [[1,1],[1,1]],
    ],
    T: [
      [[0,1,0],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,1],[0,1,0]],
      [[0,0,0],[1,1,1],[0,1,0]],
      [[0,1,0],[1,1,0],[0,1,0]],
    ],
    S: [
      [[0,1,1],[1,1,0],[0,0,0]],
      [[0,1,0],[0,1,1],[0,0,1]],
      [[0,0,0],[0,1,1],[1,1,0]],
      [[1,0,0],[1,1,0],[0,1,0]],
    ],
    Z: [
      [[1,1,0],[0,1,1],[0,0,0]],
      [[0,0,1],[0,1,1],[0,1,0]],
      [[0,0,0],[1,1,0],[0,1,1]],
      [[0,1,0],[1,1,0],[1,0,0]],
    ],
    J: [
      [[1,0,0],[1,1,1],[0,0,0]],
      [[0,1,1],[0,1,0],[0,1,0]],
      [[0,0,0],[1,1,1],[0,0,1]],
      [[0,1,0],[0,1,0],[1,1,0]],
    ],
    L: [
      [[0,0,1],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,0],[0,1,1]],
      [[0,0,0],[1,1,1],[1,0,0]],
      [[1,1,0],[0,1,0],[0,1,0]],
    ],
  };

  // SRS wall-kick offset data. For each rotation transition we test a list of
  // (dx, dy) offsets until one fits. JLSTZ share one table; I has its own.
  const KICKS_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };
  const KICKS_I = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  };

  const SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

  // =========================================================================
  // Piece
  // =========================================================================
  class Piece {
    constructor(type) {
      this.type = type;
      this.color = COLORS[type];
      this.rotation = 0;
      this.matrix = SHAPES[type][0];
      // Spawn position: top-center. I & O are 4-wide / 2-wide centered.
      this.x = Math.floor((COLS - this.matrix[0].length) / 2);
      this.y = (type === 'I') ? -1 : 0;
    }

    get size() { return this.matrix.length; }

    // Iterate over filled cells, calling cb(boardX, boardY).
    eachCell(cb, offsetX = this.x, offsetY = this.y, matrix = this.matrix) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c]) cb(offsetX + c, offsetY + r, r, c);
        }
      }
    }

    rotatedMatrix(dir) {
      return SHAPES[this.type][(this.rotation + dir + 4) % 4];
    }

    clone() {
      const p = new Piece(this.type);
      p.rotation = this.rotation;
      p.matrix = this.matrix;
      p.x = this.x;
      p.y = this.y;
      return p;
    }
  }

  // =========================================================================
  // Bag — 7-bag randomizer
  // =========================================================================
  class Bag {
    constructor() { this.queue = []; this._refill(); }

    _refill() {
      const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
      // Fisher–Yates shuffle
      for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
      }
      this.queue.push(...pieces);
    }

    next() {
      if (this.queue.length <= NEXT_COUNT) this._refill();
      return new Piece(this.queue.shift());
    }

    peek(n) {
      while (this.queue.length < n) this._refill();
      return this.queue.slice(0, n).map((t) => new Piece(t));
    }
  }

  // =========================================================================
  // Board — grid + collision + line clears
  // =========================================================================
  class Board {
    constructor() { this.reset(); }

    reset() {
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    // Returns true if matrix at (x,y) collides with walls/floor/blocks.
    collides(matrix, x, y) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const nx = x + c;
          const ny = y + r;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && this.grid[ny][nx]) return true;
        }
      }
      return false;
    }

    // Bake a piece into the grid.
    merge(piece) {
      piece.eachCell((bx, by) => {
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
          this.grid[by][bx] = piece.color;
        }
      });
    }

    // Find indices of full rows.
    fullRows() {
      const rows = [];
      for (let r = 0; r < ROWS; r++) {
        if (this.grid[r].every((cell) => cell)) rows.push(r);
      }
      return rows;
    }

    // Remove given rows and drop everything above down.
    clearRows(rows) {
      const set = new Set(rows);
      const remaining = this.grid.filter((_, r) => !set.has(r));
      const cleared = rows.length;
      for (let i = 0; i < cleared; i++) remaining.unshift(Array(COLS).fill(null));
      this.grid = remaining;
    }
  }

  // =========================================================================
  // Renderer — all canvas drawing
  // =========================================================================
  class Renderer {
    constructor() {
      this.boardCanvas = document.getElementById('board');
      this.bctx = this.boardCanvas.getContext('2d');
      this.nextCanvas = document.getElementById('next');
      this.nctx = this.nextCanvas.getContext('2d');
      this.holdCanvas = document.getElementById('hold');
      this.hctx = this.holdCanvas.getContext('2d');
      this.particles = [];
    }

    clearBoard() {
      const { bctx } = this;
      bctx.fillStyle = 'rgba(0,0,0,0.55)';
      bctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      // grid lines
      bctx.strokeStyle = 'rgba(120,130,220,0.10)';
      bctx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        bctx.beginPath();
        bctx.moveTo(c * CELL + 0.5, 0);
        bctx.lineTo(c * CELL + 0.5, ROWS * CELL);
        bctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        bctx.beginPath();
        bctx.moveTo(0, r * CELL + 0.5);
        bctx.lineTo(COLS * CELL, r * CELL + 0.5);
        bctx.stroke();
      }
    }

    // Draw a single rounded, glossy block.
    drawCell(ctx, x, y, size, color, alpha = 1, ghost = false) {
      const px = x * size;
      const py = y * size;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (ghost) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
      } else {
        // base
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
        ctx.shadowBlur = 0;
        // highlight (top-left)
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(px + 2, py + 2, size - 4, Math.max(2, size * 0.18));
        // shade (bottom)
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(px + 2, py + size - Math.max(2, size * 0.18) - 2, size - 4, Math.max(2, size * 0.18));
      }
      ctx.restore();
    }

    drawBoardGrid(grid) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c]) this.drawCell(this.bctx, c, r, CELL, grid[r][c]);
        }
      }
    }

    drawPiece(piece, ghost = false) {
      piece.eachCell((bx, by) => {
        if (by >= 0) this.drawCell(this.bctx, bx, by, CELL, piece.color, ghost ? 0.85 : 1, ghost);
      });
    }

    // Draw a piece centered inside a mini canvas (next / hold previews).
    drawMini(ctx, canvas, piece, slot = 0) {
      const cell = 24;
      const slotH = 100;
      if (slot === 0) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!piece) return;
      // trim empty rows/cols for centering
      const m = piece.matrix;
      const cells = [];
      for (let r = 0; r < m.length; r++)
        for (let c = 0; c < m[r].length; c++)
          if (m[r][c]) cells.push([r, c]);
      const minR = Math.min(...cells.map((p) => p[0]));
      const maxR = Math.max(...cells.map((p) => p[0]));
      const minC = Math.min(...cells.map((p) => p[1]));
      const maxC = Math.max(...cells.map((p) => p[1]));
      const w = (maxC - minC + 1) * cell;
      const h = (maxR - minR + 1) * cell;
      const offsetX = (canvas.width - w) / 2;
      const offsetY = slot * slotH + (slotH - h) / 2;
      for (const [r, c] of cells) {
        const x = (offsetX + (c - minC) * cell) / cell;
        const y = (offsetY + (r - minR) * cell) / cell;
        this.drawCell(ctx, x, y, cell, piece.color);
      }
    }

    drawNext(pieces) {
      this.nctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
      pieces.forEach((p, i) => this.drawMini(this.nctx, this.nextCanvas, p, i));
    }

    drawHold(piece) {
      this.hctx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
      if (piece) this.drawMini(this.hctx, this.holdCanvas, piece, 0);
    }

    // ---- Particles --------------------------------------------------------
    spawnParticles(rows) {
      for (const r of rows) {
        for (let c = 0; c < COLS; c++) {
          for (let k = 0; k < 3; k++) {
            this.particles.push({
              x: c * CELL + CELL / 2,
              y: r * CELL + CELL / 2,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 6 - 1,
              life: 1,
              color: ['#00f0ff', '#ff2d95', '#ffe138'][k % 3],
              size: Math.random() * 4 + 2,
            });
          }
        }
      }
    }

    updateParticles(dt) {
      const bctx = this.bctx;
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25; // gravity
        p.life -= dt * 1.6;
        bctx.save();
        bctx.globalAlpha = Math.max(0, p.life);
        bctx.fillStyle = p.color;
        bctx.shadowColor = p.color;
        bctx.shadowBlur = 10;
        bctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        bctx.restore();
      }
    }

    hasParticles() { return this.particles.length > 0; }
  }

  // =========================================================================
  // SoundManager — WebAudio synth (no external assets needed)
  // =========================================================================
  class SoundManager {
    constructor() {
      this.muted = false;
      this.ctx = null;
      this.musicNodes = null;
      this.musicTimer = null;
    }

    _ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    _beep(freq, dur, type = 'square', gain = 0.08) {
      if (this.muted) return;
      const ctx = this._ensure();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    }

    rotate() { this._beep(440, 0.08, 'square', 0.06); }
    move()   { this._beep(220, 0.04, 'square', 0.04); }
    drop()   { this._beep(160, 0.12, 'sawtooth', 0.07); }
    hold()   { this._beep(330, 0.08, 'triangle', 0.06); }

    lineClear(n) {
      const base = 520;
      for (let i = 0; i < n; i++) {
        setTimeout(() => this._beep(base + i * 120, 0.12, 'square', 0.08), i * 60);
      }
    }

    gameOver() {
      const notes = [440, 392, 349, 262];
      notes.forEach((f, i) => setTimeout(() => this._beep(f, 0.35, 'sawtooth', 0.08), i * 180));
    }

    // Simple looping retro melody as "background music".
    startMusic() {
      if (this.muted) return;
      const ctx = this._ensure();
      if (!ctx || this.musicTimer) return;
      const melody = [330, 247, 262, 294, 262, 247, 220, 220, 262, 330, 294, 262, 247, 262, 294, 330];
      let i = 0;
      const tempo = 220; // ms per note
      const playNote = () => {
        if (this.muted) return;
        const f = melody[i % melody.length];
        this._beep(f, 0.18, 'triangle', 0.03);
        // bass every other note
        if (i % 2 === 0) this._beep(f / 2, 0.18, 'sine', 0.025);
        i++;
      };
      this.musicTimer = setInterval(playNote, tempo);
    }

    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.muted) this.stopMusic();
      return this.muted;
    }
  }

  // =========================================================================
  // InputHandler — keyboard + touch
  // =========================================================================
  class InputHandler {
    constructor(game) {
      this.game = game;
      this._bindKeyboard();
      this._bindTouch();
    }

    _bindKeyboard() {
      // DAS-ish repeat is handled by the browser's key repeat for movement.
      document.addEventListener('keydown', (e) => {
        const g = this.game;
        // Allow Enter to start/restart from overlays.
        if (e.key === 'Enter') {
          if (g.state === 'ready') { g.start(); e.preventDefault(); return; }
          if (g.state === 'gameover') { g.restart(); e.preventDefault(); return; }
        }
        if (g.state !== 'playing') {
          if ((e.key === 'p' || e.key === 'P') && g.state === 'paused') g.togglePause();
          return;
        }
        switch (e.key) {
          case 'ArrowLeft':  g.move(-1); e.preventDefault(); break;
          case 'ArrowRight': g.move(1);  e.preventDefault(); break;
          case 'ArrowDown':  g.softDrop(); e.preventDefault(); break;
          case 'ArrowUp':    g.rotate(1); e.preventDefault(); break;
          case ' ':          g.hardDrop(); e.preventDefault(); break;
          case 'c': case 'C': g.hold(); break;
          case 'p': case 'P': g.togglePause(); break;
          case 'z': case 'Z': g.rotate(-1); break;
          default: break;
        }
      });
    }

    _bindTouch() {
      const map = {
        left: () => this.game.move(-1),
        right: () => this.game.move(1),
        rotate: () => this.game.rotate(1),
        soft: () => this.game.softDrop(),
        hard: () => this.game.hardDrop(),
        hold: () => this.game.hold(),
        pause: () => this.game.togglePause(),
      };
      document.querySelectorAll('.touch-btn').forEach((btn) => {
        const action = btn.dataset.action;
        const fire = (e) => {
          e.preventDefault();
          if (this.game.state === 'ready' && action !== 'pause') this.game.start();
          if (map[action]) map[action]();
        };
        btn.addEventListener('touchstart', fire, { passive: false });
        btn.addEventListener('click', fire);
      });
    }
  }

  // =========================================================================
  // Game — orchestration
  // =========================================================================
  class Game {
    constructor() {
      this.board = new Board();
      this.renderer = new Renderer();
      this.sound = new SoundManager();
      this.bag = new Bag();

      this.state = 'ready'; // ready | playing | paused | gameover
      this.current = null;
      this.holdPiece = null;
      this.canHold = true;

      this.score = 0;
      this.level = 1;
      this.lines = 0;
      this.highScore = Number(localStorage.getItem('neon-tetris-highscore') || 0);

      this.dropCounter = 0;
      this.dropInterval = this._intervalForLevel(1);
      this.lockTimer = 0;
      this.lockResetCount = 0;
      this.lastTime = 0;

      this._cacheDom();
      this._bindButtons();
      this.input = new InputHandler(this);

      this._updateStats();
      this.renderer.clearBoard();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    _cacheDom() {
      this.el = {
        score: document.getElementById('score'),
        high: document.getElementById('highscore'),
        level: document.getElementById('level'),
        lines: document.getElementById('lines'),
        finalScore: document.getElementById('final-score'),
        newHigh: document.getElementById('new-highscore'),
        overlayStart: document.getElementById('overlay-start'),
        overlayPause: document.getElementById('overlay-pause'),
        overlayGameover: document.getElementById('overlay-gameover'),
        boardWrap: document.querySelector('.board-wrap'),
        mute: document.getElementById('btn-mute'),
        pause: document.getElementById('btn-pause'),
      };
    }

    _bindButtons() {
      document.getElementById('btn-start').addEventListener('click', () => this.start());
      document.getElementById('btn-restart').addEventListener('click', () => this.restart());
      document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
      this.el.pause.addEventListener('click', () => this.togglePause());
      this.el.mute.addEventListener('click', () => {
        const muted = this.sound.toggleMute();
        this.el.mute.textContent = muted ? '🔇 MUTED' : '🔊 SOUND';
        this.el.mute.setAttribute('aria-pressed', String(muted));
        if (!muted && this.state === 'playing') this.sound.startMusic();
      });
    }

    // Gravity speed (ms) per level — classic-style curve, clamped for smoothness.
    _intervalForLevel(level) {
      return Math.max(60, 1000 * Math.pow(0.85, level - 1));
    }

    // ---- State transitions ------------------------------------------------
    start() {
      if (this.state === 'playing') return;
      this._resetState();
      this.state = 'playing';
      this._hideOverlays();
      this._spawn();
      this.sound.startMusic();
      this.lastTime = performance.now();
    }

    restart() {
      this._resetState();
      this.start();
    }

    _resetState() {
      this.board.reset();
      this.bag = new Bag();
      this.score = 0;
      this.level = 1;
      this.lines = 0;
      this.dropInterval = this._intervalForLevel(1);
      this.dropCounter = 0;
      this.lockTimer = 0;
      this.holdPiece = null;
      this.canHold = true;
      this.renderer.particles = [];
      this._updateStats();
      this.renderer.drawHold(null);
    }

    togglePause() {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.el.overlayPause.classList.remove('hidden');
        this.sound.stopMusic();
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.el.overlayPause.classList.add('hidden');
        this.sound.startMusic();
        this.lastTime = performance.now();
      }
    }

    gameOver() {
      this.state = 'gameover';
      this.sound.stopMusic();
      this.sound.gameOver();
      let isNew = false;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('neon-tetris-highscore', String(this.score));
        isNew = true;
      }
      this.el.finalScore.textContent = this.score;
      this.el.newHigh.classList.toggle('hidden', !isNew);
      this.el.overlayGameover.classList.remove('hidden');
      this._updateStats();
    }

    _hideOverlays() {
      this.el.overlayStart.classList.add('hidden');
      this.el.overlayPause.classList.add('hidden');
      this.el.overlayGameover.classList.add('hidden');
    }

    // ---- Piece lifecycle --------------------------------------------------
    _spawn(piece) {
      this.current = piece || this.bag.next();
      this.canHold = true;
      this.lockTimer = 0;
      this.lockResetCount = 0;
      this._drawNext();
      // Game over check: collision right at spawn.
      if (this.board.collides(this.current.matrix, this.current.x, this.current.y)) {
        this.gameOver();
      }
    }

    _drawNext() {
      this.renderer.drawNext(this.bag.peek(NEXT_COUNT));
    }

    // ---- Player actions ---------------------------------------------------
    move(dir) {
      if (this.state !== 'playing') return;
      const p = this.current;
      if (!this.board.collides(p.matrix, p.x + dir, p.y)) {
        p.x += dir;
        this.sound.move();
        this._touchedGround() && this._resetLock();
      }
    }

    softDrop() {
      if (this.state !== 'playing') return;
      const p = this.current;
      if (!this.board.collides(p.matrix, p.x, p.y + 1)) {
        p.y += 1;
        this.score += 1; // soft drop bonus
        this.dropCounter = 0;
        this._updateStats();
      }
    }

    hardDrop() {
      if (this.state !== 'playing') return;
      const p = this.current;
      let dist = 0;
      while (!this.board.collides(p.matrix, p.x, p.y + 1)) { p.y += 1; dist++; }
      this.score += dist * 2; // hard drop bonus
      this.sound.drop();
      this._lock();
    }

    rotate(dir) {
      if (this.state !== 'playing') return;
      const p = this.current;
      if (p.type === 'O') return;
      const from = p.rotation;
      const to = (from + dir + 4) % 4;
      const newMatrix = SHAPES[p.type][to];
      const table = (p.type === 'I') ? KICKS_I : KICKS_JLSTZ;
      const kicks = table[`${from}>${to}`] || [[0, 0]];
      for (const [dx, dy] of kicks) {
        // Note: SRS y-offsets are "up positive"; our grid is "down positive".
        const nx = p.x + dx;
        const ny = p.y - dy;
        if (!this.board.collides(newMatrix, nx, ny)) {
          p.matrix = newMatrix;
          p.rotation = to;
          p.x = nx;
          p.y = ny;
          this.sound.rotate();
          this._touchedGround() && this._resetLock();
          return;
        }
      }
    }

    hold() {
      if (this.state !== 'playing' || !this.canHold) return;
      const cur = this.current;
      const stash = new Piece(cur.type); // reset rotation/position
      if (this.holdPiece) {
        const swap = this.holdPiece;
        this.holdPiece = stash;
        this._spawn(swap);
      } else {
        this.holdPiece = stash;
        this._spawn();
      }
      this.canHold = false;
      this.renderer.drawHold(this.holdPiece);
      this.sound.hold();
    }

    // ---- Locking & line clears -------------------------------------------
    _touchedGround() {
      const p = this.current;
      return this.board.collides(p.matrix, p.x, p.y + 1);
    }

    _resetLock() {
      // Allow a limited number of lock-delay resets (move/rotate on ground).
      if (this.lockResetCount < 15) {
        this.lockTimer = 0;
        this.lockResetCount++;
      }
    }

    _lock() {
      this.board.merge(this.current);
      const rows = this.board.fullRows();
      if (rows.length) {
        this._handleClears(rows);
      }
      this._spawn();
    }

    _handleClears(rows) {
      this.renderer.spawnParticles(rows);
      this.board.clearRows(rows);
      this.lines += rows.length;
      this.score += SCORES[rows.length] * this.level;
      this.sound.lineClear(rows.length);

      // shake feedback
      this.el.boardWrap.classList.add('shake');
      setTimeout(() => this.el.boardWrap.classList.remove('shake'), 200);

      // Level up every 10 lines.
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel !== this.level) {
        this.level = newLevel;
        this.dropInterval = this._intervalForLevel(this.level);
      }
      this._updateStats();
    }

    _ghostY() {
      const p = this.current;
      let gy = p.y;
      while (!this.board.collides(p.matrix, p.x, gy + 1)) gy++;
      return gy;
    }

    // ---- Stats / HUD ------------------------------------------------------
    _updateStats() {
      this.el.score.textContent = this.score;
      this.el.high.textContent = Math.max(this.highScore, this.score);
      this.el.level.textContent = this.level;
      this.el.lines.textContent = this.lines;
    }

    // ---- Main loop --------------------------------------------------------
    _loop(time) {
      const dt = (time - this.lastTime) / 1000;
      this.lastTime = time;

      if (this.state === 'playing') {
        this.dropCounter += dt * 1000;
        if (this.dropCounter >= this.dropInterval) {
          this.dropCounter = 0;
          const p = this.current;
          if (!this.board.collides(p.matrix, p.x, p.y + 1)) {
            p.y += 1;
            this.lockTimer = 0;
          }
        }
        // Lock delay handling once resting on a surface.
        if (this._touchedGround()) {
          this.lockTimer += dt * 1000;
          if (this.lockTimer >= LOCK_DELAY) this._lock();
        } else {
          this.lockTimer = 0;
        }
      }

      this._render(dt);
      requestAnimationFrame(this._loop);
    }

    _render(dt) {
      const r = this.renderer;
      r.clearBoard();
      r.drawBoardGrid(this.board.grid);

      if (this.current && (this.state === 'playing' || this.state === 'paused')) {
        // Ghost piece
        const ghost = this.current.clone();
        ghost.y = this._ghostY();
        r.drawPiece(ghost, true);
        // Active piece
        r.drawPiece(this.current, false);
      }

      if (r.hasParticles()) r.updateParticles(dt);
    }
  }

  // ---- Boot ---------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    // Single Game instance; no other globals.
    const game = new Game();
    // Resume audio on first user gesture (browser autoplay policies).
    const resume = () => { game.sound._ensure(); window.removeEventListener('pointerdown', resume); };
    window.addEventListener('pointerdown', resume);
  });
})();
