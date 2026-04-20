@echo off
setlocal

REM 设置路径变量
set REACT_PROJECT_PATH=.
set ANDROID_ASSETS_PATH=..\MetaCam-App\app\src\main\assets\web

REM 构建React项目
echo Building React project...
cd %REACT_PROJECT_PATH%
call npm run build:release

REM 确保Android assets目录存在
if not exist %ANDROID_ASSETS_PATH% (
    echo Creating Android assets directory...
    mkdir %ANDROID_ASSETS_PATH%
)

REM 清理旧的构建文件
echo Cleaning old build files...
if exist %ANDROID_ASSETS_PATH%\* (
    del /s /q %ANDROID_ASSETS_PATH%\*
)

REM 复制新的构建文件
echo Copying build files to Android assets...
xcopy build\* %ANDROID_ASSETS_PATH%\ /s /e /y

echo Build process completed!