/* ===========================================================================
   NEON PINBALL
   A complete browser pinball machine — HTML5 Canvas + Web Audio, no deps.

   Architecture (ES6 classes):
     Vec            - small 2D vector helpers
     Physics        - static collision helpers (circle/segment, circle/circle)
     AudioManager   - synthesized SFX + music via Web Audio
     ParticleSystem - sparks, bursts, trails
     Ball           - the steel ball
     Flipper        - rotating flipper with angular impulse transfer
     Bumper         - pop / power / multiplier bumpers
     Target         - drop / standup / spinner / rollover / sensor targets
     Wall           - static collision segment (+ slingshots)
     UIManager      - DOM HUD + screens
     Game           - orchestration, state machine, main loop

   Logical playfield is 480 x 880 units; the canvas is scaled to fit.
   Physics runs on a fixed timestep so behaviour is frame-rate independent.
   =========================================================================== */

'use strict';

/* ------------------------------------------------------------------ config */
const W = 480;          // logical playfield width
const H = 880;          // logical playfield height
const FIXED_DT = 1 / 120;   // physics step (seconds)
const MAX_STEPS = 5;        // clamp catch-up steps to avoid spiral of death
const GRAVITY = 1450;       // px/s^2 down the table
const BALL_R = 9;
const MAX_SPEED = 1500;     // velocity clamp keeps tunnelling away
const DRAIN_Y = 858;        // below this the ball is lost
const START_BALLS = 3;

/* ------------------------------------------------------------------ themes */
const THEMES = {
  cyber: {
    name: 'Cyberpunk',
    bg: '#05060f', accent: '#19f0ff', accent2: '#ff2bd6',
    table1: '#0a1230', table2: '#161a3a', wall: '#3df0ff', wallGlow: '#19f0ff',
    ball: '#dfe9ff', text: '#eaf6ff', muted: '#7d8bb0',
  },
  classic: {
    name: 'Classic Arcade',
    bg: '#15100a', accent: '#ffcf33', accent2: '#ff5a2b',
    table1: '#2a1c10', table2: '#3a2614', wall: '#ffcf33', wallGlow: '#ffae00',
    ball: '#f3efe6', text: '#fff4dc', muted: '#b59a6a',
  },
  space: {
    name: 'Space Adventure',
    bg: '#02040d', accent: '#7df9ff', accent2: '#a26bff',
    table1: '#070b22', table2: '#0d1535', wall: '#9bd0ff', wallGlow: '#5ea0ff',
    ball: '#e8f4ff', text: '#dff0ff', muted: '#6f7fb0',
  },
  pirate: {
    name: 'Pirate Treasure',
    bg: '#0a0f0c', accent: '#ffd24a', accent2: '#2fe39a',
    table1: '#0c241c', table2: '#123a2c', wall: '#ffd24a', wallGlow: '#c79a2a',
    ball: '#f5f0df', text: '#f3f7ea', muted: '#8aa48f',
  },
  retro: {
    name: 'Retro 80s',
    bg: '#0a0420', accent: '#ff4fd8', accent2: '#34d6ff',
    table1: '#1a0838', table2: '#2a0e52', wall: '#ff4fd8', wallGlow: '#ff79e6',
    ball: '#ffffff', text: '#ffe6fb', muted: '#9a7fc0',
  },
};
const THEME_ORDER = ['cyber', 'classic', 'space', 'pirate', 'retro'];

/* ------------------------------------------------------------------ Vec */
const Vec = {
  len(x, y) { return Math.hypot(x, y); },
  clampSpeed(v) {
    const s = Math.hypot(v.vx, v.vy);
    if (s > MAX_SPEED) { const k = MAX_SPEED / s; v.vx *= k; v.vy *= k; }
  },
};

/* ------------------------------------------------------------------ Physics */
class Physics {
  /* Closest point on segment AB to point P. */
  static closestOnSeg(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby || 1e-6;
    let t = ((px - ax) * abx + (py - ay) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: ax + abx * t, y: ay + aby * t, t };
  }

  /* Resolve ball vs a (thick) line segment. Returns contact normal or null. */
  static ballSegment(ball, ax, ay, bx, by, restitution, thickness = 0) {
    const c = Physics.closestOnSeg(ball.x, ball.y, ax, ay, bx, by);
    let nx = ball.x - c.x, ny = ball.y - c.y;
    let dist = Math.hypot(nx, ny);
    const min = ball.r + thickness;
    if (dist >= min) return null;
    if (dist < 1e-6) { // degenerate: push along segment normal
      const sx = bx - ax, sy = by - ay; const sl = Math.hypot(sx, sy) || 1;
      nx = -sy / sl; ny = sx / sl; dist = 0.01;
    }
    nx /= dist; ny /= dist;
    const pen = min - dist;
    ball.x += nx * pen; ball.y += ny * pen;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + restitution) * vn * nx;
      ball.vy -= (1 + restitution) * vn * ny;
    }
    return { nx, ny, point: c };
  }

  /* Resolve ball vs static circle (bumper). Returns normal or null. */
  static ballCircle(ball, cx, cy, cr, restitution, impulse = 0) {
    let nx = ball.x - cx, ny = ball.y - cy;
    let dist = Math.hypot(nx, ny);
    const min = ball.r + cr;
    if (dist >= min) return null;
    if (dist < 1e-6) { nx = 0; ny = -1; dist = 0.01; }
    nx /= dist; ny /= dist;
    ball.x = cx + nx * min; ball.y = cy + ny * min;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + restitution) * vn * nx;
      ball.vy -= (1 + restitution) * vn * ny;
    }
    ball.vx += nx * impulse; ball.vy += ny * impulse;
    return { nx, ny };
  }
}

/* ------------------------------------------------------------------ Audio */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.65;
    this.master = null;
    this.musicGain = null;
    this.musicNodes = [];
    this.musicTimer = null;
    this.musicStep = 0;
    this.mode = 'normal';
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }
  setVolume(v) { this.volume = v; if (this.master && !this.muted) this.master.gain.value = v; }

  /* Generic synth blip. */
  blip(freq, dur, type = 'square', gain = 0.3, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, gain = 0.25, hp = 800) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
  }
  // Named effects -------------------------------------------------------
  flipper() { this.blip(180, 0.05, 'square', 0.18, 90); }
  bumper()  { this.blip(520, 0.09, 'square', 0.22, 240); }
  power()   { this.blip(660, 0.14, 'sawtooth', 0.25, 180); this.noise(0.08, 0.12); }
  wall()    { this.blip(140, 0.04, 'triangle', 0.10, 100); }
  target()  { this.blip(880, 0.07, 'square', 0.2, 660); }
  drop()    { this.blip(1040, 0.10, 'square', 0.22, 520); }
  spinner() { this.blip(1300, 0.03, 'square', 0.10); }
  ramp()    { this.blip(440, 0.18, 'sawtooth', 0.2, 1100); }
  lane()    { this.blip(990, 0.06, 'sine', 0.16, 1320); }
  plunger() { this.blip(120, 0.25, 'sawtooth', 0.25, 420); }
  launch()  { this.blip(220, 0.3, 'sawtooth', 0.28, 880); this.noise(0.12, 0.12, 400); }
  extra()   { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'square', 0.22), i * 90)); }
  jackpot() { [784, 988, 1318, 1568].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'sawtooth', 0.24), i * 70)); }
  multiball(){ [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'square', 0.25), i * 100)); }
  drain()   { this.blip(300, 0.5, 'sine', 0.25, 70); }
  gameover(){ [440, 392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.35, 'triangle', 0.22), i * 180)); }

  // Simple generative background loop ----------------------------------
  startMusic(mode = 'normal') {
    this.ensure();
    if (!this.ctx) return;
    this.mode = mode;
    this.stopMusic();
    const scales = {
      normal: [196, 220, 262, 294, 330, 392],
      multiball: [262, 330, 392, 523, 659],
      wizard: [330, 392, 494, 587, 698, 880],
    };
    const scale = scales[mode] || scales.normal;
    const tempo = mode === 'normal' ? 260 : 170;
    this.musicStep = 0;
    const tick = () => {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const root = scale[this.musicStep % scale.length];
      // bass
      this._note(root / 2, 0.22, 'triangle', 0.5, t);
      // arp
      if (this.musicStep % 2 === 0)
        this._note(root * 2, 0.12, 'square', 0.25, t + 0.05);
      this.musicStep++;
    };
    tick();
    this.musicTimer = setInterval(tick, tempo);
  }
  _note(freq, dur, type, gain, t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}

/* ------------------------------------------------------------------ Particles */
class ParticleSystem {
  constructor() { this.parts = []; }
  burst(x, y, color, count = 12, speed = 240, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life, color, size: 1.5 + Math.random() * 2.5,
      });
    }
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 600 * dt; p.vx *= 0.96; p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
  }
  draw(ctx) {
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ Ball */
class Ball {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = BALL_R;
    this.trail = [];
    this.dead = false;
    this.inLane = true;     // sitting in the plunger lane
    this.fed = false;       // has the shooter-lane feed delivered it to the field
    this.spin = 0;
  }
  integrate(dt) {
    this.vy += GRAVITY * dt;
    // light rolling friction / air drag
    this.vx *= 0.9995; this.vy *= 0.9995;
    Vec.clampSpeed(this);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += this.vx * dt * 0.05;
  }
  pushTrail() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 12) this.trail.shift();
  }
}

/* ------------------------------------------------------------------ Flipper */
class Flipper {
  constructor(opts) {
    this.px = opts.px; this.py = opts.py;
    this.len = opts.len;
    this.width = opts.width || 9;
    this.restAngle = opts.restAngle;
    this.activeAngle = opts.activeAngle;
    this.angle = opts.restAngle;
    this.angVel = 0;
    this.up = false;
    this.side = opts.side; // 'L' or 'R'
    this.speed = 26; // rad/s flip speed
  }
  setUp(v) { this.up = v; }
  update(dt) {
    const target = this.up ? this.activeAngle : this.restAngle;
    const prev = this.angle;
    const diff = target - this.angle;
    const step = this.speed * dt;
    if (Math.abs(diff) <= step) this.angle = target;
    else this.angle += Math.sign(diff) * step;
    this.angVel = (this.angle - prev) / dt;
  }
  tip() { return { x: this.px + Math.cos(this.angle) * this.len, y: this.py + Math.sin(this.angle) * this.len }; }
  collide(ball, audio) {
    const tip = this.tip();
    const c = Physics.closestOnSeg(ball.x, ball.y, this.px, this.py, tip.x, tip.y);
    let nx = ball.x - c.x, ny = ball.y - c.y;
    let dist = Math.hypot(nx, ny);
    const min = ball.r + this.width;
    if (dist >= min) return false;
    if (dist < 1e-6) { nx = 0; ny = -1; dist = 0.01; }
    nx /= dist; ny /= dist;
    const pen = min - dist;
    ball.x += nx * pen; ball.y += ny * pen;

    // surface velocity at contact due to rotation: v = omega x r
    const rx = c.x - this.px, ry = c.y - this.py;
    const surfVx = -this.angVel * ry;
    const surfVy = this.angVel * rx;

    // relative normal velocity (ball relative to moving flipper)
    const relVn = (ball.vx - surfVx) * nx + (ball.vy - surfVy) * ny;
    const rest = 0.35;
    if (relVn < 0) {
      ball.vx -= (1 + rest) * relVn * nx;
      ball.vy -= (1 + rest) * relVn * ny;
    }
    // extra kick when actively flipping toward the ball
    if (this.up && Math.abs(this.angVel) > 4) {
      const kick = Math.min(Math.abs(this.angVel) * this.len * 0.016, 16);
      ball.vx += nx * kick * 36;
      ball.vy += ny * kick * 36;
    }
    Vec.clampSpeed(ball);
    return true;
  }
  draw(ctx, theme) {
    const tip = this.tip();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.wall;
    ctx.shadowColor = theme.wallGlow;
    ctx.shadowBlur = 12;
    ctx.lineWidth = this.width * 2;
    ctx.beginPath();
    ctx.moveTo(this.px, this.py);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = theme.accent2;
    ctx.beginPath(); ctx.arc(this.px, this.py, this.width * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ Bumper */
class Bumper {
  constructor(x, y, r, kind, theme) {
    this.x = x; this.y = y; this.r = r;
    this.kind = kind; // 'pop' | 'power' | 'mult'
    this.flash = 0;
    this.base = { pop: 100, power: 500, mult: 250 }[kind];
  }
  collide(ball, game) {
    const restitution = this.kind === 'power' ? 1.05 : 0.95;
    const impulse = this.kind === 'power' ? 360 : 260;
    const n = Physics.ballCircle(ball, this.x, this.y, this.r, restitution, impulse);
    if (!n) return false;
    this.flash = 1;
    game.onBumper(this, ball);
    return true;
  }
  update(dt) { if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4); }
  draw(ctx, theme) {
    const col = this.kind === 'power' ? theme.accent2 : this.kind === 'mult' ? '#ffd24a' : theme.accent;
    const pulse = 1 + this.flash * 0.25;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pulse, pulse);
    // outer ring
    ctx.shadowColor = col; ctx.shadowBlur = 14 + this.flash * 20;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.stroke();
    // cap
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.5 + this.flash * 0.5;
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.kind === 'power' ? '★' : this.kind === 'mult' ? '×' : '', 0, 0);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ Target */
class Target {
  /* kind: 'drop' | 'standup' | 'spinner' | 'rollover' | 'ramp' */
  constructor(opts) {
    Object.assign(this, opts);
    this.down = false;        // drop targets
    this.lit = false;         // rollovers / sensors
    this.flash = 0;
    this.cooldown = 0;        // spinner / sensor debounce
    this.spinAngle = 0;
    this.spinVel = 0;
  }
  update(dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.kind === 'spinner') { this.spinAngle += this.spinVel * dt; this.spinVel *= 0.96; }
  }
  collide(ball, game) {
    if (this.kind === 'drop' && this.down) return false;

    if (this.kind === 'standup' || this.kind === 'drop') {
      const n = Physics.ballSegment(ball, this.ax, this.ay, this.bx, this.by, 0.6, this.thick || 5);
      if (!n) return false;
      this.flash = 1;
      if (this.kind === 'drop') { this.down = true; }
      game.onTarget(this, ball);
      return true;
    }

    // sensor-style (spinner, rollover, ramp): proximity, no physical bounce
    const c = Physics.closestOnSeg(ball.x, ball.y, this.ax, this.ay, this.bx, this.by);
    const dist = Math.hypot(ball.x - c.x, ball.y - c.y);
    if (dist < ball.r + (this.thick || 10) && this.cooldown <= 0) {
      this.cooldown = this.kind === 'spinner' ? 0.05 : 0.35;
      this.flash = 1;
      if (this.kind === 'spinner') this.spinVel = Math.max(this.spinVel, 14);
      game.onTarget(this, ball);
      return true;
    }
    return false;
  }
  draw(ctx, theme) {
    ctx.save();
    if (this.kind === 'drop') {
      const col = this.down ? 'rgba(120,130,160,0.25)' : theme.accent;
      ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.lineCap = 'round';
      if (!this.down) { ctx.shadowColor = col; ctx.shadowBlur = 8 + this.flash * 14; }
      ctx.globalAlpha = this.down ? 0.4 : 1;
      ctx.beginPath(); ctx.moveTo(this.ax, this.ay); ctx.lineTo(this.bx, this.by); ctx.stroke();
    } else if (this.kind === 'standup') {
      const col = theme.accent2;
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.shadowColor = col; ctx.shadowBlur = 8 + this.flash * 16;
      ctx.beginPath(); ctx.moveTo(this.ax, this.ay); ctx.lineTo(this.bx, this.by); ctx.stroke();
    } else if (this.kind === 'spinner') {
      const mx = (this.ax + this.bx) / 2, my = (this.ay + this.by) / 2;
      const dx = (this.bx - this.ax) / 2, dy = (this.by - this.ay) / 2;
      const s = Math.abs(Math.cos(this.spinAngle));
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(this.ax, this.ay); ctx.lineTo(this.bx, this.by); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.shadowColor = theme.accent; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(mx - dx * s, my - dy * s); ctx.lineTo(mx + dx * s, my + dy * s); ctx.stroke();
    } else if (this.kind === 'rollover') {
      const col = this.lit ? theme.accent : 'rgba(255,255,255,0.3)';
      ctx.fillStyle = col;
      if (this.lit) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
      const mx = (this.ax + this.bx) / 2, my = (this.ay + this.by) / 2;
      ctx.beginPath(); ctx.ellipse(mx, my, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = this.lit ? '#04111a' : '#fff';
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.label || '', mx, my);
    } else if (this.kind === 'ramp') {
      const col = this.lit ? theme.accent2 : theme.accent;
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
      ctx.shadowColor = col; ctx.shadowBlur = 8 + this.flash * 16;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(this.ax, this.ay); ctx.lineTo(this.bx, this.by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('RAMP ▲', (this.ax + this.bx) / 2, this.ay - 6);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ Wall */
class Wall {
  constructor(ax, ay, bx, by, opts = {}) {
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    this.rest = opts.rest ?? 0.55;
    this.thick = opts.thick ?? 0;
    this.sling = opts.sling || false; // slingshot kicks the ball
    this.hidden = opts.hidden || false;
    this.flash = 0;
  }
  collide(ball, game) {
    const n = Physics.ballSegment(ball, this.ax, this.ay, this.bx, this.by, this.rest, this.thick);
    if (!n) return false;
    if (this.sling) {
      const kick = 300;
      ball.vx += n.nx * kick; ball.vy += n.ny * kick;
      Vec.clampSpeed(ball);
      this.flash = 1;
      game.onSling(this, ball);
    } else {
      game.onWall(ball);
    }
    return true;
  }
  update(dt) { if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5); }
  draw(ctx, theme) {
    if (this.hidden) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = (this.thick || 3) + 2;
    ctx.strokeStyle = this.sling ? theme.accent2 : theme.wall;
    ctx.shadowColor = this.sling ? theme.accent2 : theme.wallGlow;
    ctx.shadowBlur = this.sling ? 8 + this.flash * 18 : 8;
    ctx.beginPath(); ctx.moveTo(this.ax, this.ay); ctx.lineTo(this.bx, this.by); ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ UIManager */
class UIManager {
  constructor() {
    this.score = document.getElementById('hud-score');
    this.high = document.getElementById('hud-high');
    this.ball = document.getElementById('hud-ball');
    this.mult = document.getElementById('hud-mult');
    this.modes = document.getElementById('hud-modes');
    this.announce = document.getElementById('announce');
    this.announceText = document.getElementById('announce-text');
    this.ticker = document.getElementById('ticker');
    this._tickTimer = null;
    this._annTimer = null;
  }
  setScore(v) { this.score.textContent = v.toLocaleString(); }
  setHigh(v) { this.high.textContent = v.toLocaleString(); }
  setBall(v) { this.ball.textContent = v; }
  setMult(v) { this.mult.textContent = 'x' + v; }
  setModes(list) {
    this.modes.innerHTML = '';
    for (const m of list) {
      const el = document.createElement('div');
      el.className = 'mode-chip'; el.textContent = m;
      this.modes.appendChild(el);
    }
  }
  flashAnnounce(text, ms = 1600) {
    this.announceText.textContent = text;
    this.announce.classList.remove('hidden');
    // restart animation
    this.announceText.style.animation = 'none';
    void this.announceText.offsetWidth;
    this.announceText.style.animation = '';
    clearTimeout(this._annTimer);
    this._annTimer = setTimeout(() => this.announce.classList.add('hidden'), ms);
  }
  showTicker(text, ms = 1400) {
    this.ticker.textContent = text;
    this.ticker.classList.remove('hidden');
    clearTimeout(this._tickTimer);
    this._tickTimer = setTimeout(() => this.ticker.classList.add('hidden'), ms);
  }
}

/* ------------------------------------------------------------------ Game */
class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ui = new UIManager();
    this.audio = new AudioManager();
    this.particles = new ParticleSystem();

    this.themeKey = localStorage.getItem('np_theme') || 'cyber';
    this.theme = THEMES[this.themeKey];

    this.state = 'start'; // start | playing | paused | over
    this.balls = [];
    this.lastTime = 0;
    this.acc = 0;
    this.shake = 0;
    this.popups = []; // floating score numbers

    this.highScore = parseInt(localStorage.getItem('np_high') || '0', 10);

    this.applyTheme(this.themeKey);
    this.buildTable();
    this.resetGameVars();
    this.setupDPR();
    this.bindUI();
    this.bindInput();
    this.detectTouch();

    this.ui.setHigh(this.highScore);
    requestAnimationFrame((t) => this.loop(t));
  }

  /* --------------------------------------------------- game-level state */
  resetGameVars() {
    this.score = 0;
    this.ballNum = 1;
    this.ballsLeft = START_BALLS;
    this.multiplier = 1;
    this.combo = 0;
    this.comboTimer = 0;
    this.modes = new Set();      // active mode labels
    this.ballSave = 0;           // seconds of ball-save remaining
    this.multiballActive = false;
    this.jackpotReady = false;
    this.bonusTimer = 0;
    this.wizardTimer = 0;
    this.rampCount = 0;
    this.lockCount = 0;          // toward multiball
    this.objectivesDone = 0;
    this.plungerPower = 0;
    this.plungerPulling = false;
    this.skillShotActive = false;
    this._extraGiven = false;
    this._bonusMult = 1;
    this._achieved = new Set();
    this.balls = [];
    this.particles.parts = [];
    this.popups = [];
    this.resetTargets();
    this.refreshHUD();
  }

  resetTargets() {
    for (const t of this.targets) { t.down = false; t.lit = false; }
    this.dropRemaining = this.targets.filter((t) => t.kind === 'drop').length;
    this.lanesLit = 0;
  }

  /* --------------------------------------------------- table geometry */
  buildTable() {
    this.walls = [];
    this.bumpers = [];
    this.targets = [];
    this.flippers = [];

    const wall = (a, b, c, d, o) => this.walls.push(new Wall(a, b, c, d, o));

    // Outer cabinet ----------------------------------------------------
    wall(16, 46, 300, 70);                   // main ceiling (slightly sloped)
    wall(300, 70, 464, 150, { rest: 0.5 });  // lane roof: deflects launched ball into field
    wall(16, 46, 16, 640);                   // left wall
    wall(464, 150, 464, 858);                // right cabinet wall
    wall(440, 858, 440, 140);                // plunger lane inner wall
    wall(440, 858, 464, 858);                // lane floor

    // Lower funnels (toward flippers) ----------------------------------
    wall(16, 640, 96, 800, { rest: 0.4 });     // left outer funnel
    wall(440, 640, 372, 760, { rest: 0.4 });   // right outer funnel (above lane wall already there)
    wall(372, 760, 348, 800, { rest: 0.4 });

    // Inner lane guides (separate outlane / inlane) --------------------
    wall(120, 690, 150, 792, { rest: 0.3 });   // left inner rail
    wall(348, 690, 322, 792, { rest: 0.3 });   // right inner rail

    // Slingshots above flippers ----------------------------------------
    wall(150, 716, 168, 770, { sling: true, rest: 0.9 });
    wall(330, 716, 312, 770, { sling: true, rest: 0.9 });

    // A couple of upper guide rails for shaping shots ------------------
    wall(60, 170, 120, 135, { rest: 0.5 });
    wall(420, 170, 360, 135, { rest: 0.5 });

    // Flippers ---------------------------------------------------------
    this.flipperL = new Flipper({ px: 158, py: 792, len: 74, side: 'L', restAngle: 0.30, activeAngle: -0.55 });
    this.flipperR = new Flipper({ px: 322, py: 792, len: 74, side: 'R', restAngle: Math.PI - 0.30, activeAngle: Math.PI + 0.55 });
    this.flippers.push(this.flipperL, this.flipperR);

    // Bumpers ----------------------------------------------------------
    this.bumpers.push(new Bumper(150, 250, 26, 'pop'));
    this.bumpers.push(new Bumper(258, 210, 26, 'pop'));
    this.bumpers.push(new Bumper(206, 320, 26, 'pop'));
    this.bumpers.push(new Bumper(338, 296, 28, 'power'));
    this.bumpers.push(new Bumper(96, 360, 22, 'mult'));

    // Drop targets bank (left) -----------------------------------------
    const T = (o) => this.targets.push(new Target(o));
    T({ kind: 'drop', ax: 52, ay: 430, bx: 52, by: 460, base: 500 });
    T({ kind: 'drop', ax: 52, ay: 468, bx: 52, by: 498, base: 500 });
    T({ kind: 'drop', ax: 52, ay: 506, bx: 52, by: 536, base: 500 });

    // Stand-up targets -------------------------------------------------
    T({ kind: 'standup', ax: 408, ay: 380, bx: 408, by: 412, base: 300 });
    T({ kind: 'standup', ax: 408, ay: 440, bx: 408, by: 472, base: 300 });

    // Spinner (right lane) ---------------------------------------------
    T({ kind: 'spinner', ax: 408, ay: 190, bx: 408, by: 230, base: 60 });

    // Top rollover lanes (skill + P-I-N) -------------------------------
    T({ kind: 'rollover', ax: 100, ay: 120, bx: 120, by: 120, label: 'P', base: 250 });
    T({ kind: 'rollover', ax: 200, ay: 112, bx: 220, by: 112, label: 'I', base: 250 });
    T({ kind: 'rollover', ax: 300, ay: 120, bx: 320, by: 120, label: 'N', base: 250 });

    // Ramp sensor (upper-left) -----------------------------------------
    T({ kind: 'ramp', ax: 70, ay: 200, bx: 110, by: 200, base: 1000,
        returnX: 300, returnY: 690, returnVx: -40, returnVy: 220 });

    this.dropRemaining = 3;
    this.lanesLit = 0;
  }

  /* --------------------------------------------------- DPR / sizing */
  setupDPR() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.scale = this.canvas.width / W; // logical->device
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  }

  detectTouch() {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add('touch');
    }
  }

  /* --------------------------------------------------- theme */
  applyTheme(key) {
    this.themeKey = key; this.theme = THEMES[key];
    const t = this.theme;
    const r = document.documentElement.style;
    r.setProperty('--bg', t.bg);
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent-2', t.accent2);
    r.setProperty('--text', t.text);
    r.setProperty('--muted', t.muted);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
    localStorage.setItem('np_theme', key);
  }

  /* --------------------------------------------------- UI wiring */
  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('btn-play').addEventListener('click', () => this.startGame());
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-resume').addEventListener('click', () => this.togglePause());
    $('btn-restart').addEventListener('click', () => this.startGame());
    $('btn-retry').addEventListener('click', () => this.startGame());
    $('btn-menu').addEventListener('click', () => this.toMenu());

    // theme swatches on start screen
    const list = $('theme-list');
    const select = $('opt-theme');
    THEME_ORDER.forEach((key) => {
      const t = THEMES[key];
      const sw = document.createElement('div');
      sw.className = 'theme-swatch' + (key === this.themeKey ? ' active' : '');
      sw.style.background = `linear-gradient(135deg, ${t.accent}, ${t.accent2})`;
      sw.title = t.name;
      sw.addEventListener('click', () => {
        this.applyTheme(key);
        [...list.children].forEach((c) => c.classList.remove('active'));
        sw.classList.add('active');
        select.value = key;
      });
      list.appendChild(sw);

      const opt = document.createElement('option');
      opt.value = key; opt.textContent = t.name;
      select.appendChild(opt);
    });
    select.value = this.themeKey;
    select.addEventListener('change', () => {
      this.applyTheme(select.value);
      [...list.children].forEach((c, i) => c.classList.toggle('active', THEME_ORDER[i] === select.value));
    });

    // audio settings
    const mute = $('opt-mute'), vol = $('opt-volume');
    mute.addEventListener('change', () => this.audio.setMuted(!mute.checked));
    vol.addEventListener('input', () => this.audio.setVolume(parseInt(vol.value, 10) / 100));
  }

  /* --------------------------------------------------- input */
  bindInput() {
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', ' ', 'spacebar'].includes(k)) e.preventDefault();
      if (k === 'arrowleft' || k === 'z') this.setFlipper('L', true);
      if (k === 'arrowright' || k === 'x') this.setFlipper('R', true);
      if (k === ' ' || k === 'spacebar') this.plungerDown();
      if (k === 'p') this.togglePause();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'z') this.setFlipper('L', false);
      if (k === 'arrowright' || k === 'x') this.setFlipper('R', false);
      if (k === ' ' || k === 'spacebar') this.plungerRelease();
    });

    // Touch flippers
    const tl = document.getElementById('touch-left');
    const tr = document.getElementById('touch-right');
    const bind = (el, side) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.setFlipper(side, true); this.haptic(8); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); this.setFlipper(side, false); }, { passive: false });
      el.addEventListener('touchcancel', () => this.setFlipper(side, false));
    };
    bind(tl, 'L'); bind(tr, 'R');

    // Touch plunger: drag anywhere in lower-right launcher area
    let dragStart = null;
    this.canvas.addEventListener('touchstart', (e) => {
      const p = this.toLogical(e.touches[0]);
      if (p.x > 360 && p.y > 600) { dragStart = p.y; this.plungerDown(); e.preventDefault(); }
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      if (dragStart != null) {
        const p = this.toLogical(e.touches[0]);
        this.plungerPower = Math.max(0, Math.min(1, (p.y - dragStart) / 140));
        e.preventDefault();
      }
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => { if (dragStart != null) { dragStart = null; this.plungerRelease(); } });

    // resume audio on first gesture
    const wake = () => { this.audio.ensure(); window.removeEventListener('pointerdown', wake); };
    window.addEventListener('pointerdown', wake);
  }
  toLogical(touch) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (touch.clientX - rect.left) / rect.width * W, y: (touch.clientY - rect.top) / rect.height * H };
  }
  haptic(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

  setFlipper(side, v) {
    if (this.state !== 'playing') return;
    const f = side === 'L' ? this.flipperL : this.flipperR;
    if (v && !f.up) this.audio.flipper();
    f.setUp(v);
  }
  plungerDown() {
    if (this.state !== 'playing') return;
    const b = this.balls.find((x) => x.inLane);
    if (b) { this.plungerPulling = true; this.audio.plunger(); }
  }
  plungerRelease() {
    if (!this.plungerPulling) return;
    this.plungerPulling = false;
    const b = this.balls.find((x) => x.inLane);
    if (b) {
      const power = Math.max(0.25, this.plungerPower);
      // tuned so even a soft plunge clears the lane, while power adds reach
      b.vy = -1410 - power * 90;
      b.vx = -20;
      b.inLane = false;
      this.audio.launch();
      this.haptic(20);
      // Skill shot window
      this.skillShotActive = true;
      setTimeout(() => { this.skillShotActive = false; }, 2500);
    }
    this.plungerPower = 0;
  }

  /* --------------------------------------------------- state machine */
  startGame() {
    this.audio.ensure();
    this.resetGameVars();
    this.hideAllScreens();
    this.state = 'playing';
    this.spawnBall();
    this.audio.startMusic('normal');
    this.ui.showTicker('PULL PLUNGER TO LAUNCH', 1800);
  }
  toMenu() {
    this.state = 'start';
    this.audio.stopMusic();
    this.hideAllScreens();
    document.getElementById('screen-start').classList.remove('hidden');
  }
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('screen-pause').classList.remove('hidden');
      this.audio.stopMusic();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('screen-pause').classList.add('hidden');
      this.audio.startMusic(this.multiballActive ? 'multiball' : this.modes.has('WIZARD') ? 'wizard' : 'normal');
    }
  }
  hideAllScreens() {
    ['screen-start', 'screen-pause', 'screen-over'].forEach((id) =>
      document.getElementById(id).classList.add('hidden'));
  }

  spawnBall() {
    const b = new Ball(452, 820);
    b.inLane = true;
    this.balls.push(b);
    this.ballSave = 6; // ball-save after launch
  }

  loseBall(ball) {
    const idx = this.balls.indexOf(ball);
    if (idx >= 0) this.balls.splice(idx, 1);
    this.particles.burst(ball.x, ball.y, '#8898c0', 16, 200, 0.6);

    if (this.balls.length > 0) {
      // still balls in play (multiball) — just removed one
      if (this.multiballActive && this.balls.length === 1) {
        this.endMultiball();
      }
      return;
    }

    // No balls left in play
    this.audio.drain();
    if (this.ballSave > 0) {
      this.ui.showTicker('BALL SAVED', 1200);
      this.spawnBall();
      return;
    }

    this.ballsLeft--;
    this.applyBonusCount();
    if (this.ballsLeft <= 0) {
      this.gameOver();
    } else {
      this.ballNum++;
      this.multiplier = 1;
      this.spawnBall();
      this.refreshHUD();
      this.ui.showTicker('BALL ' + this.ballNum, 1200);
    }
  }

  applyBonusCount() {
    // end-of-ball bonus from lit lanes & combos
    const bonus = (this.lanesLit * 1000 + this.combo * 200) * this.multiplier;
    if (bonus > 0) { this.addScore(bonus, 240, 700, 'BONUS'); }
  }

  gameOver() {
    this.state = 'over';
    this.audio.stopMusic();
    this.audio.gameover();
    const newHigh = this.score > this.highScore;
    if (newHigh) {
      this.highScore = this.score;
      localStorage.setItem('np_high', String(this.highScore));
    }
    document.getElementById('final-score').textContent = this.score.toLocaleString();
    document.getElementById('final-high').textContent = this.highScore.toLocaleString();
    document.getElementById('final-new').classList.toggle('hidden', !newHigh);
    document.getElementById('screen-over').classList.remove('hidden');
    this.ui.setHigh(this.highScore);
  }

  /* --------------------------------------------------- scoring */
  addScore(points, x, y, label) {
    const total = Math.round(points * (this._bonusMult || 1));
    this.score += total;
    if (this.score > this.highScore) { this.highScore = this.score; this.ui.setHigh(this.highScore); }
    this.ui.setScore(this.score);
    if (x != null) {
      this.popups.push({ x, y, text: (label ? label + ' ' : '') + '+' + total.toLocaleString(),
        life: 1, vy: -40 });
    }
  }
  bumpCombo() {
    this.combo++;
    this.comboTimer = 3;
    if (this.combo >= 3) this.ui.showTicker('COMBO x' + this.combo + '!', 900);
    if (this.combo === 5) this.completeObjective('COMBO CHAMPION');
  }

  /* --------------------------------------------------- event callbacks */
  onWall(ball) { this.audio.wall(); }

  onSling(w, ball) {
    this.audio.bumper();
    this.addScore(50 * this.multiplier);
    this.particles.burst(ball.x, ball.y, this.theme.accent2, 8, 180, 0.4);
    this.haptic(6);
  }

  onBumper(b, ball) {
    this.haptic(8);
    this.bumpCombo();
    if (b.kind === 'power') {
      this.audio.power();
      this.addScore(b.base * this.multiplier, b.x, b.y, '');
      this.particles.burst(b.x, b.y, this.theme.accent2, 18, 280, 0.5);
      this.shake = Math.max(this.shake, 6);
    } else if (b.kind === 'mult') {
      this.audio.bumper();
      this.addScore(b.base * this.multiplier, b.x, b.y, '');
      this.bumpMultiplier();
      this.particles.burst(b.x, b.y, '#ffd24a', 14, 240, 0.5);
    } else {
      this.audio.bumper();
      this.addScore(b.base * this.multiplier);
      this.particles.burst(b.x, b.y, this.theme.accent, 10, 200, 0.4);
    }
    if (this.jackpotReady && Math.random() < 0.2) this.awardJackpot(b.x, b.y);
  }

  bumpMultiplier() {
    if (this.multiplier < 8) {
      this.multiplier++;
      this.refreshHUD();
      this.ui.showTicker('MULTIPLIER x' + this.multiplier, 1000);
    }
  }

  onTarget(t, ball) {
    this.haptic(8);
    switch (t.kind) {
      case 'drop': {
        this.audio.drop();
        this.addScore(t.base * this.multiplier, ball.x, ball.y, '');
        this.particles.burst(ball.x, ball.y, this.theme.accent, 12, 220, 0.5);
        this.bumpCombo();
        this.dropRemaining--;
        if (this.dropRemaining <= 0) this.onDropBankComplete();
        break;
      }
      case 'standup': {
        this.audio.target();
        this.addScore(t.base * this.multiplier, ball.x, ball.y, '');
        this.particles.burst(ball.x, ball.y, this.theme.accent2, 8, 180, 0.4);
        break;
      }
      case 'spinner': {
        this.audio.spinner();
        this.addScore(t.base * this.multiplier);
        break;
      }
      case 'rollover': {
        if (!t.lit) {
          t.lit = true;
          this.lanesLit++;
          this.audio.lane();
          this.addScore(t.base * this.multiplier, (t.ax + t.bx) / 2, t.ay, '');
          this.checkLanes();
        } else {
          this.addScore(100 * this.multiplier);
          this.audio.lane();
        }
        if (this.skillShotActive) this.awardSkillShot(ball);
        break;
      }
      case 'ramp': {
        this.audio.ramp();
        this.rampCount++;
        const pts = t.base * this.multiplier * (this.modes.has('WIZARD') ? 3 : 1);
        this.addScore(pts, (t.ax + t.bx) / 2, t.ay, 'RAMP');
        this.particles.burst(ball.x, ball.y, this.theme.accent2, 16, 260, 0.5);
        this.bumpCombo();
        this.shake = Math.max(this.shake, 4);
        // physically route the ball to the return lane
        ball.x = t.returnX; ball.y = t.returnY;
        ball.vx = t.returnVx; ball.vy = t.returnVy;
        if (this.jackpotReady) this.awardJackpot(ball.x, ball.y);
        if (this.rampCount === 3) this.completeObjective('COMBO MASTER', () => this.lightLock());
        if (this.rampCount % 5 === 0) this.bumpMultiplier();
        break;
      }
    }
  }

  onDropBankComplete() {
    this.audio.jackpot();
    this.addScore(5000 * this.multiplier, 52, 480, 'BANK');
    this.ui.flashAnnounce('BANK COMPLETE', 1300);
    this.shake = Math.max(this.shake, 6);
    this.lightLock();
    // reset the bank shortly after
    setTimeout(() => { this.resetDropBank(); }, 1000);
  }
  resetDropBank() {
    for (const t of this.targets) if (t.kind === 'drop') t.down = false;
    this.dropRemaining = this.targets.filter((t) => t.kind === 'drop').length;
  }

  checkLanes() {
    if (this.lanesLit >= 3) {
      this.audio.extra();
      this.ui.flashAnnounce('LANES COMPLETE', 1200);
      this.startBonusMode();
      // award an extra ball the first time
      if (!this._extraGiven) { this._extraGiven = true; this.awardExtraBall(); }
      // relight
      for (const t of this.targets) if (t.kind === 'rollover') t.lit = false;
      this.lanesLit = 0;
    }
  }

  awardSkillShot(ball) {
    this.skillShotActive = false;
    this.audio.jackpot();
    this.addScore(8000 * this.multiplier, ball.x, ball.y, 'SKILL');
    this.ui.flashAnnounce('SKILL SHOT!', 1300);
    this.shake = Math.max(this.shake, 7);
  }

  lightLock() {
    this.lockCount++;
    if (this.lockCount >= 2 && !this.multiballActive) {
      this.startMultiball();
    } else {
      this.jackpotReady = true;
      this.ui.showTicker('LOCK ' + this.lockCount + '/2 — JACKPOT LIT', 1400);
    }
  }

  /* --------------------------------------------------- special modes */
  startMultiball() {
    if (this.multiballActive) return;
    this.multiballActive = true;
    this.lockCount = 0;
    this.jackpotReady = true;
    this.modes.add('MULTIBALL');
    this.refreshHUD();
    this.audio.multiball();
    this.ui.flashAnnounce('MULTIBALL!', 1800);
    this.shake = Math.max(this.shake, 9);
    this.ballSave = 8;
    // spawn 2 extra balls near the existing one
    const src = this.balls[0] || new Ball(240, 400);
    for (let i = 0; i < 2; i++) {
      const b = new Ball(src.x + (i ? 30 : -30), src.y - 20);
      b.inLane = false;
      b.fed = true;
      b.vx = (i ? 120 : -120); b.vy = -200;
      this.balls.push(b);
    }
    this.audio.startMusic('multiball');
    this.completeObjective('MULTIBALL MASTER');
  }
  endMultiball() {
    this.multiballActive = false;
    this.modes.delete('MULTIBALL');
    this.jackpotReady = false;
    this.refreshHUD();
    this.audio.startMusic(this.modes.has('WIZARD') ? 'wizard' : 'normal');
    this.ui.showTicker('MULTIBALL OVER', 1200);
  }
  awardJackpot(x, y) {
    this.audio.jackpot();
    this.addScore(10000 * this.multiplier, x, y, 'JACKPOT');
    this.ui.flashAnnounce('JACKPOT!', 1200);
    this.shake = Math.max(this.shake, 7);
    this.particles.burst(x, y, '#ffd24a', 24, 320, 0.7);
    this.completeObjective('JACKPOT KING');
  }
  startBonusMode() {
    this.bonusTimer = 12;
    this.modes.add('2X BONUS');
    this.refreshHUD();
    this.ui.showTicker('2X BONUS — 12s', 1400);
  }
  awardExtraBall() {
    this.ballsLeft++;
    this.audio.extra();
    this.ui.flashAnnounce('EXTRA BALL', 1400);
    this.refreshHUD();
  }
  startWizardMode() {
    if (this.modes.has('WIZARD')) return;
    this.wizardTimer = 25;
    this.modes.add('WIZARD');
    this.refreshHUD();
    this.audio.multiball();
    this.ui.flashAnnounce('WIZARD MODE!', 2200);
    this.shake = Math.max(this.shake, 10);
    this.audio.startMusic('wizard');
    if (!this.multiballActive) this.startMultiball();
  }
  completeObjective(name, cb) {
    if (!this._achieved) this._achieved = new Set();
    if (!this._achieved.has(name)) {
      this._achieved.add(name);
      this.ui.showTicker('★ ' + name, 1500);
      this.objectivesDone++;
      if (this.objectivesDone >= 4) this.startWizardMode();
    }
    if (cb) cb();
  }

  /* --------------------------------------------------- HUD */
  refreshHUD() {
    this.ui.setScore(this.score);
    this.ui.setHigh(this.highScore);
    this.ui.setBall(this.ballsLeft);
    this.ui.setMult(this.multiplier);
    this.ui.setModes([...this.modes]);
  }

  /* --------------------------------------------------- main loop */
  loop(t) {
    const now = t / 1000;
    let frameDt = now - (this.lastTime || now);
    this.lastTime = now;
    if (frameDt > 0.25) frameDt = 0.25; // tab was backgrounded

    if (this.state === 'playing') {
      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_STEPS) {
        this.physicsStep(FIXED_DT);
        this.acc -= FIXED_DT; steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.updateTimers(frameDt);
    }
    // visuals advance even when paused-ish but we gate by state
    this.particles.update(this.state === 'playing' ? frameDt : 0);
    this.updatePopups(this.state === 'playing' ? frameDt : 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - frameDt * 30);

    this.render();
    requestAnimationFrame((tt) => this.loop(tt));
  }

  updateTimers(dt) {
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
    if (this.ballSave > 0) this.ballSave -= dt;
    if (this.bonusTimer > 0) {
      this.bonusTimer -= dt;
      this._bonusMult = 2;
      if (this.bonusTimer <= 0) { this.modes.delete('2X BONUS'); this.refreshHUD(); this._bonusMult = 1; }
    } else this._bonusMult = 1;
    if (this.wizardTimer > 0) {
      this.wizardTimer -= dt;
      if (this.wizardTimer <= 0) { this.modes.delete('WIZARD'); this.refreshHUD();
        this.audio.startMusic(this.multiballActive ? 'multiball' : 'normal'); }
    }
  }

  physicsStep(dt) {
    // plunger charging
    if (this.plungerPulling && this.plungerPower < 1) this.plungerPower = Math.min(1, this.plungerPower + dt * 1.4);

    for (const b of this.balls) {
      if (b.inLane) {
        // held in the lane; gentle settle at the bottom
        b.vx = 0; b.vy = 0; b.x = 452; b.y = 820;
        b.pushTrail();
        continue;
      }
      b.integrate(dt);

      // Shooter-lane auto-feed: once a launched ball rises to the top of the
      // lane, the curved guide delivers it into the playfield. This is robust
      // for every launch strength (soft plunges still enter play).
      if (!b.fed && b.x > 442 && b.vy < 0 && b.y < 185) {
        b.fed = true;
        const sp = Math.min(1, Math.hypot(b.vx, b.vy) / MAX_SPEED);
        b.x = 414; b.y = 158;
        b.vx = -130 - sp * 170;   // stronger plunge -> deeper into the field
        b.vy = 70;
        this.audio.lane();
      }

      // collide with everything
      for (const w of this.walls) w.collide(b, this);
      for (const bp of this.bumpers) bp.collide(b, this);
      for (const tg of this.targets) tg.collide(b, this);
      this.flipperL.collide(b, this.audio) && this._flipHit(b);
      this.flipperR.collide(b, this.audio) && this._flipHit(b);

      b.pushTrail();

      // drain check
      if (b.y > DRAIN_Y) { b.dead = true; }
    }
    // update flippers
    this.flipperL.update(dt); this.flipperR.update(dt);
    for (const bp of this.bumpers) bp.update(dt);
    for (const tg of this.targets) tg.update(dt);
    for (const w of this.walls) w.update(dt);

    // apply bonus-mode multiplier into effective multiplier transparently
    // (scoring already used this.multiplier; bonus handled via this._bonusMult below)

    // remove dead balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      if (this.balls[i].dead) this.loseBall(this.balls[i]);
    }
  }
  _flipHit(b) { /* hook for combo timing; kept light */ }

  updatePopups(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.y += p.vy * dt; p.life -= dt * 1.1;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  /* --------------------------------------------------- rendering */
  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.scale, this.scale);
    // screen shake
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.drawTable(ctx);
    this.drawPlungerLane(ctx);

    for (const w of this.walls) w.draw(ctx, this.theme);
    for (const t of this.targets) t.draw(ctx, this.theme);
    for (const b of this.bumpers) b.draw(ctx, this.theme);
    for (const f of this.flippers) f.draw(ctx, this.theme);

    this.particles.draw(ctx);
    for (const b of this.balls) this.drawBall(ctx, b);
    this.drawPopups(ctx);

    ctx.restore();
  }

  drawTable(ctx) {
    const t = this.theme;
    // playfield gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.table2); g.addColorStop(1, t.table1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // subtle grid glow
    ctx.globalAlpha = 0.08; ctx.strokeStyle = t.accent; ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 80; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // decorative center glow rings around bumper cluster
    ctx.globalAlpha = 0.12;
    const rg = ctx.createRadialGradient(230, 270, 10, 230, 270, 180);
    rg.addColorStop(0, t.accent2); rg.addColorStop(1, 'transparent');
    ctx.fillStyle = rg; ctx.fillRect(40, 120, 380, 320);
    ctx.globalAlpha = 1;

    // drain mouth
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.moveTo(150, 800); ctx.lineTo(330, 800); ctx.lineTo(300, 878); ctx.lineTo(180, 878);
    ctx.closePath(); ctx.fill();
  }

  drawPlungerLane(ctx) {
    const t = this.theme;
    // lane background
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(440, 96, 24, 760);
    // plunger + power meter
    const pw = this.plungerPower;
    const baseY = 856;
    const plungeY = baseY - 6 - pw * 40;
    // power meter bar along the lane
    if (this.state === 'playing') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(446, 620, 12, 220);
      const h = pw * 220;
      const grad = ctx.createLinearGradient(0, 840, 0, 620);
      grad.addColorStop(0, t.accent); grad.addColorStop(1, t.accent2);
      ctx.fillStyle = grad;
      ctx.fillRect(446, 840 - h, 12, h);
    }
    // plunger knob
    ctx.fillStyle = t.accent2; ctx.shadowColor = t.accent2; ctx.shadowBlur = 10;
    ctx.fillRect(444, plungeY, 16, 18);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = t.wall; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(452, plungeY + 18); ctx.lineTo(452, 876); ctx.stroke();
  }

  drawBall(ctx, b) {
    // trail
    for (let i = 0; i < b.trail.length; i++) {
      const p = b.trail[i];
      const a = (i / b.trail.length) * 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = this.theme.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r * (0.3 + i / b.trail.length * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 5, b.r, b.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    // ball with reflective gradient
    const g = ctx.createRadialGradient(b.x - 3, b.y - 4, 1, b.x, b.y, b.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, this.theme.ball);
    g.addColorStop(1, '#5b6680');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    // specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(b.x - 3, b.y - 4, b.r * 0.28, 0, Math.PI * 2); ctx.fill();
  }

  drawPopups(ctx) {
    ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif';
    for (const p of this.popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = '#fff';
      ctx.shadowColor = this.theme.accent; ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

/* ------------------------------------------------------------------ boot */
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
