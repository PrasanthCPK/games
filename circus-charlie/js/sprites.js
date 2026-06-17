/* ============================================================
   sprites.js — Sprites
   Procedural draw routines for every circus element (mounts, obstacles,
   props) plus the layered parallax background. Keeping all the drawing
   in one place keeps the stage classes focused on logic.
   All draw calls expect SCREEN coordinates (camera already applied).
   ============================================================ */
(function () {
  "use strict";

  const Sprites = {
    /* ---------------- Background ----------------
       Draws a circus-tent interior with parallax layers: sky gradient,
       distant tents, audience stands, spotlights and a sawdust floor.
       `scroll` is the camera x; layers move at fractions of it. */
    background(ctx, w, h, scroll, theme, time) {
      theme = theme || {};
      const top = theme.top || "#3a1a5a";
      const bottom = theme.bottom || "#16002b";

      // Sky / tent ceiling gradient
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Tent ceiling stripes radiating from top-center
      ctx.save();
      ctx.globalAlpha = 0.18;
      const cx = w / 2;
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? "#e23a3a" : "#ffd23f";
        ctx.beginPath();
        ctx.moveTo(cx, -40);
        ctx.lineTo((i / 16) * w * 1.4 - w * 0.2, h * 0.55);
        ctx.lineTo(((i + 1) / 16) * w * 1.4 - w * 0.2, h * 0.55);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Moving spotlights
      Sprites._spotlights(ctx, w, h, time);

      // Distant tents (parallax 0.2)
      const px = -(scroll * 0.2) % 480;
      for (let i = -1; i < w / 480 + 2; i++) {
        Sprites._tent(ctx, px + i * 480, h * 0.52, 220, 110);
      }

      // Audience stand (parallax 0.4)
      Sprites._audience(ctx, w, h, scroll * 0.4, time);
    },

    _spotlights(ctx, w, h, time) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const beams = 3;
      for (let i = 0; i < beams; i++) {
        const sx = w * (0.2 + 0.3 * i) + Math.sin(time * 0.5 + i) * 80;
        const grad = ctx.createLinearGradient(sx, 0, sx, h * 0.7);
        grad.addColorStop(0, "rgba(255,255,210,0.18)");
        grad.addColorStop(1, "rgba(255,255,210,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx - 70, h * 0.7);
        ctx.lineTo(sx + 70, h * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },

    _tent(ctx, x, baseY, tw, th) {
      // Body
      ctx.fillStyle = "#c92a2a";
      ctx.fillRect(x - tw / 2, baseY - th * 0.4, tw, th * 0.4);
      // Stripes
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 6; i++) {
        if (i % 2 === 0)
          ctx.fillRect(x - tw / 2 + (i / 6) * tw, baseY - th * 0.4, tw / 6, th * 0.4);
      }
      // Roof
      ctx.fillStyle = "#e23a3a";
      ctx.beginPath();
      ctx.moveTo(x - tw / 2 - 8, baseY - th * 0.4);
      ctx.lineTo(x, baseY - th);
      ctx.lineTo(x + tw / 2 + 8, baseY - th * 0.4);
      ctx.closePath();
      ctx.fill();
      // Flag
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(x - 1, baseY - th - 16, 2, 16);
      ctx.fillRect(x + 1, baseY - th - 16, 12, 7);
    },

    _audience(ctx, w, h, scroll, time) {
      const standY = h * 0.5;
      ctx.fillStyle = "#2a1240";
      ctx.fillRect(0, standY, w, h * 0.12);
      const colors = ["#e23a3a", "#ffd23f", "#2b6cff", "#3fd07f", "#ff6bd0", "#ff8c1a"];
      const spacing = 26;
      const off = -(scroll % spacing);
      for (let i = -1; i < w / spacing + 1; i++) {
        const x = off + i * spacing + 12;
        const idx = Math.abs(Math.floor((i + scroll / spacing))) % colors.length;
        const bob = Math.sin(time * 4 + i) * 1.5;
        // head
        ctx.fillStyle = "#f0b890";
        ctx.fillRect(x, standY + 6 + bob, 8, 8);
        // body
        ctx.fillStyle = colors[idx];
        ctx.fillRect(x - 1, standY + 13 + bob, 10, 10);
      }
    },

    /** Sawdust performance floor used by ground-based stages. */
    floor(ctx, w, h, floorY, scroll) {
      ctx.fillStyle = "#c79a5b";
      ctx.fillRect(0, floorY, w, h - floorY);
      ctx.fillStyle = "#b3863f";
      const off = -(scroll % 40);
      for (let x = off; x < w; x += 40) {
        ctx.fillRect(x, floorY, 20, 6);
      }
      // Ring border line
      ctx.fillStyle = "#8a5a2b";
      ctx.fillRect(0, floorY - 4, w, 4);
    },

    /* ---------------- Lion ---------------- */
    lion(ctx, x, y, time, running) {
      const bob = running ? Math.sin(time * 14) * 2 : 0;
      ctx.save();
      ctx.translate(x, y + bob);
      // Tail
      ctx.strokeStyle = "#c97f1a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-34, -28);
      ctx.quadraticCurveTo(-52, -34 + Math.sin(time * 10) * 4, -50, -16);
      ctx.stroke();
      ctx.fillStyle = "#8a4a00";
      ctx.beginPath();
      ctx.arc(-50, -14, 4, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.fillStyle = "#e8a33d";
      ctx.fillRect(-36, -34, 60, 26);
      // Legs (gallop)
      ctx.fillStyle = "#d98f28";
      const ph = Math.sin(time * 14);
      ctx.fillRect(-30, -10, 7, 12 + ph * 3);
      ctx.fillRect(14, -10, 7, 12 - ph * 3);
      ctx.fillRect(-18, -10, 7, 12 - ph * 3);
      ctx.fillRect(2, -10, 7, 12 + ph * 3);
      // Head + mane
      ctx.fillStyle = "#a85e10";
      ctx.beginPath();
      ctx.arc(30, -34, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0b850";
      ctx.fillRect(24, -40, 18, 18);
      // Face
      ctx.fillStyle = "#222";
      ctx.fillRect(38, -36, 3, 3);
      ctx.fillRect(40, -28, 4, 3);
      ctx.restore();
    },

    /* ---------------- Horse ---------------- */
    horse(ctx, x, y, time) {
      ctx.save();
      ctx.translate(x, y);
      const ph = Math.sin(time * 18);
      // Tail
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-36, -30);
      ctx.quadraticCurveTo(-52, -20, -48, -2);
      ctx.stroke();
      // Body
      ctx.fillStyle = "#7a4a1e";
      ctx.fillRect(-38, -36, 62, 24);
      // Legs
      ctx.fillStyle = "#5e3815";
      ctx.fillRect(-30, -12, 7, 14 + ph * 4);
      ctx.fillRect(16, -12, 7, 14 - ph * 4);
      ctx.fillRect(-16, -12, 7, 14 - ph * 4);
      ctx.fillRect(2, -12, 7, 14 + ph * 4);
      // Neck + head
      ctx.fillStyle = "#7a4a1e";
      ctx.fillRect(20, -52, 12, 24);
      ctx.fillRect(28, -56, 18, 12);
      // Mane
      ctx.fillStyle = "#3a2410";
      ctx.fillRect(18, -54, 6, 26);
      // Eye
      ctx.fillStyle = "#111";
      ctx.fillRect(40, -52, 3, 3);
      ctx.restore();
    },

    /* ---------------- Flaming hoop ----------------
       Drawn as a ring with an opening band (the safe pass-through).
       `openY` and `openH` describe the safe band relative to hoop center. */
    hoop(ctx, x, cy, radius, time, particles, worldX, worldY) {
      ctx.save();
      // Stand
      ctx.fillStyle = "#7a4a1e";
      ctx.fillRect(x - 4, cy, 8, radius + 30);
      ctx.fillStyle = "#5e3815";
      ctx.fillRect(x - 16, cy + radius + 26, 32, 6);

      // Ring of fire
      const segs = 22;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const flick = 4 + Math.sin(time * 12 + i) * 3;
        const rx = x + Math.cos(a) * radius;
        const ry = cy + Math.sin(a) * radius;
        ctx.fillStyle = i % 2 ? "#ff8c1a" : "#ffd23f";
        ctx.beginPath();
        ctx.arc(rx, ry, 6 + flick * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e23a3a";
        ctx.beginPath();
        ctx.arc(rx, ry, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Inner ring
      ctx.strokeStyle = "#a85e10";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, cy, radius - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Emit fire particles occasionally in world space
      if (particles && Math.random() < 0.5) {
        const a = Utils.rand(0, Math.PI * 2);
        particles.fire(worldX + Math.cos(a) * radius, worldY + Math.sin(a) * radius, 1);
      }
    },

    /* ---------------- Monkey ---------------- */
    monkey(ctx, x, y, time) {
      ctx.save();
      ctx.translate(x, y);
      const hop = Math.abs(Math.sin(time * 10)) * 4;
      ctx.translate(0, -hop);
      // Body
      ctx.fillStyle = "#6b4226";
      ctx.fillRect(-9, -20, 18, 18);
      // Belly
      ctx.fillStyle = "#caa472";
      ctx.fillRect(-5, -16, 10, 12);
      // Head
      ctx.fillStyle = "#6b4226";
      ctx.beginPath();
      ctx.arc(0, -26, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#caa472";
      ctx.fillRect(-5, -26, 10, 7);
      // Eyes
      ctx.fillStyle = "#111";
      ctx.fillRect(-4, -28, 2, 2);
      ctx.fillRect(2, -28, 2, 2);
      // Ears
      ctx.fillStyle = "#6b4226";
      ctx.beginPath();
      ctx.arc(-9, -27, 3, 0, Math.PI * 2);
      ctx.arc(9, -27, 3, 0, Math.PI * 2);
      ctx.fill();
      // Arms
      ctx.fillStyle = "#5a3620";
      ctx.fillRect(-13, -18 - hop, 5, 10);
      ctx.fillRect(8, -18 - hop, 5, 10);
      // Legs
      ctx.fillRect(-7, -4, 5, 6);
      ctx.fillRect(2, -4, 5, 6);
      ctx.restore();
    },

    /* ---------------- Bird ---------------- */
    bird(ctx, x, y, time) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#222";
      ctx.fillRect(-6, -3, 12, 6);
      // Head/beak
      ctx.fillStyle = "#333";
      ctx.fillRect(6, -4, 5, 5);
      ctx.fillStyle = "#ffaa00";
      ctx.fillRect(11, -2, 4, 2);
      // Wings flap
      const flap = Math.sin(time * 18) * 8;
      ctx.fillStyle = "#444";
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(-14, -2 - flap);
      ctx.lineTo(-4, 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.lineTo(-8, -2 - flap);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    /* ---------------- Balloon ---------------- */
    balloon(ctx, x, y, color, time) {
      const bob = Math.sin(time * 3 + x) * 3;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.ellipse(-3, -4, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Knot + string
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-3, 13);
      ctx.lineTo(3, 13);
      ctx.lineTo(0, 17);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 17);
      ctx.quadraticCurveTo(4, 24, 0, 30);
      ctx.stroke();
      ctx.restore();
    },

    /* ---------------- Spikes ---------------- */
    spikes(ctx, x, y, w, up) {
      ctx.fillStyle = "#b8c0cc";
      const n = Math.max(1, Math.floor(w / 12));
      const sw = w / n;
      for (let i = 0; i < n; i++) {
        const sx = x + i * sw;
        ctx.beginPath();
        if (up) {
          ctx.moveTo(sx, y);
          ctx.lineTo(sx + sw / 2, y - 14);
          ctx.lineTo(sx + sw, y);
        } else {
          ctx.moveTo(sx, y);
          ctx.lineTo(sx + sw / 2, y + 14);
          ctx.lineTo(sx + sw, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#8a929e";
      ctx.fillRect(x, up ? y : y - 3, w, 3);
    },

    /* ---------------- Barrier / hurdle ---------------- */
    barrier(ctx, x, y, w, h) {
      ctx.fillStyle = "#e23a3a";
      ctx.fillRect(x, y - h, w, h);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < h; i += 16) {
        ctx.fillRect(x, y - h + i, w, 8);
      }
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(x - 2, y - h - 4, w + 4, 5);
    },

    /* ---------------- Trampoline ---------------- */
    trampoline(ctx, x, y, w, squash) {
      ctx.fillStyle = "#3a2a5a";
      ctx.fillRect(x, y + 6, 8, 18);
      ctx.fillRect(x + w - 8, y + 6, 8, 18);
      // Bouncy mat (dips with squash 0..1)
      const dip = squash * 10;
      ctx.fillStyle = "#2b6cff";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w / 2, y + dip, x + w, y);
      ctx.lineTo(x + w, y + 6);
      ctx.quadraticCurveTo(x + w / 2, y + 6 + dip, x, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5a8cff";
      ctx.fillRect(x, y, w, 2);
    },

    /* ---------------- Trapeze ---------------- */
    trapeze(ctx, pivotX, pivotY, angle, length, screenX) {
      const bx = pivotX + Math.sin(angle) * length;
      const by = pivotY + Math.cos(angle) * length;
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pivotX - 14, pivotY);
      ctx.lineTo(bx - 14, by);
      ctx.moveTo(pivotX + 14, pivotY);
      ctx.lineTo(bx + 14, by);
      ctx.stroke();
      // Bar
      ctx.strokeStyle = "#7a4a1e";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(bx - 18, by);
      ctx.lineTo(bx + 18, by);
      ctx.stroke();
      // Pivot mount
      ctx.fillStyle = "#555";
      ctx.fillRect(pivotX - 18, pivotY - 4, 36, 6);
      return { x: bx, y: by };
    },

    /* ---------------- Pit hazard marker ---------------- */
    pit(ctx, x, w, floorY, h) {
      ctx.fillStyle = "#0a0012";
      ctx.fillRect(x, floorY, w, h);
      ctx.fillStyle = "#1a0830";
      ctx.fillRect(x, floorY, w, 6);
    },
  };

  window.Sprites = Sprites;
})();
