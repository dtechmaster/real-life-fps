import { ImageSegmenter, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";
import { getConfig } from './storage.js';

// #region Model registry
export const MODELS = {
  deeplab: {
    label    : 'DeepLab v3 (general)',
    url      : 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
    maskType : 'category',
    defaultPersonIndex: 15
  },
  selfie: {
    label    : 'Selfie Segmenter',
    url      : 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    maskType : 'confidence',
    defaultPersonIndex: 0
  },
  selfie_landscape: {
    label    : 'Selfie Landscape',
    url      : 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
    maskType : 'confidence',
    defaultPersonIndex: 0
  }
};
// #endregion

// #region Segmenter state
let segmenter  = null;
let vision     = null;
let lastTime   = -Infinity;
let _onMask    = null;
let _videoEl   = null;
let _reiniting = false;
let _loopStarted = false;

// Minimum ms between segmentation calls — keeps iOS from flooding the GPU
const MIN_INTERVAL_MS = 33; // ~30fps
// #endregion

// #region Init & reinit
export async function initSegmenter(videoEl, onMask) {
  _onMask  = onMask;
  _videoEl = videoEl;
  vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );
  await buildSegmenter();

  if (!_loopStarted) {
    _loopStarted = true;
    tick(videoEl);
  }
}

/** Rebuilds the segmenter in-place (model/delegate change). */
export async function reinitSegmenter() {
  if (!vision) return; // not yet initialized
  _reiniting = true;
  lastTime   = -Infinity;
  await buildSegmenter();
  _reiniting = false;
}

async function buildSegmenter() {
  if (segmenter) { segmenter.close(); segmenter = null; }
  const modelKey     = getConfig('mp_model',    'selfie_landscape');
  const model        = MODELS[modelKey] ?? MODELS.selfie_landscape;
  const delegate     = getConfig('mp_delegate', 'GPU');
  const isConfidence = model.maskType === 'confidence';
  segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: model.url, delegate },
    runningMode: 'VIDEO',
    outputCategoryMask:    !isConfidence,
    outputConfidenceMasks:  isConfidence
  });
}
// #endregion

// #region Game loop
function tick(videoEl) {
  requestAnimationFrame(function() { tick(videoEl); });

  if (_reiniting || !segmenter) return;

  // Use time-based throttle instead of currentTime check — more reliable on iOS
  const now = performance.now();
  if (now - lastTime < MIN_INTERVAL_MS) return;

  // Video must have data and real dimensions before segmenting
  if (videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return;

  lastTime = now;

  try {
    const modelKey = getConfig('mp_model', 'selfie_landscape');
    segmenter.segmentForVideo(videoEl, now, function(result) {
      try {
        const [mask, w, h] = normalizeMask(result, modelKey);
        if (_onMask) _onMask(mask, w, h);
      } catch(e) { /* ignore result errors during model switch */ }
    });
  } catch(e) { /* ignore call errors during model switch */ }
}

function normalizeMask(result, modelKey) {
  const model = MODELS[modelKey] ?? MODELS.selfie_landscape;

  if (model.maskType === 'category') {
    const personIdx = model.defaultPersonIndex;
    const raw  = result.categoryMask.getAsUint8Array();
    const out  = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] === personIdx ? 1 : 0;
    return [out, result.categoryMask.width, result.categoryMask.height];
  }

  const threshold = getConfig('mp_confidence_threshold', 0.8);
  const maskSlot  = result.confidenceMasks[model.defaultPersonIndex] ?? result.confidenceMasks[0];
  const raw       = maskSlot.getAsFloat32Array();
  const out       = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] >= threshold ? 1 : 0;
  return [out, maskSlot.width, maskSlot.height];
}
// #endregion
