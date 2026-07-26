// ============================================================================
//  Aegis of Athens v2 — isometric renderer. Draws the tile ground, then all
//  raised objects (walls, buildings, trees, player) in painter's depth order.
// ============================================================================

import { CFG } from './config.js';
import { proj, camera, tileType, tileDiamond, drawPrism, depthOf } from './world.js';
import { joystick } from './input.js';

const TW = CFG.tile.w, TH = CFG.tile.h;

// Pre-expand walls into unit cells for accurate depth sorting.
const wallCells = [];
for (const w of CFG.walls) {
  for (let x = 0; x < w.w; x++) for (let y = 0; y < w.h; y++) {
    wallCells.push({ x: w.x + x, y: w.y + y, w: 1, h: 1 });
  }
}

export function render(ctx, state, viewW, viewH) {
  ctx.clearRect(0, 0, viewW, viewH);
  drawSkyGradient(ctx, viewW, viewH);

  ctx.save();
  ctx.translate(camera.x, camera.y);

  drawGround(ctx, viewW, viewH);
  drawObjects(ctx, state);

  ctx.restore();

  drawJoystick(ctx);
  drawHud(ctx, state, viewW, viewH);
}

// ---- Background -----------------------------------------------------------
function drawSkyGradient(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#bfe0f0');
  g.addColorStop(1, '#e9f2e0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---- Ground tiles (culled to the viewport) --------------------------------
function drawGround(ctx, viewW, viewH) {
  const C = CFG.colors;
  for (let cy = 0; cy < CFG.map.h; cy++) {
    for (let cx = 0; cx < CFG.map.w; cx++) {
      const p = proj(cx + 0.5, cy + 0.5);
      const sx = p.x + camera.x, sy = p.y + camera.y;
      if (sx < -TW || sx > viewW + TW || sy < -TH * 2 || sy > viewH + TH * 2) continue;

      const t = tileType(cx, cy);
      const pair = t === 'sea' ? C.sea : t === 'stone' ? C.stone : C.grass;
      const edge = t === 'sea' ? C.seaEdge : t === 'stone' ? C.stoneEdge : C.grassEdge;
      tileDiamond(ctx, cx, cy);
      ctx.fillStyle = pair[(cx + cy) & 1];
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ---- Depth-sorted objects -------------------------------------------------
function drawObjects(ctx, state) {
  const items = [];

  for (const c of wallCells) items.push({ depth: depthOf(c), fn: () => drawWall(ctx, c) });
  for (const p of CFG.gatePosts) items.push({ depth: depthOf(p), fn: () => drawPost(ctx, p) });
  for (const b of CFG.buildings) items.push({ depth: depthOf(b), fn: () => drawBuilding(ctx, b) });
  for (const t of CFG.trees) items.push({ depth: t.x + t.y, fn: () => drawTree(ctx, t, state.time) });

  const pl = state.player;
  items.push({ depth: pl.x + pl.y, fn: () => drawPlayer(ctx, pl) });

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.fn();
}

function drawWall(ctx, c) {
  const col = CFG.colors;
  drawPrism(ctx, c, 34, col.wallTop, col.wallLeft, col.wallRight);
  // crenellation nub on the top-front corner
  const t = proj(c.x + c.w, c.y + c.h);
  ctx.fillStyle = col.wallTop;
  ctx.fillRect(t.x - 4, t.y - 34 - 8, 8, 8);
}

function drawPost(ctx, p) {
  drawPrism(ctx, p, 42, '#b9a074', '#7c6338', '#9a8355');
}

function drawBuilding(ctx, b) {
  const c = CFG.colors.buildings[b.kind] || CFG.colors.buildings.agora;
  const height = b.kind === 'acropolis' ? 60 : 40;
  drawPrism(ctx, b, height, c.top, c.left, c.right);
  drawColumns(ctx, b, height, Math.max(3, Math.round(b.h * 2)));

  // roof + label on the top face
  const center = proj(b.x + b.w / 2, b.y + b.h / 2);
  const topY = center.y - height;

  // simple pediment roof
  ctx.fillStyle = '#8d4a3a';
  const a = proj(b.x, b.y), bb = proj(b.x + b.w, b.y), cc = proj(b.x + b.w, b.y + b.h), dd = proj(b.x, b.y + b.h);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - height); ctx.lineTo(bb.x, bb.y - height);
  ctx.lineTo(cc.x, cc.y - height); ctx.lineTo(dd.x, dd.y - height);
  ctx.closePath();
  ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;

  ctx.fillStyle = '#3a2c18';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(iconFor(b.kind) + ' ' + b.name, center.x, topY - 6);
  ctx.textAlign = 'left';
}

// Greek column detailing on the visible front (right) face of a building.
function drawColumns(ctx, b, height, n) {
  const B = proj(b.x + b.w, b.y), C = proj(b.x + b.w, b.y + b.h);
  ctx.lineWidth = 3;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const bx = B.x + (C.x - B.x) * t, by = B.y + (C.y - B.y) * t;
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by - height + 5); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath(); ctx.moveTo(bx + 2, by - 5); ctx.lineTo(bx + 2, by - height + 5); ctx.stroke();
  }
}

function iconFor(kind) {
  return { press: '🫗', winery: '🍷', granary: '🍞', agora: '🏛', acropolis: '🏛' }[kind] || '🏠';
}

function drawTree(ctx, t, time) {
  const p = proj(t.x + 0.5, t.y + 0.5);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
  // trunk
  ctx.fillStyle = '#7a5433';
  ctx.fillRect(p.x - 3, p.y - 26, 6, 26);
  const sway = Math.sin(time * 1.3 + t.x) * 1.5;
  if (t.type === 'vine') {
    ctx.fillStyle = '#4f8a3f';
    blob(ctx, p.x + sway, p.y - 34, 15);
    ctx.fillStyle = '#7b3f6e';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 9 + sway, p.y - 32 + Math.sin(a) * 7, 3.4, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = '#5f7d3a';
    blob(ctx, p.x - 10 + sway, p.y - 34, 16); blob(ctx, p.x + 10 + sway, p.y - 30, 14); blob(ctx, p.x + sway, p.y - 46, 17);
    ctx.fillStyle = '#4a642c';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 12 + sway, p.y - 40 + Math.sin(a) * 9, 2.6, 0, Math.PI * 2); ctx.fill(); }
  }
}

// ---- The player character -------------------------------------------------
function drawPlayer(ctx, pl) {
  const p = proj(pl.x, pl.y);
  const bob = pl.moving ? Math.abs(Math.sin(pl.walkPhase)) * 2.5 : 0;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 8, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(p.x, p.y - bob);
  ctx.scale(pl.faceX * 1.35, 1.35);

  const legSwing = pl.moving ? Math.sin(pl.walkPhase) * 3 : 0;
  // legs
  ctx.fillStyle = '#7a5433';
  ctx.fillRect(-5 + legSwing, -10, 4, 10);
  ctx.fillRect(1 - legSwing, -10, 4, 10);
  // tunic (chiton)
  ctx.fillStyle = '#efe4c8';
  roundRect(ctx, -8, -26, 16, 18, 4); ctx.fill();
  // himation drape (Athenian blue-purple)
  ctx.fillStyle = '#3f5b8c';
  ctx.beginPath();
  ctx.moveTo(-8, -24); ctx.lineTo(6, -24); ctx.lineTo(-2, -8); ctx.lineTo(-8, -8);
  ctx.closePath(); ctx.fill();
  // arm
  ctx.fillStyle = '#e8c9a0';
  ctx.fillRect(5, -24, 4, 12);
  // head
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(0, -30, 5.5, 0, Math.PI * 2); ctx.fill();
  // hair / traveller's petasos hat
  ctx.fillStyle = '#5a4327';
  ctx.beginPath(); ctx.arc(0, -32, 6, Math.PI, 0); ctx.fill();
  ctx.fillRect(-8, -32, 16, 2);

  ctx.restore();
}

// ---- Screen-space overlays ------------------------------------------------
function drawJoystick(ctx) {
  if (!joystick.active) return;
  ctx.save();
  ctx.globalAlpha = 0.85;
  // base
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joystick.originX, joystick.originY, 62, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(joystick.originX, joystick.originY, 62, 0, Math.PI * 2); ctx.fill();
  // knob
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(joystick.curX, joystick.curY, 26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHud(ctx, state, viewW, viewH) {
  ctx.save();
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  // location banner
  const label = state.player.inside ? '🏛  Inside the Walls' : '🌾  Outside — the Countryside';
  ctx.fillStyle = 'rgba(20,14,6,0.72)';
  const tw = ctx.measureText(label).width + 28;
  roundRect(ctx, viewW / 2 - tw / 2, 12, tw, 30, 15); ctx.fill();
  ctx.fillStyle = state.player.inside ? '#e8c86a' : '#bfe08a';
  ctx.fillText(label, viewW / 2, 32);

  // control hint (fades once the player has moved)
  if (state.time < 12) {
    ctx.globalAlpha = Math.max(0, 1 - state.time / 12);
    ctx.fillStyle = 'rgba(20,14,6,0.6)';
    const hint = 'Drag anywhere to walk  •  or use W A S D  •  head through the gate ↓';
    const hw = ctx.measureText(hint).width + 24;
    roundRect(ctx, viewW / 2 - hw / 2, viewH - 52, hw, 30, 15); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(hint, viewW / 2, viewH - 32);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---- helpers --------------------------------------------------------------
function blob(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
