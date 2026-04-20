#!/bin/bash

# SLAMIBotApp 发版脚本
# 用法: ./release.sh [major|minor|patch]
# 默认递增 patch

set -e

BUMP_TYPE="${1:-patch}"

# 校验参数
if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
    echo "Usage: ./release.sh [major|minor|patch]"
    echo "  major: x.0.0"
    echo "  minor: x.y.0"
    echo "  patch: x.y.z+1 (default)"
    exit 1
fi

# 读取当前版本
CURRENT_VERSION=$(grep "VERSION_NAME" version.properties | cut -d'=' -f2)
CURRENT_VERSION_CODE=$(grep "VERSION_CODE" version.properties | cut -d'=' -f2)

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
NEW_TAG="v${NEW_VERSION}"

echo "Current: $CURRENT_VERSION (code: $CURRENT_VERSION_CODE)"
echo "New:     $NEW_VERSION (code: $NEW_VERSION_CODE)"
echo "Tag:     $NEW_TAG"
echo ""

# 确认
read -p "Are you sure? (y/n) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

# 更新 version.properties
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

# 提交并推送
git add version.properties web/package.json
git commit -m "release: bump version to $NEW_TAG"
git push origin HEAD

# 打 tag 并推送
git tag "$NEW_TAG"
git push origin "$NEW_TAG"

echo ""
echo "========================================"
echo "Released $NEW_TAG"
echo "========================================"
echo "GitHub Action: https://github.com/npu-chenlin/SLAMIBotApp/actions"
