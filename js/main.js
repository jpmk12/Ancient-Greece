// ============================================================================
//  Aegis of Athens — bootstrap: canvas scaling, game loop, wiring.
// ============================================================================

import { CONFIG } from './config.js';
import { Game } from './game.js';
import { render } from './render.js';
import { setupInput } from './input.js';
import { setupUI, hideEndModal } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = new Game();
let transform = { scale: 1, offsetX: 0, offsetY: 0 };
const getTransform = () => transform;

// ---- Responsive canvas: fit the logical world into the viewport ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const availW = window.innerWidth;
  const availH = window.innerHeight;
  const scale = Math.min(availW / CONFIG.world.width, availH / CONFIG.world.height);

  const cssW = CONFIG.world.width * scale;
  const cssH = CONFIG.world.height * scale;

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(CONFIG.world.width * dpr);
  canvas.height = Math.round(CONFIG.world.height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Offsets are 0 because the canvas element itself is centered via CSS;
  // input maps relative to the canvas rect, so scale is what matters.
  transform = { scale: cssW / CONFIG.world.width, offsetX: 0, offsetY: 0 };
}
window.addEventListener('resize', resize);
resize();

// ---- Controls handed to the UI (start / restart) -------------------------
const controls = {
  start(continueSave) {
    if (continueSave && Game.hasSave()) game.load();
    else game.reset();
    running = true;
  },
  restart() {
    hideEndModal();
    game.reset();
    running = true;
  },
};

const ui = setupUI(game, controls);
setupInput(canvas, game, getTransform);

// Show the start modal; enable "continue" only if a save exists.
const startModal = document.getElementById('start-modal');
if (!Game.hasSave()) document.getElementById('start-continue').classList.add('hidden');
startModal.classList.add('show');

// ---- Main loop -----------------------------------------------------------
let running = false;
let last = performance.now();

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (running) game.update(dt);
  render(ctx, game);
  ui.sync();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Auto-save every 20s while playing (nice for the browser-refresh case).
setInterval(() => { if (running && !game.over) { try { localStorage.setItem(CONFIG.saveKey, game.serialize()); } catch (e) {} } }, 20000);

// Pause when the tab is hidden so we don't fast-forward on return.
document.addEventListener('visibilitychange', () => { if (document.hidden) last = performance.now(); });

// Expose for debugging in the console.
window.__game = game;
