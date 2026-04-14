# Step 4 — Hit Animations, Life Bar & Vibration

**Depends on:** Steps 1–3. Shooter events (`onShootStart`, `onShoot`, `onShootEnd`) must be working. Mask must be available per-frame.

---

## Goal

Three visual feedback systems triggered when shooting at a person:

1. **Life bar** — appears above the person's head, decreases while hitting, slowly regenerates
2. **Hit flash** — brief color flash on the `#game-canvas` when a hit begins
3. **Screen shake** — `#game-canvas` shakes (CSS transform) while firing at a person

All three are drawn/controlled in `animations.js`. Settings (shake intensity, flash color, regen speed) are configurable in the config panel and saved to `localStorage`.

---

## Files to Modify / Create

| File                         | Change                                           |
|------------------------------|--------------------------------------------------|
| `game/modules/animations.js` | **Create** — all three effects                   |
| `game/modules/config-panel.js` | **Add** animations section                     |
| `game/index.js`              | **Add** `initAnimations`, `tickAnimations`, pass mask |

---

## 1 — Life Bar

### Concept
A single life bar representing the detected person's health. It appears when any person is on screen. It is placed above the **topmost person pixel** in the current mask (i.e., above the person's head).

### Health Model
- `health`: float, 0–100, starts at 100
- Each `onShoot` frame: `health -= damagePerFrame` (configurable, default `1.5`)
- Each frame NOT firing: `health += regenPerFrame` (configurable, default `0.3`), capped at 100
- Health never goes below 0
- When `health <= 0`: the bar shows red, stays at 0 (no kill mechanic in this step)

### Position Calculation
From the mask, find the topmost person pixel:

```js
function findPersonHead(mask, maskWidth, maskHeight, displayWidth, displayHeight) {
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      if (mask[y * maskWidth + x] === 15) {
        // Map mask coordinates to display coordinates
        const displayX = (x / maskWidth)  * displayWidth;
        const displayY = (y / maskHeight) * displayHeight;
        return { x: displayX, y: displayY };
      }
    }
  }
  return null; // no person visible
}
```

### Life Bar Rendering
Drawn on `#game-canvas`, above the head point:

```
bar Y position = headY - BAR_OFFSET_PX   (default: 20px above head)
bar width      = BAR_WIDTH               (default: 120px)
bar height     = BAR_HEIGHT              (default: 8px)
bar X position = headX - BAR_WIDTH / 2  (centered on head)
```

Visual layers (bottom to top):
1. Background rect — `#111111`, full width, semi-transparent
2. Fill rect — color based on health %, width = `barWidth * (health / 100)`
3. Border rect — `#5F624F` stroke, 1px

Fill color thresholds:
- `health > 60` → `#00FF41` (green)
- `health > 30` → `#D08A2E` (amber)
- `health <= 30` → `#CC0000` (red)

Health text: show `Math.round(health)` in `#E7DFAF`, 10px Courier, centered above bar.

---

## 2 — Hit Flash

A brief full-canvas color overlay when `onShootStart` fires.

### Behavior
- On `onShootStart`: set `flashAlpha = 0.35`, `flashColor = config value`
- Each frame in `tickAnimations`: if `flashAlpha > 0`, draw a full-canvas rect with `flashAlpha`, then `flashAlpha -= 0.05`
- Flash fades in ~7 frames (~115ms at 60fps)

### Config
| Setting       | LS Key              | Default     |
|---------------|---------------------|-------------|
| Flash color   | `anim_flash_color`  | `#FF3300`   |
| Flash enabled | `anim_flash_enable` | `true`      |

---

## 3 — Screen Shake

CSS `transform: translate(Xpx, Ypx)` applied to `#game-canvas` while `isFiring()` is true.

### Behavior
- While firing: each frame, pick `dx` and `dy` as random values in `[-intensity, +intensity]`
- Apply `gameCanvas.style.transform = \`translate(${dx}px, ${dy}px)\``
- On `onShootEnd`: reset `gameCanvas.style.transform = ''`

### Config
| Setting           | LS Key                | Default |
|-------------------|-----------------------|---------|
| Shake intensity   | `anim_shake_intensity`| `4`     | int, 0–15
| Shake enabled     | `anim_shake_enable`   | `true`  |

---

## animations.js — Full Implementation

```js
import { onShooterEvent, isFiring } from './shooter.js';
import { getConfig }                from './storage.js';

// #region State
const PERSON_CATEGORY = 15;
let health     = 100;
let flashAlpha = 0;

let _gameCanvas = null;
// #endregion

// #region Init
export function initAnimations(gameCanvas) {
  _gameCanvas = gameCanvas;

  onShooterEvent('onShootStart', function() {
    if (getConfig('anim_flash_enable', true)) {
      flashAlpha = 0.35;
    }
  });

  onShooterEvent('onShootEnd', function() {
    _gameCanvas.style.transform = '';
  });
}
// #endregion

// #region Tick (called every frame from index.js onMask)
/**
 * @param {Uint8Array} mask
 * @param {number}     maskWidth
 * @param {number}     maskHeight
 * @param {CanvasRenderingContext2D} ctx  - #game-canvas context
 * @param {number}     displayWidth
 * @param {number}     displayHeight
 */
export function tickAnimations(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  updateHealth();
  applyShake();
  drawFlash(ctx, displayWidth, displayHeight);
  drawLifeBar(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight);
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

// #region Life bar
function drawLifeBar(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  const head = findPersonHead(mask, maskWidth, maskHeight, displayWidth, displayHeight);
  if (!head) return;

  const BAR_WIDTH  = 120;
  const BAR_HEIGHT = 8;
  const OFFSET     = 20;
  const bx = head.x - BAR_WIDTH / 2;
  const by = head.y - OFFSET - BAR_HEIGHT;

  // Background
  ctx.save();
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
  ctx.fillStyle   = '#E7DFAF';
  ctx.font        = '10px "Courier New", monospace';
  ctx.textAlign   = 'center';
  ctx.fillText(Math.round(health), head.x, by - 4);

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
```

---

## config-panel.js — Add Animations Section

```js
function renderAnimationsSection(panel) {
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px; background:#5F624F; margin:4px 0;';
  panel.appendChild(sep);

  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Hit Effects';
  panel.appendChild(title);

  addRangeRow(panel, 'Damage/frame',  'anim_damage_per_frame',  1.5, 0.1, 10,  0.1);
  addRangeRow(panel, 'Regen/frame',   'anim_regen_per_frame',   0.3, 0.0, 2.0, 0.05);
  addCheckRow(panel, 'Flash enabled', 'anim_flash_enable',      true);
  addColorRow(panel, 'Flash color',   'anim_flash_color',       '#FF3300');
  addCheckRow(panel, 'Shake enabled', 'anim_shake_enable',      true);
  addRangeRow(panel, 'Shake intensity','anim_shake_intensity',  4, 0, 15, 1);
}
```

Call `renderAnimationsSection(panel)` inside `initConfigPanel()` after the crosshair section.

---

## index.js — Changes

```js
// Add to imports
import { initAnimations, tickAnimations } from './modules/animations.js';

// In init():
initAnimations(gameCanvas);

// In onMask(), AFTER drawSilhouette and AFTER updateCrosshair, BEFORE tickShooter:
// Order:
// 1. webcamCtx.drawImage(...)
// 2. drawSilhouette(...)
// 3. updateCrosshair(...)
// 4. tickShooter()            ← must be before tickAnimations so isFiring() is current
// 5. tickAnimations(...)      ← reads isFiring(), draws on game canvas
```

**Note on draw order:** `tickAnimations` draws on `#game-canvas` AFTER `drawSilhouette`. The silhouette is drawn first, then the flash overlay and life bar are drawn on top. This is correct — the life bar should appear above the silhouette border.

---

## Acceptance Criteria

- [ ] Life bar appears above person's head whenever a person is detected
- [ ] Life bar decreases (red → amber → green, reversed) while shooting
- [ ] Life bar slowly refills when not shooting
- [ ] Life bar cannot go below 0 or above 100
- [ ] Health number shown above life bar
- [ ] Hit flash (red overlay) appears for ~7 frames on each new shoot start
- [ ] Screen shake applies while actively hitting a person
- [ ] Shake stops immediately when shooting stops
- [ ] Damage per frame, regen, flash color, flash toggle, shake intensity, shake toggle all configurable
- [ ] All settings persist in localStorage
