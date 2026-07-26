// ============================================================================
//  Aegis of Athens — HTML overlay UI: HUD, shop panel, toasts, modals.
//  Reads game state each frame and keeps the DOM in sync.
// ============================================================================

import { CONFIG } from './config.js';

export function setupUI(game, controls) {
  buildHUD();
  buildShop(game);
  buildControls(game, controls);
  wireModals(game, controls);
  return { sync: () => syncUI(game) };
}

// ---------------------------------------------------------------------------
function el(id) { return document.getElementById(id); }

function buildHUD() {
  const bar = el('resource-bar');
  const items = [
    ['drachmas', '₪', 'Drachmas'],
    ['olives', '🫒', 'Olives'], ['grapes', '🍇', 'Grapes'], ['fish', '🐟', 'Fish'],
    ['oil', '🫗', 'Olive Oil'], ['wine', '🍷', 'Wine'], ['food', '🍞', 'Food'],
  ];
  bar.innerHTML = items.map(([k, icon, label]) =>
    `<div class="res" title="${label}"><span class="res-ic">${icon}</span><span class="res-val" id="hud-${k}">0</span></div>`
  ).join('');
}

function buildShop(game) {
  const box = el('shop-body');
  let html = '<div class="shop-section">Economy & Gathering</div>';
  for (const key of ['harvest', 'workers', 'press', 'winery', 'granary']) {
    html += shopRow(key, CONFIG.upgrades[key]);
  }
  html += '<div class="shop-section">Defence of Athens</div>';
  html += shopRow('wall', CONFIG.upgrades.wall);
  for (const key of ['repair', 'hoplite', 'archer']) {
    const a = CONFIG.actions[key];
    html += `<button class="shop-item" data-action="${key}">
      <div class="si-main"><span class="si-name">${a.name}</span><span class="si-desc">${a.desc}</span></div>
      <span class="si-cost" id="cost-${key}">${a.cost} ₪</span></button>`;
  }
  box.innerHTML = html;

  box.querySelectorAll('.shop-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.up) game.buyUpgrade(btn.dataset.up);
      else if (btn.dataset.action) game.buyAction(btn.dataset.action);
    });
  });
}

function shopRow(key, u) {
  return `<button class="shop-item" data-up="${key}">
    <div class="si-main"><span class="si-name">${u.name} <span class="si-lv" id="lv-${key}"></span></span>
    <span class="si-desc">${u.desc}</span></div>
    <span class="si-cost" id="cost-${key}">—</span></button>`;
}

function buildControls(game, controls) {
  el('btn-shop').addEventListener('click', () => toggleShop());
  el('btn-shop-close').addEventListener('click', () => toggleShop(false));
  el('btn-pause').addEventListener('click', () => {
    game.paused = !game.paused;
    el('btn-pause').textContent = game.paused ? '▶' : '⏸';
    el('pause-veil').classList.toggle('show', game.paused);
  });
  el('btn-save').addEventListener('click', () => game.save());
  el('btn-sell').addEventListener('click', () => game.sellAll());
  el('btn-auto').addEventListener('click', () => {
    game.autoSell = !game.autoSell;
    el('btn-auto').classList.toggle('on', game.autoSell);
    el('btn-auto').textContent = game.autoSell ? 'Auto-Sell: ON' : 'Auto-Sell: OFF';
  });
}

function toggleShop(force) {
  const panel = el('shop');
  const show = force === undefined ? !panel.classList.contains('show') : force;
  panel.classList.toggle('show', show);
}

function wireModals(game, controls) {
  el('btn-restart').addEventListener('click', () => controls.restart());
  el('start-play').addEventListener('click', () => { el('start-modal').classList.remove('show'); controls.start(false); });
  el('start-continue').addEventListener('click', () => { el('start-modal').classList.remove('show'); controls.start(true); });
}

// ---------------------------------------------------------------------------
let lastOver = false;

function syncUI(game) {
  // HUD numbers
  setText('hud-drachmas', Math.floor(game.drachmas));
  setText('hud-olives', Math.floor(game.raw.olives));
  setText('hud-grapes', Math.floor(game.raw.grapes));
  setText('hud-fish', Math.floor(game.raw.fish));
  setText('hud-oil', Math.floor(game.goods.oil));
  setText('hud-wine', Math.floor(game.goods.wine));
  setText('hud-food', Math.floor(game.goods.food));

  // Status strip
  setText('stat-day', `Day ${game.day}`);
  setText('stat-army', `⚔ ${game.hoplites.length}  🏹 ${game.archers.length}`);
  const nextIn = Math.max(0, Math.ceil(game.nextWaveAt - game.time));
  const waveEl = el('stat-wave');
  if (game.inWave) { waveEl.textContent = `⚔ WAVE ${game.waveIndex} — ${game.spartans.length} Spartans`; waveEl.className = 'stat danger'; }
  else { waveEl.textContent = `Next assault: ${nextIn}s`; waveEl.className = 'stat' + (nextIn <= 10 ? ' warn' : ''); }
  setText('stat-survived', `Waves: ${game.waveIndex}/${CONFIG.waves.victoryWave}`);

  // Food warning
  el('stat-food-warn').classList.toggle('show', game.goods.food < 3 && game.soldierCount > 0);

  // Shop costs / levels / affordability
  for (const key of Object.keys(CONFIG.upgrades)) {
    const cost = game.upgradeCost(key);
    const btn = document.querySelector(`[data-up="${key}"]`);
    const lvlSpan = el(`lv-${key}`);
    if (lvlSpan) lvlSpan.textContent = `Lv.${game.levels[key]}`;
    const costEl = el(`cost-${key}`);
    if (!isFinite(cost)) { costEl.textContent = 'MAX'; btn.classList.add('maxed'); btn.classList.remove('afford', 'poor'); }
    else { costEl.textContent = `${cost} ₪`; btn.classList.remove('maxed'); setAfford(btn, game.canAfford(cost)); }
  }
  for (const key of Object.keys(CONFIG.actions)) {
    const btn = document.querySelector(`[data-action="${key}"]`);
    setAfford(btn, game.canAfford(CONFIG.actions[key].cost));
  }

  // Toasts
  renderToasts(game);

  // Game over / victory modal
  if (game.over && !lastOver) showEndModal(game);
  lastOver = game.over;
}

function setAfford(btn, ok) { if (!btn) return; btn.classList.toggle('afford', ok); btn.classList.toggle('poor', !ok); }
function setText(id, v) { const e = el(id); if (e && e.textContent != v) e.textContent = v; }

function renderToasts(game) {
  const box = el('toasts');
  box.innerHTML = game.toasts.map(t => {
    const alpha = Math.max(0, 1 - t.t / t.life);
    return `<div class="toast ${t.kind}" style="opacity:${alpha}">${t.msg}</div>`;
  }).join('');
}

function showEndModal(game) {
  const modal = el('end-modal');
  el('end-title').textContent = game.won ? '🏛 Athens Endures!' : '🛡 Athens Has Fallen';
  el('end-title').className = game.won ? 'win' : 'lose';
  el('end-msg').textContent = game.won
    ? `You survived all ${CONFIG.waves.victoryWave} Spartan assaults across ${game.day} days. The polis is saved!`
    : (game.overReason || 'The Spartans have breached the city.') + ` You held for ${game.waveIndex} wave(s), ${game.day} days.`;
  modal.classList.add('show');
}

export function hideEndModal() { el('end-modal').classList.remove('show'); }
