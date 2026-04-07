// Note: Plate Recognizer API is now DISABLED in favor of local ONNX model detection
// To re-enable: Use PlateRecognizerAPI.detectFromImagePath() in ImageDetector.ts instead of plateDetector
// This file is kept for reference

/*
import { Platform, NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';
import { API_CONFIG } from '../config';

const { ImageDecoder } = NativeModules;

export interface PlateResult {
  plate: string;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  score: number;
  dscore: number;
  vehicle: {
    type: string;
    score: number;
    box: {
      xmin: number;
      ymin: number;
      xmax: number;
      ymax: number;
    };
  } | null;
  region: {
    code: string;
    score: number;
  };
  candidates: Array<{
    plate: string;
    score: number;
  }>;
  model_make?: Array<{
    make: string;
    model: string;
    score: number;
  }>;
  color?: Array<{
    color: string;
    score: number;
  }>;
  orientation?: Array<{
    orientation: string;
    score: number;
  }>;
  year?: {
    year_range: [number, number];
    score: number;
  };
  direction?: number;
  direction_score?: number;
}

export interface PlateRecognizerResponse {
  processing_time: number;
  results: PlateResult[];
  filename: string;
  version: number;
  camera_id: string | null;
  timestamp: string;
}

export interface Detection {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  width: number; // normalized 0-1
  height: number; // normalized 0-1
  confidence: number;
  plateText?: string;
}

const API_BASE_URL = API_CONFIG.API_BASE_URL;
// Maximum file size in bytes (2MB - API limit is typically around this)
const MAX_FILE_SIZE = 2 * 1024 * 1024;
// Max dimensions for resized image
const MAX_IMAGE_DIMENSION = 1280;

class PlateRecognizerAPI {
  private apiToken: string | null = null;

  async init(): Promise<void> {
    const tokenPath = `${RNFS.DocumentDirectoryPath}/.api_token`;
    const exists = await RNFS.exists(tokenPath);
    if (exists) {
      this.apiToken = await RNFS.readFile(tokenPath, 'utf8');
    } else {
      this.apiToken = API_CONFIG.PLATE_RECOGNIZER_TOKEN;
    }
  }

  setApiToken(token: string): void {
    this.apiToken = token;
  }

  private async resizeImageIfNeeded(
    imagePath: string,
    imageWidth: number,
    imageHeight: number,
  ): Promise<{
    path: string;
    width: number;
    height: number;
    wasResized: boolean;
  }> {
    const cleanPath = imagePath.replace('file://', '');

    // Check if we need to resize
    try {
      const stats = await RNFS.stat(cleanPath);
      const fileSize = stats.size;

      // If file is already small enough and dimensions are reasonable, use as-is
      const isSizeOk = fileSize <= MAX_FILE_SIZE;
      const isDimensionsOk =
        imageWidth <= MAX_IMAGE_DIMENSION && imageHeight <= MAX_IMAGE_DIMENSION;

      if (isSizeOk && isDimensionsOk) {
        console.log(
          '[PlateRecognizerAPI] Image OK, no resize needed. Size:',
          (fileSize / 1024).toFixed(1),
          'KB',
        );
        return {
          path: imagePath,
          width: imageWidth,
          height: imageHeight,
          wasResized: false,
        };
      }

      console.log(
        '[PlateRecognizerAPI] Resizing image:',
        imageWidth,
        'x',
        imageHeight,
        'Size:',
        (fileSize / 1024 / 1024).toFixed(2),
        'MB',
      );

      // Calculate new dimensions maintaining aspect ratio
      let newWidth = imageWidth;
      let newHeight = imageHeight;

      if (
        imageWidth > MAX_IMAGE_DIMENSION ||
        imageHeight > MAX_IMAGE_DIMENSION
      ) {
        const scale = Math.min(
          MAX_IMAGE_DIMENSION / imageWidth,
          MAX_IMAGE_DIMENSION / imageHeight,
        );
        newWidth = Math.round(imageWidth * scale);
        newHeight = Math.round(imageHeight * scale);
      }

      // Resize the image
      const resizedImage = await ImageResizer.createResizedImage(
        imagePath,
        newWidth,
        newHeight,
        'JPEG',
        85, // quality 0-100
        0, // rotation
        undefined, // outputPath
        false, // keepMeta
        { mode: 'cover' },
      );

      console.log(
        '[PlateRecognizerAPI] Resized to:',
        newWidth,
        'x',
        newHeight,
        'New path:',
        resizedImage.uri,
      );

      return {
        path: resizedImage.uri,
        width: newWidth,
        height: newHeight,
        wasResized: true,
      };
    } catch (e) {
      console.log('[PlateRecognizerAPI] Resize error:', e);
      // Return original if resize fails
      return {
        path: imagePath,
        width: imageWidth,
        height: imageHeight,
        wasResized: false,
      };
    }
  }

  async detectFromImagePath(
    imagePath: string,
    imageWidth: number,
    imageHeight: number,
    regions?: string[],
  ): Promise<Detection[]> {
    if (!this.apiToken) {
      throw new Error(
        'API token not set. Call init() and setApiToken() first.',
      );
    }

    console.log('[PlateRecognizerAPI] Starting upload...');
    console.log('[PlateRecognizerAPI] Image path:', imagePath);

    // Resize image if needed
    const {
      path: processedPath,
      width: processedWidth,
      height: processedHeight,
      wasResized,
    } = await this.resizeImageIfNeeded(imagePath, imageWidth, imageHeight);

    // Scale factor to map coordinates back to original image
    const scaleX = imageWidth / processedWidth;
    const scaleY = imageHeight / processedHeight;

    if (wasResized) {
      console.log('[PlateRecognizerAPI] Coordinate scale:', scaleX, scaleY);
    }

    const formData = new FormData();

    // React Native specific: use the path directly, file:// is handled internally
    const fileUri = processedPath;

    console.log('[PlateRecognizerAPI] File URI for upload:', fileUri);

    // Create the file object for FormData
    const fileObject = {
      uri: fileUri,
      type: 'image/jpeg',
      name: 'image.jpg',
    };

    formData.append('upload', fileObject as any);

    if (regions && regions.length > 0) {
      formData.append('regions', regions.join(','));
    }

    formData.append('mmc', 'true');

    console.log('[PlateRecognizerAPI] Sending request to:', API_BASE_URL);
    console.log(
      '[PlateRecognizerAPI] Token preview:',
      this.apiToken.substring(0, 10) + '...',
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiToken}`,
          Accept: 'application/json',
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[PlateRecognizerAPI] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PlateRecognizerAPI] API error response:', errorText);
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data: PlateRecognizerResponse = await response.json();
      console.log(
        '[PlateRecognizerAPI] Success! Results:',
        data.results.length,
      );
      // Map coordinates back to original image dimensions if resized
      return this.mapResponseToDetections(
        data,
        imageWidth,
        imageHeight,
        wasResized ? scaleX : 1,
        wasResized ? scaleY : 1,
      );
    } catch (error) {
      console.error('[PlateRecognizerAPI] Fetch error details:', error);
      if (
        error instanceof TypeError &&
        error.message === 'Network request failed'
      ) {
        throw new Error(
          'Network request failed. Check internet connection and API URL.',
        );
      }
      throw error;
    }
  }

  async detectFromBase64(
    base64Image: string,
    imageWidth: number,
    imageHeight: number,
    regions?: string[],
  ): Promise<Detection[]> {
    if (!this.apiToken) {
      throw new Error(
        'API token not set. Call init() and setApiToken() first.',
      );
    }

    const formData = new FormData();

    formData.append('upload', base64Image);

    if (regions && regions.length > 0) {
      formData.append('regions', regions.join(','));
    }

    formData.append('mmc', 'true');

    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data: PlateRecognizerResponse = await response.json();
    return this.mapResponseToDetections(data, imageWidth, imageHeight, 1, 1);
  }

  private mapResponseToDetections(
    response: PlateRecognizerResponse,
    imageWidth: number,
    imageHeight: number,
    scaleX: number,
    scaleY: number,
  ): Detection[] {
    return response.results.map(result => {
      // Scale coordinates back to original image dimensions
      const scaledXmin = result.box.xmin * scaleX;
      const scaledYmin = result.box.ymin * scaleY;
      const scaledXmax = result.box.xmax * scaleX;
      const scaledYmax = result.box.ymax * scaleY;

      // Normalize to 0-1 range based on original image dimensions
      const x = scaledXmin / imageWidth;
      const y = scaledYmin / imageHeight;
      const width = (scaledXmax - scaledXmin) / imageWidth;
      const height = (scaledYmax - scaledYmin) / imageHeight;

      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        width: Math.max(0, Math.min(1, width)),
        height: Math.max(0, Math.min(1, height)),
        confidence: result.score,
        plateText: result.plate,
      };
    });
  }
}

// export const plateRecognizerAPI = new PlateRecognizerAPI();
*/
