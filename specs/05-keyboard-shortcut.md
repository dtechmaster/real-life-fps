# Step 5 — Shift+S Keyboard Shortcut

**Depends on:** Step 3 (`shooter.js`).

---

## Goal

`Shift+S` held down triggers the same shoot condition as holding mouse button 0. This is **already implemented** as part of Step 3's `shooter.js` — this spec exists for completeness and to document the exact behavior contract.

---

## Implementation Location

`game/modules/shooter.js` — the `initShooter()` function contains:

```js
document.addEventListener('keydown', function(e) {
  if (e.shiftKey && e.key === 'S') shiftSDown = true;
});
document.addEventListener('keyup', function(e) {
  // Release on either Shift or S key up to avoid stuck state
  if (e.key === 'S' || e.key === 'Shift') shiftSDown = false;
});
```

The shoot condition in `tickShooter()`:
```js
const firing = isCrosshairOnPerson() && (mouseDown || shiftSDown);
```

---

## Behavior Details

| Action                              | Result                    |
|-------------------------------------|---------------------------|
| Hold Shift, then press S            | `shiftSDown = true`       |
| Release S (while Shift still held)  | `shiftSDown = false`      |
| Release Shift (while S still held)  | `shiftSDown = false`      |
| Release both keys                   | `shiftSDown = false`      |
| Press Shift+S while not on person   | No shoot (condition fails)|
| Move crosshair onto person while Shift+S held | Shoot starts   |

Releasing **either** key (Shift OR S) deactivates the shortcut. This prevents a stuck-fire state when keys are released in different orders.

---

## No Config Panel Entry Needed

The shortcut is not togglable — it is always active. No localStorage key required.

---

## Acceptance Criteria

- [ ] Holding Shift+S while crosshair is on person → same effect as holding left mouse button
- [ ] Releasing either Shift or S stops the shoot trigger
- [ ] Moving off person while holding Shift+S → shoot stops (crosshair condition fails)
- [ ] Re-entering person while still holding Shift+S → shoot resumes
- [ ] `onShootStart` / `onShoot` / `onShootEnd` events fire identically to mouse input
- [ ] No browser default behavior is suppressed (no `e.preventDefault()` needed)
