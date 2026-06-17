/*
 * input.js — Unified input for keyboard and touch.
 *
 * Exposes a logical action set polled by the Player:
 *   left, right, up, down, jump, action, sword, block, pause
 *
 * `held(a)`   — is the action currently down?
 * `pressed(a)`— was it pressed this frame (edge)?
 * `released(a)`— was it released this frame (edge)?
 *
 * Call `update()` once per frame (before gameplay) to latch edges.
 */
(function (global) {
  'use strict';

  function Input() {
    this.cur = {};   // current held state
    this.prev = {};  // previous frame held state
    this._down = {}; // raw key/touch down state (updated by listeners)

    this._keyMap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      Space: 'jump',
      ShiftLeft: 'action', ShiftRight: 'action',
      ControlLeft: 'sword', ControlRight: 'sword',
      KeyB: 'block',
      Escape: 'pause',
      Backquote: 'debug',
    };

    this._bindKeyboard();
  }

  Input.prototype._bindKeyboard = function () {
    var self = this;
    global.addEventListener('keydown', function (e) {
      var action = self._keyMap[e.code];
      if (action) {
        self._down[action] = true;
        // Prevent page scroll on arrows/space.
        if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
      }
    });
    global.addEventListener('keyup', function (e) {
      var action = self._keyMap[e.code];
      if (action) self._down[action] = false;
    });
    // Release everything if the window loses focus (avoids stuck keys).
    global.addEventListener('blur', function () {
      self._down = {};
    });
  };

  /**
   * Wire DOM touch buttons. `buttons` is a map of {action: HTMLElement}.
   * Each button sets the corresponding raw-down state while pressed.
   */
  Input.prototype.bindTouch = function (buttons) {
    var self = this;
    Object.keys(buttons).forEach(function (action) {
      var el = buttons[action];
      if (!el) return;
      var press = function (e) { e.preventDefault(); self._down[action] = true; };
      var release = function (e) { e.preventDefault(); self._down[action] = false; };
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
      // Mouse fallback so the on-screen controls also work with a cursor.
      el.addEventListener('mousedown', press);
      el.addEventListener('mouseup', release);
      el.addEventListener('mouseleave', release);
    });
  };

  /** Latch the current/previous state. Call once per frame before update. */
  Input.prototype.update = function () {
    this.prev = this.cur;
    var next = {};
    for (var k in this._down) next[k] = !!this._down[k];
    this.cur = next;
  };

  Input.prototype.held = function (a) { return !!this.cur[a]; };
  Input.prototype.pressed = function (a) { return !!this.cur[a] && !this.prev[a]; };
  Input.prototype.released = function (a) { return !this.cur[a] && !!this.prev[a]; };

  /** Horizontal axis: -1, 0, or 1. */
  Input.prototype.axisX = function () {
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  };

  global.Input = Input;
})(window);
