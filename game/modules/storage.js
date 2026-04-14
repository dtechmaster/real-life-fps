// #region Storage helpers
export function getConfig(key, defaultValue) {
  const raw = localStorage.getItem(`rlFPS_${key}`);
  return raw !== null ? JSON.parse(raw) : defaultValue;
}

export function setConfig(key, value) {
  localStorage.setItem(`rlFPS_${key}`, JSON.stringify(value));
}
// #endregion
