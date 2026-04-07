import { Platform } from 'react-native';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import RNFS from 'react-native-fs';
import { copyAssetToFile, nativeModuleAvailable } from './ImageDecoder';
import {
  Detection,
  INPUT_WIDTH,
  INPUT_HEIGHT,
  CONFIDENCE_THRESHOLD,
  NMS_THRESHOLD,
  MAX_DETECTIONS,
  applyNMS,
} from '../utils/imageProcessing';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
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

class PlateDetector {
  private session: InferenceSession | null = null;
  private isInitialized = false;
  private inputName = 'images';
  private outputNames: string[] = [];

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('[PlateDetector] Already initialized, skipping');
      return;
    }

    try {
      const assetPath = 'plate_detector.onnx';
      const modelPath = `${RNFS.DocumentDirectoryPath}/${assetPath}`;

      const pathExists = await RNFS.exists(modelPath);

      if (!pathExists) {
        console.log(
          '[PlateDetector] Model not in documents, trying native copy...',
        );

        if (nativeModuleAvailable && Platform.OS === 'android') {
          try {
            await copyAssetToFile(assetPath, modelPath);
            console.log('[PlateDetector] Copied asset via native module');
          } catch (copyError) {
            console.log('[PlateDetector] Native copy failed:', copyError);
            throw new Error('Failed to copy model from assets');
          }
        } else {
          throw new Error('Native asset copy only available on Android');
        }
      }

      console.log('[PlateDetector] Loading ONNX model from:', modelPath);

      const isAndroid = Platform.OS === 'android';

      // Try hardware acceleration first, fall back to CPU if it fails
      const hardwareProviders = isAndroid ? ['nnapi'] : ['coreml'];
      const cpuProviders = ['cpu'];

      try {
        console.log(
          '[PlateDetector] Trying hardware acceleration:',
          hardwareProviders,
        );
        this.session = await InferenceSession.create(modelPath, {
          executionProviders: hardwareProviders,
        });
        console.log('[PlateDetector] Hardware acceleration initialized');
      } catch (hardwareError) {
        console.log(
          '[PlateDetector] Hardware acceleration failed, falling back to CPU:',
          hardwareError,
        );
        this.session = await InferenceSession.create(modelPath, {
          executionProviders: cpuProviders,
        });
        console.log('[PlateDetector] CPU execution initialized');
      }

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

    if (!outputs || Object.keys(outputs).length === 0) {
      console.log('[PlateDetector] No outputs from model');
      return [];
    }

    let outputTensor: any = null;
    for (const name of Object.keys(outputs)) {
      const out = outputs[name];
      if (out.dims && out.dims.length >= 2) {
        outputTensor = out;
        console.log(
          '[PlateDetector] Using output tensor:',
          name,
          'shape:',
          out.dims,
        );
        break;
      }
    }

    if (!outputTensor) {
      console.log('[PlateDetector] No valid output tensor found');
      return [];
    }

    const outputData = outputTensor.data as Float32Array;
    const dims = outputTensor.dims;
    console.log('[PlateDetector] Output shape:', dims);

    // Handle [1, 17, 8400] format (YOLO11 with 17 features)
    // Format: [batch, features, predictions] where features include box + obj + classes
    const batchSize = dims[0];
    const numFeatures = dims[1];
    const numPredictions = dims[2];

    console.log(
      `[PlateDetector] Batch: ${batchSize}, Features: ${numFeatures}, Predictions: ${numPredictions}`,
    );

    // Debug: Log first 20 confidence values to understand model output
    const debugConfidences: number[] = [];
    for (let i = 0; i < Math.min(20, numPredictions); i++) {
      const rawConf = outputData[4 * numPredictions + i];
      debugConfidences.push(rawConf);
    }
    console.log(
      '[PlateDetector] First 20 confidence values:',
      debugConfidences.map(c => c.toFixed(4)),
    );

    // Determine if sigmoid is needed by checking value range
    const sampleConf = outputData[4 * numPredictions];
    const needsSigmoid = sampleConf < 0; // Raw logits are typically negative or > 1 after activation

    console.log(
      '[PlateDetector] Sample confidence:',
      sampleConf.toFixed(4),
      '- needs sigmoid:',
      needsSigmoid,
    );

    // Pre-filter: Only keep top candidates to prevent memory issues
    // First pass: collect all above a very low threshold to find top candidates
    const allCandidates: {
      index: number;
      confidence: number;
      xc: number;
      yc: number;
      w: number;
      h: number;
    }[] = [];

    for (let i = 0; i < numPredictions; i++) {
      let confidence = outputData[4 * numPredictions + i];
      if (needsSigmoid) {
        confidence = sigmoid(confidence);
      }

      // Pre-filter: only keep if above 0.1 to reduce processing
      if (confidence > 0.1) {
        const xc = outputData[i];
        const yc = outputData[numPredictions + i];
        const w = outputData[2 * numPredictions + i];
        const h = outputData[3 * numPredictions + i];

        allCandidates.push({ index: i, confidence, xc, yc, w, h });
      }
    }

    console.log(
      `[PlateDetector] Pre-filtered candidates: ${allCandidates.length}`,
    );

    // Sort by confidence descending
    allCandidates.sort((a, b) => b.confidence - a.confidence);

    // Take top 200 for NMS to prevent memory issues
    const topCandidates = allCandidates.slice(0, 200);
    console.log(
      `[PlateDetector] Processing top ${topCandidates.length} for NMS`,
    );

    const detections: Detection[] = [];

    // Second pass: filter by actual threshold and convert to detections
    for (const candidate of topCandidates) {
      if (candidate.confidence > CONFIDENCE_THRESHOLD) {
        // Convert center format to normalized corners (values are already in 0-640 range)
        let x1 = (candidate.xc - candidate.w / 2) / 640;
        let y1 = (candidate.yc - candidate.h / 2) / 640;
        let x2 = (candidate.xc + candidate.w / 2) / 640;
        let y2 = (candidate.yc + candidate.h / 2) / 640;

        // Normalize to 0-1
        x1 = Math.max(0, Math.min(1, x1));
        y1 = Math.max(0, Math.min(1, y1));
        x2 = Math.max(0, Math.min(1, x2));
        y2 = Math.max(0, Math.min(1, y2));

        const width = x2 - x1;
        const height = y2 - y1;

        console.log(
          `[PlateDetector] Detection: x=${x1.toFixed(3)}, y=${y1.toFixed(3)}, w=${width.toFixed(3)}, h=${height.toFixed(3)}, conf=${candidate.confidence.toFixed(3)}`,
        );

        detections.push({
          x: x1,
          y: y1,
          width,
          height,
          confidence: candidate.confidence,
        });
      }
    }

    console.log(
      `[PlateDetector] Found ${detections.length} detections above threshold ${CONFIDENCE_THRESHOLD}`,
    );

    // Apply NMS with error handling
    let nmsResult: Detection[] = [];
    try {
      nmsResult = applyNMS(detections);
    } catch (nmsError) {
      console.error('[PlateDetector] NMS error:', nmsError);
      nmsResult = detections.slice(0, MAX_DETECTIONS);
    }

    return nmsResult.slice(0, MAX_DETECTIONS);
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const plateDetector = new PlateDetector();
