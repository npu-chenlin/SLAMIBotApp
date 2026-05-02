package com.example.metacam

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log
import android.webkit.JavascriptInterface

/**
 * Network JavaScript Interface
 * Provides network status information to WebView
 */
class NetworkJSInterface(private val context: Context) {
    
    companion object {
        private const val TAG = "NetworkJSInterface"
    }
    
    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    
    /**
     * Check if WiFi is connected (检查所有网络，不仅仅是活跃网络)
     */
    @JavascriptInterface
    fun isWifiConnected(): Boolean {
        return try {
            // 先检查活跃网络
            val activeNetwork = connectivityManager.activeNetwork
            if (activeNetwork != null) {
                val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
                if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
                    return true
                }
            }
            // 再检查所有网络
            for (network in connectivityManager.allNetworks) {
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
                    return true
                }
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking WiFi connection", e)
            false
        }
    }
    
    /**
     * Check if mobile network is connected (检查所有网络，不仅仅是活跃网络)
     */
    @JavascriptInterface
    fun isMobileConnected(): Boolean {
        return try {
            // 遍历所有网络，检查是否有移动网络
            for (network in connectivityManager.allNetworks) {
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true) {
                    return true
                }
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking mobile connection", e)
            false
        }
    }
    
    /**
     * Get WiFi SSID (requires ACCESS_FINE_LOCATION permission on Android 8+)
     */
    @JavascriptInterface
    fun getWifiSsid(): String {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+
                val network = connectivityManager.activeNetwork
                if (network != null) {
                    wifiManager.connectionInfo?.ssid?.removeSurrounding("\"") ?: ""
                } else {
                    ""
                }
            } else {
                // Android 9 and below
                @Suppress("DEPRECATION")
                wifiManager.connectionInfo?.ssid?.removeSurrounding("\"") ?: ""
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting WiFi SSID", e)
            ""
        }
    }
    
    /**
     * Get WiFi signal strength (0-4 scale)
     */
    @JavascriptInterface
    fun getWifiStrength(): Int {
        return try {
            val wifiInfo = wifiManager.connectionInfo
            if (wifiInfo != null) {
                // Convert RSSI to level (0-4)
                val rssi = wifiInfo.rssi
                WifiManager.calculateSignalLevel(rssi, 5)
            } else {
                0
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting WiFi strength", e)
            0
        }
    }
    
    /**
     * Get mobile network type (4G, 5G, 3G, etc.)
     * 即使WiFi是活跃网络，也能检测移动网络类型
     */
    @JavascriptInterface
    fun getMobileNetworkType(): String {
        return try {
            // 先检查是否有移动网络连接
            var hasMobile = false
            for (network in connectivityManager.allNetworks) {
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true) {
                    hasMobile = true
                    break
                }
            }
            
            if (!hasMobile) return "Unknown"
            
            // 使用TelephonyManager获取网络类型
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                when (telephonyManager.dataNetworkType) {
                    TelephonyManager.NETWORK_TYPE_NR -> "5G"
                    TelephonyManager.NETWORK_TYPE_LTE -> "4G LTE"
                    TelephonyManager.NETWORK_TYPE_UMTS,
                    TelephonyManager.NETWORK_TYPE_HSDPA,
                    TelephonyManager.NETWORK_TYPE_HSUPA,
                    TelephonyManager.NETWORK_TYPE_HSPA -> "3G"
                    TelephonyManager.NETWORK_TYPE_GPRS,
                    TelephonyManager.NETWORK_TYPE_EDGE -> "2G"
                    else -> "Cellular"
                }
            } else {
                @Suppress("DEPRECATION")
                when (telephonyManager.networkType) {
                    TelephonyManager.NETWORK_TYPE_NR -> "5G"
                    TelephonyManager.NETWORK_TYPE_LTE -> "4G LTE"
                    TelephonyManager.NETWORK_TYPE_UMTS,
                    TelephonyManager.NETWORK_TYPE_HSDPA,
                    TelephonyManager.NETWORK_TYPE_HSUPA,
                    TelephonyManager.NETWORK_TYPE_HSPA -> "3G"
                    TelephonyManager.NETWORK_TYPE_GPRS,
                    TelephonyManager.NETWORK_TYPE_EDGE -> "2G"
                    else -> "Cellular"
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting mobile network type", e)
            "Unknown"
        }
    }
    
    /**
     * Get mobile signal strength (0-4 scale)
     */
    @JavascriptInterface
    fun getMobileStrength(): Int {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val signalStrength = telephonyManager.signalStrength
                signalStrength?.level ?: 0
            } else {
                // Legacy fallback - return default
                0
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting mobile strength", e)
            0
        }
    }
    
    /**
     * Check if device is online (any network)
     */
    @JavascriptInterface
    fun isOnline(): Boolean {
        return try {
            val network = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
            
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking online status", e)
            false
        }
    }
    
    /**
     * Check if WiFi has internet access (validated connection)
     * 检查所有WiFi网络，是否有任意一个可以上网
     */
    @JavascriptInterface
    fun hasWifiInternetAccess(): Boolean {
        return try {
            for (network in connectivityManager.allNetworks) {
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                if (capabilities != null &&
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                    return true
                }
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking WiFi internet access", e)
            false
        }
    }
    
    /**
     * Check if mobile network has internet access (validated connection)
     * 检查所有移动网络，是否有任意一个可以上网
     */
    @JavascriptInterface
    fun hasMobileInternetAccess(): Boolean {
        return try {
            for (network in connectivityManager.allNetworks) {
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                if (capabilities != null &&
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                    return true
                }
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking mobile internet access", e)
            false
        }
    }
    
    /**
     * Get network status as JSON string
     * WiFi状态区分：
     * - connected: WiFi已连接（但可能没有外网）
     * - hasInternet: WiFi已连接且可以上网（validated）
     */
    @JavascriptInterface
    fun getNetworkStatus(): String {
        return try {
            val wifiConnected = isWifiConnected()
            val wifiHasInternet = hasWifiInternetAccess()
            val mobileConnected = isMobileConnected()
            val mobileHasInternet = hasMobileInternetAccess()
            
            """
            {
                "wifi": {
                    "connected": $wifiConnected,
                    "hasInternet": $wifiHasInternet,
                    "ssid": "${getWifiSsid()}",
                    "strength": ${getWifiStrength()}
                },
                "mobile": {
                    "connected": $mobileConnected,
                    "hasInternet": $mobileHasInternet,
                    "type": "${getMobileNetworkType()}",
                    "strength": ${getMobileStrength()}
                },
                "online": ${isOnline()}
            }
            """.trimIndent()
        } catch (e: Exception) {
            Log.e(TAG, "Error getting network status", e)
            "{}"
        }
    }
}
