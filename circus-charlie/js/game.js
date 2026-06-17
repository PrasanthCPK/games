/* ============================================================
   game.js — Game controller
   Owns the canvas, the system objects (input/audio/particles/camera/
   ui/player), the run-time state (score/lives/stage) and the finite
   state machine that ties menus and gameplay together. Also runs the
   main loop and handles responsive scaling.
   ============================================================ */
(function () {
  "use strict";

  const STATE = {
    MENU: "menu",
    CONTROLS: "controls",
    HIGHSCORES: "highscores",
    INTRO: "intro",
    PLAYING: "playing",
    PAUSED: "paused",
    STAGE_COMPLETE: "stage_complete",
    GAME_OVER: "game_over",
  };

  const HS_KEY = "circusCharlie.highscores";

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.W = canvas.width;
      this.H = canvas.height;

      // Systems
      this.input = new InputManager();
      this.audio = new AudioManager();
      this.particles = new ParticleSystem(500);
      this.camera = new Camera(this.W, this.H);
      this.ui = new UI(this.W, this.H);
      this.player = new Player();

      // Stage factories (in play order).
      this.stageFactories = Stages.build();

      // Run-time state
      this.score = 0;
      this.lives = 3;
      this.combo = 0;
      this.stageIndex = 1;          // 1-based for display
      this.currentStage = null;
      this.popups = [];
      this.menuIndex = 0;
      this.won = false;

      this.highScores = this._loadHighScores();
      this.highScore = this.highScores[0] || 0;

      this.state = STATE.MENU;
      this._introT = 0;
      this._transitionT = 0;
      this.scData = null;

      this._last = performance.now();
      this._setupResize();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    /* ---------------- High score persistence ---------------- */
    _loadHighScores() {
      try {
        const raw = localStorage.getItem(HS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.slice(0, 5) : [];
      } catch (e) {
        return [];
      }
    }
    _saveHighScore(score) {
      this.highScores.push(score);
      this.highScores.sort((a, b) => b - a);
      this.highScores = this.highScores.slice(0, 5);
      this.highScore = this.highScores[0] || 0;
      try {
        localStorage.setItem(HS_KEY, JSON.stringify(this.highScores));
      } catch (e) {}
    }

    /* ---------------- Responsive scaling ---------------- */
    _setupResize() {
      const resize = () => {
        const frame = document.getElementById("stage-frame");
        const maxW = window.innerWidth - 16;
        const maxH = window.innerHeight - 16;
        const ratio = this.W / this.H;
        let w = maxW;
        let h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
        frame.style.width = Math.floor(w) + "px";
        frame.style.height = Math.floor(h) + "px";

        // Touch controls only for touch devices.
        const touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
        const tc = document.getElementById("touch-controls");
        tc.classList.toggle("hidden", !touch);

        // Portrait phone hint.
        const hint = document.getElementById("rotate-hint");
        const portrait = window.innerHeight > window.innerWidth;
        hint.classList.toggle("hidden", !(touch && portrait));
      };
      window.addEventListener("resize", resize);
      window.addEventListener("orientationchange", resize);
      resize();
    }

    /* ---------------- Stage flow ---------------- */
    startGame() {
      this.score = 0;
      this.lives = 3;
      this.combo = 0;
      this.won = false;
      this.stageIndex = 1;
      this.audio.resume();
      this._beginStage(0);
    }

    _beginStage(idx0) {
      this.stageIndex = idx0 + 1;
      this.currentStage = this.stageFactories[idx0]();
      // Difficulty scales across the 6 stages.
      this.currentStage.difficulty = idx0 / (this.stageFactories.length - 1);
      this.currentStage.init(this);
      this.particles.clear();
      this.popups.length = 0;
      this.combo = 0;
      this._introT = 0;
      this.state = STATE.INTRO;
      this.input.flush(); // drop any edges left over from the menu
      // Music tempo ramps up with the stage.
      this.audio.startMusic(126 + idx0 * 6);
    }

    _nextStage() {
      const next = this.stageIndex; // current is 1-based, next index0 = stageIndex
      if (next >= this.stageFactories.length) {
        // Cleared the whole show!
        this.won = true;
        this._toGameOver();
      } else {
        this._beginStage(next);
      }
    }

    _completeStage() {
      const s = this.currentStage;
      this.audio.stageComplete();
      this.audio.stopMusic();
      // Reward a bonus life each stage (capped) so the full 6-stage run
      // stays fair — lives otherwise carry over with no way to recover.
      this.lives = Math.min(5, this.lives + 1);
      const accuracy = s.accuracy;
      this.scData = {
        stage: this.stageIndex,
        name: s.name,
        clearBonus: 500,
        accuracy: accuracy,
        accuracyBonus: accuracy * 10,
        livesBonus: this.lives * 200,
        revealT: 0,
        applied: false,
      };
      this.particles.confetti(this.W / 2, 0);
      this.state = STATE.STAGE_COMPLETE;
    }

    _toGameOver() {
      this.audio.stopMusic();
      if (this.won) this.audio.stageComplete();
      else this.audio.gameOver();
      this._saveHighScore(this.score);
      this._isNewHigh = this.score >= this.highScore && this.score > 0;
      this.menuIndex = 0;
      this.state = STATE.GAME_OVER;
    }

    /* ---------------- Gameplay callbacks (used by stages) ---------------- */
    addScore(points, x, y) {
      this.score += points;
      if (this.score > this.highScore) this.highScore = this.score;
      if (x != null) {
        this.popups.push({
          text: "+" + points,
          x, y,
          vy: -40,
          life: 0,
          max: 0.9,
          color: "#ffd23f",
          size: 16,
        });
      }
    }

    bumpCombo() {
      this.combo++;
      if (this.combo >= 2) {
        this.audio.combo(this.combo);
        const p = this.player;
        this.popups.push({
          text: "COMBO x" + this.combo + "!",
          x: p.x, y: p.y - 90,
          vy: -30, life: 0, max: 1.0,
          color: "#ff8c1a", size: 20,
        });
      }
    }
    breakCombo() {
      this.combo = 0;
    }

    /** Called by a stage when Charlie dies (collision or fall). */
    playerDied(fell) {
      if (this.state !== STATE.PLAYING) return;
      this.breakCombo();
      this.lives--;
      this.camera.shake(12, 0.45);
      if (this.lives <= 0) {
        this.audio.lifeLost();
        this._toGameOver();
      } else {
        this.audio.damage();
        this.currentStage.respawn(this);
      }
    }

    /* ---------------- Main loop ---------------- */
    _loop(now) {
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.05) dt = 0.05;     // clamp big stalls (tab switch)
      this._update(dt);
      this._render();
      requestAnimationFrame(this._loop);
    }

    _update(dt) {
      switch (this.state) {
        case STATE.MENU: this._updateMenu(dt); break;
        case STATE.CONTROLS:
        case STATE.HIGHSCORES: this._updateInfoScreen(dt); break;
        case STATE.INTRO: this._updateIntro(dt); break;
        case STATE.PLAYING: this._updatePlaying(dt); break;
        case STATE.PAUSED: this._updatePaused(dt); break;
        case STATE.STAGE_COMPLETE: this._updateStageComplete(dt); break;
        case STATE.GAME_OVER: this._updateGameOver(dt); break;
      }
      this._updatePopups(dt);
    }

    _confirm() {
      return this.input.consumeSelect();
    }

    _updateMenu(dt) {
      this._menuTime = (this._menuTime || 0) + dt;
      const items = 4;
      if (this.input.consumeNavUp()) { this.menuIndex = (this.menuIndex + items - 1) % items; this.audio.resume(); }
      if (this.input.consumeNavDown()) { this.menuIndex = (this.menuIndex + 1) % items; this.audio.resume(); }
      if (this._confirm()) {
        this.audio.resume();
        switch (this.menuIndex) {
          case 0: this.startGame(); break;
          case 1: this.menuIndex = 0; this.state = STATE.HIGHSCORES; break;
          case 2: this.state = STATE.CONTROLS; break;
          case 3: this.audio.toggleMute(); break;
        }
      }
    }

    _updateInfoScreen(dt) {
      this._menuTime = (this._menuTime || 0) + dt;
      if (this._confirm()) {
        this.menuIndex = 0;
        this.state = STATE.MENU;
      }
    }

    _updateIntro(dt) {
      this._introT += dt;
      // Let particles settle behind the card.
      this.particles.update(dt);
      if (this._introT >= 2.0) {
        this.input.flush();
        this.state = STATE.PLAYING;
      }
    }

    _updatePlaying(dt) {
      if (this.input.consumePause()) {
        this.menuIndex = 0;
        this.state = STATE.PAUSED;
        this.audio.stopMusic();
        return;
      }
      this.currentStage.update(dt, this);
      this.particles.update(dt);
      this.camera.update(dt);

      if (this.currentStage.complete) {
        this._completeStage();
      }
    }

    _updatePaused(dt) {
      const items = 3;
      if (this.input.consumeNavUp()) this.menuIndex = (this.menuIndex + items - 1) % items;
      if (this.input.consumeNavDown()) this.menuIndex = (this.menuIndex + 1) % items;
      if (this.input.consumePause()) {
        this.state = STATE.PLAYING;
        this.audio.startMusic(126 + (this.stageIndex - 1) * 6);
        return;
      }
      if (this._confirm()) {
        switch (this.menuIndex) {
          case 0: // Resume
            this.state = STATE.PLAYING;
            this.audio.startMusic(126 + (this.stageIndex - 1) * 6);
            break;
          case 1: // Restart stage
            this._beginStage(this.stageIndex - 1);
            break;
          case 2: // Main menu
            this.audio.stopMusic();
            this.menuIndex = 0;
            this.state = STATE.MENU;
            break;
        }
      }
    }

    _updateStageComplete(dt) {
      this.particles.update(dt);
      this.camera.update(dt);
      this.scData.revealT += dt;
      const fullyRevealed = this.scData.revealT * 2 >= 4;
      if (fullyRevealed && !this.scData.applied) {
        this.scData.applied = true;
        this.addScore(this.scData.clearBonus);
        this.addScore(this.scData.accuracyBonus);
        this.addScore(this.scData.livesBonus);
      }
      // Occasional confetti while the tally shows.
      if (Math.random() < 0.08) this.particles.confetti(this.W / 2, 0);
      if (fullyRevealed && this._confirm()) {
        this._nextStage();
      }
    }

    _updateGameOver(dt) {
      this._menuTime = (this._menuTime || 0) + dt;
      this.particles.update(dt);
      const items = 2;
      if (this.input.consumeNavUp()) this.menuIndex = (this.menuIndex + items - 1) % items;
      if (this.input.consumeNavDown()) this.menuIndex = (this.menuIndex + 1) % items;
      if (this._confirm()) {
        if (this.menuIndex === 0) this.startGame();
        else { this.menuIndex = 0; this.state = STATE.MENU; }
      }
    }

    _updatePopups(dt) {
      for (let i = this.popups.length - 1; i >= 0; i--) {
        const p = this.popups[i];
        p.life += dt;
        p.y += p.vy * dt;
        if (p.life >= p.max) this.popups.splice(i, 1);
      }
    }

    /* ---------------- Rendering ---------------- */
    _render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);

      switch (this.state) {
        case STATE.MENU:
          this.ui.mainMenu(ctx, ["START GAME", "HIGH SCORES", "CONTROLS", "SOUND"], this.menuIndex, this._menuTime || 0, this.audio.muted);
          break;
        case STATE.CONTROLS:
          this.ui.controls(ctx, this._menuTime || 0);
          break;
        case STATE.HIGHSCORES:
          this.ui.highScores(ctx, this.highScores, this._menuTime || 0);
          break;
        case STATE.INTRO:
          this._renderWorld();
          this.ui.stageIntro(ctx, this.stageIndex, this.currentStage.name, this._introT / 2.0);
          break;
        case STATE.PLAYING:
          this._renderWorld();
          this.ui.drawHUD(ctx, this);
          break;
        case STATE.PAUSED:
          this._renderWorld();
          this.ui.drawHUD(ctx, this);
          this.ui.pause(ctx, ["RESUME", "RESTART STAGE", "MAIN MENU"], this.menuIndex, this._menuTime || 0);
          break;
        case STATE.STAGE_COMPLETE:
          this._renderWorld(); // already renders confetti particles
          this.ui.stageComplete(ctx, this, this.scData, this.scData.revealT);
          break;
        case STATE.GAME_OVER:
          this.ui.gameOver(ctx, this, this._menuTime || 0, this._isNewHigh, this.won);
          this.particles.render(ctx, this.camera);
          break;
      }
    }

    _renderWorld() {
      const ctx = this.ctx;
      ctx.save();
      this.camera.applyShake(ctx);
      this.currentStage.render(ctx, this);
      this.particles.render(ctx, this.camera);
      this._renderPopups(ctx);
      ctx.restore();
    }

    _renderPopups(ctx) {
      for (const p of this.popups) {
        const a = 1 - p.life / p.max;
        ctx.globalAlpha = a;
        Utils.pixelText(ctx, p.text, p.x - this.camera.x, p.y - this.camera.y, p.size, p.color);
        ctx.globalAlpha = 1;
      }
    }
  }

  window.Game = Game;
  window.STATE = STATE;
})();
