import { initSegmenter, reinitSegmenter }           from './modules/segmenter.js';
import { drawSilhouette }                            from './modules/silhouette.js';
import { initCrosshair, updateCrosshair }            from './modules/crosshair.js';
import { initShooter, tickShooter, isFiring, resetShooter } from './modules/shooter.js';
import { initAnimations, tickAnimations, resetAnimations }  from './modules/animations.js';
import { initConfigPanel, populateCameras }          from './modules/config-panel.js';

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

// #region Screen management
const startScreen   = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const startBtn      = document.getElementById('start-btn');
const startError    = document.getElementById('start-error');
const cogBtn        = document.getElementById('cog-btn');
const restartBtn    = document.getElementById('restart-btn');

function showLoading() {
  startScreen.classList.add('hidden');
  loadingScreen.classList.remove('hidden');
}

function showGame() {
  loadingScreen.classList.add('hidden');
  cogBtn.classList.remove('hidden');
  restartBtn.classList.remove('hidden');
}
// #endregion

// #region Webcam
let _currentDeviceId = null;

async function startWebcam(deviceId) {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(function(t) { t.stop(); });
  }
  const constraints = {
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  _currentDeviceId = stream.getVideoTracks()[0]?.getSettings()?.deviceId ?? null;
}

async function enumerateCameras() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter(function(d) { return d.kind === 'videoinput'; });
}
// #endregion

// #region Main mask callback
function onMask(mask, maskWidth, maskHeight) {
  if (!video.videoWidth || !video.videoHeight) return;
  webcamCtx.drawImage(video, 0, 0, webcamCanvas.width, webcamCanvas.height);
  drawSilhouette(mask, maskWidth, maskHeight, gameCtx, gameCanvas.width, gameCanvas.height);
  updateCrosshair(mask, maskWidth, maskHeight, hudCtx, hudCanvas.width, hudCanvas.height, isFiring());
  tickShooter();
  tickAnimations(mask, maskWidth, maskHeight, gameCtx, gameCanvas.width, gameCanvas.height);
}
// #endregion

// #region Restart
function restartGame() {
  resetAnimations();
  resetShooter();
  webcamCtx.clearRect(0, 0, webcamCanvas.width, webcamCanvas.height);
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
}

restartBtn.addEventListener('click', restartGame);
// #endregion

// #region Start flow
startBtn.addEventListener('click', async function() {
  startBtn.disabled = true;
  startBtn.textContent = 'Requesting camera…';
  startError.classList.add('hidden');

  try {
    await startWebcam(null);
  } catch (e) {
    startBtn.disabled = false;
    startBtn.textContent = '▶ ALLOW CAMERA & START';
    startError.textContent = 'Camera access denied. Please allow access and try again.';
    startError.classList.remove('hidden');
    return;
  }

  showLoading();

  // Enumerate cameras after permission (labels only available post-permission)
  const cameras = await enumerateCameras();

  // Wire up all modules once
  initConfigPanel(async function() {
    if (video.srcObject) await reinitSegmenter();
  });
  initCrosshair();
  initShooter();
  initAnimations(gameCanvas);

  // Populate camera selector with discovered devices
  populateCameras(cameras, _currentDeviceId, async function(deviceId) {
    await startWebcam(deviceId);
    await reinitSegmenter();
  });

  // Load MediaPipe WASM + model (the slow part)
  await initSegmenter(video, onMask);

  showGame();
});
// #endregion
