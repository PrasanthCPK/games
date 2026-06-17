/*
 * tiles.js — Tile type constants, the JSON character legend, and per-tile
 * metadata describing collision/behavior. Also holds global tunables (K).
 *
 * Tilemaps in level JSON are arrays of strings (one char per tile) for
 * readability; `Tiles.fromChar` converts a char to a numeric tile id.
 */
(function (global) {
  'use strict';

  // ---- Global tunables (single source of truth) ---------------------------
  var K = Object.freeze({
    TILE: 32,            // world pixels per tile
    ROOM_COLS: 10,       // tiles per room (one screen) horizontally
    ROOM_ROWS: 8,        // tiles per room vertically
    FIXED_DT: 1 / 60,    // fixed simulation step (seconds)
    MAX_FRAME: 0.25,     // clamp huge frame deltas (tab switch)

    GRAVITY: 1500,       // px/s^2
    MAX_FALL: 900,       // terminal velocity px/s
    RUN_SPEED: 150,      // px/s
    WALK_SPEED: 60,      // careful-walk px/s
    RUN_ACCEL: 1200,     // px/s^2 toward target speed
    FRICTION: 1400,      // px/s^2 decel when no input
    JUMP_VY: -430,       // standing jump impulse
    RUNJUMP_VY: -400,    // running jump impulse (flatter arc, more vx)

    // Fall distance thresholds (in tiles) for landing outcomes.
    SAFE_DROP_TILES: 2.4,   // below this: land cleanly
    ROLL_DROP_TILES: 3.6,   // below this (and >= safe): roll, lose 1 hp
    LETHAL_DROP_TILES: 5.0,  // at/above this: death

    LEDGE_GRAB_REACH: 14,   // px tolerance for grabbing a ledge edge
    START_HP: 4,            // prince life segments
    MAX_HP: 8,

    SWORD_RANGE: 38,        // px reach of a sword lunge hitbox
    DEFAULT_TIME: 90,       // seconds per level (story mode is generous)
  });

  // ---- Tile ids -----------------------------------------------------------
  var TILE = {
    EMPTY: 0,   // air
    FLOOR: 1,   // solid sandstone block (solid all sides)
    LEDGE: 2,   // one-way platform: solid only from above, grabbable edge
    WALL: 3,    // solid wall/pillar
    GATE: 4,    // gate (state managed by an object)
    PLATE: 5,   // pressure plate (object handles targets)
    SPIKES: 6,  // floor spikes (object handles emerge cycle)
    LOOSE: 7,   // loose floor tile (collapses after a step)
    PIT: 8,     // deadly pit floor marker (falling here kills)
    EXIT: 9,    // level exit
    TORCH: 10,  // decorative wall torch (emits light)
    POTION: 11, // potion marker (decorative; potions come from JSON list)
    SECRET: 12, // breakable/secret wall — passable once revealed
  };

  // Character legend used in level JSON tile rows.
  var CHAR_TO_TILE = {
    '.': TILE.EMPTY,
    ' ': TILE.EMPTY,
    '#': TILE.FLOOR,
    '=': TILE.LEDGE,
    'W': TILE.WALL,
    'G': TILE.GATE,
    'P': TILE.PLATE,
    '^': TILE.SPIKES,
    'L': TILE.LOOSE,
    '_': TILE.PIT,
    'E': TILE.EXIT,
    'T': TILE.TORCH,
    '+': TILE.POTION,
    ':': TILE.SECRET,
    'S': TILE.EMPTY, // spawn marker is purely informational; tile is air
  };

  // Per-tile metadata. `solid` = blocks from all sides; `solidTop` = one-way
  // (stand on top, pass through from below/sides); `grabbable` = ledge edge.
  var META = {};
  META[TILE.EMPTY]  = { solid: false, solidTop: false };
  META[TILE.FLOOR]  = { solid: true,  solidTop: true };
  META[TILE.LEDGE]  = { solid: false, solidTop: true, grabbable: true };
  META[TILE.WALL]   = { solid: true,  solidTop: true };
  META[TILE.GATE]   = { solid: false, solidTop: false }; // dynamic via object
  META[TILE.PLATE]  = { solid: false, solidTop: false };
  META[TILE.SPIKES] = { solid: false, solidTop: false, hazard: 'spike' };
  META[TILE.LOOSE]  = { solid: false, solidTop: true, loose: true };
  META[TILE.PIT]    = { solid: false, solidTop: false, hazard: 'pit' };
  META[TILE.EXIT]   = { solid: false, solidTop: false, exit: true };
  META[TILE.TORCH]  = { solid: false, solidTop: false, light: true };
  META[TILE.POTION] = { solid: false, solidTop: false };
  META[TILE.SECRET] = { solid: true,  solidTop: true, secret: true };

  function fromChar(ch) {
    var t = CHAR_TO_TILE[ch];
    return t == null ? TILE.EMPTY : t;
  }

  function meta(id) {
    return META[id] || META[TILE.EMPTY];
  }

  global.K = K;
  global.Tiles = {
    TILE: TILE,
    CHAR_TO_TILE: CHAR_TO_TILE,
    fromChar: fromChar,
    meta: meta,
  };
})(window);
