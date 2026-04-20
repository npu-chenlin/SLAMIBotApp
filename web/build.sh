 #!/bin/bash

# 设置路径变量
REACT_PROJECT_PATH="."  # React项目路径
ANDROID_ASSETS_PATH="../app/app/src/main/assets/web"  # Android assets目标路径

# 构建React项目
echo "Building React project..."
cd $REACT_PROJECT_PATH
npm run build:release

# 确保Android assets目录存在
mkdir -p $ANDROID_ASSETS_PATH

# 清理旧的构建文件
echo "Cleaning old build files..."
rm -rf $ANDROID_ASSETS_PATH/*

# 复制新的构建文件
echo "Copying build files to Android assets..."
cp -r build/* $ANDROID_ASSETS_PATH/

echo "Build process completed!"