// ============================================================================
//  Aegis of Athens — canvas renderer. Pure drawing from Game state; no logic.
//  Everything is drawn with primitives so the game needs zero image assets.
// ============================================================================

import { CONFIG } from './config.js';

export function render(ctx, game) {
  const W = CONFIG.world.width, H = CONFIG.world.height;
  ctx.clearRect(0, 0, W, H);

  drawSky(ctx, game);
  drawGround(ctx);
  drawSea(ctx, game);
  drawWall(ctx, game);
  drawBuildings(ctx, game);
  drawNodes(ctx, game);
  drawDefenders(ctx, game);
  drawSpartans(ctx, game);
  drawArrows(ctx, game);
  drawParticles(ctx, game);
  drawFloaters(ctx, game);
  drawWaveBanner(ctx, game);
}

// ---------------------------------------------------------------------------
function drawSky(ctx, game) {
  const W = CONFIG.world.width, wy = CONFIG.world.wallY;
  const danger = game.inWave ? Math.min(1, game.spartans.length / 10) : 0;
  const g = ctx.createLinearGradient(0, 0, 0, wy);
  g.addColorStop(0, mix('#7fb2e6', '#7a5a63', danger * 0.6));
  g.addColorStop(1, mix('#cfe4f5', '#d8b48f', danger * 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, wy);

  // distant hills of Attica
  ctx.fillStyle = 'rgba(150,168,140,0.55)';
  hill(ctx, 0, wy, 180, 90); hill(ctx, 260, wy, 220, 120); hill(ctx, 560, wy, 200, 100); hill(ctx, 820, wy, 240, 130);
  // sun
  ctx.fillStyle = 'rgba(255,244,214,0.9)';
  ctx.beginPath(); ctx.arc(880, 70, 34, 0, Math.PI * 2); ctx.fill();
}

function hill(ctx, x, base, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + w / 2, base - h, x + w, base);
  ctx.closePath(); ctx.fill();
}

function drawGround(ctx) {
  const W = CONFIG.world.width, H = CONFIG.world.height, wy = CONFIG.world.wallY;
  const g = ctx.createLinearGradient(0, wy, 0, H);
  g.addColorStop(0, '#cdb47e');
  g.addColorStop(1, '#b89a63');
  ctx.fillStyle = g;
  ctx.fillRect(0, wy, W, H - wy);
  // subtle soil texture rows
  ctx.strokeStyle = 'rgba(120,96,52,0.18)';
  ctx.lineWidth = 1;
  for (let y = wy + 40; y < H; y += 34) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 6); ctx.stroke();
  }
}

function drawSea(ctx, game) {
  const W = CONFIG.world.width, H = CONFIG.world.height, sy = CONFIG.world.seaY;
  const g = ctx.createLinearGradient(0, sy, 0, H);
  g.addColorStop(0, '#3f86ad');
  g.addColorStop(1, '#245b7d');
  ctx.fillStyle = g;
  ctx.fillRect(0, sy, W, H - sy);
  // gentle waves
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  const t = game.time;
  for (let row = 0; row < 3; row++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) {
      const y = sy + 18 + row * 32 + Math.sin((x / 40) + t * 2 + row) * 3;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---- North wall & gate ----------------------------------------------------
function drawWall(ctx, game) {
  const W = CONFIG.world.width, wy = CONFIG.world.wallY;
  const h = 26;
  const pct = game.wall.hp / game.wall.maxHp;
  // wall body
  ctx.fillStyle = '#c9c2b0';
  ctx.fillRect(0, wy - h, W, h);
  ctx.fillStyle = '#a89e86';
  ctx.fillRect(0, wy - 6, W, 6);
  // crenellations
  ctx.fillStyle = '#c9c2b0';
  for (let x = 0; x < W; x += 44) ctx.fillRect(x, wy - h - 12, 26, 12);
  // brick lines
  ctx.strokeStyle = 'rgba(90,80,64,0.4)'; ctx.lineWidth = 1;
  for (let x = 22; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, wy - h); ctx.lineTo(x, wy); ctx.stroke(); }
  // damage cracks scale with lost HP
  if (pct < 0.85) {
    ctx.strokeStyle = 'rgba(60,40,30,0.55)'; ctx.lineWidth = 2;
    const cracks = Math.round((1 - pct) * 10);
    for (let i = 0; i < cracks; i++) {
      const bx = ((i * 137) % (W - 40)) + 20;
      ctx.beginPath(); ctx.moveTo(bx, wy - h); ctx.lineTo(bx + 8, wy - h / 2); ctx.lineTo(bx - 4, wy); ctx.stroke();
    }
  }
  // HP bar on the wall
  const barW = 220, bx = W / 2 - barW / 2, by = wy - h - 26;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, bx - 3, by - 3, barW + 6, 14, 4); ctx.fill();
  ctx.fillStyle = pct > 0.5 ? '#6fbf73' : pct > 0.25 ? '#d9a441' : '#d05a4f';
  roundRect(ctx, bx, by, barW * pct, 8, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`WALLS  ${Math.ceil(game.wall.hp)} / ${game.wall.maxHp}`, W / 2, by - 6);
  ctx.textAlign = 'left';
}

// ---- City buildings -------------------------------------------------------
function drawBuildings(ctx, game) {
  const B = CONFIG.buildings;
  drawAcropolis(ctx, B.acropolis);
  drawTempleBuilding(ctx, B.press, '#caa46a', '🫗', 'Press', game.levels.press);
  drawTempleBuilding(ctx, B.winery, '#9c5b78', '🍷', 'Winery', game.levels.winery);
  drawTempleBuilding(ctx, B.granary, '#b78a4e', '🍞', 'Granary', game.levels.granary);
  drawAgora(ctx, B.agora, game);
}

function drawTempleBuilding(ctx, b, color, icon, label, level) {
  const { x, y, w, h } = b;
  // body
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, -18);
  ctx.fillRect(x, y + h - 12, w, 12);
  // roof
  ctx.fillStyle = '#8d4a3a';
  ctx.beginPath();
  ctx.moveTo(x - 8, y); ctx.lineTo(x + w / 2, y - 26); ctx.lineTo(x + w + 8, y); ctx.closePath(); ctx.fill();
  // columns
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const cols = 4, gap = w / cols;
  for (let i = 0; i < cols; i++) ctx.fillRect(x + 6 + i * gap, y + 8, 8, h - 20);
  // label + level
  ctx.fillStyle = '#3a2c1c'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${icon} ${label}`, x + w / 2, y + h / 2 + 4);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`Lv.${level}`, x + w / 2, y + h - 20);
  ctx.textAlign = 'left';
}

function drawAgora(ctx, b, game) {
  const { x, y, w, h } = b;
  const pulse = 0.5 + 0.5 * Math.sin(game.time * 3);
  ctx.save();
  ctx.shadowColor = `rgba(232,200,106,${0.35 + pulse * 0.4})`;
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#d8c48a';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.fillStyle = '#8d4a3a';
  ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + w / 2, y - 22); ctx.lineTo(x + w + 6, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 8 + i * (w / 4), y + 6, 7, h - 16);
  ctx.fillStyle = '#3a2c1c'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🏛 Agora', x + w / 2, y + h / 2);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('tap to sell', x + w / 2, y + h / 2 + 16);
  ctx.textAlign = 'left';
}

function drawAcropolis(ctx, b) {
  const { x, y, w, h } = b;
  // rocky base
  ctx.fillStyle = '#b9ad92';
  ctx.beginPath();
  ctx.moveTo(x - 10, y + h); ctx.lineTo(x + 6, y + 14); ctx.lineTo(x + w - 6, y + 14); ctx.lineTo(x + w + 10, y + h); ctx.closePath(); ctx.fill();
  // Parthenon
  ctx.fillStyle = '#efe9d6';
  ctx.fillRect(x + 6, y + 14, w - 12, h - 30);
  ctx.fillStyle = '#d9cfae';
  ctx.fillRect(x + 6, y + h - 20, w - 12, 6);
  ctx.fillStyle = '#c9a34a';
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 14); ctx.lineTo(x + w / 2, y - 8); ctx.lineTo(x + w + 2, y + 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const cols = 6, gap = (w - 20) / cols;
  for (let i = 0; i <= cols; i++) ctx.fillRect(x + 8 + i * gap, y + 18, 6, h - 40);
  ctx.fillStyle = '#5a4a2c'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Acropolis', x + w / 2, y + h - 4);
  ctx.textAlign = 'left';
}

// ---- Harvest nodes --------------------------------------------------------
function drawNodes(ctx, game) {
  for (const n of game.nodes) {
    drawTapRing(ctx, n, game);
    if (n.type === 'olives') drawOliveTree(ctx, n, game);
    else if (n.type === 'grapes') drawVine(ctx, n, game);
    else drawDock(ctx, n, game);
    drawNodeStock(ctx, n);
  }
}

// Rotating dashed "tap here" ring around a harvestable node (Last Asylum cue).
function drawTapRing(ctx, n, game) {
  const ready = n.stock >= 1;
  const spin = game.time * (ready ? 0.7 : 0.2);
  ctx.save();
  ctx.translate(n.x, n.y);
  ctx.rotate(spin);
  ctx.strokeStyle = ready ? 'rgba(140,255,120,0.85)' : 'rgba(230,210,150,0.4)';
  ctx.lineWidth = 3.5;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, n.r + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // soft glow when ready to harvest
  if (ready) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 3 + n.x);
    ctx.fillStyle = `rgba(150,255,130,${0.05 + pulse * 0.05})`;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2); ctx.fill();
  }
}

function drawNodeStock(ctx, n) {
  const pct = n.stock / CONFIG.node.capacity;
  const barW = n.r * 1.4, bx = n.x - barW / 2, by = n.y + n.r + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, bx - 2, by - 2, barW + 4, 8, 3); ctx.fill();
  ctx.fillStyle = pct > 0.25 ? '#8fce6b' : '#d9a441';
  roundRect(ctx, bx, by, barW * pct, 4, 2); ctx.fill();
}

function drawOliveTree(ctx, n, game) {
  const sway = Math.sin(game.time * 1.5 + n.x) * 2;
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(n.x - 5, n.y - 4, 10, n.r + 6);
  ctx.fillStyle = '#5f7d3a';
  blob(ctx, n.x - 18 + sway, n.y - 12, 30);
  blob(ctx, n.x + 14 + sway, n.y - 6, 26);
  blob(ctx, n.x + sway, n.y - 28, 30);
  ctx.fillStyle = '#3d5a2a';
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    ctx.beginPath(); ctx.arc(n.x + Math.cos(a) * 16 + sway, n.y - 16 + Math.sin(a) * 12, 3, 0, Math.PI * 2); ctx.fill();
  }
  label(ctx, n, '🫒');
}

function drawVine(ctx, n, game) {
  ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(n.x, n.y + n.r); ctx.lineTo(n.x, n.y - n.r + 10); ctx.stroke();
  ctx.strokeStyle = '#3f6b34'; ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath(); ctx.moveTo(n.x, n.y - 6); ctx.quadraticCurveTo(n.x + i * 26, n.y - 20, n.x + i * 30, n.y + 4); ctx.stroke();
  }
  ctx.fillStyle = '#7b3f6e';
  const bunch = (bx, by) => { for (let r = 0; r < 3; r++) for (let c = 0; c <= r; c++) { ctx.beginPath(); ctx.arc(bx + (c - r / 2) * 8, by + r * 7, 4.5, 0, Math.PI * 2); ctx.fill(); } };
  bunch(n.x - 20, n.y - 4); bunch(n.x + 18, n.y + 2); bunch(n.x, n.y + 12);
  label(ctx, n, '🍇');
}

function drawDock(ctx, n, game) {
  // little pier
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(n.x - 30, n.y - 6, 60, 10);
  for (let i = -2; i <= 2; i++) ctx.fillRect(n.x + i * 12 - 2, n.y + 2, 4, 16);
  // fish ripples
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  const t = game.time * 3;
  for (let i = 0; i < 2; i++) { const rr = ((t + i * 0.7) % 1.4) * 22; ctx.globalAlpha = 1 - rr / 30; ctx.beginPath(); ctx.arc(n.x + 6, n.y + 20, rr + 4, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  label(ctx, n, '🐟');
}

function label(ctx, n, icon) {
  ctx.font = '18px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(icon, n.x, n.y - n.r - 4);
  ctx.textAlign = 'left';
}

// ---- Defenders on / behind the wall --------------------------------------
function drawDefenders(ctx, game) {
  for (const a of game.archers) drawSoldier(ctx, a.x, a.y, '#3f6ba8', a.hp / a.maxHp, 'archer', game.time);
  for (const h of game.hoplites) drawSoldier(ctx, h.x, h.y, '#b23b3b', h.hp / h.maxHp, 'hoplite', game.time);
}

function drawSoldier(ctx, x, y, color, hpPct, kind, t) {
  const bob = Math.sin(t * 4 + x) * 1.2;
  // shield/body
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y + bob, 9, 0, Math.PI * 2); ctx.fill();
  // helmet crest
  ctx.fillStyle = '#e8c24a';
  ctx.fillRect(x - 2, y - 14 + bob, 4, 6);
  // head
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(x, y - 6 + bob, 4, 0, Math.PI * 2); ctx.fill();
  if (kind === 'archer') { ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 8, y + bob, 7, -1, 1); ctx.stroke(); }
  else { ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 8, y - 12 + bob); ctx.lineTo(x + 8, y + 6 + bob); ctx.stroke(); }
  // tiny hp bar
  if (hpPct < 1) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x - 10, y - 20 + bob, 20, 3); ctx.fillStyle = '#6fbf73'; ctx.fillRect(x - 10, y - 20 + bob, 20 * hpPct, 3); }
}

// ---- Spartans -------------------------------------------------------------
function drawSpartans(ctx, game) {
  for (const s of game.spartans) {
    const bob = Math.sin(game.time * 6 + s.x) * 1.5;
    ctx.fillStyle = '#8a1f1f';
    ctx.beginPath(); ctx.arc(s.x, s.y + bob, CONFIG.spartan.radius, 0, Math.PI * 2); ctx.fill();
    // lambda shield emblem
    ctx.strokeStyle = '#f0e6c8'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(s.x - 5, s.y + 5 + bob); ctx.lineTo(s.x, s.y - 5 + bob); ctx.lineTo(s.x + 5, s.y + 5 + bob); ctx.stroke();
    // crest
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(s.x - 3, s.y - CONFIG.spartan.radius - 6 + bob, 6, 8);
    ctx.fillStyle = '#c9302c'; ctx.fillRect(s.x - 2, s.y - CONFIG.spartan.radius - 10 + bob, 4, 5);
    // spear
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x + 10, s.y - 14 + bob); ctx.lineTo(s.x + 16, s.y + 10 + bob); ctx.stroke();
    // hp bar
    const p = s.hp / s.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(s.x - 13, s.y - CONFIG.spartan.radius - 16 + bob, 26, 4);
    ctx.fillStyle = '#e05a4f'; ctx.fillRect(s.x - 13, s.y - CONFIG.spartan.radius - 16 + bob, 26 * p, 4);
  }
}

function drawArrows(ctx, game) {
  ctx.strokeStyle = '#4a3a1a'; ctx.lineWidth = 2;
  for (const a of game.arrows) {
    if (a.cx == null) continue;
    const ang = Math.atan2(a.ty - a.y, a.tx - a.x);
    ctx.save(); ctx.translate(a.cx, a.cy); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = '#4a3a1a'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(2, -2); ctx.lineTo(2, 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ---- Effects --------------------------------------------------------------
function drawParticles(ctx, game) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, game) {
  ctx.textAlign = 'center';
  for (const f of game.floaters) {
    const p = f.t / f.life;
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y - p * 28 + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - p * 28);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

function drawWaveBanner(ctx, game) {
  if (!game.inWave) return;
  const W = CONFIG.world.width;
  const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
  ctx.fillStyle = `rgba(180,40,40,${0.25 + pulse * 0.15})`;
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, CONFIG.world.height - 6, W, 6);
}

// ---- drawing helpers ------------------------------------------------------
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
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${clampByte(r + amt)},${clampByte(g + amt)},${clampByte(b + amt)})`;
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(A.r + (B.r - A.r) * t)},${Math.round(A.g + (B.g - A.g) * t)},${Math.round(A.b + (B.b - A.b) * t)})`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }
