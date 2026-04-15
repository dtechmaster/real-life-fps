import { initSegmenter, reinitSegmenter }                    from './modules/segmenter.js';
import { drawSilhouette }                                     from './modules/silhouette.js';
import { initCrosshair, updateCrosshair }                     from './modules/crosshair.js';
import { initShooter, tickShooter, isFiring, resetShooter }   from './modules/shooter.js';
import { initAnimations, tickAnimations, resetAnimations }    from './modules/animations.js';
import { initConfigPanel, populateCameras }                   from './modules/config-panel.js';
import { syncBarrelTip }                                      from './modules/animations.js';
import { requestGeolocation, fetchWeather, fetchCity }         from './modules/weather.js';
import { initWeatherFx, resizeWeatherFx, getWeatherHudData }  from './modules/weather-fx.js';

// #region Canvas setup
const video          = document.getElementById('webcam');
const webcamCanvas   = document.getElementById('webcam-canvas');
const gameCanvas     = document.getElementById('game-canvas');
const hudCanvas      = document.getElementById('hud-canvas');
const weatherCanvas  = document.getElementById('weather-canvas');
const webcamCtx      = webcamCanvas.getContext('2d');
const gameCtx        = gameCanvas.getContext('2d');
const hudCtx         = hudCanvas.getContext('2d');

function resizeCanvases() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  webcamCanvas.width   = w; webcamCanvas.height  = h;
  gameCanvas.width     = w; gameCanvas.height    = h;
  hudCanvas.width      = w; hudCanvas.height     = h;
  weatherCanvas.width  = w; weatherCanvas.height = h;
  resizeWeatherFx(w, h);
}

window.addEventListener('resize', resizeCanvases);
resizeCanvases();
// #endregion

// #region Screen helpers
const startScreen    = document.getElementById('start-screen');
const loadingScreen  = document.getElementById('loading-screen');
const startBtn       = document.getElementById('start-btn');
const startError     = document.getElementById('start-error');
const loadingStatus  = document.getElementById('loading-status');
const loadingError   = document.getElementById('loading-error');
const loadingRetry   = document.getElementById('loading-retry');
const cogBtn          = document.getElementById('cog-btn');
const restartBtn      = document.getElementById('restart-btn');
const fullscreenBtn   = document.getElementById('fullscreen-btn');
const iosTip          = document.getElementById('ios-tip');
const iosTipClose     = document.getElementById('ios-tip-close');

// True when running as an installed PWA (added to home screen)
const isStandalone = window.navigator.standalone === true;
// True on iOS Safari where requestFullscreen is not supported
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

function setLoadingStatus(msg) {
  loadingStatus.textContent = msg;
}

function showLoadingError(msg) {
  loadingError.textContent = msg;
  loadingError.classList.remove('hidden');
  loadingRetry.classList.remove('hidden');
  loadingStatus.classList.add('hidden');
}

function showGame() {
  loadingScreen.classList.add('hidden');
  cogBtn.classList.remove('hidden');
  restartBtn.classList.remove('hidden');
  fullscreenBtn.classList.remove('hidden');
  document.getElementById('barrel-tip').classList.remove('hidden');
  syncBarrelTip();
}

function updateWeatherHud() {
  const hud  = document.getElementById('weather-hud');
  const data = getWeatherHudData();

  if (!data) {
    hud.innerHTML = `<div class="w-main"><span class="w-label">GPS UNAVAILABLE</span></div>`;
    hud.classList.remove('hidden');
    return;
  }

  hud.innerHTML = [
    data.city ? `<div class="w-city">${data.city.toUpperCase()}</div>` : '',
    `<div class="w-main">`,
    `<span class="w-icon">${data.icon}</span>`,
    `<span class="w-temp">${data.temp}</span>`,
    `<span class="w-label">${data.label}</span>`,
    `</div>`,
    data.hint ? `<div class="w-hint">${data.hint}</div>` : '',
  ].join('');

  hud.classList.remove('hidden');
}

fullscreenBtn.addEventListener('click', function() {
  if (isIOS) {
    // iOS Safari doesn't support requestFullscreen — show the home screen tip
    // unless already running standalone (already fullscreen)
    if (!isStandalone) iosTip.classList.toggle('hidden');
    return;
  }
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function() {});
  } else {
    document.exitFullscreen().catch(function() {});
  }
});

iosTipClose.addEventListener('click', function() {
  iosTip.classList.add('hidden');
});

document.addEventListener('fullscreenchange', function() {
  fullscreenBtn.classList.toggle('is-fullscreen', !!document.fullscreenElement);
});

// Hide the fullscreen button if already running standalone on iOS
if (isIOS && isStandalone) {
  fullscreenBtn.classList.add('hidden');
}
// #endregion

// #region Webcam
let _currentDeviceId = null;
let _modulesInited   = false;

async function startWebcam(deviceId) {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(function(t) { t.stop(); });
  }

  let stream;
  if (deviceId) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  } else {
    // Prefer back camera; fall back to any camera if unavailable
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    }
  }

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

// #region Load game

/** Rejects after `ms` milliseconds — wraps any promise with a timeout. */
function withTimeout(promise, ms, msg) {
  return new Promise(function(resolve, reject) {
    const timer = setTimeout(function() {
      reject(new Error(msg ?? `Timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      function(v) { clearTimeout(timer); resolve(v); },
      function(e) { clearTimeout(timer); reject(e); }
    );
  });
}

async function loadGame() {
  loadingError.classList.add('hidden');
  loadingRetry.classList.add('hidden');
  loadingStatus.classList.remove('hidden');

  // Animate status text so the user knows something is happening
  const statusMessages = [
    'Downloading AI runtime…',
    'Downloading AI model…',
    'Still loading — slow connection? Hang tight…',
    'Almost there…',
  ];
  let msgIdx = 0;
  setLoadingStatus(statusMessages[msgIdx]);
  const statusTimer = setInterval(function() {
    msgIdx = Math.min(msgIdx + 1, statusMessages.length - 1);
    setLoadingStatus(statusMessages[msgIdx]);
  }, 7000);

  try {
    const cameras = await enumerateCameras();

    // Wire up modules once
    if (!_modulesInited) {
      _modulesInited = true;
      initConfigPanel(async function() {
        if (video.srcObject) await reinitSegmenter();
      });
      initCrosshair();
      initShooter();
      initAnimations(gameCanvas);
    }

    populateCameras(cameras, _currentDeviceId, async function(deviceId) {
      await startWebcam(deviceId);
      await reinitSegmenter();
    });

    // 60s timeout — createFromOptions can stall silently on bad connections
    await withTimeout(
      initSegmenter(video, onMask),
      60000,
      'Model download timed out. Tap "Try Again" — it loads from cache on retry.'
    );

    clearInterval(statusTimer);
    showGame();

    // Weather is non-blocking — init the canvas loop immediately,
    // then fetch conditions in the background if geo was granted.
    initWeatherFx(weatherCanvas);
    if (_geoCoords) {
      // Fetch weather + city name in parallel; update HUD when both settle
      Promise.all([
        fetchWeather(_geoCoords.lat, _geoCoords.lon),
        fetchCity(_geoCoords.lat, _geoCoords.lon),
      ])
        .then(function() { updateWeatherHud(); })
        .catch(function(err) {
          console.warn('[Weather] fetch failed:', err);
          updateWeatherHud(); // shows "GPS UNAVAILABLE" fallback
        });
    } else {
      updateWeatherHud(); // shows "GPS UNAVAILABLE" immediately
    }
  } catch (err) {
    clearInterval(statusTimer);
    console.error('Game load error:', err);
    showLoadingError(err?.message ?? 'Failed to load. Check your connection and try again.');
  }
}
// #endregion

// #region Start flow
let _geoCoords = null; // { lat, lon } or null if denied

startBtn.addEventListener('click', async function() {
  startBtn.disabled    = true;
  startBtn.textContent = 'Requesting camera + GPS…';
  startError.classList.add('hidden');

  // Camera is required; geo is optional — run both in parallel
  const [cameraResult, geoResult] = await Promise.allSettled([
    startWebcam(null),
    requestGeolocation(),
  ]);

  if (cameraResult.status === 'rejected') {
    startBtn.disabled    = false;
    startBtn.textContent = '▶ ALLOW CAMERA + GPS';
    startError.textContent = 'Camera access denied. Please allow access and try again.';
    startError.classList.remove('hidden');
    return;
  }

  _geoCoords = geoResult.status === 'fulfilled' ? geoResult.value : null;

  startScreen.classList.add('hidden');
  loadingScreen.classList.remove('hidden');
  await loadGame();
});

loadingRetry.addEventListener('click', loadGame);
// #endregion
