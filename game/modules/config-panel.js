import { getConfig, setConfig } from './storage.js';
import { MODELS }               from './segmenter.js';

// #region Config panel bootstrap
let _cameraSelect = null;

/**
 * @param {() => Promise<void>} onSegmenterReinit - called when model/delegate changes
 */
export function initConfigPanel(onSegmenterReinit) {
  const btn   = document.getElementById('cog-btn');
  const panel = document.getElementById('config-panel');

  btn.addEventListener('click', function togglePanel() {
    panel.classList.toggle('hidden');
  });

  renderCameraSection(panel);
  renderSilhouetteSection(panel);
  renderCrosshairSection(panel);
  renderAnimationsSection(panel);
  renderDeathMaskSection(panel);
  renderMediaPipeSection(panel, onSegmenterReinit);
}

function renderCameraSection(panel) {
  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Camera';
  panel.appendChild(title);

  const row = makeRow('Device');
  _cameraSelect = document.createElement('select');
  _cameraSelect.style.cssText = 'background:#1A1A1A;color:#77776B;border:1px solid #5F624F;font-family:inherit;font-size:14px;padding:4px;flex:1;';
  _cameraSelect.disabled = true;
  const placeholder = document.createElement('option');
  placeholder.textContent = 'Waiting for permission…';
  _cameraSelect.appendChild(placeholder);
  row.appendChild(_cameraSelect);
  panel.appendChild(row);
}

/**
 * Populates the camera selector after permission is granted.
 * @param {MediaDeviceInfo[]} devices
 * @param {string|null}       currentDeviceId
 * @param {(id:string)=>void} onChange
 */
export function populateCameras(devices, currentDeviceId, onChange) {
  if (!_cameraSelect) return;
  _cameraSelect.innerHTML = '';
  _cameraSelect.disabled  = false;
  _cameraSelect.style.color = '#E7DFAF';
  devices.forEach(function(device, i) {
    const opt = document.createElement('option');
    opt.value       = device.deviceId;
    opt.textContent = device.label || `Camera ${i + 1}`;
    _cameraSelect.appendChild(opt);
  });
  if (currentDeviceId) _cameraSelect.value = currentDeviceId;
  _cameraSelect.addEventListener('change', function() {
    onChange(_cameraSelect.value);
  });
}

function renderSilhouetteSection(panel) {
  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Silhouette';
  panel.appendChild(title);

  addColorRow(panel, 'Color',     'silhouette_color',     '#00FF41');
  addRangeRow(panel, 'Thickness', 'silhouette_thickness', 0,   0,   20,  1);
  addRangeRow(panel, 'Opacity',   'silhouette_opacity',   0,   0,   1.0, 0.05);
  addCheckRow(panel, 'Smooth',    'silhouette_smooth',    true);
}

function renderCrosshairSection(panel) {
  addSeparator(panel);

  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Crosshair';
  panel.appendChild(title);

  addRangeRow(panel, 'Size',       'crosshair_size',       12, 2, 40, 1);
  addRangeRow(panel, 'Gap',        'crosshair_gap',        4,  0, 20, 1);
  addRangeRow(panel, 'Thickness',  'crosshair_thickness',  2,  1, 8,  1);
  addColorRow(panel, 'Idle Color', 'crosshair_color_idle', '#00FF41');
  addColorRow(panel, 'Hit Color',  'crosshair_color_hit',  '#FF0000');
}

function renderAnimationsSection(panel) {
  addSeparator(panel);

  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Hit Effects';
  panel.appendChild(title);

  addRangeRow(panel, 'Damage/frame',   'anim_damage_per_frame',  1.5, 0.1, 10,  0.1);
  addRangeRow(panel, 'Regen/frame',    'anim_regen_per_frame',   0.3, 0.0, 2.0, 0.05);
  addCheckRow(panel, 'Flash enabled',  'anim_flash_enable',      true);
  addColorRow(panel, 'Flash color',    'anim_flash_color',       '#FF3300');
  addCheckRow(panel, 'Shake enabled',   'anim_shake_enable',        true);
  addRangeRow(panel, 'Shake intensity', 'anim_shake_intensity',     4,    0,    15,   1);
  addRangeRow(panel, 'Burst threshold', 'anim_burst_threshold_ms',  1000, 100,  3000, 100);
}

function renderDeathMaskSection(panel) {
  addSeparator(panel);

  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'Death Mask';
  panel.appendChild(title);

  addColorRow(panel, 'Mask color',   'death_mask_color',   '#FF0000');
  addRangeRow(panel, 'Mask opacity', 'death_mask_opacity',  0.6, 0.1, 1.0, 0.05);
}

function renderMediaPipeSection(panel, onReinit) {
  addSeparator(panel);

  const title = document.createElement('div');
  title.className = 'panel-section-title';
  title.textContent = 'MediaPipe';
  panel.appendChild(title);

  // Status indicator shown while reinitializing
  const status = document.createElement('div');
  status.style.cssText = 'font-size:10px; color:#D08A2E; min-height:14px;';
  panel.appendChild(status);

  function withReinit(fn) {
    return async function(val) {
      fn(val);
      status.textContent = 'Reinitializing...';
      await onReinit();
      status.textContent = '';
    };
  }

  // Model select
  const modelOptions = {};
  for (const [key, def] of Object.entries(MODELS)) modelOptions[key] = def.label;
  addSelectRow(panel, 'Model',    'mp_model',    'selfie_landscape', modelOptions, withReinit(function() {}));
  addSelectRow(panel, 'Delegate', 'mp_delegate', 'GPU',     { GPU: 'GPU', CPU: 'CPU' }, withReinit(function() {}));

  // Confidence threshold — for selfie models only, harmless on deeplab
  addRangeRow(panel, 'Confidence cutoff', 'mp_confidence_threshold', 0.5, 0.0, 1.0, 0.05);
}
// #endregion

// #region Row builders
function addSeparator(parent) {
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px; background:#5F624F; margin:4px 0;';
  parent.appendChild(sep);
}

function addColorRow(parent, label, key, defaultVal) {
  const row   = makeRow(label);
  const input = document.createElement('input');
  input.type  = 'color';
  input.value = getConfig(key, defaultVal);
  input.addEventListener('input', function() { setConfig(key, input.value); });
  row.appendChild(input);
  parent.appendChild(row);
}

function addRangeRow(parent, label, key, defaultVal, min, max, step, dataKey) {
  const row    = makeRow(label);
  const input  = document.createElement('input');
  const vLabel = document.createElement('span');
  input.type   = 'range';
  input.min    = min;
  input.max    = max;
  input.step   = step;
  input.value  = getConfig(key, defaultVal);
  if (dataKey) input.dataset.key = dataKey;
  vLabel.className   = 'value-label';
  vLabel.textContent = input.value;
  input.addEventListener('input', function() {
    const v = parseFloat(input.value);
    setConfig(key, v);
    vLabel.textContent = v;
  });
  row.appendChild(input);
  row.appendChild(vLabel);
  parent.appendChild(row);
}

function addCheckRow(parent, label, key, defaultVal) {
  const row   = makeRow(label);
  const input = document.createElement('input');
  input.type    = 'checkbox';
  input.checked = getConfig(key, defaultVal);
  input.addEventListener('change', function() { setConfig(key, input.checked); });
  row.appendChild(input);
  parent.appendChild(row);
}

function addSelectRow(parent, label, key, defaultVal, options, onChange) {
  const row    = makeRow(label);
  const select = document.createElement('select');
  select.style.cssText = [
    'background:#1A1A1A',
    'color:#E7DFAF',
    'border:1px solid #5F624F',
    'font-family:inherit',
    'font-size:11px',
    'padding:2px 4px',
    'flex:1',
  ].join(';');
  for (const [value, text] of Object.entries(options)) {
    const opt = document.createElement('option');
    opt.value       = value;
    opt.textContent = text;
    select.appendChild(opt);
  }
  select.value = getConfig(key, defaultVal);
  select.addEventListener('change', function() {
    setConfig(key, select.value);
    if (onChange) onChange(select.value);
  });
  row.appendChild(select);
  parent.appendChild(row);
}

function makeRow(label) {
  const row = document.createElement('div');
  const lbl = document.createElement('label');
  row.className   = 'config-row';
  lbl.textContent = label;
  row.appendChild(lbl);
  return row;
}
// #endregion
