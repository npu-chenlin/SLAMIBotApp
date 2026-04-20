import React, { useState } from "react";
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
    rtkHost: initialConfig.rtkHost ?? "",
    rtkPort: initialConfig.rtkPort ?? "2101",
    rtkUser: initialConfig.rtkUser ?? "",
    rtkPassword: initialConfig.rtkPassword ?? "",
    rtkMountPoint: initialConfig.rtkMountPoint ?? "",
  });
  const [activeTab, setActiveTab] = useState<
    "rtk" | "pointCloud" | "display" | "network"
  >("rtk");







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
  };

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