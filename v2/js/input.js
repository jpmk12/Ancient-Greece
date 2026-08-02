// ============================================================================
//  Aegis of Athens v2 — input: floating virtual joystick (touch) + WASD/arrow
//  keys (desktop). Produces a screen-space direction vector for the player.
// ============================================================================

const MAX_R = 62; // joystick knob travel in CSS px

export const joystick = {
  active: false,
  source: null,      // 'touch' | 'mouse'
  touchId: null,     // identifier of the controlling touch (ignore others)
  originX: 0, originY: 0,
  curX: 0, curY: 0,
  dx: 0, dy: 0,      // normalised (-1..1), magnitude clamped to 1
};

const keys = new Set();

export function setupInput(canvas) {
  // ---- Touch (primary on iPad) — one controlling finger; ignore extras/palm ----
  canvas.addEventListener('touchstart', e => {
    if (joystick.source !== 'touch') {
      const t = e.changedTouches[0];
      joystick.touchId = t.identifier;
      beginStick(t.clientX, t.clientY, 'touch');
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (joystick.source !== 'touch') return;
    for (const t of e.changedTouches) {
      if (t.identifier === joystick.touchId) { moveStick(t.clientX, t.clientY); break; }
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  const endTouch = e => {
    if (joystick.source !== 'touch') return;
    for (const t of e.changedTouches) if (t.identifier === joystick.touchId) { endStick(); break; }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  // ---- Mouse drag (desktop convenience) ----
  canvas.addEventListener('mousedown', e => { beginStick(e.clientX, e.clientY, 'mouse'); });
  window.addEventListener('mousemove', e => { if (joystick.source === 'mouse') moveStick(e.clientX, e.clientY); });
  window.addEventListener('mouseup', e => { if (joystick.source === 'mouse') endStick(); });

  // ---- Keyboard (desktop + automated testing) ----
  window.addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); });
  window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); });
  // Clear held state if focus is lost so movement can't get stuck.
  window.addEventListener('blur', () => { keys.clear(); endStick(); });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function beginStick(x, y, source) {
  joystick.active = true; joystick.source = source;
  joystick.originX = x; joystick.originY = y;
  joystick.curX = x; joystick.curY = y;
  joystick.dx = 0; joystick.dy = 0;
}

function moveStick(x, y) {
  let dx = x - joystick.originX, dy = y - joystick.originY;
  const d = Math.hypot(dx, dy);
  if (d > MAX_R) { dx = dx / d * MAX_R; dy = dy / d * MAX_R; }
  joystick.curX = joystick.originX + dx;
  joystick.curY = joystick.originY + dy;
  joystick.dx = dx / MAX_R;
  joystick.dy = dy / MAX_R;
}

function endStick() {
  joystick.active = false; joystick.source = null; joystick.touchId = null;
  joystick.dx = 0; joystick.dy = 0;
}

// Combined input vector (screen space). Keyboard wins when no stick is held.
export function getInput() {
  if (joystick.active) return { dx: joystick.dx, dy: joystick.dy };
  let dx = 0, dy = 0;
  if (keys.has('a') || keys.has('arrowleft'))  dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (keys.has('w') || keys.has('arrowup'))    dy -= 1;
  if (keys.has('s') || keys.has('arrowdown'))  dy += 1;
  const m = Math.hypot(dx, dy);
  if (m > 0) { dx /= m; dy /= m; }
  return { dx, dy };
}
