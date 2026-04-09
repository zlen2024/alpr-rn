package com.platedetector.nativeapp

import ai.onnxruntime.*
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.RectF
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import java.io.File
import java.nio.ByteBuffer
import java.nio.FloatBuffer
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min

data class Detection(val x: Float, val y: Float, val width: Float, val height: Float, val confidence: Float)

class OnnxAnalyzer(
    private val context: Context,
    private val onDetections: (List<Detection>) -> Unit
) : ImageAnalysis.Analyzer {
    companion object {
        private const val INPUT_WIDTH = 640
        private const val INPUT_HEIGHT = 640
        private const val CONFIDENCE_THRESHOLD = 0.3f
        private const val PRE_FILTER_THRESHOLD = 0.1f
        private const val NMS_THRESHOLD = 0.4f
        private const val MAX_DETECTIONS = 10
        private const val MAX_NMS_CANDIDATES = 200
        private const val DEBUG_LOG_INTERVAL = 30
        private val MAX_SRC_PIXELS_SIZE = 1920 * 1080
        private const val ANCHORS = 8400
        private const val FEATURES_PER_ANCHOR = 17  // YOLO11 format
    }

    // Lateinit initialization to avoid crash at class load time
    private lateinit var env: OrtEnvironment
    private lateinit var session: OrtSession
    private val inputShape = longArrayOf(1, 3, INPUT_HEIGHT.toLong(), INPUT_WIDTH.toLong())

    // Pre-allocated buffers
    private val inputFloatBuffer = FloatBuffer.allocate(1 * 3 * INPUT_HEIGHT * INPUT_WIDTH)
    private var outputFloatBuffer = FloatBuffer.allocate(1 * FEATURES_PER_ANCHOR * ANCHORS)
    private var scaledPixels = IntArray(INPUT_WIDTH * INPUT_HEIGHT)
    private var outputArray = FloatArray(FEATURES_PER_ANCHOR * ANCHORS)
    private val detections = mutableListOf<Detection>()
    private var frameCount = 0
    private var initialized = false
    private var frameCallback: ((Int) -> Unit)? = null
    
    fun setFrameCallback(callback: (Int) -> Unit) {
        frameCallback = callback
    }

    init {
        try {
            android.util.Log.d("OnnxAnalyzer", "Starting ONNX init...")
            env = OrtEnvironment.getEnvironment()
            android.util.Log.d("OnnxAnalyzer", "Environment created")
            copyAssetAndLoadModel()
            initialized = true
            android.util.Log.d("OnnxAnalyzer", "ONNX Fully initialized!")
            
            // Write success file
            try {
                File(context.filesDir, "onnx_status.txt").writeText("OK\nInitialized: true\n")
            } catch (e: Exception) {}
            
        } catch (e: Exception) {
            android.util.Log.e("OnnxAnalyzer", "INIT FAILED: ${e.message}", e)
            try {
                val debugFile = File(context.filesDir, "init_error.txt")
                debugFile.writeText("Init failed: ${e.message}\n${android.util.Log.getStackTraceString(e)}")
            } catch (f: Exception) {}
        }
    }

    private fun copyAssetAndLoadModel() {
        try {
            val assetName = "plate_detector.onnx"
            Log.d("OnnxAnalyzer", "Loading model from assets: $assetName")
            
            // Copy model to cache file (ONNX Runtime works better with file paths)
            val modelFile = File(context.cacheDir, "plate_detector.onnx")
            if (!modelFile.exists()) {
                context.assets.open(assetName).use { input ->
                    modelFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                Log.d("OnnxAnalyzer", "Model copied to: ${modelFile.absolutePath}")
            }
            
            // Use CPU with optimization and XNNPACK
            val sessionOptions = OrtSession.SessionOptions().apply {
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                // Try to enable XNNPACK if available
                try {
                    // Try adding CPU provider explicitly
                    val providers = arrayOf("CPUExecutionProvider")
                    // Note: XNNPACK is included in CPU provider on Android
                } catch (e: Exception) {
                    Log.w("OnnxAnalyzer", "Provider config error: ${e.message}")
                }
            }
            
            session = env.createSession(modelFile.absolutePath, sessionOptions)
            Log.d("OnnxAnalyzer", "Session created successfully")
            
            // Log input/output info
            val inputNames = session.inputNames
            val outputNames = session.outputNames
            Log.d("OnnxAnalyzer", "Input names: $inputNames")
            Log.d("OnnxAnalyzer", "Output names: $outputNames")
            
            // Write debug info to file
            try {
                File(context.filesDir, "model_info.txt").writeText("Input: $inputNames\nOutput: $outputNames\n")
            } catch (e: Exception) {}
            
            Log.d("OnnxAnalyzer", "Model loaded successfully with XNNPACK")
        } catch (e: Exception) {
            Log.e("OnnxAnalyzer", "Failed to load model", e)
            throw RuntimeException("Model loading failed", e)
        }
    }

    override fun analyze(imageProxy: ImageProxy) {
        frameCount++
        
        frameCallback?.invoke(frameCount)
        
        // Write frame count to track execution
        try {
            File(context.filesDir, "frame_debug.txt").writeText("Frame: $frameCount\n")
        } catch (e: Exception) {}
        
        val buffer = imageProxy.planes[0].buffer
        val srcW = imageProxy.width
        val srcH = imageProxy.height
        val format = imageProxy.format
        val numPixels = srcW * srcH
        
        // Debug image format
        try {
            File(context.filesDir, "image_format.txt").writeText(
                "Frame $frameCount: ${srcW}x${srcH}, format=$format\n" +
                "Planes: ${imageProxy.planes.size}\n" +
                "Buffer size: ${buffer.capacity()}\n" +
                "Expected: RGBA_8888=1, YUV=35\n"
            )
        } catch (e: Exception) {}

        if (numPixels > MAX_SRC_PIXELS_SIZE) {
            imageProxy.close()
            return
        }

        try {
            // Read planes from RGBA_8888 buffer properly
            buffer.rewind()
            val bitmap = Bitmap.createBitmap(srcW, srcH, Bitmap.Config.ARGB_8888)
            bitmap.copyPixelsFromBuffer(buffer)
            
            // Note: CameraX may provide images that are rotated
            // The ImageProxy contains rotation info we should apply
            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            
            var finalBitmap = bitmap
            if (rotationDegrees != 0) {
                val matrix = Matrix()
                matrix.postRotate(rotationDegrees.toFloat())
                finalBitmap = Bitmap.createBitmap(bitmap, 0, 0, srcW, srcH, matrix, true)
                if (finalBitmap != bitmap) {
                    bitmap.recycle()
                }
            }
            
            // Resize using optimized Android scaling
            val scaledBitmap = Bitmap.createScaledBitmap(finalBitmap, INPUT_WIDTH, INPUT_HEIGHT, true)
            
            // Get pixels from scaled bitmap
            scaledBitmap.getPixels(scaledPixels, 0, INPUT_WIDTH, 0, 0, INPUT_WIDTH, INPUT_HEIGHT)
            
            // Preprocess (extract RGB and normalize)
            inputFloatBuffer.rewind()
            preprocessPixels(scaledPixels, inputFloatBuffer)
            
            // Debug: Write preprocessed input to file
            if (frameCount <= 3) {
                try {
                    inputFloatBuffer.rewind()
                    val inputDebug = FloatArray(30)
                    inputFloatBuffer.get(inputDebug, 0, 30)
                    val sb = StringBuilder()
                    sb.append("Preprocessed input (first 30 values):\n")
                    for (i in 0 until 30) {
                        sb.append("[$i] = ${inputDebug[i]}\n")
                    }
                    // Dump first row of R channel as image-like debug
                    sb.append("\nFirst row R channel (640 values):\n")
                    inputFloatBuffer.rewind()
                    val firstRow = FloatArray(640)
                    inputFloatBuffer.get(firstRow, 0, 640)
                    val minVal = firstRow.minOrNull() ?: 0f
                    val maxVal = firstRow.maxOrNull() ?: 1f
                    sb.append("Min: $minVal, Max: $maxVal\n")
                    // Show first 50 values
                    sb.append("First 50: ")
                    for (i in 0 until min(50, 640)) {
                        sb.append("${firstRow[i].toInt()},")
                    }
                    sb.append("\n")
                    // Show if uniform (all same values = noise/blank)
                    val unique = firstRow.toSet()
                    sb.append("Unique values in row: ${unique.size}\n")
                    if (unique.size < 10) {
                        sb.append("WARNING: Input appears uniform/synthetic!\n")
                    }
                    File(context.filesDir, "input_debug_$frameCount.txt").writeText(sb.toString())
                } catch (e: Exception) {}
            }
            
            // Clean up bitmaps
            if (scaledBitmap != finalBitmap) scaledBitmap.recycle()
            finalBitmap.recycle()
            
            val inputTensor = OnnxTensor.createTensor(env, inputFloatBuffer, inputShape)
            val inputs = mapOf("images" to inputTensor)
            
            try {
                session.run(inputs).use { results ->
                    val outputTensor = results[0] as OnnxTensor
                    
                    // Get actual output shape
                    val shape = outputTensor.info.shape
                    
                    // Debug: Check if output is valid
                    val debugBuilder = StringBuilder()
                    debugBuilder.append("Frame $frameCount\n")
                    debugBuilder.append("Output shape: ${shape.contentToString()}\n")
                    
                    // Check first 20 values directly from tensor
                    val tempBuffer = FloatArray(20)
                    outputTensor.floatBuffer.rewind()
                    outputTensor.floatBuffer.get(tempBuffer, 0, 20)
                    debugBuilder.append("First 20 raw values:\n")
                    for (i in 0 until 20) {
                        debugBuilder.append("  [$i] = ${tempBuffer[i]}\n")
                    }
                    
                    // Get actual output size
                    val outputSize = shape[1].toInt() * shape[2].toInt()
                    debugBuilder.append("Total output size: $outputSize\n")
                    
                    // Resize buffer if needed
                    if (outputFloatBuffer.capacity() < outputSize) {
                        outputFloatBuffer = FloatBuffer.allocate(outputSize)
                    }
                    if (outputArray.size < outputSize) {
                        outputArray = FloatArray(outputSize)
                    }
                    
                    outputTensor.floatBuffer.rewind()
                    outputFloatBuffer.rewind()
                    outputFloatBuffer.put(outputTensor.floatBuffer)
                    outputFloatBuffer.rewind()
                    
                    // Check after copy
                    val firstConf = outputFloatBuffer.get(4 * ANCHORS)
                    debugBuilder.append("After copy - first conf at idx ${4*ANCHORS}: $firstConf\n")
                    
                    try {
                        File(context.filesDir, "inference_debug.txt").writeText(debugBuilder.toString())
                    } catch (e: Exception) {}
                    
                    postprocess(outputFloatBuffer)
                    onDetections(detections.toList())
                }
            } catch (e: Exception) {
                try {
                    File(context.filesDir, "session_error.txt").writeText("Session error: ${e.message}\n${e.stackTraceToString()}\n")
                } catch (f: Exception) {}
            }
            
            inputTensor.close()
        } catch (e: Exception) {
            try {
                File(context.filesDir, "error.txt").writeText("Error: ${e.message}\n")
            } catch (f: Exception) {}
        } finally {
            imageProxy.close()
        }
    }

    private fun preprocessPixels(pixels: IntArray, outFloat: FloatBuffer) {
        for (y in 0 until INPUT_HEIGHT) {
            for (x in 0 until INPUT_WIDTH) {
                val idx = y * INPUT_WIDTH + x
                val pixel = pixels[idx]
                
                // Direct RGB extraction from ARGB_8888 (same as RN PlateDetectorModule)
                val r = ((pixel shr 16) and 0xFF) / 255.0f
                val g = ((pixel shr 8) and 0xFF) / 255.0f
                val b = (pixel and 0xFF) / 255.0f
                
                // CHW format (RGB order for YOLO)
                outFloat.put(idx, r)
                outFloat.put(INPUT_WIDTH * INPUT_HEIGHT + idx, g)
                outFloat.put(2 * INPUT_WIDTH * INPUT_HEIGHT + idx, b)
            }
        }
    }

    private fun postprocess(out: FloatBuffer) {
        detections.clear()
        out.rewind()
        out.get(outputArray)
        
        val anchors = ANCHORS
        val allCandidates = mutableListOf<Detection>()
        
        // Determine if sigmoid is needed (like RN does)
        val sampleConf = outputArray[4 * anchors]
        val needsSigmoid = sampleConf < 0f
        
        for (i in 0 until anchors) {
            var conf = outputArray[4 * anchors + i]
            if (needsSigmoid) {
                conf = sigmoid(conf)
            }
            
            // RN pre-filter threshold
            if (conf > PRE_FILTER_THRESHOLD) {
                val xc = outputArray[i]
                val yc = outputArray[anchors + i]
                val w = outputArray[2 * anchors + i]
                val h = outputArray[3 * anchors + i]
                
                // RN normalizes coordinates (0-1 range based on 640x640 input)
                var x1 = (xc - w / 2f) / INPUT_WIDTH.toFloat()
                var y1 = (yc - h / 2f) / INPUT_HEIGHT.toFloat()
                var x2 = (xc + w / 2f) / INPUT_WIDTH.toFloat()
                var y2 = (yc + h / 2f) / INPUT_HEIGHT.toFloat()
                
                // Cap to 0-1 bounds
                x1 = x1.coerceIn(0f, 1f)
                y1 = y1.coerceIn(0f, 1f)
                x2 = x2.coerceIn(0f, 1f)
                y2 = y2.coerceIn(0f, 1f)
                
                allCandidates.add(Detection(x1, y1, x2 - x1, y2 - y1, conf))
            }
        }
        
        // Sort by confidence descending
        allCandidates.sortByDescending { it.confidence }
        
        // Take top 200 for NMS to prevent CPU spike (same as RN)
        val topCandidates = allCandidates.take(MAX_NMS_CANDIDATES)
        
        // Final threshold and NMS
        for (det in topCandidates) {
            if (det.confidence <= CONFIDENCE_THRESHOLD) continue
            if (detections.size >= MAX_DETECTIONS) break
            
            var keep = true
            for (existing in detections) {
                if (iou(det, existing) > NMS_THRESHOLD) {
                    keep = false
                    break
                }
            }
            if (keep) detections.add(det)
        }
        
        // Debug
        if (frameCount % 30 == 0) {
            try {
                File(context.filesDir, "detections_debug.txt").writeText(
                    "Frame: $frameCount\n" +
                    "Needs Sigmoid: $needsSigmoid (Sample: $sampleConf)\n" +
                    "Candidates > $PRE_FILTER_THRESHOLD: ${allCandidates.size}\n" +
                    "Detections > $CONFIDENCE_THRESHOLD after NMS: ${detections.size}\n"
                )
            } catch (e: Exception) {}
        }
    }
    
    private fun sigmoid(x: Float): Float {
        return 1f / (1f + kotlin.math.exp(-x))
    }

    private fun iou(a: Detection, b: Detection): Float {
        val interLeft = max(a.x, b.x)
        val interTop = max(a.y, b.y)
        val interRight = min(a.x + a.width, b.x + b.width)
        val interBottom = min(a.y + a.height, b.y + b.height)
        val interW = max(0f, interRight - interLeft)
        val interH = max(0f, interBottom - interTop)
        val interArea = interW * interH
        val unionArea = a.width * a.height + b.width * b.height - interArea
        return if (unionArea > 0f) interArea / unionArea else 0f
    }

    fun close() {
        if (::session.isInitialized) {
            session.close()
            env.close()
        }
    }
}
