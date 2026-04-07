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
    // For resizeMode="contain", the image is scaled uniformly to fit within screen dimensions
    // The scale is determined by the limiting dimension
    const scaleX = screenWidth / previewWidth;
    const scaleY = screenHeight / previewHeight;
    const imgScale = Math.min(scaleX, scaleY);

    // Calculate the actual rendered image size
    const renderedW = previewWidth * imgScale;
    const renderedH = previewHeight * imgScale;

    // Calculate offsets (letterboxing)
    const offsetX = (screenWidth - renderedW) / 2;
    const offsetY = (screenHeight - renderedH) / 2;

    console.log(
      '[DetectionOverlay] Screen:',
      screenWidth.toFixed(1),
      'x',
      screenHeight.toFixed(1),
    );
    console.log(
      '[DetectionOverlay] Preview (model):',
      previewWidth,
      'x',
      previewHeight,
    );
    console.log('[DetectionOverlay] Scale:', imgScale.toFixed(4));
    console.log(
      '[DetectionOverlay] Rendered:',
      renderedW.toFixed(1),
      'x',
      renderedH.toFixed(1),
    );
    console.log(
      '[DetectionOverlay] Offset:',
      offsetX.toFixed(1),
      offsetY.toFixed(1),
    );
    console.log('[DetectionOverlay] Detections:', detections.length);

    return detections.map((detection, index) => {
      // Detection coordinates are normalized (0-1) relative to preview size
      // Scale to rendered size and add offset
      const x = detection.x * renderedW + offsetX;
      const y = detection.y * renderedH + offsetY;
      const w = detection.width * renderedW;
      const h = detection.height * renderedH;

      if (index < 3) {
        console.log(
          `[DetectionOverlay] Box ${index}: det(${detection.x.toFixed(3)}, ${detection.y.toFixed(3)}, ${detection.width.toFixed(3)}, ${detection.height.toFixed(3)}) => screen(${x.toFixed(1)}, ${y.toFixed(1)}, ${w.toFixed(1)}, ${h.toFixed(1)})`,
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
