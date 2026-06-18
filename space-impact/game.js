/* =========================================================================
   SPACE IMPACT  —  a retro Nokia-inspired side-scrolling space shooter
   Pure HTML5 Canvas + JS. No dependencies.
   Architecture: Game, Player, Weapon, Projectile, Enemy, Boss, PowerUp,
                 ParticleSystem, LevelManager, AudioManager, Input.
   ========================================================================= */
'use strict';

/* ---------------------------- Utilities -------------------------------- */
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const choice = arr => arr[randInt(0, arr.length - 1)];

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* Logical game resolution (canvas is scaled to fit). */
const VW = 800, VH = 480;

/* =========================================================================
   AUDIO MANAGER — synthesizes retro SFX & music with the WebAudio API.
   ========================================================================= */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.6;
    this.master = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.currentTrack = null;
  }
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }

  blip(freq, dur, type = 'square', gain = 0.25, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur);
  }
  noise(dur, gain = 0.3, filterFreq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }
  // Named effects
  shoot()      { this.blip(880, 0.08, 'square', 0.12, 320); }
  laser()      { this.blip(1200, 0.06, 'sawtooth', 0.08, 700); }
  plasma()     { this.blip(180, 0.18, 'sawtooth', 0.2, 60); }
  enemyHit()   { this.blip(300, 0.05, 'square', 0.1, 200); }
  explosion()  { this.noise(0.35, 0.35, 900); this.blip(120, 0.3, 'triangle', 0.18, 40); }
  bigExplosion(){ this.noise(0.7, 0.5, 600); this.blip(80, 0.6, 'triangle', 0.25, 30); }
  powerup()    { this.blip(523, 0.09, 'square', 0.2); setTimeout(() => this.blip(784, 0.12, 'square', 0.2), 90); }
  upgrade()    { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.1, 'square', 0.18), i * 70)); }
  damaged()    { this.noise(0.2, 0.4, 500); this.blip(160, 0.18, 'sawtooth', 0.2, 60); }
  gameover()   { [440, 349, 294, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'triangle', 0.25), i * 220)); }
  bossAttack() { this.blip(90, 0.25, 'sawtooth', 0.22, 200); }

  // Simple sequenced music loop
  startMusic(boss = false) {
    this.stopMusic();
    if (!this.ctx) return;
    this.currentTrack = boss ? 'boss' : 'main';
    const mainBass = [55, 55, 82.4, 55, 73.4, 55, 65.4, 55];
    const mainLead = [220, 261, 329, 261, 293, 246, 220, 196];
    const bossBass = [49, 49, 58.3, 49, 65.4, 49, 43.6, 49];
    const bossLead = [196, 233, 196, 174, 207, 233, 261, 233];
    const bass = boss ? bossBass : mainBass;
    const lead = boss ? bossLead : mainLead;
    const tempo = boss ? 150 : 200;
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const s = this.musicStep % bass.length;
      this._mnote(bass[s], 'triangle', 0.18, tempo / 1000);
      if (this.musicStep % 2 === 0) this._mnote(lead[s], 'square', 0.07, tempo / 1000 * 0.9);
      this.musicStep++;
    }, tempo);
  }
  _mnote(freq, type, gain, dur) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + dur);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}

/* =========================================================================
   PARTICLE SYSTEM — explosions, thrusters, trails, debris.
   ========================================================================= */
class Particle {
  constructor(x, y, vx, vy, life, color, size, gravity = 0, fade = true) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color;
    this.size = size; this.gravity = gravity; this.fade = fade; this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const a = this.fade ? clamp(this.life / this.maxLife, 0, 1) : 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    const s = this.size * (this.fade ? (0.4 + a * 0.6) : 1);
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}

class ParticleSystem {
  constructor() { this.particles = []; }
  add(p) { this.particles.push(p); }
  explosion(x, y, color = '#ff9d4d', count = 20, speed = 240) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(speed * 0.2, speed);
      this.add(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.7), Math.random() < 0.5 ? color : '#fff', rand(2, 5)));
    }
  }
  bigExplosion(x, y) {
    this.explosion(x, y, '#ffd34d', 40, 360);
    this.explosion(x, y, '#ff4d5e', 30, 260);
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(40, 160);
      this.add(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.6, 1.2), '#888', rand(3, 6), 100));
    }
  }
  thruster(x, y) {
    this.add(new Particle(x, y, rand(-260, -160), rand(-30, 30), rand(0.1, 0.25), Math.random() < 0.5 ? '#46f7c0' : '#2b8fff', rand(2, 4)));
  }
  trail(x, y, color) {
    this.add(new Particle(x, y, rand(-40, 40), rand(-40, 40), 0.18, color, 2));
  }
  hit(x, y, color = '#fff') {
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 180);
      this.add(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.1, 0.3), color, rand(1, 3)));
    }
  }
  update(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => !p.dead);
  }
  draw(ctx) { for (const p of this.particles) p.draw(ctx); }
  clear() { this.particles = []; }
}

/* =========================================================================
   PROJECTILES
   ========================================================================= */
class Projectile {
  constructor(x, y, vx, vy, opts = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = opts.w || 14; this.h = opts.h || 4;
    this.damage = opts.damage || 1;
    this.color = opts.color || '#46f7c0';
    this.friendly = opts.friendly !== false;
    this.dead = false;
    this.homing = opts.homing || false;
    this.pierce = opts.pierce || 0;
    this.trail = opts.trail || false;
    this.type = opts.type || 'bolt';
    this.life = opts.life || 6;
  }
  update(dt, game) {
    if (this.homing) {
      const tgt = game.nearestEnemy(this.x, this.y);
      if (tgt) {
        const ang = Math.atan2((tgt.y + tgt.h / 2) - this.y, (tgt.x + tgt.w / 2) - this.x);
        const speed = Math.hypot(this.vx, this.vy) || 360;
        const cur = Math.atan2(this.vy, this.vx);
        let diff = ang - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const na = cur + clamp(diff, -4 * dt, 4 * dt);
        this.vx = Math.cos(na) * speed; this.vy = Math.sin(na) * speed;
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.trail) game.particles.trail(this.x, this.y, this.color);
    if (this.x < -40 || this.x > VW + 40 || this.y < -40 || this.y > VH + 40 || this.life <= 0) this.dead = true;
  }
  get bounds() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color; ctx.shadowBlur = 8;
    ctx.fillStyle = this.color;
    if (this.type === 'plasma') {
      ctx.beginPath(); ctx.arc(this.x, this.y, this.h, 0, Math.PI * 2); ctx.fill();
    } else if (this.type === 'missile') {
      ctx.translate(this.x, this.y); ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(-this.w / 2 - 3, -1, 3, 2);
    } else {
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

/* =========================================================================
   WEAPON SYSTEM
   ========================================================================= */
const WEAPONS = ['SINGLE', 'DOUBLE', 'TRIPLE', 'SPREAD', 'LASER', 'PLASMA', 'HOMING'];

class Weapon {
  constructor(player) {
    this.player = player;
    this.type = 'SINGLE';
    this.cooldown = 0;
    this.rapidFire = 0;      // timer for rapid fire powerup
    this.damageBoost = 0;    // timer for damage boost
  }
  setType(t) { this.type = t; this.cooldown = 0; }
  upgrade() {
    const i = WEAPONS.indexOf(this.type);
    if (i < WEAPONS.length - 1) this.setType(WEAPONS[i + 1]);
  }
  fireRate() {
    const base = { SINGLE: 0.22, DOUBLE: 0.24, TRIPLE: 0.28, SPREAD: 0.3, LASER: 0.07, PLASMA: 0.5, HOMING: 0.4 }[this.type];
    return this.rapidFire > 0 ? base * 0.45 : base;
  }
  update(dt) {
    this.cooldown -= dt;
    if (this.rapidFire > 0) this.rapidFire -= dt;
    if (this.damageBoost > 0) this.damageBoost -= dt;
  }
  tryFire(game) {
    if (this.cooldown > 0) return;
    this.cooldown = this.fireRate();
    const p = this.player;
    const x = p.x + p.w, y = p.y + p.h / 2;
    const dmgMul = this.damageBoost > 0 ? 2 : 1;
    const mk = (px, py, vx, vy, opts) => game.playerShots.push(new Projectile(px, py, vx, vy, opts));
    switch (this.type) {
      case 'SINGLE':
        mk(x, y, 620, 0, { damage: 1 * dmgMul, color: '#46f7c0' });
        game.audio.shoot(); break;
      case 'DOUBLE':
        mk(x, y - 7, 620, 0, { damage: 1 * dmgMul }); mk(x, y + 7, 620, 0, { damage: 1 * dmgMul });
        game.audio.shoot(); break;
      case 'TRIPLE':
        mk(x, y, 640, 0, { damage: 1 * dmgMul }); mk(x, y - 9, 620, -40, { damage: 1 * dmgMul }); mk(x, y + 9, 620, 40, { damage: 1 * dmgMul });
        game.audio.shoot(); break;
      case 'SPREAD':
        for (const a of [-0.35, -0.17, 0, 0.17, 0.35]) mk(x, y, Math.cos(a) * 560, Math.sin(a) * 560, { damage: 1 * dmgMul, color: '#9d6dff' });
        game.audio.shoot(); break;
      case 'LASER':
        mk(x, y, 1000, 0, { damage: 0.6 * dmgMul, w: 26, h: 3, color: '#ff4d5e', type: 'bolt', pierce: 1 });
        game.audio.laser(); break;
      case 'PLASMA':
        mk(x, y, 360, 0, { damage: 4 * dmgMul, w: 16, h: 16, color: '#ffd34d', type: 'plasma', pierce: 2 });
        game.audio.plasma(); break;
      case 'HOMING':
        mk(x, y - 8, 380, -60, { damage: 2 * dmgMul, w: 12, h: 5, color: '#ff9d4d', type: 'missile', homing: true, trail: true });
        mk(x, y + 8, 380, 60, { damage: 2 * dmgMul, w: 12, h: 5, color: '#ff9d4d', type: 'missile', homing: true, trail: true });
        game.audio.shoot(); break;
    }
  }
}

/* =========================================================================
   PLAYER
   ========================================================================= */
class Player {
  constructor(game) {
    this.game = game;
    this.w = 38; this.h = 22;
    this.reset();
    this.weapon = new Weapon(this);
    this.lives = 3;
  }
  reset() {
    this.x = 70; this.y = VH / 2 - this.h / 2;
    this.speed = 340;
    this.maxHp = 100; this.hp = 100;
    this.maxShield = 60; this.shield = 0;
    this.invuln = 1.5;
    this.speedBoost = 0;
    this.thrustAnim = 0;
  }
  fullReset() {
    this.reset();
    this.lives = 3;
    this.weapon = new Weapon(this);
  }
  get bounds() { return { x: this.x + 4, y: this.y + 3, w: this.w - 8, h: this.h - 6 }; }

  update(dt, input) {
    let dx = 0, dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.joy.active) { dx = input.joy.x; dy = input.joy.y; }
    const len = Math.hypot(dx, dy) || 1;
    const sp = this.speed * (this.speedBoost > 0 ? 1.6 : 1);
    this.x += (dx / len) * sp * dt;
    this.y += (dy / len) * sp * dt;
    this.x = clamp(this.x, 0, VW - this.w);
    this.y = clamp(this.y, 0, VH - this.h);

    this.weapon.update(dt);
    if ((input.fire || input.gpFire || input.autofire) && this.game.state === 'playing') this.weapon.tryFire(this.game);

    if (this.invuln > 0) this.invuln -= dt;
    if (this.speedBoost > 0) this.speedBoost -= dt;

    this.thrustAnim += dt * 30;
    if (Math.random() < 0.8) this.game.particles.thruster(this.x + 2, this.y + this.h / 2 + rand(-4, 4));
  }

  damage(amount) {
    if (this.invuln > 0) return false;
    if (this.shield > 0) {
      this.shield -= amount;
      if (this.shield < 0) { this.hp += this.shield; this.shield = 0; }
    } else {
      this.hp -= amount;
    }
    this.game.audio.damaged();
    this.game.shake(8, 0.25);
    this.game.particles.explosion(this.x + this.w / 2, this.y + this.h / 2, '#ff4d5e', 10, 160);
    if (this.hp <= 0) { this.hp = 0; this.die(); return true; }
    this.invuln = 0.6;
    return false;
  }

  die() {
    this.game.particles.bigExplosion(this.x + this.w / 2, this.y + this.h / 2);
    this.game.audio.explosion();
    this.lives--;
    if (this.lives <= 0) {
      this.game.gameOver();
    } else {
      this.reset();
      this.game.combo = 0;
    }
  }

  draw(ctx) {
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return; // blink
    const classic = this.game.theme === 'classic';
    const body = classic ? '#9bef6b' : '#46f7c0';
    const accent = classic ? '#6cc23f' : '#2b8fff';
    ctx.save();
    ctx.translate(this.x, this.y);
    // ship body (chunky pixel arrow)
    ctx.fillStyle = body;
    ctx.fillRect(0, 6, 24, 10);
    ctx.fillRect(8, 2, 18, 18);
    ctx.beginPath();
    ctx.moveTo(26, 2); ctx.lineTo(this.w, this.h / 2); ctx.lineTo(26, this.h - 2); ctx.closePath();
    ctx.fill();
    // cockpit
    ctx.fillStyle = accent;
    ctx.fillRect(12, 8, 8, 6);
    // wing fins
    ctx.fillStyle = classic ? '#4f9a2c' : '#1d8a6e';
    ctx.fillRect(4, 0, 8, 5);
    ctx.fillRect(4, this.h - 5, 8, 5);
    // engine glow
    const glow = 4 + Math.sin(this.thrustAnim) * 2;
    ctx.fillStyle = classic ? '#cfffa0' : '#ffd34d';
    ctx.fillRect(-glow, 8, glow, 6);
    ctx.restore();

    // shield bubble
    if (this.shield > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(43,143,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x + this.w / 2, this.y + this.h / 2, this.w * 0.7, 0, Math.PI * 2);
      ctx.stroke(); ctx.restore();
    }
  }
}

/* =========================================================================
   ENEMIES
   ========================================================================= */
class Enemy {
  constructor(game, kind, x, y, opts = {}) {
    this.game = game; this.kind = kind;
    this.x = x; this.y = y;
    this.dead = false; this.t = 0;
    this.fireTimer = rand(0.5, 1.6);
    this.baseY = y;
    this.opts = opts;
    this.score = 100;
    this.setup(kind);
    this.hp = this.maxHp;
  }
  setup(kind) {
    const d = this.game.difficulty;
    switch (kind) {
      case 'scout':
        this.w = 26; this.h = 18; this.maxHp = 1; this.vx = -rand(180, 240); this.score = 100;
        this.color = '#ff4d5e'; this.pattern = choice(['straight', 'zigzag', 'wave']); break;
      case 'fighter':
        this.w = 30; this.h = 22; this.maxHp = 3 + Math.floor(d); this.vx = -rand(90, 130); this.score = 200;
        this.color = '#ff9d4d'; this.pattern = choice(['wave', 'straight', 'advance']); this.canFire = true; break;
      case 'heavy':
        this.w = 46; this.h = 36; this.maxHp = 10 + Math.floor(d * 2); this.vx = -rand(50, 80); this.score = 400;
        this.color = '#c45cff'; this.pattern = 'straight'; this.canFire = true; this.fireTimer = rand(1, 2); break;
      case 'turret':
        this.w = 30; this.h = 30; this.maxHp = 6 + Math.floor(d); this.vx = -60; this.score = 250;
        this.color = '#5ca0ff'; this.pattern = 'turret'; this.canFire = true; break;
      case 'kamikaze':
        this.w = 24; this.h = 24; this.maxHp = 2; this.vx = -rand(120, 160); this.score = 150;
        this.color = '#ffd34d'; this.pattern = 'pursuit'; break;
      case 'asteroid':
        this.w = randInt(28, 54); this.h = this.w; this.maxHp = Math.ceil(this.w / 12); this.vx = -rand(70, 140);
        this.score = 50; this.color = '#9b8b78'; this.pattern = 'spin'; this.spin = 0; this.spinSpeed = rand(-3, 3);
        this.vy = rand(-30, 30); break;
    }
  }
  get bounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt, player) {
    this.t += dt;
    switch (this.pattern) {
      case 'straight': this.x += this.vx * dt; break;
      case 'zigzag': this.x += this.vx * dt; this.y = this.baseY + Math.sin(this.t * 8) * 30; break;
      case 'wave': this.x += this.vx * dt; this.y = this.baseY + Math.sin(this.t * 3) * 60; break;
      case 'advance':
        this.x += this.vx * dt;
        if (this.x < VW * 0.55) this.x = VW * 0.55 + Math.sin(this.t * 2) * 12;
        break;
      case 'pursuit': {
        const ang = Math.atan2((player.y + player.h / 2) - (this.y + this.h / 2), (player.x) - this.x);
        this.x += Math.cos(ang) * Math.abs(this.vx) * dt;
        this.y += Math.sin(ang) * Math.abs(this.vx) * dt;
        break;
      }
      case 'turret': this.x += this.vx * dt; if (this.x < VW * 0.7) this.x = VW * 0.7; break;
      case 'spin': this.x += this.vx * dt; this.y += this.vy * dt; this.spin += this.spinSpeed * dt;
        if (this.y < 0 || this.y > VH - this.h) this.vy *= -1; break;
    }

    if (this.canFire) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && this.x < VW) {
        this.fireTimer = this.kind === 'turret' ? rand(0.8, 1.4) : rand(1.2, 2.4);
        this.fire(player);
      }
    }
    if (this.x < -this.w - 10) this.dead = true;
  }

  fire(player) {
    const sx = this.x, sy = this.y + this.h / 2;
    if (this.kind === 'heavy') {
      for (const a of [-0.2, 0, 0.2]) this.game.enemyShots.push(new Projectile(sx, sy, Math.cos(Math.PI + a) * 280, Math.sin(Math.PI + a) * 280, { friendly: false, color: '#ff4d5e', damage: 12 }));
    } else {
      const ang = Math.atan2((player.y + player.h / 2) - sy, (player.x) - sx);
      this.game.enemyShots.push(new Projectile(sx, sy, Math.cos(ang) * 300, Math.sin(ang) * 300, { friendly: false, color: '#ff9d4d', damage: 8 }));
    }
    this.game.audio.enemyHit();
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.game.particles.hit(this.x + this.w / 2, this.y + this.h / 2, '#fff');
    this.game.audio.enemyHit();
    if (this.hp <= 0) { this.destroy(); return true; }
    return false;
  }
  destroy() {
    this.dead = true;
    this.game.particles.explosion(this.x + this.w / 2, this.y + this.h / 2, this.color, 18, 240);
    this.game.audio.explosion();
    this.game.onEnemyKilled(this);
  }

  draw(ctx) {
    const classic = this.game.theme === 'classic';
    ctx.save();
    ctx.translate(this.x, this.y);
    const col = classic ? '#9bef6b' : this.color;
    ctx.fillStyle = col;
    switch (this.kind) {
      case 'scout':
        ctx.beginPath(); ctx.moveTo(this.w, this.h / 2); ctx.lineTo(0, 0); ctx.lineTo(6, this.h / 2); ctx.lineTo(0, this.h); ctx.closePath(); ctx.fill();
        break;
      case 'fighter':
        ctx.fillRect(2, 4, this.w - 4, this.h - 8);
        ctx.beginPath(); ctx.moveTo(0, this.h / 2); ctx.lineTo(8, 0); ctx.lineTo(8, this.h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = classic ? '#4f9a2c' : '#ffd34d'; ctx.fillRect(this.w - 8, 8, 6, this.h - 16);
        break;
      case 'heavy':
        ctx.fillRect(0, 4, this.w, this.h - 8);
        ctx.fillRect(6, 0, this.w - 12, this.h);
        ctx.fillStyle = classic ? '#4f9a2c' : '#5c0010'; ctx.fillRect(this.w - 10, 6, 6, this.h - 12);
        ctx.fillStyle = classic ? '#cfffa0' : '#fff'; ctx.fillRect(8, this.h / 2 - 3, 6, 6);
        break;
      case 'turret':
        ctx.beginPath(); ctx.arc(this.w / 2, this.h / 2, this.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = classic ? '#4f9a2c' : '#021'; ctx.fillRect(0, this.h / 2 - 3, this.w / 2, 6);
        break;
      case 'kamikaze':
        ctx.beginPath(); ctx.moveTo(0, this.h / 2); ctx.lineTo(this.w, 0); ctx.lineTo(this.w * 0.7, this.h / 2); ctx.lineTo(this.w, this.h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = classic ? '#cfffa0' : '#ff4d5e'; ctx.fillRect(this.w * 0.5, this.h / 2 - 2, 4, 4);
        break;
      case 'asteroid':
        ctx.translate(this.w / 2, this.h / 2); ctx.rotate(this.spin);
        ctx.fillStyle = classic ? '#7fbf4f' : '#9b8b78';
        ctx.beginPath();
        const r = this.w / 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = r * (0.7 + ((i * 53) % 10) / 30);
          ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = classic ? '#4f9a2c' : '#6b5d4d';
        ctx.fillRect(-r * 0.3, -r * 0.2, r * 0.3, r * 0.3);
        break;
    }
    ctx.restore();

    // small hp bar for tougher enemies
    if (this.maxHp > 3 && this.hp < this.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(this.x, this.y - 6, this.w, 3);
      ctx.fillStyle = '#46f7c0'; ctx.fillRect(this.x, this.y - 6, this.w * (this.hp / this.maxHp), 3);
    }
  }
}

/* =========================================================================
   BOSSES
   ========================================================================= */
class Boss {
  constructor(game, type) {
    this.game = game; this.type = type;
    this.w = 120; this.h = 140;
    this.x = VW + 60; this.y = VH / 2 - this.h / 2;
    this.dead = false; this.t = 0; this.entering = true;
    this.phase = 0; this.fireTimer = 1.5; this.spawnTimer = 3;
    this.flash = 0;
    const cfg = {
      battleship: { name: 'MECHANICAL BATTLESHIP', hp: 220, color: '#5ca0ff' },
      queen:      { name: 'ALIEN QUEEN', hp: 260, color: '#c45cff' },
      dreadnought:{ name: 'DREADNOUGHT CRUISER', hp: 340, color: '#ff4d5e' },
    }[type];
    this.name = cfg.name; this.maxHp = Math.floor(cfg.hp * (1 + game.stage * 0.08)); this.hp = this.maxHp; this.color = cfg.color;
    this.score = 3000;
  }
  get bounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt, player) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.entering) {
      this.x -= 90 * dt;
      if (this.x <= VW - this.w - 30) { this.x = VW - this.w - 30; this.entering = false; }
      return;
    }
    this.y = VH / 2 - this.h / 2 + Math.sin(this.t * 0.8) * (VH / 2 - this.h / 2 - 10);
    const hpFrac = this.hp / this.maxHp;
    this.phase = hpFrac > 0.66 ? 0 : hpFrac > 0.33 ? 1 : 2;

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.attack(player);
      this.fireTimer = (this.type === 'dreadnought' ? 1.0 : 1.3) - this.phase * 0.25;
    }
    if (this.type === 'queen') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 4 - this.phase;
        this.game.enemies.push(new Enemy(this.game, 'scout', this.x, this.y + rand(0, this.h)));
      }
    }
  }

  attack(player) {
    const cx = this.x, cy = this.y + this.h / 2;
    this.game.audio.bossAttack();
    const push = (x, y, vx, vy, dmg = 12, col = '#ff4d5e', opts = {}) =>
      this.game.enemyShots.push(new Projectile(x, y, vx, vy, Object.assign({ friendly: false, color: col, damage: dmg }, opts)));
    if (this.type === 'battleship') {
      for (const oy of [-40, 0, 40]) push(cx, cy + oy, -340, 0, 12);
      if (this.phase >= 1) push(cx, cy, -300, 0, 16, '#ffd34d', { w: 16, h: 16, type: 'plasma' });
    } else if (this.type === 'queen') {
      const n = 6 + this.phase * 2;
      for (let i = 0; i < n; i++) { const a = Math.PI * 0.6 + (i / (n - 1)) * Math.PI * 0.8; push(cx, cy, Math.cos(a) * 240, Math.sin(a) * 240, 10, '#c45cff'); }
    } else { // dreadnought
      const ang = Math.atan2((player.y + player.h / 2) - cy, player.x - cx);
      for (const da of [-0.15, 0, 0.15]) push(cx, cy, Math.cos(ang + da) * 360, Math.sin(ang + da) * 360, 12, '#ff9d4d', { type: 'missile', w: 14, h: 5, homing: false });
      if (this.phase >= 2) for (const oy of [-30, 30]) push(cx, cy + oy, -480, 0, 18, '#ff4d5e', { w: 30, h: 5 });
    }
    this.game.shake(4, 0.15);
  }

  hurt(dmg) {
    if (this.entering) return false;
    this.hp -= dmg; this.flash = 0.08;
    this.game.particles.hit(this.x + rand(0, this.w), this.y + rand(0, this.h), '#fff');
    if (this.hp <= 0) { this.destroy(); return true; }
    return false;
  }
  destroy() {
    this.dead = true;
    for (let i = 0; i < 6; i++) setTimeout(() => {
      this.game.particles.bigExplosion(this.x + rand(0, this.w), this.y + rand(0, this.h));
      this.game.audio.bigExplosion();
    }, i * 180);
    this.game.shake(20, 1.0);
    this.game.onBossKilled(this);
  }

  draw(ctx) {
    const classic = this.game.theme === 'classic';
    ctx.save();
    ctx.translate(this.x, this.y);
    let col = classic ? '#9bef6b' : this.color;
    if (this.flash > 0) col = '#fff';
    ctx.fillStyle = col;
    if (this.type === 'battleship') {
      ctx.fillRect(20, 0, this.w - 20, this.h);
      ctx.fillRect(0, 20, this.w, this.h - 40);
      ctx.fillStyle = classic ? '#4f9a2c' : '#021428';
      ctx.fillRect(0, this.h / 2 - 8, 24, 16);   // cannon
      ctx.fillRect(10, 30, 14, 14); ctx.fillRect(10, this.h - 44, 14, 14); // weak points
    } else if (this.type === 'queen') {
      ctx.beginPath();
      ctx.ellipse(this.w / 2, this.h / 2, this.w / 2, this.h / 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = classic ? '#cfffa0' : '#ffd34d';
      ctx.beginPath(); ctx.ellipse(this.w / 2 - 10, this.h / 2, 14, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      for (let i = 0; i < 4; i++) { ctx.fillRect(this.w - 12, 20 + i * 28, 18, 8); }
    } else {
      ctx.fillRect(10, 10, this.w - 10, this.h - 20);
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(10, this.h); ctx.lineTo(-18, this.h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = classic ? '#4f9a2c' : '#5c0010';
      ctx.fillRect(0, 20, 12, 18); ctx.fillRect(0, this.h - 38, 12, 18);
      ctx.fillStyle = classic ? '#cfffa0' : '#ffd34d'; ctx.fillRect(this.w - 16, this.h / 2 - 6, 14, 12);
    }
    ctx.restore();
  }
}

/* =========================================================================
   POWER-UPS
   ========================================================================= */
const POWERUP_TYPES = ['weapon', 'shield', 'health', 'speed', 'rapid', 'damage', 'invuln', 'life'];
class PowerUp {
  constructor(game, x, y, type) {
    this.game = game; this.x = x; this.y = y; this.type = type;
    this.w = 22; this.h = 22; this.vx = -90; this.dead = false; this.t = 0;
  }
  get bounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(dt) {
    this.t += dt;
    this.x += this.vx * dt;
    this.y += Math.sin(this.t * 3) * 20 * dt;
    if (this.x < -30) this.dead = true;
  }
  apply(player) {
    const g = this.game;
    switch (this.type) {
      case 'weapon': player.weapon.upgrade(); g.audio.upgrade(); g.toast('WEAPON UP!'); break;
      case 'shield': player.shield = player.maxShield; g.toast('SHIELD'); break;
      case 'health': player.hp = clamp(player.hp + 40, 0, player.maxHp); g.toast('+HEALTH'); break;
      case 'speed': player.speedBoost = 8; g.toast('SPEED BOOST'); break;
      case 'rapid': player.weapon.rapidFire = 8; g.toast('RAPID FIRE'); break;
      case 'damage': player.weapon.damageBoost = 8; g.toast('DAMAGE x2'); break;
      case 'invuln': player.invuln = Math.max(player.invuln, 5); g.toast('INVINCIBLE'); break;
      case 'life': player.lives++; g.toast('1UP'); break;
    }
    if (this.type !== 'weapon') g.audio.powerup();
    g.score += 50;
  }
  draw(ctx) {
    const colors = { weapon: '#46f7c0', shield: '#2b8fff', health: '#ff4d5e', speed: '#ffd34d', rapid: '#ff9d4d', damage: '#c45cff', invuln: '#fff', life: '#ff66aa' };
    const labels = { weapon: 'W', shield: 'S', health: '+', speed: '»', rapid: 'R', damage: 'D', invuln: 'I', life: '♥' };
    const c = colors[this.type];
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(Math.sin(this.t * 2) * 0.2);
    ctx.shadowColor = c; ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
    ctx.fillStyle = c; ctx.font = 'bold 14px "Courier New"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(labels[this.type], 0, 1);
    ctx.restore();
  }
}

/* =========================================================================
   LEVEL MANAGER — stages, backgrounds, enemy waves, boss triggers.
   ========================================================================= */
const STAGES = [
  { name: 'DEEP SPACE',       bg: '#02060a', accent: '#0a2a3a', boss: 'battleship',  enemies: ['scout', 'fighter'], duration: 35 },
  { name: 'ASTEROID FIELD',   bg: '#0a0608', accent: '#3a2a1a', boss: 'battleship',  enemies: ['scout', 'asteroid', 'fighter'], duration: 38 },
  { name: 'ALIEN FLEET',      bg: '#0a0210', accent: '#2a0a3a', boss: 'queen',       enemies: ['fighter', 'kamikaze', 'scout'], duration: 40 },
  { name: 'SPACE STATION',    bg: '#060a0e', accent: '#1a2a3a', boss: 'dreadnought', enemies: ['turret', 'fighter', 'heavy'], duration: 42 },
  { name: 'ENEMY STRONGHOLD', bg: '#0e0206', accent: '#3a0a1a', boss: 'dreadnought', enemies: ['heavy', 'turret', 'kamikaze', 'fighter'], duration: 45 },
];

class LevelManager {
  constructor(game) { this.game = game; }
  start(stageIndex) {
    this.stageIndex = stageIndex;
    this.cfg = STAGES[Math.min(stageIndex, STAGES.length - 1)];
    this.timer = 0;
    this.spawnTimer = 1.2;
    this.bossSpawned = false;
    this.bossActive = false;
    this.complete = false;
    this.game.buildStarfield(this.cfg.accent);
  }
  get isEndless() { return this.game.mode === 'endless'; }

  update(dt) {
    if (this.complete) return;
    this.timer += dt;

    if (!this.bossSpawned && !this.isEndless && this.timer >= this.cfg.duration) {
      this.triggerBoss();
      return;
    }
    if (this.bossActive) return; // stop spawning trash during boss

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const baseGap = this.isEndless ? clamp(1.4 - this.game.difficulty * 0.05, 0.35, 1.4) : clamp(1.1 - this.timer / 60, 0.45, 1.1);
      this.spawnTimer = rand(baseGap * 0.6, baseGap * 1.4);
      this.spawnWave();
    }
  }

  spawnWave() {
    const pool = this.cfg.enemies;
    const r = Math.random();
    if (r < 0.18) {
      // formation
      const kind = pool[0];
      const n = randInt(3, 5);
      const y0 = rand(40, VH - 40 - n * 30);
      for (let i = 0; i < n; i++) this.game.enemies.push(new Enemy(this.game, kind, VW + 30 + i * 36, y0 + i * 26));
    } else {
      const kind = choice(pool);
      this.game.enemies.push(new Enemy(this.game, kind, VW + 30, rand(30, VH - 50)));
    }
  }

  triggerBoss() {
    this.bossSpawned = true;
    this.game.startBossWarning(this.cfg.boss);
  }
  onBossDefeated() {
    this.bossActive = false;
    this.complete = true;
    this.game.stageComplete();
  }
}

/* =========================================================================
   INPUT — keyboard, touch joystick, fire button, gamepad polling.
   ========================================================================= */
class Input {
  constructor(game) {
    this.game = game;
    this.left = this.right = this.up = this.down = this.fire = false;
    this.gpFire = false;
    this.autofire = false;
    this.joy = { active: false, x: 0, y: 0 };
    this._bindKeyboard();
  }
  _bindKeyboard() {
    const map = (e, v) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.left = v; break;
        case 'ArrowRight': case 'KeyD': this.right = v; break;
        case 'ArrowUp': case 'KeyW': this.up = v; break;
        case 'ArrowDown': case 'KeyS': this.down = v; break;
        case 'Space': this.fire = v; if (v) e.preventDefault(); break;
        case 'KeyP': if (v) this.game.togglePause(); break;
        case 'Enter': if (v && this.game.state === 'start') this.game.startGame(); break;
        default: return;
      }
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', e => { if (!e.repeat) map(e, true); });
    window.addEventListener('keyup', e => map(e, false));
  }
  bindTouch(joystickEl, knobEl, fireBtn) {
    let touchId = null;
    const radius = 50;
    const center = () => {
      const r = joystickEl.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const move = (cx, cy) => {
      const c = center();
      let dx = cx - c.x, dy = cy - c.y;
      const d = Math.hypot(dx, dy);
      if (d > radius) { dx = dx / d * radius; dy = dy / d * radius; }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.active = true; this.joy.x = dx / radius; this.joy.y = dy / radius;
    };
    const end = () => { this.joy.active = false; this.joy.x = this.joy.y = 0; knobEl.style.transform = 'translate(0,0)'; touchId = null; };
    joystickEl.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; touchId = t.identifier; move(t.clientX, t.clientY); }, { passive: false });
    joystickEl.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === touchId) move(t.clientX, t.clientY); }, { passive: false });
    joystickEl.addEventListener('touchend', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === touchId) end(); }, { passive: false });
    joystickEl.addEventListener('touchcancel', end, { passive: false });

    fireBtn.addEventListener('touchstart', e => { e.preventDefault(); this.fire = true; }, { passive: false });
    fireBtn.addEventListener('touchend', e => { e.preventDefault(); this.fire = false; }, { passive: false });
    fireBtn.addEventListener('touchcancel', e => { this.fire = false; }, { passive: false });
  }
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp) { this._gpActive = false; return; }
    const btn = i => gp.buttons[i] && gp.buttons[i].pressed;
    // analog stick + d-pad combined into the joystick vector
    let gx = Math.abs(gp.axes[0] || 0) > 0.2 ? gp.axes[0] : 0;
    let gy = Math.abs(gp.axes[1] || 0) > 0.2 ? gp.axes[1] : 0;
    if (btn(14)) gx = -1; if (btn(15)) gx = 1;
    if (btn(12)) gy = -1; if (btn(13)) gy = 1;
    if (gx !== 0 || gy !== 0) { this.joy.active = true; this.joy.x = clamp(gx, -1, 1); this.joy.y = clamp(gy, -1, 1); this._gpActive = true; }
    else if (this._gpActive) { this.joy.active = false; this.joy.x = this.joy.y = 0; this._gpActive = false; }
    // fire on A / right trigger (separate flag so keyboard keyup doesn't fight it)
    this.gpFire = !!(btn(0) || btn(7));
    // pause on Start (edge-triggered)
    if (btn(9)) { if (!this._pausePressed) { this.game.togglePause(); this._pausePressed = true; } } else this._pausePressed = false;
  }
}

/* =========================================================================
   ACHIEVEMENTS
   ========================================================================= */
const ACHIEVEMENTS = {
  hundredKills: { name: '100 Enemies Destroyed', test: g => g.totalKills >= 100 },
  noDamage:     { name: 'No Damage Level', test: g => g.flawlessStage },
  bossHunter:   { name: 'Boss Hunter', test: g => g.bossesKilled >= 3 },
  spaceAce:     { name: 'Space Ace', test: g => g.score >= 50000 },
};

/* =========================================================================
   GAME — main controller, loop, state, screens, HUD, collisions.
   ========================================================================= */
class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioManager();
    this.input = new Input(this);
    this.particles = new ParticleSystem();
    this.player = new Player(this);
    this.level = new LevelManager(this);

    this.state = 'start';   // start | playing | paused | stage | boss-warning | over | victory
    this.mode = 'campaign';
    this.theme = localStorage.getItem('si-theme') || 'hd';

    this.highScore = parseInt(localStorage.getItem('si-highscore') || '0', 10);
    this.unlockedAch = JSON.parse(localStorage.getItem('si-ach') || '{}');

    this.shakeMag = 0; this.shakeTime = 0;
    this.toasts = [];
    this.stars = [];

    this._resetRun();
    this._setupCanvas();
    this._bindUI();
    this._updateHUD();
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  _resetRun() {
    this.score = 0;
    this.stage = 0;
    this.difficulty = 1;
    this.enemies = [];
    this.playerShots = [];
    this.enemyShots = [];
    this.powerups = [];
    this.boss = null;
    this.combo = 0; this.comboTimer = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    this.totalKills = 0; this.stageKills = 0;
    this.bossesKilled = 0;
    this.flawlessStage = true;
    this.newlyUnlocked = [];
  }

  /* ---------- Canvas scaling ---------- */
  _setupCanvas() {
    this.canvas.width = VW; this.canvas.height = VH;
    const fit = () => {
      const wrap = document.getElementById('game-wrapper');
      const sw = wrap.clientWidth, sh = wrap.clientHeight;
      const scale = Math.min(sw / VW, sh / VH);
      this.canvas.style.width = (VW * scale) + 'px';
      this.canvas.style.height = (VH * scale) + 'px';
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => setTimeout(fit, 200));
    this.buildStarfield('#0a2a3a');
  }

  buildStarfield(accent) {
    this.accent = accent;
    this.stars = [];
    // 3 parallax layers
    for (let layer = 0; layer < 3; layer++) {
      const count = 30 - layer * 6;
      for (let i = 0; i < count; i++) {
        this.stars.push({ x: rand(0, VW), y: rand(0, VH), layer, size: 1 + layer, speed: 20 + layer * 40 });
      }
    }
    // a few distant nebula blobs
    this.nebula = [];
    for (let i = 0; i < 4; i++) this.nebula.push({ x: rand(0, VW), y: rand(0, VH), r: rand(60, 140), speed: rand(8, 16) });
  }

  /* ---------- UI binding ---------- */
  _bindUI() {
    const $ = id => document.getElementById(id);
    $('btn-start').onclick = () => this.startGame();
    $('btn-resume').onclick = () => this.togglePause();
    $('btn-pause-restart').onclick = () => { this.startGame(); };
    $('btn-pause-quit').onclick = () => this.toMenu();
    $('btn-next').onclick = () => this.nextStage();
    $('btn-retry').onclick = () => this.startGame();
    $('btn-menu').onclick = () => this.toMenu();
    $('btn-win-menu').onclick = () => this.toMenu();
    $('pause-btn').onclick = () => this.togglePause();

    // mode buttons
    document.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => {
      document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); this.mode = b.dataset.mode;
    });
    // theme buttons
    document.querySelectorAll('.theme-btn').forEach(b => {
      if (b.dataset.theme === this.theme) { document.querySelectorAll('.theme-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }
      b.onclick = () => {
        document.querySelectorAll('.theme-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); this.theme = b.dataset.theme; localStorage.setItem('si-theme', this.theme);
      };
    });

    // audio controls (mirror both menu + pause)
    const syncMute = m => { this.audio.setMuted(m); $('chk-mute').checked = m; $('chk-mute2').checked = m; };
    const syncVol = v => { this.audio.setVolume(v / 100); $('vol-slider').value = v; $('vol-slider2').value = v; };
    const syncAuto = a => { this.input.autofire = a; $('chk-autofire').checked = a; $('chk-autofire2').checked = a; };
    $('chk-mute').onchange = e => syncMute(e.target.checked);
    $('chk-mute2').onchange = e => syncMute(e.target.checked);
    $('vol-slider').oninput = e => syncVol(+e.target.value);
    $('vol-slider2').oninput = e => syncVol(+e.target.value);
    $('chk-autofire').onchange = e => syncAuto(e.target.checked);
    $('chk-autofire2').onchange = e => syncAuto(e.target.checked);
    syncVol(60);

    // touch controls
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (this.isTouch) {
      this.input.bindTouch($('joystick'), $('joystick-knob'), $('fire-btn'));
      this.input.autofire = true;
      $('chk-autofire').checked = true; $('chk-autofire2').checked = true;
    }
    // prevent page scroll on touch
    document.addEventListener('touchmove', e => { if (this.state === 'playing') e.preventDefault(); }, { passive: false });
  }

  /* ---------- Screen helpers ---------- */
  show(id) { document.getElementById(id).classList.remove('hidden'); }
  hide(id) { document.getElementById(id).classList.add('hidden'); }
  hideAllScreens() {
    ['screen-start', 'screen-pause', 'screen-stage', 'screen-boss', 'screen-over', 'screen-victory'].forEach(s => this.hide(s));
  }

  /* ---------- State transitions ---------- */
  startGame() {
    this.audio.ensure(); this.audio.resume();
    this._resetRun();
    this.player.fullReset();
    this.stage = 0;
    this.difficulty = 1;
    this.level.start(0);
    this.hideAllScreens();
    this.show('hud');
    if (this.isTouch) this.show('touch-controls');
    this.state = 'playing';
    this.audio.startMusic(false);
    this._updateHUD();
  }

  toMenu() {
    this.state = 'start';
    this.audio.stopMusic();
    this.hideAllScreens();
    this.hide('hud'); this.hide('touch-controls');
    this.hide('boss-bar-wrap');
    this.show('screen-start');
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused'; this.show('screen-pause');
    } else if (this.state === 'paused') {
      this.state = 'playing'; this.hide('screen-pause');
    }
  }

  startBossWarning(type) {
    this.state = 'boss-warning';
    this.pendingBoss = type;
    const intros = { battleship: 'MECHANICAL BATTLESHIP', queen: 'ALIEN QUEEN', dreadnought: 'DREADNOUGHT CRUISER' };
    document.getElementById('boss-intro').textContent = intros[type] + ' APPROACHING';
    this.show('screen-boss');
    this.audio.stopMusic(); this.audio.startMusic(true);
    setTimeout(() => {
      if (this.state !== 'boss-warning') return;
      this.hide('screen-boss');
      this.spawnBoss(type);
      this.state = 'playing';
    }, 2600);
  }

  spawnBoss(type) {
    this.enemies = [];
    this.boss = new Boss(this, type);
    this.level.bossActive = true;
    this.show('boss-bar-wrap');
    document.getElementById('boss-name').textContent = this.boss.name;
  }

  onBossKilled(boss) {
    this.score += boss.score;
    this.bossesKilled++;
    this.boss = null;
    this.hide('boss-bar-wrap');
    this.level.onBossDefeated();
  }

  stageComplete() {
    this.state = 'stage';
    this.audio.stopMusic();
    const acc = this.shotsFired ? Math.min(100, Math.round(this.shotsHit / this.shotsFired * 100)) : 0;
    const bonus = this.stageKills * 50 + (this.flawlessStage ? 2000 : 0) + acc * 10;
    this.score += bonus;
    document.getElementById('stage-title').textContent = `STAGE ${this.stage + 1} COMPLETE`;
    document.getElementById('stat-kills').textContent = this.stageKills;
    document.getElementById('stat-acc').textContent = acc + '%';
    document.getElementById('stat-bonus').textContent = bonus + (this.flawlessStage ? '  (FLAWLESS!)' : '');
    this.checkAchievements();
    this.saveHigh();
    this._updateHUD();
    // last stage => victory
    if (this.stage + 1 >= STAGES.length) {
      document.getElementById('btn-next').textContent = 'CONTINUE';
    } else {
      document.getElementById('btn-next').textContent = 'NEXT STAGE';
    }
    this.show('screen-stage');
  }

  nextStage() {
    this.hide('screen-stage');
    if (this.stage + 1 >= STAGES.length) { this.victory(); return; }
    this.stage++;
    this.difficulty += 1;
    this.stageKills = 0;
    this.flawlessStage = true;
    this.enemyShots = []; this.playerShots = []; this.powerups = [];
    this.player.invuln = 1.2;
    this.level.start(this.stage);
    this.state = 'playing';
    this.audio.startMusic(false);
    this._updateHUD();
  }

  victory() {
    this.state = 'victory';
    this.audio.stopMusic();
    this.saveHigh();
    document.getElementById('win-score').textContent = this.score;
    document.getElementById('win-high').textContent = this.highScore;
    this.show('screen-victory');
  }

  gameOver() {
    this.state = 'over';
    this.audio.stopMusic();
    this.audio.gameover();
    this.checkAchievements();
    this.saveHigh();
    document.getElementById('over-score').textContent = this.score;
    document.getElementById('over-high').textContent = this.highScore;
    document.getElementById('over-stage').textContent = this.stage + 1;
    const box = document.getElementById('achievements-unlocked');
    box.innerHTML = this.newlyUnlocked.length ? '<div class="ach-badge">★ UNLOCKED:</div>' + this.newlyUnlocked.map(a => `<div class="ach-badge">${a}</div>`).join('') : '';
    this.hide('boss-bar-wrap');
    this.show('screen-over');
  }

  saveHigh() {
    if (this.score > this.highScore) { this.highScore = this.score; localStorage.setItem('si-highscore', String(this.highScore)); }
  }

  checkAchievements() {
    for (const key in ACHIEVEMENTS) {
      if (!this.unlockedAch[key] && ACHIEVEMENTS[key].test(this)) {
        this.unlockedAch[key] = true;
        this.newlyUnlocked.push(ACHIEVEMENTS[key].name);
        this.toast('★ ' + ACHIEVEMENTS[key].name);
      }
    }
    localStorage.setItem('si-ach', JSON.stringify(this.unlockedAch));
  }

  /* ---------- gameplay events ---------- */
  onEnemyKilled(enemy) {
    this.combo++; this.comboTimer = 2.5;
    const mult = 1 + Math.floor(this.combo / 5) * 0.5;
    this.score += Math.round(enemy.score * mult);
    this.totalKills++; this.stageKills++;
    // power-up drop chance
    if (Math.random() < 0.14) {
      const type = choice(POWERUP_TYPES.filter(t => t !== 'life' || Math.random() < 0.3));
      this.powerups.push(new PowerUp(this, enemy.x, enemy.y, type));
    }
    if (this.mode === 'endless' && this.totalKills % 15 === 0) this.difficulty += 0.5;
  }

  nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    const candidates = this.boss ? [this.boss, ...this.enemies] : this.enemies;
    for (const e of candidates) {
      const d = dist2(x, y, e.x + e.w / 2, e.y + e.h / 2);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  shake(mag, time) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeTime = Math.max(this.shakeTime, time); }
  toast(text) { this.toasts.push({ text, life: 1.6 }); if (this.toasts.length > 4) this.toasts.shift(); }

  /* ---------- main loop ---------- */
  loop(now) {
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.05) dt = 0.05; // clamp big frame gaps
    this.update(dt);
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt) {
    // starfield always animates
    this._updateStars(dt);
    if (this.shakeTime > 0) { this.shakeTime -= dt; if (this.shakeTime <= 0) this.shakeMag = 0; }
    // toasts
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter(t => t.life > 0);

    if (this.state !== 'playing') { this.particles.update(dt); return; }

    this.input.pollGamepad();

    // count shots fired for accuracy
    const before = this.playerShots.length;
    this.player.update(dt, this.input);
    const added = this.playerShots.length - before;
    if (added > 0) this.shotsFired += added;

    this.level.update(dt);

    // combo decay
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    for (const e of this.enemies) e.update(dt, this.player);
    if (this.boss) this.boss.update(dt, this.player);
    for (const p of this.playerShots) p.update(dt, this);
    for (const p of this.enemyShots) p.update(dt, this);
    for (const p of this.powerups) p.update(dt);
    this.particles.update(dt);

    this._collisions();

    this.enemies = this.enemies.filter(e => !e.dead);
    this.playerShots = this.playerShots.filter(p => !p.dead);
    this.enemyShots = this.enemyShots.filter(p => !p.dead);
    this.powerups = this.powerups.filter(p => !p.dead);

    this._updateHUD();
  }

  _collisions() {
    const p = this.player;
    // player shots vs enemies & boss
    for (const shot of this.playerShots) {
      if (shot.dead) continue;
      // boss
      if (this.boss && !this.boss.entering && rectsOverlap(shot.bounds, this.boss.bounds)) {
        this.boss.hurt(shot.damage); this.shotsHit++;
        if (shot.pierce > 0) shot.pierce--; else shot.dead = true;
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (rectsOverlap(shot.bounds, e.bounds)) {
          e.hurt(shot.damage); this.shotsHit++;
          if (shot.pierce > 0) shot.pierce--; else { shot.dead = true; break; }
        }
      }
    }
    // enemy shots vs player
    for (const shot of this.enemyShots) {
      if (shot.dead) continue;
      if (rectsOverlap(shot.bounds, p.bounds)) {
        shot.dead = true;
        if (p.damage(shot.damage)) { this.flawlessStage = false; return; }
        this.flawlessStage = false;
      }
    }
    // enemy bodies vs player
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (rectsOverlap(e.bounds, p.bounds)) {
        const dmg = e.kind === 'kamikaze' ? 35 : e.kind === 'asteroid' ? 25 : 20;
        e.destroy();
        if (p.damage(dmg)) { this.flawlessStage = false; return; }
        this.flawlessStage = false;
      }
    }
    // boss body vs player
    if (this.boss && !this.boss.entering && rectsOverlap(this.boss.bounds, p.bounds)) {
      if (p.damage(15)) { this.flawlessStage = false; return; }
      this.flawlessStage = false;
    }
    // powerups vs player
    for (const pu of this.powerups) {
      if (!pu.dead && rectsOverlap(pu.bounds, p.bounds)) { pu.apply(p); pu.dead = true; }
    }
  }

  /* ---------- stars ---------- */
  _updateStars(dt) {
    const moving = this.state === 'playing';
    for (const s of this.stars) {
      if (moving) s.x -= s.speed * dt;
      if (s.x < 0) { s.x = VW; s.y = rand(0, VH); }
    }
    if (this.nebula) for (const n of this.nebula) {
      if (moving) n.x -= n.speed * dt;
      if (n.x < -n.r) { n.x = VW + n.r; n.y = rand(0, VH); }
    }
  }

  /* ---------- HUD ---------- */
  _updateHUD() {
    const $ = id => document.getElementById(id);
    $('hud-score').textContent = this.score;
    $('hud-high').textContent = Math.max(this.highScore, this.score);
    $('hud-stage').textContent = this.mode === 'endless' ? '∞' : (this.stage + 1);
    $('hud-weapon').textContent = this.player.weapon.type;
    $('bar-hp').style.width = clamp(this.player.hp / this.player.maxHp * 100, 0, 100) + '%';
    $('bar-shield').style.width = clamp(this.player.shield / this.player.maxShield * 100, 0, 100) + '%';
    const lives = $('hud-lives');
    lives.innerHTML = '';
    for (let i = 0; i < this.player.lives; i++) { const s = document.createElement('span'); s.className = 'life-icon'; s.textContent = '▲'; lives.appendChild(s); }
    const cd = $('combo-display');
    if (this.combo >= 5) { cd.classList.remove('hidden'); cd.textContent = `COMBO x${(1 + Math.floor(this.combo / 5) * 0.5).toFixed(1)}`; }
    else cd.classList.add('hidden');
    if (this.boss) $('boss-bar').style.width = clamp(this.boss.hp / this.boss.maxHp * 100, 0, 100) + '%';
  }

  /* ---------- render ---------- */
  render() {
    const ctx = this.ctx;
    const cfg = STAGES[Math.min(this.stage, STAGES.length - 1)];
    // background
    ctx.fillStyle = this.theme === 'classic' ? '#0b1f0b' : (cfg ? cfg.bg : '#02060a');
    ctx.fillRect(0, 0, VW, VH);

    ctx.save();
    if (this.shakeMag > 0) ctx.translate(rand(-this.shakeMag, this.shakeMag), rand(-this.shakeMag, this.shakeMag));

    this._drawBackground(ctx);

    if (this.state !== 'start') {
      for (const pu of this.powerups) pu.draw(ctx);
      for (const e of this.enemies) e.draw(ctx);
      if (this.boss) this.boss.draw(ctx);
      for (const s of this.enemyShots) s.draw(ctx);
      for (const s of this.playerShots) s.draw(ctx);
      this.particles.draw(ctx);
      if (this.state === 'playing' || this.state === 'paused' || this.state === 'boss-warning') this.player.draw(ctx);
    } else {
      this.particles.draw(ctx);
    }

    ctx.restore();

    // classic mode green scanline overlay
    if (this.theme === 'classic') this._classicOverlay(ctx);

    // toasts
    this._drawToasts(ctx);
  }

  _drawBackground(ctx) {
    const classic = this.theme === 'classic';
    // nebula
    if (!classic && this.nebula) {
      for (const n of this.nebula) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, this.accent || '#0a2a3a'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.4; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // stars
    for (const s of this.stars) {
      ctx.fillStyle = classic ? '#3a6b2a' : (s.layer === 2 ? '#fff' : s.layer === 1 ? '#9fd' : '#567');
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  _classicOverlay(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
    for (let y = 0; y < VH; y += 3) ctx.fillRect(0, y, VW, 1);
    ctx.restore();
    // green tint
    ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = '#46f700'; ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }

  _drawToasts(ctx) {
    ctx.save();
    ctx.font = 'bold 18px "Courier New"'; ctx.textAlign = 'center';
    let y = VH / 2 - 40;
    for (const t of this.toasts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = '#ffd34d'; ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 8;
      ctx.fillText(t.text, VW / 2, y);
      y += 26;
    }
    ctx.restore();
  }
}

/* ---------- boot ---------- */
window.addEventListener('load', () => { window.game = new Game(); });
