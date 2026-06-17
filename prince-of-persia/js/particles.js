/*
 * particles.js — Lightweight particle effects (dust, blood, sparks) and the
 * torch-lit darkness overlay for dungeon atmosphere.
 */
(function (global) {
  'use strict';

  var K = global.K;
  var TILE = global.K.TILE;

  function Particles() {
    this.list = [];
  }

  Particles.prototype.spawn = function (x, y, opts) {
    opts = opts || {};
    var n = opts.count || 6;
    for (var i = 0; i < n; i++) {
      this.list.push({
        x: x, y: y,
        vx: (Math.random() * 2 - 1) * (opts.spread || 60),
        vy: (opts.up ? -Math.random() * 120 : (Math.random() * 2 - 1) * 60) - 20,
        life: opts.life || 0.5,
        max: opts.life || 0.5,
        color: opts.color || '#caa24b',
        size: opts.size || 2,
        grav: opts.grav == null ? 400 : opts.grav,
      });
    }
  };

  Particles.prototype.dust = function (x, y) {
    this.spawn(x, y, { count: 5, color: '#b8946a', spread: 50, life: 0.4, size: 2 });
  };
  Particles.prototype.blood = function (x, y) {
    this.spawn(x, y, { count: 8, color: '#7a0f0f', spread: 90, life: 0.6, size: 2 });
  };
  Particles.prototype.spark = function (x, y) {
    this.spawn(x, y, { count: 6, color: '#ffe08a', spread: 120, life: 0.3, size: 1, grav: 200 });
  };

  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.list.splice(i, 1);
    }
  };

  Particles.prototype.render = function (ctx) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  };

  // ---- Lighting overlay ---------------------------------------------------
  // Draws a dark vignette punctured by flickering torch glows. Rendered in
  // screen space (after camera) so it always covers the viewport.

  function drawLighting(ctx, level, cam, viewW, viewH) {
    ctx.save();
    // Build the darkness as a layer, then cut torch glows with 'lighter'.
    ctx.fillStyle = 'rgba(8,5,2,0.32)';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.globalCompositeOperation = 'lighter';
    var startC = Math.floor(cam.x / TILE), endC = Math.ceil((cam.x + viewW) / TILE);
    var startR = Math.floor(cam.y / TILE), endR = Math.ceil((cam.y + viewH) / TILE);
    for (var r = startR; r <= endR; r++) {
      for (var c = startC; c <= endC; c++) {
        if (level.tileAt(c, r) !== global.Tiles.TILE.TORCH) continue;
        var sx = c * TILE + TILE / 2 - cam.x;
        var sy = r * TILE + 8 - cam.y;
        var flick = 0.8 + Math.sin(Date.now() / 90 + c * 1.3) * 0.12 + Math.random() * 0.06;
        var radius = 95 * flick;
        var grd = ctx.createRadialGradient(sx, sy, 4, sx, sy, radius);
        grd.addColorStop(0, 'rgba(255,170,60,0.55)');
        grd.addColorStop(0.5, 'rgba(180,90,20,0.18)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
      }
    }
    ctx.restore();
  }

  global.Particles = Particles;
  global.Lighting = { draw: drawLighting };
  void K;
})(window);
