/* ============================================================
   stages.js — Stage classes
   A small base class plus one class per stage. Stages own their
   obstacles, scrolling, win/lose rules and accuracy stats. The Game
   drives them through a common interface:

     init(game)      – set up the stage and configure the player
     update(dt,game) – advance simulation, detect clears / deaths
     render(ctx,game)– draw world (camera offset already applied to particles)
     respawn(game)   – reposition player at the last checkpoint after a death
     complete        – set true when the stage is won
     progress        – 0..1 used by the HUD progress bar
   ============================================================ */
(function () {
  "use strict";

  const FLOOR_Y = 460;          // feet rest here on ground stages
  const VIEW_W = 960;
  const VIEW_H = 540;
  const FALL_LINE = VIEW_H + 80; // below this = fell to death

  /* =========================================================
     Base Stage
     ========================================================= */
  class Stage {
    constructor(name, theme) {
      this.name = name;
      this.theme = theme || {};
      this.complete = false;
      this.progress = 0;
      this.time = 0;
      this.cleared = 0;       // obstacles successfully passed
      this.totalObstacles = 0;
      this.difficulty = 0;    // 0..1, set by game per stage index
    }

    /** Accuracy as a whole-number percent. */
    get accuracy() {
      if (!this.totalObstacles) return 100;
      return Math.round((this.cleared / this.totalObstacles) * 100);
    }

    init(game) {}
    update(dt, game) {}
    render(ctx, game) {}
    respawn(game) {}
  }

  /* =========================================================
     AutoRunStage — shared engine for Lion (1), Horse (4) and the
     Final challenge (6). Charlie advances automatically on a mount
     and must jump over / through a stream of obstacles.

     Obstacle types:
       hoop    – flaming ring; be airborne at the right height to pass
       barrier – hurdle; jump over it
       pit     – gap in the floor; jump across or fall
       monkey  – ground creature moving toward Charlie; jump over
       swing   – overhead trapeze that dips to body height; pass when up
     ========================================================= */
  class AutoRunStage extends Stage {
    constructor(name, theme, cfg) {
      super(name, theme);
      this.cfg = cfg;                 // {runSpeed, mount, types, count, useCombo}
      this.obstacles = [];
      this.finishX = 0;
      this.checkpointX = 0;
      this.prevX = 0;
    }

    init(game) {
      const c = this.cfg;
      const p = game.player;
      p.reset(160, FLOOR_Y);
      p.configure({
        // Constant gravity/jump across every running stage so the jump
        // arc is identical and timing is learnable; only speed + spacing
        // scale the difficulty.
        gravity: 2000,
        jumpVel: 720,
        maxFall: 1100,
        ridePose: !!c.mount,
        color: "#2b6cff",
      });
      p.vx = c.runSpeed * (1 + this.difficulty * 0.18);
      this.runSpeed = p.vx;

      this._buildObstacles(game);
      this.prevX = p.x;
      this.checkpointX = 120;
      game.camera.reset();
    }

    _buildObstacles(game) {
      const c = this.cfg;
      this.obstacles = [];
      let x = 700;
      const count = c.count;
      for (let i = 0; i < count; i++) {
        const type = Utils.pick(c.types);
        const ob = { type, x, resolved: false, hit: false };
        if (type === "hoop") {
          ob.cy = FLOOR_Y - 80;
          ob.r = 48;
          ob.w = 18;
        } else if (type === "barrier") {
          ob.w = 22;
          ob.h = 40 + Math.floor(this.difficulty * 20);
        } else if (type === "pit") {
          ob.w = 70 + Math.floor(this.difficulty * 60);
        } else if (type === "monkey") {
          ob.w = 26;
          ob.h = 30;
          ob.speed = 60 + this.difficulty * 80; // moves toward player
        } else if (type === "swing") {
          ob.w = 30;
          ob.pivotX = x + 20;
          ob.pivotY = 120;
          ob.len = 250;
          ob.phase = Utils.rand(0, Math.PI * 2);
          ob.speed = 1.8 + this.difficulty;
        }
        this.obstacles.push(ob);
        // Spacing shrinks slightly with difficulty for density, but keeps
        // a floor so consecutive obstacles stay individually reactable.
        const gap = Utils.rand(320, 440) - this.difficulty * 70;
        x += Math.max(270, gap);
      }
      this.totalObstacles = this.obstacles.length;
      this.finishX = x + 400;
    }

    respawn(game) {
      const p = game.player;
      p.x = this.checkpointX;
      p.y = FLOOR_Y;
      p.vy = 0;
      p.vx = this.runSpeed;
      p.onGround = true;
      p.hit(1.4);
      this.prevX = p.x;
    }

    _overPit(x) {
      for (const ob of this.obstacles) {
        if (ob.type === "pit" && x > ob.x && x < ob.x + ob.w) return true;
      }
      return false;
    }

    update(dt, game) {
      this.time += dt;
      const p = game.player;

      // Jump on input.
      if (game.input.consumeJump() && p.onGround) {
        if (p.jump()) {
          game.audio.jump();
          game.particles.dust(p.x, FLOOR_Y, 1);
        }
      }

      // Keep auto-run speed constant.
      p.vx = this.runSpeed;

      // Floor — disappears over pits.
      const ground = this._overPit(p.x) ? Infinity : FLOOR_Y;
      p.update(dt, ground);

      // Running dust.
      if (p.onGround && Math.random() < 0.3) {
        game.particles.dust(p.x - 14, FLOOR_Y, 1);
      }

      // Update moving obstacles. Monkeys only advance once Charlie is
      // close; swings keep swinging for a lively backdrop.
      for (const ob of this.obstacles) {
        if (ob.type === "monkey" && ob.x - p.x < 520) ob.x -= ob.speed * dt;
        if (ob.type === "swing") ob.phase += ob.speed * dt;
      }

      // Fell into a pit / off the world.
      if (p.y > FALL_LINE) {
        this._die(game, true);
        return;
      }

      this._checkObstacles(game);

      // Camera + progress.
      game.camera.follow(p.x, 0.28);
      this.progress = Utils.clamp((p.x - 120) / (this.finishX - 120), 0, 1);
      this.prevX = p.x;

      // Win.
      if (p.x >= this.finishX && !this.complete) {
        this.complete = true;
      }
    }

    _checkObstacles(game) {
      const p = game.player;
      const box = p.box;
      for (const ob of this.obstacles) {
        if (ob.resolved) continue;

        if (ob.type === "hoop") {
          // Resolve at the moment Charlie's center crosses the hoop.
          if (this.prevX < ob.x && p.x >= ob.x) {
            const bodyCenter = p.y - p.h / 2;
            const within = Math.abs(bodyCenter - ob.cy) < ob.r * 0.68;
            if (within && !p.onGround) {
              ob.resolved = true;
              this.cleared++;
              game.bumpCombo();
              const pts = 100 * (this.cfg.useCombo ? game.combo : 1);
              game.addScore(pts, p.x, p.y - 70);
              game.audio.hoop();
              game.particles.sparkle(p.x, ob.cy, "#ffd23f");
            } else {
              ob.resolved = true;
              ob.hit = true;
              game.breakCombo();
              this._die(game, false, ob.x, ob.cy);
              return;
            }
          }
        } else if (ob.type === "barrier") {
          const obox = { x: ob.x, y: FLOOR_Y - ob.h, w: ob.w, h: ob.h };
          if (!p.invuln && Utils.aabb(box, obox)) {
            ob.hit = true;
            this._die(game, false, ob.x, FLOOR_Y - ob.h / 2);
            return;
          }
          if (p.x > ob.x + ob.w && !ob.resolved) {
            ob.resolved = true;
            this.cleared++;
            game.addScore(80, p.x, p.y - 60);
          }
        } else if (ob.type === "monkey") {
          const obox = { x: ob.x, y: FLOOR_Y - ob.h, w: ob.w, h: ob.h };
          if (!p.invuln && Utils.aabb(box, obox)) {
            ob.hit = true;
            this._die(game, false, ob.x, FLOOR_Y - ob.h / 2);
            return;
          }
          if (p.x > ob.x + ob.w && !ob.resolved) {
            ob.resolved = true;
            this.cleared++;
            game.addScore(120, p.x, p.y - 60);
          }
        } else if (ob.type === "pit") {
          if (p.x > ob.x + ob.w && !ob.resolved) {
            ob.resolved = true;
            this.cleared++;
            game.addScore(60, p.x, p.y - 60);
          }
        } else if (ob.type === "swing") {
          // Bar tip position.
          const ang = Math.sin(ob.phase) * 1.0;
          const bx = ob.pivotX + Math.sin(ang) * ob.len;
          const by = ob.pivotY + Math.cos(ang) * ob.len;
          const obox = { x: bx - 20, y: by - 8, w: 40, h: 16 };
          if (!p.invuln && Utils.aabb(box, obox)) {
            ob.hit = true;
            this._die(game, false, bx, by);
            return;
          }
          if (p.x > ob.pivotX + 60 && !ob.resolved) {
            ob.resolved = true;
            this.cleared++;
            game.addScore(100, p.x, p.y - 60);
          }
        }

        // Advance the checkpoint just past each safely-cleared obstacle.
        if (ob.resolved && !ob.hit) {
          this.checkpointX = Math.max(this.checkpointX, ob.x - 40);
        }
      }
    }

    _die(game, fell, fx, fy) {
      game.breakCombo();
      if (fx != null) game.particles.burst(fx, fy, "#e23a3a");
      else game.particles.burst(game.player.x, game.player.y - 20, "#e23a3a");
      game.camera.shake(10, 0.4);
      game.playerDied(fell);
    }

    render(ctx, game) {
      const cam = game.camera;
      Sprites.background(ctx, VIEW_W, VIEW_H, cam.x, this.theme, this.time);

      // Floor with pit gaps. Drawn in screen space; the texture scrolls
      // with the camera, then pit spans are punched out on top.
      Sprites.floor(ctx, VIEW_W, VIEW_H, FLOOR_Y, cam.x);
      for (const ob of this.obstacles) {
        if (ob.type === "pit") {
          Sprites.pit(ctx, ob.x - cam.x, ob.w, FLOOR_Y, VIEW_H - FLOOR_Y);
        }
      }

      // Obstacles.
      for (const ob of this.obstacles) {
        const sx = ob.x - cam.x;
        if (sx < -120 || sx > VIEW_W + 160) continue;
        if (ob.type === "hoop") {
          Sprites.hoop(ctx, sx, ob.cy, ob.r, this.time, game.particles, ob.x, ob.cy);
        } else if (ob.type === "barrier") {
          Sprites.barrier(ctx, sx, FLOOR_Y, ob.w, ob.h);
        } else if (ob.type === "monkey") {
          Sprites.monkey(ctx, sx + ob.w / 2, FLOOR_Y, this.time);
        } else if (ob.type === "swing") {
          const ang = Math.sin(ob.phase) * 1.0;
          Sprites.trapeze(ctx, ob.pivotX - cam.x, ob.pivotY, ang, ob.len);
        }
      }

      // Finish banner.
      const fsx = this.finishX - cam.x;
      if (fsx < VIEW_W + 100) {
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(fsx, FLOOR_Y - 160, 6, 160);
        ctx.fillStyle = "#e23a3a";
        ctx.fillRect(fsx, FLOOR_Y - 160, 60, 30);
        Utils.pixelText(ctx, "GOAL", fsx + 30, FLOOR_Y - 145, 14, "#fff");
      }

      // Mount + Charlie.
      const psx = game.player.x;
      if (this.cfg.mount === "lion") {
        Sprites.lion(ctx, psx - cam.x, FLOOR_Y, this.time, game.player.onGround);
      } else if (this.cfg.mount === "horse") {
        Sprites.horse(ctx, psx - cam.x, FLOOR_Y, this.time);
      }
      // When airborne the mount stays grounded; draw Charlie at his y.
      game.player.draw(ctx, cam);
    }
  }

  /* =========================================================
     Stage 2 — Tightrope Walk
     Hold Right to inch across the rope. Jump over monkeys, but DON'T
     jump into the birds that fly at head height. A balance meter rises
     while airborne and drains while grounded; let it fill and Charlie
     topples off the rope.
     ========================================================= */
  class TightropeStage extends Stage {
    constructor() {
      super("Tightrope Walk", { top: "#20143a", bottom: "#0c0420" });
      this.ropeY = 360;
      this.length = 2600;
    }

    init(game) {
      const p = game.player;
      p.reset(120, this.ropeY);
      p.configure({
        gravity: 2200,
        jumpVel: 560,
        moveSpeed: 130,
        ridePose: false,
        color: "#e23a3a",
      });
      p.vx = 0;
      this.balance = 0.0;           // 0 = steady, 1 = fall
      this.startX = 120;
      this.checkpointX = 120;
      this.obstacles = [];          // monkeys + birds
      this.cleared = 0;
      this._buildObstacles();
      game.camera.reset();
    }

    _buildObstacles() {
      this.obstacles = [];
      let x = 500;
      while (x < this.length - 200) {
        if (Math.random() < 0.5) {
          // Monkey walking toward Charlie along the rope.
          this.obstacles.push({ type: "monkey", x, w: 24, h: 28, resolved: false, speed: 30 + this.difficulty * 50 });
        } else {
          // Bird flying at head height toward Charlie.
          this.obstacles.push({ type: "bird", x, y: this.ropeY - 60, w: 26, h: 14, resolved: false, speed: 140 + this.difficulty * 120 });
        }
        x += Utils.rand(260, 380) - this.difficulty * 70;
      }
      this.totalObstacles = this.obstacles.length;
    }

    respawn(game) {
      const p = game.player;
      p.x = this.checkpointX;
      p.y = this.ropeY;
      p.vy = 0;
      p.vx = 0;
      p.onGround = true;
      p.hit(1.4);
      this.balance = 0;
    }

    update(dt, game) {
      this.time += dt;
      const p = game.player;
      const input = game.input;

      // Forward / backward walking (rope = horizontal track).
      let moving = false;
      if (input.right) { p.vx = p.moveSpeed; p.facing = 1; moving = true; }
      else if (input.left) { p.vx = -p.moveSpeed * 0.7; p.facing = -1; moving = true; }
      else p.vx = 0;

      if (input.consumeJump() && p.onGround) {
        p.jump();
        game.audio.jump();
        this.balance += 0.18;        // jumping is risky on a rope
      }

      p.update(dt, this.ropeY);
      p.x = Utils.clamp(p.x, this.startX, this.length);

      // Balance: rises in the air & while moving fast, drains when still.
      const drift = (p.onGround ? -0.5 : 0.7) + (moving ? 0.12 : 0);
      this.balance += drift * dt * (0.6 + this.difficulty * 0.8);
      this.balance = Utils.clamp(this.balance, 0, 1);
      if (this.balance >= 1) {
        this._fall(game);
        return;
      }
      // Charlie visibly wobbles with the balance value.
      p.facing = p.facing;

      // Obstacles.
      const box = p.box;
      for (const ob of this.obstacles) {
        if (ob.resolved) continue;
        // Obstacles only start approaching once Charlie is near, so they
        // don't drift past an empty stretch of rope before he arrives.
        const active = ob.x - p.x < 560;
        if (ob.type === "monkey") {
          if (active) ob.x -= ob.speed * dt;
          const obox = { x: ob.x - ob.w / 2, y: this.ropeY - ob.h, w: ob.w, h: ob.h };
          if (!p.invuln && Utils.aabb(box, obox)) { this._fall(game, ob.x, this.ropeY - 14); return; }
          if (p.x > ob.x + 30 && ob.x < p.x) { ob.resolved = true; this.cleared++; game.addScore(90, p.x, p.y - 60); }
        } else if (ob.type === "bird") {
          if (active) ob.x -= ob.speed * dt;
          const obox = { x: ob.x - ob.w / 2, y: ob.y - ob.h / 2, w: ob.w, h: ob.h };
          if (!p.invuln && Utils.aabb(box, obox)) { this._fall(game, ob.x, ob.y); return; }
          if (ob.x < p.x - 30) { ob.resolved = true; this.cleared++; game.addScore(70, p.x, p.y - 60); }
        }
      }

      // Checkpoint advances with safe progress.
      this.checkpointX = Math.max(this.checkpointX, p.x - 30);

      game.camera.follow(p.x, 0.3);
      this.progress = Utils.clamp((p.x - this.startX) / (this.length - this.startX), 0, 1);

      if (p.x >= this.length - 4 && !this.complete) this.complete = true;
    }

    _fall(game, fx, fy) {
      game.particles.burst(fx || game.player.x, fy || this.ropeY, "#e23a3a");
      game.camera.shake(9, 0.4);
      game.player.visible = true;
      game.playerDied(true);
    }

    render(ctx, game) {
      const cam = game.camera;
      Sprites.background(ctx, VIEW_W, VIEW_H, cam.x, this.theme, this.time);

      // Rope posts + rope (drawn just under Charlie's feet).
      const ropeLine = this.ropeY + 3;
      ctx.strokeStyle = "#caa05a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-cam.x + this.startX - 40, ropeLine);
      ctx.lineTo(-cam.x + this.length + 40, ropeLine);
      ctx.stroke();
      // Support poles at both ends.
      ctx.fillStyle = "#7a4a1e";
      ctx.fillRect(this.startX - 50 - cam.x, ropeLine, 10, VIEW_H);
      ctx.fillRect(this.length + 40 - cam.x, ropeLine, 10, VIEW_H);
      // Safety net far below.
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let i = -1; i < VIEW_W / 24 + 1; i++) {
        const gx = ((i * 24) - (cam.x % 24));
        ctx.beginPath(); ctx.moveTo(gx, VIEW_H - 40); ctx.lineTo(gx + 24, VIEW_H - 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx + 24, VIEW_H - 40); ctx.lineTo(gx, VIEW_H - 10); ctx.stroke();
      }

      // Obstacles.
      for (const ob of this.obstacles) {
        if (ob.resolved) continue;
        const sx = ob.x - cam.x;
        if (sx < -60 || sx > VIEW_W + 60) continue;
        if (ob.type === "monkey") Sprites.monkey(ctx, sx, this.ropeY, this.time);
        else Sprites.bird(ctx, sx, ob.y, this.time);
      }

      // Goal platform.
      const gx = this.length - cam.x;
      if (gx < VIEW_W + 80) {
        ctx.fillStyle = "#3fd07f";
        ctx.fillRect(gx, this.ropeY, 80, 8);
        Utils.pixelText(ctx, "GOAL", gx + 40, this.ropeY - 16, 16, "#fff");
      }

      // Charlie, tilted by current balance for visual feedback.
      const p = game.player;
      ctx.save();
      const tilt = (this.balance - 0.0) * 0.5 * (Math.sin(this.time * 5) > 0 ? 1 : -1);
      ctx.translate(p.x - cam.x, p.y);
      ctx.rotate(tilt * 0.3);
      ctx.translate(-(p.x - cam.x), -p.y);
      p.draw(ctx, cam);
      ctx.restore();

      // Balance meter.
      this._drawBalanceMeter(ctx);
    }

    _drawBalanceMeter(ctx) {
      const bw = 200, bx = VIEW_W / 2 - bw / 2, by = 80;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      Utils.roundRect(ctx, bx, by, bw, 14, 7); ctx.fill();
      // Center safe zone.
      const fill = this.balance * bw;
      const col = this.balance > 0.7 ? "#e23a3a" : this.balance > 0.4 ? "#ff8c1a" : "#3fd07f";
      ctx.fillStyle = col;
      Utils.roundRect(ctx, bx, by, fill, 14, 7); ctx.fill();
      Utils.pixelText(ctx, "BALANCE", VIEW_W / 2, by - 12, 12, "#ffd23f");
    }
  }

  /* =========================================================
     Stage 3 — Trampoline
     Charlie bounces automatically. Steer left/right in the air to land
     on the next trampoline, collect balloons, and avoid the spike pits
     between mats.
     ========================================================= */
  class TrampolineStage extends Stage {
    constructor() {
      super("Trampoline", { top: "#142a4a", bottom: "#06121f" });
      this.finishX = 3000;
    }

    init(game) {
      const p = game.player;
      this.tramps = [];
      this.balloons = [];
      let x = 80;
      // First a few easy trampolines, then gaps grow.
      while (x < this.finishX) {
        const w = 92 - this.difficulty * 14;
        this.tramps.push({ x, w, squash: 0 });
        // Balloons floating above the gap.
        if (Math.random() < 0.7) {
          this.balloons.push({
            x: x + w + 55,
            y: FLOOR_Y - 150 - Utils.rand(0, 70),
            color: Utils.pick(["#e23a3a", "#ffd23f", "#3fd07f", "#ff6bd0"]),
            got: false,
          });
        }
        // Gaps stay within a single bounce's horizontal reach.
        const gap = 100 + Utils.rand(30, 80) + this.difficulty * 50;
        x += w + gap;
      }
      // Wide, solid goal platform to land on safely (completes the stage).
      const goalW = 190;
      this.tramps.push({ x, w: goalW, squash: 0, goal: true });
      this.finishX = x + goalW / 2;
      this.totalObstacles = this.balloons.length || 1;

      p.reset(this.tramps[0].x + this.tramps[0].w / 2, FLOOR_Y);
      p.configure({ gravity: 1400, jumpVel: 0, moveSpeed: 0, ridePose: false, color: "#3fd07f" });
      p.vx = 0;
      p.vy = -780;                 // initial launch
      this.bounceVel = 820;
      this.checkpointIndex = 0;
      game.camera.reset();
    }

    respawn(game) {
      const p = game.player;
      const t = this.tramps[this.checkpointIndex];
      p.x = t.x + t.w / 2;
      p.y = FLOOR_Y - 4;
      p.vx = 0;
      p.vy = -this.bounceVel;
      p.onGround = false;
      p.hit(1.4);
    }

    update(dt, game) {
      this.time += dt;
      const p = game.player;
      const input = game.input;

      // Horizontal air control.
      const accel = 520;
      if (input.right) { p.vx += accel * dt; p.facing = 1; }
      else if (input.left) { p.vx -= accel * dt; p.facing = -1; }
      else p.vx *= 0.9;
      p.vx = Utils.clamp(p.vx, -300, 340);

      // Integrate manually (no single floor — trampolines are discrete).
      p.animTime += dt;
      p.vy += p.gravity * dt;
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      p.x = Utils.clamp(p.x, 20, this.finishX);
      if (p.invuln > 0) p.invuln -= dt;

      // Relax trampoline squash.
      for (const t of this.tramps) t.squash *= 0.85;

      // Landing test when descending and at mat height.
      if (p.vy > 0 && p.y >= FLOOR_Y) {
        const t = this._trampAt(p.x);
        if (t && t.goal) {
          // Reached the safe goal platform — stage clear.
          p.y = FLOOR_Y;
          p.vy = 0;
          p.onGround = true;
          if (!this.complete) {
            this.complete = true;
            this.progress = 1;
          }
        } else if (t) {
          p.y = FLOOR_Y;
          p.vy = -this.bounceVel;
          p.onGround = false;
          t.squash = 1;
          game.audio.jump();
          game.particles.dust(p.x, FLOOR_Y, 0);
          this.checkpointIndex = this.tramps.indexOf(t);
        } else if (p.y >= FLOOR_Y + 6) {
          // Missed — fell into the spike gap.
          game.particles.burst(p.x, FLOOR_Y + 10, "#b8c0cc");
          game.camera.shake(9, 0.4);
          game.playerDied(true);
          return;
        }
      }

      // Balloon collection.
      const box = p.box;
      for (const b of this.balloons) {
        if (b.got) continue;
        const bb = { x: b.x - 12, y: b.y - 15, w: 24, h: 30 };
        if (Utils.aabb(box, bb)) {
          b.got = true;
          this.cleared++;
          game.addScore(150, b.x, b.y);
          game.audio.coin();
          game.particles.sparkle(b.x, b.y, b.color);
        }
      }

      game.camera.follow(p.x, 0.3);
      this.progress = Utils.clamp(p.x / this.finishX, 0, 1);
      if (p.x >= this.finishX - 6 && !this.complete) this.complete = true;
    }

    _trampAt(x) {
      for (const t of this.tramps) if (x >= t.x && x <= t.x + t.w) return t;
      return null;
    }

    render(ctx, game) {
      const cam = game.camera;
      Sprites.background(ctx, VIEW_W, VIEW_H, cam.x, this.theme, this.time);

      // Spike floor under everything.
      ctx.fillStyle = "#0a0a12";
      ctx.fillRect(0, FLOOR_Y + 24, VIEW_W, VIEW_H);
      for (let x = -(cam.x % 24); x < VIEW_W; x += 24) {
        Sprites.spikes(ctx, x, FLOOR_Y + 24, 24, true);
      }

      // Trampolines (and the solid goal platform).
      for (const t of this.tramps) {
        const sx = t.x - cam.x;
        if (sx < -200 || sx > VIEW_W + 200) continue;
        if (t.goal) {
          ctx.fillStyle = "#3fd07f";
          ctx.fillRect(sx, FLOOR_Y, t.w, VIEW_H - FLOOR_Y);
          ctx.fillStyle = "#2a9a5a";
          ctx.fillRect(sx, FLOOR_Y + 10, t.w, 6);
          Utils.pixelText(ctx, "GOAL", sx + t.w / 2, FLOOR_Y - 16, 18, "#fff");
        } else {
          Sprites.trampoline(ctx, sx, FLOOR_Y, t.w, t.squash);
        }
      }

      // Balloons.
      for (const b of this.balloons) {
        if (b.got) continue;
        const sx = b.x - cam.x;
        if (sx < -40 || sx > VIEW_W + 40) continue;
        Sprites.balloon(ctx, sx, b.y, b.color, this.time);
      }

      game.player.draw(ctx, cam);
    }
  }

  /* =========================================================
     Stage 4 — Horse Riding (AutoRun preset, faster, barriers + pits)
     ========================================================= */
  function makeHorseStage() {
    return new AutoRunStage(
      "Horse Riding",
      { top: "#3a2a14", bottom: "#160c04" },
      { runSpeed: 300, mount: "horse", types: ["barrier", "barrier", "pit"], count: 12, useCombo: false }
    );
  }

  /* =========================================================
     Stage 1 — Lion Ride (AutoRun preset, hoops + occasional pit, combo)
     ========================================================= */
  function makeLionStage() {
    return new AutoRunStage(
      "Lion Ride",
      { top: "#4a1a3a", bottom: "#1a0420" },
      { runSpeed: 210, mount: "lion", types: ["hoop", "hoop", "hoop", "pit"], count: 11, useCombo: true }
    );
  }

  /* =========================================================
     Stage 5 — Flying Trapeze
     Hang from a swinging bar; press Jump at the right moment to launch
     into an arc and grab the next trapeze. Miss and you fall.
     ========================================================= */
  class TrapezeStage extends Stage {
    constructor() {
      super("Flying Trapeze", { top: "#2a1450", bottom: "#0a0220" });
    }

    init(game) {
      const p = game.player;
      // Build a line of swinging trapezes leading to a final platform.
      this.bars = [];
      let x = 220;
      const n = 5;
      // Modest, fairly uniform swing keeps the catch window readable.
      for (let i = 0; i < n; i++) {
        this.bars.push({
          pivotX: x,
          pivotY: 100,
          len: 150,
          amp: 0.55 + this.difficulty * 0.12,
          speed: 1.1 + this.difficulty * 0.5,
          phase: i * 0.6,
        });
        x += 190;
      }
      this.platformX = x + 30;
      this.totalObstacles = n;

      p.reset(this.bars[0].pivotX, 0);
      p.configure({ gravity: 900, jumpVel: 0, moveSpeed: 0, ridePose: false, color: "#ff8c1a" });
      this.current = 0;            // index of trapeze Charlie holds
      this.state = "hold";         // hold | fly | done
      this.checkpoint = 0;
      game.camera.reset();
    }

    _barTip(b) {
      const ang = Math.sin(b.phase) * b.amp;
      return {
        x: b.pivotX + Math.sin(ang) * b.len,
        y: b.pivotY + Math.cos(ang) * b.len,
        ang,
      };
    }

    respawn(game) {
      this.current = this.checkpoint;
      this.state = "hold";
      game.player.vx = game.player.vy = 0;
      game.player.hit(1.2);
    }

    update(dt, game) {
      this.time += dt;
      const p = game.player;
      const input = game.input;

      // Advance all pendulums.
      for (const b of this.bars) b.phase += b.speed * dt;

      if (this.state === "hold") {
        const b = this.bars[this.current];
        const tip = this._barTip(b);
        p.x = tip.x;
        p.y = tip.y + 44;          // hang below the bar
        p.vx = 0; p.vy = 0;
        p.onGround = false;
        if (input.consumeJump()) {
          // Launch with a standardized forward arc (plus a little of the
          // swing's own forward motion) so the trajectory is predictable
          // and the next bar is reliably catchable with good timing.
          const tip2 = this._barTip({ ...b, phase: b.phase + 0.02 });
          const swingVx = (tip2.x - tip.x) / 0.02;
          p.vx = 300 + Utils.clamp(swingVx, 0, 120);
          p.vy = -300;
          this.state = "fly";
          game.audio.jump();
          game.particles.sparkle(p.x, p.y, "#ffd23f");
        }
      } else if (this.state === "fly") {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Try to grab the next trapeze (sequential, generous radius).
        const ni = this.current + 1;
        if (ni < this.bars.length) {
          const tip = this._barTip(this.bars[ni]);
          if (Utils.dist(p.x, p.y - 44, tip.x, tip.y) < 72 && p.x <= tip.x + 40) {
            this.current = ni;
            this.checkpoint = ni;
            this.state = "hold";
            this.cleared = Math.max(this.cleared, ni);
            game.addScore(200, p.x, p.y - 40);
            game.audio.hoop();
            game.particles.sparkle(tip.x, tip.y, "#3fd07f");
          }
        }

        // Reached the final platform?
        if (this.state === "fly" && p.x >= this.platformX && p.y >= FLOOR_Y - 70 && p.y <= FLOOR_Y + 30) {
          this.cleared = this.totalObstacles;
          this.complete = true;
          this.progress = 1;
          this.state = "done";
          p.y = FLOOR_Y;
          p.onGround = true;
        }

        // Fell.
        if (p.y > FALL_LINE) {
          game.particles.burst(p.x, VIEW_H - 20, "#e23a3a");
          game.camera.shake(9, 0.4);
          game.playerDied(true);
          return;
        }
      }

      game.camera.follow(p.x, 0.32);
      this.progress = Utils.clamp(this.current / this.totalObstacles, 0, 1);
    }

    render(ctx, game) {
      const cam = game.camera;
      Sprites.background(ctx, VIEW_W, VIEW_H, cam.x, this.theme, this.time);

      // Rig beam across the top.
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 84, VIEW_W, 8);

      // Trapezes.
      for (let i = 0; i < this.bars.length; i++) {
        const b = this.bars[i];
        const tip = this._barTip(b);
        Sprites.trapeze(ctx, b.pivotX - cam.x, b.pivotY, tip.ang, b.len);
        // Highlight the next target bar.
        if (i === this.current + 1 && this.state === "fly") {
          ctx.strokeStyle = "rgba(63,208,127,0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(tip.x - cam.x, tip.y, 30, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Final platform.
      const px = this.platformX - cam.x;
      ctx.fillStyle = "#3fd07f";
      ctx.fillRect(px, FLOOR_Y, 160, 14);
      ctx.fillStyle = "#2a9a5a";
      ctx.fillRect(px, FLOOR_Y + 14, 160, VIEW_H);
      Utils.pixelText(ctx, "SAFE", px + 60, FLOOR_Y - 14, 16, "#fff");

      game.player.draw(ctx, cam);
    }
  }

  /* =========================================================
     Stage 6 — Final Circus Challenge
     A long, fast AutoRun stage mixing hoops, barriers, pits, monkeys
     and overhead swinging trapezes.
     ========================================================= */
  function makeFinalStage() {
    return new AutoRunStage(
      "Final Challenge",
      { top: "#3a0a2a", bottom: "#12001a" },
      {
        runSpeed: 300,
        mount: null,
        types: ["hoop", "barrier", "pit", "monkey", "swing", "hoop", "barrier"],
        count: 16,
        useCombo: true,
      }
    );
  }

  /* ---- Stage factory in play order ---- */
  function buildStages() {
    return [
      makeLionStage,
      () => new TightropeStage(),
      () => new TrampolineStage(),
      makeHorseStage,
      () => new TrapezeStage(),
      makeFinalStage,
    ];
  }

  window.Stages = { build: buildStages, FLOOR_Y, VIEW_W, VIEW_H };
})();
