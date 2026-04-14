import { getConfig } from './storage.js';

// #region Silhouette rendering
const PERSON_CATEGORY = 1;

// Pre-allocated buffers — created once, resized only when mask dimensions change.
// Avoids allocating 3 OffscreenCanvas + 2 ImageData objects on every frame.
let _offscreen   = null, _offCtx   = null, _offImgData  = null;
let _dilated     = null, _dCtx     = null;
let _filled      = null, _fCtx     = null, _fillImgData = null;
let _isPerson    = null;
let _borderMask  = null;
let _prevMaskW   = 0, _prevMaskH = 0;

function ensureBuffers(w, h) {
  if (w === _prevMaskW && h === _prevMaskH) return;
  _offscreen   = new OffscreenCanvas(w, h);
  _offCtx      = _offscreen.getContext('2d');
  _offImgData  = _offCtx.createImageData(w, h);

  _dilated     = new OffscreenCanvas(w, h);
  _dCtx        = _dilated.getContext('2d');

  _filled      = new OffscreenCanvas(w, h);
  _fCtx        = _filled.getContext('2d');
  _fillImgData = _fCtx.createImageData(w, h);

  _isPerson    = new Uint8Array(w * h);
  _borderMask  = new Uint8Array(w * h);
  _prevMaskW   = w;
  _prevMaskH   = h;
}

/**
 * Draws the person silhouette border onto the given canvas context.
 * @param {Uint8Array}      mask
 * @param {number}          maskWidth
 * @param {number}          maskHeight
 * @param {CanvasRenderingContext2D} ctx - Context of #game-canvas
 * @param {number}          displayWidth
 * @param {number}          displayHeight
 */
export function drawSilhouette(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  // Early-out: skip all pixel work when silhouette is invisible
  const opacity = getConfig('silhouette_opacity', 0);
  if (opacity <= 0) return;

  const color     = getConfig('silhouette_color',     '#00FF41');
  const thickness = getConfig('silhouette_thickness', 0);
  const smooth    = getConfig('silhouette_smooth',    true);

  ensureBuffers(maskWidth, maskHeight);

  // Build binary person mask
  for (let i = 0; i < mask.length; i++) {
    _isPerson[i] = mask[i] === PERSON_CATEGORY ? 1 : 0;
  }

  // Build border mask: person pixels adjacent to at least one non-person pixel
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      const i = y * maskWidth + x;
      if (!_isPerson[i]) { _borderMask[i] = 0; continue; }
      _borderMask[i] = (
        (x > 0              && !_isPerson[i - 1])         ||
        (x < maskWidth - 1  && !_isPerson[i + 1])         ||
        (y > 0              && !_isPerson[i - maskWidth])  ||
        (y < maskHeight - 1 && !_isPerson[i + maskWidth])
      ) ? 1 : 0;
    }
  }

  // Write border pixels into the pre-allocated ImageData.
  // fill(0) clears leftover data from the previous frame before writing.
  const [r, g, b] = hexToRgb(color);
  const a         = Math.round(opacity * 255);
  const offData   = _offImgData.data;
  offData.fill(0);
  for (let i = 0; i < _borderMask.length; i++) {
    if (!_borderMask[i]) continue;
    const p   = i * 4;
    offData[p]     = r;
    offData[p + 1] = g;
    offData[p + 2] = b;
    offData[p + 3] = a;
  }
  _offCtx.putImageData(_offImgData, 0, 0);

  // Dilate border by thickness using shifted copies
  _dCtx.clearRect(0, 0, maskWidth, maskHeight);
  for (let dx = -thickness; dx <= thickness; dx++) {
    for (let dy = -thickness; dy <= thickness; dy++) {
      if (Math.sqrt(dx * dx + dy * dy) <= thickness) {
        _dCtx.drawImage(_offscreen, dx, dy);
      }
    }
  }

  // Cut interior: punch out the filled person shape from the dilated border
  const fillData = _fillImgData.data;
  fillData.fill(0);
  for (let i = 0; i < _isPerson.length; i++) {
    if (!_isPerson[i]) continue;
    fillData[i * 4 + 3] = 255;
  }
  _fCtx.putImageData(_fillImgData, 0, 0);
  _dCtx.globalCompositeOperation = 'destination-out';
  _dCtx.drawImage(_filled, 0, 0);
  _dCtx.globalCompositeOperation = 'source-over';

  // Scale to display size
  ctx.imageSmoothingEnabled = smooth;
  ctx.globalAlpha = 1;
  ctx.drawImage(_dilated, 0, 0, displayWidth, displayHeight);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// #endregion
