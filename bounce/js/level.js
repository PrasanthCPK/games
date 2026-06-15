/* ============================================================
   Level runtime.
   ------------------------------------------------------------
   Wraps a parsed tile map with gameplay state: ring collection,
   moving the checkpoint, hazard tests and goal logic. Pure logic —
   all drawing lives in renderer.js so the visual style is in one
   place.
   ============================================================ */

import { parseLevel, Tile, TILE, SOLID_TILES } from './levels.js';

export class Level {
  constructor(def) {
    const parsed = parseLevel(def);
    this.name = parsed.name;
    this.cols = parsed.cols;
    this.rows = parsed.rows;
    this.grid = parsed.grid;
    this.startTile = parsed.start;
    this.goalTile = parsed.goal;

    // Rings as collectible entities (world-centre coords).
    this.rings = parsed.rings.map((r) => ({
      x: (r.x + 0.5) * TILE,
      y: (r.y + 0.5) * TILE,
      collected: false,
    }));
    this.totalRings = this.rings.length;

    this.width = this.cols * TILE;
    this.height = this.rows * TILE;

    this.reset();
  }

  reset() {
    for (const r of this.rings) r.collected = false;
    this.collectedRings = 0;
    this.respawn = this._tileCenter(this.startTile);
  }

  _tileCenter(t) { return { x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE }; }

  get spawn() { return this._tileCenter(this.startTile); }
  get goalCenter() { return this._tileCenter(this.goalTile); }
  get allRingsCollected() { return this.collectedRings >= this.totalRings; }

  /** Raw tile lookup. Out-of-bounds sides/bottom act as walls; sky is empty. */
  tileAt(col, row) {
    if (col < 0 || col >= this.cols) return Tile.SOLID;   // side walls
    if (row >= this.rows) return Tile.SOLID;              // floor
    if (row < 0) return Tile.EMPTY;                       // open sky
    return this.grid[row][col];
  }

  tileAtWorld(x, y) {
    return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  isSolid(col, row) { return SOLID_TILES.has(this.tileAt(col, row)); }

  /** Does the ball overlap any spike tile? (death) */
  hitsSpike(ball) {
    const h = ball.half * 0.85; // forgiving hitbox vs spikes
    const c0 = Math.floor((ball.x - h) / TILE);
    const c1 = Math.floor((ball.x + h) / TILE);
    const r0 = Math.floor((ball.y - h) / TILE);
    const r1 = Math.floor((ball.y + h) / TILE);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (this.tileAt(c, r) === Tile.SPIKE) return true;
    return false;
  }

  /** Collect any rings the ball touches. Returns number collected this call. */
  collectRings(ball) {
    let n = 0;
    const reach = ball.radius + TILE * 0.34;
    const reach2 = reach * reach;
    for (const ring of this.rings) {
      if (ring.collected) continue;
      const dx = ring.x - ball.x, dy = ring.y - ball.y;
      if (dx * dx + dy * dy <= reach2) {
        ring.collected = true;
        this.collectedRings++;
        n++;
      }
    }
    return n;
  }

  /** If the ball touches a checkpoint tile, move the respawn here. */
  updateCheckpoint(ball) {
    const col = Math.floor(ball.x / TILE);
    const row = Math.floor(ball.y / TILE);
    if (this.tileAt(col, row) === Tile.CHECKPOINT) {
      const c = { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE };
      if (c.x !== this.respawn.x || c.y !== this.respawn.y) {
        this.respawn = c;
        return true;
      }
    }
    return false;
  }

  /** Has the ball reached the (open) goal? */
  reachedGoal(ball) {
    if (!this.allRingsCollected) return false;
    const g = this.goalCenter;
    const dx = g.x - ball.x, dy = g.y - ball.y;
    const reach = ball.radius + TILE * 0.45;
    return dx * dx + dy * dy <= reach * reach;
  }

  /** Has the ball fallen below the world? (safety net) */
  fellOut(ball) { return ball.y - ball.radius > this.height + TILE * 3; }
}
