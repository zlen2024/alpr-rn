package com.platedetectorrn

import android.util.Log
import com.facebook.react.bridge.*
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File

class PlateNativeDetector(private val reactApplicationContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactApplicationContext) {

    companion object {
        private const val TAG = "PlateNativeDetector"
    }

    private var session: OrtSession? = null
    private var environment: OrtEnvironment? = null
    private var isInitialized = false

    override fun getName(): String = "PlateNativeDetector"

    @ReactMethod
    fun initialize(promise: Promise) {
        if (isInitialized) {
            Log.d(TAG, "Already initialized")
            promise.resolve(true)
            return
        }

        try {
            val modelPath = "${reactApplicationContext.filesDir}/plate_detector.onnx"
            val modelFile = File(modelPath)

            if (!modelFile.exists()) {
                Log.e(TAG, "Model not found at: $modelPath")
                promise.reject("E_MODEL", "Model file not found")
                return
            }

            Log.d(TAG, "Loading ONNX model from: $modelPath")
            
            environment = OrtEnvironment.getEnvironment()
            val sessionOptions = OrtSession.SessionOptions()
            
            session = environment?.createSession(modelPath, sessionOptions)
            isInitialized = true
            
            Log.d(TAG, "ONNX session initialized successfully")
            promise.resolve(true)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize: ${e.message}")
            promise.reject("E_INIT", e.message)
        }
    }

    @ReactMethod
    fun detectFromPath(imagePath: String, promise: Promise) {
        // Native inference has API issues - gracefully fall back to JS
        // The CameraScreen will detect this error and use JS inference instead
        promise.reject("E_USE_JS", "Use JS inference instead")
    }
}