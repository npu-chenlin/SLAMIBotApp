package com.example.metacam

import java.util.Calendar

/**
 * GGA数据生成器
 * 参考: generateGGA() in ntrip-ros-publisher.js
 */
object GgaGenerator {
    
    /**
     * 计算NMEA校验和
     * 参考: calculateChecksum() in ntrip-ros-publisher.js
     */
    fun calculateChecksum(sentence: String): String {
        var checksum = 0
        for (i in sentence.indices) {
            checksum = checksum xor sentence[i].toInt()
        }
        return checksum.toString(16).toUpperCase().padStart(2, '0')
    }
    
    /**
     * 生成GGA数据
     * 参考: generateGGA() in ntrip-ros-publisher.js lines 62-80
     * 
     * @param lat 纬度 (度)
     * @param lon 经度 (度)
     * @param alt 高度 (米)
     * @return GGA字符串 (如: $GPGGA,091230,3954.123,N,11623.456,E,1,08,1.2,50.0,M,0.0,M,,*1A)
     */
    fun generateGga(lat: Double, lon: Double, alt: Double = 50.0): String {
        // UTC时间
        val calendar = Calendar.getInstance()
        val time = String.format("%02d%02d%05.2f",
            calendar.get(Calendar.HOUR_OF_DAY),
            calendar.get(Calendar.MINUTE),
            calendar.get(Calendar.SECOND) + calendar.get(Calendar.MILLISECOND) / 1000.0
        )
        
        // 纬度转换: 度分格式 (DDMM.MMM)
        val latDeg = Math.floor(Math.abs(lat)).toInt()
        val latMin = (Math.abs(lat) - latDeg) * 60
        val latDir = if (lat >= 0) "N" else "S"
        
        // 经度转换: 度分格式 (DDDMM.MMM)
        val lonDeg = Math.floor(Math.abs(lon)).toInt()
        val lonMin = (Math.abs(lon) - lonDeg) * 60
        val lonDir = if (lon >= 0) "E" else "W"
        
        // 构建NMEA句子 (不含$和*)
        val sentence = "GPGGA,$time," +
                       "${latDeg}${String.format("%06.3f", latMin)},$latDir," +
                       "${lonDeg}${String.format("%06.3f", lonMin)},$lonDir," +
                       "1,08,1.2,${String.format("%.1f", alt)},M,0.0,M,,"
        
        // 计算校验和
        val checksum = calculateChecksum(sentence)
        
        return "\$$sentence*$checksum"
    }
}