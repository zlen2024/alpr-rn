package com.platedetector.nativeapp

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asExecutor
import java.io.File

class DetectionOverlayView(context: Context) : View(context) {
    private var detections = listOf<Detection>()
    private val paint = Paint().apply {
        color = Color.GREEN
        style = Paint.Style.STROKE
        strokeWidth = 4f
        isAntiAlias = true
    }
    private val textPaint = Paint().apply {
        color = Color.GREEN
        textSize = 24f
        isAntiAlias = true
    }
    
    fun updateDetections(dets: List<Detection>) {
        detections = dets
        if (width > 0 && height > 0) {
            invalidate()
        }
    }
    
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        if (width <= 0 || height <= 0) return
        
        for (det in detections) {
            val left = det.x * width
            val top = det.y * height
            val right = (det.x + det.width) * width
            val bottom = (det.y + det.height) * height
            
            canvas.drawRect(left, top, right, bottom, paint)
            
            val label = "${(det.confidence * 100).toInt()}%"
            canvas.drawText(label, left, top - 5, textPaint)
        }
    }
}

class MainActivity : ComponentActivity() {
    private val CAMERA_PERM = 1001
    private lateinit var statusText: TextView
    private lateinit var frameText: TextView
    private lateinit var overlayView: DetectionOverlayView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        Toast.makeText(this, "Starting app...", Toast.LENGTH_LONG).show()
        
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        })
        
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Starting camera + ONNX...", Toast.LENGTH_LONG).show()
            startCameraWithONNX()
        } else {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERM)
        }
    }
    
    private fun startCameraWithONNX() {
        try {
            val previewView = PreviewView(this).apply {
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }
            
            val overlayView = DetectionOverlayView(this).apply {
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }
            
            statusText = TextView(this).apply {
                text = "Loading model..."
                setTextColor(Color.YELLOW)
                textSize = 20f
                setPadding(20, 20, 20, 20)
            }
            
            frameText = TextView(this).apply {
                text = "Frames: 0"
                setTextColor(Color.CYAN)
                textSize = 14f
                setPadding(20, 60, 20, 20)
            }
            
            (findViewById<ViewGroup>(android.R.id.content)).apply {
                removeAllViews()
                addView(previewView)
                addView(overlayView)
                addView(statusText)
                addView(frameText)
                setBackgroundColor(Color.BLACK)
            }
            
            val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
            cameraProviderFuture.addListener({
                try {
                    statusText.text = "Initializing ONNX (this takes time)..."
                    
                    val handler = android.os.Handler(android.os.Looper.getMainLooper())
                    
                    handler.postDelayed({
                        statusText.text = "Loading ONNX model..."
                    }, 100)
                    
                    handler.postDelayed({
                        val analyzer = OnnxAnalyzer(this) { dets ->
                            runOnUiThread {
                                statusText.text = "Detections: ${dets.size}"
                                overlayView.updateDetections(dets)
                            }
                        }
                        
                        analyzer.setFrameCallback { count ->
                            runOnUiThread {
                                frameText.text = "Frames: $count"
                            }
                        }
                        
                        handler.postDelayed({
                            statusText.text = "Model loaded! Starting camera..."
                            
                            handler.postDelayed({
                                val cameraProvider = cameraProviderFuture.get()
                                val preview = Preview.Builder().build().also {
                                    it.setSurfaceProvider(previewView.surfaceProvider)
                                }
                                
                                val imageAnalysis = ImageAnalysis.Builder()
                                    .setTargetResolution(android.util.Size(640, 640))
                                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                    .build().also {
                                        it.setAnalyzer(Dispatchers.Default.asExecutor(), analyzer)
                                    }
                                
                                cameraProvider.unbindAll()
                                cameraProvider.bindToLifecycle(
                                    this,
                                    CameraSelector.DEFAULT_BACK_CAMERA,
                                    preview,
                                    imageAnalysis
                                )
                                
                                statusText.text = "Camera running!"
                                Toast.makeText(this, "SUCCESS!", Toast.LENGTH_LONG).show()
                            }, 300)
                        }, 500)
                    }, 500)
                    
                } catch (e: Exception) {
                    Log.e("MainActivity", "Camera error", e)
                    statusText.text = "ERROR: ${e.message}"
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }, ContextCompat.getMainExecutor(this))
            
        } catch (e: Exception) {
            Log.e("MainActivity", "Setup error", e)
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
    
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERM && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Permission granted!", Toast.LENGTH_SHORT).show()
            startCameraWithONNX()
        }
    }
}
