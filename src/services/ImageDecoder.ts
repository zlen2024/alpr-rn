import { NativeModules } from 'react-native';
import { Detection } from '../utils/imageProcessing';

interface DecodedImage {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  pixels: Float32Array;
}

interface ImageDecoderModule {
  decodeImageFromPath(imagePath: string): Promise<DecodedImage>;
  convertYuvToRgb(
    yData: number[],
    uData: number[],
    vData: number[],
    width: number,
    height: number,
  ): Promise<{ width: number; height: number; pixels: Float32Array }>;
}

const { ImageDecoder } = NativeModules;

console.log('[ImageDecoder] Native module available:', !!ImageDecoder);
console.log(
  '[ImageDecoder] Native module keys:',
  ImageDecoder ? Object.keys(ImageDecoder) : 'N/A',
);

export async function decodeImage(imagePath: string): Promise<DecodedImage> {
  console.log('[ImageDecoder] Decoding image from path:', imagePath);

  if (!ImageDecoder) {
    throw new Error(
      'ImageDecoder native module is not available. Ensure the native module is registered in MainApplication.kt and the app has been fully rebuilt (not just Metro reload).',
    );
  }

  const result = await ImageDecoder.decodeImageFromPath(imagePath);

  console.log(
    '[ImageDecoder] Decoded image: width=',
    result.width,
    'height=',
    result.height,
    'pixels length=',
    result.pixels?.length,
  );

  if (!result.pixels || result.pixels.length === 0) {
    throw new Error('Native decoder returned empty pixel data');
  }

  return {
    width: result.width,
    height: result.height,
    scaleX: result.scaleX,
    scaleY: result.scaleY,
    pixels: new Float32Array(result.pixels),
  };
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
    throw new Error(
      'ImageDecoder native module is not available. Ensure the native module is registered in MainApplication.kt and the app has been fully rebuilt.',
    );
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
    'pixels length=',
    result.pixels?.length,
  );

  return {
    width: result.width,
    height: result.height,
    pixels: new Float32Array(result.pixels),
  };
}

export { ImageDecoder };
