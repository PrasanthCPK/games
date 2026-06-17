/*
 * game.js — Main orchestrator: fixed-timestep loop, global state machine,
 * system wiring, combat resolution, level progression, save/leaderboard, and
 * DOM menu handling.
 *
 * Global states: MENU, PLAYING, PAUSED, GAMEOVER, VICTORY, LEADERBOARD.
 * Room transitions are handled inline (gameplay briefly freezes while the
 * camera eases to the next room).
 */
(function (global) {
  'use strict';

  var K = global.K;
  var U = global.Utils;
  var Storage = U.Storage;

  var LEVELS = ['level1', 'level2', 'level3'];
  var ST = { MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER', VICTORY: 'VICTORY', LEADERBOARD: 'LEADERBOARD' };

  function $(id) { return document.getElementById(id); }

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = K.ROOM_COLS * K.TILE;   // 320
    this.H = K.ROOM_ROWS * K.TILE;   // 256
    canvas.width = this.W;
    canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;

    this.input = new global.Input();
    this.audio = new global.AudioManager();
    this.ui = new global.UI(this);
    this.particles = new global.Particles();
    this.camera = new global.Camera();

    this.bus = new U.EventBus();
    this.level = null;
    this.player = null;
    this.enemies = [];
    this.levelIndex = 0;
    this.timeLeft = 0;
    this.runTime = 0;          // total elapsed for scoring
    this.challengeMode = false;
    this.state = ST.MENU;
    this._levelDone = false;
    this.debug = false;

    this.acc = 0;
    this.last = 0;

    this._loadSettings();
    this._bindUI();
    this._bindFirstGesture();
  }

  // ---- Boot / loop --------------------------------------------------------
  Game.prototype.boot = function () {
    this.showScreen('main');
    var save = Storage.get('pop_save', null);
    var cont = $('btn-continue');
    if (cont) cont.style.display = save ? '' : 'none';
    return Promise.resolve();
  };

  Game.prototype.start = function () {
    var self = this;
    this.last = performance.now();
    requestAnimationFrame(function loop(now) {
      requestAnimationFrame(loop);
      var frame = (now - self.last) / 1000;
      self.last = now;
      if (frame > K.MAX_FRAME) frame = K.MAX_FRAME;
      self.acc += frame;
      var steps = 0;
      while (self.acc >= K.FIXED_DT && steps < 5) {
        self.input.update();
        self.step(K.FIXED_DT);
        self.acc -= K.FIXED_DT;
        steps++;
      }
      self.render();
    });
  };

  // ---- Fixed-step update --------------------------------------------------
  Game.prototype.step = function (dt) {
    // Global pause toggle + debug.
    if (this.input.pressed('debug')) this.debug = !this.debug;
    if (this.input.pressed('pause')) {
      if (this.state === ST.PLAYING) this.pause();
      else if (this.state === ST.PAUSED) this.resume();
    }

    if (this.state !== ST.PLAYING) { this.ui.update(dt); return; }

    // Room transition: freeze gameplay while the camera slides.
    this.camera.follow(this.player, this.level);
    if (this.camera.inTransition()) {
      this.camera.update(dt);
      this.particles.update(dt);
      this.ui.update(dt);
      return;
    }

    // Timer.
    this.runTime += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; if (this.player.alive) this.player.die(); }

    this.level.update(dt, this);
    this.player.update(dt);
    for (var i = 0; i < this.enemies.length; i++) this.enemies[i].update(dt);
    this._resolveCombat(dt);

    this.camera.update(dt);
    this.particles.update(dt);
    this.ui.update(dt);
  };

  // ---- Combat -------------------------------------------------------------
  Game.prototype._resolveCombat = function (dt) {
    var p = this.player;
    p._hitCd = Math.max(0, (p._hitCd || 0) - dt);

    // Player's swing vs guards.
    if (p.alive && p.attackActive && p._hitCd <= 0) {
      var hb = p.attackHitbox();
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        if (!U.aabb(hb, e)) continue;
        var eFacingP = e.facing === (p.x + p.w / 2 > e.x + e.w / 2 ? 1 : -1);
        if (e.blocking && eFacingP) {
          this.audio.play('sword'); this.particles.spark(e.x + e.w / 2, e.y + e.h / 2);
        } else {
          e.takeDamage(1, p.x + p.w / 2);
        }
        p._hitCd = 0.35;
        break;
      }
    }

    // Guards' swings vs player.
    for (var j = 0; j < this.enemies.length; j++) {
      var g = this.enemies[j];
      if (!g.alive || !g.attackActive || (g._atkCd || 0) > 0) continue;
      var ghb = g.attackHitbox();
      if (U.aabb(ghb, p) && p.alive) {
        var pFacingG = p.facing === (g.x + g.w / 2 > p.x + p.w / 2 ? 1 : -1);
        if (p.blocking && pFacingG) {
          this.audio.play('sword'); this.particles.spark(p.x + p.w / 2, p.y + p.h / 2);
        } else {
          p.takeDamage(1, g.x + g.w / 2);
        }
        g._atkCd = 0.4;
      }
    }
    for (var k = 0; k < this.enemies.length; k++) {
      this.enemies[k]._atkCd = Math.max(0, (this.enemies[k]._atkCd || 0) - dt);
    }
  };

  Game.prototype.nearestEnemy = function (p) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      var d = Math.hypot((e.x + e.w / 2) - (p.x + p.w / 2), (e.y) - (p.y));
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  Game.prototype.nearestEnemyDist = function (p) {
    var e = this.nearestEnemy(p);
    if (!e) return Infinity;
    return Math.abs((e.x + e.w / 2) - (p.x + p.w / 2));
  };

  // ---- Level flow ---------------------------------------------------------
  Game.prototype.startGame = function (challenge, fromSave) {
    this.challengeMode = !!challenge;
    this.runTime = 0;
    var idx = 0;
    if (fromSave) {
      var save = Storage.get('pop_save', null);
      if (save) idx = Math.min(save.level || 0, LEVELS.length - 1);
    }
    this.levelIndex = idx;
    this.loadLevel(idx);
  };

  Game.prototype.loadLevel = function (idx) {
    var self = this;
    this.levelIndex = idx;
    global.Level.load(LEVELS[idx]).then(function (level) {
      self.level = level;
      self.player = new global.Player(level.spawn, self);
      self.enemies = [];
      level.entitiesSpec.forEach(function (spec) {
        if (spec.type === 'boss') self.enemies.push(new global.Boss(spec, self));
        else if (spec.type === 'guard') self.enemies.push(new global.Guard(spec, self));
      });
      self.timeLeft = self.challengeMode ? level.timeLimit : level.timeLimit;
      self._levelDone = false;
      self.camera.snapTo(self.player.x + self.player.w / 2, self.player.y + self.player.h / 2, level);
      self.ui.showBanner(level.name);
      self.state = ST.PLAYING;
      self.hideScreens();
      self.audio.startMusic();
      // Save progress (unlocked level).
      Storage.set('pop_save', { level: idx, challenge: self.challengeMode });
    }).catch(function (err) {
      console.error('Failed to load level', err);
      self.ui.toast('Level load error');
    });
  };

  Game.prototype.restartLevel = function () {
    this.audio.stopMusic();
    this.loadLevel(this.levelIndex);
  };

  Game.prototype.onReachExit = function () {
    if (this.state !== ST.PLAYING || this._levelDone) return;
    var bossAlive = this.enemies.some(function (e) { return e.isBoss && e.alive; });
    if (bossAlive) { this.ui.toast('Defeat the guardian!'); return; }
    this._levelDone = true;
    this.audio.play('win');
    if (this.levelIndex < LEVELS.length - 1) {
      this.ui.toast('Level complete!');
      this.audio.stopMusic();
      this.loadLevel(this.levelIndex + 1);
    } else {
      this.victory();
    }
  };

  Game.prototype.onPlayerDead = function () {
    this.gameOver();
  };

  Game.prototype.onSecretRevealed = function (reward, p) {
    this.audio.play('coin');
    this.particles.spawn(p.x + p.w / 2, p.y, { count: 10, color: '#caa24b', up: true, life: 0.7 });
    this.ui.toast('Secret passage!');
  };

  // ---- State transitions --------------------------------------------------
  Game.prototype.pause = function () {
    if (this.state !== ST.PLAYING) return;
    this.state = ST.PAUSED;
    this.audio.stopMusic();
    this.showScreen('pause');
  };
  Game.prototype.resume = function () {
    if (this.state !== ST.PAUSED) return;
    this.state = ST.PLAYING;
    this.hideScreens();
    this.audio.startMusic();
  };
  Game.prototype.toMenu = function () {
    this.state = ST.MENU;
    this.audio.stopMusic();
    var save = Storage.get('pop_save', null);
    var cont = $('btn-continue');
    if (cont) cont.style.display = save ? '' : 'none';
    this.showScreen('main');
  };
  Game.prototype.gameOver = function () {
    this.state = ST.GAMEOVER;
    this.audio.stopMusic();
    this.showScreen('gameover');
  };
  Game.prototype.victory = function () {
    this.state = ST.VICTORY;
    this.audio.stopMusic();
    this.audio.play('win');
    var stats = $('vic-stats');
    if (stats) stats.textContent = 'Time: ' + this.runTime.toFixed(1) + 's';
    var nameRow = $('vic-name-row');
    if (nameRow) nameRow.style.display = this.challengeMode ? '' : 'none';
    this.showScreen('victory');
  };

  // ---- Leaderboard --------------------------------------------------------
  Game.prototype.getLeaderboard = function () {
    return Storage.get('pop_leaderboard', []);
  };
  Game.prototype.submitScore = function (name) {
    var lb = this.getLeaderboard();
    lb.push({ name: (name || 'AAA').slice(0, 8), time: +this.runTime.toFixed(1), date: Date.now() });
    lb.sort(function (a, b) { return a.time - b.time; });
    lb = lb.slice(0, 10);
    Storage.set('pop_leaderboard', lb);
    this.showLeaderboard();
  };
  Game.prototype.showLeaderboard = function () {
    var lb = this.getLeaderboard();
    var list = $('lb-list');
    if (list) {
      if (!lb.length) list.innerHTML = '<li>No scores yet — try Challenge mode!</li>';
      else list.innerHTML = lb.map(function (r, i) {
        return '<li><span>' + (i + 1) + '. ' + r.name + '</span><span>' + r.time + 's</span></li>';
      }).join('');
    }
    this.state = ST.LEADERBOARD;
    this.showScreen('leaderboard');
  };

  // ---- Settings -----------------------------------------------------------
  Game.prototype._loadSettings = function () {
    var s = Storage.get('pop_settings', null);
    if (s) this.audio.setVolumes(s);
  };
  Game.prototype._saveSettings = function () {
    Storage.set('pop_settings', this.audio.volumes);
  };

  // ---- Rendering ----------------------------------------------------------
  Game.prototype.render = function () {
    var ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0a0805';
    ctx.fillRect(0, 0, this.W, this.H);

    if (this.level && this.state !== ST.MENU && this.state !== ST.LEADERBOARD) {
      ctx.save();
      this.camera.apply(ctx);
      this.level.render(ctx, this.camera);
      for (var i = 0; i < this.enemies.length; i++) this.enemies[i].render(ctx);
      this.player.render(ctx);
      this.particles.render(ctx);
      if (this.debug) this._renderDebug(ctx);
      ctx.restore();

      global.Lighting.draw(ctx, this.level, this.camera, this.W, this.H);
      this.ui.render(ctx, this.W, this.H);
    } else {
      this._renderTitleBackdrop(ctx);
    }
  };

  Game.prototype._renderTitleBackdrop = function (ctx) {
    var grd = ctx.createLinearGradient(0, 0, 0, this.H);
    grd.addColorStop(0, '#2c2012');
    grd.addColorStop(1, '#0a0805');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.W, this.H);
    // Faint sandstone arches.
    ctx.fillStyle = 'rgba(120,90,50,0.15)';
    for (var x = 0; x < this.W; x += 48) ctx.fillRect(x, this.H - 80, 36, 80);
  };

  Game.prototype._renderDebug = function (ctx) {
    var p = this.player;
    ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      ctx.strokeStyle = e.alive ? '#f00' : '#555';
      ctx.strokeRect(e.x, e.y, e.w, e.h);
    }
    if (p.attackActive) { var hb = p.attackHitbox(); ctx.strokeStyle = '#ff0'; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); }
    ctx.fillStyle = '#0f0'; ctx.font = '8px monospace';
    ctx.fillText(p.state + ' vx:' + p.vx.toFixed(0) + ' vy:' + p.vy.toFixed(0) + ' g:' + p.onGround, p.x - 10, p.y - 4);
  };

  // ---- DOM wiring ---------------------------------------------------------
  Game.prototype.showScreen = function (name) {
    this.hideScreens();
    var el = $('screen-' + name);
    if (el) el.classList.add('active');
    var overlay = $('overlay');
    if (overlay) overlay.classList.toggle('hidden', false);
  };
  Game.prototype.hideScreens = function () {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    var overlay = $('overlay');
    if (overlay) overlay.classList.toggle('hidden', true);
  };

  Game.prototype._on = function (id, fn) {
    var el = $(id);
    if (el) el.addEventListener('click', fn);
  };

  Game.prototype._bindUI = function () {
    var self = this;
    this._on('btn-start', function () { self.startGame(false, false); });
    this._on('btn-continue', function () { self.startGame(false, true); });
    this._on('btn-challenge', function () { self.startGame(true, false); });
    this._on('btn-leaderboard', function () { self.showLeaderboard(); });
    this._on('btn-settings', function () { self._openSettings('main'); });
    this._on('btn-resume', function () { self.resume(); });
    this._on('btn-restart', function () { self.hideScreens(); self.restartLevel(); });
    this._on('btn-pause-settings', function () { self._openSettings('pause'); });
    this._on('btn-quit', function () { self.toMenu(); });
    this._on('btn-retry', function () { self.hideScreens(); self.restartLevel(); });
    this._on('btn-go-menu', function () { self.toMenu(); });
    this._on('btn-vic-menu', function () { self.toMenu(); });
    this._on('btn-submit', function () { var n = $('vic-name'); self.submitScore(n ? n.value : 'AAA'); });
    this._on('btn-lb-back', function () { self.toMenu(); });

    // Settings sliders.
    var settingsBack = $('btn-settings-back');
    if (settingsBack) settingsBack.addEventListener('click', function () {
      self._saveSettings();
      self.showScreen(self._settingsFrom || 'main');
      if (self._settingsFrom === 'pause') { /* stay paused */ }
    });
    this._bindSlider('vol-master', 'master');
    this._bindSlider('vol-sfx', 'sfx');
    this._bindSlider('vol-music', 'music');

    // Touch controls.
    var tc = {};
    document.querySelectorAll('[data-action]').forEach(function (el) {
      tc[el.getAttribute('data-action')] = el;
    });
    this.input.bindTouch(tc);
  };

  Game.prototype._openSettings = function (from) {
    this._settingsFrom = from;
    var v = this.audio.volumes;
    if ($('vol-master')) $('vol-master').value = v.master;
    if ($('vol-sfx')) $('vol-sfx').value = v.sfx;
    if ($('vol-music')) $('vol-music').value = v.music;
    this.showScreen('settings');
  };

  Game.prototype._bindSlider = function (id, key) {
    var self = this;
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function () {
      var v = {}; v[key] = parseFloat(el.value);
      self.audio.init();
      self.audio.setVolumes(v);
      if (key === 'music' && !self.audio.musicOn && self.state === ST.PLAYING) self.audio.startMusic();
      self.audio.play('step');
    });
  };

  Game.prototype._bindFirstGesture = function () {
    var self = this;
    var unlock = function () {
      self.audio.init();
      self.audio.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  };

  global.Game = Game;
  global.LEVELS = LEVELS;
})(window);
