import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  PhotoFile,
} from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import { Detection } from '../utils/imageProcessing';
import { imageDetector } from '../services/ImageDetector';
import {
  nativeDetector,
  isNativeDetectorAvailable,
} from '../services/NativeDetector';
import { DetectionOverlay } from '../components/DetectionOverlay';

export const CameraScreen: React.FC = () => {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const isFocused = useIsFocused();

  const format =
    device?.formats.find(f => {
      const photoWidth = f.photoWidth;
      const photoHeight = f.photoHeight;
      return photoWidth <= 1920 && photoHeight <= 1920;
    }) || device?.formats[0];

  const [detections, setDetections] = useState<Detection[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [fps, setFps] = useState(0);

  const cameraRef = useRef<Camera>(null);
  const liveLoopRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const lastDetectionTimeRef = useRef(0);

  useEffect(() => {
    const init = async () => {
      try {
        if (!hasPermission) {
          const granted = await requestPermission();
          if (!granted) {
            setError('Camera permission denied');
            setIsModelLoading(false);
            return;
          }
        }

        const useNative = isNativeDetectorAvailable();
        console.log('[CameraScreen] Using native detector:', useNative);

        await nativeDetector.init();
        await imageDetector.init();
        setIsModelLoading(false);
      } catch (e) {
        setError(`Initialization failed: ${e}`);
        setIsModelLoading(false);
      }
    };

    init();
  }, [hasPermission, requestPermission]);

  const takePhotoAndDetect = useCallback(async () => {
    if (!cameraRef.current || isDetecting) {
      return;
    }

    setIsDetecting(true);

    try {
      const photo: PhotoFile = await cameraRef.current.takePhoto({
        flash: 'off',
      });

      const photoUri = `file://${photo.path}`;

      // Try native detector first, fall back to JS if it fails
      if (isNativeDetectorAvailable()) {
        try {
          const result = await nativeDetector.detectFromPath(photoUri);
          const mappedDetections: Detection[] = result.map(d => ({
            x: d.x,
            y: d.y,
            width: d.width,
            height: d.height,
            confidence: d.confidence,
          }));
          setDetections(mappedDetections);
        } catch (nativeError) {
          console.log(
            '[CameraScreen] Native detector failed, using JS:',
            nativeError.message,
          );
          // Fall back to JS inference
          const photoWidth = photo.width || 1920;
          const photoHeight = photo.height || 1080;
          const result = await imageDetector.detectFromImagePath(
            photoUri,
            photoWidth,
            photoHeight,
          );
          setDetections(result);
        }
      } else {
        const photoWidth = photo.width || 1920;
        const photoHeight = photo.height || 1080;
        const result = await imageDetector.detectFromImagePath(
          photoUri,
          photoWidth,
          photoHeight,
        );
        setDetections(result);
      }
    } catch (e) {
      console.error('Detection error:', e);
    } finally {
      setIsDetecting(false);
    }
  }, [isDetecting]);

  const runLiveDetection = useCallback(async () => {
    if (!liveLoopRef.current || !cameraRef.current) {
      setIsLiveMode(false);
      return;
    }

    const now = Date.now();
    const timeSinceLastDetection = now - lastDetectionTimeRef.current;

    if (timeSinceLastDetection < 100) {
      setTimeout(runLiveDetection, 100 - timeSinceLastDetection);
      return;
    }
    lastDetectionTimeRef.current = now;

    try {
      const photo: PhotoFile = await cameraRef.current.takePhoto({
        flash: 'off',
      });

      const photoUri = `file://${photo.path}`;

      let result: Detection[];

      // Try native detector first, fall back to JS if it fails
      if (isNativeDetectorAvailable()) {
        try {
          const nativeResult = await nativeDetector.detectFromPath(photoUri);
          result = nativeResult.map(d => ({
            x: d.x,
            y: d.y,
            width: d.width,
            height: d.height,
            confidence: d.confidence,
          }));
        } catch {
          console.log(
            '[CameraScreen] Native detector failed in live mode, using JS',
          );
          const photoWidth = photo.width || 1920;
          const photoHeight = photo.height || 1080;
          result = await imageDetector.detectFromImagePath(
            photoUri,
            photoWidth,
            photoHeight,
          );
        }
      } else {
        const photoWidth = photo.width || 1920;
        const photoHeight = photo.height || 1080;
        result = await imageDetector.detectFromImagePath(
          photoUri,
          photoWidth,
          photoHeight,
        );
      }

      frameCountRef.current += 1;
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      setDetections(result);

      if (liveLoopRef.current) {
        setTimeout(runLiveDetection, 0);
      }
    } catch (e) {
      console.error('Live detection error:', e);
      if (liveLoopRef.current) {
        setTimeout(runLiveDetection, 100);
      }
    }
  }, []);

  const toggleLiveMode = useCallback(() => {
    if (isLiveMode) {
      liveLoopRef.current = false;
      setIsLiveMode(false);
      setFps(0);
      setDetections([]);
    } else {
      liveLoopRef.current = true;
      frameCountRef.current = 0;
      lastFpsTimeRef.current = Date.now();
      lastDetectionTimeRef.current = Date.now();
      setIsLiveMode(true);
      runLiveDetection();
    }
  }, [isLiveMode, runLiveDetection]);

  const onLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setCameraLayout({ width, height });
  }, []);

  if (isModelLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="green" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No camera available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={isFocused && !isModelLoading}
        photo={true}
        photoQualityBalance="balanced"
      />
      <DetectionOverlay
        detections={detections}
        previewWidth={device.formats[0]?.videoWidth ?? 1920}
        previewHeight={device.formats[0]?.videoHeight ?? 1080}
        screenWidth={cameraLayout.width}
        screenHeight={cameraLayout.height}
      />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>License Plate Detector</Text>
        {isLiveMode && fps > 0 && (
          <View style={styles.fpsBadge}>
            <Text style={styles.fpsBadgeText}>{fps} FPS</Text>
          </View>
        )}
        {detections.length > 0 && !isLiveMode && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {detections.length} plate{detections.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.liveButton, isLiveMode && styles.liveButtonActive]}
          onPress={toggleLiveMode}
        >
          <Text
            style={[
              styles.liveButtonText,
              isLiveMode && styles.liveButtonTextActive,
            ]}
          >
            {isLiveMode ? 'STOP' : 'LIVE'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.captureButton,
            isDetecting && styles.captureButtonDisabled,
          ]}
          onPress={takePhotoAndDetect}
          disabled={isDetecting || isLiveMode}
        >
          {isDetecting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  loadingText: {
    color: 'white',
    marginTop: 16,
    fontSize: 16,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
    color: 'red',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  header: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  badge: {
    backgroundColor: 'green',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
  },
  fpsBadge: {
    backgroundColor: 'orange',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fpsBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'white',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  liveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'white',
  },
  liveButtonActive: {
    backgroundColor: 'red',
    borderColor: 'red',
  },
  liveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  liveButtonTextActive: {
    color: 'white',
  },
});
