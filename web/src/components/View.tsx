import React, { useState, useEffect, useContext, useRef } from "react";
import DebugPanel from "./DebugPanel";
import { useNavigate } from "react-router-dom";
import "./View.css";
import ConfigModal from "./ConfigModal";
import PointCloud, { PointCloudRef } from "./PointCloud"; // 导入PointCloud组件和PointCloudRef类型
import BatteryIndicator from "./BatteryIndicator"; // 导入电池指示器组件
import ConnectionControl from "./ConnectionControl"; // 导入连接控制组件
import { ROSContext } from "../App"; // 导入ROS上下文
import rosService from "../services/ROSService";
import * as ROSLIB from "roslib";
import { customPrompt } from "../utils/customAlert"; // 导入customPrompt
import GimbalControlModal from "./GimbalControlModal";
import CameraControlModal from "./CameraControlModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSatellite } from "@fortawesome/free-solid-svg-icons";

// 标准 ROS sensor_msgs/NavSatFix 消息类型
type RtkGnssMessage = {
  status?: {
    status?: number;
    service?: number;
  };
  position_covariance?: number[];
  position_covariance_type?: number;
};

// 根据 status.status 判断 RTK 解状态
// -1: 无解, 0: 单点解, 1: 差分解, 2: RTK固定解
const getRtkStatusLabel = (message: RtkGnssMessage) => {
  const status = message.status?.status;

  if (typeof status === "number") {
    if (status < 0) {
      return "无解";
    }
    if (status === 2) {
      return "固定解";
    }
    if (status === 1) {
      return "差分解";
    }
    // status === 0 或其他
    return "单点解";
  }

  return "未知";
};

const View = () => {
  const navigate = useNavigate();

  // useState
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0.0);
  const [storageSpace, setStorageSpace] = useState("");
  const [rtkStatus, setRtkStatus] = useState("无解");
  const [satelliteCount, setSatelliteCount] = useState<number | null>(null);
  const [signalStrength, setSignalStrength] = useState(4);
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [dataCollecting, setDataCollecting] = useState(true);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isGimbalModalOpen, setIsGimbalModalOpen] = useState(false);
  const [isCameraControlModalOpen, setIsCameraControlModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deviceType, setDeviceType] = useState<string | null>(null);
  const [isImageMaximized, setIsImageMaximized] = useState(false);

  // useContext
  const { connectToROS, disconnectROS, rosServerIp } = useContext(ROSContext);

  // 添加引用
  const batteryListenerRef = useRef<ROSLIB.Topic | null>(null);
  const storageListenerRef = useRef<ROSLIB.Topic | null>(null);
  const elapsedTimeListenerRef = useRef<ROSLIB.Topic | null>(null);
  const keyframeImageListenerRef = useRef<ROSLIB.Topic | null>(null);
  const driverStatusListenerRef = useRef<ROSLIB.Topic | null>(null);
  const rtkGnssListenerRef = useRef<ROSLIB.Topic | null>(null);
  const rtkSatellitesListenerRef = useRef<ROSLIB.Topic | null>(null);
  const keyframeCanvasRef = useRef<HTMLCanvasElement>(null);
  const panoramaPreviewRef = useRef<HTMLDivElement>(null);
  const pointCloudRef = useRef<PointCloudRef>(null); // 添加PointCloud组件的引用
  const hasSetPreviewWidthRef = useRef(false);

  // 监听ROS连接状态变化
  useEffect(() => {
    const unsubscribe = rosService.onConnectionChange((status) => {
      if (status === "connected") {
        setupSubscribers();
        // 连接成功后获取设备类型
        fetchDeviceType();
      } else {
        cleanupSubscribers();
        setDeviceType(null);
      }
    });

    // 如果已连接，立即设置订阅
    if (rosService.isConnected()) {
      setupSubscribers();
      fetchDeviceType();
    }

    // 组件卸载时清理资源
    return () => {
      unsubscribe();
      cleanupSubscribers();
    };
  }, []);

  // 获取设备类型
  const fetchDeviceType = async () => {
    try {
      const deviceTypeValue = await rosService.getParam('/device_type');
      console.log('Device type:', deviceTypeValue);
      setDeviceType(deviceTypeValue);
    } catch (error) {
      console.error('Failed to get device type:', error);
      setDeviceType(null);
    }
  };

  // 判断是否显示云台控制（edu-scan 或无参数时显示，D360 时不显示）
  const shouldShowGimbalControl = () => {
    // 如果 deviceType 为 null（参数不存在）或 'edu-scan'，显示云台控制
    // 如果 deviceType 为 'D360'，不显示云台控制
    return deviceType !== 'D360';
  };

  // 设置订阅
  const setupSubscribers = () => {
    cleanupSubscribers();

    try {
      if (rosService.isConnected()) {
        // 订阅电池状态
        batteryListenerRef.current = rosService.subscribeTopic(
          "/battery",
          "sensor_msgs/BatteryState",
          (message: any) => {
            // console.log("收到电池状态消息:", message);
            setBatteryLevel(message.percentage * 100);
          }
        );

        // 订阅U盘内存
        storageListenerRef.current = rosService.subscribeTopic(
          "/storage",
          "std_msgs/String",
          (message: any) => {
            // console.log("收到U盘内存:", message);
            setStorageSpace(message.data);
          }
        );

        // 订阅任务时长
        elapsedTimeListenerRef.current = rosService.subscribeTopic(
          "/project_duration",
          "std_msgs/Float64",
          (message: any) => {
            // console.log("收到任务时长:", message);
            setElapsedTime(message.data);
          }
        );

        // 订阅缩略图 keyframe image
        keyframeImageListenerRef.current = rosService.subscribeTopic(
          "/keyframe",
          "sensor_msgs/CompressedImage",
          (message: any) => {
            // 检查是否启用图片处理
            if (!config.processImages) {
              return; // 如果未启用图片处理，直接返回
            }

            // console.log(keyframeCanvasRef);
            if (keyframeCanvasRef.current) {
              const canvas = keyframeCanvasRef.current as HTMLCanvasElement;
              // 检查元素是否存在
              if (!canvas) {
                throw new Error('Canvas element with id "panorama" not found.');
              }

              // 检查是否为 Canvas 元素
              if (!(canvas instanceof HTMLCanvasElement)) {
                throw new Error('Element with id "panorama" is not a canvas.');
              }

              try {
                if (message.format.includes("jpeg") || message.format === "png") {
                  const image = new Image();
                  image.src =
                    "data:image/" + message.format + ";base64," + message.data;
                  image.onload = function () {
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const ctx = canvas.getContext("2d");
                    ctx?.drawImage(image, 0, 0, image.width, image.height);

                    // 根据图像长宽比动态调整预览窗口宽度（高度保持不变）
                    if (panoramaPreviewRef.current && !panoramaPreviewRef.current.classList.contains("maximized") && !hasSetPreviewWidthRef.current) {
                      const container = panoramaPreviewRef.current;
                      const containerHeight = container.clientHeight;
                      const aspectRatio = image.width / image.height;
                      container.style.setProperty("--preview-width", `${Math.round(containerHeight * aspectRatio)}px`);
                      hasSetPreviewWidthRef.current = true;
                    }
                  };
                }
              } catch (error) {
                console.error("Error processing keyframe image:", error);
              }
            }
          }
        );

        // 订阅系统状态
        // 对应 avia_cam_slam SystemMonitor.py 的 driver_status 位定义:
        // bit 0: LiDAR, bit 1: CAM, bit 2: SLAM, bit 3: SD (U盘), bit 4: RTK
        // RTK 状态通过文本(无解/浮点解/固定解)显示，不需要指示灯
        driverStatusListenerRef.current = rosService.subscribeTopic(
          "/driver_status",
          "std_msgs/UInt8",
          (message: any) => {
            // console.log("收到系统状态:", message);
            const data = message.data;
            
            // 解析 driver_status 位定义 (与 SystemMonitor.py 保持一致)
            // 8 bits: [7:5]保留, [4]RTK, [3]SD, [2]SLAM, [1]CAM, [0]LiDAR
            const lidarActive = (data >> 0) & 0x01;
            const camActive = (data >> 1) & 0x01;
            const slamActive = (data >> 2) & 0x01;
            // RTK 状态通过文本显示，不需要指示灯

            setSystemStatus({
              lidar: {
                status: lidarActive ? "active" : "warning",
                label: "LiDAR",
              },
              cam: {
                status: camActive ? "active" : "warning",
                label: "CAM",
              },
              slam: {
                status: slamActive ? "active" : "warning",
                label: "SLAM",
              },
            });
          }
        );

        // 订阅RTK状态
        rtkGnssListenerRef.current = rosService.subscribeTopic<RtkGnssMessage>(
          "rtk/gnss",
          "sensor_msgs/NavSatFix",
          (message) => {
            setRtkStatus(getRtkStatusLabel(message));
          }
        );

        // 订阅RTK卫星数量
        rtkSatellitesListenerRef.current = rosService.subscribeTopic(
          "/rtk/satellites",
          "std_msgs/UInt8",
          (message: any) => {
            setSatelliteCount(message.data);
          }
        );
      }
    } catch (error) {
      console.error("设置电池状态订阅时出错:", error);
    }
  };

  // 清理订阅
  const cleanupSubscribers = () => {
    if (batteryListenerRef.current) {
      rosService.unsubscribeTopic(batteryListenerRef.current);
      batteryListenerRef.current = null;
    }

    if (storageListenerRef.current) {
      rosService.unsubscribeTopic(storageListenerRef.current);
      storageListenerRef.current = null;
    }

    if (elapsedTimeListenerRef.current) {
      rosService.unsubscribeTopic(elapsedTimeListenerRef.current);
      elapsedTimeListenerRef.current = null;
    }

    if (keyframeImageListenerRef.current) {
      rosService.unsubscribeTopic(keyframeImageListenerRef.current);
      keyframeImageListenerRef.current = null;
    }

    if (driverStatusListenerRef.current) {
      rosService.unsubscribeTopic(driverStatusListenerRef.current);
      driverStatusListenerRef.current = null;
    }

    if (rtkGnssListenerRef.current) {
      rosService.unsubscribeTopic(rtkGnssListenerRef.current);
      rtkGnssListenerRef.current = null;
    }

    if (rtkSatellitesListenerRef.current) {
      rosService.unsubscribeTopic(rtkSatellitesListenerRef.current);
      rtkSatellitesListenerRef.current = null;
    }
  };

  const handleToggleConnection = () => {
    if (rosService.isConnected()) {
      disconnectROS();
    } else {
      connectToROS(`ws://${rosServerIp}:9090`);
    }
  };

  // 添加系统状态
  // 对应 avia_cam_slam SystemMonitor.py 的 driver_status 位定义:
  // bit 0: LiDAR, bit 1: CAM, bit 2: SLAM, bit 3: SD (U盘), bit 4: RTK
  // RTK 状态通过文本(无解/浮点解/固定解)显示，不需要指示灯
  const [systemStatus, setSystemStatus] = useState({
    lidar: { status: "warning", label: "LiDAR" },
    cam: { status: "warning", label: "CAM" },
    slam: { status: "warning", label: "SLAM" },
  });

  // 其他状态保持不变
  const [config, setConfig] = useState({
    resolution: "high",
    frameRate: "30",
    pointSize: 0.1,
    colorMode: "height",
    autoSave: false,
    saveInterval: 60,
    showDebugPanel: false,
    processImages: true, // 添加图片处理开关，默认开启
    showStats: true, // 添加showStats配置项
    maxPointNumber: 3000000, // 添加showStats配置项
    rtkHost: "",
    rtkPort: "2101",
    rtkUser: "",
    rtkPassword: "",
    rtkMountPoint: "",
  });

  // 添加debugInfo状态
  const [debugInfo, setDebugInfo] = useState({
    fps: 0,
    pointCount: 0,
    pointsLength: 0,
    isWorkerSupported: false,
    isWorkerLoaded: false,
    decodedWith: '',
    cameraPosition: { x: 0, y: 0, z: 0 },
    controlsTarget: { x: 0, y: 0, z: 0 },
    pose: { x: 0, y: 0, z: 0 },
  });

  // 添加更新debugInfo的回调函数
  const handleDebugInfoUpdate = (newDebugInfo: any) => {
    setDebugInfo(newDebugInfo);
  };

  // 添加相机视角状态
  const [cameraMode, setCameraMode] = useState("firstPerson"); // 默认第三人称视角

  // 切换相机视角函数
  const toggleCameraMode = () => {
    setCameraMode(cameraMode === "firstPerson" ? "thirdPerson" : "firstPerson");
  };

  // 当配置变化时重新设置订阅
  // useEffect(() => {
  //   if (rosService.isConnected()) {
  //     setupSubscribers();
  //   }
  // }, [config.processImages]); // 仅在processImages变化时重新设置订阅

  const toggleRecording = async (enable: boolean = !isRecording) => {
    
    // 生成当前时间戳作为项目名称
    const now = new Date();
    let project_name = now.getFullYear().toString() + '-' +
      (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
      now.getDate().toString().padStart(2, '0') + '_' +
      now.getHours().toString().padStart(2, '0') + '-' +
      now.getMinutes().toString().padStart(2, '0') + '-' +
      now.getSeconds().toString().padStart(2, '0');
    
    if (enable) {
      // 清除点云和轨迹数据
      console.log("开始新项目，清除点云和轨迹数据");
      pointCloudRef.current?.clearAllData();
      
      // pop up a prompt to input project name
      const userInput = await customPrompt("请输入项目名称", "", project_name);
      console.log("userInput:", userInput);
      if (userInput) {
        project_name = userInput;
      }
      else{
        return;
      }
    }

    setIsRecording(enable);
    
    try {
      await rosService
        .callService<{params: string;}, { success: boolean; message: string }>
        ("/project_control", "device_control/Base",
          {
          params: enable ? `${project_name}/start_device` : `${project_name}/stop_device`,
          }
        );
      console.log("project_control 调用完成");
    } catch (error) {
      console.error("服务调用失败:", error);
    }
  };

  const openConfigModal = () => {
    setIsConfigModalOpen(true);
  };

  const closeConfigModal = () => {
    setIsConfigModalOpen(false);
  };

  const openGimbalModal = () => setIsGimbalModalOpen(true);
  const closeGimbalModal = () => setIsGimbalModalOpen(false);

  const openCameraControlModal = () => setIsCameraControlModalOpen(true);
  const closeCameraControlModal = () => setIsCameraControlModalOpen(false);

  const saveConfig = (newConfig: any) => {
    setConfig(newConfig);
    console.log("保存配置:", newConfig);
    // 这里可以添加将配置保存到后端或本地存储的逻辑
  };

  return (
    <div className="view-container">
      {/* 顶部状态栏 */}
      <div className="status-bar">
        <div className="left-controls">
          <button className="back-button" onClick={() => navigate("/")}>
            &lt; 返回
          </button>
          {/* 添加电池指示器和连接控制组件 */}
          {/* <div className="status-item">
            <BatteryIndicator percentage={batteryLevel} />
          </div> */}
          <div className="status-item">
            <ConnectionControl
              isConnected={rosService.isConnected()}
              onToggleConnection={handleToggleConnection}
            />
          </div>

          <div
            className={`collectiong-status-indicator ${
              (systemStatus.slam.status === "active" || elapsedTime > 0.001)
                ? "active"
                : ""
            }`}
          >
            {(systemStatus.slam.status === "active" || elapsedTime > 0.001)
              ? "采集中"
              : "等待中"}
          </div>

          {/* 添加系统状态指示器 */}
          <div className="system-status-container">
            {Object.entries(systemStatus).map(([key, value]) => (
              <div key={key} className="system-status-item">
                <div
                  className={`system-status-indicator ${value.status}`}
                ></div>
                <span className="system-status-label">{value.label}</span>
              </div>
            ))}
            {/* U盘状态：根据内存判断，内存为0表示未插U盘 */}
            <div className="system-status-item">
              {storageSpace && storageSpace !== "0G/0G" ? (
                <span className="status-value storage-info">
                  {storageSpace}
                </span>
              ) : (
                <span className="status-value storage-info" style={{color: '#F44336'}}>
                  未插U盘
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="status-info">
          <div className="status-item">
            <span className="status-value">{`${Math.floor(Number(elapsedTime)/60)}:${(Number(elapsedTime)%60).toFixed(0).padStart(2,'0')}`}</span>
          </div>
          <div className="status-item status-item-rtk">
            <span className={`status-value rtk-status-chip ${rtkStatus}`}>
              {rtkStatus}
            </span>
            <div className="satellite-icon-wrapper">
              <FontAwesomeIcon
                icon={faSatellite}
                className="satellite-icon"
              />
              <span className="satellite-badge">
                {satelliteCount !== null ? satelliteCount : "0"}
              </span>
            </div>
          </div>
          {/* <div className="status-item">
            <div className="signal-strength">
              {Array(5)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className={`signal-bar ${
                      i < signalStrength ? "active" : ""
                    }`}
                  ></div>
                ))}
            </div>
          </div> */}
          <div className="status-item">
            <div 
              className="battery-indicator"
              data-level={
                batteryLevel <= 20 ? "low" : 
                batteryLevel <= 50 ? "medium" : "high"
              }
            >
              <div
                className="battery-level"
                style={{ width: `${batteryLevel}%` }}
              >
                {" "}
              </div>
              <span className="battery-text" style={{color: "white"}}>{Math.floor(batteryLevel)}</span>
            </div>
          </div>
          <button className="settings-button" onClick={openConfigModal}>
            ⚙️
          </button>
        </div>
      </div>

      {/* 主视图区域 - 点云数据 */}
      <div className="main-view">
        {/* 集成PointCloud组件 */}
        <div className="point-cloud-container">
          <>
            {config.showDebugPanel && <DebugPanel debugInfo={debugInfo} />}
            <PointCloud
              ref={pointCloudRef}
              url={`ws://${rosServerIp}:9090`}
              topic="/point_cloud"
              width={1200}
              height={800}
              pointSize={Number(config.pointSize)}
              colorMode={config.colorMode}
              cameraMode={cameraMode}
              showStats={config.showStats}
              maxPointNumber={Number(config.maxPointNumber)}
              key="point-cloud"
              onDebugInfoUpdate={handleDebugInfoUpdate}
              onClearData={() => console.log("点云数据已清除")}
            />
          </>
        </div>

        {/* 中心标记 */}
        {/* <div className="center-marker"></div> */}

        {/* 全景预览窗口 */}
        <div
          className={`panorama-preview ${isImageMaximized ? "maximized" : ""}`}
          ref={panoramaPreviewRef}
          onClick={() => setIsImageMaximized((v) => !v)}
        >
          {<canvas className="panorama-image" ref={keyframeCanvasRef}></canvas>}
          {/* <div className="panorama-image">
            {<canvas id="panorama"></canvas>}
          </div> */}
        </div>

        {/* 右侧功能按钮 */}
        <div className="right-controls">
          {/* 添加状态按钮 */}
          <button
            // className={`status-button ${
            //   (systemStatus.lidar.status === "active" || systemStatus.cam.status === "active")
            //     ? "stop"
            //     : elapsedTime > 0.001 && elapsedTime < 60
            //     ? "waiting"
            //     : "start"
            // }`}
            className={`status-button ${
              isSaving
                ? "waiting"
                : (systemStatus.slam.status === "active" || elapsedTime > 0.001)
                ? "stop"
                : "start"
            }`}
            onClick={() => {
              const buttonClass = (systemStatus.slam.status === "active" || elapsedTime > 0.001)
                ? "stop"
                : "start";

              if (buttonClass === "start") {
                console.log("开始操作");
                toggleRecording(true);
              } else if (buttonClass === "stop") {
                console.log("停止操作");

                // 设置为等待状态
                setIsSaving(true);

                toggleRecording(false).finally(() => {
                  // 恢复正常状态
                  setIsSaving(false);
                });
              } else {
                console.log("系统正在准备中，执行停止操作");
                toggleRecording(false);
              }
            }}
          >
            <span className="status-icon"></span>
          </button>
           {/* 添加切换相机视角按钮 */}
           <button
            className={`camera-mode-button ${cameraMode}`}
            onClick={toggleCameraMode}
            title={
              cameraMode === "firstPerson"
                ? "切换到第三人称视角"
                : "切换到自由模式"
            }
          >
            <span className="camera-mode-icon">
              {cameraMode === "firstPerson" ? (
                <div className="eye-icon"></div>
              ) : (
                <div className="video-icon"></div>
              )}
            </span>
          </button>

          {/* <button
            className={`record-button ${isRecording ? "recording" : ""}`}
            onClick={toggleRecording}
          >
            <span className="record-icon"></span>
          </button> */}
          {/* <button className="location-button">
            <span className="location-icon"></span>
          </button> */}
          {shouldShowGimbalControl() && (
            <button className="gimbal-button" onClick={openGimbalModal}> 
              <span className="gimbal-icon"></span>
            </button>
          )}
          <button className="camera-control-button" onClick={openCameraControlModal} title="相机控制">
            <span className="camera-control-icon"></span>
          </button>
         
        </div>
      </div>

      {/* 底部进度条 */}
      {/* <div className="progress-bar">
        <div className="progress-indicator"></div>
      </div> */}

      {/* 配置弹窗 */}
      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={closeConfigModal}
        onSave={saveConfig}
        initialConfig={config}
      />
      {shouldShowGimbalControl() && (
        <GimbalControlModal
          isOpen={isGimbalModalOpen}
          onClose={closeGimbalModal}
        />
      )}
      <CameraControlModal
        isOpen={isCameraControlModalOpen}
        onClose={closeCameraControlModal}
      />
    </div>
  );
};

export default View;