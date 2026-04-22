import React, { useState, useEffect, useCallback, useContext } from "react";
import "./FirmwareDialog.css";
import rosService from "../services/ROSService";
import { customAlert, customPrompt } from "../utils/customAlert";
import { ROSContext } from "../App";

// 声明Android接口
declare global {
  interface Window {
    Android?: {
      getDownloadedFirmwareFiles: () => string;
      readFileContent: (filePath: string) => any;
      uploadFile: (filePath: string, serverUrl: string) => any;
    };
  }
}

// 访问Android对象的安全方法
const getAndroid = () => {
  if (typeof window !== "undefined" && window.Android) {
    return window.Android;
  }
  return undefined;
};

// 固件弹窗组件接口
interface FirmwareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentAppVersion: string;
}

function FirmwareDialog({
  isOpen,
  onClose,
  currentAppVersion,
}: FirmwareDialogProps) {
  const [appLatestVersion, setAppLatestVersion] = useState("0.0.0"); // 默认版本，将通过API更新
  const [appLatestFilename, setAppLatestFilename] = useState("");
  const [firmwareDownloadStarted, setFirmwareDownloadStarted] = useState(false);
  const [firmwareDownloadProgress, setFirmwareDownloadProgress] = useState(0);
  const [firmwareUploadStarted, setFirmwareUploadStarted] = useState(false);
  const [firmwareUploadProgress, setFirmwareUploadProgress] = useState(0);
  const [localLatestVersion, setLocalLatestVersion] = useState<string>("");
  const [localFirmwarePath, setLocalFirmwarePath] = useState<string>("");

  const [hardwareLatestVersion, setHardwareLatestVersion] = useState("0.0.0"); // 默认固件版本，将通过API更新
  const [hardwareLatestFilename, setHardwareLatestFilename] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("未知"); // 设备固件版本
  // useContext
  const { connectToROS, disconnectROS, rosServerIp } = useContext(ROSContext);
  // 获取App和固件最新版本信息；读取本地固件文件列表并提取最新版本号
  useEffect(() => {
    if (isOpen) {
      fetchAppLatestVersion();
      fetchHardwareLatestVersion();
      fetchFirmwareFiles();
      // 自动获取设备固件版本
      getFirmwareVersion();
    }
  }, [isOpen]);

  // 固件下载进度由 Android native 回调驱动，不模拟

  // 清理上传状态
  useEffect(() => {
    return () => {
      // 组件卸载时取消所有进行中的上传
      setFirmwareUploadStarted(false);
      setFirmwareUploadProgress(0);
    };
  }, []);

  // 优化：只在需要时获取版本信息
  const fetchVersions = useCallback(() => {
    fetchAppLatestVersion();
    fetchHardwareLatestVersion();
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();

      const handleDownloadStart = (fileName: string, totalSize: number) => {
        try {
          console.log("下载开始:", fileName, "总大小:", totalSize);
          setFirmwareDownloadStarted(true);
          setFirmwareDownloadProgress(0);
        } catch (error) {
          console.error("处理下载开始出错:", error);
        }
      };

      const handleDownloadProgress = (
        fileName: string,
        progress: number,
        bytesDownloaded: number,
        bytesTotal: number
      ) => {
        try {
          console.log(
            fileName + "下载进度: " + progress + "%",
            "已下载大小:",
            bytesDownloaded,
            "总大小:",
            bytesTotal
          );
          setFirmwareDownloadProgress(progress);
        } catch (error) {
          console.error("处理下载进度出错:", error);
        }
      };

      const handleDownloadComplete = (
        fileName: string,
        localUri: string,
        success: boolean,
        errorMessage: string
      ) => {
        try {
          console.log("下载完成:", fileName);
          setFirmwareDownloadStarted(false);
          setFirmwareDownloadProgress(100);

          fetchFirmwareFiles();

          // 从文件名中提取版本号
          // const versionMatch = fileName.match(
          //   /slamibotfull_v([0-9]+\.[0-9]+\.[0-9]+)\.ibot/
          // );

          // if (versionMatch && versionMatch[1]) {
          //   const newVersion = versionMatch[1];
          //   console.log("提取到版本号:", newVersion);

          //   // 验证版本号格式
          //   if (/^\d+\.\d+\.\d+$/.test(newVersion)) {
          //     console.log("更新预载版本号为:", newVersion);
          //     setLocalLatestVersion(newVersion);

          //     // 自动选择新下载的文件
          //     setSelectedFirmwareFile({
          //       name: fileName,
          //       path: localUri, // 假设路径与文件名相同
          //       size: 0,
          //       lastModified: new Date(),
          //     });
          //   } else {
          //     console.error("无效的版本号格式:", newVersion);
          //   }
          // } else {
          //   console.warn("无法从文件名提取版本号:", fileName);
          // }

          setTimeout(() => setFirmwareDownloadProgress(0), 1000); // 短暂显示完成状态
        } catch (error) {
          console.error("处理下载完成出错:", error);
          setFirmwareDownloadStarted(false);
          setFirmwareDownloadProgress(0);
        }
      };

      const handleDownloadError = (fileName: string, error: string) => {
        console.error("下载出错:", fileName, error);
        setFirmwareDownloadStarted(false);
        setFirmwareDownloadProgress(0);
        alert(`下载 ${fileName} 失败: ${error}`);
      };

      // 设置下载回调
      window.onDownloadStart = handleDownloadStart;
      window.onDownloadProgress = handleDownloadProgress;
      window.onDownloadComplete = handleDownloadComplete;
      window.onDownloadError = handleDownloadError;

      window.onUploadStart = (fileName: string, totalSize: number) => {
        try {
          console.log("上传开始:", fileName, "总大小:", totalSize);
          setFirmwareUploadStarted(true);
          setFirmwareUploadProgress(0);
        } catch (error) {
          console.error("处理上传开始出错:", error);
        }
      };

      window.onUploadProgress = (
        fileName: string,
        progress: number,
        bytesUploaded: number,
        bytesTotal: number
      ) => {
        try {
          console.log("上传进度:", fileName, "已上传大小:", bytesUploaded);
          // 计算百分比进度
          // const progress = Math.round((uploadedSize / 100) * 100); // 假设totalSize是100
          setFirmwareUploadProgress(progress);
        } catch (error) {
          console.error("处理上传进度出错:", error);
        }
      };

      window.onUploadComplete = (
        fileName: string,
        success: boolean,
        errorMessage: string
      ) => {
        try {
          console.log("上传完成:", fileName);

          setFirmwareUploadStarted(false);
          setFirmwareUploadProgress(100);

          // setTimeout(() => setFirmwareUploadProgress(0), 1000); // 短暂显示完成状态
          if (success) {
            customAlert("上传成功");
          } else {
            customAlert("上传失败");
          }
        } catch (error) {
          console.error("处理上传完成出错:", error);
          setFirmwareUploadStarted(false);
          setFirmwareUploadProgress(0);
        }
      };
      const Android = getAndroid();
      if (!Android) {
        console.error("Android接口未定义");
        return;
      }
      // 清理函数
      return () => {
        window.onDownloadStart = undefined;
        window.onDownloadProgress = undefined;
        window.onDownloadComplete = undefined;
        window.onDownloadError = undefined;
        window.onUploadStart = undefined;
        window.onUploadProgress = undefined;
        window.onUploadComplete = undefined;
      };
    }
  }, [isOpen, fetchVersions]);

  // 语义化版本号比较：a < b 返回负数，a === b 返回 0，a > b 返回正数
  const compareVersions = (a: string, b: string): number => {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      if (aPart !== bPart) return aPart - bPart;
    }
    return 0;
  };

  // 处理APP下载
  const handleAppDownload = () => {
    if (!appLatestFilename) {
      customAlert("暂无可用App版本", "提示");
      return;
    }
    window.open(
      `http://101.42.4.41:5001/download/app/${appLatestFilename}`
    );
  };

  // // 处理固件下载
  // const handleFirmwareDownload = useCallback(() => {
  //   try {
  //     window.open();
  //     // const downloadUrl = `http://192.168.1.11:8080/slamibotfull_v${hardwareLatestVersion}.ibot`;
  //     const downloadUrl = `http://101.42.4.41:5001/download/hardware/slamibotfull_v${hardwareLatestVersion}.ibot`;

  //     console.log("开始下载固件:", downloadUrl);

  //     // 触发下载
  //     const link = document.createElement("a");
  //     link.href = downloadUrl;
  //     link.download = `slamibotfull_v${hardwareLatestVersion}.ibot`;
  //     document.body.appendChild(link);
  //     link.click();
  //     document.body.removeChild(link);

  //     // 状态将在window.onDownloadStart回调中更新
  //   } catch (error) {
  //     console.error("下载初始化失败:", error);
  //     setFirmwareDownloadStarted(false);
  //     setFirmwareDownloadProgress(0);
  //     alert("下载初始化失败，请检查网络连接");
  //   }
  // }, [hardwareLatestVersion]);

  // 处理固件下载
  const handleFirmwareDownload = () => {
    if (!hardwareLatestFilename || hardwareLatestVersion === "0.0.0") {
      customAlert("暂无可用固件版本", "提示");
      return;
    }
    window.open(
      `http://101.42.4.41:5001/download/hardware/${hardwareLatestFilename}`
    );
    setFirmwareDownloadStarted(true);
  };

  // 获取设备固件版本
  const getFirmwareVersion = async () => {
    try {
      // 调用服务并等待响应
      const response = await rosService.callService<{}, { success: boolean; message: string }>(
        "/get_version",
        "project_control/Base",
        {}
      );
      
      // 从message中提取版本号（格式："1.0.0|构建时间: 2025-07-19 15:42:04, Git: 3618e90 (main)"）
      const versionParts = response.message.split('|');
      const extractedVersion = versionParts[0].trim();
      
      // 更新设备固件版本
      setFirmwareVersion(extractedVersion);
      console.log("获取到设备固件版本:", extractedVersion);
      
      return extractedVersion;
    } catch (error: any) {
      console.error("获取固件版本失败:", error);
      setFirmwareVersion("获取失败");
      throw error;
    }
  };

  // 处理固件更新判断
  const handleFirmwareUpdate = async () => {
    try {
      // 获取最新的设备版本
      const currentDeviceVersion = await getFirmwareVersion();
      
      // 判断是否需要更新：设备版本 < 本地预载版本才更新
      if (compareVersions(currentDeviceVersion, localLatestVersion) < 0 && localLatestVersion) {
        console.log("设备固件版本低于预载版本，准备上传最新固件");
        // 开始固件上传
        await performFirmwareUpload();
      } else {
        customAlert("设备固件已是最新版本，无需更新", "提示");
      }
    } catch (error: any) {
      console.error("固件更新检查失败:", error);
      customAlert("固件更新检查失败，请重试", "错误");
    }
  };

  // 处理固件上传逻辑
  const performFirmwareUpload = async () => {
    try {
      const Android = getAndroid();
      if (!Android) {
        customAlert("Android接口未定义", "错误");
        return;
      }

      if (!localFirmwarePath) {
        customAlert("未找到本地固件文件，请先下载预载固件", "提示");
        return;
      }

      setFirmwareUploadStarted(true);
      setFirmwareUploadProgress(0);

      const fileName = localFirmwarePath.split('/').pop() || 'firmware.ibot';
      window.onUploadStart && window.onUploadStart(fileName, 0);

      const serverUrl = `http://${rosServerIp}:5001/upload`;
      console.log("开始上传文件到服务器:", serverUrl);

      const result = Android.uploadFile(localFirmwarePath, serverUrl);

      if (!result) {
        console.error("启动上传任务失败");
        setFirmwareUploadStarted(false);
        setFirmwareUploadProgress(0);
      }
    } catch (error: any) {
      console.error("固件上传失败:", error);
      setFirmwareUploadStarted(false);
      setFirmwareUploadProgress(0);
      customAlert("固件上传失败", "错误");
    }
  };



  // 获取App最新版本信息
  const fetchAppLatestVersion = async () => {
    try {
      const response = await fetch("http://101.42.4.41:5001/latest/app");
      const data = await response.json();
      if (data && data.latest_version) {
        setAppLatestVersion(data.latest_version);
        setAppLatestFilename(data.filename);
        console.log("获取到App最新版本:", data.latest_version);
      }
    } catch (error) {
      console.error("获取App版本信息失败:", error);
    }
  };

  // 获取固件最新版本信息
  const fetchHardwareLatestVersion = async () => {
    try {
      const response = await fetch("http://101.42.4.41:5001/latest/hardware");
      const data = await response.json();
      if (data && data.latest_version) {
        setHardwareLatestVersion(data.latest_version);
        setHardwareLatestFilename(data.filename);
        console.log("获取到固件最新版本:", data.latest_version);
      }
    } catch (error) {
      console.error("获取固件版本信息失败:", error);
    }
  };

  const fetchFirmwareFiles = async () => {
    try {
      const Android = getAndroid();
      if (!Android) {
        console.error("Android接口未定义");
        return;
      }

      const firmwareFilesJson = Android.getDownloadedFirmwareFiles();
      if (!firmwareFilesJson) {
        console.error("获取预载固件列表失败: 返回空数据");
        return;
      }

      const firmwareFiles = JSON.parse(firmwareFilesJson);
      if (!Array.isArray(firmwareFiles) || firmwareFiles.length === 0) {
        console.error("预载固件列表为空");
        return;
      }

      // 从多个固件中提取版本号并排序，取最新的一份
      const versionRegex = /slamibot(?:full)?_v([0-9]+\.[0-9]+\.[0-9]+)\.ibot/;
      const filesWithVersion = firmwareFiles
        .map((file: any) => {
          const match = file.name.match(versionRegex);
          return match ? { file, version: match[1] } : null;
        })
        .filter(Boolean) as Array<{ file: any; version: string }>;

      if (filesWithVersion.length === 0) {
        console.error("未从预载固件中提取到有效版本号");
        return;
      }

      // 按版本号降序排列，取最新
      const latest = filesWithVersion.sort((a, b) => {
        const aParts = a.version.split(".").map(Number);
        const bParts = b.version.split(".").map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const diff = (bParts[i] || 0) - (aParts[i] || 0);
          if (diff !== 0) return diff;
        }
        return 0;
      })[0];

      setLocalLatestVersion(latest.version);
      setLocalFirmwarePath(latest.file.path);
    } catch (error) {
      console.error("获取本地固件文件列表失败:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="dialog-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        className="dialog-content"
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
          width: "92%",
          maxWidth: "520px",
          minHeight: "400px",
          height: "auto",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "dialogFadeIn 0.3s ease-out",
        }}
      >
        <style>
          {`
            @keyframes dialogFadeIn {
              from { opacity: 0; transform: translateY(-20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}
        </style>
        <button
          className="close-button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            color: "#999",
            zIndex: 20,
            padding: "5px",
          }}
        >
          ×
        </button>
        <div
          className="dialog-content-inner"
          style={{
            padding: "15px",
            flex: 1,
            minHeight: "200px",
            overflowY: "auto",
          }}
        >
          <div style={{ textAlign: "left", lineHeight: 1.6 }}>
            <div
              style={{
                marginBottom: "15px",
                backgroundColor: "#f8f9fa",
                padding: "15px",
                borderRadius: "10px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <strong
                style={{
                  color: "#2c3e50",
                  fontSize: "16px",
                  display: "block",
                  marginBottom: "12px",
                  borderLeft: "3px solid #2196f3",
                  paddingLeft: "10px",
                }}
              >
                APP版本
              </strong>
              <div
                style={{
                  color: "#555",
                  fontSize: "14px",
                  paddingLeft: "5px",
                }}
              >
                <div style={{ marginBottom: "10px" }}>
                  当前版本: {currentAppVersion}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ marginRight: "15px" }}>
                    最新版本: {appLatestVersion}
                  </div>
                  <div>
                    {currentAppVersion !== appLatestVersion ? (
                      <button
                        onClick={handleAppDownload}
                        style={{
                          backgroundColor: "#2196f3",
                          color: "white",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "5px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: "500",
                          boxShadow: "0 2px 4px rgba(33,150,243,0.3)",
                          transition: "all 0.2s ease",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ marginRight: "4px" }}>⬇️</span> 下载
                      </button>
                    ) : (
                      <div
                        style={{
                          color: "#4caf50",
                          fontSize: "13px",
                          fontWeight: "500",
                          display: "flex",
                          alignItems: "center",
                          backgroundColor: "#f1f8e9",
                          padding: "6px 10px",
                          borderRadius: "5px",
                        }}
                      >
                        <span style={{ marginRight: "4px" }}>✓</span>{" "}
                        已是最新版本
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginBottom: "15px",
                backgroundColor: "#f8f9fa",
                padding: "15px",
                borderRadius: "10px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <strong
                style={{
                  color: "#2c3e50",
                  fontSize: "16px",
                  display: "block",
                  marginBottom: "12px",
                  borderLeft: "3px solid #66AC58",
                  paddingLeft: "10px",
                }}
              >
                固件版本
              </strong>
              <div
                style={{
                  color: "#555",
                  fontSize: "14px",
                  paddingLeft: "5px",
                }}
              >
                <div style={{ marginBottom: "10px" }}>
                  最新版本: {hardwareLatestVersion}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ marginRight: "15px" }}>
                    预载版本: {localLatestVersion || "本地无预载固件"}
                  </div>
                  <div>
                    {localLatestVersion !== hardwareLatestVersion ? (
                      firmwareDownloadStarted ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              width: "120px",
                              backgroundColor: "#e9ecef",
                              height: "10px",
                              borderRadius: "5px",
                              overflow: "hidden",
                              marginRight: "8px",
                              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)",
                            }}
                          >
                            <div
                              style={{
                                width: `${firmwareDownloadProgress}%`,
                                height: "100%",
                                backgroundColor: "#66AC58",
                                backgroundImage:
                                  "linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)",
                                backgroundSize: "20px 20px",
                                animation:
                                  "progress-bar-stripes 1s linear infinite",
                                transition: "width 0.3s",
                              }}
                            ></div>
                          </div>
                          <span
                            style={{
                              fontSize: "14px",
                              color: "#555",
                              fontWeight: "500",
                            }}
                          >
                            {firmwareDownloadProgress}%
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={handleFirmwareDownload}
                          style={{
                            backgroundColor: "#66AC58",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "5px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: "500",
                            boxShadow: "0 2px 4px rgba(102,172,88,0.3)",
                            transition: "all 0.2s ease",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ marginRight: "4px" }}>⬇️</span>{" "}
                          更新预载
                        </button>
                      )
                    ) : (
                      <div
                        style={{
                          color: "#4caf50",
                          fontSize: "13px",
                          fontWeight: "500",
                          display: "flex",
                          alignItems: "center",
                          backgroundColor: "#f1f8e9",
                          padding: "6px 10px",
                          borderRadius: "5px",
                        }}
                      >
                        <span style={{ marginRight: "4px" }}>✓</span> 已是最新
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ marginRight: "15px" }}>
                    设备版本: {firmwareVersion}
                  </div>
                  <div>
                    <button
                      onClick={handleFirmwareUpdate}
                      style={{
                        backgroundColor: "#3f51b5",
                        color: "white",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "5px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "500",
                        boxShadow: "0 2px 4px rgba(63,81,181,0.3)",
                        transition: "all 0.2s ease",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ marginRight: "4px" }}>📡</span> 更新固件
                    </button>
                  </div>
                </div>
              </div>

              {/* 固件上传进度 */}
              {firmwareUploadStarted && (
                <div
                  style={{
                    marginTop: "15px",
                    width: "100%",
                    backgroundColor: "#e8f5e9",
                    padding: "15px",
                    borderRadius: "8px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                    border: "1px solid #c8e6c9",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        color: "#2e7d32",
                        fontWeight: "500",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ marginRight: "8px" }}>📤</span> 上传进度
                    </span>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#2e7d32",
                        backgroundColor: "#c8e6c9",
                        padding: "3px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      {firmwareUploadProgress}%
                    </span>
                  </div>
                  <div
                    style={{
                      backgroundColor: "#c8e6c9",
                      height: "12px",
                      borderRadius: "6px",
                      overflow: "hidden",
                      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div
                      style={{
                        width: `${firmwareUploadProgress}%`,
                        height: "100%",
                        backgroundColor: "#66AC58",
                        backgroundImage:
                          "linear-gradient(45deg, rgba(255,255,255,.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.2) 50%, rgba(255,255,255,.2) 75%, transparent 75%, transparent)",
                        backgroundSize: "20px 20px",
                        animation:
                          "progress-bar-stripes 1s linear infinite",
                        transition: "width 0.3s ease",
                        boxShadow: "0 0 5px rgba(102,172,88,0.5)",
                      }}
                    ></div>
                  </div>
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "13px",
                      color: "#388e3c",
                      textAlign: "center",
                    }}
                  >
                    正在上传固件，请勿关闭应用...
                  </div>
                  <style>
                    {`
                      @keyframes progress-bar-stripes {
                        from { background-position: 20px 0; }
                        to { background-position: 0 0; }
                      }
                    `}
                  </style>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FirmwareDialog;