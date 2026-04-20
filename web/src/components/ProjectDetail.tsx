import React, { useState, useEffect, useRef, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PointCloud from "./PointCloud";
import "./ProjectDetail.css";
import rosService from "../services/ROSService";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import { ROSContext } from "../App"; // 导入ROS上下文

interface ProjectDetails {
  id: string;
  name: string;
  thumbnailUrl: string;
  createdAt: string;
  pointsCount: number;
  description: string;
  pointCloudUrl: string;
}

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 添加Three.js相关引用
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointCloudRef = useRef<THREE.Points | null>(null);

  const { disconnectROS, connectToROS, rosServerIp } = useContext(ROSContext);

  // 初始化Three.js场景
  const initThreeJS = () => {
    if (!canvasRef.current) return;

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      75,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(
      canvasRef.current.clientWidth,
      canvasRef.current.clientHeight
    );
    rendererRef.current = renderer;

    // 添加轨道控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // 添加坐标轴辅助
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // 添加平行光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // 加载PCD文件
    loadPCDFile();

    // 开始动画循环
    animate();
  };

  // 加载PCD文件
  const loadPCDFile = () => {
    const loader = new PCDLoader();
    loader.load(
      "/assets/preview.pcd",
      (points) => {
        if (sceneRef.current) {
          // 移除之前的点云
          if (pointCloudRef.current) {
            sceneRef.current.remove(pointCloudRef.current);
          }

          // 添加新的点云
          sceneRef.current.add(points);
          pointCloudRef.current = points;

          // 调整相机位置以适应点云
          if (cameraRef.current && controlsRef.current) {
            const box = new THREE.Box3().setFromObject(points);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = cameraRef.current.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

            cameraZ *= 1.5; // 增加一些距离，以便更好地查看

            cameraRef.current.position.set(
              center.x,
              center.y,
              center.z + cameraZ
            );
            cameraRef.current.lookAt(center);
            cameraRef.current.updateProjectionMatrix();

            controlsRef.current.target.copy(center);
            controlsRef.current.update();
          }
        }
      },
      (xhr) => {
        console.log((xhr.loaded / xhr.total) * 100 + "% 已加载");
      },
      (error) => {
        console.error("加载PCD文件时出错:", error);
        setError("加载点云数据失败");
      }
    );
  };

  // 动画循环
  const animate = () => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    requestAnimationFrame(animate);

    if (controlsRef.current) {
      controlsRef.current.update();
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  };

  // 处理窗口大小变化
  const handleResize = () => {
    if (!canvasRef.current || !cameraRef.current || !rendererRef.current)
      return;

    const width = canvasRef.current.clientWidth;
    const height = canvasRef.current.clientHeight;

    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();

    rendererRef.current.setSize(width, height);
  };

  useEffect(() => {
    // 模拟从设备获取项目详情
    const fetchProjectDetails = async () => {
      try {
        setLoading(true);
        // 这里应该是实际的API调用
        // const response = await fetch(`http://device-ip/api/projects/${id}`);
        // const data = await response.json();

        // 模拟数据
        const mockProject: ProjectDetails = {
          id: id || "1",
          name:
            id === "1" ? "客厅扫描" : id === "2" ? "卧室建模" : "办公室测量",
          thumbnailUrl: `https://via.placeholder.com/300?text=${
            id === "1" ? "客厅" : id === "2" ? "卧室" : "办公室"
          }`,
          createdAt: "2025-04-15 14:30",
          pointsCount: 1250000,
          description:
            "这是一个使用MetaCam采集的3D点云项目，包含完整的空间扫描数据。",
          pointCloudUrl: `ws://{rosServerIp}:9090`,
        };

        // 延迟模拟网络请求
        setTimeout(() => {
          setProject(mockProject);
          setLoading(false);
        }, 1000);
      } catch (err) {
        console.error("获取项目详情失败:", err);
        setError("获取项目详情失败，请检查设备连接");
        setLoading(false);
      }
    };

    if (id) {
      try {
        // 调用服务并等待响应
        rosService
          .callService<
            { params: string },
            { success: boolean; message: string }
          >("/project_cloud", "metacam_node/ProjectCloud", {
            params: id,
          })
          .then((response: any) => {
            console.log("project_cloud:", response);
          })
          .catch((err) => {
            console.error(err);
          });
      } catch (error) {
        console.error("服务调用失败:", error);
      }

      fetchProjectDetails();
    }
  }, [id]);

  // 初始化Three.js
  useEffect(() => {
    if (!loading && project) {
      initThreeJS();

      // 添加窗口大小变化监听
      window.addEventListener("resize", handleResize);

      // 清理函数
      return () => {
        window.removeEventListener("resize", handleResize);

        // 清理Three.js资源
        if (rendererRef.current) {
          rendererRef.current.dispose();
        }

        if (pointCloudRef.current) {
          if (pointCloudRef.current.geometry) {
            pointCloudRef.current.geometry.dispose();
          }
          if (pointCloudRef.current.material) {
            if (Array.isArray(pointCloudRef.current.material)) {
              pointCloudRef.current.material.forEach((material) =>
                material.dispose()
              );
            } else {
              pointCloudRef.current.material.dispose();
            }
          }
        }
      };
    }
  }, [loading, project]);

  const formatPointsCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(2)}M 点`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K 点`;
    }
    return `${count} 点`;
  };

  return (
    <div className="project-detail">
      <div className="header">
        <button className="back-button" onClick={() => navigate("/projects")}>
          ← 返回项目列表
        </button>
        {project && <h1>{project.name}</h1>}
      </div>

      {loading ? (
        <div className="loading">加载项目详情中...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : project ? (
        <div className="project-content">
          <div className="project-info-panel">
            <div className="project-thumbnail">
              <img src={project.thumbnailUrl} alt={project.name} />
            </div>
            <div className="project-metadata">
              <h2>{project.name}</h2>
              <p className="project-date">创建时间: {project.createdAt}</p>
              <p className="project-points">
                点数量: {formatPointsCount(project.pointsCount)}
              </p>
              <p className="project-description">{project.description}</p>
              <div className="project-actions">
                <button className="action-button download-button">
                  下载点云数据
                </button>
                {/* <button className="action-button share-button">分享项目</button> */}
              </div>
            </div>
          </div>

          <div className="preview-point-cloud-viewer">
            <h3>点云预览</h3>
            <div className="preview-point-cloud-container">
              <canvas ref={canvasRef} className="point-cloud-canvas"></canvas>
            </div>
          </div>
        </div>
      ) : (
        <div className="error">项目不存在</div>
      )}
    </div>
  );
};

export default ProjectDetail;
