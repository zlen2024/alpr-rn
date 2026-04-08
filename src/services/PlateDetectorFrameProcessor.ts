import { VisionCameraProxy, Frame } from 'react-native-vision-camera';

const plugin = VisionCameraProxy.initFrameProcessorPlugin('plateDetect', {});

export interface PlateDetectionResult {
  width: number;
  height: number;
  data: number[];
  success: boolean;
}

export function processFrame(frame: Frame): PlateDetectionResult | null {
  'worklet';
  if (plugin == null) {
    console.log('[PlateDetectorFP] Plugin not loaded');
    return null;
  }

  try {
    const result = plugin.call(frame) as unknown as PlateDetectionResult | null;
    return result;
  } catch (e) {
    console.log('[PlateDetectorFP] Error calling plugin:', e);
    return null;
  }
}

export function isPluginAvailable(): boolean {
  return plugin != null;
}
