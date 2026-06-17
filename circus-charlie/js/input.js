/* ============================================================
   input.js — InputManager
   Unifies keyboard and on-screen touch controls into a single set of
   action flags the game reads each frame. Also exposes one-shot
   "pressed" events for menu navigation (start / pause / jump edge).
   ============================================================ */
(function () {
  "use strict";

  class InputManager {
    constructor() {
      // Held state for continuous actions.
      this.left = false;
      this.right = false;
      this.jump = false;

      // Edge-triggered (consumed) one-shot flags.
      this._jumpPressed = false;
      this._startPressed = false;
      this._pausePressed = false;
      this._anyPressed = false;
      // Menu navigation edges.
      this._navUp = false;
      this._navDown = false;
      this._navLeft = false;
      this._navRight = false;
      // Menu "confirm/select" edge — deliberately separate from jump so
      // that Up/W (which are jump keys in-game) don't confirm in menus.
      this._selectPressed = false;

      this._keyMap = {
        ArrowLeft: "left", a: "left", A: "left",
        ArrowRight: "right", d: "right", D: "right",
        " ": "jump", ArrowUp: "jump", w: "jump", W: "jump",
      };

      this._bindKeyboard();
      this._bindTouch();
    }

    _bindKeyboard() {
      window.addEventListener("keydown", (e) => {
        if (e.repeat) {
          // Still allow held movement, but don't re-fire edges.
          const a = this._keyMap[e.key];
          if (a) e.preventDefault();
          return;
        }
        const action = this._keyMap[e.key];
        if (action) {
          if (action === "jump" && !this.jump) this._jumpPressed = true;
          this[action] = true;
          e.preventDefault();
        }
        // Menu navigation edges (separate from gameplay movement).
        if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") this._navUp = true;
        if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") this._navDown = true;
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this._navLeft = true;
        if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this._navRight = true;
        if (e.key === "Enter") { this._startPressed = true; this._selectPressed = true; }
        if (e.key === " ") this._selectPressed = true; // Space confirms menus
        if (e.key === "p" || e.key === "P") this._pausePressed = true;
        this._anyPressed = true;
      });

      window.addEventListener("keyup", (e) => {
        const action = this._keyMap[e.key];
        if (action) {
          this[action] = false;
          e.preventDefault();
        }
      });

      // Lose focus -> release everything (prevents "stuck" keys).
      window.addEventListener("blur", () => {
        this.left = this.right = this.jump = false;
      });
    }

    _bindTouch() {
      const buttons = document.querySelectorAll(".touch-btn");
      buttons.forEach((btn) => {
        const action = btn.dataset.action;

        const press = (e) => {
          e.preventDefault();
          this._anyPressed = true;
          if (action === "left") { this.left = true; this._navUp = true; this._navLeft = true; }
          else if (action === "right") { this.right = true; this._navDown = true; this._navRight = true; }
          else if (action === "jump") {
            if (!this.jump) this._jumpPressed = true;
            this.jump = true;
            this._selectPressed = true; // jump button also confirms menus
          } else if (action === "pause") this._pausePressed = true;
        };

        const release = (e) => {
          e.preventDefault();
          if (action === "left") this.left = false;
          else if (action === "right") this.right = false;
          else if (action === "jump") this.jump = false;
        };

        btn.addEventListener("touchstart", press, { passive: false });
        btn.addEventListener("touchend", release, { passive: false });
        btn.addEventListener("touchcancel", release, { passive: false });
        btn.addEventListener("mousedown", press);
        btn.addEventListener("mouseup", release);
        btn.addEventListener("mouseleave", release);
      });

      // Tapping anywhere on the canvas during a menu also counts as
      // "start"/"confirm" so mobile players can begin without hunting
      // for a key.
      const canvas = document.getElementById("game-canvas");
      canvas.addEventListener("touchstart", () => {
        this._startPressed = true;
        this._selectPressed = true;
        this._anyPressed = true;
      }, { passive: true });
      canvas.addEventListener("mousedown", () => {
        this._startPressed = true;
        this._selectPressed = true;
        this._anyPressed = true;
      });
    }

    /* ---- one-shot consumers (return true once per press) ---- */
    consumeJump() {
      const v = this._jumpPressed;
      this._jumpPressed = false;
      return v;
    }
    consumeStart() {
      const v = this._startPressed;
      this._startPressed = false;
      return v;
    }
    consumePause() {
      const v = this._pausePressed;
      this._pausePressed = false;
      return v;
    }
    consumeAny() {
      const v = this._anyPressed;
      this._anyPressed = false;
      return v;
    }
    consumeNavUp() { const v = this._navUp; this._navUp = false; return v; }
    consumeNavDown() { const v = this._navDown; this._navDown = false; return v; }
    consumeNavLeft() { const v = this._navLeft; this._navLeft = false; return v; }
    consumeNavRight() { const v = this._navRight; this._navRight = false; return v; }
    consumeSelect() { const v = this._selectPressed; this._selectPressed = false; return v; }

    /** Clear every edge flag — used on state transitions so a key held
        through a menu doesn't leak into gameplay (or vice-versa). */
    flush() {
      this._jumpPressed = this._startPressed = this._pausePressed = false;
      this._navUp = this._navDown = this._navLeft = this._navRight = false;
      this._selectPressed = this._anyPressed = false;
    }

    /** Clear edge flags at end of frame (safety net). */
    endFrame() {
      // edges are consumed explicitly; nothing persistent to clear here.
    }
  }

  window.InputManager = InputManager;
})();
