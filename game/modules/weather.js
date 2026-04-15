// #region WMO weather code → condition
// https://open-meteo.com/en/docs — "WMO Weather interpretation codes"
const CODE_RANGES = [
  [0,  1,  'clear'],
  [2,  3,  'cloudy'],
  [45, 48, 'fog'],
  [51, 67, 'rain'],
  [71, 77, 'snow'],
  [80, 82, 'rain'],
  [85, 86, 'snow'],
  [95, 99, 'storm'],
];

function decodeCondition(code) {
  for (const [min, max, cond] of CODE_RANGES) {
    if (code >= min && code <= max) return cond;
  }
  return 'clear';
}
// #endregion

// #region Geolocation
/**
 * Prompts the user for GPS permission.
 * Resolves with { lat, lon } or rejects on denial / timeout.
 */
export function requestGeolocation() {
  return new Promise(function(resolve, reject) {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      function(err) { reject(err); },
      { timeout: 12000, maximumAge: 60000 }
    );
  });
}
// #endregion

// #region Weather fetch
let _state = null;

/**
 * Fetches current weather from Open-Meteo (free, no API key).
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<WeatherState>}
 */
export async function fetchWeather(lat, lon) {
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`,
    '&current=temperature_2m,precipitation,weather_code',
    '&timezone=auto',
  ].join('');

  const res  = await fetch(url);
  const data = await res.json();
  const c    = data.current;

  const temp      = c.temperature_2m;
  const precip    = c.precipitation;
  const condition = decodeCondition(c.weather_code);

  _state = {
    temp,
    precip,
    condition,
    isFreezing : temp <= 0,
    isCold     : temp > 0 && temp <= 6,
    isRaining  : condition === 'rain' || condition === 'storm',
    isSnowing  : condition === 'snow',
    isStorm    : condition === 'storm',
    isHot      : temp >= 36,
  };

  return _state;
}

/** Returns cached weather state, or null if not yet fetched. */
export function getWeather() { return _simState ?? _state; }
// #endregion

// #region Weather simulation (session-only — never persisted)
let _simState = null;

const SIM_PRESETS = {
  clear    : { temp: 22, precip: 0,  condition: 'clear',  isFreezing: false, isCold: false, isRaining: false, isSnowing: false, isStorm: false, isHot: false },
  cloudy   : { temp: 16, precip: 0,  condition: 'cloudy', isFreezing: false, isCold: false, isRaining: false, isSnowing: false, isStorm: false, isHot: false },
  fog      : { temp: 12, precip: 0,  condition: 'fog',    isFreezing: false, isCold: false, isRaining: false, isSnowing: false, isStorm: false, isHot: false },
  rain     : { temp: 14, precip: 4,  condition: 'rain',   isFreezing: false, isCold: false, isRaining: true,  isSnowing: false, isStorm: false, isHot: false },
  storm    : { temp: 11, precip: 25, condition: 'storm',  isFreezing: false, isCold: false, isRaining: true,  isSnowing: false, isStorm: true,  isHot: false },
  snow     : { temp: -2, precip: 8,  condition: 'snow',   isFreezing: true,  isCold: false, isRaining: false, isSnowing: true,  isStorm: false, isHot: false },
  cold     : { temp: 4,  precip: 0,  condition: 'cloudy', isFreezing: false, isCold: true,  isRaining: false, isSnowing: false, isStorm: false, isHot: false },
  freezing : { temp: -6, precip: 0,  condition: 'clear',  isFreezing: true,  isCold: false, isRaining: false, isSnowing: false, isStorm: false, isHot: false },
  hot      : { temp: 40, precip: 0,  condition: 'clear',  isFreezing: false, isCold: false, isRaining: false, isSnowing: false, isStorm: false, isHot: true  },
};

/**
 * Overrides the active weather with a simulation preset.
 * Pass null to revert to real GPS weather.
 * Not persisted — discarded when the tab closes.
 */
export function setWeatherSim(condition) {
  _simState = condition ? (SIM_PRESETS[condition] ?? null) : null;
}
// #endregion

// #region Reverse geocoding
let _cityName = null;

/**
 * Resolves the nearest city name for the given coords via Nominatim.
 * Sets _cityName on success; silently ignores errors.
 */
export async function fetchCity(lat, lon) {
  try {
    const url  = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&format=json`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    _cityName  = data.address?.city
              ?? data.address?.town
              ?? data.address?.village
              ?? data.address?.county
              ?? null;
  } catch (_) {}
  return _cityName;
}

export function getCity() { return _cityName; }
// #endregion
