/*
 * animation.js — Frame-based animation playback.
 *
 * An Animation is a named clip: a list of frame indices into a sprite's
 * pre-rendered frame array, plus fps and loop flag. AnimationController holds
 * a set of clips for one entity and tracks the current frame over time.
 *
 * Frame "events" let gameplay react on specific frames (e.g. the active frame
 * of an attack, or a footstep) without hard-coding timing elsewhere.
 */
(function (global) {
  'use strict';

  /**
   * @param {object} opts {frames:int[], fps:number, loop:bool, events:{idx:name}}
   */
  function Animation(opts) {
    this.frames = opts.frames;          // array of frame indices
    this.fps = opts.fps || 8;
    this.loop = opts.loop !== false;    // default true
    this.events = opts.events || {};    // {frameIndex: 'eventName'}
  }
  Animation.prototype.duration = function () {
    return this.frames.length / this.fps;
  };

  function AnimationController(clips) {
    this.clips = clips || {};   // {name: Animation}
    this.current = null;        // current Animation
    this.name = null;
    this.time = 0;              // seconds into the clip
    this.index = 0;             // current frame index within clip
    this.done = false;          // true once a non-looping clip finishes
    this.onEvent = null;        // optional callback(eventName)
    this._lastEmitted = -1;
  }

  /**
   * Switch to clip `name`. Re-playing the same clip is a no-op unless force.
   */
  AnimationController.prototype.play = function (name, force) {
    if (this.name === name && !force) return;
    var clip = this.clips[name];
    if (!clip) return;
    this.name = name;
    this.current = clip;
    this.time = 0;
    this.index = 0;
    this.done = false;
    this._lastEmitted = -1;
    this._fireEvent(0);
  };

  AnimationController.prototype._fireEvent = function (idx) {
    if (this._lastEmitted === idx) return;
    this._lastEmitted = idx;
    var ev = this.current.events[idx];
    if (ev && this.onEvent) this.onEvent(ev);
  };

  AnimationController.prototype.update = function (dt) {
    if (!this.current) return;
    var clip = this.current;
    this.time += dt;
    var frame = Math.floor(this.time * clip.fps);
    if (clip.loop) {
      this.index = frame % clip.frames.length;
    } else {
      if (frame >= clip.frames.length) {
        this.index = clip.frames.length - 1;
        this.done = true;
      } else {
        this.index = frame;
      }
    }
    this._fireEvent(this.index);
  };

  /** The sprite frame index to draw this tick. */
  AnimationController.prototype.frame = function () {
    if (!this.current) return 0;
    return this.current.frames[this.index];
  };

  global.Animation = Animation;
  global.AnimationController = AnimationController;
})(window);
