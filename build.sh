#!/bin/bash

# SLAMIBotApp 统一构建脚本
# 完整流水线：安装依赖 -> 编译 Web -> 复制到 App -> 编译 APK

set -e

# 设置路径变量
REACT_PROJECT_PATH="web"
ANDROID_PROJECT_PATH="app"
ANDROID_ASSETS_PATH="app/app/src/main/assets/web"

# 读取统一版本号
VERSION_NAME=$(grep "VERSION_NAME" version.properties | cut -d'=' -f2)

# 自动设置 Android Studio 内置 JDK（如果没有设置 JAVA_HOME）
if [ -z "$JAVA_HOME" ]; then
    if [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
        export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
        echo "Auto-detected JAVA_HOME: $JAVA_HOME"
    else
        echo "Error: JAVA_HOME not set and Android Studio JDK not found."
        exit 1
    fi
fi

echo "========================================"
echo "Building SLAMIBotApp v$VERSION_NAME"
echo "========================================"

# [1/4] 安装 Web 依赖
echo "[1/4] Installing Web dependencies..."
cd "$REACT_PROJECT_PATH"
if [ ! -d "node_modules" ]; then
    echo "  -> node_modules not found, running npm install..."
    npm install
else
    echo "  -> node_modules exists, skipping npm install."
    echo "  -> (Run 'npm install' manually if you need to update dependencies)"
fi

# [2/4] 编译 React 项目
echo "[2/4] Building React project..."
REACT_APP_CURRENT_VERSION="$VERSION_NAME" npm run build:release
cd -

# [3/4] 复制构建产物到 Android assets
echo "[3/4] Copying build files to Android assets..."
mkdir -p "$ANDROID_ASSETS_PATH"
rm -rf "$ANDROID_ASSETS_PATH"/*
cp -r "$REACT_PROJECT_PATH"/build/* "$ANDROID_ASSETS_PATH"/

# [4/4] 编译 Android Release APK
echo "[4/4] Building Android Release APK..."
cd "$ANDROID_PROJECT_PATH"
./gradlew app:assembleRelease
cd -

# 重命名 APK
echo ""
echo "Renaming APK..."
APK_DIR="$ANDROID_PROJECT_PATH/app/build/outputs/apk/release"
APK_ORIGINAL="$APK_DIR/app-release.apk"
APK_RENAMED="$APK_DIR/slamibot_v${VERSION_NAME}.apk"

if [ -f "$APK_ORIGINAL" ]; then
    mv "$APK_ORIGINAL" "$APK_RENAMED"
    echo "  -> $APK_RENAMED"
fi

echo ""
echo "========================================"
echo "Build completed successfully!"
echo "========================================"
echo ""
echo "APK output:"
echo "  $APK_RENAMED"
echo ""
