# SLAMIBotApp

SLAMIBot 配套移动端应用，包含 Web 前端控制面板和 Android App。

## 项目结构

```
SLAMIBotApp/
├── web/          # React 前端（Web 控制面板）
├── app/          # Android App（WebView 壳子 + 原生能力）
├── build.sh      # 统一构建脚本
└── version.properties  # 统一版本管理
```

## 技术栈

- **Web**：React + TypeScript + ROSLib + Three.js
- **App**：Android + Kotlin + Jetpack Compose + WebView

## 快速开始

### 构建 Web

```bash
cd web
npm install
npm run build:release
```

### 构建 App

```bash
# 一键构建（Web + 复制到 App assets）
./build.sh

# 编译 APK
cd app
./gradlew assembleRelease
```

## 版本管理

版本号统一在 `version.properties` 中维护：

```properties
VERSION_NAME=1.5.0
VERSION_CODE=2
```

- `web/package.json` 和 `app/app/build.gradle.kts` 会自动读取该文件
