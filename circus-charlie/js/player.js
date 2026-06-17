/* ============================================================
   player.js — Player (Charlie)
   Holds Charlie's physics, animation state and a flexible draw routine
   used across every stage. Stages tune the physics constants (gravity,
   jump strength, move speed) and decide what "ground" means, while the
   Player handles integration, jumping and animation.
   ============================================================ */
(function () {
  "use strict";

  class Player {
    constructor() {
      this.w = 30;
      this.h = 44;
      this.reset(120, 0);

      // Physics constants — overridden per stage via configure().
      this.gravity = 1800;
      this.jumpVel = 620;
      this.moveSpeed = 220;
      this.maxFall = 900;

      this.color = "#2b6cff";   // costume body
      this.facing = 1;
      this.animTime = 0;
      this.invuln = 0;           // i-frames after a hit (seconds)
      this.visible = true;
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.jumping = false;
      this.facing = 1;
      this.animTime = 0;
      this.invuln = 0;
      this.visible = true;
      this.ridePose = false;     // sitting pose for lion/horse stages
    }

    configure(opts) {
      Object.assign(this, opts);
    }

    get box() {
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    jump(strength) {
      if (this.onGround) {
        this.vy = -(strength || this.jumpVel);
        this.onGround = false;
        this.jumping = true;
        return true;
      }
      return false;
    }

    /** Standard side-scroller integration. `groundY` is the floor for
        this frame (Infinity = no floor / falling). */
    update(dt, groundY) {
      this.animTime += dt;
      this.vy += this.gravity * dt;
      if (this.vy > this.maxFall) this.vy = this.maxFall;
      this.y += this.vy * dt;
      this.x += this.vx * dt;

      if (groundY != null && this.y >= groundY) {
        this.y = groundY;
        this.vy = 0;
        if (!this.onGround) this.jumping = false;
        this.onGround = true;
      } else if (groundY != null) {
        this.onGround = false;
      }

      if (this.invuln > 0) this.invuln -= dt;
    }

    hit(seconds) {
      this.invuln = seconds || 1.2;
    }

    /** Draw Charlie. `camera` may be null to draw in screen space. */
    draw(ctx, camera) {
      if (!this.visible) return;
      const cx = this.x - (camera ? camera.x : 0);
      const cy = this.y - (camera ? camera.y : 0);

      // Flicker while invulnerable.
      if (this.invuln > 0 && Math.floor(this.animTime * 20) % 2 === 0) return;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(this.facing, 1);

      const running = this.onGround && Math.abs(this.vx) > 5;
      const legSwing = running ? Math.sin(this.animTime * 16) * 6 : 0;
      const armSwing = running ? Math.sin(this.animTime * 16) * 5 : 0;
      const airborne = !this.onGround;

      // ---- Legs ----
      ctx.fillStyle = "#1133aa";
      if (this.ridePose) {
        // Sitting: legs forward.
        ctx.fillRect(-10, -16, 9, 14);
        ctx.fillRect(2, -16, 9, 14);
      } else if (airborne) {
        ctx.fillRect(-9, -16, 7, 16);
        ctx.fillRect(3, -14, 7, 14);
      } else {
        ctx.fillRect(-8 - legSwing, -16, 7, 16);
        ctx.fillRect(2 + legSwing, -16, 7, 16);
      }
      // Shoes
      ctx.fillStyle = "#5a2d00";
      if (this.ridePose) {
        ctx.fillRect(-12, -4, 11, 5);
        ctx.fillRect(2, -4, 11, 5);
      } else if (airborne) {
        ctx.fillRect(-11, -2, 10, 4);
        ctx.fillRect(2, 0, 10, 4);
      } else {
        ctx.fillRect(-10 - legSwing, 0, 10, 4);
        ctx.fillRect(2 + legSwing, 0, 10, 4);
      }

      // ---- Torso (striped circus costume) ----
      const bodyY = -38;
      ctx.fillStyle = this.color;
      ctx.fillRect(-10, bodyY, 20, 24);
      ctx.fillStyle = "#fff";
      ctx.fillRect(-10, bodyY + 4, 20, 3);
      ctx.fillRect(-10, bodyY + 12, 20, 3);
      ctx.fillRect(-10, bodyY + 20, 20, 3);

      // ---- Arms ----
      ctx.fillStyle = "#f0b890";
      if (airborne) {
        ctx.fillRect(-14, bodyY + 2, 6, 14); // up
        ctx.fillRect(8, bodyY + 2, 6, 14);
      } else {
        ctx.fillRect(-13, bodyY + 6 - armSwing, 6, 13);
        ctx.fillRect(7, bodyY + 6 + armSwing, 6, 13);
      }

      // ---- Head ----
      ctx.fillStyle = "#f0b890";
      ctx.fillRect(-8, -54, 16, 16);
      // Cheeks/nose
      ctx.fillStyle = "#e88";
      ctx.fillRect(-9, -44, 3, 3);
      ctx.fillRect(6, -44, 3, 3);
      // Eyes
      ctx.fillStyle = "#222";
      ctx.fillRect(0, -50, 3, 4);
      // Hat (red top hat)
      ctx.fillStyle = "#e23a3a";
      ctx.fillRect(-10, -60, 20, 4);
      ctx.fillRect(-7, -70, 14, 12);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(-7, -62, 14, 3);

      ctx.restore();
    }
  }

  window.Player = Player;
})();
