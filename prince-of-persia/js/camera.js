/*
 * camera.js — Room-locked camera with smooth transitions.
 *
 * The view shows one room (screen) at a time. When the player crosses into an
 * adjacent room the camera eases to that room's origin — the classic Prince of
 * Persia screen-by-screen feel. While easing, inTransition() is true so the
 * Game can briefly hold gameplay.
 */
(function (global) {
  'use strict';

  var K = global.K;

  function Camera() {
    this.viewW = K.ROOM_COLS * K.TILE;
    this.viewH = K.ROOM_ROWS * K.TILE;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
  }

  Camera.prototype.snapTo = function (worldX, worldY, level) {
    this._setTargetFor(worldX, worldY, level);
    this.x = this.targetX;
    this.y = this.targetY;
  };

  Camera.prototype._setTargetFor = function (cx, cy, level) {
    var roomCol = Math.floor(cx / this.viewW);
    var roomRow = Math.floor(cy / this.viewH);
    var tx = roomCol * this.viewW;
    var ty = roomRow * this.viewH;
    // Clamp so we never show past the world edges.
    tx = Math.max(0, Math.min(tx, Math.max(0, level.worldW - this.viewW)));
    ty = Math.max(0, Math.min(ty, Math.max(0, level.worldH - this.viewH)));
    this.targetX = tx;
    this.targetY = ty;
  };

  Camera.prototype.follow = function (target, level) {
    this._setTargetFor(target.x + target.w / 2, target.y + target.h / 2, level);
  };

  Camera.prototype.update = function (dt) {
    // Ease toward the target room.
    var k = 1 - Math.pow(0.0001, dt); // frame-rate independent smoothing
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    if (Math.abs(this.targetX - this.x) < 0.5) this.x = this.targetX;
    if (Math.abs(this.targetY - this.y) < 0.5) this.y = this.targetY;
  };

  Camera.prototype.inTransition = function () {
    return Math.abs(this.targetX - this.x) > 1 || Math.abs(this.targetY - this.y) > 1;
  };

  Camera.prototype.apply = function (ctx) {
    ctx.translate(-Math.round(this.x), -Math.round(this.y));
  };

  global.Camera = Camera;
})(window);
