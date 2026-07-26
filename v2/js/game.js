// ============================================================================
//  Aegis of Athens v2 — gameplay state & systems (Phase 2).
//  Owns harvest nodes, building input buffers, and the gather/deposit loop.
//  The Player entity handles movement; the Game reacts to where the player is.
// ============================================================================

import { CFG } from './config.js';

let _uid = 1;

export class Game {
  constructor() {
    this.time = 0;

    // Runtime harvest nodes (clone config, add live stock).
    this.nodes = CFG.nodes.map(n => ({
      id: _uid++, type: n.type, x: n.x, y: n.y,
      stock: CFG.node.max, max: CFG.node.max,
    }));

    // Building input buffers for the production buildings.
    this.buildings = {};
    for (const b of CFG.buildings) {
      if (b.input) this.buildings[b.key] = { key: b.key, input: b.input, stock: 0 };
    }

    this.floaters = [];      // world-space floating texts
    this.hint = null;        // transient guidance ({ text, t })

    this._gatherAcc = 0;
    this._depositAcc = 0;
    this._activeNode = null; // node currently being gathered (for render glow)
    this._activeBuilding = null;
  }

  setHint(text) { this.hint = { text, t: 0 }; }

  floater(x, y, text, color) {
    this.floaters.push({ id: _uid++, x, y, text, color, t: 0, life: 0.9 });
  }

  update(dt, player) {
    this.time += dt;
    this._regen(dt);
    this._gather(dt, player);
    this._deposit(dt, player);
    this._effects(dt);
  }

  // Nodes slowly refill.
  _regen(dt) {
    const r = CFG.node.regen * dt;
    for (const n of this.nodes) n.stock = Math.min(n.max, n.stock + r);
  }

  // Stand near a node -> harvest into the backpack, one unit at a time.
  _gather(dt, player) {
    const n = this._nearest(this.nodes, player, CFG.gather.range);
    this._activeNode = n;
    if (!n) { this._gatherAcc = 0; return; }

    if (player.full) { this.setHint('Backpack full — take it home!'); this._gatherAcc = 0; return; }
    if (n.stock < 1) { this._gatherAcc = 0; return; }

    this._gatherAcc += dt;
    while (this._gatherAcc >= CFG.gather.interval) {
      this._gatherAcc -= CFG.gather.interval;
      if (player.full || n.stock < 1) break;
      n.stock -= 1;
      player.carry[n.type] += 1;
      const m = CFG.resourceMeta[n.type];
      this.floater(n.x, n.y, `+1 ${m.icon}`, m.color);
    }
  }

  // Stand near the matching workshop -> unload that resource into its buffer.
  _deposit(dt, player) {
    let target = null;
    for (const b of CFG.buildings) {
      if (!b.input) continue;
      if (player.carry[b.input] <= 0) continue;
      if (this._distToRect(player, b) <= CFG.deposit.range) { target = b; break; }
    }
    this._activeBuilding = target ? target.key : null;
    if (!target) { this._depositAcc = 0; return; }

    this._depositAcc += dt;
    while (this._depositAcc >= CFG.deposit.interval) {
      this._depositAcc -= CFG.deposit.interval;
      if (player.carry[target.input] <= 0) break;
      player.carry[target.input] -= 1;
      this.buildings[target.key].stock += 1;
      const m = CFG.resourceMeta[target.input];
      this.floater(target.x + target.w / 2, target.y, `+1 ${m.icon}`, m.color);
    }
  }

  _effects(dt) {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter(f => f.t < f.life);
    if (this.hint) { this.hint.t += dt; if (this.hint.t > 2.4) this.hint = null; }
  }

  // ---- helpers ----
  _nearest(list, player, range) {
    let best = null, bd = range * range;
    for (const n of list) {
      const dx = n.x - player.x, dy = n.y - player.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  _distToRect(player, r) {
    const nx = Math.max(r.x, Math.min(player.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(player.y, r.y + r.h));
    return Math.hypot(player.x - nx, player.y - ny);
  }
}
