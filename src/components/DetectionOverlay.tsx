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
    // The screen dimensions passed here are ALREADY the displayed image size
    // (after resizeMode="contain" letterboxing)
    // We just need to scale from model space (0-640) to screen space

    const scaleX = screenWidth / previewWidth;
    const scaleY = screenHeight / previewHeight;

    // Use the same scale for both dimensions to maintain aspect ratio
    const imgScale = Math.min(scaleX, scaleY);

    console.log(
      '[DetectionOverlay] Screen (displayed):',
      screenWidth.toFixed(1),
      'x',
      screenHeight.toFixed(1),
    );
    console.log('[DetectionOverlay] Model:', previewWidth, 'x', previewHeight);
    console.log('[DetectionOverlay] Scale:', imgScale.toFixed(4));

    return detections.map((detection, index) => {
      // Detection coordinates are normalized (0-1) relative to 640x640
      // Scale directly to screen space - NO offset needed (container handles letterboxing)
      const x = detection.x * screenWidth;
      const y = detection.y * screenHeight;
      const w = detection.width * screenWidth;
      const h = detection.height * screenHeight;

      if (index < 3) {
        console.log(
          `[DetectionOverlay] Box ${index}: model(${detection.x.toFixed(3)}, ${detection.y.toFixed(3)}) => screen(${x.toFixed(1)}, ${y.toFixed(1)}, ${w.toFixed(1)}, ${h.toFixed(1)})`,
        );
      }

      return {
        x,
        y,
        w,
        h,
        confidence: detection.confidence,
        plateText: detection.plateText,
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
              {t.plateText || `Plate ${Math.round(t.confidence * 100)}%`}
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
