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

    // Reserved for later phases.
    this.health = 100;
    this.carry = {};        // { olives: n, grapes: n, ... }
    this.carryCap = 10;
  }

  get carried() { return Object.values(this.carry).reduce((a, b) => a + b, 0); }

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
