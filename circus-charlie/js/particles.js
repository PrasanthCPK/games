/* ============================================================
   particles.js — ParticleSystem
   Lightweight pooled particles used for fire, sparkles, dust, confetti
   and impact bursts. Particles live in world space and are drawn with
   the active camera offset.
   ============================================================ */
(function () {
  "use strict";

  class Particle {
    constructor() {
      this.active = false;
      this.reset();
    }
    reset() {
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.life = 0; this.maxLife = 1;
      this.size = 3;
      this.color = "#fff";
      this.gravity = 0;
      this.shrink = true;
      this.glow = false;
      this.shape = "square"; // square | circle
    }
  }

  class ParticleSystem {
    constructor(max) {
      this.pool = [];
      for (let i = 0; i < (max || 400); i++) this.pool.push(new Particle());
    }

    _spawn() {
      for (let i = 0; i < this.pool.length; i++) {
        if (!this.pool[i].active) {
          const p = this.pool[i];
          p.reset();
          p.active = true;
          return p;
        }
      }
      return null;
    }

    /** Generic emitter. opts overrides particle fields. */
    emit(opts) {
      const p = this._spawn();
      if (!p) return;
      Object.assign(p, opts);
      p.active = true;
    }

    /** Fire/flame puff used for flaming hoops and torches. */
    fire(x, y, amount) {
      for (let i = 0; i < (amount || 3); i++) {
        this.emit({
          x: x + Utils.rand(-4, 4),
          y: y + Utils.rand(-4, 4),
          vx: Utils.rand(-18, 18),
          vy: Utils.rand(-60, -25),
          life: 0,
          maxLife: Utils.rand(0.3, 0.6),
          size: Utils.rand(3, 7),
          color: Utils.pick(["#ffd23f", "#ff8c1a", "#e23a3a", "#fff36b"]),
          gravity: -40,
          glow: true,
          shape: "circle",
        });
      }
    }

    /** Sparkle burst for collecting coins/balloons. */
    sparkle(x, y, color) {
      for (let i = 0; i < 10; i++) {
        const a = Utils.rand(0, Math.PI * 2);
        const s = Utils.rand(40, 130);
        this.emit({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0,
          maxLife: Utils.rand(0.3, 0.7),
          size: Utils.rand(2, 5),
          color: color || "#ffd23f",
          gravity: 120,
          glow: true,
        });
      }
    }

    /** Dust kicked up by running/landing. */
    dust(x, y, dir) {
      for (let i = 0; i < 5; i++) {
        this.emit({
          x, y,
          vx: Utils.rand(-30, 30) - dir * 20,
          vy: Utils.rand(-40, -5),
          life: 0,
          maxLife: Utils.rand(0.25, 0.5),
          size: Utils.rand(3, 6),
          color: "rgba(220,200,180,0.9)",
          gravity: 90,
        });
      }
    }

    /** Impact burst when taking damage. */
    burst(x, y, color) {
      for (let i = 0; i < 18; i++) {
        const a = Utils.rand(0, Math.PI * 2);
        const s = Utils.rand(60, 220);
        this.emit({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0,
          maxLife: Utils.rand(0.3, 0.8),
          size: Utils.rand(3, 7),
          color: color || "#e23a3a",
          gravity: 200,
          glow: true,
        });
      }
    }

    /** Confetti rain for stage complete. */
    confetti(x, y) {
      const colors = ["#e23a3a", "#ffd23f", "#2b6cff", "#3fd07f", "#ff6bd0"];
      for (let i = 0; i < 30; i++) {
        this.emit({
          x: x + Utils.rand(-200, 200),
          y: y + Utils.rand(-40, 0),
          vx: Utils.rand(-40, 40),
          vy: Utils.rand(20, 120),
          life: 0,
          maxLife: Utils.rand(1.0, 2.0),
          size: Utils.rand(4, 8),
          color: Utils.pick(colors),
          gravity: 60,
          shrink: false,
        });
      }
    }

    update(dt) {
      for (let i = 0; i < this.pool.length; i++) {
        const p = this.pool[i];
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    render(ctx, camera) {
      ctx.save();
      for (let i = 0; i < this.pool.length; i++) {
        const p = this.pool[i];
        if (!p.active) continue;
        const t = p.life / p.maxLife;
        const alpha = 1 - t;
        const size = p.shrink ? p.size * (1 - t) : p.size;
        const sx = p.x - camera.x;
        const sy = p.y - camera.y;
        ctx.globalAlpha = alpha;
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.5, size), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        }
      }
      ctx.restore();
    }

    clear() {
      for (const p of this.pool) p.active = false;
    }
  }

  window.ParticleSystem = ParticleSystem;
})();
