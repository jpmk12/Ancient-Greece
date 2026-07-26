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
  buildings: [
    { key: 'press',     name: 'Olive Press', kind: 'press',   x: 16, y: 14, w: 3, h: 2 },
    { key: 'winery',    name: 'Winery',      kind: 'winery',  x: 21, y: 14, w: 3, h: 2 },
    { key: 'granary',   name: 'Granary',     kind: 'granary', x: 26, y: 14, w: 3, h: 2 },
    { key: 'agora',     name: 'Agora',       kind: 'agora',   x: 16, y: 21, w: 3, h: 2 },
    { key: 'acropolis', name: 'Acropolis',   kind: 'acropolis', x: 24, y: 19, w: 5, h: 4 },
  ],

  // Decorative countryside props for Phase 1 (become harvest nodes in P2).
  trees: [
    { type: 'olive', x: 6,  y: 9 },  { type: 'olive', x: 9,  y: 21 }, { type: 'olive', x: 5, y: 33 },
    { type: 'olive', x: 8,  y: 5 },  { type: 'olive', x: 3,  y: 16 },
    { type: 'vine',  x: 39, y: 10 }, { type: 'vine',  x: 41, y: 23 }, { type: 'vine',  x: 38, y: 33 },
    { type: 'vine',  x: 40, y: 6 },  { type: 'vine',  x: 43, y: 17 },
    { type: 'olive', x: 20, y: 4 },  { type: 'vine',  x: 27, y: 5 },
  ],

  // The sea occupies cells with y >= this (a coastline along the south).
  seaFromY: 37,

  // Player tuning.
  player: {
    speed: 5.4,        // cells per second
    radius: 0.36,      // collision radius in cells
    start: { x: 23, y: 24 }, // just inside the gate
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
