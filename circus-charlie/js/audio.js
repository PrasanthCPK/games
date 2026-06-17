/* ============================================================
   audio.js — AudioManager
   All sound is synthesised at runtime with the Web Audio API, so the
   game needs no audio files. Provides retro SFX plus a looping,
   programmatically generated circus tune (a chiptune arrangement of
   the classic "Entry of the Gladiators" feel).
   ============================================================ */
(function () {
  "use strict";

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.muted = false;
      this.musicTimer = null;
      this.musicStep = 0;
      this.started = false;
    }

    /** Lazily create the AudioContext (must follow a user gesture). */
    _ensure() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.35;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.8;
      this.sfxGain.connect(this.master);
    }

    /** Resume the context (browsers suspend it until a gesture). */
    resume() {
      this._ensure();
      if (this.ctx.state === "suspended") this.ctx.resume();
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) {
        this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
      }
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    /* ---------- Low-level tone helper ---------- */
    _tone(freq, dur, type, when, gainVal, dest) {
      const t = (when || this.ctx.currentTime);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gainVal || 0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(dest || this.sfxGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      return osc;
    }

    /* ---------- Sound effects ---------- */
    jump() {
      this._ensure();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(620, t + 0.14);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.2);
    }

    coin() {
      this._ensure();
      const t = this.ctx.currentTime;
      this._tone(880, 0.08, "square", t, 0.25);
      this._tone(1320, 0.12, "square", t + 0.07, 0.25);
    }

    hoop() {
      this._ensure();
      const t = this.ctx.currentTime;
      this._tone(660, 0.07, "triangle", t, 0.3);
      this._tone(990, 0.07, "triangle", t + 0.06, 0.3);
      this._tone(1320, 0.12, "triangle", t + 0.12, 0.3);
    }

    damage() {
      this._ensure();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.25);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.32);
    }

    lifeLost() {
      this._ensure();
      const t = this.ctx.currentTime;
      const notes = [392, 330, 262, 196];
      notes.forEach((n, i) => this._tone(n, 0.18, "square", t + i * 0.13, 0.3));
    }

    stageComplete() {
      this._ensure();
      const t = this.ctx.currentTime;
      const notes = [523, 659, 784, 1047, 784, 1047];
      notes.forEach((n, i) => this._tone(n, 0.16, "square", t + i * 0.12, 0.3));
    }

    gameOver() {
      this._ensure();
      const t = this.ctx.currentTime;
      const notes = [392, 370, 349, 330, 311, 262];
      notes.forEach((n, i) => this._tone(n, 0.24, "sawtooth", t + i * 0.18, 0.3));
    }

    combo(level) {
      this._ensure();
      const t = this.ctx.currentTime;
      const base = 660 + Math.min(level, 8) * 70;
      this._tone(base, 0.08, "square", t, 0.25);
      this._tone(base * 1.5, 0.1, "square", t + 0.07, 0.25);
    }

    /* ---------- Background circus music ----------
       A simple two-voice loop: a bouncy bass line and a melody on top,
       scheduled step by step on a timer. Tempo speeds up slightly with
       the stage for added tension. */
    startMusic(tempo) {
      this._ensure();
      this.stopMusic();
      this.musicStep = 0;
      const stepDur = 60 / (tempo || 132) / 2; // eighth notes

      // Melody (MIDI-ish frequencies). 0 = rest.
      const melody = [
        523, 0, 659, 0, 784, 659, 523, 0,
        587, 0, 698, 0, 880, 698, 587, 0,
        523, 659, 784, 1047, 988, 784, 659, 523,
        587, 698, 587, 523, 494, 0, 523, 0,
      ];
      const bass = [
        131, 196, 131, 196, 165, 196, 165, 196,
        147, 196, 147, 196, 175, 220, 175, 220,
        131, 196, 131, 196, 165, 196, 165, 196,
        147, 175, 196, 175, 131, 165, 196, 0,
      ];

      const tick = () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime + 0.02;
        const i = this.musicStep % melody.length;
        const m = melody[i];
        const b = bass[i];
        if (m) this._tone(m, stepDur * 0.9, "square", t, 0.16, this.musicGain);
        if (b) this._tone(b, stepDur * 1.4, "triangle", t, 0.22, this.musicGain);
        // light hi-hat every step
        this._noiseHat(t, stepDur * 0.3);
        this.musicStep++;
      };

      tick();
      this.musicTimer = setInterval(tick, stepDur * 1000);
    }

    _noiseHat(t, dur) {
      const buffer = this._noiseBuffer();
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const g = this.ctx.createGain();
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.musicGain);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    _noiseBuffer() {
      if (this._nb) return this._nb;
      const len = this.ctx.sampleRate * 0.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._nb = buf;
      return buf;
    }

    stopMusic() {
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    }
  }

  window.AudioManager = AudioManager;
})();
