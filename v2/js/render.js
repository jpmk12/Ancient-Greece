// ============================================================================
//  Aegis of Athens v2 — isometric renderer (rich art pass).
//  Draws textured ground, then all raised objects in painter's depth order,
//  then screen-space HUD. Every sprite is procedural — no image assets.
//
//  Highlights:
//   - textured grass / marble-paved city / animated sea
//   - Greek temples: stepped stylobate, fluted columns, entablature,
//     terracotta gabled roofs (domed granary), per-building character
//   - RESOURCE STACKS: amphorae of oil, wine jars, bread & grain sacks pile
//     up beside a workshop as goods become ready — a visual "come collect me",
//     plus a growing basket the character (and porters) visibly carry
// ============================================================================

import { CFG } from './config.js';
import { proj, camera, tileType, tileDiamond, depthOf } from './world.js';
import { joystick } from './input.js';

const TW = CFG.tile.w, TH = CFG.tile.h;

// Pre-expand walls into unit cells for accurate depth sorting.
const wallCells = [];
for (const w of CFG.walls) {
  for (let x = 0; x < w.w; x++) for (let y = 0; y < w.h; y++) wallCells.push({ x: w.x + x, y: w.y + y, w: 1, h: 1 });
}

// ---- Per-building art style ----
const STYLE = {
  press:     { body: '#eae1cb', roof: '#c56a37', tint: '#f0e7d0', good: 'oil'  },
  winery:    { body: '#e6d8dd', roof: '#7c3b52', tint: '#ecdde2', good: 'wine' },
  granary:   { body: '#ece0c4', roof: '#c9a04e', dome: true,      good: 'food' },
  agora:     { body: '#efe6cc', roof: '#b8912f', awning: true },
  acropolis: { body: '#f3edda', roof: '#c9a34a', grand: true },
};

const DAY_LEN = 130; // seconds for a full day/night cycle
function daylight(time) { return 0.5 + 0.5 * Math.cos((time % DAY_LEN) / DAY_LEN * Math.PI * 2); } // 1=noon, 0=midnight

export function render(ctx, state, viewW, viewH) {
  ctx.clearRect(0, 0, viewW, viewH);
  const dl = daylight(state.time);
  drawSky(ctx, viewW, viewH, dl);
  ensureGround();

  // camera shake (from wall hits / rally)
  const shk = state.game.shake || 0;
  const camX = camera.x + (shk ? (Math.random() * 2 - 1) * shk : 0);
  const camY = camera.y + (shk ? (Math.random() * 2 - 1) * shk : 0);

  // one cheap blit of the pre-rendered static ground (grass / stone / sea base)
  ctx.drawImage(GROUND.canvas, Math.round(camX - GROUND.offX), Math.round(camY - GROUND.offY));

  ctx.save();
  ctx.translate(camX, camY);
  drawSeaShimmer(ctx, state, viewW, viewH); // only the animated water lines
  drawObjects(ctx, state);
  ctx.restore();

  drawNightOverlay(ctx, viewW, viewH, dl); // tint world, but drawn under the HUD
  drawJoystick(ctx);
  drawHud(ctx, state, viewW, viewH);
}

function drawNightOverlay(ctx, w, h, dl) {
  const night = 1 - dl;
  if (night > 0.02) { ctx.fillStyle = `rgba(20,30,66,${night * 0.34})`; ctx.fillRect(0, 0, w, h); }
  const dusk = 1 - Math.abs(dl - 0.5) * 2; // warm glow at dawn/dusk
  if (dusk > 0.1) { ctx.fillStyle = `rgba(230,120,60,${dusk * 0.09})`; ctx.fillRect(0, 0, w, h); }
}

// Static ground is identical every frame, so render it once to an offscreen
// canvas and blit it — the single biggest per-frame saving on mobile.
const GROUND = { canvas: null, offX: 0, offY: 0 };
function ensureGround() {
  if (GROUND.canvas) return;
  const HW = TW / 2, HH = TH / 2;
  GROUND.offX = CFG.map.h * HW + 48;
  GROUND.offY = 48;
  const w = Math.ceil((CFG.map.w + CFG.map.h) * HW + 96);
  const h = Math.ceil((CFG.map.w + CFG.map.h) * HH + 96);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.translate(GROUND.offX, GROUND.offY);
  for (let cy = 0; cy < CFG.map.h; cy++) {
    for (let cx = 0; cx < CFG.map.w; cx++) {
      const t = tileType(cx, cy);
      if (t === 'sea') drawSeaBase(g, cx, cy);
      else if (t === 'stone') drawStoneTile(g, cx, cy, CFG.colors);
      else drawGrassTile(g, cx, cy, CFG.colors);
    }
  }
  GROUND.canvas = cv;
}

// ---- Background sky (day/night aware) -------------------------------------
function drawSky(ctx, w, h, dl) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mix('#101f3e', '#bfe0f0', dl));
  g.addColorStop(0.6, mix('#22314f', '#d8ecdd', dl));
  g.addColorStop(1, mix('#293646', '#e9f2e0', dl));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (dl < 0.5) {
    const a = (0.5 - dl) * 2;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    for (let i = 0; i < 44; i++) {
      const sx = frac(Math.sin(i * 12.9) * 43758) * w;
      const sy = frac(Math.sin(i * 78.2) * 12345) * h * 0.42;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.fillStyle = `rgba(255,255,255,${a * 0.12})`; ctx.beginPath(); ctx.arc(w * 0.83, h * 0.16, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(242,240,220,${a})`; ctx.beginPath(); ctx.arc(w * 0.83, h * 0.16, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(210,208,190,${a})`; ctx.beginPath(); ctx.arc(w * 0.80, h * 0.14, 6, 0, Math.PI * 2); ctx.arc(w * 0.86, h * 0.18, 4, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = `rgba(255,244,214,${0.85 * dl})`; ctx.beginPath(); ctx.arc(w * 0.83, h * 0.14, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,240,190,${0.25 * dl})`; ctx.beginPath(); ctx.arc(w * 0.83, h * 0.14, 40, 0, Math.PI * 2); ctx.fill();
  }
}

// Static sea fill baked into the cached ground.
function drawSeaBase(ctx, cx, cy) {
  tileDiamond(ctx, cx, cy);
  ctx.fillStyle = mix('#2f6d94', '#4a90b8', 0.4);
  ctx.fill();
}

// Live water animation — only the visible sea tiles, drawn over the cached base.
function drawSeaShimmer(ctx, state, viewW, viewH) {
  const time = state.time;
  for (let cy = CFG.seaFromY; cy < CFG.map.h; cy++) {
    for (let cx = 0; cx < CFG.map.w; cx++) {
      const c = proj(cx + 0.5, cy + 0.5);
      const sx = c.x + camera.x, sy = c.y + camera.y;
      if (sx < -TW || sx > viewW + TW || sy < -TH * 2 || sy > viewH + TH * 2) continue;
      const shimmer = 0.5 + 0.5 * Math.sin(time * 1.5 + cx * 0.6 + cy * 0.4);
      ctx.globalAlpha = shimmer * 0.14;
      tileDiamond(ctx, cx, cy); ctx.fillStyle = '#bfe0f0'; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + shimmer * 0.16})`; ctx.lineWidth = 1.5;
      const wy = c.y + Math.sin(time * 2 + cx) * 2;
      ctx.beginPath(); ctx.moveTo(c.x - 12, wy); ctx.quadraticCurveTo(c.x, wy - 3, c.x + 12, wy); ctx.stroke();
    }
  }
}

function drawGrassTile(ctx, cx, cy, C) {
  tileDiamond(ctx, cx, cy);
  ctx.fillStyle = C.grass[(cx + cy) & 1];
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,150,80,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  // deterministic speckles + tufts
  const c = proj(cx + 0.5, cy + 0.5);
  const r = hash(cx, cy);
  ctx.fillStyle = 'rgba(90,120,55,0.5)';
  for (let i = 0; i < 4; i++) {
    const a = frac(r + i * 0.37) * Math.PI * 2, rad = 6 + frac(r * 3 + i) * 16;
    const px = c.x + Math.cos(a) * rad, py = c.y + Math.sin(a) * rad * 0.5;
    ctx.fillRect(px, py, 2, 2);
  }
  if (r > 0.66 && r < 0.82) {
    const tx = c.x + (frac(r * 5) - 0.5) * 20, ty = c.y + (frac(r * 7) - 0.5) * 8;
    ctx.strokeStyle = '#5f8a3c'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx - 2, ty - 5);
    ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 6);
    ctx.moveTo(tx, ty); ctx.lineTo(tx + 2, ty - 5);
    ctx.stroke();
  } else if (r >= 0.82) {
    // wildflower
    const fx = c.x + (frac(r * 11) - 0.5) * 22, fy = c.y + (frac(r * 13) - 0.5) * 10;
    const col = ['#e86a8a', '#e8d24a', '#c98ae0', '#f4f4f4'][Math.floor(frac(r * 17) * 4)] || '#e8d24a';
    ctx.fillStyle = col;
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 2.2, fy + Math.sin(a) * 1.4, 1.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e8c24a'; ctx.beginPath(); ctx.arc(fx, fy, 1.2, 0, Math.PI * 2); ctx.fill();
  } else if (r > 0.5 && r < 0.545) {
    // pebble
    const px = c.x + (frac(r * 19) - 0.5) * 20, py = c.y + (frac(r * 23) - 0.5) * 9;
    ctx.fillStyle = 'rgba(150,150,140,0.6)'; ctx.beginPath(); ell(ctx, px, py, 2.4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawStoneTile(ctx, cx, cy, C) {
  tileDiamond(ctx, cx, cy);
  ctx.fillStyle = C.stone[(cx + cy) & 1];
  ctx.fill();
  // recessed joint (inset diamond)
  const A = proj(cx, cy), B = proj(cx + 1, cy), Cc = proj(cx + 1, cy + 1), D = proj(cx, cy + 1);
  const c = proj(cx + 0.5, cy + 0.5), k = 0.16;
  ctx.fillStyle = 'rgba(255,250,235,0.14)';
  ctx.beginPath();
  ctx.moveTo(lerpv(A, c, k).x, lerpv(A, c, k).y);
  ctx.lineTo(lerpv(B, c, k).x, lerpv(B, c, k).y);
  ctx.lineTo(lerpv(Cc, c, k).x, lerpv(Cc, c, k).y);
  ctx.lineTo(lerpv(D, c, k).x, lerpv(D, c, k).y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,66,0.5)'; ctx.lineWidth = 1;
  tileDiamond(ctx, cx, cy); ctx.stroke();
}

// ---- Depth-sorted objects -------------------------------------------------
function drawObjects(ctx, state) {
  const g = state.game, time = state.time;
  const items = [];
  const wallFrac = g.wall ? g.wall.hp / g.wall.maxHp : 1;

  for (const c of wallCells) items.push({ d: depthOf(c), fn: () => drawWall(ctx, c, wallFrac) });
  for (const p of CFG.gatePosts) items.push({ d: depthOf(p), fn: () => drawPost(ctx, p) });
  for (const b of CFG.buildings) items.push({ d: depthOf(b) + 0.4, fn: () => drawBuilding(ctx, b, g, time, state.player) });
  for (const t of CFG.decoTrees) items.push({ d: t.x + t.y, fn: () => (t.type === 'vine' ? drawVineyard(ctx, proj(t.x + 0.5, t.y + 0.5), time, t.x, 1) : drawOliveTree(ctx, proj(t.x + 0.5, t.y + 0.5), time, t.x, 1, false)) });
  for (const dp of CFG.decoProps) items.push({ d: dp.x + dp.y, fn: () => (dp.type === 'rock' ? drawRock : drawBush)(ctx, proj(dp.x + 0.5, dp.y + 0.5), time, dp.x) });
  for (const n of g.nodes) items.push({ d: n.x + n.y, fn: () => drawNode(ctx, n, g, time) });
  for (const s of g.spartans) items.push({ d: s.x + s.y, fn: () => drawSpartan(ctx, s, time) });
  for (const h of g.hoplites) items.push({ d: h.x + h.y, fn: () => drawDefender(ctx, h, time) });
  for (const a of g.archers) items.push({ d: a.x + a.y, fn: () => drawDefender(ctx, a, time) });
  for (const p of g.porters) items.push({ d: p.x + p.y, fn: () => drawPorter(ctx, p, time) });
  for (const c of g.coins) items.push({ d: c.x + c.y, fn: () => drawCoin(ctx, c, time) });

  const pl = state.player;
  items.push({ d: pl.x + pl.y, fn: () => drawPlayer(ctx, pl) });

  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.fn();

  drawArrows(ctx, g);
  drawParticles(ctx, g);
  drawFloaters(ctx, g);
}

function drawParticles(ctx, g) {
  for (const p of g.particles) {
    const pt = proj(p.x, p.y);
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(0.5, p.r), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- City wall (stone courses + merlons + damage) -------------------------
function drawWall(ctx, c, frac) {
  const dmg = frac < 0.5 ? (0.5 - frac) * 1.4 : 0;
  const top = mix('#dcd6c4', '#9a5445', dmg);
  const leftC = mix('#9a917b', '#5e352c', dmg);
  const rightC = mix('#bcb39c', '#834438', dmg);
  const geo = prism(c, 0, 30);
  face(ctx, [geo.Db, geo.Cb, geo.Ct, geo.Dt], leftC, shade(leftC, -0.12));
  face(ctx, [geo.Bb, geo.Cb, geo.Ct, geo.Bt], rightC, shade(rightC, -0.1));
  quad(ctx, [geo.At, geo.Bt, geo.Ct, geo.Dt], top);
  // stone courses on the front-right face
  ctx.strokeStyle = 'rgba(80,66,44,0.35)'; ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const t = i / 3;
    ctx.beginPath();
    ctx.moveTo(lerpv(geo.Bb, geo.Bt, t).x, lerpv(geo.Bb, geo.Bt, t).y);
    ctx.lineTo(lerpv(geo.Cb, geo.Ct, t).x, lerpv(geo.Cb, geo.Ct, t).y);
    ctx.stroke();
  }
  // merlon on the front corner
  if (frac > 0.35 || (c.x + c.y) % 2 === 0) {
    ctx.fillStyle = top;
    ctx.fillRect(geo.Ct.x - 4, geo.Ct.y - 10, 8, 10);
  }
}

function drawPost(ctx, p) {
  const geo = prism(p, 0, 40);
  face(ctx, [geo.Db, geo.Cb, geo.Ct, geo.Dt], '#7c6338', '#5e4a29');
  face(ctx, [geo.Bb, geo.Cb, geo.Ct, geo.Bt], '#96794a', '#6f592f');
  quad(ctx, [geo.At, geo.Bt, geo.Ct, geo.Dt], '#b9a074');
}

// ---- Temples / workshops --------------------------------------------------
function drawBuilding(ctx, b, g, time, player) {
  const st = STYLE[b.kind] || STYLE.agora;
  const bodyH = st.grand ? 60 : b.kind === 'agora' ? 30 : 42;
  const baseH = 11;
  const active = g && (g._activeBuilding === b.key || (b.sells && g._sellingNow));

  // ground shadow
  const A = proj(b.x, b.y), B = proj(b.x + b.w, b.y), C = proj(b.x + b.w, b.y + b.h), D = proj(b.x, b.y + b.h);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath(); ctx.moveTo(A.x + 12, A.y + 7); ctx.lineTo(B.x + 12, B.y + 7); ctx.lineTo(C.x + 12, C.y + 7); ctx.lineTo(D.x + 12, D.y + 7); ctx.closePath(); ctx.fill();

  if (active) { ctx.save(); ctx.shadowColor = 'rgba(150,255,130,0.9)'; ctx.shadowBlur = 20; }

  // stepped stylobate (two receding steps)
  drawStep(ctx, expand(b, 0.22), 0, 6, '#d9cdb0', '#b7a884', '#c8ba98');
  drawStep(ctx, expand(b, 0.1), 6, baseH - 6, '#e2d7bc', '#bcaf8b', '#d2c5a2');

  // marble body
  const geo = prism(b, baseH, bodyH);
  const bt = shade(st.body, 0.05), bl = shade(st.body, -0.22), br = shade(st.body, -0.1);
  face(ctx, [geo.Db, geo.Cb, geo.Ct, geo.Dt], bl, shade(bl, -0.12));   // south (front-left)
  face(ctx, [geo.Bb, geo.Cb, geo.Ct, geo.Bt], br, shade(br, -0.1));    // east (front-right)
  quad(ctx, [geo.At, geo.Bt, geo.Ct, geo.Dt], bt);

  // fluted colonnade on the two visible faces
  colonnade(ctx, geo.Db, geo.Cb, baseH, bodyH, Math.max(3, Math.round(b.w * 1.6)));
  colonnade(ctx, geo.Cb, geo.Bb, baseH, bodyH, Math.max(2, Math.round(b.h * 1.6)));

  // entablature band just under the roof
  band(ctx, geo, 0.85, 1.0, shade(st.body, 0.1));

  if (active) ctx.restore();

  // roof
  if (st.dome) drawDome(ctx, b, baseH + bodyH, st.roof);
  else drawGableRoof(ctx, b, baseH + bodyH, st.roof, st.grand ? 34 : 22, st);
  if (st.awning) drawAwning(ctx, b, baseH + bodyH);
  if (st.grand) drawStatue(ctx, b, baseH + bodyH);

  // resource stacks (the "come collect" signal) + input pile
  if (b.output && g && g.buildings[b.key]) {
    const bb = g.buildings[b.key];
    drawGoodsStack(ctx, b.x + b.w * 0.74, b.y + b.h + 0.42, st.good, bb.outStock, time);
    drawInputPile(ctx, b.x + b.w * 0.24, b.y + b.h + 0.42, b.input, bb.stock);
  }
  if (b.sells && g) drawWares(ctx, b.x + b.w * 0.5, b.y + b.h + 0.42, time);

  // name + (proximity) role subtitle + live functional tag
  const center = proj(b.x + b.w / 2, b.y + b.h / 2);
  const topY = center.y - (baseH + bodyH) - (st.dome ? 26 : st.grand ? 40 : 30);
  // Skip labels when the building sits behind the top HUD band (avoids overlap).
  if (topY + camera.y <= 118) return;

  const near = player && Math.hypot(player.x - (b.x + b.w / 2), player.y - (b.y + b.h / 2)) < 7;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#33240f'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(b.name, center.x, topY);
  if (b.role && near) {
    ctx.font = '600 10px system-ui, sans-serif';
    const rw = ctx.measureText(b.role).width + 12;
    ctx.fillStyle = 'rgba(20,14,6,0.6)';
    roundRect(ctx, center.x - rw / 2, topY + 4, rw, 15, 7); ctx.fill();
    ctx.fillStyle = '#f2e8cf'; ctx.fillText(b.role, center.x, topY + 14.5);
  }
  const tagY = topY + (b.role && near ? 36 : 18);
  if (b.input && g && g.buildings[b.key]) {
    const bb = g.buildings[b.key];
    const im = CFG.resourceMeta[b.input], om = CFG.goodsMeta[b.output];
    drawTag(ctx, center.x, tagY, `${im.icon}${Math.floor(bb.stock)}  ▸  ${om.icon}${Math.floor(bb.outStock)}`);
  } else if (b.sells && g) {
    drawTag(ctx, center.x, tagY, g._sellingNow ? '💰 selling…' : '💰 oil & wine');
  } else if (b.storesFood && g) {
    drawTag(ctx, center.x, tagY, `🍞 larder ${Math.floor(g.cityFood)}`);
  }
  ctx.textAlign = 'left';
}

function drawStep(ctx, rect, baseElev, h, top, left, right) {
  const geo = prism(rect, baseElev, h);
  quad(ctx, [geo.Db, geo.Cb, geo.Ct, geo.Dt], left);
  quad(ctx, [geo.Bb, geo.Cb, geo.Ct, geo.Bt], right);
  quad(ctx, [geo.At, geo.Bt, geo.Ct, geo.Dt], top);
}

// Vertical fluted columns along a face's bottom edge (P1->P2 at elevation e0).
function colonnade(ctx, p1, p2, e0, height, n) {
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const bx = p1.x + (p2.x - p1.x) * t;
    const by = p1.y + (p2.y - p1.y) * t;
    const topY = by - height + 6, botY = by - 3;
    const w = 3.2;
    // shaft
    const g = ctx.createLinearGradient(bx - w, 0, bx + w, 0);
    g.addColorStop(0, 'rgba(120,104,74,0.5)'); g.addColorStop(0.5, 'rgba(255,250,235,0.5)'); g.addColorStop(1, 'rgba(120,104,74,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(bx - w, topY, w * 2, botY - topY);
    // flute shadows
    ctx.strokeStyle = 'rgba(90,74,44,0.3)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(bx - 1, topY); ctx.lineTo(bx - 1, botY); ctx.moveTo(bx + 1.4, topY); ctx.lineTo(bx + 1.4, botY); ctx.stroke();
    // capital + base
    ctx.fillStyle = 'rgba(255,250,235,0.6)';
    ctx.fillRect(bx - w - 1.2, topY - 3, w * 2 + 2.4, 3);
    ctx.fillStyle = 'rgba(120,104,74,0.5)';
    ctx.fillRect(bx - w - 1, botY, w * 2 + 2, 2.5);
  }
}

// Horizontal band (architrave / cornice) near the top of the body.
// tLow/tHigh are fractions along the body's height (0 = base, 1 = top).
function band(ctx, geo, tLow, tHigh, col) {
  const Dl = lerpv(geo.Db, geo.Dt, tLow), Cl = lerpv(geo.Cb, geo.Ct, tLow), Bl = lerpv(geo.Bb, geo.Bt, tLow);
  const Dh = lerpv(geo.Db, geo.Dt, tHigh), Ch = lerpv(geo.Cb, geo.Ct, tHigh), Bh = lerpv(geo.Bb, geo.Bt, tHigh);
  quad(ctx, [Dl, Cl, Ch, Dh], col);
  quad(ctx, [Bl, Cl, Ch, Bh], shade(col, -0.08));
}

// Gabled terracotta roof with a marble pediment facing the viewer (south).
function drawGableRoof(ctx, b, elev, roofCol, ridgeH, st) {
  const g = prism(b, elev, 0); // At,Bt,Ct,Dt == top of body
  const eaveN = { x: (g.At.x + g.Bt.x) / 2, y: (g.At.y + g.Bt.y) / 2 };
  const eaveS = { x: (g.Dt.x + g.Ct.x) / 2, y: (g.Ct.y + g.Dt.y) / 2 };
  const apexN = { x: eaveN.x, y: eaveN.y - ridgeH };
  const apexS = { x: eaveS.x, y: eaveS.y - ridgeH };
  // overhang the eaves a touch
  const At = over(g.At, g.Bt), Bt = over(g.Bt, g.At), Ct = over(g.Ct, g.Dt), Dt = over(g.Dt, g.Ct);
  // back pediment (marble, in shadow) — a real temple gable, not a gap
  ctx.fillStyle = shade(st.body, -0.14);
  ctx.beginPath(); ctx.moveTo(At.x, At.y); ctx.lineTo(Bt.x, Bt.y); ctx.lineTo(apexN.x, apexN.y); ctx.closePath(); ctx.fill();
  // west slope (shadow), east slope (lit)
  quad(ctx, [At, Dt, apexS, apexN], shade(roofCol, -0.16));
  quad(ctx, [Bt, Ct, apexS, apexN], shade(roofCol, 0.08));
  // tile lines on the lit slope
  ctx.strokeStyle = 'rgba(60,30,20,0.28)'; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    ctx.beginPath();
    ctx.moveTo(Bt.x + (apexN.x - Bt.x) * t, Bt.y + (apexN.y - Bt.y) * t);
    ctx.lineTo(Ct.x + (apexS.x - Ct.x) * t, Ct.y + (apexS.y - Ct.y) * t);
    ctx.stroke();
  }
  // front pediment (marble triangle)
  ctx.fillStyle = shade(st.body, 0.02);
  ctx.beginPath(); ctx.moveTo(Dt.x, Dt.y); ctx.lineTo(Ct.x, Ct.y); ctx.lineTo(apexS.x, apexS.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(st.body, -0.2); ctx.lineWidth = 1.5; ctx.stroke();
  // acroterion / emblem
  ctx.fillStyle = st.roof;
  ctx.beginPath(); ctx.arc((Dt.x + Ct.x) / 2, (Dt.y + Ct.y) / 2 - ridgeH * 0.42, 2.6, 0, Math.PI * 2); ctx.fill();
  // ridge highlight
  ctx.strokeStyle = shade(roofCol, 0.2); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(apexN.x, apexN.y); ctx.lineTo(apexS.x, apexS.y); ctx.stroke();
}

function drawDome(ctx, b, elev, roofCol) {
  const c = proj(b.x + b.w / 2, b.y + b.h / 2);
  const cy = c.y - elev, rx = (b.w * TW) / 3.2, ry = rx * 0.62;
  const g = ctx.createRadialGradient(c.x - rx * 0.3, cy - ry * 0.5, ry * 0.2, c.x, cy, rx);
  g.addColorStop(0, shade(roofCol, 0.28)); g.addColorStop(1, shade(roofCol, -0.12));
  ctx.fillStyle = g;
  ctx.beginPath(); ell(ctx,c.x, cy, rx, ry, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = shade(roofCol, -0.05); ctx.fillRect(c.x - rx, cy - 1, rx * 2, 3);
  ctx.fillStyle = shade(roofCol, 0.3);
  ctx.beginPath(); ctx.arc(c.x, cy - ry, 2.4, 0, Math.PI * 2); ctx.fill();
}

function drawAwning(ctx, b, elev) {
  // striped market cloth over the south face
  const D = proj(b.x, b.y + b.h), C = proj(b.x + b.w, b.y + b.h);
  const y0 = D.y - elev + 2;
  const n = Math.max(4, Math.round(b.w * 2));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    ctx.fillStyle = i % 2 ? '#c94f43' : '#efe6cc';
    ctx.beginPath();
    ctx.moveTo(D.x + (C.x - D.x) * t0, D.y + (C.y - D.y) * t0 - elev - 4);
    ctx.lineTo(D.x + (C.x - D.x) * t1, D.y + (C.y - D.y) * t1 - elev - 4);
    ctx.lineTo(D.x + (C.x - D.x) * t1, D.y + (C.y - D.y) * t1 - elev + 8);
    ctx.lineTo(D.x + (C.x - D.x) * t0, D.y + (C.y - D.y) * t0 - elev + 8);
    ctx.closePath(); ctx.fill();
  }
}

function drawStatue(ctx, b, elev) {
  const c = proj(b.x + b.w / 2, b.y + 0.6);
  const y = c.y - elev;
  ctx.fillStyle = '#d4af37';
  ctx.beginPath(); ctx.arc(c.x, y - 16, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(c.x - 2.5, y - 14, 5, 12);
}

// ---- Resource stacks ------------------------------------------------------
// A growing pile of finished goods beside a workshop — the "collect me" cue.
function drawGoodsStack(ctx, wx, wy, good, count, time) {
  const n = Math.min(12, Math.floor(count));
  if (n < 1) return;
  const p = proj(wx, wy);
  const perRow = 4, sw = 12, sh = 15, rise = 10;
  let placed = 0, rows = Math.ceil(n / perRow);
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(perRow, n - placed);
    for (let i = 0; i < inRow; i++) {
      const rowW = (inRow - 1) * sw;
      const ox = p.x - rowW / 2 + i * sw + (r % 2) * (sw / 2);
      const oy = p.y - r * rise;
      if (good === 'food') drawBread(ctx, ox, oy, 12);
      else drawAmphora(ctx, ox, oy, sh, good === 'wine' ? '#8e2b4c' : '#d7ad5c');
      placed++;
    }
  }
  // gentle "ready" bob arrow when a good pile has built up
  if (count >= 3) {
    const yb = p.y - rows * rise - 16 + Math.sin(time * 3) * 2;
    ctx.fillStyle = 'rgba(150,255,130,0.9)';
    ctx.beginPath(); ctx.moveTo(p.x - 5, yb); ctx.lineTo(p.x + 5, yb); ctx.lineTo(p.x, yb + 6); ctx.closePath(); ctx.fill();
  }
}

function drawInputPile(ctx, wx, wy, type, count) {
  const n = Math.min(9, Math.floor(count));
  if (n < 1) return;
  const p = proj(wx, wy);
  const col = CFG.resourceMeta[type].color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ox = p.x + Math.cos(a) * (3 + (i % 3) * 3);
    const oy = p.y - Math.floor(i / 4) * 4 + Math.sin(a) * 2;
    if (type === 'fish') drawFishSprite(ctx, ox, oy, 9, col);
    else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(col, 0.25); ctx.beginPath(); ctx.arc(ox - 1, oy - 1, 1, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawWares(ctx, wx, wy, time) {
  const p = proj(wx, wy);
  // a small trader's table with amphorae
  ctx.fillStyle = '#7a5433'; ctx.fillRect(p.x - 16, p.y - 4, 32, 4);
  ctx.fillRect(p.x - 14, p.y, 3, 8); ctx.fillRect(p.x + 11, p.y, 3, 8);
  drawAmphora(ctx, p.x - 8, p.y - 4, 13, '#d7ad5c');
  drawAmphora(ctx, p.x + 8, p.y - 4, 13, '#8e2b4c');
}

// ---- Item sprites ---------------------------------------------------------
function drawAmphora(ctx, x, y, s, body) {
  const w = s * 0.34;
  ctx.save(); ctx.translate(x, y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ell(ctx,0, 0, w * 1.2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  // body
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, shade(body, -0.2)); g.addColorStop(0.45, shade(body, 0.15)); g.addColorStop(1, shade(body, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.08);
  ctx.bezierCurveTo(w * 1.15, -s * 0.2, w * 1.05, -s * 0.72, 0, -s * 0.86);
  ctx.bezierCurveTo(-w * 1.05, -s * 0.72, -w * 1.15, -s * 0.2, 0, -s * 0.08);
  ctx.closePath(); ctx.fill();
  // neck + rim
  ctx.fillStyle = shade(body, -0.05);
  ctx.fillRect(-s * 0.12, -s * 0.98, s * 0.24, s * 0.16);
  ctx.fillRect(-s * 0.18, -s * 1.04, s * 0.36, s * 0.07);
  // handles
  ctx.strokeStyle = shade(body, -0.15); ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(-w * 0.9, -s * 0.7, s * 0.16, -1.1, 1.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(w * 0.9, -s * 0.7, s * 0.16, Math.PI - 1.4, Math.PI + 1.1); ctx.stroke();
  // painted band
  ctx.strokeStyle = 'rgba(40,26,14,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-w * 0.9, -s * 0.5); ctx.lineTo(w * 0.9, -s * 0.5); ctx.stroke();
  ctx.restore();
}

function drawBread(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ell(ctx,0, 0, s * 0.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(0, -s * 0.7, 0, 0);
  g.addColorStop(0, '#e0a259'); g.addColorStop(1, '#b9772f');
  ctx.fillStyle = g;
  ctx.beginPath(); ell(ctx,0, -s * 0.32, s * 0.5, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,20,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-s * 0.25, -s * 0.5); ctx.lineTo(-s * 0.15, -s * 0.18); ctx.moveTo(0, -s * 0.55); ctx.lineTo(0, -s * 0.14); ctx.moveTo(s * 0.25, -s * 0.5); ctx.lineTo(s * 0.15, -s * 0.18); ctx.stroke();
  ctx.restore();
}

function drawFishSprite(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = col || '#4a90b8';
  ctx.beginPath(); ell(ctx,0, 0, s * 0.5, s * 0.28, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.4, 0); ctx.lineTo(s * 0.62, -s * 0.22); ctx.lineTo(s * 0.62, s * 0.22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.06, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// A woven basket filled with the given item colour, height scaled by fill 0..1.
function drawBasket(ctx, x, y, s, fillCol, fill) {
  ctx.save(); ctx.translate(x, y);
  // contents mound
  if (fill > 0 && fillCol) {
    ctx.fillStyle = fillCol;
    ctx.beginPath(); ell(ctx,0, -s * (0.5 + fill * 0.5), s * 0.5, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(fillCol, 0.25);
    ctx.beginPath(); ctx.arc(-s * 0.14, -s * (0.55 + fill * 0.5), s * 0.1, 0, Math.PI * 2); ctx.fill();
  }
  // basket body
  const g = ctx.createLinearGradient(0, -s * 0.6, 0, 0);
  g.addColorStop(0, '#b98a4e'); g.addColorStop(1, '#8a6234');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.55); ctx.lineTo(s * 0.55, -s * 0.55);
  ctx.lineTo(s * 0.42, 0); ctx.lineTo(-s * 0.42, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,18,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.36); ctx.lineTo(s * 0.5, -s * 0.36); ctx.stroke();
  ctx.strokeStyle = '#8a6234'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, -s * 0.55, s * 0.5, Math.PI, 0); ctx.stroke();
  ctx.restore();
}

// ---- Harvest nodes --------------------------------------------------------
function drawNode(ctx, n, g, time) {
  const p = proj(n.x, n.y);
  const frac = n.stock / n.max;
  const active = g._activeNode && g._activeNode.id === n.id;

  if (active) {
    const spin = time * 1.2;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5); ctx.rotate(spin);
    ctx.strokeStyle = 'rgba(150,255,130,0.9)'; ctx.lineWidth = 4; ctx.setLineDash([12, 9]);
    ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ell(ctx,p.x, p.y, 18, 9, 0, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = n.stock < 1 ? 0.5 : 1;
  if (n.type === 'fish') drawFishDock(ctx, p, time, frac);
  else if (n.type === 'grapes') drawVineyard(ctx, p, time, n.x, frac);
  else drawOliveTree(ctx, p, time, n.x, frac, true);
  ctx.globalAlpha = 1;

  // stock bar
  const bw = 34, bx = p.x - bw / 2, by = p.y + 11;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, bx - 2, by - 2, bw + 4, 8, 3); ctx.fill();
  ctx.fillStyle = frac > 0.25 ? '#8fce6b' : '#d9a441';
  roundRect(ctx, bx, by, bw * frac, 4, 2); ctx.fill();
}

function drawOliveTree(ctx, p, time, seed, frac, fruited) {
  const sway = Math.sin(time * 1.2 + seed) * 1.6;
  // trunk with bark shading
  const tg = ctx.createLinearGradient(p.x - 4, 0, p.x + 4, 0);
  tg.addColorStop(0, '#5e3f24'); tg.addColorStop(0.5, '#7a5433'); tg.addColorStop(1, '#5e3f24');
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x - 2.5, p.y - 30); ctx.lineTo(p.x + 2.5, p.y - 30); ctx.lineTo(p.x + 4, p.y); ctx.closePath(); ctx.fill();
  // layered canopy
  const clumps = [[-13, -36, 15], [13, -33, 14], [0, -50, 18], [-8, -46, 13], [9, -47, 12]];
  for (const [dx, dy, r] of clumps) { ctx.fillStyle = '#4d6b30'; blob(ctx, p.x + dx + sway, p.y + dy, r * (0.72 + 0.28 * frac)); }
  for (const [dx, dy, r] of clumps) { ctx.fillStyle = '#6b8f3f'; blob(ctx, p.x + dx + sway - 2, p.y + dy - 3, r * 0.6 * (0.72 + 0.28 * frac)); }
  // olives
  if (fruited && frac > 0.1) {
    ctx.fillStyle = '#2f3a1c';
    const m = Math.round(6 * frac);
    for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 14 + sway, p.y - 42 + Math.sin(a) * 11, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawVineyard(ctx, p, time, seed, frac) {
  const sway = Math.sin(time * 1.3 + seed) * 1.2;
  // trellis
  ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(p.x - 16, p.y); ctx.lineTo(p.x - 16, p.y - 26); ctx.moveTo(p.x + 16, p.y); ctx.lineTo(p.x + 16, p.y - 26); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 18, p.y - 24); ctx.lineTo(p.x + 18, p.y - 24); ctx.stroke();
  // vine leaves
  ctx.fillStyle = '#5a8a3c';
  for (let i = -1; i <= 1; i++) blob(ctx, p.x + i * 12 + sway, p.y - 26, 8);
  // grape bunches
  const bunch = (bx, by) => { ctx.fillStyle = '#7b3f6e'; for (let r = 0; r < 3; r++) for (let c = 0; c <= r; c++) { ctx.beginPath(); ctx.arc(bx + (c - r / 2) * 4.4, by + r * 3.8, 2.6, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#9a5f8a'; ctx.beginPath(); ctx.arc(bx - 1, by - 1, 1.3, 0, Math.PI * 2); ctx.fill(); };
  const m = Math.max(1, Math.round(3 * frac));
  const spots = [[-11, -20], [11, -20], [0, -16]];
  for (let i = 0; i < m; i++) bunch(p.x + spots[i][0] + sway, p.y + spots[i][1]);
}

function drawFishDock(ctx, p, time, frac) {
  // pier planks with seams
  ctx.fillStyle = '#8a6a3a'; ctx.fillRect(p.x - 18, p.y - 5, 36, 9);
  ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(p.x + i * 7, p.y - 5); ctx.lineTo(p.x + i * 7, p.y + 4); ctx.stroke(); }
  // posts into the water
  ctx.fillStyle = '#6f5330'; ctx.fillRect(p.x - 15, p.y + 3, 3, 12); ctx.fillRect(p.x + 12, p.y + 3, 3, 12);
  // net between posts
  ctx.strokeStyle = 'rgba(230,225,200,0.6)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(p.x - 14 + i * 3, p.y + 5); ctx.lineTo(p.x - 11 + i * 3, p.y + 13); ctx.stroke(); }
  // crate of fish (scaled by stock)
  const m = Math.max(0, Math.round(3 * frac));
  ctx.fillStyle = '#7a5433'; ctx.fillRect(p.x - 6, p.y - 12, 14, 8);
  for (let i = 0; i < m; i++) drawFishSprite(ctx, p.x - 2 + (i % 2) * 6, p.y - 12 - Math.floor(i / 2) * 3, 8, '#5a9ec2');
  // ripple + jumping fish
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  const t = time * 3, rr = (t % 1.4) * 18;
  ctx.globalAlpha = Math.max(0, 1 - rr / 26); ctx.beginPath(); ell(ctx,p.x, p.y + 18, rr + 4, (rr + 4) * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
}

// ---- Decorative props -----------------------------------------------------
function drawRock(ctx, p) {
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ell(ctx, p.x, p.y, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(p.x - 10, p.y - 16, p.x + 10, p.y);
  g.addColorStop(0, '#b7b3a8'); g.addColorStop(1, '#7f7b70');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x - 8, p.y - 13); ctx.lineTo(p.x + 2, p.y - 16); ctx.lineTo(p.x + 12, p.y - 9); ctx.lineTo(p.x + 11, p.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.moveTo(p.x - 8, p.y - 13); ctx.lineTo(p.x + 2, p.y - 16); ctx.lineTo(p.x - 2, p.y - 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8f8b80'; ctx.beginPath(); ell(ctx, p.x + 13, p.y - 2, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
}

function drawBush(ctx, p, time, seed) {
  const sway = Math.sin(time * 1.4 + seed) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ell(ctx, p.x, p.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4d6b30'; blob(ctx, p.x - 7 + sway, p.y - 8, 9); blob(ctx, p.x + 7 + sway, p.y - 7, 8); blob(ctx, p.x + sway, p.y - 13, 10);
  ctx.fillStyle = '#6b8f3f'; blob(ctx, p.x - 5 + sway, p.y - 11, 5); blob(ctx, p.x + 5 + sway, p.y - 10, 5);
  ctx.fillStyle = '#b0405a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p.x + (i - 1) * 5 + sway, p.y - 9, 1.4, 0, Math.PI * 2); ctx.fill(); }
}

// ---- Character ------------------------------------------------------------
function drawPlayer(ctx, pl) {
  const p = proj(pl.x, pl.y);
  const bob = pl.moving ? Math.abs(Math.sin(pl.walkPhase)) * 2.5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ell(ctx,p.x, p.y, 15, 7.5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(p.x, p.y - bob);
  ctx.scale(pl.faceX * 1.4, 1.4);
  const legSwing = pl.moving ? Math.sin(pl.walkPhase) * 3 : 0;
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(-5 + legSwing, -10, 4, 10); ctx.fillRect(1 - legSwing, -10, 4, 10);
  // chiton with shading
  const cg = ctx.createLinearGradient(-8, 0, 8, 0);
  cg.addColorStop(0, '#dcd0b0'); cg.addColorStop(0.5, '#f3ead2'); cg.addColorStop(1, '#cfc09c');
  ctx.fillStyle = cg; roundRect(ctx, -8, -26, 16, 18, 4); ctx.fill();
  // himation drape
  ctx.fillStyle = '#3f5b8c';
  ctx.beginPath(); ctx.moveTo(-8, -25); ctx.lineTo(7, -25); ctx.lineTo(-1, -8); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#33497a'; ctx.beginPath(); ctx.moveTo(-8, -25); ctx.lineTo(-3, -25); ctx.lineTo(-6, -14); ctx.lineTo(-8, -14); ctx.closePath(); ctx.fill();
  // arm
  ctx.fillStyle = '#e8c9a0'; ctx.fillRect(5, -24, 4, 12);
  // head + hair + petasos
  ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(0, -30, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a3720'; ctx.beginPath(); ctx.arc(0, -31, 5.6, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#7a5a30'; ctx.beginPath(); ell(ctx,0, -33, 8, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  if (pl.attacking > 0) {
    ctx.strokeStyle = '#c9c2a0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(6, -16); ctx.lineTo(21, -21); ctx.stroke();
    ctx.fillStyle = '#cfcfcf'; ctx.beginPath(); ctx.moveTo(21, -21); ctx.lineTo(16, -24); ctx.lineTo(17, -18); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // carried basket, on the shaded side, filled by load
  if (pl.carried > 0) {
    const dom = domCarry(pl.carry);
    const col = (CFG.resourceMeta[dom.type] || CFG.goodsMeta[dom.type]).color;
    drawBasket(ctx, p.x - pl.faceX * 13, p.y - 8, 16, col, Math.min(1, pl.carried / pl.carryCap));
    // small count tag
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    const label = `${pl.carried}`;
    ctx.fillStyle = pl.full ? 'rgba(160,60,40,0.92)' : 'rgba(20,14,6,0.82)';
    const w = ctx.measureText(label).width + 12;
    roundRect(ctx, p.x - w / 2, p.y - 70, w, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, p.x, p.y - 57); ctx.textAlign = 'left';
  }

  if (pl.hitFlash > 0) { ctx.strokeStyle = `rgba(224,90,79,${pl.hitFlash * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 16, 19, 0, Math.PI * 2); ctx.stroke(); }
  if (pl.health < pl.maxHealth) {
    const f = Math.max(0, pl.health / pl.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, p.x - 16, p.y - 44, 32, 5, 2); ctx.fill();
    ctx.fillStyle = f > 0.5 ? '#6fbf73' : f > 0.25 ? '#d9a441' : '#e05a4f';
    roundRect(ctx, p.x - 16, p.y - 44, 32 * f, 5, 2); ctx.fill();
  }
}

function domCarry(carry) {
  let type = 'olives', n = -1;
  for (const k of ['olives', 'grapes', 'fish', 'oil', 'wine', 'food']) if (carry[k] > n) { n = carry[k]; type = k; }
  return { type, n };
}

// ---- Combatants -----------------------------------------------------------
function drawSpartan(ctx, s, time) {
  const p = proj(s.x, s.y);
  const sc = s.sizeMul || 1;
  const body = s.body || '#8a1f1f';
  const bob = Math.sin(time * 8 + s.x) * 1.6;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ell(ctx, p.x, p.y, 12 * sc, 6 * sc, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(p.x, p.y - bob); ctx.scale(sc, sc);
  const g = ctx.createRadialGradient(-3, -15, 2, 0, -12, 12);
  g.addColorStop(0, shade(body, 0.24)); g.addColorStop(1, shade(body, -0.14));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -12, 11, 0, Math.PI * 2); ctx.fill();
  // shield-bearers get a heavier rim
  if (s.type === 'shield') { ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, -12, 11, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = '#f0e6c8'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(0, -17); ctx.lineTo(5, -7); ctx.stroke();
  ctx.fillStyle = s.type === 'skirmisher' ? '#e0b83a' : '#c9302c'; ctx.fillRect(-6, -30, 12, 4);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-2, -34, 4, 8);
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, -26); ctx.lineTo(13, -2); ctx.stroke();
  ctx.restore();
  const f = s.hp / s.maxHp;
  if (f < 1) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(p.x - 12 * sc, p.y - 40 * sc, 24 * sc, 4); ctx.fillStyle = '#e05a4f'; ctx.fillRect(p.x - 12 * sc, p.y - 40 * sc, 24 * sc * f, 4); }
}

function drawDefender(ctx, u, time) {
  const p = proj(u.x, u.y);
  const bob = Math.sin(time * 5 + u.x) * 1.1;
  const archer = u.kind === 'archer';
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ell(ctx,p.x, p.y, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(p.x, p.y - bob);
  const g = ctx.createRadialGradient(-2, -13, 1, 0, -11, 10);
  g.addColorStop(0, archer ? '#5a86c4' : '#d29a3c'); g.addColorStop(1, archer ? '#33578f' : '#9a6620');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -11, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8c24a'; ctx.fillRect(-2, -26, 4, 6);
  ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(0, -18, 4, 0, Math.PI * 2); ctx.fill();
  if (archer) { ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(8, -11, 7, -1, 1); ctx.stroke(); }
  else { ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, -24); ctx.lineTo(9, -2); ctx.stroke(); }
  ctx.restore();
  const f = u.hp / u.maxHp;
  if (f < 1) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(p.x - 10, p.y - 32, 20, 3); ctx.fillStyle = '#6fbf73'; ctx.fillRect(p.x - 10, p.y - 32, 20 * f, 3); }
}

function drawPorter(ctx, p, time) {
  const pt = proj(p.x, p.y);
  const moving = !!p.target;
  const bob = moving ? Math.abs(Math.sin(time * 8 + p.x)) * 1.6 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ell(ctx,pt.x, pt.y, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(pt.x, pt.y - bob);
  ctx.fillStyle = p.role === 'trade' ? '#c79a3a' : '#8a6a44';
  roundRect(ctx, -5, -19, 10, 13, 3); ctx.fill();
  ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(0, -22, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // carried load as a small basket
  if (p.load > 0 && p.item) {
    const col = (CFG.resourceMeta[p.item] || CFG.goodsMeta[p.item]).color;
    drawBasket(ctx, pt.x + 9, pt.y - 6, 12, col, Math.min(1, p.load / CFG.porters.cap));
  }
}

function drawCoin(ctx, c, time) {
  const p = proj(c.x, c.y);
  const bob = 3 + Math.sin(time * 4 + c.x) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ell(ctx, p.x, p.y, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  const w = 4 + Math.abs(Math.cos(time * 3 + c.x)) * 3; // spin
  const g = ctx.createLinearGradient(p.x - 7, 0, p.x + 7, 0);
  g.addColorStop(0, '#b8892f'); g.addColorStop(0.5, '#f4d874'); g.addColorStop(1, '#b8892f');
  ctx.fillStyle = g;
  ctx.beginPath(); ell(ctx, p.x, p.y - bob, w, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a6420'; ctx.lineWidth = 1;
  ctx.beginPath(); ell(ctx, p.x, p.y - bob, w, 7, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ell(ctx, p.x - w * 0.3, p.y - bob - 1.5, Math.max(0.5, w * 0.25), 2, 0, 0, Math.PI * 2); ctx.fill();
}

function drawArrows(ctx, g) {
  ctx.strokeStyle = '#4a3a1a'; ctx.lineWidth = 2;
  for (const ar of g.arrows) {
    if (ar.cx == null) continue;
    const a = proj(ar.cx, ar.cy), b = proj(ar.x, ar.y);
    const ang = Math.atan2(a.y - b.y, a.x - b.x);
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, 0); ctx.stroke();
    ctx.restore();
  }
}

function drawFloaters(ctx, g) {
  ctx.textAlign = 'center';
  for (const f of g.floaters) {
    const p = proj(f.x, f.y), t = f.t / f.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#000'; ctx.fillText(f.text, p.x + 1, p.y - 34 - t * 26 + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, p.y - 34 - t * 26);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

function drawTag(ctx, cx, y, label) {
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(label).width + 16;
  ctx.fillStyle = 'rgba(20,14,6,0.74)'; roundRect(ctx, cx - w / 2, y - 14, w, 20, 10); ctx.fill();
  ctx.fillStyle = '#e8c86a'; ctx.fillText(label, cx, y);
}

// ============================================================================
//  Screen-space HUD (unchanged behaviour)
// ============================================================================
function drawJoystick(ctx) {
  if (!joystick.active) return;
  ctx.save(); ctx.globalAlpha = 0.85;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joystick.originX, joystick.originY, 62, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(joystick.originX, joystick.originY, 62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(joystick.curX, joystick.curY, 26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHud(ctx, state, viewW, viewH) {
  const g = state.game, pl = state.player;
  ctx.save();
  ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center';
  const label = pl.inside ? '🏛  Inside the Walls' : '🌾  Outside — the Countryside';
  ctx.fillStyle = 'rgba(20,14,6,0.72)';
  const tw = ctx.measureText(label).width + 28;
  roundRect(ctx, viewW / 2 - tw / 2, 12, tw, 30, 15); ctx.fill();
  ctx.fillStyle = pl.inside ? '#e8c86a' : '#bfe08a';
  ctx.fillText(label, viewW / 2, 32);
  drawWallStatus(ctx, g, viewW);
  if (g.hint) {
    ctx.globalAlpha = Math.max(0, 1 - g.hint.t / 2.4);
    ctx.fillStyle = 'rgba(160,60,40,0.9)';
    const hw = ctx.measureText(g.hint.text).width + 26;
    roundRect(ctx, viewW / 2 - hw / 2, viewH - 118, hw, 28, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(g.hint.text, viewW / 2, viewH - 99);
    ctx.globalAlpha = 1;
  }
  drawWaypoint(ctx, state, viewW, viewH);
  drawToasts(ctx, g, viewW);
  drawDrachmas(ctx, g, viewW);
  drawArmyFood(ctx, g, viewW);
  drawBackpack(ctx, pl, viewH);
  drawMinimap(ctx, state);
  drawPauseVeil(ctx, g, viewW, viewH);
  ctx.restore(); ctx.textAlign = 'left';
}

// Tutorial hint banner + a waypoint arrow to the current objective.
function drawWaypoint(ctx, state, viewW, viewH) {
  const t = state.game.tutorial;
  if (!t || t.done) return;
  if (t.text) {
    ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui, sans-serif';
    const w = ctx.measureText(t.text).width + 42;
    const y = viewH - 150;
    ctx.fillStyle = 'rgba(20,14,6,0.88)';
    roundRect(ctx, viewW / 2 - w / 2, y, w, 34, 17); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,106,0.7)'; ctx.lineWidth = 2; roundRect(ctx, viewW / 2 - w / 2, y, w, 34, 17); ctx.stroke();
    ctx.fillStyle = '#f2e8cf'; ctx.fillText('👉 ' + t.text, viewW / 2, y + 22);
  }
  if (!t.target) return;
  const p = proj(t.target.x, t.target.y);
  const sx = p.x + camera.x, sy = p.y + camera.y;
  const pulse = 0.5 + 0.5 * Math.sin(state.time * 4);
  if (sx > 70 && sx < viewW - 70 && sy > 150 && sy < viewH - 190) {
    ctx.strokeStyle = `rgba(232,200,106,${0.5 + pulse * 0.4})`; ctx.lineWidth = 3;
    ctx.beginPath(); ell(ctx, sx, sy, 26, 13, 0, 0, Math.PI * 2); ctx.stroke();
    const by = sy - 46 - pulse * 4;
    ctx.fillStyle = '#e8c86a';
    ctx.beginPath(); ctx.moveTo(sx - 9, by); ctx.lineTo(sx + 9, by); ctx.lineTo(sx, by + 12); ctx.closePath(); ctx.fill();
  } else {
    const cx = viewW / 2, cy = viewH / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    const rad = Math.min(viewW, viewH) / 2 - 110;
    const ex = cx + Math.cos(ang) * rad, ey = cy + Math.sin(ang) * rad;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.fillStyle = `rgba(232,200,106,${0.7 + pulse * 0.3})`;
    ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-8, -13); ctx.lineTo(-2, 0); ctx.lineTo(-8, 13); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawPauseVeil(ctx, g, viewW, viewH) {
  if (!g.paused) return;
  ctx.fillStyle = 'rgba(10,14,20,0.5)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.fillStyle = '#e8c86a'; ctx.font = 'bold 42px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('❚❚  Paused', viewW / 2, viewH / 2);
  ctx.textAlign = 'left';
}

function drawMinimap(ctx, state) {
  const g = state.game, pl = state.player;
  const size = 132, x = 16, y = 16, pad = 8;
  const s = (size - pad * 2) / CFG.map.w;
  const mx = c => x + pad + c * s, my = c => y + pad + c * s;
  ctx.fillStyle = 'rgba(20,14,6,0.8)'; roundRect(ctx, x, y, size, size, 10); ctx.fill();
  ctx.fillStyle = '#6f9a4a'; roundRect(ctx, x + pad, y + pad, size - pad * 2, size - pad * 2, 4); ctx.fill();
  ctx.fillStyle = '#3f86ad'; ctx.fillRect(mx(0), my(CFG.seaFromY), CFG.map.w * s, (CFG.map.h - CFG.seaFromY) * s);
  const c = CFG.city; ctx.fillStyle = '#cbb98f'; ctx.fillRect(mx(c.x0), my(c.y0), (c.x1 - c.x0) * s, (c.y1 - c.y0) * s);
  for (const n of g.nodes) { ctx.fillStyle = CFG.resourceMeta[n.type].color; ctx.fillRect(mx(n.x) - 1.5, my(n.y) - 1.5, 3, 3); }
  ctx.fillStyle = '#f0e0a0'; for (const p of g.porters) ctx.fillRect(mx(p.x) - 1, my(p.y) - 1, 2, 2);
  ctx.fillStyle = '#e05a4f'; for (const sp of g.spartans) ctx.fillRect(mx(sp.x) - 1.5, my(sp.y) - 1.5, 3, 3);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx(pl.x), my(pl.y), 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(232,200,106,0.5)'; ctx.lineWidth = 1.5; roundRect(ctx, x, y, size, size, 10); ctx.stroke();
}

function drawWallStatus(ctx, g, viewW) {
  const cx = viewW / 2, y = 52, bw = 300;
  const f = g.wall.hp / g.wall.maxHp;
  ctx.fillStyle = 'rgba(20,14,6,0.7)'; roundRect(ctx, cx - bw / 2 - 8, y - 6, bw + 16, 40, 12); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, cx - bw / 2, y + 12, bw, 12, 6); ctx.fill();
  ctx.fillStyle = f > 0.5 ? '#8fce6b' : f > 0.25 ? '#d9a441' : '#e05a4f';
  roundRect(ctx, cx - bw / 2, y + 12, bw * f, 12, 6); ctx.fill();
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText(`🛡 CITY WALLS  ${Math.ceil(g.wall.hp)} / ${g.wall.maxHp}`, cx, y + 8);
  ctx.font = 'bold 13px system-ui, sans-serif';
  let text, color;
  if (g.inWave) { text = `⚔ WAVE ${g.waveIndex} — ${g.spartans.length} Spartans at the wall`; color = '#e05a4f'; }
  else { const s = Math.max(0, Math.ceil(g.nextWaveAt - g.time)); text = `Next assault in ${s}s  ·  Waves survived ${g.waveIndex}/${CFG.waves.victoryWave}`; color = s <= 10 ? '#e0a83a' : '#cdbf98'; }
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = 'rgba(20,14,6,0.7)'; roundRect(ctx, cx - w / 2, y + 40, w, 24, 12); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(text, cx, y + 56);
}

function drawArmyFood(ctx, g, viewW) {
  const label = `⚔ ${g.hoplites.length}  🏹 ${g.archers.length}   🍞 ${Math.floor(g.cityFood)}`;
  ctx.font = 'bold 14px system-ui, sans-serif';
  const w = ctx.measureText(label).width + 24, x = viewW - w - 16, y = 52;
  ctx.fillStyle = 'rgba(20,14,6,0.82)'; roundRect(ctx, x, y, w, 30, 15); ctx.fill();
  ctx.fillStyle = g.cityFood <= 0 ? '#e05a4f' : '#cdbf98'; ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 20);
}

function drawToasts(ctx, g, viewW) {
  ctx.textAlign = 'center'; ctx.font = 'bold 14px system-ui, sans-serif';
  g.toasts.forEach((t, i) => {
    const y = 128 + i * 32;
    ctx.globalAlpha = Math.min(1, Math.max(0, (t.life - t.t) / 0.5));
    const w = ctx.measureText(t.text).width + 26;
    const border = t.kind === 'good' ? '#6fbf73' : t.kind === 'bad' ? '#e05a4f' : t.kind === 'warn' ? '#e0a83a' : '#b8912f';
    ctx.fillStyle = 'rgba(20,14,6,0.9)'; roundRect(ctx, viewW / 2 - w / 2, y, w, 26, 13); ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 2; roundRect(ctx, viewW / 2 - w / 2, y, w, 26, 13); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(t.text, viewW / 2, y + 18);
  });
  ctx.globalAlpha = 1;
}

function drawDrachmas(ctx, g, viewW) {
  const label = `🪙 ${Math.floor(g.drachmas)}`;
  ctx.font = 'bold 17px system-ui, sans-serif';
  const w = ctx.measureText(label).width + 26, x = viewW - w - 16, y = 12;
  ctx.fillStyle = 'rgba(20,14,6,0.82)'; roundRect(ctx, x, y, w, 34, 17); ctx.fill();
  ctx.strokeStyle = 'rgba(232,200,106,0.6)'; ctx.lineWidth = 2; roundRect(ctx, x, y, w, 34, 17); ctx.stroke();
  ctx.fillStyle = '#e8c86a'; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + 23);
}

function drawBackpack(ctx, pl, viewH) {
  const x = 16, y = viewH - 116, w = 224, h = 100;
  ctx.fillStyle = 'rgba(20,14,6,0.82)'; roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = pl.full ? '#e05a4f' : 'rgba(232,200,106,0.5)'; ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, 12); ctx.stroke();
  ctx.textAlign = 'left'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = '#e8c86a';
  ctx.fillText('🎒 Backpack', x + 12, y + 20);
  ctx.textAlign = 'right'; ctx.fillStyle = pl.full ? '#e05a4f' : '#cdbf98';
  ctx.fillText(`${pl.carried} / ${pl.carryCap}`, x + w - 12, y + 20);
  ctx.textAlign = 'left'; ctx.font = '14px system-ui, sans-serif'; ctx.fillStyle = '#fff';
  const raw = [['🫒', pl.carry.olives], ['🍇', pl.carry.grapes], ['🐟', pl.carry.fish]];
  const goods = [['🫗', pl.carry.oil], ['🍷', pl.carry.wine], ['🍞', pl.carry.food]];
  raw.forEach(([ic, n], i) => ctx.fillText(`${ic} ${n}`, x + 14 + i * 70, y + 44));
  goods.forEach(([ic, n], i) => ctx.fillText(`${ic} ${n}`, x + 14 + i * 70, y + 66));
  const bw = w - 24, bx = x + 12, by = y + 80;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(ctx, bx, by, bw, 8, 4); ctx.fill();
  ctx.fillStyle = pl.full ? '#e05a4f' : '#8fce6b'; roundRect(ctx, bx, by, bw * (pl.carried / pl.carryCap), 8, 4); ctx.fill();
}

// ---- geometry & colour helpers -------------------------------------------
function prism(rect, baseElev, height) {
  const A = proj(rect.x, rect.y), B = proj(rect.x + rect.w, rect.y), C = proj(rect.x + rect.w, rect.y + rect.h), D = proj(rect.x, rect.y + rect.h);
  const e = (p, h) => ({ x: p.x, y: p.y - h });
  return {
    Ab: e(A, baseElev), Bb: e(B, baseElev), Cb: e(C, baseElev), Db: e(D, baseElev),
    At: e(A, baseElev + height), Bt: e(B, baseElev + height), Ct: e(C, baseElev + height), Dt: e(D, baseElev + height),
  };
}
function expand(rect, m) { return { x: rect.x - m, y: rect.y - m, w: rect.w + m * 2, h: rect.h + m * 2 }; }
function over(a, b) { return { x: a.x, y: a.y }; } // eaves flush with the body top (no gap)
function quad(ctx, pts, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.fill(); }
function face(ctx, pts, topCol, botCol) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const g = ctx.createLinearGradient(0, minY, 0, maxY);
  g.addColorStop(0, topCol); g.addColorStop(1, botCol);
  quad(ctx, pts, g);
}
function blob(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); ctx.fill(); }
// Safe ellipse — clamps radii so a computed negative can never throw & freeze the frame.
function ell(ctx, x, y, rx, ry, rot, a0, a1) { ctx.ellipse(x, y, Math.max(0.01, rx || 0), Math.max(0.01, ry || 0), rot, a0, a1); }
function lerpv(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function lerpvE(base, top, elev) { const h = base.y - top.y || 1; const t = elev / h; return lerpv(base, top, t); }
function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function frac(v) { return v - Math.floor(v); }
function parseColor(c) {
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : { r: 200, g: 200, b: 200 };
}
function mix(a, b, t) { t = Math.max(0, Math.min(1, t)); const A = parseColor(a), B = parseColor(b); return `rgb(${Math.round(A.r + (B.r - A.r) * t)},${Math.round(A.g + (B.g - A.g) * t)},${Math.round(A.b + (B.b - A.b) * t)})`; }
function shade(hex, amt) { return amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt); }
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
