import { NativeModules } from 'react-native';

const { PlateNativeDetector } = NativeModules;

export interface NativeDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

class NativeDetectorClass {
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    if (!PlateNativeDetector) {
      throw new Error('PlateNativeDetector native module not available');
    }

    await PlateNativeDetector.initialize();
    this.isInitialized = true;
    console.log('[NativeDetector] Initialized successfully');
  }

  async detectFromPath(imagePath: string): Promise<NativeDetection[]> {
    if (!this.isInitialized) {
      await this.init();
    }

    const result = await PlateNativeDetector.detectFromPath(imagePath);
    return result;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const nativeDetector = new NativeDetectorClass();

export function isNativeDetectorAvailable(): boolean {
  return !!PlateNativeDetector;
}
