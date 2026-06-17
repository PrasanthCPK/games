/*
 * audio.js — All sound is synthesized with the Web Audio API (no files).
 *
 * SFX are short oscillator/noise bursts with envelopes. Ambient music is a
 * looped phrase in a Persian-flavored (Phrygian-dominant) scale over a drone,
 * scheduled on the audio clock. Master/SFX/music volumes are adjustable and
 * persisted by the Game via SaveManager.
 */
(function (global) {
  'use strict';

  function AudioManager() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicOn = false;
    this._musicTimer = null;
    this._noiseBuffer = null;
    this.volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  AudioManager.prototype.init = function () {
    if (this.ctx) { this.resume(); return; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._applyVolumes();
    // Pre-build a white-noise buffer for percussive SFX.
    var len = this.ctx.sampleRate * 1;
    this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = this._noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  AudioManager.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  AudioManager.prototype.setVolumes = function (v) {
    if (v.master != null) this.volumes.master = v.master;
    if (v.sfx != null) this.volumes.sfx = v.sfx;
    if (v.music != null) this.volumes.music = v.music;
    this._applyVolumes();
  };

  AudioManager.prototype._applyVolumes = function () {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxGain.gain.value = this.volumes.sfx;
    this.musicGain.gain.value = this.volumes.music * 0.5;
  };

  // ---- SFX ----------------------------------------------------------------
  var SFX = {
    jump: { type: 'square', f0: 240, f1: 460, dur: 0.13, gain: 0.25 },
    land: { noise: true, dur: 0.09, lp: 1400, gain: 0.3 },
    sword: { noise: true, dur: 0.07, hp: 2400, gain: 0.45 },
    gate: { type: 'sawtooth', f0: 90, f1: 60, dur: 0.45, gain: 0.25 },
    spike: { noise: true, dur: 0.16, hp: 3200, gain: 0.4 },
    potion: { type: 'sine', f0: 600, f1: 980, dur: 0.26, gain: 0.3 },
    hurt: { type: 'square', f0: 200, f1: 120, dur: 0.18, gain: 0.3 },
    death: { type: 'triangle', f0: 320, f1: 50, dur: 0.8, gain: 0.35 },
    step: { noise: true, dur: 0.03, lp: 700, gain: 0.12 },
    coin: { type: 'square', f0: 880, f1: 1320, dur: 0.12, gain: 0.25 },
    win: { type: 'square', f0: 523, f1: 1046, dur: 0.5, gain: 0.3 },
  };

  AudioManager.prototype.play = function (name) {
    if (!this.ctx) return;
    var s = SFX[name];
    if (!s) return;
    var now = this.ctx.currentTime;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(s.gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + s.dur);
    g.connect(this.sfxGain);

    var src;
    if (s.noise) {
      src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer;
      var filt = this.ctx.createBiquadFilter();
      if (s.hp) { filt.type = 'highpass'; filt.frequency.value = s.hp; }
      else { filt.type = 'lowpass'; filt.frequency.value = s.lp || 1000; }
      src.connect(filt); filt.connect(g);
    } else {
      src = this.ctx.createOscillator();
      src.type = s.type;
      src.frequency.setValueAtTime(s.f0, now);
      src.frequency.exponentialRampToValueAtTime(Math.max(1, s.f1), now + s.dur);
      src.connect(g);
    }
    src.start(now);
    src.stop(now + s.dur + 0.02);
  };

  // ---- Music --------------------------------------------------------------
  // Phrygian dominant on A: A C# D E F G — gives the Middle-Eastern color.
  var SCALE = [220.00, 277.18, 293.66, 329.63, 349.23, 392.00, 440.00];
  var PHRASE = [0, 2, 3, 4, 3, 2, 0, 1, 0, 2, 4, 5, 4, 2, 1, 0];

  AudioManager.prototype.startMusic = function () {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    var self = this;
    var step = 0;
    var noteDur = 0.32;
    // Soft drone.
    var drone = this.ctx.createOscillator();
    var dg = this.ctx.createGain();
    drone.type = 'sine'; drone.frequency.value = 110;
    dg.gain.value = 0.08; drone.connect(dg); dg.connect(this.musicGain);
    drone.start();
    this._drone = drone;

    var tick = function () {
      if (!self.musicOn) return;
      var freq = SCALE[PHRASE[step % PHRASE.length]];
      self._playNote(freq, noteDur);
      if (step % 4 === 0) self._playNote(freq / 2, noteDur * 2, 0.05, 'triangle');
      step++;
      self._musicTimer = setTimeout(tick, noteDur * 1000);
    };
    tick();
  };

  AudioManager.prototype._playNote = function (freq, dur, gainV, type) {
    if (!this.ctx) return;
    var now = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gainV || 0.09, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(now); o.stop(now + dur + 0.05);
  };

  AudioManager.prototype.stopMusic = function () {
    this.musicOn = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    if (this._drone) { try { this._drone.stop(); } catch (e) { /* noop */ } this._drone = null; }
  };

  global.AudioManager = AudioManager;
})(window);
