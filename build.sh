#!/bin/bash

# SLAMIBotApp 统一构建脚本
# 构建 Web 前端并打包到 Android App 的 assets 中

set -e

# 设置路径变量
REACT_PROJECT_PATH="web"
ANDROID_ASSETS_PATH="app/app/src/main/assets/web"

# 读取统一版本号
VERSION_NAME=$(grep "VERSION_NAME" version.properties | cut -d'=' -f2)

echo "========================================"
echo "Building SLAMIBotApp v$VERSION_NAME"
echo "========================================"

# 构建 React 项目
echo "[1/3] Building React project..."
cd "$REACT_PROJECT_PATH"
REACT_APP_CURRENT_VERSION="$VERSION_NAME" npm run build:release
cd -

# 确保 Android assets 目录存在
echo "[2/3] Preparing Android assets directory..."
mkdir -p "$ANDROID_ASSETS_PATH"

# 清理旧的构建文件
echo "[3/3] Copying build files to Android assets..."
rm -rf "$ANDROID_ASSETS_PATH"/*
cp -r "$REACT_PROJECT_PATH"/build/* "$ANDROID_ASSETS_PATH"/

echo ""
echo "Build completed successfully!"
echo "Next step: cd app && ./gradlew assembleRelease"
