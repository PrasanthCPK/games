/* ============================================================
   NEON BREAKOUT — game.js
   A self-contained HTML5 Canvas Breakout game.
   Architecture: Game, Paddle, Ball, Brick, PowerUp,
   LevelManager, ParticleSystem, AudioManager.
   ============================================================ */
"use strict";

/* ------------------------------------------------------------
   Constants & helpers
   ------------------------------------------------------------ */
const VW = 800;            // virtual design width
const VH = 600;            // virtual design height
const WALL = 12;           // wall thickness
const BRICK_TOP = 70;      // y where brick field starts
const BRICK_COLS = 11;
const BRICK_GAP = 4;
const BRICK_H = 24;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;

/* Brick palette by hit-point / type */
const BRICK_COLORS = {
  1: "#00f0ff",
  2: "#39ff14",
  3: "#ffe600",
  4: "#ff2d95",
  metal: "#8a93b0",
  explosive: "#ff7b00",
  bonus: "#b026ff",
};

/* ------------------------------------------------------------
   AudioManager — synthesized arcade sounds via WebAudio
   ------------------------------------------------------------ */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.6;
  }
  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }
  resume() { this._ensure(); if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }

  _tone(freq, dur, type = "square", vol = 0.3, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur);
  }

  bounce()      { this._tone(420, 0.06, "square", 0.18, 520); }
  paddle()      { this._tone(300, 0.07, "triangle", 0.22, 360); }
  brick()       { this._tone(680, 0.07, "square", 0.2, 540); }
  strongHit()   { this._tone(240, 0.06, "sawtooth", 0.18, 200); }
  metal()       { this._tone(180, 0.05, "square", 0.12, 160); }
  explode()     { this._tone(120, 0.3, "sawtooth", 0.3, 40); }
  powerup()     { this._tone(520, 0.12, "sine", 0.25, 880); }
  laser()       { this._tone(900, 0.05, "square", 0.12, 300); }
  life()        { this._tone(220, 0.4, "sawtooth", 0.3, 90); }
  levelClear()  { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, "triangle", 0.25), i * 90)); }
  gameOver()    { [392, 311, 261, 196].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, "sawtooth", 0.25), i * 160)); }
}

/* ------------------------------------------------------------
   ParticleSystem
   ------------------------------------------------------------ */
class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += 360 * dt;          // gravity
    this.vx *= 0.98;
    this.life -= dt;
  }
}
class ParticleSystem {
  constructor() { this.parts = []; }
  burst(x, y, color, count = 14, speed = 220) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      this.parts.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), color, rand(2, 4.5)));
    }
  }
  spark(x, y, color) {
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU);
      this.parts.push(new Particle(x, y, Math.cos(a) * rand(40, 120), Math.sin(a) * rand(40, 120), rand(0.15, 0.35), color, rand(1.5, 3)));
    }
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.update(dt);
      if (p.life <= 0) this.parts.splice(i, 1);
    }
  }
  draw(ctx) {
    for (const p of this.parts) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

/* ------------------------------------------------------------
   Paddle
   ------------------------------------------------------------ */
class Paddle {
  constructor(game) {
    this.game = game;
    this.baseW = 110;
    this.h = 16;
    this.w = this.baseW;
    this.x = VW / 2 - this.w / 2;
    this.y = VH - 46;
    this.speed = 620;
    this.targetX = null;       // for touch / drag
    this.sticky = false;
    this.laser = false;
    this.laserCd = 0;
  }
  get cx() { return this.x + this.w / 2; }

  setWidth(w) {
    const c = this.cx;
    this.w = clamp(w, 50, 260);
    this.x = clamp(c - this.w / 2, WALL, VW - WALL - this.w);
  }
  reset() {
    this.setWidth(this.baseW);
    this.x = VW / 2 - this.w / 2;
    this.sticky = false;
    this.laser = false;
    this.targetX = null;
  }
  update(dt, input) {
    if (this.targetX !== null) {
      // touch / mouse drag — move toward target
      const diff = this.targetX - this.cx;
      this.x += clamp(diff, -this.speed * dt * 1.6, this.speed * dt * 1.6);
    } else {
      if (input.left)  this.x -= this.speed * dt;
      if (input.right) this.x += this.speed * dt;
    }
    this.x = clamp(this.x, WALL, VW - WALL - this.w);
    if (this.laserCd > 0) this.laserCd -= dt;
  }
  draw(ctx) {
    const r = this.h / 2;
    const grad = ctx.createLinearGradient(this.x, 0, this.x + this.w, 0);
    if (this.laser) { grad.addColorStop(0, "#ff2d95"); grad.addColorStop(1, "#ff7b00"); }
    else if (this.sticky) { grad.addColorStop(0, "#39ff14"); grad.addColorStop(1, "#00f0ff"); }
    else { grad.addColorStop(0, "#00f0ff"); grad.addColorStop(1, "#b026ff"); }
    ctx.fillStyle = grad;
    ctx.shadowColor = this.laser ? "#ff2d95" : "#00f0ff";
    ctx.shadowBlur = 18;
    roundRect(ctx, this.x, this.y, this.w, this.h, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    // laser emitters
    if (this.laser) {
      ctx.fillStyle = "#ffe600";
      ctx.fillRect(this.x + 6, this.y - 4, 4, 4);
      ctx.fillRect(this.x + this.w - 10, this.y - 4, 4, 4);
    }
  }
}

/* ------------------------------------------------------------
   Ball
   ------------------------------------------------------------ */
class Ball {
  constructor(game, x, y) {
    this.game = game;
    this.r = 8;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.stuck = true;          // resting on paddle before launch
    this.stickOffset = 0;
    this.trail = [];
    this.baseSpeed = 340;
    this.speed = this.baseSpeed;
  }
  launch() {
    if (!this.stuck) return;
    this.stuck = false;
    const angle = rand(-Math.PI * 0.35, -Math.PI * 0.65); // upward
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
  }
  setSpeed(s) {
    this.speed = clamp(s, 200, 820);
    const cur = Math.hypot(this.vx, this.vy) || 1;
    if (!this.stuck) { this.vx = this.vx / cur * this.speed; this.vy = this.vy / cur * this.speed; }
  }
  update(dt, paddle) {
    // trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 12) this.trail.shift();

    if (this.stuck) {
      this.x = paddle.cx + this.stickOffset;
      this.y = paddle.y - this.r - 1;
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // anti-stall: ensure minimum vertical movement
    const minVy = this.speed * 0.22;
    if (Math.abs(this.vy) < minVy) {
      this.vy = (this.vy >= 0 ? 1 : -1) * minVy;
      this.renormalize();
    }
  }
  renormalize() {
    const cur = Math.hypot(this.vx, this.vy) || 1;
    this.vx = this.vx / cur * this.speed;
    this.vy = this.vy / cur * this.speed;
  }
  draw(ctx) {
    // trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const a = (i / this.trail.length) * 0.5;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#00f0ff";
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.r * (i / this.trail.length), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/* ------------------------------------------------------------
   Laser projectile
   ------------------------------------------------------------ */
class Laser {
  constructor(x, y) { this.x = x; this.y = y; this.vy = -560; this.dead = false; this.w = 3; this.h = 14; }
  update(dt) { this.y += this.vy * dt; if (this.y < -20) this.dead = true; }
  draw(ctx) {
    ctx.fillStyle = "#ffe600";
    ctx.shadowColor = "#ff7b00";
    ctx.shadowBlur = 10;
    ctx.fillRect(this.x - this.w / 2, this.y, this.w, this.h);
    ctx.shadowBlur = 0;
  }
}

/* ------------------------------------------------------------
   Brick
   types: standard, strong, metal, explosive, bonus
   ------------------------------------------------------------ */
class Brick {
  constructor(x, y, w, h, type, hp) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.type = type;
    this.maxHp = hp;
    this.hp = hp;
    this.dead = false;
    this.flash = 0;
    // movement (for moving formations)
    this.moveAmp = 0;
    this.movePhase = rand(0, TAU);
    this.homeX = x;
  }
  get destructible() { return this.type !== "metal"; }

  hit(dmg = 1) {
    this.flash = 0.12;
    if (this.type === "metal") return false;
    this.hp -= dmg;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }
  color() {
    if (this.type === "metal") return BRICK_COLORS.metal;
    if (this.type === "explosive") return BRICK_COLORS.explosive;
    if (this.type === "bonus") return BRICK_COLORS.bonus;
    return BRICK_COLORS[clamp(this.hp, 1, 4)] || BRICK_COLORS[1];
  }
  draw(ctx) {
    const c = this.color();
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = this.flash > 0 ? 26 : 10;
    roundRect(ctx, this.x, this.y, this.w, this.h, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // top highlight
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    roundRect(ctx, this.x, this.y, this.w, this.h * 0.4, 4);
    ctx.fill();

    // damage cracks for strong bricks
    if (this.type === "strong" && this.hp < this.maxHp) {
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      const dmg = this.maxHp - this.hp;
      ctx.beginPath();
      for (let i = 0; i < dmg; i++) {
        const px = this.x + this.w * (0.25 + i * 0.25);
        ctx.moveTo(px, this.y + 3);
        ctx.lineTo(px - 5, this.y + this.h - 3);
      }
      ctx.stroke();
    }
    // icon overlays
    if (this.type === "explosive") { this._icon(ctx, "✸"); }
    else if (this.type === "bonus") { this._icon(ctx, "★"); }
    else if (this.type === "metal") {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(this.x + 4, this.y + this.h / 2 - 1, this.w - 8, 2);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 3})`;
      roundRect(ctx, this.x, this.y, this.w, this.h, 4);
      ctx.fill();
    }
  }
  _icon(ctx, ch) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, this.x + this.w / 2, this.y + this.h / 2 + 1);
  }
}

/* ------------------------------------------------------------
   PowerUp
   ------------------------------------------------------------ */
const POWERUP_DEFS = {
  multiball:   { label: "MULTI", color: "#00f0ff", icon: "◉◉", duration: 0 },
  expand:      { label: "WIDE",  color: "#39ff14", icon: "↔",  duration: 0 },
  shrink:      { label: "SHRINK",color: "#ff2d95", icon: "><",  duration: 0, bad: true },
  laser:       { label: "LASER", color: "#ff7b00", icon: "≡",  duration: 12 },
  slow:        { label: "SLOW",  color: "#b026ff", icon: "«",  duration: 8 },
  fast:        { label: "FAST",  color: "#ffe600", icon: "»",  duration: 8, bad: true },
  sticky:      { label: "STICKY",color: "#39ff14", icon: "⊙",  duration: 12 },
  life:        { label: "1UP",   color: "#ff2d95", icon: "♥",  duration: 0 },
  shield:      { label: "SHIELD",color: "#00f0ff", icon: "▭",  duration: 0 },
  multiplier:  { label: "x2",    color: "#ffe600", icon: "×2", duration: 14 },
};
const GOOD_POWERUPS = ["multiball", "expand", "laser", "slow", "sticky", "life", "shield", "multiplier"];
const ALL_POWERUPS = Object.keys(POWERUP_DEFS);

class PowerUp {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind;
    this.w = 26; this.h = 26;
    this.vy = 130;
    this.dead = false;
    this.spin = 0;
  }
  update(dt) { this.y += this.vy * dt; this.spin += dt * 3; if (this.y > VH + 40) this.dead = true; }
  draw(ctx) {
    const d = POWERUP_DEFS[this.kind];
    ctx.save();
    ctx.translate(this.x, this.y);
    const s = 1 + Math.sin(this.spin) * 0.08;
    ctx.scale(s, s);
    ctx.fillStyle = d.color;
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 16;
    roundRect(ctx, -this.w / 2, -this.h / 2, this.w, this.h, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#02030a";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(d.icon, 0, 1);
    ctx.restore();
  }
}

/* ------------------------------------------------------------
   LevelManager — builds brick layouts per level
   ------------------------------------------------------------ */
class LevelManager {
  constructor(game) {
    this.game = game;
    this.layouts = ["classic", "pyramid", "diamond", "maze", "moving", "fortress", "random"];
  }
  brickWidth() { return (VW - WALL * 2 - BRICK_GAP * (BRICK_COLS - 1) - BRICK_GAP * 2) / BRICK_COLS; }
  cellX(col) { return WALL + BRICK_GAP + col * (this.brickWidth() + BRICK_GAP); }
  cellY(row) { return BRICK_TOP + row * (BRICK_H + BRICK_GAP); }

  build(level) {
    const bricks = [];
    const bw = this.brickWidth();
    const rows = Math.min(5 + Math.floor(level / 2), 9);
    const layoutName = this.layouts[(level - 1) % this.layouts.length];
    const baseHp = clamp(1 + Math.floor((level - 1) / 3), 1, 4);

    const add = (col, row, type, hp) => {
      if (col < 0 || col >= BRICK_COLS) return null;
      const b = new Brick(this.cellX(col), this.cellY(row), bw, BRICK_H, type, hp);
      bricks.push(b);
      return b;
    };
    const pick = (col, row) => {
      const roll = Math.random();
      let type = "standard", hp = baseHp;
      if (roll < 0.05 + level * 0.005) { type = "explosive"; hp = 1; }
      else if (roll < 0.14) { type = "bonus"; hp = 1; }
      else if (roll < 0.2 + level * 0.01 && level > 1) { type = "metal"; hp = Infinity; }
      else if (baseHp >= 2 && Math.random() < 0.4) { type = "strong"; hp = baseHp; }
      return add(col, row, type, hp);
    };

    switch (layoutName) {
      case "classic":
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < BRICK_COLS; c++) pick(c, r);
        break;

      case "pyramid":
        for (let r = 0; r < rows; r++) {
          const span = r + 1;
          const start = Math.floor((BRICK_COLS - span) / 2);
          for (let c = start; c < start + span; c++) pick(c, r);
        }
        break;

      case "diamond": {
        const mid = Math.floor(rows / 2);
        for (let r = 0; r < rows; r++) {
          const span = (r <= mid ? r : rows - 1 - r) * 2 + 1;
          const start = Math.floor((BRICK_COLS - span) / 2);
          for (let c = start; c < start + span; c++) pick(c, r);
        }
        break;
      }

      case "maze":
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < BRICK_COLS; c++) {
            if ((r % 2 === 0) || (c % 2 === 0)) pick(c, r);
            else if (Math.random() < 0.3) add(c, r, "metal", Infinity);
          }
        break;

      case "moving": {
        for (let r = 0; r < rows; r++)
          for (let c = 1; c < BRICK_COLS - 1; c++) {
            const b = pick(c, r);
            if (b) { b.moveAmp = 26 + level * 2; b.movePhase = r * 0.6; }
          }
        break;
      }

      case "fortress": {
        // outer ring metal, inner destructible — boss-ish
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < BRICK_COLS; c++) {
            const edge = r === 0 || c === 0 || c === BRICK_COLS - 1;
            if (edge && Math.random() < 0.7) add(c, r, "metal", Infinity);
            else pick(c, r);
          }
        break;
      }

      case "random":
      default:
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < BRICK_COLS; c++)
            if (Math.random() < 0.78) pick(c, r);
        break;
    }
    return bricks;
  }
}

/* ------------------------------------------------------------
   Game — orchestrates everything
   ------------------------------------------------------------ */
class Game {
  constructor() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.audio = new AudioManager();
    this.particles = new ParticleSystem();
    this.levels = new LevelManager(this);

    this.scale = 1;
    this.state = "start"; // start | playing | paused | levelclear | gameover
    this.input = { left: false, right: false };

    this.score = 0;
    this.highScore = parseInt(localStorage.getItem("breakout_high") || "0", 10);
    this.level = 1;
    this.lives = 3;
    this.combo = 0;
    this.comboTimer = 0;

    this.balls = [];
    this.bricks = [];
    this.powerups = [];
    this.lasers = [];
    this.active = {};      // active timed powerups -> remaining seconds
    this.shield = false;
    this.scoreMultiplier = 1;

    this.shake = 0;
    this.shakeEnabled = true;
    this.bgPhase = 0;
    this.lastT = 0;

    this.paddle = new Paddle(this);

    this._cacheDom();
    this._bindUI();
    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());

    this.ui.highScore.textContent = this.highScore;
    requestAnimationFrame((t) => this._loop(t));
  }

  /* ---------- DOM ---------- */
  _cacheDom() {
    const $ = (id) => document.getElementById(id);
    this.ui = {
      app: $("app"),
      score: $("score"), highScore: $("highScore"), level: $("level"),
      lives: $("lives"), combo: $("combo"), powerups: $("powerups"),
      startScreen: $("startScreen"), pauseScreen: $("pauseScreen"),
      levelScreen: $("levelScreen"), overScreen: $("overScreen"),
      levelScoreVal: $("levelScoreVal"), livesBonusVal: $("livesBonusVal"),
      levelTotalVal: $("levelTotalVal"), finalScoreVal: $("finalScoreVal"),
      finalHighVal: $("finalHighVal"), newRecord: $("newRecord"),
      touchControls: $("touchControls"),
    };
  }
  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $("playBtn").onclick = () => { this.audio.resume(); this.startGame(); };
    $("playAgainBtn").onclick = () => { this.audio.resume(); this.startGame(); };
    $("nextLevelBtn").onclick = () => this.nextLevel();
    $("resumeBtn").onclick = () => this.togglePause();
    $("pauseBtn").onclick = () => this.togglePause();
    $("restartBtn").onclick = () => this.startGame();
    $("pauseRestartBtn").onclick = () => this.startGame();
    $("muteBtn").onclick = () => this.toggleMute();

    const vol = $("volumeSlider");
    vol.oninput = () => this.audio.setVolume(vol.value / 100);
    this.audio.setVolume(vol.value / 100);

    const crtMain = $("crtToggle"), crtPause = $("crtTogglePause");
    const setCrt = (on) => { this.ui.app.classList.toggle("no-crt", !on); crtMain.checked = on; crtPause.checked = on; };
    crtMain.onchange = () => setCrt(crtMain.checked);
    crtPause.onchange = () => setCrt(crtPause.checked);

    const shake = $("shakeToggle");
    shake.onchange = () => { this.shakeEnabled = shake.checked; };
  }

  /* ---------- Input ---------- */
  _bindInput() {
    window.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowLeft": case "a": case "A": this.input.left = true; break;
        case "ArrowRight": case "d": case "D": this.input.right = true; break;
        case " ": case "Spacebar":
          e.preventDefault();
          this.onAction();
          break;
        case "p": case "P": if (this.state === "playing" || this.state === "paused") this.togglePause(); break;
        case "m": case "M": this.toggleMute(); break;
        case "Enter":
          if (this.state === "start" || this.state === "gameover") this.startGame();
          else if (this.state === "levelclear") this.nextLevel();
          break;
      }
    });
    window.addEventListener("keyup", (e) => {
      switch (e.key) {
        case "ArrowLeft": case "a": case "A": this.input.left = false; break;
        case "ArrowRight": case "d": case "D": this.input.right = false; break;
      }
    });

    // Pointer / touch drag on canvas
    const toVirtual = (clientX) => {
      const rect = this.canvas.getBoundingClientRect();
      return (clientX - rect.left) / rect.width * VW;
    };
    const onMove = (clientX) => { if (this.state === "playing") this.paddle.targetX = clamp(toVirtual(clientX), 0, VW); };
    const onUp = () => { this.paddle.targetX = null; };

    this.canvas.addEventListener("mousedown", (e) => { onMove(e.clientX); });
    this.canvas.addEventListener("mousemove", (e) => { if (e.buttons) onMove(e.clientX); });
    window.addEventListener("mouseup", onUp);

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.audio.resume();
      onMove(e.touches[0].clientX);
      this.onAction();
    }, { passive: false });
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      onMove(e.touches[0].clientX);
    }, { passive: false });
    this.canvas.addEventListener("touchend", (e) => { e.preventDefault(); onUp(); }, { passive: false });

    // Virtual buttons
    const hold = (el, on, off) => {
      el.addEventListener("touchstart", (e) => { e.preventDefault(); on(); }, { passive: false });
      el.addEventListener("touchend", (e) => { e.preventDefault(); off(); }, { passive: false });
      el.addEventListener("mousedown", on);
      el.addEventListener("mouseup", off);
      el.addEventListener("mouseleave", off);
    };
    hold(document.getElementById("touchLeft"), () => this.input.left = true, () => this.input.left = false);
    hold(document.getElementById("touchRight"), () => this.input.right = true, () => this.input.right = false);
    document.getElementById("touchLaunch").addEventListener("touchstart", (e) => { e.preventDefault(); this.onAction(); }, { passive: false });

    // show touch controls on touch devices
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      this.ui.touchControls.classList.add("active");
      this.ui.touchControls.setAttribute("aria-hidden", "false");
    }
  }

  onAction() {
    if (this.state === "start") { this.startGame(); return; }
    if (this.state === "gameover") { this.startGame(); return; }
    if (this.state === "levelclear") { this.nextLevel(); return; }
    if (this.state !== "playing") return;
    // launch stuck balls
    let launched = false;
    for (const b of this.balls) if (b.stuck) { b.launch(); launched = true; }
    // fire lasers
    if (!launched && this.paddle.laser && this.paddle.laserCd <= 0) {
      this.lasers.push(new Laser(this.paddle.x + 8, this.paddle.y));
      this.lasers.push(new Laser(this.paddle.x + this.paddle.w - 8, this.paddle.y));
      this.paddle.laserCd = 0.28;
      this.audio.laser();
    }
  }

  /* ---------- Resize ---------- */
  _resize() {
    const stage = this.canvas.parentElement;
    const availW = stage.clientWidth;
    const availH = stage.clientHeight;
    const scale = Math.min(availW / VW, availH / VH);
    const cssW = Math.floor(VW * scale);
    const cssH = Math.floor(VH * scale);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.canvas.width = Math.floor(VW * dpr);
    this.canvas.height = Math.floor(VH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = scale;
  }

  /* ---------- State transitions ---------- */
  showScreen(name) {
    for (const s of ["startScreen", "pauseScreen", "levelScreen", "overScreen"]) {
      this.ui[s].classList.toggle("screen--visible", false);
    }
    if (name) this.ui[name].classList.add("screen--visible");
  }

  startGame() {
    this.score = 0; this.level = 1; this.lives = 3;
    this.combo = 0; this.scoreMultiplier = 1;
    this.state = "playing";
    this.showScreen(null);
    this.loadLevel();
  }

  loadLevel() {
    this.bricks = this.levels.build(this.level);
    this.powerups = [];
    this.lasers = [];
    this.active = {};
    this.shield = false;
    this.scoreMultiplier = 1;
    this.paddle.reset();
    this.resetBall();
    this._levelStartScore = this.score;
    // ball speed ramps with level
    const sp = 320 + (this.level - 1) * 22;
    this.balls.forEach((b) => { b.baseSpeed = sp; b.setSpeed(sp); });
    this._syncHud();
  }

  resetBall() {
    const b = new Ball(this, this.paddle.cx, this.paddle.y - 12);
    b.baseSpeed = 320 + (this.level - 1) * 22;
    b.setSpeed(b.baseSpeed);
    b.stuck = true;
    this.balls = [b];
  }

  nextLevel() {
    this.level++;
    this.state = "playing";
    this.showScreen(null);
    this.loadLevel();
  }

  levelComplete() {
    this.state = "levelclear";
    const levelScore = this.score - (this._levelStartScore || 0);
    const livesBonus = this.lives * 250 * this.level;
    this.score += livesBonus;
    this.audio.levelClear();
    this.ui.levelScoreVal.textContent = levelScore;
    this.ui.livesBonusVal.textContent = livesBonus;
    this.ui.levelTotalVal.textContent = this.score;
    this._syncHud();
    this._saveHigh();
    this.showScreen("levelScreen");
  }

  loseLife() {
    if (this.shield) {
      this.shield = false;
      // bounce a fresh ball up off shield
      this.resetBall();
      this.balls[0].stuck = false;
      this.balls[0].vy = -Math.abs(this.balls[0].speed * 0.7);
      this.balls[0].vx = rand(-1, 1) * this.balls[0].speed * 0.5;
      this.balls[0].renormalize();
      this.balls[0].y = VH - 60;
      this._syncHud();
      return;
    }
    this.lives--;
    this.combo = 0;
    this.audio.life();
    this.triggerShake(10);
    this._syncHud();
    if (this.lives <= 0) { this.gameOver(); return; }
    this.resetBall();
  }

  gameOver() {
    this.state = "gameover";
    this.audio.gameOver();
    const record = this.score > this.highScore;
    this._saveHigh();
    this.ui.finalScoreVal.textContent = this.score;
    this.ui.finalHighVal.textContent = this.highScore;
    this.ui.newRecord.classList.toggle("hidden", !record);
    this.showScreen("overScreen");
  }

  togglePause() {
    if (this.state === "playing") { this.state = "paused"; this.showScreen("pauseScreen"); }
    else if (this.state === "paused") { this.state = "playing"; this.showScreen(null); this.lastT = performance.now(); }
  }
  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    document.getElementById("muteBtn").textContent = this.audio.muted ? "🔇" : "🔊";
  }

  triggerShake(amt) { if (this.shakeEnabled) this.shake = Math.max(this.shake, amt); }

  /* ---------- Scoring ---------- */
  addScore(base) {
    this.combo++;
    this.comboTimer = 2.2;
    const comboBonus = 1 + Math.min(this.combo, 20) * 0.1;
    const gained = Math.round(base * comboBonus * this.scoreMultiplier);
    this.score += gained;
    if (this.score > this.highScore) this.highScore = this.score;
  }

  _saveHigh() {
    if (this.score > this.highScore) this.highScore = this.score;
    localStorage.setItem("breakout_high", String(this.highScore));
  }

  /* ---------- Power-ups ---------- */
  maybeDropPowerup(x, y, force = false) {
    const chance = force ? 1 : 0.16;
    if (Math.random() > chance) return;
    const kind = force ? choice(GOOD_POWERUPS) : choice(ALL_POWERUPS);
    this.powerups.push(new PowerUp(x, y, kind));
  }

  applyPowerup(kind) {
    const d = POWERUP_DEFS[kind];
    this.audio.powerup();
    switch (kind) {
      case "multiball": this._spawnMultiball(); break;
      case "expand": this.paddle.setWidth(this.paddle.w + 40); break;
      case "shrink": this.paddle.setWidth(this.paddle.w - 35); break;
      case "laser": this.paddle.laser = true; this.active.laser = d.duration; break;
      case "sticky": this.paddle.sticky = true; this.active.sticky = d.duration; break;
      case "slow": this.balls.forEach((b) => b.setSpeed(b.speed * 0.7)); this.active.slow = d.duration; break;
      case "fast": this.balls.forEach((b) => b.setSpeed(b.speed * 1.3)); this.active.fast = d.duration; break;
      case "life": this.lives++; break;
      case "shield": this.shield = true; break;
      case "multiplier": this.scoreMultiplier = 2; this.active.multiplier = d.duration; break;
    }
    this._syncHud();
  }

  _spawnMultiball() {
    const src = this.balls.filter((b) => !b.stuck);
    const seeds = src.length ? src : this.balls;
    const extra = [];
    for (const b of seeds) {
      if (this.balls.length + extra.length >= 8) break;
      for (let i = 0; i < 2; i++) {
        const nb = new Ball(this, b.x, b.y);
        nb.baseSpeed = b.baseSpeed; nb.speed = b.speed; nb.stuck = false;
        const a = rand(0, TAU);
        nb.vx = Math.cos(a) * b.speed;
        nb.vy = -Math.abs(Math.sin(a) * b.speed) - 40;
        nb.renormalize();
        extra.push(nb);
      }
    }
    this.balls.push(...extra);
  }

  _expirePowerup(kind) {
    switch (kind) {
      case "laser": this.paddle.laser = false; break;
      case "sticky": this.paddle.sticky = false; break;
      case "slow": this.balls.forEach((b) => b.setSpeed(b.baseSpeed)); break;
      case "fast": this.balls.forEach((b) => b.setSpeed(b.baseSpeed)); break;
      case "multiplier": this.scoreMultiplier = 1; break;
    }
  }

  /* ---------- Collision: ball vs brick ---------- */
  _ballBrick(ball) {
    for (const brick of this.bricks) {
      if (brick.dead) continue;
      if (ball.x + ball.r < brick.x || ball.x - ball.r > brick.x + brick.w ||
          ball.y + ball.r < brick.y || ball.y - ball.r > brick.y + brick.h) continue;

      // determine bounce side by minimal penetration
      const overlapL = ball.x + ball.r - brick.x;
      const overlapR = brick.x + brick.w - (ball.x - ball.r);
      const overlapT = ball.y + ball.r - brick.y;
      const overlapB = brick.y + brick.h - (ball.y - ball.r);
      const minX = Math.min(overlapL, overlapR);
      const minY = Math.min(overlapT, overlapB);
      if (minX < minY) {
        ball.vx = -ball.vx;
        ball.x += overlapL < overlapR ? -overlapL : overlapR;
      } else {
        ball.vy = -ball.vy;
        ball.y += overlapT < overlapB ? -overlapT : overlapB;
      }
      this.hitBrick(brick, 1);
      return; // one brick per frame per ball
    }
  }

  hitBrick(brick, dmg) {
    const cx = brick.x + brick.w / 2, cy = brick.y + brick.h / 2;
    if (brick.type === "metal") { this.audio.metal(); this.particles.spark(cx, cy, BRICK_COLORS.metal); return; }

    const destroyed = brick.hit(dmg);
    if (destroyed) {
      this.particles.burst(cx, cy, brick.color(), 16, 260);
      if (brick.type === "explosive") { this.explode(brick); this.audio.explode(); this.triggerShake(8); }
      else this.audio.brick();
      if (brick.type === "bonus") this.maybeDropPowerup(cx, cy, true);
      else this.maybeDropPowerup(cx, cy);
      this.addScore(brick.type === "explosive" ? 50 : brick.type === "bonus" ? 40 : 30 * brick.maxHp);
    } else {
      this.audio.strongHit();
      this.particles.spark(cx, cy, brick.color());
      this.addScore(8);
    }
    this._syncHud();
  }

  explode(source) {
    const radius = 78;
    const sx = source.x + source.w / 2, sy = source.y + source.h / 2;
    for (const b of this.bricks) {
      if (b.dead || b === source) continue;
      const bx = b.x + b.w / 2, by = b.y + b.h / 2;
      if (Math.hypot(bx - sx, by - sy) <= radius) {
        if (b.type === "explosive") { b.dead = true; this.particles.burst(bx, by, b.color(), 14, 240); this.explode(b); this.addScore(50); }
        else if (b.destructible) {
          const d = b.hit(99);
          if (d) { this.particles.burst(bx, by, b.color(), 12, 220); this.addScore(20); if (b.type === "bonus") this.maybeDropPowerup(bx, by, true); }
        }
      }
    }
  }

  /* ---------- Main update ---------- */
  update(dt) {
    this.bgPhase += dt * 0.2;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);

    if (this.state !== "playing") return;

    // combo decay
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    // timed powerups
    let hudDirty = false;
    for (const k of Object.keys(this.active)) {
      this.active[k] -= dt;
      if (this.active[k] <= 0) { delete this.active[k]; this._expirePowerup(k); hudDirty = true; }
    }

    this.paddle.update(dt, this.input);

    // moving bricks
    for (const b of this.bricks) {
      if (b.dead || b.moveAmp === 0) continue;
      b.movePhase += dt * 0.8;
      const nx = b.homeX + Math.sin(b.movePhase) * b.moveAmp;
      b.x = clamp(nx, WALL, VW - WALL - b.w);
      if (b.flash > 0) b.flash -= dt;
    }
    for (const b of this.bricks) if (b.flash > 0 && b.moveAmp === 0) b.flash -= dt;

    // balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.update(dt, this.paddle);
      if (ball.stuck) continue;

      // walls
      if (ball.x - ball.r < WALL) { ball.x = WALL + ball.r; ball.vx = Math.abs(ball.vx); this.audio.bounce(); this.particles.spark(ball.x, ball.y, "#00f0ff"); }
      if (ball.x + ball.r > VW - WALL) { ball.x = VW - WALL - ball.r; ball.vx = -Math.abs(ball.vx); this.audio.bounce(); this.particles.spark(ball.x, ball.y, "#00f0ff"); }
      if (ball.y - ball.r < WALL) { ball.y = WALL + ball.r; ball.vy = Math.abs(ball.vy); this.audio.bounce(); this.particles.spark(ball.x, ball.y, "#00f0ff"); }

      // paddle
      this._ballPaddle(ball);

      // bricks
      this._ballBrick(ball);

      // gradual speed increase
      ball.setSpeed(ball.speed + 1.6 * dt);

      // fell below
      if (ball.y - ball.r > VH) {
        this.balls.splice(i, 1);
      }
    }

    if (this.balls.length === 0) this.loseLife();

    // powerups
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.update(dt);
      // catch
      if (p.y + p.h / 2 >= this.paddle.y && p.y - p.h / 2 <= this.paddle.y + this.paddle.h &&
          p.x >= this.paddle.x - 4 && p.x <= this.paddle.x + this.paddle.w + 4) {
        this.applyPowerup(p.kind);
        this.particles.burst(p.x, p.y, POWERUP_DEFS[p.kind].color, 12, 180);
        this.addScore(15);
        p.dead = true;
      }
      if (p.dead) this.powerups.splice(i, 1);
    }

    // lasers
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.update(dt);
      for (const b of this.bricks) {
        if (b.dead) continue;
        if (l.x > b.x && l.x < b.x + b.w && l.y < b.y + b.h && l.y + l.h > b.y) {
          this.hitBrick(b, 1);
          l.dead = true;
          break;
        }
      }
      if (l.dead) this.lasers.splice(i, 1);
    }

    this.particles.update(dt);
    if (hudDirty) this._syncHud();

    // level clear?
    if (this.bricks.every((b) => b.dead || b.type === "metal")) {
      this.levelComplete();
    }
  }

  _ballPaddle(ball) {
    const p = this.paddle;
    if (ball.vy <= 0) return;
    if (ball.x + ball.r < p.x || ball.x - ball.r > p.x + p.w) return;
    if (ball.y + ball.r < p.y || ball.y - ball.r > p.y + p.h) return;

    ball.y = p.y - ball.r - 0.5;
    if (p.sticky) {
      ball.stuck = true;
      ball.stickOffset = clamp(ball.x - p.cx, -p.w / 2 + 6, p.w / 2 - 6);
      this.audio.paddle();
      return;
    }
    // angle based on hit position (-1..1)
    const rel = clamp((ball.x - p.cx) / (p.w / 2), -1, 1);
    const maxAngle = Math.PI * 0.42;          // ~75deg
    const angle = rel * maxAngle;
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = -Math.cos(angle) * ball.speed;
    this.audio.paddle();
    this.particles.spark(ball.x, p.y, "#b026ff");
  }

  /* ---------- HUD ---------- */
  _syncHud() {
    this.ui.score.textContent = this.score;
    this.ui.highScore.textContent = this.highScore;
    this.ui.level.textContent = this.level;
    this.ui.combo.textContent = "x" + (this.combo > 0 ? this.combo : 1);
    this.ui.lives.textContent = this.lives > 0 ? "♥".repeat(Math.min(this.lives, 6)) : "—";

    // powerup chips
    const chips = [];
    if (this.shield) chips.push(`<span class="powerup-chip">▭ SHIELD</span>`);
    for (const k of Object.keys(this.active)) {
      const d = POWERUP_DEFS[k];
      chips.push(`<span class="powerup-chip">${d.icon} ${d.label} <span class="timer">${Math.ceil(this.active[k])}s</span></span>`);
    }
    this.ui.powerups.innerHTML = chips.join("");
  }

  /* ---------- Render ---------- */
  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
    }
    // background
    ctx.clearRect(-20, -20, VW + 40, VH + 40);
    this._drawBackground(ctx);
    this._drawWalls(ctx);

    for (const b of this.bricks) if (!b.dead) b.draw(ctx);
    for (const p of this.powerups) p.draw(ctx);
    for (const l of this.lasers) l.draw(ctx);
    this.particles.draw(ctx);
    this.paddle.draw(ctx);
    for (const ball of this.balls) ball.draw(ctx);

    if (this.shield) this._drawShield(ctx);
    if (this.state === "playing" && this.balls.some((b) => b.stuck)) this._drawLaunchHint(ctx);

    ctx.restore();
  }

  _drawBackground(ctx) {
    // subtle moving grid
    ctx.strokeStyle = "rgba(0, 240, 255, 0.05)";
    ctx.lineWidth = 1;
    const off = (this.bgPhase * 20) % 40;
    ctx.beginPath();
    for (let x = -off; x < VW; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, VH); }
    for (let y = -off; y < VH; y += 40) { ctx.moveTo(0, y); ctx.lineTo(VW, y); }
    ctx.stroke();
  }
  _drawWalls(ctx) {
    ctx.fillStyle = "rgba(0, 240, 255, 0.12)";
    ctx.fillRect(0, 0, WALL, VH);
    ctx.fillRect(VW - WALL, 0, WALL, VH);
    ctx.fillRect(0, 0, VW, WALL);
  }
  _drawShield(ctx) {
    ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 16;
    ctx.fillRect(WALL, VH - 6, VW - WALL * 2, 5);
    ctx.shadowBlur = 0;
  }
  _drawLaunchHint(ctx) {
    ctx.fillStyle = "rgba(232, 244, 255, 0.7)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PRESS SPACE / TAP TO LAUNCH", VW / 2, VH - 70);
  }

  /* ---------- Loop ---------- */
  _loop(t) {
    if (!this.lastT) this.lastT = t;
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (dt > 0.05) dt = 0.05;   // clamp big gaps (tab switch)
    this.update(dt);
    this.draw();
    requestAnimationFrame((tt) => this._loop(tt));
  }
}

/* ------------------------------------------------------------
   Utility: rounded rectangle path
   ------------------------------------------------------------ */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => { window.game = new Game(); });
