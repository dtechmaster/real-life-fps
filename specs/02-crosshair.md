# Step 2 — CS 1.6 Crosshair

**Depends on:** Step 1 fully implemented (`01-silhouette.md`). The segmentation mask, canvas stack, storage helpers, and config panel framework must already exist.

---

## Goal

Draw a fixed CS 1.6–style crosshair at the exact center of `#hud-canvas`. The crosshair has **two color states**:

- **Idle color** — crosshair is NOT over a person silhouette
- **Hit color** — crosshair center is over a person pixel in the current mask

All visual properties are configurable via the existing config panel. Settings persist in `localStorage`.

---

## CS 1.6 Crosshair Anatomy

```
        |
        |  ← gap
   ─────   ─────
        ↑gap
        |
```

The crosshair is composed of **4 line segments** (top, bottom, left, right) arranged symmetrically around the screen center. There is a configurable **gap** (empty space around the exact center point). No dot in the center.

```
┌─────────────────┐
│                 │
│    ─── • ───   │  ← left-gap-center-gap-right
│        |        │
│      (gap)      │
│        |        │
└─────────────────┘
```

Line properties: length, gap, thickness, color (idle), color (on-person).

---

## Files to Modify / Create

| File                        | Change                                            |
|-----------------------------|---------------------------------------------------|
| `game/modules/crosshair.js` | **Create** — crosshair render + hit detection     |
| `game/modules/config-panel.js` | **Add** crosshair section to existing panel    |
| `game/index.js`             | **Add** `initCrosshair`, pass mask each frame     |

---

## crosshair.js — Defaults & LocalStorage Keys

| Setting          | LS Key                    | Default     | Range / Type    |
|------------------|---------------------------|-------------|-----------------|
| Line length      | `crosshair_size`          | `12`        | int, 2–40       |
| Gap (center)     | `crosshair_gap`           | `4`         | int, 0–20       |
| Line thickness   | `crosshair_thickness`     | `2`         | int, 1–8        |
| Idle color       | `crosshair_color_idle`    | `#00FF41`   | hex color       |
| Hit color        | `crosshair_color_hit`     | `#FF0000`   | hex color       |

---

## crosshair.js — Implementation

```js
import { getConfig } from './storage.js';

// #region Crosshair state
const PERSON_CATEGORY = 15;
let   _isOnPerson     = false; // updated each frame, read by shooter.js

/** Call once after canvas setup. */
export function initCrosshair() {
  // nothing stateful to set up yet
}

/**
 * Called each frame from index.js onMask().
 * Updates hit state and redraws crosshair.
 *
 * @param {Uint8Array} mask
 * @param {number}     maskWidth
 * @param {number}     maskHeight
 * @param {CanvasRenderingContext2D} ctx  - context of #hud-canvas
 * @param {number}     displayWidth
 * @param {number}     displayHeight
 */
export function updateCrosshair(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  _isOnPerson = checkCenterOnPerson(mask, maskWidth, maskHeight, displayWidth, displayHeight);
  drawCrosshair(ctx, displayWidth, displayHeight, _isOnPerson);
}

/** Returns true if the current frame has the crosshair center over a person pixel. */
export function isCrosshairOnPerson() {
  return _isOnPerson;
}
// #endregion

// #region Hit detection
function checkCenterOnPerson(mask, maskWidth, maskHeight, displayWidth, displayHeight) {
  const cx = displayWidth  / 2;
  const cy = displayHeight / 2;
  const mx = Math.floor((cx / displayWidth)  * maskWidth);
  const my = Math.floor((cy / displayHeight) * maskHeight);
  const idx = my * maskWidth + mx;
  return mask[idx] === PERSON_CATEGORY;
}
// #endregion

// #region Crosshair rendering
function drawCrosshair(ctx, w, h, onPerson) {
  const size      = getConfig('crosshair_size',       12);
  const gap       = getConfig('crosshair_gap',        4);
  const thickness = getConfig('crosshair_thickness',  2);
  const colorIdle = getConfig('crosshair_color_idle', '#00FF41');
  const colorHit  = getConfig('crosshair_color_hit',  '#FF0000');

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const color = onPerson ? colorHit : colorIdle;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = thickness;
  ctx.lineCap     = 'square';

  // Top line
  drawLine(ctx, cx, cy - gap - size, cx, cy - gap);
  // Bottom line
  drawLine(ctx, cx, cy + gap,        cx, cy + gap + size);
  // Left line
  drawLine(ctx, cx - gap - size, cy, cx - gap, cy);
  // Right line
  drawLine(ctx, cx + gap,        cy, cx + gap + size, cy);

  ctx.restore();
}

function drawLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
// #endregion
```

---

## config-panel.js — Add Crosshair Section

Inside `initConfigPanel()`, after the silhouette section is rendered, add:

```js
renderCrosshairSection(panel);
```

New function:

```js
function renderCrosshairSection(panel) {
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px; background:#5F624F; margin:4px 0;';
  panel.appendChild(sep);

  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Crosshair';
  panel.appendChild(title);

  addRangeRow(panel, 'Size',      'crosshair_size',       12, 2, 40, 1);
  addRangeRow(panel, 'Gap',       'crosshair_gap',        4,  0, 20, 1);
  addRangeRow(panel, 'Thickness', 'crosshair_thickness',  2,  1, 8,  1);
  addColorRow(panel, 'Idle Color','crosshair_color_idle', '#00FF41');
  addColorRow(panel, 'Hit Color', 'crosshair_color_hit',  '#FF0000');
}
```

---

## index.js — Changes

Import and wire crosshair:

```js
// Add to imports
import { initCrosshair, updateCrosshair } from './modules/crosshair.js';

// In resizeCanvases(), also resize hudCanvas:
const hudCanvas = document.getElementById('hud-canvas');
const hudCtx    = hudCanvas.getContext('2d');
// add to resizeCanvases():
hudCanvas.width  = window.innerWidth;
hudCanvas.height = window.innerHeight;

// In init():
initCrosshair();

// In onMask(), after drawSilhouette():
updateCrosshair(mask, maskWidth, maskHeight, hudCtx, hudCanvas.width, hudCanvas.height);
```

---

## Behavior Details

### Color switching
The color switches **immediately** on the same frame the crosshair center enters or leaves a person pixel. No interpolation or delay.

### Crosshair stays fixed
The crosshair is always at `(window.innerWidth / 2, window.innerHeight / 2)`. It does not move with the mouse. The player "aims" by moving their body or by pointing the camera.

### Canvas resize
When the browser window resizes, `#hud-canvas` dimensions must be updated and the crosshair redrawn. The `resizeCanvases()` function already handles this — just ensure `hudCanvas` is included.

### No cursor
Add to `style.css`:
```css
#hud-canvas { cursor: none; }
```

---

## Acceptance Criteria

- [ ] Crosshair renders at exact screen center every frame
- [ ] Crosshair is CS 1.6 style: 4 lines with gap, no dot
- [ ] Crosshair color changes to hit color when center overlaps person mask
- [ ] Crosshair color reverts to idle color when not over person
- [ ] Size, gap, thickness, idle color, hit color all configurable in panel
- [ ] All crosshair settings persist in localStorage
- [ ] Crosshair section in config panel is visually separated from silhouette section
- [ ] Mouse cursor is hidden when over the game canvas
