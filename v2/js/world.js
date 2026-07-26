// ============================================================================
//  Aegis of Athens v2 — world module: isometric projection, camera, tile map,
//  collision, and low-level iso drawing helpers (diamonds & prisms).
// ============================================================================

import { CFG } from './config.js';

const TW = CFG.tile.w, TH = CFG.tile.h;
const HW = TW / 2, HH = TH / 2;

// ---- Isometric projection -------------------------------------------------
// World (cell) coords -> screen-space offsets from the world origin (before
// the camera translate is applied by the renderer).
export function proj(wx, wy) {
  return { x: (wx - wy) * HW, y: (wx + wy) * HH };
}

// Screen-space movement direction -> world-space direction (inverse of proj).
// Lets the joystick move the character intuitively (screen-relative).
export function screenDirToWorld(sdx, sdy) {
  return { x: sdx / TW + sdy / TH, y: -sdx / TW + sdy / TH };
}

// ---- Camera ---------------------------------------------------------------
export const camera = { x: 0, y: 0 };

export function updateCamera(px, py, viewW, viewH) {
  const p = proj(px, py);
  let ox = viewW / 2 - p.x;
  let oy = viewH / 2 - p.y - 20; // bias so the player sits a touch below centre

  // World projected bounds (+ padding for building height at the top).
  const pad = 120;
  const minPX = -CFG.map.h * HW - pad, maxPX = CFG.map.w * HW + pad;
  const minPY = -pad - 90, maxPY = (CFG.map.w + CFG.map.h) * HH + pad;

  ox = clampCamera(ox, viewW, minPX, maxPX);
  oy = clampCamera(oy, viewH, minPY, maxPY);
  camera.x = ox; camera.y = oy;
}

function clampCamera(offset, view, minP, maxP) {
  const lo = view - maxP; // rightmost/bottom-most limit
  const hi = -minP;       // leftmost/top-most limit
  if (lo > hi) return (view - (minP + maxP)) / 2; // world smaller than view -> centre
  return Math.max(lo, Math.min(hi, offset));
}

// ---- Tile classification --------------------------------------------------
export function tileType(cx, cy) {
  if (cy >= CFG.seaFromY) return 'sea';
  const c = CFG.city;
  if (cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1) return 'stone';
  return 'grass';
}

// ---- Collision ------------------------------------------------------------
// All solid rects (walls + buildings + gate posts) in cell coords.
export const solids = [
  ...CFG.walls,
  ...CFG.gatePosts,
  ...CFG.buildings.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
];

// Circle (cx,cy,r) vs any solid rect. Also keeps the player on the map.
export function collides(cx, cy, r) {
  if (cx < r || cy < r || cx > CFG.map.w - r || cy > CFG.map.h - r) return true;
  // The sea is impassable — you gather fish from the shore, not the water.
  if (tileType(Math.floor(cx), Math.floor(cy)) === 'sea') return true;
  for (const s of solids) {
    const nx = Math.max(s.x, Math.min(cx, s.x + s.w));
    const ny = Math.max(s.y, Math.min(cy, s.y + s.h));
    const dx = cx - nx, dy = cy - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function insideCity(cx, cy) {
  const c = CFG.city;
  return cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1;
}

// ---- Iso drawing helpers --------------------------------------------------
// A flat diamond covering one tile at cell (cx,cy).
export function tileDiamond(ctx, cx, cy) {
  const a = proj(cx, cy), b = proj(cx + 1, cy), c = proj(cx + 1, cy + 1), d = proj(cx, cy + 1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

// A raised iso box (prism) for a rect footprint with a given pixel height.
// Draws the two front faces then the top.
export function drawPrism(ctx, rect, height, top, left, right) {
  const { x, y, w, h } = rect;
  const A = proj(x, y), B = proj(x + w, y), C = proj(x + w, y + h), D = proj(x, y + h);
  const At = { x: A.x, y: A.y - height }, Bt = { x: B.x, y: B.y - height };
  const Ct = { x: C.x, y: C.y - height }, Dt = { x: D.x, y: D.y - height };

  // Left face (edge D–C, the y+h side).
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y); ctx.lineTo(Ct.x, Ct.y); ctx.lineTo(Dt.x, Dt.y);
  ctx.closePath(); ctx.fill();

  // Right face (edge B–C, the x+w side).
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(Ct.x, Ct.y); ctx.lineTo(Bt.x, Bt.y);
  ctx.closePath(); ctx.fill();

  // Top face.
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(At.x, At.y); ctx.lineTo(Bt.x, Bt.y); ctx.lineTo(Ct.x, Ct.y); ctx.lineTo(Dt.x, Dt.y);
  ctx.closePath(); ctx.fill();
}

// Depth key for painter's-order sorting: the footprint's front-most corner.
export function depthOf(rect) { return (rect.x + rect.w) + (rect.y + rect.h); }
