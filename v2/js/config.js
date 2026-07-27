// ============================================================================
//  Aegis of Athens v2 — isometric, character-driven. Configuration & layout.
//  Phase 1: world layout, walls, gate, buildings, player tuning.
//  Coordinates are in GRID CELLS (floats allowed); the renderer projects them
//  to the screen with an isometric transform.
// ============================================================================

export const CFG = {
  // Isometric tile size in screen pixels (2:1 diamond).
  tile: { w: 64, h: 32 },

  // Map size in cells.
  map: { w: 46, h: 46 },

  // The walled city occupies this outer rectangle (wall ring included).
  city: { x0: 14, y0: 12, x1: 32, y1: 28 },

  // Wall segments (solid), in cell rects {x,y,w,h}. A gap is left on the
  // south wall for the gate.
  walls: [
    { x: 14, y: 12, w: 18, h: 1 },   // north
    { x: 14, y: 27, w: 6,  h: 1 },   // south-left  (x 14..20)
    { x: 24, y: 27, w: 8,  h: 1 },   // south-right (x 24..32)
    { x: 14, y: 13, w: 1,  h: 14 },  // west
    { x: 31, y: 13, w: 1,  h: 14 },  // east
  ],

  // The gate opening (for reference / spawn logic). Not solid.
  gate: { x: 20, y: 27, w: 4, h: 1 },
  gatePosts: [
    { x: 19.4, y: 26.9, w: 0.6, h: 1.1 },
    { x: 24.0, y: 26.9, w: 0.6, h: 1.1 },
  ],

  // City buildings (solid). `kind` drives colour + later gameplay role.
  // Production buildings take a raw input and make a finished good you collect.
  buildings: [
    { key: 'press',     name: 'Olive Press', kind: 'press',   x: 16, y: 14, w: 3, h: 2, input: 'olives', output: 'oil'  },
    { key: 'winery',    name: 'Winery',      kind: 'winery',  x: 21, y: 14, w: 3, h: 2, input: 'grapes', output: 'wine' },
    { key: 'granary',   name: 'Granary',     kind: 'granary', x: 26, y: 14, w: 3, h: 2, input: 'fish',   output: 'food' },
    { key: 'agora',     name: 'Agora',       kind: 'agora',   x: 16, y: 21, w: 3, h: 2, sells: true },
    { key: 'acropolis', name: 'Acropolis',   kind: 'acropolis', x: 24, y: 19, w: 5, h: 4 },
  ],

  // Harvest nodes (centre coords in cells). You walk up to gather from them.
  nodes: [
    { type: 'olives', x: 6.5,  y: 9.5 },  { type: 'olives', x: 9.5,  y: 21.5 }, { type: 'olives', x: 5.5, y: 33.5 },
    { type: 'olives', x: 8.5,  y: 5.5 },  { type: 'olives', x: 3.5,  y: 16.5 }, { type: 'olives', x: 20.5, y: 4.5 },
    { type: 'grapes', x: 39.5, y: 10.5 }, { type: 'grapes', x: 41.5, y: 23.5 }, { type: 'grapes', x: 38.5, y: 33.5 },
    { type: 'grapes', x: 40.5, y: 6.5 },  { type: 'grapes', x: 43.5, y: 17.5 }, { type: 'grapes', x: 27.5, y: 4.5 },
    { type: 'fish',   x: 11.5, y: 36.5 }, { type: 'fish',   x: 19.5, y: 36.5 }, { type: 'fish',   x: 28.5, y: 36.5 },
    { type: 'fish',   x: 35.5, y: 36.5 },
  ],

  // Purely decorative scenery.
  decoTrees: [
    { type: 'olive', x: 2, y: 6 }, { type: 'olive', x: 44, y: 12 }, { type: 'olive', x: 33, y: 3 },
    { type: 'vine',  x: 2, y: 28 }, { type: 'vine', x: 44, y: 31 },
  ],

  node:    { max: 16, regen: 1.3 },        // stock capacity + regen/sec
  gather:  { range: 1.6, interval: 0.15 }, // proximity + seconds per unit
  deposit: { range: 1.8, interval: 0.10 }, // proximity + seconds per unit (drop off + pick up)
  sell:    { interval: 0.09 },             // seconds per unit sold at the Agora

  // Workshop processing: raw input -> finished good.
  production: { ratePerSec: 0.75, rawPerGood: 2, outputCap: 30 },
  startDrachmas: 30,

  // ---- Defence (Phase 4) ----
  wall: { maxHp: 240, hpPerLevel: 90 },
  // Spartans mass just north of the wall (which sits at cell y=12) and batter it.
  spartan: { hp: 40, speed: 1.7, atkWall: 6, atkPlayer: 9, radius: 0.42, aggro: 2.2, stopY: 11.1 },
  hoplite: { hp: 65, atk: 16, range: 1.6, foodUse: 0.03 },
  archer:  { hp: 34, atk: 10, cooldown: 1.0, range: 7, foodUse: 0.03 },
  playerCombat: { atk: 24, range: 1.5, cooldown: 0.5, maxHealth: 100, regen: 5, invuln: 2.2 },
  waves: {
    firstWaveAt: 70, interval: 70,
    baseSize: 4, sizeGrowth: 1.5, hpGrowth: 6,
    victoryWave: 10, rewardBase: 50, rewardGrowth: 20,
  },
  cityFood: { start: 20, desertEvery: 4 },   // soldiers eat; empty larder -> desertion
  costs: { hoplite: 40, archer: 55, repair: 25, repairHp: 60 },
  // Where hired defenders stand along the north wall (y=12).
  defenders: { hopY: 12.5, arcY: 13.7, xMin: 15.5, xMax: 30.5 },

  // ---- Progression (Phase 5) ----
  // level starts at the given base; cost(l) is the price to buy the next level.
  upgrades: {
    carry:   { name: 'Bigger Pack',    desc: '+6 backpack capacity',  base: 0, max: 6, step: 6,    cost: l => Math.floor(40 * Math.pow(1.7, l)) },
    speed:   { name: 'Swift Sandals',  desc: '+12% move speed',       base: 0, max: 6,             cost: l => Math.floor(55 * Math.pow(1.7, l)) },
    press:   { name: 'Olive Press',    desc: 'Faster oil pressing',   base: 1, max: 6,             cost: l => Math.floor(50 * Math.pow(1.6, l - 1)) },
    winery:  { name: 'Winery',         desc: 'Faster wine making',    base: 1, max: 6,             cost: l => Math.floor(55 * Math.pow(1.6, l - 1)) },
    granary: { name: 'Granary',        desc: 'Faster food production',base: 1, max: 6,             cost: l => Math.floor(45 * Math.pow(1.6, l - 1)) },
    wall:    { name: 'City Walls',     desc: '+90 max wall HP',       base: 1, max: 6, step: 90,   cost: l => Math.floor(70 * Math.pow(1.7, l - 1)) },
  },

  // Autonomous logistics NPCs.
  porters: {
    gatherCost: 90, tradeCost: 120, maxEach: 4,
    speed: 3.6, cap: 8, reach: 0.8,
  },

  saveKey: 'aegis-of-athens-v2-save',

  // The sea occupies cells with y >= this (a coastline along the south).
  seaFromY: 37,

  // Player tuning.
  player: {
    speed: 6.0,        // cells per second
    radius: 0.36,      // collision radius in cells
    carryCap: 15,      // backpack capacity (total units across all types)
    start: { x: 23, y: 24 }, // just inside the gate
  },

  resourceMeta: {
    olives: { icon: '🫒', color: '#6b8e23', label: 'Olives' },
    grapes: { icon: '🍇', color: '#7b3f6e', label: 'Grapes' },
    fish:   { icon: '🐟', color: '#3d7ea6', label: 'Fish'   },
  },

  // Finished goods produced by the workshops and sold at the Agora.
  goodsMeta: {
    oil:  { icon: '🫗', color: '#d9a441', label: 'Olive Oil', sell: 9  },
    wine: { icon: '🍷', color: '#8e2b4c', label: 'Wine',      sell: 12 },
    food: { icon: '🍞', color: '#c9772f', label: 'Food',      sell: 4  },
  },

  colors: {
    grass:   ['#9bbd5e', '#93b657'],
    grassEdge: '#7fa049',
    stone:   ['#cbb98f', '#c3b085'],
    stoneEdge: '#a99a72',
    sea:     ['#3f86ad', '#3778a0'],
    seaEdge: '#2f6588',
    wallTop: '#d8d2c0', wallLeft: '#9c937d', wallRight: '#b8b09a',
    buildings: {
      press:   { top: '#e0c07a', left: '#9c7f42', right: '#c4a25c' },
      winery:  { top: '#b56a86', left: '#6f3a50', right: '#93546f' },
      granary: { top: '#d7a860', left: '#9a7132', right: '#bd8f48' },
      agora:   { top: '#e6d89a', left: '#a99450', right: '#ccb96e' },
      acropolis: { top: '#efe9d6', left: '#b3a988', right: '#d8cfb0' },
    },
  },
};
