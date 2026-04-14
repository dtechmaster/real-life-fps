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
let lastTime   = -1;
let _onMask    = null;
let _videoEl   = null;
let _reiniting = false;
// #endregion

// #region Init & reinit
export async function initSegmenter(videoEl, onMask) {
  _onMask  = onMask;
  _videoEl = videoEl;
  vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );
  await buildSegmenter();
  if (videoEl.readyState >= 2) {
    tick(videoEl);
  } else {
    videoEl.addEventListener('loadeddata', function() { tick(videoEl); });
  }
}

/** Call when model or delegate changes — rebuilds the segmenter in-place. */
export async function reinitSegmenter() {
  _reiniting = true;
  lastTime   = -1;
  await buildSegmenter();
  _reiniting = false;
}

async function buildSegmenter() {
  if (segmenter) { segmenter.close(); segmenter = null; }
  const modelKey     = getConfig('mp_model', 'selfie_landscape');
  const model        = MODELS[modelKey] ?? MODELS.deeplab;
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
  if (!_reiniting) {
    const now = performance.now();
    if (videoEl.currentTime !== lastTime) {
      lastTime = videoEl.currentTime;
      const modelKey = getConfig('mp_model', 'deeplab');
      segmenter.segmentForVideo(videoEl, now, function(result) {
        const [mask, w, h] = normalizeMask(result, modelKey);
        if (_onMask) _onMask(mask, w, h);
      });
    }
  }
  requestAnimationFrame(function() { tick(videoEl); });
}

/**
 * Converts any model output into a flat binary Uint8Array (1 = person, 0 = background).
 * Downstream modules only ever check === 1.
 */
function normalizeMask(result, modelKey) {
  const model = MODELS[modelKey] ?? MODELS.deeplab;

  if (model.maskType === 'category') {
    // Person index is fixed per model — never read from config to avoid inversion bugs
    const personIdx = model.defaultPersonIndex;
    const raw  = result.categoryMask.getAsUint8Array();
    const out  = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] === personIdx ? 1 : 0;
    return [out, result.categoryMask.width, result.categoryMask.height];
  }

  // confidence mask
  const threshold   = getConfig('mp_confidence_threshold', 0.5);
  const maskSlot    = result.confidenceMasks[model.defaultPersonIndex] ?? result.confidenceMasks[0];
  const raw         = maskSlot.getAsFloat32Array();
  const out         = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] >= threshold ? 1 : 0;
  return [out, maskSlot.width, maskSlot.height];
}
// #endregion
