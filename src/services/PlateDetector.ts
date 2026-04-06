import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import RNFS from 'react-native-fs';
import {
  Detection,
  INPUT_WIDTH,
  INPUT_HEIGHT,
  CONFIDENCE_THRESHOLD,
  MAX_DETECTIONS,
  applyNMS,
} from '../utils/imageProcessing';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

class PlateDetector {
  private session: InferenceSession | null = null;
  private isInitialized = false;
  private inputName = 'images';
  private outputNames: string[] = [];

  async init(): Promise<void> {
    try {
      const modelPath = `${RNFS.DocumentDirectoryPath}/rfdetr_alpr_int8.onnx`;

      const exists = await RNFS.exists(modelPath);
      if (!exists) {
        const assetPath = 'rfdetr_alpr_int8.onnx';
        await RNFS.copyFileAssets(assetPath, modelPath);
      }

      console.log('[PlateDetector] Loading ONNX model from:', modelPath);
      this.session = await InferenceSession.create(modelPath);

      const inputNames = this.session.handler.inputNames;
      const outputNames = this.session.handler.outputNames;
      console.log('[PlateDetector] Model input names:', inputNames);
      console.log('[PlateDetector] Model output names:', outputNames);

      if (inputNames && inputNames.length > 0) {
        this.inputName = inputNames[0];
      }

      if (outputNames && outputNames.length > 0) {
        this.outputNames = outputNames;
      }

      this.isInitialized = true;
      console.log('[PlateDetector] Model initialized successfully');
    } catch (e) {
      console.error('[PlateDetector] Error initializing detector:', e);
      throw e;
    }
  }

  async detect(normalizedPixels: Float32Array): Promise<Detection[]> {
    if (!this.isInitialized || !this.session) {
      throw new Error('Detector not initialized');
    }

    const input = {
      [this.inputName]: new Tensor('float32', normalizedPixels, [
        1,
        3,
        INPUT_HEIGHT,
        INPUT_WIDTH,
      ]),
    };

    const outputs = await this.session.run(input, this.outputNames);

    // Separate outputs by shape and name
    // "scores" named output [1,300,4] = class logits
    // Named outputs [1,300,4] other than "scores" = box coordinates (cxcywh logits)
    // Named outputs [1,300,1] = scalar confidence/logits
    let boxesTensor: any = null;
    let scoresTensor: any = null;

    for (const name of Object.keys(outputs)) {
      const out = outputs[name];
      if (name === 'scores' && out.dims[2] === 4) {
        scoresTensor = out;
      } else if (name !== 'scores' && out.dims[2] === 4 && !boxesTensor) {
        boxesTensor = out;
      }
    }

    // Fallback: if no named scores, use first [1,300,4] that isn't boxes
    if (!scoresTensor) {
      for (const name of Object.keys(outputs)) {
        const out = outputs[name];
        if (out.dims[2] === 4 && out !== boxesTensor) {
          scoresTensor = out;
          break;
        }
      }
    }

    // Fallback: if no named boxes, use the "boxes" output with [1,300,1]
    // and interpret differently
    if (!boxesTensor && outputs['boxes']) {
      boxesTensor = outputs['boxes'];
    }

    if (!boxesTensor) {
      console.log('[PlateDetector] No boxes output found');
      return [];
    }

    // Debug: print raw box values for first detection
    const rawBoxesData = boxesTensor.data as Float32Array;
    console.log(
      '[PlateDetector] boxesTensor first 8 values:',
      Array.from(rawBoxesData.slice(0, 8)),
    );
    if (scoresTensor) {
      const rawScoresData = scoresTensor.data as Float32Array;
      console.log(
        '[PlateDetector] scoresTensor first 8 values:',
        Array.from(rawScoresData.slice(0, 8)),
      );
    }

    // If scores is [1,300,4], pick the best class per detection
    // If scores is [1,300,1], use directly as confidence
    const boxesData = boxesTensor.data as Float32Array;
    const numDetections = boxesTensor.dims[1];
    const detections: Detection[] = [];

    for (let i = 0; i < numDetections; i++) {
      let confidence: number;

      if (scoresTensor && scoresTensor.dims[2] === 1) {
        // Single value per detection
        const scoresData = scoresTensor.data as Float32Array;
        confidence = sigmoid(scoresData[i]);
      } else if (scoresTensor && scoresTensor.dims[2] === 4) {
        // 4 class logits per detection - pick max after sigmoid
        const scoresData = scoresTensor.data as Float32Array;
        let maxConf = 0;
        for (let c = 0; c < 4; c++) {
          const s = sigmoid(scoresData[i * 4 + c]);
          if (s > maxConf) maxConf = s;
        }
        confidence = maxConf;
      } else {
        // Use boxes output as fallback confidence
        confidence = sigmoid(boxesData[i * 4]);
      }

      if (confidence >= CONFIDENCE_THRESHOLD) {
        // Box coordinates are in xyxy format (x1, y1, x2, y2) - not cxcywh
        // These are already in [0,1] range (after sigmoid in model or during export)
        let x1 = boxesData[i * 4];
        let y1 = boxesData[i * 4 + 1];
        let x2 = boxesData[i * 4 + 2];
        let y2 = boxesData[i * 4 + 3];

        // Ensure proper ordering (x1 < x2, y1 < y2)
        if (x1 > x2) [x1, x2] = [x2, x1];
        if (y1 > y2) [y1, y2] = [y2, y1];

        const w = x2 - x1;
        const h = y2 - y1;

        // Basic validation: must have positive width and height
        if (w > 0 && h > 0) {
          detections.push({
            x: Math.max(0, x1),
            y: Math.max(0, y1),
            width: Math.min(1, w),
            height: Math.min(1, h),
            confidence,
          });
        }
      }
    }

    console.log(
      `[PlateDetector] Found ${detections.length} detections above threshold`,
    );
    const nmsResult = applyNMS(detections);
    return nmsResult.slice(0, MAX_DETECTIONS);
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const plateDetector = new PlateDetector();
