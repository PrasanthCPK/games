/* ============================================================
   SPACE INVADERS — Vanilla JS / HTML5 Canvas
   No frameworks, no build tools, no external assets.
   ============================================================ */

'use strict';

/* ---------- Constants ---------- */
const GAME_W = 800;
const GAME_H = 900;
const PX = 4; // pixel-art scale unit for sprites

/* ---------- Utility ---------- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ============================================================
   AudioManager — synthesizes all sound effects via WebAudio
   ============================================================ */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.6;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // Generic tone helper
  tone(freq, dur, type = 'square', vol = 0.3, freqEnd = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  noise(dur, vol = 0.3, filterFreq = 1000) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  laser()       { this.tone(880, 0.18, 'square', 0.22, 220); }
  alienHit()    { this.tone(160, 0.16, 'sawtooth', 0.3, 60); this.noise(0.12, 0.15, 1800); }
  playerHit()   { this.tone(120, 0.5, 'sawtooth', 0.35, 30); this.noise(0.5, 0.3, 800); }
  shieldHit()   { this.noise(0.07, 0.18, 2500); }
  ufoAppear()   { this.tone(500, 0.4, 'sine', 0.18, 900); }
  ufoDead()     { this.tone(700, 0.35, 'square', 0.28, 120); this.noise(0.2, 0.18, 1500); }
  levelComplete(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,0.18,'square',0.25),i*110)); }
  gameOver()    { [392,330,262,196].forEach((f,i)=>setTimeout(()=>this.tone(f,0.35,'sawtooth',0.3),i*180)); }
  powerup()     { [659,880,1175].forEach((f,i)=>setTimeout(()=>this.tone(f,0.12,'square',0.25),i*70)); }

  // Marching "heartbeat" — pitch index 0..3
  march(step) {
    const freqs = [90, 80, 71, 63];
    this.tone(freqs[step % 4], 0.09, 'square', 0.18, freqs[step % 4] - 10);
  }
}

/* ============================================================
   ParticleSystem — explosions, sparks, thruster
   ============================================================ */
class ParticleSystem {
  constructor() { this.particles = []; }

  burst(x, y, color, count = 18, speed = 4, life = 0.6) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed * 0.3, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, maxLife: life,
        size: rand(2, 5),
        color,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.vx *= 0.97;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      const s = p.size * alpha;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  clear() { this.particles.length = 0; }
}

/* ============================================================
   Starfield — animated parallax background
   ============================================================ */
class Starfield {
  constructor() {
    this.stars = [];
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random() * GAME_W,
        y: Math.random() * GAME_H,
        z: rand(0.3, 1.6),
      });
    }
  }
  update(dt) {
    for (const s of this.stars) {
      s.y += s.z * 40 * dt;
      if (s.y > GAME_H) { s.y = 0; s.x = Math.random() * GAME_W; }
    }
  }
  draw(ctx) {
    for (const s of this.stars) {
      const b = clamp(s.z / 1.6, 0.2, 1);
      ctx.fillStyle = `rgba(255,255,255,${b})`;
      const sz = s.z > 1.1 ? 2 : 1;
      ctx.fillRect(s.x, s.y, sz, sz);
    }
  }
}

/* ============================================================
   Sprite drawing helper — draws a pixel grid
   grid: array of strings, chars map to colors (' ' = transparent)
   ============================================================ */
function drawPixels(ctx, grid, x, y, scale, colorMap) {
  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    for (let col = 0; col < line.length; col++) {
      const c = line[col];
      if (c === ' ' || c === '.') continue;
      ctx.fillStyle = colorMap[c] || '#fff';
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

/* ---------- Alien sprite definitions (two animation frames each) ---------- */
const ALIEN_SPRITES = {
  // small (top rows) — squid
  small: [
    [
      "..X..X..",
      "...XX...",
      "..XXXX..",
      ".XX..XX.",
      "XXXXXXXX",
      "X.XXXX.X",
      "X.X..X.X",
      "...XX...",
    ],
    [
      "..X..X..",
      "X..XX..X",
      "X.XXXX.X",
      "XXX..XXX",
      "XXXXXXXX",
      ".XXXXXX.",
      ".X....X.",
      "X......X",
    ],
  ],
  // medium — crab
  medium: [
    [
      "..X.....X..",
      "...X...X...",
      "..XXXXXXX..",
      ".XX.XXX.XX.",
      "XXXXXXXXXXX",
      "X.XXXXXXX.X",
      "X.X.....X.X",
      "...XX.XX...",
    ],
    [
      "..X.....X..",
      "X..X...X..X",
      "X.XXXXXXX.X",
      "XXX.XXX.XXX",
      "XXXXXXXXXXX",
      ".XXXXXXXXX.",
      "..X.....X..",
      ".X.......X.",
    ],
  ],
  // large — big invader
  large: [
    [
      "....XXXX....",
      ".XXXXXXXXXX.",
      "XXXXXXXXXXXX",
      "XXX.XXXX.XXX",
      "XXXXXXXXXXXX",
      "...XX..XX...",
      "..XX.XX.XX..",
      "XX........XX",
    ],
    [
      "....XXXX....",
      ".XXXXXXXXXX.",
      "XXXXXXXXXXXX",
      "XXX.XXXX.XXX",
      "XXXXXXXXXXXX",
      "..XXX..XXX..",
      ".XX.XXXX.XX.",
      "..XX....XX..",
    ],
  ],
};

const ALIEN_TYPES = {
  small:  { points: 30, color: '#ff2e88', glow: '#ff2e88', cols: 8,  rows: 8 },
  medium: { points: 20, color: '#00f0ff', glow: '#00f0ff', cols: 11, rows: 8 },
  large:  { points: 10, color: '#39ff14', glow: '#39ff14', cols: 12, rows: 8 },
};

/* ============================================================
   Bullet
   ============================================================ */
class Bullet {
  constructor(x, y, vy, owner, color) {
    this.x = x;
    this.y = y;
    this.w = owner === 'player' ? 4 : 5;
    this.h = 16;
    this.vy = vy;
    this.owner = owner; // 'player' | 'alien'
    this.color = color;
    this.dead = false;
    this.wobble = 0;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.wobble += dt * 12;
    if (this.y < -20 || this.y > GAME_H + 20) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    if (this.owner === 'player') {
      ctx.fillRect(this.x - this.w / 2, this.y, this.w, this.h);
    } else {
      // zig-zag alien shot
      const off = Math.sin(this.wobble) * 3;
      ctx.fillRect(this.x - this.w / 2 + off, this.y, this.w, this.h);
    }
    ctx.restore();
  }
  get bounds() {
    return { x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h };
  }
}

/* ============================================================
   Player
   ============================================================ */
const SHIP_SPRITE = [
  ".....X.....",
  "....XXX....",
  "....XXX....",
  ".XXXXXXXXX.",
  "XXXXXXXXXXX",
  "XXXXXXXXXXX",
  "XXX.XXX.XXX",
];

class Player {
  constructor(game) {
    this.game = game;
    this.w = SHIP_SPRITE[0].length * PX;
    this.h = SHIP_SPRITE.length * PX;
    this.reset();
  }
  reset() {
    this.x = GAME_W / 2;
    this.y = GAME_H - 70;
    this.speed = 420;
    this.cooldown = 0;
    this.fireDelay = 0.38;
    this.invuln = 0;
    this.dead = false;
    this.respawnTimer = 0;
    this.powerups = {}; // name -> remaining time
    this.thrust = 0;
  }

  hasPower(name) { return (this.powerups[name] || 0) > 0; }

  addPower(name, dur) { this.powerups[name] = (this.powerups[name] || 0) + dur; }

  update(dt, input) {
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.dead = false;
        this.x = GAME_W / 2;
        this.invuln = 2.0;
      }
      return;
    }
    if (this.dead) return;

    // power-up timers
    for (const k in this.powerups) {
      this.powerups[k] -= dt;
      if (this.powerups[k] <= 0) delete this.powerups[k];
    }

    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    this.x += dir * this.speed * dt;
    this.thrust = dir;
    const half = this.w / 2;
    this.x = clamp(this.x, half, GAME_W - half);

    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    if (input.fire) this.tryFire();
  }

  tryFire() {
    if (this.cooldown > 0 || this.dead || this.respawnTimer > 0) return;
    const rapid = this.hasPower('rapid');
    const triple = this.hasPower('triple');
    this.fireDelay = rapid ? 0.16 : 0.38;
    const topY = this.y - this.h / 2 - 14;
    const c = '#39ff14';
    if (triple) {
      this.game.bullets.push(new Bullet(this.x, topY, -640, 'player', c));
      this.game.bullets.push(new Bullet(this.x - 14, topY + 4, -620, 'player', c));
      this.game.bullets.push(new Bullet(this.x + 14, topY + 4, -620, 'player', c));
    } else {
      this.game.bullets.push(new Bullet(this.x, topY, -680, 'player', c));
    }
    this.cooldown = this.fireDelay;
    this.game.audio.laser();
  }

  hit() {
    if (this.invuln > 0 || this.dead) return false;
    this.dead = true;
    this.respawnTimer = 1.6;
    this.game.audio.playerHit();
    this.game.particles.burst(this.x, this.y, '#39ff14', 40, 7, 0.9);
    this.game.particles.burst(this.x, this.y, '#fff', 20, 5, 0.7);
    this.game.shake(16, 0.5);
    return true;
  }

  draw(ctx) {
    if (this.dead && this.respawnTimer <= 0) return;
    if (this.dead) return; // exploded; particles show
    // flashing during invuln
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return;

    const x = this.x - this.w / 2;
    const y = this.y - this.h / 2;
    const colorMap = { X: '#e8fff0' };
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#39ff14';
    drawPixels(ctx, SHIP_SPRITE, x, y, PX, colorMap);
    ctx.restore();

    // thruster flame
    if (Math.random() > 0.3) {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00f0ff';
      ctx.fillStyle = Math.random() > 0.5 ? '#00f0ff' : '#fff';
      const fw = 6;
      ctx.fillRect(this.x - fw / 2, y + this.h, fw, rand(4, 12));
      ctx.restore();
    }

    // power-up shield ring
    if (this.hasPower('shieldBoost')) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,240,255,0.7)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.w * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  get bounds() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }
}

/* ============================================================
   Alien
   ============================================================ */
class Alien {
  constructor(type, col, row) {
    this.type = type;
    this.col = col;
    this.row = row;
    const def = ALIEN_TYPES[type];
    this.points = def.points;
    this.color = def.color;
    this.w = ALIEN_SPRITES[type][0][0].length * PX;
    this.h = ALIEN_SPRITES[type].length * PX;
    this.x = 0;
    this.y = 0;
    this.alive = true;
    this.frame = 0;
  }
  draw(ctx) {
    if (!this.alive) return;
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    drawPixels(ctx, ALIEN_SPRITES[this.type][this.frame], this.x, this.y, PX, { X: this.color });
    ctx.restore();
  }
  get bounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
}

/* ============================================================
   AlienFormation — manages the grid, movement, firing
   ============================================================ */
class AlienFormation {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.aliens = [];
    this.cols = 11;
    this.rows = 5;
    this.gapX = 16;
    this.gapY = 14;
    this.cellW = 48;
    this.cellH = 40;
    this.dir = 1; // 1 right, -1 left
    this.moveTimer = 0;
    this.stepCount = 0;
    this.descending = 0;
    this.build();
    this.baseInterval = 0.6;
    this.fireTimer = rand(0.5, 1.5);
  }

  build() {
    const startX = 70;
    const startY = 120;
    // row types: top = small, middle = medium, bottom = large
    const rowType = ['small', 'medium', 'medium', 'large', 'large'];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const type = rowType[r] || 'large';
        const a = new Alien(type, c, r);
        a.x = startX + c * this.cellW;
        a.y = startY + r * this.cellH;
        this.aliens.push(a);
      }
    }
  }

  get living() { return this.aliens.filter(a => a.alive); }
  get count() { return this.living.length; }
  get total() { return this.cols * this.rows; }

  // movement interval scales with remaining aliens & level
  get interval() {
    const alive = Math.max(1, this.count);
    const ratio = alive / this.total;
    const levelSpeed = Math.max(0.18, 0.55 - (this.level - 1) * 0.04);
    return clamp(levelSpeed * (0.25 + ratio * 0.9), 0.05, 0.9);
  }

  bounds() {
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of this.living) {
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x + a.w);
      maxY = Math.max(maxY, a.y + a.h);
    }
    return { minX, maxX, maxY };
  }

  update(dt) {
    if (this.count === 0) return;
    this.moveTimer += dt;
    const interval = this.interval;
    if (this.moveTimer >= interval) {
      this.moveTimer = 0;
      this.step();
    }

    // firing
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fire();
      const base = Math.max(0.35, 1.6 - this.level * 0.12);
      const aggression = clamp(this.count / this.total, 0.2, 1);
      this.fireTimer = rand(base * 0.5, base) * (0.5 + aggression * 0.6);
    }
  }

  step() {
    const b = this.bounds();
    const margin = 20;
    let moveDown = false;
    if (this.dir === 1 && b.maxX + margin >= GAME_W) moveDown = true;
    if (this.dir === -1 && b.minX - margin <= 0) moveDown = true;

    const dx = 14 * this.dir;
    const dy = 22;
    for (const a of this.living) {
      a.frame ^= 1; // animate
      if (moveDown) {
        a.y += dy;
      } else {
        a.x += dx;
      }
    }
    if (moveDown) this.dir *= -1;

    // march sound (heartbeat)
    this.stepCount = (this.stepCount + 1) % 4;
    this.game.audio.march(this.stepCount);

    // check reaching player line
    const nb = this.bounds();
    if (nb.maxY >= this.game.player.y - 10) {
      this.game.onAliensReachedBottom();
    }
  }

  fire() {
    if (this.count === 0) return;
    // pick a random column's bottom-most alien
    const byCol = {};
    for (const a of this.living) {
      if (!byCol[a.col] || a.y > byCol[a.col].y) byCol[a.col] = a;
    }
    const shooters = Object.values(byCol);
    const shooter = choice(shooters);
    if (!shooter) return;
    const speed = 260 + this.level * 22;
    this.game.bullets.push(
      new Bullet(shooter.cx, shooter.y + shooter.h, speed, 'alien', '#ffe600')
    );
  }

  draw(ctx) {
    for (const a of this.living) a.draw(ctx);
  }
}

/* ============================================================
   Shield (bunker) — grid of destructible cells
   ============================================================ */
class Shield {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.cell = 6;
    // shape: 1 = solid, 0 = empty. Classic bunker silhouette.
    this.shape = [
      "0111111110",
      "1111111111",
      "1111111111",
      "1111111111",
      "1111111111",
      "1110000111",
      "1100000011",
      "1100000011",
    ];
    this.grid = this.shape.map(row => row.split('').map(c => c === '1' ? 1 : 0));
    this.cols = this.grid[0].length;
    this.rows = this.grid.length;
    this.w = this.cols * this.cell;
    this.h = this.rows * this.cell;
  }

  // Returns true if a hit was absorbed; damages cells near impact.
  hitTest(bullet) {
    const b = bullet.bounds;
    if (b.x + b.w < this.x || b.x > this.x + this.w ||
        b.y + b.h < this.y || b.y > this.y + this.h) return false;

    // find collision cell(s)
    const probeX = bullet.x;
    const probeY = bullet.owner === 'player' ? b.y : b.y + b.h;
    const col = Math.floor((probeX - this.x) / this.cell);
    let row = Math.floor((probeY - this.y) / this.cell);

    // search vertically through the bullet path for first solid cell
    for (let scan = 0; scan < this.rows; scan++) {
      const r = bullet.owner === 'player' ? this.rows - 1 - scan : scan;
      if (col < 0 || col >= this.cols || r < 0 || r >= this.rows) continue;
      if (this.grid[r][col]) {
        this.damage(col, r);
        return true;
      }
    }
    // fallback: check the exact cell
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows && this.grid[row][col]) {
      this.damage(col, row);
      return true;
    }
    return false;
  }

  damage(col, row) {
    // erode a small blast radius
    const radius = 1;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) + Math.abs(dc) > radius + 1) continue;
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
          if (Math.random() > 0.25) this.grid[r][c] = 0;
        }
      }
    }
  }

  get destroyed() {
    return this.grid.every(row => row.every(c => c === 0));
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#39ff14';
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c]) {
          // darker toward edges for a worn look
          ctx.fillStyle = '#2fd60f';
          ctx.fillRect(this.x + c * this.cell, this.y + r * this.cell, this.cell, this.cell);
        }
      }
    }
    ctx.restore();
  }
}

/* ============================================================
   UFO bonus ship
   ============================================================ */
const UFO_SPRITE = [
  "...XXXXXX...",
  ".XXXXXXXXXX.",
  "XXXXXXXXXXXX",
  "XX.XX.XX.XXX",
  "XXXXXXXXXXXX",
  ".XX.XX.XX.X.",
];

class UFO {
  constructor(game) {
    this.game = game;
    this.w = UFO_SPRITE[0].length * PX;
    this.h = UFO_SPRITE.length * PX;
    this.dir = Math.random() > 0.5 ? 1 : -1;
    this.x = this.dir === 1 ? -this.w : GAME_W + this.w;
    this.y = 70;
    this.speed = 160 * this.dir;
    this.points = choice([50, 100, 150, 300]);
    this.dead = false;
    this.t = 0;
    game.audio.ufoAppear();
  }
  update(dt) {
    this.x += this.speed * dt;
    this.t += dt;
    if (this.x < -this.w - 10 || this.x > GAME_W + this.w + 10) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ff2e88';
    const colorMap = { X: '#ff2e88' };
    drawPixels(ctx, UFO_SPRITE, this.x, this.y, PX, colorMap);
    // blinking lights
    if (Math.floor(this.t * 8) % 2 === 0) {
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(this.x + this.w * 0.25, this.y + this.h * 0.5, PX, PX);
      ctx.fillRect(this.x + this.w * 0.6, this.y + this.h * 0.5, PX, PX);
    }
    ctx.restore();
  }
  get bounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
}

/* ============================================================
   PowerUp — drops occasionally from destroyed aliens
   ============================================================ */
const POWERUP_DEFS = {
  rapid:       { color: '#00f0ff', label: 'R' },
  triple:      { color: '#ffe600', label: '3' },
  shieldBoost: { color: '#39ff14', label: 'S' },
  extraLife:   { color: '#ff2e88', label: '+' },
};

class PowerUp {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind;
    this.w = 24; this.h = 24;
    this.vy = 90;
    this.dead = false;
    this.t = 0;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.t += dt;
    if (this.y > GAME_H + 30) this.dead = true;
  }
  draw(ctx) {
    const def = POWERUP_DEFS[this.kind];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.shadowBlur = 14;
    ctx.shadowColor = def.color;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    const pulse = 1 + Math.sin(this.t * 6) * 0.08;
    ctx.scale(pulse, pulse);
    ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
    ctx.fillStyle = def.color;
    ctx.font = 'bold 16px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, 0, 1);
    ctx.restore();
  }
  get bounds() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
}

/* ============================================================
   AABB collision
   ============================================================ */
function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ============================================================
   Game — main controller
   ============================================================ */
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.audio = new AudioManager();
    this.particles = new ParticleSystem();
    this.starfield = new Starfield();
    this.player = new Player(this);

    this.bullets = [];
    this.formation = null;
    this.shields = [];
    this.ufo = null;
    this.powerups = [];

    this.state = 'start'; // start | playing | paused | levelComplete | gameOver
    this.score = 0;
    this.level = 1;
    this.lives = 3;
    this.highScore = parseInt(localStorage.getItem('si_highscore') || '0', 10);

    this.shakeMag = 0;
    this.shakeTime = 0;
    this.ufoTimer = rand(12, 22);

    this.input = { left: false, right: false, fire: false };
    this.lastTime = 0;

    this.cacheDOM();
    this.bindUI();
    this.bindInput();
    this.bindResize();

    this.updateHUD();
    this.updateHighScoreDisplay();

    requestAnimationFrame((t) => this.loop(t));
  }

  cacheDOM() {
    this.dom = {
      hud: document.getElementById('hud'),
      score: document.getElementById('hud-score'),
      highscore: document.getElementById('hud-highscore'),
      level: document.getElementById('hud-level'),
      lives: document.getElementById('hud-lives'),
      overlay: document.getElementById('overlay'),
      screens: {
        start: document.getElementById('screen-start'),
        pause: document.getElementById('screen-pause'),
        level: document.getElementById('screen-level'),
        over: document.getElementById('screen-over'),
      },
      touch: document.getElementById('touch-controls'),
      stage: document.getElementById('stage'),
      btnMute: document.getElementById('btn-mute'),
      btnCrt: document.getElementById('btn-crt'),
      volume: document.getElementById('volume-slider'),
    };
  }

  bindUI() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.audio.init();
        this.audio.resume();
        this.handleAction(btn.dataset.action);
      });
    });

    document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-restart-hud').addEventListener('click', () => this.startGame());
    this.dom.btnMute.addEventListener('click', () => {
      const m = this.audio.toggleMute();
      this.dom.btnMute.textContent = m ? '🔇' : '🔊';
    });
    this.dom.btnCrt.addEventListener('click', () => {
      this.dom.stage.classList.toggle('crt');
    });
    this.dom.volume.addEventListener('input', (e) => {
      this.audio.init();
      this.audio.setVolume(e.target.value / 100);
    });

    // touch buttons
    this.bindTouchButton('touch-move-left', 'left');
    this.bindTouchButton('touch-move-right', 'right');
    this.bindTouchButton('touch-fire', 'fire');
  }

  bindTouchButton(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); this.input[action] = true; this.audio.init(); this.audio.resume(); };
    const off = (e) => { e.preventDefault(); this.input[action] = false; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  }

  handleAction(action) {
    switch (action) {
      case 'play': this.startGame(); break;
      case 'resume': this.togglePause(); break;
      case 'restart': this.startGame(); break;
      case 'next-level': this.nextLevel(); break;
    }
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      this.audio.init();
      this.audio.resume();
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.input.left = true; e.preventDefault(); break;
        case 'ArrowRight': case 'KeyD': this.input.right = true; e.preventDefault(); break;
        case 'Space': this.input.fire = true; e.preventDefault();
          if (this.state === 'start' || this.state === 'gameOver') this.startGame();
          break;
        case 'KeyP': case 'Escape':
          if (this.state === 'playing' || this.state === 'paused') this.togglePause();
          break;
        case 'KeyM':
          const m = this.audio.toggleMute();
          this.dom.btnMute.textContent = m ? '🔇' : '🔊';
          break;
        case 'Enter':
          if (this.state === 'levelComplete') this.nextLevel();
          else if (this.state === 'start' || this.state === 'gameOver') this.startGame();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.input.left = false; break;
        case 'ArrowRight': case 'KeyD': this.input.right = false; break;
        case 'Space': this.input.fire = false; break;
      }
    });

    // swipe controls on canvas
    let touchStartX = null;
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      if (touchStartX === null || !e.touches.length) return;
      const dx = e.touches[0].clientX - touchStartX;
      if (Math.abs(dx) > 8) {
        this.input.left = dx < 0;
        this.input.right = dx > 0;
      }
    }, { passive: true });
    this.canvas.addEventListener('touchend', () => {
      touchStartX = null;
      this.input.left = this.input.right = false;
    });
  }

  bindResize() {
    const fit = () => {
      // keep internal resolution fixed; CSS handles scaling
      this.canvas.width = GAME_W;
      this.canvas.height = GAME_H;
      this.ctx.imageSmoothingEnabled = false;
    };
    window.addEventListener('resize', fit);
    fit();
  }

  /* ---------- State transitions ---------- */
  showScreen(name) {
    Object.entries(this.dom.screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    this.dom.overlay.style.pointerEvents = name ? 'auto' : 'none';
  }
  hideScreens() {
    Object.values(this.dom.screens).forEach(el => el.classList.remove('active'));
  }

  startGame() {
    this.audio.init();
    this.audio.resume();
    this.score = 0;
    this.level = 1;
    this.lives = 3;
    this.bullets = [];
    this.powerups = [];
    this.ufo = null;
    this.particles.clear();
    this.player.reset();
    this.setupLevel();
    this.state = 'playing';
    this.hideScreens();
    this.dom.hud.classList.remove('hidden');
    this.dom.touch.classList.remove('hidden');
    this.dom.touch.classList.add('active');
    this.updateHUD();
  }

  setupLevel() {
    this.formation = new AlienFormation(this, this.level);
    this.shields = this.buildShields();
    this.bullets = [];
    this.powerups = [];
    this.ufo = null;
    this.ufoTimer = rand(10, 20);
    this.player.x = GAME_W / 2;
    this.player.invuln = 1.5;
  }

  buildShields() {
    const shields = [];
    const count = 4;
    const shieldW = 60;
    const spacing = (GAME_W - count * shieldW) / (count + 1);
    const y = GAME_H - 200;
    for (let i = 0; i < count; i++) {
      const x = spacing + i * (shieldW + spacing);
      shields.push(new Shield(x, y));
    }
    return shields;
  }

  nextLevel() {
    this.level++;
    this.setupLevel();
    this.state = 'playing';
    this.dom.touch.classList.add('active');
    this.hideScreens();
    this.player.reset();
    this.player.invuln = 1.5;
    this.updateHUD();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.dom.touch.classList.remove('active');
      this.showScreen('pause');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.dom.touch.classList.add('active');
      this.hideScreens();
    }
  }

  onAliensReachedBottom() {
    // instant game over — invasion succeeded
    this.lives = 0;
    this.endGame();
  }

  loseLife() {
    this.lives--;
    this.updateHUD();
    if (this.lives <= 0) {
      // let explosion play briefly then end
      setTimeout(() => { if (this.state === 'playing') this.endGame(); }, 900);
    }
  }

  completeLevel() {
    this.state = 'levelComplete';
    this.dom.touch.classList.remove('active');
    this.audio.levelComplete();
    const bonus = this.level * 100 + this.lives * 50;
    this.score += bonus;
    this.updateHUD();
    this.commitHighScore();
    document.getElementById('level-cleared-num').textContent = this.level;
    document.getElementById('level-bonus').textContent = bonus;
    document.getElementById('level-score').textContent = this.score;
    this.showScreen('level');
  }

  endGame() {
    this.state = 'gameOver';
    this.dom.touch.classList.remove('active');
    this.audio.gameOver();
    const isRecord = this.commitHighScore();
    document.getElementById('final-score').textContent = this.score;
    document.getElementById('final-highscore').textContent = this.highScore;
    document.getElementById('final-level').textContent = this.level;
    document.getElementById('new-record').classList.toggle('hidden', !isRecord);
    this.showScreen('over');
  }

  commitHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('si_highscore', String(this.highScore));
      this.updateHighScoreDisplay();
      return true;
    }
    return false;
  }

  addScore(pts) {
    this.score += pts;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('si_highscore', String(this.highScore));
      this.updateHighScoreDisplay();
    }
    this.updateHUD();
  }

  /* ---------- HUD ---------- */
  updateHUD() {
    this.dom.score.textContent = this.score;
    this.dom.level.textContent = this.level;
    this.dom.lives.textContent = this.lives > 0 ? '♥'.repeat(this.lives) : '—';
  }
  updateHighScoreDisplay() {
    this.dom.highscore.textContent = this.highScore;
  }

  shake(mag, time) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  /* ---------- Game loop ---------- */
  loop(t) {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000) || 0;
    this.lastTime = t;

    this.update(dt);
    this.render();

    requestAnimationFrame((tt) => this.loop(tt));
  }

  update(dt) {
    this.starfield.update(dt);
    this.particles.update(dt);

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) this.shakeMag = 0;
    }

    if (this.state !== 'playing') return;

    this.player.update(dt, this.input);
    this.formation.update(dt);

    for (const b of this.bullets) b.update(dt);
    for (const p of this.powerups) p.update(dt);

    // UFO spawn
    this.ufoTimer -= dt;
    if (this.ufoTimer <= 0 && !this.ufo && this.formation.count > 2) {
      this.ufo = new UFO(this);
      this.ufoTimer = rand(15, 28);
    }
    if (this.ufo) {
      this.ufo.update(dt);
      if (this.ufo.dead) this.ufo = null;
    }

    this.handleCollisions();

    // cleanup
    this.bullets = this.bullets.filter(b => !b.dead);
    this.powerups = this.powerups.filter(p => !p.dead);

    // win condition
    if (this.formation.count === 0) {
      this.completeLevel();
    }
  }

  handleCollisions() {
    const playerBullets = this.bullets.filter(b => b.owner === 'player' && !b.dead);
    const alienBullets = this.bullets.filter(b => b.owner === 'alien' && !b.dead);

    // player bullets vs aliens
    for (const b of playerBullets) {
      const bb = b.bounds;
      for (const a of this.formation.living) {
        if (intersects(bb, a.bounds)) {
          a.alive = false;
          b.dead = true;
          this.addScore(a.points);
          this.audio.alienHit();
          this.particles.burst(a.cx, a.cy, a.color, 16, 5, 0.5);
          this.maybeDropPowerup(a.cx, a.cy);
          break;
        }
      }
      if (b.dead) continue;
      // player bullets vs UFO
      if (this.ufo && intersects(bb, this.ufo.bounds)) {
        b.dead = true;
        this.addScore(this.ufo.points);
        this.audio.ufoDead();
        this.particles.burst(this.ufo.cx, this.ufo.cy, '#ff2e88', 30, 6, 0.8);
        this.spawnFloatingText(this.ufo.cx, this.ufo.cy, '+' + this.ufo.points);
        this.shake(8, 0.3);
        this.ufo = null;
      }
    }

    // bullets vs shields (both owners)
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const s of this.shields) {
        if (s.hitTest(b)) {
          b.dead = true;
          this.audio.shieldHit();
          this.particles.burst(b.x, b.y, '#39ff14', 6, 3, 0.3);
          break;
        }
      }
    }

    // alien bullets vs player
    for (const b of alienBullets) {
      if (b.dead) continue;
      if (!this.player.dead && this.player.invuln <= 0 &&
          intersects(b.bounds, this.player.bounds)) {
        b.dead = true;
        if (this.player.hasPower('shieldBoost')) {
          delete this.player.powerups.shieldBoost;
          this.audio.shieldHit();
          this.particles.burst(this.player.x, this.player.y, '#00f0ff', 20, 5, 0.5);
        } else if (this.player.hit()) {
          this.loseLife();
        }
      }
    }

    // alien bullet vs player bullet (cancel)
    for (const pb of playerBullets) {
      if (pb.dead) continue;
      for (const ab of alienBullets) {
        if (ab.dead) continue;
        if (intersects(pb.bounds, ab.bounds)) {
          if (Math.random() > 0.5) { ab.dead = true; pb.dead = true; }
        }
      }
    }

    // player picks up powerups
    for (const p of this.powerups) {
      if (p.dead || this.player.dead) continue;
      if (intersects(p.bounds, this.player.bounds)) {
        p.dead = true;
        this.applyPowerup(p.kind);
      }
    }
  }

  maybeDropPowerup(x, y) {
    if (Math.random() < 0.07) {
      const kinds = ['rapid', 'triple', 'shieldBoost', 'extraLife'];
      // extra life rarer
      const kind = Math.random() < 0.15 ? 'extraLife' : choice(['rapid', 'triple', 'shieldBoost']);
      this.powerups.push(new PowerUp(x, y, kind));
    }
  }

  applyPowerup(kind) {
    this.audio.powerup();
    switch (kind) {
      case 'rapid': this.player.addPower('rapid', 8); this.spawnFloatingText(this.player.x, this.player.y - 30, 'RAPID FIRE'); break;
      case 'triple': this.player.addPower('triple', 8); this.spawnFloatingText(this.player.x, this.player.y - 30, 'TRIPLE SHOT'); break;
      case 'shieldBoost': this.player.addPower('shieldBoost', 12); this.spawnFloatingText(this.player.x, this.player.y - 30, 'SHIELD'); break;
      case 'extraLife': this.lives++; this.updateHUD(); this.spawnFloatingText(this.player.x, this.player.y - 30, 'EXTRA LIFE'); break;
    }
  }

  spawnFloatingText(x, y, text) {
    if (!this.floatingTexts) this.floatingTexts = [];
    this.floatingTexts.push({ x, y, text, life: 1.0 });
  }

  /* ---------- Render ---------- */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    ctx.save();
    if (this.shakeMag > 0 && this.shakeTime > 0) {
      const intensity = this.shakeMag * (this.shakeTime);
      ctx.translate(rand(-intensity, intensity), rand(-intensity, intensity));
    }

    // background
    ctx.fillStyle = '#05010f';
    ctx.fillRect(-30, -30, GAME_W + 60, GAME_H + 60);
    this.starfield.draw(ctx);

    if (this.state !== 'start') {
      for (const s of this.shields) s.draw(ctx);
      if (this.formation) this.formation.draw(ctx);
      if (this.ufo) this.ufo.draw(ctx);
      for (const p of this.powerups) p.draw(ctx);
      for (const b of this.bullets) b.draw(ctx);
      this.player.draw(ctx);
    }

    this.particles.draw(ctx);
    this.drawFloatingTexts(ctx);

    ctx.restore();

    // ground line
    if (this.state !== 'start') {
      ctx.strokeStyle = 'rgba(57,255,20,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GAME_H - 30);
      ctx.lineTo(GAME_W, GAME_H - 30);
      ctx.stroke();
    }
  }

  drawFloatingTexts(ctx) {
    if (!this.floatingTexts) return;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 0.6;
      ft.life -= 0.02;
      if (ft.life <= 0) { this.floatingTexts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 18px Courier New';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ffe600';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}

/* ---------- Boot ---------- */
window.addEventListener('DOMContentLoaded', () => {
  // prevent scroll / gesture interference
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest('#stage')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  window.game = new Game();
});
