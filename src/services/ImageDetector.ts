import { Platform } from 'react-native';
import { decodeImage } from './ImageDecoder';
import { plateDetector } from './PlateDetector';
import { Detection, preprocessYOLOv11 } from '../utils/imageProcessing';
import {
  loadAndPreprocessImage,
  isNativeModuleAvailable,
} from './NativePlateDetector';

class ImageDetector {
  private isInitialized = false;
  private useNativePreprocessing = false;

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('[ImageDetector] Already initialized, skipping');
      return;
    }

    console.log('[ImageDetector] Initializing with local ONNX model');
    console.log('[ImageDetector] Platform:', Platform.OS);

    // Check if native module is available
    this.useNativePreprocessing = isNativeModuleAvailable();
    console.log(
      '[ImageDetector] Native preprocessing:',
      this.useNativePreprocessing ? 'enabled' : 'disabled',
    );

    await plateDetector.init();

    this.isInitialized = true;
    console.log('[ImageDetector] Initialization complete');
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async detectFromImagePath(
    imagePath: string,
    imageWidth: number,
    imageHeight: number,
    _regions?: string[],
  ): Promise<Detection[]> {
    console.log('[ImageDetector] detectFromImagePath called');
    console.log('[ImageDetector] Path:', imagePath);
    console.log('[ImageDetector] Dimensions:', imageWidth, 'x', imageHeight);

    if (!this.isReady()) {
      throw new Error('Detector not initialized. Call init() first.');
    }

    try {
      let pixels: Float32Array;
      let width: number;
      let height: number;

      if (this.useNativePreprocessing) {
        // Use native module for faster preprocessing
        console.log('[ImageDetector] Using native preprocessing');
        const result = await loadAndPreprocessImage(imagePath);
        width = result.width;
        height = result.height;

        // Convert to Float32Array
        pixels = new Float32Array(result.data);
      } else {
        // Use JS preprocessing (fallback)
        const decoded = await decodeImage(imagePath);
        console.log(
          '[ImageDetector] Decoded:',
          decoded.width,
          'x',
          decoded.height,
          'scaleX:',
          decoded.scaleX,
          'scaleY:',
          decoded.scaleY,
        );
        width = decoded.width;
        height = decoded.height;
        pixels = decoded.pixels;
      }

      const preprocessed = preprocessYOLOv11(pixels, width, height);
      const detections = await plateDetector.detect(preprocessed);

      console.log('[ImageDetector] Detections:', detections.length);

      return detections;
    } catch (error) {
      console.error('[ImageDetector] Error:', error);
      throw error;
    }
  }
}

export const imageDetector = new ImageDetector();
