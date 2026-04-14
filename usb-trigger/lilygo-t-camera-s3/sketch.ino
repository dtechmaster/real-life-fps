// Real-Life FPS — USB HID Trigger
// LilyGo T-Camera S3 (ESP32-S3 native USB)
//
// Wiring:
//   GPIO15 — Button "S" (shoot)  → GND
//   GPIO16 — Button "R" (reload) → GND

// #region Includes
#include "USB.h"
#include "USBHIDKeyboard.h"
// #endregion

// #region Config
#define PIN_BTN_S      15
#define PIN_BTN_R      16
#define DEBOUNCE_MS    30
#define REPEAT_DELAY   250   // ms before repeat kicks in
#define REPEAT_RATE    30    // ms between repeated keys while held
// #endregion

// #region Types
struct Button {
  uint8_t       pin;
  char          key;
  bool          pressed;
  unsigned long pressedAt;
  unsigned long lastRepeat;
};
// #endregion

// #region Globals
USBHIDKeyboard Keyboard;
Button btnS = { PIN_BTN_S, 's', false, 0, 0 };
Button btnR = { PIN_BTN_R, 'r', false, 0, 0 };
// #endregion

// #region Setup
void setup() {
  pinMode(btnS.pin, INPUT_PULLUP);
  pinMode(btnR.pin, INPUT_PULLUP);
  USB.begin();
  Keyboard.begin();
}
// #endregion

// #region Button logic
void handleButton(Button &btn) {
  bool down = digitalRead(btn.pin) == LOW;
  unsigned long now = millis();

  if (down && !btn.pressed) {
    // Fresh press — debounce: ignore if too soon after last release
    if ((now - btn.lastRepeat) < DEBOUNCE_MS) return;
    btn.pressed   = true;
    btn.pressedAt = now;
    btn.lastRepeat = now;
    Keyboard.write(btn.key);

  } else if (!down && btn.pressed) {
    // Released
    btn.pressed = false;

  } else if (down && btn.pressed) {
    // Held — repeat after initial delay, then at repeat rate
    unsigned long heldFor = now - btn.pressedAt;
    if (heldFor >= REPEAT_DELAY && (now - btn.lastRepeat) >= REPEAT_RATE) {
      btn.lastRepeat = now;
      Keyboard.write(btn.key);
    }
  }
}
// #endregion

// #region Loop
void loop() {
  handleButton(btnS);
  handleButton(btnR);
}
// #endregion
