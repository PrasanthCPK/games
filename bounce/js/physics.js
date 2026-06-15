/* ============================================================
   Ball physics & tile collision.
   ------------------------------------------------------------
   Recreates the classic "always-bouncing ball" feel:
   the ball hops rhythmically on its own, and holding JUMP turns
   the next contact into a high jump. Movement is velocity based
   with separate ground/air acceleration. Water is buoyant.

   Units: world pixels, seconds. The simulation runs at a FIXED
   timestep (see game.js) so physics is deterministic and frame-
   rate independent. Collision uses swept-per-axis AABB resolution
   against the tile grid, which is allocation-free and stable.
   ============================================================ */

import { Action } from './input.js';
import { Tile, TILE } from './levels.js';
import { clamp, approach } from './utils.js';

const GRAVITY     = 2300;   // px/s^2
const MAX_FALL    = 1500;
const MOVE_SPEED  = 320;    // target horizontal speed
const GROUND_ACC  = 2600;
const AIR_ACC     = 1700;
const GROUND_FRIC = 2000;
const AUTO_BOUNCE = 560;    // upward speed of the automatic hop
const JUMP_VEL    = 920;    // upward speed when JUMP is held on contact

// Water tuning — net buoyancy lifts the ball gently to the surface.
const WATER_GRAVITY = 700;
const WATER_BUOY    = 1500;
const WATER_DRAG    = 4.0;
const WATER_SWIM    = 360;

export class Ball {
  constructor(x, y, radius = TILE * 0.38) {
    this.radius = radius;
    this.reset(x, y);
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.prevX = x; this.prevY = y;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.inWater = false;
    this.facing = 1;
    this.spin = 0;            // visual roll angle
    this.squash = 0;          // 0..1 landing squash, decays
    this.bouncedThisStep = false;
  }

  get half() { return this.radius * 0.90; } // AABB half-extent for collision

  /** Advance one fixed physics step. */
  update(dt, input, level) {
    this.prevX = this.x; this.prevY = this.y;
    this.bouncedThisStep = false;

    this.inWater = level.tileAtWorld(this.x, this.y) === Tile.WATER;

    // ---- horizontal control ----
    const axis = input.axisX;
    if (axis !== 0) this.facing = axis > 0 ? 1 : -1;
    const target = axis * MOVE_SPEED;
    const acc = (this.onGround ? GROUND_ACC : AIR_ACC) * (this.inWater ? 0.6 : 1);
    if (axis !== 0) {
      this.vx = approach(this.vx, target, acc * dt);
    } else if (this.onGround) {
      this.vx = approach(this.vx, 0, GROUND_FRIC * dt);
    }

    // ---- vertical forces ----
    if (this.inWater) {
      this.vy += (WATER_GRAVITY - WATER_BUOY) * dt;     // net upward
      this.vy -= this.vy * Math.min(1, WATER_DRAG * dt); // drag toward 0
      this.vx -= this.vx * Math.min(1, WATER_DRAG * dt);
      if (input.isHeld(Action.JUMP)) this.vy = -WATER_SWIM;
    } else {
      this.vy += GRAVITY * dt;
    }
    this.vy = clamp(this.vy, -2000, MAX_FALL);

    // ---- integrate + resolve, one axis at a time ----
    this._moveX(this.vx * dt, level);
    this._moveY(this.vy * dt, input, level);

    // ---- visual state ----
    this.spin += (this.vx / this.radius) * dt;
    this.squash = Math.max(0, this.squash - dt * 6);
  }

  _moveX(dx, level) {
    this.x += dx;
    const h = this.half;
    const top = Math.floor((this.y - h) / TILE);
    const bot = Math.floor((this.y + h - 0.001) / TILE);

    if (dx > 0) {
      const col = Math.floor((this.x + h) / TILE);
      for (let row = top; row <= bot; row++) {
        if (level.isSolid(col, row)) {
          this.x = col * TILE - h;
          this.vx = 0;
          break;
        }
      }
    } else if (dx < 0) {
      const col = Math.floor((this.x - h) / TILE);
      for (let row = top; row <= bot; row++) {
        if (level.isSolid(col, row)) {
          this.x = (col + 1) * TILE + h;
          this.vx = 0;
          break;
        }
      }
    }
  }

  _moveY(dy, input, level) {
    this.y += dy;
    const h = this.half;
    const left = Math.floor((this.x - h) / TILE);
    const right = Math.floor((this.x + h - 0.001) / TILE);
    let landed = false;
    let ceiling = false;

    if (dy > 0) {
      const row = Math.floor((this.y + h) / TILE);
      for (let col = left; col <= right; col++) {
        if (level.isSolid(col, row)) {
          this.y = row * TILE - h;
          landed = true;
          break;
        }
      }
    } else if (dy < 0) {
      const row = Math.floor((this.y - h) / TILE);
      for (let col = left; col <= right; col++) {
        if (level.isSolid(col, row)) {
          this.y = (row + 1) * TILE + h;
          ceiling = true;
          break;
        }
      }
    }

    if (landed) {
      if (this.inWater) {
        this.vy = 0;
        this.onGround = true;
      } else {
        // The signature Bounce hop: always rebound. Holding JUMP
        // converts the contact into a tall jump.
        const want = input.isHeld(Action.JUMP) ? JUMP_VEL : AUTO_BOUNCE;
        this.vy = -want;
        this.onGround = true;
        this.bouncedThisStep = true;
        this.squash = 1;
      }
    } else if (ceiling) {
      this.vy = 0;
      this.onGround = false;
    } else {
      this.onGround = false;
    }
  }
}
