package com.example.metacam

import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Binder
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.json.JSONObject
import java.util.Timer
import java.util.TimerTask

/**
 * RTK后台服务
 * 负责NTRIP连接、RTCM数据接收、WebSocket转发
 */
class RtkService : Service() {
    
    private var ntripClient: NtripClient? = null
    private var ggaTimer: Timer? = null
    private var rtcmThread: Thread? = null
    
    // WebSocket连接 (用于转发数据到ROS)
    private var rosbridgeClient: okhttp3.WebSocket? = null
    private var rosbridgeConnected = false
    private val okHttpClient = okhttp3.OkHttpClient.Builder()
        .pingInterval(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()
    
    // GGA数据 (从ROS接收)
    private var ggaData: String? = null
    
    // 配置
    private var config: NtripConfig? = null
    
    // Binder
    private val binder = RtkBinder()
    
    // Handler for callbacks
    private val handler = Handler(Looper.getMainLooper())
    
    companion object {
        private const val TAG = "RtkService"
        const val ACTION_STATUS_UPDATE = "rtk_status_update"
        const val ACTION_RTCM_DATA = "rtk_rtcm_data"
        const val ACTION_STATS_UPDATE = "rtk_stats_update"
        
        // 单例引用 (用于WebView回调)
        private var instance: RtkService? = null
        
        fun getInstance(): RtkService? = instance
    }
    
    inner class RtkBinder : Binder() {
        fun getService(): RtkService = this@RtkService
    }
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "RTK服务已创建")
    }
    
    override fun onBind(intent: Intent?): IBinder {
        return binder
    }
    
    override fun onDestroy() {
        super.onDestroy()
        stopRtk()
        instance = null
        Log.i(TAG, "RTK服务已销毁")
    }
    
    /**
     * 启动RTK
     * @param configJson JSON配置字符串
     * @return 是否成功启动
     * 
     * 网络选择逻辑：
     * - WiFi连接且可以上网 → 使用WiFi进行NTRIP验证
     * - WiFi不连接或不可以上网 → 使用移动网络进行NTRIP验证
     */
    fun startRtk(configJson: String): Boolean {
        try {
            val json = JSONObject(configJson)
            
            // 自动检测网络状态，决定使用哪个网络
            val useMobileNetwork = shouldUseMobileNetwork()
            
            config = NtripConfig(
                host = json.optString("host"),
                port = json.optInt("port", 2101),
                username = json.optString("username"),
                password = json.optString("password"),
                mountpoint = json.optString("mountpoint"),
                rosbridgeUrl = json.optString("rosbridgeUrl", "ws://192.168.2.176:9090"),
                ggaLat = json.optDouble("ggaLat", 39.91375),
                ggaLon = json.optDouble("ggaLon", 116.39173),
                ggaAlt = json.optDouble("ggaAlt", 50.0),
                useMobileNetwork = useMobileNetwork
            )
            
            val networkType = if (useMobileNetwork) "移动网络" else "WiFi"
            Log.i(TAG, "启动RTK: ${config?.host}:${config?.port}/${config?.mountpoint} (使用: $networkType)")
            
            // 1. 连接rosbridge (用于转发数据)
            connectRosbridge(config?.rosbridgeUrl ?: "ws://192.168.2.176:9090")
            
            // 2. 连接NTRIP
            return connectNtrip()
            
        } catch (e: Exception) {
            Log.e(TAG, "解析配置失败: ${e.message}")
            broadcastStatus(false, "配置错误: ${e.message}")
            return false
        }
    }
    
    /**
     * 检测是否应该使用移动网络
     * @return true: 使用移动网络, false: 使用WiFi
     */
    private fun shouldUseMobileNetwork(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        // 检查WiFi是否可以上网
        for (network in connectivityManager.allNetworks) {
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            if (capabilities != null && 
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                // WiFi已连接且可以上网，使用WiFi
                Log.i(TAG, "WiFi可上网，使用WiFi进行NTRIP连接")
                return false
            }
        }
        
        // WiFi不可用，检查移动网络
        for (network in connectivityManager.allNetworks) {
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            if (capabilities != null && 
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                // 移动网络可用，使用移动网络
                Log.i(TAG, "WiFi不可用，移动网络可上网，使用移动网络进行NTRIP连接")
                return true
            }
        }
        
        // 都不可用，默认尝试移动网络
        Log.w(TAG, "无可用的上网网络，默认尝试移动网络")
        return true
    }
    
    /**
     * 连接rosbridge WebSocket
     */
    private fun connectRosbridge(url: String) {
        Log.i(TAG, "连接rosbridge: $url")
        
        val request = okhttp3.Request.Builder().url(url).build()
        
        rosbridgeClient = okHttpClient.newWebSocket(request, object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                Log.i(TAG, "✓ rosbridge连接成功")
                rosbridgeConnected = true
                
                // 广告RTCM话题 (必须先广告才能发布)
                advertiseTopic("/rtcm/data", "std_msgs/UInt8MultiArray")
                
                // 订阅GGA话题 (从ROS接收GPS位置)
                subscribeTopic("/rtk/gga", "std_msgs/String")
                
                // 订阅RTK状态话题
                // subscribeTopic("/rtk/status", "std_msgs/String")
                
                broadcastStatus(true, "rosbridge连接成功")
            }
            
            override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                handleRosMessage(text)
            }
            
            override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) {
                Log.e(TAG, "rosbridge连接失败: ${t.message}")
                rosbridgeConnected = false
                broadcastStatus(false, "rosbridge连接失败: ${t.message}")
            }
            
            override fun onClosed(webSocket: okhttp3.WebSocket, code: Int, reason: String) {
                Log.i(TAG, "rosbridge连接关闭: $reason")
                rosbridgeConnected = false
            }
        })
    }
    
    /**
     * 订阅ROS话题
     */
    private fun subscribeTopic(topic: String, type: String) {
        val subscribeMsg = JSONObject().apply {
            put("op", "subscribe")
            put("topic", topic)
            put("type", type)
        }.toString()
        
        rosbridgeClient?.send(subscribeMsg)
        Log.d(TAG, "订阅话题: $topic")
    }
    
    /**
     * 取消订阅ROS话题
     */
    private fun unsubscribeTopic(topic: String) {
        val unsubscribeMsg = JSONObject().apply {
            put("op", "unsubscribe")
            put("topic", topic)
        }.toString()
        
        rosbridgeClient?.send(unsubscribeMsg)
        Log.d(TAG, "取消订阅话题: $topic")
    }
    
    /**
     * 广告ROS话题
     */
    private fun advertiseTopic(topic: String, type: String) {
        val advertiseMsg = JSONObject().apply {
            put("op", "advertise")
            put("topic", topic)
            put("type", type)
        }.toString()
        
        rosbridgeClient?.send(advertiseMsg)
        Log.d(TAG, "广告话题: $topic")
    }
    
    /**
     * 处理ROS消息
     */
    private fun handleRosMessage(jsonStr: String) {
        try {
            val json = JSONObject(jsonStr)
            val op = json.optString("op")
            val topic = json.optString("topic")
            
            if (op == "publish") {
                when (topic) {
                    "/rtk/gga" -> {
                        // 接收GGA数据,用于上报到NTRIP
                        val msg = json.optJSONObject("msg")
                        ggaData = parseGgaData(msg)
                        Log.d(TAG, "收到GGA: ${ggaData?.take(30)}...")
                    }
                    "/rtk/status" -> {
                        // 接收RTK状态,广播给UI
                        val msg = json.optJSONObject("msg")
                        val status = msg?.optString("data")
                        broadcastStatus(true, status ?: "")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "解析ROS消息失败: ${e.message}")
        }
    }
    
    /**
     * 解析GGA数据,兼容String和ByteMultiArray两种格式
     */
    private fun parseGgaData(msg: JSONObject?): String? {
        if (msg == null) return null
        
        val data = msg.opt("data") ?: return null
        
        return when (data) {
            is String -> {
                // std_msgs/String 格式
                Log.d(TAG, "GGA格式: String")
                data
            }
            is org.json.JSONArray -> {
                // std_msgs/ByteMultiArray 格式
                Log.d(TAG, "GGA格式: ByteMultiArray (${data.length()} bytes)")
                try {
                    val bytes = ByteArray(data.length())
                    for (i in 0 until data.length()) {
                        bytes[i] = (data.getInt(i) and 0xFF).toByte()
                    }
                    String(bytes, Charsets.UTF_8)
                } catch (e: Exception) {
                    Log.e(TAG, "ByteMultiArray解码失败: ${e.message}")
                    null
                }
            }
            else -> {
                Log.w(TAG, "未知GGA数据类型: ${data::class.simpleName}")
                null
            }
        }
    }
    
    /**
     * 连接NTRIP服务器
     */
    private fun connectNtrip(): Boolean {
        val cfg = config ?: return false
        
        // 断开现有连接
        ntripClient?.disconnect()
        
        // 创建新连接 (传递 context 和移动网络选项)
        ntripClient = NtripClient(
            host = cfg.host,
            port = cfg.port,
            username = cfg.username,
            password = cfg.password,
            mountpoint = cfg.mountpoint,
            context = applicationContext,
            useMobileNetwork = cfg.useMobileNetwork
        )
        
        // 设置RTCM监听
        ntripClient?.setRtcmListener { data ->
            forwardRtcmToRos(data)
        }
        
        // 设置状态监听
        ntripClient?.setStatusListener { success, message ->
            broadcastStatus(success, message)
        }
        
        // 连接
        val result = ntripClient?.connect() ?: false
        
        if (result) {
            // 启动GGA定时上报
            startGgaTimer()
        }
        
        return result
    }
    
    /**
     * 定时发送GGA到NTRIP
     * 参考: startGGAReport() in ntrip-ros-publisher.js
     */
    private fun startGgaTimer() {
        ggaTimer?.cancel()
        ggaTimer = Timer()
        
        ggaTimer?.scheduleAtFixedRate(object : TimerTask() {
            override fun run() {
                if (ntripClient?.isConnected() == true) {
                    val gga = if (ggaData != null) {
                        ggaData!!
                    } else {
                        // 使用配置中的默认坐标
                        val cfg = config
                        if (cfg != null) {
                            GgaGenerator.generateGga(cfg.ggaLat, cfg.ggaLon, cfg.ggaAlt)
                        } else {
                            null
                        }
                    }
                    
                    if (gga != null) {
                        ntripClient?.sendGga(gga)
                    }
                }
            }
        }, 0, 1000) // 每秒发送一次
        
        Log.i(TAG, "GGA定时上报已启动")
    }
    
    /**
     * 转发RTCM数据到ROS
     * 通过rosbridge发布到 /rtcm/data 话题
     * 参考: publishRTCM() in ntrip-ros-publisher.js
     */
    private fun forwardRtcmToRos(data: ByteArray) {
        if (rosbridgeClient == null) return
        
        // 构建rosbridge发布消息 (ByteMultiArray格式)
        val dataArray = org.json.JSONArray()
        for (byte in data) {
            dataArray.put(byte.toInt() and 0xFF)
        }
        
        val publishMsg = JSONObject().apply {
            put("op", "publish")
            put("topic", "/rtcm/data")
            put("type", "std_msgs/UInt8MultiArray")
            put("msg", JSONObject().apply {
                put("data", dataArray)
            })
        }.toString()
        
        rosbridgeClient?.send(publishMsg)
        
        // 广播给WebView (用于UI显示) - 仍使用Base64方便JS处理
        val base64Data = Base64.encodeToString(data, Base64.NO_WRAP)
        broadcastRtcmData(base64Data)
        
        // 更新统计信息
        val stats = ntripClient?.getStats()
        if (stats != null) {
            broadcastStats(stats)
        }
    }
    
    /**
     * 停止RTK
     */
    fun stopRtk() {
        Log.i(TAG, "停止RTK")
        
        // 停止GGA定时器
        ggaTimer?.cancel()
        ggaTimer = null
        
        // 断开NTRIP
        ntripClient?.disconnect()
        ntripClient = null
        
        // 取消订阅话题 (必须先取消订阅再断开连接)
        unsubscribeTopic("/rtk/gga")
        // unsubscribeTopic("/rtk/status")
        
        // 取消广告话题
        unadvertiseTopic("/rtcm/data")
        
        // 断开rosbridge
        rosbridgeClient?.close(1000, "RTK停止")
        rosbridgeClient = null
        rosbridgeConnected = false
        
        broadcastStatus(false, "RTK已停止")
    }
    
    /**
     * 取消广告ROS话题
     */
    private fun unadvertiseTopic(topic: String) {
        val unadvertiseMsg = JSONObject().apply {
            put("op", "unadvertise")
            put("topic", topic)
        }.toString()
        
        rosbridgeClient?.send(unadvertiseMsg)
        Log.d(TAG, "取消广告话题: $topic")
    }
    
    /**
     * 获取连接状态
     */
    fun isConnected(): Boolean {
        return ntripClient?.isConnected() ?: false
    }
    
    /**
     * 获取rosbridge连接状态
     */
    fun isRosbridgeConnected(): Boolean {
        return rosbridgeConnected
    }
    
    /**
     * 获取统计信息
     */
    fun getStats(): Map<String, Any>? {
        return ntripClient?.getStats()
    }
    
    /**
     * 广播状态更新
     */
    private fun broadcastStatus(success: Boolean, message: String) {
        handler.post {
            val intent = Intent(ACTION_STATUS_UPDATE)
            intent.putExtra("success", success)
            intent.putExtra("message", message)
            LocalBroadcastManager.getInstance(this@RtkService).sendBroadcast(intent)
        }
    }
    
    /**
     * 广播RTCM数据
     */
    private fun broadcastRtcmData(base64Data: String) {
        handler.post {
            val intent = Intent(ACTION_RTCM_DATA)
            intent.putExtra("data", base64Data)
            LocalBroadcastManager.getInstance(this@RtkService).sendBroadcast(intent)
        }
    }
    
    /**
     * 广播统计信息
     */
    private fun broadcastStats(stats: Map<String, Any>) {
        handler.post {
            val intent = Intent(ACTION_STATS_UPDATE)
            intent.putExtra("stats", JSONObject(stats).toString())
            LocalBroadcastManager.getInstance(this@RtkService).sendBroadcast(intent)
        }
    }
}

/**
 * NTRIP配置
 */
data class NtripConfig(
    val host: String,
    val port: Int,
    val username: String,
    val password: String,
    val mountpoint: String,
    val rosbridgeUrl: String,
    val ggaLat: Double,
    val ggaLon: Double,
    val ggaAlt: Double,
    val useMobileNetwork: Boolean = false
)