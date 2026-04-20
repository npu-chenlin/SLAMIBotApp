import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./ProjectManagement.css";
import rosService from "../services/ROSService";
import { customAlert, customConfirm } from "../utils/customAlert";
import ROSLIB from "roslib";

interface Project {
  id: number | string;
  name: string;
  thumbnailUrl: string;
  createdAt?: string;
}

const ProjectManagement: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [deletingProjects, setDeletingProjects] = useState<Set<string>>(new Set());
  const [storageSpace, setStorageSpace] = useState<string>("--");
  const [usbStatus, setUsbStatus] = useState<boolean>(false);

  // 添加引用
  const storageListenerRef = useRef<ROSLIB.Topic | null>(null);
  const driverStatusListenerRef = useRef<ROSLIB.Topic | null>(null);

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
        // 订阅U盘内存
        storageListenerRef.current = rosService.subscribeTopic(
          "/storage",
          "std_msgs/String",
          (message: any) => {
            setStorageSpace(message.data);
          }
        );

        // 订阅系统状态
        driverStatusListenerRef.current = rosService.subscribeTopic(
          "/driver_status",
          "std_msgs/UInt8",
          (message: any) => {
            // 8 bytes. 0,0,0,RTK,LiDAR,CAM,SLAM,U盘
            const statusArray = [
              (message.data >> 4) & 0x01, // RTK
              (message.data >> 3) & 0x01, // LiDAR
              (message.data >> 2) & 0x01, // CAM
              (message.data >> 1) & 0x01, // SLAM
              message.data & 0x01, // U盘
            ];
            setUsbStatus(!!statusArray[4]);
          }
        );
      }
    } catch (error) {
      console.error("设置订阅时出错:", error);
    }
  };

  // 清理订阅
  const cleanupSubscribers = () => {
    if (storageListenerRef.current) {
      rosService.unsubscribeTopic(storageListenerRef.current);
      storageListenerRef.current = null;
    }

    if (driverStatusListenerRef.current) {
      rosService.unsubscribeTopic(driverStatusListenerRef.current);
      driverStatusListenerRef.current = null;
    }
  };

  // 获取项目预览图片
  const loadProjectImage = async (projectName: string): Promise<string> => {
    try {
      const response = await rosService.callService<
        { project_name: string },
        { success: boolean; data: any; message: string }
      >("/project_image", "project_control/MultiBytes", {
        project_name: projectName,
      });

      if (response.success && response.data && response.data.length > 0) {
        let binaryData: Uint8Array;
        
        if (response.data instanceof Array || response.data instanceof Uint8Array) {
          binaryData = new Uint8Array(response.data);
        } 
        else if (typeof response.data === 'string') {
          const base64Data = response.data.split(',')[1] || response.data;
          binaryData = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
        } else {
          return "https://via.placeholder.com/150?text=无预览";
        }

        const blob = new Blob([binaryData], { type: 'image/jpeg' });
        return URL.createObjectURL(blob);
      } else {
        return "https://via.placeholder.com/150?text=无预览";
      }
    } catch (err) {
      console.error("获取项目图片失败:", err);
      return "https://via.placeholder.com/150?text=无预览";
    }
  };

  // 切换项目选择状态
  const toggleProjectSelection = (projectId: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projects.map(p => p.id as string)));
    }
  };

  // 批量删除项目
  const deleteSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      await customAlert('请先选择要删除的项目', '提示');
      return;
    }

    const projectNames = Array.from(selectedProjects);
    const confirmMessage = `确定要删除 ${projectNames.length} 个项目吗？`;

    // 使用自定义确认对话框
    const userConfirmed = await customConfirm(confirmMessage, '确认删除');
    if (!userConfirmed) {
      return;
    }

    setDeletingProjects(new Set(projectNames));

    try {
      let successCount = 0;
      let failCount = 0;
      const failedProjects: string[] = [];

      // 逐个删除项目
      for (const projectName of projectNames) {
        try {
          const response = await rosService.callService<
            { params: string },
            { success: boolean; message: string }
          >("/project_delete", "project_control/Base", {
            params: projectName,
          });

          if (response.success) {
            successCount++;
          } else {
            failCount++;
            failedProjects.push(`${projectName}: ${response.message}`);
          }
        } catch (error) {
          failCount++;
          failedProjects.push(`${projectName}: 删除失败`);
        }
      }

      // 更新项目列表
      setProjects(prevProjects => 
        prevProjects.filter(project => !selectedProjects.has(project.id as string))
      );

      // 清空选择
      setSelectedProjects(new Set());

      // 显示结果
      if (failCount === 0) {
        await customAlert(`成功删除 ${successCount} 个项目`, '成功');
      } else {
        const resultMessage = `删除完成\n\n成功: ${successCount} 个\n失败: ${failCount} 个\n\n失败项目:\n${failedProjects.join('\n')}`;
        await customAlert(resultMessage, '删除结果');
      }
    } catch (error) {
      console.error("批量删除项目失败:", error);
      await customAlert('批量删除项目失败', '错误');
    } finally {
      setDeletingProjects(new Set());
    }
  };

  // 格式化U盘功能
  const formatUSB = async () => {
    const confirmed = await customConfirm(
      "确定要格式化U盘吗？此操作将删除U盘上的所有数据！",
      "确认格式化"
    );
    if (confirmed) {
      try {
        rosService
          .callService<{}, { success: boolean; message: string }>(
            "/usb_operation",
            "metacam_node/USBOperation",
            {}
          )
          .then((response: any) => {
            console.log("usb_operation:", response);
            if (response.success) {
              customAlert("U盘格式化成功！", "成功");
              // 重新获取项目列表，因为格式化后项目会被删除
              setupServiceCall();
            } else {
              customAlert(`U盘格式化失败：${response.message}`, "错误");
            }
          })
          .catch((err) => {
            console.error(err);
            customAlert("U盘格式化失败！", "错误");
          });
      } catch (error) {
        console.error("服务调用失败:", error);
        customAlert("服务调用失败", "错误");
      }
    }
  };

  async function setupServiceCall() {
    const projects: Project[] = [];
    try {
      // 调用服务并等待响应
      setLoading(true);
      rosService
        .callService<{}, { success: boolean; message: string }>(
          "/project_list",
          "project_control/Base",
          {}
        )
        .then(async (response: any) => {
          console.log("project_list:", response);
          if (response.success) {
            const projectNames = response.message.split(',');
            
            // 为每个项目获取预览图片
            for (const projectName of projectNames) {
              if (projectName.trim()) {
                const thumbnailUrl = await loadProjectImage(projectName.trim());
                const project: Project = {
                  id: projectName.trim(),
                  name: projectName.trim(),
                  thumbnailUrl: thumbnailUrl,
                  createdAt: new Date().toLocaleString('zh-CN'),
                };
                projects.push(project);
              }
            }
            
            setProjects(projects);
            setLoading(false);
          } else {
            setError("获取项目列表失败: " + response.message);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error(err);
          setError("服务调用失败");
          setLoading(false);
        });
    } catch (error) {
      console.error("服务调用失败:", error);
      setError("服务调用失败");
      setLoading(false);
    }
  }

  return (
    <div className="project-management">
      <div className="header">
        <button className="back-button" onClick={() => navigate("/")}>
          ← 返回
        </button>
        <h1>项目管理</h1>
        <div className="header-right">
          <div className="projects-count">共 {projects.length} 个项目</div>
          <div className={`usb-status-display ${usbStatus ? 'active' : 'inactive'}`}>
            <span className="usb-info">
              {usbStatus ? `内存 ${storageSpace}` : '存储未连接'}
            </span>
          </div>
          {usbStatus && (
            <button
              className="format-usb-button"
              onClick={formatUSB}
              title="格式化U盘"
            >
              格式化U盘
            </button>
          )}
          {projects.length > 0 && (
            <button
              className="select-all-button"
              onClick={toggleSelectAll}
            >
              {selectedProjects.size === projects.length ? '取消全选' : '全选'}
            </button>
          )}
          {selectedProjects.size > 0 && (
            <button
              className="delete-selected-button"
              onClick={deleteSelectedProjects}
              disabled={deletingProjects.size > 0}
            >
              🗑️ 删除选中 ({selectedProjects.size})
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">加载项目列表中...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          <div className="projects-grid">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`project-card ${deletingProjects.has(project.id as string) ? 'deleting' : ''}`}
              >
                <div className="project-thumbnail">
                  <img src={project.thumbnailUrl} alt={project.name} />
                </div>
                <div className="project-info">
                  <h3>{project.name}</h3>
                </div>
                {/* 让复选框区域整块可点击 */}
                <label
                  className="project-checkbox"
                  style={{ cursor: deletingProjects.has(project.id as string) ? 'not-allowed' : 'pointer' }}
                  htmlFor={`checkbox-${project.id}`}
                  onClick={e => {
                    if (deletingProjects.has(project.id as string)) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                >
                  <input
                    id={`checkbox-${project.id}`}
                    type="checkbox"
                    checked={selectedProjects.has(project.id as string)}
                    onChange={() => toggleProjectSelection(project.id as string)}
                    disabled={deletingProjects.has(project.id as string)}
                    style={{ display: 'none' }}
                  />
                  <span className={`custom-checkbox ${selectedProjects.has(project.id as string) ? 'checked' : ''} ${deletingProjects.has(project.id as string) ? 'disabled' : ''}`}></span>
                </label>
                {deletingProjects.has(project.id as string) && (
                  <div className="deleting-overlay">
                    <div className="deleting-spinner"></div>
                    <span>删除中...</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectManagement;
