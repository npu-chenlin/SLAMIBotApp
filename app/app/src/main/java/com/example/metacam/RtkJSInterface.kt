package com.example.metacam

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.json.JSONObject

/**
 * RTK JavaScript接口
 * 供WebView中的JavaScript调用
 */
class RtkJSInterface(private val context: Context) {
    
    companion object {
        private const val TAG = "RtkJSInterface"
        private var webViewRef: android.webkit.WebView? = null
        
        fun setWebViewRef(webView: android.webkit.WebView) {
            webViewRef = webView
        }
    }
    
    // 广播接收器
    private var broadcastReceiver: BroadcastReceiver? = null
    
    init {
        // 注册广播接收器
        registerBroadcastReceiver()
    }
    
    /**
     * 注册广播接收器
     */
    private fun registerBroadcastReceiver() {
        broadcastReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    RtkService.ACTION_STATUS_UPDATE -> {
                        val success = intent.getBooleanExtra("success", false)
                        val message = intent.getStringExtra("message") ?: ""
                        notifyStatusChange(success, message)
                    }
                    
                    RtkService.ACTION_RTCM_DATA -> {
                        val data = intent.getStringExtra("data") ?: ""
                        notifyRtcmData(data)
                    }
                    
                    RtkService.ACTION_STATS_UPDATE -> {
                        val statsJson = intent.getStringExtra("stats") ?: "{}"
                        notifyStatsUpdate(statsJson)
                    }
                }
            }
        }
        
        val filter = IntentFilter()
        filter.addAction(RtkService.ACTION_STATUS_UPDATE)
        filter.addAction(RtkService.ACTION_RTCM_DATA)
        filter.addAction(RtkService.ACTION_STATS_UPDATE)
        
        LocalBroadcastManager.getInstance(context).registerReceiver(broadcastReceiver!!, filter)
        
        Log.i(TAG, "广播接收器已注册")
    }
    
    /**
     * 启动RTK (JS调用)
     * @param configJson JSON配置字符串
     * @return 是否成功启动
     */
    @JavascriptInterface
    fun startRtk(configJson: String): Boolean {
        Log.i(TAG, "收到RTK启动请求")
        
        // 获取服务实例
        val service = RtkService.getInstance()
        if (service == null) {
            Log.e(TAG, "RTK服务未运行")
            notifyStatusChange(false, "RTK服务未运行")
            return false
        }
        
        return service.startRtk(configJson)
    }
    
    /**
     * 停止RTK (JS调用)
     */
    @JavascriptInterface
    fun stopRtk() {
        Log.i(TAG, "收到RTK停止请求")
        
        val service = RtkService.getInstance()
        service?.stopRtk()
    }
    
    /**
     * 获取连接状态 (JS调用)
     * @return 是否已连接
     */
    @JavascriptInterface
    fun isConnected(): Boolean {
        val service = RtkService.getInstance()
        return service?.isConnected() ?: false
    }
    
    /**
     * 获取rosbridge连接状态 (JS调用)
     * @return rosbridge是否已连接
     */
    @JavascriptInterface
    fun isRosbridgeConnected(): Boolean {
        val service = RtkService.getInstance()
        return service?.isRosbridgeConnected() ?: false
    }
    
    /**
     * 获取统计信息 (JS调用)
     * @return JSON字符串
     */
    @JavascriptInterface
    fun getStats(): String {
        val service = RtkService.getInstance()
        val stats = service?.getStats()
        
        return if (stats != null) {
            JSONObject(stats).toString()
        } else {
            "{}"
        }
    }
    
    /**
     * 通知状态变化 (调用JS回调)
     */
    private fun notifyStatusChange(success: Boolean, message: String) {
        val statusJson = JSONObject().apply {
            put("success", success)
            put("message", message)
        }.toString()
        
        val script = """
            (function() {
                if (window.onRtkStatus) {
                    window.onRtkStatus($statusJson);
                }
            })();
        """.trimIndent()
        
        webViewRef?.post {
            webViewRef?.evaluateJavascript(script, null)
        }
    }
    
    /**
     * 通知RTCM数据 (调用JS回调)
     */
    private fun notifyRtcmData(base64Data: String) {
        val script = """
            (function() {
                if (window.onRtcmData) {
                    window.onRtcmData('$base64Data');
                }
            })();
        """.trimIndent()
        
        webViewRef?.post {
            webViewRef?.evaluateJavascript(script, null)
        }
    }
    
    /**
     * 通知统计信息更新 (调用JS回调)
     */
    private fun notifyStatsUpdate(statsJson: String) {
        val script = """
            (function() {
                if (window.onRtkStats) {
                    window.onRtkStats($statsJson);
                }
            })();
        """.trimIndent()
        
        webViewRef?.post {
            webViewRef?.evaluateJavascript(script, null)
        }
    }
    
    /**
     * 清理资源
     */
    fun cleanup() {
        if (broadcastReceiver != null) {
            LocalBroadcastManager.getInstance(context).unregisterReceiver(broadcastReceiver!!)
            broadcastReceiver = null
            Log.i(TAG, "广播接收器已注销")
        }
    }
}