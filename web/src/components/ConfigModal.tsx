import React, { useState, useEffect } from "react";
import "./ConfigModal.css";
import rosService from "../services/ROSService";
import { customAlert } from "../utils/customAlert";

// 在ConfigModal组件中添加showDebugPanel属性
interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  initialConfig: any;
}

const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig,
}) => {
  const [config, setConfig] = useState({
    ...initialConfig,
    rtkHost: initialConfig.rtkHost || "203.107.45.154",
    rtkPort: initialConfig.rtkPort || "8002",
    rtkUser: initialConfig.rtkUser || "qxq0026825",
    rtkPassword: initialConfig.rtkPassword || "0e535cf",
    rtkMountPoint: initialConfig.rtkMountPoint || "AUTO",
    rtkRosbridgeUrl: initialConfig.rtkRosbridgeUrl || "ws://192.168.2.176:9090",
    rtkGgaLat: initialConfig.rtkGgaLat || "39.91375",
    rtkGgaLon: initialConfig.rtkGgaLon || "116.39173",
    rtkGgaAlt: initialConfig.rtkGgaAlt || "50.0",
    rtkUseMobileNetwork: initialConfig.rtkUseMobileNetwork || false,
  });
  const [activeTab, setActiveTab] = useState<
    "rtk" | "pointCloud" | "display" | "network"
  >("rtk");
  const [rtkAuthResult, setRtkAuthResult] = useState<{ success: boolean; message: string } | null>(null);
  const [rtkAuthLoading, setRtkAuthLoading] = useState(false);
  const [rtkConnected, setRtkConnected] = useState(false);
  const [rosbridgeConnected, setRosbridgeConnected] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<{
    wifi: { connected: boolean; hasInternet: boolean; ssid?: string; strength?: number };
    mobile: { connected: boolean; hasInternet: boolean; type?: string; strength?: number };
  }>({
    wifi: { connected: false, hasInternet: false },
    mobile: { connected: false, hasInternet: false }
  });

  // 监听RTK状态更新 (来自Android广播)
  useEffect(() => {
    if (!isOpen) return;

    // 定义状态回调
    (window as any).onRtkStatus = (status: { success: boolean; message: string }) => {
      setRtkConnected(status.success);
      setRtkAuthResult(status);
    };

    // 定义统计回调
    (window as any).onRtkStats = (stats: any) => {
      // 可以在这里处理统计信息
      console.log("RTK Stats:", stats);
    };

    // 初始检查连接状态
    if ((window as any).AndroidRtk) {
      setRtkConnected((window as any).AndroidRtk.isConnected());
      setRosbridgeConnected((window as any).AndroidRtk.isRosbridgeConnected());
    }

    // 定时检查连接状态 (因为Android不会主动推送)
    const intervalId = setInterval(() => {
      if ((window as any).AndroidRtk) {
        setRtkConnected((window as any).AndroidRtk.isConnected());
        setRosbridgeConnected((window as any).AndroidRtk.isRosbridgeConnected());
      }
    }, 2000);

    return () => {
      clearInterval(intervalId);
      (window as any).onRtkStatus = null;
      (window as any).onRtkStats = null;
    };
  }, [isOpen]);

  // 检测网络状态
  useEffect(() => {
    if (!isOpen) return;

    const checkNetworkStatus = () => {
      // 尝试从 Android 接口获取网络状态
      if ((window as any).AndroidNetwork) {
        const wifiConnected = (window as any).AndroidNetwork.isWifiConnected();
        const wifiHasInternet = (window as any).AndroidNetwork.hasWifiInternetAccess?.() || false;
        const mobileConnected = (window as any).AndroidNetwork.isMobileConnected();
        const mobileHasInternet = (window as any).AndroidNetwork.hasMobileInternetAccess?.() || false;
        const wifiSsid = (window as any).AndroidNetwork.getWifiSsid?.() || undefined;
        const wifiStrength = (window as any).AndroidNetwork.getWifiStrength?.() || undefined;
        const mobileType = (window as any).AndroidNetwork.getMobileNetworkType?.() || undefined;
        const mobileStrength = (window as any).AndroidNetwork.getMobileStrength?.() || undefined;

        setNetworkStatus({
          wifi: {
            connected: wifiConnected,
            hasInternet: wifiHasInternet,
            ssid: wifiSsid,
            strength: wifiStrength
          },
          mobile: {
            connected: mobileConnected,
            hasInternet: mobileHasInternet,
            type: mobileType,
            strength: mobileStrength
          }
        });
      } else {
        // 后备方案: 使用 Navigator API (浏览器环境)
        const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        const isOnline = navigator.onLine;
        
        setNetworkStatus({
          wifi: {
            connected: isOnline && connection?.type === 'wifi',
            hasInternet: isOnline && connection?.type === 'wifi',
            ssid: undefined,
            strength: undefined
          },
          mobile: {
            connected: isOnline && (connection?.type === 'cellular' || connection?.type === 'wimax'),
            hasInternet: isOnline && (connection?.type === 'cellular' || connection?.type === 'wimax'),
            type: connection?.effectiveType || undefined,
            strength: undefined
          }
        });
      }
    };

    // 初始检查
    checkNetworkStatus();

    // 定时检查网络状态
    const networkIntervalId = setInterval(checkNetworkStatus, 3000);

    // 监听浏览器网络变化事件
    window.addEventListener('online', checkNetworkStatus);
    window.addEventListener('offline', checkNetworkStatus);

    return () => {
      clearInterval(networkIntervalId);
      window.removeEventListener('online', checkNetworkStatus);
      window.removeEventListener('offline', checkNetworkStatus);
    };
  }, [isOpen]);







  /**
   *
   * @param e autoExposure :  false autoSave :  false colorMode :  "height" contrast :  "29" exposure :  "29" frameRate :  "30" pointSize :  3 resolution :  "high" saveInterval :  60 showDebugPanel :  true whiteBalance :  "5300"
   */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setConfig({
      ...config,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    });
    // 清除之前的认证结果
    setRtkAuthResult(null);
  };

  /**
   * RTK认证测试
   */
  const handleRtkAuth = async () => {
    setRtkAuthLoading(true);
    setRtkAuthResult(null);
    
    try {
      // 构建RTK配置对象
      const rtkConfig = {
        host: config.rtkHost || "",
        port: parseInt(config.rtkPort) || 2101,
        username: config.rtkUser || "",
        password: config.rtkPassword || "",
        mountpoint: config.rtkMountPoint || "",
        rosbridgeUrl: config.rtkRosbridgeUrl || "ws://192.168.2.176:9090",
        ggaLat: parseFloat(config.rtkGgaLat) || 39.91375,
        ggaLon: parseFloat(config.rtkGgaLon) || 116.39173,
        ggaAlt: parseFloat(config.rtkGgaAlt) || 50.0,
        // useMobileNetwork 由后端自动检测，不再手动指定
      };

      // 调用Android RTK接口
      if ((window as any).AndroidRtk) {
        const success = (window as any).AndroidRtk.startRtk(JSON.stringify(rtkConfig));
        setRtkAuthResult({
          success: success,
          message: success ? "RTK认证成功" : "RTK认证失败"
        });
        setRtkConnected(success);
      } else {
        // 后备: 模拟认证测试
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!rtkConfig.host || !rtkConfig.username || !rtkConfig.password) {
          setRtkAuthResult({
            success: false,
            message: "请填写完整的RTK配置信息"
          });
        } else {
          setRtkAuthResult({
            success: true,
            message: "RTK配置验证通过（模拟）"
          });
          setRtkConnected(true);
        }
      }
    } catch (error: any) {
      setRtkAuthResult({
        success: false,
        message: error?.message || "认证失败"
      });
    } finally {
      setRtkAuthLoading(false);
    }
  };

  /**
   * 停止RTK
   */
  const handleRtkStop = () => {
    try {
      if ((window as any).AndroidRtk) {
        (window as any).AndroidRtk.stopRtk();
        setRtkAuthResult({
          success: true,
          message: "RTK已停止"
        });
      } else {
        setRtkAuthResult({
          success: true,
          message: "RTK已停止（模拟）"
        });
      }
      setRtkConnected(false);
    } catch (error: any) {
      setRtkAuthResult({
        success: false,
        message: error?.message || "停止失败"
      });
    }
  };



    // try {
    //   rosService
    //     .callService<
    //       {
    //         ip_subnet: string;
    //       },
    //       { success: boolean; message: string }
    //     >("/ip_config", "metacam_node/IPConfig", {
    //       ip_subnet: "192.168.0.33/24",
    //     })
    //     .then((response: any) => {
    //       console.log("ip_config:", response);
    //     })
    //     .catch((err) => {
    //       console.error(err);
    //     });
    // } catch (error) {
    //   console.error("服务调用失败:", error);
    // }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onSave(config);
    try {
      const hasRtkConfig =
        config.rtkHost ||
        config.rtkUser ||
        config.rtkPassword ||
        config.rtkMountPoint;

      if (hasRtkConfig) {
        // 构建RTK配置对象
        const rtkConfig = {
          host: config.rtkHost || "",
          port: parseInt(config.rtkPort) || 2101,
          username: config.rtkUser || "",
          password: config.rtkPassword || "",
          mountpoint: config.rtkMountPoint || "",
          rosbridgeUrl: config.rtkRosbridgeUrl || "ws://192.168.2.176:9090",
          ggaLat: parseFloat(config.rtkGgaLat) || 39.91375,
          ggaLon: parseFloat(config.rtkGgaLon) || 116.39173,
          ggaAlt: parseFloat(config.rtkGgaAlt) || 50.0,
          // useMobileNetwork 由后端自动检测
        };

        // 调用Android RTK接口
        if ((window as any).AndroidRtk) {
          const success = (window as any).AndroidRtk.startRtk(JSON.stringify(rtkConfig));
          if (success) {
            customAlert("RTK 启动成功");
          } else {
            customAlert("RTK 启动失败");
          }
        } else {
          // 后备: 调用ROS服务
          const params = [
            config.rtkHost || "",
            config.rtkPort || "",
            config.rtkUser || "",
            config.rtkPassword || "",
            config.rtkMountPoint || "",
          ].join("/");

          const response = await rosService.callService<
            { params: string },
            { success?: boolean; message?: string }
          >("/rtk/login", "project_control/Base", { params: params });

          if (response?.success) {
            customAlert("RTK 登录成功");
          } else {
            customAlert(response?.message || "RTK 登录失败");
          }
        }
      }
      onClose();
    } catch (error: any) {
      console.error("RTK 登录失败:", error);
      customAlert(error?.message || "RTK 登录失败");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="config-modal-overlay" onClick={onClose}>
      <div
        className="config-modal"
        style={{ minHeight: window.innerHeight + "px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="config-modal-header">
          <h2>参数配置</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="config-form">
          <div className="config-tabs">
            <button
              type="button"
              className={`config-tab ${activeTab === "rtk" ? "active" : ""}`}
              onClick={() => setActiveTab("rtk")}
            >
              RTK 设置
            </button>
            <button
              type="button"
              className={`config-tab ${activeTab === "pointCloud" ? "active" : ""}`}
              onClick={() => setActiveTab("pointCloud")}
            >
              点云设置
            </button>
            <button
              type="button"
              className={`config-tab ${activeTab === "display" ? "active" : ""}`}
              onClick={() => setActiveTab("display")}
            >
              显示设置
            </button>
            <button
              type="button"
              className={`config-tab ${activeTab === "network" ? "active" : ""}`}
              onClick={() => setActiveTab("network")}
            >
              网口设置
            </button>
          </div>
          <div className="config-content">
          <div className="config-section" style={{display: "none"}}>
            <h3>设备参数</h3>
            <div className="config-row">
              <label htmlFor="resolution">分辨率</label>
              <select
                id="resolution"
                name="resolution"
                value={config.resolution}
                onChange={handleChange}
              >
                {/* <option value="high">高 (1920x1080)</option> */}
                {/* <option value="medium">中 (1280x720)</option> */}
                <option value="medium">中 (1024x1080)</option>
                {/* <option value="low">低 (640x480)</option> */}
              </select>
            </div>
            <div className="config-row">
              <label htmlFor="frameRate">帧率</label>
              <select
                id="frameRate"
                name="frameRate"
                value={config.frameRate}
                onChange={handleChange}
              >
                {/* <option value="1">1 fps</option> */}
                <option value="10">10 fps</option>
                {/* <option value="30">30 fps</option> */}
                {/* <option value="60">60 fps</option> */}
                {/* <option value="120">120 fps</option> */}
              </select>
            </div>
          </div>

          {activeTab === "pointCloud" && (
          <div className="config-section">
            <div className="config-row">
              {/* <label htmlFor="maxPointNumber">点数量</label>
              <input
                type="number"
                id="maxPointNumber"
                name="maxPointNumber"
                min="10"
                max="3000000"
                value={config.maxPointNumber || 100000}
                onChange={handleChange}
              /> */}
              <label htmlFor="pointSize">
                点大小: <span>{Number(config.pointSize).toFixed(1)}</span>
              </label>
              <input
                type="range"
                id="pointSize"
                name="pointSize"
                min="0.1"
                max="10"
                step="0.1"
                value={config.pointSize}
                onChange={handleChange}
              />
            </div>
            <div className="config-row" style={{display: "none"}}>
              <label htmlFor="colorMode">颜色模式</label>
              <select
                id="colorMode"
                name="colorMode"
                value={config.colorMode}
                onChange={handleChange}
              >
                <option value="height">高度</option>
                <option value="intensity">强度</option>
                <option value="rgb">RGB</option>
              </select>
            </div>
          </div>
          )}

          {activeTab === "display" && (
          <div className="config-section">
            <div className="config-row" style={{ flexDirection: "row" }}>
              <label htmlFor="showDebugPanel">显示调试面板</label>
              <input
                type="checkbox"
                id="showDebugPanel"
                name="showDebugPanel"
                checked={config.showDebugPanel || false}
                onChange={handleChange}
              />
            </div>
            <div className="config-row" style={{ flexDirection: "row" }}>
              <label htmlFor="showStats">显示性能监视器</label>
              <input
                type="checkbox"
                id="showStats"
                name="showStats"
                checked={config.showStats || false}
                onChange={handleChange}
              />
            </div>
            <div className="config-row" style={{ flexDirection: "row" }}>
              <label htmlFor="processImages">处理图片</label>
              <input
                type="checkbox"
                id="processImages"
                name="processImages"
                checked={config.processImages || false}
                onChange={handleChange}
              />
            </div>
          </div>
          )}

          {activeTab === "network" && (
          <div className="config-section">
            <div className="config-row">
              <label htmlFor="deviceIp">网口IP配置</label>
              <input
                type="text"
                id="deviceIp"
                name="deviceIp"
                className="ip-input"
                placeholder="例如: 192.168.0.33"
                value={config.deviceIp || ""}
                onChange={handleChange}
                pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
                title="请输入有效的IP地址，例如: 192.168.0.33"
              />
            </div>
          </div>
          )}

          {activeTab === "rtk" && (
          <div className="config-section">
            <div className="config-row">
              <label htmlFor="rtkHost">Ntrip Host</label>
              <input
                type="text"
                id="rtkHost"
                name="rtkHost"
                placeholder="例如: ntrip.example.com"
                value={config.rtkHost || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkPort">端口</label>
              <input
                type="number"
                id="rtkPort"
                name="rtkPort"
                min="1"
                max="65535"
                placeholder="例如: 2101"
                value={config.rtkPort || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkUser">账户</label>
              <input
                type="text"
                id="rtkUser"
                name="rtkUser"
                placeholder="Ntrip 用户名"
                value={config.rtkUser || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkPassword">密码</label>
              <input
                type="password"
                id="rtkPassword"
                name="rtkPassword"
                placeholder="Ntrip 密码"
                value={config.rtkPassword || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkMountPoint">挂载点</label>
              <input
                type="text"
                id="rtkMountPoint"
                name="rtkMountPoint"
                placeholder="例如: MOUNT_POINT"
                value={config.rtkMountPoint || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkRosbridgeUrl">Rosbridge地址</label>
              <input
                type="text"
                id="rtkRosbridgeUrl"
                name="rtkRosbridgeUrl"
                placeholder="例如: ws://192.168.2.176:9090"
                value={config.rtkRosbridgeUrl || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkGgaLat">默认纬度</label>
              <input
                type="number"
                id="rtkGgaLat"
                name="rtkGgaLat"
                step="0.00001"
                placeholder="例如: 39.91375"
                value={config.rtkGgaLat || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkGgaLon">默认经度</label>
              <input
                type="number"
                id="rtkGgaLon"
                name="rtkGgaLon"
                step="0.00001"
                placeholder="例如: 116.39173"
                value={config.rtkGgaLon || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="rtkGgaAlt">默认高度 (米)</label>
              <input
                type="number"
                id="rtkGgaAlt"
                name="rtkGgaAlt"
                step="0.1"
                placeholder="例如: 50.0"
                value={config.rtkGgaAlt || ""}
                onChange={handleChange}
              />
            </div>
            <div className="config-row" style={{ flexDirection: "row" }}>
              <label>NTRIP网络</label>
              <span className="rtk-status-value" style={{ fontSize: "12px" }}>
                自动选择 (WiFi优先)
              </span>
            </div>
            <div className="config-row rtk-button-group">
              <button
                type="button"
                className="rtk-auth-button"
                onClick={handleRtkAuth}
                disabled={rtkAuthLoading || rtkConnected}
              >
                {rtkAuthLoading ? "认证中..." : "RTK认证测试"}
              </button>
              <button
                type="button"
                className="rtk-stop-button"
                onClick={handleRtkStop}
                disabled={!rtkConnected}
              >
                停止RTK
              </button>
            </div>
            {rtkAuthResult && (
              <div className={`rtk-auth-result ${rtkAuthResult.success ? "success" : "error"}`}>
                <span className="rtk-auth-icon">
                  {rtkAuthResult.success ? "✓" : "✗"}
                </span>
                <span className="rtk-auth-message">{rtkAuthResult.message}</span>
              </div>
            )}
            <div className="rtk-status-row">
              <span className="rtk-status-label">WiFi状态:</span>
              <span className={`rtk-status-value ${networkStatus.wifi.hasInternet ? "connected" : networkStatus.wifi.connected ? "partial" : "disconnected"}`}>
                {networkStatus.wifi.hasInternet 
                  ? (networkStatus.wifi.ssid ? `已连接可上网 (${networkStatus.wifi.ssid})` : "已连接可上网")
                  : networkStatus.wifi.connected 
                    ? (networkStatus.wifi.ssid ? `已连接无外网 (${networkStatus.wifi.ssid})` : "已连接无外网")
                    : "未连接"}
              </span>
            </div>
            <div className="rtk-status-row">
              <span className="rtk-status-label">移动网络:</span>
              <span className={`rtk-status-value ${networkStatus.mobile.hasInternet ? "connected" : networkStatus.mobile.connected ? "partial" : "disconnected"}`}>
                {networkStatus.mobile.hasInternet 
                  ? (networkStatus.mobile.type ? `已连接可上网 (${networkStatus.mobile.type})` : "已连接可上网")
                  : networkStatus.mobile.connected 
                    ? (networkStatus.mobile.type ? `已连接无外网 (${networkStatus.mobile.type})` : "已连接无外网")
                    : "未连接"}
              </span>
            </div>
            <div className="rtk-status-row">
              <span className="rtk-status-label">NTRIP状态:</span>
              <span className={`rtk-status-value ${rtkConnected ? "connected" : "disconnected"}`}>
                {rtkConnected ? "已连接" : "未连接"}
              </span>
            </div>
            <div className="rtk-status-row">
              <span className="rtk-status-label">Rosbridge状态:</span>
              <span className={`rtk-status-value ${rosbridgeConnected ? "connected" : "disconnected"}`}>
                {rosbridgeConnected ? "已连接" : "未连接"}
              </span>
            </div>
          </div>
          )}

            {/* <div className="config-row">
              <label htmlFor="autoConnect">自动连接</label>
              <input
                type="checkbox"
                id="autoConnect"
                name="autoConnect"
                checked={config.autoConnect || false}
                onChange={handleChange}
              />
            </div>
            <div className="config-row">
              <label htmlFor="connectionPort">连接端口</label>
              <input
                type="number"
                id="connectionPort"
                name="connectionPort"
                min="1"
                max="65535"
                value={config.connectionPort || 8080}
                onChange={handleChange}
              />
            </div> */}

          </div>

          <div className="config-actions">
            <button type="button" className="cancel-button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="save-button">
              确定
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfigModal;