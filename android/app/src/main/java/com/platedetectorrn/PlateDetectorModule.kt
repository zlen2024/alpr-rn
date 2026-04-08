package com.platedetectorrn

import android.graphics.BitmapFactory
import com.facebook.react.bridge.*
import java.io.File

class PlateDetectorModule(private val reactApplicationContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactApplicationContext) {

    private val inputSize = 640

    override fun getName(): String = "PlateDetectorModule"

    @ReactMethod
    fun getModelPath(promise: Promise) {
        try {
            val modelPath = "${reactApplicationContext.filesDir}/plate_detector.onnx"
            promise.resolve(modelPath)
        } catch (e: Exception) {
            promise.reject("E_ERROR", e.message)
        }
    }

    @ReactMethod
    fun loadAndPreprocessImage(imagePath: String, promise: Promise) {
        try {
            val cleanPath = if (imagePath.startsWith("file://")) {
                imagePath.removePrefix("file://")
            } else {
                imagePath
            }

            // First get original dimensions
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(cleanPath, options)
            val originalWidth = options.outWidth
            val originalHeight = options.outHeight

            // Calculate sample size for efficient memory usage
            val sampleSize = calculateSampleSize(originalWidth, originalHeight, inputSize, inputSize)

            // Decode with sample size
            options.inJustDecodeBounds = false
            options.inSampleSize = sampleSize

            val bitmap = BitmapFactory.decodeFile(cleanPath, options)
            if (bitmap == null) {
                promise.reject("E_BITMAP", "Failed to decode image")
                return
            }

            // Scale to 640x640
            val scaledBitmap = android.graphics.Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
            bitmap.recycle()

            // Get pixel data as float array (normalized 0-1)
            val width = scaledBitmap.width
            val height = scaledBitmap.height
            val pixels = IntArray(width * height)
            scaledBitmap.getPixels(pixels, 0, width, 0, 0, width, height)
            scaledBitmap.recycle()

            // Convert to RGB float array
            val rgbData = DoubleArray(3 * width * height)
            for (i in pixels.indices) {
                val pixel = pixels[i]
                rgbData[i] = ((pixel shr 16) and 0xFF).toDouble() / 255.0
                rgbData[width * height + i] = ((pixel shr 8) and 0xFF).toDouble() / 255.0
                rgbData[2 * width * height + i] = (pixel and 0xFF).toDouble() / 255.0
            }

            // Return result
            val result = Arguments.createMap()
            result.putInt("width", width)
            result.putInt("height", height)
            result.putDouble("originalWidth", originalWidth.toDouble())
            result.putDouble("originalHeight", originalHeight.toDouble())

            val dataArray = Arguments.createArray()
            for (i in rgbData.indices) {
                dataArray.pushDouble(rgbData[i])
            }
            result.putArray("data", dataArray)

            promise.resolve(result)

        } catch (e: Exception) {
            println("[PlateDetectorModule] Error: ${e.message}")
            e.printStackTrace()
            promise.reject("E_ERROR", e.message)
        }
    }

    private fun calculateSampleSize(srcWidth: Int, srcHeight: Int, dstWidth: Int, dstHeight: Int): Int {
        var sampleSize = 1
        while (srcWidth / sampleSize > dstWidth * 2 || srcHeight / sampleSize > dstHeight * 2) {
            sampleSize *= 2
        }
        return sampleSize
    }
}