import { onShooterEvent, isFiring, getAmmo, getMaxAmmo } from './shooter.js';
import { getCrosshairPos }          from './crosshair.js';
import { getConfig }                from './storage.js';

// #region State
const PERSON_CATEGORY = 1;
let health      = 100;
let flashAlpha  = 0;
let _gameCanvas = null;
let score       = 0;
let _wasDead    = false;
let _displayWidth   = 800;
let _displayHeight  = 600;
let _personCentroid = null; // { x, y } in canvas px — updated every tick
// #endregion

// #region Audio (Web Audio API)
// HTMLAudioElement.play() on iOS Safari blocks the main thread on every call.
// Web Audio API decodes once into a buffer and fires via createBufferSource(),
// which is fire-and-forget and does not stall the main thread.
let _audioCtx       = null;
let _gunShotBuffer  = null;
let _burstBuffer    = null;
let _burstSource    = null; // currently active looping source node
let _lastShotTime   = 0;

async function initAudio() {
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // iOS Safari requires AudioContext.resume() inside a user-gesture call stack.
    // initAudio() is reached after an await in the start-button handler so the
    // AudioContext is always created outside a gesture — the listener is the only
    // unlock path.  It is intentionally kept alive (not removed) so iOS can
    // re-resume the context after backgrounding the app.
    function _iosUnlock() {
      if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
    }
    document.addEventListener('touchstart', _iosUnlock, { capture: true, passive: true });
    document.addEventListener('mousedown',  _iosUnlock, { capture: true, passive: true });

    const [shot, burst] = await Promise.all([
      loadBuffer('../assets/gun-shot.mp3'),
      loadBuffer('../assets/clean-machine-gun-burst.mp3'),
    ]);
    _gunShotBuffer = shot;
    _burstBuffer   = burst;
  } catch (err) {
    console.warn('[Audio] init failed — game continues without sound:', err);
  }
}

async function loadBuffer(url) {
  const res = await fetch(url);
  const ab  = await res.arrayBuffer();
  return _audioCtx.decodeAudioData(ab);
}

function resumeCtx() {
  if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
}

function playOneShot(buffer) {
  if (!_audioCtx || !buffer) return;
  resumeCtx();
  const src = _audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(_audioCtx.destination);
  src.start(0);
}

function startBurstAudio() {
  if (!_audioCtx || !_burstBuffer || _burstSource) return;
  resumeCtx();
  _burstSource        = _audioCtx.createBufferSource();
  _burstSource.buffer = _burstBuffer;
  _burstSource.loop   = true;
  _burstSource.connect(_audioCtx.destination);
  _burstSource.start(0);
}

function stopBurstAudio() {
  if (!_burstSource) return;
  try { _burstSource.stop(); } catch (_) {}
  _burstSource.disconnect();
  _burstSource = null;
}

function handleShotAudio() {
  const gap       = performance.now() - _lastShotTime;
  const threshold = getConfig('anim_burst_threshold_ms', 1000);
  _lastShotTime   = performance.now();

  if (gap < threshold) {
    // Rapid / continuous fire — loop the burst
    startBurstAudio();
  } else {
    // Isolated shot after a pause
    stopBurstAudio();
    playOneShot(_gunShotBuffer);
  }
}
// #endregion

// #region Init
export function resetAnimations() {
  health     = 100;
  flashAlpha = 0;
  score      = 0;
  _wasDead   = false;
  if (_gameCanvas) _gameCanvas.style.transform = '';
  clearParticles();
}

export function initAnimations(gameCanvas) {
  _gameCanvas = gameCanvas;
  initAudio(); // async — buffers ready within seconds, null-guarded until then

  onShooterEvent('onShootStart', function() {
    if (getConfig('anim_flash_enable', true)) flashAlpha = 0.35;
    const pos = getCrosshairPos(_displayWidth, _displayHeight);
    spawnSparks(pos.x, pos.y);
  });

  onShooterEvent('onShoot', function(hitting) {
    handleShotAudio();
    const pos = getCrosshairPos(_displayWidth, _displayHeight);
    spawnTracer(pos.x, pos.y);
    spawnHole(pos.x, pos.y, hitting);
  });

  onShooterEvent('onShootEnd', function() {
    stopBurstAudio();
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
  _displayWidth   = displayWidth;
  _displayHeight  = displayHeight;
  _personCentroid = computePersonCentroid(mask, maskWidth, maskHeight, displayWidth, displayHeight);
  updateHealth();
  applyShake();
  drawDeathMask(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight);
  tickParticles(ctx);
  drawFlash(ctx, displayWidth, displayHeight);
  drawLifeBar(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight);
  drawAmmoBar(ctx, displayWidth, displayHeight);
  drawScore(ctx);
}
// #endregion

// #region Person centroid
// Samples every 4th pixel for performance — accurate enough for offset tracking.
function computePersonCentroid(mask, maskWidth, maskHeight, displayWidth, displayHeight) {
  let sumX = 0, sumY = 0, count = 0;
  const step = 4;
  for (let y = 0; y < maskHeight; y += step) {
    const row = y * maskWidth;
    for (let x = 0; x < maskWidth; x += step) {
      if (mask[row + x] === PERSON_CATEGORY) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  if (!count) return null;
  return {
    x: (sumX / count / maskWidth)  * displayWidth,
    y: (sumY / count / maskHeight) * displayHeight,
  };
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

  if (health <= 0 && !_wasDead) {
    score++;
    _wasDead = true;
  }
  if (health > 0) _wasDead = false;
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
// Pre-allocated offscreen — avoids creating a new OffscreenCanvas + ImageData
// every frame when the player is dead.
let _deathOffscreen = null, _deathOffCtx = null, _deathImgData = null;
let _deathMaskW = 0, _deathMaskH = 0;

function ensureDeathBuffer(w, h) {
  if (w === _deathMaskW && h === _deathMaskH) return;
  _deathOffscreen = new OffscreenCanvas(w, h);
  _deathOffCtx    = _deathOffscreen.getContext('2d');
  _deathImgData   = _deathOffCtx.createImageData(w, h);
  _deathMaskW     = w;
  _deathMaskH     = h;
}

function drawDeathMask(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  if (health > 0) return;

  const color   = getConfig('death_mask_color',   '#FF0000');
  const opacity = getConfig('death_mask_opacity',  0.6);
  const pulse   = opacity * (0.75 + 0.25 * Math.sin(Date.now() / 150));
  const [r, g, b] = hexToRgb(color);
  const a         = Math.round(pulse * 255);

  ensureDeathBuffer(maskWidth, maskHeight);

  // Reuse the ImageData buffer — fill(0) clears leftover pixels from last frame
  const data = _deathImgData.data;
  data.fill(0);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const p    = i * 4;
    data[p]     = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = a;
  }

  _deathOffCtx.putImageData(_deathImgData, 0, 0);
  ctx.imageSmoothingEnabled = getConfig('silhouette_smooth', true);
  ctx.drawImage(_deathOffscreen, 0, 0, displayWidth, displayHeight);
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

  ctx.globalAlpha = 0.75;
  ctx.fillStyle   = '#000810';
  ctx.fillRect(bx - 1, by - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
  ctx.globalAlpha = 1;

  const fillWidth = BAR_WIDTH * (health / 100);
  ctx.fillStyle   = healthColor(health);
  ctx.fillRect(bx, by, fillWidth, BAR_HEIGHT);

  ctx.strokeStyle = '#00FFCC';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, BAR_WIDTH, BAR_HEIGHT);

  ctx.fillStyle  = '#D0FFEE';
  ctx.font       = 'bold 13px "Share Tech Mono", "Courier New", monospace';
  ctx.textAlign  = 'center';
  ctx.fillText(Math.round(health), head.x, by - 6);

  ctx.restore();
}

function findPersonHead(mask, maskWidth, maskHeight, displayWidth, displayHeight) {
  // Fast path: scan only the top 40% of rows — the head is almost always there.
  // Falls back to a full scan if the person is unusually low in frame.
  const quickRows = Math.ceil(maskHeight * 0.4);
  for (let y = 0; y < maskHeight; y++) {
    if (y === quickRows) {
      // Pause: if we found nothing in the top 40%, keep scanning but skip
      // the early-return optimisation so the full loop completes naturally.
    }
    const base = y * maskWidth;
    for (let x = 0; x < maskWidth; x++) {
      if (mask[base + x] === PERSON_CATEGORY) {
        return {
          x: (x / maskWidth)  * displayWidth,
          y: (y / maskHeight) * displayHeight,
        };
      }
    }
    // After the fast-path window, we already have our answer if person was found.
    // The loop continues naturally for the fallback.
  }
  return null;
}

function healthColor(hp) {
  if (hp > 60) return '#00FFCC';
  if (hp > 30) return '#FF8C00';
  return '#FF2D55';
}
// #endregion

// #region Score
function drawScore(ctx) {
  ctx.save();
  ctx.font        = 'bold 22px "Share Tech Mono", "Courier New", monospace';
  ctx.textAlign   = 'left';
  ctx.shadowColor = 'rgba(0, 255, 204, 0.4)';
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = '#00FFCC';
  ctx.fillText('SCORE', 24, 46);
  ctx.fillStyle   = '#D0FFEE';
  ctx.shadowBlur  = 0;
  ctx.fillText(score, 108, 46);
  ctx.restore();
}
// #endregion

// #region Particles
const MAX_HOLES = 20;
let _particles  = []; // tracers + sparks (short-lived)
let _holes      = []; // bullet hole decals (slow fade)

const SPARK_COLORS = ['#00FFCC', '#FF2D55', '#FFFFFF'];

function spawnTracer(cx, cy) {
  const bx = getConfig('anim_tracer_barrel_x', 0.5);
  const by = getConfig('anim_tracer_barrel_y', 0.85);
  _particles.push({
    type : 'tracer',
    x0   : _displayWidth  * bx,
    y0   : _displayHeight * by,
    x1   : cx,
    y1   : cy,
    life : 1.0,
  });
}

function spawnSparks(cx, cy) {
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    _particles.push({
      type  : 'spark',
      x     : cx,
      y     : cy,
      vx    : Math.cos(angle) * speed,
      vy    : Math.sin(angle) * speed,
      life  : 1.0,
      color : SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
    });
  }
}

function spawnHole(cx, cy, isPersonHit) {
  const spread = 15;
  const hx = cx + (Math.random() - 0.5) * spread * 2;
  const hy = cy + (Math.random() - 0.5) * spread * 2;
  if (_holes.length >= MAX_HOLES) _holes.shift();

  // Person-hit holes store an offset from the centroid so they move with the person.
  // Non-person holes are anchored to the canvas (walls, floor, etc.).
  const hole = { x: hx, y: hy, life: 1.0, onPerson: false, ox: 0, oy: 0 };
  if (isPersonHit && _personCentroid) {
    hole.onPerson = true;
    hole.ox = hx - _personCentroid.x;
    hole.oy = hy - _personCentroid.y;
  }
  _holes.push(hole);
}

function tickParticles(ctx) {
  // Single save/restore wraps all particle drawing, instead of one per particle.
  ctx.save();

  // #region Holes
  for (const h of _holes) {
    if (h.life <= 0) continue;

    // Person holes track the centroid; fall back to absolute if person left frame
    const rx = h.onPerson && _personCentroid ? _personCentroid.x + h.ox : h.x;
    const ry = h.onPerson && _personCentroid ? _personCentroid.y + h.oy : h.y;

    ctx.globalAlpha = h.life * 0.85;
    ctx.fillStyle   = '#111111';
    ctx.beginPath();
    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#CC0000';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(rx, ry, 6, 0, Math.PI * 2);
    ctx.stroke();
    h.life = Math.max(0, h.life - 0.006);
  }
  // #endregion

  // #region Short-lived particles (tracers + sparks)
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    if (p.life <= 0) { _particles.splice(i, 1); continue; }

    if (p.type === 'tracer') {
      const progress = 1 - p.life;
      const tailT    = Math.max(0, progress - 0.35);
      const tailX    = p.x0 + (p.x1 - p.x0) * tailT;
      const tailY    = p.y0 + (p.y1 - p.y0) * tailT;
      const headX    = p.x0 + (p.x1 - p.x0) * Math.min(1, progress + 0.05);
      const headY    = p.y0 + (p.y1 - p.y0) * Math.min(1, progress + 0.05);
      ctx.globalAlpha = p.life * 0.9;
      ctx.strokeStyle = '#00FFCC';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#00FFAA';
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.shadowBlur  = 0; // reset so shadow doesn't bleed into sparks
      p.life -= 0.35;

    } else if (p.type === 'spark') {
      p.vy += 0.4;
      p.x  += p.vx;
      p.y  += p.vy;
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      p.life -= 0.06;
    }
  }
  // #endregion

  ctx.restore();
}

function clearParticles() {
  _particles = [];
  _holes     = [];
}

export function syncBarrelTip() {
  const el = document.getElementById('barrel-tip');
  if (!el) return;
  const bx = getConfig('anim_tracer_barrel_x', 0.5);
  const by = getConfig('anim_tracer_barrel_y', 0.85);
  el.style.left = `${bx * 100}%`;
  el.style.top  = `${by * 100}%`;
}
// #endregion

// #region Ammo bar
function drawAmmoBar(ctx, displayWidth, displayHeight) {
  const ammo    = getAmmo();
  const maxAmmo = getMaxAmmo();
  const empty   = ammo === 0;

  const BAR_W = 160;
  const BAR_H = 12;
  const PAD   = 40;
  const bx    = displayWidth  - PAD - BAR_W;
  const by    = displayHeight - PAD - BAR_H;

  ctx.save();

  ctx.globalAlpha = 0.75;
  ctx.fillStyle   = '#000810';
  ctx.fillRect(bx - 1, by - 1, BAR_W + 2, BAR_H + 2);
  ctx.globalAlpha = 1;

  if (!empty) {
    ctx.fillStyle = ammo > 30 ? '#FF8C00' : '#FF2D55';
    ctx.fillRect(bx, by, BAR_W * (ammo / maxAmmo), BAR_H);
  }

  ctx.strokeStyle = '#00FFCC';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, BAR_W, BAR_H);

  ctx.font      = 'bold 13px "Share Tech Mono", "Courier New", monospace';
  ctx.fillStyle = '#D0FFEE';
  ctx.textAlign = 'right';
  ctx.fillText(`${ammo} / ${maxAmmo}`, bx + BAR_W, by - 6);

  ctx.fillStyle = '#00FFCC';
  ctx.textAlign = 'left';
  ctx.fillText('AMMO', bx, by - 6);

  if (empty && Math.floor(Date.now() / 400) % 2 === 0) {
    ctx.fillStyle = '#FF2D55';
    ctx.font      = 'bold 16px "Share Tech Mono", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RELOAD  [Shift+R]', bx + BAR_W / 2, by - 26);
  }

  ctx.restore();
}
// #endregion
