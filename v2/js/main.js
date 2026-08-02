// ============================================================================
//  Aegis of Athens v2 — bootstrap: canvas sizing, game loop, wiring.
//  Phase 1: walk an isometric character in and out of the city gate.
// ============================================================================

import { CFG } from './config.js';
import { Player } from './player.js';
import { Game } from './game.js';
import { setupInput, getInput } from './input.js';
import { setupUI } from './ui.js';
import { updateCamera } from './world.js';
import { render } from './render.js';
import { initAudio, play as playSfx, setMuted, isMuted } from './sfx.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const state = {
  time: 0,
  player: new Player(),
  game: new Game(),
};

function saveGame(announce) {
  try {
    localStorage.setItem(CFG.saveKey, JSON.stringify(state.game.serialize(state.player)));
    if (announce) state.game.toast('Game saved', 'good');
  } catch (e) { /* storage unavailable */ }
}
function loadGame() {
  try { const d = JSON.parse(localStorage.getItem(CFG.saveKey)); if (d) return state.game.applySave(d, state.player); }
  catch (e) {}
  return false;
}

const controls = {
  hireHoplite: () => state.game.hireHoplite(),
  hireArcher: () => state.game.hireArcher(),
  repairWall: () => state.game.repairWall(),
  buyUpgrade: (key) => state.game.buyUpgrade(key, state.player),
  hirePorter: (role) => state.game.hirePorter(role),
  rally: () => state.game.rally(),
  togglePause: () => { state.game.paused = !state.game.paused; },
  toggleMute: () => setMuted(!isMuted()),
  isMuted: () => isMuted(),
  save: () => saveGame(true),
  restart: () => { try { localStorage.removeItem(CFG.saveKey); } catch (e) {} state.game = new Game(); state.player = new Player(); },
  getGame: () => state.game,
};
const ui = setupUI(controls);

// Resume a saved game if one exists.
loadGame();

// Audio needs a user gesture to start; kick it off on first interaction.
const wake = () => { initAudio(); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
window.addEventListener('pointerdown', wake);
window.addEventListener('keydown', wake);

// Autosave periodically while playing.
setInterval(() => { if (!state.game.over) saveGame(); }, 15000);

let viewW = 0, viewH = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

setupInput(canvas);

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);

  state.time += dt;
  if (!state.game.over && !state.game.paused) {
    state.player.update(dt, getInput());
    state.game.update(dt, state.player);
  }
  updateCamera(state.player.x, state.player.y, viewW, viewH);

  // drain queued sound effects
  if (state.game.sfx.length) { for (const s of state.game.sfx) playSfx(s); state.game.sfx.length = 0; }

  // A drawing error must never halt the loop — log once, keep running.
  try { render(ctx, state, viewW, viewH); }
  catch (e) { if (!window.__renderErr) { console.error('render error', e); window.__renderErr = true; } }
  try { ui.sync(); } catch (e) {}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { if (document.hidden) last = performance.now(); });

// expose for debugging / automated testing
window.__state = state;
window.__save = () => saveGame(true);
window.__load = loadGame;
