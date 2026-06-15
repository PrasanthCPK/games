/* ============================================================
   Input Abstraction Layer
   ------------------------------------------------------------
   Game logic NEVER reads keyboard/touch/gamepad directly. It only
   asks the InputManager about *logical actions*:

     LEFT, RIGHT, JUMP, PAUSE, RESTART

   Any number of input *sources* (keyboard, touch buttons, mouse,
   gamepad) feed those actions. Multiple sources may hold the same
   action simultaneously (e.g. multi-touch: left + jump at once).
   ============================================================ */

export const Action = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  JUMP: 'jump',
  PAUSE: 'pause',
  RESTART: 'restart',
});

export class InputManager {
  constructor() {
    // For each action, the set of "owners" currently holding it.
    // An owner is a unique token like 'key:ArrowLeft' or 'touch:3'.
    // Using a set means two sources can hold the same action and
    // releasing one does not release the other.
    this._owners = new Map();
    for (const a of Object.values(Action)) this._owners.set(a, new Set());

    this._held = {};        // current frame held state
    this._prevHeld = {};    // previous frame held state
    for (const a of Object.values(Action)) { this._held[a] = false; this._prevHeld[a] = false; }

    this._sources = [];
  }

  /** Register an input source. Sources expose attach()/detach()/poll(). */
  addSource(source) {
    source.attach(this);
    this._sources.push(source);
    return source;
  }

  /** A source asserts that `owner` is now pressing `action`. */
  press(owner, action) {
    const set = this._owners.get(action);
    if (set) set.add(owner);
  }

  /** A source releases `owner`'s hold on `action`. */
  release(owner, action) {
    const set = this._owners.get(action);
    if (set) set.delete(owner);
  }

  /** Release every hold owned by tokens with the given prefix (e.g. 'touch:'). */
  releaseByPrefix(prefix) {
    for (const set of this._owners.values()) {
      for (const owner of [...set]) if (owner.startsWith(prefix)) set.delete(owner);
    }
  }

  /** Clear all held inputs (used when focus is lost / game pauses). */
  releaseAll() {
    for (const set of this._owners.values()) set.clear();
  }

  /** Call once per frame BEFORE game logic reads input. */
  update() {
    // Let polled sources (gamepad) refresh first.
    for (const s of this._sources) if (s.poll) s.poll(this);

    for (const a of Object.values(Action)) {
      this._prevHeld[a] = this._held[a];
      this._held[a] = this._owners.get(a).size > 0;
    }
  }

  /** Is the action currently held? (continuous — movement, jump-hold) */
  isHeld(action) { return this._held[action]; }

  /** Was the action pressed THIS frame? (edge — pause, restart, jump tap) */
  wasPressed(action) { return this._held[action] && !this._prevHeld[action]; }

  /** Was the action released this frame? */
  wasReleased(action) { return !this._held[action] && this._prevHeld[action]; }

  /** Horizontal axis in [-1, 1] combining all sources. */
  get axisX() {
    return (this._held[Action.RIGHT] ? 1 : 0) - (this._held[Action.LEFT] ? 1 : 0);
  }
}

/* ------------------------------------------------------------
   Keyboard source
   Left  : ArrowLeft / A
   Right : ArrowRight / D
   Jump  : ArrowUp / W / Space
   Pause : P
   Restart: R
   ------------------------------------------------------------ */
export class KeyboardSource {
  constructor() {
    this._map = {
      ArrowLeft: Action.LEFT, KeyA: Action.LEFT,
      ArrowRight: Action.RIGHT, KeyD: Action.RIGHT,
      ArrowUp: Action.JUMP, KeyW: Action.JUMP, Space: Action.JUMP,
      KeyP: Action.PAUSE,
      KeyR: Action.RESTART,
    };
  }

  attach(input) {
    this._onDown = (e) => {
      const action = this._map[e.code];
      if (!action) return;
      // Stop Space/Arrows from scrolling the page.
      e.preventDefault();
      if (e.repeat) return;
      input.press('key:' + e.code, action);
    };
    this._onUp = (e) => {
      const action = this._map[e.code];
      if (!action) return;
      e.preventDefault();
      input.release('key:' + e.code, action);
    };
    window.addEventListener('keydown', this._onDown, { passive: false });
    window.addEventListener('keyup', this._onUp, { passive: false });
  }

  detach() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
  }
}

/* ------------------------------------------------------------
   Touch / mouse / pen source (unified via Pointer Events).
   Binds to the on-screen virtual buttons. Pointer Events give us
   true multi-touch — each finger is an independent pointerId — so
   a player can hold "right" and tap "jump" at the same time.
   ------------------------------------------------------------ */
export class PointerButtonSource {
  constructor(container) {
    this._container = container;
    this._buttons = [...container.querySelectorAll('[data-action]')];
    // Track which action each active pointer is holding so we can
    // release correctly on pointerup/cancel/leave.
    this._pointerAction = new Map();
  }

  attach(input) {
    this._input = input;

    const actionFor = (el) => {
      const name = el.getAttribute('data-action');
      return {
        left: Action.LEFT, right: Action.RIGHT, jump: Action.JUMP, pause: Action.PAUSE,
      }[name];
    };

    this._onDown = (e) => {
      const btn = e.currentTarget;
      const action = actionFor(btn);
      if (!action) return;
      e.preventDefault();
      const owner = 'touch:' + e.pointerId;
      this._pointerAction.set(e.pointerId, action);
      input.press(owner, action);
      btn.classList.add('active');
      // Capture so we keep getting events even if the finger slides off.
      try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const end = (e) => {
      const action = this._pointerAction.get(e.pointerId);
      if (action === undefined) return;
      input.release('touch:' + e.pointerId, action);
      this._pointerAction.delete(e.pointerId);
      e.currentTarget.classList.remove('active');
    };
    this._onUp = end;
    this._onCancel = end;

    for (const btn of this._buttons) {
      btn.addEventListener('pointerdown', this._onDown, { passive: false });
      btn.addEventListener('pointerup', this._onUp, { passive: false });
      btn.addEventListener('pointercancel', this._onCancel, { passive: false });
      // Prevent the context menu / text selection on long press.
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  detach() {
    for (const btn of this._buttons) {
      btn.removeEventListener('pointerdown', this._onDown);
      btn.removeEventListener('pointerup', this._onUp);
      btn.removeEventListener('pointercancel', this._onCancel);
    }
  }
}

/* ------------------------------------------------------------
   Gamepad source (bonus). Polled each frame.
   D-pad / left stick = move, A / B / X / Y = jump,
   Start = pause, Back/Select = restart.
   ------------------------------------------------------------ */
export class GamepadSource {
  constructor() {
    this._connected = false;
    this._prevButtons = {};
  }

  attach(input) {
    this._onConnect = () => { this._connected = true; };
    window.addEventListener('gamepadconnected', this._onConnect);
  }

  detach() {
    window.removeEventListener('gamepadconnected', this._onConnect);
  }

  poll(input) {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let active = null;
    for (const p of pads) { if (p) { active = p; break; } }
    if (!active) return;

    const owner = 'pad:' + active.index;
    const DEAD = 0.35;
    const ax = active.axes[0] || 0;

    const left = ax < -DEAD || (active.buttons[14] && active.buttons[14].pressed);
    const right = ax > DEAD || (active.buttons[15] && active.buttons[15].pressed);
    const jump = [0, 1, 2, 3, 12].some((i) => active.buttons[i] && active.buttons[i].pressed);

    this._set(input, owner + ':l', Action.LEFT, left);
    this._set(input, owner + ':r', Action.RIGHT, right);
    this._set(input, owner + ':j', Action.JUMP, jump);

    // Edge-style buttons: only press for one frame on the rising edge.
    this._edge(input, owner + ':p', Action.PAUSE, active.buttons[9] && active.buttons[9].pressed);
    this._edge(input, owner + ':rs', Action.RESTART, active.buttons[8] && active.buttons[8].pressed);
  }

  _set(input, owner, action, pressed) {
    if (pressed) input.press(owner, action);
    else input.release(owner, action);
  }

  _edge(input, owner, action, pressed) {
    const was = this._prevButtons[owner] || false;
    if (pressed && !was) input.press(owner, action);
    else input.release(owner, action);
    this._prevButtons[owner] = pressed;
  }
}
