/* ============================================================
   utils.js — small math / drawing helpers shared everywhere.
   Everything is hung off a global `Utils` object so the plain
   (non-module) scripts can reach it.
   ============================================================ */
(function () {
  "use strict";

  const Utils = {
    /** Clamp v into [min, max]. */
    clamp(v, min, max) {
      return v < min ? min : v > max ? max : v;
    },

    /** Linear interpolation. */
    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    /** Random float in [min, max). */
    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    /** Random integer in [min, max] inclusive. */
    randInt(min, max) {
      return Math.floor(min + Math.random() * (max - min + 1));
    },

    /** Pick a random element from an array. */
    pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },

    /** Axis-aligned bounding-box overlap test. Boxes are {x,y,w,h}. */
    aabb(a, b) {
      return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      );
    },

    /** Distance between two points. */
    dist(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      return Math.sqrt(dx * dx + dy * dy);
    },

    /** Smoothstep easing 0..1. */
    easeOut(t) {
      return 1 - (1 - t) * (1 - t);
    },
    easeIn(t) {
      return t * t;
    },
    easeInOut(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

    /** Draw a filled rounded rectangle. */
    roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    /** Draw retro pixel text centered. Uses a chunky monospace look. */
    pixelText(ctx, text, x, y, size, color, align) {
      ctx.save();
      ctx.font = `bold ${size}px "Courier New", monospace`;
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, size * 0.14);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color || "#fff";
      ctx.fillText(text, x, y);
      ctx.restore();
    },
  };

  window.Utils = Utils;
})();
