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
export function getWeather() { return _state; }
// #endregion
