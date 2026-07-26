// ============================================================================
//  Aegis of Athens v2 — the player character: movement, collision, facing.
//  Phase 1 covers traversal; inventory/health hooks are stubbed for later.
// ============================================================================

import { CFG } from './config.js';
import { collides, screenDirToWorld, insideCity } from './world.js';

export class Player {
  constructor() {
    this.x = CFG.player.start.x;
    this.y = CFG.player.start.y;
    this.speed = CFG.player.speed;
    this.r = CFG.player.radius;
    this.faceX = 1;        // 1 = facing screen-right, -1 = screen-left
    this.moving = false;
    this.walkPhase = 0;
    this.inside = true;

    // Backpack — holds both raw resources and finished goods.
    this.health = 100;
    this.carry = { olives: 0, grapes: 0, fish: 0, oil: 0, wine: 0, food: 0 };
    this.carryCap = CFG.player.carryCap;
  }

  get carried() { let s = 0; for (const k in this.carry) s += this.carry[k]; return s; }
  get full() { return this.carried >= this.carryCap; }

  update(dt, input) {
    const mag = Math.hypot(input.dx, input.dy);
    this.moving = mag > 0.08;

    if (this.moving) {
      // Screen-relative input -> world direction, normalised.
      const wd = screenDirToWorld(input.dx, input.dy);
      const wl = Math.hypot(wd.x, wd.y) || 1;
      const step = this.speed * dt * Math.min(1, mag); // analog magnitude
      const vx = (wd.x / wl) * step;
      const vy = (wd.y / wl) * step;

      // Axis-separated movement so we slide along walls instead of sticking.
      if (!collides(this.x + vx, this.y, this.r)) this.x += vx;
      if (!collides(this.x, this.y + vy, this.r)) this.y += vy;

      this.faceX = input.dx >= 0 ? 1 : -1;
      this.walkPhase += dt * 10;
    } else {
      this.walkPhase = 0;
    }

    this.inside = insideCity(this.x, this.y);
  }
}
