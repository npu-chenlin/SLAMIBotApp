package com.example.metacam

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import java.io.File
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import com.example.metacam.ui.theme.MetaCamTheme
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okio.source

// JavaScript接口类，用于在JavaScript和Android之间传递数据
class FirmwareJSInterface(private val context: Context) {
    
    // 用于存储当前上传任务的ID和WebView引用
    companion object {
        private var currentUploadTaskId = 0
        private var webViewRef: WebView? = null
        
        fun setWebViewRef(webView: WebView) {
            webViewRef = webView
        }
        
        // 向JavaScript推送上传进度
        fun updateUploadProgress(fileName: String, progress: Int, uploaded: Long, total: Long) {
            val script = """
                (function() {
                    console.log('上传进度: $fileName - $progress%');
                    if (window.onUploadProgress) {
                        window.onUploadProgress('$fileName', $progress, $uploaded, $total);
                    }
                })();
            """.trimIndent()
            
            webViewRef?.post {
                webViewRef?.evaluateJavascript(script, null)
            }
        }
        
        // 向JavaScript推送上传完成状态
        fun notifyUploadComplete(fileName: String, success: Boolean, errorMessage: String = "") {
            val script = """
                (function() {
                    console.log('上传${if (success) "成功" else "失败"}: $fileName ${if (!success) ", 错误: $errorMessage" else ""}');
                    if (window.onUploadComplete) {
                        window.onUploadComplete('$fileName', $success, '${errorMessage.replace("'", "\\'")}');
                    }
                })();
            """.trimIndent()
            
            webViewRef?.post {
                webViewRef?.evaluateJavascript(script, null)
            }
        }
    }
    
    @JavascriptInterface
    fun getDownloadedFirmwareFiles(): String {
        try {
            // 直接使用Context获取固件文件列表，而不是创建新的MainActivity实例
            val firmwareDir = File(context.getExternalFilesDir(null), "firmware")
            if (!firmwareDir.exists() || !firmwareDir.isDirectory) {
                Log.d("FirmwareJSInterface", "固件目录不存在")
                return "[]"
            }
            
            val files = firmwareDir.listFiles { file -> 
                file.isFile && file.name.endsWith(".ibot", ignoreCase = true)
            }?.toList() ?: emptyList()
            
            Log.d("FirmwareJSInterface", "找到${files.size}个固件文件")
            
            // 将文件信息转换为JSON格式
            val jsonArray = StringBuilder("[")
            files.forEachIndexed { index, file ->
                jsonArray.append("""
                    {
                        "name": "${file.name}",
                        "path": "${file.absolutePath}",
                        "size": ${file.length()},
                        "lastModified": ${file.lastModified()}
                    }
                """.trimIndent())
                
                if (index < files.size - 1) {
                    jsonArray.append(",")
                }
            }
            jsonArray.append("]")
            
            return jsonArray.toString()
        } catch (e: Exception) {
            Log.e("FirmwareJSInterface", "获取固件文件列表失败", e)
            return "[]"
        }
    }
    
    @JavascriptInterface
    fun readFileContent(filePath: String): String {
        try {
            Log.d("FirmwareJSInterface", "尝试读取文件: $filePath")
            
            val file = File(filePath)
            if (!file.exists()) {
                Log.e("FirmwareJSInterface", "文件不存在: $filePath")
                return ""
            }
            
            if (!file.isFile) {
                Log.e("FirmwareJSInterface", "路径不是文件: $filePath")
                return ""
            }
            
            if (!file.canRead()) {
                Log.e("FirmwareJSInterface", "文件不可读: $filePath")
                return ""
            }
            
            Log.d("FirmwareJSInterface", "文件存在且可读，大小: ${file.length()} 字节")
            
            // 读取文件内容（这里只读取前8KB作为示例）
            val maxSize = 8 * 1024 // 8KB
            val buffer = ByteArray(maxSize.coerceAtMost(file.length().toInt()))
            
            file.inputStream().use { input ->
                val bytesRead = input.read(buffer)
                Log.d("FirmwareJSInterface", "读取了 $bytesRead 字节")
                
                if (bytesRead > 0) {
                    // 将二进制数据转换为Base64编码的字符串
                    val base64String = android.util.Base64.encodeToString(
                        buffer.copyOf(bytesRead), 
                        android.util.Base64.DEFAULT
                    )
                    Log.d("FirmwareJSInterface", "Base64编码后长度: ${base64String.length}")
                    return base64String
                } else {
                    Log.w("FirmwareJSInterface", "文件为空")
                    return ""
                }
            }
        } catch (e: Exception) {
            Log.e("FirmwareJSInterface", "读取文件失败: ${e.message}", e)
            return ""
        }
    }
    
    @JavascriptInterface
    fun uploadFile(filePath: String, serverUrl: String): Boolean {
        try {
            Log.d("FirmwareJSInterface", "开始上传文件: $filePath 到 $serverUrl")
            
            val file = File(filePath)
            if (!file.exists() || !file.isFile || !file.canRead()) {
                Log.e("FirmwareJSInterface", "文件不存在或不可读: $filePath")
                notifyUploadComplete(file.name, false, "文件不存在或不可读")
                return false
            }
            
            // 创建一个唯一的上传任务ID
            val taskId = System.currentTimeMillis()
            
            // 在后台线程中执行上传操作
            Thread {
                try {
                    // 通知JavaScript上传开始
                    val script = """
                        (function() {
                            console.log('开始上传: ${file.name}');
                            if (window.onUploadStart) {
                                window.onUploadStart('${file.name}', ${file.length()});
                            }
                        })();
                    """.trimIndent()
                    
                    webViewRef?.post {
                        webViewRef?.evaluateJavascript(script, null)
                    }
                    
                    // 创建OkHttpClient
                    val client = okhttp3.OkHttpClient.Builder()
                        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                        .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                        .build()
                    
                    // 创建RequestBody，用于监控上传进度
                    val fileRequestBody = object : okhttp3.RequestBody() {
                        override fun contentType(): okhttp3.MediaType? {
                            return "application/octet-stream".toMediaTypeOrNull()
                        }
                        
                        override fun contentLength(): Long {
                            return file.length()
                        }
                        
                        override fun writeTo(sink: okio.BufferedSink) {
                            val source = file.source()
                            val buffer = okio.Buffer()
                            var totalBytesRead: Long = 0
                            
                            var bytesRead: Long
                            while (source.read(buffer, 8192).also { bytesRead = it } != -1L) {
                                sink.write(buffer, bytesRead)
                                totalBytesRead += bytesRead
                                
                                // 计算进度百分比
                                val progress = ((totalBytesRead * 100) / file.length()).toInt()
                                
                                // 更新上传进度
                                updateUploadProgress(file.name, progress, totalBytesRead, file.length())
                                
                                // 模拟网络延迟，使进度更新更平滑
                                Thread.sleep(50)
                            }
                            source.close()
                        }
                    }
                    
                    // 创建MultipartBody
                    val requestBody = okhttp3.MultipartBody.Builder()
                        .setType(okhttp3.MultipartBody.FORM)
                        .addFormDataPart("file", file.name, fileRequestBody)
                        .addFormDataPart("fileName", file.name)
                        .addFormDataPart("fileSize", file.length().toString())
                        .build()
                    
                    // 创建请求
                    val request = okhttp3.Request.Builder()
                        .url(serverUrl)
                        .post(requestBody)
                        .build()
                    
                    // 执行请求
                    try {
                        val response = client.newCall(request).execute()
                        if (response.isSuccessful) {
                            Log.d("FirmwareJSInterface", "文件上传成功: ${file.name}")
                            notifyUploadComplete(file.name, true)
                        } else {
                            Log.e("FirmwareJSInterface", "文件上传失败: ${response.code}, ${response.message}")
                            notifyUploadComplete(file.name, false, "服务器返回错误: ${response.code}")
                        }
                    } catch (e: Exception) {
                        Log.e("FirmwareJSInterface", "上传请求失败", e)
                        notifyUploadComplete(file.name, false, "网络错误: ${e.message}")
                    }
                } catch (e: Exception) {
                    Log.e("FirmwareJSInterface", "上传文件时出错", e)
                    notifyUploadComplete(file.name, false, "上传错误: ${e.message}")
                }
            }.start()
            
            return true
        } catch (e: Exception) {
            Log.e("FirmwareJSInterface", "启动上传任务失败", e)
            return false
        }
    }
    
    private fun notifyUploadComplete(fileName: String, success: Boolean, errorMessage: String = "") {
        FirmwareJSInterface.notifyUploadComplete(fileName, success, errorMessage)
    }
    
    private fun updateUploadProgress(fileName: String, progress: Int, uploaded: Long, total: Long) {
        FirmwareJSInterface.updateUploadProgress(fileName, progress, uploaded, total)
    }
}

class MainActivity : ComponentActivity() {
    
    // 存储WebView引用，用于在下载进度更新时调用JavaScript
    companion object {
        var webViewRef: WebView? = null
    }
    
    // 存储权限请求
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Log.d("Permission", "存储权限已授予")
        } else {
            Log.e("Permission", "存储权限被拒绝，无法保存文件到外部存储")
        }
    }
    
    // 下载完成的广播接收器
    private var downloadCompleteReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (DownloadManager.ACTION_DOWNLOAD_COMPLETE == action) {
                val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (downloadId != -1L) {
                    // 查询下载状态
                    val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    val query = DownloadManager.Query().setFilterById(downloadId)
                    val cursor = downloadManager.query(query)
                    
                    if (cursor.moveToFirst()) {
                        val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                        val status = cursor.getInt(statusIndex)
                        
                        val fileNameIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE)
                        val fileName = if (fileNameIndex != -1) cursor.getString(fileNameIndex) else "未知文件"
                        
                        when (status) {
                            DownloadManager.STATUS_SUCCESSFUL -> {
                                // 下载成功
                                val localUriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
                                val localUri = if (localUriIndex != -1) cursor.getString(localUriIndex) else ""
                                
                                // 删除旧版本的.ibot文件（除了刚下载的文件）
                                try {
                                    val firmwareDir = File(getExternalFilesDir(null), "firmware")
                                    if (firmwareDir.exists() && firmwareDir.isDirectory) {
                                        // 从 localUri 解析实际文件名，比 TITLE 更可靠
                                        val actualFileName = Uri.parse(localUri).lastPathSegment ?: fileName
                                        val ibotFiles = firmwareDir.listFiles { file -> 
                                            file.isFile && file.name.endsWith(".ibot", ignoreCase = true) && file.name != actualFileName
                                        }
                                        
                                        ibotFiles?.forEach { oldFile ->
                                            if (oldFile.delete()) {
                                                Log.d("DownloadManager", "已删除旧版本文件: ${oldFile.name}")
                                            } else {
                                                Log.e("DownloadManager", "删除旧版本文件失败: ${oldFile.name}")
                                            }
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.e("DownloadManager", "删除旧版本文件时出错", e)
                                }
                                
                                // 通知JavaScript下载完成
                                val script = """
                                    (function() {
                                        console.log('下载完成: $fileName');
                                        if (window.onDownloadComplete) {
                                            window.onDownloadComplete('$fileName', '$localUri', true, );
                                        }
                                    })();
                                """.trimIndent()
                                
                                webViewRef?.evaluateJavascript(script, null)
                                Log.d("DownloadManager", "下载完成: $fileName, URI: $localUri")
                            }
                            DownloadManager.STATUS_FAILED -> {
                                // 下载失败，保留旧版本文件
                                val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
                                val reason = if (reasonIndex != -1) cursor.getInt(reasonIndex) else -1
                                
                                // 通知JavaScript下载失败
                                val script = """
                                    (function() {
                                        console.log('下载失败: $fileName, 原因: $reason');
                                        if (window.onDownloadComplete) {
                                            window.onDownloadComplete('$fileName', '', false, '下载失败，错误码: $reason');
                                        }
                                    })();
                                """.trimIndent()
                                
                                webViewRef?.evaluateJavascript(script, null)
                                Log.e("DownloadManager", "下载失败: $fileName, 原因: $reason")
                            }
                        }
                    }
                    cursor.close()
                }
            }
        }
    }
    
    // 下载进度更新的Handler
    val handler = Handler(Looper.getMainLooper())
    public val progressRunnable = object : Runnable {
        override fun run() {
            updateDownloadProgress()
            handler.postDelayed(this, 500) // 每500毫秒更新一次进度
        }
    }
    
    // 存储当前下载ID
    var currentDownloadId: Long = -1
    
    // 获取已下载的固件文件列表
    fun getDownloadedFirmwareFiles(context: Context): List<File> {
        val firmwareDir = File(context.getExternalFilesDir(null), "firmware")
        if (!firmwareDir.exists() || !firmwareDir.isDirectory) {
            return emptyList()
        }
        
        return firmwareDir.listFiles { file -> 
            file.isFile && file.name.endsWith(".ibot", ignoreCase = true)
        }?.toList() ?: emptyList()
    }
    
    // 更新下载进度的方法
    private fun updateDownloadProgress() {
        if (currentDownloadId == -1L) return
        
        try {
            val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val query = DownloadManager.Query().setFilterById(currentDownloadId)
            val cursor = downloadManager.query(query)
            
            if (cursor.moveToFirst()) {
                val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                val status = if (statusIndex != -1) cursor.getInt(statusIndex) else DownloadManager.STATUS_RUNNING
                
                // 如果下载已完成或失败，停止进度更新
                if (status == DownloadManager.STATUS_SUCCESSFUL || status == DownloadManager.STATUS_FAILED) {
                    handler.removeCallbacks(progressRunnable)
                    cursor.close()
                    return
                }
                
                // 获取已下载字节数和总字节数
                val bytesDownloadedIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
                val bytesDownloaded = if (bytesDownloadedIndex != -1) cursor.getLong(bytesDownloadedIndex) else 0
                
                val bytesTotalIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                val bytesTotal = if (bytesTotalIndex != -1) cursor.getLong(bytesTotalIndex) else 0
                
                // 获取文件名
                val fileNameIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE)
                val fileName = if (fileNameIndex != -1) cursor.getString(fileNameIndex) else "未知文件"
                
                // 计算进度百分比
                val progress = if (bytesTotal > 0) (bytesDownloaded * 100 / bytesTotal).toInt() else 0
                
                // 通知JavaScript更新进度
                val script = """
                    (function() {
                        console.log('下载进度: $fileName - $progress%');
                        if (window.onDownloadProgress) {
                            window.onDownloadProgress('$fileName', $progress, $bytesDownloaded, $bytesTotal);
                        }
                    })();
                """.trimIndent()
                
                webViewRef?.evaluateJavascript(script, null)
                Log.d("DownloadManager", "下载进度: $fileName - $progress% ($bytesDownloaded/$bytesTotal)")
            }
            cursor.close()
        } catch (e: Exception) {
            Log.e("DownloadManager", "更新下载进度失败", e)
            handler.removeCallbacks(progressRunnable)
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 检查并请求存储权限
        checkAndRequestStoragePermission()
        
        // 注册下载完成的广播接收器
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13及以上版本需要指定RECEIVER_EXPORTED标志
            registerReceiver(
                downloadCompleteReceiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_EXPORTED
            )
        } else {
            registerReceiver(
                downloadCompleteReceiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            )
        }
        
        // Configurar pantalla completa
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        )
        
        // 保持屏幕常亮
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        enableEdgeToEdge()
        setContent {
            MetaCamTheme {
                WebViewContent()
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        
        // 取消注册广播接收器
        try {
            unregisterReceiver(downloadCompleteReceiver)
        } catch (e: Exception) {
            Log.e("MainActivity", "取消注册广播接收器失败", e)
        }
        
        // 移除Handler回调
        handler.removeCallbacks(progressRunnable)
        
        // 清除WebView引用
        webViewRef = null
    }
    
    // 检查并请求存储权限
    private fun checkAndRequestStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            when {
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED -> {
                    Log.d("Permission", "已有存储权限")
                }
                else -> {
                    // 使用ActivityResultContracts API请求权限
                    requestPermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    Log.d("Permission", "请求存储权限")
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewContent() {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                // 首先添加JavaScript接口
                val firmwareJSInterface = FirmwareJSInterface(context)
                addJavascriptInterface(firmwareJSInterface, "Android")
                
                // 设置WebView引用，用于更新上传进度
                FirmwareJSInterface.setWebViewRef(this)
                
                // 创建 WebViewAssetLoader
                val assetLoader = WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                    .build()

                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: WebResourceRequest
                    ): WebResourceResponse? {
                        val url = request.url.toString()
                        Log.d("WebView", "Loading resource: $url")

                        return assetLoader.shouldInterceptRequest(request.url) ?: run {
                            // 如果是旧的 file:///assets/ 格式的URL，转换为新格式
                            if (url.startsWith("file:///assets/")) {
                                val assetPath = url.replace("file:///assets/", "")
                                Log.d("WebView", "Converting old-style URL to new format: $assetPath")
                                // 尝试重定向到新的URL格式
                                val newUrl = "https://appassets.androidplatform.net/assets/$assetPath"
                                return assetLoader.shouldInterceptRequest(android.net.Uri.parse(newUrl))
                            }
                            super.shouldInterceptRequest(view, request)
                        }
                    }

                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest
                    ): Boolean {
                        view?.loadUrl(request.url.toString())
                        return true
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        val script = """
                            // 设置viewport
                            var viewport = document.querySelector('meta[name="viewport"]');
                            if (!viewport) {
                                viewport = document.createElement('meta');
                                viewport.name = 'viewport';
                                document.head.appendChild(viewport);
                            }
                            viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                            
                            // 设置body样式
                            document.body.style.margin = '0';
                            document.body.style.padding = '0';
                            document.body.style.minHeight = '100vh';
                            document.body.style.width = '100%';
                            document.body.style.height = '100%';
                            
                            // 监听resize事件
                            window.addEventListener('resize', function() {
                                document.body.style.minHeight = window.innerHeight + 'px';
                            });
                            
                            // 立即触发一次高度设置
                            document.body.style.minHeight = window.innerHeight + 'px';
                            
                            // 上传相关的JavaScript函数（会被前端覆盖，作为后备）
                            window.onUploadStart = function(fileName, totalSize) {
                                console.log('上传开始:', fileName, '总大小:', totalSize);
                                
                                // 创建或获取上传状态显示区域
                                var uploadStatusDiv = document.getElementById('uploadStatus');
                                if (!uploadStatusDiv) {
                                    uploadStatusDiv = document.createElement('div');
                                    uploadStatusDiv.id = 'uploadStatus';
                                    uploadStatusDiv.style.position = 'fixed';
                                    uploadStatusDiv.style.bottom = '20px';
                                    uploadStatusDiv.style.left = '20px';
                                    uploadStatusDiv.style.right = '20px';
                                    uploadStatusDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
                                    uploadStatusDiv.style.color = 'white';
                                    uploadStatusDiv.style.padding = '10px';
                                    uploadStatusDiv.style.borderRadius = '5px';
                                    uploadStatusDiv.style.zIndex = '1000';
                                    document.body.appendChild(uploadStatusDiv);
                                }
                                
                                // 显示上传状态
                                uploadStatusDiv.innerHTML = '<h3>正在上传固件文件</h3>' +
                                    '<div id="uploadProgress">' +
                                    '<div id="progress-container">' +
                                    '<p>' + fileName + ': <span id="upload-progress-text">0%</span></p>' +
                                    '<div id="upload-progress-bar" style="height: 20px; background-color: #444; border-radius: 10px; overflow: hidden;">' +
                                    '<div id="upload-progress-fill" style="height: 100%; width: 0%; background-color: #4CAF50; transition: width 0.3s;"></div>' +
                                    '</div>' +
                                    '</div>' +
                                    '</div>';
                            };
                            
                            // 上传进度更新时调用
                            window.onUploadProgress = function(fileName, progress, bytesUploaded, bytesTotal) {
                                console.log('上传进度:', fileName, progress + '%', bytesUploaded + '/' + bytesTotal);
                                
                                // 更新进度文本
                                var progressText = document.getElementById('upload-progress-text');
                                if (progressText) {
                                    progressText.textContent = progress + '%';
                                }
                                
                                // 更新进度条
                                var progressFill = document.getElementById('upload-progress-fill');
                                if (progressFill) {
                                    progressFill.style.width = progress + '%';
                                }
                                
                                // 如果上传状态区域不存在，创建它
                                if (!document.getElementById('uploadStatus')) {
                                    window.onUploadStart(fileName, bytesTotal);
                                }
                            };
                            
                            // 上传完成时调用
                            window.onUploadComplete = function(fileName, success, errorMessage) {
                                console.log('上传完成:', fileName, success ? '成功' : '失败', errorMessage || '');
                                
                                // 更新进度文本和进度条
                                var progressText = document.getElementById('upload-progress-text');
                                var progressFill = document.getElementById('upload-progress-fill');
                                
                                if (success) {
                                    if (progressText) progressText.textContent = '上传完成!';
                                    if (progressFill) {
                                        progressFill.style.width = '100%';
                                        progressFill.style.backgroundColor = '#4CAF50';
                                    }
                                    
                                    // 3秒后隐藏上传状态
                                    setTimeout(function() {
                                        var uploadStatus = document.getElementById('uploadStatus');
                                        if (uploadStatus) {
                                            uploadStatus.style.opacity = '0';
                                            uploadStatus.style.transition = 'opacity 0.5s';
                                            setTimeout(function() {
                                                if (uploadStatus.parentNode) {
                                                    uploadStatus.parentNode.removeChild(uploadStatus);
                                                }
                                            }, 500);
                                        }
                                    }, 3000);
                                    
                                    // 显示上传成功提示
                                    setTimeout(function() {
                                        alert('固件上传成功！设备将开始更新固件。');
                                    }, 1000);
                                } else {
                                    if (progressText) {
                                        progressText.textContent = '上传失败: ' + (errorMessage || '未知错误');
                                        progressText.style.color = 'red';
                                    }
                                    if (progressFill) {
                                        progressFill.style.backgroundColor = '#F44336';
                                    }
                                }
                            };
                            
                        """
                        view?.evaluateJavascript(script, null)
                    }

                    override fun onReceivedError(
                        view: WebView,
                        request: WebResourceRequest,
                        error: WebResourceError
                    ) {
                        super.onReceivedError(view, request, error)
                        Log.e("WebView", "Error loading: ${request.url}, code: ${error.errorCode}")
                    }
                }

                // WebView基本设置
                settings.apply {
                    // 启用JavaScript
                    javaScriptEnabled = true
                    
                    // 启用DOM存储
                    domStorageEnabled = true

                    // 视口优化设置
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    layoutAlgorithm = android.webkit.WebSettings.LayoutAlgorithm.NORMAL

                    allowContentAccess = true

                    allowFileAccess = true

                    allowFileAccessFromFileURLs = true

                    allowUniversalAccessFromFileURLs = true
                }
                
                // Allow WebView to access files
                settings.allowFileAccess = true
                settings.allowContentAccess = true

                // Allow WebView to access content from file:// URLs
                settings.allowFileAccessFromFileURLs = true;
                settings.allowUniversalAccessFromFileURLs = true;
                settings.setAllowFileAccess(true); // 允许访问本地文件
                settings.setAllowUniversalAccessFromFileURLs(true); // 允许跨域请求

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                    settings.allowFileAccessFromFileURLs = true
                    settings.allowUniversalAccessFromFileURLs = true
                }

                // 启用 WebView 调试（Android 4.4+）
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                    WebView.setWebContentsDebuggingEnabled(true)
                }
                
                // Allow mixed content (http resources in https pages)
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

                // Enable Web Workers
                settings.javaScriptCanOpenWindowsAutomatically = true
                settings.mediaPlaybackRequiresUserGesture = false

                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                        Log.d("WorkerDebug", "[${consoleMessage.lineNumber()}] ${consoleMessage.message()}")
                        return true
                    }
                }
                // 设置安全配置
                settings.apply {
                    // 允许加载HTTPS内容
                    mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                }

                // 保存WebView引用
                MainActivity.webViewRef = this
                
                // 设置下载监听器，根据文件类型选择下载方式
                setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
                    // 获取文件名
                    val fileName = url.substring(url.lastIndexOf('/') + 1)
                    
                    // 检查文件名是否以.ibot结尾
                    if (fileName.endsWith(".ibot", ignoreCase = true)) {
                        try {
                            // 获取DownloadManager服务
                            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                            
                            // 创建下载请求
                            val request = DownloadManager.Request(Uri.parse(url))
                            
                            // 设置下载文件的MIME类型
                            request.setMimeType(mimetype)
                            
                            // 设置通知栏可见
                            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                            
                            // 创建应用程序目录下的firmware子目录
                            val firmwareDir = File(context.getExternalFilesDir(null), "firmware")
                            if (!firmwareDir.exists()) {
                                firmwareDir.mkdirs()
                            }
                            
                            // 获取当前已有的.ibot文件列表（用于在下载完成广播接收器中处理）
                            val existingIbotFiles = firmwareDir.listFiles { file -> 
                                file.isFile && file.name.endsWith(".ibot", ignoreCase = true)
                            }
                            
                            if (existingIbotFiles != null && existingIbotFiles.isNotEmpty()) {
                                Log.d("DownloadManager", "当前已有${existingIbotFiles.size}个.ibot文件")
                                for (file in existingIbotFiles) {
                                    Log.d("DownloadManager", "已有文件: ${file.name}")
                                }
                            } else {
                                Log.d("DownloadManager", "当前没有.ibot文件")
                            }
                            
                            // 创建目标文件
                            val destinationFile = File(firmwareDir, fileName)
                            
                            // 设置下载文件的目标路径（保存到应用程序目录下的firmware目录）
                            request.setDestinationUri(Uri.fromFile(destinationFile))
                            
                            // 设置下载标题和描述
                            request.setTitle(fileName)
                            request.setDescription("SLAMIBOT 下载中心: $fileName")
                            
                            // 允许通过移动网络下载
                            request.setAllowedOverMetered(true)
                            
                            // 允许在漫游时下载
                            request.setAllowedOverRoaming(true)
                            
                            // 开始下载，获取下载ID
                            val downloadId = downloadManager.enqueue(request)
                            
                            // 保存当前下载ID并启动进度更新
                            if (context is MainActivity) {
                                context.currentDownloadId = downloadId
                                context.handler.post(context.progressRunnable)
                                
                                // 通知JavaScript下载已开始
                                val script = """
                                    (function() {
                                        console.log('开始下载: $fileName');
                                        if (window.onDownloadStart) {
                                            window.onDownloadStart('$fileName', $contentLength);
                                        }
                                    })();
                                """.trimIndent()
                                evaluateJavascript(script, null)
                            }
                            
                            Log.d("DownloadManager", "开始下载固件，下载ID: $downloadId")
                            Log.d("DownloadManager", "固件将保存到: ${destinationFile.absolutePath}")
                        } catch (e: Exception) {
                            Log.e("DownloadManager", "下载固件失败", e)
                            
                            // 通知JavaScript下载失败
                            val script = """
                                (function() {
                                    console.log('下载失败: $fileName, 错误: ${e.message}');
                                    if (window.onDownloadComplete) {
                                        window.onDownloadComplete('$fileName', '', false, '${e.message}');
                                    }
                                })();
                            """.trimIndent()
                            evaluateJavascript(script, null)
                            
                            // 如果DownloadManager失败，回退到浏览器下载
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            context.startActivity(intent)
                        }
                    } else {
                        // 非.ibot文件，使用浏览器下载
                        Log.d("DownloadManager", "非固件文件，使用浏览器下载: $fileName")
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        context.startActivity(intent)
                    }
                }
                
                // 使用新的HTTPS格式加载初始页面
                loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
            }
        }
    )
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    Text(
        text = "Hello $name!",
        modifier = modifier
    )
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    MetaCamTheme {
        Greeting("Android")
    }
}