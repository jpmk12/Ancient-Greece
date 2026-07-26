// ============================================================================
//  Aegis of Athens — game configuration & balance constants
//  All tunable numbers live here so the rest of the code stays readable.
// ============================================================================

export const CONFIG = {
  // Fixed logical resolution. The canvas is scaled to fit the viewport while
  // the game always thinks in this coordinate space (good for touch mapping).
  world: {
    width: 1024,
    height: 768,
    groundY: 250,   // top of the playable ground (below the sky/wall band)
    wallY: 250,     // the north wall sits here; Spartans march down to it
    seaY: 548,      // sea strip along the bottom (fishing happens here)
  },

  // How often (seconds) the simulation feeds one "tick" of production/economy.
  tickSeconds: 0.1,

  // ---- Raw resources gathered by tapping nodes --------------------------
  resources: {
    olives: { label: 'Olives', color: '#6b8e23', icon: '🫒' },
    grapes: { label: 'Grapes', color: '#7b3f6e', icon: '🍇' },
    fish:   { label: 'Fish',   color: '#3d7ea6', icon: '🐟' },
  },

  // ---- Processed goods produced by city buildings -----------------------
  goods: {
    oil:  { label: 'Olive Oil', color: '#d9a441', icon: '🫗', sell: 9 },
    wine: { label: 'Wine',      color: '#8e2b4c', icon: '🍷', sell: 12 },
    food: { label: 'Food',      color: '#c9772f', icon: '🍞', sell: 0 }, // consumed, not sold
  },

  // Harvest nodes placed on the map. `stock` regenerates over time.
  // Kept clear of the top wall band (y<300) and the bottom UI dock (y>680).
  nodes: [
    { id: 'grove1',  type: 'olives', x: 110, y: 475, r: 46 },
    { id: 'grove2',  type: 'olives', x: 255, y: 500, r: 46 },
    { id: 'vine1',   type: 'grapes', x: 915, y: 475, r: 46 },
    { id: 'vine2',   type: 'grapes', x: 770, y: 500, r: 46 },
    { id: 'dock1',   type: 'fish',   x: 430, y: 615, r: 44 },
    { id: 'dock2',   type: 'fish',   x: 600, y: 615, r: 44 },
  ],

  node: {
    capacity: 12,        // max stock a node can hold
    regenPerSec: 1.1,    // stock regenerated per second
    baseYield: 1,        // resources gained per tap at harvest level 1
  },

  // City buildings. Production buildings convert raw -> goods automatically.
  buildings: {
    agora:   { name: 'Agora',       x: 60,  y: 315, w: 115, h: 95 }, // market: tap to sell goods
    press:   { name: 'Olive Press', x: 235, y: 315, w: 120, h: 95, input: 'olives', output: 'oil'  },
    granary: { name: 'Granary',     x: 430, y: 305, w: 120, h: 105, input: 'fish',  output: 'food' },
    winery:  { name: 'Winery',      x: 625, y: 315, w: 120, h: 95, input: 'grapes', output: 'wine' },
    acropolis: { name: 'Acropolis', x: 815, y: 298, w: 150, h: 112 }, // decorative morale center
  },

  // Base conversion: goods produced per second per building level, and how
  // many raw units each good costs.
  production: {
    ratePerLevel: 0.55,   // goods/sec added per building level
    rawPerGood: 2,        // raw units consumed per 1 good produced
    storageCap: 999,      // soft cap on any single good/resource stockpile
  },

  // ---- Defence -----------------------------------------------------------
  wall: {
    baseMaxHp: 120,
    hpPerLevel: 80,       // added max HP per wall upgrade
    repairPerDrachma: 1.5,// HP restored per drachma when repairing
  },

  hoplite: { hp: 60, atk: 14, range: 14, cost: 40, foodUse: 0.05 },
  archer:  { hp: 34, atk: 9,  range: 230, cooldown: 0.9, cost: 55, foodUse: 0.05 },

  spartan: { hp: 42, atk: 9, speed: 42, radius: 13 },

  // Waves of Spartans. Difficulty scales with the wave index.
  waves: {
    firstWaveAt: 40,      // seconds before the first assault
    interval: 46,         // seconds between assaults
    baseSize: 4,          // Spartans in wave 1
    sizeGrowth: 1.6,      // extra Spartans per subsequent wave
    hpGrowth: 5,          // extra HP per Spartan per wave
    rewardBase: 60,       // drachmas awarded for surviving a wave
    rewardGrowth: 25,     // extra reward per wave
    victoryWave: 12,      // survive this many waves to win the game
  },

  // Food economics: soldiers eat between and during battles.
  food: {
    drainSafetyBuffer: 0, // (reserved)
    desertPerSec: 0.15,   // chance-weight of a soldier deserting when starving
  },

  // ---- Upgrade shop ------------------------------------------------------
  // cost(level) is evaluated to get the price of the *next* level.
  upgrades: {
    harvest:  { name: 'Harvest Tools', desc: '+1 resource per tap',        max: 8,  cost: l => Math.floor(30 * Math.pow(1.7, l)) },
    workers:  { name: 'Hire Gatherers', desc: 'Auto-harvest a node type',  max: 6,  cost: l => Math.floor(80 * Math.pow(1.9, l)) },
    press:    { name: 'Olive Press',   desc: 'Faster olive oil pressing',  max: 8,  cost: l => Math.floor(50 * Math.pow(1.6, l)) },
    winery:   { name: 'Winery',        desc: 'Faster wine making',         max: 8,  cost: l => Math.floor(55 * Math.pow(1.6, l)) },
    granary:  { name: 'Granary',       desc: 'Faster food production',     max: 8,  cost: l => Math.floor(45 * Math.pow(1.6, l)) },
    wall:     { name: 'City Walls',    desc: '+80 max wall HP (repairs)',  max: 8,  cost: l => Math.floor(70 * Math.pow(1.75, l)) },
  },

  // Instant-buy actions (not levelled).
  actions: {
    repair:  { name: 'Repair Wall',  desc: 'Restore wall HP',      cost: 25 },
    hoplite: { name: 'Hire Hoplite', desc: 'Melee wall defender',  cost: 40 },
    archer:  { name: 'Hire Archer',  desc: 'Ranged wall defender', cost: 55 },
  },

  saveKey: 'aegis-of-athens-save-v1',
};
