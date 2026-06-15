/* ============================================================
   Overlay UI (menus, pause, results). Built with DOM so menus
   stay crisp, accessible and easy to drive with both touch and
   keyboard. The Game owns state; UI just renders panels and calls
   back into the Game.
   ============================================================ */

import { LEVELS, LEVEL_COUNT } from './levels.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';
import { formatTime } from './utils.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('overlay');
    this.panel = document.getElementById('overlay-panel');
  }

  hide() { this.overlay.classList.remove('show'); }
  _show(html) {
    this.panel.innerHTML = html;
    this.overlay.classList.add('show');
    this._wire();
  }

  /** Attach click handlers to any [data-act] element in the panel. */
  _wire() {
    this.panel.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', () => {
        Audio.resume();
        const act = el.getAttribute('data-act');
        const arg = el.getAttribute('data-arg');
        this._dispatch(act, arg);
      });
    });
  }

  _dispatch(act, arg) {
    const g = this.game;
    switch (act) {
      case 'play':      g.startLevel(Storage.getUnlockedLevel()); break;
      case 'level':     g.startLevel(parseInt(arg, 10)); break;
      case 'resume':    g.resume(); break;
      case 'restart':   g.restartLevel(); break;
      case 'next':      g.nextLevel(); break;
      case 'menu':      g.toMenu(); break;
      case 'levels':    this.showLevelSelect(); break;
      case 'mute':      Audio.toggleMute(); this._refreshMuteLabel(); break;
    }
  }

  _refreshMuteLabel() {
    const el = this.panel.querySelector('[data-act="mute"]');
    if (el) el.textContent = Audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
  }

  _controlsHelp() {
    return `
      <div class="controls-help">
        <strong>Keyboard</strong><br/>
        <kbd>←</kbd><kbd>A</kbd> move left &nbsp; <kbd>→</kbd><kbd>D</kbd> move right<br/>
        <kbd>↑</kbd><kbd>W</kbd><kbd>Space</kbd> jump &nbsp; <kbd>P</kbd> pause &nbsp; <kbd>R</kbd> restart<br/>
        <strong>Touch</strong> — use the on-screen buttons. <strong>Gamepad</strong> supported.
      </div>`;
  }

  showMenu() {
    this._show(`
      <h1>BOUNCE</h1>
      <p>Collect every ring, dodge the spikes, reach the glowing goal.</p>
      <button class="btn" data-act="play">▶ Play</button>
      <button class="btn secondary" data-act="levels">Level Select</button>
      <button class="btn secondary" data-act="mute">${Audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On'}</button>
      ${this._controlsHelp()}
    `);
  }

  showLevelSelect() {
    const unlocked = Storage.getUnlockedLevel();
    const chips = LEVELS.map((lvl, i) => {
      const locked = i > unlocked;
      const best = Storage.getBestTime(i);
      const cls = locked ? 'locked' : (best != null ? 'cleared' : '');
      const attr = locked ? '' : `data-act="level" data-arg="${i}"`;
      return `<div class="level-chip ${cls}" ${attr} title="${lvl.name}">${i + 1}</div>`;
    }).join('');
    this._show(`
      <h2>Select Level</h2>
      <div class="level-select">${chips}</div>
      <button class="btn secondary" data-act="menu">← Back</button>
    `);
  }

  showPause() {
    this._show(`
      <h2>Paused</h2>
      <button class="btn" data-act="resume">▶ Resume</button>
      <button class="btn secondary" data-act="restart">↻ Restart Level</button>
      <button class="btn secondary" data-act="mute">${Audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On'}</button>
      <button class="btn secondary" data-act="menu">⌂ Main Menu</button>
      ${this._controlsHelp()}
    `);
  }

  showLevelComplete({ levelIndex, time, best, isNewBest, rings }) {
    const last = levelIndex >= LEVEL_COUNT - 1;
    this._show(`
      <h2>Level Cleared!</h2>
      <div class="stat-row"><span>Time</span><span>${formatTime(time)}</span></div>
      <div class="stat-row"><span>Best</span><span>${best != null ? formatTime(best) : '—'}${isNewBest ? '  ★' : ''}</span></div>
      <div class="stat-row"><span>Rings</span><span>${rings}</span></div>
      ${last
        ? `<button class="btn" data-act="menu">🏆 Finish</button>`
        : `<button class="btn" data-act="next">Next Level →</button>`}
      <button class="btn secondary" data-act="restart">↻ Replay</button>
      <button class="btn secondary" data-act="menu">⌂ Main Menu</button>
    `);
  }

  showGameOver() {
    this._show(`
      <h2>Game Over</h2>
      <p>The ball ran out of lives.</p>
      <button class="btn" data-act="restart">↻ Try Again</button>
      <button class="btn secondary" data-act="menu">⌂ Main Menu</button>
    `);
  }

  showGameComplete({ totalTime }) {
    this._show(`
      <h1>YOU WIN!</h1>
      <p>You cleared every level.</p>
      <div class="stat-row"><span>Total time</span><span>${formatTime(totalTime)}</span></div>
      <button class="btn" data-act="menu">⌂ Main Menu</button>
    `);
  }
}
