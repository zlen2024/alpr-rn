import { Platform } from 'react-native';
import { decodeImage } from './ImageDecoder';
import { plateDetector } from './PlateDetector';
import { Detection, preprocessYOLOv11 } from '../utils/imageProcessing';

class ImageDetector {
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('[ImageDetector] Already initialized, skipping');
      return;
    }

    console.log('[ImageDetector] Initializing with local ONNX model');
    console.log('[ImageDetector] Platform:', Platform.OS);

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

      const preprocessed = preprocessYOLOv11(
        decoded.pixels,
        decoded.width,
        decoded.height,
      );

      const detections = await plateDetector.detect(preprocessed);

      console.log('[ImageDetector] Detections:', detections.length);

      // Return detections in 640x640 coordinate space
      // DetectionOverlay will handle the scaling to screen coordinates
      return detections;
    } catch (error) {
      console.error('[ImageDetector] Error:', error);
      throw error;
    }
  }
}

export const imageDetector = new ImageDetector();
