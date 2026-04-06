import { plateDetector } from './PlateDetector';
import { decodeImage, convertYuvToRgb } from './ImageDecoder';
import { Detection, INPUT_WIDTH, INPUT_HEIGHT } from '../utils/imageProcessing';
import { preprocessNormalized } from '../utils/imageProcessing';

class ImageDetector {
  private isInitialized = false;

  async init(): Promise<void> {
    console.log('[ImageDetector] Initializing...');
    await plateDetector.init();
    this.isInitialized = true;
    console.log('[ImageDetector] Initialization complete');
  }

  isReady(): boolean {
    return this.isInitialized && plateDetector.isReady();
  }

  async detectFromImagePath(imagePath: string): Promise<Detection[]> {
    console.log('[ImageDetector] detectFromImagePath called with:', imagePath);

    if (!this.isReady()) {
      throw new Error('Detector not initialized. Call init() first.');
    }

    try {
      const decoded = await decodeImage(imagePath);
      console.log(
        '[ImageDetector] Decoded:',
        decoded.width,
        'x',
        decoded.height,
      );

      const normalizedPixels = preprocessNormalized(
        decoded.pixels,
        decoded.width,
        decoded.height,
      );

      const detections = await plateDetector.detect(normalizedPixels);
      console.log('[ImageDetector] Detections:', detections.length);

      // Coordinates are already normalized (0-1) by PlateDetector
      return detections;
    } catch (error) {
      console.error('[ImageDetector] Error in detectFromImagePath:', error);
      throw error;
    }
  }

  async detectFromCameraFrame(
    yData: number[],
    uData: number[],
    vData: number[],
    width: number,
    height: number,
  ): Promise<Detection[]> {
    console.log('[ImageDetector] detectFromCameraFrame called');

    if (!this.isReady()) {
      throw new Error('Detector not initialized');
    }

    try {
      const rgb = await convertYuvToRgb(yData, uData, vData, width, height);

      const normalizedPixels = preprocessNormalized(
        rgb.pixels,
        rgb.width,
        rgb.height,
      );

      const detections = await plateDetector.detect(normalizedPixels);
      console.log('[ImageDetector] Camera detections:', detections.length);

      // Coordinates are already normalized (0-1) by PlateDetector
      return detections;
    } catch (error) {
      console.error('[ImageDetector] Error in detectFromCameraFrame:', error);
      throw error;
    }
  }
}

export const imageDetector = new ImageDetector();
