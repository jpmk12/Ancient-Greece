// ============================================================================
//  Aegis of Athens — pointer/touch input. Maps screen taps to world space and
//  forwards them to the game. Designed for iPad Safari (touch) + desktop mouse.
// ============================================================================

import { CONFIG } from './config.js';

export function setupInput(canvas, game, getTransform) {
  const toWorld = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = getTransform();
    const x = (clientX - rect.left - offsetX) / scale;
    const y = (clientY - rect.top - offsetY) / scale;
    return { x, y };
  };

  // Use pointer events — they unify mouse + touch and give us multi-tap.
  const onDown = (e) => {
    if (game.over) return;
    // Support multiple simultaneous touches for fast tapping.
    const points = e.changedTouches ? Array.from(e.changedTouches) : [e];
    for (const p of points) {
      const { x, y } = toWorld(p.clientX, p.clientY);
      if (x >= 0 && y >= 0 && x <= CONFIG.world.width && y <= CONFIG.world.height) {
        game.handleTap(x, y);
      }
    }
    // Prevent double-firing / page scroll on touch.
    if (e.cancelable) e.preventDefault();
  };

  // Prefer touch events on iPad (allows true multi-touch tapping); fall back
  // to pointer/mouse elsewhere.
  if ('ontouchstart' in window) {
    canvas.addEventListener('touchstart', onDown, { passive: false });
  } else {
    canvas.addEventListener('pointerdown', onDown);
  }

  // Block context menu / long-press selection on the canvas.
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}
