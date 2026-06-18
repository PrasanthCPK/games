/* ============================================================
   ROAD FIGHTER — Retro Arcade Racing
   Pure HTML5 Canvas + JS, no dependencies.

   Architecture:
     Game             — main loop, state machine, input
     PlayerCar        — player vehicle physics & rendering
     TrafficVehicle   — AI traffic
     RoadManager      — scrolling road + environment themes
     FuelManager      — fuel pickups + fuel level
     CheckpointManager— stage progression / checkpoints
     ParticleSystem   — crashes, dust, skids, speed lines
     AudioManager     — WebAudio synthesized SFX + music
     UIManager        — DOM HUD / screens
   ============================================================ */

(() => {
  'use strict';

  // ---- Design resolution (logical units; canvas scales to fit) ----
  const VIEW_W = 480;
  const VIEW_H = 720;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ============================================================
  //  STAGE / ENVIRONMENT DEFINITIONS
  // ============================================================
  const STAGES = [
    { name: 'Countryside', grass: '#2e8b3d', grassAlt: '#27792f', road: '#4a4a52',
      sky: '#87ceeb', accent: '#ffffff', night: false, traffic: 0.9, speedMul: 1.0,
      decor: 'tree', checkpointDist: 2400 },
    { name: 'Desert', grass: '#d9a441', grassAlt: '#c8923a', road: '#5a544e',
      sky: '#f4c77b', accent: '#fff2cc', night: false, traffic: 1.15, speedMul: 1.1,
      decor: 'cactus', checkpointDist: 2700 },
    { name: 'Coastal Highway', grass: '#1f9e8a', grassAlt: '#1788a0', road: '#48484f',
      sky: '#5bc8e6', accent: '#eaffff', night: false, traffic: 1.3, speedMul: 1.25,
      decor: 'palm', checkpointDist: 3000 },
    { name: 'Mountain Road', grass: '#5a6b4a', grassAlt: '#4a5a3d', road: '#52525c',
      sky: '#9fb0c0', accent: '#ffffff', night: false, traffic: 1.45, speedMul: 1.35,
      decor: 'rock', checkpointDist: 3200, narrow: true },
    { name: 'Night City', grass: '#15152a', grassAlt: '#1b1b36', road: '#2c2c38',
      sky: '#0a0a20', accent: '#ff3bd0', night: true, traffic: 1.7, speedMul: 1.5,
      decor: 'building', checkpointDist: 3600 },
  ];

  // ============================================================
  //  VEHICLE TYPES
  // ============================================================
  const VEHICLE_TYPES = [
    { type: 'compact', w: 38, h: 62, speed: 0.55, colors: ['#e8533a', '#3a9be8', '#8ce83a'] },
    { type: 'sedan',   w: 42, h: 72, speed: 0.45, colors: ['#d8d8d8', '#3a3af0', '#f0c040'] },
    { type: 'sports',  w: 40, h: 66, speed: 0.78, colors: ['#ff2b5e', '#ffd000', '#00d0ff'] },
    { type: 'truck',   w: 50, h: 104, speed: 0.30, colors: ['#7a5a3a', '#5a6a7a', '#8a3a3a'] },
    { type: 'bus',     w: 52, h: 118, speed: 0.25, colors: ['#e8a13a', '#3a8ae8', '#e83a8a'] },
  ];

  // ============================================================
  //  AUDIO MANAGER — synthesized WebAudio (no external files)
  // ============================================================
  class AudioManager {
    constructor() {
      this.ctx = null;
      this.musicVol = 0.4;
      this.sfxVol = 0.7;
      this.muted = false;
      this.engine = null;
      this.musicTimer = null;
      this.musicStep = 0;
    }
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

    _env(type, freq, dur, vol, sweep) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * this.sfxVol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    _noise(dur, vol, filterFreq) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 800;
      const g = this.ctx.createGain(); g.gain.value = vol * this.sfxVol;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    }

    sfx(name) {
      if (!this.ctx || this.muted) return;
      switch (name) {
        case 'pass':       this._env('triangle', 660, 0.12, 0.18, 880); break;
        case 'fuel':       this._env('square', 520, 0.08, 0.25, 990);
                           setTimeout(() => this._env('square', 780, 0.1, 0.25, 1320), 70); break;
        case 'checkpoint': [523, 659, 784, 1046].forEach((f, i) =>
                             setTimeout(() => this._env('square', f, 0.18, 0.3, f), i * 110)); break;
        case 'crash':      this._noise(0.4, 0.5, 1200); this._env('sawtooth', 180, 0.4, 0.3, 40); break;
        case 'brake':      this._noise(0.18, 0.15, 2400); break;
        case 'gameover':   [440, 349, 261, 196].forEach((f, i) =>
                             setTimeout(() => this._env('sawtooth', f, 0.32, 0.3, f * 0.6), i * 200)); break;
        case 'select':     this._env('square', 880, 0.06, 0.2, 1100); break;
      }
    }

    // Continuous engine pitch tied to speed
    setEngine(on, speedRatio) {
      if (!this.ctx || this.muted) { if (this.engine) this._engineStop(); return; }
      if (on) {
        if (!this.engine) {
          const o = this.ctx.createOscillator();
          const o2 = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sawtooth'; o2.type = 'square';
          g.gain.value = 0.0;
          o.connect(g); o2.connect(g); g.connect(this.master);
          o.start(); o2.start();
          this.engine = { o, o2, g };
        }
        const base = 60 + speedRatio * 120;
        this.engine.o.frequency.setTargetAtTime(base, this.ctx.currentTime, 0.05);
        this.engine.o2.frequency.setTargetAtTime(base * 1.5, this.ctx.currentTime, 0.05);
        this.engine.g.gain.setTargetAtTime((0.04 + speedRatio * 0.06) * this.sfxVol, this.ctx.currentTime, 0.1);
      } else if (this.engine) {
        this._engineStop();
      }
    }
    _engineStop() {
      try { this.engine.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        const e = this.engine;
        setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (_){} }, 300);
      } catch (_) {}
      this.engine = null;
    }

    // Simple looping bass+arp music
    startMusic() {
      if (!this.ctx || this.muted || this.musicTimer) return;
      const scale = [0, 3, 5, 7, 10, 12];
      const root = 110;
      this.musicStep = 0;
      const tick = () => {
        if (this.muted) return;
        const step = this.musicStep++;
        const t = this.ctx.currentTime;
        // bass
        if (step % 2 === 0) {
          const bf = root * Math.pow(2, (choice([0, 5, 7, -2]) / 12));
          const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
          o.type = 'triangle'; o.frequency.value = bf;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.12 * this.musicVol, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
          o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
        }
        // arp
        const nf = root * 2 * Math.pow(2, scale[step % scale.length] / 12);
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'square'; o2.frequency.value = nf;
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.05 * this.musicVol, t + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o2.connect(g2); g2.connect(this.master); o2.start(t); o2.stop(t + 0.2);
      };
      this.musicTimer = setInterval(tick, 160);
    }
    stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
    victoryJingle() {
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
        setTimeout(() => this._env('square', f, 0.16, 0.3, f), i * 120));
    }
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 1;
      if (m) { this.stopMusic(); this._engineStop && this.engine && this._engineStop(); }
    }
  }

  // ============================================================
  //  PARTICLE SYSTEM
  // ============================================================
  class ParticleSystem {
    constructor() { this.particles = []; }
    clear() { this.particles.length = 0; }

    spawn(x, y, opts) {
      this.particles.push(Object.assign({
        x, y, vx: 0, vy: 0, life: 1, maxLife: 1, size: 4,
        color: '#fff', gravity: 0, shrink: true, glow: false,
      }, opts));
    }
    explosion(x, y) {
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2), s = rand(1, 7);
        this.spawn(x, y, {
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: rand(0.4, 0.9), maxLife: 0.9, size: rand(3, 8),
          color: choice(['#ff4500', '#ffcc00', '#ff8c00', '#ff2222', '#888']),
          glow: true,
        });
      }
      for (let i = 0; i < 10; i++) {
        const a = rand(0, Math.PI * 2);
        this.spawn(x, y, { vx: Math.cos(a) * rand(0.5, 2), vy: Math.sin(a) * rand(0.5, 2),
          life: rand(0.6, 1.2), maxLife: 1.2, size: rand(4, 9), color: '#555', gravity: -0.02 });
      }
    }
    skid(x, y) {
      this.spawn(x, y, { vx: rand(-0.4, 0.4), vy: rand(0.5, 1.5), life: 0.5, maxLife: 0.5,
        size: rand(2, 4), color: 'rgba(40,40,40,0.6)', shrink: false });
    }
    dust(x, y, color) {
      this.spawn(x, y, { vx: rand(-1, 1), vy: rand(-0.5, 0.5), life: rand(0.3, 0.7), maxLife: 0.7,
        size: rand(3, 7), color: color || 'rgba(200,180,120,0.5)' });
    }
    sparkle(x, y) {
      for (let i = 0; i < 8; i++) {
        const a = rand(0, Math.PI * 2);
        this.spawn(x, y, { vx: Math.cos(a) * rand(1, 3), vy: Math.sin(a) * rand(1, 3),
          life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4), color: '#3bff8a', glow: true });
      }
    }
    update(dt, scroll) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx * dt * 60;
        p.y += (p.vy + scroll * 0.4) * dt * 60;
        p.vy += p.gravity * dt * 60;
        p.life -= dt;
        if (p.life <= 0) ps.splice(i, 1);
      }
    }
    render(ctx) {
      for (const p of this.particles) {
        const a = clamp(p.life / p.maxLife, 0, 1);
        const sz = p.shrink ? p.size * a : p.size;
        ctx.globalAlpha = a;
        if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; }
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  //  ROAD MANAGER
  // ============================================================
  class RoadManager {
    constructor() {
      this.scroll = 0;
      this.theme = STAGES[0];
      this.laneCount = 4;
      this.decor = []; // roadside decorations
    }
    setStage(stageIndex) {
      this.theme = STAGES[stageIndex % STAGES.length];
      this.laneCount = this.theme.narrow ? 3 : 4;
      this.decor.length = 0;
    }
    get roadLeft() { return this.theme.narrow ? VIEW_W * 0.18 : VIEW_W * 0.12; }
    get roadRight() { return VIEW_W - this.roadLeft; }
    get roadWidth() { return this.roadRight - this.roadLeft; }
    get laneWidth() { return this.roadWidth / this.laneCount; }
    laneCenter(i) { return this.roadLeft + this.laneWidth * (i + 0.5); }

    update(dt, speed) {
      this.scroll = (this.scroll + speed * dt * 60) % 80;
      // spawn roadside decor
      if (Math.random() < 0.04 + speed * 0.004) {
        const side = Math.random() < 0.5 ? 'L' : 'R';
        this.decor.push({ side, y: -60, t: Math.random() });
      }
      for (let i = this.decor.length - 1; i >= 0; i--) {
        this.decor[i].y += speed * dt * 60;
        if (this.decor[i].y > VIEW_H + 80) this.decor.splice(i, 1);
      }
    }

    render(ctx) {
      const th = this.theme;
      // sky / distant background band
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, th.sky);
      grad.addColorStop(1, shade(th.sky, th.night ? 10 : -20));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // grass (scrolling stripes)
      const stripeH = 80;
      for (let y = -stripeH + (this.scroll % stripeH); y < VIEW_H; y += stripeH) {
        ctx.fillStyle = ((Math.floor((y + this.scroll) / stripeH)) % 2 === 0) ? th.grass : th.grassAlt;
        ctx.fillRect(0, y, VIEW_W, stripeH);
      }

      // roadside decorations (behind road edges)
      for (const d of this.decor) this._drawDecor(ctx, d);

      // road surface
      const L = this.roadLeft, R = this.roadRight;
      ctx.fillStyle = th.road;
      ctx.fillRect(L, 0, R - L, VIEW_H);

      // shoulders / curbs (animated red-white)
      const curbH = 28;
      for (let y = -curbH + (this.scroll % curbH); y < VIEW_H; y += curbH) {
        const on = (Math.floor((y + this.scroll) / curbH) % 2 === 0);
        ctx.fillStyle = on ? '#e23b3b' : '#f4f4f4';
        ctx.fillRect(L - 10, y, 10, curbH);
        ctx.fillRect(R, y, 10, curbH);
      }

      // lane markers (dashed)
      ctx.fillStyle = th.accent;
      const dashH = 36, gap = 36, total = dashH + gap;
      for (let lane = 1; lane < this.laneCount; lane++) {
        const x = L + this.laneWidth * lane - 2.5;
        for (let y = -total + (this.scroll % total); y < VIEW_H; y += total) {
          ctx.globalAlpha = th.night ? 0.85 : 0.9;
          ctx.fillRect(x, y, 5, dashH);
        }
      }
      ctx.globalAlpha = 1;

      // night neon glow on road edges
      if (th.night) {
        ctx.shadowColor = th.accent; ctx.shadowBlur = 16;
        ctx.fillStyle = th.accent;
        ctx.fillRect(L - 3, 0, 3, VIEW_H);
        ctx.fillRect(R, 0, 3, VIEW_H);
        ctx.shadowBlur = 0;
      }
    }

    _drawDecor(ctx, d) {
      const x = d.side === 'L' ? (this.roadLeft - 18 - d.t * (this.roadLeft - 30))
                               : (this.roadRight + 18 + d.t * (VIEW_W - this.roadRight - 30));
      const y = d.y;
      const kind = this.theme.decor;
      ctx.save();
      switch (kind) {
        case 'tree':
          ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 3, y, 6, 16);
          ctx.fillStyle = '#1f6b2a'; ctx.beginPath(); ctx.arc(x, y - 4, 13, 0, 7); ctx.fill();
          ctx.fillStyle = '#2a8c3a'; ctx.beginPath(); ctx.arc(x - 5, y, 9, 0, 7); ctx.fill();
          break;
        case 'cactus':
          ctx.fillStyle = '#2f7d3a'; ctx.fillRect(x - 4, y - 16, 8, 30);
          ctx.fillRect(x - 12, y - 6, 8, 6); ctx.fillRect(x - 12, y - 12, 5, 8);
          ctx.fillRect(x + 4, y - 2, 8, 6); ctx.fillRect(x + 7, y - 10, 5, 10);
          break;
        case 'palm':
          ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x - 2, y, 5, 22);
          ctx.fillStyle = '#1f9e5a';
          for (let a = 0; a < 5; a++) { const an = a / 5 * Math.PI - 0.3;
            ctx.save(); ctx.translate(x, y); ctx.rotate(an); ctx.fillRect(0, -2, 18, 4); ctx.restore(); }
          break;
        case 'rock':
          ctx.fillStyle = '#6a6a72'; ctx.beginPath();
          ctx.moveTo(x - 12, y + 12); ctx.lineTo(x - 4, y - 10); ctx.lineTo(x + 8, y - 4);
          ctx.lineTo(x + 14, y + 12); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#82828a'; ctx.fillRect(x - 4, y - 6, 6, 6);
          break;
        case 'building':
          const h = 50 + (d.t * 60);
          ctx.fillStyle = '#1a1a30'; ctx.fillRect(x - 14, y - h, 28, h);
          ctx.fillStyle = choice(['#ffcc00', '#ff3bd0', '#3bd0ff']);
          for (let wy = y - h + 6; wy < y - 4; wy += 12)
            for (let wx = x - 10; wx < x + 8; wx += 9)
              if (Math.random() < 0.6) ctx.fillRect(wx, wy, 4, 6);
          break;
      }
      ctx.restore();
    }
  }

  // ============================================================
  //  BASE VEHICLE renderer (shared sprite drawing)
  // ============================================================
  function drawCarSprite(ctx, x, y, w, h, color, isPlayer, frame) {
    ctx.save();
    ctx.translate(x, y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, 6); ctx.fill();
    // body
    ctx.fillStyle = color;
    roundRect(ctx, -w / 2, -h / 2, w, h, 7); ctx.fill();
    // body shading
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h * 0.25, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-w / 2 + 2, h / 2 - h * 0.22, w - 4, h * 0.2);
    // windows
    ctx.fillStyle = isPlayer ? '#bfe9ff' : '#3a4a5a';
    roundRect(ctx, -w / 2 + 5, -h * 0.30, w - 10, h * 0.20, 3); ctx.fill();
    roundRect(ctx, -w / 2 + 5, h * 0.12, w - 10, h * 0.18, 3); ctx.fill();
    // racing stripe / livery
    if (isPlayer) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, -h / 2 + 3, 6, h - 6);
      ctx.fillStyle = '#ff3b6b';
      ctx.fillRect(-w / 2 + 4, -2, w - 8, 4);
    }
    // wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-w / 2 - 2, -h * 0.32, 4, h * 0.22);
    ctx.fillRect(w / 2 - 2, -h * 0.32, 4, h * 0.22);
    ctx.fillRect(-w / 2 - 2, h * 0.12, 4, h * 0.22);
    ctx.fillRect(w / 2 - 2, h * 0.12, 4, h * 0.22);
    // headlights / taillights
    if (isPlayer) {
      ctx.fillStyle = '#fff6b0';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 1, 6, 4);
      ctx.fillRect(w / 2 - 10, -h / 2 + 1, 6, 4);
    } else {
      ctx.fillStyle = '#ff5555';
      ctx.fillRect(-w / 2 + 4, h / 2 - 5, 6, 4);
      ctx.fillRect(w / 2 - 10, h / 2 - 5, 6, 4);
    }
    ctx.restore();
  }

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

  function shade(hex, amt) {
    // hex may be named; guard
    if (hex[0] !== '#') return hex;
    let n = parseInt(hex.slice(1), 16);
    let r = clamp((n >> 16) + amt, 0, 255);
    let g = clamp(((n >> 8) & 255) + amt, 0, 255);
    let b = clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  // ============================================================
  //  PLAYER CAR
  // ============================================================
  class PlayerCar {
    constructor() { this.reset(); }
    reset() {
      this.w = 40; this.h = 70;
      this.x = VIEW_W / 2;
      this.y = VIEW_H - 130;
      this.vx = 0;
      this.speed = 0;        // 0..maxSpeed (logical)
      this.maxSpeed = 14;
      this.minSpeed = 0;
      this.crashed = false;
      this.crashTimer = 0;
      this.spin = 0;
      this.invuln = 0;
      this.handling = 1;     // upgrade factor
    }
    get speedRatio() { return this.speed / this.maxSpeed; }
    get kmh() { return Math.round(this.speed * 22); }

    update(dt, input, road) {
      if (this.crashed) {
        this.crashTimer -= dt;
        this.spin += dt * 12;
        this.speed = lerp(this.speed, 1.5, dt * 3);
        if (this.crashTimer <= 0) { this.crashed = false; this.spin = 0; this.invuln = 1.2; }
        return;
      }
      if (this.invuln > 0) this.invuln -= dt;

      // acceleration / braking
      const accel = 7 * dt;
      if (input.accel) this.speed += accel;
      else if (input.brake) this.speed -= accel * 2.2;
      else this.speed -= accel * 0.5; // natural drag
      this.speed = clamp(this.speed, this.minSpeed, this.maxSpeed);

      // steering — momentum based
      const steerForce = 0.9 * this.handling;
      if (input.left) this.vx -= steerForce;
      if (input.right) this.vx += steerForce;
      if (!input.left && !input.right) this.vx *= 0.82; // self-center friction
      this.vx = clamp(this.vx, -7, 7);
      this.x += this.vx * dt * 60 * (0.6 + this.speedRatio * 0.6);

      // keep on road (soft wall + penalty)
      const margin = this.w / 2 + 2;
      const minX = road.roadLeft + margin, maxX = road.roadRight - margin;
      if (this.x < minX) { this.x = minX; this.vx *= -0.3; this.speed *= 0.96; this.offroad = true; }
      else if (this.x > maxX) { this.x = maxX; this.vx *= -0.3; this.speed *= 0.96; this.offroad = true; }
      else this.offroad = false;
    }

    crash() {
      if (this.invuln > 0 || this.crashed) return false;
      this.crashed = true;
      this.crashTimer = 1.0;
      this.speed = 2;
      return true;
    }

    render(ctx) {
      if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) return; // blink
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.spin) ctx.rotate(this.spin);
      drawCarSprite(ctx, 0, 0, this.w, this.h, '#1763d8', true, 0);
      ctx.restore();
    }
  }

  // ============================================================
  //  TRAFFIC VEHICLE
  // ============================================================
  class TrafficVehicle {
    constructor(def, lane, road) {
      this.def = def;
      this.w = def.w; this.h = def.h;
      this.color = choice(def.colors);
      this.lane = lane;
      this.x = road.laneCenter(lane);
      this.y = -def.h - rand(0, 80);
      this.baseSpeed = def.speed;
      this.passed = false;
      this.laneChangeT = rand(2, 6);
      this.targetX = this.x;
    }
    update(dt, playerSpeed, road) {
      // relative speed: world scrolls down at playerSpeed; traffic moves at its own speed
      const rel = (playerSpeed - this.baseSpeed * 8) * dt * 60;
      this.y += rel;

      // occasional lane changes (not trucks/buses)
      if (this.def.type !== 'truck' && this.def.type !== 'bus') {
        this.laneChangeT -= dt;
        if (this.laneChangeT <= 0) {
          this.laneChangeT = rand(3, 8);
          const nl = clamp(this.lane + choice([-1, 1]), 0, road.laneCount - 1);
          this.lane = nl;
          this.targetX = road.laneCenter(nl);
        }
      } else {
        this.targetX = road.laneCenter(this.lane);
      }
      this.x = lerp(this.x, this.targetX, dt * 3);
    }
    render(ctx) {
      drawCarSprite(ctx, this.x, this.y, this.w, this.h, this.color, false, 0);
    }
    get bounds() { return { l: this.x - this.w / 2, r: this.x + this.w / 2, t: this.y - this.h / 2, b: this.y + this.h / 2 }; }
  }

  // ============================================================
  //  FUEL MANAGER
  // ============================================================
  class FuelManager {
    constructor() { this.reset(); }
    reset() {
      this.fuel = 100;
      this.max = 100;
      this.pickups = [];
      this.spawnTimer = 4;
      this.efficiency = 1; // upgrade
    }
    update(dt, playerSpeed, road) {
      // fuel drains over time, faster at higher speed
      this.fuel -= (1.6 + playerSpeed * 0.18) * dt / this.efficiency;
      this.fuel = clamp(this.fuel, 0, this.max);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = rand(4.5, 8);
        const lane = randInt(0, road.laneCount - 1);
        this.pickups.push({ x: road.laneCenter(lane), y: -40, w: 26, h: 34, bob: rand(0, 6) });
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        p.y += playerSpeed * dt * 60;
        p.bob += dt * 6;
        if (p.y > VIEW_H + 40) this.pickups.splice(i, 1);
      }
    }
    add(amt) { this.fuel = clamp(this.fuel + amt, 0, this.max); }
    render(ctx) {
      for (const p of this.pickups) {
        const yo = Math.sin(p.bob) * 2;
        ctx.save();
        ctx.translate(p.x, p.y + yo);
        ctx.shadowColor = '#3bff8a'; ctx.shadowBlur = 12;
        // jerry can
        ctx.fillStyle = '#e23b3b';
        roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 4); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⛽', 0, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-p.w / 2 + 3, -p.h / 2 + 3, p.w - 6, 5);
        ctx.restore();
      }
    }
  }

  // ============================================================
  //  CHECKPOINT MANAGER
  // ============================================================
  class CheckpointManager {
    constructor() { this.reset(0); }
    reset(stageIndex) {
      this.stageIndex = stageIndex;
      this.stageDist = 0;
      this.target = STAGES[stageIndex % STAGES.length].checkpointDist;
      this.bannerY = null; // y position of checkpoint banner when spawned
      this.bannerActive = false;
      this.reached = false;
    }
    update(dt, distAdvance, playerSpeed) {
      this.stageDist += distAdvance;
      // spawn banner when close
      if (!this.bannerActive && !this.reached && this.stageDist >= this.target - 600) {
        this.bannerActive = true;
        this.bannerY = -40;
      }
      if (this.bannerActive && !this.reached) {
        this.bannerY += playerSpeed * dt * 60;
      }
    }
    render(ctx) {
      if (!this.bannerActive || this.reached) return;
      const y = this.bannerY;
      ctx.save();
      // checkered gate
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, y, VIEW_W, 22);
      ctx.fillStyle = '#111';
      for (let x = 0; x < VIEW_W; x += 22)
        ctx.fillRect(x + (Math.floor(y / 11) % 2 ? 11 : 0), y, 11, 11);
      for (let x = 0; x < VIEW_W; x += 22)
        ctx.fillRect(x + (Math.floor(y / 11) % 2 ? 0 : 11), y + 11, 11, 11);
      // posts
      ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 10;
      ctx.fillRect(4, y - 30, 8, 52); ctx.fillRect(VIEW_W - 12, y - 30, 8, 52);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#111'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText('CHECKPOINT', VIEW_W / 2, y + 15);
      ctx.restore();
    }
  }

  // ============================================================
  //  UI MANAGER (DOM)
  // ============================================================
  class UIManager {
    constructor() {
      this.el = {};
      const ids = ['hud', 'hud-score', 'hud-best', 'hud-stage', 'hud-dist', 'hud-time',
        'fuel-fill', 'speed-fill', 'speed-readout', 'touch-controls',
        'screen-start', 'screen-pause', 'screen-stage', 'screen-over',
        'stage-dist', 'stage-bonus', 'stage-fuel-bonus', 'stage-total',
        'over-reason', 'over-score', 'over-best', 'over-dist', 'over-passed', 'over-newbest',
        'btn-mute', 'rotate-hint'];
      ids.forEach(id => this.el[id] = document.getElementById(id));
    }
    showScreen(name) {
      ['screen-start', 'screen-pause', 'screen-stage', 'screen-over'].forEach(s =>
        this.el[s].classList.add('hidden'));
      if (name) this.el['screen-' + name].classList.remove('hidden');
    }
    setHudVisible(v, touch) {
      this.el.hud.classList.toggle('hidden', !v);
      this.el['touch-controls'].classList.toggle('hidden', !(v && touch));
    }
    update(g) {
      this.el['hud-score'].textContent = Math.floor(g.score);
      this.el['hud-best'].textContent = g.best;
      this.el['hud-stage'].textContent = g.endless ? '∞' : (g.checkpoints.stageIndex + 1);
      this.el['hud-dist'].textContent = Math.floor(g.distance) + ' m';
      this.el['hud-time'].textContent = Math.max(0, Math.ceil(g.timer));
      const fr = g.fuelMgr.fuel / g.fuelMgr.max;
      this.el['fuel-fill'].style.width = (fr * 100) + '%';
      this.el['speed-fill'].style.width = (g.player.speedRatio * 100) + '%';
      this.el['speed-readout'].textContent = g.player.kmh + ' km/h';
      // low fuel pulse
      this.el['fuel-fill'].style.filter = fr < 0.2 ? 'brightness(1.5)' : 'none';
    }
    setMuteIcon(muted) {
      this.el['btn-mute'].textContent = muted ? '✕' : '♪';
      this.el['btn-mute'].classList.toggle('muted', muted);
    }
    showStageComplete(dist, bonus, fuelBonus, total) {
      this.el['stage-dist'].textContent = Math.floor(dist) + ' m';
      this.el['stage-bonus'].textContent = bonus;
      this.el['stage-fuel-bonus'].textContent = fuelBonus;
      this.el['stage-total'].textContent = Math.floor(total);
      this.showScreen('stage');
    }
    showGameOver(g, reason, newBest) {
      this.el['over-reason'].textContent = reason;
      this.el['over-score'].textContent = Math.floor(g.score);
      this.el['over-best'].textContent = g.best;
      this.el['over-dist'].textContent = Math.floor(g.distance) + ' m';
      this.el['over-passed'].textContent = g.carsPassed;
      this.el['over-newbest'].classList.toggle('hidden', !newBest);
      this.showScreen('over');
    }
  }

  // ============================================================
  //  GAME — main controller
  // ============================================================
  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.audio = new AudioManager();
      this.particles = new ParticleSystem();
      this.road = new RoadManager();
      this.player = new PlayerCar();
      this.fuelMgr = new FuelManager();
      this.checkpoints = new CheckpointManager();
      this.ui = new UIManager();

      this.traffic = [];
      this.state = 'menu'; // menu | play | pause | stage | over
      this.mode = 'modern';
      this.endless = false;

      this.score = 0;
      this.best = +(localStorage.getItem('rf_best') || 0);
      this.distance = 0;
      this.carsPassed = 0;
      this.timer = 60;
      this.spawnTimer = 0;
      this.lastTime = 0;

      this.input = { left: false, right: false, accel: false, brake: false };
      this.tilt = false;

      this._setupCanvas();
      this._bindInput();
      this._bindUI();
      this.ui.setHudVisible(false, false);
      this.ui.showScreen('start');
      this._checkOrientation();
      requestAnimationFrame(this._loop.bind(this));
    }

    // ---------- Canvas sizing (responsive, keeps aspect) ----------
    _setupCanvas() {
      const resize = () => {
        const shell = document.getElementById('game-shell');
        const aw = shell.clientWidth, ah = shell.clientHeight;
        const scale = Math.min(aw / VIEW_W, ah / VIEW_H);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = VIEW_W * dpr;
        this.canvas.height = VIEW_H * dpr;
        this.canvas.style.width = (VIEW_W * scale) + 'px';
        this.canvas.style.height = (VIEW_H * scale) + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        this._checkOrientation();
      };
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);
      resize();
    }

    _checkOrientation() {
      const hint = this.ui.el['rotate-hint'];
      const portraitMobile = this.isTouch && window.innerHeight > window.innerWidth && window.innerWidth < 640;
      hint.classList.toggle('hidden', !(portraitMobile && this.state === 'play'));
    }

    // ---------- Input ----------
    _bindInput() {
      const keymap = {
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
        ArrowUp: 'accel', w: 'accel', W: 'accel',
        ArrowDown: 'brake', s: 'brake', S: 'brake',
      };
      window.addEventListener('keydown', (e) => {
        if (keymap[e.key]) { this.input[keymap[e.key]] = true; e.preventDefault(); }
        else if (e.key === 'p' || e.key === 'P') this.togglePause();
        else if (e.key === 'm' || e.key === 'M') this.toggleMute();
        else if (e.key === 'Enter' && (this.state === 'menu' || this.state === 'over')) this.start();
      });
      window.addEventListener('keyup', (e) => { if (keymap[e.key]) { this.input[keymap[e.key]] = false; e.preventDefault(); } });

      // Touch buttons
      const bind = (id, key) => {
        const el = document.getElementById(id);
        const on = (e) => { e.preventDefault(); this.input[key] = true; };
        const off = (e) => { e.preventDefault(); this.input[key] = false; };
        el.addEventListener('touchstart', on, { passive: false });
        el.addEventListener('touchend', off, { passive: false });
        el.addEventListener('touchcancel', off, { passive: false });
        el.addEventListener('mousedown', on);
        el.addEventListener('mouseup', off);
        el.addEventListener('mouseleave', off);
      };
      bind('t-left', 'left'); bind('t-right', 'right');
      bind('t-accel', 'accel'); bind('t-brake', 'brake');

      // Swipe steering on canvas
      let swipeX = null;
      this.canvas.addEventListener('touchstart', (e) => { swipeX = e.touches[0].clientX; }, { passive: true });
      this.canvas.addEventListener('touchmove', (e) => {
        if (swipeX === null) return;
        const dx = e.touches[0].clientX - swipeX;
        if (dx < -18) { this.input.left = true; this.input.right = false; }
        else if (dx > 18) { this.input.right = true; this.input.left = false; }
      }, { passive: true });
      this.canvas.addEventListener('touchend', () => { swipeX = null; this.input.left = this.input.right = false; }, { passive: true });

      // Tilt controls
      window.addEventListener('deviceorientation', (e) => {
        if (!this.tilt || this.state !== 'play') return;
        const g = e.gamma || 0; // left-right tilt
        this.input.left = g < -6;
        this.input.right = g > 6;
        this.input.accel = true; // auto-accel in tilt mode
      });
    }

    _bindUI() {
      const click = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => { this.audio.init(); this.audio.resume(); this.audio.sfx('select'); fn(); });
      };
      click('btn-play', () => this.start());
      click('btn-resume', () => this.togglePause());
      click('btn-restart-pause', () => this.start());
      click('btn-quit', () => this.toMenu());
      click('btn-next-stage', () => this.nextStage());
      click('btn-retry', () => this.start());
      click('btn-menu', () => this.toMenu());
      click('btn-pause', () => this.togglePause());
      document.getElementById('btn-mute').addEventListener('click', () => { this.audio.init(); this.toggleMute(); });

      // mode selection
      document.querySelectorAll('.mode-opt').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.mode-opt').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          this.mode = b.dataset.mode;
        });
      });

      // settings
      const vm = document.getElementById('vol-music'), vs = document.getElementById('vol-sfx'), tl = document.getElementById('opt-tilt');
      vm.addEventListener('input', () => { this.audio.musicVol = vm.value / 100; });
      vs.addEventListener('input', () => { this.audio.sfxVol = vs.value / 100; });
      tl.addEventListener('change', () => { this.tilt = tl.checked; });
    }

    // ---------- State transitions ----------
    start() {
      this.audio.init(); this.audio.resume();
      this.endless = this.mode === 'endless';
      this.classic = this.mode === 'classic';
      this.score = 0;
      this.distance = 0;
      this.carsPassed = 0;
      this.player.reset();
      this.fuelMgr.reset();
      this.particles.clear();
      this.traffic.length = 0;
      this.checkpoints.reset(0);
      this.road.setStage(0);
      this.player.x = this.road.laneCenter(Math.floor(this.road.laneCount / 2));
      this.timer = 60;
      this.spawnTimer = 1;
      this.state = 'play';
      this.ui.showScreen(null);
      this.ui.setHudVisible(true, this.isTouch);
      this.audio.startMusic();
      this._checkOrientation();
    }

    nextStage() {
      const ni = this.endless ? 0 : (this.checkpoints.stageIndex + 1);
      if (!this.endless && ni >= STAGES.length) { this.win(); return; }
      this.checkpoints.reset(this.endless ? 0 : ni);
      if (this.endless) this.checkpoints.stageIndex = 0;
      this.road.setStage(this.endless ? randInt(0, STAGES.length - 1) : ni);
      this.traffic.length = 0;
      this.fuelMgr.pickups.length = 0;
      this.timer += this.endless ? 30 : 45;
      this.player.x = this.road.laneCenter(Math.floor(this.road.laneCount / 2));
      this.player.invuln = 1.5;
      this.state = 'play';
      this.ui.showScreen(null);
      this.ui.setHudVisible(true, this.isTouch);
      this.audio.startMusic();
    }

    win() {
      this.audio.stopMusic();
      this.audio.victoryJingle();
      this.score += 5000; // completion bonus
      this._saveBest();
      this.gameOver('You conquered all stages! Champion!', true);
    }

    togglePause() {
      if (this.state === 'play') {
        this.state = 'pause';
        this.audio.stopMusic();
        this.audio.setEngine(false);
        this.ui.showScreen('pause');
      } else if (this.state === 'pause') {
        this.state = 'play';
        this.ui.showScreen(null);
        this.audio.startMusic();
      }
    }

    toMenu() {
      this.state = 'menu';
      this.audio.stopMusic();
      this.audio.setEngine(false);
      this.ui.setHudVisible(false, false);
      this.ui.showScreen('start');
    }

    toggleMute() {
      this.audio.setMuted(!this.audio.muted);
      this.ui.setMuteIcon(this.audio.muted);
      if (!this.audio.muted && this.state === 'play') this.audio.startMusic();
    }

    gameOver(reason, isWin) {
      this.state = 'over';
      this.audio.stopMusic();
      this.audio.setEngine(false);
      if (!isWin) this.audio.sfx('gameover');
      const newBest = this._saveBest();
      this.ui.setHudVisible(false, false);
      this.ui.showGameOver(this, reason, newBest);
    }

    _saveBest() {
      if (this.score > this.best) {
        this.best = Math.floor(this.score);
        localStorage.setItem('rf_best', this.best);
        return true;
      }
      return false;
    }

    // ---------- Spawning ----------
    _spawnTraffic(dt) {
      this.spawnTimer -= dt;
      const density = this.road.theme.traffic * (1 + this.distance / 30000);
      const interval = clamp(1.4 / density, 0.4, 1.6);
      if (this.spawnTimer <= 0) {
        this.spawnTimer = rand(interval * 0.6, interval * 1.4);
        const def = choice(VEHICLE_TYPES);
        const lane = randInt(0, this.road.laneCount - 1);
        // avoid stacking in same lane near top
        const tooClose = this.traffic.some(t => t.lane === lane && t.y < 140);
        if (!tooClose) this.traffic.push(new TrafficVehicle(def, lane, this.road));
      }
    }

    // ---------- Collision ----------
    _checkCollisions() {
      const p = this.player;
      const pb = { l: p.x - p.w / 2 + 4, r: p.x + p.w / 2 - 4, t: p.y - p.h / 2 + 4, b: p.y + p.h / 2 - 4 };
      for (const t of this.traffic) {
        const b = t.bounds;
        if (pb.l < b.r && pb.r > b.l && pb.t < b.b && pb.b > b.t) {
          if (p.crash()) {
            this.particles.explosion(p.x, p.y - p.h / 4);
            this.audio.sfx('crash');
            this.fuelMgr.add(-12);
            this.timer -= 3;
            this.shake = 0.4;
          }
        }
      }
      // fuel pickups
      for (let i = this.fuelMgr.pickups.length - 1; i >= 0; i--) {
        const f = this.fuelMgr.pickups[i];
        if (pb.l < f.x + f.w / 2 && pb.r > f.x - f.w / 2 && pb.t < f.y + f.h / 2 && pb.b > f.y - f.h / 2) {
          this.fuelMgr.add(35);
          this.score += 150;
          this.particles.sparkle(f.x, f.y);
          this.audio.sfx('fuel');
          this.fuelMgr.pickups.splice(i, 1);
        }
      }
    }

    // ---------- Main update ----------
    _update(dt) {
      if (this.state !== 'play') return;
      const p = this.player;

      p.update(dt, this.input, this.road);
      const sp = p.speed;

      // world advance
      const advance = sp * dt * 16; // meters
      this.distance += advance;
      this.score += advance * 0.5 + sp * dt * (this.classic ? 1 : 1.5); // distance + speed bonus

      this.road.update(dt, sp);
      this.fuelMgr.update(dt, sp, this.road);
      this.checkpoints.update(dt, advance, sp);
      this._spawnTraffic(dt);

      // timer
      this.timer -= dt;

      // engine + skid sound/particles
      this.audio.setEngine(sp > 0.5, p.speedRatio);
      if (p.offroad) {
        this.particles.dust(p.x - p.w / 2, p.y + p.h / 2, this.road.theme.grass);
        this.particles.dust(p.x + p.w / 2, p.y + p.h / 2, this.road.theme.grass);
      }
      if (this.input.brake && sp > 3) {
        this.particles.skid(p.x - p.w / 2 + 4, p.y + p.h / 2);
        this.particles.skid(p.x + p.w / 2 - 4, p.y + p.h / 2);
        if (Math.random() < 0.05) this.audio.sfx('brake');
      }
      // speed lines at high speed
      if (p.speedRatio > 0.7 && Math.random() < 0.5) {
        this.particles.spawn(rand(0, VIEW_W), -10, { vy: 14 + sp, life: 0.4, maxLife: 0.4,
          size: 2, color: 'rgba(255,255,255,0.4)', shrink: false });
      }

      // update traffic + pass detection
      for (let i = this.traffic.length - 1; i >= 0; i--) {
        const t = this.traffic[i];
        t.update(dt, sp, this.road);
        if (!t.passed && t.y > p.y) {
          t.passed = true; this.carsPassed += 1; this.score += 50;
          this.audio.sfx('pass');
        }
        if (t.y > VIEW_H + 130 || t.y < -320) this.traffic.splice(i, 1);
      }

      this._checkCollisions();
      this.particles.update(dt, sp);
      if (this.shake) this.shake = Math.max(0, this.shake - dt);

      // checkpoint reached?
      if (this.checkpoints.stageDist >= this.checkpoints.target && !this.checkpoints.reached) {
        this.checkpoints.reached = true;
        this._completeStage();
        return;
      }

      // fail conditions
      if (this.fuelMgr.fuel <= 0) { this.gameOver('Out of fuel!', false); return; }
      if (this.timer <= 0) { this.gameOver("Time's up!", false); return; }

      this.ui.update(this);
    }

    _completeStage() {
      this.audio.sfx('checkpoint');
      const fuelBonus = Math.floor(this.fuelMgr.fuel * 20);
      const timeBonus = Math.floor(Math.max(0, this.timer) * 30);
      const stageBonus = 1000 + this.checkpoints.stageIndex * 500 + timeBonus;
      this.score += fuelBonus + stageBonus;
      this._saveBest();
      this.state = 'stage';
      this.audio.stopMusic();
      this.audio.setEngine(false);
      this.ui.setHudVisible(false, false);
      this.ui.showStageComplete(this.checkpoints.stageDist, stageBonus, fuelBonus, this.score);
    }

    // ---------- Render ----------
    _render() {
      const ctx = this.ctx;
      ctx.save();
      if (this.shake) {
        ctx.translate(rand(-1, 1) * this.shake * 12, rand(-1, 1) * this.shake * 12);
      }
      this.road.render(ctx);
      this.fuelMgr.render(ctx);
      this.checkpoints.render(ctx);
      for (const t of this.traffic) t.render(ctx);
      if (this.state === 'play' || this.state === 'pause' || this.state === 'stage' || this.state === 'over')
        this.player.render(ctx);
      this.particles.render(ctx);

      // motion blur vignette at high speed
      if (this.state === 'play' && this.player.speedRatio > 0.6) {
        const a = (this.player.speedRatio - 0.6) * 0.5;
        const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.25, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.6);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${a})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      // night overlay
      if (this.road.theme.night && this.state !== 'menu') {
        ctx.fillStyle = 'rgba(10,10,40,0.28)';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        // headlight cone
        const p = this.player;
        const grad = ctx.createRadialGradient(p.x, p.y - 40, 10, p.x, p.y - 60, 220);
        grad.addColorStop(0, 'rgba(255,250,200,0.18)');
        grad.addColorStop(1, 'rgba(255,250,200,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 120, -40); ctx.lineTo(p.x + 120, -40); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // ---------- Loop ----------
    _loop(ts) {
      let dt = (ts - this.lastTime) / 1000;
      this.lastTime = ts;
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(dt, 1 / 20); // clamp huge gaps
      this._update(dt);
      this._render();
      requestAnimationFrame(this._loop.bind(this));
    }
  }

  // boot
  window.addEventListener('load', () => {
    const game = new Game();
    window.__roadFighter = game; // debug handle
  });

})();
