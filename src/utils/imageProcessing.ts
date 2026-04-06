export interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export const INPUT_WIDTH = 576;
export const INPUT_HEIGHT = 576;
export const CONFIDENCE_THRESHOLD = 0.7; // Much higher to reduce false positives
export const NMS_THRESHOLD = 0.3; // Lower to merge more overlapping boxes
export const MAX_DETECTIONS = 10; // Limit max detections per image

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

export function preprocessNormalized(
  pixels: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const floatData = new Float32Array(3 * INPUT_HEIGHT * INPUT_WIDTH);
  const pixelsPerChannel = width * height;

  for (let y = 0; y < INPUT_HEIGHT; y++) {
    for (let x = 0; x < INPUT_WIDTH; x++) {
      const srcX = Math.floor((x / INPUT_WIDTH) * width);
      const srcY = Math.floor((y / INPUT_HEIGHT) * height);
      const srcIdx = srcY * width + srcX;

      const r = pixels[srcIdx];
      const g = pixels[pixelsPerChannel + srcIdx];
      const b = pixels[2 * pixelsPerChannel + srcIdx];

      const normR = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      const normG = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      const normB = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];

      const idx = y * INPUT_WIDTH + x;
      floatData[idx] = normR;
      floatData[INPUT_WIDTH * INPUT_HEIGHT + idx] = normG;
      floatData[2 * INPUT_WIDTH * INPUT_HEIGHT + idx] = normB;
    }
  }

  return floatData;
}

export function applyNMS(detections: Detection[]): Detection[] {
  detections.sort((a, b) => b.confidence - a.confidence);

  const kept: Detection[] = [];
  const suppressed = new Array(detections.length).fill(false);

  for (let i = 0; i < detections.length; i++) {
    if (suppressed[i]) continue;

    kept.push(detections[i]);

    for (let j = i + 1; j < detections.length; j++) {
      if (suppressed[j]) continue;

      const iou = calculateIoU(detections[i], detections[j]);
      if (iou >= NMS_THRESHOLD) {
        suppressed[j] = true;
      }
    }
  }

  return kept;
}

function calculateIoU(a: Detection, b: Detection): number {
  const x1 = a.x;
  const y1 = a.y;
  const x2 = a.x + a.width;
  const y2 = a.y + a.height;

  const ix1 = b.x;
  const iy1 = b.y;
  const ix2 = b.x + b.width;
  const iy2 = b.y + b.height;

  const interLeft = Math.max(x1, ix1);
  const interTop = Math.max(y1, iy1);
  const interRight = Math.min(x2, ix2);
  const interBottom = Math.min(y2, iy2);

  const interW = Math.max(0, interRight - interLeft);
  const interH = Math.max(0, interBottom - interTop);
  const interArea = interW * interH;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - interArea;

  if (union <= 0) return 0;
  return interArea / union;
}
