package com.example.metacam

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Base64
import android.util.Log
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

/**
 * NTRIP客户端
 * 实现NTRIP认证、RTCM数据接收、GGA上报
 * 支持 WiFi/移动网络选择
 * 参考: ntrip-ros-publisher.js
 */
class NtripClient(
    private val host: String,
    private val port: Int,
    private val username: String,
    private val password: String,
    private val mountpoint: String,
    private val context: Context? = null,
    private val useMobileNetwork: Boolean = false
) {
    private var socket: Socket? = null
    private var inputStream: InputStream? = null
    private var outputStream: OutputStream? = null
    private val running = AtomicBoolean(false)
    
    // 网络相关
    private var selectedNetwork: Network? = null
    private var connectivityManager: ConnectivityManager? = null
    
    // 监听器
    private var rtcmListener: ((ByteArray) -> Unit)? = null
    private var statusListener: ((Boolean, String) -> Unit)? = null
    
    // 统计信息
    private var totalBytes = 0L
    private var startTime: Long? = null
    
    companion object {
        private const val TAG = "NtripClient"
        private const val BUFFER_SIZE = 4096
        private const val SOCKET_TIMEOUT = 10000
    }
    
    /**
     * 设置RTCM数据监听器
     */
    fun setRtcmListener(listener: (ByteArray) -> Unit) {
        rtcmListener = listener
    }
    
    /**
     * 设置状态监听器
     */
    fun setStatusListener(listener: (Boolean, String) -> Unit) {
        statusListener = listener
    }
    
    /**
     * 连接NTRIP服务器
     * 支持 WiFi/移动网络选择
     * 参考: connectNTRIP() in ntrip-ros-publisher.js
     */
    fun connect(): Boolean {
        return try {
            Log.i(TAG, "连接NTRIP服务器: $host:$port/$mountpoint (移动网络: $useMobileNetwork)")
            
            // 获取ConnectivityManager
            connectivityManager = context?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            
            // 1. 创建TCP连接
            socket = Socket()
            
            // 如果指定使用移动网络，绑定Socket到移动网络（不影响其他连接）
            if (useMobileNetwork && connectivityManager != null) {
                val mobileNetwork = getMobileNetwork()
                if (mobileNetwork != null) {
                    // 检查移动网络是否有网络连接
                    val caps = connectivityManager?.getNetworkCapabilities(mobileNetwork)
                    val hasInternet = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
                                     caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
                    
                    if (hasInternet) {
                        Log.i(TAG, "Binding socket to mobile network (WiFi LAN still works)")
                        // 只绑定这个Socket到移动网络，不影响进程中的其他连接（如rosbridge）
                        mobileNetwork.bindSocket(socket)
                        selectedNetwork = mobileNetwork
                    } else {
                        Log.e(TAG, "Mobile network has no internet")
                        statusListener?.invoke(false, "移动网络无网络连接")
                        disconnect()
                        return false
                    }
                } else {
                    Log.e(TAG, "Mobile network not found")
                    statusListener?.invoke(false, "未找到移动网络，请检查移动数据是否开启")
                    disconnect()
                    return false
                }
            }
            
            socket?.connect(InetSocketAddress(host, port), SOCKET_TIMEOUT)
            socket?.soTimeout = 1000
            
            inputStream = socket?.getInputStream()
            outputStream = socket?.getOutputStream()
            
            // 2. Base64编码认证信息
            val authStr = "$username:$password"
            val authBase64 = Base64.encodeToString(authStr.toByteArray(), Base64.NO_WRAP)
            
            // 3. 构建HTTP请求
            val request = buildString {
                append("GET /$mountpoint HTTP/1.1\r\n")
                append("Host: $host\r\n")
                append("User-Agent: NTRIP ntrip_client\r\n")
                append("Accept: */*\r\n")
                append("Authorization: Basic $authBase64\r\n")
                append("\r\n")
            }
            
            // 4. 发送请求
            outputStream?.write(request.toByteArray())
            outputStream?.flush()
            
            Log.i(TAG, "认证请求已发送")
            
            // 5. 读取响应
            val buffer = ByteArray(BUFFER_SIZE)
            val bytesRead = inputStream?.read(buffer) ?: 0
            val response = String(buffer, 0, bytesRead)
            
            // 6. 检查认证结果
            val isSuccess = response.contains("ICY 200 OK") ||
                           response.contains("HTTP/1.0 200 OK") ||
                           response.contains("HTTP/1.1 200 OK")
            
            if (isSuccess) {
                Log.i(TAG, "NTRIP认证成功")
                statusListener?.invoke(true, "RTK连接成功")
                running.set(true)
                startTime = System.currentTimeMillis()
                
                // 处理首包数据中的RTCM
                val headerEnd = response.indexOf("\r\n\r\n")
                if (headerEnd != -1) {
                    val rtcmStart = headerEnd + 4
                    val rtcmBytes = bytesRead - rtcmStart
                    if (rtcmBytes > 0) {
                        val rtcmData = buffer.copyOfRange(rtcmStart, bytesRead)
                        totalBytes += rtcmBytes
                        rtcmListener?.invoke(rtcmData)
                        Log.d(TAG, "首包RTCM数据: $rtcmBytes bytes")
                    }
                }
                
                // 启动RTCM接收线程
                Thread { receiveRtcmData() }.start()
                
                true
            } else {
                Log.e(TAG, "NTRIP认证失败: ${response.lines().firstOrNull()}")
                statusListener?.invoke(false, "认证失败")
                disconnect()
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "连接失败: ${e.message}")
            statusListener?.invoke(false, "连接失败: ${e.message}")
            disconnect()
            false
        }
    }
    
    /**
     * 获取可上网的移动网络
     * 只返回有 INTERNET 和 VALIDATED 能力的移动网络
     */
    private fun getMobileNetwork(): Network? {
        if (connectivityManager == null) return null
        
        val networks = connectivityManager?.allNetworks
        networks?.forEach { network ->
            val capabilities = connectivityManager?.getNetworkCapabilities(network)
            if (capabilities != null && 
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                Log.i(TAG, "Found mobile network with internet access")
                return network
            }
        }
        
        // 如果没有找到validated的移动网络，尝试找有INTERNET能力的（可能还没验证）
        networks?.forEach { network ->
            val capabilities = connectivityManager?.getNetworkCapabilities(network)
            if (capabilities != null && 
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                Log.w(TAG, "Found mobile network with INTERNET capability but not validated yet")
                return network
            }
        }
        
        Log.e(TAG, "No mobile network with internet capability found")
        return null
    }
    
    /**
     * 接收RTCM数据
     * 参考: ntripSocket.on('data') in ntrip-ros-publisher.js
     */
    private fun receiveRtcmData() {
        val buffer = ByteArray(BUFFER_SIZE)
        
        try {
            while (running.get() && socket?.isConnected == true) {
                try {
                    val bytesRead = inputStream?.read(buffer) ?: -1
                    
                    if (bytesRead > 0) {
                        totalBytes += bytesRead
                        
                        // 复制数据到新数组
                        val rtcmData = buffer.copyOf(bytesRead)
                        
                        // 回调给监听者
                        rtcmListener?.invoke(rtcmData)
                        
                        // 每1MB打印一次日志
                        if (totalBytes % (1024 * 1024) < BUFFER_SIZE) {
                            val elapsed = startTime?.let { (System.currentTimeMillis() - it) / 1000 } ?: 0
                            val rate = if (elapsed > 0) totalBytes / elapsed else 0
                            Log.i(TAG, "已接收: ${totalBytes / 1024} KB, 速率: ${rate / 1024} KB/s")
                        }
                    } else if (bytesRead == -1) {
                        Log.w(TAG, "数据流结束")
                        break
                    }
                } catch (e: java.net.SocketTimeoutException) {
                    // 超时是正常的,继续等待
                    continue
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "接收数据错误: ${e.message}")
            statusListener?.invoke(false, "数据流中断: ${e.message}")
        } finally {
            running.set(false)
            statusListener?.invoke(false, "连接已断开")
        }
    }
    
    /**
     * 发送GGA数据
     * 参考: startGGAReport() in ntrip-ros-publisher.js
     */
    fun sendGga(ggaData: String) {
        if (!running.get() || outputStream == null) {
            return
        }
        
        try {
            outputStream?.write((ggaData.trim() + "\r\n").toByteArray())
            outputStream?.flush()
            Log.d(TAG, "发送GGA: ${ggaData.take(30)}...")
        } catch (e: Exception) {
            Log.e(TAG, "发送GGA失败: ${e.message}")
            running.set(false)
            statusListener?.invoke(false, "发送GGA失败")
        }
    }
    
    /**
     * 断开连接
     */
    fun disconnect() {
        running.set(false)
        try {
            inputStream?.close()
            outputStream?.close()
            socket?.close()
        } catch (e: Exception) {
            Log.e(TAG, "断开连接错误: ${e.message}")
        }
        inputStream = null
        outputStream = null
        socket = null
        
        // 清除网络绑定引用
        if (selectedNetwork != null) {
            // Socket已关闭，无需额外操作
            selectedNetwork = null
            Log.i(TAG, "Network binding cleared")
        }
        
        Log.i(TAG, "已断开NTRIP连接")
    }
    
    /**
     * 是否已连接
     */
    fun isConnected(): Boolean {
        return running.get() && socket?.isConnected == true
    }
    
    /**
     * 获取统计信息
     */
    fun getStats(): Map<String, Any> {
        val elapsed = startTime?.let { (System.currentTimeMillis() - it) / 1000 } ?: 0
        val rate = if (elapsed > 0) totalBytes / elapsed else 0
        
        return mapOf(
            "totalBytes" to totalBytes,
            "elapsed" to elapsed,
            "rate" to rate,
            "connected" to isConnected()
        )
    }
}