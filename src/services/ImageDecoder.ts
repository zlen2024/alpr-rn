import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { INPUT_WIDTH, INPUT_HEIGHT } from '../utils/imageProcessing';

interface DecodedImage {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  pixels: Float32Array;
}

const { ImageDecoder } = NativeModules;

const nativeModuleAvailable = !!ImageDecoder;
console.log('[ImageDecoder] Native module available:', nativeModuleAvailable);
console.log('[ImageDecoder] Platform:', Platform.OS);

export async function decodeImage(imagePath: string): Promise<DecodedImage> {
  console.log('[ImageDecoder] Decoding image from path:', imagePath);

  if (nativeModuleAvailable && Platform.OS === 'android') {
    try {
      const result = await ImageDecoder.decodeImageFromPath(imagePath);

      console.log(
        '[ImageDecoder] Native decode: width=',
        result.width,
        'height=',
        result.height,
        'pixels length=',
        result.pixels?.length,
      );

      if (!result.pixels || result.pixels.length === 0) {
        throw new Error('Native decoder returned empty pixel data');
      }

      console.log(
        '[ImageDecoder] First 10 pixel values:',
        result.pixels.slice(0, 10),
      );

      return {
        width: result.width,
        height: result.height,
        scaleX: result.scaleX,
        scaleY: result.scaleY,
        pixels: new Float32Array(result.pixels),
      };
    } catch (e) {
      console.log('[ImageDecoder] Native decode failed:', e);
      console.log('[ImageDecoder] Falling back to JS decoder');
    }
  }

  console.log('[ImageDecoder] Using JS fallback decoder (stub for testing)');
  return decodeImageJS(imagePath);
}

export async function decodeImageJS(imagePath: string): Promise<DecodedImage> {
  console.log('[ImageDecoder] JS fallback: decoding from path:', imagePath);

  const cleanPath = imagePath.replace('file://', '');

  try {
    const base64Data = await RNFS.readFile(cleanPath, 'base64');
    console.log('[ImageDecoder] Read file, size:', base64Data.length, 'chars');

    console.log('[ImageDecoder] JS decoder note: Using stub pixels');
    console.log(
      '[ImageDecoder] On iOS, native ImageDecoder module is required for proper decoding',
    );

    const stubPixels = new Float32Array(3 * INPUT_WIDTH * INPUT_HEIGHT);
    for (let i = 0; i < stubPixels.length; i++) {
      stubPixels[i] = 0.5;
    }

    return {
      width: INPUT_WIDTH,
      height: INPUT_HEIGHT,
      scaleX: INPUT_WIDTH / 1920,
      scaleY: INPUT_HEIGHT / 1080,
      pixels: stubPixels,
    };
  } catch (e) {
    console.error('[ImageDecoder] JS decode error:', e);
    throw new Error(`Failed to decode image: ${e}`);
  }
}

export async function convertYuvToRgb(
  yData: number[],
  uData: number[],
  vData: number[],
  width: number,
  height: number,
): Promise<{ width: number; height: number; pixels: Float32Array }> {
  console.log(
    '[ImageDecoder] Converting YUV to RGB: width=',
    width,
    'height=',
    height,
    'yData size=',
    yData.length,
  );

  if (!ImageDecoder) {
    throw new Error('ImageDecoder native module is not available.');
  }

  const result = await ImageDecoder.convertYuvToRgb(
    yData,
    uData,
    vData,
    width,
    height,
  );

  console.log(
    '[ImageDecoder] Converted YUV: width=',
    result.width,
    'height=',
    result.height,
  );

  return {
    width: result.width,
    height: result.height,
    pixels: new Float32Array(result.pixels),
  };
}

export async function copyAssetToFile(
  assetName: string,
  destPath: string,
): Promise<string> {
  if (!ImageDecoder) {
    throw new Error('ImageDecoder native module not available');
  }
  return ImageDecoder.copyAssetToFile(assetName, destPath);
}

export { ImageDecoder };
export { nativeModuleAvailable };
