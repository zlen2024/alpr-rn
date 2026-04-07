# Plate Detector App - Technical Documentation

## 1. Overview

This document describes the technology stack and data flow architecture for the Plate Detector React Native application. The app enables real-time license plate detection using camera capture and image selection, with detection powered by Plate Recognizer cloud API.

## 2. Technology Stack

### 2.1 Framework & Language

| Component  | Technology    | Version    |
| ---------- | ------------- | ---------- |
| Framework  | React Native  | 0.84.1     |
| Language   | TypeScript    | 5.8.3      |
| Runtime    | React         | 19.2.3     |
| Build Tool | Metro Bundler | Integrated |

**Rationale**: React Native 0.84.1 provides the latest features including New Architecture support. TypeScript ensures type safety across the codebase, reducing runtime errors and improving developer experience.

### 2.2 Navigation

| Library                        | Purpose                    |
| ------------------------------ | -------------------------- |
| @react-navigation/native       | Core navigation container  |
| @react-navigation/bottom-tabs  | Tab-based navigation       |
| react-native-screens           | Native screen optimization |
| react-native-safe-area-context | Safe area handling         |

**Rationale**: React Navigation is the standard solution for React Native apps, providing both stack and tab navigators with native performance.

### 2.3 Camera & Image Processing

| Library                    | Purpose                             |
| -------------------------- | ----------------------------------- |
| react-native-vision-camera | High-performance camera capture     |
| react-native-image-picker  | Gallery/camera image selection      |
| react-native-image-resizer | Image compression before API upload |
| react-native-fs            | File system operations              |

**Rationale**:

- Vision Camera offers frame-by-frame capture with better control than React Native's built-in Camera
- Image Resizer ensures images stay under the 2MB API limit
- Image Picker provides unified access to gallery and camera

### 2.4 ML/AI Integration

| Component    | Technology                       |
| ------------ | -------------------------------- |
| ONNX Runtime | onnxruntime-react-native v1.21.0 |
| Local Model  | rfdetr_alpr_int8.onnx            |

**Rationale**: ONNX Runtime enables running pre-trained ONNX models on mobile devices. The project includes an optional local ONNX model (currently not actively used) for future offline detection capability.

### 2.5 External API

| Service              | Endpoint                                         |
| -------------------- | ------------------------------------------------ |
| Plate Recognizer API | https://api.platerecognizer.com/v1/plate-reader/ |

**Rationale**: Plate Recognizer provides a mature, well-documented API with high accuracy for license plate recognition across multiple regions. The API supports vehicle detection, plate recognition, and additional metadata (color, make, model).

### 2.6 Development Tools

| Tool     | Purpose                  |
| -------- | ------------------------ |
| ESLint   | Code linting             |
| Prettier | Code formatting          |
| Jest     | Unit testing             |
| Babel    | JavaScript transpilation |

## 3. Architecture Overview

### 3.1 High-Level Architecture

```
+---------------------------------------------------------------+
|                        UI Layer                                |
|  +-----------------+            +-----------------+             |
|  |  CameraScreen   |            |   ImageScreen   |             |
|  +--------+--------+            +--------+--------+             |
|           |                              |                       |
|           +--------------+---------------+                       |
|                          v                                       |
|              +-------------------+                               |
|              | DetectionOverlay  |                               |
|              |    (Component)     |                               |
|              +-------------------+                               |
+----------------------------+--------------------------------------+
                             |
+----------------------------v--------------------------------------+
|                      Service Layer                               |
|  +-----------------+  +-----------------+  +--------------+     |
|  | ImageDetector   |  | PlateDetector   |  |ImageDecoder  |     |
|  |   (Facade)       |  |   (ONNX)        |  | (Native)     |     |
|  +--------+--------+  +--------+--------+  +------+-------+     |
|           |                    |                   |              |
|           +--------+-------------+-------------------+              |
|                      v                                           |
|            +-------------------+                                 |
|            | PlateRecognizerAPI|                                 |
|            +-------------------+                                 |
+----------------------------+--------------------------------------+
                             |
+----------------------------v--------------------------------------+
|                    External Services                             |
|  +---------------------+       +-------------------------+      |
|  | Plate Recognizer    |       | Device File System      |      |
|  | Cloud API           |       | (RNFS)                  |      |
|  +---------------------+       +-------------------------+      |
+---------------------------------------------------------------+
```

### 3.2 Component Responsibilities

**Screens:**

- `CameraScreen`: Real-time camera preview, capture button, display detection overlays
- `ImageScreen`: Image picker (gallery/camera), display selected image with detection results

**Services:**

- `ImageDetector`: Facade that abstracts detection implementation details
- `PlateRecognizerAPI`: Handles communication with Plate Recognizer cloud API
- `PlateDetector`: ONNX-based local ML inference (available but not actively used)
- `ImageDecoder`: Native module for image decoding

**Components:**

- `DetectionOverlay`: Renders bounding boxes and confidence labels on detected plates

## 4. Data Flow

### 4.1 Primary Detection Flow (Cloud API)

```
User Capture Image
       |
       v
+---------------------+
| Camera/Image     | <-- CameraScreen or ImageScreen
| Picker           |
+-------+---------+
        |
        v
+---------------------+
| Image Path         |
| Received           |
+-------+---------+
        |
        v
+---------------------+
| Image Resize       | <-- PlateRecognizerAPI.resizeImageIfNeeded()
| (if > 2MB or       |     - Check file size (max 2MB)
|  > 1280px)         |     - Check dimensions (max 1280px)
+-------+---------+     - Maintain aspect ratio, quality 85%
        |
        v
+---------------------+
| FormData Build     | <-- append: upload file, regions, mmc=true
+-------+---------+
        |
        v
+---------------------+
| HTTP POST to       | <-- Authorization: Token <api_token>
| Plate Recognizer   |     Timeout: 30 seconds
+-------+---------+
        |
        v
+---------------------+
| JSON Response      | <-- Returns: results[], processing_time,
| Parse              |     filename, version
+-------+---------+
        |
        v
+---------------------+
| Coordinate         | <-- mapResponseToDetections()
| Mapping            |     - Scale coordinates if image was resized
+-------+---------+     - Normalize to 0-1 range
        |
        v
+---------------------+
| Detection[]        | <-- [{x, y, width, height, confidence, plateText}]
| Returned           |
+-------+---------+
        |
        v
+---------------------+
| DetectionOverlay   | <-- Transform normalized coords to screen coords
| Render             |     - Calculate image scale to fit screen
+---------------------+     - Render bounding boxes with labels
```

### 4.2 Data Structures

**Detection Interface** (src/utils/imageProcessing.ts):

```typescript
interface Detection {
  x: number; // Normalized 0-1 (top-left x)
  y: number; // Normalized 0-1 (top-left y)
  width: number; // Normalized 0-1
  height: number; // Normalized 0-1
  confidence: number; // 0-1 confidence score
  plateText?: string; // Recognized plate text
}
```

**API Response** (src/services/PlateRecognizerAPI.ts):

```typescript
interface PlateResult {
  plate: string;
  box: { xmin; ymin; xmax; ymax };
  score: number; // Plate confidence
  dscore: number; // Detection confidence
  vehicle: { type; score; box } | null;
  region: { code; score };
  candidates: Array<{ plate; score }>;
  model_make?: Array<{ make; model; score }>;
  color?: Array<{ color; score }>;
}
```

### 4.3 Coordinate Transformation in DetectionOverlay

```typescript
// Screen dimensions
(screenWidth, screenHeight);

// Original image dimensions
(previewWidth, previewHeight);

// Calculate image scale to fit screen (contain)
imgScale = min(screenWidth / previewWidth, screenHeight / previewHeight);

// Calculate rendered dimensions
renderedW = previewWidth * imgScale;
renderedH = previewHeight * imgScale;

// Calculate offset for centered display
offsetX = (screenWidth - renderedW) / 2;
offsetY = (screenHeight - renderedH) / 2;

// Transform normalized detection to screen coordinates
screenX = detection.x * renderedW + offsetX;
screenY = detection.y * renderedH + offsetY;
screenW = detection.width * renderedW;
screenH = detection.height * renderedH;
```

## 5. Configuration

### 5.1 API Configuration (src/config/index.ts)

```typescript
export const API_CONFIG = {
  PLATE_RECOGNIZER_TOKEN: '61c68b40fb2c293e2077dc7e208342c5e6f9bc45',
  API_BASE_URL: 'https://api.platerecognizer.com/v1/plate-reader/',
  MAX_FILE_SIZE: 2 * 1024 * 1024, // 2MB
};
```

### 5.2 Image Processing Constants (src/utils/imageProcessing.ts)

```typescript
export const INPUT_WIDTH = 576;
export const INPUT_HEIGHT = 576;
export const CONFIDENCE_THRESHOLD = 0.7;
export const NMS_THRESHOLD = 0.3;
export const MAX_DETECTIONS = 10;
```

## 6. Error Handling

### 6.1 Error Categories

| Error Type             | Handling                                    |
| ---------------------- | ------------------------------------------- |
| Network Failure        | Display "Check internet connection" message |
| API Error              | Display API error code and message          |
| Permission Denied      | Display permission request UI               |
| Initialization Failure | Display error with retry option             |

### 6.2 Timeout Configuration

- API request timeout: 30 seconds
- AbortController used for request cancellation

## 7. Performance Considerations

1. **Image Resizing**: Large images are resized to max 1280px before upload to reduce bandwidth and improve API response time
2. **Camera Format Selection**: Prefer formats <= 1920x1920 to stay under API file size limit
3. **NMS (Non-Maximum Suppression)**: Reduces overlapping detections, keeping top 10 results
4. **Native Modules**: ImageDecoder provides native image decoding for potential future optimization

## 8. Future Enhancements

1. **Local ONNX Model**: Implement offline detection using rfdetr_alpr_int8.onnx model
2. **Caching**: Implement result caching for repeated detections
3. **Batch Processing**: Support multiple plate detection in single API call
4. **Region-specific Optimization**: Configure region parameters for better accuracy in specific countries

## 9. File Structure

```
plate_detector_app_rn/
├── App.tsx                    # Root component with navigation
├── src/
│   ├── config/
│   │   └── index.ts           # API configuration
│   ├── screens/
│   │   ├── CameraScreen.tsx   # Camera capture screen
│   │   └── ImageScreen.tsx    # Image selection screen
│   ├── services/
│   │   ├── ImageDetector.ts  # Detection facade
│   │   ├── PlateRecognizerAPI.ts  # API client
│   │   ├── PlateDetector.ts  # ONNX local detector
│   │   └── ImageDecoder.ts    # Native image decoder
│   ├── components/
│   │   └── DetectionOverlay.tsx  # Bounding box renderer
│   └── utils/
│       └── imageProcessing.ts # Image processing utilities
├── assets/
│   └── rfdetr_alpr_int8.onnx  # Local ONNX model
└── package.json
```

---

_Document Version: 1.0_  
_Last Updated: April 2026_
