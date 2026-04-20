import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./DownloadCenter.css";
import rosService from "../services/ROSService";

interface Version {
  version: string;
  downloadUrl: string;
  releaseDate: string;
  description: string;
}

interface DownloadCenterProps {
  preloadedVersion?: string;
}

const DownloadCenter: React.FC<DownloadCenterProps> = ({ preloadedVersion }) => {
  const navigate = useNavigate();
  const [currentAppVersion, setCurrentAppVersion] = useState<string>("");
  const [latestAppVersion, setLatestAppVersion] = useState<Version | null>(
    null
  );
  const [currentFirmwareVersion, setCurrentFirmwareVersion] =
    useState<string>("");
  const [latestFirmwareVersion, setLatestFirmwareVersion] =
    useState<Version | null>(null);
  const [preloadedFirmwareVersion, setPreloadedFirmwareVersion] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"app" | "firmware">("app");
  const [upgrading, setUpgrading] = useState<boolean>(false);
  const [upgradeProgress, setUpgradeProgress] = useState<number>(0);

  // 获取预载固件版本号
  const fetchPreloadedFirmwareVersion = async () => {
    try {
      // 发送请求获取文件信息
      const response = await fetch('/slamibotfull_v0.0.9.ibot', { method: 'HEAD' });
      
      if (response.ok) {
        // 从URL中提取版本号
        const url = new URL(response.url);
        const filename = url.pathname.split('/').pop() || '';
        const versionMatch = filename.match(/v(\d+\.\d+\.\d+)/);
        
        if (versionMatch && versionMatch[1]) {
          setPreloadedFirmwareVersion(versionMatch[1]);
          console.log("预载固件版本:", versionMatch[1]);
        } else {
          console.error("无法从文件名中提取版本号");
          setPreloadedFirmwareVersion("未知");
        }
      } else {
        console.error("获取预载固件文件失败");
        setPreloadedFirmwareVersion("未知");
      }
    } catch (error) {
      console.error("获取预载固件版本出错:", error);
      setPreloadedFirmwareVersion("未知");
    }
  };

  useEffect(() => {
    // 获取当前App版本号
    const localAppVersion = import.meta.env.VITE_CURRENT_VERSION || "1.0.0";
    setCurrentAppVersion(localAppVersion);

    // 模拟获取当前固件版本
    setCurrentFirmwareVersion("1.2.3");
    
    // 如果有传入的预载固件版本，则使用它，否则获取预载固件版本
    if (preloadedVersion) {
      setPreloadedFirmwareVersion(preloadedVersion);
    } else {
      fetchPreloadedFirmwareVersion();
    }

    // 模拟从服务器获取最新版本信息
    // 实际应用中，这里应该是一个API请求
    setTimeout(() => {
      try {
        // 模拟API响应 - App版本
        const mockLatestAppVersion: Version = {
          version: "0.2.0",
          downloadUrl: "https://www.baidu.com", // 替换为实际的下载链接
          releaseDate: "2025-04-15",
          description: "修复了多个bug，提升了性能，新增了点云渲染功能",
        };

        // 模拟API响应 - 固件版本
        const mockLatestFirmwareVersion: Version = {
          version: "1.3.0",
          downloadUrl: "https://www.baidu.com/firmware", // 替换为实际的下载链接
          releaseDate: "2025-04-10",
          description: "优化了传感器数据采集，提高了稳定性，修复了连接问题",
        };

        setLatestAppVersion(mockLatestAppVersion);
        setLatestFirmwareVersion(mockLatestFirmwareVersion);
        setLoading(false);
      } catch (err) {
        setError("获取最新版本信息失败");
        setLoading(false);
      }
    }, 1000);
  }, []);

  // 监听ROS连接状态变化
  useEffect(() => {
    const unsubscribe = rosService.onConnectionChange((status) => {
      if (status === "connected") {
        setupSubscribers();
        setupServiceCall();
      } else {
        cleanupSubscribers();
      }
    });

    // 如果已连接，立即设置订阅
    if (rosService.isConnected()) {
      setupSubscribers();
    }

    // 组件卸载时清理资源
    return () => {
      unsubscribe();
      cleanupSubscribers();
    };
  }, []);

  const setupSubscribers = () => {
    cleanupSubscribers();

    try {
      if (rosService.isConnected()) {
      }
    } catch (error) {
      console.error(error);
    }
  };

  // 清理订阅
  const cleanupSubscribers = () => {};

  /**
   * Sets up and executes a ROS service call to retrieve version information.
   * Makes an asynchronous call to the "/get_version" service using the "project_control/Base" type.
   * Logs the response or any errors that occur during the service call.
   *
   * @throws {Error} When the service call fails
   * @returns {Promise<void>}
   */
  async function setupServiceCall() {
    try {
      // 调用服务并等待响应
      rosService
        .callService<{}, { success: boolean; message: string }>(
          "/get_version",
          "project_control/Base",
          {}
        )
        .then((response: any) => {
          // console.log("get_version:", response, "version:", response.message);
          // response.message = "1.0.0|构建时间: 2025-07-19 15:42:04, Git: 3618e90 (main)";
          // 从message中提取版本号（格式："1.0.0|构建时间: 2025-07-19 15:42:04, Git: 3618e90 (main)"）
          const versionParts = response.message.split('|');
          const extractedVersion = versionParts[0].trim();
          // console.log("获取到设备固件版本:", extractedVersion);
          setCurrentFirmwareVersion(extractedVersion);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
        });
    } catch (error) {
      console.error("服务调用失败:", error);
    }
  }

  const hasNewAppVersion =
    latestAppVersion && latestAppVersion.version !== currentAppVersion;
  const hasNewFirmwareVersion =
    latestFirmwareVersion &&
    latestFirmwareVersion.version !== currentFirmwareVersion;

  const handleFirmwareUpgrade = () => {
    if (!latestFirmwareVersion) return;

    setUpgrading(true);
    setUpgradeProgress(0);

    // 模拟固件升级过程
    const interval = setInterval(() => {
      setUpgradeProgress((prev) => {
        const newProgress = prev + 10;
        if (newProgress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setUpgrading(false);
            setCurrentFirmwareVersion(latestFirmwareVersion.version);
          }, 500);
          return 100;
        }
        return newProgress;
      });
    }, 500);
  };

  return (
    <div className="download-center">
      <div className="download-header">
        <button className="back-button" onClick={() => navigate("/")}>
          ← 返回
        </button>
        <h2>软件/固件下载中心</h2>
      </div>

      <div className="tabs">
        <button
          className={`tab-button ${activeTab === "app" ? "active" : ""}`}
          onClick={() => setActiveTab("app")}
        >
          App版本
        </button>
        <button
          className={`tab-button ${activeTab === "firmware" ? "active" : ""}`}
          onClick={() => setActiveTab("firmware")}
        >
          固件版本
        </button>
      </div>

      {loading ? (
        <div className="loading">正在获取版本信息...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <div className="version-info">
          {activeTab === "app" ? (
            <>
              <div className="current-version">
                <h3>当前App版本</h3>
                <p>{currentAppVersion}</p>
              </div>

              {latestAppVersion && (
                <div className="latest-version">
                  <h3>最新App版本</h3>
                  <p className="version-number">{latestAppVersion.version}</p>
                  <p className="release-date">
                    发布日期: {latestAppVersion.releaseDate}
                  </p>
                  <p className="description">{latestAppVersion.description}</p>

                  {hasNewAppVersion ? (
                    <div className="update-notification">
                      <p className="update-message">发现新版本！</p>
                      <a
                        href={latestAppVersion.downloadUrl}
                        className="download-button"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        下载最新版本
                      </a>
                    </div>
                  ) : (
                    <p className="up-to-date">您的App已是最新版本</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="current-version">
                <h3>当前固件版本</h3>
                <p>{currentFirmwareVersion}</p>
                <h3>预载固件版本</h3>
                <p>{preloadedFirmwareVersion}</p>
              </div>

              {latestFirmwareVersion && (
                <div className="latest-version">
                  <h3>最新固件版本</h3>
                  <p className="version-number">
                    {latestFirmwareVersion.version}
                  </p>
                  <p className="release-date">
                    发布日期: {latestFirmwareVersion.releaseDate}
                  </p>
                  <p className="description">
                    {latestFirmwareVersion.description}
                  </p>

                  {hasNewFirmwareVersion ? (
                    <div className="update-notification">
                      <p className="update-message">发现新固件版本！</p>
                      {upgrading ? (
                        <div className="upgrade-progress">
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{ width: `${upgradeProgress}%` }}
                            ></div>
                          </div>
                          <p className="progress-text">
                            升级中: {upgradeProgress}%
                          </p>
                        </div>
                      ) : (
                        <>
                          {preloadedFirmwareVersion !== latestFirmwareVersion.version ? (
                            <button
                              className="upgrade-button"
                              onClick={handleFirmwareUpgrade}
                            >
                              在线升级固件
                            </button>
                          ) : (
                            <p className="up-to-date">预载固件已是最新版本</p>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="up-to-date">您的固件已是最新版本</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DownloadCenter;