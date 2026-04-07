export const API_CONFIG = {
  PLATE_RECOGNIZER_TOKEN: '61c68b40fb2c293e2077dc7e208342c5e6f9bc45',
  API_BASE_URL: 'https://api.platerecognizer.com/v1/plate-reader/',
  MAX_FILE_SIZE: 2 * 1024 * 1024,
};

// Note: Plate Recognizer API is now disabled in favor of local ONNX model (plate_detector.onnx)
// To re-enable: uncomment the API calls in ImageDetector.ts and use PlateRecognizerAPI instead
