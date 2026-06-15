/* ============================================================
   Procedural sound effects via the Web Audio API.
   No audio files — every sound is synthesised, so it works
   offline and adds no asset weight. Lazily created on first use
   to satisfy mobile autoplay policies (must follow a user gesture).
   ============================================================ */

import { Storage } from './storage.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = Storage.isMuted();
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  /** Call from a user gesture to unlock audio on iOS/Safari. */
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    Storage.setMuted(m);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.3, slideTo = null }) {
    if (this.muted) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  bounce() { this._tone({ freq: 220, slideTo: 360, dur: 0.10, type: 'sine', gain: 0.18 }); }
  jump()   { this._tone({ freq: 330, slideTo: 620, dur: 0.16, type: 'triangle', gain: 0.22 }); }
  ring()   { this._tone({ freq: 880, slideTo: 1320, dur: 0.12, type: 'square', gain: 0.14 }); }
  death()  { this._tone({ freq: 400, slideTo: 80, dur: 0.45, type: 'sawtooth', gain: 0.25 }); }

  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.22 }), i * 110));
  }

  checkpoint() { this._tone({ freq: 660, slideTo: 990, dur: 0.14, type: 'sine', gain: 0.18 }); }
}

export const Audio = new AudioEngine();
