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
import { DetectionOverlay } from '../components/DetectionOverlay';

export const CameraScreen: React.FC = () => {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const isFocused = useIsFocused();

  // Find a format with smaller photo dimensions to stay under API file size limit
  const format =
    device?.formats.find(f => {
      const photoWidth = f.photoWidth;
      const photoHeight = f.photoHeight;
      // Target around 1080p or smaller to keep file size under 2MB
      return photoWidth <= 1920 && photoHeight <= 1920;
    }) || device?.formats[0];

  console.log(
    '[CameraScreen] Selected format:',
    format ? `${format.photoWidth}x${format.photoHeight}` : 'default',
  );

  const [detections, setDetections] = useState<Detection[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);

  const cameraRef = useRef<Camera>(null);

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
      // Take photo
      const photo: PhotoFile = await cameraRef.current.takePhoto({
        flash: 'off',
      });

      const photoUri = `file://${photo.path}`;
      setLastPhotoUri(photoUri);

      // Use actual photo dimensions from the metadata
      const photoWidth = photo.width || 1920;
      const photoHeight = photo.height || 1080;

      console.log(
        '[CameraScreen] Photo dimensions:',
        photoWidth,
        'x',
        photoHeight,
      );

      const result = await imageDetector.detectFromImagePath(
        photoUri,
        photoWidth,
        photoHeight,
      );
      setDetections(result);
    } catch (e) {
      console.error('Detection error:', e);
    } finally {
      setIsDetecting(false);
    }
  }, [isDetecting]);

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
        <Text style={styles.errorIcon}>⚠</Text>
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
        {detections.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {detections.length} plate{detections.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={takePhotoAndDetect}
          disabled={isDetecting}
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
});
