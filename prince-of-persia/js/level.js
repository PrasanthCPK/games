/*
 * level.js — Level + room model.
 *
 * Parses a level JSON (string-row tilemap + objects), maintains dynamic tile
 * state (gates, pressure plates, emerging spikes, loose floors, moving
 * platforms, secret walls), answers solidity/hazard queries for Physics, and
 * renders the world.
 *
 * Loading: Level.load(id) fetches levels/<id>.json, falling back to the
 * embedded window.EMBEDDED_LEVELS[id] so the game also runs from file://.
 */
(function (global) {
  'use strict';

  var K = global.K;
  var TID = global.Tiles.TILE;   // tile-id enum (FLOOR, GATE, ...)
  var TILE = global.K.TILE;      // tile size in pixels
  var Meta = global.Tiles.meta;
  var Sprites = global.Sprites;

  function Level(data) {
    this.id = data.id;
    this.name = data.name || 'Unknown';
    this.timeLimit = data.timeLimit || K.DEFAULT_TIME;

    // Parse string-row tilemap into a numeric grid.
    var rows = data.tiles || [];
    this.rows = rows.length;
    this.cols = 0;
    for (var i = 0; i < rows.length; i++) this.cols = Math.max(this.cols, rows[i].length);
    this.grid = [];
    this.spawn = null;
    for (var r = 0; r < this.rows; r++) {
      var line = rows[r] || '';
      var row = [];
      for (var c = 0; c < this.cols; c++) {
        var ch = line[c] || '.';
        if (ch === 'S') this.spawn = { col: c, row: r };
        row.push(global.Tiles.fromChar(ch));
      }
      this.grid.push(row);
    }
    if (data.spawn) this.spawn = { col: data.spawn.x, row: data.spawn.y };
    if (!this.spawn) this.spawn = { col: 1, row: 1 };

    this.worldW = this.cols * TILE;
    this.worldH = this.rows * TILE;

    // Build dynamic objects from the grid, then apply JSON overrides.
    this._buildDynamic(data);

    // Pickups / spawns specs (entities created by the Game).
    this.entitiesSpec = data.entities || [];
    this.potions = (data.potions || []).map(function (p) {
      return { col: p.x, row: p.y, effect: p.effect || 'heal', taken: false };
    });
    this.secretSpecs = data.secrets || [];
    this.exitOpen = false; // opened when win condition (e.g. boss) is met
  }

  Level.prototype._buildDynamic = function (data) {
    this.gates = [];
    this.plates = [];
    this.spikes = [];
    this.loose = [];
    this.secrets = {}; // key "c,r" -> {revealed:false, reveals}
    this.movers = [];

    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var id = this.grid[r][c];
        if (id === TID.GATE) this.gates.push({ col: c, row: r, id: null, open: false, amount: 0 });
        else if (id === TID.PLATE) this.plates.push({ col: c, row: r, targets: [], mode: 'hold', pressed: false });
        else if (id === TID.SPIKES) this.spikes.push({ col: c, row: r, mode: 'cycle', timer: Math.random() * 2, extended: false });
        else if (id === TID.LOOSE) this.loose.push({ col: c, row: r, state: 'idle', timer: 0, fallY: 0 });
        else if (id === TID.SECRET) this.secrets[c + ',' + r] = { revealed: false, reveals: null };
      }
    }

    // Apply JSON object overrides / additions, matched by coordinate.
    var self = this;
    (data.objects || []).forEach(function (o) {
      if (o.type === 'gate') {
        var g = self._find(self.gates, o.x, o.y);
        if (g) { g.id = o.id; if (o.state === 'open') { g.open = true; g.amount = TILE; } }
      } else if (o.type === 'plate' || o.type === 'lever') {
        var p = self._find(self.plates, o.x, o.y);
        if (p) { p.targets = o.targets || []; p.mode = o.mode || (o.type === 'lever' ? 'latch' : 'hold'); }
      } else if (o.type === 'spikes') {
        var s = self._find(self.spikes, o.x, o.y);
        if (s) s.mode = o.mode || 'cycle';
      } else if (o.type === 'mover') {
        self.movers.push({
          x: o.x * TILE, y: o.y * TILE, w: o.w ? o.w * TILE : TILE, h: 10,
          path: (o.path || [[o.x, o.y]]).map(function (pt) { return { x: pt[0] * TILE, y: pt[1] * TILE }; }),
          speed: (o.speed || 1) * 40, seg: 0, t: 0, dx: 0, dy: 0,
        });
      }
    });
    (data.secrets || []).forEach(function (sp) {
      var key = sp.x + ',' + sp.y;
      if (!self.secrets[key]) self.secrets[key] = { revealed: false, reveals: sp.reveals || null };
      else self.secrets[key].reveals = sp.reveals || null;
    });
  };

  Level.prototype._find = function (list, col, row) {
    for (var i = 0; i < list.length; i++) if (list[i].col === col && list[i].row === row) return list[i];
    return null;
  };

  // ---- Loading ------------------------------------------------------------
  Level.load = function (id) {
    return fetch('levels/' + id + '.json')
      .then(function (res) { if (!res.ok) throw new Error('http'); return res.json(); })
      .then(function (data) { return new Level(data); })
      .catch(function () {
        var fb = global.EMBEDDED_LEVELS && global.EMBEDDED_LEVELS[id];
        if (!fb) throw new Error('Level ' + id + ' not found');
        return new Level(fb);
      });
  };

  // ---- Tile / solidity queries -------------------------------------------
  Level.prototype.tileAt = function (col, row) {
    if (!isFinite(col) || !isFinite(row)) return TID.WALL;
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return row >= this.rows ? TID.EMPTY : TID.WALL; // walls around, open below
    }
    return this.grid[row][col];
  };

  Level.prototype.solidFull = function (col, row) {
    var id = this.tileAt(col, row);
    if (id === TID.GATE) {
      var g = this._find(this.gates, col, row);
      return !!g && g.amount < TILE * 0.5; // closed enough to block/crush
    }
    if (id === TID.SECRET) {
      var key = col + ',' + row;
      var s = this.secrets[key];
      return !(s && s.revealed);
    }
    if (id === TID.EXIT) return false;
    return !!Meta(id).solid;
  };

  Level.prototype.solidTop = function (col, row) {
    var id = this.tileAt(col, row);
    if (id === TID.LOOSE) {
      var l = this._find(this.loose, col, row);
      return !!l && (l.state === 'idle' || l.state === 'shaking');
    }
    if (id === TID.LEDGE) return true;
    return false;
  };

  Level.prototype.hazardAtPx = function (px, py) {
    var col = Math.floor(px / TILE), row = Math.floor(py / TILE);
    if (row >= this.rows) return 'pit';
    var id = this.tileAt(col, row);
    if (id === TID.PIT) return 'pit';
    if (id === TID.SPIKES) {
      var s = this._find(this.spikes, col, row);
      return s && s.extended ? 'spike' : null;
    }
    return null;
  };

  Level.prototype.exitAtPx = function (px, py) {
    var col = Math.floor(px / TILE), row = Math.floor(py / TILE);
    return this.tileAt(col, row) === TID.EXIT;
  };

  // ---- Interactions -------------------------------------------------------

  /** Try to reveal a secret wall adjacent to a world point (returns reward or null). */
  Level.prototype.tryRevealSecret = function (px, py) {
    var col = Math.floor(px / TILE), row = Math.floor(py / TILE);
    for (var dc = -1; dc <= 1; dc++) {
      for (var dr = -1; dr <= 1; dr++) {
        var key = (col + dc) + ',' + (row + dr);
        var s = this.secrets[key];
        if (s && !s.revealed) {
          s.revealed = true;
          return s.reveals || 'passage';
        }
      }
    }
    return null;
  };

  /** Collect a potion the entity overlaps; returns the effect or null. */
  Level.prototype.collectPotion = function (e) {
    for (var i = 0; i < this.potions.length; i++) {
      var p = this.potions[i];
      if (p.taken) continue;
      var px = p.col * TILE, py = p.row * TILE;
      if (e.x + e.w > px && e.x < px + TILE && e.y + e.h > py && e.y < py + TILE) {
        p.taken = true;
        return p.effect;
      }
    }
    return null;
  };

  // ---- Update -------------------------------------------------------------
  Level.prototype.update = function (dt, game) {
    var player = game.player;

    // Pressure plates: any entity standing on the cell presses it.
    for (var i = 0; i < this.plates.length; i++) {
      var pl = this.plates[i];
      var on = this._entityOnCell(player, pl.col, pl.row) ||
        game.enemies.some(function (en) { return en.alive && this._entityOnCell(en, pl.col, pl.row); }.bind(this));
      if (pl.mode === 'hold') {
        pl.pressed = on;
        this._setGates(pl.targets, on);
      } else { // latch toggles on press
        if (on && !pl._wasOn) { pl.pressed = !pl.pressed; this._setGates(pl.targets, pl.pressed); if (game.audio) game.audio.play('gate'); }
      }
      pl._wasOn = on;
    }

    // Animate gates.
    for (var g = 0; g < this.gates.length; g++) {
      var ga = this.gates[g];
      var target = ga.open ? TILE : 0;
      ga.amount = global.Utils.approach(ga.amount, target, 120 * dt);
    }

    // Spikes.
    for (var s = 0; s < this.spikes.length; s++) {
      var sp = this.spikes[s];
      if (sp.mode === 'trigger') {
        var near = player && Math.abs((player.x + player.w / 2) - (sp.col * TILE + TILE / 2)) < TILE * 1.2 &&
          Math.abs((player.y + player.h) - (sp.row * TILE + TILE)) < TILE * 1.5;
        var want = near;
        if (want && !sp.extended && game.audio) game.audio.play('spike');
        sp.extended = want;
      } else {
        sp.timer += dt;
        var phase = sp.timer % 2.2;
        var ext = phase > 1.1;
        if (ext && !sp.extended && game.audio) game.audio.play('spike');
        sp.extended = ext;
      }
    }

    // Loose floors.
    for (var lf = 0; lf < this.loose.length; lf++) {
      var l = this.loose[lf];
      if (l.state === 'idle') {
        if (player && this._entityOnCell(player, l.col, l.row)) { l.state = 'shaking'; l.timer = 0.35; }
      } else if (l.state === 'shaking') {
        l.timer -= dt;
        if (l.timer <= 0) { l.state = 'falling'; if (game.audio) game.audio.play('gate'); }
      } else if (l.state === 'falling') {
        l.fallY += 400 * dt;
        if (l.fallY > (this.rows - l.row) * TILE) l.state = 'gone';
      }
    }

    // Moving platforms.
    for (var m = 0; m < this.movers.length; m++) this._updateMover(this.movers[m], dt);
  };

  Level.prototype._updateMover = function (mv, dt) {
    if (mv.path.length < 2) { mv.dx = mv.dy = 0; return; }
    var a = mv.path[mv.seg];
    var b = mv.path[(mv.seg + 1) % mv.path.length];
    var ddx = b.x - a.x, ddy = b.y - a.y;
    var dist = Math.hypot(ddx, ddy) || 1;
    mv.t += (mv.speed * dt) / dist;
    var ox = mv.x, oy = mv.y;
    if (mv.t >= 1) { mv.t = 0; mv.seg = (mv.seg + 1) % mv.path.length; mv.x = b.x; mv.y = b.y; }
    else { mv.x = a.x + ddx * mv.t; mv.y = a.y + ddy * mv.t; }
    mv.dx = mv.x - ox; mv.dy = mv.y - oy;
  };

  /** Stand entities on moving platforms; carries them along. Call post-physics. */
  Level.prototype.collideMovers = function (e) {
    for (var i = 0; i < this.movers.length; i++) {
      var mv = this.movers[i];
      var overlapX = e.x + e.w > mv.x && e.x < mv.x + mv.w;
      var feet = e.y + e.h;
      if (overlapX && e.vy >= 0 && feet >= mv.y - 2 && feet <= mv.y + mv.h + 6) {
        e.y = mv.y - e.h;
        e.vy = 0; e.onGround = true;
        e.x += mv.dx;
        return true;
      }
    }
    return false;
  };

  Level.prototype._entityOnCell = function (e, col, row) {
    if (!e) return false;
    var cx = e.x + e.w / 2;
    var feet = e.y + e.h;
    return Math.floor(cx / TILE) === col && Math.abs(feet - row * TILE) < 6;
  };

  Level.prototype._setGates = function (ids, open) {
    for (var i = 0; i < this.gates.length; i++) {
      if (ids.indexOf(this.gates[i].id) !== -1) this.gates[i].open = open;
    }
  };

  // ---- Rendering ----------------------------------------------------------
  Level.prototype.render = function (ctx, cam) {
    var startC = Math.max(0, Math.floor(cam.x / TILE));
    var endC = Math.min(this.cols - 1, Math.ceil((cam.x + cam.viewW) / TILE));
    var startR = Math.max(0, Math.floor(cam.y / TILE));
    var endR = Math.min(this.rows - 1, Math.ceil((cam.y + cam.viewH) / TILE));

    // Background brick wall behind everything.
    this._renderBackground(ctx, startC, endC, startR, endR);

    for (var r = startR; r <= endR; r++) {
      for (var c = startC; c <= endC; c++) {
        var id = this.grid[r][c];
        var x = c * TILE, y = r * TILE;
        if (id === TID.GATE || id === TID.PLATE || id === TID.SPIKES ||
            id === TID.LOOSE || id === TID.SECRET || id === TID.TORCH || id === TID.POTION) continue;
        Sprites.drawTile(ctx, id, x, y, r * 7 + c);
      }
    }

    this._renderObjects(ctx, startC, endC, startR, endR);
  };

  Level.prototype._renderBackground = function (ctx, sc, ec, sr, er) {
    var S = Sprites.SAND;
    for (var r = sr; r <= er; r++) {
      for (var c = sc; c <= ec; c++) {
        if (this.grid[r][c] !== TID.EMPTY && this.grid[r][c] !== TID.TORCH &&
            this.grid[r][c] !== TID.POTION && this.grid[r][c] !== TID.PLATE &&
            this.grid[r][c] !== TID.SPIKES) continue;
        var x = c * TILE, y = r * TILE;
        ctx.fillStyle = (r + c) % 2 ? '#3a2c16' : '#43331b';
        ctx.fillRect(x, y, TILE, TILE);
        // Subtle brick seams for sandstone wall texture.
        ctx.fillStyle = '#2a1f10';
        ctx.fillRect(x, y + ((r % 2) ? 16 : 0), TILE, 1);
        ctx.fillRect(x + ((r % 2) ? 16 : 0), y, 1, TILE);
        void S;
      }
    }
  };

  Level.prototype._renderObjects = function (ctx, sc, ec, sr, er) {
    var S = Sprites.SAND;

    // Secrets (unrevealed look like wall).
    for (var key in this.secrets) {
      var parts = key.split(','); var c = +parts[0], r = +parts[1];
      if (c < sc || c > ec || r < sr || r > er) continue;
      if (!this.secrets[key].revealed) Sprites.block(ctx, c * TILE, r * TILE, TILE, S[1], S[0], S[2]);
    }

    // Loose floors.
    for (var i = 0; i < this.loose.length; i++) {
      var l = this.loose[i];
      if (l.state === 'gone') continue;
      var ly = l.row * TILE + (l.state === 'falling' ? l.fallY : 0) +
        (l.state === 'shaking' ? (Math.random() * 2 - 1) : 0);
      Sprites.drawTile(ctx, TID.LOOSE, l.col * TILE, ly, 0);
    }

    // Gates: bars that slide up as they open.
    for (var g = 0; g < this.gates.length; g++) {
      var ga = this.gates[g];
      var gx = ga.col * TILE, gy = ga.row * TILE;
      var h = TILE - ga.amount;
      ctx.fillStyle = '#1a1206';
      ctx.fillRect(gx + 3, gy, TILE - 6, TILE);
      ctx.fillStyle = '#6e6e6e';
      for (var b = 0; b < 4; b++) ctx.fillRect(gx + 5 + b * 7, gy, 3, h);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(gx + 3, gy, TILE - 6, 2);
    }

    // Pressure plates.
    for (var p = 0; p < this.plates.length; p++) {
      var pl = this.plates[p];
      var px = pl.col * TILE, py = pl.row * TILE + TILE - 6;
      ctx.fillStyle = pl.pressed ? '#8a6d3b' : '#b8946a';
      ctx.fillRect(px + 6, py + (pl.pressed ? 3 : 0), TILE - 12, pl.pressed ? 3 : 6);
    }

    // Spikes.
    for (var s = 0; s < this.spikes.length; s++) {
      var sp = this.spikes[s];
      var sx = sp.col * TILE, sy = sp.row * TILE;
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(sx, sy + TILE - 4, TILE, 4);
      if (sp.extended) {
        ctx.fillStyle = '#cfd2d4';
        for (var k = 0; k < 4; k++) {
          var tx = sx + 4 + k * 7;
          ctx.beginPath();
          ctx.moveTo(tx, sy + TILE);
          ctx.lineTo(tx + 3, sy + TILE - 14);
          ctx.lineTo(tx + 6, sy + TILE);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Torches.
    for (var r2 = sr; r2 <= er; r2++) {
      for (var c2 = sc; c2 <= ec; c2++) {
        if (this.grid[r2][c2] !== TID.TORCH) continue;
        this._renderTorch(ctx, c2 * TILE, r2 * TILE);
      }
    }

    // Potions.
    for (var pi = 0; pi < this.potions.length; pi++) {
      var po = this.potions[pi];
      if (po.taken) continue;
      var bx = po.col * TILE + TILE / 2, by = po.row * TILE + TILE - 6;
      ctx.fillStyle = po.effect === 'maxhp' ? '#3aa0ff' : '#e02b3a';
      ctx.fillRect(bx - 3, by - 8, 6, 8);
      ctx.fillStyle = '#caa24b';
      ctx.fillRect(bx - 2, by - 11, 4, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(bx - 2, by - 7, 1, 5);
    }
  };

  Level.prototype._renderTorch = function (ctx, x, y) {
    // Bracket + flame; flicker is added by particles/lighting layer.
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(x + TILE / 2 - 1, y + 10, 2, 8);
    var t = (Date.now() % 1000) / 1000;
    var flick = Math.sin(t * Math.PI * 2 * 3) * 1.5;
    ctx.fillStyle = '#ff6b1a';
    ctx.beginPath();
    ctx.moveTo(x + TILE / 2 - 4, y + 11);
    ctx.lineTo(x + TILE / 2 + flick, y + 1);
    ctx.lineTo(x + TILE / 2 + 4, y + 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(x + TILE / 2 - 1, y + 6, 2, 4);
  };

  global.Level = Level;
})(window);
