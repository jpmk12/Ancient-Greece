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

    // Production buildings: raw input buffer -> finished output stock.
    this.buildings = {};
    for (const b of CFG.buildings) {
      if (b.input) this.buildings[b.key] = { key: b.key, input: b.input, output: b.output, stock: 0, outStock: 0 };
    }
    this.agora = CFG.buildings.find(b => b.sells);
    this.drachmas = CFG.startDrachmas;

    this.floaters = [];      // world-space floating texts
    this.hint = null;        // transient guidance ({ text, t })

    this._gatherAcc = 0;
    this._depositAcc = 0;
    this._pickupAcc = 0;
    this._sellAcc = 0;
    this._activeNode = null; // node currently being gathered (for render glow)
    this._activeBuilding = null;
    this._sellingNow = false;
  }

  setHint(text) { this.hint = { text, t: 0 }; }

  floater(x, y, text, color) {
    this.floaters.push({ id: _uid++, x, y, text, color, t: 0, life: 0.9 });
  }

  update(dt, player) {
    this.time += dt;
    this._regen(dt);
    this._process(dt);
    this._gather(dt, player);
    this._deposit(dt, player);
    this._pickup(dt, player);
    this._sell(dt, player);
    this._effects(dt);
  }

  // Workshops convert their input buffer into finished goods over time.
  _process(dt) {
    const P = CFG.production;
    for (const key in this.buildings) {
      const b = this.buildings[key];
      const want = P.ratePerSec * dt;
      const made = Math.max(0, Math.min(want, b.stock / P.rawPerGood, P.outputCap - b.outStock));
      if (made > 0) { b.stock -= made * P.rawPerGood; b.outStock += made; }
    }
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

  // Stand near a workshop -> collect its finished goods into the backpack.
  _pickup(dt, player) {
    let target = null;
    for (const b of CFG.buildings) {
      if (!b.output) continue;
      const bb = this.buildings[b.key];
      if (bb.outStock < 1) continue;
      if (this._distToRect(player, b) <= CFG.deposit.range) { target = b; break; }
    }
    if (!target || player.full) { this._pickupAcc = 0; return; }

    this._pickupAcc += dt;
    while (this._pickupAcc >= CFG.deposit.interval) {
      this._pickupAcc -= CFG.deposit.interval;
      const bb = this.buildings[target.key];
      if (bb.outStock < 1 || player.full) break;
      bb.outStock -= 1;
      player.carry[target.output] += 1;
      const m = CFG.goodsMeta[target.output];
      this.floater(target.x + target.w / 2, target.y - 0.5, `+1 ${m.icon}`, m.color);
    }
  }

  // Stand at the Agora -> sell finished goods for drachmas.
  _sell(dt, player) {
    this._sellingNow = false;
    if (!this.agora) return;
    const carryingGoods = ['oil', 'wine', 'food'].some(k => player.carry[k] > 0);
    if (!carryingGoods) { this._sellAcc = 0; return; }
    if (this._distToRect(player, this.agora) > CFG.deposit.range) { this._sellAcc = 0; return; }

    this._sellingNow = true;
    this._sellAcc += dt;
    while (this._sellAcc >= CFG.sell.interval) {
      this._sellAcc -= CFG.sell.interval;
      const good = ['oil', 'wine', 'food'].find(k => player.carry[k] > 0);
      if (!good) break;
      player.carry[good] -= 1;
      const price = CFG.goodsMeta[good].sell;
      this.drachmas += price;
      this.floater(this.agora.x + this.agora.w / 2, this.agora.y, `+${price} ₪`, '#e8c86a');
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
