# Step 1 — Person Silhouette

**Depends on:** `00-overview.md` (read it first — file structure, MediaPipe setup, canvas layers, storage helpers)

---

## Goal

Each video frame, draw only the **outline border** of detected persons on `#game-canvas`. No fill. Ignore all non-person categories. Border color, thickness, opacity and smoothing are user-configurable via a cog panel. All settings persist in `localStorage`.

---

## Visual Result

- Webcam feed visible in background (`#webcam-canvas`)
- Thin colored outline traces the person's silhouette on `#game-canvas`
- Interior of person is transparent (you see the webcam feed through it)
- Non-person areas: nothing drawn
- ⚙ icon fixed at top-right corner → opens config panel

---

## Files to Create

| File                    | Role                                        |
|-------------------------|---------------------------------------------|
| `game/index.html`       | HTML scaffold, canvas stack, cog button     |
| `game/style.css`        | Layout, CS 1.6 theme, config panel styles   |
| `game/modules/storage.js`     | LocalStorage helpers                  |
| `game/modules/segmenter.js`   | MediaPipe loop, exports `onMask` hook |
| `game/modules/silhouette.js`  | Border drawing logic                  |
| `game/modules/config-panel.js`| Cog icon + panel UI                   |
| `game/index.js`               | Bootstrap — wires everything together |

---

## index.html Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Real-Life FPS</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <video id="webcam" autoplay playsinline></video>

  <!-- Canvas stack — all absolutely positioned, same size -->
  <canvas id="webcam-canvas"></canvas>  <!-- z:0 webcam frame -->
  <canvas id="game-canvas"></canvas>    <!-- z:1 silhouette + effects -->
  <canvas id="hud-canvas"></canvas>     <!-- z:2 crosshair (step 2) -->

  <!-- Config cog button -->
  <button id="cog-btn" title="Settings">⚙</button>

  <!-- Config panel (hidden by default) -->
  <div id="config-panel" class="hidden">
    <!-- populated by config-panel.js -->
  </div>

  <script type="module" src="index.js"></script>
</body>
</html>
```

---

## style.css — Layout

```css
/* Reset + fullscreen */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #000;
  overflow: hidden;
  width: 100vw;
  height: 100vh;
  font-family: 'Courier New', monospace;
}

video { display: none; }

#webcam-canvas,
#game-canvas,
#hud-canvas {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
}
#webcam-canvas { z-index: 0; }
#game-canvas   { z-index: 1; }
#hud-canvas    { z-index: 2; }

/* Cog button */
#cog-btn {
  position: fixed;
  top: 16px; right: 16px;
  z-index: 100;
  background: #1A1A1A;
  border: 1px solid #5F624F;
  color: #E7DFAF;
  font-size: 20px;
  width: 38px; height: 38px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
#cog-btn:hover { background: #8C8A6A; color: #111111; }

/* Config panel */
#config-panel {
  position: fixed;
  top: 60px; right: 16px;
  z-index: 100;
  background: #111111;
  border: 1px solid #5F624F;
  color: #E7DFAF;
  padding: 16px;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
#config-panel.hidden { display: none; }

/* Panel section titles */
.panel-section-title {
  color: #D08A2E;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  border-bottom: 1px solid #5F624F;
  padding-bottom: 4px;
}

/* Row inside panel */
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.config-row label {
  font-size: 12px;
  color: #D8D8C8;
  flex: 1;
}

/* Inputs */
.config-row input[type="range"] { flex: 1; accent-color: #D08A2E; }
.config-row input[type="color"] { width: 36px; height: 24px; border: none; padding: 0; cursor: pointer; }
.config-row input[type="checkbox"] { accent-color: #D08A2E; width: 16px; height: 16px; }
.config-row .value-label { color: #B7B08A; font-size: 11px; min-width: 28px; text-align: right; }
```

---

## storage.js

```js
// #region Storage helpers
export function getConfig(key, defaultValue) {
  const raw = localStorage.getItem(`rlFPS_${key}`);
  return raw !== null ? JSON.parse(raw) : defaultValue;
}

export function setConfig(key, value) {
  localStorage.setItem(`rlFPS_${key}`, JSON.stringify(value));
}
// #endregion
```

---

## silhouette.js — Defaults & LocalStorage Keys

| Setting          | LS Key                        | Default    | Range / Type       |
|------------------|-------------------------------|------------|--------------------|
| Border color     | `silhouette_color`            | `#00FF41`  | hex color string   |
| Border thickness | `silhouette_thickness`        | `3`        | int, 1–20          |
| Border opacity   | `silhouette_opacity`          | `1.0`      | float, 0.1–1.0     |
| Smooth edges     | `silhouette_smooth`           | `true`     | boolean            |

Default color `#00FF41` is the classic terminal green — visible on any background.

---

## silhouette.js — Implementation

```js
import { getConfig } from './storage.js';

// #region Silhouette rendering
const PERSON_CATEGORY = 15;

/**
 * Draws the person silhouette border onto the given canvas context.
 * @param {Uint8Array}      mask       - Category mask from MediaPipe
 * @param {number}          maskWidth
 * @param {number}          maskHeight
 * @param {CanvasRenderingContext2D} ctx - Context of #game-canvas
 * @param {number}          displayWidth  - canvas.width (pixels)
 * @param {number}          displayHeight - canvas.height (pixels)
 */
export function drawSilhouette(mask, maskWidth, maskHeight, ctx, displayWidth, displayHeight) {
  const color     = getConfig('silhouette_color',     '#00FF41');
  const thickness = getConfig('silhouette_thickness', 3);
  const opacity   = getConfig('silhouette_opacity',   1.0);
  const smooth    = getConfig('silhouette_smooth',    true);

  // Clear game canvas for this frame
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
        (x > 0             && !isPerson[i - 1])          ||
        (x < maskWidth - 1 && !isPerson[i + 1])          ||
        (y > 0             && !isPerson[i - maskWidth])   ||
        (y < maskHeight - 1 && !isPerson[i + maskWidth]);
      if (hasEdge) borderMask[i] = 1;
    }
  }

  // Create offscreen canvas at mask resolution, draw filled border
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

  // Dilate border by 'thickness' using multiple offset draws, then cut interior
  // Step A — draw offscreen dilated (shifted copies simulate thickness)
  const dilated = new OffscreenCanvas(maskWidth, maskHeight);
  const dCtx    = dilated.getContext('2d');
  for (let dx = -thickness; dx <= thickness; dx++) {
    for (let dy = -thickness; dy <= thickness; dy++) {
      if (Math.sqrt(dx * dx + dy * dy) <= thickness) {
        dCtx.drawImage(offscreen, dx, dy);
      }
    }
  }
  // Step B — cut interior (the original filled person shape)
  const filled = new OffscreenCanvas(maskWidth, maskHeight);
  const fCtx   = filled.getContext('2d');
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

  // Draw final dilated border scaled to display size
  if (smooth) ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 1; // opacity baked into pixel alpha above
  ctx.drawImage(dilated, 0, 0, displayWidth, displayHeight);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// #endregion
```

---

## config-panel.js — Silhouette Section

The panel is built programmatically. Call `initConfigPanel()` once on startup. The cog button toggles `hidden` class on `#config-panel`.

```js
import { getConfig, setConfig } from './storage.js';

// #region Config panel bootstrap
export function initConfigPanel() {
  const btn   = document.getElementById('cog-btn');
  const panel = document.getElementById('config-panel');

  btn.addEventListener('click', function togglePanel() {
    panel.classList.toggle('hidden');
  });

  renderSilhouetteSection(panel);
}

function renderSilhouetteSection(panel) {
  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Silhouette';
  panel.appendChild(title);

  addColorRow(panel,  'Color',     'silhouette_color',     '#00FF41');
  addRangeRow(panel,  'Thickness', 'silhouette_thickness', 3, 1, 20, 1);
  addRangeRow(panel,  'Opacity',   'silhouette_opacity',   1.0, 0.1, 1.0, 0.05);
  addCheckRow(panel,  'Smooth',    'silhouette_smooth',    true);
}
// #endregion

// #region Row builders
function addColorRow(parent, label, key, defaultVal) {
  const row   = makeRow(label);
  const input = document.createElement('input');
  input.type  = 'color';
  input.value = getConfig(key, defaultVal);
  input.addEventListener('input', function() { setConfig(key, input.value); });
  row.appendChild(input);
  parent.appendChild(row);
}

function addRangeRow(parent, label, key, defaultVal, min, max, step) {
  const row    = makeRow(label);
  const input  = document.createElement('input');
  const vLabel = document.createElement('span');
  input.type   = 'range';
  input.min    = min; input.max = max; input.step = step;
  input.value  = getConfig(key, defaultVal);
  vLabel.className = 'value-label';
  vLabel.textContent = input.value;
  input.addEventListener('input', function() {
    const v = parseFloat(input.value);
    setConfig(key, v);
    vLabel.textContent = v;
  });
  row.appendChild(input);
  row.appendChild(vLabel);
  parent.appendChild(row);
}

function addCheckRow(parent, label, key, defaultVal) {
  const row   = makeRow(label);
  const input = document.createElement('input');
  input.type  = 'checkbox';
  input.checked = getConfig(key, defaultVal);
  input.addEventListener('change', function() { setConfig(key, input.checked); });
  row.appendChild(input);
  parent.appendChild(row);
}

function makeRow(label) {
  const row  = document.createElement('div');
  const lbl  = document.createElement('label');
  row.className  = 'config-row';
  lbl.textContent = label;
  row.appendChild(lbl);
  return row;
}
// #endregion
```

---

## segmenter.js

```js
import { ImageSegmenter, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";

// #region Segmenter state
let segmenter = null;
let lastTime  = -1;
let _onMask   = null; // callback set by caller

export async function initSegmenter(videoEl, onMask) {
  _onMask = onMask;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );
  segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    outputCategoryMask: true,
    outputConfidenceMasks: false
  });
  videoEl.addEventListener('loadeddata', function startLoop() {
    tick(videoEl);
  });
}

function tick(videoEl) {
  const now = performance.now();
  if (videoEl.currentTime !== lastTime) {
    lastTime = videoEl.currentTime;
    segmenter.segmentForVideo(videoEl, now, function(result) {
      const mask      = result.categoryMask.getAsUint8Array();
      const maskWidth  = result.categoryMask.width;
      const maskHeight = result.categoryMask.height;
      if (_onMask) _onMask(mask, maskWidth, maskHeight);
    });
  }
  requestAnimationFrame(function() { tick(videoEl); });
}
// #endregion
```

---

## index.js — Bootstrap

```js
import { initSegmenter }   from './modules/segmenter.js';
import { drawSilhouette }  from './modules/silhouette.js';
import { initConfigPanel } from './modules/config-panel.js';

// #region Canvas setup
const video         = document.getElementById('webcam');
const webcamCanvas  = document.getElementById('webcam-canvas');
const gameCanvas    = document.getElementById('game-canvas');
const webcamCtx     = webcamCanvas.getContext('2d');
const gameCtx       = gameCanvas.getContext('2d');

function resizeCanvases() {
  webcamCanvas.width  = gameCanvas.width  = window.innerWidth;
  webcamCanvas.height = gameCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();
// #endregion

// #region Webcam init
async function startWebcam() {
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
}
// #endregion

// #region Main mask callback
function onMask(mask, maskWidth, maskHeight) {
  // Draw webcam frame
  webcamCtx.drawImage(video, 0, 0, webcamCanvas.width, webcamCanvas.height);

  // Draw silhouette
  drawSilhouette(mask, maskWidth, maskHeight, gameCtx, gameCanvas.width, gameCanvas.height);
}
// #endregion

// #region Init
(async function init() {
  initConfigPanel();
  await startWebcam();
  await initSegmenter(video, onMask);
})();
// #endregion
```

---

## Acceptance Criteria

- [ ] Webcam feed visible full-screen
- [ ] Colored border traces person silhouette each frame (no fill)
- [ ] Non-person areas have no border
- [ ] ⚙ button top-right opens/closes config panel
- [ ] Changing color instantly updates rendered border
- [ ] Changing thickness instantly updates border width
- [ ] Changing opacity instantly updates border transparency
- [ ] Smooth toggle works visually
- [ ] All settings survive page refresh (localStorage)
- [ ] Panel is styled in CS 1.6 theme (dark bg, khaki text, amber accents)
