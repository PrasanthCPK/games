/*
 * enemy.js — Guard with a combat AI state machine, and a Boss subclass.
 *
 * AI states: PATROL -> ALERT -> ENGAGE (attack / block / retreat / counter) ->
 * HURT -> DEAD. Combat hits are resolved centrally in game.js by comparing
 * attack hitboxes; this file decides intent and timing.
 */
(function (global) {
  'use strict';

  var K = global.K;
  var U = global.Utils;
  var Physics = global.Physics;

  var S = {
    PATROL: 'PATROL', ALERT: 'ALERT', ENGAGE: 'ENGAGE', ATTACK: 'ATTACK',
    BLOCK: 'BLOCK', RETREAT: 'RETREAT', HURT: 'HURT', DEAD: 'DEAD', IDLE: 'IDLE',
  };

  function Guard(spec, game) {
    this.game = game;
    this.type = 'guard';
    this.w = 16; this.h = 38;
    this.x = spec.x * K.TILE + (K.TILE - this.w) / 2;
    this.y = spec.y * K.TILE + (K.TILE - this.h);
    this.vx = 0; this.vy = 0;
    this.facing = -1;
    this.onGround = false;
    this.maxHp = spec.hp || 3;
    this.hp = this.maxHp;
    this.alive = true;
    this.blocking = false;
    this.attackActive = false;
    this.scale = 1;

    this.patrol = spec.patrol || null; // [col0, col1]
    this.state = S.PATROL;
    this.decisionT = 0;
    this.stateT = 0;
    this._hitCd = 0;

    // Tunables (Boss overrides).
    this.speed = 70;
    this.reaction = 0.7;
    this.attackChance = 0.5;
    this.blockChance = 0.55;
    this.sightRange = K.TILE * 6;

    this._buildAnim();
  }

  Guard.prototype._buildAnim = function () {
    var clips = {};
    var defs = global.Sprites.CLIPS;
    for (var name in defs) {
      var d = defs[name];
      var frames = [];
      for (var i = 0; i < d.poses.length; i++) frames.push(i);
      clips[name] = new global.Animation({ frames: frames, fps: d.fps, loop: d.loop, events: d.events });
    }
    this.anim = new global.AnimationController(clips);
    var self = this;
    this.anim.onEvent = function (ev) {
      if (ev === 'attack:active') { self.attackActive = true; if (self.game.audio) self.game.audio.play('sword'); }
    };
    this.anim.play('idle');
  };

  Guard.prototype.setState = function (st) {
    if (this.state === st) return;
    this.state = st;
    this.stateT = 0;
  };

  // ---- Update -------------------------------------------------------------
  Guard.prototype.update = function (dt) {
    if (!this.alive) { this._dead(dt); return; }
    this.attackActive = false;
    this.blocking = false;
    this.stateT += dt;
    if (this._hitCd > 0) this._hitCd -= dt;

    var player = this.game.player;
    var dx = (player.x + player.w / 2) - (this.x + this.w / 2);
    var dy = Math.abs((player.y + player.h) - (this.y + this.h));
    var dist = Math.abs(dx);
    var canSee = player.alive && dist < this.sightRange && dy < K.TILE * 1.8;

    switch (this.state) {
      case S.PATROL: this._patrol(dt, canSee); break;
      case S.ALERT: this._alert(dt, dx); break;
      case S.ENGAGE: this._engage(dt, dx, dist, player); break;
      case S.ATTACK: this._attack(dt); break;
      case S.BLOCK: this._block(dt); break;
      case S.RETREAT: this._retreat(dt, dx); break;
      case S.HURT: this._hurt(dt); break;
      case S.IDLE: if (canSee) this.setState(S.ALERT); else this.vx = U.approach(this.vx, 0, 600 * dt); break;
    }

    Physics.step(this, this.game.level, dt);
    this.game.level.collideMovers(this);

    // Hazards kill guards too.
    var hz = this.game.level.hazardAtPx(this.x + this.w / 2, this.y + this.h - 4);
    if (hz) this.die();
    if (this.y > this.game.level.worldH + 40) this.die();

    this.anim.update(dt);
  };

  Guard.prototype._patrol = function (dt, canSee) {
    if (canSee) { this.setState(S.ALERT); return; }
    if (!this.patrol) { this.vx = U.approach(this.vx, 0, 600 * dt); return; }
    var leftX = this.patrol[0] * K.TILE;
    var rightX = this.patrol[1] * K.TILE;
    if (this.x <= leftX) this.facing = 1;
    else if (this.x + this.w >= rightX) this.facing = -1;
    // Turn around at walls/edges too.
    if (this.wallLeft) this.facing = 1;
    if (this.wallRight) this.facing = -1;
    if (Physics.atEdge(this, this.game.level, this.facing)) this.facing *= -1;
    this.vx = U.approach(this.vx, this.speed * 0.5 * this.facing, 600 * dt);
  };

  Guard.prototype._alert = function (dt, dx) {
    this.vx = U.approach(this.vx, 0, 800 * dt);
    this.facing = dx > 0 ? 1 : -1;
    if (this.stateT > 0.35) { this.setState(S.ENGAGE); this.decisionT = this.reaction; }
  };

  Guard.prototype._engage = function (dt, dx, dist, player) {
    this.facing = dx > 0 ? 1 : -1;

    if (!player.alive) { this.setState(S.PATROL); return; }
    if (dist > this.sightRange * 1.3) { this.setState(S.PATROL); return; }

    // React to the player's swing.
    if (player.attackActive && dist < K.SWORD_RANGE + 12 && Math.random() < this.blockChance) {
      this.setState(S.BLOCK); this.vx = 0; return;
    }

    if (dist > 30) {
      this.vx = U.approach(this.vx, this.speed * this.facing, 700 * dt);
      if (Physics.atEdge(this, this.game.level, this.facing)) this.vx = 0;
    } else {
      this.vx = U.approach(this.vx, 0, 800 * dt);
      this.decisionT -= dt;
      if (this.decisionT <= 0) {
        var r = Math.random();
        if (this.hp <= 1 && r < 0.4) { this.setState(S.RETREAT); }
        else if (r < this.attackChance) { this.setState(S.ATTACK); }
        else if (r < this.attackChance + 0.25) { this.setState(S.BLOCK); }
        this.decisionT = this.reaction;
      }
    }
  };

  Guard.prototype._attack = function (dt) {
    this.vx = U.approach(this.vx, 0, 800 * dt);
    if (this.anim.done) { this.setState(S.ENGAGE); this.decisionT = this.reaction * 0.6; }
  };

  Guard.prototype._block = function (dt) {
    this.blocking = true;
    this.vx = U.approach(this.vx, 0, 800 * dt);
    if (this.stateT > 0.45) { this.setState(S.ENGAGE); this.decisionT = this.reaction * 0.5; }
  };

  Guard.prototype._retreat = function (dt, dx) {
    this.facing = dx > 0 ? 1 : -1;
    this.blocking = true;
    var away = -this.facing;
    if (!Physics.atEdge(this, this.game.level, away) && !(away < 0 ? this.wallLeft : this.wallRight)) {
      this.vx = U.approach(this.vx, this.speed * 0.8 * away, 700 * dt);
    } else this.vx = 0;
    if (this.stateT > 0.7) { this.setState(S.ENGAGE); this.decisionT = this.reaction; }
  };

  Guard.prototype._hurt = function (dt) {
    this.vx = U.approach(this.vx, 0, 600 * dt);
    if (this.stateT > 0.3) this.setState(S.ENGAGE);
  };

  // ---- Combat interface (called by game) ---------------------------------
  Guard.prototype.attackHitbox = function () {
    return {
      x: this.facing > 0 ? this.x + this.w - 2 : this.x - K.SWORD_RANGE + 2,
      y: this.y + 6, w: K.SWORD_RANGE, h: this.h - 12,
    };
  };

  Guard.prototype.takeDamage = function (amount, fromX) {
    if (!this.alive) return;
    this.hp -= amount;
    this.vx = (this.x < fromX ? -1 : 1) * 90;
    if (this.game.particles) this.game.particles.blood(this.x + this.w / 2, this.y + this.h / 2);
    if (this.hp <= 0) { this.die(); return; }
    this.setState(S.HURT);
    // Sometimes counter-attack after being hit.
    if (Math.random() < 0.3) { this.setState(S.ATTACK); }
  };

  Guard.prototype.die = function () {
    if (!this.alive) return;
    this.alive = false;
    this.vx = 0;
    if (this.game.audio) this.game.audio.play('death');
    this.anim.play('dead', true);
    this._deathT = 1.0;
    if (this.onDeath) this.onDeath(this);
  };

  Guard.prototype._dead = function (dt) {
    Physics.step(this, this.game.level, dt);
    this.anim.update(dt);
  };

  // ---- Render -------------------------------------------------------------
  Guard.prototype.clipForState = function () {
    switch (this.state) {
      case S.PATROL: return Math.abs(this.vx) > 5 ? 'walk' : 'idle';
      case S.ALERT: return 'swordIdle';
      case S.ENGAGE: return Math.abs(this.vx) > 5 ? 'run' : 'swordIdle';
      case S.ATTACK: return 'attack';
      case S.BLOCK: return 'block';
      case S.RETREAT: return 'walk';
      case S.HURT: return 'hurt';
      case S.DEAD: return 'dead';
      default: return 'idle';
    }
  };

  Guard.prototype.render = function (ctx) {
    var clip = this.alive ? this.clipForState() : 'dead';
    // Keep the controller on the right clip for animation timing.
    if (this.anim.name !== clip) this.anim.play(clip, false);
    global.Sprites.drawCharacter(ctx, this.type, this.x + this.w / 2, this.y + this.h, clip, this.anim.index, this.facing, this.scale);
  };

  // ---- Boss ---------------------------------------------------------------
  function Boss(spec, game) {
    Guard.call(this, spec, game);
    this.type = 'boss';
    this.maxHp = spec.hp || 8;
    this.hp = this.maxHp;
    this.scale = 1.3;
    this.w = 20; this.h = 46;
    this.y = spec.y * K.TILE + (K.TILE - this.h);
    this.speed = 90;
    this.reaction = 0.5;
    this.attackChance = 0.6;
    this.blockChance = 0.7;
    this.sightRange = K.TILE * 8;
    this.isBoss = true;
  }
  Boss.prototype = Object.create(Guard.prototype);
  Boss.prototype.constructor = Boss;

  // Phase 2: gets faster and meaner when below half health.
  Boss.prototype.takeDamage = function (amount, fromX) {
    Guard.prototype.takeDamage.call(this, amount, fromX);
    if (this.alive && this.hp <= this.maxHp / 2) {
      this.reaction = 0.32;
      this.attackChance = 0.72;
      this.speed = 110;
    }
  };

  global.Guard = Guard;
  global.Boss = Boss;
})(window);
