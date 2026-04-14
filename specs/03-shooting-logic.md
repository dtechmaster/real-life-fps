# Step 3 — Shooting Logic

**Depends on:** Steps 1 & 2. `isCrosshairOnPerson()` from `crosshair.js` must exist and be accurate.

---

## Goal

Implement the core shoot condition:

> **If** `crosshair is on person` **AND** (`mouse is held down` **OR** `Shift+S is held`) → **firing = true**

When firing, emit a continuous `onShoot` event (called every frame while condition is met) and a one-shot `onShootStart` / `onShootEnd` edge event for animations to hook into.

No visual changes in this step — only the firing state and events. Visuals are in Step 4.

---

## Files to Modify / Create

| File                      | Change                                        |
|---------------------------|-----------------------------------------------|
| `game/modules/shooter.js` | **Create** — input tracking + shoot condition |
| `game/index.js`           | **Add** `initShooter`, call `tickShooter` each frame |

---

## Shooting Condition

```
firing = isCrosshairOnPerson() && (mouseDown || shiftSDown)
```

Both input methods are equivalent — either alone is sufficient.

---

## shooter.js — Implementation

```js
import { isCrosshairOnPerson } from './crosshair.js';

// #region Input state
let mouseDown  = false;
let shiftSDown = false;
let wasFiring  = false;

// Registered callbacks
const listeners = {
  onShootStart : [], // fires once when shooting begins
  onShoot      : [], // fires every frame while shooting
  onShootEnd   : [], // fires once when shooting stops
};
// #endregion

// #region Public API
export function initShooter() {
  document.addEventListener('mousedown', function(e) {
    if (e.button === 0) mouseDown = true;
  });
  document.addEventListener('mouseup', function(e) {
    if (e.button === 0) mouseDown = false;
  });

  document.addEventListener('keydown', function(e) {
    if (e.shiftKey && e.key === 'S') shiftSDown = true;
  });
  document.addEventListener('keyup', function(e) {
    if (e.key === 'S' || e.key === 'Shift') shiftSDown = false;
  });
}

/**
 * Call once per frame (inside onMask or the game loop).
 * Evaluates shoot condition and fires appropriate events.
 */
export function tickShooter() {
  const firing = isCrosshairOnPerson() && (mouseDown || shiftSDown);

  if (firing && !wasFiring) emit('onShootStart');
  if (firing)               emit('onShoot');
  if (!firing && wasFiring) emit('onShootEnd');

  wasFiring = firing;
}

/** @param {'onShootStart'|'onShoot'|'onShootEnd'} event */
export function onShooterEvent(event, callback) {
  listeners[event]?.push(callback);
}

/** Returns true if currently in a firing frame. */
export function isFiring() {
  return wasFiring;
}
// #endregion

// #region Internal
function emit(event) {
  for (const cb of listeners[event]) cb();
}
// #endregion
```

---

## index.js — Changes

```js
// Add to imports
import { initShooter, tickShooter } from './modules/shooter.js';

// In init():
initShooter();

// In onMask(), at the END (after all rendering):
tickShooter();
```

**Order matters inside `onMask`:**
1. Draw webcam frame
2. `drawSilhouette(...)`
3. `updateCrosshair(...)` ← must run before tickShooter so `isCrosshairOnPerson()` is fresh
4. `tickShooter()` ← reads crosshair state, emits events

---

## Event Contract (for Step 4)

Step 4 (`animations.js`) subscribes to shooter events:

```js
import { onShooterEvent } from './shooter.js';

onShooterEvent('onShootStart', function() {
  // start hit flash, begin shake
});

onShooterEvent('onShoot', function() {
  // apply damage each frame, update lifebar
});

onShooterEvent('onShootEnd', function() {
  // stop shake
});
```

---

## Acceptance Criteria

- [ ] `mousedown` (left button) while crosshair is on person → `onShootStart` then continuous `onShoot`
- [ ] Releasing mouse → `onShootEnd`
- [ ] Holding Shift+S while crosshair is on person → same behavior as mousedown
- [ ] If crosshair moves off person while input is held → `onShootEnd`
- [ ] If crosshair re-enters person while input is still held → `onShootStart` again
- [ ] No visual changes in this step — only logic
- [ ] `isFiring()` returns correct boolean each frame
