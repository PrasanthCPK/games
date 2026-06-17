/*
 * sprites.js — Procedural pixel-art. No binary assets.
 *
 * Characters are drawn from a small "skeleton" rig: a pose specifies the
 * positions of feet, hands and hips in local coordinates, and drawCharacter
 * renders limbs/torso/head from that. Animation clips are arrays of poses, so
 * we get smooth motion (walk/run cycles are generated with sine waves) without
 * authoring hundreds of pixel frames.
 *
 * Everything is drawn at the game's native low resolution; the main canvas is
 * scaled up by CSS with image-rendering:pixelated for the crisp retro look.
 *
 * Tiles are drawn as 32x32 sandstone blocks, ledges, spikes, gates, etc.
 */
(function (global) {
  'use strict';

  var TILE = global.Tiles.TILE;

  // ---- Palettes -----------------------------------------------------------
  var PAL = {
    prince: {
      skin: '#d9a066', tunic: '#f4f4f4', sash: '#c0392b',
      hair: '#3a2a1a', leg: '#e8e8e8', blade: '#dfe6ec', hilt: '#8a5a2b',
    },
    guard: {
      skin: '#b07a4a', tunic: '#7f8c8d', sash: '#34495e',
      hair: '#1a1206', leg: '#5d6d7e', blade: '#ecf0f1', hilt: '#444',
    },
    boss: {
      skin: '#9c6b3f', tunic: '#7b241c', sash: '#f1c40f',
      hair: '#0a0805', leg: '#512e1b', blade: '#f9e79f', hilt: '#7d6608',
    },
  };

  // ---- Skeleton base pose (local coords: origin = feet center, up = -y) ----
  var BASE = {
    hipY: -16, lean: 0,
    frontFoot: { x: 3, y: 0 }, backFoot: { x: -3, y: 0 },
    frontHand: { x: 5, y: -14 }, backHand: { x: -5, y: -14 },
    headDX: 0, sword: null,
  };

  function pose(over) {
    var p = {
      hipY: BASE.hipY, lean: BASE.lean,
      frontFoot: { x: BASE.frontFoot.x, y: BASE.frontFoot.y },
      backFoot: { x: BASE.backFoot.x, y: BASE.backFoot.y },
      frontHand: { x: BASE.frontHand.x, y: BASE.frontHand.y },
      backHand: { x: BASE.backHand.x, y: BASE.backHand.y },
      headDX: BASE.headDX, sword: null,
    };
    if (over) for (var k in over) p[k] = over[k];
    return p;
  }

  // Generate a walk/run gait procedurally with sine waves.
  function gait(frames, stride, lift, lean, bob) {
    var arr = [];
    for (var i = 0; i < frames; i++) {
      var ph = (i / frames) * Math.PI * 2;
      var s = Math.sin(ph);
      arr.push(pose({
        hipY: -16 - bob * Math.abs(s),
        lean: lean,
        frontFoot: { x: stride * s, y: -lift * Math.max(0, s) },
        backFoot: { x: -stride * s, y: -lift * Math.max(0, -s) },
        frontHand: { x: 4 - stride * 0.5 * s, y: -14 },
        backHand: { x: -4 + stride * 0.5 * s, y: -14 },
      }));
    }
    return arr;
  }

  // Sword helper: hand point + tip point in local coords.
  function sword(hx, hy, tx, ty) { return { hx: hx, hy: hy, tx: tx, ty: ty }; }

  // ---- Animation clips: poses + timing ------------------------------------
  // events map a frame index to a named gameplay event (e.g. attack active).
  var CLIPS = {
    idle: { fps: 3, loop: true, poses: [
      pose({}), pose({ hipY: -15, frontHand: { x: 5, y: -13 }, backHand: { x: -5, y: -13 } }),
    ] },
    walk: { fps: 7, loop: true, poses: gait(4, 5, 2, 1, 1) },
    run: { fps: 11, loop: true, poses: gait(6, 9, 3, 4, 2) },
    turn: { fps: 6, loop: false, poses: [
      pose({ lean: -3, frontFoot: { x: -2, y: 0 }, backFoot: { x: 4, y: 0 } }),
    ] },
    jump: { fps: 8, loop: false, poses: [
      pose({ hipY: -18, lean: 3, frontFoot: { x: 3, y: -5 }, backFoot: { x: -2, y: -4 },
        frontHand: { x: 4, y: -22 }, backHand: { x: -4, y: -20 } }),
    ] },
    fall: { fps: 6, loop: true, poses: [
      pose({ hipY: -17, frontFoot: { x: 4, y: -2 }, backFoot: { x: -4, y: -1 },
        frontHand: { x: 6, y: -24 }, backHand: { x: -6, y: -23 } }),
    ] },
    land: { fps: 12, loop: false, poses: [
      pose({ hipY: -10, lean: 3, frontFoot: { x: 6, y: 0 }, backFoot: { x: -6, y: 0 },
        frontHand: { x: 8, y: -10 }, backHand: { x: -6, y: -10 } }),
    ] },
    roll: { fps: 14, loop: false, poses: [pose({}), pose({}), pose({}), pose({})] },
    hang: { fps: 4, loop: true, poses: [
      pose({ hipY: -12, frontFoot: { x: 3, y: 6 }, backFoot: { x: -2, y: 8 },
        frontHand: { x: 3, y: -30 }, backHand: { x: -3, y: -30 } }),
    ] },
    climbUp: { fps: 8, loop: false, poses: [
      pose({ hipY: -10, frontHand: { x: 3, y: -30 }, backHand: { x: -3, y: -28 },
        frontFoot: { x: 3, y: 4 }, backFoot: { x: -2, y: 6 } }),
      pose({ hipY: -16, frontHand: { x: 5, y: -26 }, backHand: { x: -4, y: -22 },
        frontFoot: { x: 4, y: -2 }, backFoot: { x: -3, y: 0 } }),
      pose({ hipY: -16, frontHand: { x: 5, y: -16 }, backHand: { x: -5, y: -16 } }),
    ] },
    crouch: { fps: 4, loop: true, poses: [
      pose({ hipY: -9, frontFoot: { x: 5, y: 0 }, backFoot: { x: -5, y: 0 },
        frontHand: { x: 6, y: -9 }, backHand: { x: -5, y: -9 } }),
    ] },
    drink: { fps: 4, loop: false, poses: [
      pose({ frontHand: { x: 4, y: -22 } }),
      pose({ headDX: 1, frontHand: { x: 2, y: -32 } }),
      pose({ headDX: 1, frontHand: { x: 2, y: -32 } }),
      pose({ frontHand: { x: 5, y: -14 } }),
    ] },
    swordIdle: { fps: 4, loop: true, poses: [
      pose({ hipY: -15, lean: 2, frontFoot: { x: 7, y: 0 }, backFoot: { x: -6, y: 0 },
        frontHand: { x: 11, y: -16 }, backHand: { x: -6, y: -14 },
        sword: sword(11, -16, 22, -18) }),
    ] },
    attack: { fps: 14, loop: false, events: { 1: 'attack:active' }, poses: [
      // windup
      pose({ hipY: -15, lean: -1, frontHand: { x: 2, y: -24 }, backHand: { x: -6, y: -14 },
        frontFoot: { x: 5, y: 0 }, backFoot: { x: -6, y: 0 }, sword: sword(2, -24, 4, -36) }),
      // lunge (active)
      pose({ hipY: -15, lean: 5, frontFoot: { x: 11, y: 0 }, backFoot: { x: -7, y: 0 },
        frontHand: { x: 16, y: -18 }, backHand: { x: -4, y: -16 }, sword: sword(16, -18, 30, -18) }),
      // recover
      pose({ hipY: -15, lean: 2, frontFoot: { x: 7, y: 0 }, backFoot: { x: -6, y: 0 },
        frontHand: { x: 11, y: -16 }, backHand: { x: -6, y: -14 }, sword: sword(11, -16, 22, -18) }),
    ] },
    block: { fps: 6, loop: false, poses: [
      pose({ hipY: -15, lean: -1, frontFoot: { x: 4, y: 0 }, backFoot: { x: -6, y: 0 },
        frontHand: { x: 9, y: -22 }, backHand: { x: -5, y: -14 }, sword: sword(9, -22, 11, -36) }),
    ] },
    hurt: { fps: 8, loop: false, poses: [
      pose({ hipY: -14, lean: -5, frontFoot: { x: 1, y: 0 }, backFoot: { x: -7, y: 0 },
        frontHand: { x: 2, y: -20 }, backHand: { x: -8, y: -18 } }),
    ] },
    dead: { fps: 4, loop: false, poses: [pose({})] }, // drawn specially (prone)
  };

  // ---- Limb drawing helpers -----------------------------------------------

  // Two-segment limb (hip->knee->foot or shoulder->elbow->hand) with a bend.
  function limb(ctx, x1, y1, x2, y2, bendX, bendY, thick, color) {
    var mx = (x1 + x2) / 2 + bendX, my = (y1 + y2) / 2 + bendY;
    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(mx, my);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /**
   * Draw a character. ctx must be untransformed; we translate to (cx, feetY)
   * and flip horizontally for facing so all pose math is "facing right".
   */
  function drawCharacter(ctx, type, cx, feetY, clipName, frameIdx, facing, scale) {
    var pal = PAL[type] || PAL.guard;
    var clip = CLIPS[clipName] || CLIPS.idle;
    var p = clip.poses[Math.min(frameIdx, clip.poses.length - 1)] || clip.poses[0];
    scale = scale || 1;

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(feetY));
    ctx.scale((facing < 0 ? -1 : 1) * scale, scale);

    if (clipName === 'dead') { drawProne(ctx, pal); ctx.restore(); return; }
    if (clipName === 'roll') { drawRoll(ctx, pal, frameIdx); ctx.restore(); return; }

    var hipX = 0, hipY = p.hipY;
    var shX = p.lean, shY = hipY - 12;           // shoulders
    var headX = shX + p.headDX, headY = shY - 8; // head center

    // Back leg + back arm first (behind torso).
    limb(ctx, hipX - 1, hipY, p.backFoot.x, p.backFoot.y, -1, 1, 3, pal.leg);
    limb(ctx, shX - 2, shY + 1, p.backHand.x, p.backHand.y, -1, 1, 3, pal.skin);

    // Torso (trapezoid hips->shoulders).
    ctx.fillStyle = pal.tunic;
    ctx.beginPath();
    ctx.moveTo(hipX - 4, hipY);
    ctx.lineTo(hipX + 4, hipY);
    ctx.lineTo(shX + 3, shY);
    ctx.lineTo(shX - 3, shY);
    ctx.closePath();
    ctx.fill();
    // Sash across the waist.
    ctx.fillStyle = pal.sash;
    ctx.fillRect(hipX - 4, hipY - 3, 8, 3);

    // Front leg + front arm (in front of torso).
    limb(ctx, hipX + 1, hipY, p.frontFoot.x, p.frontFoot.y, 1, 1, 3, pal.leg);

    // Head.
    ctx.fillStyle = pal.skin;
    ctx.fillRect(headX - 3, headY - 3, 6, 7);
    ctx.fillStyle = pal.hair;
    ctx.fillRect(headX - 4, headY - 4, 8, 3);          // hair top
    ctx.fillRect(headX - 4, headY - 1, 2, 4);          // hair side
    ctx.fillStyle = '#000';
    ctx.fillRect(headX + 1, headY, 1, 1);              // eye

    // Sword (drawn from the front hand if present).
    if (p.sword) {
      var s = p.sword;
      ctx.strokeStyle = pal.hilt; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.hx - 2, s.hy); ctx.lineTo(s.hx + 2, s.hy); ctx.stroke(); // guard
      ctx.strokeStyle = pal.blade; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.hx, s.hy); ctx.lineTo(s.tx, s.ty); ctx.stroke();
    }
    // Front arm last (holds sword).
    limb(ctx, shX + 2, shY + 1, p.frontHand.x, p.frontHand.y, 1, 1, 3, pal.skin);

    ctx.restore();
  }

  function drawRoll(ctx, pal, frameIdx) {
    // A tucked ball that rotates.
    var ang = frameIdx * 0.9;
    ctx.translate(0, -8);
    ctx.rotate(ang);
    ctx.fillStyle = pal.tunic;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.sash;
    ctx.fillRect(-8, -2, 16, 3);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(4, -4, 4, 4);
  }

  function drawProne(ctx, pal) {
    // Lying on the ground, head to the right.
    ctx.fillStyle = pal.tunic;
    ctx.fillRect(-10, -6, 16, 5);
    ctx.fillStyle = pal.leg;
    ctx.fillRect(-14, -5, 6, 4);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(6, -7, 6, 6);  // head
    ctx.fillStyle = pal.hair;
    ctx.fillRect(8, -8, 6, 2);
  }

  // ---- Tile drawing -------------------------------------------------------

  var SAND = ['#3a2a1a', '#6b4f2f', '#9c7a4d', '#c9a86b', '#e8cf9a'];

  function drawTile(ctx, id, x, y, t) {
    var T = global.K.TILE;
    switch (id) {
      case TILE.FLOOR:
        block(ctx, x, y, T, SAND[2], SAND[1], SAND[3]);
        // top sunlit lip
        ctx.fillStyle = SAND[4];
        ctx.fillRect(x, y, T, 3);
        break;
      case TILE.WALL:
        block(ctx, x, y, T, SAND[1], SAND[0], SAND[2]);
        break;
      case TILE.SECRET:
        block(ctx, x, y, T, SAND[1], SAND[0], SAND[2]);
        break;
      case TILE.LEDGE:
        ctx.fillStyle = SAND[2];
        ctx.fillRect(x, y, T, 10);
        ctx.fillStyle = SAND[4];
        ctx.fillRect(x, y, T, 3);
        ctx.fillStyle = SAND[0];
        ctx.fillRect(x, y + 9, T, 1);
        break;
      case TILE.LOOSE:
        ctx.fillStyle = SAND[2];
        ctx.fillRect(x, y, T, 9);
        ctx.fillStyle = SAND[4];
        ctx.fillRect(x, y, T, 2);
        // cracks hinting it is loose
        ctx.strokeStyle = SAND[0];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 6, y); ctx.lineTo(x + 10, y + 9);
        ctx.moveTo(x + 20, y); ctx.lineTo(x + 16, y + 9);
        ctx.stroke();
        break;
      case TILE.PIT:
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, T, T);
        break;
      case TILE.EXIT:
        ctx.fillStyle = '#1a0f06';
        ctx.fillRect(x + 4, y, T - 8, T);
        ctx.strokeStyle = '#caa24b';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y, T - 8, T);
        ctx.fillStyle = '#caa24b';
        ctx.fillRect(x + T / 2 - 1, y + 4, 2, 6); // keyhole/arch hint
        break;
      default:
        break; // EMPTY and object-managed tiles draw nothing here
    }
  }

  // A beveled sandstone block with brick seams.
  function block(ctx, x, y, T, face, dark, light) {
    ctx.fillStyle = face;
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = light;
    ctx.fillRect(x, y, T, 1);
    ctx.fillRect(x, y, 1, T);
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + T - 1, T, 1);
    ctx.fillRect(x + T - 1, y, 1, T);
    // brick seam in the middle
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + T / 2, T, 1);
    ctx.fillRect(x + T / 2, y, 1, T / 2);
  }

  global.Sprites = {
    PAL: PAL,
    CLIPS: CLIPS,
    SAND: SAND,
    drawCharacter: drawCharacter,
    drawTile: drawTile,
    block: block,
  };
})(window);
