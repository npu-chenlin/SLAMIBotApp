#!/bin/bash

# SLAMIBotApp 统一构建脚本（Tag-Driven）
# 版本号的唯一真相来源是 GitHub 上的最新 tag
#
# 用法:
#   ./build.sh [major|minor|patch]
#   默认递增 patch 版本号
#
# 流程:
#   1. 从远程获取最新 tag 作为基准版本
#   2. 按参数递增版本号
#   3. 更新 version.properties 和 web/package.json
#   4. 构建 APK
#   5. git commit + tag + push（触发 GitHub Action）

set -e

# -----------------------------------------------------------
# 参数解析
# -----------------------------------------------------------
BUMP_TYPE="${1:-patch}"
if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
    echo "Usage: $0 [major|minor|patch]"
    echo "  major: x.0.0"
    echo "  minor: x.y.0"
    echo "  patch: x.y.z+1 (default)"
    exit 1
fi

# -----------------------------------------------------------
# 1. 从远程获取最新 tag 作为基准版本
# -----------------------------------------------------------
echo "Fetching latest tag from remote..."
LATEST_TAG=$(git ls-remote --tags origin 2>/dev/null \
    | grep "refs/tags/v" \
    | awk -F/ '{print $NF}' \
    | sed 's/\^{}//' \
    | sort -V \
    | tail -1)

if [ -z "$LATEST_TAG" ]; then
    echo "Error: No version tag found on remote. Please create the first tag manually."
    echo "  git tag v1.0.0"
    echo "  git push origin v1.0.0"
    exit 1
fi

# 去掉 v 前缀
CURRENT_VERSION="${LATEST_TAG#v}"
echo "  Latest remote tag: $LATEST_TAG (version $CURRENT_VERSION)"

# -----------------------------------------------------------
# 2. 解析并递增版本号
# -----------------------------------------------------------
MAJOR=$(echo "$CURRENT_VERSION" | cut -d'.' -f1)
MINOR=$(echo "$CURRENT_VERSION" | cut -d'.' -f2)
PATCH=$(echo "$CURRENT_VERSION" | cut -d'.' -f3)

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
NEW_TAG="v${NEW_VERSION}"

echo ""
echo "========================================"
echo "Version bump: $CURRENT_VERSION -> $NEW_VERSION ($BUMP_TYPE)"
echo "New tag: $NEW_TAG"
echo "========================================"

# -----------------------------------------------------------
# 3. 同步更新本地版本文件
# -----------------------------------------------------------
# 读取当前 VERSION_CODE
CURRENT_VERSION_CODE=$(grep "VERSION_CODE" version.properties | cut -d'=' -f2)
NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))

cat > version.properties <<EOF
VERSION_NAME=$NEW_VERSION
VERSION_CODE=$NEW_VERSION_CODE
EOF

# 更新 web/package.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" web/package.json
else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" web/package.json
fi

# -----------------------------------------------------------
# 4. 构建 APK
# -----------------------------------------------------------
echo ""
echo "========================================"
echo "Building SLAMIBotApp $NEW_TAG"
echo "========================================"

# 自动设置 Android Studio 内置 JDK
if [ -z "$JAVA_HOME" ]; then
    if [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
        export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
        echo "Auto-detected JAVA_HOME: $JAVA_HOME"
    else
        echo "Error: JAVA_HOME not set and Android Studio JDK not found."
        exit 1
    fi
fi

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

# -----------------------------------------------------------
# 5. 提交版本变更并推送
# -----------------------------------------------------------
echo ""
echo "Committing version bump and pushing to remote..."
git add version.properties web/package.json
git commit -m "release: bump version to $NEW_TAG"
git tag "$NEW_TAG"
git push origin HEAD
git push origin "$NEW_TAG"

echo "  -> Commit pushed"
echo "  -> Tag $NEW_TAG pushed"

# -----------------------------------------------------------
# 完成
# -----------------------------------------------------------
echo ""
echo "========================================"
echo "Build completed successfully!"
echo "========================================"
echo ""
echo "APK output:"
echo "  $APK_RENAMED"
echo ""
echo "GitHub Action will be triggered by tag $NEW_TAG"
echo ""
