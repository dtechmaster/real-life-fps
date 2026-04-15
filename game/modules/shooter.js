import { isCrosshairOnPerson } from './crosshair.js';
import { getConfig }           from './storage.js';

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


  const barrelBtn = document.getElementById('barrel-tip');
  if (barrelBtn) {
    barrelBtn.addEventListener('mousedown',  function() { mouseDown = true;  });
    barrelBtn.addEventListener('mouseup',    function() { mouseDown = false; });
    barrelBtn.addEventListener('touchstart', function() { mouseDown = true;  }, { passive: true });
    barrelBtn.addEventListener('touchend',   function() { mouseDown = false; }, { passive: true });
  }

  document.addEventListener('keydown', function(e) {
    const scheme = getConfig('key_scheme', 'shift_sr');
    if (matchesShoot(e, scheme))  shiftSDown = true;
    if (matchesReload(e, scheme)) reload();
  });
  document.addEventListener('keyup', function(e) {
    const scheme = getConfig('key_scheme', 'shift_sr');
    if (matchesShootRelease(e, scheme)) shiftSDown = false;
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
  const firing    = inputHeld && hasAmmo;           // trigger pulled
  const hitting   = firing && isCrosshairOnPerson(); // actually on target

  if (firing && !wasFiring) emit('onShootStart');

  // Rate-limited shot: consume ammo + fire effects every interval
  if (firing && (now - lastShotTime) >= SHOT_INTERVAL_MS) {
    ammo--;
    lastShotTime = now;
    emit('onShoot', hitting); // hitting flag tells listeners if this counts
  }

  if (!firing && wasFiring) emit('onShootEnd');

  wasFiring = firing;
}

/** @param {'onShootStart'|'onShoot'|'onShootEnd'} event */
export function onShooterEvent(event, callback) {
  listeners[event]?.push(callback);
}

export function isFiring()   { return wasFiring && isCrosshairOnPerson(); }
export function getAmmo()    { return ammo; }
export function getMaxAmmo() { return MAX_AMMO; }
// #endregion

// #region Internal
function reload() {
  ammo = MAX_AMMO;
}

function emit(event, arg) {
  for (const cb of listeners[event]) cb(arg);
}

function matchesShoot(e, scheme) {
  if (scheme === 'shift_sr') return e.shiftKey && e.key === 'S';
  if (scheme === 'sr')       return e.key === 's' || e.key === 'S';
  if (scheme === 'f2f4')     return e.key === 'F2';
  return false;
}

function matchesReload(e, scheme) {
  if (scheme === 'shift_sr') return e.shiftKey && e.key === 'R';
  if (scheme === 'sr')       return e.key === 'r' || e.key === 'R';
  if (scheme === 'f2f4')     return e.key === 'F4';
  return false;
}

function matchesShootRelease(e, scheme) {
  if (scheme === 'shift_sr') return e.key === 'S' || e.key === 'Shift';
  if (scheme === 'sr')       return e.key === 's' || e.key === 'S';
  if (scheme === 'f2f4')     return e.key === 'F2';
  return false;
}
// #endregion
