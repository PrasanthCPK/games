/*
 * ui.js — Canvas HUD (life segments, timer, level banner, boss bar) and toast
 * messages. Full-screen menus are DOM overlays managed by game.js; this class
 * draws the in-game heads-up display only.
 */
(function (global) {
  'use strict';

  function UI(game) {
    this.game = game;
    this.toasts = [];
    this.banner = null; // {text, t}
  }

  UI.prototype.toast = function (text, dur) {
    this.toasts.push({ text: text, t: dur || 2, max: dur || 2 });
  };

  UI.prototype.showBanner = function (text) {
    this.banner = { text: text, t: 2.5 };
  };

  UI.prototype.update = function (dt) {
    for (var i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t -= dt;
      if (this.toasts[i].t <= 0) this.toasts.splice(i, 1);
    }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
  };

  // Draw a heart/pip-style life bar. filled vs empty segments.
  UI.prototype._lifeBar = function (ctx, x, y, hp, maxHp, color) {
    for (var i = 0; i < maxHp; i++) {
      var sx = x + i * 11;
      ctx.fillStyle = '#000';
      ctx.fillRect(sx - 1, y - 1, 10, 10);
      if (i < hp) {
        ctx.fillStyle = color;
        ctx.fillRect(sx, y, 8, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(sx + 1, y + 1, 2, 2);
      } else {
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(sx, y, 8, 8);
      }
    }
  };

  UI.prototype.render = function (ctx, w, h) {
    var g = this.game;
    var p = g.player;

    // Prince life (bottom-left, PoP style).
    if (p) this._lifeBar(ctx, 8, h - 16, Math.max(0, p.hp), p.maxHp, '#e02b3a');

    // Time remaining (top-right).
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8cf9a';
    var t = Math.max(0, Math.ceil(g.timeLeft));
    var mm = Math.floor(t / 60), ss = t % 60;
    ctx.fillText((mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss, w - 8, 14);

    // Level name (top-left).
    ctx.textAlign = 'left';
    ctx.fillStyle = '#caa24b';
    ctx.fillText(g.level ? g.level.name : '', 8, 14);

    // Challenge-mode marker.
    if (g.challengeMode) { ctx.fillStyle = '#3aa0ff'; ctx.fillText('CHALLENGE', 8, 26); }

    // Boss bar (top-center) when a boss is alive.
    var boss = g.enemies.find(function (e) { return e.isBoss && e.alive; });
    if (boss) {
      var bw = w * 0.5, bx = (w - bw) / 2, by = 22;
      ctx.fillStyle = '#000'; ctx.fillRect(bx - 2, by - 2, bw + 4, 8);
      ctx.fillStyle = '#5a1a1a'; ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = '#e02b3a'; ctx.fillRect(bx, by, bw * (boss.hp / boss.maxHp), 4);
      ctx.textAlign = 'center'; ctx.fillStyle = '#f1c40f';
      ctx.fillText('JAFFAR', w / 2, by - 4);
      ctx.textAlign = 'left';
    }

    // Banner (level intro).
    if (this.banner) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.banner.t);
      ctx.textAlign = 'center';
      ctx.font = '16px monospace';
      ctx.fillStyle = '#e8cf9a';
      ctx.fillText(this.banner.text, w / 2, h / 2 - 20);
      ctx.restore();
    }

    // Toasts (stacked, lower-center).
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    for (var i = 0; i < this.toasts.length; i++) {
      var to = this.toasts[i];
      ctx.globalAlpha = Math.min(1, to.t);
      ctx.fillStyle = '#fff';
      ctx.fillText(to.text, w / 2, h - 30 - i * 12);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  global.UI = UI;
})(window);
