/* ============================================================
   Game — state machine, camera, lives, scoring and progression.
   Driven by main.js: fixedUpdate(dt) is called with a FIXED dt
   (decoupled from frame rate), render(alpha) interpolates.
   ============================================================ */

import { Action } from './input.js';
import { Level } from './level.js';
import { Ball } from './physics.js';
import { LEVELS, LEVEL_COUNT, TILE } from './levels.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { clamp, lerp, formatTime, rand } from './utils.js';

const State = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DEAD: 'dead',
  LEVEL_COMPLETE: 'levelComplete',
  GAME_OVER: 'gameOver',
  GAME_COMPLETE: 'gameComplete',
});

const START_LIVES = 3;
const DEATH_FREEZE = 0.6; // seconds

export class Game {
  constructor(input, renderer) {
    this.input = input;
    this.renderer = renderer;
    this.ui = new UI(this);

    this.state = State.MENU;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.view = { w: 1, h: 1 };

    this.level = null;
    this.ball = null;
    this.levelIndex = 0;
    this.lives = START_LIVES;
    this.particles = [];

    this.time = 0;        // ever-advancing clock for animations
    this.levelTime = 0;   // current attempt timer (s)
    this.totalTime = 0;   // accumulated across cleared levels (s)
    this.deathTimer = 0;
    this.showBall = true;
    this.isTouch = false;

    this.hud = { rings: 0, total: 0, lives: START_LIVES, levelIndex: 0, levelName: '', time: '0:00.0' };
  }

  begin() { this.ui.showMenu(); }

  /* ---------- viewport / camera setup ---------- */
  setViewport(w, h) {
    this.view.w = w; this.view.h = h;
    this.renderer.setView(w, h);
    // Keep a consistent slice of the world visible regardless of
    // resolution/orientation, then zoom to fit the screen height.
    const portrait = h > w;
    const visibleTilesY = portrait ? 13 : 10.5;
    this.camera.zoom = clamp(h / (visibleTilesY * TILE), 0.5, 4);
    this._centerCamera(true);
  }

  /* ---------- level lifecycle ---------- */
  startLevel(index) {
    this.levelIndex = clamp(index, 0, LEVEL_COUNT - 1);
    this.level = new Level(LEVELS[this.levelIndex]);
    this.lives = START_LIVES;
    this._spawnBall();
    this.particles.length = 0;
    this.levelTime = 0;
    this.deathTimer = 0;
    this.showBall = true;
    this.state = State.PLAYING;
    this.ui.hide();
    this._centerCamera(true);
    Audio.resume();
  }

  _spawnBall() {
    const s = this.level.respawn;
    if (this.ball) this.ball.reset(s.x, s.y);
    else this.ball = new Ball(s.x, s.y);
    this.showBall = true;
  }

  restartLevel() { this.startLevel(this.levelIndex); }

  nextLevel() {
    if (this.levelIndex + 1 < LEVEL_COUNT) this.startLevel(this.levelIndex + 1);
    else this.toMenu();
  }

  toMenu() { this.state = State.MENU; this.ui.showMenu(); }

  pause() {
    if (this.state !== State.PLAYING && this.state !== State.DEAD) return;
    this.state = State.PAUSED;
    this.input.releaseAll();
    this.ui.showPause();
  }
  resume() {
    if (this.state !== State.PAUSED) return;
    this.state = State.PLAYING;
    this.ui.hide();
  }
  /** Auto-pause when tab/window loses focus. */
  pauseForBlur() { if (this.state === State.PLAYING) this.pause(); }

  /* ---------- edge input (handled once per rendered frame so taps
       are never dropped when zero or many fixed steps run) ---------- */
  handleFrameInput() {
    if (this.input.wasPressed(Action.PAUSE)) {
      if (this.state === State.PLAYING) this.pause();
      else if (this.state === State.PAUSED) this.resume();
    }
    if (this.input.wasPressed(Action.RESTART) &&
        (this.state === State.PLAYING || this.state === State.PAUSED || this.state === State.DEAD)) {
      this.restartLevel();
    }
  }

  /* ---------- main fixed-step update ---------- */
  fixedUpdate(dt) {
    this.time += dt;
    this._updateParticles(dt);

    if (this.state === State.PLAYING) this._updatePlaying(dt);
    else if (this.state === State.DEAD) this._updateDead(dt);

    this._updateCamera(dt);
  }

  _updatePlaying(dt) {
    this.levelTime += dt;
    const ball = this.ball, level = this.level;

    ball.update(dt, this.input, level);

    if (ball.bouncedThisStep) {
      if (this.input.isHeld(Action.JUMP)) Audio.jump();
      else Audio.bounce();
    }

    const got = level.collectRings(ball);
    if (got > 0) {
      Audio.ring();
      this._burst(ball.x, ball.y, '#ffd23f', got * 6);
    }

    if (level.updateCheckpoint(ball)) {
      Audio.checkpoint();
      this._burst(ball.x, ball.y, '#37d98a', 10);
    }

    if (level.hitsSpike(ball) || level.fellOut(ball)) {
      this._die();
      return;
    }

    if (level.reachedGoal(ball)) this._completeLevel();
  }

  _updateDead(dt) {
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this._spawnBall();
      this.state = State.PLAYING;
    }
  }

  _die() {
    Audio.death();
    this._burst(this.ball.x, this.ball.y, '#ff2e4d', 24, 320);
    this.lives--;
    this.showBall = false;
    if (this.lives <= 0) {
      this.state = State.GAME_OVER;
      this.ui.showGameOver();
    } else {
      this.state = State.DEAD;
      this.deathTimer = DEATH_FREEZE;
    }
  }

  _completeLevel() {
    const ms = this.levelTime * 1000;
    const isNewBest = Storage.recordTime(this.levelIndex, ms);
    Storage.addRings(this.level.collectedRings);
    Storage.unlockLevel(this.levelIndex + 1);
    this.totalTime += this.levelTime;
    Audio.win();
    this._burst(this.ball.x, this.ball.y, '#37d98a', 40, 380);
    this.showBall = false;

    if (this.levelIndex + 1 >= LEVEL_COUNT) {
      this.state = State.GAME_COMPLETE;
      this.ui.showGameComplete({ totalTime: this.totalTime * 1000 });
    } else {
      this.state = State.LEVEL_COMPLETE;
      this.ui.showLevelComplete({
        levelIndex: this.levelIndex,
        time: ms,
        best: Storage.getBestTime(this.levelIndex),
        isNewBest,
        rings: `${this.level.collectedRings}/${this.level.totalRings}`,
      });
    }
  }

  /* ---------- camera ---------- */
  _centerCamera(snap) {
    if (!this.level || !this.ball) return;
    const t = this._cameraTarget();
    if (snap) { this.camera.x = t.x; this.camera.y = t.y; }
  }

  _cameraTarget() {
    const halfW = (this.view.w / 2) / this.camera.zoom;
    const halfH = (this.view.h / 2) / this.camera.zoom;
    const lw = this.level.width, lh = this.level.height;
    let x = this.ball.x;
    let y = this.ball.y - halfH * 0.15; // look slightly ahead/up
    x = lw > halfW * 2 ? clamp(x, halfW, lw - halfW) : lw / 2;
    y = lh > halfH * 2 ? clamp(y, halfH, lh - halfH) : lh / 2;
    return { x, y };
  }

  _updateCamera(dt) {
    if (!this.level || !this.ball) return;
    const t = this._cameraTarget();
    const k = 1 - Math.pow(0.0015, dt); // smooth, frame-rate independent
    this.camera.x = lerp(this.camera.x, t.x, k);
    this.camera.y = lerp(this.camera.y, t.y, k);
  }

  /* ---------- particles ---------- */
  _burst(x, y, color, count, speed = 220) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.2, 1) * speed;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        r: rand(2, 5),
        life: rand(0.3, 0.7), maxLife: 0.7,
        color,
      });
    }
  }

  _updateParticles(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /* ---------- render ---------- */
  render(alpha) {
    // refresh HUD snapshot
    if (this.level) {
      this.hud.rings = this.level.collectedRings;
      this.hud.total = this.level.totalRings;
      this.hud.levelName = this.level.name;
    }
    this.hud.lives = this.lives;
    this.hud.levelIndex = this.levelIndex;
    this.hud.time = formatTime(this.levelTime * 1000);

    const inGame = this.state !== State.MENU;
    this.renderer.render(
      {
        camera: this.camera,
        level: inGame ? this.level : null,
        ball: this.ball,
        showBall: this.showBall && inGame,
        particles: this.particles,
        time: this.time,
        hud: this.hud,
        isTouch: this.isTouch,
      },
      alpha,
    );
  }
}

export { State };
