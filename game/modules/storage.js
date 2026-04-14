// #region Config cache
// All values are cached in memory after first read.
// setConfig updates both localStorage and the cache, so the cache
// never goes stale from writes made through this module.
const _cache = {};
// #endregion

// #region Storage helpers
export function getConfig(key, defaultValue) {
  if (key in _cache) return _cache[key];
  const raw = localStorage.getItem(`rlFPS_${key}`);
  const value = raw !== null ? JSON.parse(raw) : defaultValue;
  _cache[key] = value;
  return value;
}

export function setConfig(key, value) {
  localStorage.setItem(`rlFPS_${key}`, JSON.stringify(value));
  _cache[key] = value;
}
// #endregion
