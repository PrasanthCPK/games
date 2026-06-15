/* ============================================================
   Renderer — every pixel is drawn programmatically (no images).
   Recreates the look of the classic bouncing-ball game: a red
   patterned ball, golden rings, teal bricks, water and spikes,
   over a parallax sky. Works at any resolution and DPR.
   ------------------------------------------------------------
   Coordinate flow: world units -> camera (pan + zoom) -> screen.
   Only on-screen tiles are drawn each frame.
   ============================================================ */

import { Tile, TILE } from './levels.js';
import { lerp, clamp } from './utils.js';

const COLORS = {
  skyTop: '#0a1626',
  skyBot: '#16324d',
  hillFar: '#11283d',
  hillNear: '#16384f',
  solid: '#2c4a63',
  solidDark: '#1d3447',
  grass: '#37d98a',
  brick: '#1b9aaa',
  brickLight: '#3fc6d6',
  brickDark: '#127483',
  spike: '#9aa7b4',
  spikeDark: '#5a6675',
  water: 'rgba(46, 138, 222, 0.40)',
  waterLine: 'rgba(160, 215, 255, 0.8)',
  ball: '#ff2e4d',
  ballDark: '#b71530',
  ring: '#ffd23f',
  ringDark: '#e0a000',
  goal: '#37d98a',
  hud: '#f5f7fa',
};

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.view = { w: 0, h: 0 };
    this.uiScale = 1;
  }

  setView(w, h) {
    this.view.w = w;
    this.view.h = h;
    // UI scales with the smaller screen dimension so text and the
    // HUD stay legible from small phones up to 4K monitors.
    this.uiScale = clamp(Math.min(w, h) / 540, 0.75, 2.2);
  }

  /** Main per-frame draw. `alpha` interpolates the ball between steps. */
  render(game, alpha) {
    const { ctx } = this;
    const { w, h } = this.view;
    const cam = game.camera;
    const level = game.level;
    const ball = game.ball;

    const bx = ball ? lerp(ball.prevX, ball.x, alpha) : 0;
    const by = ball ? lerp(ball.prevY, ball.y, alpha) : 0;

    this._drawSky(cam);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    if (level) {
      const bounds = this._visibleTileBounds(cam);
      this._drawTiles(level, bounds, game.time);
      this._drawRings(level, game.time);
      this._drawGoal(level, game.time);
    }
    this._drawParticles(game.particles);
    if (ball && game.showBall) this._drawBall(ball, bx, by);

    ctx.restore();

    this._drawHud(game);
  }

  /* ---------- background ---------- */
  _drawSky(cam) {
    const { ctx } = this;
    const { w, h } = this.view;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COLORS.skyTop);
    g.addColorStop(1, COLORS.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Parallax hills — pan slowly with the camera for depth.
    this._hills(w, h, h * 0.72, COLORS.hillFar, cam.x * 0.15, 120, 70);
    this._hills(w, h, h * 0.82, COLORS.hillNear, cam.x * 0.3, 180, 110);
  }

  _hills(w, h, baseY, color, offset, span, amp) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const step = 20;
    for (let x = 0; x <= w; x += step) {
      const wx = x + (offset % span);
      const y = baseY - Math.sin(wx / span * Math.PI * 2) * amp - amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  _visibleTileBounds(cam) {
    const { w, h } = this.view;
    const halfW = (w / 2) / cam.zoom;
    const halfH = (h / 2) / cam.zoom;
    return {
      c0: Math.floor((cam.x - halfW) / TILE) - 1,
      c1: Math.floor((cam.x + halfW) / TILE) + 1,
      r0: Math.floor((cam.y - halfH) / TILE) - 1,
      r1: Math.floor((cam.y + halfH) / TILE) + 1,
    };
  }

  /* ---------- tiles ---------- */
  _drawTiles(level, b, time) {
    const { ctx } = this;
    for (let r = b.r0; r <= b.r1; r++) {
      for (let c = b.c0; c <= b.c1; c++) {
        const t = level.tileAt(c, r);
        if (t === Tile.EMPTY || t === Tile.GOAL) continue;
        const x = c * TILE, y = r * TILE;
        switch (t) {
          case Tile.SOLID:    this._solid(x, y, level.tileAt(c, r - 1) === Tile.EMPTY); break;
          case Tile.PLATFORM: this._brick(x, y); break;
          case Tile.SPIKE:    this._spike(x, y); break;
          case Tile.WATER:    this._water(x, y, time, level.tileAt(c, r - 1) !== Tile.WATER); break;
          case Tile.CHECKPOINT: this._checkpoint(x, y, level, time); break;
        }
      }
    }
  }

  _solid(x, y, capped) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.solid;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = COLORS.solidDark;
    ctx.fillRect(x, y + TILE - 6, TILE, 6);
    ctx.fillRect(x + TILE - 5, y, 5, TILE);
    if (capped) {
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(x, y, TILE, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, TILE, 2);
    }
  }

  _brick(x, y) {
    const { ctx } = this;
    const r = 6;
    ctx.fillStyle = COLORS.brick;
    this._roundRect(x + 1, y + 1, TILE - 2, TILE - 2, r);
    ctx.fill();
    ctx.fillStyle = COLORS.brickLight;
    this._roundRect(x + 3, y + 3, TILE - 6, 6, 3);
    ctx.fill();
    ctx.fillStyle = COLORS.brickDark;
    this._roundRect(x + 3, y + TILE - 8, TILE - 6, 4, 2);
    ctx.fill();
  }

  _spike(x, y) {
    const { ctx } = this;
    const n = 3, w = TILE / n;
    for (let i = 0; i < n; i++) {
      const sx = x + i * w;
      ctx.beginPath();
      ctx.moveTo(sx, y + TILE);
      ctx.lineTo(sx + w / 2, y + 3);
      ctx.lineTo(sx + w, y + TILE);
      ctx.closePath();
      ctx.fillStyle = COLORS.spike;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx + w / 2, y + 3);
      ctx.lineTo(sx + w, y + TILE);
      ctx.lineTo(sx + w / 2, y + TILE);
      ctx.closePath();
      ctx.fillStyle = COLORS.spikeDark;
      ctx.fill();
    }
  }

  _water(x, y, time, surface) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(x, y, TILE, TILE);
    if (surface) {
      ctx.strokeStyle = COLORS.waterLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= TILE; i += 4) {
        const wy = y + 3 + Math.sin((x + i) / 18 + time * 2.5) * 2.4;
        if (i === 0) ctx.moveTo(x + i, wy); else ctx.lineTo(x + i, wy);
      }
      ctx.stroke();
    }
  }

  _checkpoint(x, y, level, time) {
    const { ctx } = this;
    const reached = Math.abs(level.respawn.x - (x + TILE / 2)) < 1;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x + TILE / 2 - 2, y, 4, TILE);
    ctx.fillStyle = reached ? COLORS.grass : '#64748b';
    const flap = reached ? Math.sin(time * 6) * 2 : 0;
    ctx.beginPath();
    ctx.moveTo(x + TILE / 2 + 2, y + 2);
    ctx.lineTo(x + TILE - 2 + flap, y + 8);
    ctx.lineTo(x + TILE / 2 + 2, y + 14);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- rings ---------- */
  _drawRings(level, time) {
    const { ctx } = this;
    for (const ring of level.rings) {
      if (ring.collected) continue;
      const pulse = 1 + Math.sin(time * 3 + ring.x) * 0.06;
      const rad = TILE * 0.32 * pulse;
      ctx.save();
      ctx.translate(ring.x, ring.y);
      // squash horizontally to suggest a spinning hoop
      ctx.scale(0.55 + 0.45 * Math.abs(Math.sin(time * 2 + ring.x)), 1);
      ctx.lineWidth = TILE * 0.12;
      ctx.strokeStyle = COLORS.ringDark;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = TILE * 0.07;
      ctx.strokeStyle = COLORS.ring;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- goal ---------- */
  _drawGoal(level, time) {
    const { ctx } = this;
    const g = level.goalCenter;
    const open = level.allRingsCollected;
    const rad = TILE * 0.55;
    ctx.save();
    ctx.translate(g.x, g.y);
    if (open) {
      const glow = 0.5 + Math.sin(time * 4) * 0.5;
      ctx.shadowColor = COLORS.goal;
      ctx.shadowBlur = 18 + glow * 16;
      ctx.strokeStyle = COLORS.goal;
      ctx.lineWidth = TILE * 0.16;
    } else {
      ctx.strokeStyle = '#5a6b7a';
      ctx.lineWidth = TILE * 0.12;
    }
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = open ? '#ffffff' : '#7c8a98';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* ---------- ball ---------- */
  _drawBall(ball, bx, by) {
    const { ctx } = this;
    const r = ball.radius;
    // Squash & stretch on landing.
    const sx = 1 + ball.squash * 0.28;
    const sy = 1 - ball.squash * 0.28;

    ctx.save();
    ctx.translate(bx, by + ball.squash * r * 0.28);
    ctx.scale(sx, sy);

    // soft shadow under the ball
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.95, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(ball.spin);

    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
    grad.addColorStop(0, '#ff8a9c');
    grad.addColorStop(0.45, COLORS.ball);
    grad.addColorStop(1, COLORS.ballDark);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    // patterned rivets that rotate with the ball
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    // glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* ---------- particles ---------- */
  _drawParticles(particles) {
    if (!particles) return;
    const { ctx } = this;
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- HUD ---------- */
  _drawHud(game) {
    if (!game.level) return; // no HUD on the main menu
    const { ctx } = this;
    const s = this.uiScale;
    const pad = 14 * s;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(18 * s)}px -apple-system, "Segoe UI", Roboto, sans-serif`;

    // rings (top-left)
    const ringsTxt = `◎ ${game.hud.rings}/${game.hud.total}`;
    this._hudPill(pad, pad, ringsTxt, COLORS.ring);

    // lives (top-left, second row)
    const livesTxt = `♥ ${'●'.repeat(Math.max(0, game.hud.lives))}`;
    this._hudPill(pad, pad + 34 * s, livesTxt, COLORS.ball);

    // level name (top-centre)
    ctx.fillStyle = COLORS.hud;
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(16 * s)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(`Level ${game.hud.levelIndex + 1} — ${game.hud.levelName}`, this.view.w / 2, pad);

    // timer (top-right area, left of pause button)
    ctx.textAlign = 'right';
    ctx.font = `${Math.round(18 * s)}px ui-monospace, Menlo, Consolas, monospace`;
    const rightInset = game.isTouch ? 70 * s : pad;
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(game.hud.time, this.view.w - rightInset - pad, pad);

    ctx.restore();
  }

  _hudPill(x, y, text, accent) {
    const { ctx } = this;
    const s = this.uiScale;
    ctx.textAlign = 'left';
    const w = ctx.measureText(text).width + 20 * s;
    ctx.fillStyle = 'rgba(13,27,42,0.55)';
    this._roundRect(x, y, w, 28 * s, 8 * s);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillText(text, x + 10 * s, y + 5 * s);
  }

  _roundRect(x, y, w, h, r) {
    const { ctx } = this;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
