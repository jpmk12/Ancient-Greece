// ============================================================================
//  Aegis of Athens v2 — bootstrap: canvas sizing, game loop, wiring.
//  Phase 1: walk an isometric character in and out of the city gate.
// ============================================================================

import { Player } from './player.js';
import { Game } from './game.js';
import { setupInput, getInput } from './input.js';
import { setupUI } from './ui.js';
import { updateCamera } from './world.js';
import { render } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const state = {
  time: 0,
  player: new Player(),
  game: new Game(),
};

const controls = {
  hireHoplite: () => state.game.hireHoplite(),
  hireArcher: () => state.game.hireArcher(),
  repairWall: () => state.game.repairWall(),
  restart: () => { state.game = new Game(); state.player = new Player(); },
  getGame: () => state.game,
};
const ui = setupUI(controls);

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
  if (!state.game.over) state.player.update(dt, getInput());
  state.game.update(dt, state.player);
  updateCamera(state.player.x, state.player.y, viewW, viewH);

  render(ctx, state, viewW, viewH);
  ui.sync();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { if (document.hidden) last = performance.now(); });

// expose for debugging / automated testing
window.__state = state;
