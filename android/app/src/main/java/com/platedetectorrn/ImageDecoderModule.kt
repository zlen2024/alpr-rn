package com.platedetectorrn

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import com.facebook.react.bridge.*
import java.io.ByteArrayOutputStream

class ImageDecoderModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {
    
    private val inputWidth = 576
    private val inputHeight = 576
    
    override fun getName() = "ImageDecoder"
    
    @ReactMethod
    fun decodeImageFromPath(imagePath: String, promise: Promise) {
        try {
            val cleanPath = if (imagePath.startsWith("file://")) {
                imagePath.removePrefix("file://")
            } else {
                imagePath
            }
            
            val options = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            
            val originalBitmap = BitmapFactory.decodeFile(cleanPath, options) 
                ?: run {
                    promise.reject("DECODE_ERROR", "Failed to decode image at: $cleanPath")
                    return
                }
            
            val scaledBitmap = Bitmap.createScaledBitmap(
                originalBitmap, inputWidth, inputHeight, true
            )
            
            val width = scaledBitmap.width
            val height = scaledBitmap.height
            val pixels = IntArray(width * height)
            scaledBitmap.getPixels(pixels, 0, width, 0, 0, width, height)
            
            // Convert ARGB to RGBA float array (normalized)
            val rgbaData = FloatArray(3 * width * height)
            
            for (i in pixels.indices) {
                val pixel = pixels[i]
                val r = ((pixel shr 16) and 0xFF) / 255.0f
                val g = ((pixel shr 8) and 0xFF) / 255.0f
                val b = (pixel and 0xFF) / 255.0f
                
                rgbaData[i] = r
                rgbaData[width * height + i] = g
                rgbaData[2 * width * height + i] = b
            }
            
            // Return as double array (convert floats to doubles for JS)
            val result = Arguments.createMap()
            result.putInt("width", width)
            result.putInt("height", height)
            result.putDouble("scaleX", originalBitmap.width.toDouble() / inputWidth)
            result.putDouble("scaleY", originalBitmap.height.toDouble() / inputHeight)
            
            val rgbaArray = Arguments.createArray()
            for (i in rgbaData.indices) {
                rgbaArray.pushDouble(rgbaData[i].toDouble())
            }
            result.putArray("pixels", rgbaArray)
            
            // Clean up
            if (scaledBitmap != originalBitmap) {
                scaledBitmap.recycle()
            }
            originalBitmap.recycle()
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DECODE_ERROR", "Failed to decode image: ${e.message}")
        }
    }
    
    @ReactMethod
    fun convertYuvToRgb(yData: ReadableArray, uData: ReadableArray, vData: ReadableArray,
                        width: Int, height: Int, promise: Promise) {
        try {
            val ySize = yData.size()
            val uvSize = uData.size()
            
            val yBytes = ByteArray(ySize)
            val uBytes = ByteArray(uvSize)
            val vBytes = ByteArray(uvSize)
            
            for (i in 0 until ySize) {
                yBytes[i] = (yData.getDouble(i).toInt() and 0xFF).toByte()
            }
            for (i in 0 until uvSize) {
                uBytes[i] = (uData.getDouble(i).toInt() and 0xFF).toByte()
                vBytes[i] = (vData.getDouble(i).toInt() and 0xFF).toByte()
            }
            
            // NV21 format: Y plane first, then interleaved UV
            val yuvBytes = ByteArray(ySize + uvSize * 2)
            System.arraycopy(yBytes, 0, yuvBytes, 0, ySize)
            for (i in 0 until uvSize) {
                yuvBytes[ySize + i * 2] = uBytes[i]
                yuvBytes[ySize + i * 2 + 1] = vBytes[i]
            }
            
            val yuvImage = YuvImage(yuvBytes, ImageFormat.NV21, width, height, null)
            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, width, height), 100, out)
            val jpegBytes = out.toByteArray()
            
            val originalBitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
                ?: run {
                    promise.reject("CONVERT_ERROR", "Failed to convert YUV")
                    return
                }
            
            val scaledBitmap = Bitmap.createScaledBitmap(
                originalBitmap, inputWidth, inputHeight, true
            )
            
            val outWidth = scaledBitmap.width
            val outHeight = scaledBitmap.height
            val pixels = IntArray(outWidth * outHeight)
            scaledBitmap.getPixels(pixels, 0, outWidth, 0, 0, outWidth, outHeight)
            
            // Convert ARGB to RGBA float array
            val rgbaData = FloatArray(3 * outWidth * outHeight)
            
            for (i in pixels.indices) {
                val pixel = pixels[i]
                val r = ((pixel shr 16) and 0xFF) / 255.0f
                val g = ((pixel shr 8) and 0xFF) / 255.0f
                val b = (pixel and 0xFF) / 255.0f
                
                rgbaData[i] = r
                rgbaData[outWidth * outHeight + i] = g
                rgbaData[2 * outWidth * outHeight + i] = b
            }
            
            val result = Arguments.createMap()
            result.putInt("width", outWidth)
            result.putInt("height", outHeight)
            
            val rgbaArray = Arguments.createArray()
            for (i in rgbaData.indices) {
                rgbaArray.pushDouble(rgbaData[i].toDouble())
            }
            result.putArray("pixels", rgbaArray)
            
            // Clean up
            if (scaledBitmap != originalBitmap) {
                scaledBitmap.recycle()
            }
            originalBitmap.recycle()
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CONVERT_ERROR", "Failed to convert YUV: ${e.message}")
        }
    }
}