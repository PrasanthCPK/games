/* ============================================================
   Bootstrap & main loop.
   ------------------------------------------------------------
   - Sets up the canvas for high-DPI / Retina rendering.
   - Wires the input abstraction layer (keyboard / touch / mouse /
     gamepad) into the Game.
   - Runs a FIXED-timestep simulation with an interpolated render,
     for stable, frame-rate-independent physics and smooth 60 FPS.
   - Pauses simulation when the tab is hidden.
   - Registers the service worker for offline / PWA support.
   ============================================================ */

import { InputManager, KeyboardSource, PointerButtonSource, GamepadSource } from './input.js';
import { Renderer } from './renderer.js';
import { Game } from './game.js';
import { Audio } from './audio.js';

const STEP = 1 / 120;        // physics step (s)
const MAX_FRAME = 0.10;      // clamp huge gaps (tab switches, breakpoints)

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false });

const input = new InputManager();
const renderer = new Renderer(ctx);
const game = new Game(input, renderer);

/* ---------- input sources ---------- */
input.addSource(new KeyboardSource());
input.addSource(new PointerButtonSource(document.getElementById('touch-controls')));
input.addSource(new GamepadSource());

/* ---------- touch capability → show on-screen controls ---------- */
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
  window.matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
game.isTouch = isTouch;

/* ---------- high-DPI canvas sizing ---------- */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  game.setViewport(w, h);
  updateOrientationHint(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

/* ---------- orientation hint (portrait phones) ---------- */
const hintEl = document.getElementById('orientation-hint');
let hintDismissed = sessionStorage.getItem('bounce.hint') === '1';
hintEl.addEventListener('click', () => {
  hintDismissed = true;
  sessionStorage.setItem('bounce.hint', '1');
  hintEl.hidden = true;
});
function updateOrientationHint(w, h) {
  const portraitPhone = h > w && Math.min(w, h) < 500;
  hintEl.hidden = hintDismissed || !portraitPhone;
}

/* ---------- prevent page scroll / browser gestures during play ---------- */
// Allow scrolling only inside the menu panel; block everywhere else so the
// game surface never pans, zooms or rubber-bands.
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest || !e.target.closest('.overlay-panel')) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());     // iOS pinch-zoom
document.addEventListener('dblclick', (e) => e.preventDefault());         // double-tap zoom
window.addEventListener('contextmenu', (e) => {
  if (e.target.closest && e.target.closest('#game-root')) e.preventDefault();
});

/* ---------- unlock audio on first user gesture ---------- */
const unlockAudio = () => { Audio.resume(); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

/* ---------- pause when tab/window is not visible ---------- */
let paused = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    paused = true;
    input.releaseAll();
    game.pauseForBlur();
  } else {
    paused = false;
    last = performance.now(); // avoid a huge dt spike on return
    accumulator = 0;
  }
});
window.addEventListener('blur', () => { input.releaseAll(); game.pauseForBlur(); });

/* ---------- fixed-timestep loop ---------- */
let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return; // skip work while hidden (rendering is paused too)

  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;

  // Edge inputs once per frame so taps are never dropped.
  input.update();
  game.handleFrameInput();

  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 8) {
    game.fixedUpdate(STEP);
    accumulator -= STEP;
    steps++;
  }

  const alpha = accumulator / STEP;
  game.render(alpha);
}

/* ---------- start ---------- */
resize();
game.begin();
requestAnimationFrame(frame);

/* ---------- service worker / PWA ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      /* offline support unavailable — game still works online */
    });
  });
}
