#!/bin/bash

# SLAMIBotApp 发版脚本
# 用法: ./release.sh [-y] [major|minor|patch]
# 默认递增 patch

set -e

# 解析参数
SKIP_CONFIRM=false
BUMP_TYPE="patch"

for arg in "$@"; do
    case "$arg" in
        -y|--yes)
            SKIP_CONFIRM=true
            ;;
        major|minor|patch)
            BUMP_TYPE="$arg"
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Usage: ./release.sh [-y] [major|minor|patch]"
            exit 1
            ;;
    esac
done

# 校验参数
if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
    echo "Usage: ./release.sh [-y] [major|minor|patch]"
    echo "  major: x.0.0"
    echo "  minor: x.y.0"
    echo "  patch: x.y.z+1 (default)"
    echo "  -y: skip confirmation"
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

echo "========================================"
echo "Current: $CURRENT_VERSION (code: $CURRENT_VERSION_CODE)"
echo "New:     $NEW_VERSION (code: $NEW_VERSION_CODE)"
echo "Tag:     $NEW_TAG"
echo "========================================"
echo ""

# 打印上一个 tag 以来的 commit
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$PREV_TAG" ]; then
    echo "Commits since $PREV_TAG:"
    git log "$PREV_TAG"..HEAD --oneline --no-decorate || true
else
    echo "Commits (no previous tag):"
    git log --oneline --no-decorate -n 10 || true
fi

echo ""

# 让用户输入 description
if [ "$SKIP_CONFIRM" != "true" ]; then
    echo "Enter release description (end with Ctrl+D or an empty line):"
    DESCRIPTION=""
    while IFS= read -r line; do
        [ -z "$line" ] && break
        DESCRIPTION="${DESCRIPTION}${line}"$'\n'
    done
    # 去掉最后的换行
    DESCRIPTION=$(echo "$DESCRIPTION" | sed -e :a -e '/./,$!d;/\n*$/{$d;N;};/\n$/ba')
else
    DESCRIPTION="Release $NEW_TAG"
fi

# 组装 tag message
if [ -n "$DESCRIPTION" ]; then
    TAG_MSG="$DESCRIPTION"
else
    TAG_MSG="Release $NEW_TAG"
fi

echo ""
echo "Tag message:"
echo "----------------------------------------"
echo "$TAG_MSG"
echo "----------------------------------------"
echo ""

# 确认（除非加了 -y）
if [ "$SKIP_CONFIRM" != "true" ]; then
    read -p "Proceed? (y/n) " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
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
git commit -m "release: $NEW_TAG"
git push origin HEAD

# 打 annotated tag 并推送
git tag -a "$NEW_TAG" -m "$TAG_MSG"
git push origin "$NEW_TAG"

echo ""
echo "========================================"
echo "Released $NEW_TAG"
echo "========================================"
echo "GitHub Action: https://github.com/npu-chenlin/SLAMIBotApp/actions"
