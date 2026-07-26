// ============================================================================
//  Aegis of Athens v2 — DOM overlay: quick-hire dock, upgrade shop, end modal.
// ============================================================================

import { CFG } from './config.js';

export function setupUI(controls) {
  // ---- bottom-right dock: shop toggle + quick defence + save ----
  const dock = document.createElement('div');
  dock.id = 'hire-dock';
  const btn = (id, label, cost) => `<button class="hbtn" id="${id}">${label}${cost != null ? `<span class="cost">${cost} ₪</span>` : ''}</button>`;
  dock.innerHTML =
    btn('open-shop', '🏛 Upgrades', null) +
    btn('hire-hoplite', '⚔ Hoplite', CFG.costs.hoplite) +
    btn('hire-archer', '🏹 Archer', CFG.costs.archer) +
    btn('repair-wall', '🛠 Repair', CFG.costs.repair) +
    btn('save-game', '💾 Save', null);
  document.body.appendChild(dock);

  // ---- upgrade shop panel ----
  const shop = document.createElement('div');
  shop.id = 'shop';
  let rows = '<div class="shop-head"><span>🏛 Build &amp; Upgrade</span><button id="close-shop">✕</button></div><div class="shop-body">';
  rows += '<div class="shop-sec">Economy &amp; Gathering</div>';
  for (const key of ['carry', 'speed', 'press', 'winery', 'granary']) rows += shopRow('up', key, CFG.upgrades[key]);
  rows += '<div class="shop-sec">Automation — Porters</div>';
  rows += porterRow('gather', '🧺 Gatherer Porter', 'Auto-gathers &amp; stocks the workshops', CFG.porters.gatherCost);
  rows += porterRow('trade', '💰 Merchant Porter', 'Auto-sells finished goods at the Agora', CFG.porters.tradeCost);
  rows += '<div class="shop-sec">Defence</div>';
  rows += shopRow('up', 'wall', CFG.upgrades.wall);
  rows += '</div>';
  shop.innerHTML = rows;
  document.body.appendChild(shop);

  // ---- end modal ----
  const modal = document.createElement('div');
  modal.id = 'modal'; modal.className = 'modal';
  modal.innerHTML = `<div class="card"><h1 id="modal-title"></h1><p id="modal-msg"></p><button id="restart" class="hbtn primary">Play Again</button></div>`;
  document.body.appendChild(modal);

  const $ = id => document.getElementById(id);
  $('hire-hoplite').onclick = () => controls.hireHoplite();
  $('hire-archer').onclick = () => controls.hireArcher();
  $('repair-wall').onclick = () => controls.repairWall();
  $('save-game').onclick = () => controls.save();
  $('open-shop').onclick = () => shop.classList.add('show');
  $('close-shop').onclick = () => shop.classList.remove('show');
  $('restart').onclick = () => { modal.classList.remove('show'); controls.restart(); };
  shop.querySelectorAll('[data-up]').forEach(b => b.onclick = () => controls.buyUpgrade(b.dataset.up));
  shop.querySelectorAll('[data-porter]').forEach(b => b.onclick = () => controls.hirePorter(b.dataset.porter));

  // don't let overlay taps drive the movement joystick
  for (const el of [dock, shop, modal]) {
    el.addEventListener('touchstart', e => e.stopPropagation());
    el.addEventListener('mousedown', e => e.stopPropagation());
  }

  let shown = false;
  const setAfford = (id, ok) => { const b = $(id); if (b) { b.classList.toggle('afford', ok); b.classList.toggle('poor', !ok); } };

  return {
    sync() {
      const g = controls.getGame();
      setAfford('hire-hoplite', g.drachmas >= CFG.costs.hoplite);
      setAfford('hire-archer', g.drachmas >= CFG.costs.archer);
      setAfford('repair-wall', g.drachmas >= CFG.costs.repair && g.wall.hp < g.wall.maxHp);

      for (const key of Object.keys(CFG.upgrades)) {
        const cost = g.upgradeCost(key);
        const lvlEl = $(`lv-${key}`), costEl = $(`cost-${key}`), row = document.querySelector(`[data-up="${key}"]`);
        if (lvlEl) lvlEl.textContent = `Lv.${g.levels[key]}`;
        if (!isFinite(cost)) { if (costEl) costEl.textContent = 'MAX'; row && row.classList.add('maxed'); }
        else { if (costEl) costEl.textContent = `${cost} ₪`; row && row.classList.remove('maxed'); setAfford(row.id, g.drachmas >= cost); }
      }
      for (const role of ['gather', 'trade']) {
        const cost = role === 'trade' ? CFG.porters.tradeCost : CFG.porters.gatherCost;
        const n = g.porters.filter(p => p.role === role).length;
        const cntEl = $(`pn-${role}`); if (cntEl) cntEl.textContent = `×${n}`;
        const row = document.querySelector(`[data-porter="${role}"]`);
        const maxed = n >= CFG.porters.maxEach;
        if (row) { row.classList.toggle('maxed', maxed); setAfford(row.id, !maxed && g.drachmas >= cost); }
      }

      if (g.over && !shown) {
        const win = g.won;
        $('modal-title').textContent = win ? '🏛 Athens Endures!' : '🛡 Athens Has Fallen';
        $('modal-title').className = win ? 'win' : 'lose';
        $('modal-msg').textContent = win
          ? `You repelled all ${CFG.waves.victoryWave} Spartan assaults. The polis is saved!`
          : `${g.overReason || 'The Spartans have breached the city.'} You held for ${g.waveIndex} wave(s).`;
        modal.classList.add('show'); shop.classList.remove('show'); shown = true;
      }
      if (!g.over) shown = false;
    },
  };
}

function shopRow(kind, key, u) {
  return `<button class="shop-item" id="row-${key}" data-${kind}="${key}">
    <div class="si-main"><span class="si-name">${u.name} <span class="si-lv" id="lv-${key}"></span></span>
    <span class="si-desc">${u.desc}</span></div>
    <span class="si-cost" id="cost-${key}">—</span></button>`;
}

function porterRow(role, name, desc, cost) {
  return `<button class="shop-item" id="row-p-${role}" data-porter="${role}">
    <div class="si-main"><span class="si-name">${name} <span class="si-lv" id="pn-${role}"></span></span>
    <span class="si-desc">${desc}</span></div>
    <span class="si-cost">${cost} ₪</span></button>`;
}
