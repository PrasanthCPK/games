/* ============================================================
   camera.js — Camera
   Holds the world-space scroll offset plus a screen-shake effect.
   Stages move the camera; rendering subtracts camera.x / camera.y.
   ============================================================ */
(function () {
  "use strict";

  class Camera {
    constructor(viewW, viewH) {
      this.viewW = viewW;
      this.viewH = viewH;
      this.x = 0;
      this.y = 0;
      this.targetX = 0;
      this._shakeTime = 0;
      this._shakeMag = 0;
      this._offsetX = 0;
      this._offsetY = 0;
    }

    reset() {
      this.x = 0;
      this.y = 0;
      this.targetX = 0;
      this._shakeTime = 0;
      this._shakeMag = 0;
      this._offsetX = 0;
      this._offsetY = 0;
    }

    /** Smoothly follow a world x so target sits at `anchor` fraction of view. */
    follow(worldX, anchor) {
      this.targetX = worldX - this.viewW * (anchor == null ? 0.3 : anchor);
    }

    shake(mag, time) {
      this._shakeMag = Math.max(this._shakeMag, mag);
      this._shakeTime = Math.max(this._shakeTime, time);
    }

    update(dt) {
      // Ease toward the target for smooth scrolling.
      this.x = Utils.lerp(this.x, this.targetX, Math.min(1, dt * 10));

      if (this._shakeTime > 0) {
        this._shakeTime -= dt;
        const m = this._shakeMag * (this._shakeTime > 0 ? 1 : 0);
        this._offsetX = Utils.rand(-m, m);
        this._offsetY = Utils.rand(-m, m);
        if (this._shakeTime <= 0) {
          this._offsetX = this._offsetY = 0;
          this._shakeMag = 0;
        }
      }
    }

    /** Apply the shake just before drawing the world. */
    applyShake(ctx) {
      if (this._offsetX || this._offsetY) {
        ctx.translate(this._offsetX, this._offsetY);
      }
    }
  }

  window.Camera = Camera;
})();
