/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import ROSLIB from "roslib";
import * as ROS3D from "ros3d";
// DebugPanel 已移至 View.tsx
import "./PointCloud.css";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Stats from "three/examples/jsm/libs/stats.module";
import FixedLengthArray from "../utils/FixedLengthArray";
import FrameRateController from "../utils/FrameRateController";
import FPSCounter from "../utils/FPSCounter";
import rosService from "../services/ROSService";
import * as Util from "../utils/util";

ROS3D.PointCloud2.prototype.processMessage = function (msg) {
  return;
  console.time("processMessage");
  if (!this.points.setup(msg.header.frame_id, msg.point_step, msg.fields)) {
    return;
  }

  var n,
    pointRatio = this.points.pointRatio;
  var bufSz = this.max_pts * msg.point_step;

  if (msg.data.buffer) {
    this.buffer = msg.data.slice(0, Math.min(msg.data.byteLength, bufSz));
    n = Math.min(
      (msg.height * msg.width) / pointRatio,
      this.points.positions.array.length / 3
    );
  } else {
    if (!this.buffer || this.buffer.byteLength < bufSz) {
      this.buffer = new Uint8Array(bufSz);
    }
    n = Util.decode64(msg.data, this.buffer, msg.point_step, pointRatio);
    pointRatio = 1;
  }

  var dv = new DataView(this.buffer.buffer);
  var littleEndian = !msg.is_bigendian;
  var x = this.points.fields.x.offset;
  var y = this.points.fields.y.offset;
  var z = this.points.fields.z.offset;
  var base, color;
  console.log(n);
  for (var i = 0; i < n; i++) {
    base = i * pointRatio * msg.point_step;
    this.points.positions.array[3 * i] = dv.getFloat32(base + x, littleEndian);
    this.points.positions.array[3 * i + 1] = dv.getFloat32(
      base + y,
      littleEndian
    );
    this.points.positions.array[3 * i + 2] = dv.getFloat32(
      base + z,
      littleEndian
    );

    if (this.points.colors) {
      color = this.points.colormap(
        this.points.getColor(dv, base, littleEndian)
      );
      this.points.colors.array[3 * i] = color.r;
      this.points.colors.array[3 * i + 1] = color.g;
      this.points.colors.array[3 * i + 2] = color.b;
    }
  }
  this.points.update(n);
  console.timeEnd("processMessage");
};

interface PointCloudProps {
  url: string;
  topic: string;
  frameId?: string;
  width?: number | string;
  height?: number | string;
  batteryTopic?: string;
  pointSize?: number;
  colorMode?: string;
  cameraMode?: string; // 添加相机视角模式属性
  showStats?: boolean;
  maxPointNumber?: number; // 添加最大点数配置
  onDebugInfoUpdate?: (debugInfo: any) => void; // 添加调试信息更新回调
  onClearData?: () => void; // 添加数据清理回调函数
}
// 定义暴露给外部的方法接口
export interface PointCloudRef {
  clearPointCloudData: () => void;
  clearTrajectoryData: () => void;
  clearAllData: () => void;
}

let isFreeMode: boolean = true;

const PointCloud = forwardRef<PointCloudRef, PointCloudProps>(({
  url,
  topic,
  frameId = "camera_init",
  width = "100%",
  height = "100%",
  batteryTopic = "/battery_state",
  cameraMode = "thirdPerson", // 默认相机视角模式
  showStats = false,
  maxPointNumber = 300000, // 默认最大点数
  pointSize = 0.01,
  onDebugInfoUpdate = (debugInfo: any) => void {},
  onClearData,
}, ref) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerId = "pointcloud-viewer";
  const tfClientRef = useRef<ROSLIB.TFClient | null>(null);
  const stats = new Stats();
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  let controls: OrbitControls;
  const particlesGeometry = new THREE.BufferGeometry();
  // 使用useRef保存材质引用，确保在组件重新渲染时保持稳定
  const particlesMaterialRef = useRef<THREE.PointsMaterial>(
    new THREE.PointsMaterial({
      size: pointSize || 0.1,
      color: 0xffffff,
      vertexColors: true, // 若启用需确认颜色数据存在
      transparent: true, // 移动端避免透明材质（可能引发性能问题）
      alphaTest: 0.5, // 解决边缘锯齿
      sizeAttenuation: false,
    })
  );
  const pointCloudRef = useRef<THREE.Points | null>(null);

  // 添加设备模型（相机视锥）和轨迹线的引用
  const deviceModelRef = useRef<THREE.Object3D | null>(null);
  const trajectoryRef = useRef<THREE.Line | null>(null);

  // const maxPointNumber = 300000 * 3;
  // let allPoints: FixedLengthArray = new FixedLengthArray(maxPointNumber);
  // let allColors: FixedLengthArray = new FixedLengthArray(maxPointNumber);
  // 使用传入的maxPointNumber参数
  const totalPointNumber = maxPointNumber * 3;
  // 直接使用Float32Array替代FixedLengthArray
  let allPoints: Float32Array = new Float32Array(totalPointNumber);
  let allColors: Float32Array = new Float32Array(totalPointNumber);

  // 跟踪当前使用的数组长度
  let pointsLength = 0;
  let colorsLength = 0;

  const fpsController = new FrameRateController(25);

  const workerRef = useRef<Worker | null>(null);
  let decodedWith: string = "no worker";
  let isWorkerLoaded: boolean = false;

  const firstPersonCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const odometryListenerRef = useRef<ROSLIB.Topic | null>(null);
  // 添加轨迹点数组引用
  const trajectoryPointsRef = useRef<THREE.Vector3[]>([]);
  // 添加轨迹线对象引用
  const odometryTrajectoryRef = useRef<THREE.Line | null>(null);
  // 设置轨迹线最大长度
  const maxTrajectoryLength = 10000;
  let _pose: any = { x: 0, y: 0, z: 0 };

  // 监听ROS连接状态变化
  useEffect(() => {
    const unsubscribe = rosService.onConnectionChange((status) => {
      if (status === "connected") {
        setupSubscribers();
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

    const ros = rosService.getROSInstance();

    // 订阅点云话题
    ros?.on(topic, (msg: any) => {
      if (rosService.isConnected()) {
        if (workerRef.current) {
          workerRef.current.postMessage(msg);

          decodedWith = "worker: postMessage";
        } else {
          decodedWith = "no worker";
          console.time("parsePointCloud");

          const result = parsePointCloud(msg);

          // 复制点数据到Float32Array
          const subStart = pointsLength,
            subCount = result.points.length;

          if (pointsLength + result.points.length > totalPointNumber) {
            pointsLength = 0;
          }

          for (let i = 0; i < result.points.length; i++) {
            allPoints[pointsLength + i] = result.points[i];
          }

          pointsLength += result.points.length;

          // 复制颜色数据到Float32Array
          if (colorsLength + result.colors.length > totalPointNumber) {
            colorsLength = 0;
          }

          for (let i = 0; i < result.colors.length; i++) {
            allColors[colorsLength + i] = result.colors[i];
          }
          colorsLength += result.colors.length;

          console.timeEnd("parsePointCloud");

          // console.time("renderPoints");

          if (!particlesGeometry.attributes.position) {
            particlesGeometry.setAttribute(
              "position",
              new THREE.BufferAttribute(allPoints, 3)
            );
          }

          if (!particlesGeometry.attributes.color) {
            particlesGeometry.setAttribute(
              "color",
              new THREE.BufferAttribute(allColors, 3)
            );
          }

          (
            particlesGeometry.attributes.position as THREE.BufferAttribute
          ).updateRanges = [
            {
              start: subStart,
              count: subCount,
            },
          ];

          (
            particlesGeometry.attributes.color as THREE.BufferAttribute
          ).updateRanges = [
            {
              start: subStart,
              count: subCount,
            },
          ];

          particlesGeometry.attributes.position.needsUpdate = true;
          particlesGeometry.attributes.color.needsUpdate = true;

          // console.timeEnd("renderPoints");
        }
      }
    });

    try {
      if (rosService.isConnected()) {
        // 订阅Odometry
        odometryListenerRef.current = rosService.subscribeTopic(
          "/slam_pose",
          "nav_msgs/Odometry",
          (message: any) => {
            // console.log("收到Odometry:", message);
            const pose: any = message.pose?.pose;
            const { orientation, position } = pose;
            // console.log(orientation, position);
            _pose = {
              x: position.x,
              y: position.y,
              z: position.z,
            };

            const originalQuat = new THREE.Quaternion();
            originalQuat.set(
              orientation.x,
              orientation.y,
              orientation.z,
              orientation.w
            );

            // 构造旋转四元数
            const qX = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(1, 0, 0),
              Math.PI / 2 // X 轴 90 度
            );

            const qY = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              Math.PI // Y 轴 180 度
            );

            // 叠加旋转
            const newQuat = originalQuat
              .clone()
              .multiply(qX) // 先绕 X 轴旋转
              .multiply(qY) // 再绕 Y 轴旋转
              .normalize(); // 单位化

            if (deviceModelRef.current) {
              deviceModelRef.current.quaternion.set(
                newQuat.x,
                newQuat.y,
                newQuat.z,
                newQuat.w
              );

              deviceModelRef.current.updateMatrixWorld(true);

              deviceModelRef.current.position.set(
                position.x,
                position.y,
                position.z
              );
            }

            // camera.lookAt(position.x, position.y, position.z);

            // const offset = new THREE.Vector3(0, -5, 0);
            // offset.applyQuaternion(newQuat);
            // camera.position.copy(position).add(offset);

            // 更新相机姿态
            // camera.quaternion.set(newQuat.x, newQuat.y, newQuat.z, newQuat.w);

            // camera.updateMatrixWorld(true);

            // controls.target.copy(camera.position);
            // controls.update();

            // 添加轨迹点并更新轨迹线
            updateTrajectory(position);
          }
        );

        // // 订阅电池状态
        // batteryListenerRef.current = rosService.subscribeTopic(
        //   batteryTopic,
        //   "sensor_msgs/BatteryState",
        //   (message: any) => {
        //     setBatteryLevel(message.percentage * 100);
        //   }
        // );

        // 设置TF客户端
        tfClientRef.current = rosService.createTFClient({
          fixedFrame: frameId,
          angularThres: 0.01,
          transThres: 0.01,
        });

        // 使用ROS3D处理点云数据
        const ros = rosService.getROSInstance();
        if (ros) {
          new ROS3D.PointCloud2({
            ros: ros!,
            topic: topic,
            tfClient: tfClientRef.current,
            max_pts: 100000,
          });
        }
      }
    } catch (error) {
      console.error("设置电池状态订阅时出错:", error);
    }
  };

  // 清除点云数据
  const clearPointCloudData = () => {
    console.log("清除点云数据");
    // 重置点云数组
    allPoints = new Float32Array(totalPointNumber);
    allColors = new Float32Array(totalPointNumber);
    pointsLength = 0;
    colorsLength = 0;

    // 更新几何体
    if (particlesGeometry.attributes.position) {
      (particlesGeometry.attributes.position as THREE.BufferAttribute).array = allPoints;
      particlesGeometry.attributes.position.needsUpdate = true;
    }
    
    if (particlesGeometry.attributes.color) {
      (particlesGeometry.attributes.color as THREE.BufferAttribute).array = allColors;
      particlesGeometry.attributes.color.needsUpdate = true;
    }
  };

  // 清除轨迹数据
  const clearTrajectoryData = () => {
    console.log("清除轨迹数据");
    // 清理轨迹线
    if (odometryTrajectoryRef.current && scene) {
      scene.remove(odometryTrajectoryRef.current);
      odometryTrajectoryRef.current.geometry.dispose();
      odometryTrajectoryRef.current = null;
    }

    // 清空轨迹点数组
    trajectoryPointsRef.current = [];
  };

  // 清除所有数据
  const clearAllData = () => {
    console.log("清除所有数据");
    clearPointCloudData();
    clearTrajectoryData();
    
    // 调用外部回调
    if (onClearData) {
      onClearData();
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    clearPointCloudData,
    clearTrajectoryData,
    clearAllData
  }));

  // 清理订阅
  const cleanupSubscribers = () => {
    if (odometryListenerRef.current) {
      rosService.unsubscribeTopic(odometryListenerRef.current);
      odometryListenerRef.current = null;
    }

    // 清理轨迹线
    if (odometryTrajectoryRef.current && scene) {
      scene.remove(odometryTrajectoryRef.current);
      odometryTrajectoryRef.current.geometry.dispose();
      odometryTrajectoryRef.current = null;
    }

    // 清空轨迹点数组
    trajectoryPointsRef.current = [];

    tfClientRef.current = null;

    // 重置点云数组
    allPoints = new Float32Array(totalPointNumber);
    allColors = new Float32Array(totalPointNumber);
    pointsLength = 0;
    colorsLength = 0;
  };

  useEffect(() => {
    if (!viewerRef.current) return;
    // Initialize Web Worker
    if (Util.isWorkerSupported()) {
      console.info("当前环境支持 Web Worker");

      let worker = new Worker(
        new URL("../workers/pointCloudParser.worker.ts", import.meta.url)
      );

      // console.log(
      //   new URL("../workers/pointCloudParser.worker.ts", import.meta.url)
      // );

      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === "READY") {
          console.log("Worker 加载成功");
          isWorkerLoaded = true;
          workerRef.current = worker;
        } else {
          decodedWith = "worker1: onmessage";

          // console.time("worker/allPoints");
          const { points, colors } = e.data;

          // 复制点数据到Float32Array
          const subStart = pointsLength,
            subCount = points.length;

          if (pointsLength + points.length > totalPointNumber) {
            pointsLength = 0;
          }

          for (let i = 0; i < points.length; i++) {
            allPoints[pointsLength + i] = points[i];
          }

          pointsLength += points.length;

          // 复制颜色数据到Float32Array
          if (colorsLength + colors.length > totalPointNumber) {
            colorsLength = 0;
          }

          for (let i = 0; i < colors.length; i++) {
            allColors[colorsLength + i] = colors[i];
          }
          colorsLength += colors.length;

          // console.timeEnd("parsePointCloud");

          // console.time("renderPoints");

          if (!particlesGeometry.attributes.position) {
            particlesGeometry.setAttribute(
              "position",
              new THREE.BufferAttribute(allPoints, 3)
            );
          }

          if (!particlesGeometry.attributes.color) {
            particlesGeometry.setAttribute(
              "color",
              new THREE.BufferAttribute(allColors, 3)
            );
          }

          (
            particlesGeometry.attributes.position as THREE.BufferAttribute
          ).updateRanges = [
            {
              start: subStart,
              count: subCount,
            },
          ];

          (
            particlesGeometry.attributes.color as THREE.BufferAttribute
          ).updateRanges = [
            {
              start: subStart,
              count: subCount,
            },
          ];

          particlesGeometry.attributes.position.needsUpdate = true;
          particlesGeometry.attributes.color.needsUpdate = true;

          // console.timeEnd("worker/renderPoints");
        }
      };

      worker.onerror = (event) => {
        console.error("Worker 加载失败:", event);
        isWorkerLoaded = false;
        worker.terminate();
        workerRef.current = null;

        const workerScript = `
        function parsePointCloud(msg) {
        var buffer = new Uint8Array(msg.data).buffer;
        var dataView = new DataView(buffer);
        var points = [];
        var colors = [];
        for (let i = 0; i < msg.width; i++) {
            var pointOffset = i * msg.point_step;
            msg.fields.forEach((field) => {
                var byteOffset = pointOffset + field.offset;
                var name = field.name;
                switch (field.datatype) {
                    case 7:
                        if (name === 'x' || name === 'y' || name === 'z') {
                            points.push(dataView.getFloat32(byteOffset, !msg.is_bigendian));
                        } else if (name === 'rgb') {
                            var rgbInt = dataView.getUint32(byteOffset, !msg.is_bigendian);
                            var rgb = {
                                r: ((rgbInt >> 16) & 0xff) / 255,
                                g: ((rgbInt >> 8) & 0xff) / 255,
                                b: (rgbInt & 0xff) / 255
                            };
                            colors.push(rgb.r, rgb.g, rgb.b);
                        }
                        break;
                      }
                  });
                }
            return {
              points,
              colors
            };
          }
  
        self.onmessage = (e) => {
            const result = parsePointCloud(e.data);
            self.postMessage(result);
        };

        self.postMessage({
            type: 'READY',
        }); 
      `;

        const blob = new Blob([workerScript], {
          type: "application/javascript",
        });
        const worker2 = new Worker(URL.createObjectURL(blob));

        worker2.onmessage = (e: MessageEvent) => {
          if (e.data.type === "READY") {
            console.log("Worker2 加载成功");
            isWorkerLoaded = true;
            workerRef.current = worker2;
          } else {
            decodedWith = "worker2: onmessage";
            // console.time("worker2/allPoints");
            const { points, colors } = e.data;

            // console.time("worker/allPoints");

            // 复制点数据到Float32Array
            const subStart = pointsLength,
              subCount = points.length;

            if (pointsLength + points.length > totalPointNumber) {
              pointsLength = 0;
            }

            for (let i = 0; i < points.length; i++) {
              allPoints[pointsLength + i] = points[i];
            }

            pointsLength += points.length;

            // 复制颜色数据到Float32Array
            if (colorsLength + colors.length > totalPointNumber) {
              colorsLength = 0;
            }

            for (let i = 0; i < colors.length; i++) {
              allColors[colorsLength + i] = colors[i];
            }
            colorsLength += colors.length;

            console.timeEnd("parsePointCloud");

            // console.time("renderPoints");

            if (!particlesGeometry.attributes.position) {
              particlesGeometry.setAttribute(
                "position",
                new THREE.BufferAttribute(allPoints, 3)
              );
            }

            if (!particlesGeometry.attributes.color) {
              particlesGeometry.setAttribute(
                "color",
                new THREE.BufferAttribute(allColors, 3)
              );
            }

            (
              particlesGeometry.attributes.position as THREE.BufferAttribute
            ).updateRanges = [
              {
                start: subStart,
                count: subCount,
              },
            ];

            (
              particlesGeometry.attributes.color as THREE.BufferAttribute
            ).updateRanges = [
              {
                start: subStart,
                count: subCount,
              },
            ];

            particlesGeometry.attributes.position.needsUpdate = true;
            particlesGeometry.attributes.color.needsUpdate = true;
          }
        };

        worker2.onerror = (event) => {
          console.error("Worker2 加载失败:", event);
          isWorkerLoaded = false;
          worker2.terminate();
          workerRef.current = null;
        };
      };
    } else {
      console.error("当前环境不支持 Web Worker");
      decodedWith = "no worker";
    }

    // 清理函数
    return () => {
      if (viewerRef.current) {
        while (viewerRef.current.firstChild) {
          viewerRef.current.removeChild(viewerRef.current.firstChild);
        }
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [url, topic, frameId, width, height, batteryTopic]);

  // 添加对cameraMode的监听
  useEffect(() => {
    if (!viewerRef.current) return;
    console.log("相机模式已切换为:", cameraMode);
    // 当相机模式变化时，如果是第一人称视角，需要重新设置控制器
    isFreeMode = cameraMode === "firstPerson";
    // console.log("isFreeMode设置为:", cameraMode === "firstPerson", isFreeMode);
    // console.log("controls设置为:", controls);
  }, [cameraMode]);

  // 监听pointSize变化，更新材质大小
  useEffect(() => {
    if (particlesMaterialRef.current) {
      particlesMaterialRef.current.size = pointSize;
      particlesMaterialRef.current.needsUpdate = true;
      console.log("点大小已更新为:", pointSize);
    }
  }, [pointSize]);

  useEffect(() => {
    if (!viewerRef.current) return;

    // Stats setup
    stats.showPanel(0);
    stats.dom.style.cssText = "position:absolute;top:0;right:0;";
    // viewerRef.current.appendChild(stats.dom);

    console.log(THREE.REVISION);

    // 1. 创建场景
    if (!scene) {
      scene = new THREE.Scene();
    }
    scene.background = new THREE.Color(0x000000);

    // (window as any).scene = scene;

    // 2. 创建透视相机（参数：视场角、宽高比、近裁剪面、远裁剪面）
    if (!camera) {
      camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.01,
        15000
      );
    }

    // camera.up.set(0, 1, 0); // 默认是 (0, 1, 0) 即 Y 轴向上
    // camera.lookAt(0, 0, 0);
    // camera.position.set(10, 10, 10);

    camera.up.set(0, 0, 1);
    camera.position.set(-5, 0, 2);
    camera.lookAt(0, 0, 0);

    // 3. 创建渲染器
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "low-power",
      });
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 适配高分辨率屏幕
    renderer.shadowMap.enabled = false;
    viewerRef.current.appendChild(renderer.domElement);

    const context = renderer.getContext();
    console.log(context.getParameter(context.VERSION));
    if (context.getParameter(context.VERSION).includes("WebGL 1.0")) {
      console.warn("降级到 WebGL 1.0 模式运行");
    }

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-1, -1, -1);
    scene.add(directionalLight2);

    // 创建坐标轴辅助器，长度设为 5
    const axesHelper = new THREE.AxesHelper(5);
    // scene.add(axesHelper);

    // const gridHelper = new THREE.GridHelper(10, 10);
    // scene.add(gridHelper);

    // const cameraHelper = new THREE.CameraHelper(camera);
    // scene.add(cameraHelper);

    // // 添加物体
    // const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    // const material = new THREE.MeshBasicMaterial({ color: 0xcdcdcd });
    // const cube = new THREE.Mesh(geometry, material);
    // scene.add(cube);

    // // 创建玩家角色
    // const playerGeometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    // const playerMaterial = new THREE.MeshStandardMaterial({
    //   color: 0x3498DB,
    //   roughness: 0.5,
    //   metalness: 0.3
    // });

    // const player = new THREE.Mesh(playerGeometry, playerMaterial);
    // player.position.y = 1;
    // player.castShadow = true;
    // player.receiveShadow = true;
    // scene.add(player);

    // Controls setup
    // 初始化控制器（需传入相机和渲染器 DOM）
    if (!controls) {
      // 第三人称相机控制
      // const thirdPersonControls = new OrbitControls(camera, renderer.domElement);
      // thirdPersonControls.enableDamping = true;
      // thirdPersonControls.dampingFactor = 0.05;
      // thirdPersonControls.minDistance = 3;
      // thirdPersonControls.maxDistance = 15;
      // thirdPersonControls.maxPolarAngle = Math.PI / 2 - 0.1;
      // thirdPersonControls.target.set(0, 1, 0);

      controls = new OrbitControls(camera, renderer.domElement);
      // controls.mouseButtons = {
      //   LEFT: THREE.MOUSE.ROTATE,
      //   MIDDLE: THREE.MOUSE.PAN,
      //   RIGHT: THREE.MOUSE.DOLLY,
      // };

      // 关键参数配置
      // controls.enableDamping = true; // 启用阻尼惯性（提升操作流畅性）
      // controls.dampingFactor = 0.05; // 阻尼强度（值越小惯性越明显）
      // controls.enableZoom = true; // 允许缩放
      // controls.zoomSpeed = 1.5; // 缩放灵敏度
      // controls.enableRotate = true; // 允许旋转
      // controls.rotateSpeed = 0.8; // 旋转灵敏度
      // controls.enablePan = true; // 允许平移
      // controls.panSpeed = 0.5; // 平移速度
      // controls.screenSpacePanning = false; // 禁用屏幕空间平移（更适合 3D 场景）
      // controls.maxPolarAngle = Math.PI / 2 - 0.1;
      controls.target.set(0, 0, 0);
    }

    // // 创建第一人称相机
    // if (!firstPersonCameraRef.current) {
    //   firstPersonCameraRef.current = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    //   firstPersonCameraRef.current.position.set(0, 1.7, 0);
    //   player.add(firstPersonCameraRef.current);
    // }
    // 创建设备方向指示器：白底蓝边圆片 + 质心居中的蓝色 SVG 箭头
    const createCameraFrustum = () => {
      const modelGroup = new THREE.Group();

      // SVG 原始顶点（viewBox 0 0 1024 1024）
      // M 113.777778 967.111111
      // l 113.777778 -455.111111   -> B(227.555556, 512.0)
      // l -113.777778 -455.111111  -> C(113.777778, 56.888889)
      // l 796.444444 455.111111    -> D(910.222222, 512.0)
      const svgA = { x: 113.777778, y: 967.111111 };
      const svgB = { x: 227.555556, y: 512.0 };
      const svgC = { x: 113.777778, y: 56.888889 };
      const svgD = { x: 910.222222, y: 512.0 };
      const svgVerts = [svgA, svgB, svgC, svgD];

      // 计算多边形质心（shoelace formula）
      let area2 = 0;
      let cxNum = 0;
      let cyNum = 0;
      for (let i = 0; i < 4; i++) {
        const vi = svgVerts[i];
        const vj = svgVerts[(i + 1) % 4];
        const cross = vi.x * vj.y - vj.x * vi.y;
        area2 += cross;
        cxNum += (vi.x + vj.x) * cross;
        cyNum += (vi.y + vj.y) * cross;
      }
      const cX = cxNum / (3 * area2);
      const cY = cyNum / (3 * area2);

      // 平移顶点使质心在原点，并计算最远顶点到质心的距离
      const vA = { x: svgA.x - cX, y: svgA.y - cY };
      const vB = { x: svgB.x - cX, y: svgB.y - cY };
      const vC = { x: svgC.x - cX, y: svgC.y - cY };
      const vD = { x: svgD.x - cX, y: svgD.y - cY };

      const maxDist = Math.max(
        Math.sqrt(vA.x * vA.x + vA.y * vA.y),
        Math.sqrt(vB.x * vB.x + vB.y * vB.y),
        Math.sqrt(vC.x * vC.x + vC.y * vC.y),
        Math.sqrt(vD.x * vD.x + vD.y * vD.y)
      );

      // 蓝色外轮廓厚度 + 留白
      const outlineThickness = 0.004;
      const padding = 0.003;
      // 目标圆半径（米）
      const discRadius = 0.147;
      const s = (discRadius - outlineThickness - padding) / maxDist;

      // 1. 白色圆片（纯平面，无厚度）
      const discGeo = new THREE.CircleGeometry(discRadius, 64);
      const discMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      modelGroup.add(disc);

      // 2. 蓝色外轮廓圆环
      const ringGeo = new THREE.RingGeometry(
        discRadius - outlineThickness,
        discRadius,
        64
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x5C86FF,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.001;
      modelGroup.add(ring);

      // 3. 蓝色扁平箭头（质心在原点，局部指向 -X）
      // 经全局 Euler(PI/2, PI, 0) 旋转后，-X 翻转为世界 +X
      const shape = new THREE.Shape();
      shape.moveTo(-vA.x * s, vA.y * s);
      shape.lineTo(-vB.x * s, vB.y * s);
      shape.lineTo(-vC.x * s, vC.y * s);
      shape.lineTo(-vD.x * s, vD.y * s);
      shape.closePath();

      const arrowGeo = new THREE.ShapeGeometry(shape);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0x5C86FF,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.y = 0.002;
      modelGroup.add(arrow);

      // 全局初始旋转（用于坐标系对齐）
      const euler = new THREE.Euler(Math.PI / 2, Math.PI, 0, "XYZ");
      modelGroup.quaternion.setFromEuler(euler);

      scene.add(modelGroup);
      deviceModelRef.current = modelGroup;
      modelGroup.name = "CameraDirection";

      console.log("相机方向指示器创建成功");
    };

    // 执行相机视锥模型创建
    createCameraFrustum();

    // Create point cloud
    if (!pointCloudRef.current) {
      pointCloudRef.current = new THREE.Points(particlesGeometry, particlesMaterialRef.current);
      pointCloudRef.current.frustumCulled = false;
    }
    scene.add(pointCloudRef.current);

    // Initialize default waveform
    // createDebugPointCloud();
    console.log(scene);

    // Handle window resize
    const handleResize = () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      } else {
        camera.updateProjectionMatrix();
      }
    };
    window.addEventListener("resize", handleResize);

    // Update the animation loop to include debug info
    const fpsCounter = new FPSCounter();

    // 创建轨迹曲线并保存引用
    // const { curve } = createTrajectory();

    // 动画参数
    let progress = 0; // 轨迹进度，0-1之间
    const speed = 0.00005; // 移动速度

    // 相机跟随参数
    const cameraOffset = new THREE.Vector3(0, 5, -10); // 相机相对于模型的偏移量

    fpsController.start((deltaTime, frameCount) => {
      stats.begin();
      const currentFPS = fpsCounter.update();
      
      // Update debug information through callback
      onDebugInfoUpdate?.({
        fps: currentFPS,
        pointCount: particlesGeometry.attributes.position?.count,
        pointsLength: pointsLength / 3,
        isWorkerSupported: Util.isWorkerSupported(),
        isWorkerLoaded: isWorkerLoaded,
        decodedWith: decodedWith,
        cameraPosition: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        controlsTarget: {
          x: controls.target.x,
          y: controls.target.y,
          z: controls.target.z,
        },
        pose: {
          x: _pose?.x || 0,
          y: _pose?.y || 0,
          z: _pose?.z || 0,
        },
      });

      // if (pointCloudRef.current) {
      //   console.log("当前点大小:", (pointCloudRef.current.material as THREE.PointsMaterial).size);
      //   console.log("目标点大小:", pointSize);
      // }

      // 根据当前视角模式选择相机
      if (isFreeMode) {
        controls.enabled = true;
        // if (firstPersonCameraRef.current) {
        //   renderer.render(scene, firstPersonCameraRef.current);
        // }
        controls.update();
        renderer.render(scene, camera);
      } else {
        controls.enabled = false;

        if (camera && deviceModelRef.current) {
          const modelDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(
            deviceModelRef.current.quaternion
          );

          const cameraOffset = new THREE.Vector3(-5, 0, 1);

          const cameraPosition = new THREE.Vector3().copy(
            deviceModelRef.current.position
          );

          cameraPosition.sub(
            modelDirection.clone().multiplyScalar(cameraOffset.x)
          );
          cameraPosition.y += cameraOffset.y;
          cameraPosition.z += cameraOffset.z;
          camera.position.copy(cameraPosition);

          camera.lookAt(deviceModelRef.current.position);
          controls.target.copy(deviceModelRef.current.position);
        }
        controls.update();
        renderer.render(scene, camera);
      }

      stats.end();
    });

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);

      if (viewerRef.current) {
        viewerRef.current.removeChild(renderer.domElement);
        if (viewerRef.current.contains(stats.dom)) {
          viewerRef.current.removeChild(stats.dom);
        }
      }
      scene.clear();
      particlesGeometry.dispose();
      if (particlesMaterialRef.current) {
        particlesMaterialRef.current.dispose();
      }
    };
  }, []);

  const parsePointCloud = (msg: any) => {
    console.log("not from web worker");
    const buffer = new Uint8Array(msg.data).buffer;
    const dataView = new DataView(buffer);

    const points: number[] = [];
    const colors: number[] = [];
    const intensities: number[] = [];

    for (let i = 0; i < msg.width; i++) {
      const pointOffset = i * msg.point_step;

      msg.fields.forEach((field: any) => {
        const byteOffset = pointOffset + field.offset;
        const name = field.name;

        switch (field.datatype) {
          case 7: // FLOAT32 (x/y/z) // UINT32 (rgb)
            if (name === "x" || name === "y" || name === "z") {
              points.push(dataView.getFloat32(byteOffset, !msg.is_bigendian));
            } else if (name === "rgb") {
              const rgbInt = dataView.getUint32(byteOffset, !msg.is_bigendian);
              const rgb = {
                r: ((rgbInt >> 16) & 0xff) / 255,
                g: ((rgbInt >> 8) & 0xff) / 255,
                b: (rgbInt & 0xff) / 255,
              };
              colors.push(rgb.r, rgb.g, rgb.b);
            } else if (name === "intensity" && colors.length === 0) {
              // intensity to color using jet colormap
              const intensity =
                dataView.getFloat32(byteOffset, !msg.is_bigendian) / 255;
              const normalized = Math.max(0, Math.min(1, intensity));

              const r = Math.min(4 * normalized - 1.5, -4 * normalized + 4.5);
              const g = Math.min(4 * normalized - 0.5, -4 * normalized + 3.5);
              const b = Math.min(4 * normalized + 0.5, -4 * normalized + 2.5);

              intensities.push(
                Math.max(0, Math.min(1, r)),
                Math.max(0, Math.min(1, g)),
                Math.max(0, Math.min(1, b))
              );
            }
            break;
          case 6:
            break;
        }
      });
    }
    // console.timeEnd('parsePointCloud');

    return {
      points,
      colors: colors.length > 0 ? colors : intensities,
    };
  };

  // 添加更新轨迹的函数
  const updateTrajectory = (position: any) => {
    if (!scene) return;

    // 创建新的轨迹点
    const newPoint = new THREE.Vector3(position.x, position.y, position.z);

    // 将新点添加到轨迹点数组
    trajectoryPointsRef.current.push(newPoint);

    // 如果轨迹点超过最大长度，移除最早的点
    if (trajectoryPointsRef.current.length > maxTrajectoryLength) {
      trajectoryPointsRef.current.shift();
    }

    // 更新或创建轨迹线
    if (trajectoryPointsRef.current.length > 1) {
      // 创建轨迹线几何体
      const geometry = new THREE.BufferGeometry().setFromPoints(
        trajectoryPointsRef.current
      );

      // 如果轨迹线已存在，更新几何体
      if (odometryTrajectoryRef.current) {
        odometryTrajectoryRef.current.geometry.dispose();
        odometryTrajectoryRef.current.geometry = geometry;
      } else {
        // 创建轨迹线材质
        const material = new THREE.LineBasicMaterial({
          color: 0x00ff00, // 绿色轨迹线
          linewidth: 4,
        });

        // 创建轨迹线
        const trajectoryLine = new THREE.Line(geometry, material);
        trajectoryLine.name = "OdometryTrajectory";

        // 添加到场景
        scene.add(trajectoryLine);

        // 保存轨迹线引用
        odometryTrajectoryRef.current = trajectoryLine;
      }
    }
  };

  return (
    <div className="pointcloud-container">
      <div id={viewerId} ref={viewerRef} />
    </div>
  );
});

// 使用React.memo优化，只有当props真正变化时才重新渲染
export default React.memo(PointCloud, (prevProps, nextProps) => {
  // 返回true表示不需要重新渲染，返回false表示需要重新渲染
  return (
    prevProps.url === nextProps.url &&
    prevProps.topic === nextProps.topic &&
    prevProps.frameId === nextProps.frameId &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.batteryTopic === nextProps.batteryTopic &&
    prevProps.pointSize === nextProps.pointSize &&
    prevProps.colorMode === nextProps.colorMode &&
    prevProps.cameraMode === nextProps.cameraMode &&
    prevProps.showStats === nextProps.showStats &&
    prevProps.maxPointNumber === nextProps.maxPointNumber
    // onClearData回调函数不需要比较，因为它通常是一个稳定的引用
  );
});