import { onShooterEvent, isFiring, getAmmo, getMaxAmmo } from './shooter.js';
import { getConfig }                from './storage.js';

// #region State
const PERSON_CATEGORY = 1; // segmenter normalizes all models to binary mask
let health      = 100;
let flashAlpha  = 0;
let _gameCanvas = null;
// #endregion

// #region Audio
const _gunShot = new Audio('../assets/gun-shot.mp3');
const _burst   = new Audio('../assets/clean-machine-gun-burst.mp3');
_gunShot.preload = 'auto';
_burst.preload   = 'auto';
_burst.loop      = true;

let _lastShotTime = 0; // performance.now() of the last onShoot

function handleShotAudio() {
  const gap       = performance.now() - _lastShotTime;
  const threshold = getConfig('anim_burst_threshold_ms', 1000);
  _lastShotTime   = performance.now();

  if (gap < threshold) {
    // Rapid / continuous fire — loop the burst sound
    _gunShot.pause();
    if (_burst.paused) {
      _burst.currentTime = 0;
      _burst.play().catch(function() {});
    }
  } else {
    // Single shot after a pause — force-replay the gunshot
    _burst.pause();
    _gunShot.currentTime = 0;
    _gunShot.play().catch(function() {});
  }
}

function stopBurst() {
  _burst.pause();
  _burst.currentTime = 0;
}
// #endregion

// #region Init
export function initAnimations(gameCanvas) {
  _gameCanvas = gameCanvas;

  onShooterEvent('onShootStart', function() {
    if (getConfig('anim_flash_enable', true)) flashAlpha = 0.35;
  });

  onShooterEvent('onShoot', handleShotAudio);

  onShooterEvent('onShootEnd', function() {
    stopBurst();
    _gameCanvas.style.transform = '';
  });
}
// #endregion

// #region Tick (called every frame from index.js onMask)
/**
 * @param {Uint8Array} mask
 * @param {number}     maskWidth
 * @param {number}     maskHeight
 * @param {CanvasRenderingContext2D} ctx - #game-canvas context
 * @param {number}     displayWidth
 * @param {number}     displayHeight
 */
export function tickAnimations(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  updateHealth();
  applyShake();
  drawDeathMask(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight);
  drawFlash(ctx, displayWidth, displayHeight);
  drawLifeBar(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight);
  drawAmmoBar(ctx, displayWidth, displayHeight);
}
// #endregion

// #region Health
function updateHealth() {
  if (isFiring()) {
    const dmg = getConfig('anim_damage_per_frame', 1.5);
    health = Math.max(0, health - dmg);
  } else {
    const regen = getConfig('anim_regen_per_frame', 0.3);
    health = Math.min(100, health + regen);
  }
}
// #endregion

// #region Shake
function applyShake() {
  if (!getConfig('anim_shake_enable', true) || !isFiring()) return;
  const intensity = getConfig('anim_shake_intensity', 4);
  const dx = (Math.random() - 0.5) * intensity * 2;
  const dy = (Math.random() - 0.5) * intensity * 2;
  _gameCanvas.style.transform = `translate(${dx}px, ${dy}px)`;
}
// #endregion

// #region Flash
function drawFlash(ctx, w, h) {
  if (!getConfig('anim_flash_enable', true)) return;
  if (flashAlpha <= 0) return;
  const color = getConfig('anim_flash_color', '#FF3300');
  ctx.save();
  ctx.globalAlpha = flashAlpha;
  ctx.fillStyle   = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  flashAlpha = Math.max(0, flashAlpha - 0.05);
}
// #endregion

// #region Death mask
function drawDeathMask(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  if (health > 0) return;

  const color   = getConfig('death_mask_color',   '#FF0000');
  const opacity = getConfig('death_mask_opacity',  0.6);

  // Pulse opacity using a sine wave for a dramatic effect
  const pulse = opacity * (0.75 + 0.25 * Math.sin(Date.now() / 150));

  const [r, g, b] = hexToRgb(color);
  const a         = Math.round(pulse * 255);

  const offscreen = new OffscreenCanvas(maskWidth, maskHeight);
  const offCtx    = offscreen.getContext('2d');
  const imgData   = offCtx.createImageData(maskWidth, maskHeight);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    imgData.data[i * 4]     = r;
    imgData.data[i * 4 + 1] = g;
    imgData.data[i * 4 + 2] = b;
    imgData.data[i * 4 + 3] = a;
  }

  offCtx.putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = getConfig('silhouette_smooth', true);
  ctx.drawImage(offscreen, 0, 0, displayWidth, displayHeight);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// #endregion

// #region Life bar
function drawLifeBar(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  const head = findPersonHead(mask, maskWidth, maskHeight, displayWidth, displayHeight);
  if (!head) return;

  const BAR_WIDTH  = 160;
  const BAR_HEIGHT = 12;
  const OFFSET     = 28;
  const bx = head.x - BAR_WIDTH / 2;
  const by = head.y - OFFSET - BAR_HEIGHT;

  ctx.save();

  // Background
  ctx.globalAlpha = 0.7;
  ctx.fillStyle   = '#111111';
  ctx.fillRect(bx - 1, by - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
  ctx.globalAlpha = 1;

  // Fill
  const fillWidth = BAR_WIDTH * (health / 100);
  ctx.fillStyle   = healthColor(health);
  ctx.fillRect(bx, by, fillWidth, BAR_HEIGHT);

  // Border
  ctx.strokeStyle = '#5F624F';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, BAR_WIDTH, BAR_HEIGHT);

  // Health text
  ctx.fillStyle  = '#E7DFAF';
  ctx.font       = 'bold 14px "Courier New", monospace';
  ctx.textAlign  = 'center';
  ctx.fillText(Math.round(health), head.x, by - 6);

  ctx.restore();
}

function findPersonHead(mask, maskWidth, maskHeight, displayWidth, displayHeight) {
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      if (mask[y * maskWidth + x] === PERSON_CATEGORY) {
        return {
          x: (x / maskWidth)  * displayWidth,
          y: (y / maskHeight) * displayHeight,
        };
      }
    }
  }
  return null;
}

function healthColor(hp) {
  if (hp > 60) return '#00FF41';
  if (hp > 30) return '#D08A2E';
  return '#CC0000';
}
// #endregion

// #region Ammo bar
function drawAmmoBar(ctx, displayWidth, displayHeight) {
  const ammo    = getAmmo();
  const maxAmmo = getMaxAmmo();
  const empty   = ammo === 0;

  const BAR_W   = 160;
  const BAR_H   = 12;
  const PAD     = 40;
  const bx      = displayWidth  - PAD - BAR_W;
  const by      = displayHeight - PAD - BAR_H;

  ctx.save();

  // Background
  ctx.globalAlpha = 0.7;
  ctx.fillStyle   = '#111111';
  ctx.fillRect(bx - 1, by - 1, BAR_W + 2, BAR_H + 2);
  ctx.globalAlpha = 1;

  // Fill
  if (!empty) {
    ctx.fillStyle = ammo > 30 ? '#D08A2E' : '#CC0000';
    ctx.fillRect(bx, by, BAR_W * (ammo / maxAmmo), BAR_H);
  }

  // Border
  ctx.strokeStyle = '#5F624F';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, BAR_W, BAR_H);

  // Counter  e.g. "80 / 100"
  ctx.font      = 'bold 14px "Courier New", monospace';
  ctx.fillStyle = '#E7DFAF';
  ctx.textAlign = 'right';
  ctx.fillText(`${ammo} / ${maxAmmo}`, bx + BAR_W, by - 6);

  // Label
  ctx.fillStyle = '#D08A2E';
  ctx.textAlign = 'left';
  ctx.fillText('AMMO', bx, by - 6);

  // Reload prompt — blinks when empty
  if (empty && Math.floor(Date.now() / 400) % 2 === 0) {
    ctx.fillStyle = '#CC0000';
    ctx.font      = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RELOAD  [Shift+R]', bx + BAR_W / 2, by - 26);
  }

  ctx.restore();
}
// #endregion
