# Real-Life FPS — Project Overview

## Concept

A browser-based FPS game that uses the device webcam and Google MediaPipe image segmentation to detect real people on screen. The player shoots at detected persons using a CS 1.6–style crosshair overlaid on the live webcam feed. No server, no framework — pure vanilla JS modules.

---

## Tech Stack

| Layer         | Technology                                          |
|---------------|-----------------------------------------------------|
| Segmentation  | `@mediapipe/tasks-vision@0.10.2` — `ImageSegmenter` |
| Model         | DeepLab v3 float32 (category mask, GPU delegate)   |
| Rendering     | HTML5 Canvas 2D API                                 |
| Storage       | `localStorage` (all user settings)                 |
| Language      | Vanilla JS ES Modules (no bundler)                 |
| Runtime       | Browser only — served via any static HTTP server   |

---

## File Structure

```
real-life-fps/
  image-segmentation-demo/        ← reference demo, do NOT modify
  game/
    index.html                    ← single entry point
    style.css                     ← global layout + CS 1.6 theme
    modules/
      storage.js                  ← LocalStorage read/write helpers
      segmenter.js                ← MediaPipe wrapper (webcam → mask loop)
      silhouette.js               ← Step 1: border drawing from mask
      crosshair.js                ← Step 2: crosshair rendering + hit detection
      shooter.js                  ← Steps 3 & 5: shooting logic & input
      animations.js               ← Step 4: hit effects, lifebar, shake
      config-panel.js             ← cog icon + settings drawer UI
    index.js                      ← game bootstrap, wires all modules
  specs/
    00-overview.md                ← this file
    01-silhouette.md
    02-crosshair.md
    03-shooting-logic.md
    04-hit-animations.md
    05-keyboard-shortcut.md
```

---

## Canvas Layer Stack

Three stacked `<canvas>` elements, all `position: absolute; top:0; left:0; width:100%; height:100%`:

| z-index | Canvas ID       | Purpose                                    |
|---------|-----------------|--------------------------------------------|
| 0       | `#webcam-canvas`| Draws the raw webcam frame each tick       |
| 1       | `#game-canvas`  | Silhouette border + lifebars + hit effects |
| 2       | `#hud-canvas`   | Crosshair (always on top)                  |

The `<video>` element is hidden (`display: none`) — it only feeds the segmenter.

---

## MediaPipe Setup (shared by all steps)

```js
import { ImageSegmenter, FilesetResolver } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";

const segmenter = await ImageSegmenter.createFromOptions(
  await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  ),
  {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    outputCategoryMask: true,
    outputConfidenceMasks: false
  }
);
```

**DeepLab v3 category index for `person` = `15`.**

The mask is returned as `result.categoryMask.getAsUint8Array()` — a flat `Uint8Array` of length `maskWidth × maskHeight` where each value is a category index (0–20).

The mask dimensions (`maskWidth`, `maskHeight`) differ from the video dimensions. Always map coordinates:
```js
const maskX = Math.floor((screenX / videoWidth)  * maskWidth);
const maskY = Math.floor((screenY / videoHeight) * maskHeight);
const idx   = maskY * maskWidth + maskX;
const isPerson = mask[idx] === 15;
```

---

## CS 1.6 Color Theme

| Role                    | Hex       | Usage                              |
|-------------------------|-----------|------------------------------------|
| Dark panel background   | `#111111` | Config panel bg                    |
| Main khaki fill         | `#8C8A6A` | Panel fills, default borders       |
| Light khaki highlight   | `#B7B08A` | Hover, selected, active            |
| Olive grey border       | `#5F624F` | Panel frame edges                  |
| Amber accent            | `#D08A2E` | Separators, focus rings            |
| Pale yellow text        | `#E7DFAF` | Primary labels                     |
| Muted white text        | `#D8D8C8` | Secondary labels                   |
| Disabled grey           | `#77776B` | Inactive controls                  |

Font: `'Courier New', monospace` for that CS 1.6 terminal feel.

---

## LocalStorage Key Convention

All keys are prefixed `rlFPS_`:

```
rlFPS_silhouette_color
rlFPS_silhouette_thickness
rlFPS_crosshair_size
...
```

Helper (in `storage.js`):
```js
function getConfig(key, defaultValue) {
  const raw = localStorage.getItem(`rlFPS_${key}`);
  return raw !== null ? JSON.parse(raw) : defaultValue;
}
function setConfig(key, value) {
  localStorage.setItem(`rlFPS_${key}`, JSON.stringify(value));
}
```

---

## Game Loop

The main loop runs via `requestAnimationFrame`. Each tick:

1. `segmenter.js` — calls `imageSegmenter.segmentForVideo(video, now, onMask)`
2. Inside `onMask(result)`:
   a. Draw webcam frame onto `#webcam-canvas`
   b. Pass mask to `silhouette.js` → draws border on `#game-canvas`
   c. Pass mask to `crosshair.js` → checks hit state, draws crosshair on `#hud-canvas`
   d. Pass state to `shooter.js` → evaluates shoot condition
   e. `animations.js` → draws active effects on `#game-canvas`
3. Schedule next frame

---

## Implementation Order

Steps must be implemented in order — each step depends on the previous:

1. `01-silhouette.md` — foundation: mask → border rendering + config panel
2. `02-crosshair.md` — requires mask coordinate mapping from step 1
3. `03-shooting-logic.md` — requires crosshair hit state from step 2
4. `04-hit-animations.md` — requires shooting events from step 3
5. `05-keyboard-shortcut.md` — thin addition on top of step 3's shoot trigger
