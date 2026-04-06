import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Detection } from '../utils/imageProcessing';

interface DetectionOverlayProps {
  detections: Detection[];
  previewWidth: number;
  previewHeight: number;
  screenWidth: number;
  screenHeight: number;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  detections,
  previewWidth,
  previewHeight,
  screenWidth,
  screenHeight,
}) => {
  const transforms = React.useMemo(() => {
    // Image uses resizeMode="contain" - uniform scale to fit
    const imgScale = Math.min(
      screenWidth / previewWidth,
      screenHeight / previewHeight,
    );
    const renderedW = previewWidth * imgScale;
    const renderedH = previewHeight * imgScale;
    const offsetX = (screenWidth - renderedW) / 2;
    const offsetY = (screenHeight - renderedH) / 2;

    return detections.map(detection => {
      // Detection coords are normalized (0-1) relative to original image
      // Convert to screen pixels: normalized * renderedSize + offset
      return {
        x: detection.x * renderedW + offsetX,
        y: detection.y * renderedH + offsetY,
        w: Math.abs(detection.width) * renderedW,
        h: Math.abs(detection.height) * renderedH,
        confidence: detection.confidence,
      };
    });
  }, [detections, previewWidth, previewHeight, screenWidth, screenHeight]);

  if (detections.length === 0) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {transforms.map((t, index) => (
        <View key={index}>
          <View
            style={[
              styles.boundingBox,
              {
                left: t.x,
                top: t.y,
                width: t.w,
                height: t.h,
              },
            ]}
          />
          <View
            style={[
              styles.label,
              {
                left: t.x,
                top: Math.max(0, t.y - 22),
              },
            ]}
          >
            <Text style={styles.labelText}>
              Plate {Math.round(t.confidence * 100)}%
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  boundingBox: {
    position: 'absolute',
    borderColor: 'rgba(0, 255, 0, 0.9)',
    borderWidth: 2.5,
  },
  label: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 180, 0, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  labelText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
