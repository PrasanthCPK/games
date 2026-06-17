/*
 * player.js — The prince. A state machine over free-momentum physics.
 *
 * States: IDLE, RUN, WALK (careful), TURN, JUMP, FALL, HANG, CLIMB_UP, LAND,
 * ROLL, CROUCH, DRINK, SWORD_IDLE, ATTACK, BLOCK, HURT, DEAD.
 *
 * Movement uses Physics for gravity + tile collision; HANG/CLIMB_UP script the
 * position directly. The sword is auto-drawn near guards (classic PoP) and can
 * also be toggled with the sword key.
 */
(function (global) {
  'use strict';

  var K = global.K;
  var U = global.Utils;
  var Physics = global.Physics;

  var S = {
    IDLE: 'IDLE', RUN: 'RUN', WALK: 'WALK', TURN: 'TURN', JUMP: 'JUMP',
    FALL: 'FALL', HANG: 'HANG', CLIMB_UP: 'CLIMB_UP', LAND: 'LAND', ROLL: 'ROLL',
    CROUCH: 'CROUCH', DRINK: 'DRINK', SWORD_IDLE: 'SWORD_IDLE', ATTACK: 'ATTACK',
    BLOCK: 'BLOCK', HURT: 'HURT', DEAD: 'DEAD',
  };
  // Map each state to a sprite animation clip.
  var CLIP = {
    IDLE: 'idle', RUN: 'run', WALK: 'walk', TURN: 'turn', JUMP: 'jump',
    FALL: 'fall', HANG: 'hang', CLIMB_UP: 'climbUp', LAND: 'land', ROLL: 'roll',
    CROUCH: 'crouch', DRINK: 'drink', SWORD_IDLE: 'swordIdle', ATTACK: 'attack',
    BLOCK: 'block', HURT: 'hurt', DEAD: 'dead',
  };

  function Player(spawn, game) {
    this.game = game;
    this.w = 16; this.h = 38;
    this.x = spawn.col * K.TILE + (K.TILE - this.w) / 2;
    this.y = spawn.row * K.TILE + (K.TILE - this.h);
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.maxHp = K.START_HP;
    this.hp = K.START_HP;
    this.alive = true;
    this.swordDrawn = false;
    this.blocking = false;
    this.attackActive = false;     // true on the active frame of an attack
    this.invuln = 0;
    this._sheathTimer = 0;
    this._deathTimer = 0;
    this.grab = null;
    this.climb = null;

    // Build animation clips from the procedural sprite definitions.
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
      if (ev === 'attack:active') {
        self.attackActive = true;
        if (self.game.audio) self.game.audio.play('sword');
      }
    };

    this.state = S.IDLE;
    this.anim.play('idle');
  }

  Player.prototype.setState = function (st) {
    if (this.state === st) return;
    this.state = st;
    this.anim.play(CLIP[st], true);
  };

  Player.prototype.input = function () { return this.game.input; };

  // ---- Main update --------------------------------------------------------
  Player.prototype.update = function (dt) {
    if (this.invuln > 0) this.invuln -= dt;
    this.attackActive = false; // reset; set by anim event during ATTACK
    this.blocking = false;

    if (this.state === S.DEAD) { this._updateDead(dt); return; }

    this._updateSword(dt);

    // Dispatch by state.
    switch (this.state) {
      case S.IDLE: case S.RUN: case S.WALK: case S.TURN: case S.CROUCH:
        this._ground(dt); break;
      case S.JUMP: case S.FALL: this._air(dt); break;
      case S.HANG: this._hang(dt); break;
      case S.CLIMB_UP: this._climbUp(dt); break;
      case S.LAND: this._timed(dt, S.IDLE); break;
      case S.ROLL: this._roll(dt); break;
      case S.DRINK: this._timed(dt, this.swordDrawn ? S.SWORD_IDLE : S.IDLE); break;
      case S.SWORD_IDLE: this._combat(dt); break;
      case S.ATTACK: this._attack(dt); break;
      case S.BLOCK: this._block(dt); break;
      case S.HURT: this._timed(dt, this.swordDrawn ? S.SWORD_IDLE : S.IDLE); break;
    }

    // Physics for non-scripted states.
    if (this.state !== S.HANG && this.state !== S.CLIMB_UP) {
      Physics.step(this, this.game.level, dt);
      this.game.level.collideMovers(this);
    }

    this._postChecks(dt);
    this.anim.update(dt);
  };

  // ---- Grounded movement --------------------------------------------------
  Player.prototype._ground = function (dt) {
    var inp = this.input();

    if (!this.onGround) { this.setState(S.FALL); return; }

    if (this.swordDrawn) { this.setState(S.SWORD_IDLE); return; }

    var axis = inp.axisX();

    // Interact (tap action): reveal secret near the prince.
    if (inp.pressed('action')) {
      var reward = this.game.level.tryRevealSecret(this.x + this.w / 2, this.y + this.h / 2);
      if (reward) { this.game.onSecretRevealed(reward, this); }
    }

    // Jump.
    if (inp.pressed('jump')) {
      var running = Math.abs(this.vx) > K.RUN_SPEED * 0.5;
      this.vy = running ? K.RUNJUMP_VY : K.JUMP_VY;
      if (running) this.vx = K.RUN_SPEED * this.facing; // carry momentum
      if (this.game.audio) this.game.audio.play('jump');
      this.setState(S.JUMP);
      return;
    }

    // Climb down into a hang at a ledge edge.
    if (inp.held('down') && Physics.atEdge(this, this.game.level, this.facing)) {
      this._startHangFromEdge();
      return;
    }

    if (axis !== 0) {
      // Turn animation when reversing at speed.
      if (axis !== this.facing && Math.abs(this.vx) > K.RUN_SPEED * 0.4) {
        this.facing = axis;
        this.setState(S.TURN);
      }
      this.facing = axis;
      var careful = inp.held('action');
      if (careful) {
        // Careful walk: slow, and stop at the lip of a gap.
        if (Physics.atEdge(this, this.game.level, this.facing)) { this.vx = 0; this.setState(S.WALK); }
        else { this.vx = U.approach(this.vx, K.WALK_SPEED * axis, K.RUN_ACCEL * dt); this.setState(S.WALK); }
      } else {
        this.vx = U.approach(this.vx, K.RUN_SPEED * axis, K.RUN_ACCEL * dt);
        this.setState(S.RUN);
      }
    } else if (inp.held('down')) {
      this.vx = U.approach(this.vx, 0, K.FRICTION * dt);
      this.setState(S.CROUCH);
    } else {
      this.vx = U.approach(this.vx, 0, K.FRICTION * dt);
      if (this.state !== S.TURN || this.anim.done) this.setState(S.IDLE);
    }
  };

  // ---- Airborne -----------------------------------------------------------
  Player.prototype._air = function (dt) {
    var inp = this.input();
    // Air control.
    var axis = inp.axisX();
    if (axis !== 0) { this.facing = axis; this.vx = U.approach(this.vx, K.RUN_SPEED * axis, K.RUN_ACCEL * 0.6 * dt); }

    if (this.vy > 0 && this.state === S.JUMP) this.setState(S.FALL);

    // Ledge grab (unless deliberately dropping).
    if (!inp.held('down')) {
      var g = Physics.ledgeGrab(this, this.game.level, this.facing);
      if (g) { this._grabLedge(g); return; }
    }

    if (this.onGround) this._land();
  };

  Player.prototype._land = function () {
    var fall = Physics.fallTiles(this);
    if (this.game.audio) this.game.audio.play('land');
    if (this.game.particles) this.game.particles.dust(this.x + this.w / 2, this.y + this.h);
    if (fall >= K.LETHAL_DROP_TILES) { this.die(); return; }
    if (fall >= K.ROLL_DROP_TILES) {
      if (Math.abs(this.vx) > 30) { this.setState(S.ROLL); this.takeDamage(0); }
      else { this.takeDamage(1, this.x); this.setState(S.LAND); }
    } else if (fall >= K.SAFE_DROP_TILES) {
      this.setState(S.LAND);
    } else {
      this.setState(this.input().axisX() !== 0 ? S.RUN : S.IDLE);
    }
    this._peakY = this.y;
  };

  Player.prototype._roll = function (dt) {
    this.vx = U.approach(this.vx, 0, K.FRICTION * 0.5 * dt);
    if (this.anim.done) this.setState(S.IDLE);
  };

  // ---- Hanging / climbing -------------------------------------------------
  Player.prototype._grabLedge = function (g) {
    this.grab = g;
    this.vx = 0; this.vy = 0;
    this.y = g.topY - 6;
    if (g.side > 0) this.x = g.col * K.TILE - this.w + 6;
    else this.x = (g.col + 1) * K.TILE - 6;
    this.facing = g.side;
    this.setState(S.HANG);
  };

  Player.prototype._startHangFromEdge = function () {
    // Stepping off the edge of the floor we stand on into a hang.
    var col = this.facing > 0 ? Physics.colOf(this.x + this.w + 2) : Physics.colOf(this.x - 2);
    var row = Physics.rowOf(this.y + this.h + 2);
    this._grabLedge({ col: this.facing > 0 ? Physics.colOf(this.x + this.w / 2) : Physics.colOf(this.x + this.w / 2), row: row, topY: (row) * K.TILE, side: this.facing });
    void col;
  };

  Player.prototype._hang = function (dt) {
    var inp = this.input();
    this.vx = 0; this.vy = 0;
    if (inp.pressed('up')) {
      // Begin scripted climb-up onto the ledge.
      this.climb = { t: 0, fromX: this.x, fromY: this.y, toX: this.grab.col * K.TILE + (this.grab.side > 0 ? 4 : K.TILE - this.w - 4), toY: this.grab.topY - this.h };
      this.setState(S.CLIMB_UP);
    } else if (inp.pressed('down') || inp.pressed('jump')) {
      this.grab = null;
      this.vy = 20;
      this.setState(S.FALL);
    }
  };

  Player.prototype._climbUp = function (dt) {
    var c = this.climb;
    c.t += dt / 0.45;
    var t = U.clamp(c.t, 0, 1);
    this.x = U.lerp(c.fromX, c.toX, t);
    this.y = U.lerp(c.fromY, c.toY, t);
    if (c.t >= 1) { this.climb = null; this.grab = null; this.onGround = true; this._peakY = this.y; this.setState(S.IDLE); }
  };

  // ---- Combat -------------------------------------------------------------
  Player.prototype._updateSword = function (dt) {
    // Auto-draw near a guard; auto-sheath when none nearby for a while.
    var near = this.game.nearestEnemyDist(this);
    if (this.input().pressed('sword')) {
      if (!this.swordDrawn) { this.swordDrawn = true; if (this.state !== S.JUMP && this.state !== S.FALL) this.setState(S.SWORD_IDLE); }
    }
    if (near < 70) { this.swordDrawn = true; this._sheathTimer = 1.6; }
    else if (this.swordDrawn) {
      this._sheathTimer -= dt;
      if (this._sheathTimer <= 0 && near > 130) this.swordDrawn = false;
    }
  };

  Player.prototype._combat = function (dt) {
    var inp = this.input();
    if (!this.onGround) { this.setState(S.FALL); return; }
    if (!this.swordDrawn) { this.setState(S.IDLE); return; }

    // Face the nearest enemy if one is in range.
    var foe = this.game.nearestEnemy(this);
    if (foe) this.facing = foe.x + foe.w / 2 > this.x + this.w / 2 ? 1 : -1;

    if (inp.pressed('sword')) { this.setState(S.ATTACK); this.vx = 0; return; }
    if (inp.held('block')) { this.setState(S.BLOCK); this.vx = 0; return; }

    var axis = inp.axisX();
    if (axis !== 0) { this.vx = U.approach(this.vx, K.WALK_SPEED * axis, K.RUN_ACCEL * dt); }
    else { this.vx = U.approach(this.vx, 0, K.FRICTION * dt); }
  };

  Player.prototype._attack = function (dt) {
    this.vx = U.approach(this.vx, 0, K.FRICTION * dt);
    if (this.anim.done) this.setState(this.swordDrawn ? S.SWORD_IDLE : S.IDLE);
  };

  Player.prototype._block = function (dt) {
    this.blocking = true;
    this.vx = U.approach(this.vx, 0, K.FRICTION * dt);
    if (!this.input().held('block')) this.setState(S.SWORD_IDLE);
  };

  /** Forward sword hitbox, valid while attackActive. */
  Player.prototype.attackHitbox = function () {
    return {
      x: this.facing > 0 ? this.x + this.w - 2 : this.x - K.SWORD_RANGE + 2,
      y: this.y + 6, w: K.SWORD_RANGE, h: this.h - 12,
    };
  };

  // ---- Damage / death -----------------------------------------------------
  Player.prototype.takeDamage = function (amount, fromX) {
    if (!this.alive) return;
    if (amount > 0 && this.invuln > 0) return;
    if (amount > 0) {
      this.hp -= amount;
      this.invuln = 0.8;
      if (fromX != null) { this.vx = (this.x < fromX ? -1 : 1) * 120; }
      if (this.game.audio) this.game.audio.play('hurt');
      if (this.game.particles) this.game.particles.blood(this.x + this.w / 2, this.y + this.h / 2);
      if (this.hp <= 0) { this.die(); return; }
      this.setState(S.HURT);
    }
  };

  Player.prototype.heal = function (n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  };

  Player.prototype.die = function () {
    if (this.state === S.DEAD) return;
    this.hp = 0; this.alive = false;
    this.vx = 0;
    if (this.game.audio) this.game.audio.play('death');
    this.setState(S.DEAD);
    this._deathTimer = 1.3;
  };

  Player.prototype._updateDead = function (dt) {
    Physics.step(this, this.game.level, dt);
    this.anim.update(dt);
    this._deathTimer -= dt;
    if (this._deathTimer <= 0) this.game.onPlayerDead();
  };

  // ---- Misc per-frame checks ---------------------------------------------
  Player.prototype._postChecks = function (dt) {
    if (this.state === S.DEAD) return;

    // Fell out of the world.
    if (this.y > this.game.level.worldH + 40) { this.die(); return; }

    // Hazards (spikes / pits) at the prince's lower body.
    var hz = this.game.level.hazardAtPx(this.x + this.w / 2, this.y + this.h - 4);
    if (hz === 'spike' || hz === 'pit') { this.die(); return; }

    // Potions.
    var effect = this.game.level.collectPotion(this);
    if (effect) {
      if (effect === 'maxhp') { this.maxHp = Math.min(K.MAX_HP, this.maxHp + 1); this.hp = this.maxHp; }
      else { this.heal(2); }
      if (this.game.audio) this.game.audio.play('potion');
      if (this.game.particles) this.game.particles.spawn(this.x + this.w / 2, this.y + 4, { count: 8, color: '#7ad', up: true, life: 0.6 });
      if (this.onGround && this.state !== S.ROLL) this.setState(S.DRINK);
    }

    // Exit.
    if (this.game.level.exitAtPx(this.x + this.w / 2, this.y + this.h / 2)) {
      this.game.onReachExit();
    }
  };

  // ---- Render -------------------------------------------------------------
  Player.prototype.render = function (ctx) {
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0 && this.alive) return; // blink
    var cx = this.x + this.w / 2;
    var feetY = this.y + this.h;
    global.Sprites.drawCharacter(ctx, 'prince', cx, feetY, CLIP[this.state], this.anim.index, this.facing);
  };

  Player.STATES = S;
  global.Player = Player;
})(window);
