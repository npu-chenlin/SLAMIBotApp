import React, { useState, useRef, useEffect, useContext } from "react";
import "./CameraControlModal.css";
import rosService from "../services/ROSService";
import { ROSContext } from "../App";
import ROSLIB from "roslib";

interface CameraControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig?: any;
}

const CameraControlModal: React.FC<CameraControlModalProps> = ({
  isOpen,
  onClose,
  initialConfig = {},
}) => {
  // 预定义的值数组
  const exposureTimeValues = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 64, 50];
  const exposureLimitValues = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 64, 50, 40, 32, 25, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1];

  // 获取最接近的预设值
  const getClosestValue = (value: number, values: number[]): number => {
    if (values.includes(value)) return value;
    return values.reduce((prev, curr) => 
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
  };

  // 获取当前值在数组中的索引
  const getValueIndex = (value: number, values: number[]): number => {
    const numValue = Math.round(Number(value));
    
    let index = values.indexOf(numValue);
    if (index >= 0) {
      return index;
    }
    
    let closestIndex = 0;
    let minDiff = Math.abs(values[0] - numValue);
    
    for (let i = 1; i < values.length; i++) {
      const diff = Math.abs(values[i] - numValue);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    return closestIndex;
  };

  // 计算滑块位置
  const getSliderPosition = (field: string, value: number): number => {
    if (field === 'exposureTime') {
      const index = getValueIndex(value, exposureTimeValues);
      return index >= 0 ? index : 0;
    } else if (field === 'exposureLimit') {
      const index = getValueIndex(value, exposureLimitValues);
      return index >= 0 ? index : 0;
    } else if (field === 'gainValue') {
      return Math.max(0, Math.min(20, value));
    }
    return 0;
  };

  // 根据索引获取对应的数值
  const getValueByIndex = (field: string, index: number): number => {
    if (field === 'exposureTime') {
      return exposureTimeValues[Math.max(0, Math.min(exposureTimeValues.length - 1, index))];
    } else if (field === 'exposureLimit') {
      return exposureLimitValues[Math.max(0, Math.min(exposureLimitValues.length - 1, index))];
    } else if (field === 'gainValue') {
      return Math.max(0, Math.min(20, index));
    }
    return 0;
  };

  const [config, setConfig] = useState({
    exposureMode: initialConfig.exposureMode || "manual", // manual, auto_once, auto_continuous
    exposureTime: getClosestValue(initialConfig.exposureTime || 1000, exposureTimeValues),
    exposureLimit: getClosestValue(initialConfig.exposureLimit || 100, exposureLimitValues),
    whiteBalanceMode: initialConfig.whiteBalanceMode || "auto", // auto, manual
    redRatio: initialConfig.redRatio || 1000,
    greenRatio: initialConfig.greenRatio || 1000,
    blueRatio: initialConfig.blueRatio || 1000,
    gainMode: initialConfig.gainMode || "auto", // auto, manual
    gainValue: initialConfig.gainValue || 5,
  });

  // 图像预览相关状态
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const keyframeListenerRef = useRef<ROSLIB.Topic | null>(null);
  const { rosServerIp } = useContext(ROSContext);

  // 设置图像订阅
  const setupImageSubscription = () => {
    if (rosService.isConnected()) {
      try {
        keyframeListenerRef.current = rosService.subscribeTopic(
          "/keyframe",
          "sensor_msgs/CompressedImage",
          (message: any) => {
            try {
              if (message.format.includes("jpeg") || message.format === "png") {
                const imageSrc = "data:image/" + message.format + ";base64," + message.data;
                setPreviewImageSrc(imageSrc);
              }
            } catch (error) {
              console.error("Error processing keyframe image:", error);
            }
          }
        );
      } catch (error) {
        console.error("设置图像订阅时出错:", error);
      }
    }
  };

  // 清理图像订阅
  const cleanupImageSubscription = () => {
    if (keyframeListenerRef.current) {
      rosService.unsubscribeTopic(keyframeListenerRef.current);
      keyframeListenerRef.current = null;
    }
  };

  // 监听模态框打开/关闭状态
  useEffect(() => {
    if (isOpen) {
      setupImageSubscription();
    } else {
      cleanupImageSubscription();
      setPreviewImageSrc(null);
    }

    // 组件卸载时清理
    return () => {
      cleanupImageSubscription();
    };
  }, [isOpen]);

  // 滑动处理函数
  const handleSliderMouseDown = (e: React.MouseEvent, field: string) => {
    e.preventDefault();
    const handle = e.currentTarget;
    const track = handle.parentElement;
    if (!track) return;

    let lastValue: number | null = null;
    let serviceCallTimeout: NodeJS.Timeout | null = null;

    const handleSliderMove = (moveEvent: MouseEvent) => {
      const rect = track.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      
      let newValue: number;
      
      if (field === 'exposureTime') {
        const index = Math.max(0, Math.min(exposureTimeValues.length - 1, Math.round(percentage * (exposureTimeValues.length - 1))));
        newValue = getValueByIndex('exposureTime', index);
      } else if (field === 'exposureLimit') {
        const index = Math.max(0, Math.min(exposureLimitValues.length - 1, Math.round(percentage * (exposureLimitValues.length - 1))));
        newValue = getValueByIndex('exposureLimit', index);
      } else if (field === 'gainValue') {
        newValue = Math.max(0, Math.min(20, Math.round(percentage * 20)));
      } else {
        newValue = 0;
      }
      
      if (newValue === lastValue) {
        return;
      }
      lastValue = newValue;
      
      setConfig((prev: any) => ({ ...prev, [field]: newValue }));
      
      if (serviceCallTimeout) {
        clearTimeout(serviceCallTimeout);
      }
      
      serviceCallTimeout = setTimeout(() => {
        const syntheticEvent = {
          target: {
            name: field,
            value: newValue.toString(),
            type: 'range'
          }
        } as React.ChangeEvent<HTMLInputElement>;
        
        handleChange(syntheticEvent);
      }, 300);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleSliderMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleSliderMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSliderTouchStart = (e: React.TouchEvent, field: string) => {
    const handle = e.currentTarget;
    const track = handle.parentElement;
    if (!track) return;

    let lastValue: number | null = null;
    let serviceCallTimeout: NodeJS.Timeout | null = null;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      const rect = track.getBoundingClientRect();
      const touch = moveEvent.touches[0];
      const x = touch.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      
      let newValue: number;
      
      if (field === 'exposureTime') {
        const index = Math.max(0, Math.min(exposureTimeValues.length - 1, Math.round(percentage * (exposureTimeValues.length - 1))));
        newValue = getValueByIndex('exposureTime', index);
      } else if (field === 'exposureLimit') {
        const index = Math.max(0, Math.min(exposureLimitValues.length - 1, Math.round(percentage * (exposureLimitValues.length - 1))));
        newValue = getValueByIndex('exposureLimit', index);
      } else if (field === 'gainValue') {
        newValue = Math.max(0, Math.min(20, Math.round(percentage * 20)));
      } else {
        newValue = 0;
      }
      
      if (newValue === lastValue) {
        return;
      }
      lastValue = newValue;
      
      setConfig((prev: any) => ({ ...prev, [field]: newValue }));
      
      if (serviceCallTimeout) {
        clearTimeout(serviceCallTimeout);
      }
      
      serviceCallTimeout = setTimeout(() => {
        const syntheticEvent = {
          target: {
            name: field,
            value: newValue.toString(),
            type: 'range'
          }
        } as React.ChangeEvent<HTMLInputElement>;
        
        handleChange(syntheticEvent);
      }, 300);
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setConfig({
      ...config,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    });

    // 如果是曝光相关参数发生变化，调用曝光控制服务
    if (name === 'exposureMode' || name === 'exposureTime' || name === 'exposureLimit') {
      try {
        let exposureMode = 0; // 默认手动曝光
        let exposureTime = config.exposureTime || 1000;
        let aeTimeUpperLimit = config.exposureLimit || 100;

        // 更新当前值
        if (name === 'exposureMode') {
          exposureMode = value === 'manual' ? 0 : (value === 'auto_once' ? 1 : 2);
        } else if (name === 'exposureTime') {
          exposureTime = parseInt(value);
        } else if (name === 'exposureLimit') {
          aeTimeUpperLimit = parseInt(value);
        }

        // 验证参数
        if (exposureMode < 0 || exposureMode > 2) {
          console.error('曝光模式参数无效');
          return;
        }
        
        if (exposureTime < 0) {
          console.error('曝光时间不能为负数');
          return;
        }
        
        if (aeTimeUpperLimit < 0) {
          console.error('自动曝光上限不能为负数');
          return;
        }

        rosService
          .callService<
            { params: string },
            { success: boolean; message: string }
          >("/set_camera_exposure", "project_control/Base", {
            params: `${exposureMode}/${1/exposureTime*1000000}/${1/aeTimeUpperLimit*1000000}`
          })
          .then((response: any) => {
            console.log("曝光设置:", response);
          })
          .catch((err) => {
            console.error("曝光设置失败:", err);
          });
      } catch (error) {
        console.error("曝光控制服务调用失败:", error);
      }
    }

    // 如果是白平衡相关参数发生变化，调用白平衡控制服务
    if (name === 'whiteBalanceMode' || name === 'redRatio' || name === 'greenRatio' || name === 'blueRatio') {
      try {
        let wbAuto = config.whiteBalanceMode === 'auto' ? 1 : 0;
        let redRatio = config.redRatio || 1000;
        let greenRatio = config.greenRatio || 1000;
        let blueRatio = config.blueRatio || 1000;

        // 更新当前值
        if (name === 'whiteBalanceMode') {
          wbAuto = value === 'auto' ? 1 : 0;
        } else if (name === 'redRatio') {
          redRatio = parseInt(value);
        } else if (name === 'greenRatio') {
          greenRatio = parseInt(value);
        } else if (name === 'blueRatio') {
          blueRatio = parseInt(value);
        }

        // 验证参数
        if (wbAuto < 0 || wbAuto > 2) {
          console.error('白平衡模式参数无效');
          return;
        }
        
        if (redRatio < 0 || greenRatio < 0 || blueRatio < 0) {
          console.error('RGB比例不能为负数');
          return;
        }

        rosService
          .callService<
            { params: string },
            { success: boolean; message: string }
          >("/set_camera_white_balance", "project_control/Base", {
            params: `${wbAuto}/${redRatio}/${greenRatio}/${blueRatio}`
          })
          .then((response: any) => {
            console.log("白平衡设置:", response);
          })
          .catch((err) => {
            console.error("白平衡设置失败:", err);
          });
      } catch (error) {
        console.error("白平衡控制服务调用失败:", error);
      }
    }

    // 如果是增益相关参数发生变化，调用增益控制服务
    if (name === 'gainMode' || name === 'gainValue') {
      try {
        let gainAuto = config.gainMode === 'auto' ? 1 : 0;
        let gainValue = config.gainValue || 5;

        // 更新当前值
        if (name === 'gainMode') {
          gainAuto = value === 'auto' ? 1 : 0;
        } else if (name === 'gainValue') {
          gainValue = parseInt(value);
        }

        // 验证参数
        if (gainAuto < 0 || gainAuto > 2) {
          console.error('增益模式参数无效');
          return;
        }
        
        if (gainValue < 0) {
          console.error('增益值不能为负数');
          return;
        }

        rosService
          .callService<
            { params: string },
            { success: boolean; message: string }
          >("/set_camera_gain", "project_control/Base", {
            params: `${gainAuto}/${gainValue}`
          })
          .then((response: any) => {
            console.log("增益设置:", response);
          })
          .catch((err) => {
            console.error("增益设置失败:", err);
          });
      } catch (error) {
        console.error("增益控制服务调用失败:", error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="camera-control-modal-overlay">
      <div className="camera-control-modal">
        <div className="camera-control-content">
          <button className="close-button" onClick={onClose}>
            ×
          </button>
          {/* 左侧图像预览 */}
          <div className="camera-preview-section">
            <div className="camera-preview-container">
              {previewImageSrc ? (
                <img 
                  src={previewImageSrc} 
                  alt="相机预览" 
                  className="camera-preview-image"
                />
              ) : (
                <div className="camera-preview-placeholder">
                  {rosService.isConnected() ? "等待图像数据..." : "请先连接设备"}
                </div>
              )}
            </div>
          </div>

          {/* 右侧参数控制 */}
          <div className="camera-controls-section">
            <div className="camera-controls-content">
              <div className="config-section">
            <div className="config-row">
              <label>曝光模式</label>
              <div className="button-group">
                <button
                  type="button"
                  className={`mode-button ${config.exposureMode === "manual" ? "active" : ""}`}
                  onClick={() => {
                    const syntheticEvent = {
                      target: {
                        name: 'exposureMode',
                        value: 'manual',
                        type: 'select'
                      }
                    } as unknown as React.ChangeEvent<HTMLSelectElement>;
                    handleChange(syntheticEvent);
                  }}
                >
                  手动曝光
                </button>
                <button
                  type="button"
                  className={`mode-button ${config.exposureMode === "auto_once" ? "active" : ""}`}
                  onClick={() => {
                    const syntheticEvent = {
                      target: {
                        name: 'exposureMode',
                        value: 'auto_once',
                        type: 'select'
                      }
                    } as unknown as React.ChangeEvent<HTMLSelectElement>;
                    handleChange(syntheticEvent);
                  }}
                >
                  一次曝光
                </button>
                <button
                  type="button"
                  className={`mode-button ${config.exposureMode === "auto_continuous" ? "active" : ""}`}
                  onClick={() => {
                    const syntheticEvent = {
                      target: {
                        name: 'exposureMode',
                        value: 'auto_continuous',
                        type: 'select'
                      }
                    } as unknown as React.ChangeEvent<HTMLSelectElement>;
                    handleChange(syntheticEvent);
                  }}
                >
                  连续曝光
                </button>
              </div>
            </div>
            
            {config.exposureMode === "manual" && (
              <div className="config-row">
                <label htmlFor="exposureTime">曝光时间</label>
                <div className="horizontal-selector">
                  <div className="selector-track">
                    {exposureTimeValues.map((value, index) => (
                      <div
                        key={value}
                        className={`selector-option ${value === config.exposureTime ? 'active' : ''}`}
                      ></div>
                    ))}
                    <div 
                      className="selector-handle"
                      style={{
                        left: `${(getSliderPosition('exposureTime', config.exposureTime) / (exposureTimeValues.length - 1)) * 90}%`
                      }}
                      onMouseDown={(e) => handleSliderMouseDown(e, 'exposureTime')}
                      onTouchStart={(e) => handleSliderTouchStart(e, 'exposureTime')}
                    ></div>
                  </div>
                  <div className="current-value">{`1/${config.exposureTime}s`}</div>
                </div>
              </div>
            )}
            
            {(config.exposureMode === "auto_once" || config.exposureMode === "auto_continuous") && (
              <div className="config-row">
                <label htmlFor="exposureLimit">曝光上限</label>
                <div className="horizontal-selector">
                  <div className="selector-track">
                    {exposureLimitValues.map((value, index) => (
                      <div
                        key={value}
                        className={`selector-option ${value === config.exposureLimit ? 'active' : ''}`}
                      ></div>
                    ))}
                    <div 
                      className="selector-handle"
                      style={{
                        left: `${(getSliderPosition('exposureLimit', config.exposureLimit) / (exposureLimitValues.length - 1)) * 90}%`
                      }}
                      onMouseDown={(e) => handleSliderMouseDown(e, 'exposureLimit')}
                      onTouchStart={(e) => handleSliderTouchStart(e, 'exposureLimit')}
                    ></div>
                  </div>
                  <div className="current-value">{`1/${config.exposureLimit}s`}</div>
                </div>
              </div>
            )}
            
            {/* 白平衡配置 */}
            <div className="config-row" style={{display: "none"}}>
              <label htmlFor="whiteBalanceMode">白平衡模式</label>
              <select
                id="whiteBalanceMode"
                name="whiteBalanceMode"
                value={config.whiteBalanceMode}
                onChange={handleChange}
              >
                <option value="auto">自动白平衡</option>
                <option value="manual">手动白平衡</option>
              </select>
            </div>
            
            {config.whiteBalanceMode === "manual" && (
              <>
                <div className="config-row">
                  <label htmlFor="redRatio">红色比例</label>
                  <div className="range-with-value">
                    <input
                      type="range"
                      id="redRatio"
                      name="redRatio"
                      min="500"
                      max="2000"
                      step="50"
                      value={config.redRatio}
                      onChange={handleChange}
                    />
                    <span>{config.redRatio}</span>
                  </div>
                </div>
                <div className="config-row">
                  <label htmlFor="greenRatio">绿色比例</label>
                  <div className="range-with-value">
                    <input
                      type="range"
                      id="greenRatio"
                      name="greenRatio"
                      min="500"
                      max="2000"
                      step="50"
                      value={config.greenRatio}
                      onChange={handleChange}
                    />
                    <span>{config.greenRatio}</span>
                  </div>
                </div>
                <div className="config-row">
                  <label htmlFor="blueRatio">蓝色比例</label>
                  <div className="range-with-value">
                    <input
                      type="range"
                      id="blueRatio"
                      name="blueRatio"
                      min="500"
                      max="2000"
                      step="50"
                      value={config.blueRatio}
                      onChange={handleChange}
                    />
                    <span>{config.blueRatio}</span>
                  </div>
                </div>
              </>
            )}
            
            {/* 增益配置 */}
            <div className="config-row">
              <label>增益模式</label>
              <div className="button-group">
                <button
                  type="button"
                  className={`mode-button ${config.gainMode === "auto" ? "active" : ""}`}
                  onClick={() => {
                    const syntheticEvent = {
                      target: {
                        name: 'gainMode',
                        value: 'auto',
                        type: 'select'
                      }
                    } as unknown as React.ChangeEvent<HTMLSelectElement>;
                    handleChange(syntheticEvent);
                  }}
                >
                  自动增益
                </button>
                <button
                  type="button"
                  className={`mode-button ${config.gainMode === "manual" ? "active" : ""}`}
                  onClick={() => {
                    const syntheticEvent = {
                      target: {
                        name: 'gainMode',
                        value: 'manual',
                        type: 'select'
                      }
                    } as unknown as React.ChangeEvent<HTMLSelectElement>;
                    handleChange(syntheticEvent);
                  }}
                >
                  手动增益
                </button>
              </div>
            </div>
            
            {config.gainMode === "manual" && (
              <div className="config-row">
                <label htmlFor="gainValue">增益值</label>
                <div className="horizontal-selector">
                  <div className="selector-track">
                    {Array.from({length: 21}, (_, i) => (
                      <div
                        key={i}
                        className={`selector-option ${i === config.gainValue ? 'active' : ''}`}
                      ></div>
                    ))}
                    <div 
                      className="selector-handle"
                      style={{
                        left: `${(getSliderPosition('gainValue', config.gainValue) / 20) * 90}%`
                      }}
                      onMouseDown={(e) => handleSliderMouseDown(e, 'gainValue')}
                      onTouchStart={(e) => handleSliderTouchStart(e, 'gainValue')}
                    ></div>
                  </div>
                  <div className="current-value">{config.gainValue || 0}</div>
                </div>
              </div>
            )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraControlModal;
