import { getConfig } from './storage.js';

// #region Crosshair state
const PERSON_CATEGORY = 1; // segmenter normalizes all models to binary mask
let _isOnPerson  = false;
let _recoilX     = 0;
let _recoilY     = 0;

export function initCrosshair() {}

/**
 * Called each frame from index.js onMask().
 * Updates hit state and redraws crosshair.
 *
 * @param {Uint8Array} mask
 * @param {number}     maskWidth
 * @param {number}     maskHeight
 * @param {CanvasRenderingContext2D} ctx - context of #hud-canvas
 * @param {number}     displayWidth
 * @param {number}     displayHeight
 * @param {boolean}    firing - whether the player is currently shooting
 */
export function updateCrosshair(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight, firing) {
  _isOnPerson = checkCenterOnPerson(mask, maskWidth, maskHeight, displayWidth, displayHeight);
  updateRecoil(firing);
  drawCrosshair(ctx, displayWidth, displayHeight, _isOnPerson);
}

/** Returns true if the current frame has the crosshair center over a person pixel. */
export function isCrosshairOnPerson() {
  return _isOnPerson;
}

/** Returns the current crosshair position (center + recoil offset). */
export function getCrosshairPos(w, h) {
  return {
    x: Math.floor(w / 2) + _recoilX,
    y: Math.floor(h / 2) + _recoilY,
  };
}
// #endregion

// #region Recoil
const RECOIL_DECAY = 0.85; // how fast the offset snaps back each frame

function updateRecoil(firing) {
  if (firing) {
    const intensity = 8;
    // Kick upward with random horizontal spread (like real recoil)
    _recoilX += (Math.random() - 0.5) * intensity;
    _recoilY += -(Math.random() * intensity * 0.6); // mostly upward
    // Clamp so it doesn't drift too far
    const maxDrift = intensity * 4;
    _recoilX = Math.max(-maxDrift, Math.min(maxDrift, _recoilX));
    _recoilY = Math.max(-maxDrift * 1.5, Math.min(maxDrift * 0.3, _recoilY));
  }
  // Always decay back toward center
  _recoilX *= RECOIL_DECAY;
  _recoilY *= RECOIL_DECAY;
}
// #endregion

// #region Hit detection
function checkCenterOnPerson(mask, maskWidth, maskHeight, displayWidth, displayHeight) {
  const cx  = displayWidth  / 2;
  const cy  = displayHeight / 2;
  const mx  = Math.floor((cx / displayWidth)  * maskWidth);
  const my  = Math.floor((cy / displayHeight) * maskHeight);
  const idx = my * maskWidth + mx;
  return mask[idx] === PERSON_CATEGORY;
}
// #endregion

// #region Crosshair rendering
function drawCrosshair(ctx, w, h, onPerson) {
  const size      = getConfig('crosshair_size',       12);
  const gap       = getConfig('crosshair_gap',        4);
  const thickness = getConfig('crosshair_thickness',  2);
  const colorIdle = getConfig('crosshair_color_idle', '#00FFCC');
  const colorHit  = getConfig('crosshair_color_hit',  '#FF2D55');

  const cx    = Math.floor(w / 2) + _recoilX;
  const cy    = Math.floor(h / 2) + _recoilY;
  const color = onPerson ? colorHit : colorIdle;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = thickness;
  ctx.lineCap     = 'square';

  drawLine(ctx, cx, cy - gap - size, cx, cy - gap);       // Top
  drawLine(ctx, cx, cy + gap,        cx, cy + gap + size); // Bottom
  drawLine(ctx, cx - gap - size, cy, cx - gap, cy);        // Left
  drawLine(ctx, cx + gap,        cy, cx + gap + size, cy); // Right

  ctx.restore();
}

function drawLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
// #endregion
