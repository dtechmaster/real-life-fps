import { getConfig } from './storage.js';

// #region Silhouette rendering
const PERSON_CATEGORY = 1; // segmenter normalizes all models to binary mask

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
  const color     = getConfig('silhouette_color',     '#00FF41');
  const thickness = getConfig('silhouette_thickness', 3);
  const opacity   = getConfig('silhouette_opacity',   1.0);
  const smooth    = getConfig('silhouette_smooth',    true);

  ctx.clearRect(0, 0, displayWidth, displayHeight);

  // Build binary person mask at mask resolution
  const isPerson = new Uint8Array(maskWidth * maskHeight);
  for (let i = 0; i < mask.length; i++) {
    isPerson[i] = mask[i] === PERSON_CATEGORY ? 1 : 0;
  }

  // Build border mask: person pixels adjacent to non-person pixels
  const borderMask = new Uint8Array(maskWidth * maskHeight);
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      const i = y * maskWidth + x;
      if (!isPerson[i]) continue;
      const hasEdge =
        (x > 0              && !isPerson[i - 1])         ||
        (x < maskWidth - 1  && !isPerson[i + 1])         ||
        (y > 0              && !isPerson[i - maskWidth])  ||
        (y < maskHeight - 1 && !isPerson[i + maskWidth]);
      if (hasEdge) borderMask[i] = 1;
    }
  }

  // Offscreen canvas at mask resolution — draw 1px border pixels
  const offscreen = new OffscreenCanvas(maskWidth, maskHeight);
  const offCtx    = offscreen.getContext('2d');
  const imgData   = offCtx.createImageData(maskWidth, maskHeight);
  const [r, g, b] = hexToRgb(color);
  const a         = Math.round(opacity * 255);

  for (let i = 0; i < borderMask.length; i++) {
    if (!borderMask[i]) continue;
    imgData.data[i * 4]     = r;
    imgData.data[i * 4 + 1] = g;
    imgData.data[i * 4 + 2] = b;
    imgData.data[i * 4 + 3] = a;
  }
  offCtx.putImageData(imgData, 0, 0);

  // Dilate border by thickness using shifted copies
  const dilated = new OffscreenCanvas(maskWidth, maskHeight);
  const dCtx    = dilated.getContext('2d');
  for (let dx = -thickness; dx <= thickness; dx++) {
    for (let dy = -thickness; dy <= thickness; dy++) {
      if (Math.sqrt(dx * dx + dy * dy) <= thickness) {
        dCtx.drawImage(offscreen, dx, dy);
      }
    }
  }

  // Cut interior: erase the filled person shape from the dilated border
  const filled  = new OffscreenCanvas(maskWidth, maskHeight);
  const fCtx    = filled.getContext('2d');
  const fillData = fCtx.createImageData(maskWidth, maskHeight);
  for (let i = 0; i < isPerson.length; i++) {
    if (!isPerson[i]) continue;
    fillData.data[i * 4]     = 0;
    fillData.data[i * 4 + 1] = 0;
    fillData.data[i * 4 + 2] = 0;
    fillData.data[i * 4 + 3] = 255;
  }
  fCtx.putImageData(fillData, 0, 0);
  dCtx.globalCompositeOperation = 'destination-out';
  dCtx.drawImage(filled, 0, 0);
  dCtx.globalCompositeOperation = 'source-over';

  // Scale to display size
  ctx.imageSmoothingEnabled = smooth;
  ctx.globalAlpha = 1;
  ctx.drawImage(dilated, 0, 0, displayWidth, displayHeight);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// #endregion
