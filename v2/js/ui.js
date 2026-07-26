// ============================================================================
//  Aegis of Athens v2 — DOM overlay: hire/repair dock and the end-game modal.
//  Canvas draws the world & HUD; the DOM handles buttons (reliable taps).
// ============================================================================

import { CFG } from './config.js';

export function setupUI(controls) {
  const dock = document.createElement('div');
  dock.id = 'hire-dock';
  const btn = (id, label, cost) =>
    `<button class="hbtn" id="${id}">${label}<span class="cost">${cost} ₪</span></button>`;
  dock.innerHTML =
    btn('hire-hoplite', '⚔ Hoplite', CFG.costs.hoplite) +
    btn('hire-archer', '🏹 Archer', CFG.costs.archer) +
    btn('repair-wall', '🛠 Repair', CFG.costs.repair);
  document.body.appendChild(dock);

  const modal = document.createElement('div');
  modal.id = 'modal';
  modal.className = 'modal';
  modal.innerHTML =
    `<div class="card">
       <h1 id="modal-title"></h1>
       <p id="modal-msg"></p>
       <button id="restart" class="hbtn primary">Play Again</button>
     </div>`;
  document.body.appendChild(modal);

  const $ = id => document.getElementById(id);
  $('hire-hoplite').onclick = () => controls.hireHoplite();
  $('hire-archer').onclick = () => controls.hireArcher();
  $('repair-wall').onclick = () => controls.repairWall();
  $('restart').onclick = () => { modal.classList.remove('show'); controls.restart(); };

  // Stop button taps from starting the movement joystick behind them.
  for (const el of [dock, modal]) {
    el.addEventListener('touchstart', e => e.stopPropagation());
    el.addEventListener('mousedown', e => e.stopPropagation());
  }

  let shown = false;
  function setState(id, ok) {
    const b = $(id);
    b.classList.toggle('afford', ok);
    b.classList.toggle('poor', !ok);
  }

  return {
    sync() {
      const g = controls.getGame();
      setState('hire-hoplite', g.drachmas >= CFG.costs.hoplite);
      setState('hire-archer', g.drachmas >= CFG.costs.archer);
      setState('repair-wall', g.drachmas >= CFG.costs.repair && g.wall.hp < g.wall.maxHp);
      if (g.over && !shown) {
        const win = g.won;
        $('modal-title').textContent = win ? '🏛 Athens Endures!' : '🛡 Athens Has Fallen';
        $('modal-title').className = win ? 'win' : 'lose';
        $('modal-msg').textContent = win
          ? `You repelled all ${CFG.waves.victoryWave} Spartan assaults. The polis is saved!`
          : `${g.overReason || 'The Spartans have breached the city.'} You held for ${g.waveIndex} wave(s).`;
        modal.classList.add('show');
        shown = true;
      }
      if (!g.over) shown = false;
    },
  };
}
