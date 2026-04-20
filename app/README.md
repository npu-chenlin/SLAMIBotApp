# Android App

SLAMIBotApp 的 Android 客户端模块。

## 职责

- 通过 WebView 加载本地 `assets/web/` 下的前端资源
- 通过 `JavascriptInterface` 暴露原生能力（固件下载、文件上传、存储权限等）
- 提供 Android 原生容器与系统交互

## 构建

```bash
./gradlew assembleDebug    # 调试包
./gradlew assembleRelease  # 签名发布包
```

## 目录说明

- `app/src/main/assets/web/`：Web 前端构建产物（由 `build.sh` 自动生成，勿手动修改）
- `app/src/main/java/com/example/metacam/MainActivity.kt`：主 Activity，WebView 与 JSBridge 实现
