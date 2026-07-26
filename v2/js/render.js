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
  const g = state.game;
  const items = [];

  for (const c of wallCells) items.push({ depth: depthOf(c), fn: () => drawWall(ctx, c) });
  for (const p of CFG.gatePosts) items.push({ depth: depthOf(p), fn: () => drawPost(ctx, p) });
  for (const b of CFG.buildings) items.push({ depth: depthOf(b), fn: () => drawBuilding(ctx, b, g) });
  for (const t of CFG.decoTrees) items.push({ depth: t.x + t.y, fn: () => drawTree(ctx, t, state.time) });
  for (const n of g.nodes) items.push({ depth: n.x + n.y, fn: () => drawNode(ctx, n, g, state.time) });

  const pl = state.player;
  items.push({ depth: pl.x + pl.y, fn: () => drawPlayer(ctx, pl) });

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.fn();

  drawFloaters(ctx, g);
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

function drawBuilding(ctx, b, g) {
  const c = CFG.colors.buildings[b.kind] || CFG.colors.buildings.agora;
  const height = b.kind === 'acropolis' ? 60 : 40;

  // Highlight the workshop you're unloading into, or the Agora while selling.
  const active = g && (g._activeBuilding === b.key || (b.sells && g._sellingNow));
  if (active) {
    ctx.save();
    ctx.shadowColor = 'rgba(150,255,130,0.9)';
    ctx.shadowBlur = 22;
    drawPrism(ctx, b, height, c.top, c.left, c.right);
    ctx.restore();
  } else {
    drawPrism(ctx, b, height, c.top, c.left, c.right);
  }
  drawColumns(ctx, b, height, Math.max(3, Math.round(b.h * 2)));

  const center = proj(b.x + b.w / 2, b.y + b.h / 2);
  const topY = center.y - height;

  // simple pediment tint on the top face
  ctx.fillStyle = '#8d4a3a';
  const a = proj(b.x, b.y), bb = proj(b.x + b.w, b.y), cc = proj(b.x + b.w, b.y + b.h), dd = proj(b.x, b.y + b.h);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - height); ctx.lineTo(bb.x, bb.y - height);
  ctx.lineTo(cc.x, cc.y - height); ctx.lineTo(dd.x, dd.y - height);
  ctx.closePath();
  ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#3a2c18';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(iconFor(b.kind) + ' ' + b.name, center.x, topY - 20);

  // Readout tag: production buffers (input ▸ output), or the Agora sell prompt.
  if (b.input && g && g.buildings[b.key]) {
    const bb = g.buildings[b.key];
    const im = CFG.resourceMeta[b.input], om = CFG.goodsMeta[b.output];
    drawTag(ctx, center.x, topY, `${im.icon}${Math.floor(bb.stock)}  ▸  ${om.icon}${Math.floor(bb.outStock)}`);
  } else if (b.sells && g) {
    drawTag(ctx, center.x, topY, g._sellingNow ? '💰 selling…' : '💰 sell goods');
  }
  ctx.textAlign = 'left';
}

function drawTag(ctx, cx, topY, label) {
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(label).width + 16;
  ctx.fillStyle = 'rgba(20,14,6,0.74)';
  roundRect(ctx, cx - w / 2, topY - 14, w, 20, 10); ctx.fill();
  ctx.fillStyle = '#e8c86a';
  ctx.fillText(label, cx, topY);
}

// ---- Harvest nodes (olive grove / vineyard / fishing dock) ----------------
function drawNode(ctx, n, g, time) {
  const p = proj(n.x, n.y);
  const frac = n.stock / n.max;
  const active = g._activeNode && g._activeNode.id === n.id;

  // "in range" dashed ring while gathering
  if (active) {
    const spin = time * 1.2;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(1, 0.5); ctx.rotate(spin);
    ctx.strokeStyle = 'rgba(150,255,130,0.9)';
    ctx.lineWidth = 4; ctx.setLineDash([12, 9]);
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 8, 0, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = n.stock < 1 ? 0.45 : 1;
  if (n.type === 'fish') drawDock(ctx, p, time, frac);
  else drawFoliage(ctx, p, n.type === 'grapes' ? 'vine' : 'olive', time, n.x, frac);
  ctx.globalAlpha = 1;

  // stock bar
  const bw = 34, bx = p.x - bw / 2, by = p.y + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, bx - 2, by - 2, bw + 4, 8, 3); ctx.fill();
  ctx.fillStyle = frac > 0.25 ? '#8fce6b' : '#d9a441';
  roundRect(ctx, bx, by, bw * frac, 4, 2); ctx.fill();
}

function drawFoliage(ctx, p, kind, time, seed, frac) {
  ctx.fillStyle = '#7a5433';
  ctx.fillRect(p.x - 3, p.y - 26, 6, 26);
  const sway = Math.sin(time * 1.3 + seed) * 1.5;
  const s = 0.7 + 0.3 * frac; // shrink a little when depleted
  if (kind === 'vine') {
    ctx.fillStyle = '#4f8a3f';
    blob(ctx, p.x + sway, p.y - 34, 15 * s);
    ctx.fillStyle = '#7b3f6e';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 9 + sway, p.y - 32 + Math.sin(a) * 7, 3.4 * s, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = '#5f7d3a';
    blob(ctx, p.x - 10 + sway, p.y - 34, 16 * s); blob(ctx, p.x + 10 + sway, p.y - 30, 14 * s); blob(ctx, p.x + sway, p.y - 46, 17 * s);
    ctx.fillStyle = '#4a642c';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 12 + sway, p.y - 40 + Math.sin(a) * 9, 2.6 * s, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawDock(ctx, p, time, frac) {
  // little pier planks extending toward the water (down-screen)
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(p.x - 16, p.y - 4, 32, 8);
  ctx.fillStyle = '#6f5330';
  for (let i = -1; i <= 1; i++) ctx.fillRect(p.x + i * 12 - 1, p.y + 2, 3, 12);
  // ripples + fish
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  const t = time * 3;
  for (let i = 0; i < 2; i++) { const rr = ((t + i * 0.7) % 1.4) * 18; ctx.globalAlpha = Math.max(0, (frac > 0 ? 1 : 0.3) - rr / 26); ctx.beginPath(); ctx.ellipse(p.x, p.y + 16, rr + 4, (rr + 4) * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🐟', p.x, p.y - 8); ctx.textAlign = 'left';
}

function drawFloaters(ctx, g) {
  ctx.textAlign = 'center';
  for (const f of g.floaters) {
    const p = proj(f.x, f.y);
    const t = f.t / f.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#000'; ctx.fillText(f.text, p.x + 1, p.y - 30 - t * 26 + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, p.y - 30 - t * 26);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
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

  // Carry bubble above the head (shows the load you're hauling).
  if (pl.carried > 0) {
    let domType = 'olives', domN = -1;
    for (const k of ['olives', 'grapes', 'fish', 'oil', 'wine', 'food']) if (pl.carry[k] > domN) { domN = pl.carry[k]; domType = k; }
    const icon = (CFG.resourceMeta[domType] || CFG.goodsMeta[domType]).icon;
    const label = `${icon} ${pl.carried}`;
    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 16;
    const by = p.y - 74;
    ctx.fillStyle = pl.full ? 'rgba(160,60,40,0.92)' : 'rgba(20,14,6,0.82)';
    roundRect(ctx, p.x - w / 2, by, w, 22, 11); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, p.x, by + 16);
    ctx.textAlign = 'left';
  }
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
  const g = state.game, pl = state.player;
  ctx.save();
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';

  // location banner
  const label = pl.inside ? '🏛  Inside the Walls' : '🌾  Outside — the Countryside';
  ctx.fillStyle = 'rgba(20,14,6,0.72)';
  const tw = ctx.measureText(label).width + 28;
  roundRect(ctx, viewW / 2 - tw / 2, 12, tw, 30, 15); ctx.fill();
  ctx.fillStyle = pl.inside ? '#e8c86a' : '#bfe08a';
  ctx.fillText(label, viewW / 2, 32);

  // transient hint (e.g. "Backpack full")
  if (g.hint) {
    ctx.globalAlpha = Math.max(0, 1 - g.hint.t / 2.4);
    ctx.fillStyle = 'rgba(160,60,40,0.9)';
    const hw = ctx.measureText(g.hint.text).width + 26;
    roundRect(ctx, viewW / 2 - hw / 2, 50, hw, 28, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(g.hint.text, viewW / 2, 69);
    ctx.globalAlpha = 1;
  }

  // control hint (fades early)
  if (state.time < 14) {
    ctx.globalAlpha = Math.max(0, 1 - state.time / 14);
    ctx.fillStyle = 'rgba(20,14,6,0.6)';
    const hint = 'Walk to a grove, vineyard or dock to gather  •  bring it to the workshops';
    const hw = ctx.measureText(hint).width + 24;
    roundRect(ctx, viewW / 2 - hw / 2, viewH - 52, hw, 30, 15); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(hint, viewW / 2, viewH - 32);
    ctx.globalAlpha = 1;
  }

  drawDrachmas(ctx, g, viewW);
  drawBackpack(ctx, pl, viewH);
  ctx.restore();
  ctx.textAlign = 'left';
}

// Top-right coin purse.
function drawDrachmas(ctx, g, viewW) {
  const label = `🪙 ${Math.floor(g.drachmas)}`;
  ctx.font = 'bold 17px system-ui, sans-serif';
  const w = ctx.measureText(label).width + 26;
  const x = viewW - w - 16, y = 12;
  ctx.fillStyle = 'rgba(20,14,6,0.82)';
  roundRect(ctx, x, y, w, 34, 17); ctx.fill();
  ctx.strokeStyle = 'rgba(232,200,106,0.6)'; ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, 34, 17); ctx.stroke();
  ctx.fillStyle = '#e8c86a'; ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 23);
}

// Bottom-left backpack panel: raw + goods counts and a capacity bar.
function drawBackpack(ctx, pl, viewH) {
  const x = 16, y = viewH - 116, w = 224, h = 100;
  ctx.fillStyle = 'rgba(20,14,6,0.82)';
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = pl.full ? '#e05a4f' : 'rgba(232,200,106,0.5)';
  ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, 12); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#e8c86a';
  ctx.fillText('🎒 Backpack', x + 12, y + 20);
  ctx.textAlign = 'right';
  ctx.fillStyle = pl.full ? '#e05a4f' : '#cdbf98';
  ctx.fillText(`${pl.carried} / ${pl.carryCap}`, x + w - 12, y + 20);

  // two rows: raw resources, then finished goods
  ctx.textAlign = 'left';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  const raw = [['🫒', pl.carry.olives], ['🍇', pl.carry.grapes], ['🐟', pl.carry.fish]];
  const goods = [['🫗', pl.carry.oil], ['🍷', pl.carry.wine], ['🍞', pl.carry.food]];
  raw.forEach(([ic, n], i) => ctx.fillText(`${ic} ${n}`, x + 14 + i * 70, y + 44));
  goods.forEach(([ic, n], i) => ctx.fillText(`${ic} ${n}`, x + 14 + i * 70, y + 66));

  // capacity bar
  const bw = w - 24, bx = x + 12, by = y + 80;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(ctx, bx, by, bw, 8, 4); ctx.fill();
  ctx.fillStyle = pl.full ? '#e05a4f' : '#8fce6b';
  roundRect(ctx, bx, by, bw * (pl.carried / pl.carryCap), 8, 4); ctx.fill();
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
