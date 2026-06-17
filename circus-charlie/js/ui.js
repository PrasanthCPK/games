/* ============================================================
   ui.js — UI
   Renders the HUD and every menu/overlay onto the canvas. The UI is
   mostly stateless: the Game owns selection indices and passes the data
   each frame. Drawing helpers keep the retro arcade look consistent.
   ============================================================ */
(function () {
  "use strict";

  class UI {
    constructor(w, h) {
      this.w = w;
      this.h = h;
    }

    /* ---------------- HUD (in-game overlay) ---------------- */
    drawHUD(ctx, g) {
      ctx.save();
      // Top banner strip
      const grad = ctx.createLinearGradient(0, 0, 0, 46);
      grad.addColorStop(0, "rgba(10,0,26,0.85)");
      grad.addColorStop(1, "rgba(10,0,26,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, 56);

      Utils.pixelText(ctx, "SCORE", 16, 16, 13, "#ffd23f", "left");
      Utils.pixelText(ctx, String(g.score).padStart(7, "0"), 16, 34, 22, "#fff", "left");

      Utils.pixelText(ctx, "HI", this.w / 2, 16, 13, "#ffd23f", "center");
      Utils.pixelText(ctx, String(g.highScore).padStart(7, "0"), this.w / 2, 34, 18, "#fff", "center");

      // Lives (top hats)
      Utils.pixelText(ctx, "LIVES", this.w - 16, 16, 13, "#ffd23f", "right");
      for (let i = 0; i < g.lives; i++) {
        this._lifeIcon(ctx, this.w - 22 - i * 26, 34);
      }

      // Stage indicator
      Utils.pixelText(
        ctx,
        "STAGE " + g.stageIndex + " — " + g.currentStage.name,
        this.w / 2,
        this.h - 16,
        14,
        "#fff",
        "center"
      );

      // Combo meter (stage 1 / final)
      if (g.combo > 1) {
        Utils.pixelText(ctx, "COMBO x" + g.combo, this.w - 16, 56, 18, "#ff8c1a", "right");
      }

      // Stage-specific progress bar
      if (g.currentStage.progress != null) {
        const p = Utils.clamp(g.currentStage.progress, 0, 1);
        const bw = 220, bx = this.w / 2 - bw / 2, by = 48;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        Utils.roundRect(ctx, bx, by, bw, 8, 4);
        ctx.fill();
        ctx.fillStyle = "#3fd07f";
        Utils.roundRect(ctx, bx, by, bw * p, 8, 4);
        ctx.fill();
      }
      ctx.restore();
    }

    _lifeIcon(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#e23a3a";
      ctx.fillRect(-9, 4, 18, 3);
      ctx.fillRect(-6, -6, 12, 11);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(-6, 1, 12, 3);
      ctx.restore();
    }

    /* ---------------- Shared backdrop for menus ---------------- */
    _menuBackdrop(ctx, time, dim) {
      Sprites.background(ctx, this.w, this.h, time * 30, null, time);
      ctx.fillStyle = `rgba(8,0,26,${dim == null ? 0.55 : dim})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    _title(ctx, time) {
      const cx = this.w / 2;
      const bob = Math.sin(time * 2) * 6;
      ctx.save();
      ctx.translate(cx, 120 + bob);
      // Marquee bulbs
      for (let i = 0; i < 14; i++) {
        const on = Math.floor(time * 6 + i) % 2 === 0;
        ctx.fillStyle = on ? "#ffd23f" : "#7a5a10";
        const bx = -300 + i * 46;
        ctx.beginPath();
        ctx.arc(bx, -54, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      Utils.pixelText(ctx, "CIRCUS", 0, -14, 64, "#ffd23f");
      Utils.pixelText(ctx, "CHARLIE", 0, 44, 64, "#e23a3a");
      ctx.restore();
    }

    /** Draw a vertical menu list with the selected item highlighted. */
    _menuList(ctx, items, selected, startY, gap) {
      gap = gap || 46;
      for (let i = 0; i < items.length; i++) {
        const y = startY + i * gap;
        const sel = i === selected;
        if (sel) {
          const wgl = Math.sin(performance.now() / 150) * 4;
          ctx.fillStyle = "rgba(255,210,63,0.16)";
          Utils.roundRect(ctx, this.w / 2 - 170, y - 18, 340, 36, 8);
          ctx.fill();
          Utils.pixelText(ctx, "▶", this.w / 2 - 150 - wgl, y, 22, "#ffd23f", "center");
          Utils.pixelText(ctx, "◀", this.w / 2 + 150 + wgl, y, 22, "#ffd23f", "center");
        }
        Utils.pixelText(ctx, items[i], this.w / 2, y, sel ? 26 : 22, sel ? "#fff" : "#bbb");
      }
    }

    mainMenu(ctx, items, selected, time, muted) {
      this._menuBackdrop(ctx, time);
      this._title(ctx, time);
      // Reflect live mute state in the sound item label.
      const list = items.map((it) =>
        it === "SOUND" ? "SOUND: " + (muted ? "OFF" : "ON") : it
      );
      this._menuList(ctx, list, selected, 280);
      Utils.pixelText(
        ctx,
        "Arrows/Touch to choose · Space/Jump to select",
        this.w / 2,
        this.h - 28,
        14,
        "#888"
      );
    }

    controls(ctx, time) {
      this._menuBackdrop(ctx, time, 0.75);
      Utils.pixelText(ctx, "CONTROLS", this.w / 2, 70, 44, "#ffd23f");
      const lines = [
        ["MOVE LEFT", "← / A  ·  ◀ button"],
        ["MOVE RIGHT", "→ / D  ·  ▶ button"],
        ["JUMP", "SPACE / W / ↑  ·  JUMP button"],
        ["START / CONFIRM", "ENTER / Tap"],
        ["PAUSE", "P  ·  II button"],
      ];
      let y = 150;
      for (const [k, v] of lines) {
        Utils.pixelText(ctx, k, this.w / 2 - 30, y, 22, "#fff", "right");
        Utils.pixelText(ctx, v, this.w / 2 + 30, y, 20, "#3fd07f", "left");
        y += 50;
      }
      Utils.pixelText(ctx, "Press Jump / Tap to go back", this.w / 2, this.h - 36, 16, "#ffd23f");
    }

    highScores(ctx, scores, time) {
      this._menuBackdrop(ctx, time, 0.75);
      Utils.pixelText(ctx, "HIGH SCORES", this.w / 2, 70, 44, "#ffd23f");
      if (!scores.length) {
        Utils.pixelText(ctx, "No scores yet — be the first!", this.w / 2, 240, 22, "#fff");
      } else {
        let y = 150;
        scores.forEach((s, i) => {
          const c = i === 0 ? "#ffd23f" : "#fff";
          Utils.pixelText(ctx, (i + 1) + ".", this.w / 2 - 150, y, 24, c, "left");
          Utils.pixelText(ctx, String(s).padStart(7, "0"), this.w / 2 + 150, y, 24, c, "right");
          y += 44;
        });
      }
      Utils.pixelText(ctx, "Press Jump / Tap to go back", this.w / 2, this.h - 36, 16, "#ffd23f");
    }

    pause(ctx, items, selected, time) {
      ctx.fillStyle = "rgba(8,0,26,0.7)";
      ctx.fillRect(0, 0, this.w, this.h);
      Utils.pixelText(ctx, "PAUSED", this.w / 2, 130, 52, "#ffd23f");
      this._menuList(ctx, items, selected, 250);
    }

    gameOver(ctx, g, time, isNewHigh, won) {
      this._menuBackdrop(ctx, time, 0.7);
      if (won) {
        Utils.pixelText(ctx, "YOU WIN!", this.w / 2, 120, 60, "#3fd07f");
        Utils.pixelText(ctx, "★ Charlie cleared the whole circus! ★", this.w / 2, 168, 18, "#ffd23f");
      } else {
        Utils.pixelText(ctx, "GAME OVER", this.w / 2, 120, 60, "#e23a3a");
      }
      Utils.pixelText(ctx, "FINAL SCORE", this.w / 2, 210, 20, "#ffd23f");
      Utils.pixelText(ctx, String(g.score).padStart(7, "0"), this.w / 2, 246, 36, "#fff");
      if (isNewHigh) {
        const blink = Math.floor(time * 4) % 2 === 0;
        if (blink) Utils.pixelText(ctx, "★ NEW HIGH SCORE! ★", this.w / 2, 296, 24, "#ffd23f");
      } else {
        Utils.pixelText(ctx, "HIGH " + String(g.highScore).padStart(7, "0"), this.w / 2, 296, 20, "#bbb");
      }
      this._menuList(ctx, ["RESTART", "MAIN MENU"], g.menuIndex, 360);
    }

    stageComplete(ctx, g, data, time) {
      this._menuBackdrop(ctx, time, 0.7);
      Utils.pixelText(ctx, "STAGE CLEAR!", this.w / 2, 90, 52, "#3fd07f");
      Utils.pixelText(ctx, "Stage " + data.stage + " — " + data.name, this.w / 2, 140, 20, "#fff");

      // Animated tally rows reveal one by one.
      const rows = [
        ["TIME / CLEAR BONUS", "+" + data.clearBonus],
        ["ACCURACY", data.accuracy + "%"],
        ["ACCURACY BONUS", "+" + data.accuracyBonus],
        ["LIVES BONUS", "+" + data.livesBonus],
      ];
      let y = 200;
      const reveal = Math.floor(data.revealT * 2);
      for (let i = 0; i < rows.length; i++) {
        if (i > reveal) break;
        Utils.pixelText(ctx, rows[i][0], this.w / 2 - 30, y, 20, "#ffd23f", "right");
        Utils.pixelText(ctx, rows[i][1], this.w / 2 + 30, y, 20, "#fff", "left");
        y += 40;
      }
      if (reveal >= rows.length) {
        Utils.pixelText(ctx, "TOTAL SCORE  " + String(g.score).padStart(7, "0"), this.w / 2, y + 16, 24, "#fff");
        const blink = Math.floor(time * 3) % 2 === 0;
        if (blink)
          Utils.pixelText(ctx, "Press Jump / Tap for Next Stage ▶", this.w / 2, this.h - 40, 18, "#3fd07f");
      }
    }

    /** Full-screen "Stage N" intro card. t is 0..1 progress. */
    stageIntro(ctx, num, name, t) {
      const slide = Utils.easeInOut(Utils.clamp(t * 2, 0, 1));
      ctx.fillStyle = "#08001a";
      ctx.fillRect(0, 0, this.w, this.h);
      // Decorative curtains sliding apart near the end
      const open = Utils.clamp((t - 0.6) / 0.4, 0, 1);
      ctx.fillStyle = "#7a1020";
      const curtainW = this.w / 2 * (1 - open);
      ctx.fillRect(0, 0, curtainW, this.h);
      ctx.fillRect(this.w - curtainW, 0, curtainW, this.h);

      const cy = Utils.lerp(-60, this.h / 2, slide);
      Utils.pixelText(ctx, "STAGE " + num, this.w / 2, cy - 30, 60, "#ffd23f");
      Utils.pixelText(ctx, name, this.w / 2, cy + 30, 34, "#fff");
    }
  }

  window.UI = UI;
})();
