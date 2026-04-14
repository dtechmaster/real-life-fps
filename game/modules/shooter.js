import { isCrosshairOnPerson } from './crosshair.js';

// #region Input state
let mouseDown  = false;
let shiftSDown = false;
let wasFiring  = false;

const listeners = {
  onShootStart : [],
  onShoot      : [],
  onShootEnd   : [],
};
// #endregion

// #region Ammo state
const MAX_AMMO        = 50;
const SHOT_INTERVAL_MS = 50; // ~8 shots/sec
let ammo         = MAX_AMMO;
let lastShotTime = 0;
// #endregion

// #region Public API
export function initShooter() {
  document.addEventListener('mousedown', function(e) {
    if (e.button === 0) mouseDown = true;
  });
  document.addEventListener('mouseup', function(e) {
    if (e.button === 0) mouseDown = false;
  });

  // Touch: only intercept touches that land on a canvas (shooting area).
  // Calling preventDefault only on canvas touches lets UI buttons work normally.
  document.addEventListener('touchstart', function(e) {
    if (e.target.tagName === 'CANVAS') {
      e.preventDefault();
      mouseDown = true;
    }
  }, { passive: false });
  document.addEventListener('touchend', function(e) {
    if (e.target.tagName === 'CANVAS') mouseDown = false;
  });
  document.addEventListener('touchcancel', function() {
    mouseDown = false;
  });

  document.addEventListener('keydown', function(e) {
    if (e.shiftKey && e.key === 'S') shiftSDown = true;
    if (e.shiftKey && e.key === 'R') reload();
  });
  document.addEventListener('keyup', function(e) {
    if (e.key === 'S' || e.key === 'Shift') shiftSDown = false;
  });
}

export function resetShooter() {
  mouseDown  = false;
  shiftSDown = false;
  wasFiring  = false;
  ammo       = MAX_AMMO;
  lastShotTime = 0;
}

/**
 * Call once per frame inside onMask.
 * Evaluates shoot condition and fires appropriate events.
 */
export function tickShooter() {
  const now       = performance.now();
  const hasAmmo   = ammo > 0;
  const inputHeld = mouseDown || shiftSDown;
  const firing    = isCrosshairOnPerson() && inputHeld && hasAmmo;

  if (firing && !wasFiring) emit('onShootStart');

  // Rate-limited shot: emit onShoot and consume ammo only when interval passes
  if (firing && (now - lastShotTime) >= SHOT_INTERVAL_MS) {
    ammo--;
    lastShotTime = now;
    emit('onShoot');
  }

  if (!firing && wasFiring) emit('onShootEnd');

  wasFiring = firing;
}

/** @param {'onShootStart'|'onShoot'|'onShootEnd'} event */
export function onShooterEvent(event, callback) {
  listeners[event]?.push(callback);
}

export function isFiring()   { return wasFiring; }
export function getAmmo()    { return ammo; }
export function getMaxAmmo() { return MAX_AMMO; }
// #endregion

// #region Internal
function reload() {
  ammo = MAX_AMMO;
}

function emit(event) {
  for (const cb of listeners[event]) cb();
}
// #endregion
