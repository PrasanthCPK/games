/*
 * utils.js — Shared math, collision, storage, and event helpers.
 *
 * Everything here is attached to the global `window` (no ES modules) so the
 * game runs by double-clicking index.html OR via a local web server.
 */
(function (global) {
  'use strict';

  // ---- Math helpers -------------------------------------------------------

  /** Clamp v into the inclusive range [min, max]. */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /** Linear interpolation from a to b by t in [0,1]. */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Smooth ease-in-out curve for camera transitions. */
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /** Sign of a number: -1, 0, or 1. */
  function sign(v) {
    return v < 0 ? -1 : v > 0 ? 1 : 0;
  }

  /**
   * Move `cur` toward `target` by at most `maxDelta` — gives momentum/friction
   * feel without overshooting. Used for horizontal acceleration.
   */
  function approach(cur, target, maxDelta) {
    if (cur < target) return Math.min(cur + maxDelta, target);
    if (cur > target) return Math.max(cur - maxDelta, target);
    return cur;
  }

  /** Random float in [min, max). */
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /** Random integer in [min, max] inclusive. */
  function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  /** Random element of an array. */
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** Axis-aligned bounding box overlap test. Boxes are {x,y,w,h}. */
  function aabb(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  /** Point-in-rectangle test. */
  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // ---- Tiny event bus -----------------------------------------------------
  //
  // Decouples gameplay from audio/UI. Gameplay code calls Bus.emit('jump');
  // the audio manager subscribes with Bus.on('jump', ...). No direct coupling.

  function EventBus() {
    this.listeners = {};
  }
  EventBus.prototype.on = function (name, cb) {
    (this.listeners[name] || (this.listeners[name] = [])).push(cb);
    return this;
  };
  EventBus.prototype.off = function (name, cb) {
    var list = this.listeners[name];
    if (!list) return this;
    this.listeners[name] = list.filter(function (f) { return f !== cb; });
    return this;
  };
  EventBus.prototype.emit = function (name, payload) {
    var list = this.listeners[name];
    if (!list) return;
    for (var i = 0; i < list.length; i++) list[i](payload);
  };

  // ---- localStorage wrapper (safe on file:// and private mode) ------------

  var Storage = {
    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        global.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try { global.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  // Expose
  global.Utils = {
    clamp: clamp,
    lerp: lerp,
    easeInOut: easeInOut,
    sign: sign,
    approach: approach,
    rand: rand,
    randInt: randInt,
    pick: pick,
    aabb: aabb,
    pointInRect: pointInRect,
    EventBus: EventBus,
    Storage: Storage,
  };
})(window);
