# Web 前端

SLAMIBotApp 的 Web 控制面板模块。

## 技术栈

- React 19 + TypeScript
- ROSLib / ROS3D（ROS 通信与点云可视化）
- Three.js（3D 渲染）

## 可用脚本

```bash
npm start          # 开发模式
npm run build      # 生产构建
npm run build:dev  # 使用开发环境配置构建
npm run build:release  # 使用生产环境配置构建（用于打包到 App）
```

## 构建产物

运行 `npm run build:release` 后，`build/` 目录下的文件会被 `build.sh` 复制到 `app/app/src/main/assets/web/`，供 Android WebView 加载。
