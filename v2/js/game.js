// ============================================================================
//  Aegis of Athens v2 — gameplay state & systems (Phase 2).
//  Owns harvest nodes, building input buffers, and the gather/deposit loop.
//  The Player entity handles movement; the Game reacts to where the player is.
// ============================================================================

import { CFG } from './config.js';
import { collides, insideCity } from './world.js';

let _uid = 1;
const SELLABLE = ['oil', 'wine']; // goods the Agora buys (food feeds the army instead)

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
    this.acropolis = CFG.buildings.find(b => b.kind === 'acropolis');
    this.drachmas = CFG.startDrachmas;

    // Upgrade levels (carry/speed affect the player; the rest affect the city).
    this.levels = { carry: 0, speed: 0, press: 1, winery: 1, granary: 1, wall: 1 };
    this.porters = [];

    // ---- Defence ----
    this.wall = { hp: CFG.wall.maxHp, maxHp: CFG.wall.maxHp, level: 1 };
    this.spartans = [];
    this.hoplites = [];
    this.archers = [];
    this.arrows = [];
    this.coins = [];           // drachma pickups dropped by slain Spartans
    this.particles = [];       // transient combat particles
    this.shake = 0;            // camera-shake magnitude
    this.rallyCd = 0;          // rally ability cooldown
    this.milestoneShown = false;
    this.wavesSurvived = 0;
    this.cityFood = CFG.cityFood.start;
    this.waveIndex = 0;
    this.nextWaveAt = CFG.waves.firstWaveAt;
    this.inWave = false;
    this.over = false;
    this.won = false;
    this.overReason = '';
    this.toasts = [];
    this.sfx = [];             // queued sound names, drained by main
    this.paused = false;
    this._desertAcc = 0;
    this._deposited = false;   // tutorial progress flags
    this._soldOnce = false;
    this.tutorial = { step: 0, done: false, target: null, text: '', _t: 0 };
    // Start with a small garrison.
    this.hireHoplite(true);
    this.archers.push(this._makeArcher()); this._positionDefenders();

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

  toast(text, kind = 'info') {
    this.toasts.push({ id: _uid++, text, kind, t: 0, life: 3.2 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  playSfx(name) { this.sfx.push(name); if (this.sfx.length > 8) this.sfx.shift(); }

  get army() { return this.hoplites.length + this.archers.length; }

  floater(x, y, text, color) {
    this.floaters.push({ id: _uid++, x, y, text, color, t: 0, life: 0.9 });
  }

  update(dt, player) {
    if (this.over) { this._effects(dt); return; }
    this.time += dt;
    this._regen(dt);
    this._process(dt);
    this._gather(dt, player);
    this._deposit(dt, player);
    this._pickup(dt, player);
    this._sell(dt, player);
    this._deliverFood(dt, player);
    // Defence
    this._waves(dt);
    this._spartanAI(dt, player);
    this._defenders(dt);
    this._arrows(dt);
    this._playerCombat(dt, player);
    this._foodUpkeep(dt);
    this._porters(dt);
    this._coins(dt, player);
    this._tutorial(dt, player);
    this._cleanup(player);
    this._effects(dt);
  }

  // A light scripted opening that teaches the invisible proximity loop.
  _tutorial(dt, player) {
    const t = this.tutorial;
    if (t.done) { t.target = null; t.text = ''; return; }
    const raw = player.carry.olives + player.carry.grapes + player.carry.fish;
    const goods = player.carry.oil + player.carry.wine + player.carry.food;
    if (t.step === 0) {
      t.text = 'Walk out a gate 🚪 and gather olives 🫒 from a grove';
      t.target = this._nearestNodeOfType('olives', player);
      if (raw > 0) t.step = 1;
    } else if (t.step === 1) {
      t.text = 'Haul it home and drop it at the matching workshop';
      t.target = this._buildingCenter(player.carry.grapes > 0 ? 'winery' : player.carry.fish > 0 ? 'granary' : 'press');
      if (this._deposited) t.step = 2;
    } else if (t.step === 2) {
      t.text = 'Your goods are ready — collect them from the workshop';
      t.target = this._readyWorkshop();
      if (goods > 0) t.step = 3;
    } else if (t.step === 3) {
      t.text = 'Sell oil & wine at the Agora 💰 for drachmas';
      t.target = this._buildingCenter('agora');
      if (this._soldOnce) t.step = 4;
    } else {
      t.text = 'Spend drachmas on soldiers ⚔ & upgrades before Sparta strikes!';
      t.target = null;
      t._t += dt;
      if (this.army > 2 || this.waveIndex > 0 || t._t > 14) t.done = true;
    }
  }

  _nearestNodeOfType(type, player) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (n.type !== type) continue;
      const d = (n.x - player.x) ** 2 + (n.y - player.y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  _buildingCenter(key) { const b = CFG.buildings.find(x => x.key === key); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; }
  _readyWorkshop() {
    for (const k of ['press', 'winery', 'granary']) if (this.buildings[k].outStock >= 1) return this._buildingCenter(k);
    return this._buildingCenter('press');
  }

  // Coins slide toward the player when close, and bank drachmas on pickup.
  _coins(dt, player) {
    const C = CFG.coins;
    for (const c of this.coins) {
      c.t += dt;
      const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy) || 1;
      if (d < C.magnet) { c.x += dx / d * C.speed * dt; c.y += dy / d * C.speed * dt; }
      if (d < C.collect) {
        c.gone = true;
        this.drachmas += c.value;
        this.floater(c.x, c.y, `+${c.value} 🪙`, '#e8c86a');
        this.playSfx('coin');
      }
    }
    this.coins = this.coins.filter(c => !c.gone && c.t < CFG.coins.life);
  }

  // Workshops convert their input buffer into finished goods over time.
  _process(dt) {
    const P = CFG.production;
    for (const key in this.buildings) {
      const b = this.buildings[key];
      const want = P.ratePerSec * this.levels[key] * dt;
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
      this._deposited = true;
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
    // Only oil & wine are sold here — food is reserved for feeding the army.
    const carryingGoods = SELLABLE.some(k => player.carry[k] > 0);
    if (!carryingGoods) { this._sellAcc = 0; return; }
    if (this._distToRect(player, this.agora) > CFG.deposit.range) { this._sellAcc = 0; return; }

    this._sellingNow = true;
    this._sellAcc += dt;
    while (this._sellAcc >= CFG.sell.interval) {
      this._sellAcc -= CFG.sell.interval;
      const good = SELLABLE.find(k => player.carry[k] > 0);
      if (!good) break;
      player.carry[good] -= 1;
      const price = CFG.goodsMeta[good].sell;
      this.drachmas += price;
      this._soldOnce = true;
      this.floater(this.agora.x + this.agora.w / 2, this.agora.y, `+${price} ₪`, '#e8c86a');
      this.playSfx('coin');
    }
  }

  // Deliver food to the Acropolis to stock the city larder (feeds soldiers).
  _deliverFood(dt, player) {
    if (!this.acropolis || player.carry.food <= 0 ||
        this._distToRect(player, this.acropolis) > CFG.deposit.range) { this._foodAcc = 0; return; }
    this._foodAcc = (this._foodAcc || 0) + dt;
    while (this._foodAcc >= CFG.deposit.interval) {
      this._foodAcc -= CFG.deposit.interval;
      if (player.carry.food <= 0) break;
      player.carry.food -= 1; this.cityFood += 1;
      this.floater(this.acropolis.x + this.acropolis.w / 2, this.acropolis.y, '+1 🍞', '#c9772f');
    }
  }

  _effects(dt) {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter(f => f.t < f.life);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < t.life);
    for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; }
    this.particles = this.particles.filter(p => p.t < p.life);
    this.shake = Math.max(0, this.shake - dt * 18);
    if (this.rallyCd > 0) this.rallyCd = Math.max(0, this.rallyCd - dt);
    if (this.hint) { this.hint.t += dt; if (this.hint.t > 2.4) this.hint = null; }
  }

  _spawnParticles(x, y, n, color, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (up > 0 ? 2 : 0.5), color, t: 0, life: 0.5 + Math.random() * 0.35, r: 1.5 + Math.random() * 2 });
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }

  // Active war-cry: strike every Spartan and hearten the defenders. On a cooldown.
  rally() {
    if (this.rallyCd > 0 || this.over) return false;
    this.rallyCd = CFG.rally.cooldown;
    let hit = 0;
    for (const s of this.spartans) {
      if (s.hp > 0) { s.hp -= CFG.rally.dmg; hit++; if (s.hp <= 0) this._spawnParticles(s.x, s.y, 6, s.body, 1); }
    }
    for (const u of [...this.hoplites, ...this.archers]) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * CFG.rally.healFrac);
    this.shake = Math.min(9, this.shake + 4);
    this.playSfx('horn');
    this.toast(hit > 0 ? `⚔ Rally! Struck ${hit} Spartans` : '⚔ Rally! Defenders heartened', 'good');
    return true;
  }

  // ======================================================================
  //  DEFENCE — hiring, waves, combat
  // ======================================================================
  _makeHoplite() { return { id: _uid++, kind: 'hoplite', hp: CFG.hoplite.hp, maxHp: CFG.hoplite.hp, x: 20, y: CFG.defenders.hopY, cool: 0 }; }
  _makeArcher()  { return { id: _uid++, kind: 'archer',  hp: CFG.archer.hp,  maxHp: CFG.archer.hp,  x: 20, y: CFG.defenders.arcY, cool: Math.random() }; }

  hireHoplite(free) {
    if (!free) {
      if (this.drachmas < CFG.costs.hoplite) { this.toast('Not enough drachmas', 'warn'); return false; }
      this.drachmas -= CFG.costs.hoplite;
    }
    this.hoplites.push(this._makeHoplite());
    this._positionDefenders();
    if (!free) this.toast('Hoplite hired — to the walls!', 'good');
    return true;
  }

  hireArcher() {
    if (this.drachmas < CFG.costs.archer) { this.toast('Not enough drachmas', 'warn'); return false; }
    this.drachmas -= CFG.costs.archer;
    this.archers.push(this._makeArcher());
    this._positionDefenders();
    this.toast('Archer hired — to the walls!', 'good');
    return true;
  }

  repairWall() {
    if (this.wall.hp >= this.wall.maxHp) { this.toast('Walls already at full HP', 'warn'); return false; }
    if (this.drachmas < CFG.costs.repair) { this.toast('Not enough drachmas', 'warn'); return false; }
    this.drachmas -= CFG.costs.repair;
    this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + CFG.costs.repairHp);
    this.toast(`Walls repaired +${CFG.costs.repairHp} HP`, 'good');
    return true;
  }

  _positionDefenders() {
    const d = CFG.defenders;
    const place = (arr, y) => {
      const n = arr.length;
      arr.forEach((u, i) => { u.x = n === 1 ? (d.xMin + d.xMax) / 2 : d.xMin + (i / (n - 1)) * (d.xMax - d.xMin); u.y = y; });
    };
    place(this.hoplites, d.hopY);
    place(this.archers, d.arcY);
  }

  _waves(dt) {
    if (this.won) return;
    if (!this.inWave && this.time >= this.nextWaveAt) this._startWave();
  }

  _startWave() {
    const W = CFG.waves, d = CFG.defenders, S = CFG.spartan;
    this.waveIndex++;
    this.inWave = true;
    const size = Math.round(W.baseSize + (this.waveIndex - 1) * W.sizeGrowth);
    const bonus = (this.waveIndex - 1) * W.hpGrowth;
    let variety = false;
    for (let i = 0; i < size; i++) {
      const type = this._pickEnemyType(i);
      if (type !== 'warrior') variety = true;
      const et = CFG.enemyTypes[type];
      const x = d.xMin + (i / Math.max(1, size - 1)) * (d.xMax - d.xMin) + (Math.random() * 1.2 - 0.6);
      const hp = et.hp + bonus;
      this.spartans.push({
        id: _uid++, type, body: et.body, sizeMul: et.sizeMul,
        x, y: 1.5 + Math.random() * 3, hp, maxHp: hp,
        speed: S.speed * et.speedMul, atkWall: S.atkWall * et.atkMul, atkPlayer: S.atkPlayer * et.atkMul,
        coinMul: et.coinMul, atkCool: Math.random(),
      });
    }
    this.toast(`⚔ Spartan assault — Wave ${this.waveIndex}!${variety ? ' New foes among them!' : ''}`, 'bad');
    this.playSfx('horn');
  }

  _pickEnemyType(i) {
    const w = this.waveIndex;
    if (w >= 5 && i % 4 === 0) return 'shield';       // slow armoured wall-breakers
    if (w >= 3 && i % 3 === 1) return 'skirmisher';   // fast, fragile rushers
    return 'warrior';
  }

  _endWave() {
    const W = CFG.waves;
    this.inWave = false;
    this.arrows = [];
    this.wavesSurvived = this.waveIndex;
    const reward = W.rewardBase + (this.waveIndex - 1) * W.rewardGrowth;
    // Salvage any coins still on the field so you never have to enter the kill zone.
    let salvage = 0;
    for (const c of this.coins) salvage += c.value;
    this.coins = [];
    this.drachmas += reward + salvage;
    const extra = salvage > 0 ? ` (+${salvage} salvaged)` : '';
    this.toast(`Wave ${this.waveIndex} repelled! +${reward} ₪${extra}`, 'good');
    this.nextWaveAt = this.time + W.interval;
    for (const u of [...this.hoplites, ...this.archers]) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.4);
    // Endless: surviving the victory wave is a milestone, not the end.
    if (this.waveIndex === W.victoryWave && !this.milestoneShown) {
      this.milestoneShown = true;
      this.toast('🏛 Athens has endured the great siege! The assaults continue…', 'good');
    }
  }

  _spartanAI(dt, player) {
    const S = CFG.spartan;
    for (const s of this.spartans) {
      if (s.hp <= 0) continue;
      s.atkCool -= dt;
      const dpx = player.x - s.x, dpy = player.y - s.y;
      const dp = Math.hypot(dpx, dpy);
      const chase = dp < S.aggro && player.invuln <= 0;
      if (chase) {
        if (dp > 0.9) {
          // Chase, but never through walls/buildings or in through a gate — the
          // city interior is off-limits to enemies.
          const nx = s.x + dpx / dp * s.speed * dt, ny = s.y + dpy / dp * s.speed * dt;
          if (!collides(nx, s.y, S.radius) && !insideCity(nx, s.y)) s.x = nx;
          if (!collides(s.x, ny, S.radius) && !insideCity(s.x, ny)) s.y = ny;
        } else if (s.atkCool <= 0) { s.atkCool = 1; this._hurtPlayer(player, s.atkPlayer); }
      } else if (s.y < S.stopY) {
        s.y = Math.min(S.stopY, s.y + s.speed * dt); // march south, but never past the wall line (gates hold)
      } else if (s.atkCool <= 0) {
        s.atkCool = 1; this.wall.hp = Math.max(0, this.wall.hp - s.atkWall);
        this.floater(s.x, s.y, '💥', '#e0a0a0');
        this.shake = Math.min(7, this.shake + 1.4);
        this._spawnParticles(s.x, s.y, 4, '#c9a878', -1);
      }
    }
  }

  _defenders(dt) {
    const morale = this.cityFood > 0 ? 1 : 0.6;
    for (const h of this.hoplites) {
      h.cool = (h.cool || 0) - dt;
      const t = this._nearestSpartan(h.x, h.y, CFG.hoplite.range);
      if (t && h.cool <= 0) { h.cool = 1; t.hp -= CFG.hoplite.atk * morale; }
    }
    for (const a of this.archers) {
      a.cool -= dt;
      if (a.cool <= 0) {
        const t = this._nearestSpartan(a.x, a.y, CFG.archer.range);
        if (t) { a.cool = CFG.archer.cooldown; this.arrows.push({ x: a.x, y: a.y, tx: t.x, ty: t.y, target: t, t: 0, life: 0.5 }); }
        else a.cool = 0.3;
      }
    }
  }

  _arrows(dt) {
    for (const ar of this.arrows) {
      ar.t += dt;
      const p = Math.min(1, ar.t / ar.life);
      ar.cx = ar.x + (ar.tx - ar.x) * p;
      ar.cy = ar.y + (ar.ty - ar.y) * p;
      if (p >= 1) { if (ar.target && ar.target.hp > 0) ar.target.hp -= CFG.archer.atk; ar.done = true; }
    }
    this.arrows = this.arrows.filter(a => !a.done);
  }

  _playerCombat(dt, player) {
    const P = CFG.playerCombat;
    player.atkCool -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.hitFlash > 0) player.hitFlash -= dt;
    if (player.attacking > 0) player.attacking -= dt;

    const t = this._nearestSpartan(player.x, player.y, P.range);
    if (t && player.atkCool <= 0) {
      player.atkCool = P.cooldown; t.hp -= P.atk; player.attacking = 0.2;
      if (t.hp <= 0) this.floater(t.x, t.y, '✔', '#cde');
    }
    // regenerate when safe inside the walls with no enemy nearby
    if (player.health < player.maxHealth && player.inside && !t) {
      player.health = Math.min(player.maxHealth, player.health + P.regen * dt);
    }
  }

  _hurtPlayer(player, dmg) {
    if (player.invuln > 0) return;
    player.health -= dmg;
    player.hitFlash = 0.3;
    this.playSfx('hit');
    if (player.health <= 0) this._knockout(player);
  }

  _knockout(player) {
    for (const k in player.carry) player.carry[k] = Math.floor(player.carry[k] / 2);
    player.x = CFG.player.start.x; player.y = CFG.player.start.y;
    player.health = player.maxHealth * 0.6;
    player.invuln = CFG.playerCombat.invuln;
    this.toast('You were driven back to the city!', 'bad');
  }

  _foodUpkeep(dt) {
    const use = this.army * CFG.hoplite.foodUse * dt;
    if (use <= 0) return;
    if (this.cityFood >= use) { this.cityFood -= use; return; }
    this.cityFood = 0;
    this._desertAcc += dt;
    if (this._desertAcc >= CFG.cityFood.desertEvery) {
      this._desertAcc = 0;
      const pool = this.hoplites.length >= this.archers.length ? this.hoplites : this.archers;
      if (pool.length > 0) { pool.pop(); this._positionDefenders(); this.toast('A soldier deserted — no food!', 'bad'); }
    }
  }

  _cleanup() {
    // Slain Spartans drop a coin (scaled by type) and burst where they fell.
    for (const s of this.spartans) {
      if (s.hp <= 0 && !s.dropped) {
        s.dropped = true;
        const value = Math.round((CFG.coins.base + this.waveIndex * CFG.coins.perWave) * (s.coinMul || 1));
        this.coins.push({ x: s.x, y: s.y, value, t: 0 });
        this._spawnParticles(s.x, s.y, 7, s.body || '#8a1f1f', 1);
      }
    }
    this.spartans = this.spartans.filter(s => s.hp > 0);
    this.hoplites = this.hoplites.filter(h => h.hp > 0);
    this.archers = this.archers.filter(a => a.hp > 0);
    if (this.wall.hp <= 0 && !this.over) { this.over = true; this.won = false; this.overReason = 'The walls of Athens have fallen!'; }
    if (this.inWave && this.spartans.length === 0 && !this.over) this._endWave();
  }

  _nearestSpartan(x, y, range) {
    let best = null, bd = range * range;
    for (const s of this.spartans) {
      if (s.hp <= 0) continue;
      const dx = s.x - x, dy = s.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ======================================================================
  //  PROGRESSION — upgrades & porters
  // ======================================================================
  upgradeCost(key) {
    const u = CFG.upgrades[key];
    const lvl = this.levels[key];
    if (lvl >= u.max) return Infinity;
    return u.cost(lvl);
  }

  buyUpgrade(key, player) {
    const cost = this.upgradeCost(key);
    if (!isFinite(cost)) { this.toast('Already at max level', 'warn'); return false; }
    if (this.drachmas < cost) { this.toast('Not enough drachmas', 'warn'); return false; }
    this.drachmas -= cost;
    this.levels[key]++;
    this.applyUpgrade(key, player);
    this.toast(`${CFG.upgrades[key].name} → Lv.${this.levels[key]}`, 'good');
    return true;
  }

  // (Re)apply an upgrade's effect. Also called on load to rebuild player stats.
  applyUpgrade(key, player) {
    if (key === 'carry' && player) player.carryCap = CFG.player.carryCap + this.levels.carry * CFG.upgrades.carry.step;
    if (key === 'speed' && player) player.speed = CFG.player.speed * (1 + this.levels.speed * 0.12);
    if (key === 'wall') {
      const oldMax = this.wall.maxHp;
      this.wall.maxHp = CFG.wall.maxHp + (this.levels.wall - 1) * CFG.upgrades.wall.step;
      // Add only the newly-built HP — reinforcing isn't a free full repair.
      this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + (this.wall.maxHp - oldMax));
    }
  }

  hirePorter(role) {
    const P = CFG.porters;
    const cost = role === 'trade' ? P.tradeCost : P.gatherCost;
    const count = this.porters.filter(p => p.role === role).length;
    if (count >= P.maxEach) { this.toast('Enough of those porters', 'warn'); return false; }
    if (this.drachmas < cost) { this.toast('Not enough drachmas', 'warn'); return false; }
    this.drachmas -= cost;
    this.porters.push({ id: _uid++, role, x: 22, y: 24, item: null, load: 0, phase: 'seek', target: null });
    this.toast(role === 'trade' ? 'Merchant porter hired' : 'Gatherer porter hired', 'good');
    return true;
  }

  _workshopForType(type) { return CFG.buildings.find(b => b.input === type); }

  _porters(dt) {
    const P = CFG.porters;
    for (const p of this.porters) {
      if (!p.target) this._porterPlan(p);
      if (!p.target) continue;                       // nothing to do — idle
      const dx = p.target.x - p.x, dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > P.reach) {
        p.x += dx / d * P.speed * dt;
        p.y += dy / d * P.speed * dt;
      } else {
        this._porterArrive(p);
        p.target = null;
      }
    }
  }

  _porterPlan(p) {
    if (p.role === 'gather') {
      if (p.load > 0) { const b = this._workshopForType(p.item); p.target = b ? { x: b.x + b.w / 2, y: b.y + b.h + 0.7 } : null; }
      else { const n = this._nearestStockedNode(p); p.target = n ? { x: n.x, y: n.y, node: n } : null; }
    } else { // trade
      if (p.load > 0) {
        p.target = { x: this.agora.x + this.agora.w / 2, y: this.agora.y + this.agora.h + 0.7 };
      } else {
        const b = this._workshopWithOutput(p);
        if (b) { const c = CFG.buildings.find(k => k.key === b.key); p.target = { x: c.x + c.w / 2, y: c.y + c.h + 0.7, wk: b.key }; }
        else p.target = null;
      }
    }
  }

  _porterArrive(p) {
    const P = CFG.porters;
    if (p.role === 'gather') {
      if (p.load > 0) { const b = this.buildings[this._workshopForType(p.item).key]; b.stock += p.load; p.load = 0; p.item = null; }
      else { const n = p.target.node; if (n && n.stock >= 1) { const grab = Math.min(P.cap, Math.floor(n.stock)); n.stock -= grab; p.load = grab; p.item = n.type; } }
    } else {
      if (p.load > 0) { const price = CFG.goodsMeta[p.item].sell; this.drachmas += p.load * price; this.floater(this.agora.x + this.agora.w / 2, this.agora.y, `+${p.load * price} ₪`, '#e8c86a'); p.load = 0; p.item = null; }
      else { const b = this.buildings[p.target.wk]; if (b && b.outStock >= 1) { const grab = Math.min(P.cap, Math.floor(b.outStock)); b.outStock -= grab; p.load = grab; p.item = b.output; } }
    }
  }

  _nearestStockedNode(p) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (n.stock < 1) continue;
      const dx = n.x - p.x, dy = n.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  _workshopWithOutput(p) {
    let best = null, bd = Infinity;
    for (const key in this.buildings) {
      const b = this.buildings[key];
      if (b.outStock < 1) continue;
      if (!SELLABLE.includes(b.output)) continue; // merchants never sell the army's food
      const cfgB = CFG.buildings.find(k => k.key === key);
      const dx = cfgB.x - p.x, dy = cfgB.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ======================================================================
  //  SAVE / LOAD
  // ======================================================================
  serialize(player) {
    return {
      v: 1, time: this.time, drachmas: this.drachmas,
      levels: { ...this.levels }, wall: { ...this.wall }, cityFood: this.cityFood,
      waveIndex: this.waveIndex, nextWaveAt: this.nextWaveAt,
      hoplites: this.hoplites.length, archers: this.archers.length,
      porters: this.porters.map(p => p.role),
      nodes: this.nodes.map(n => n.stock),
      buildings: Object.fromEntries(Object.entries(this.buildings).map(([k, b]) => [k, { stock: b.stock, outStock: b.outStock }])),
      player: { x: player.x, y: player.y, carry: { ...player.carry }, health: player.health },
    };
  }

  applySave(data, player) {
    if (!data || data.v !== 1) return false;
    this.time = data.time || 0;
    this.drachmas = data.drachmas ?? this.drachmas;
    Object.assign(this.levels, data.levels || {});
    this.cityFood = data.cityFood ?? this.cityFood;
    this.waveIndex = data.waveIndex || 0;
    this.nextWaveAt = data.nextWaveAt || CFG.waves.firstWaveAt;
    if (data.wall) this.wall = { ...this.wall, ...data.wall };
    if (Array.isArray(data.nodes)) data.nodes.forEach((s, i) => { if (this.nodes[i]) this.nodes[i].stock = s; });
    if (data.buildings) for (const k in data.buildings) if (this.buildings[k]) Object.assign(this.buildings[k], data.buildings[k]);
    // rebuild defenders & porters from counts/roles
    this.hoplites = []; this.archers = [];
    for (let i = 0; i < (data.hoplites || 0); i++) this.hoplites.push(this._makeHoplite());
    for (let i = 0; i < (data.archers || 0); i++) this.archers.push(this._makeArcher());
    this._positionDefenders();
    this.porters = (data.porters || []).map(role => ({ id: _uid++, role, x: 22, y: 24, item: null, load: 0, phase: 'seek', target: null }));
    this.spartans = []; this.arrows = []; this.coins = []; this.inWave = false;
    this.particles = []; this.shake = 0; this.rallyCd = 0;
    this.wavesSurvived = this.waveIndex;
    this.milestoneShown = this.waveIndex >= CFG.waves.victoryWave;
    this.tutorial.done = true; // returning players skip the opening tutorial
    // player
    if (data.player && player) {
      player.x = data.player.x; player.y = data.player.y;
      Object.assign(player.carry, data.player.carry || {});
      player.health = data.player.health ?? player.maxHealth;
    }
    this.applyUpgrade('carry', player);
    this.applyUpgrade('speed', player);
    return true;
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
