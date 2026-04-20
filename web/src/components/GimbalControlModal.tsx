import React, { useState, useEffect, useCallback, useRef } from "react";
import "./GimbalControlModal.css";
import rosService from "../services/ROSService";

interface GimbalControlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GIMBAL_SERVICE_NAME = "/survey_control"; 
const GIMBAL_SERVICE_TYPE = "device_control/Base"; 

const GimbalControlModal: React.FC<GimbalControlModalProps> = ({ isOpen, onClose }) => {
  // Tab状态
  const [activeTab, setActiveTab] = useState<'flight' | 'gimbal'>('flight');
  
  // 飞行参数状态
  const [height, setHeight] = useState<number>(100.0);
  const [speed, setSpeed] = useState<number>(5.0);
  const [side, setSide] = useState<number>(0.5); // 旁向重叠率
  const [forward, setForward] = useState<number>(0.5); // 航向重叠率
  // const [fov, setFov] = useState<number>(70); // FOV 默认 70 - 一般是固定的，已注释
  
  // 核心状态：只需要这几个
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [handlePosition, setHandlePosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [cumulativeAngles, setCumulativeAngles] = useState<{pitch: number, yaw: number}>({pitch: 0, yaw: 0});
  
  // 核心逻辑：使用ref存储当前方向和定时器
  const currentDirectionRef = useRef({pitch: 0, yaw: 0});
  const accumulationTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // 可在打开时复位默认值，或保留上次设置
    // setHeight(1); setSpeed(10); setSide(0); setForward(0); setFov(90);
  }, [isOpen]);

  
  // 数值限位函数
  const clampNumber = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
  };

  // 核心功能1：启动累加
  const startAccumulation = useCallback(() => {
    if (accumulationTimerRef.current) {
      clearInterval(accumulationTimerRef.current);
    }
    
    accumulationTimerRef.current = setInterval(() => {
      const direction = currentDirectionRef.current;
      if (direction.pitch !== 0 || direction.yaw !== 0) {
        const stepSize = 0.5; // 每次累加0.5度
        const pitchStep = direction.pitch * stepSize;
        const yawStep = direction.yaw * stepSize;
        
        setCumulativeAngles(prev => {
          const newPitch = clampNumber(prev.pitch + pitchStep, -90, 90);
          const newYaw = clampNumber(prev.yaw + yawStep, -180, 180);
          
          // 发送ROS命令
          try {
            const topicData = {
              x: newPitch,
              y: 0,
              z: newYaw
            };
            rosService.publishTopic('/gimbal/pry_cmd', 'geometry_msgs/Vector3', topicData);
          } catch (error: any) {
            console.error("云台控制失败:", error);
          }
          
          return {pitch: newPitch, yaw: newYaw};
        });
      }
    }, 50);
  }, []);

  // 核心功能2：停止累加
  const stopAccumulation = useCallback(() => {
    if (accumulationTimerRef.current) {
      clearInterval(accumulationTimerRef.current);
      accumulationTimerRef.current = null;
    }
    currentDirectionRef.current = {pitch: 0, yaw: 0};
  }, []);

  // 核心功能3：更新方向
  const updateDirection = useCallback((pitchDir: number, yawDir: number) => {
    currentDirectionRef.current = {pitch: pitchDir, yaw: yawDir};
  }, []);

  // 核心功能4：重置角度
  const resetAngles = useCallback(() => {
    setCumulativeAngles({pitch: 0, yaw: 0});
  }, []);

  const handleJoystickMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleJoystickMove(e as any);
    startAccumulation();
    e.preventDefault();
  };

  const handleJoystickTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    const touch = e.touches[0];
    const syntheticEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      type: 'touchstart'
    };
    handleJoystickMove(syntheticEvent as any);
    startAccumulation();
    e.preventDefault();
  };

  // 任意方向检测（返回连续的数值）
  const getDirection = useCallback((deltaX: number, deltaY: number, maxRadius: number) => {
    const deadZone = 20; // 死区半径
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance < deadZone) {
      return { pitch: 0, yaw: 0 }; // 死区内停止
    }
    
    // 计算方向和强度（0-1之间）
    const clampedDistance = Math.min(distance, maxRadius);
    const intensity = (clampedDistance - deadZone) / (maxRadius - deadZone);
    
    // 计算标准化的方向向量
    const normalizedX = deltaX / distance;
    const normalizedY = deltaY / distance;
    
    // 返回带强度的方向值
    const pitchDirection = -normalizedY * intensity; // Y轴翻转，上为正
    const yawDirection = normalizedX * intensity;    // 右为正
    
    return { 
      pitch: pitchDirection, 
      yaw: yawDirection,
      distance: clampedDistance,
      intensity: intensity
    };
  }, []);

  const handleJoystickMove = useCallback((e: MouseEvent | React.MouseEvent | TouchEvent | any) => {
    if (!isDragging && e.type !== 'mousedown' && e.type !== 'touchstart') return;
    
    const container = document.querySelector('.gimbal-joystick-container') as HTMLElement;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2 - 15;
    
    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // 限制在圆形区域内
    let clampedX = deltaX;
    let clampedY = deltaY;
    if (distance > maxRadius) {
      clampedX = (deltaX / distance) * maxRadius;
      clampedY = (deltaY / distance) * maxRadius;
    }
    
    // 更新手柄位置
    setHandlePosition({x: clampedX, y: clampedY});
    
    // 计算方向并更新
    const direction = getDirection(clampedX, clampedY, maxRadius);
    updateDirection(direction.pitch, direction.yaw);
  }, [isDragging, getDirection, updateDirection]);

  const handleJoystickMouseUp = useCallback(() => {
    setIsDragging(false);
    setHandlePosition({x: 0, y: 0});
    stopAccumulation();
  }, [stopAccumulation]);

  const handleJoystickTouchEnd = useCallback(() => {
    setIsDragging(false);
    setHandlePosition({x: 0, y: 0});
    stopAccumulation();
  }, [stopAccumulation]);

  // 触摸移动事件处理
  const handleJoystickTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const syntheticEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      type: 'touchmove'
    };
    handleJoystickMove(syntheticEvent as any);
    e.preventDefault();
  }, [isDragging, handleJoystickMove]);

  // 全局事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleJoystickMove);
      document.addEventListener('mouseup', handleJoystickMouseUp);
      document.addEventListener('touchmove', handleJoystickTouchMove, { passive: false });
      document.addEventListener('touchend', handleJoystickTouchEnd);
      document.addEventListener('touchcancel', handleJoystickTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleJoystickMove);
        document.removeEventListener('mouseup', handleJoystickMouseUp);
        document.removeEventListener('touchmove', handleJoystickTouchMove);
        document.removeEventListener('touchend', handleJoystickTouchEnd);
        document.removeEventListener('touchcancel', handleJoystickTouchEnd);
      };
    }
  }, [isDragging, handleJoystickMove, handleJoystickMouseUp, handleJoystickTouchMove, handleJoystickTouchEnd]);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (accumulationTimerRef.current) {
        clearInterval(accumulationTimerRef.current);
      }
    };
  }, []);

  // 获取手柄样式（直接使用存储的位置）
  const getHandleStyle = () => {
    return {
      left: `calc(50% + ${handlePosition.x}px)`,
      top: `calc(50% + ${handlePosition.y}px)`
    };
  };



  if (!isOpen) return null;

  const callGimbalService = async (params: string) => {
    try {
      const response = await rosService
        .callService<{ params: string }, { success: boolean; message: string }>(
          GIMBAL_SERVICE_NAME,
          GIMBAL_SERVICE_TYPE,
          { params }
        );
      console.log("gimbal service response:", response);
    } catch (error: any) {
      console.error("云台服务调用失败:", error);
    }
  };

  const handleStart = async () => {
    // 简单参数校验（可按需求扩展）
    const values = [height, speed, side, forward];
    if (values.some((v) => Number.isNaN(v))) {
      // customAlert("请输入有效的数字参数", "错误");
      return;
    }
    // FOV参数已移除，使用固定值70
    const params = `${height}/${speed}/${side}/${forward}/70`;
    await callGimbalService(params);
  };

  const handleStop = async () => {
    await callGimbalService("0/0/0/0/70");
  };

  const handleGimbalZero = async () => {
    try {
      stopAccumulation();
      setIsDragging(false);
      setHandlePosition({x: 0, y: 0});
      resetAngles();
      
      rosService.publishTopic('/gimbal/pry_cmd', 'geometry_msgs/Vector3', {
        x: 0,
        y: 0,
        z: 0
      });
    } catch (error: any) {
      console.error("云台归零失败:", error);
    }
  };

  const handleFlightGimbalZero = async () => {
    try {
      resetAngles();
      
      rosService.publishTopic('/gimbal/pry_cmd', 'geometry_msgs/Vector3', {
        x: 0,
        y: 0,
        z: 0
      });
      console.log('飞行参数页面 - 云台归零命令已发送');
    } catch (error: any) {
      console.error("飞行参数页面 - 云台归零失败:", error);
    }
  };

  return (
    <div className="gimbal-modal-overlay">
      <div className="gimbal-modal">
        <div className="gimbal-modal-header">
          <div className="gimbal-tabs">
            <button 
              className={`gimbal-tab ${activeTab === 'flight' ? 'active' : ''}`}
              onClick={() => setActiveTab('flight')}
            >
              飞行参数
            </button>
            <button 
              className={`gimbal-tab ${activeTab === 'gimbal' ? 'active' : ''}`}
              onClick={() => setActiveTab('gimbal')}
            >
              云台控制
            </button>
          </div>
          <button className="gimbal-close-button" onClick={onClose} aria-label="close">×</button>
        </div>

        <div className="gimbal-main-content">
          {activeTab === 'flight' && (
            <div className="gimbal-flight-tab">
              <div className="gimbal-fields">
                <div className="gimbal-row">
                  <label htmlFor="height">飞行高度(m)</label>
                  <input
                    id="height"
                    type="number"
                    step={0.1}
                    min={0}
                    value={height}
                    placeholder="单位: 米"
                    onChange={(e) => setHeight(parseFloat(e.target.value))}
                  />
                </div>
                <div className="gimbal-row">
                  <label htmlFor="speed">飞行速度(m/s)</label>
                  <input
                    id="speed"
                    type="number"
                    step={0.1}
                    min={0}
                    value={speed}
                    placeholder="单位: m/s"
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  />
                </div>
                <div className="gimbal-row">
                  <label htmlFor="forward">航向重叠率</label>
                  <input
                    id="forward"
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={forward}
                    placeholder="0 - 1"
                    onChange={(e) => setForward(parseFloat(e.target.value))}
                  />
                </div>
                <div className="gimbal-row">
                  <label htmlFor="side">旁向重叠率</label>
                  <input
                    id="side"
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={side}
                    placeholder="0 - 1"
                    onChange={(e) => setSide(parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'gimbal' && (
            <div className="gimbal-control-tab">
              <div className="gimbal-joystick-area">
                <div 
                  className="gimbal-joystick-container"
                  onMouseDown={handleJoystickMouseDown}
                  onTouchStart={handleJoystickTouchStart}
                >
                  <div className="gimbal-joystick-center"></div>
                  <div 
                    className="gimbal-joystick-handle"
                    style={getHandleStyle()}
                  ></div>
                </div>
              </div>
              <div className="gimbal-values-panel">
                <div className="gimbal-values-display">
                  <div className="gimbal-value-item">
                    <span className="gimbal-value-label">Pitch</span>
                    <span className="gimbal-value-number">{cumulativeAngles.pitch.toFixed(1)}°</span>
                  </div>
                  <div className="gimbal-value-item">
                    <span className="gimbal-value-label">Yaw</span>
                    <span className="gimbal-value-number">{cumulativeAngles.yaw.toFixed(1)}°</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="gimbal-actions">
          <button className="gimbal-cancel-button" onClick={onClose}>取消</button>
          {activeTab === 'gimbal' && (
            <button className="gimbal-zero-button" onClick={handleGimbalZero}>复位</button>
          )}
          {activeTab === 'flight' && (
            <>
              <button className="gimbal-zero-button" onClick={handleFlightGimbalZero}>复位</button>
              <button className="gimbal-stop-button" onClick={handleStop}>停止</button>
              <button className="gimbal-start-button" onClick={handleStart}>开始</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GimbalControlModal;


