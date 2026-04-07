import cv2
import numpy as np
import onnxruntime as ort

# --- Change the model to the Plate Detector ---
MODEL_PATH = "plate_detector.onnx"
IMAGE_PATH = "test_car2.jpeg"

def test_plate_detection():
    session = ort.InferenceSession(MODEL_PATH)
    img = cv2.imread(IMAGE_PATH)
    h_orig, w_orig = img.shape[:2]
    
    # 1. Preprocess (YOLOv11 standard)
    input_img = cv2.resize(img, (640, 640))
    input_img = input_img.transpose(2, 0, 1).astype(np.float32) / 255.0
    input_img = np.expand_dims(input_img, axis=0)

    # 2. Run Inference
    outputs = session.run(None, {session.get_inputs()[0].name: input_img})
    output = outputs[0][0] # Shape will likely be [5, 8400]

    # 3. Post-process
    predictions = output.T 
    boxes, confidences = [], []

    for pred in predictions:
        # Index 4 is the 'Plate' confidence score
        confidence = pred[4] 

        if confidence > 0.3: # Lower threshold to be safe for first test
            xc, yc, w, h = pred[0:4]
            x1 = int((xc - w/2) * w_orig / 640)
            y1 = int((yc - h/2) * h_orig / 640)
            width = int(w * w_orig / 640)
            height = int(h * h_orig / 640)
            
            boxes.append([x1, y1, width, height])
            confidences.append(float(confidence))

    # 4. Remove overlapping boxes
    indices = cv2.dnn.NMSBoxes(boxes, confidences, 0.3, 0.4)
    
    if len(indices) > 0:
        for i in indices:
            x, y, w, h = boxes[i]
            cv2.rectangle(img, (x, y), (x + w, y + h), (0, 0, 255), 3) # Red box for plate
            cv2.putText(img, f"PLATE {confidences[i]:.2f}", (x, y - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        print(f"Found {len(indices)} plate(s)!")
    else:
        print("No plates detected. Try a higher quality image or lower threshold.")

    cv2.imshow("Plate Test", img)
    cv2.waitKey(0)

test_plate_detection()