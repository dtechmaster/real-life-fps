import { initSegmenter, reinitSegmenter } from './modules/segmenter.js';
import { drawSilhouette }             from './modules/silhouette.js';
import { initCrosshair, updateCrosshair } from './modules/crosshair.js';
import { initShooter, tickShooter, isFiring } from './modules/shooter.js';
import { initAnimations, tickAnimations } from './modules/animations.js';
import { initConfigPanel }            from './modules/config-panel.js';

// #region Canvas setup
const video        = document.getElementById('webcam');
const webcamCanvas = document.getElementById('webcam-canvas');
const gameCanvas   = document.getElementById('game-canvas');
const hudCanvas    = document.getElementById('hud-canvas');
const webcamCtx    = webcamCanvas.getContext('2d');
const gameCtx      = gameCanvas.getContext('2d');
const hudCtx       = hudCanvas.getContext('2d');

function resizeCanvases() {
  webcamCanvas.width  = window.innerWidth;
  webcamCanvas.height = window.innerHeight;
  gameCanvas.width    = window.innerWidth;
  gameCanvas.height   = window.innerHeight;
  hudCanvas.width     = window.innerWidth;
  hudCanvas.height    = window.innerHeight;
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
  // 1. Draw webcam frame
  webcamCtx.drawImage(video, 0, 0, webcamCanvas.width, webcamCanvas.height);

  // 2. Draw silhouette border
  drawSilhouette(mask, maskWidth, maskHeight, gameCtx, gameCanvas.width, gameCanvas.height);

  // 3. Update crosshair hit state + render (isFiring = previous frame, one-frame lag is imperceptible)
  updateCrosshair(mask, maskWidth, maskHeight, hudCtx, hudCanvas.width, hudCanvas.height, isFiring());

  // 4. Evaluate shoot condition (reads fresh crosshair state)
  tickShooter();

  // 5. Draw hit effects on top of silhouette
  tickAnimations(mask, maskWidth, maskHeight, gameCtx, gameCanvas.width, gameCanvas.height);
}
// #endregion

// #region Init
(async function init() {
  initConfigPanel(reinitSegmenter);
  initCrosshair();
  initShooter();
  initAnimations(gameCanvas);
  await startWebcam();
  await initSegmenter(video, onMask);
})();
// #endregion
