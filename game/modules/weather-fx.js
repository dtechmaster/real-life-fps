import { getWeather, getCity } from './weather.js';

// #region Canvas state
let _canvas   = null;
let _ctx      = null;
let _bgCanvas = null; // webcam canvas — used for lens refraction inside drops
let _w        = 0;
let _h        = 0;
let _rafId    = null;
let _inited   = false;
// #endregion

// #region Frost state
let _frostTexture = null; // OffscreenCanvas — static frost art, generated once
let _wipeCanvas   = null; // OffscreenCanvas — tracks cleared areas (white = frost, transparent = cleared)
let _wipeCtx      = null;
let _lastW        = 0;
let _lastH        = 0;
// #endregion

// #region Rain drop state
const MAX_DROPS  = 80;
let   _drops     = [];
let   _rainFilter = false; // tracks whether the CSS filter is currently applied
// #endregion

// #region Snow state
const MAX_SNOW  = 100;
let _snowFlakes = [];
// #endregion

// #region Wipe gesture state
let _isWiping = false;
let _wipeX    = 0;
let _wipeY    = 0;
// #endregion

// #region Init / resize / stop
export function initWeatherFx(canvas, bgCanvas) {
  if (_inited) return;
  _inited = true;

  _canvas   = canvas;
  _bgCanvas = bgCanvas ?? null;
  _ctx      = canvas.getContext('2d');
  _w        = canvas.width;
  _h        = canvas.height;

  _initWipeListeners();
  _rafId = requestAnimationFrame(_tick);
}

export function resizeWeatherFx(w, h) {
  _w = w;
  _h = h;
  // Force frost texture rebuild on next tick if conditions apply
  _frostTexture = null;
  _wipeCanvas   = null;
  _wipeCtx      = null;
}

export function stopWeatherFx() {
  if (_rafId) cancelAnimationFrame(_rafId);
}
// #endregion

// #region Frost texture generation
function _ensureFrost() {
  if (_frostTexture && _lastW === _w && _lastH === _h) return;

  _lastW = _w;
  _lastH = _h;

  // Static frost texture (generated once per screen size)
  _frostTexture = new OffscreenCanvas(_w, _h);
  const ctx = _frostTexture.getContext('2d');

  // Blueish-white base
  ctx.fillStyle = 'rgba(190, 225, 255, 0.9)';
  ctx.fillRect(0, 0, _w, _h);

  // Crystal arm clusters
  const clusterCount = Math.max(12, Math.floor((_w * _h) / 28000));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < clusterCount; i++) {
    const x    = Math.random() * _w;
    const y    = Math.random() * _h;
    const arms = 4 + Math.floor(Math.random() * 4);
    for (let a = 0; a < arms; a++) {
      _drawCrystalArm(ctx, x, y, (a / arms) * Math.PI * 2, 30 + Math.random() * 70, 3);
    }
  }

  // Heavier frost at edges
  const edgeGrad = ctx.createRadialGradient(_w / 2, _h / 2, _h * 0.2, _w / 2, _h / 2, _h * 0.85);
  edgeGrad.addColorStop(0, 'rgba(190, 225, 255, 0)');
  edgeGrad.addColorStop(1, 'rgba(200, 235, 255, 0.55)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, _w, _h);

  // Wipe canvas: fully white = frost visible everywhere
  _wipeCanvas = new OffscreenCanvas(_w, _h);
  _wipeCtx    = _wipeCanvas.getContext('2d');
  _wipeCtx.fillStyle = 'white';
  _wipeCtx.fillRect(0, 0, _w, _h);
}

function _drawCrystalArm(ctx, x, y, angle, length, depth) {
  if (length < 5 || depth <= 0) return;
  ctx.lineWidth = depth * 0.6;
  const ex = x + Math.cos(angle) * length;
  const ey = y + Math.sin(angle) * length;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  for (const t of [0.33, 0.66]) {
    const bx = x + (ex - x) * t;
    const by = y + (ey - y) * t;
    _drawCrystalArm(ctx, bx, by, angle + Math.PI / 3, length * 0.42, depth - 1);
    _drawCrystalArm(ctx, bx, by, angle - Math.PI / 3, length * 0.42, depth - 1);
  }
}
// #endregion

// #region Frost drawing + wipe
function _drawFrost() {
  const weather = getWeather();
  if (!weather?.isFreezing && !weather?.isCold) return;

  _ensureFrost();

  const strength = weather.isFreezing ? 1.0 : 0.65;

  // Draw frost first (canvas is freshly cleared so destination-in is safe)
  _ctx.save();
  _ctx.globalAlpha = strength;
  _ctx.drawImage(_frostTexture, 0, 0, _w, _h);
  // Cut out wiped areas: keep frost only where wipeCanvas is opaque
  _ctx.globalCompositeOperation = 'destination-in';
  _ctx.globalAlpha = 1;
  _ctx.drawImage(_wipeCanvas, 0, 0, _w, _h);
  _ctx.restore(); // resets compositeOperation to source-over

  _regenFrost(weather.isFreezing);
}

function _regenFrost(isFreezing) {
  if (!_wipeCtx) return;
  // Slowly restore cleared areas — frost grows back
  const rate = isFreezing ? 0.0015 : 0.0006;
  _wipeCtx.globalAlpha = rate;
  _wipeCtx.fillStyle   = 'white';
  _wipeCtx.fillRect(0, 0, _w, _h);
  _wipeCtx.globalAlpha = 1;
}
// #endregion

// #region Wipe gesture
function _initWipeListeners() {
  function getPos(e) {
    const rect = _canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (_w / rect.width),
      y: (e.clientY - rect.top)  * (_h / rect.height),
    };
  }

  document.addEventListener('mousedown', function(e) {
    _isWiping = true;
    const p = getPos(e);
    _wipeX = p.x; _wipeY = p.y;
  });
  document.addEventListener('mousemove', function(e) {
    if (!_isWiping) return;
    const p = getPos(e);
    _wipeX = p.x; _wipeY = p.y;
    _applyWipe();
  });
  document.addEventListener('mouseup', function() { _isWiping = false; });

  document.addEventListener('touchstart', function(e) {
    _isWiping = true;
    const p = getPos(e.touches[0]);
    _wipeX = p.x; _wipeY = p.y;
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    if (!_isWiping) return;
    const p = getPos(e.touches[0]);
    _wipeX = p.x; _wipeY = p.y;
    _applyWipe();
  }, { passive: true });
  document.addEventListener('touchend', function() { _isWiping = false; }, { passive: true });
}

function _applyWipe() {
  if (!_wipeCtx) return;
  const weather = getWeather();
  if (!weather?.isFreezing && !weather?.isCold) return;

  const radius = Math.min(_w, _h) * 0.07; // ~7% of screen
  _wipeCtx.globalCompositeOperation = 'destination-out';
  _wipeCtx.beginPath();
  _wipeCtx.arc(_wipeX, _wipeY, radius, 0, Math.PI * 2);
  _wipeCtx.fill();
  _wipeCtx.globalCompositeOperation = 'source-over';
}
// #endregion

// #region Rain drops — static window-condensation style (inspired by Lucas Bebber)
//
// Behaviour mirrors the CodePen:
//   • Drops are STATIC — they land on the glass and stay.
//   • Each drop shows the scene behind it magnified ~10× and inverted 180°
//     (a convex water drop acts as a converging lens — exactly like real glass).
//   • Spring pop-in: scale 2.5 → 1 with a slight overshoot.
//   • A dark box-shadow ring surrounds every drop (same as the CSS .border element).
//   • In the last 25% of its life the drop slowly slides down before fading out.
//   • The weather canvas itself gets blur(0.7px) brightness(1.2) while raining
//     (same as the CodePen filter on the .raindrops layer).

// Ease-out-back — approximates cubic-bezier(0.175, 0.885, 0.320, 1.275).
// Overshoots 1 slightly then settles, giving the spring pop feel.
function _easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function _spawnDrop() {
  const size    = 5  + Math.random() * 13;          // 5–18 px (half-height radius)
  const stretch = 0.06 + Math.random() * 0.22;      // 6–28 % vertical stretch
  _drops.push({
    x      : 8 + Math.random() * (_w - 16),
    y      : 8 + Math.random() * (_h * 0.85),
    rx     : size * 0.52,                           // horizontal radius
    ry     : size * 0.52 * (1 + stretch),           // vertical radius (taller)
    born   : performance.now(),
    maxLife: 10000 + Math.random() * 14000,         // 10–24 s
    mag    : 7 + Math.random() * 4,                 // 7–11× magnification
    slideY : 0,                                     // accumulated slide px (late-life)
  });
}

function _tickDrops() {
  const weather   = getWeather();
  const intensity = weather?.isStorm ? 3 : weather?.isRaining ? 1 : 0;

  // Toggle canvas-level blur/brightness filter
  const wantFilter = intensity > 0;
  if (wantFilter !== _rainFilter) {
    _rainFilter          = wantFilter;
    _canvas.style.filter = wantFilter ? 'blur(0.7px) brightness(1.2)' : '';
  }

  if (intensity > 0 && _drops.length < MAX_DROPS && Math.random() < 0.07 * intensity) {
    _spawnDrop();
  }

  if (!_drops.length) return;
  const now = performance.now();
  for (let i = _drops.length - 1; i >= 0; i--) {
    const d  = _drops[i];
    const t  = (now - d.born) / d.maxLife; // 0 → 1

    // In the last 25% of life, the drop starts sliding down and accelerating
    if (t > 0.75) {
      const slideT = (t - 0.75) / 0.25;   // 0 → 1
      d.slideY    += 0.12 + slideT * 0.55; // gentle → faster
    }

    if (t >= 1 || d.y + d.slideY > _h + 40) _drops.splice(i, 1);
  }
}

function _drawDrops() {
  if (!_drops.length) return;
  const now = performance.now();

  for (const d of _drops) {
    const t  = (now - d.born) / d.maxLife;
    const cy = d.y + d.slideY; // current centre y (moves during slide)

    // Opacity: fade in first 4 %, solid until 80 %, fade out last 20 %
    const opacity = t < 0.04 ? t / 0.04
                  : t > 0.80 ? (1 - t) / 0.20
                  : 1;
    if (opacity < 0.02) continue;

    // Spring pop-in scale: 2.5 → 1 over 200 ms with easeOutBack overshoot
    const popT  = Math.min(1, (now - d.born) / 200);
    const popSc = popT < 1 ? 2.5 - 1.5 * _easeOutBack(popT) : 1;

    _ctx.save();

    // Apply pop-in scale around drop centre
    if (popSc !== 1) {
      _ctx.translate(d.x, cy);
      _ctx.scale(popSc, popSc);
      _ctx.translate(-d.x, -cy);
    }

    // ── Clipped interior ────────────────────────────────────────────────
    _ctx.save();
    _ctx.beginPath();
    _ctx.ellipse(d.x, cy, d.rx, d.ry, 0, 0, Math.PI * 2);
    _ctx.clip();
    _ctx.globalAlpha = opacity;

    if (_bgCanvas) {
      // Sample a small region of the camera (1/mag of the drop area) and
      // draw it magnified + rotated 180° (full lens inversion, both axes).
      const sw = (d.rx * 2) / d.mag;
      const sh = (d.ry * 2) / d.mag;

      _ctx.save();
      _ctx.translate(d.x, cy);
      _ctx.scale(-1, -1);           // 180° rotation = scale(-1,-1) around centre
      _ctx.translate(-d.x, -cy);
      _ctx.drawImage(
        _bgCanvas,
        d.x - sw / 2, cy - sh / 2, sw, sh,   // source: small centred sample
        d.x - d.rx,   cy - d.ry, d.rx * 2, d.ry * 2 // dest: full drop bounds
      );
      _ctx.restore();
    }

    // Subtle brightness wash (water catches more light)
    _ctx.globalAlpha = opacity * 0.10;
    _ctx.fillStyle   = '#ffffff';
    _ctx.fillRect(d.x - d.rx, cy - d.ry, d.rx * 2, d.ry * 2);

    _ctx.restore(); // pop clip

    // ── Dark outer ring — equivalent to CSS box-shadow on .border ───────
    const ringW = Math.max(1.2, Math.min(d.rx, d.ry) * 0.28);
    _ctx.globalAlpha = opacity * 0.88;
    _ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
    _ctx.lineWidth   = ringW;
    _ctx.beginPath();
    _ctx.ellipse(d.x, cy, d.rx, d.ry, 0, 0, Math.PI * 2);
    _ctx.stroke();

    _ctx.restore(); // pop pop-in scale / base state
  }
}
// #endregion

// #region Snow
function _spawnSnow() {
  _snowFlakes.push({
    x    : Math.random() * _w,
    y    : -6,
    size : 2 + Math.random() * 5,
    speed: 0.5 + Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 0.5,
    phase: Math.random() * Math.PI * 2,
  });
}

function _tickSnow() {
  const weather = getWeather();
  if (!weather?.isSnowing) return;
  if (_snowFlakes.length < MAX_SNOW && Math.random() < 0.18) _spawnSnow();

  for (let i = _snowFlakes.length - 1; i >= 0; i--) {
    const f  = _snowFlakes[i];
    f.y     += f.speed;
    f.x     += f.drift + Math.sin(f.phase) * 0.3;
    f.phase += 0.025;
    if (f.y > _h + 10) _snowFlakes.splice(i, 1);
  }
}

function _drawSnow() {
  if (!_snowFlakes.length) return;
  _ctx.save();
  _ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  for (const f of _snowFlakes) {
    _ctx.globalAlpha = 0.6 + 0.4 * Math.sin(f.phase);
    _ctx.beginPath();
    _ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
    _ctx.fill();
  }
  _ctx.restore();
}
// #endregion

// #region Heat shimmer
function _drawHeatShimmer() {
  const weather = getWeather();
  if (!weather?.isHot) return;

  const t     = Date.now() / 1000;
  const pulse = 0.05 + 0.025 * Math.sin(t * 1.8);

  const grad = _ctx.createLinearGradient(0, _h * 0.55, 0, _h);
  grad.addColorStop(0, 'rgba(255, 100, 0, 0)');
  grad.addColorStop(1, `rgba(255, 70, 0, ${pulse})`);
  _ctx.fillStyle = grad;
  _ctx.fillRect(0, 0, _w, _h);

  // Top edge shimmer too
  const topGrad = _ctx.createLinearGradient(0, 0, 0, _h * 0.15);
  topGrad.addColorStop(0, `rgba(255, 130, 0, ${pulse * 0.6})`);
  topGrad.addColorStop(1, 'rgba(255,130,0,0)');
  _ctx.fillStyle = topGrad;
  _ctx.fillRect(0, 0, _w, _h * 0.15);
}
// #endregion

// #region Weather info HUD (drawn on canvas, bottom-left)
export function getWeatherHudData() {
  const w = getWeather();
  if (!w) return null;

  const ICONS = {
    clear  : '☀',
    cloudy : '☁',
    fog    : '〰',
    rain   : '⬧',
    snow   : '❄',
    storm  : '⛈',
  };

  const icon  = ICONS[w.condition] ?? '◌';
  const temp  = `${w.temp > 0 ? '+' : ''}${Math.round(w.temp)}°C`;
  const label = w.isFreezing ? 'FREEZING'
              : w.isCold     ? 'COLD'
              : w.isStorm    ? 'STORM'
              : w.isSnowing  ? 'SNOW'
              : w.isRaining  ? 'RAIN'
              : w.isHot      ? 'HOT'
              : w.condition.toUpperCase();

  const hint  = (w.isFreezing || w.isCold) ? 'SWIPE TO DEFROST' : null;

  return { icon, temp, label, hint, city: getCity() };
}
// #endregion

// #region Main tick
function _tick() {
  _ctx.clearRect(0, 0, _w, _h);

  const weather = getWeather();

  // Always run _tickDrops so it can clear the rain filter when weather is gone
  _tickDrops();

  if (weather) {
    // Frost MUST be drawn first — uses destination-in composite on a clear canvas
    if (weather.isFreezing || weather.isCold) _drawFrost();

    // These draw on top with default source-over
    if (weather.isRaining || weather.isStorm) _drawDrops();
    if (weather.isSnowing)                    { _tickSnow();  _drawSnow();  }
    if (weather.isHot)                          _drawHeatShimmer();
  }

  _rafId = requestAnimationFrame(_tick);
}
// #endregion
