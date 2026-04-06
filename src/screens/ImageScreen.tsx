import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  launchImageLibrary,
  launchCamera,
  ImageLibraryOptions,
  CameraOptions,
  Asset,
} from 'react-native-image-picker';
import { Detection } from '../utils/imageProcessing';
import { imageDetector } from '../services/ImageDetector';
import { DetectionOverlay } from '../components/DetectionOverlay';

export const ImageScreen: React.FC = () => {
  const [detectorReady, setDetectorReady] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      try {
        await imageDetector.init();
        setDetectorReady(true);
      } catch (e) {
        console.error('Plate detector init error:', e);
        Alert.alert('Error', 'Failed to initialize detector');
      }
    })();
  }, []);

  const [selectedImage, setSelectedImage] = useState<Asset | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });

  const handlePickImage = async () => {
    const options: ImageLibraryOptions = {
      mediaType: 'photo',
      quality: 1,
    };

    const result = await launchImageLibrary(options);

    if (result.didCancel) return;
    if (result.errorCode) {
      Alert.alert('Error', result.errorMessage || 'Failed to pick image');
      return;
    }

    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage(asset);
      setDetections([]);
      runDetection(asset);
    }
  };

  const handleTakePhoto = async () => {
    const options: CameraOptions = {
      mediaType: 'photo',
      quality: 1,
    };

    const result = await launchCamera(options);

    if (result.didCancel) return;
    if (result.errorCode) {
      Alert.alert('Error', result.errorMessage || 'Failed to take photo');
      return;
    }

    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage(asset);
      setDetections([]);
      runDetection(asset);
    }
  };

  const runDetection = async (asset: Asset) => {
    if (!asset.uri) return;

    if (!detectorReady) {
      Alert.alert('Error', 'Detector not ready');
      return;
    }
    setIsDetecting(true);

    try {
      const result = await imageDetector.detectFromImagePath(asset.uri);
      setDetections(result);
    } catch (e) {
      console.error('Detection error:', e);
      Alert.alert('Error', 'Failed to run detection');
    } finally {
      setIsDetecting(false);
    }
  };

  const onImageLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setImageLayout({ width, height });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Image Detection</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.button} onPress={handlePickImage}>
          <Text style={styles.buttonText}>Pick from Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleTakePhoto}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </TouchableOpacity>
      </View>

      {selectedImage && selectedImage.uri && (
        <View style={styles.imageContainer} onLayout={onImageLayout}>
          <Image
            source={{ uri: selectedImage.uri }}
            style={styles.image}
            resizeMode="contain"
          />
          {imageLayout.width > 0 && detections.length > 0 && (
            <DetectionOverlay
              detections={detections}
              previewWidth={selectedImage.width ?? 1920}
              previewHeight={selectedImage.height ?? 1080}
              screenWidth={imageLayout.width}
              screenHeight={imageLayout.height}
            />
          )}
          {isDetecting && (
            <View style={styles.detectingOverlay}>
              <ActivityIndicator size="large" color="green" />
              <Text style={styles.detectingText}>Detecting...</Text>
            </View>
          )}
        </View>
      )}

      {detections.length > 0 && (
        <View style={styles.result}>
          <Text style={styles.resultText}>
            Found {detections.length} plate{detections.length > 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    padding: 16,
    backgroundColor: 'green',
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
  },
  button: {
    backgroundColor: 'green',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  imageContainer: {
    flex: 1,
    margin: 16,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  detectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  detectingText: {
    color: 'white',
    marginTop: 8,
    fontSize: 16,
  },
  result: {
    padding: 16,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'green',
  },
});
