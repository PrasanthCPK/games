/* ============================================================
   Snakes & Ladders — game.js
   Vanilla ES6. Architecture:
     AudioManager · StatisticsManager · Dice · Board · Token
     Player / AIPlayer · AnimationManager · Game
   ============================================================ */
'use strict';

/* ----------------------------------------------------------
   Constants & helpers
   ---------------------------------------------------------- */
const GRID = 10;
const WIN = 100;

// Classic snakes & ladders layout.
const LADDERS = { 1:38, 4:14, 9:31, 21:42, 28:84, 36:44, 51:67, 71:91, 80:100 };
const SNAKES  = { 16:6, 47:26, 49:11, 56:53, 62:19, 64:60, 87:24, 93:73, 95:75, 98:78 };

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308']; // red blue green yellow
const PLAYER_NAMES  = ['Red', 'Blue', 'Green', 'Yellow'];
const TOKEN_GLYPHS  = ['♟', '♞', '♜', '♝'];

const THEMES = {
  classic: { light:'#3a2f63', dark:'#2b2150', text:'#efeaff', ladder:'#c9a227', snake:'#e05a4a' },
  jungle:  { light:'#1c5b32', dark:'#0f3d20', text:'#eaffea', ladder:'#b07a2a', snake:'#7fae3a' },
  fantasy: { light:'#4a2a6b', dark:'#371f54', text:'#fbe9ff', ladder:'#d8a4ff', snake:'#22d3ee' },
  pirate:  { light:'#3a4a5a', dark:'#2a3a4a', text:'#fdf3df', ladder:'#d8a23a', snake:'#c0463a' },
  space:   { light:'#16224a', dark:'#0d1635', text:'#e8f0ff', ladder:'#7dd3fc', snake:'#c084fc' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (n) => Math.floor(Math.random() * n);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const easeInOut = (t) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ----------------------------------------------------------
   AudioManager — synthesized sounds, no external files
   ---------------------------------------------------------- */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = JSON.parse(localStorage.getItem('sl_muted') || 'false');
    this.volume = parseFloat(localStorage.getItem('sl_volume') || '0.6');
    this.musicNodes = null;
  }
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  _tone(freq, dur, type = 'sine', vol = 0.3, when = 0) {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol * this.volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  _slide(from, to, dur, type = 'sawtooth', vol = 0.25) {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.linearRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(vol * this.volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  click()  { this._tone(420, 0.07, 'square', 0.18); }
  dice()   { for (let i=0;i<5;i++) this._tone(180 + rand(260), 0.06, 'triangle', 0.18, i*0.07); }
  step()   { this._tone(620, 0.06, 'sine', 0.16); }
  ladder() { this._slide(300, 900, 0.5, 'triangle', 0.22); }
  snake()  { this._slide(700, 180, 0.55, 'sawtooth', 0.2); }
  victory(){ [523,659,784,1047].forEach((f,i)=>this._tone(f,0.35,'triangle',0.3,i*0.13)); }

  startMusic() {
    const ctx = this._ensure();
    if (!ctx || this.muted || this.musicNodes) return;
    // gentle arpeggio loop using scheduled notes
    const gain = ctx.createGain();
    gain.gain.value = 0.05 * this.volume;
    gain.connect(ctx.destination);
    const scale = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
    let i = 0;
    const tick = () => {
      if (!this.musicNodes) return;
      if (!this.muted) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = scale[i % scale.length] / 2;
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05 * this.volume, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        osc.connect(g).connect(gain);
        osc.start(t); osc.stop(t + 0.62);
      }
      i++;
    };
    this.musicNodes = { gain, timer: setInterval(tick, 480) };
  }
  stopMusic() {
    if (this.musicNodes) { clearInterval(this.musicNodes.timer); this.musicNodes = null; }
  }
  setMuted(m) {
    this.muted = m; localStorage.setItem('sl_muted', JSON.stringify(m));
    if (m) this.stopMusic();
  }
  setVolume(v) { this.volume = v; localStorage.setItem('sl_volume', String(v)); }
}

/* ----------------------------------------------------------
   StatisticsManager — persistent localStorage stats
   ---------------------------------------------------------- */
class StatisticsManager {
  constructor() {
    const def = { gamesPlayed:0, wins:0, totalRolls:0, fastestTurns:null, longestLadder:0, biggestSnake:0 };
    try { this.data = Object.assign(def, JSON.parse(localStorage.getItem('sl_stats') || '{}')); }
    catch { this.data = def; }
  }
  save() { localStorage.setItem('sl_stats', JSON.stringify(this.data)); }
  addRoll() { this.data.totalRolls++; this.save(); }
  recordLadder(climb) { if (climb > this.data.longestLadder) { this.data.longestLadder = climb; this.save(); } }
  recordSnake(slide) { if (slide > this.data.biggestSnake) { this.data.biggestSnake = slide; this.save(); } }
  recordGame({ humanWon, turns }) {
    this.data.gamesPlayed++;
    if (humanWon) this.data.wins++;
    if (this.data.fastestTurns === null || turns < this.data.fastestTurns) this.data.fastestTurns = turns;
    this.save();
  }
  winPct() { return this.data.gamesPlayed ? Math.round(this.data.wins / this.data.gamesPlayed * 100) : 0; }
  reset() {
    this.data = { gamesPlayed:0, wins:0, totalRolls:0, fastestTurns:null, longestLadder:0, biggestSnake:0 };
    this.save();
  }
}

/* ----------------------------------------------------------
   Dice
   ---------------------------------------------------------- */
const PIP_MAP = {
  1: ['p-mm'],
  2: ['p-tl','p-br'],
  3: ['p-tl','p-mm','p-br'],
  4: ['p-tl','p-tr','p-bl','p-br'],
  5: ['p-tl','p-tr','p-mm','p-bl','p-br'],
  6: ['p-tl','p-tr','p-ml','p-mr','p-bl','p-br'],
};
class Dice {
  constructor(el, faceEl, audio) {
    this.el = el; this.faceEl = faceEl; this.audio = audio; this.value = 1;
    this.render(1);
  }
  render(v) {
    this.faceEl.innerHTML = PIP_MAP[v].map(c => `<div class="pip ${c}"></div>`).join('');
  }
  async roll() {
    this.audio.dice();
    this.el.classList.remove('rolling');
    void this.el.offsetWidth; // reflow to restart animation
    this.el.classList.add('rolling');
    // flicker faces during animation
    const flicker = setInterval(() => this.render(1 + rand(6)), 70);
    await sleep(600);
    clearInterval(flicker);
    this.el.classList.remove('rolling');
    this.value = 1 + rand(6);
    this.render(this.value);
    return this.value;
  }
}

/* ----------------------------------------------------------
   Player / AIPlayer
   ---------------------------------------------------------- */
class Player {
  constructor(index, name, color, isAI = false) {
    this.index = index; this.name = name; this.color = color;
    this.isAI = isAI; this.glyph = TOKEN_GLYPHS[index];
    this.position = 0;      // 0 = off board / start line
    this.finished = false;
    this.finishOrder = null;
  }
}
class AIPlayer extends Player {
  constructor(index, name, color, difficulty = 'medium') {
    super(index, name, color, true);
    this.difficulty = difficulty;
  }
  // Difficulty affects pacing (think time), not fairness.
  thinkTime() {
    return ({ easy: [600, 1100], medium: [350, 700], hard: [180, 380] })[this.difficulty] || [400, 800];
  }
  decideDelay() {
    const [a, b] = this.thinkTime();
    return a + rand(b - a);
  }
}

/* ----------------------------------------------------------
   Board — geometry + canvas rendering
   ---------------------------------------------------------- */
class Board {
  constructor(canvas, getTheme) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getTheme = getTheme;
    this.size = 0;      // CSS pixel size (square)
    this.cell = 0;
    this.dpr = window.devicePixelRatio || 1;
  }
  resize(maxSize) {
    const s = Math.max(240, Math.floor(maxSize));
    this.size = s;
    this.cell = s / GRID;
    this.canvas.style.width = s + 'px';
    this.canvas.style.height = s + 'px';
    this.canvas.width = Math.floor(s * this.dpr);
    this.canvas.height = Math.floor(s * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  // Center pixel for square number 1..100.
  cellCenter(n) {
    n = clamp(n, 1, 100);
    const idx = n - 1;
    const rowFromBottom = Math.floor(idx / GRID);
    let col = idx % GRID;
    if (rowFromBottom % 2 === 1) col = GRID - 1 - col; // boustrophedon
    const x = col * this.cell + this.cell / 2;
    const y = (GRID - 1 - rowFromBottom) * this.cell + this.cell / 2;
    return { x, y };
  }
  draw(players, activeIndex) {
    const ctx = this.ctx, cell = this.cell, th = this.getTheme();
    ctx.clearRect(0, 0, this.size, this.size);

    // squares
    for (let n = 1; n <= 100; n++) {
      const idx = n - 1;
      const rowFromBottom = Math.floor(idx / GRID);
      let col = idx % GRID;
      if (rowFromBottom % 2 === 1) col = GRID - 1 - col;
      const x = col * cell, y = (GRID - 1 - rowFromBottom) * cell;
      const checker = (Math.floor(idx / GRID) + (idx % GRID)) % 2 === 0;
      ctx.fillStyle = checker ? th.light : th.dark;
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, cell - 1, cell - 1);
      // number
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = `${Math.max(9, cell * 0.2)}px ${'Segoe UI, sans-serif'}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(String(n), x + 4, y + 3);
      if (n === 100) {
        ctx.fillStyle = th.ladder; ctx.font = `${cell*0.32}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('👑', x + cell/2, y + cell/2 + 4);
      }
    }

    // ladders
    for (const [from, to] of Object.entries(LADDERS)) this._drawLadder(+from, +to, th);
    // snakes
    for (const [from, to] of Object.entries(SNAKES)) this._drawSnake(+from, +to, th);

    // tokens (with stacking offsets)
    this._drawTokens(players, activeIndex);
  }
  _drawLadder(from, to, th) {
    const ctx = this.ctx;
    const a = this.cellCenter(from), b = this.cellCenter(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len; // normal
    const w = this.cell * 0.22;
    ctx.save();
    ctx.strokeStyle = th.ladder; ctx.lineWidth = Math.max(3, this.cell * 0.07);
    ctx.lineCap = 'round';
    // two rails
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a.x + nx*w*s, a.y + ny*w*s);
      ctx.lineTo(b.x + nx*w*s, b.y + ny*w*s);
      ctx.stroke();
    }
    // rungs
    const rungs = Math.max(3, Math.floor(len / (this.cell * 0.45)));
    ctx.lineWidth = Math.max(2, this.cell * 0.045);
    for (let i = 1; i < rungs; i++) {
      const t = i / rungs;
      const cx = a.x + dx*t, cy = a.y + dy*t;
      ctx.beginPath();
      ctx.moveTo(cx + nx*w, cy + ny*w);
      ctx.lineTo(cx - nx*w, cy - ny*w);
      ctx.stroke();
    }
    ctx.restore();
  }
  _drawSnake(from, to, th) {
    const ctx = this.ctx;
    const a = this.cellCenter(from), b = this.cellCenter(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    ctx.save();
    ctx.strokeStyle = th.snake; ctx.lineWidth = Math.max(4, this.cell * 0.16);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const waves = 3, amp = this.cell * 0.35;
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const wob = Math.sin(t * Math.PI * waves) * amp * (1 - t*0.2);
      ctx.lineTo(a.x + dx*t + nx*wob, a.y + dy*t + ny*wob);
    }
    ctx.stroke();
    // head at 'from'
    ctx.fillStyle = th.snake;
    ctx.beginPath(); ctx.arc(a.x, a.y, this.cell * 0.18, 0, Math.PI*2); ctx.fill();
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(a.x - this.cell*0.06, a.y - this.cell*0.05, this.cell*0.04, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x + this.cell*0.06, a.y - this.cell*0.05, this.cell*0.04, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(a.x - this.cell*0.06, a.y - this.cell*0.05, this.cell*0.018, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x + this.cell*0.06, a.y - this.cell*0.05, this.cell*0.018, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  _drawTokens(players, activeIndex) {
    players.forEach((p, i) => {
      let cx, cy;
      if (p.pixel) { cx = p.pixel.x; cy = p.pixel.y; }
      else {
        const c = this.cellCenter(Math.max(1, p.position));
        cx = c.x; cy = c.y;
      }
      // stacking offset for tokens sharing a square (only when not animating)
      const samers = players.filter(q => !q.animating && !q.finished &&
        Math.max(1,q.position) === Math.max(1,p.position) && q.position>0);
      let ox = 0, oy = 0;
      if (!p.animating && samers.length > 1) {
        const k = samers.indexOf(p);
        const ang = (k / samers.length) * Math.PI * 2;
        ox = Math.cos(ang) * this.cell * 0.18;
        oy = Math.sin(ang) * this.cell * 0.18;
      }
      this._drawToken(cx + ox, cy + oy, p, i === activeIndex);
    });
  }
  _drawToken(x, y, player, active) {
    const ctx = this.ctx;
    const r = this.cell * 0.28;
    const bounce = player.bounce || 0;
    y -= bounce;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + r*0.9 + bounce, r*0.7, r*0.28, 0, 0, Math.PI*2); ctx.fill();
    // body
    const grad = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.2, x, y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, player.color);
    grad.addColorStop(1, this._darken(player.color));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.strokeStyle = active ? '#fff' : 'rgba(0,0,0,0.4)';
    ctx.stroke();
    if (active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
  _darken(hex) {
    const c = hex.replace('#','');
    const n = parseInt(c, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.floor(r*0.55); g = Math.floor(g*0.55); b = Math.floor(b*0.55);
    return `rgb(${r},${g},${b})`;
  }
}

/* ----------------------------------------------------------
   AnimationManager — render loop + tweens
   ---------------------------------------------------------- */
class AnimationManager {
  constructor(board, getPlayers, getActive) {
    this.board = board; this.getPlayers = getPlayers; this.getActive = getActive;
    this.running = false;
    this._loop = this._loop.bind(this);
  }
  start() { if (!this.running) { this.running = true; requestAnimationFrame(this._loop); } }
  stop() { this.running = false; }
  _loop() {
    if (!this.running) return;
    this.board.draw(this.getPlayers(), this.getActive());
    requestAnimationFrame(this._loop);
  }
  // Tween a player's pixel position through a list of square numbers.
  async moveAlong(player, squares, audio, perStep = 200) {
    player.animating = true;
    for (const sq of squares) {
      const start = player.pixel || this.board.cellCenter(Math.max(1, player.position));
      const end = this.board.cellCenter(sq);
      await this._tween(perStep, (t) => {
        player.pixel = {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };
        player.bounce = Math.sin(t * Math.PI) * this.board.cell * 0.25;
      });
      player.position = sq;
      player.bounce = 0;
      audio.step();
    }
    player.pixel = null;
    player.animating = false;
  }
  // Smooth slide/climb for snake or ladder (single long tween, curved feel).
  async transport(player, to, audio, kind) {
    player.animating = true;
    const start = this.board.cellCenter(player.position);
    const end = this.board.cellCenter(to);
    kind === 'ladder' ? audio.ladder() : audio.snake();
    await this._tween(kind === 'ladder' ? 700 : 650, (t) => {
      const e = easeInOut(t);
      player.pixel = {
        x: start.x + (end.x - start.x) * e,
        y: start.y + (end.y - start.y) * e,
      };
      // wobble for snake, slight arc for ladder
      player.bounce = kind === 'snake'
        ? Math.sin(t * Math.PI * 6) * this.board.cell * 0.12
        : Math.sin(t * Math.PI) * this.board.cell * 0.15;
    });
    player.position = to;
    player.pixel = null; player.bounce = 0; player.animating = false;
  }
  _tween(duration, onUpdate) {
    return new Promise(resolve => {
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / duration, 0, 1);
        onUpdate(t);
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
}

/* ----------------------------------------------------------
   Confetti / particles
   ---------------------------------------------------------- */
function burstConfetti(layer, count = 120) {
  const colors = ['#ffcc33','#ff7a59','#4ade80','#3b82f6','#e879f9','#ffffff'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[rand(colors.length)];
    const dur = 2.2 + Math.random() * 2;
    const delay = Math.random() * 1.2;
    const drift = (Math.random() * 2 - 1) * 160;
    c.style.transform = `rotate(${rand(360)}deg)`;
    c.animate([
      { transform: `translate(0,0) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${drift}px, 110vh) rotate(${rand(720)}deg)`, opacity: 0.9 }
    ], { duration: dur*1000, delay: delay*1000, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'forwards' });
    layer.appendChild(c);
    setTimeout(() => c.remove(), (dur + delay) * 1000 + 100);
  }
}

/* ----------------------------------------------------------
   Game — orchestrator
   ---------------------------------------------------------- */
class Game {
  constructor() {
    this.audio = new AudioManager();
    this.stats = new StatisticsManager();
    this.theme = localStorage.getItem('sl_theme') || 'classic';
    this.players = [];
    this.current = 0;
    this.turnCount = 0;
    this.busy = false;
    this.paused = false;
    this.over = false;
    this.finishOrder = [];

    this.canvas = $('#board-canvas');
    this.board = new Board(this.canvas, () => THEMES[this.theme]);
    this.dice = new Dice($('#dice'), $('#dice-face'), this.audio);
    this.anim = new AnimationManager(this.board, () => this.players, () => this.current);

    this._bindUI();
    this._applyTheme(this.theme);
    window.addEventListener('resize', () => this._fitBoard());
  }

  /* ---------- setup / menu wiring ---------- */
  _bindUI() {
    // mode segmented
    $$('#mode-seg .seg-btn').forEach(b => b.onclick = () => {
      this.audio.click();
      $$('#mode-seg .seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const mode = b.dataset.mode;
      $$('.mode-panel').forEach(p => p.hidden = p.dataset.panel !== mode);
    });
    this._wireSeg('#difficulty-seg', 'diff');
    this._wireSeg('#ai-count-seg', 'ai');
    this._wireSeg('#local-count-seg', 'players');
    this._wireSeg('#custom-diff-seg', 'diff');

    // theme buttons
    $$('#theme-grid .theme-btn').forEach(b => b.onclick = () => {
      this.audio.click();
      $$('#theme-grid .theme-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      this.theme = b.dataset.theme;
      localStorage.setItem('sl_theme', this.theme);
      this._applyTheme(this.theme);
    });
    // reflect saved theme in UI
    $$('#theme-grid .theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === this.theme));

    // custom players builder
    this.customPlayers = [
      { name: 'Player 1', type: 'human' },
      { name: 'AI Blue', type: 'ai' },
    ];
    this._renderCustomPlayers();
    $('#custom-add').onclick = () => {
      this.audio.click();
      if (this.customPlayers.length >= 4) return;
      const i = this.customPlayers.length;
      this.customPlayers.push({ name: `${PLAYER_NAMES[i]}`, type: i === 0 ? 'human' : 'ai' });
      this._renderCustomPlayers();
    };
    $('#custom-remove').onclick = () => {
      this.audio.click();
      if (this.customPlayers.length <= 2) return;
      this.customPlayers.pop();
      this._renderCustomPlayers();
    };

    // main buttons
    $('#play-btn').onclick = () => { this.audio.click(); this.audio.startMusic(); this.startGame(); };
    $('#rules-btn').onclick = () => { this.audio.click(); this._showRules(); };
    $('#stats-btn').onclick = () => { this.audio.click(); this._showStats(); };

    // game controls
    $('#roll-btn').onclick = () => this.onRollClick();
    $('#restart-btn').onclick = () => { this.audio.click(); this.restart(); };
    $('#newgame-btn').onclick = () => { this.audio.click(); this.toMenu(); };
    $('#back-btn').onclick = () => { this.audio.click(); this.toMenu(); };
    $('#pause-btn').onclick = () => { this.audio.click(); this.togglePause(true); };
    $('#mute-btn').onclick = () => this.toggleMute();

    // pause overlay
    $('#resume-btn').onclick = () => { this.audio.click(); this.togglePause(false); };
    $('#pause-restart-btn').onclick = () => { this.audio.click(); this.togglePause(false); this.restart(); };
    $('#pause-menu-btn').onclick = () => { this.audio.click(); this.togglePause(false); this.toMenu(); };

    // victory
    $('#playagain-btn').onclick = () => { this.audio.click(); this.restart(); };
    $('#tomenu-btn').onclick = () => { this.audio.click(); this.toMenu(); };

    // modal close
    $('#modal-close').onclick = () => { this.audio.click(); this._closeModal(); };
    $('#modal-overlay').onclick = (e) => { if (e.target.id === 'modal-overlay') this._closeModal(); };

    // mute icon initial
    $('#mute-btn').textContent = this.audio.muted ? '🔇' : '🔊';

    // keyboard: space/enter rolls
    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && $('#game-screen').classList.contains('active')) {
        if (!this.busy && !this.paused && !this.over) { e.preventDefault(); this.onRollClick(); }
      }
    });
    // prevent scroll/zoom gestures over the board
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }
  _wireSeg(sel, key) {
    $$(`${sel} .seg-btn`).forEach(b => b.onclick = () => {
      this.audio.click();
      $$(`${sel} .seg-btn`).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  }
  _segValue(sel, key) {
    const el = $(`${sel} .seg-btn.active`);
    return el ? el.dataset[key] : null;
  }
  _renderCustomPlayers() {
    const wrap = $('#custom-players');
    wrap.innerHTML = '';
    this.customPlayers.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'custom-player-row';
      row.innerHTML = `
        <span class="cp-swatch" style="background:${PLAYER_COLORS[i]}"></span>
        <input type="text" value="${p.name.replace(/"/g,'')}" maxlength="14" />
        <div class="cp-type">
          <button data-t="human" class="${p.type==='human'?'active':''}">Human</button>
          <button data-t="ai" class="${p.type==='ai'?'active':''}">AI</button>
        </div>`;
      row.querySelector('input').oninput = (e) => { this.customPlayers[i].name = e.target.value || PLAYER_NAMES[i]; };
      row.querySelectorAll('.cp-type button').forEach(btn => btn.onclick = () => {
        this.audio.click();
        this.customPlayers[i].type = btn.dataset.t;
        row.querySelectorAll('.cp-type button').forEach(x => x.classList.toggle('active', x === btn));
      });
      wrap.appendChild(row);
    });
    $('#custom-add').disabled = this.customPlayers.length >= 4;
    $('#custom-remove').disabled = this.customPlayers.length <= 2;
  }

  _applyTheme(t) { document.body.setAttribute('data-theme', t); }

  /* ---------- build player roster from menu ---------- */
  _buildRoster() {
    const mode = this._segValue('#mode-seg', 'mode') ||
      ($('#mode-seg .seg-btn.active') ? $('#mode-seg .seg-btn.active').dataset.mode : 'single');
    let specs = [];
    if (mode === 'single') {
      const diff = this._segValue('#difficulty-seg', 'diff') || 'medium';
      const aiCount = parseInt(this._segValue('#ai-count-seg', 'ai') || '1', 10);
      specs.push({ type: 'human', name: 'You' });
      for (let i = 0; i < aiCount; i++) specs.push({ type: 'ai', name: `AI ${PLAYER_NAMES[i+1]}`, diff });
    } else if (mode === 'local') {
      const n = parseInt(this._segValue('#local-count-seg', 'players') || '2', 10);
      for (let i = 0; i < n; i++) specs.push({ type: 'human', name: `Player ${i+1}` });
    } else { // custom
      const diff = this._segValue('#custom-diff-seg', 'diff') || 'medium';
      specs = this.customPlayers.map(p => ({ type: p.type, name: p.name, diff }));
    }
    this.difficulty = specs.find(s => s.type==='ai')?.diff || 'medium';
    this.players = specs.map((s, i) => s.type === 'ai'
      ? new AIPlayer(i, s.name, PLAYER_COLORS[i], s.diff || 'medium')
      : new Player(i, s.name, PLAYER_COLORS[i], false));
  }

  /* ---------- screen transitions ---------- */
  _show(screenId) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
  }
  startGame() {
    this._buildRoster();
    this._resetState();
    this._show('#game-screen');
    this._fitBoard();
    this.anim.start();
    this._renderPlayers();
    this._updateTurnBanner();
    this._clearHistory();
    this.addHistory('🎮 Game started!');
    this.maybeAITurn();
  }
  restart() {
    this._closeVictory();
    this._resetState();
    this._show('#game-screen');
    this._fitBoard();
    this.anim.start();
    this.audio.startMusic();
    this._renderPlayers();
    this._updateTurnBanner();
    this._clearHistory();
    this.addHistory('🔁 New round!');
    this.maybeAITurn();
  }
  _resetState() {
    this.players.forEach(p => { p.position = 0; p.finished = false; p.finishOrder = null; p.pixel = null; p.bounce = 0; p.animating = false; });
    this.current = 0; this.turnCount = 0; this.busy = false; this.over = false;
    this.paused = false; this.finishOrder = [];
    $('#dice-result').textContent = 'Press roll to begin';
    $('#roll-btn').disabled = false;
  }
  toMenu() {
    this.anim.stop();
    this.over = true; this.busy = false;
    this._closeVictory();
    this._show('#menu-screen');
  }

  _fitBoard() {
    const wrap = $('.board-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const max = Math.min(rect.width || 320, rect.height || 320);
    this.board.resize(max || 320);
  }

  /* ---------- turn flow ---------- */
  get activePlayer() { return this.players[this.current]; }

  async onRollClick() {
    if (this.busy || this.paused || this.over) return;
    if (this.activePlayer.isAI) return; // AI rolls itself
    this.audio.click();
    await this.takeTurn();
  }

  async maybeAITurn() {
    if (this.over || this.paused) return;
    const p = this.activePlayer;
    if (p && p.isAI) {
      $('#roll-btn').disabled = true;
      await sleep(p.decideDelay());
      if (this.over || this.paused) return;
      await this.takeTurn();
    } else {
      $('#roll-btn').disabled = false;
    }
  }

  async takeTurn() {
    if (this.busy) return;
    this.busy = true;
    $('#roll-btn').disabled = true;
    const player = this.activePlayer;
    this.turnCount++;

    const value = await this.dice.roll();
    this.stats.addRoll();
    $('#dice-result').textContent = `${player.name} rolled a ${value}`;

    await this.resolveMove(player, value);

    if (this.over) { this.busy = false; return; }

    // advance turn (rolling a 6 grants another turn — classic optional rule)
    const extraTurn = value === 6 && !player.finished;
    if (!extraTurn) this._advanceCurrent();

    this.busy = false;
    this._renderPlayers();
    this._updateTurnBanner();
    if (extraTurn) this.addHistory(`🎲 ${player.name} rolled a 6 — bonus turn!`);

    // continue with AI or enable human
    this.maybeAITurn();
  }

  async resolveMove(player, value) {
    const from = player.position;
    const start = from === 0 ? 0 : from;
    let target = start + value;

    if (target > WIN) {
      this.addHistory(`✋ ${player.name} rolled ${value}, needs exact — stays on ${start || 'start'}`);
      return;
    }

    // walk one square at a time
    const path = [];
    for (let s = Math.max(1, start + 1); s <= target; s++) path.push(s);
    if (target === 0) return;
    await this.anim.moveAlong(player, path.length ? path : [target], this.audio);

    // win check
    if (player.position === WIN) { await this._handleWin(player); return; }

    // snakes & ladders
    if (LADDERS[player.position]) {
      const to = LADDERS[player.position];
      const climb = to - player.position;
      this.stats.recordLadder(climb);
      this.addHistory(`🪜 ${player.name} climbed ${player.position} → ${to} (+${climb})`, 'ladder');
      await this.anim.transport(player, to, this.audio, 'ladder');
      if (player.position === WIN) { await this._handleWin(player); return; }
    } else if (SNAKES[player.position]) {
      const to = SNAKES[player.position];
      const slide = player.position - to;
      this.stats.recordSnake(slide);
      this.addHistory(`🐍 ${player.name} slid ${player.position} → ${to} (−${slide})`, 'snake');
      await this.anim.transport(player, to, this.audio, 'snake');
    } else {
      this.addHistory(`▶ ${player.name} moved to ${player.position}`);
    }
    this._renderPlayers();
  }

  async _handleWin(player) {
    player.finished = true;
    player.finishOrder = this.finishOrder.length + 1;
    this.finishOrder.push(player);
    this.addHistory(`🏆 ${player.name} reached 100!`);
    // any remaining non-finished players? In 2p it's over; for >2 we still end at first winner.
    this.over = true;
    this.audio.victory();
    await sleep(400);
    this._showVictory(player);
  }

  _advanceCurrent() {
    let next = this.current;
    do { next = (next + 1) % this.players.length; }
    while (this.players[next].finished && next !== this.current);
    this.current = next;
  }

  /* ---------- pause / mute ---------- */
  togglePause(p) {
    if (this.over) return;
    this.paused = p;
    $('#pause-overlay').hidden = !p;
    if (p) { this.audio.stopMusic(); }
    else { if (!this.audio.muted) this.audio.startMusic(); this.maybeAITurn(); }
  }
  toggleMute() {
    const m = !this.audio.muted;
    this.audio.setMuted(m);
    $('#mute-btn').textContent = m ? '🔇' : '🔊';
    if (!m && $('#game-screen').classList.contains('active') && !this.paused) this.audio.startMusic();
  }

  /* ---------- UI rendering ---------- */
  _renderPlayers() {
    const panel = $('#players-panel');
    panel.innerHTML = '';
    this.players.forEach((p, i) => {
      const chip = document.createElement('div');
      chip.className = 'player-chip' + (i === this.current && !this.over ? ' active' : '') + (p.finished ? ' winner-chip' : '');
      const posLabel = p.finished ? '🏁' : (p.position === 0 ? 'Start' : p.position);
      chip.innerHTML = `
        <span class="player-token-dot" style="background:${p.color}"></span>
        <div class="player-meta">
          <div class="player-name">${this._esc(p.name)}</div>
          <div class="player-sub">${p.isAI ? '🤖 AI · ' + (p.difficulty||'') : '🙂 Human'}</div>
        </div>
        <div class="player-pos">${posLabel}</div>`;
      panel.appendChild(chip);
    });
  }
  _updateTurnBanner() {
    const p = this.activePlayer;
    if (!p) return;
    const banner = $('#turn-banner');
    banner.textContent = `${p.name}'s Turn` + (p.isAI ? ' 🤖' : '');
    banner.style.boxShadow = `0 0 0 2px ${p.color} inset`;
  }
  addHistory(text, kind) {
    const li = document.createElement('li');
    if (kind === 'snake') li.className = 'h-snake';
    if (kind === 'ladder') li.className = 'h-ladder';
    li.textContent = text;
    const list = $('#history-list');
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }
  _clearHistory() { $('#history-list').innerHTML = ''; }

  /* ---------- victory screen ---------- */
  _showVictory(winner) {
    // compose rankings: winner first, then by position desc
    const ranked = [...this.players].sort((a, b) => {
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.position - a.position;
    });
    const humanWon = !winner.isAI;
    this.stats.recordGame({ humanWon, turns: this.turnCount });

    $('#winner-title').textContent = `${winner.name} Wins!`;
    const rk = $('#rankings');
    rk.innerHTML = '';
    const medals = ['🥇','🥈','🥉','🎖'];
    ranked.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'rank-row';
      row.innerHTML = `
        <span class="rank-medal">${medals[i] || '•'}</span>
        <span class="rank-dot" style="background:${p.color}"></span>
        <span class="rank-name">${this._esc(p.name)}</span>
        <span class="rank-pos">${p.finished ? 'Finished' : 'Square ' + (p.position || 0)}</span>`;
      rk.appendChild(row);
    });
    $('#victory-stats').innerHTML = `
      <div class="vs-cell"><div class="vs-num">${this.turnCount}</div><div class="vs-lbl">Total Turns</div></div>
      <div class="vs-cell"><div class="vs-num">${this.players.length}</div><div class="vs-lbl">Players</div></div>
      <div class="vs-cell"><div class="vs-num">${this.stats.data.gamesPlayed}</div><div class="vs-lbl">Games Played</div></div>
      <div class="vs-cell"><div class="vs-num">${this.stats.winPct()}%</div><div class="vs-lbl">Win Rate</div></div>`;

    this._show('#victory-screen');
    this.audio.stopMusic();
    burstConfetti($('#victory-confetti'), 160);
  }
  _closeVictory() { $('#victory-confetti').innerHTML = ''; }

  /* ---------- modals: rules & stats ---------- */
  _openModal(html) { $('#modal-body').innerHTML = html; $('#modal-overlay').hidden = false; }
  _closeModal() { $('#modal-overlay').hidden = true; }
  _showRules() {
    this._openModal(`
      <h2>📖 How to Play</h2>
      <h3>Goal</h3>
      <p>Be the first to reach square <b>100</b>.</p>
      <h3>Rules</h3>
      <ul>
        <li>Players take turns rolling a six-sided die and move forward that many squares.</li>
        <li>Land on the foot of a <b style="color:var(--good)">ladder</b> 🪜 to climb up instantly.</li>
        <li>Land on a <b style="color:#ff8a8a">snake's</b> 🐍 head to slide back down.</li>
        <li>You need an <b>exact</b> roll to land on 100 — overshoot and you stay put.</li>
        <li>Roll a <b>6</b> and you earn a bonus turn!</li>
      </ul>
      <h3>Volume</h3>
      <div class="volume-row">🔈 <input type="range" id="vol-range" min="0" max="1" step="0.05" value="${this.audio.volume}"> 🔊</div>
    `);
    const vr = $('#vol-range');
    if (vr) vr.oninput = (e) => this.audio.setVolume(parseFloat(e.target.value));
  }
  _showStats() {
    const d = this.stats.data;
    this._openModal(`
      <h2>📊 Statistics</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="num">${d.gamesPlayed}</div><div class="lbl">Games Played</div></div>
        <div class="stat-card"><div class="num">${d.wins}</div><div class="lbl">Wins</div></div>
        <div class="stat-card"><div class="num">${this.stats.winPct()}%</div><div class="lbl">Win Percentage</div></div>
        <div class="stat-card"><div class="num">${d.fastestTurns ?? '—'}</div><div class="lbl">Fastest Victory (turns)</div></div>
        <div class="stat-card"><div class="num">${d.totalRolls}</div><div class="lbl">Total Dice Rolls</div></div>
        <div class="stat-card"><div class="num">${d.longestLadder}</div><div class="lbl">Longest Ladder Climb</div></div>
        <div class="stat-card"><div class="num">${d.biggestSnake}</div><div class="lbl">Biggest Snake Slide</div></div>
        <div class="stat-card"><div class="num">${d.gamesPlayed - d.wins}</div><div class="lbl">Losses</div></div>
      </div>
      <button class="btn reset-stats" id="reset-stats-btn">🗑 Reset Statistics</button>
    `);
    $('#reset-stats-btn').onclick = () => {
      this.audio.click();
      this.stats.reset();
      this._showStats();
    };
  }

  _esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
}

/* ----------------------------------------------------------
   Boot
   ---------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
