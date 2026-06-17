/*
 * physics.js — Momentum integration + axis-separated AABB tile collision,
 * plus the spatial queries the Player state machine needs (gap ahead, ledge
 * grab, drop distance, hazard under feet).
 *
 * Entities are {x, y, w, h, vx, vy}. The Level provides solidity queries:
 *   level.solidFull(col,row)  -> blocks from all sides
 *   level.solidTop(col,row)   -> one-way: stand on top only
 *   level.hazardAtPx(px,py)   -> 'spike' | 'pit' | null
 */
(function (global) {
  'use strict';

  var K = global.K;

  function colOf(px) { return Math.floor(px / K.TILE); }
  function rowOf(py) { return Math.floor(py / K.TILE); }

  var Physics = {};

  /** Integrate one entity for dt seconds and resolve tile collisions. */
  Physics.step = function (e, level, dt) {
    // Gravity
    e.vy += K.GRAVITY * dt;
    if (e.vy > K.MAX_FALL) e.vy = K.MAX_FALL;

    // Track the highest point while airborne for fall-damage calc.
    if (e.onGround) { e._peakY = e.y; }
    else if (e.y < (e._peakY == null ? e.y : e._peakY)) { e._peakY = e.y; }

    Physics._moveX(e, level, e.vx * dt);
    Physics._moveY(e, level, e.vy * dt);
  };

  Physics._moveX = function (e, level, dx) {
    e.wallLeft = e.wallRight = false;
    if (dx === 0) return;
    var newX = e.x + dx;
    var top = e.y + 2, bot = e.y + e.h - 2;
    if (dx > 0) {
      var rightCol = colOf(newX + e.w);
      for (var r = rowOf(top); r <= rowOf(bot); r++) {
        if (level.solidFull(rightCol, r)) {
          newX = rightCol * K.TILE - e.w - 0.01;
          e.vx = 0; e.wallRight = true; break;
        }
      }
    } else {
      var leftCol = colOf(newX);
      for (var r2 = rowOf(top); r2 <= rowOf(bot); r2++) {
        if (level.solidFull(leftCol, r2)) {
          newX = (leftCol + 1) * K.TILE + 0.01;
          e.vx = 0; e.wallLeft = true; break;
        }
      }
    }
    e.x = newX;
  };

  Physics._moveY = function (e, level, dy) {
    var wasGround = e.onGround;
    e.onGround = false;
    e.hitCeiling = false;
    var newY = e.y + dy;
    var left = e.x + 2, right = e.x + e.w - 2;

    if (dy >= 0) {
      // Moving down: feet.
      var footRow = rowOf(newY + e.h);
      var oldFoot = e.y + e.h;
      for (var c = colOf(left); c <= colOf(right); c++) {
        var solid = level.solidFull(c, footRow);
        var top = level.solidTop(c, footRow);
        if (solid || top) {
          var tileTop = footRow * K.TILE;
          // One-way platforms only catch you if your feet were above them.
          if (solid || oldFoot <= tileTop + 1) {
            newY = tileTop - e.h;
            e.vy = 0; e.onGround = true; break;
          }
        }
      }
    } else {
      // Moving up: head against full-solid only.
      var headRow = rowOf(newY);
      for (var c2 = colOf(left); c2 <= colOf(right); c2++) {
        if (level.solidFull(c2, headRow)) {
          newY = (headRow + 1) * K.TILE;
          e.vy = 0; e.hitCeiling = true; break;
        }
      }
    }
    e.y = newY;
    void wasGround;
  };

  /**
   * Is there a gap (no floor) immediately ahead of the entity's leading foot?
   * Used for careful-walk braking and run-jump decisions.
   */
  Physics.gapAhead = function (e, level, facing) {
    var footX = facing > 0 ? e.x + e.w + 2 : e.x - 2;
    var c = colOf(footX);
    var r = rowOf(e.y + e.h + 2);
    return !(level.solidFull(c, r) || level.solidTop(c, r));
  };

  /** Is the entity standing right at the lip of a ledge facing the gap? */
  Physics.atEdge = function (e, level, facing) {
    return e.onGround && Physics.gapAhead(e, level, facing);
  };

  /**
   * Detect a grabbable ledge while airborne. Returns {col,row,topY,side} or null.
   * The prince grabs when falling next to a solid tile whose top is near his
   * hands and the cell above it is open (space to hang).
   */
  Physics.ledgeGrab = function (e, level, facing) {
    if (e.vy < -20) return null; // only when not rising fast
    var handsY = e.y + 6;
    var sideX = facing > 0 ? e.x + e.w + 2 : e.x - 2;
    var col = colOf(sideX);
    var handRow = rowOf(handsY);
    for (var r = handRow - 1; r <= handRow + 1; r++) {
      var hasTile = level.solidFull(col, r) || level.solidTop(col, r);
      var openAbove = !level.solidFull(col, r - 1) && !level.solidTop(col, r - 1);
      if (hasTile && openAbove) {
        var tileTop = r * K.TILE;
        if (Math.abs(handsY - tileTop) <= K.LEDGE_GRAB_REACH) {
          return { col: col, row: r, topY: tileTop, side: facing };
        }
      }
    }
    return null;
  };

  /**
   * Number of tiles the entity would fall before hitting ground (from feet).
   * Large value implies a deadly pit.
   */
  Physics.dropTiles = function (e, level) {
    var c = colOf(e.x + e.w / 2);
    var startRow = rowOf(e.y + e.h);
    for (var r = startRow; r < startRow + 30; r++) {
      if (level.solidFull(c, r) || level.solidTop(c, r)) {
        return r - startRow;
      }
    }
    return 99;
  };

  /** Peak-based fall distance in tiles (set when landing). */
  Physics.fallTiles = function (e) {
    if (e._peakY == null) return 0;
    return (e.y - e._peakY) / K.TILE;
  };

  Physics.colOf = colOf;
  Physics.rowOf = rowOf;
  global.Physics = Physics;
})(window);
