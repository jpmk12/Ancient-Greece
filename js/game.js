// ============================================================================
//  Aegis of Athens — core game state, systems and the wave/combat simulation.
//  Rendering (render.js) and input/UI (input.js, ui.js) read from a Game
//  instance; all mutation of game state happens here.
// ============================================================================

import { CONFIG } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let _uid = 1;
const uid = () => _uid++;

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    const C = CONFIG;

    this.time = 0;              // seconds elapsed
    this.day = 1;
    this.paused = false;
    this.over = false;
    this.won = false;

    // Stockpiles ----------------------------------------------------------
    this.raw   = { olives: 0, grapes: 0, fish: 0 };
    this.goods = { oil: 0, wine: 0, food: 20 };
    this.drachmas = 30;

    // Harvest nodes (clone from config, add live stock) -------------------
    this.nodes = C.nodes.map(n => ({ ...n, stock: C.node.capacity }));

    // Upgrade levels ------------------------------------------------------
    this.levels = { harvest: 1, workers: 0, press: 1, winery: 1, granary: 1, wall: 1 };

    // Defence -------------------------------------------------------------
    this.wall = { maxHp: C.wall.baseMaxHp, hp: C.wall.baseMaxHp };
    this.hoplites = [];        // {id,x,y,hp,maxHp,target}
    this.archers  = [];        // {id,x,y,hp,maxHp,cool}
    this.spartans = [];        // active enemies during a wave
    this.arrows   = [];        // in-flight projectiles
    this.hireDefenders(1, 1);  // start with 1 hoplite + 1 archer

    // Wave scheduling -----------------------------------------------------
    this.waveIndex = 0;        // waves survived
    this.nextWaveAt = C.waves.firstWaveAt;
    this.inWave = false;

    // Effects / feedback --------------------------------------------------
    this.floaters = [];        // floating "+N" texts
    this.particles = [];
    this.toasts = [];          // transient status messages
    this.autoSell = true;

    this._acc = 0;             // fixed-timestep accumulator
    this._regenAcc = 0;
    this._workerAcc = 0;
  }

  // ---- Convenience ------------------------------------------------------
  get soldierCount() { return this.hoplites.length + this.archers.length; }

  toast(msg, kind = 'info') {
    this.toasts.push({ id: uid(), msg, kind, t: 0, life: 3.2 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  floater(x, y, text, color = '#fff') {
    this.floaters.push({ id: uid(), x, y, text, color, t: 0, life: 1.0 });
  }

  // ======================================================================
  //  MAIN UPDATE — advances the whole simulation by dt seconds.
  // ======================================================================
  update(dt) {
    if (this.paused || this.over) return;
    dt = Math.min(dt, 0.05); // guard against tab-switch time jumps

    this.time += dt;
    this.day = 1 + Math.floor(this.time / 30);

    this._stepEffects(dt);
    this._stepNodes(dt);
    this._stepWorkers(dt);

    // Production + economy run on a coarser fixed tick for stability.
    this._acc += dt;
    while (this._acc >= CONFIG.tickSeconds) {
      this._tick(CONFIG.tickSeconds);
      this._acc -= CONFIG.tickSeconds;
    }

    this._stepWaves(dt);
    if (this.inWave) this._stepCombat(dt);
    this._stepFood(dt);
  }

  // ---- Regenerating harvest nodes --------------------------------------
  _stepNodes(dt) {
    const cap = CONFIG.node.capacity;
    const regen = CONFIG.node.regenPerSec * dt;
    for (const n of this.nodes) n.stock = Math.min(cap, n.stock + regen);
  }

  // ---- Auto-gatherers (workers upgrade) --------------------------------
  _stepWorkers(dt) {
    if (this.levels.workers <= 0) return;
    this._workerAcc += dt;
    const interval = 1.4; // one auto-harvest cycle per this many seconds
    if (this._workerAcc >= interval) {
      this._workerAcc -= interval;
      // Each worker level auto-harvests one node (round-robins by type).
      for (let i = 0; i < this.levels.workers; i++) {
        const n = this.nodes[i % this.nodes.length];
        this._harvestNode(n, false);
      }
    }
  }

  // ---- Production & economy (fixed tick) -------------------------------
  _tick(dt) {
    const P = CONFIG.production;
    const cap = P.storageCap;

    for (const key of ['press', 'winery', 'granary']) {
      const b = CONFIG.buildings[key];
      const lvl = this.levels[key];
      const want = P.ratePerLevel * lvl * dt;               // goods desired this tick
      const rawAvail = this.raw[b.input];
      const canByRaw = rawAvail / P.rawPerGood;
      const canByCap = cap - this.goods[b.output];
      const made = Math.max(0, Math.min(want, canByRaw, canByCap));
      if (made > 0) {
        this.raw[b.input] -= made * P.rawPerGood;
        this.goods[b.output] += made;
      }
    }

    if (this.autoSell) this._sell('oil', false), this._sell('wine', false);
  }

  // ---- Effects lifetimes ------------------------------------------------
  _stepEffects(dt) {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter(f => f.t < f.life);
    for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; }
    this.particles = this.particles.filter(p => p.t < p.life);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < t.life);
  }

  // ======================================================================
  //  PLAYER ACTIONS
  // ======================================================================

  // Tap a point in world space — hit-test nodes and the agora.
  handleTap(x, y) {
    if (this.over) return;
    // Harvest nodes first.
    for (const n of this.nodes) {
      if (dist2(x, y, n.x, n.y) <= n.r * n.r) { this._harvestNode(n, true); return; }
    }
    // Agora → sell everything.
    const a = CONFIG.buildings.agora;
    if (inRect(x, y, a)) { this.sellAll(); return; }
  }

  _harvestNode(n, fromTap) {
    if (n.stock < 1) {
      if (fromTap) this.floater(n.x, n.y - n.r, 'empty', '#c99');
      return;
    }
    const yield_ = Math.min(n.stock, CONFIG.node.baseYield * this.levels.harvest);
    n.stock -= yield_;
    const before = this.raw[n.type];
    this.raw[n.type] = Math.min(CONFIG.production.storageCap, before + yield_);
    const gained = this.raw[n.type] - before;
    if (gained > 0) {
      const icon = CONFIG.resources[n.type].icon;
      this.floater(n.x, n.y - n.r + 6, `+${round1(gained)} ${icon}`, CONFIG.resources[n.type].color);
      if (fromTap) this._burst(n.x, n.y, CONFIG.resources[n.type].color);
    }
  }

  _burst(x, y, color) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, color, t: 0, life: 0.6, r: 2 + Math.random() * 2 });
    }
  }

  _sell(good, announce = true) {
    const price = CONFIG.goods[good].sell;
    if (!price) return 0;
    const qty = Math.floor(this.goods[good]);
    if (qty <= 0) return 0;
    this.goods[good] -= qty;
    const earn = qty * price;
    this.drachmas += earn;
    if (announce) {
      const a = CONFIG.buildings.agora;
      this.floater(a.x + a.w / 2, a.y, `+${earn} ₪`, '#e8c86a');
    }
    return earn;
  }

  sellAll() {
    const earn = this._sell('oil') + this._sell('wine');
    if (earn > 0) this.toast(`Sold goods for ${earn} drachmas`, 'good');
    else this.toast('Nothing to sell yet', 'warn');
  }

  // ---- Shop -------------------------------------------------------------
  upgradeCost(key) {
    const u = CONFIG.upgrades[key];
    const lvl = this.levels[key];
    if (lvl >= u.max) return Infinity;
    // harvest/press/etc start at level 1 in state but "level" for pricing is
    // the number of upgrades already bought.
    const bought = (key === 'workers') ? lvl : lvl - 1;
    return u.cost(bought);
  }

  canAfford(cost) { return this.drachmas >= cost; }

  buyUpgrade(key) {
    const cost = this.upgradeCost(key);
    if (!isFinite(cost)) { this.toast('Already at max level', 'warn'); return false; }
    if (!this.canAfford(cost)) { this.toast('Not enough drachmas', 'warn'); return false; }
    this.drachmas -= cost;
    this.levels[key]++;
    if (key === 'wall') {
      this.wall.maxHp = CONFIG.wall.baseMaxHp + (this.levels.wall - 1) * CONFIG.wall.hpPerLevel;
      this.wall.hp = this.wall.maxHp; // upgrading also fully repairs
    }
    this.toast(`${CONFIG.upgrades[key].name} → Lv.${this.levels[key]}`, 'good');
    return true;
  }

  buyAction(key) {
    const a = CONFIG.actions[key];
    if (key === 'repair') {
      if (this.wall.hp >= this.wall.maxHp) { this.toast('Wall already at full HP', 'warn'); return false; }
      if (!this.canAfford(a.cost)) { this.toast('Not enough drachmas', 'warn'); return false; }
      this.drachmas -= a.cost;
      const heal = a.cost * CONFIG.wall.repairPerDrachma; // ~37 HP per repair
      this.wall.hp = clamp(this.wall.hp + heal, 0, this.wall.maxHp);
      this.toast(`Wall repaired (+${Math.round(heal)} HP)`, 'good');
      return true;
    }
    if (!this.canAfford(a.cost)) { this.toast('Not enough drachmas', 'warn'); return false; }
    this.drachmas -= a.cost;
    if (key === 'hoplite') { this.hireDefenders(1, 0); this.toast('Hoplite hired — to the walls!', 'good'); }
    if (key === 'archer')  { this.hireDefenders(0, 1); this.toast('Archer hired — to the walls!', 'good'); }
    return true;
  }

  hireDefenders(hop, arc) {
    const wy = CONFIG.world.wallY;
    for (let i = 0; i < hop; i++) {
      const slot = this.hoplites.length;
      this.hoplites.push({ id: uid(), kind: 'hoplite', hp: CONFIG.hoplite.hp, maxHp: CONFIG.hoplite.hp,
        x: 180 + (slot % 12) * 56, y: wy + 34, target: null });
    }
    for (let i = 0; i < arc; i++) {
      const slot = this.archers.length;
      this.archers.push({ id: uid(), kind: 'archer', hp: CONFIG.archer.hp, maxHp: CONFIG.archer.hp,
        x: 150 + (slot % 12) * 60, y: wy - 18, cool: Math.random() });
    }
  }

  // ======================================================================
  //  WAVES & COMBAT
  // ======================================================================
  _stepWaves(dt) {
    if (this.won) return;
    if (!this.inWave && this.time >= this.nextWaveAt) this._startWave();
  }

  _startWave() {
    const W = CONFIG.waves;
    this.waveIndex++;
    this.inWave = true;
    const size = Math.round(W.baseSize + (this.waveIndex - 1) * W.sizeGrowth);
    const bonusHp = (this.waveIndex - 1) * W.hpGrowth;
    const world = CONFIG.world;
    for (let i = 0; i < size; i++) {
      const x = 120 + (i / Math.max(1, size - 1)) * (world.width - 240) + (Math.random() * 30 - 15);
      this.spartans.push({
        id: uid(),
        x: clamp(x, 60, world.width - 60),
        y: 60 + Math.random() * 110, // enter from the northern approach, above the wall
        hp: CONFIG.spartan.hp + bonusHp,
        maxHp: CONFIG.spartan.hp + bonusHp,
        atkCool: 0,
        engaged: null,
      });
    }
    this.toast(`⚔ Spartan assault! Wave ${this.waveIndex}`, 'bad');
  }

  _endWave() {
    const W = CONFIG.waves;
    this.inWave = false;
    this.arrows = [];
    const reward = W.rewardBase + (this.waveIndex - 1) * W.rewardGrowth;
    this.drachmas += reward;
    this.toast(`Wave ${this.waveIndex} repelled! +${reward} drachmas`, 'good');
    this.nextWaveAt = this.time + W.interval;
    // Heal surviving defenders a little between waves.
    for (const u of [...this.hoplites, ...this.archers]) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.35);
    if (this.waveIndex >= W.victoryWave) { this.won = true; this.over = true; }
  }

  _stepCombat(dt) {
    const world = CONFIG.world;
    const wallTop = world.wallY;

    // --- Spartans advance / attack ---
    for (const s of this.spartans) {
      if (s.hp <= 0) continue;
      const foe = s.engaged && s.engaged.hp > 0 ? s.engaged : null;
      if (!foe) s.engaged = null;

      if (s.y < wallTop - 4 && !foe) {
        s.y += CONFIG.spartan.speed * dt;
      } else {
        // At the wall: fight a hoplite if one is free, else damage the wall.
        s.atkCool -= dt;
        if (!s.engaged) {
          const h = this.hoplites.find(h => h.hp > 0 && (!h.target || h.target.hp <= 0));
          if (h) { s.engaged = h; h.target = s; }
        }
        if (s.atkCool <= 0) {
          s.atkCool = 1.0;
          if (s.engaged && s.engaged.hp > 0) {
            s.engaged.hp -= CONFIG.spartan.atk;
          } else {
            this.wall.hp = Math.max(0, this.wall.hp - CONFIG.spartan.atk);
            this._burst(s.x, wallTop, '#b55');
          }
        }
      }
    }

    // --- Hoplites strike engaged Spartans ---
    for (const h of this.hoplites) {
      if (h.hp <= 0) { h.target = null; continue; }
      const t = h.target;
      if (t && t.hp > 0) {
        h.cool = (h.cool || 0) - dt;
        if (h.cool <= 0) { h.cool = 1.0; t.hp -= CONFIG.hoplite.atk; if (t.hp <= 0) this._burst(t.x, t.y, '#caa'); }
      } else h.target = null;
    }

    // --- Archers fire at nearest advancing Spartan ---
    for (const a of this.archers) {
      if (a.hp <= 0) continue;
      a.cool -= dt;
      if (a.cool <= 0) {
        const target = this._nearestSpartan(a.x, a.y, CONFIG.archer.range);
        if (target) {
          a.cool = CONFIG.archer.cooldown;
          this.arrows.push({ x: a.x, y: a.y, tx: target.x, ty: target.y, target, t: 0, life: 0.6 });
        } else a.cool = 0.2;
      }
    }

    // --- Arrows travel & hit ---
    for (const ar of this.arrows) {
      ar.t += dt;
      const p = Math.min(1, ar.t / ar.life);
      ar.cx = ar.x + (ar.tx - ar.x) * p;
      ar.cy = ar.y + (ar.ty - ar.y) * p - Math.sin(p * Math.PI) * 40; // arc
      if (p >= 1) {
        if (ar.target && ar.target.hp > 0) { ar.target.hp -= CONFIG.archer.atk; if (ar.target.hp <= 0) this._burst(ar.target.x, ar.target.y, '#caa'); }
        ar.done = true;
      }
    }
    this.arrows = this.arrows.filter(a => !a.done);

    // --- Remove the dead ---
    this.spartans = this.spartans.filter(s => s.hp > 0);
    this.hoplites = this.hoplites.filter(h => h.hp > 0);
    this.archers  = this.archers.filter(a => a.hp > 0);

    // --- Resolve wave / defeat ---
    if (this.wall.hp <= 0) { this._gameOver('The walls of Athens have fallen!'); return; }
    if (this.spartans.length === 0) this._endWave();
  }

  _nearestSpartan(x, y, range) {
    let best = null, bd = range * range;
    for (const s of this.spartans) {
      if (s.hp <= 0) continue;
      const d = dist2(x, y, s.x, s.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ---- Food consumption & starvation -----------------------------------
  _stepFood(dt) {
    const use = (this.hoplites.length * CONFIG.hoplite.foodUse + this.archers.length * CONFIG.archer.foodUse) * dt;
    if (use <= 0) return;
    if (this.goods.food >= use) {
      this.goods.food -= use;
    } else {
      this.goods.food = 0;
      // Starving: soldiers desert occasionally.
      this._starveAcc = (this._starveAcc || 0) + dt;
      if (this._starveAcc >= 3) {
        this._starveAcc = 0;
        const pool = this.hoplites.length ? this.hoplites : this.archers;
        if (pool.length > 0) {
          pool.pop();
          this.toast('A soldier deserted — no food!', 'bad');
        }
      }
    }
  }

  _gameOver(reason) {
    this.over = true;
    this.won = false;
    this.overReason = reason;
    this.toast(reason, 'bad');
  }

  // ======================================================================
  //  SAVE / LOAD
  // ======================================================================
  serialize() {
    return JSON.stringify({
      time: this.time, day: this.day,
      raw: this.raw, goods: this.goods, drachmas: this.drachmas,
      levels: this.levels, wall: this.wall,
      hoplites: this.hoplites.length, archers: this.archers.length,
      waveIndex: this.waveIndex, nextWaveAt: this.nextWaveAt,
      nodes: this.nodes.map(n => n.stock), autoSell: this.autoSell,
    });
  }

  save() {
    try { localStorage.setItem(CONFIG.saveKey, this.serialize()); this.toast('Game saved', 'good'); }
    catch (e) { this.toast('Save failed', 'warn'); }
  }

  load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(CONFIG.saveKey)); } catch (e) { return false; }
    if (!data) return false;
    this.reset();
    this.time = data.time || 0;
    this.day = data.day || 1;
    Object.assign(this.raw, data.raw || {});
    Object.assign(this.goods, data.goods || {});
    this.drachmas = data.drachmas ?? this.drachmas;
    Object.assign(this.levels, data.levels || {});
    this.wall = data.wall || this.wall;
    this.waveIndex = data.waveIndex || 0;
    this.nextWaveAt = data.nextWaveAt || CONFIG.waves.firstWaveAt;
    this.autoSell = data.autoSell ?? true;
    if (Array.isArray(data.nodes)) data.nodes.forEach((s, i) => { if (this.nodes[i]) this.nodes[i].stock = s; });
    // Rebuild defenders from counts.
    this.hoplites = []; this.archers = [];
    this.hireDefenders(data.hoplites || 0, data.archers || 0);
    this.inWave = false; this.spartans = []; this.arrows = [];
    this.toast('Game loaded', 'good');
    return true;
  }

  static hasSave() {
    try { return !!localStorage.getItem(CONFIG.saveKey); } catch (e) { return false; }
  }
}

// ---- small helpers ----------------------------------------------------------
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function round1(v) { return Math.round(v * 10) / 10; }
