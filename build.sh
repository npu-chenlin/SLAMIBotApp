#!/bin/bash

# SLAMIBotApp 统一构建脚本
# 完整流水线：安装依赖 -> 编译 Web -> 复制到 App -> 编译 APK -> 上传
#
# 用法:
#   ./build.sh [major|minor|patch]
#   默认递增 patch 版本号
#
# 环境变量:
#   UPLOAD_SERVER_URL   - 上传服务器地址 (可选，不设置则跳过上传)
#   UPLOAD_AUTH_TOKEN   - 上传授权 Token (可选)

set -e

# 解析版本递增参数
BUMP_TYPE="${1:-patch}"
if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
    echo "Usage: $0 [major|minor|patch]"
    echo "  major: x.0.0"
    echo "  minor: x.y.0"
    echo "  patch: x.y.z+1 (default)"
    exit 1
fi

# 读取当前版本号
CURRENT_VERSION=$(grep "VERSION_NAME" version.properties | cut -d'=' -f2)
CURRENT_VERSION_CODE=$(grep "VERSION_CODE" version.properties | cut -d'=' -f2)

# 解析 major.minor.patch
MAJOR=$(echo "$CURRENT_VERSION" | cut -d'.' -f1)
MINOR=$(echo "$CURRENT_VERSION" | cut -d'.' -f2)
PATCH=$(echo "$CURRENT_VERSION" | cut -d'.' -f3)

# 递增版本号
case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))

echo "========================================"
echo "Version bump: $CURRENT_VERSION -> $NEW_VERSION ($BUMP_TYPE)"
echo "Version code: $CURRENT_VERSION_CODE -> $NEW_VERSION_CODE"
echo "========================================"

# 更新 version.properties
cat > version.properties <<EOF
VERSION_NAME=$NEW_VERSION
VERSION_CODE=$NEW_VERSION_CODE
EOF

# 更新 web/package.json
# macOS 和 Linux 都兼容的 sed 方式
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" web/package.json
else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" web/package.json
fi

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

echo ""
echo "========================================"
echo "Building SLAMIBotApp v$NEW_VERSION"
echo "========================================"

# 设置路径变量
REACT_PROJECT_PATH="web"
ANDROID_PROJECT_PATH="app"
ANDROID_ASSETS_PATH="app/app/src/main/assets/web"

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
VITE_CURRENT_VERSION="$NEW_VERSION" npm run build:release
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
APK_RENAMED="$APK_DIR/slamibot_v${NEW_VERSION}.apk"

if [ -f "$APK_ORIGINAL" ]; then
    mv "$APK_ORIGINAL" "$APK_RENAMED"
    echo "  -> $APK_RENAMED"
fi

# 上传到服务器
echo ""
if [ -n "$UPLOAD_SERVER_URL" ] && [ -n "$UPLOAD_AUTH_TOKEN" ]; then
    echo "Uploading APK to server..."

    # 生成 changelog
    DESC_FILE=$(mktemp)
    echo "SLAMIBot Android App v$NEW_VERSION" > "$DESC_FILE"
    echo "" >> "$DESC_FILE"
    echo "最近更新：" >> "$DESC_FILE"
    git log --oneline -n 5 | sed 's/^/- /' >> "$DESC_FILE"

    HTTP_CODE=$(curl -s -X POST "$UPLOAD_SERVER_URL" \
        -H "Authorization: Bearer $UPLOAD_AUTH_TOKEN" \
        -F "category=app" \
        -F "description=<$DESC_FILE" \
        -F "release_date=$(date +%Y-%m-%d)" \
        -F "file=@$APK_RENAMED" \
        -o /dev/null -w "%{http_code}")

    rm -f "$DESC_FILE"

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo "  -> Upload successful (HTTP $HTTP_CODE)"
    else
        echo "  -> Upload failed (HTTP $HTTP_CODE)"
        exit 1
    fi
else
    echo "Skipping upload (UPLOAD_SERVER_URL or UPLOAD_AUTH_TOKEN not set)"
fi

echo ""
echo "========================================"
echo "Build completed successfully!"
echo "========================================"
echo ""
echo "APK output:"
echo "  $APK_RENAMED"
echo ""
