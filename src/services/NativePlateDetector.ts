import { NativeModules } from 'react-native';

const { PlateDetectorModule } = NativeModules;

export interface ImagePreprocessingResult {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  data: number[];
}

export async function loadAndPreprocessImage(
  imagePath: string,
): Promise<ImagePreprocessingResult> {
  if (!PlateDetectorModule) {
    throw new Error('PlateDetectorModule not available');
  }
  return PlateDetectorModule.loadAndPreprocessImage(imagePath);
}

export async function getModelPath(): Promise<string> {
  if (!PlateDetectorModule) {
    throw new Error('PlateDetectorModule not available');
  }
  return PlateDetectorModule.getModelPath();
}

export function isNativeModuleAvailable(): boolean {
  return !!PlateDetectorModule;
}
