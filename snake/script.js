/* ============================================================
   Snake — Retro Arcade
   Vanilla JavaScript. No libraries, no backend.

   Architecture
   ------------
   - SoundFX      : Web Audio API blips/tones (no external assets).
   - SnakeGame    : the whole game (state, loop, render, input).

   The game loop uses requestAnimationFrame with a fixed logical
   "step" interval (in ms) that shrinks as the score grows, so the
   snake speeds up gradually. Rendering interpolates between cells
   for smooth movement.
   ============================================================ */

(() => {
    "use strict";

    /* ============================================================
       SoundFX — tiny synthesizer using the Web Audio API.
       Lazily creates the AudioContext on first user gesture so
       browsers don't block it.
       ============================================================ */
    class SoundFX {
        constructor() {
            this.ctx = null;
            this.enabled = true;
        }

        // Create / resume the audio context (must follow a user gesture).
        _ensure() {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) this.ctx = new AC();
            }
            if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
            return this.ctx;
        }

        // Play a single tone. type/freq/duration shape the sound.
        _tone(freq, duration = 0.08, type = "square", gain = 0.06) {
            if (!this.enabled) return;
            const ctx = this._ensure();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            env.gain.setValueAtTime(0.0001, ctx.currentTime);
            env.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
            env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
            osc.connect(env).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration + 0.02);
        }

        eat()      { this._tone(660, 0.07, "square");  this._tone(880, 0.07, "square"); }
        power()    { this._tone(523, 0.09, "triangle"); setTimeout(() => this._tone(784, 0.12, "triangle"), 70); }
        turn()     { this._tone(320, 0.03, "sine", 0.03); }
        gameOver() {
            // descending arpeggio
            [440, 330, 247, 165].forEach((f, i) =>
                setTimeout(() => this._tone(f, 0.18, "sawtooth", 0.05), i * 120));
        }
        start()    { this._tone(523, 0.08, "square"); setTimeout(() => this._tone(784, 0.12, "square"), 90); }
        achievement() {
            [659, 784, 988].forEach((f, i) =>
                setTimeout(() => this._tone(f, 0.12, "triangle", 0.05), i * 90));
        }
    }

    /* ============================================================
       Particle — a single short-lived spark for the "food eaten"
       burst effect.
       ============================================================ */
    class Particle {
        constructor(x, y, color) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            this.x = x;
            this.y = y;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.life = 1;                    // 1 -> 0
            this.decay = 0.02 + Math.random() * 0.03;
            this.size = 2 + Math.random() * 3;
            this.color = color;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.08;                  // slight gravity
            this.life -= this.decay;
        }
    }

    /* ============================================================
       SnakeGame — the main controller.
       ============================================================ */
    class SnakeGame {
        constructor() {
            // --- Canvas ---
            this.canvas = document.getElementById("game");
            this.ctx = this.canvas.getContext("2d");

            // --- Grid configuration ---
            this.cols = 24;
            this.rows = 24;
            this.cell = this.canvas.width / this.cols; // logical cell size

            // --- Subsystems ---
            this.sfx = new SoundFX();

            // --- Persistent state ---
            this.highScore = Number(localStorage.getItem("snake.highScore") || 0);
            this.theme = localStorage.getItem("snake.theme") || "neon";
            this.sfx.enabled = localStorage.getItem("snake.sound") !== "off";
            this.achievementsHit = JSON.parse(localStorage.getItem("snake.achievements") || "[]");

            // --- Runtime state ---
            this.state = "start";            // start | playing | paused | over
            this.snake = [];
            this.dir = { x: 1, y: 0 };        // current direction
            this.nextDir = { x: 1, y: 0 };    // buffered direction (applied each step)
            this.food = null;
            this.power = null;                // power-up food (or null)
            this.powerTimer = 0;             // frames left for power-up
            this.score = 0;
            this.foodEaten = 0;
            this.particles = [];

            // --- Timing ---
            this.baseStep = 150;             // ms per move at start (slow)
            this.minStep = 60;               // fastest allowed
            this.stepMs = this.baseStep;
            this.acc = 0;                    // accumulator for fixed steps
            this.lastTime = 0;
            this.lastHeadPos = null;         // for render interpolation
            this.rafId = null;

            this._cacheDom();
            this._applyTheme(this.theme);
            this._bindEvents();
            this._refreshHud();
            this._showScreen("start");

            // Kick off the render loop (it runs always; logic only when playing).
            this.lastTime = performance.now();
            this.rafId = requestAnimationFrame((t) => this._frame(t));
        }

        /* ---------------- DOM caching ---------------- */
        _cacheDom() {
            this.el = {
                score:        document.getElementById("score"),
                highScore:    document.getElementById("highScore"),
                overlay:      document.getElementById("overlay"),
                startScreen:  document.getElementById("startScreen"),
                pauseScreen:  document.getElementById("pauseScreen"),
                gameOverScreen: document.getElementById("gameOverScreen"),
                finalScore:   document.getElementById("finalScore"),
                finalHigh:    document.getElementById("finalHigh"),
                newBest:      document.getElementById("newBest"),
                toast:        document.getElementById("toast"),
                theme:        document.getElementById("theme"),
                soundToggle:  document.getElementById("soundToggle"),
                pauseBtn:     document.getElementById("pauseBtn"),
                fullscreenBtn:document.getElementById("fullscreenBtn"),
            };
            this.el.theme.value = this.theme;
            this.el.soundToggle.textContent = this.sfx.enabled ? "🔊" : "🔇";
            this.el.soundToggle.classList.toggle("muted", !this.sfx.enabled);
        }

        /* ---------------- Theme handling ---------------- */
        _applyTheme(name) {
            this.theme = name;
            document.documentElement.setAttribute("data-theme", name);
            localStorage.setItem("snake.theme", name);
            // Read resolved CSS colors so the canvas matches the theme.
            const cs = getComputedStyle(document.documentElement);
            this.colors = {
                snake:  cs.getPropertyValue("--accent").trim(),
                snake2: cs.getPropertyValue("--accent-2").trim(),
                food:   cs.getPropertyValue("--food").trim(),
                power:  cs.getPropertyValue("--power").trim(),
                grid:   cs.getPropertyValue("--grid-line").trim(),
                board:  cs.getPropertyValue("--board-bg").trim(),
            };
        }

        /* ---------------- Event binding ---------------- */
        _bindEvents() {
            // Keyboard
            window.addEventListener("keydown", (e) => this._onKey(e));

            // Buttons
            document.getElementById("startBtn").addEventListener("click", () => this.start());
            document.getElementById("restartBtn").addEventListener("click", () => this.start());
            document.getElementById("resumeBtn").addEventListener("click", () => this.togglePause());
            this.el.pauseBtn.addEventListener("click", () => this.togglePause());
            this.el.fullscreenBtn.addEventListener("click", () => this._toggleFullscreen());

            this.el.soundToggle.addEventListener("click", () => this._toggleSound());
            this.el.theme.addEventListener("change", (e) => this._applyTheme(e.target.value));

            // Touch D-pad
            document.querySelectorAll(".dpad[data-dir]").forEach((btn) => {
                const handler = (e) => { e.preventDefault(); this._setDirection(btn.dataset.dir); };
                btn.addEventListener("click", handler);
                btn.addEventListener("touchstart", handler, { passive: false });
            });
            document.getElementById("touchPause").addEventListener("click", () => {
                if (this.state === "playing" || this.state === "paused") this.togglePause();
                else if (this.state !== "over") this.start();
            });

            // Swipe gestures on the board
            this._bindSwipe();

            // Keep canvas crisp on resize / DPR changes
            window.addEventListener("resize", () => this._resizeCanvas());
            this._resizeCanvas();
        }

        // Handle high-DPI rendering so it looks sharp on phones / retina.
        _resizeCanvas() {
            const rect = this.canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = Math.round(rect.width * dpr);
            this.canvas.height = Math.round(rect.height * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.pxSize = rect.width;            // logical pixel size of board
            this.cell = this.pxSize / this.cols; // recompute cell in CSS px
        }

        // Swipe-to-steer for mobile browsers.
        // Direction registers mid-gesture (on touchmove) once the finger
        // travels past a small threshold, so steering feels instant. After a
        // swipe registers, the origin resets to the current point — letting you
        // chain multiple turns in one continuous finger drag without lifting.
        _bindSwipe() {
            const THRESHOLD = 22;            // px of travel needed to register
            let sx = 0, sy = 0, active = false;

            const start = (e) => {
                const t = e.touches ? e.touches[0] : e;
                sx = t.clientX; sy = t.clientY; active = true;
            };

            const move = (e) => {
                if (!active) return;
                const t = e.touches ? e.touches[0] : e;
                const dx = t.clientX - sx, dy = t.clientY - sy;
                if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
                // Prevent the page from scrolling while steering on the board.
                if (e.cancelable) e.preventDefault();
                if (Math.abs(dx) > Math.abs(dy)) this._setDirection(dx > 0 ? "right" : "left");
                else this._setDirection(dy > 0 ? "down" : "up");
                // Reset origin so the next swipe in the same drag is detected.
                sx = t.clientX; sy = t.clientY;
            };

            const end = () => { active = false; };

            // Bind to the whole board area so the entire surface is swipeable.
            const surface = document.querySelector(".board-wrap") || this.canvas;
            surface.addEventListener("touchstart", start, { passive: true });
            surface.addEventListener("touchmove", move, { passive: false });
            surface.addEventListener("touchend", end, { passive: true });
            surface.addEventListener("touchcancel", end, { passive: true });
        }

        /* ---------------- Input handling ---------------- */
        _onKey(e) {
            const k = e.key.toLowerCase();
            const dirKeys = {
                arrowup: "up", w: "up",
                arrowdown: "down", s: "down",
                arrowleft: "left", a: "left",
                arrowright: "right", d: "right",
            };

            if (k === "enter") {
                if (this.state === "start" || this.state === "over") { e.preventDefault(); this.start(); }
                return;
            }
            if (k === " " || k === "spacebar") {
                e.preventDefault();
                if (this.state === "playing" || this.state === "paused") this.togglePause();
                return;
            }
            if (dirKeys[k]) {
                e.preventDefault();
                this._setDirection(dirKeys[k]);
            }
        }

        // Set the buffered next direction, preventing 180° reversals.
        _setDirection(name) {
            if (this.state !== "playing") return;
            const map = {
                up:    { x: 0, y: -1 },
                down:  { x: 0, y: 1 },
                left:  { x: -1, y: 0 },
                right: { x: 1, y: 0 },
            };
            const nd = map[name];
            if (!nd) return;
            // Disallow reversing directly into the snake's neck.
            if (nd.x === -this.dir.x && nd.y === -this.dir.y) return;
            // Only register if it's an actual change.
            if (nd.x !== this.nextDir.x || nd.y !== this.nextDir.y) {
                this.nextDir = nd;
                this.sfx.turn();
            }
        }

        /* ---------------- Game lifecycle ---------------- */
        start() {
            // Reset all runtime state for a fresh game.
            const cx = Math.floor(this.cols / 2);
            const cy = Math.floor(this.rows / 2);
            this.snake = [
                { x: cx,     y: cy },
                { x: cx - 1, y: cy },
                { x: cx - 2, y: cy },
            ];
            this.dir = { x: 1, y: 0 };
            this.nextDir = { x: 1, y: 0 };
            this.score = 0;
            this.foodEaten = 0;
            this.power = null;
            this.powerTimer = 0;
            this.particles = [];
            this.stepMs = this.baseStep;
            this.acc = 0;
            this.lastHeadPos = { ...this.snake[0] };
            this._spawnFood();

            this.state = "playing";
            this._showScreen(null);
            this._refreshHud();
            this.sfx.start();
        }

        togglePause() {
            if (this.state === "playing") {
                this.state = "paused";
                this._showScreen("pause");
            } else if (this.state === "paused") {
                this.state = "playing";
                this._showScreen(null);
                this.acc = 0; // avoid a big jump after resuming
            }
        }

        gameOver() {
            this.state = "over";
            this.sfx.gameOver();

            // Persist high score.
            let isNewBest = false;
            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem("snake.highScore", String(this.highScore));
                isNewBest = true;
            }

            this.el.finalScore.textContent = this.score;
            this.el.finalHigh.textContent = this.highScore;
            this.el.newBest.classList.toggle("hidden", !isNewBest);
            this._refreshHud();
            this._showScreen("over");
        }

        /* ---------------- Core step (logic) ---------------- */
        _step() {
            // Apply buffered direction at the step boundary.
            this.dir = this.nextDir;
            this.lastHeadPos = { ...this.snake[0] };

            const head = {
                x: this.snake[0].x + this.dir.x,
                y: this.snake[0].y + this.dir.y,
            };

            // Wall collision -> game over.
            if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
                return this.gameOver();
            }
            // Self collision -> game over (ignore the tail cell which will move).
            for (let i = 0; i < this.snake.length - 1; i++) {
                if (this.snake[i].x === head.x && this.snake[i].y === head.y) {
                    return this.gameOver();
                }
            }

            this.snake.unshift(head);

            // Power-up collision (bonus points, no extra length beyond normal).
            let grew = false;
            if (this.power && head.x === this.power.x && head.y === this.power.y) {
                this.score += 5;
                this.foodEaten += 1;
                this._burst(this.power, this.colors.power);
                this.sfx.power();
                this.power = null;
                this.powerTimer = 0;
                grew = true;
                this._afterEat();
            }

            // Normal food collision.
            if (this.food && head.x === this.food.x && head.y === this.food.y) {
                this.score += 1;
                this.foodEaten += 1;
                this._burst(this.food, this.colors.food);
                this.sfx.eat();
                this._spawnFood();
                grew = true;
                this._afterEat();
            }

            // If nothing eaten, drop the tail (snake moves without growing).
            if (!grew) this.snake.pop();

            // Power-up lifetime countdown.
            if (this.power) {
                this.powerTimer -= 1;
                if (this.powerTimer <= 0) this.power = null;
            } else if (Math.random() < 0.006) {
                // Occasionally spawn a power-up.
                this._spawnPower();
            }
        }

        // Shared handling after any food is eaten: speed, hud, achievements.
        _afterEat() {
            // Difficulty: speed up gradually, capped at minStep.
            this.stepMs = Math.max(this.minStep, this.baseStep - this.foodEaten * 3.5);
            this._refreshHud();
            this._checkAchievements();
        }

        /* ---------------- Food spawning ---------------- */
        _randomEmptyCell() {
            // Build a set of occupied cells for O(1) lookups.
            const occupied = new Set(this.snake.map((s) => s.x + "," + s.y));
            if (this.food) occupied.add(this.food.x + "," + this.food.y);
            if (this.power) occupied.add(this.power.x + "," + this.power.y);

            // If the board is essentially full, bail (win-ish edge case).
            if (occupied.size >= this.cols * this.rows) return null;

            let cell;
            do {
                cell = { x: (Math.random() * this.cols) | 0, y: (Math.random() * this.rows) | 0 };
            } while (occupied.has(cell.x + "," + cell.y));
            return cell;
        }

        _spawnFood() {
            const c = this._randomEmptyCell();
            if (c) this.food = c;
        }

        _spawnPower() {
            const c = this._randomEmptyCell();
            if (c) {
                this.power = c;
                this.powerTimer = 90; // ~lives for 90 steps
            }
        }

        /* ---------------- Particles ---------------- */
        _burst(cell, color) {
            const cx = (cell.x + 0.5) * this.cell;
            const cy = (cell.y + 0.5) * this.cell;
            const count = 14;
            for (let i = 0; i < count; i++) this.particles.push(new Particle(cx, cy, color));
        }

        /* ---------------- Achievements ---------------- */
        _checkAchievements() {
            const milestones = [
                { n: 10, label: "🍎 Snacker — 10 foods!" },
                { n: 25, label: "🐍 Hungry — 25 foods!" },
                { n: 50, label: "👑 Legend — 50 foods!" },
            ];
            for (const m of milestones) {
                if (this.foodEaten >= m.n && !this.achievementsHit.includes(m.n)) {
                    this.achievementsHit.push(m.n);
                    localStorage.setItem("snake.achievements", JSON.stringify(this.achievementsHit));
                    this._toast(m.label);
                    this.sfx.achievement();
                }
            }
        }

        _toast(msg) {
            const t = this.el.toast;
            t.textContent = msg;
            t.classList.add("show");
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
        }

        /* ---------------- HUD & screens ---------------- */
        _refreshHud() {
            this.el.score.textContent = this.score;
            this.el.highScore.textContent = this.highScore;
        }

        // which: "start" | "pause" | "over" | null (hide overlay)
        _showScreen(which) {
            const { overlay, startScreen, pauseScreen, gameOverScreen } = this.el;
            startScreen.classList.add("hidden");
            pauseScreen.classList.add("hidden");
            gameOverScreen.classList.add("hidden");

            if (which === null) { overlay.classList.add("hidden"); return; }
            overlay.classList.remove("hidden");
            if (which === "start") startScreen.classList.remove("hidden");
            if (which === "pause") pauseScreen.classList.remove("hidden");
            if (which === "over")  gameOverScreen.classList.remove("hidden");
        }

        _toggleSound() {
            this.sfx.enabled = !this.sfx.enabled;
            localStorage.setItem("snake.sound", this.sfx.enabled ? "on" : "off");
            this.el.soundToggle.textContent = this.sfx.enabled ? "🔊" : "🔇";
            this.el.soundToggle.classList.toggle("muted", !this.sfx.enabled);
            if (this.sfx.enabled) this.sfx.turn();
        }

        _toggleFullscreen() {
            const app = document.getElementById("app");
            if (!document.fullscreenElement) {
                (app.requestFullscreen || app.webkitRequestFullscreen || (() => {})).call(app);
            } else {
                (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
            }
        }

        /* ---------------- Main RAF loop ---------------- */
        _frame(now) {
            const dt = now - this.lastTime;
            this.lastTime = now;

            if (this.state === "playing") {
                this.acc += dt;
                // Run as many fixed logical steps as have accumulated.
                while (this.acc >= this.stepMs && this.state === "playing") {
                    this.acc -= this.stepMs;
                    this._step();
                }
            }

            // Particles update whenever there are any (even during game over).
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.update();
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            this._render();
            this.rafId = requestAnimationFrame((t) => this._frame(t));
        }

        /* ---------------- Rendering ---------------- */
        _render() {
            const ctx = this.ctx;
            const size = this.pxSize;

            // Clear / background.
            ctx.clearRect(0, 0, size, size);

            // Grid lines.
            ctx.strokeStyle = this.colors.grid;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 1; i < this.cols; i++) {
                const p = i * this.cell;
                ctx.moveTo(p, 0); ctx.lineTo(p, size);
                ctx.moveTo(0, p); ctx.lineTo(size, p);
            }
            ctx.stroke();

            // Interpolation factor for smooth motion between steps.
            const t = this.state === "playing"
                ? Math.min(1, this.acc / this.stepMs)
                : 1;

            // Food (pulsing).
            if (this.food) {
                const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
                this._drawCell(this.food.x, this.food.y, this.colors.food, 0.62 + pulse * 0.12, true);
            }

            // Power-up (star-ish glowing, blinks when about to expire).
            if (this.power) {
                const blink = this.powerTimer < 25 ? (Math.floor(performance.now() / 150) % 2 === 0) : true;
                if (blink) this._drawStar(this.power.x, this.power.y, this.colors.power);
            }

            // Snake body with a head-to-tail gradient feel.
            for (let i = this.snake.length - 1; i >= 0; i--) {
                const seg = this.snake[i];
                let dx = seg.x, dy = seg.y;

                // Interpolate the head from its previous cell for smoothness.
                if (i === 0 && this.lastHeadPos && this.state === "playing") {
                    dx = this.lastHeadPos.x + (seg.x - this.lastHeadPos.x) * t;
                    dy = this.lastHeadPos.y + (seg.y - this.lastHeadPos.y) * t;
                }

                const isHead = i === 0;
                const ratio = i / Math.max(1, this.snake.length);
                const color = isHead ? this.colors.snake
                                     : this._mix(this.colors.snake, this.colors.snake2, ratio);
                this._drawCellF(dx, dy, color, isHead ? 0.92 : 0.82, isHead);

                // Eyes on the head.
                if (isHead) this._drawEyes(dx, dy);
            }

            // Particles on top.
            for (const p of this.particles) {
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // Draw a rounded cell at integer grid coords.
        _drawCell(gx, gy, color, scale = 0.85, glow = false) {
            this._drawCellF(gx, gy, color, scale, glow);
        }

        // Draw a rounded cell at fractional coords (for interpolation).
        _drawCellF(gx, gy, color, scale = 0.85, glow = false) {
            const ctx = this.ctx;
            const s = this.cell * scale;
            const off = (this.cell - s) / 2;
            const x = gx * this.cell + off;
            const y = gy * this.cell + off;
            const r = Math.min(6, s * 0.28);

            if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
            ctx.fillStyle = color;
            this._roundRect(ctx, x, y, s, s, r);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        _drawEyes(gx, gy) {
            const ctx = this.ctx;
            const c = this.cell;
            const cx = gx * c + c / 2;
            const cy = gy * c + c / 2;
            const eo = c * 0.18;        // eye offset from center
            const er = Math.max(1.5, c * 0.08);
            // Offset eyes in the direction of travel.
            const ox = this.dir.x * c * 0.12;
            const oy = this.dir.y * c * 0.12;
            // Perpendicular spread.
            const px = this.dir.y !== 0 ? eo : 0;
            const py = this.dir.x !== 0 ? eo : 0;

            ctx.fillStyle = "#06121a";
            for (const sgn of [-1, 1]) {
                ctx.beginPath();
                ctx.arc(cx + ox + (px ? sgn * px : sgn * eo * (this.dir.x ? 0 : 1)),
                        cy + oy + (py ? sgn * py : sgn * eo * (this.dir.y ? 0 : 1)),
                        er, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        _drawStar(gx, gy, color) {
            const ctx = this.ctx;
            const c = this.cell;
            const cx = gx * c + c / 2;
            const cy = gy * c + c / 2;
            const spikes = 5;
            const outer = c * 0.42;
            const inner = c * 0.18;
            let rot = -Math.PI / 2;
            const step = Math.PI / spikes;

            ctx.shadowColor = color;
            ctx.shadowBlur = 16;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx, cy - outer);
            for (let i = 0; i < spikes; i++) {
                ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer); rot += step;
                ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
            }
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Rounded rectangle path helper (with fallback for old browsers).
        _roundRect(ctx, x, y, w, h, r) {
            if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        // Linear blend of two hex/rgb colors -> rgb string.
        _mix(a, b, t) {
            const pa = this._parseColor(a);
            const pb = this._parseColor(b);
            if (!pa || !pb) return a;
            const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
            const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
            const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
            return `rgb(${r},${g},${bl})`;
        }

        _parseColor(str) {
            str = str.trim();
            if (str.startsWith("#")) {
                let h = str.slice(1);
                if (h.length === 3) h = h.split("").map((c) => c + c).join("");
                const n = parseInt(h, 16);
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            }
            const m = str.match(/rgba?\(([^)]+)\)/);
            if (m) return m[1].split(",").map((v) => parseFloat(v));
            return null;
        }
    }

    // Boot once the DOM is ready.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => new SnakeGame());
    } else {
        new SnakeGame();
    }
})();
