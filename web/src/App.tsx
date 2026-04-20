import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import "./App.css";
import View from "./components/View";
import DownloadCenter from "./components/DownloadCenter";
import ProjectManagement from "./components/ProjectManagement";
import ProjectDetail from "./components/ProjectDetail";
import UserGuide from "./components/UserGuide";
import FirmwareDialog from "./components/FirmwareDialog";
import { useNavigate } from "react-router-dom";
import rosService from "./services/ROSService";
import { getCurrentTimestamp } from "./utils/util";
import { customAlert, customPrompt } from "./utils/customAlert";

// 全局配置参数
// 根据环境变量获取ROS服务器地址，如果未设置则使用默认值
const DEFAULT_ROS_SERVER = process.env.REACT_APP_ROS_SERVER || "192.168.2.131";
// 当前App版本
const CURRENT_APP_VERSION = process.env.REACT_APP_CURRENT_VERSION || "1.5.0";

console.log(
  "当前ROS服务器地址:",
  DEFAULT_ROS_SERVER,
  "环境:",
  process.env.NODE_ENV,
  "当前App版本:",
  CURRENT_APP_VERSION
);

// ROS连接状态上下文
export const ROSContext = React.createContext({
  isConnected: false,
  connectToROS: (url: string) => {},
  disconnectROS: () => {},
  rosServerIp: DEFAULT_ROS_SERVER,
  setRosServerIp: (ip: string) => {},
});

function LoginPage() {
  const navigate = useNavigate();
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [showDownloadCenter, setShowDownloadCenter] = useState(false); // 控制下载中心弹窗的显示/隐藏
  const [showFirmwareDialog, setShowFirmwareDialog] = useState(false); // 控制固件弹窗的显示/隐藏
  const { connectToROS, rosServerIp, setRosServerIp } =
    React.useContext(ROSContext);
  
  // 模拟设备连接状态检查
  useEffect(() => {
    connectToROS(`ws://${rosServerIp}:9090`);
    // 监听ROS连接状态变化
    const unsubscribe = rosService.onConnectionChange((status) => {
      setIsDeviceConnected(status === "connected");
    });
    // 清理函数
    return () => {
      unsubscribe();
    };
  }, [rosServerIp]);
  
  // 获取App和固件最新版本信息
  useEffect(() => {
    // fetchAppLatestVersion();
    // fetchHardwareLatestVersion();
    // fetchPreloadedFirmwareVersion();
  }, []);

  const handleStart = () => {
    // if (isDeviceConnected) {
      navigate("/view");
    // }
  };

  return (
    <div className="login-container">
      <div className="top-right-buttons">
        {/* <button
          className="top-right-button"
          onClick={() => customAlert("隐私政策")}
          title="隐私政策"
        >
          ❓
        </button> */}
        <button
          className="top-right-button"
          onClick={() => customAlert(
            `<div style="text-align: left; line-height: 1.6; max-width: 350px;">
              <div style="margin-bottom: 15px;">
                <span style="font-size: 16px; margin-right: 8px;">�</span>
                <strong style="color: #2c3e50;">公司地址</strong>
                <div style="margin-left: 24px; color: #555; font-size: 13px; margin-top: 4px;">
                  上海嘉定区城北路 378 号 904 室
                </div>
              </div>
              
              <div style="margin-bottom: 15px;">
                <span style="font-size: 16px; margin-right: 8px;">📞</span>
                <strong style="color: #2c3e50;">联系电话</strong>
                <div style="margin-left: 24px; color: #555; font-size: 13px; margin-top: 4px;">
                  <a href="tel:13291407762" style="color: #3498db; text-decoration: none;">13291407762</a>
                </div>
              </div>
              
              <div style="margin-bottom: 15px;">
                <span style="font-size: 16px; margin-right: 8px;">🕒</span>
                <strong style="color: #2c3e50;">工作时间</strong>
                <div style="margin-left: 24px; color: #555; font-size: 13px; margin-top: 4px;">
                  周一至周五 9:00-18:00
                </div>
              </div>
            </div>`,
            ""
          )}
        >
          ✉️
        </button>
        <button
          className="top-right-button"
          onClick={() => {
            // 点击按钮时再次获取最新版本
            // fetchAppLatestVersion();
            // 显示固件弹窗
            setShowFirmwareDialog(true);
          }}
          title="软件/固件下载"
        >
          ⬇️
        </button>
        <button
          className="top-right-button"
          onClick={async () => {
            const ipAddress = await customPrompt(
              "", 
              "ROS IP地址设置", 
              rosServerIp, 
              "例如: 192.168.2.131"
            );
            if (ipAddress) {
              const url = `ws://${ipAddress}:9090`;
              // 更新全局IP地址
              setRosServerIp(ipAddress);
              connectToROS(url);
              console.log(`正在连接到ROS服务器: ${url}`);
            }
          }}
          title="连接ROS服务器"
        >
          🔌
        </button>
      </div>
      <h1>SLAMIBOT</h1>

      <div className="card-container horizontal">
        {/* 连接设备状态 */}
        <div
          className="card-button"
          onClick={() => {
            if (!rosService.isConnected()) {
              connectToROS(`ws://${rosServerIp}:9090`);
            }
          }}
        >
          <i
            className={`status-indicator ${
              isDeviceConnected ? "  status-connected" : "status-disconnected"
            }`}
          />
          <span>{isDeviceConnected ? "设备已连接" : "设备未连接"}</span>
        </div>

        {/* 项目管理按钮 */}
        <div className="card-button" onClick={() => navigate("/projects")}>
          <i>📊</i>
          <span>项目管理</span>
        </div>

        {/* 使用教程按钮 */}
        <div className="card-button" onClick={() => {
          navigate("/user-guide");
        }}>
          <i>📚</i>
          <span>使用教程</span>
        </div>

        {/* 文件管理按钮 */}
        {/* <div className="card-button" onClick={() => alert("打开文件管理")}>
          <i>📁</i>
          <span>文件管理</span>
        </div> */}

        {/* 开始作业按钮 */}
        <div
          className={`card-button ${!isDeviceConnected ? "disabled" : ""}`}
          onClick={handleStart}
        >
          <i>🚀</i>
          <span>{isDeviceConnected ? "开始作业" : "尚未连接设备"}</span>
        </div>
      </div>

      {/* 固件弹窗 */}
      <FirmwareDialog
        isOpen={showFirmwareDialog}
        onClose={() => setShowFirmwareDialog(false)}
        currentAppVersion={CURRENT_APP_VERSION}
      />
    </div>
  );
}

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [rosServerIp, setRosServerIp] = useState(DEFAULT_ROS_SERVER);

  async function callTimeSyncService() {
    try {
      // 调用服务并等待响应
      const promise = rosService.callService<
        { params: string },
        { success: boolean; message: string }
      >("/set_system_time", "metacam_node/TimeSync", {
        params: getCurrentTimestamp(),
      });

      promise
        .then((response: any) => {
          console.log(response);
          console.log("服务调用成功:", response, "系统时间已同步");
        })
        .catch((err) => {
          console.error(err);
        });
    } catch (error) {
      console.error("服务调用失败:", error);
    }
  }

  // 连接到ROS服务器
  const connectToROS = (url: string) => {
    // 使用rosService连接
    rosService.connect(url);

    // 监听连接状态变化
    rosService.onConnectionChange((status) => {
      setIsConnected(status === "connected");
      if (status === "connected") {
        setupSubscribers();
        // exampleServiceCall();
        callTimeSyncService();
      } else if (status === "disconnected" || status === "error") {
        cleanupSubscribers();
      }
    });
  };

  // 断开ROS连接
  const disconnectROS = () => {
    rosService.disconnect();
  };

  // 设置订阅
  const setupSubscribers = () => {
    cleanupSubscribers();
  };

  // 清理订阅
  const cleanupSubscribers = () => {};

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      cleanupSubscribers();
      disconnectROS();
    };
  }, []);

  return (
    <ROSContext.Provider
      value={{
        isConnected,
        connectToROS,
        disconnectROS,
        rosServerIp,
        setRosServerIp,
      }}
    >
      <Router>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/view" element={<View />} />
          <Route path="/projects" element={<ProjectManagement />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/user-guide" element={<UserGuide />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </ROSContext.Provider>
  );
}

export default App;