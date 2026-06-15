/* ============================================================
   Flappy Bird — vanilla HTML5 Canvas clone
   ------------------------------------------------------------
   Classes:
     SoundManager   — Web Audio synthesized SFX
     ParticleSystem — flap particles
     Bird           — player, physics & wing animation
     Pipe           — single obstacle pair
     Game           — orchestrates everything (loop, state, UI)
   ============================================================ */
(() => {
    'use strict';

    /* Logical resolution. The canvas is scaled to fit the
       container while rendering happens at this fixed size so
       gameplay feels identical on every device. */
    const GAME_WIDTH = 480;
    const GAME_HEIGHT = 800;
    const GROUND_HEIGHT = 96;

    /* ========================================================
       SoundManager — generates all SFX with the Web Audio API.
       No external files required.
       ======================================================== */
    class SoundManager {
        constructor() {
            this.ctx = null;
            this.enabled = true;
        }

        // The audio context must be created/resumed after a user
        // gesture (browser autoplay policy).
        init() {
            if (this.ctx) {
                if (this.ctx.state === 'suspended') this.ctx.resume();
                return;
            }
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }

        // Play a simple oscillator tone with an envelope.
        _tone(freq, duration, type = 'square', startGain = 0.15, freqEnd = null) {
            if (!this.ctx || !this.enabled) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            if (freqEnd !== null) {
                osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
            }

            gain.gain.setValueAtTime(startGain, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(gain).connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + duration);
        }

        flap()  { this._tone(520, 0.12, 'square', 0.12, 360); }
        score() { this._tone(660, 0.10, 'sine', 0.18); this._tone(880, 0.12, 'sine', 0.16); }
        hit() {
            this._tone(200, 0.18, 'sawtooth', 0.25, 80);
            this._tone(120, 0.35, 'square', 0.2, 50);
        }
    }

    /* ========================================================
       ParticleSystem — lightweight particles for flap bursts.
       ======================================================== */
    class ParticleSystem {
        constructor() {
            this.particles = [];
        }

        // Spawn a small burst at (x, y).
        emit(x, y, count = 6) {
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x, y,
                    vx: -Math.random() * 2 - 0.5,
                    vy: (Math.random() - 0.5) * 2.5,
                    life: 1,
                    size: Math.random() * 3 + 2,
                    hue: 45 + Math.random() * 15
                });
            }
        }

        update() {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.06;          // slight gravity on particles
                p.life -= 0.03;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }

        draw(ctx) {
            for (const p of this.particles) {
                ctx.globalAlpha = Math.max(p.life, 0);
                ctx.fillStyle = `hsl(${p.hue}, 90%, 60%)`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        clear() { this.particles.length = 0; }
    }

    /* ========================================================
       Bird — player character with gravity & wing animation.
       ======================================================== */
    class Bird {
        constructor() {
            this.radius = 17;
            this.reset();
            this.wingPhase = 0;
        }

        reset() {
            this.x = GAME_WIDTH * 0.28;
            this.y = GAME_HEIGHT * 0.45;
            this.velocity = 0;
            this.rotation = 0;
        }

        flap() {
            this.velocity = this.flapStrength;
        }

        // Tunable physics constants.
        get gravity()      { return 0.5; }
        get flapStrength() { return -8.4; }

        update() {
            this.velocity += this.gravity;
            this.y += this.velocity;

            // Rotate toward velocity direction for a natural feel.
            const target = Math.max(-0.5, Math.min(this.velocity * 0.06, 1.4));
            this.rotation += (target - this.rotation) * 0.18;

            // Advance wing flapping animation.
            this.wingPhase += 0.3;
        }

        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);

            // Body
            ctx.fillStyle = '#ffd93d';
            ctx.strokeStyle = '#c4790f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.radius + 3, this.radius, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Wing — flaps up & down using a sine wave
            const wingY = Math.sin(this.wingPhase) * 6;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#c4790f';
            ctx.beginPath();
            ctx.ellipse(-4, 2 + wingY, 9, 6, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Eye
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(9, -6, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(11, -6, 3, 0, Math.PI * 2);
            ctx.fill();

            // Beak
            ctx.fillStyle = '#ff8c00';
            ctx.beginPath();
            ctx.moveTo(this.radius + 2, -2);
            ctx.lineTo(this.radius + 14, 1);
            ctx.lineTo(this.radius + 2, 5);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        // Circle vs ground/ceiling check.
        get top()    { return this.y - this.radius; }
        get bottom() { return this.y + this.radius; }
    }

    /* ========================================================
       Pipe — one top/bottom obstacle pair with a gap.
       ======================================================== */
    class Pipe {
        constructor(x, gapY, gapSize, speed) {
            this.x = x;
            this.width = 70;
            this.gapY = gapY;          // vertical center of the gap
            this.gapSize = gapSize;
            this.speed = speed;
            this.passed = false;       // has the bird scored on this pipe?
        }

        update() {
            this.x -= this.speed;
        }

        get gapTop()    { return this.gapY - this.gapSize / 2; }
        get gapBottom() { return this.gapY + this.gapSize / 2; }
        get right()     { return this.x + this.width; }
        get offscreen() { return this.right < 0; }

        draw(ctx) {
            const capHeight = 26;
            const capOverhang = 4;

            const drawSegment = (y, h, capAtBottom) => {
                // Pipe body with a vertical gradient for depth
                const grad = ctx.createLinearGradient(this.x, 0, this.x + this.width, 0);
                grad.addColorStop(0, '#5ea832');
                grad.addColorStop(0.4, '#7ed957');
                grad.addColorStop(0.6, '#7ed957');
                grad.addColorStop(1, '#4a8a28');
                ctx.fillStyle = grad;
                ctx.fillRect(this.x, y, this.width, h);

                ctx.strokeStyle = '#3a6b1e';
                ctx.lineWidth = 2;
                ctx.strokeRect(this.x, y, this.width, h);

                // Cap
                const capY = capAtBottom ? y : y + h - capHeight;
                ctx.fillStyle = grad;
                ctx.fillRect(this.x - capOverhang, capY, this.width + capOverhang * 2, capHeight);
                ctx.strokeRect(this.x - capOverhang, capY, this.width + capOverhang * 2, capHeight);
            };

            // Top pipe (cap at its bottom edge)
            drawSegment(0, this.gapTop, false);
            // Bottom pipe (cap at its top edge)
            drawSegment(this.gapBottom, GAME_HEIGHT - GROUND_HEIGHT - this.gapBottom, true);
        }

        // Collision against the bird (treated as a circle).
        collides(bird) {
            // Not horizontally overlapping the pipe column.
            if (bird.x + bird.radius < this.x || bird.x - bird.radius > this.right) {
                return false;
            }
            // Within the gap vertically -> safe.
            if (bird.top > this.gapTop && bird.bottom < this.gapBottom) {
                return false;
            }
            return true;
        }
    }

    /* ========================================================
       Game — main controller: state, loop, input, rendering.
       ======================================================== */
    class Game {
        constructor() {
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.canvas.width = GAME_WIDTH;
            this.canvas.height = GAME_HEIGHT;

            this.sound = new SoundManager();
            this.particles = new ParticleSystem();
            this.bird = new Bird();

            this.state = 'start';      // start | playing | paused | gameover
            this.pipes = [];
            this.score = 0;
            this.best = Number(localStorage.getItem('flappyBest') || 0);

            // Difficulty / spawning
            this.frame = 0;
            this.bgOffset = 0;         // parallax scroll offset
            this.groundOffset = 0;
            this.timeOfDay = 0;        // 0..1 day/night cycle
            this.shake = 0;            // screen-shake magnitude

            this._cacheDom();
            this._bindEvents();
            this._showStart();

            // Kick off the render loop immediately (animated menu).
            this.lastTime = performance.now();
            requestAnimationFrame(this._loop.bind(this));
        }

        _cacheDom() {
            this.dom = {
                hud:          document.getElementById('hud'),
                currentScore: document.getElementById('current-score'),
                startScreen:  document.getElementById('start-screen'),
                startBest:    document.getElementById('start-best'),
                startBtn:     document.getElementById('start-button'),
                gameoverScreen: document.getElementById('gameover-screen'),
                finalScore:   document.getElementById('final-score'),
                bestScore:    document.getElementById('best-score'),
                newBest:      document.getElementById('new-best'),
                restartBtn:   document.getElementById('restart-button'),
                pauseScreen:  document.getElementById('pause-screen'),
            };
        }

        /* ---------------- Input handling ---------------- */
        _bindEvents() {
            // Keyboard
            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space' || e.code === 'ArrowUp') {
                    e.preventDefault();
                    this._onFlapInput();
                } else if (e.code === 'KeyP') {
                    this.togglePause();
                }
            });

            // Pointer (mouse + touch unified). Ignore clicks on buttons.
            const pointerHandler = (e) => {
                if (e.target.closest('.btn')) return;
                e.preventDefault();
                this._onFlapInput();
            };
            this.canvas.addEventListener('mousedown', pointerHandler);
            this.canvas.addEventListener('touchstart', pointerHandler, { passive: false });

            // Buttons
            this.dom.startBtn.addEventListener('click', () => this.start());
            this.dom.restartBtn.addEventListener('click', () => this.start());
        }

        // A flap input either starts the game or flaps the bird.
        _onFlapInput() {
            this.sound.init();
            if (this.state === 'start') {
                this.start();
            } else if (this.state === 'playing') {
                this.bird.flap();
                this.particles.emit(this.bird.x - 6, this.bird.y + 6);
                this.sound.flap();
            } else if (this.state === 'paused') {
                this.togglePause();
            }
        }

        /* ---------------- State transitions ---------------- */
        _showStart() {
            this.state = 'start';
            this.dom.startBest.textContent = this.best;
            this.dom.startScreen.classList.remove('hidden');
            this.dom.gameoverScreen.classList.add('hidden');
            this.dom.pauseScreen.classList.add('hidden');
            this.dom.hud.classList.add('hidden');
        }

        start() {
            this.sound.init();
            this.bird.reset();
            this.particles.clear();
            this.pipes = [];
            this.score = 0;
            this.frame = 0;
            this.shake = 0;
            this.dom.currentScore.textContent = '0';

            this.state = 'playing';
            this.dom.startScreen.classList.add('hidden');
            this.dom.gameoverScreen.classList.add('hidden');
            this.dom.pauseScreen.classList.add('hidden');
            this.dom.hud.classList.remove('hidden');
        }

        togglePause() {
            if (this.state === 'playing') {
                this.state = 'paused';
                this.dom.pauseScreen.classList.remove('hidden');
            } else if (this.state === 'paused') {
                this.state = 'playing';
                this.dom.pauseScreen.classList.add('hidden');
            }
        }

        gameOver() {
            this.state = 'gameover';
            this.sound.hit();
            this.shake = 14;           // trigger screen shake

            const isNewBest = this.score > this.best;
            if (isNewBest) {
                this.best = this.score;
                localStorage.setItem('flappyBest', String(this.best));
            }

            this.dom.finalScore.textContent = this.score;
            this.dom.bestScore.textContent = this.best;
            this.dom.newBest.classList.toggle('hidden', !isNewBest);
            this.dom.hud.classList.add('hidden');

            // Brief delay so the hit feels impactful before overlay.
            setTimeout(() => {
                if (this.state === 'gameover') {
                    this.dom.gameoverScreen.classList.remove('hidden');
                }
            }, 350);
        }

        /* ---------------- Difficulty scaling ---------------- */
        // Pipe speed and gap size scale with the current score so
        // the game gradually gets harder.
        get pipeSpeed() {
            return 2.6 + Math.min(this.score * 0.05, 2.2);
        }
        get gapSize() {
            return Math.max(150, 210 - this.score * 2);
        }
        get spawnInterval() {
            return Math.max(80, 110 - this.score);
        }

        _spawnPipe() {
            const margin = 90;
            const playable = GAME_HEIGHT - GROUND_HEIGHT;
            const gap = this.gapSize;
            const gapY = margin + Math.random() * (playable - gap - margin * 2) + gap / 2;
            this.pipes.push(new Pipe(GAME_WIDTH, gapY, gap, this.pipeSpeed));
        }

        /* ---------------- Update ---------------- */
        update() {
            // Always-animated background elements (also on menus).
            this.bgOffset = (this.bgOffset + 0.4) % GAME_WIDTH;
            this.timeOfDay = (this.timeOfDay + 0.0004) % 1;

            if (this.shake > 0) this.shake *= 0.9;
            if (this.shake < 0.5) this.shake = 0;

            this.particles.update();

            if (this.state !== 'playing') {
                // On menus the bird gently bobs for life.
                if (this.state === 'start') {
                    this.bird.y = GAME_HEIGHT * 0.45 + Math.sin(this.frame * 0.05) * 12;
                    this.bird.wingPhase += 0.3;
                    this.frame++;
                }
                return;
            }

            this.frame++;
            this.groundOffset = (this.groundOffset + this.pipeSpeed) % 48;

            this.bird.update();

            // Spawn pipes on an interval that tightens with score.
            if (this.frame % Math.round(this.spawnInterval) === 0) {
                this._spawnPipe();
            }

            // Update pipes, scoring & cleanup.
            for (let i = this.pipes.length - 1; i >= 0; i--) {
                const pipe = this.pipes[i];
                pipe.update();

                // Score when the bird fully clears a pipe.
                if (!pipe.passed && pipe.right < this.bird.x - this.bird.radius) {
                    pipe.passed = true;
                    this.score++;
                    this.dom.currentScore.textContent = this.score;
                    this.sound.score();
                }

                if (pipe.collides(this.bird)) {
                    this.gameOver();
                    return;
                }

                if (pipe.offscreen) this.pipes.splice(i, 1);
            }

            // Ground & ceiling collisions.
            if (this.bird.bottom >= GAME_HEIGHT - GROUND_HEIGHT) {
                this.bird.y = GAME_HEIGHT - GROUND_HEIGHT - this.bird.radius;
                this.gameOver();
                return;
            }
            if (this.bird.top <= 0) {
                this.bird.y = this.bird.radius;
                this.bird.velocity = 0;
            }
        }

        /* ---------------- Rendering ---------------- */
        draw() {
            const ctx = this.ctx;

            ctx.save();
            // Apply screen shake.
            if (this.shake > 0) {
                ctx.translate(
                    (Math.random() - 0.5) * this.shake,
                    (Math.random() - 0.5) * this.shake
                );
            }

            this._drawBackground(ctx);

            // Pipes
            for (const pipe of this.pipes) pipe.draw(ctx);

            this._drawGround(ctx);

            this.particles.draw(ctx);
            this.bird.draw(ctx);

            ctx.restore();
        }

        // Sky + parallax hills/clouds with a day/night colour cycle.
        _drawBackground(ctx) {
            // Day/night blend: interpolate sky colours via a sine.
            const t = (Math.sin(this.timeOfDay * Math.PI * 2) + 1) / 2; // 0=night 1=day
            const top = this._mix([12, 16, 48], [110, 197, 233], t);
            const bottom = this._mix([40, 40, 90], [196, 229, 240], t);

            const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
            grad.addColorStop(0, `rgb(${top.join(',')})`);
            grad.addColorStop(1, `rgb(${bottom.join(',')})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

            // Sun / moon crossing the sky.
            const celestialX = GAME_WIDTH * 0.75;
            const celestialY = 120 - t * 40;
            if (t > 0.4) {
                ctx.globalAlpha = (t - 0.4) / 0.6;
                ctx.fillStyle = '#fff3b0';
                ctx.beginPath();
                ctx.arc(celestialX, celestialY, 38, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.globalAlpha = (0.4 - t) / 0.4;
                ctx.fillStyle = '#f5f5f5';
                ctx.beginPath();
                ctx.arc(celestialX, celestialY, 30, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            // Parallax clouds (two layers at different speeds).
            this._drawClouds(ctx, this.bgOffset * 0.5, 0.6, 140);
            this._drawClouds(ctx, this.bgOffset, 1, 240);

            // Parallax hills near the bottom.
            ctx.fillStyle = `rgba(${this._mix([20,40,30],[120,190,90],t).join(',')}, 1)`;
            const hillBase = GAME_HEIGHT - GROUND_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(0, hillBase);
            for (let x = 0; x <= GAME_WIDTH; x += 10) {
                const y = hillBase - 60 - Math.sin((x + this.bgOffset * 0.7) * 0.02) * 40;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(GAME_WIDTH, hillBase);
            ctx.closePath();
            ctx.fill();
        }

        _drawClouds(ctx, offset, alpha, y) {
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillStyle = '#ffffff';
            const spacing = 200;
            for (let i = -1; i < GAME_WIDTH / spacing + 2; i++) {
                const x = ((i * spacing - offset) % (GAME_WIDTH + spacing) + GAME_WIDTH + spacing)
                          % (GAME_WIDTH + spacing) - spacing / 2;
                ctx.beginPath();
                ctx.arc(x, y, 22, 0, Math.PI * 2);
                ctx.arc(x + 24, y + 6, 18, 0, Math.PI * 2);
                ctx.arc(x - 24, y + 6, 18, 0, Math.PI * 2);
                ctx.arc(x, y + 12, 26, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        _drawGround(ctx) {
            const y = GAME_HEIGHT - GROUND_HEIGHT;

            // Dirt base
            ctx.fillStyle = '#ded895';
            ctx.fillRect(0, y, GAME_WIDTH, GROUND_HEIGHT);

            // Grass strip
            ctx.fillStyle = '#7ed957';
            ctx.fillRect(0, y, GAME_WIDTH, 18);
            ctx.fillStyle = '#5ea832';
            ctx.fillRect(0, y + 18, GAME_WIDTH, 5);

            // Scrolling dirt texture stripes for motion feedback.
            ctx.fillStyle = '#cfc77f';
            for (let x = -48; x < GAME_WIDTH + 48; x += 48) {
                ctx.beginPath();
                ctx.moveTo(x - this.groundOffset, y + 30);
                ctx.lineTo(x - this.groundOffset + 24, y + 30);
                ctx.lineTo(x - this.groundOffset + 12, y + 50);
                ctx.closePath();
                ctx.fill();
            }
        }

        // Linear interpolate two [r,g,b] colours.
        _mix(a, b, t) {
            return a.map((v, i) => Math.round(v + (b[i] - v) * t));
        }

        /* ---------------- Main loop ---------------- */
        // Uses requestAnimationFrame with a fixed-timestep accumulator
        // so physics stay consistent at ~60 updates/sec regardless of
        // the display refresh rate.
        _loop(now) {
            const STEP = 1000 / 60;
            let delta = now - this.lastTime;
            this.lastTime = now;
            // Avoid spiral-of-death after a tab is backgrounded.
            if (delta > 250) delta = STEP;

            this._accumulator = (this._accumulator || 0) + delta;
            while (this._accumulator >= STEP) {
                this.update();
                this._accumulator -= STEP;
            }

            this.draw();
            requestAnimationFrame(this._loop.bind(this));
        }
    }

    // Boot once the DOM is ready.
    window.addEventListener('DOMContentLoaded', () => new Game());
})();
